//! GitHub's OAuth device flow, with Spectrum's own OAuth app (no client secret): Spectrum shows GitHub's
//! code, the user enters it at github.com, and Spectrum asks until it's used or runs out.

use std::time::{Duration, Instant};

use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};

use super::{http_client, offline};
use crate::error::{GitError, Result};

/// Spectrum's GitHub OAuth app, as in 2.8's constants.
const DEFAULT_CLIENT_ID: &str = "Ov23lictk8ESvCDcCwyF";

/// The client id: `SPECTRUM_GITHUB_CLIENT_ID` when set (an empty one turns one-click sign-in off).
pub fn client_id() -> Option<String> {
    let id =
        std::env::var("SPECTRUM_GITHUB_CLIENT_ID").unwrap_or_else(|_| DEFAULT_CLIENT_ID.into());
    (!id.is_empty()).then_some(id)
}

/// The code to show and where to enter it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceCode {
    pub user_code: String,
    pub verification_uri: String,
    pub(crate) secret: String,
    /// How long to wait between asks; at least 5 s, longer when GitHub says to slow down.
    pub interval: Duration,
    pub expires_at: Instant,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DevicePoll {
    /// Not entered yet.
    Waiting,
    /// GitHub asked for more time between asks; the code's interval has grown.
    SlowDown,
    Token(String),
    Expired,
    Denied,
    Failed(String),
}

async fn post(web: &str, path: &str, body: Value) -> Result<Value> {
    let res = http_client()?
        .post(format!("{}{path}", web.trim_end_matches('/')))
        .header("accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| offline(&e))?;
    Ok(res.json().await.unwrap_or(Value::Null))
}

/// Starts a sign-in at `web` ([`super::GITHUB_WEB`], or a test server) with scope `repo read:user`.
pub async fn start_device_sign_in(web: &str) -> Result<DeviceCode> {
    let id = client_id().ok_or_else(|| {
        GitError::Refused(
            "This copy of Spectrum has no GitHub app to sign in with. Paste a token instead."
                .into(),
        )
    })?;
    let res = post(
        web,
        "/login/device/code",
        json!({ "client_id": id, "scope": "repo read:user" }),
    )
    .await?;
    let Some(device_code) = res["device_code"].as_str() else {
        let message = res["error_description"]
            .as_str()
            .unwrap_or("GitHub didn’t start the sign-in.");
        return Err(GitError::GitHub {
            status: 502,
            message: message.into(),
        });
    };
    Ok(DeviceCode {
        user_code: res["user_code"].as_str().unwrap_or_default().into(),
        verification_uri: res["verification_uri"]
            .as_str()
            .unwrap_or("https://github.com/login/device")
            .into(),
        secret: device_code.into(),
        interval: Duration::from_secs(res["interval"].as_u64().unwrap_or(5).max(5)),
        expires_at: Instant::now() + Duration::from_secs(res["expires_in"].as_u64().unwrap_or(900)),
    })
}

/// Asks GitHub once whether the code was entered. A failure to reach GitHub is `Err(Offline)`: ask again.
pub async fn poll_device(web: &str, code: &mut DeviceCode) -> Result<DevicePoll> {
    let id = client_id().unwrap_or_default();
    let res = post(
        web,
        "/login/oauth/access_token",
        json!({ "client_id": id, "device_code": code.secret, "grant_type": "urn:ietf:params:oauth:grant-type:device_code" }),
    )
    .await?;
    if let Some(token) = res["access_token"].as_str() {
        return Ok(DevicePoll::Token(token.into()));
    }
    Ok(match res["error"].as_str() {
        Some("authorization_pending") => DevicePoll::Waiting,
        Some("slow_down") => {
            let asked = Duration::from_secs(res["interval"].as_u64().unwrap_or(0));
            code.interval = (code.interval + Duration::from_secs(5)).max(asked);
            DevicePoll::SlowDown
        }
        Some("expired_token") => DevicePoll::Expired,
        Some("access_denied") => DevicePoll::Denied,
        other => DevicePoll::Failed(
            res["error_description"]
                .as_str()
                .or(other)
                .unwrap_or("GitHub refused the sign-in.")
                .into(),
        ),
    })
}

/// Asks every interval until the code is used, refused or runs out, or `cancel` is set; offline asks are
/// tried again next time. The token comes back; keep it with [`super::GitHubAuth::sign_in_with_token`].
pub async fn wait_for_device(
    web: &str,
    code: &mut DeviceCode,
    cancel: &AtomicBool,
) -> Result<DevicePoll> {
    loop {
        tokio::time::sleep(code.interval).await;
        if cancel.load(Ordering::Relaxed) {
            return Ok(DevicePoll::Failed("Cancelled.".into()));
        }
        if Instant::now() > code.expires_at {
            return Ok(DevicePoll::Expired);
        }
        match poll_device(web, code).await {
            Ok(DevicePoll::Waiting | DevicePoll::SlowDown) | Err(GitError::Offline) => {}
            Ok(done) => return Ok(done),
            Err(e) => return Err(e),
        }
    }
}
