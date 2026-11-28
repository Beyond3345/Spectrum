//! OpenAI-compatible Chat Completions: Gemini, `OpenRouter`, `DeepSeek`, Kimi, GLM, Qwen, Meta, Ollama and any
//! server Spectrum has no preset for.

use serde_json::{Map, Value, json};

use super::{
    BodyParts, LlmProvider, StreamParser, Turn, error_text, merge, parse_args, put, usage_of,
};
use crate::presets::Api;
use crate::{LlmError, Message, Part, StreamEvent, ToolCall};

pub struct ChatCompletions;

impl LlmProvider for ChatCompletions {
    fn api(&self) -> Api {
        Api::Chat
    }

    fn url(&self, endpoint: &str) -> String {
        endpoint.to_owned()
    }

    fn headers(&self, key: &str) -> Vec<(&'static str, String)> {
        vec![("authorization", format!("Bearer {key}"))]
    }

    fn body(&self, p: BodyParts<'_>) -> Value {
        let r = p.request;
        let mut messages = Vec::new();
        if !r.system.is_empty() {
            messages.push(json!({ "role": "system", "content": r.system }));
        }
        messages.extend(r.messages.iter().map(message));
        let mut body = Map::new();
        body.insert("model".into(), p.model.into());
        body.insert("messages".into(), Value::Array(messages));
        put(&mut body, "temperature", p.temperature.map(Value::from));
        if !r.tools.is_empty() {
            let tools = r.tools.iter().map(|t| {
                json!({ "type": "function", "function": { "name": t.name, "description": t.description, "parameters": t.parameters } })
            });
            body.insert("tools".into(), tools.collect());
        }
        put(&mut body, "prompt_cache_key", p.cache_key.map(Value::from));
        put(&mut body, "max_tokens", r.max_tokens.map(Value::from));
        merge(Value::Object(body), p.extra)
    }

    fn stream_fields(&self) -> Value {
        json!({ "stream": true, "stream_options": { "include_usage": true } })
    }

    fn parser(&self, reports_cost: bool) -> Box<dyn StreamParser> {
        Box::new(ChatParser {
            reports_cost,
            ..ChatParser::default()
        })
    }
}

fn message(m: &Message) -> Value {
    match m {
        Message::User(parts) => match parts.as_slice() {
            [Part::Text(text)] => json!({ "role": "user", "content": text }),
            parts => {
                let content: Vec<Value> = parts
                    .iter()
                    .map(|part| match part {
                        Part::Text(text) => json!({ "type": "text", "text": text }),
                        Part::Image { url } => {
                            json!({ "type": "image_url", "image_url": { "url": url } })
                        }
                    })
                    .collect();
                json!({ "role": "user", "content": content })
            }
        },
        Message::Assistant(a) => match &a.replay {
            // the merged reply as it came, so DeepSeek-style servers get their reasoning_content back
            Some(replay) if replay.api == Api::Chat => replay.items.clone(),
            _ => {
                let mut out = json!({ "role": "assistant", "content": if a.text.is_empty() && !a.tool_calls.is_empty() { Value::Null } else { a.text.clone().into() } });
                if !a.tool_calls.is_empty() {
                    out["tool_calls"] = a
                        .tool_calls
                        .iter()
                        .map(|c| json!({ "id": c.id, "type": "function", "function": { "name": c.name, "arguments": c.arguments.to_string() } }))
                        .collect();
                }
                out
            }
        },
        Message::Tool { call_id, content } => {
            json!({ "role": "tool", "tool_call_id": call_id, "content": content })
        }
    }
}

/// What a streamed piece repeats whole rather than continues.
const WHOLE: [&str; 5] = ["id", "type", "name", "role", "index"];

