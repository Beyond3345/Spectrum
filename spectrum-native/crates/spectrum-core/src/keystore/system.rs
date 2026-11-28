//! The system's store for the keys' text: the login keychain on a Mac, a DPAPI-sealed file on Windows.

use super::SecretStore;
use crate::{AppPaths, CoreError};

/// The keys' store on this system. Not exercised by tests, which must never touch the real keychain.
pub struct SystemSecretStore {
    #[cfg(windows)]
    file: std::path::PathBuf,
}

impl SystemSecretStore {
    #[cfg_attr(not(windows), allow(unused_variables))]
    pub fn new(paths: &AppPaths) -> Self {
        Self {
            #[cfg(windows)]
            file: paths.keys_file(),
        }
    }
}

#[cfg(target_os = "macos")]
impl SecretStore for SystemSecretStore {
    fn read(&self) -> Result<Option<String>, CoreError> {
        use security_framework::passwords::get_generic_password;
        // errSecItemNotFound
        const NOT_FOUND: i32 = -25_300;
        match get_generic_password(super::KEYCHAIN_SERVICE, super::KEYCHAIN_ACCOUNT) {
            Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).trim().to_owned())),
            Err(err) if err.code() == NOT_FOUND => Ok(None),
            Err(err) => Err(CoreError::Keystore(format!(
                "Spectrum couldn’t read its keys from the keychain: {err}."
            ))),
        }
    }

    fn write(&self, text: &str) -> Result<(), CoreError> {
        security_framework::passwords::set_generic_password(
            super::KEYCHAIN_SERVICE,
            super::KEYCHAIN_ACCOUNT,
            text.as_bytes(),
        )
        .map_err(|err| {
            CoreError::Keystore(format!(
                "Spectrum couldn’t save keys in the keychain: {err}."
            ))
        })
    }
}

/// `keys.dpapi` holds base64 of the DPAPI blob of the text, as 2.8's PowerShell wrote it.
#[cfg(windows)]
impl SecretStore for SystemSecretStore {
    fn read(&self) -> Result<Option<String>, CoreError> {
        use base64::Engine;
        let sealed = match std::fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(err) => return Err(CoreError::io("couldn't read", &self.file, err)),
        };
        let unreadable = |detail: String| {
            CoreError::Keystore(format!("Spectrum couldn’t read its keys: {detail}."))
        };
        let blob = super::BASE64
            .decode(sealed.trim())
            .map_err(|e| unreadable(e.to_string()))?;
        let plain = crate::win32::unprotect(&blob).map_err(|e| unreadable(e.to_string()))?;
        Ok(Some(String::from_utf8_lossy(&plain).trim().to_owned()))
    }

    fn write(&self, text: &str) -> Result<(), CoreError> {
        use base64::Engine;
        let sealed = crate::win32::protect(text.as_bytes())
            .map_err(|e| CoreError::Keystore(format!("Spectrum couldn’t save its keys: {e}.")))?;
        crate::json::write_atomic(&self.file, super::BASE64.encode(sealed).as_bytes())
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
impl SecretStore for SystemSecretStore {
    fn read(&self) -> Result<Option<String>, CoreError> {
        Err(no_store())
    }

    fn write(&self, _text: &str) -> Result<(), CoreError> {
        Err(no_store())
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
fn no_store() -> CoreError {
    CoreError::Keystore("This system has no keychain Spectrum can use.".to_owned())
}
