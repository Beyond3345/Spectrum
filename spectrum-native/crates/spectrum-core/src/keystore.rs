//! API keys, kept by the system rather than in settings (2.8's `keyStore.js`, same store, same format): on a
//! Mac in the login keychain, on Windows DPAPI-sealed for the user's account in `DATA_DIR/keys.dpapi`.
//! Settings keep a reference for each key, `spectrum-key:<32 hex>`, named after the key with a salt kept beside
//! the keys, so the same key typed into two fields is one entry, and settings synced from 2.8 stay valid.

mod system;

use std::collections::BTreeMap;
use std::collections::HashSet;

use base64::Engine;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use hmac::{Hmac, KeyInit, Mac};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;

pub use system::SystemSecretStore;

use crate::{CoreError, random};

pub const KEYCHAIN_SERVICE: &str = "com.beyond3345.spectrum.api-keys";
pub const KEYCHAIN_ACCOUNT: &str = "api-keys";
const PREFIX: &str = "spectrum-key:";
/// An entry no reference names goes after this long (another window may be about to refer to it).
const UNUSED_FOR_MS: i64 = 60 * 60 * 1000;

/// Where the keys' one text lives: the system's store, or a test's stand-in.
pub trait SecretStore: Send + Sync {
    /// The stored text, or `None` when nothing is stored yet.
    fn read(&self) -> Result<Option<String>, CoreError>;
    fn write(&self, text: &str) -> Result<(), CoreError>;
}

/// `{ salt, keys: { id: { value, at } }, held? }`, base64 JSON in the store.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct KeyFile {
    salt: String,
    keys: BTreeMap<String, KeyEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    held: Option<BTreeMap<String, Value>>,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct KeyEntry {
    value: String,
    /// When it was stored, in ms since 1970.
    #[serde(default)]
    at: i64,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

/// Node's `Buffer.from(text, 'base64')` takes base64 with or without its padding.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn store_error(message: &str) -> CoreError {
    CoreError::Keystore(message.to_owned())
}

/// The reference for `value` under `salt`: `spectrum-key:` and the first 32 hex digits of
/// HMAC-SHA256(key = salt as UTF-8, message = value), exactly as 2.8's `idOf` computes it.
pub fn key_ref(salt: &str, value: &str) -> String {
    format!("{PREFIX}{}", key_id(salt, value))
}

fn key_id(salt: &str, value: &str) -> String {
    // HMAC takes a key of any length, so this never falls back
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(salt.as_bytes()) else {
        return String::new();
    };
    mac.update(value.as_bytes());
    let mut hex = random::hex(&mac.finalize().into_bytes());
    hex.truncate(32);
    hex
}

/// The id in a reference, when `text` is one.
pub fn ref_id(text: &str) -> Option<&str> {
    let id = text.strip_prefix(PREFIX)?;
    (id.len() == 32 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))).then_some(id)
}

fn valid_key(value: &str) -> bool {
    // JavaScript's length counts UTF-16 units
    let len = value.encode_utf16().count();
    len > 0 && len <= 8192 && !value.contains(['\r', '\n', '\0'])
}

/// The keys, read once from the store and kept; changes go one at a time.
pub struct KeyStore<S: SecretStore> {
    store: S,
    cache: Mutex<Option<KeyFile>>,
}

impl<S: SecretStore> KeyStore<S> {
    pub fn new(store: S) -> Self {
        Self {
            store,
            cache: Mutex::new(None),
        }
    }