/// A delta added to the message so far (2.8's `mergeDelta`): text and arguments continue, a list's items join by
/// index; a server that numbers nothing sends each tool call whole, or continues the last one.
fn merge_delta(target: &mut Map<String, Value>, delta: &Value) {
    let Some(delta) = delta.as_object() else {
        return;
    };
    for (key, value) in delta {
        match value {
            Value::Null => {}
            Value::String(s) if WHOLE.contains(&key.as_str()) => {
                if !s.is_empty() {
                    target.insert(key.clone(), value.clone());
                }
            }
            Value::String(s) => {
                let was = target.get(key).and_then(Value::as_str).unwrap_or("");
                let joined = format!("{was}{s}");
                target.insert(key.clone(), joined.into());
            }
            Value::Array(items) => {
                let list = target.entry(key.clone()).or_insert_with(|| json!([]));
                if !list.is_array() {
                    *list = json!([]);
                }
                let Some(list) = list.as_array_mut() else {
                    continue;
                };
                for item in items {
                    let Some(fields) = item.as_object() else {
                        list.push(item.clone());
                        continue;
                    };
                    let id = item["id"].as_str().filter(|s| !s.is_empty());
                    let known =
                        id.and_then(|id| list.iter().position(|x| x["id"].as_str() == Some(id)));
                    #[allow(clippy::cast_possible_truncation)]
                    let at = match (item["index"].as_u64(), known) {
                        (Some(i), _) => i as usize,
                        (None, Some(k)) => k,
                        (None, None) if id.is_some() => list.len(),
                        (None, None) => list.len().saturating_sub(1),
                    };
                    while list.len() <= at {
                        list.push(json!({}));
                    }
                    let mut rest = fields.clone();
                    rest.remove("index");
                    if !list[at].is_object() {
                        list[at] = json!({});
                    }
                    if let Some(slot) = list[at].as_object_mut() {
                        merge_delta(slot, &Value::Object(rest));
                    }
                }
            }
            Value::Object(_) => {
                let slot = target.entry(key.clone()).or_insert_with(|| json!({}));
                if !slot.is_object() {
                    *slot = json!({});
                }
                if let Some(slot) = slot.as_object_mut() {
                    merge_delta(slot, value);
                }
            }
            other => {
                target.insert(key.clone(), other.clone());
            }
        }
    }
}

/// Open and local reasoning models put their thinking at the start of the answer, in `<think>` tags: it goes out
/// as reasoning, and the answer after it as text.
#[derive(Debug)]
enum Think {
    Lead(String),
    Inside(String),
    After { started: bool },
    Plain,
}

impl Default for Think {
    fn default() -> Self {
        Self::Lead(String::new())
    }
}

const OPEN: &str = "<think>";
const CLOSE: &str = "</think>";

impl Think {
    /// (reasoning, text) for the next piece of content.
    fn push(&mut self, piece: &str, reasoning: &mut String, text: &mut String) {
        match self {
            Self::Lead(buf) => {
                buf.push_str(piece);
                let lead = buf.trim_start();
                if lead.len() < OPEN.len() && OPEN.starts_with(lead) {
                    return;
                }
                if let Some(rest) = lead.strip_prefix(OPEN) {
                    let rest = rest.to_owned();
                    *self = Self::Inside(String::new());
                    self.push(&rest, reasoning, text);
                } else {
                    text.push_str(buf);
                    *self = Self::Plain;
                }
            }
            Self::Inside(pending) => {
                let s = format!("{pending}{piece}");
                if let Some(end) = s.find(CLOSE) {
                    reasoning.push_str(&s[..end]);
                    *self = Self::After { started: false };
                    self.push(&s[end + CLOSE.len()..], reasoning, text);
                } else {
                    // hold back what may be the start of </think>
                    let keep = (1..CLOSE.len())
                        .rev()
                        .find(|&n| {
                            s.len() >= n
                                && s.is_char_boundary(s.len() - n)
                                && CLOSE.starts_with(&s[s.len() - n..])
                        })
                        .unwrap_or(0);
                    reasoning.push_str(&s[..s.len() - keep]);
                    s[s.len() - keep..].clone_into(pending);
                }
            }
            Self::After { started } => {
                let p = if *started { piece } else { piece.trim_start() };
                if !p.is_empty() {
                    *started = true;
                    text.push_str(p);
                }
            }
            Self::Plain => text.push_str(piece),
        }
    }

    fn finish(self, reasoning: &mut String, text: &mut String) {
        match self {
            Self::Lead(buf) => text.push_str(&buf),
            Self::Inside(pending) => reasoning.push_str(&pending),
            Self::After { .. } | Self::Plain => {}
        }
    }
}

#[derive(Default)]
struct ChatParser {
    reports_cost: bool,
    message: Map<String, Value>,
    think: Think,
    visible: String,
    finish_reason: Option<String>,
    usage: Option<Value>,
    error: Option<String>,
    no_answer: bool,
}

fn emit(reasoning: String, text: String, out: &mut Vec<StreamEvent>) {
    if !reasoning.is_empty() {
        out.push(StreamEvent::ReasoningDelta(reasoning));
    }
    if !text.is_empty() {
        out.push(StreamEvent::TextDelta(text));
    }
}

impl StreamParser for ChatParser {
    fn event(&mut self, data: &Value, out: &mut Vec<StreamEvent>) {
        if let Some(error) = error_text(&data["error"]) {
            self.error = Some(error);
        }
        if data["usage"].is_object() {
            self.usage = Some(data["usage"].clone());
        }
        let choice = &data["choices"][0];
        if !choice.is_object() {
            return;
        }
        if let Some(reason) = choice["finish_reason"].as_str() {
            self.finish_reason = Some(reason.to_owned());
        }
        let delta = &choice["delta"];
        // DeepSeek, Kimi, GLM and Qwen say reasoning_content; OpenRouter and Ollama say reasoning
        let mut reasoning: String = ["reasoning_content", "reasoning"]
            .iter()
            .filter_map(|k| delta[*k].as_str())
            .collect();
        let mut text = String::new();
        if let Some(content) = delta["content"].as_str() {
            self.think.push(content, &mut reasoning, &mut text);
        }
        self.visible.push_str(&text);
        emit(reasoning, text, out);
        merge_delta(&mut self.message, delta);
    }

