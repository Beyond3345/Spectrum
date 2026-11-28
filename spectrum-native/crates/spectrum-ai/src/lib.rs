//! LLM providers, assistant edits, agent loop, MCP and ACP.
//!
//! So far: the streaming model client. [`LlmClient::stream`] sends a [`Request`] to the provider an
//! [`LlmConfig`] names (see [`role_config`] for the four model roles) and yields [`StreamEvent`]s. Run it on
//! Tokio (from GPUI, through `spectrum_app::runtime::spawn_tokio`).

mod client;
mod endpoint;
mod error;
mod ollama;
mod presets;
mod prices;
mod provider;
mod roles;
mod types;

pub use client::{EventStream, LlmClient, LlmConfig};
pub use endpoint::normalize_chat_endpoint;
pub use error::LlmError;
pub use ollama::LiveModels;
pub use presets::{
    Api, Effort, EffortLevel, Model, Preset, Recommended, Region, effort_for, ollama_model, preset,
    preset_for_endpoint, presets,
};
pub use prices::{Price, PriceCache, PriceList, is_local_model, normalize_model_id, prices_of};
pub use provider::{
    AnthropicMessages, BodyParts, ChatCompletions, LlmProvider, OpenAiResponses, StreamParser,
    provider,
};
pub use roles::{ModelRole, role_config, role_config_refs};
pub use tokio_util::sync::CancellationToken;
pub use types::{
    AssistantMessage, Message, Part, Replay, Request, StopReason, StreamEvent, Tool, ToolCall,
    Usage,
};
