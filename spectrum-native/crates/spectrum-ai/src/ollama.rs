//! Ollama's live model list (`/api/tags`, then `/api/show` for each model's thinking levels and vision).

use std::time::Duration;

use serde_json::{Value, json};

use crate::endpoint::ollama_base;
use crate::presets::{Model, Preset, ollama_model};
use crate::{LlmClient, LlmError};

const TIMEOUT: Duration = Duration::from_secs(15);

/// A live preset's models with the ones Spectrum recommends for each role.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveModels {
    pub models: Vec<Model>,
    pub main: String,
    pub fast: String,
    pub vision: String,
    pub references: String,
}

impl LlmClient {
    async fn ollama_json(&self, url: &str, body: Option<Value>) -> Option<Value> {
        let req = match &body {
            Some(body) => self.http.post(url).json(body),
            None => self.http.get(url),
        };
        let res = req.timeout(TIMEOUT).send().await.ok()?;
        if !res.status().is_success() {
            return None;
        }
        res.json().await.ok()
    }

    /// `/api/show` for a model, kept for the session; a failure isn't kept. ollama.com answers it without a key.
    async fn ollama_show(&self, base: &str, name: &str) -> Option<Value> {
        let key = format!("{base} {name}");
        if let Some(show) = self.shown.lock().get(&key) {
            return Some(show.clone());
        }
        let show = self
            .ollama_json(&format!("{base}/api/show"), Some(json!({ "model": name })))
            .await?;
        self.shown.lock().insert(key, show.clone());
        Some(show)
    }

    /// A live preset's model as its server describes it, or `None` when it can't say.
    pub(crate) async fn live_model(&self, endpoint: &str, name: &str) -> Option<Model> {
        let show = self.ollama_show(&ollama_base(endpoint), name).await?;
        Some(ollama_model(name, &show, ""))
    }

    /// The models a live preset's server lists (Ollama newest first), with recommendations, for Settings.
    pub async fn list_live_models(
        &self,
        preset: &Preset,
        endpoint: &str,
    ) -> Result<LiveModels, LlmError> {
        let base = ollama_base(if endpoint.trim().is_empty() {
            preset.endpoint
        } else {
            endpoint
        });
        let unreachable = || {
            LlmError::Ollama(if preset.local {
                "Couldn’t reach Ollama. Start Ollama, or install it from ollama.com.".into()
            } else {
                "Couldn’t reach ollama.com for its models.".into()
            })
        };
        let tags = self
            .ollama_json(&format!("{base}/api/tags"), None)
            .await
            .ok_or_else(unreachable)?;
        let tags = tags["models"].as_array().cloned().unwrap_or_default();
        let shows = futures::future::join_all(tags.iter().map(|t| async {
            let name = t["name"].as_str().unwrap_or_default();
            match self.ollama_show(&base, name).await {
                Some(show) => show,
                None => json!({ "capabilities": t["capabilities"] }),
            }
        }))
        .await;
        let mut models = Vec::new();
        // (name, size) of the models that run here rather than on ollama.com
        let mut here: Vec<(&str, u64)> = Vec::new();
        for (t, show) in tags.iter().zip(&shows) {
            let name = t["name"].as_str().unwrap_or_default();
            // embedding models can't chat
            if let Some(caps) = show["capabilities"].as_array()
                && !caps.iter().any(|c| c == "completion")
            {
                continue;
            }
            let known = preset.model(name);
            let size = [
                &t["details"]["parameter_size"],
                &t["details"]["quantization_level"],
            ]
            .iter()
            .filter_map(|v| v.as_str().filter(|s| !s.is_empty()))
            .collect::<Vec<_>>()
            .join(", ");
            let remote = t["remote_host"].as_str().is_some_and(|h| !h.is_empty());
            let note = match known {
                Some(k) => k.note.clone(),
                None if remote => "Runs on Ollama’s servers".into(),
                None => size,
            };
            let mut m = ollama_model(name, show, &note);
            if let Some(k) = known {
                m.label.clone_from(&k.label);
            }
            if !remote {
                here.push((name, t["size"].as_u64().unwrap_or(u64::MAX)));
            }
            models.push(m);
        }
        let Some(first) = models.first() else {
            return Err(LlmError::Ollama(if preset.local {
                "Ollama has no models yet. Download one in the Ollama app, or with ollama pull."
                    .into()
            } else {
                "ollama.com listed no models.".into()
            }));
        };
        let listed = |id: &str| models.iter().any(|m| m.id == id).then(|| id.to_owned());
        let runs_here = |m: &&Model| here.iter().any(|(n, _)| *n == m.id);
        // the local app's :cloud models run on ollama.com: recommend what runs here before them
        let main = listed(preset.recommended.main)
            .unwrap_or_else(|| models.iter().find(runs_here).unwrap_or(first).id.clone());
        // for quick jobs, the smallest model that runs here
        let smallest = here
            .iter()
            .min_by_key(|(_, size)| *size)
            .map(|(n, _)| (*n).to_owned());
        let fast = listed(preset.recommended.fast)
            .or(smallest)
            .unwrap_or_else(|| main.clone());
        let vision = listed(preset.recommended.vision)
            .or_else(|| {
                models
                    .iter()
                    .filter(runs_here)
                    .find(|m| m.vision)
                    .map(|m| m.id.clone())
            })
            .or_else(|| models.iter().find(|m| m.vision).map(|m| m.id.clone()))
            .unwrap_or_else(|| main.clone());
        Ok(LiveModels {
            references: fast.clone(),
            models,
            main,
            fast,
            vision,
        })
    }
}
