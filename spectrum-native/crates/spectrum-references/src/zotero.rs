//! Zotero through its local API and Better BibTeX: status, the Allow prompt, the citation picker, a library
//! search, items into the `.bib` under their Zotero keys, and (in [`sync`]) a Spectrum › <project> collection
//! kept in step with each project's `.bib` (2.8's `zoteroService.js`). The `.bib` stays the source of truth:
//! nothing here edits it from Zotero's side or deletes a Zotero item. Every call goes to 127.0.0.1.

mod items;
mod new_item;
mod sync;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use reqwest::Method;
use serde_json::{Value, json};

pub use items::{LibraryItem, ZoteroRef, clean_entry, item_identity, same_ref};
pub use new_item::item_from_entry;
pub use sync::{SyncCounts, SyncOptions, SyncOutcome};

use crate::error::RefError;
use crate::http::{Http, Reply, USER_AGENT};

/// My Library, as the local API names it on every computer.
pub(crate) const LIBRARY: &str = "users/0";
pub(crate) const LIB: &str = "/api/users/0";
const TIMEOUT: Duration = Duration::from_secs(10);
// Zotero's Allow prompt and the citation picker wait for the user, though not for ever
const PROMPT: Duration = Duration::from_mins(10);

pub(crate) const NOT_OPEN: &str = "Zotero isn’t open. Start Zotero, then try again.";
pub(crate) const API_OFF: &str = "Zotero’s local API is off. In Zotero’s Settings › Advanced, tick “Allow other applications on this computer to communicate with Zotero”.";
pub(crate) const KEY_REFUSED: &str = "Zotero no longer accepts Spectrum’s permission. Allow Spectrum again in Settings › Zotero, and choose Always Allow.";

pub(crate) fn needs_ten(version: &str) -> String {
    let which = if version.is_empty() {
        "This version of Zotero".to_owned()
    } else {
        format!("Zotero {version}")
    };
    format!(
        "{which} lets Spectrum read your library. Keeping a collection for each project needs Zotero 10."
    )
}

/// The key Zotero gave and the database (Zotero-Server-ID) it is for; on this computer only.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Auth {
    pub key: String,
    pub server_id: String,
}

/// What a probe finds.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct Probe {
    pub running: bool,
    pub version: String,
    pub server_id: String,
    /// "on", "off" or "missing"; "" when Zotero isn't running.
    pub local_api: String,
    pub writes: bool,
}

/// What Settings › Zotero shows; never the key itself.
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)]
pub struct ZoteroStatus {
    pub running: bool,
    pub version: String,
    pub local_api: String,
    /// Zotero 10's writes, which the project collections need.
    pub writes: bool,
    /// Better BibTeX's version, or "installed"; `None` without it.
    pub better_bibtex: Option<String>,
    /// Better BibTeX's citation picker answers.
    pub cayw: bool,
    pub authorised: bool,
    pub message: Option<String>,
}

/// The Zotero client. `data_dir` holds `zotero.json`, 2.8's file for the key, kept as it was so a 2.8 data
/// folder's permission still works.
#[derive(Clone)]
pub struct Zotero {
    pub(crate) http: Http,
    data_dir: PathBuf,
    /// The prompt waiting in Zotero (the Allow prompt or the picker), which `cancel_prompt` stops.
    prompt: Arc<Mutex<Option<tokio::sync::watch::Sender<bool>>>>,
    pub(crate) last_read:
        Arc<Mutex<std::collections::HashMap<PathBuf, std::collections::HashSet<String>>>>,
    key_lock: Arc<tokio::sync::Mutex<()>>,
    sync_lock: Arc<tokio::sync::Mutex<()>>,
}

impl Zotero {
    pub fn new(http: Http, data_dir: &Path) -> Self {
        Self {
            http,
            data_dir: data_dir.to_path_buf(),
            prompt: Arc::default(),
            last_read: Arc::default(),
            key_lock: Arc::default(),
            sync_lock: Arc::default(),
        }
    }

    fn key_file(&self) -> PathBuf {
        self.data_dir.join("zotero.json")
    }

