//! The providers Settings offers (2.8's `providers.js`): each preset's endpoint, regions, models with the effort
//! levels they accept, and how a level becomes request fields. `live` presets list their models from the server
//! itself (Ollama), and `local` ones take no key.

mod list;

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// The request format a provider speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Api {
    /// OpenAI-compatible Chat Completions.
    Chat,
    /// Anthropic's Messages API.
    Anthropic,
    /// `OpenAI`'s Responses API.
    Responses,
}

/// A reasoning level as providers spell it, lowest first. Spectrum's six effort colours (off, low, med, high,
/// xhigh, max) cover them all; `Minimal` shares Low's colour ([`EffortLevel::colour_slot`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EffortLevel {
    None,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

impl EffortLevel {
    pub const ALL: [Self; 7] = [
        Self::None,
        Self::Minimal,
        Self::Low,
        Self::Medium,
        Self::High,
        Self::Xhigh,
        Self::Max,
    ];

    /// The word the APIs take.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Minimal => "minimal",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Xhigh => "xhigh",
            Self::Max => "max",
        }
    }

    /// Which of the six effort colours (`eff_off` = 0 … `eff_max` = 5) shows this level.
    pub fn colour_slot(self) -> usize {
        match self {
            Self::None => 0,
            Self::Minimal | Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
            Self::Xhigh => 4,
            Self::Max => 5,
        }
    }
}

/// The effort a request asks for: the model's recommended level, the lowest it accepts, or a level (sent as the
/// nearest one the model accepts).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Effort {
    #[default]
    Default,
    Fast,
    Level(EffortLevel),
}

impl From<spectrum_core::settings::ReasoningEffort> for Effort {
    fn from(value: spectrum_core::settings::ReasoningEffort) -> Self {
        use spectrum_core::settings::ReasoningEffort as R;
        match value {
            R::Default => Self::Default,
            R::None => Self::Level(EffortLevel::None),
            R::Minimal => Self::Level(EffortLevel::Minimal),
            R::Low => Self::Level(EffortLevel::Low),
            R::Medium => Self::Level(EffortLevel::Medium),
            R::High => Self::Level(EffortLevel::High),
            R::Xhigh => Self::Level(EffortLevel::Xhigh),
            R::Max => Self::Level(EffortLevel::Max),
        }
    }
}

/// A model a preset lists (or a live server describes).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub label: String,
    pub note: String,
    pub vision: bool,
    /// The levels it accepts, lowest first; empty when it has no effort setting.
    pub levels: Vec<EffortLevel>,
    /// The level Spectrum uses by default.
    pub effort: EffortLevel,
}

/// Another region's endpoint for the same provider (keys only work in the region they were made in).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Region {
    pub label: &'static str,
    pub endpoint: &'static str,
}

/// The model a preset recommends for each role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Recommended {
    pub main: &'static str,
    pub fast: &'static str,
    pub vision: &'static str,
    pub references: &'static str,
}

/// One provider Settings offers.
#[derive(Debug, Clone)]
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub api: Api,
    pub endpoint: &'static str,
    pub regions: &'static [Region],
    pub key_url: &'static str,
    pub note: &'static str,
    /// Takes no key (a local Ollama).
    pub local: bool,
    /// Lists its models from the server; `models` are only a fallback.
    pub live: bool,
    pub models: Vec<Model>,
    pub recommended: Recommended,
    /// Whether an endpoint's host (with its port, which is all that marks an Ollama) is this provider's.
    hosts: fn(&str) -> bool,
    /// The request fields for a level and the model (`None` when the preset doesn't list it).
    fields: fn(EffortLevel, Option<&Model>) -> Value,
}

impl Preset {
    pub fn model(&self, id: &str) -> Option<&Model> {
        self.models.iter().find(|m| m.id == id)
    }

    /// Whether `host` (`name[:port]`, as `URL.host` gives it) belongs to this preset.
    pub fn matches_host(&self, host: &str) -> bool {
        (self.hosts)(host)
    }

