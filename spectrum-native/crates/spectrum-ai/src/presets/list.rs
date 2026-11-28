//! The presets, as 2.8.1 lists them (checked against each provider's API docs in October 2026).

use serde_json::{Value, json};

use super::{Api, EffortLevel as L, Model, Preset, Recommended, Region};

const ALL: &[L] = &[L::None, L::Low, L::Medium, L::High, L::Xhigh, L::Max];
const LOW_TO_MAX: &[L] = &[L::Low, L::Medium, L::High, L::Xhigh, L::Max];
const MINIMAL_TO_MAX: &[L] = &[L::Minimal, L::Low, L::Medium, L::High, L::Xhigh, L::Max];
const MINIMAL_TO_XHIGH: &[L] = &[L::Minimal, L::Low, L::Medium, L::High, L::Xhigh];
const LOW_HIGH_MAX: &[L] = &[L::Low, L::High, L::Max];
const LOW_MEDIUM_HIGH: &[L] = &[L::Low, L::Medium, L::High];
const NONE_LOW_HIGH_MAX: &[L] = &[L::None, L::Low, L::High, L::Max];
const QWEN: &[L] = &[L::None, L::Low, L::Medium, L::Xhigh];

fn m(id: &str, label: &str, note: &str, vision: bool, levels: &[L], effort: L) -> Model {
    Model {
        id: id.into(),
        label: label.into(),
        note: note.into(),
        vision,
        levels: levels.to_vec(),
        effort,
    }
}

const fn rec(
    main: &'static str,
    fast: &'static str,
    vision: &'static str,
    references: &'static str,
) -> Recommended {
    Recommended {
        main,
        fast,
        vision,
        references,
    }
}

/// `host` is `domain` or one of its subdomains.
fn under(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|rest| rest.ends_with('.'))
}

fn reasoning_effort(level: L, _: Option<&Model>) -> Value {
    json!({ "reasoning_effort": level.as_str() })
}

fn reasoning_object(level: L, _: Option<&Model>) -> Value {
    json!({ "reasoning": { "effort": level.as_str() } })
}

/// `DeepSeek` and GLM: thinking is on unless effort is Off.
fn thinking_switch(level: L, _: Option<&Model>) -> Value {
    if level == L::None {
        json!({ "thinking": { "type": "disabled" } })
    } else {
        json!({ "thinking": { "type": "enabled" }, "reasoning_effort": level.as_str() })
    }
}

