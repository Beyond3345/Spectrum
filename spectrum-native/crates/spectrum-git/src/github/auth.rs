//! The GitHub sign-in. 2.8 kept `{ token, user: { login, id, name }, settingsRepo }` in `DATA_DIR/github.json`
//! (0600). 3.0 keeps the same file for the account and the settings-repository switch, and the token in the
//! system keystore (Keychain / DPAPI, spectrum-core's), held under the name `github`. A 2.8 token found in
//! github.json moves into the keystore the first time it's read, and leaves the file.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde_json::{Map, Value, json};
use spectrum_core::AppPaths;
use spectrum_core::keystore::{KeyStore, SecretStore};

use super::{GitHub, client_id};
use crate::error::{GitError, Result};
use crate::repo::Author;
use crate::util::temp_beside;

const HELD: &str = "github";
const TOKEN: &str = "token";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub login: String,
    pub id: u64,
    pub name: String,
}

/// What the window may know: never the token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthStatus {
    pub signed_in: bool,
    pub login: String,
    pub name: String,
    /// One-click (device) sign-in is on: this build has a client id.
    pub device_sign_in: bool,
    /// The settings repository is wanted (on unless turned off).
    pub settings_repo: bool,
}

pub struct GitHubAuth<'a, S: SecretStore> {
    file: PathBuf,
    keys: &'a KeyStore<S>,
}

impl<'a, S: SecretStore> GitHubAuth<'a, S> {
    pub fn new(paths: &AppPaths, keys: &'a KeyStore<S>) -> Self {
        Self {
            file: paths.data_dir.join("github.json"),
            keys,
        }
    }

    fn read(&self) -> Map<String, Value> {
        fs::read(&self.file)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .and_then(|v: Value| v.as_object().cloned())
            .unwrap_or_default()
    }

    /// github.json written whole, readable by this user only from the moment it exists.
    fn write(&self, data: &Map<String, Value>) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            fs::create_dir_all(dir).map_err(|e| GitError::io("create", dir, e))?;
        }
        let tmp = temp_beside(&self.file);
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
        let text = serde_json::to_vec_pretty(&Value::Object(data.clone())).unwrap_or_default();
        let done = opts
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, &text))
            .and_then(|()| fs::rename(&tmp, &self.file));
        if let Err(e) = done {
            let _ = fs::remove_file(&tmp);
            return Err(GitError::io("write", &self.file, e));
        }
        Ok(())
    }

    /// The token, or why there's none.
    pub fn token(&self) -> Result<String> {
        let mut data = self.read();
        if let Some(Value::String(legacy)) = data.remove(TOKEN) {
            // 2.8's plain-text token: into the keystore, then out of the file
            self.keys
                .hold_values(HELD, &BTreeMap::from([(TOKEN.to_owned(), legacy.clone())]))?;
            self.write(&data)?;
            return Ok(legacy);
        }
        self.keys
            .held_values(HELD)?
            .remove(TOKEN)
            .filter(|t| !t.is_empty())
            .ok_or(GitError::SignedOut)
    }

    pub fn account(&self) -> Option<Account> {
        let u = self.read().get("user")?.clone();
        Some(Account {
            login: u["login"].as_str()?.into(),
            id: u["id"].as_u64().unwrap_or(0),
            name: u["name"].as_str().unwrap_or_default().into(),
        })
    }

    pub fn status(&self) -> AuthStatus {
        let account = self.account();
        AuthStatus {
            signed_in: self.token().is_ok(),
            login: account
                .as_ref()
                .map(|a| a.login.clone())
                .unwrap_or_default(),
            name: account.map(|a| a.name).unwrap_or_default(),
            device_sign_in: client_id().is_some(),
            settings_repo: self.read().get("settingsRepo") != Some(&Value::Bool(false)),
        }
    }

    /// The commit author GitHub links to the account without showing its email; signed out, the computer.
    pub fn author(&self, machine_name: &str) -> Author {
        match self.account() {
            Some(a) => Author {
                name: if a.name.is_empty() {
                    a.login.clone()
                } else {
                    a.name.clone()
                },
                email: format!("{}+{}@users.noreply.github.com", a.id, a.login),
            },
            None => Author {
                name: machine_name.into(),
                email: "spectrum@localhost".into(),
            },
        }
    }

    /// Keeps a token GitHub accepted, and its account.
    pub fn save(&self, token: &str, account: &Account) -> Result<()> {
        self.keys.hold_values(
            HELD,
            &BTreeMap::from([(TOKEN.to_owned(), token.to_owned())]),
        )?;
        let mut data = self.read();
        data.remove(TOKEN);
        data.insert(
            "user".into(),
            json!({ "login": account.login, "id": account.id, "name": account.name }),
        );
        self.write(&data)
    }

    pub fn sign_out(&self) -> Result<()> {
        self.keys.hold_values(HELD, &BTreeMap::new())?;
        let keep = self.read().get("settingsRepo") == Some(&Value::Bool(false));
        let mut data = Map::new();
        if keep {
            data.insert("settingsRepo".into(), Value::Bool(false));
        }
        self.write(&data)
    }

    pub fn set_settings_repo(&self, on: bool) -> Result<()> {
        let mut data = self.read();
        data.insert("settingsRepo".into(), Value::Bool(on));
        self.write(&data)
    }

    /// Signs in with a pasted token (fine-grained or classic), checked with GitHub first. `api`/`web`:
    /// GitHub's addresses ([`super::GITHUB_API`], [`super::GITHUB_WEB`]) or a test server's.
    pub async fn sign_in_with_token(
        &self,
        input: &str,
        api: &str,
        web: &str,
    ) -> Result<AuthStatus> {
        let token = input.trim();
        if !(20..=255).contains(&token.len()) || !token.bytes().all(|b| (0x21..=0x7e).contains(&b))
        {
            return Err(GitError::Refused(
                "That doesn’t look like a GitHub token.".into(),
            ));
        }
        let account = GitHub::with_bases(api, web, token)?
            .user()
            .await
            .map_err(|e| match e {
                GitError::SignInAgain => {
                    GitError::Refused("GitHub didn’t accept that token.".into())
                }
                other => other,
            })?;
        self.save(token, &account)?;
        Ok(self.status())
    }
}
