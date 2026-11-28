//! What a request carries and what its stream yields.

use base64::Engine;
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use crate::LlmError;
use crate::presets::{Api, Effort};

/// A piece of a user message.
#[derive(Debug, Clone, PartialEq)]
pub enum Part {
    Text(String),
    /// A `data:` URL or a web address.
    Image {
        url: String,
    },
}

impl Part {
    /// An image from its bytes, as a `data:` URL.
    pub fn image(media_type: &str, bytes: &[u8]) -> Self {
        let data = base64::engine::general_purpose::STANDARD.encode(bytes);
        Self::Image {
            url: format!("data:{media_type};base64,{data}"),
        }
    }
}

/// A tool call the model made, its arguments assembled from the stream (`{}` when they weren't JSON).
#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

/// The provider's own reply items, sent back unchanged on the next turn of a tool loop, as both the Messages and
/// Responses APIs require for reasoning (and DeepSeek-style servers for `reasoning_content`).
#[derive(Debug, Clone, PartialEq)]
pub struct Replay {
    pub api: Api,
    pub items: Value,
}

/// An answer as the stream assembled it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AssistantMessage {
    pub text: String,
    pub tool_calls: Vec<ToolCall>,
    pub replay: Option<Replay>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Message {
    User(Vec<Part>),
    Assistant(AssistantMessage),
    Tool { call_id: String, content: String },
}

impl Message {
    pub fn user(text: impl Into<String>) -> Self {
        Self::User(vec![Part::Text(text.into())])
    }
}

/// A tool the model may call; `parameters` is its JSON schema.
#[derive(Debug, Clone, PartialEq)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

/// One model call.
#[derive(Debug, Clone)]
pub struct Request {
    pub system: String,
    pub messages: Vec<Message>,
    pub tools: Vec<Tool>,
    pub effort: Effort,
    /// The output limit; `None` leaves it to the provider (Anthropic, which needs one, gets 16000, or 32000 at
    /// Extra high and Max, since thinking counts towards it).
    pub max_tokens: Option<u32>,
    /// Only sent to servers Spectrum has no preset for (several presets reject any temperature but their own).
    pub temperature: Option<f64>,
    /// A key for a conversation a tool loop sends again at every step, which asks the provider to cache its
    /// prefix. One-off requests leave it out: a cache written and never read costs more than none.
    pub cache_key: Option<String>,
    pub cancel: CancellationToken,
}

impl Request {
    pub fn new(system: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            system: system.into(),
            messages,
            tools: Vec::new(),
            effort: Effort::Default,
            max_tokens: None,
            temperature: Some(0.2),
            cache_key: None,
            cancel: CancellationToken::new(),
        }
    }
}

/// Tokens as the provider counted them. `input` is all it read, including what the cache served (`cache_read`)
/// and stored (`cache_write`). `cost` is what the provider reports the request cost, in US dollars (`OpenRouter`).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Usage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost: Option<f64>,
}

/// Why the answer ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    EndTurn,
    ToolUse,
    /// Stopped at the output limit; a text answer is still an answer, said to be cut off.
    MaxTokens,
    /// The model declined; the message text is its explanation, and anything streamed before is to be dropped.
    Refusal,
}

/// What a stream yields. Tool calls and usage come at the end, just before `Stop`; a stream ends with one
/// `Stop` or one `Error`.
#[derive(Debug, Clone, PartialEq)]
pub enum StreamEvent {
    TextDelta(String),
    ReasoningDelta(String),
    ToolCall(ToolCall),
    Usage(Usage),
    /// The provider was busy or the connection dropped before anything arrived: waiting, then trying again.
    Retrying {
        attempt: u32,
        of: u32,
        wait_ms: u64,
    },
    Stop {
        reason: StopReason,
        message: AssistantMessage,
    },
    Error(LlmError),
}
