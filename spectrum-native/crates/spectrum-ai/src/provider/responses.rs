//! `OpenAI`'s Responses API, stateless (`store: false`) so manuscripts aren't kept on `OpenAI`'s servers. Chat
//! Completions refuses tools with any effort above none, so `OpenAI` goes through here.

use serde_json::{Map, Value, json};

use super::{BodyParts, LlmProvider, StreamParser, Turn, error_text, merge, put, usage_of};
use crate::presets::Api;
use crate::{LlmError, Message, Part, StreamEvent, ToolCall};

pub struct OpenAiResponses;

impl LlmProvider for OpenAiResponses {
    fn api(&self) -> Api {
        Api::Responses
    }

    fn url(&self, endpoint: &str) -> String {
        match endpoint.strip_suffix("/chat/completions") {
            Some(base) => format!("{base}/responses"),
            None => endpoint.to_owned(),
        }
    }

    fn headers(&self, key: &str) -> Vec<(&'static str, String)> {
        vec![("authorization", format!("Bearer {key}"))]
    }

    fn body(&self, p: BodyParts<'_>) -> Value {
        let r = p.request;
        let mut input = Vec::new();
        if !r.system.is_empty() {
            input.push(json!({ "role": "system", "content": r.system }));
        }
        for m in &r.messages {
            match m {
                Message::Tool { call_id, content } => {
                    input.push(json!({ "type": "function_call_output", "call_id": call_id, "output": content }));
                }
                Message::Assistant(a) => match &a.replay {
                    Some(replay) if replay.api == Api::Responses => {
                        input.extend(replay.items.as_array().cloned().unwrap_or_default());
                    }
                    _ => {
                        if !a.text.is_empty() {
                            input.push(json!({ "role": "assistant", "content": a.text }));
                        }
                        input.extend(a.tool_calls.iter().map(|c| {
                            json!({ "type": "function_call", "call_id": c.id, "name": c.name, "arguments": c.arguments.to_string() })
                        }));
                    }
                },
                Message::User(parts) => {
                    let content = match parts.as_slice() {
                        [Part::Text(text)] => Value::from(text.as_str()),
                        parts => parts
                            .iter()
                            .map(|part| match part {
                                Part::Text(text) => json!({ "type": "input_text", "text": text }),
                                Part::Image { url } => {
                                    json!({ "type": "input_image", "image_url": url })
                                }
                            })
                            .collect(),
                    };
                    input.push(json!({ "role": "user", "content": content }));
                }
            }
        }
        let mut body = Map::new();
        body.insert("model".into(), p.model.into());
        put(&mut body, "prompt_cache_key", p.cache.map(Value::from));
        body.insert("input".into(), Value::Array(input));
        if !r.tools.is_empty() {
            let tools = r.tools.iter().map(|t| {
                json!({ "type": "function", "name": t.name, "description": t.description, "parameters": t.parameters })
            });
            body.insert("tools".into(), tools.collect());
        }
        body.insert("store".into(), false.into());
        // reasoning items come back encrypted so the next turn of a tool loop can return them
        if p.extra.get("reasoning").is_some() {
            body.insert("include".into(), json!(["reasoning.encrypted_content"]));
        }
        put(
            &mut body,
            "max_output_tokens",
            r.max_tokens.map(Value::from),
        );
        merge(Value::Object(body), p.extra)
    }

    fn stream_fields(&self) -> Value {
        json!({ "stream": true })
    }

    fn parser(&self, reports_cost: bool) -> Box<dyn StreamParser> {
        Box::new(ResponsesParser {
            reports_cost,
            ..ResponsesParser::default()
        })
    }
}

#[derive(Default)]
struct ResponsesParser {
    reports_cost: bool,
    /// The last event carries the whole response, as a request without a stream returns it.
    response: Option<Value>,
    streamed_text: bool,
    error: Option<String>,
}

impl StreamParser for ResponsesParser {
    fn event(&mut self, event: &Value, out: &mut Vec<StreamEvent>) {
        match event["type"].as_str().unwrap_or("") {
            "response.output_text.delta" => {
                let delta = event["delta"].as_str().unwrap_or("");
                self.streamed_text |= !delta.is_empty();
                out.push(StreamEvent::TextDelta(delta.to_owned()));
            }
            "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                out.push(StreamEvent::ReasoningDelta(
                    event["delta"].as_str().unwrap_or("").to_owned(),
                ));
            }
            "response.completed" | "response.incomplete" | "response.failed" => {
                self.response = Some(event["response"].clone());
            }
            "error" => {
                let message = event["message"]
                    .as_str()
                    .map(str::to_owned)
                    .or_else(|| error_text(&event["error"]));
                self.error = Some(message.unwrap_or_else(|| "The stream failed.".into()));
            }
            _ => {}
        }
    }

    fn whole(&mut self, data: &Value, _out: &mut Vec<StreamEvent>) {
        self.response = Some(data.clone());
    }

    fn finish(self: Box<Self>, out: &mut Vec<StreamEvent>) {
        let Some(response) = self.response.filter(|r| r["output"].is_array()) else {
            let error = self
                .error
                .unwrap_or_else(|| "The model provider returned no answer.".into());
            out.push(StreamEvent::Error(LlmError::NoAnswer(error)));
            return;
        };
        let error = self.error.or_else(|| error_text(&response["error"]));
        let output = response["output"].as_array().cloned().unwrap_or_default();
        let text: String = output
            .iter()
            .filter(|item| item["type"] == "message")
            .filter_map(|item| item["content"].as_array())
            .flatten()
            .map(|part| {
                part["text"]
                    .as_str()
                    .or_else(|| part["refusal"].as_str())
                    .unwrap_or("")
            })
            .collect();
        if !self.streamed_text && !text.is_empty() && error.is_none() {
            out.push(StreamEvent::TextDelta(text.clone()));
        }
        Turn {
            text,
            tool_calls: output
                .iter()
                .filter(|item| item["type"] == "function_call")
                .map(|c| ToolCall {
                    id: c["call_id"].as_str().unwrap_or_default().to_owned(),
                    name: c["name"].as_str().unwrap_or_default().to_owned(),
                    arguments: super::parse_args(c["arguments"].as_str().unwrap_or("")),
                })
                .collect(),
            usage: usage_of(&response["usage"], self.reports_cost),
            truncated: response["status"] == "incomplete",
            refusal: None,
            replay: Some(Value::Array(output)),
            error,
        }
        .finish(Api::Responses, out);
    }
}
