//! `LlmClient`: sends a request in its provider's format and streams the answer back (2.8's `chatCompletion`).
//! A busy provider (429, 500, 502, 503, 504, 529) or a connection that failed before any answer is tried again,
//! twice at most; a parameter the provider rejects (effort, temperature, a cache key, usage in a stream) is
//! dropped and the request sent again.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use eventsource_stream::Eventsource;
use futures::channel::mpsc::UnboundedSender;
use futures::stream::{BoxStream, StreamExt};
use parking_lot::Mutex;
use serde_json::{Value, json};

use crate::endpoint::{
    DEFAULT_ENDPOINT, bad_key, clean_key, host_of, missing_key, normalize_chat_endpoint,
};
use crate::error::{provider_error, spent_quota, unreachable};
use crate::presets::{self, Api, Effort, Model, Preset};
use crate::provider::{BodyParts, StreamParser, provider};
use crate::{LlmError, Request, StreamEvent};

/// The events of one call; it ends with one `Stop` or one `Error`.
pub type EventStream = BoxStream<'static, StreamEvent>;

const DEFAULT_MODEL: &str = "gpt-6-sol";
const REQUEST_TIMEOUT: Duration = Duration::from_mins(10);
const BUSY: [u16; 6] = [429, 500, 502, 503, 504, 529];
const MAX_RETRIES: u32 = 2;
/// The longest one wait; a provider that asks for longer is not waited for.
const MAX_WAIT_MS: u64 = 20_000;
const BACKOFF_MS: [u64; 2] = [1000, 3000];
/// The causes of a failed connection that trying again never mends.
const FINAL: [&str; 3] = ["refused", "certificate", "header"];
const NO_OLLAMA: &str = "Start Ollama, or install it from ollama.com.";

/// Where a call goes: the endpoint as typed, the key itself (not its keystore reference), the model, and a
/// preset id when the endpoint alone doesn't say (an Ollama on another port, a test server).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LlmConfig {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub provider: Option<String>,
}

/// A config with its defaults filled in.
pub(crate) struct Resolved {
    pub url: String,
    pub key: String,
    pub model: String,
    pub preset: Option<&'static Preset>,
}

impl LlmConfig {
    pub(crate) fn resolve(&self) -> Resolved {
        let endpoint = self.endpoint.trim();
        let url = normalize_chat_endpoint(if endpoint.is_empty() {
            DEFAULT_ENDPOINT
        } else {
            endpoint
        });
        let preset = self
            .provider
            .as_deref()
            .and_then(presets::preset)
            .or_else(|| presets::preset_for_endpoint(&url));
        // with no model named, a known provider gets its recommended one
        let model = Some(self.model.trim())
            .filter(|m| !m.is_empty())
            .or_else(|| preset.map(|p| p.recommended.main).filter(|m| !m.is_empty()))
            .unwrap_or(DEFAULT_MODEL)
            .to_owned();
        Resolved {
            url,
            key: clean_key(&self.api_key),
            model,
            preset,
        }
    }
}

/// Sends model calls. Cheap to clone; keeps Ollama's model details and the servers that refused a cache key.
#[derive(Clone, Default)]
pub struct LlmClient {
    pub(crate) http: reqwest::Client,
    /// `/api/show` answers by `base model`, kept for the session.
    pub(crate) shown: Arc<Mutex<HashMap<String, Value>>>,
    /// The servers that refused a prompt cache key, by host: asked once, not at every step of a run.
    no_cache_key: Arc<Mutex<HashSet<String>>>,
}

type Tx = UnboundedSender<StreamEvent>;

fn send(tx: &Tx, event: StreamEvent) {
    // a receiver that went away has stopped listening; nothing to do
    let _ = tx.unbounded_send(event);
}

/// How a stream that was read ended.
enum Read {
    Done,
    /// It failed before anything was heard: worth another try, else this error.
    Retry(LlmError),
}