    fn load<'a>(&self, cache: &'a mut Option<KeyFile>) -> Result<&'a mut KeyFile, CoreError> {
        if cache.is_none() {
            let unreadable = || store_error("Spectrum’s keys in the keychain can’t be read.");
            let parsed: Option<Value> = match self.store.read()? {
                Some(text) if !text.is_empty() => {
                    let bytes = BASE64.decode(text.trim()).map_err(|_| unreadable())?;
                    Some(serde_json::from_slice(&bytes).map_err(|_| unreadable())?)
                }
                _ => None,
            };
            // as 2.8: anything without a salt and a keys object starts afresh
            let file = match parsed {
                Some(v)
                    if v.get("salt").is_some_and(Value::is_string)
                        && v.get("keys").is_some_and(Value::is_object) =>
                {
                    serde_json::from_value(v).map_err(|_| unreadable())?
                }
                _ => KeyFile {
                    salt: random::hex(&random::bytes::<16>()?),
                    keys: BTreeMap::new(),
                    held: None,
                    extra: BTreeMap::new(),
                },
            };
            *cache = Some(file);
        }
        cache
            .as_mut()
            .ok_or_else(|| store_error("Spectrum’s keys couldn’t be loaded."))
    }

    fn save(&self, cache: &mut Option<KeyFile>, next: KeyFile) -> Result<(), CoreError> {
        let json = serde_json::to_vec(&next)
            .map_err(|_| store_error("Spectrum couldn’t save its keys."))?;
        let text = BASE64.encode(json);
        self.store.write(&text)?;
        // read back: the keychain has been seen to report success without storing
        if self.store.read()?.as_deref() != Some(text.as_str()) {
            return Err(store_error(
                "Spectrum couldn’t save keys in the keychain: what it saved didn’t read back.",
            ));
        }
        *cache = Some(next);
        Ok(())
    }

    /// Keeps `values` and returns their references, in the same order. `keep`: the references settings still
    /// hold; entries no reference names and older than an hour are dropped, so a replaced key goes.
    pub fn store_keys(
        &self,
        values: &[String],
        keep: &[String],
        now_ms: i64,
    ) -> Result<Vec<String>, CoreError> {
        if values.len() > 200 || !values.iter().all(|v| valid_key(v)) {
            return Err(CoreError::InvalidKey);
        }
        let kept: HashSet<&str> = keep.iter().filter_map(|r| ref_id(r)).collect();
        let mut cache = self.cache.lock();
        let current = self.load(&mut cache)?.clone();
        let ids: Vec<String> = values.iter().map(|v| key_id(&current.salt, v)).collect();
        let mut keys = BTreeMap::new();
        for (id, value) in ids.iter().zip(values) {
            let entry = current.keys.get(id).cloned().unwrap_or_else(|| KeyEntry {
                value: value.clone(),
                at: now_ms,
                extra: BTreeMap::new(),
            });
            keys.insert(id.clone(), entry);
        }
        for (id, entry) in &current.keys {
            if !keys.contains_key(id)
                && (kept.contains(id.as_str()) || now_ms - entry.at < UNUSED_FOR_MS)
            {
                keys.insert(id.clone(), entry.clone());
            }
        }
        let next = KeyFile {
            keys,
            ..current.clone()
        };
        if next != current {
            self.save(&mut cache, next)?;
        }
        Ok(ids.into_iter().map(|id| format!("{PREFIX}{id}")).collect())
    }

    /// `value` with every reference in it (at any depth) swapped for its key. A reference to no key is an error.
    pub fn with_keys(&self, value: Value) -> Result<Value, CoreError> {
        fn any_ref(v: &Value) -> bool {
            match v {
                Value::String(s) => ref_id(s).is_some(),
                Value::Array(items) => items.iter().any(any_ref),
                Value::Object(map) => map.values().any(any_ref),
                _ => false,
            }
        }
        fn swap(v: Value, keys: &BTreeMap<String, KeyEntry>) -> Result<Value, CoreError> {
            Ok(match v {
                Value::String(s) => match ref_id(&s) {
                    Some(id) => Value::String(
                        keys.get(id)
                            .ok_or_else(|| store_error("A key saved in the keychain is missing. Type it again in Settings."))?
                            .value
                            .clone(),
                    ),
                    None => Value::String(s),
                },
                Value::Array(items) => Value::Array(items.into_iter().map(|x| swap(x, keys)).collect::<Result<_, _>>()?),
                Value::Object(map) => Value::Object(
                    map.into_iter().map(|(k, x)| Ok((k, swap(x, keys)?))).collect::<Result<_, CoreError>>()?,
                ),
                other => other,
            })
        }
        if !any_ref(&value) {
            return Ok(value);
        }
        let mut cache = self.cache.lock();
        let file = self.load(&mut cache)?;
        swap(value, &file.keys)
    }

    /// Values Spectrum holds under a name of its own (an MCP server's environment variables): never given a
    /// reference, and never dropped as unused.
    pub fn held_values(&self, name: &str) -> Result<BTreeMap<String, String>, CoreError> {
        let mut cache = self.cache.lock();
        let file = self.load(&mut cache)?;
        let values = file
            .held
            .as_ref()
            .and_then(|h| h.get(name))
            .and_then(Value::as_object);
        Ok(values
            .into_iter()
            .flatten()
            .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_owned())))
            .collect())
    }

    /// Holds `values` under `name`; an empty map forgets them.
    pub fn hold_values(
        &self,
        name: &str,
        values: &BTreeMap<String, String>,
    ) -> Result<(), CoreError> {
        let mut cache = self.cache.lock();
        let current = self.load(&mut cache)?.clone();
        let mut held = current.held.clone().unwrap_or_default();
        if values.is_empty() {
            held.remove(name);
        } else {
            let map = values
                .iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect();
            held.insert(name.to_owned(), Value::Object(map));
        }
        if held != current.held.clone().unwrap_or_default() {
            let next = KeyFile {
                held: Some(held),
                ..current
            };
            self.save(&mut cache, next)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The one allowed stand-in: tests never touch the real keychain.
    #[derive(Default)]
    struct FakeStore(Mutex<Option<String>>);

    impl SecretStore for FakeStore {
        fn read(&self) -> Result<Option<String>, CoreError> {
            Ok(self.0.lock().clone())
        }
        fn write(&self, text: &str) -> Result<(), CoreError> {
            *self.0.lock() = Some(text.to_owned());
            Ok(())
        }
    }

    const SALT: &str = "00112233445566778899aabbccddeeff";

    #[test]
    fn refs_match_2_8() {
        // node -e "crypto.createHmac('sha256', salt).update(value).digest('hex').slice(0, 32)"
        assert_eq!(
            key_ref(SALT, "sk-test-123"),
            "spectrum-key:9f9a41a78484cb92dc48d11e93233e7d"
        );
        assert_eq!(
            key_ref(SALT, "κλειδί-ключ"),
            "spectrum-key:e5a76e8d32dbeed705d2bbb410c5eb50"
        );
        assert_eq!(
            ref_id("spectrum-key:9f9a41a78484cb92dc48d11e93233e7d"),
            Some("9f9a41a78484cb92dc48d11e93233e7d")
        );
        assert_eq!(
            ref_id("spectrum-key:9F9A41A78484CB92DC48D11E93233E7D"),
            None
        );
    }

    #[test]
    fn reads_a_2_8_store() {
        // Buffer.from(JSON.stringify({ salt, keys: { a: { value: 'x', at: 1 } } })).toString('base64')
        let stored = "eyJzYWx0IjoiMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZGVlZmYiLCJrZXlzIjp7ImEiOnsidmFsdWUiOiJ4IiwiYXQiOjF9fX0=";
        let fake = FakeStore::default();
        fake.write(stored).unwrap();
        let store = KeyStore::new(fake);
        let refs = store.store_keys(&["sk-test-123".into()], &[], 2).unwrap();
        assert_eq!(refs, ["spectrum-key:9f9a41a78484cb92dc48d11e93233e7d"]);
        // the old entry is under an hour old, so it stays
        let swapped = store
            .with_keys(json!({ "k": refs[0], "deep": [{ "x": refs[0] }], "n": 1 }))
            .unwrap();
        assert_eq!(
            swapped,
            json!({ "k": "sk-test-123", "deep": [{ "x": "sk-test-123" }], "n": 1 })
        );
        let text = store.store.read().unwrap().unwrap();
        let back: Value = serde_json::from_slice(&BASE64.decode(text).unwrap()).unwrap();
        assert_eq!(back["salt"], SALT);
        assert_eq!(back["keys"]["a"], json!({ "value": "x", "at": 1 }));
    }

    #[test]
    fn unused_entries_go_after_an_hour_unless_kept() {
        let store = KeyStore::new(FakeStore::default());
        let old = store
            .store_keys(&["one".into(), "two".into()], &[], 0)
            .unwrap();
        let later = UNUSED_FOR_MS + 1;
        store
            .store_keys(&["three".into()], &[old[0].clone()], later)
            .unwrap();
        assert!(store.with_keys(json!(old[0])).is_ok());
        assert!(matches!(
            store.with_keys(json!(old[1])),
            Err(CoreError::Keystore(_))
        ));
    }

    #[test]
    fn same_key_same_ref_and_bad_keys_refused() {
        let store = KeyStore::new(FakeStore::default());
        let refs = store.store_keys(&["k".into(), "k".into()], &[], 0).unwrap();
        assert_eq!(refs[0], refs[1]);
        assert!(matches!(
            store.store_keys(&["a\nb".into()], &[], 0),
            Err(CoreError::InvalidKey)
        ));
        assert!(matches!(
            store.store_keys(&[String::new()], &[], 0),
            Err(CoreError::InvalidKey)
        ));
        assert_eq!(store.with_keys(json!("plain")).unwrap(), json!("plain"));
    }

    #[test]
    fn held_values_round_trip() {
        let store = KeyStore::new(FakeStore::default());
        let values = BTreeMap::from([("TOKEN".to_owned(), "t".to_owned())]);
        store.hold_values("server", &values).unwrap();
        assert_eq!(store.held_values("server").unwrap(), values);
        store.hold_values("server", &BTreeMap::new()).unwrap();
        assert!(store.held_values("server").unwrap().is_empty());
    }

    #[test]
    fn a_store_that_does_not_keep_the_write_is_an_error() {
        struct Forgetful;
        impl SecretStore for Forgetful {
            fn read(&self) -> Result<Option<String>, CoreError> {
                Ok(None)
            }
            fn write(&self, _: &str) -> Result<(), CoreError> {
                Ok(())
            }
        }
        let store = KeyStore::new(Forgetful);
        assert!(matches!(
            store.store_keys(&["k".into()], &[], 0),
            Err(CoreError::Keystore(_))
        ));
    }

    #[test]
    fn garbage_in_the_store_is_an_error_not_a_fresh_start() {
        let fake = FakeStore::default();
        fake.write("not base64 at all!").unwrap();
        let store = KeyStore::new(fake);
        assert!(matches!(
            store.store_keys(&["k".into()], &[], 0),
            Err(CoreError::Keystore(_))
        ));
        assert_eq!(
            store.store.read().unwrap().as_deref(),
            Some("not base64 at all!")
        );
    }
}
