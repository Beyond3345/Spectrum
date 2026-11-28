//! The four model roles, resolved from settings as 2.8's `llmConfigFor` does. Fast (autocomplete) and References
//! (splitting pasted references) share 2.8's one quick model, kept in the `references*` settings.

use serde_json::Value;
use spectrum_core::keystore::{KeyStore, SecretStore};
use spectrum_core::{AppSettings, CoreError};

use crate::LlmConfig;
use crate::endpoint::host_of;
use crate::presets::Effort;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ModelRole {
    Main,
    Fast,
    Vision,
    References,
}

impl ModelRole {
    /// The effort a role asks for: the main model at the user's setting, quick jobs as little thinking as the
    /// model allows, vision at the model's recommended level.
    pub fn effort(self, settings: &AppSettings) -> Effort {
        match self {
            Self::Main => settings.reasoning_effort.into(),
            Self::Fast | Self::References => Effort::Fast,
            Self::Vision => Effort::Default,
        }
    }
}

/// A preset id from a provider setting: '' and 'custom' leave it to the endpoint's host.
fn preset_id(provider: &str) -> Option<String> {
    (!provider.is_empty() && provider != "custom").then(|| provider.to_owned())
}

/// The endpoint, key reference, model and preset for a role, before the key is looked up.
pub fn role_config_refs(settings: &AppSettings, role: ModelRole) -> LlmConfig {
    let s = settings;
    let main = LlmConfig {
        endpoint: s.llm_endpoint.clone(),
        api_key: s.llm_api_key.clone(),
        model: s.llm_model.clone(),
        provider: preset_id(&s.llm_provider),
    };
    let (provider, endpoint, key, model) = match role {
        ModelRole::Main => return main,
        ModelRole::Vision => (
            &s.vision_provider,
            &s.vision_endpoint,
            &s.vision_api_key,
            &s.vision_model,
        ),
        ModelRole::Fast | ModelRole::References => (
            &s.references_provider,
            &s.references_endpoint,
            &s.references_api_key,
            &s.references_model,
        ),
    };
    if endpoint.is_empty() {
        // a role moved to Other that has no address yet stays on the main model until it has one
        if !provider.is_empty() {
            return main;
        }
        // otherwise the main model's provider and key, with its own model if it has one
        return LlmConfig {
            model: if model.is_empty() {
                main.model.clone()
            } else {
                model.clone()
            },
            ..main
        };
    }
    let host = host_of(endpoint);
    let same_host = host == host_of(&main.endpoint);
    // a key only ever goes to the host it was entered for
    let api_key = if !key.is_empty() {
        key.clone()
    } else if same_host {
        main.api_key.clone()
    } else {
        s.provider_saved
            .values()
            .find(|saved| !saved.key.is_empty() && host_of(&saved.endpoint) == host)
            .map(|saved| saved.key.clone())
            .unwrap_or_default()
    };
    LlmConfig {
        endpoint: endpoint.clone(),
        api_key,
        // another provider has no use for the main model's name; the client picks its recommended one
        model: if !model.is_empty() {
            model.clone()
        } else if same_host {
            main.model
        } else {
            String::new()
        },
        provider: preset_id(provider),
    }
}

/// A role's config with its key looked up in the keystore (settings keep only `spectrum-key:` references).
pub fn role_config<S: SecretStore>(
    settings: &AppSettings,
    role: ModelRole,
    keys: &KeyStore<S>,
) -> Result<LlmConfig, CoreError> {
    let mut config = role_config_refs(settings, role);
    if let Value::String(key) = keys.with_keys(Value::String(config.api_key.clone()))? {
        config.api_key = key;
    }
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use spectrum_core::settings::{ReasoningEffort, SavedProvider};

    fn settings() -> AppSettings {
        AppSettings {
            llm_provider: "anthropic".into(),
            llm_endpoint: "https://api.anthropic.com/v1/messages".into(),
            llm_api_key: "spectrum-key:main".into(),
            llm_model: "claude-opus-5-5".into(),
            references_model: "claude-haiku-5-5".into(),
            ..AppSettings::default()
        }
    }

    #[test]
    fn roles_follow_the_main_provider_until_moved() {
        let s = settings();
        let fast = role_config_refs(&s, ModelRole::Fast);
        assert_eq!(
            (fast.endpoint.as_str(), fast.model.as_str()),
            (s.llm_endpoint.as_str(), "claude-haiku-5-5")
        );
        assert_eq!(fast.provider.as_deref(), Some("anthropic"));
        let vision = role_config_refs(&s, ModelRole::Vision);
        assert_eq!(vision.model, "claude-opus-5-5");
        assert_eq!(ModelRole::Fast.effort(&s), Effort::Fast);
        let mut s2 = s.clone();
        s2.reasoning_effort = ReasoningEffort::Max;
        assert_eq!(
            ModelRole::Main.effort(&s2),
            Effort::Level(crate::EffortLevel::Max)
        );
    }

    #[test]
    fn a_moved_role_takes_only_keys_entered_for_its_host() {
        let mut s = settings();
        s.vision_provider = "gemini".into();
        s.vision_endpoint =
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions".into();
        let vision = role_config_refs(&s, ModelRole::Vision);
        assert_eq!((vision.api_key.as_str(), vision.model.as_str()), ("", ""));
        s.provider_saved.insert(
            "gemini".into(),
            SavedProvider {
                key: "spectrum-key:gem".into(),
                endpoint: s.vision_endpoint.clone(),
                ..SavedProvider::default()
            },
        );
        assert_eq!(
            role_config_refs(&s, ModelRole::Vision).api_key,
            "spectrum-key:gem"
        );
        // on Other with no address yet: the main model
        s.references_provider = "custom".into();
        assert_eq!(
            role_config_refs(&s, ModelRole::References).model,
            "claude-opus-5-5"
        );
    }
}
