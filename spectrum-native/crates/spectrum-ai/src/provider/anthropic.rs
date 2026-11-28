//! Anthropic's Messages API, the only way to set Claude's effort.

use serde_json::{Map, Value, json};

use super::{
    BodyParts, LlmProvider, StreamParser, Turn, error_text, merge, parse_args, put, usage_of,
};
use crate::presets::Api;
use crate::{Message, Part, StreamEvent, ToolCall};

pub struct AnthropicMessages;

fn cached() -> Value {
    json!({ "type": "ephemeral" })
}

impl LlmProvider for AnthropicMessages {
    fn api(&self) -> Api {
        Api::Anthropic
    }

    fn url(&self, endpoint: &str) -> String {
        if endpoint.ends_with("/messages") {
            return endpoint.to_owned();
        }
        match reqwest::Url::parse(endpoint) {
            Ok(url) => format!("{}/v1/messages", url.origin().ascii_serialization()),
            Err(_) => endpoint.to_owned(),
        }
    }

    fn headers(&self, key: &str) -> Vec<(&'static str, String)> {
        vec![
            ("x-api-key", key.to_owned()),
            ("anthropic-version", "2023-06-01".to_owned()),
        ]
    }

    fn body(&self, p: BodyParts<'_>) -> Value {
        let r = p.request;
        let mut turns: Vec<(&str, Vec<Value>)> = Vec::new();
        // empty turns are refused, so they're dropped and their neighbours merge
        let mut add = |role: &'static str, blocks: Vec<Value>| {
            if blocks.is_empty() {
                return;
            }
            match turns.last_mut() {
                Some((last, content)) if *last == role => content.extend(blocks),
                _ => turns.push((role, blocks)),
            }
        };
        for m in &r.messages {
            match m {
                Message::Tool { call_id, content } => add(
                    "user",
                    vec![
                        json!({ "type": "tool_result", "tool_use_id": call_id, "content": content }),
                    ],
                ),
                Message::Assistant(a) => match &a.replay {
                    Some(replay) if replay.api == Api::Anthropic => {
                        add(
                            "assistant",
                            replay.items.as_array().cloned().unwrap_or_default(),
                        );
                    }
                    _ => {
                        let text =
                            (!a.text.is_empty()).then(|| json!({ "type": "text", "text": a.text }));
                        let calls = a.tool_calls.iter().map(|c| {
                            json!({ "type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments })
                        });
                        add("assistant", text.into_iter().chain(calls).collect());
                    }
                },
                Message::User(parts) => add("user", parts.iter().filter_map(user_block).collect()),
            }
        }
        let mut defs: Vec<Value> = r
            .tools
            .iter()
            .map(|t| json!({ "name": t.name, "description": t.description, "input_schema": t.parameters }))
            .collect();
        if p.cache.is_some() {
            // three of the four breakpoints a request may have: the tools, the instructions after them, and the
            // conversation up to its last block, which the next step of the loop reads back and adds to
            if let Some(last) = defs.last_mut() {
                last["cache_control"] = cached();
            }
            if let Some((_, last)) = turns.last_mut()
                && let Some(block) = last
                    .iter_mut()
                    .rev()
                    .find(|b| !matches!(b["type"].as_str(), Some("thinking" | "redacted_thinking")))
            {
                block["cache_control"] = cached();
            }
        }
        let effort = p.extra["output_config"]["effort"].as_str();
        // required by the API; generous because thinking counts towards it
        let max_tokens = r
            .max_tokens
            .unwrap_or(if matches!(effort, Some("xhigh" | "max")) {
                32000
            } else {
                16000
            });
        let mut body = Map::new();
        body.insert("model".into(), p.model.into());
        body.insert("max_tokens".into(), max_tokens.into());
        if !r.system.is_empty() {
            let system = if p.cache.is_some() {
                json!([{ "type": "text", "text": r.system, "cache_control": cached() }])
            } else {
                r.system.clone().into()
            };
            body.insert("system".into(), system);
        }
        let messages = turns
            .into_iter()
            .map(|(role, content)| json!({ "role": role, "content": content }));
        body.insert("messages".into(), messages.collect());
        put(
            &mut body,
            "tools",
            (!defs.is_empty()).then_some(Value::Array(defs)),
        );
        merge(Value::Object(body), p.extra)
    }

    fn stream_fields(&self) -> Value {
        json!({ "stream": true })
    }

    fn parser(&self, _reports_cost: bool) -> Box<dyn StreamParser> {
        Box::new(AnthropicParser::default())
    }
}

fn user_block(part: &Part) -> Option<Value> {
    match part {
        Part::Text(text) if text.is_empty() => None,
        Part::Text(text) => Some(json!({ "type": "text", "text": text })),
        Part::Image { url } => {
            let data = url
                .strip_prefix("data:")
                .and_then(|rest| rest.split_once(";base64,"))
                .filter(|(media, _)| !media.is_empty() && !media.contains(','));
            Some(match data {
                Some((media_type, data)) => {
                    json!({ "type": "image", "source": { "type": "base64", "media_type": media_type, "data": data } })
                }
                None => json!({ "type": "image", "source": { "type": "url", "url": url } }),
            })
        }
    }
}

#[derive(Default)]
struct AnthropicParser {
    blocks: Vec<Value>,
    /// A tool call's input as pieces of its JSON, read when its block ends.
    json: Vec<Option<String>>,
    usage: Map<String, Value>,
    stop_reason: Option<String>,
    stop_details: Value,
    error: Option<String>,
}

fn add_str(block: &mut Value, key: &str, piece: &str) {
    let was = block[key].as_str().unwrap_or("");
    block[key] = format!("{was}{piece}").into();
}

impl StreamParser for AnthropicParser {
    #[allow(clippy::cast_possible_truncation)]
    fn event(&mut self, event: &Value, out: &mut Vec<StreamEvent>) {
        let index = event["index"].as_u64().map(|i| i as usize);
        match event["type"].as_str().unwrap_or("") {
            "error" => {
                self.error = Some(
                    error_text(&event["error"]).unwrap_or_else(|| "The stream failed.".into()),
                );
            }
            "message_start" => {
                if let Some(u) = event["message"]["usage"].as_object() {
                    self.usage.extend(u.clone());
                }
            }
            "content_block_start" => {
                if let Some(i) = index {
                    while self.blocks.len() <= i {
                        self.blocks.push(Value::Null);
                        self.json.push(None);
                    }
                    self.blocks[i] = event["content_block"].clone();
                }
            }
            "content_block_delta" => {
                let Some(i) = index.filter(|&i| self.blocks.get(i).is_some_and(Value::is_object))
                else {
                    return;
                };
                let d = &event["delta"];
                let block = &mut self.blocks[i];
                match d["type"].as_str().unwrap_or("") {
                    "text_delta" => {
                        let text = d["text"].as_str().unwrap_or("");
                        add_str(block, "text", text);
                        out.push(StreamEvent::TextDelta(text.to_owned()));
                    }
                    "input_json_delta" => {
                        let piece = d["partial_json"].as_str().unwrap_or("");
                        self.json[i].get_or_insert_with(String::new).push_str(piece);
                    }
                    "thinking_delta" => {
                        let thinking = d["thinking"].as_str().unwrap_or("");
                        add_str(block, "thinking", thinking);
                        out.push(StreamEvent::ReasoningDelta(thinking.to_owned()));
                    }
                    "signature_delta" => block["signature"] = d["signature"].clone(),
                    "citations_delta" => {
                        if !block["citations"].is_array() {
                            block["citations"] = json!([]);
                        }
                        if let Some(list) = block["citations"].as_array_mut() {
                            list.push(d["citation"].clone());
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                if let Some(i) = index
                    && let Some(json) = self.json.get_mut(i).and_then(Option::take)
                {
                    self.blocks[i]["input"] = parse_args(&json);
                }
            }
            "message_delta" => {
                if let Some(reason) = event["delta"]["stop_reason"].as_str() {
                    self.stop_reason = Some(reason.to_owned());
                }
                if !event["delta"]["stop_details"].is_null() {
                    self.stop_details = event["delta"]["stop_details"].clone();
                }
                if let Some(u) = event["usage"].as_object() {
                    self.usage.extend(
                        u.iter()
                            .filter(|(_, v)| !v.is_null())
                            .map(|(k, v)| (k.clone(), v.clone())),
                    );
                }
            }
            _ => {}
        }
    }

    fn whole(&mut self, data: &Value, out: &mut Vec<StreamEvent>) {
        if let Some(error) = error_text(&data["error"]) {
            self.error = Some(error);
        }
        self.blocks = data["content"].as_array().cloned().unwrap_or_default();
        for b in &self.blocks {
            match b["type"].as_str() {
                Some("text") => out.push(StreamEvent::TextDelta(
                    b["text"].as_str().unwrap_or("").to_owned(),
                )),
                Some("thinking") => out.push(StreamEvent::ReasoningDelta(
                    b["thinking"].as_str().unwrap_or("").to_owned(),
                )),
                _ => {}
            }
        }
        self.stop_reason = data["stop_reason"].as_str().map(str::to_owned);
        self.stop_details = data["stop_details"].clone();
        if let Some(u) = data["usage"].as_object() {
            self.usage.extend(u.clone());
        }
    }

    fn finish(self: Box<Self>, out: &mut Vec<StreamEvent>) {
        let Self {
            blocks,
            usage,
            stop_reason,
            stop_details,
            error,
            ..
        } = *self;
        let blocks: Vec<Value> = blocks.into_iter().filter(Value::is_object).collect();
        let of_type = |t: &'static str| blocks.iter().filter(move |b| b["type"] == t);
        let stop = stop_reason.as_deref();
        Turn {
            text: of_type("text").filter_map(|b| b["text"].as_str()).collect(),
            tool_calls: of_type("tool_use")
                .map(|b| ToolCall {
                    id: b["id"].as_str().unwrap_or_default().to_owned(),
                    name: b["name"].as_str().unwrap_or_default().to_owned(),
                    arguments: if b["input"].is_null() {
                        json!({})
                    } else {
                        b["input"].clone()
                    },
                })
                .collect(),
            usage: (!usage.is_empty())
                .then(|| usage_of(&Value::Object(usage), false))
                .flatten(),
            truncated: matches!(stop, Some("max_tokens" | "model_context_window_exceeded")),
            // anything cut short by a refusal is to be discarded
            refusal: (stop == Some("refusal")).then(|| {
                stop_details["explanation"]
                    .as_str()
                    .unwrap_or("Claude declined this request.")
                    .to_owned()
            }),
            replay: Some(Value::Array(blocks.clone())),
            error,
        }
        .finish(Api::Anthropic, out);
    }
}