/// How long a reply asks to be left alone, from `retry-after-ms` or `Retry-After` in seconds.
// ponytail: Retry-After as an HTTP date falls back to the usual backoff; parse it if a provider sends one
fn retry_after_ms(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    let number = |name: &str| headers.get(name)?.to_str().ok()?.trim().parse::<f64>().ok();
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let ms = |v: f64| v.max(0.0) as u64;
    number("retry-after-ms")
        .map(ms)
        .or_else(|| number("retry-after").map(|s| ms(s * 1000.0)))
}

fn about(ms: u64) -> String {
    if ms < 90_000 {
        format!("{} seconds", ms.div_ceil(1000))
    } else {
        format!("{} minutes", ms.div_ceil(60_000))
    }
}

fn tried(retries: u32) -> String {
    if retries == 0 {
        String::new()
    } else {
        format!(" Spectrum tried {} times.", retries + 1)
    }
}

fn mentions(text: &str, words: &[&str]) -> bool {
    let text = text.to_ascii_lowercase();
    words.iter().any(|w| text.contains(w))
}

impl LlmClient {
    pub fn new() -> Self {
        Self::default()
    }

    /// Streams one call. Cancelling `request.cancel` (or dropping the stream) stops it; a cancelled call ends
    /// with `Error(LlmError::Cancelled)`.
    pub fn stream(&self, config: LlmConfig, request: Request) -> EventStream {
        let (tx, rx) = futures::channel::mpsc::unbounded();
        let this = self.clone();
        let driver = async move {
            let cancel = request.cancel.clone();
            tokio::select! {
                biased;
                () = cancel.cancelled() => send(&tx, StreamEvent::Error(LlmError::Cancelled)),
                () = this.run(config, request, &tx) => {}
            }
        };
        let driver = futures::stream::once(driver).filter_map(|()| futures::future::ready(None));
        futures::stream::select(rx, driver).boxed()
    }

