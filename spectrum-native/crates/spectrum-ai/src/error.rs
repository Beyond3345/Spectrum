//! `LlmError`: every failure as the one plain sentence 2.8 showed, never a raw body.

use serde_json::Value;

/// Why a call gave no answer. `Display` is the copy the assistant shows.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LlmError {
    #[error("No AI model is set up yet. Connect a provider in Settings › Providers.")]
    NoKey,
    #[error("The API key has a character that can’t be sent. Paste it again.")]
    BadKey,
    #[error("Stopped.")]
    Cancelled,
    /// A non-2xx answer, already put into words (with the key blanked out).
    #[error("{message}")]
    Status { status: u16, message: String },
    /// No answer came at all; `kind` is name, refused, reset, timeout, network, certificate or other.
    #[error("{message}")]
    Unreachable { kind: &'static str, message: String },
    #[error("{host} took too long to answer. Try again.")]
    Timeout { host: String },
    #[error("The connection to {host} was lost part-way through the answer. Try again.")]
    Broken { host: String },
    #[error("The model provider reported an error part-way through the answer: {0}.")]
    Provider(String),
    #[error("The model provider sent a reply that couldn’t be read.")]
    Unreadable,
    #[error("{0}")]
    NoAnswer(String),
    /// A tool call cut off part-way has half its arguments, so it must never run.
    #[error("The answer was cut off before it finished. Try a lower effort or a smaller request.")]
    CutOff,
    #[error(
        "Ollama needs you to sign in to use its cloud models. Sign in from the Ollama app, or run ollama signin."
    )]
    OllamaSignIn,
    #[error("{0}")]
    Ollama(String),
}

impl LlmError {
    /// The error as the window shows it.
    pub fn notice(&self) -> spectrum_core::UserNotice {
        spectrum_core::UserNotice {
            title: "The AI model didn’t answer".into(),
            detail: self.to_string(),
            action: None,
        }
    }
}

pub(crate) fn spent_quota(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    ["quota", "billing", "credit", "balance"]
        .iter()
        .any(|w| t.contains(w))
}

/// A provider's non-2xx answer as one plain sentence.
pub(crate) fn provider_error(status: u16, text: &str) -> String {
    match status {
        401 | 403 => return "The API key was rejected. Check it in Settings › Providers.".into(),
        404 => return "The endpoint or model wasn’t found. Check the endpoint in Settings › Providers and the model in Settings › Models.".into(),
        // a 429 is also how providers say the account has run out, which waiting never mends
        429 if spent_quota(text) => return "The provider says this account has no quota or credit left. Check your plan and billing with the provider.".into(),
        429 => return "The provider is limiting requests. Try again shortly.".into(),
        _ => {}
    }
    let detail = serde_json::from_str::<Value>(text)
        .ok()
        .map(|parsed| {
            // Gemini wraps the error in an array
            let error = match &parsed {
                Value::Array(items) => items.first().map(|v| v["error"].clone()),
                other => Some(other["error"].clone()),
            }
            .unwrap_or(Value::Null);
            let text = error
                .as_str()
                .or_else(|| error["message"].as_str())
                .unwrap_or("");
            text.trim().trim_end_matches('.').to_owned()
        })
        .unwrap_or_default();
    if detail.is_empty() {
        format!("The model provider returned an error (HTTP {status}).")
    } else {
        format!("The model provider returned an error (HTTP {status}): {detail}.")
    }
}

/// Why a request got no answer, from reqwest's error chain. Only name, refused and other point at a mistake in
/// the endpoint, so only they say to check it.
pub(crate) fn unreachable(err: &reqwest::Error, host: &str) -> (&'static str, String) {
    use std::io::ErrorKind as K;
    let mut chain = String::new();
    let mut kind = None;
    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(err);
    while let Some(e) = source {
        chain.push_str(&e.to_string().to_ascii_lowercase());
        chain.push(' ');
        if let Some(io) = e.downcast_ref::<std::io::Error>() {
            kind = kind.or(match io.kind() {
                K::ConnectionRefused => Some("refused"),
                K::ConnectionReset | K::ConnectionAborted | K::BrokenPipe | K::UnexpectedEof => {
                    Some("reset")
                }
                K::TimedOut => Some("timeout"),
                K::HostUnreachable | K::NetworkUnreachable | K::NetworkDown => Some("network"),
                _ => None,
            });
        }
        source = e.source();
    }
    let kind = kind.unwrap_or_else(|| {
        if chain.contains("dns error") || chain.contains("failed to lookup address") {
            "name"
        } else if chain.contains("certificate") || chain.contains("tls") {
            "certificate"
        } else if err.is_timeout() {
            "timeout"
        } else {
            "other"
        }
    });
    let message = match kind {
        "name" => format!(
            "The name {host} couldn’t be found. Check the endpoint in Settings › Providers, and your internet or VPN connection."
        ),
        "refused" => format!(
            "{host} refused the connection. Check the endpoint in Settings › Providers, and that the server is running."
        ),
        "reset" => format!(
            "The connection to {host} was dropped before it answered, which a VPN or an unsteady network can do. Try again."
        ),
        "timeout" => format!(
            "Connecting to {host} timed out. Check your internet or VPN connection, then try again."
        ),
        "network" => {
            format!("This computer has no route to {host}. Check your internet or VPN connection.")
        }
        "certificate" => format!(
            "The secure connection to {host} failed because its certificate couldn’t be trusted. Check the endpoint; a VPN or proxy that inspects traffic can also cause this."
        ),
        _ => format!("Couldn’t reach {host}. Check the endpoint in Settings › Providers."),
    };
    (kind, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_become_sentences() {
        assert!(provider_error(401, "").contains("key was rejected"));
        assert!(provider_error(429, r#"{"error":"insufficient_quota"}"#).contains("no quota"));
        assert!(provider_error(429, "slow down").contains("limiting"));
        assert_eq!(
            provider_error(400, r#"[{"error":{"message":"Bad model."}}]"#),
            "The model provider returned an error (HTTP 400): Bad model."
        );
        assert_eq!(
            provider_error(500, "<html>"),
            "The model provider returned an error (HTTP 500)."
        );
    }
}
