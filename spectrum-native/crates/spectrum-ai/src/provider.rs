//! `LlmProvider`: one implementation per request format (2.8's `ADAPTERS`). Each turns a [`Request`] into its
//! own body and its own stream back into [`StreamEvent`]s. [`crate::LlmClient`] does the sending.

mod anthropic;
mod chat;
mod responses;

use serde_json::{Map, Value, json};

pub use anthropic::AnthropicMessages;
pub use chat::ChatCompletions;
pub use responses::OpenAiResponses;

use crate::presets::Api;
use crate::{
    AssistantMessage, LlmError, Replay, Request, StopReason, StreamEvent, ToolCall, Usage,
};

/// What a body is built from, after the client has resolved the model and its effort.
#[derive(Debug, Clone, Copy)]
pub struct BodyParts<'a> {
    pub model: &'a str,
    pub request: &'a Request,
    /// The effort fields (`{}` when nothing is sent).
    pub extra: &'a Value,
    /// Sent only to servers with no preset.
    pub temperature: Option<f64>,
    /// Asks the Messages and Responses APIs to cache the conversation's prefix.
    pub cache: Option<&'a str>,
    /// Chat Completions' `prompt_cache_key` (servers with no preset, until one refuses it).
    pub cache_key: Option<&'a str>,
}

/// A request format: OpenAI-compatible Chat Completions, Anthropic's Messages API or `OpenAI`'s Responses API.
pub trait LlmProvider: Send + Sync {
    fn api(&self) -> Api;
    /// The request address for a normalised Chat Completions endpoint.
    fn url(&self, endpoint: &str) -> String;
    /// The key's headers.
    fn headers(&self, key: &str) -> Vec<(&'static str, String)>;
    /// The JSON body, without the stream fields.
    fn body(&self, parts: BodyParts<'_>) -> Value;
    /// The fields that ask for a stream.
    fn stream_fields(&self) -> Value;
    /// A parser for one reply. `reports_cost`: the provider puts the request's cost in its usage (`OpenRouter`).
    fn parser(&self, reports_cost: bool) -> Box<dyn StreamParser>;
}

/// Turns one reply's stream into events.
pub trait StreamParser: Send {
    /// One server-sent event's data, parsed.
    fn event(&mut self, data: &Value, out: &mut Vec<StreamEvent>);
    /// A reply that came whole: a server that answered a stream request without a stream.
    fn whole(&mut self, data: &Value, out: &mut Vec<StreamEvent>);
    /// The stream ended: the tool calls, usage and stop, or the error.
    fn finish(self: Box<Self>, out: &mut Vec<StreamEvent>);
}

/// The provider for a request format.
pub fn provider(api: Api) -> &'static dyn LlmProvider {
    match api {
        Api::Chat => &ChatCompletions,
        Api::Anthropic => &AnthropicMessages,
        Api::Responses => &OpenAiResponses,
    }
}

/// What every format's parser gathers, and how a reply ends.
#[derive(Debug, Default)]
struct Turn {
    text: String,
    tool_calls: Vec<ToolCall>,
    usage: Option<Usage>,
    truncated: bool,
    refusal: Option<String>,
    replay: Option<Value>,
    error: Option<String>,
}

impl Turn {
    fn finish(self, api: Api, out: &mut Vec<StreamEvent>) {
        if let Some(error) = self.error {
            let error = error.trim().trim_end_matches('.').to_owned();
            out.push(StreamEvent::Error(LlmError::Provider(error)));
            return;
        }
        if let Some(text) = self.refusal {
            out.push(StreamEvent::Stop {
                reason: StopReason::Refusal,
                message: AssistantMessage {
                    text,
                    ..AssistantMessage::default()
                },
            });
            return;
        }
        // a tool call cut off part-way has half its arguments, so it must never run
        if self.truncated && (!self.tool_calls.is_empty() || self.text.is_empty()) {
            out.push(StreamEvent::Error(LlmError::CutOff));
            return;
        }
        out.extend(self.tool_calls.iter().cloned().map(StreamEvent::ToolCall));
        out.extend(self.usage.map(StreamEvent::Usage));
        let reason = if self.truncated {
            StopReason::MaxTokens
        } else if self.tool_calls.is_empty() {
            StopReason::EndTurn
        } else {
            StopReason::ToolUse
        };
        out.push(StreamEvent::Stop {
            reason,
            message: AssistantMessage {
                text: self.text,
                tool_calls: self.tool_calls,
                replay: self.replay.map(|items| Replay { api, items }),
            },
        });
    }
}

/// Tool call arguments as JSON; `{}` when they aren't (2.8's `parseArgs`).
fn parse_args(args: &str) -> Value {
    let args = if args.trim().is_empty() { "{}" } else { args };
    serde_json::from_str(args).unwrap_or_else(|_| json!({}))
}

/// `a` with `b`'s fields on top (both objects; anything else in `b` is ignored).
pub(crate) fn merge(mut a: Value, b: &Value) -> Value {
    if let (Some(a), Some(b)) = (a.as_object_mut(), b.as_object()) {
        a.extend(b.clone());
    }
    a
}

fn put(body: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        body.insert(key.to_owned(), value);
    }
}

