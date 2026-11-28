//! Model prices from models.dev's public list (2.8's `modelsDev.js` and `autoPrices.ts`): text models only, each
//! under its name without a vendor prefix, a `:variant` or `[1m]`, in US dollars per million tokens. The last list
//! is kept in the data folder (`models-dev.json`, 2.8's format) and asked for again at most every six hours.

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::Usage;

const URL: &str = "https://models.dev/api.json";
const EVERY_MS: i64 = 6 * 60 * 60 * 1000;
/// After a failure, not again for ten minutes unless asked.
const AFTER_FAILURE_MS: i64 = 10 * 60 * 1000;
const MAX_BYTES: usize = 30 * 1024 * 1024;
const NON_TEXT: [&str; 9] = [
    "audio",
    "deprecated",
    "embedding",
    "image",
    "moderation",
    "realtime",
    "transcribe",
    "tts",
    "video",
];

/// A model's price, US dollars per million tokens.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub input: f64,
    pub output: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_write: Option<f64>,
}

impl Price {
    /// What `usage` cost at this price (2.8's `costOf`): cached input at the cache price, the rest at full price.
    #[allow(clippy::cast_precision_loss)]
    pub fn cost(&self, usage: &Usage) -> f64 {
        let cached = usage.cache_read.min(usage.input) as f64;
        let input = usage.input as f64;
        ((input - cached) * self.input
            + cached * self.cache_read.unwrap_or(self.input)
            + usage.output as f64 * self.output)
            / 1e6
    }
}

/// The prices as last taken. `synced_at` and `tried_at` are ms since 1970; `error` says why the last try failed.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceList {
    pub synced_at: Option<i64>,
    #[serde(default)]
    pub prices: BTreeMap<String, Price>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tried_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl PriceList {
    /// models.dev's price for a model. Ollama's models (`gemma4:31b`) run on this computer: never a cloud price.
    pub fn price(&self, model: &str) -> Option<&Price> {
        if model.is_empty() || is_local_model(model) {
            return None;
        }
        self.prices.get(&normalize_model_id(model))
    }
}

/// A model's name as prices are kept under it: no vendor prefix, `:variant` or `[1m]`, `@` as `-`, lower case.
pub fn normalize_model_id(id: &str) -> String {
    let name = id.rsplit('/').next().unwrap_or(id);
    let name = name
        .split(':')
        .next()
        .unwrap_or(name)
        .trim()
        .replace('@', "-")
        .to_lowercase();
    match name.strip_suffix("[1m]") {
        Some(short) => short.trim().to_owned(),
        None => name,
    }
}

/// An Ollama model's name: a size or version tag after the colon (`gemma4:31b`, `qwen3:latest`), not a provider
/// variant (`:free`).
pub fn is_local_model(model: &str) -> bool {
    model.rsplit_once(':').is_some_and(|(_, tag)| {
        tag.eq_ignore_ascii_case("latest")
            || (tag.starts_with(|c: char| c.is_ascii_digit())
                && tag
                    .chars()
                    .all(|c| c.is_alphanumeric() || c == '_' || c == '.'))
    })
}

fn is_text(id: &str, model: &Value) -> bool {
    if model["status"]
        .as_str()
        .is_some_and(|s| s.eq_ignore_ascii_case("deprecated"))
    {
        return false;
    }
    let out: Vec<String> = model["modalities"]["output"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_lowercase)
                .collect()
        })
        .unwrap_or_default();
    if !out.is_empty()
        && (!out.iter().any(|m| m == "text")
            || out
                .iter()
                .any(|m| ["audio", "image", "video"].contains(&m.as_str())))
    {
        return false;
    }
    let name = format!("{id} {}", model["name"].as_str().unwrap_or("")).to_lowercase();
    !NON_TEXT.iter().any(|marker| name.contains(marker))
}