    fn base(&self) -> &str {
        self.http.endpoints.zotero.trim_end_matches('/')
    }

    /// One request; `wait` bounds it (a prompt waits up to ten minutes, and Cancel ends it).
    pub(crate) async fn call(
        &self,
        route: &str,
        method: Method,
        body: Option<&Value>,
        headers: &[(&str, String)],
        auth: Option<&Auth>,
        wait: Option<&mut tokio::sync::watch::Receiver<bool>>,
    ) -> Result<Reply, RefError> {
        let mut req = self
            .http
            .client()
            .request(method, format!("{}{route}", self.base()))
            .header("User-Agent", USER_AGENT)
            .header("Zotero-API-Version", "3");
        if let Some(b) = body {
            req = req.json(b);
        }
        if let Some(a) = auth {
            req = req.header("Zotero-API-Key", &a.key);
            if !a.server_id.is_empty() {
                req = req.header("Zotero-Server-ID", &a.server_id);
            }
        }
        for (k, v) in headers {
            req = req.header(*k, v);
        }
        let send = async {
            let res = req.send().await.map_err(|e| {
                RefError::ZoteroUnreachable(if e.is_timeout() {
                    "Zotero took too long to answer.".into()
                } else {
                    NOT_OPEN.into()
                })
            })?;
            let status = res.status().as_u16();
            let headers = res.headers().clone();
            let body = res.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
            Ok(Reply {
                status,
                headers,
                body,
            })
        };
        match wait {
            None => tokio::time::timeout(TIMEOUT, send)
                .await
                .unwrap_or_else(|_| {
                    Err(RefError::ZoteroUnreachable(
                        "Zotero took too long to answer.".into(),
                    ))
                }),
            Some(cancel) => {
                tokio::select! {
                    r = tokio::time::timeout(PROMPT, send) => r.unwrap_or_else(|_| Err(RefError::ZoteroUnreachable("Zotero took too long to answer.".into()))),
                    _ = cancel.wait_for(|c| *c) => Err(RefError::Cancelled),
                }
            }
        }
    }

    pub(crate) async fn get(&self, route: &str) -> Result<Reply, RefError> {
        self.call(route, Method::GET, None, &[], None, None).await
    }

    /// JSON, `None` for a 404.
    pub(crate) async fn json(&self, route: &str) -> Result<Option<Value>, RefError> {
        let res = self.get(route).await?;
        match res.status {
            404 => Ok(None),
            403 => Err(RefError::ZoteroUnreachable(API_OFF.into())),
            s if !(200..300).contains(&s) => {
                Err(RefError::Zotero(format!("Zotero answered HTTP {s}.")))
            }
            _ => Ok(res.json()),
        }
    }

    /// Every page of a list, 100 at a time.
    pub(crate) async fn all(&self, route: &str) -> Result<Vec<Value>, RefError> {
        let mut out = Vec::new();
        let join = if route.contains('?') { '&' } else { '?' };
        for start in (0..).step_by(100) {
            let Some(Value::Array(page)) = self
                .json(&format!("{route}{join}limit=100&start={start}"))
                .await?
            else {
                return Ok(out);
            };
            let n = page.len();
            out.extend(page);
            if n < 100 {
                return Ok(out);
            }
        }
        Ok(out)
    }

    /// Better BibTeX's JSON-RPC; an error when it isn't installed.
    pub(crate) async fn rpc(&self, method: &str, params: Value) -> Result<Value, RefError> {
        let res = self
            .call(
                "/better-bibtex/json-rpc",
                Method::POST,
                Some(&json!({ "jsonrpc": "2.0", "method": method, "params": params, "id": 1 })),
                &[],
                None,
                None,
            )
            .await?;
        let data = res.json().filter(|_| res.ok());
        match data {
            Some(d) if d.get("error").is_none() => {
                Ok(d.get("result").cloned().unwrap_or(Value::Null))
            }
            Some(d) => Err(RefError::Zotero(
                d.pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Better BibTeX didn’t answer.")
                    .to_owned(),
            )),
            None => Err(RefError::Zotero("Better BibTeX didn’t answer.".into())),
        }
    }