    fn whole(&mut self, data: &Value, out: &mut Vec<StreamEvent>) {
        let choice = &data["choices"][0];
        if !choice["message"].is_object() {
            // OpenRouter reports a failure after the provider accepted the request as a 200 with an error body
            let error = error_text(&data["error"])
                .unwrap_or_else(|| "The model provider returned no answer.".into());
            out.push(StreamEvent::Error(LlmError::NoAnswer(error)));
            self.no_answer = true;
            return;
        }
        let event = json!({ "choices": [{ "delta": choice["message"], "finish_reason": choice["finish_reason"] }], "usage": data["usage"] });
        self.event(&event, out);
    }

    fn finish(mut self: Box<Self>, out: &mut Vec<StreamEvent>) {
        if self.no_answer {
            return;
        }
        let (mut reasoning, mut text) = (String::new(), String::new());
        std::mem::take(&mut self.think).finish(&mut reasoning, &mut text);
        self.visible.push_str(&text);
        emit(reasoning, text, out);
        // a refusal comes with no content and its reason beside it
        let mut text = self.visible;
        if text.is_empty()
            && let Some(refusal) = self.message.get("refusal").and_then(Value::as_str)
        {
            refusal.clone_into(&mut text);
        }
        let tool_calls = self
            .message
            .get("tool_calls")
            .and_then(Value::as_array)
            .map_or_else(Vec::new, |calls| {
                calls
                    .iter()
                    .filter_map(|c| {
                        let name = c["function"]["name"].as_str().filter(|n| !n.is_empty())?;
                        Some(ToolCall {
                            id: c["id"].as_str().unwrap_or_default().to_owned(),
                            name: name.to_owned(),
                            arguments: parse_args(
                                c["function"]["arguments"].as_str().unwrap_or(""),
                            ),
                        })
                    })
                    .collect()
            });
        let mut replay = self.message;
        replay.insert("role".into(), "assistant".into());
        replay.insert("content".into(), text.clone().into());
        Turn {
            text,
            tool_calls,
            usage: self
                .usage
                .as_ref()
                .and_then(|u| usage_of(u, self.reports_cost)),
            truncated: self.finish_reason.as_deref() == Some("length"),
            refusal: None,
            replay: Some(Value::Object(replay)),
            error: self.error,
        }
        .finish(Api::Chat, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn split(pieces: &[&str]) -> (String, String) {
        let (mut reasoning, mut text) = (String::new(), String::new());
        let mut think = Think::default();
        for p in pieces {
            think.push(p, &mut reasoning, &mut text);
        }
        think.finish(&mut reasoning, &mut text);
        (reasoning, text)
    }

    #[test]
    fn think_tags_become_reasoning() {
        assert_eq!(
            split(&["  <thi", "nk>plan", " it</th", "ink>\n\n", "Answer"]),
            ("plan it".into(), "Answer".into())
        );
        assert_eq!(
            split(&["<think>a < b</think>x"]),
            ("a < b".into(), "x".into())
        );
        assert_eq!(
            split(&["Hello ", "<think>"]),
            (String::new(), "Hello <think>".into())
        );
        assert_eq!(split(&["<t"]), (String::new(), "<t".into()));
        assert_eq!(
            split(&["<think>never closed </thi"]),
            ("never closed </thi".into(), String::new())
        );
    }

    #[test]
    fn tool_calls_join_by_index_or_id() {
        let mut m = Map::new();
        merge_delta(
            &mut m,
            &json!({ "role": "assistant", "tool_calls": [{ "index": 0, "id": "a", "function": { "name": "read", "arguments": "{\"pa" } }] }),
        );
        merge_delta(
            &mut m,
            &json!({ "tool_calls": [{ "index": 0, "function": { "arguments": "th\":1}" } }] }),
        );
        // Gemini: whole calls with ids and no index
        merge_delta(
            &mut m,
            &json!({ "tool_calls": [{ "id": "b", "function": { "name": "list", "arguments": "{}" } }] }),
        );
        merge_delta(&mut m, &json!({ "role": "", "content": null }));
        assert_eq!(m["tool_calls"][0]["function"]["arguments"], "{\"path\":1}");
        assert_eq!(m["tool_calls"][1]["id"], "b");
        assert_eq!(m["role"], "assistant");
    }
}