#[allow(clippy::too_many_lines)]
pub(super) fn presets() -> Vec<Preset> {
    vec![
        Preset {
            id: "openai",
            name: "OpenAI",
            // Chat Completions refuses tools with any effort above none, so Spectrum uses the Responses API
            api: Api::Responses,
            endpoint: "https://api.openai.com/v1/chat/completions",
            regions: &[],
            key_url: "https://platform.openai.com/api-keys",
            note: "Requests go through the Responses API, so effort also applies when the assistant edits files. Nothing is stored on OpenAI’s servers.",
            local: false,
            live: false,
            models: vec![
                m(
                    "gpt-6-sol",
                    "GPT-6 Sol",
                    "Strong all-rounder for writing and multi-file edits",
                    true,
                    ALL,
                    L::Medium,
                ),
                m(
                    "gpt-6.1-sol",
                    "GPT-6.1 Sol",
                    "Near GPT-6 Astra quality at the GPT-6 Sol price",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "gpt-6-astra",
                    "GPT-6 Astra",
                    "Most capable and most expensive",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "gpt-5.6-terra",
                    "GPT-5.6 Terra",
                    "Mid-priced previous generation",
                    true,
                    ALL,
                    L::Medium,
                ),
                m(
                    "gpt-6-luna",
                    "GPT-6 Luna",
                    "Fast and cheap, for autocomplete and references",
                    true,
                    ALL,
                    L::Low,
                ),
            ],
            recommended: rec("gpt-6-sol", "gpt-6-luna", "gpt-6-sol", "gpt-6-luna"),
            hosts: |h| under(h, "api.openai.com"),
            fields: reasoning_object,
        },
        Preset {
            id: "anthropic",
            name: "Anthropic Claude",
            // the OpenAI-compatible endpoint ignores effort, so Spectrum uses the Messages API
            api: Api::Anthropic,
            endpoint: "https://api.anthropic.com/v1/messages",
            regions: &[],
            key_url: "https://platform.claude.com/settings/keys",
            note: "Requests go through Anthropic’s Messages API, which is the only way to set Claude’s effort.",
            local: false,
            live: false,
            models: vec![
                m(
                    "claude-opus-5-5",
                    "Claude Opus 5.5",
                    "Best for long documents and careful edits",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "claude-sonnet-5-5",
                    "Claude Sonnet 5.5",
                    "Balanced quality, speed and price",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "claude-fable-5-1",
                    "Claude Fable 5.1",
                    "Top tier for the hardest work, and expensive",
                    true,
                    LOW_TO_MAX,
                    L::High,
                ),
                m(
                    "claude-haiku-5-5",
                    "Claude Haiku 5.5",
                    "Fast and cheap; the only one that can turn thinking off",
                    true,
                    ALL,
                    L::Low,
                ),
            ],
            recommended: rec(
                "claude-opus-5-5",
                "claude-haiku-5-5",
                "claude-sonnet-5-5",
                "claude-haiku-5-5",
            ),
            hosts: |h| under(h, "api.anthropic.com"),
            fields: |level, _| {
                if level == L::None {
                    json!({ "thinking": { "type": "disabled" }, "output_config": { "effort": "low" } })
                } else {
                    json!({ "output_config": { "effort": level.as_str() } })
                }
            },
        },
        Preset {
            id: "gemini",
            name: "Google Gemini",
            api: Api::Chat,
            endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            regions: &[],
            key_url: "https://aistudio.google.com/apikey",
            note: "Create the key in Google AI Studio. Gemini 3 models always think a little, so Off isn’t offered.",
            local: false,
            live: false,
            models: vec![
                m(
                    "gemini-3.8-flash",
                    "Gemini 3.8 Flash",
                    "Google’s strongest Flash model, with a free tier",
                    true,
                    LOW_MEDIUM_HIGH,
                    L::Medium,
                ),
                m(
                    "gemini-3.1-pro-preview",
                    "Gemini 3.1 Pro (preview)",
                    "Strongest reasoning; no free tier",
                    true,
                    LOW_MEDIUM_HIGH,
                    L::High,
                ),
                m(
                    "gemini-3.6-flash",
                    "Gemini 3.6 Flash",
                    "Previous Flash generation",
                    true,
                    &[L::Minimal, L::Low, L::Medium, L::High],
                    L::Medium,
                ),
                m(
                    "gemini-3.5-flash-lite",
                    "Gemini 3.5 Flash-Lite",
                    "Fast and cheap, for autocomplete and references",
                    true,
                    &[L::Minimal, L::Low, L::Medium, L::High],
                    L::Minimal,
                ),
            ],
            recommended: rec(
                "gemini-3.8-flash",
                "gemini-3.5-flash-lite",
                "gemini-3.8-flash",
                "gemini-3.5-flash-lite",
            ),
            hosts: |h| h == "generativelanguage.googleapis.com",
            fields: reasoning_effort,
        },
        Preset {
            id: "openrouter",
            name: "OpenRouter",
            api: Api::Chat,
            endpoint: "https://openrouter.ai/api/v1/chat/completions",
            regions: &[],
            key_url: "https://openrouter.ai/settings/keys",
            note: "One key for models from every provider. Model names start with the provider, e.g. anthropic/claude-sonnet-5.5.",
            local: false,
            live: false,
            models: vec![
                m(
                    "anthropic/claude-sonnet-5.5",
                    "Claude Sonnet 5.5",
                    "Balanced choice for writing and edits",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "anthropic/claude-opus-5.5",
                    "Claude Opus 5.5",
                    "For the hardest proofs and long refactors",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "openai/gpt-6.1-sol",
                    "GPT-6.1 Sol",
                    "OpenAI’s mid-high tier",
                    true,
                    LOW_TO_MAX,
                    L::Medium,
                ),
                m(
                    "google/gemini-3.8-flash",
                    "Gemini 3.8 Flash",
                    "Good with images and PDFs",
                    true,
                    LOW_MEDIUM_HIGH,
                    L::Low,
                ),
                m(
                    "deepseek/deepseek-v4.1-flash",
                    "DeepSeek V4.1 Flash",
                    "Low cost",
                    true,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "moonshotai/kimi-k3",
                    "Kimi K3",
                    "Strong reasoning; slow at Max",
                    true,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "z-ai/glm-5.3",
                    "GLM-5.3",
                    "Text only",
                    false,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "qwen/qwen3.8-max-0902",
                    "Qwen3.8 Max",
                    "Qwen’s strongest model",
                    true,
                    MINIMAL_TO_XHIGH,
                    L::Medium,
                ),
                m(
                    "meta/muse-spark-1.3",
                    "Muse Spark 1.3",
                    "Meta’s current model",
                    true,
                    MINIMAL_TO_MAX,
                    L::Medium,
                ),
                m(
                    "meta/muse-wonder",
                    "Muse Wonder (preview)",
                    "Meta’s most capable model, at about four times the price",
                    true,
                    MINIMAL_TO_MAX,
                    L::Medium,
                ),
                m(
                    "openai/gpt-6-luna",
                    "GPT-6 Luna",
                    "Fast and cheap, for autocomplete and references",
                    true,
                    ALL,
                    L::Low,
                ),
            ],
            recommended: rec(
                "anthropic/claude-sonnet-5.5",
                "openai/gpt-6-luna",
                "google/gemini-3.8-flash",
                "openai/gpt-6-luna",
            ),
            hosts: |h| under(h, "openrouter.ai"),
            fields: reasoning_object,
        },
        Preset {
            id: "deepseek",
            name: "DeepSeek",
            api: Api::Chat,
            endpoint: "https://api.deepseek.com/chat/completions",
            regions: &[],
            key_url: "https://platform.deepseek.com/api_keys",
            note: "Thinking is on unless effort is Off. Prices halve outside Beijing business hours.",
            local: false,
            live: false,
            models: vec![
                m(
                    "deepseek-flash",
                    "DeepSeek Flash",
                    "Fast, cheap and reads images",
                    true,
                    NONE_LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "deepseek-v4-pro",
                    "DeepSeek V4 Pro",
                    "Stronger reasoning, text only",
                    false,
                    NONE_LOW_HIGH_MAX,
                    L::High,
                ),
            ],
            recommended: rec(
                "deepseek-flash",
                "deepseek-flash",
                "deepseek-flash",
                "deepseek-flash",
            ),
            hosts: |h| h == "api.deepseek.com",
            fields: thinking_switch,
        },
        Preset {
            id: "moonshot",
            name: "Moonshot Kimi",
            api: Api::Chat,
            endpoint: "https://api.moonshot.ai/v1/chat/completions",
            regions: &[Region {
                label: "China",
                endpoint: "https://api.moonshot.cn/v1/chat/completions",
            }],
            key_url: "https://platform.kimi.ai/console/api-keys",
            note: "Keys only work in the region they were made in. Kimi needs a top-up of at least US$1 before the first request.",
            local: false,
            live: false,
            models: vec![
                m(
                    "kimi-k3",
                    "Kimi K3",
                    "Moonshot’s strongest model",
                    true,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "kimi-k2.6",
                    "Kimi K2.6",
                    "Faster; thinking can be turned off",
                    true,
                    &[L::None, L::High],
                    L::High,
                ),
            ],
            recommended: rec("kimi-k3", "kimi-k2.6", "kimi-k3", "kimi-k2.6"),
            hosts: |h| h == "api.moonshot.ai" || h == "api.moonshot.cn",
            // K3 has no off switch and treats a missing effort as Max; K2.6 can only turn thinking off
            fields: |level, model| match model {
                Some(m) if m.id == "kimi-k2.6" => {
                    if level == L::None {
                        json!({ "thinking": { "type": "disabled" } })
                    } else {
                        json!({})
                    }
                }
                _ => reasoning_effort(level, model),
            },
        },
        Preset {
            id: "glm",
            name: "Z.ai GLM",
            api: Api::Chat,
            endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
            regions: &[Region {
                label: "China (BigModel)",
                endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            }],
            key_url: "https://z.ai/manage-apikey/apikey-list",
            note: "Use a pay-as-you-go key; GLM Coding Plan keys are limited to Z.ai’s supported tools. GLM-5.3 reads text only.",
            local: false,
            live: false,
            models: vec![
                m(
                    "glm-5.3",
                    "GLM-5.3",
                    "Z.ai’s flagship, text only",
                    false,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "glm-5.3-flash",
                    "GLM-5.3 Flash",
                    "Fast and reads images",
                    true,
                    LOW_HIGH_MAX,
                    L::Low,
                ),
                m(
                    "glm-5.2",
                    "GLM-5.2",
                    "Thinking can be turned off, text only",
                    false,
                    &[L::None, L::High, L::Max],
                    L::High,
                ),
            ],
            recommended: rec("glm-5.3", "glm-5.3-flash", "glm-5.3-flash", "glm-5.3-flash"),
            hosts: |h| h == "api.z.ai" || h == "open.bigmodel.cn",
            fields: thinking_switch,
        },
        Preset {
            id: "qwen",
            name: "Alibaba Qwen",
            api: Api::Chat,
            endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
            regions: &[
                Region {
                    label: "China (Beijing)",
                    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                },
                Region {
                    label: "Hong Kong",
                    endpoint: "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                },
            ],
            key_url: "https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key",
            note: "Keys only work in the region they were made in. For a workspace endpoint, paste its address into Endpoint.",
            local: false,
            live: false,
            models: vec![
                m(
                    "qwen3.8-max",
                    "Qwen3.8 Max",
                    "Qwen’s strongest model",
                    true,
                    QWEN,
                    L::Medium,
                ),
                m(
                    "qwen3.8-flash",
                    "Qwen3.8 Flash",
                    "Similar ability at a lower price",
                    true,
                    QWEN,
                    L::Low,
                ),
                m(
                    "qwen3.7-plus",
                    "Qwen3.7 Plus",
                    "Balanced previous generation",
                    true,
                    QWEN,
                    L::Medium,
                ),
                m(
                    "qwen3.7-flash",
                    "Qwen3.7 Flash",
                    "The cheapest",
                    true,
                    QWEN,
                    L::Low,
                ),
            ],
            recommended: rec(
                "qwen3.8-max",
                "qwen3.8-flash",
                "qwen3.8-max",
                "qwen3.8-flash",
            ),
            hosts: |h| {
                [
                    "dashscope.aliyuncs.com",
                    "dashscope-intl.aliyuncs.com",
                    "dashscope-us.aliyuncs.com",
                ]
                .iter()
                .any(|d| under(h, d))
                    || h.ends_with(".maas.aliyuncs.com")
            },
            fields: |level, model| {
                if level == L::None {
                    return json!({ "enable_thinking": false });
                }
                // Qwen3.7 has no effort setting, only a thinking budget
                if model.is_some_and(|m| m.id.starts_with("qwen3.7")) {
                    return match level {
                        L::Xhigh => json!({ "enable_thinking": true }),
                        L::Low => json!({ "enable_thinking": true, "thinking_budget": 4096 }),
                        _ => json!({ "enable_thinking": true, "thinking_budget": 16384 }),
                    };
                }
                reasoning_effort(level, model)
            },
        },
        Preset {
            id: "meta",
            name: "Meta",
            api: Api::Chat,
            endpoint: "https://api.meta.ai/v1/chat/completions",
            regions: &[],
            key_url: "https://dev.meta.ai/api-keys",
            note: "Muse models always think, so Off isn’t offered. The cheaper Contributor models let Meta train on what you send, so they aren’t listed.",
            local: false,
            live: false,
            models: vec![
                m(
                    "muse-wonder-1.0",
                    "Muse Wonder 1.0 (preview)",
                    "Meta’s most capable model, at about four times the price",
                    true,
                    MINIMAL_TO_MAX,
                    L::Medium,
                ),
                m(
                    "muse-spark-1.3",
                    "Muse Spark 1.3",
                    "Meta’s current model",
                    true,
                    MINIMAL_TO_MAX,
                    L::Medium,
                ),
                m(
                    "muse-spark-1.2",
                    "Muse Spark 1.2",
                    "Previous version",
                    true,
                    MINIMAL_TO_XHIGH,
                    L::Medium,
                ),
                m(
                    "muse-spark-1.1",
                    "Muse Spark 1.1",
                    "Oldest version, at the same price",
                    true,
                    MINIMAL_TO_XHIGH,
                    L::Medium,
                ),
            ],
            recommended: rec(
                "muse-spark-1.3",
                "muse-spark-1.3",
                "muse-spark-1.3",
                "muse-spark-1.3",
            ),
            hosts: |h| h == "api.meta.ai",
            fields: reasoning_effort,
        },
        Preset {
            id: "ollama",
            name: "Ollama",
            api: Api::Chat,
            endpoint: "http://localhost:11434",
            regions: &[],
            key_url: "",
            note: "Runs the models installed in Ollama, on this computer or another on your network, without a key. Set Context length to 32k or more in Ollama’s settings so whole documents fit.",
            local: true,
            live: true,
            models: Vec::new(),
            recommended: rec("", "", "", ""),
            // Ollama's own port, on this computer or another on the network
            // ponytail: an Ollama moved to another port is treated as Other (no effort mapping) unless the
            // config names the preset
            hosts: |h| h.ends_with(":11434"),
            fields: reasoning_effort,
        },
        Preset {
            id: "ollama-cloud",
            name: "Ollama Cloud",
            api: Api::Chat,
            endpoint: "https://ollama.com/v1/chat/completions",
            regions: &[],
            key_url: "https://ollama.com/settings/keys",
            note: "Open models on Ollama’s servers, which don’t keep what you send or train on it.",
            local: false,
            // these models are only shown when ollama.com can't be reached for its own list
            live: true,
            models: vec![
                m(
                    "kimi-k3",
                    "Kimi K3",
                    "Moonshot’s strongest model",
                    true,
                    NONE_LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "glm-5.3",
                    "GLM-5.3",
                    "Z.ai’s flagship, text only",
                    false,
                    LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "deepseek-v4.1-flash",
                    "DeepSeek V4.1 Flash",
                    "Fast and reads images; thinking can be turned off",
                    true,
                    NONE_LOW_HIGH_MAX,
                    L::High,
                ),
                m(
                    "muse-spark-open",
                    "Muse Spark Open",
                    "Meta’s open-weight Muse Spark",
                    true,
                    &[L::None, L::Low, L::Medium, L::High, L::Max],
                    L::High,
                ),
                m(
                    "gemma4:31b",
                    "Gemma 4 31B",
                    "Google’s open model; thinks only when asked",
                    true,
                    &[L::None, L::High],
                    L::None,
                ),
                m(
                    "gpt-oss:120b",
                    "gpt-oss 120B",
                    "OpenAI’s open-weight model, text only",
                    false,
                    LOW_MEDIUM_HIGH,
                    L::Medium,
                ),
            ],
            recommended: rec(
                "kimi-k3",
                "deepseek-v4.1-flash",
                "kimi-k3",
                "deepseek-v4.1-flash",
            ),
            hosts: |h| h == "ollama.com",
            fields: reasoning_effort,
        },
    ]
}