/// models.dev's providers as one price per model name. A name many providers sell takes its maker's price (the
/// entry with no `canonical_model_id`), else the first met; a free listing never stands in for a priced one.
pub fn prices_of(data: &Value) -> BTreeMap<String, Price> {
    let n = |v: &Value| v.as_f64().filter(|x| x.is_finite() && *x >= 0.0);
    let mut prices: BTreeMap<String, Price> = BTreeMap::new();
    let mut original = HashSet::new();
    let providers = data.as_object().into_iter().flat_map(|o| o.values());
    for provider in providers {
        let Some(models) = provider["models"].as_object() else {
            continue;
        };
        for (id, model) in models {
            if !is_text(id, model) {
                continue;
            }
            let cost = &model["cost"];
            let (input, output) = (n(&cost["input"]), n(&cost["output"]));
            if input.is_none() && output.is_none() {
                continue;
            }
            let key = normalize_model_id(id);
            if key.is_empty() {
                continue;
            }
            let own = model["canonical_model_id"].is_null() || model["canonical_model_id"] == "";
            let free = input.unwrap_or(0.0) == 0.0 && output.unwrap_or(0.0) == 0.0;
            if let Some(was) = prices.get(&key)
                && (free
                    || ((original.contains(&key) || !own)
                        && (was.input != 0.0 || was.output != 0.0)))
            {
                continue;
            }
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let context = n(&model["limit"]["context"])
                .filter(|c| *c > 0.0)
                .map(|c| c as u64);
            prices.insert(
                key.clone(),
                Price {
                    input: input.unwrap_or(0.0),
                    output: output.unwrap_or(0.0),
                    context,
                    cache_read: n(&cost["cache_read"]),
                    cache_write: n(&cost["cache_write"]),
                },
            );
            if own {
                original.insert(key);
            }
        }
    }
    prices
}

/// The price list kept on disk and refreshed from models.dev.
pub struct PriceCache {
    file: PathBuf,
    url: String,
    http: reqwest::Client,
    /// One request at a time; a second caller waits and reads what the first saved.
    asking: tokio::sync::Mutex<()>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
        .unwrap_or(0)
}

impl PriceCache {
    /// The cache in `data_dir` (`AppPaths::data_dir`).
    pub fn new(data_dir: &Path) -> Self {
        Self::with_url(data_dir, URL)
    }

    /// The cache asking another address (a test's stand-in list).
    pub fn with_url(data_dir: &Path, url: &str) -> Self {
        Self {
            file: data_dir.join("models-dev.json"),
            url: url.to_owned(),
            http: reqwest::Client::new(),
            asking: tokio::sync::Mutex::new(()),
        }
    }

    async fn kept(&self) -> PriceList {
        let bytes = tokio::fs::read(&self.file).await.unwrap_or_default();
        serde_json::from_slice(&bytes).unwrap_or_default()
    }

    /// The prices, taken again when more than six hours old or when asked (`refresh`). A failure keeps the last
    /// list and says why in `error`.
    pub async fn prices(&self, refresh: bool) -> PriceList {
        let _one = self.asking.lock().await;
        let kept = self.kept().await;
        let now = now_ms();
        if !refresh
            && (kept.synced_at.is_some_and(|t| now - t < EVERY_MS)
                || kept.tried_at.is_some_and(|t| now - t < AFTER_FAILURE_MS))
        {
            return kept;
        }
        let next = match self.fetch().await {
            Ok(prices) => PriceList {
                synced_at: Some(now),
                prices,
                tried_at: None,
                error: None,
            },
            Err(error) => {
                tracing::warn!("models.dev prices: {error}");
                PriceList {
                    tried_at: Some(now),
                    error: Some(error),
                    ..kept
                }
            }
        };
        if let Err(err) = self.save(&next).await {
            tracing::warn!("couldn't keep models.dev prices: {err}");
        }
        next
    }