    /// The extra request fields for a model and requested effort; an empty object when nothing is sent.
    pub fn effort_fields(&self, model: Option<&Model>, requested: Effort) -> Value {
        effort_for(model, requested).map_or_else(|| json!({}), |level| (self.fields)(level, model))
    }
}

static PRESETS: LazyLock<Vec<Preset>> = LazyLock::new(list::presets);

/// Every preset, in Settings' order.
pub fn presets() -> &'static [Preset] {
    &PRESETS
}

/// A preset by id.
pub fn preset(id: &str) -> Option<&'static Preset> {
    presets().iter().find(|p| p.id == id)
}

/// The preset for an endpoint, or `None` for any other OpenAI-compatible server.
pub fn preset_for_endpoint(endpoint: &str) -> Option<&'static Preset> {
    let host = crate::endpoint::host_of(endpoint)?;
    presets().iter().find(|p| p.matches_host(&host))
}

/// The level to send for a model: `Default` is its recommended level, `Fast` the lowest it accepts, and a level
/// the nearest one it accepts (rounding up on a tie). A model Spectrum doesn't know gets an explicit level only.
pub fn effort_for(model: Option<&Model>, requested: Effort) -> Option<EffortLevel> {
    let Some(m) = model else {
        return match requested {
            Effort::Level(level) => Some(level),
            Effort::Default | Effort::Fast => None,
        };
    };
    let first = *m.levels.first()?;
    Some(match requested {
        Effort::Fast => first,
        Effort::Default => m.effort,
        Effort::Level(want) => {
            let distance = |l: EffortLevel| (l as i32 - want as i32).abs();
            m.levels.iter().fold(first, |best, &l| {
                if distance(l) <= distance(best) {
                    l
                } else {
                    best
                }
            })
        }
    })
}

/// An Ollama model from its `/api/show` details. Thinking values become levels: `false` is Off, `true` (models
/// that can only switch it on) is High, and named levels stay as they are.
pub fn ollama_model(name: &str, show: &Value, note: &str) -> Model {
    let caps: Vec<&str> = show["capabilities"]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let mut m = Model {
        id: name.to_owned(),
        label: name.to_owned(),
        note: note.to_owned(),
        vision: caps.contains(&"vision"),
        levels: Vec::new(),
        effort: EffortLevel::None,
    };
    if !caps.contains(&"thinking") {
        return m;
    }
    let level = |v: &Value| match v {
        Value::Bool(false) => Some(EffortLevel::None),
        Value::Bool(true) => Some(EffortLevel::High),
        Value::String(s) => EffortLevel::ALL.into_iter().find(|l| l.as_str() == s),
        _ => None,
    };
    let thinking = show.get("thinking").filter(|t| t.is_object());
    // older Ollama versions give no thinking details, but take the usual names
    let values: Vec<EffortLevel> = match thinking {
        Some(t) => t["values"]
            .as_array()
            .map(|a| a.iter().filter_map(level).collect())
            .unwrap_or_default(),
        None => vec![
            EffortLevel::None,
            EffortLevel::Low,
            EffortLevel::Medium,
            EffortLevel::High,
        ],
    };
    m.levels = EffortLevel::ALL
        .into_iter()
        .filter(|l| values.contains(l))
        .collect();
    let fallback = match thinking {
        Some(t) => level(&t["default"]),
        None => Some(EffortLevel::Medium),
    };
    // the model's own default, but no higher than High, since several default to a slow Max
    let want = fallback
        .filter(|l| *l <= EffortLevel::High)
        .unwrap_or(EffortLevel::High);
    m.effort = effort_for(Some(&m), Effort::Level(want)).unwrap_or(EffortLevel::None);
    m
}

#[cfg(test)]
mod tests {
    use super::*;
    use EffortLevel as L;