    #[allow(clippy::too_many_lines)]
    async fn run(&self, config: LlmConfig, request: Request, tx: &Tx) {
        let fail = |e: LlmError| send(tx, StreamEvent::Error(e));
        let Resolved {
            url,
            mut key,
            model,
            preset,
        } = config.resolve();
        if missing_key(&url, &key) {
            return fail(LlmError::NoKey);
        }
        // a server Spectrum has no preset for speaks the format its address names
        let api = preset.map_or_else(|| api_for_url(&url), |p| p.api);
        // a local Ollama takes no key, so a key typed for another server never goes there
        if preset.is_some_and(|p| p.local) {
            key.clear();
        }
        if bad_key(&key) {
            return fail(LlmError::BadKey);
        }
        let host = host_of(&url).unwrap_or_else(|| "the model provider".into());
        let local = preset.is_some_and(|p| p.local);
        // an Ollama model's effort levels come from Ollama itself
        let known = self.known_model(preset, &url, &model).await;
        let mut extra = match preset {
            Some(p) => p.effort_fields(known.as_ref(), request.effort),
            None => explicit_effort(api, request.effort),
        };
        let mut temperature = if preset.is_some() {
            None
        } else {
            request.temperature
        };
        let cache: Option<String> = request
            .cache_key
            .as_deref()
            .map(|k| k.chars().take(64).collect());
        // Chat Completions has no word for caching of its own: OpenAI's key goes to a server with no preset
        // (most are OpenAI's API behind another address) until it refuses it
        let mut cache_key = cache.clone().filter(|_| {
            preset.is_none() && api == Api::Chat && !self.no_cache_key.lock().contains(&host)
        });
        let provider = provider(api);
        let mut stream_fields = provider.stream_fields();
        let reports_cost = preset.is_some_and(|p| p.id == "openrouter");
        let mut retries = 0;
        let mut long_wait = None;
        let (status, text) = loop {
            let body = provider.body(BodyParts {
                model: &model,
                request: &request,
                extra: &extra,
                temperature,
                cache: cache.as_deref(),
                cache_key: cache_key.as_deref(),
            });
            let body = crate::provider::merge(body, &stream_fields);
            let mut req = self
                .http
                .post(provider.url(&url))
                .timeout(REQUEST_TIMEOUT)
                .json(&body);
            if !key.is_empty() {
                for (name, value) in provider.headers(&key) {
                    req = req.header(name, value);
                }
            }
            let res = match req.send().await {
                Ok(res) => res,
                Err(err) if err.is_timeout() => return fail(LlmError::Timeout { host }),
                Err(err) => {
                    // a connection a VPN or a busy network dropped usually opens on the next try
                    let (kind, message) = unreachable(&err, &host);
                    if !FINAL.contains(&kind) && retries < MAX_RETRIES {
                        self.wait(tx, &mut retries, None).await;
                        continue;
                    }
                    tracing::warn!(%host, kind, "model request got no answer: {err}");
                    if local {
                        return fail(LlmError::Ollama(format!(
                            "Couldn’t reach Ollama at {host}. {NO_OLLAMA}"
                        )));
                    }
                    return fail(LlmError::Unreachable {
                        kind,
                        message: format!("{message}{}", tried(retries)),
                    });
                }
            };
            let status = res.status().as_u16();
            let streaming = res
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.to_ascii_lowercase().contains("event-stream"));
            if res.status().is_success() && streaming {
                match read_stream(res, provider.parser(reports_cost), tx, &host).await {
                    Read::Done => return,
                    // the provider answered and the reply broke off: the address is right, so try again
                    Read::Retry(_) if retries < MAX_RETRIES => {
                        self.wait(tx, &mut retries, None).await;
                        continue;
                    }
                    Read::Retry(error) => return fail(error),
                }
            }
            let headers = res.headers().clone();
            let text = match res.text().await {
                Ok(text) => text,
                Err(_) if retries < MAX_RETRIES => {
                    self.wait(tx, &mut retries, None).await;
                    continue;
                }
                Err(_) => return fail(LlmError::Broken { host }),
            };
            if (200..300).contains(&status) {
                // a server that answers a stream request whole is read whole
                let Ok(data) = serde_json::from_str::<Value>(&text) else {
                    return fail(LlmError::Unreadable);
                };
                let mut parser = provider.parser(reports_cost);
                let mut out = Vec::new();
                parser.whole(&data, &mut out);
                parser.finish(&mut out);
                for e in out {
                    send(tx, e);
                }
                return;
            }
            if status == 400 || status == 422 {
                // a server that takes no cache key or no usage in a stream: asked without, and not again
                if cache_key.is_some()
                    && mentions(
                        &text,
                        &[
                            "prompt_cache_key",
                            "unknown",
                            "unrecognized",
                            "unrecognised",
                            "unexpected",
                            "extra",
                            "additional",
                            "not permitted",
                            "unsupported",
                        ],
                    )
                {
                    self.no_cache_key.lock().insert(host.clone());
                    cache_key = None;
                    continue;
                }
                if stream_fields.get("stream_options").is_some()
                    && mentions(&text, &["stream_options", "include_usage"])
                {
                    stream_fields = json!({ "stream": true });
                    continue;
                }
            }
            if status == 400 {
                // models without reasoning controls reject them
                if extra.as_object().is_some_and(|o| !o.is_empty())
                    && mentions(&text, &["reasoning", "thinking", "effort"])
                {
                    extra = json!({});
                    continue;
                }
                // reasoning models often only accept the default temperature
                if temperature.is_some() && mentions(&text, &["temperature"]) {
                    temperature = None;
                    continue;
                }
            }
            // a 429 that names a wait is a rate limit whatever its words; one that names quota and no wait is spent
            let asked = retry_after_ms(&headers);
            let busy = BUSY.contains(&status)
                && headers.get("x-should-retry").and_then(|v| v.to_str().ok()) != Some("false")
                && (status != 429 || asked.is_some() || !spent_quota(&text));
            if !busy || retries >= MAX_RETRIES {
                break (status, text);
            }
            if let Some(ms) = asked.filter(|&ms| ms > MAX_WAIT_MS) {
                long_wait = Some(ms);
                break (status, text);
            }
            self.wait(tx, &mut retries, asked).await;
        };
        // the local app has no key: a 401 is a :cloud model while it's signed out of ollama.com
        if local && status == 401 {
            return fail(LlmError::OllamaSignIn);
        }
        let said = match long_wait {
            Some(ms) => format!(
                "The provider is busy and asks for a wait of about {} before another request. Try again then.",
                about(ms)
            ),
            None => format!("{}{}", provider_error(status, &text), tried(retries)),
        };
        // a provider or proxy that repeats the key in its message (a short stand-in would be found in words)
        let message = if key.len() >= 8 {
            said.replace(&key, "[API key]")
        } else {
            said
        };
        fail(LlmError::Status { status, message });
    }

    /// Tells the caller, then waits the time the provider asked for or the next backoff step.
    async fn wait(&self, tx: &Tx, retries: &mut u32, asked: Option<u64>) {
        let step = usize::try_from(*retries)
            .unwrap_or(usize::MAX)
            .min(BACKOFF_MS.len() - 1);
        let wait_ms = asked.unwrap_or(BACKOFF_MS[step]);
        send(
            tx,
            StreamEvent::Retrying {
                attempt: *retries + 2,
                of: MAX_RETRIES + 1,
                wait_ms,
            },
        );
        tokio::time::sleep(Duration::from_millis(wait_ms)).await;
        *retries += 1;
    }

    /// The model as its preset lists it, or for a live preset as its server describes it.
    async fn known_model(
        &self,
        preset: Option<&'static Preset>,
        url: &str,
        model: &str,
    ) -> Option<Model> {
        let preset = preset?;
        if preset.live
            && let Some(live) = self.live_model(url, model).await
        {
            return Some(live);
        }
        preset.model(model).cloned()
    }

    /// Whether the configured model reads images, as its preset says (an Ollama model as its server says). On a
    /// server with no preset, a model with a preset model's name is taken to be that one; any other model is
    /// taken not to, since a text model refuses a request with a picture in it.
    pub async fn reads_images(&self, config: &LlmConfig) -> bool {
        let Resolved {
            url, model, preset, ..
        } = config.resolve();
        if preset.is_some_and(|p| p.live)
            && let Some(live) = self.live_model(&url, &model).await
        {
            return live.vision;
        }
        let all = presets::presets();
        let list = preset.map_or(all, std::slice::from_ref);
        list.iter()
            .filter_map(|p| p.model(&model))
            .any(|m| m.vision)
    }
}