    /// A write refused for its key drops the key: Zotero takes one given without Always Allow only once.
    pub(crate) async fn written(&self, res: Reply, auth: &Auth) -> Result<Reply, RefError> {
        if res.ok() {
            return Ok(res);
        }
        if res.status == 401 || res.status == 403 {
            self.discard_key(&auth.key).await;
            return Err(RefError::ZoteroKeyRefused(KEY_REFUSED.into()));
        }
        let detail: String = res.text().chars().take(200).collect();
        Err(RefError::Zotero(format!(
            "Zotero refused the change (HTTP {}{}).",
            res.status,
            if detail.is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        )))
    }

    pub(crate) fn read_auth(&self) -> Auth {
        let parsed: Option<Value> = std::fs::read_to_string(self.key_file())
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok());
        let field = |k: &str| {
            parsed
                .as_ref()
                .and_then(|v| v.get(k))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned()
        };
        Auth {
            key: field("key"),
            server_id: field("serverId"),
        }
    }

    /// Forgets the permission (Settings › Zotero's Disconnect).
    pub async fn forget_key(&self) -> Result<(), RefError> {
        let _held = self.key_lock.lock().await;
        match std::fs::remove_file(self.key_file()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                Err(RefError::io("remove", &self.key_file(), e))
            }
            _ => Ok(()),
        }
    }

    /// Dropped only while it's still the one refused, so a newer Allow's key is never dropped.
    pub(crate) async fn discard_key(&self, key: &str) {
        let _held = self.key_lock.lock().await;
        if !key.is_empty() && self.read_auth().key == key {
            let _ = std::fs::remove_file(self.key_file());
        }
    }

    async fn save_key(&self, key: &str, server_id: &str) -> Result<(), RefError> {
        let _held = self.key_lock.lock().await;
        let file = self.key_file();
        std::fs::create_dir_all(&self.data_dir)
            .map_err(|e| RefError::io("create", &self.data_dir, e))?;
        let tmp = self
            .data_dir
            .join(format!("zotero.json.{}.tmp", uuid::Uuid::new_v4()));
        let text = json!({ "key": key, "serverId": server_id }).to_string();
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        let written = options
            .open(&tmp)
            .and_then(|mut f| std::io::Write::write_all(&mut f, text.as_bytes()))
            .and_then(|()| std::fs::rename(&tmp, &file));
        let _ = std::fs::remove_file(&tmp);
        written.map_err(|e| RefError::io("save", &file, e))
    }

    /// Whether Zotero runs, its version, its local API, and whether it takes writes (Zotero 10).
    pub(crate) async fn probe(&self) -> Probe {
        let Ok(ping) = self.get("/connector/ping").await else {
            return Probe::default();
        };
        let Ok(api) = self.get("/api/").await else {
            return Probe::default();
        };
        let version = ping.header("x-zotero-version").to_owned();
        let server_id = [
            api.header("zotero-server-id"),
            ping.header("zotero-server-id"),
        ]
        .into_iter()
        .find(|s| !s.is_empty())
        .unwrap_or("")
        .to_owned();
        let local_api = if api.ok() {
            "on"
        } else if api.status == 403 {
            "off"
        } else {
            "missing"
        }
        .to_owned();
        let major: Option<u32> = version.split('.').next().and_then(|m| m.parse().ok());
        // Zotero-Server-ID came with the local API's writes, so it stands in for a version Zotero didn't give
        let writes = local_api == "on" && major.map_or(!server_id.is_empty(), |m| m >= 10);
        Probe {
            running: true,
            version,
            server_id,
            local_api,
            writes,
        }
    }

    pub async fn status(&self) -> ZoteroStatus {
        let found = self.probe().await;
        let authorised = !self.read_auth().key.is_empty();
        if !found.running {
            return ZoteroStatus {
                authorised,
                message: Some(NOT_OPEN.into()),
                ..ZoteroStatus::default()
            };
        }
        let bbt = self.rpc("api.ready", json!([])).await.ok();
        let cayw = bbt.is_some()
            && self
                .get("/better-bibtex/cayw?probe=1")
                .await
                .is_ok_and(|r| r.text().trim() == "ready");
        let version = if found.version.is_empty() {
            bbt.as_ref()
                .and_then(|b| b.get("zotero"))
                .map(crate::csl::str_of)
                .unwrap_or_default()
        } else {
            found.version.clone()
        };
        let message = if found.local_api != "on" {
            Some(API_OFF.to_owned())
        } else if found.writes {
            None
        } else {
            Some(needs_ten(&version))
        };
        ZoteroStatus {
            running: true,
            better_bibtex: bbt.map(|b| {
                b.get("betterbibtex")
                    .map(crate::csl::str_of)
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| "installed".into())
            }),
            version,
            local_api: found.local_api,
            writes: found.writes,
            cayw,
            authorised,
            message,
        }
    }

    fn start_prompt(&self) -> tokio::sync::watch::Receiver<bool> {
        let (tx, rx) = tokio::sync::watch::channel(false);
        if let Some(old) = self.prompt.lock().replace(tx) {
            let _ = old.send(true);
        }
        rx
    }

    /// Stops the prompt waiting in Zotero.
    pub fn cancel_prompt(&self) {
        if let Some(tx) = self.prompt.lock().take() {
            let _ = tx.send(true);
        }
    }

    /// Zotero's window to the front, where the prompt waits. ponytail: Windows may not let a background program
    /// do it.
    fn bring_forward(&self) {
        if self.http.endpoints.zotero != crate::http::Endpoints::default().zotero {
            return;
        }
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open")
            .args(["-b", "org.zotero.zotero"])
            .spawn();
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", "$p = Get-Process zotero -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }"])
                .creation_flags(0x0800_0000)
                .spawn();
        }
    }

    /// A request that waits for the user in Zotero: Zotero comes forward, and Cancel (or ten minutes) ends it.
    pub(crate) async fn in_zotero(
        &self,
        route: &str,
        method: Method,
        body: Option<&Value>,
        headers: &[(&str, String)],
    ) -> Result<Reply, RefError> {
        let mut rx = self.start_prompt();
        self.bring_forward();
        let res = self
            .call(route, method, body, headers, None, Some(&mut rx))
            .await;
        self.prompt.lock().take();
        res
    }

    /// Asks Zotero (10) to let Spectrum write: Zotero shows its Allow prompt, and the key it gives is kept.
    pub async fn authorise(&self) -> Result<ZoteroStatus, RefError> {
        let found = self.probe().await;
        if !found.running {
            return Err(RefError::ZoteroUnreachable(NOT_OPEN.into()));
        }
        if found.local_api != "on" {
            return Err(RefError::ZoteroUnreachable(API_OFF.into()));
        }
        if !found.writes {
            return Err(RefError::Zotero(needs_ten(&found.version)));
        }
        let headers: Vec<(&str, String)> = if found.server_id.is_empty() {
            Vec::new()
        } else {
            vec![("Zotero-Server-ID", found.server_id.clone())]
        };
        let res = self
            .in_zotero(
                "/api/local/authorize",
                Method::POST,
                Some(&json!({ "appName": "Spectrum" })),
                &headers,
            )
            .await?;
        if res.status == 403 {
            return Err(RefError::Zotero(
                "Zotero didn’t allow Spectrum. Try again, and choose Always Allow.".into(),
            ));
        }
        if !res.ok() {
            return Err(RefError::Zotero(format!(
                "Zotero couldn’t give Spectrum permission (HTTP {}).",
                res.status
            )));
        }
        let text = res.text();
        let key = match serde_json::from_str::<Value>(&text) {
            Ok(v) => ["key", "apiKey"]
                .iter()
                .find_map(|k| v.get(*k).and_then(Value::as_str))
                .unwrap_or("")
                .to_owned(),
            Err(_) => text.trim().to_owned(),
        };
        let valid = (8..=200).contains(&key.len())
            && key
                .chars()
                .all(|c| c.is_alphanumeric() || c == '_' || c == '-');
        if !valid {
            return Err(RefError::Zotero(
                "Zotero’s answer had no permission in it.".into(),
            ));
        }
        self.save_key(&key, &found.server_id).await?;
        Ok(self.status().await)
    }
}