    fn model(levels: &[L], effort: L) -> Model {
        Model {
            id: "m".into(),
            label: "m".into(),
            note: String::new(),
            vision: false,
            levels: levels.to_vec(),
            effort,
        }
    }

    #[test]
    fn effort_rounds_to_the_nearest_level_up_on_a_tie() {
        let m = model(&[L::Low, L::High, L::Max], L::High);
        assert_eq!(
            effort_for(Some(&m), Effort::Level(L::Medium)),
            Some(L::High)
        );
        assert_eq!(effort_for(Some(&m), Effort::Level(L::None)), Some(L::Low));
        assert_eq!(effort_for(Some(&m), Effort::Level(L::Xhigh)), Some(L::Max));
        assert_eq!(effort_for(Some(&m), Effort::Fast), Some(L::Low));
        assert_eq!(effort_for(Some(&m), Effort::Default), Some(L::High));
        assert_eq!(
            effort_for(Some(&model(&[], L::None)), Effort::Level(L::High)),
            None
        );
        assert_eq!(effort_for(None, Effort::Default), None);
        assert_eq!(effort_for(None, Effort::Level(L::Xhigh)), Some(L::Xhigh));
    }

    #[test]
    fn hosts_pick_their_presets() {
        let id = |e: &str| preset_for_endpoint(e).map(|p| p.id);
        assert_eq!(id("https://api.openai.com/v1"), Some("openai"));
        assert_eq!(id("https://open.bigmodel.cn/api/paas/v4"), Some("glm"));
        assert_eq!(
            id("https://ws-1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"),
            Some("qwen")
        );
        assert_eq!(
            id("https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1"),
            Some("qwen")
        );
        assert_eq!(id("http://192.168.1.4:11434"), Some("ollama"));
        assert_eq!(id("http://localhost:8080/v1"), None);
        assert_eq!(
            id("https://ollama.com/v1/chat/completions"),
            Some("ollama-cloud")
        );
        assert_eq!(id("https://api.moonshot.cn/v1"), Some("moonshot"));
        assert_eq!(id("not a url"), None);
    }

    #[test]
    fn every_recommendation_is_listed_and_every_default_accepted() {
        for p in presets() {
            for m in &p.models {
                assert!(
                    m.levels.is_empty() || m.levels.contains(&m.effort),
                    "{} {}",
                    p.id,
                    m.id
                );
                assert!(
                    m.levels.windows(2).all(|w| w[0] < w[1]),
                    "{} {}",
                    p.id,
                    m.id
                );
            }
            if !p.local {
                let r = p.recommended;
                for id in [r.main, r.fast, r.vision, r.references] {
                    assert!(p.model(id).is_some(), "{} {id}", p.id);
                }
            }
        }
    }

    #[test]
    fn ollama_models_take_their_levels_from_show() {
        let show = json!({ "capabilities": ["completion", "thinking", "vision"],
            "thinking": { "values": [false, "low", "medium", "high", "max"], "default": "max" } });
        let m = ollama_model("kimi-k3:cloud", &show, "Runs on Ollama’s servers");
        assert!(m.vision);
        assert_eq!(m.levels, [L::None, L::Low, L::Medium, L::High, L::Max]);
        assert_eq!(m.effort, L::High);
        let on_only = ollama_model(
            "qwen3:8b",
            &json!({ "capabilities": ["completion", "thinking"],
            "thinking": { "values": [false, true], "default": true } }),
            "",
        );
        assert_eq!(
            (on_only.levels.as_slice(), on_only.effort),
            ([L::None, L::High].as_slice(), L::High)
        );
        let old = ollama_model(
            "deepseek-r1",
            &json!({ "capabilities": ["completion", "thinking"] }),
            "",
        );
        assert_eq!((old.levels.len(), old.effort), (4, L::Medium));
        let plain = ollama_model("llama3", &json!({ "capabilities": ["completion"] }), "");
        assert_eq!(plain.levels, []);
    }
}