    async fn fetch(&self) -> Result<BTreeMap<String, Price>, String> {
        let res = self
            .http
            .get(&self.url)
            .header("accept", "application/json")
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|_| "Couldn’t reach models.dev.".to_owned())?;
        if !res.status().is_success() {
            return Err(format!("models.dev answered {}", res.status().as_u16()));
        }
        let too_big = || "models.dev’s list is larger than Spectrum takes".to_owned();
        if res.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
            return Err(too_big());
        }
        let bytes = res
            .bytes()
            .await
            .map_err(|_| "models.dev’s list broke off.".to_owned())?;
        if bytes.len() > MAX_BYTES {
            return Err(too_big());
        }
        let data: Value = serde_json::from_slice(&bytes)
            .map_err(|_| "models.dev’s list couldn’t be read.".to_owned())?;
        Ok(prices_of(&data))
    }

    /// Written to a temporary file and renamed, so a crash never leaves half a list.
    async fn save(&self, list: &PriceList) -> std::io::Result<()> {
        let json = serde_json::to_vec_pretty(list).map_err(std::io::Error::other)?;
        if let Some(dir) = self.file.parent() {
            tokio::fs::create_dir_all(dir).await?;
        }
        let tmp = self.file.with_extension("json.tmp");
        tokio::fs::write(&tmp, json).await?;
        tokio::fs::rename(&tmp, &self.file).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn names_normalise_as_in_2_8() {
        assert_eq!(
            normalize_model_id("anthropic/Claude-Sonnet-5.5:free"),
            "claude-sonnet-5.5"
        );
        assert_eq!(normalize_model_id("claude-opus-5-5[1m]"), "claude-opus-5-5");
        assert_eq!(normalize_model_id("gpt@6"), "gpt-6");
        assert!(is_local_model("gemma4:31b"));
        assert!(is_local_model("qwen3:LATEST"));
        assert!(!is_local_model("deepseek/deepseek-v4.1-flash:free"));
        assert!(!is_local_model("gpt-6-sol"));
    }

    #[test]
    fn the_maker_price_wins_and_free_or_non_text_listings_are_skipped() {
        let data = json!({
            "openrouter": { "models": {
                "anthropic/claude-sonnet-5.5": { "canonical_model_id": "claude-sonnet-5-5", "cost": { "input": 4, "output": 20 } },
                "deepseek/deepseek-flash:free": { "cost": { "input": 0, "output": 0 } },
                "openai/gpt-image-2": { "cost": { "input": 5, "output": 40 } }
            }},
            "anthropic": { "models": {
                "claude-sonnet-5.5": { "cost": { "input": 3, "output": 15, "cache_read": 0.3 }, "limit": { "context": 1_000_000 } }
            }},
            "deepseek": { "models": {
                "deepseek-flash": { "cost": { "input": 0.2, "output": 0.8 } },
                "deepseek-tts": { "cost": { "input": 1, "output": 1 } },
                "deepseek-old": { "status": "deprecated", "cost": { "input": 1, "output": 1 } }
            }}
        });
        let p = prices_of(&data);
        assert_eq!(
            p["claude-sonnet-5.5"],
            Price {
                input: 3.0,
                output: 15.0,
                context: Some(1_000_000),
                cache_read: Some(0.3),
                cache_write: None
            }
        );
        assert_eq!(p["deepseek-flash"].input, 0.2);
        assert!(
            !p.contains_key("gpt-image-2")
                && !p.contains_key("deepseek-tts")
                && !p.contains_key("deepseek-old")
        );
        let list = PriceList {
            prices: p,
            ..PriceList::default()
        };
        assert!(list.price("gemma4:31b").is_none());
        let price = list
            .price("anthropic/claude-sonnet-5.5")
            .copied()
            .unwrap_or_default();
        let usage = Usage {
            input: 1_000_000,
            output: 100_000,
            cache_read: 500_000,
            ..Usage::default()
        };
        assert!((price.cost(&usage) - (1.5 + 0.15 + 1.5)).abs() < 1e-9);
    }
}
