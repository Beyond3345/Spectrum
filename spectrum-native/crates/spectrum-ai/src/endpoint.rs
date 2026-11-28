//! Endpoint and key clean-up, as 2.8's `llmService.js` does it.

pub(crate) const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

/// The Chat Completions address for what the user typed: `…/v1`, Z.ai's `…/v4` and Gemini's `…/v1beta/openai`
/// get `/chat/completions`; a bare host gets `/v1/chat/completions`; `…/messages` stays.
pub fn normalize_chat_endpoint(endpoint: &str) -> String {
    let url = endpoint.trim().trim_end_matches('/');
    if url.is_empty() {
        return DEFAULT_ENDPOINT.to_owned();
    }
    let lower = url.to_ascii_lowercase();
    if lower.ends_with("/chat/completions") || lower.ends_with("/messages") {
        return url.to_owned();
    }
    let versioned = lower.strip_suffix("/openai").unwrap_or(&lower);
    let is_version = versioned.rsplit_once('/').is_some_and(|(_, last)| {
        let Some(rest) = last.strip_prefix('v') else {
            return false;
        };
        let letters = rest.trim_start_matches(|c: char| c.is_ascii_digit());
        letters.len() < rest.len() && letters.bytes().all(|b| b.is_ascii_lowercase())
    });
    if is_version {
        return format!("{url}/chat/completions");
    }
    if lower.contains("/v1/") {
        return url.to_owned();
    }
    format!("{url}/v1/chat/completions")
}

/// The endpoint's host with its port (`URL.host`), after normalising.
pub(crate) fn host_of(endpoint: &str) -> Option<String> {
    let url = reqwest::Url::parse(&normalize_chat_endpoint(endpoint)).ok()?;
    let host = url.host_str()?;
    Some(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    })
}

/// A pasted key without the line break or invisible space it often brings along at either end.
pub(crate) fn clean_key(key: &str) -> String {
    let invisible = |c: char| {
        c.is_whitespace() || matches!(c, '\u{200b}'..='\u{200d}' | '\u{2060}' | '\u{feff}')
    };
    key.trim_matches(invisible).to_owned()
}

/// A key with a character no header can carry (a space, a line break or a curly quote inside it).
pub(crate) fn bad_key(key: &str) -> bool {
    key.bytes().any(|b| !(0x21..=0x7e).contains(&b))
}

/// Local servers such as Ollama speak plain http and take no key; anything else needs one.
pub(crate) fn missing_key(endpoint: &str, key: &str) -> bool {
    key.is_empty() && !endpoint.trim().to_ascii_lowercase().starts_with("http://")
}

/// An Ollama server's base address (`…/api/tags` hangs off it).
pub(crate) fn ollama_base(endpoint: &str) -> String {
    let url = normalize_chat_endpoint(endpoint);
    let cut = url.len().saturating_sub("/v1/chat/completions".len());
    if url.is_char_boundary(cut) && url[cut..].eq_ignore_ascii_case("/v1/chat/completions") {
        url[..cut].to_owned()
    } else {
        url
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_normalise_as_in_2_8() {
        let n = normalize_chat_endpoint;
        assert_eq!(n(""), DEFAULT_ENDPOINT);
        assert_eq!(
            n("https://api.openai.com/v1/"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            n("https://api.z.ai/api/paas/v4"),
            "https://api.z.ai/api/paas/v4/chat/completions"
        );
        assert_eq!(
            n("https://generativelanguage.googleapis.com/v1beta/openai"),
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        );
        assert_eq!(
            n("https://api.anthropic.com/v1/messages"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            n("http://localhost:11434"),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            n("https://proxy.example/v1/custom"),
            "https://proxy.example/v1/custom"
        );
        assert_eq!(
            n("https://api.deepseek.com"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            ollama_base("http://localhost:11434"),
            "http://localhost:11434"
        );
        assert_eq!(
            host_of("http://LOCALHOST:11434").as_deref(),
            Some("localhost:11434")
        );
        assert_eq!(
            host_of("https://api.openai.com:443/v1").as_deref(),
            Some("api.openai.com")
        );
    }

    #[test]
    fn keys_are_cleaned_and_checked() {
        assert_eq!(clean_key("\u{feff} sk-abc\n"), "sk-abc");
        assert!(bad_key("sk-a“b"));
        assert!(bad_key("sk a"));
        assert!(!bad_key("sk-abc"));
        assert!(missing_key("https://api.openai.com", ""));
        assert!(!missing_key("http://localhost:11434", ""));
    }
}