/// An explicit level for a server with no preset, in its format's own words.
fn explicit_effort(api: Api, effort: Effort) -> Value {
    let Effort::Level(level) = effort else {
        return json!({});
    };
    match api {
        Api::Anthropic => json!({ "output_config": { "effort": level.as_str() } }),
        Api::Responses => json!({ "reasoning": { "effort": level.as_str() } }),
        Api::Chat => json!({ "reasoning_effort": level.as_str() }),
    }
}

fn api_for_url(url: &str) -> Api {
    let lower = url.to_ascii_lowercase();
    if lower.ends_with("/messages") {
        Api::Anthropic
    } else if lower.ends_with("/responses") {
        Api::Responses
    } else {
        Api::Chat
    }
}

async fn read_stream(
    res: reqwest::Response,
    mut parser: Box<dyn StreamParser>,
    tx: &Tx,
    host: &str,
) -> Read {
    let mut events = res.bytes_stream().eventsource();
    let mut out = Vec::new();
    let mut heard = false;
    while let Some(item) = events.next().await {
        let Ok(event) = item else {
            if heard {
                send(
                    tx,
                    StreamEvent::Error(LlmError::Broken {
                        host: host.to_owned(),
                    }),
                );
                return Read::Done;
            }
            return Read::Retry(LlmError::Broken {
                host: host.to_owned(),
            });
        };
        // a keep-alive or a line that isn't JSON is passed over
        if event.data.is_empty() || event.data == "[DONE]" {
            continue;
        }
        let Ok(data) = serde_json::from_str::<Value>(&event.data) else {
            continue;
        };
        parser.event(&data, &mut out);
        heard |= !out.is_empty();
        out.drain(..).for_each(|e| send(tx, e));
    }
    parser.finish(&mut out);
    // a failure said inside the stream before anything was heard (Anthropic's overloaded_error): try again
    if !heard && let [StreamEvent::Error(error @ LlmError::Provider(_))] = out.as_slice() {
        return Read::Retry(error.clone());
    }
    for e in out {
        send(tx, e);
    }
    Read::Done
}