/// An error a stream reports, as text: `{ message }` or a plain string.
fn error_text(error: &Value) -> Option<String> {
    match error {
        Value::Null | Value::Bool(false) => None,
        Value::String(s) => Some(s.clone()),
        other => Some(
            other["message"]
                .as_str()
                .unwrap_or("The stream failed.")
                .to_owned(),
        ),
    }
}

/// Tokens as the provider counted them (2.8's `usageOf`): the Messages API counts what the cache served and
/// stored apart from the rest, the others inside their total.
fn usage_of(u: &Value, reports_cost: bool) -> Option<Usage> {
    if !u.is_object() {
        return None;
    }
    let n = |v: &Value| v.as_f64().filter(|x| x.is_finite() && *x >= 0.0);
    // whole token counts; a fraction or a huge float isn't a count
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let int = |v: &Value| n(v).map(|x| x as u64);
    let cost = if reports_cost {
        n(&u["cost"]).map(|c| c + n(&u["cost_details"]["upstream_inference_cost"]).unwrap_or(0.0))
    } else {
        None
    };
    let cache_read = int(&u["cache_read_input_tokens"])
        .or_else(|| int(&u["prompt_tokens_details"]["cached_tokens"]))
        .or_else(|| int(&u["input_tokens_details"]["cached_tokens"]))
        .or_else(|| int(&u["prompt_cache_hit_tokens"]))
        .unwrap_or(0);
    let cache_write = int(&u["cache_creation_input_tokens"]).unwrap_or(0);
    let input = int(&u["prompt_tokens"]).unwrap_or_else(|| {
        int(&u["input_tokens"]).unwrap_or(0)
            + int(&u["cache_read_input_tokens"]).unwrap_or(0)
            + cache_write
    });
    let output = int(&u["completion_tokens"])
        .or_else(|| int(&u["output_tokens"]))
        .unwrap_or(0);
    Some(Usage {
        input,
        output,
        cache_read,
        cache_write,
        cost,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_counts_as_each_api_does() {
        let anthropic = json!({ "input_tokens": 10, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 5, "output_tokens": 7 });
        assert_eq!(
            usage_of(&anthropic, false),
            Some(Usage {
                input: 115,
                output: 7,
                cache_read: 100,
                cache_write: 5,
                cost: None
            })
        );
        let openrouter = json!({ "prompt_tokens": 50, "completion_tokens": 9, "prompt_tokens_details": { "cached_tokens": 20 },
            "cost": 0.5, "cost_details": { "upstream_inference_cost": 0.25 } });
        assert_eq!(
            usage_of(&openrouter, true),
            Some(Usage {
                input: 50,
                output: 9,
                cache_read: 20,
                cache_write: 0,
                cost: Some(0.75)
            })
        );
        assert_eq!(usage_of(&openrouter, false).and_then(|u| u.cost), None);
        let deepseek =
            json!({ "prompt_tokens": 30, "completion_tokens": 3, "prompt_cache_hit_tokens": 12 });
        assert_eq!(usage_of(&deepseek, false).map(|u| u.cache_read), Some(12));
        assert_eq!(usage_of(&Value::Null, false), None);
    }

    #[test]
    fn arguments_that_are_not_json_become_an_empty_object() {
        assert_eq!(
            parse_args(r#"{"path":"a.tex"}"#),
            json!({ "path": "a.tex" })
        );
        assert_eq!(parse_args(r#"{"path":"a.te"#), json!({}));
        assert_eq!(parse_args(""), json!({}));
    }
}
