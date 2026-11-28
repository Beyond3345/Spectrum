//! Each provider's stream, from hand-written fixtures in its documented format, served by a local server.

#[path = "support/server.rs"]
mod server;

use std::time::Duration;

use futures::StreamExt;
use serde_json::json;
use server::{Reply, Server, collect, fixture, ok_json, sse};
use spectrum_ai::{
    Api, LlmClient, LlmConfig, LlmError, Message, Request, StopReason, StreamEvent, ToolCall, Usage,
};

fn config(server: &Server, path: &str, provider: Option<&str>, model: &str) -> LlmConfig {
    LlmConfig {
        endpoint: server.url(path),
        api_key: "sk-test-1234567890".into(),
        model: model.into(),
        provider: provider.map(str::to_owned),
    }
}

fn request() -> Request {
    Request::new("You edit LaTeX.", vec![Message::user("Fix it.")])
}

fn text(events: &[StreamEvent]) -> String {
    events
        .iter()
        .filter_map(|e| match e {
            StreamEvent::TextDelta(t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}

fn reasoning(events: &[StreamEvent]) -> String {
    events
        .iter()
        .filter_map(|e| match e {
            StreamEvent::ReasoningDelta(t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}

fn calls(events: &[StreamEvent]) -> Vec<ToolCall> {
    events
        .iter()
        .filter_map(|e| match e {
            StreamEvent::ToolCall(c) => Some(c.clone()),
            _ => None,
        })
        .collect()
}

fn usage(events: &[StreamEvent]) -> Option<Usage> {
    events.iter().find_map(|e| match e {
        StreamEvent::Usage(u) => Some(*u),
        _ => None,
    })
}

/// The error a stream ended with, as the user reads it.
fn error_said(events: &[StreamEvent]) -> String {
    match events.last() {
        Some(StreamEvent::Error(e)) => e.to_string(),
        other => panic!("no error: {other:?}"),
    }
}

async fn run(config: LlmConfig) -> Vec<StreamEvent> {
    collect(LlmClient::new().stream(config, request())).await
}

#[tokio::test]
async fn openai_responses_stream_reasoning_text_and_a_tool_call() {
    let s = Server::start().await;
    s.route("/v1/responses", vec![sse("openai_responses_tool.sse")]);
    let events = run(config(
        &s,
        "/v1/chat/completions",
        Some("openai"),
        "gpt-6-sol",
    ))
    .await;
    assert_eq!(reasoning(&events), "Checking the preamble first.");
    assert_eq!(text(&events), "I'll open main.tex.");
    assert_eq!(
        calls(&events),
        [ToolCall {
            id: "call_abc".into(),
            name: "read_file".into(),
            arguments: json!({ "path": "main.tex" })
        }]
    );
    assert_eq!(
        usage(&events),
        Some(Usage {
            input: 1200,
            output: 85,
            cache_read: 1024,
            cache_write: 0,
            cost: None
        })
    );
    let Some(StreamEvent::Stop { reason, message }) = events.last() else {
        panic!("{events:?}")
    };
    assert_eq!(*reason, StopReason::ToolUse);
    // the encrypted reasoning comes back for the next turn
    let replay = message.replay.as_ref().expect("replay");
    assert_eq!(replay.api, Api::Responses);
    assert_eq!(replay.items[0]["encrypted_content"], "gAAAAB-opaque");
}

#[tokio::test]
async fn anthropic_stream_thinking_with_signature_and_tool_input_from_pieces() {
    let s = Server::start().await;
    s.route("/v1/messages", vec![sse("anthropic_thinking_tool.sse")]);
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(reasoning(&events), "The user wants the figure moved.");
    assert_eq!(text(&events), "Moving the figure.");
    assert_eq!(
        calls(&events)[0].arguments,
        json!({ "path": "sections/intro.tex", "line": 42 })
    );
    assert_eq!(calls(&events)[0].id, "toolu_01");
    assert_eq!(
        usage(&events),
        Some(Usage {
            input: 2025,
            output: 120,
            cache_read: 2000,
            cache_write: 0,
            cost: None
        })
    );
    let Some(StreamEvent::Stop {
        reason: StopReason::ToolUse,
        message,
    }) = events.last()
    else {
        panic!("{events:?}")
    };
    let blocks = &message.replay.as_ref().expect("replay").items;
    assert_eq!(blocks[0]["signature"], "EqQBCgIYAhIM-sig");
    assert_eq!(blocks[2]["input"]["line"], 42);
}

#[tokio::test]
async fn an_error_part_way_through_ends_the_stream_with_it() {
    let s = Server::start().await;
    s.route("/v1/messages", vec![sse("anthropic_error_midstream.sse")]);
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-sonnet-5-5",
    ))
    .await;
    assert_eq!(text(&events), "Partial");
    assert_eq!(
        events.last(),
        Some(&StreamEvent::Error(LlmError::Provider("Overloaded".into())))
    );
    assert_eq!(
        error_said(&events),
        "The model provider reported an error part-way through the answer: Overloaded."
    );
}

#[tokio::test]
async fn an_error_before_anything_was_heard_is_tried_again() {
    let s = Server::start().await;
    s.route(
        "/v1/messages",
        vec![
            sse("anthropic_overloaded_first.sse"),
            sse("anthropic_text.sse"),
        ],
    );
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert!(
        matches!(
            events[0],
            StreamEvent::Retrying {
                attempt: 2,
                of: 3,
                wait_ms: 1000
            }
        ),
        "{events:?}"
    );
    assert_eq!(text(&events), "Done.");
    assert_eq!(s.count("/v1/messages"), 2);
}

#[tokio::test]
async fn deepseek_reasoning_content_and_tool_calls_by_index() {
    let s = Server::start().await;
    s.route(
        "/chat/completions",
        vec![sse("deepseek_reasoning_tool.sse")],
    );
    let events = run(config(
        &s,
        "/chat/completions",
        Some("deepseek"),
        "deepseek-flash",
    ))
    .await;
    assert_eq!(reasoning(&events), "Need the bib file.");
    assert_eq!(text(&events), "Looking it up.");
    let calls = calls(&events);
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].arguments, json!({ "query": "Knuth 1984" }));
    assert_eq!(
        (calls[1].id.as_str(), calls[1].name.as_str()),
        ("call_1_y", "list_files")
    );
    assert_eq!(
        usage(&events).map(|u| (u.input, u.cache_read)),
        Some((900, 768))
    );
    let Some(StreamEvent::Stop { message, .. }) = events.last() else {
        panic!()
    };
    // DeepSeek wants its reasoning_content back within the turn
    assert_eq!(
        message.replay.as_ref().expect("replay").items["reasoning_content"],
        "Need the bib file."
    );
}

#[tokio::test]
async fn gemini_whole_tool_calls_without_an_index() {
    let s = Server::start().await;
    s.route(
        "/v1beta/openai/chat/completions",
        vec![sse("gemini_tools.sse")],
    );
    let events = run(config(
        &s,
        "/v1beta/openai",
        Some("gemini"),
        "gemini-3.8-flash",
    ))
    .await;
    let calls = calls(&events);
    assert_eq!(
        calls.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
        ["read_file", "grep"]
    );
    assert_eq!(calls[1].arguments, json!({ "pattern": "\\cite" }));
    assert!(matches!(
        events.last(),
        Some(StreamEvent::Stop {
            reason: StopReason::ToolUse,
            ..
        })
    ));
}

#[tokio::test]
async fn openrouter_reasoning_comments_and_reported_cost() {
    let s = Server::start().await;
    s.route(
        "/api/v1/chat/completions",
        vec![sse("openrouter_reasoning.sse")],
    );
    let events = run(config(
        &s,
        "/api/v1",
        Some("openrouter"),
        "anthropic/claude-sonnet-5.5",
    ))
    .await;
    assert_eq!(reasoning(&events), "Short plan.");
    assert_eq!(text(&events), "Hello there.");
    assert_eq!(usage(&events).and_then(|u| u.cost), Some(0.000_306));
}

#[tokio::test]
async fn ollama_think_tags_become_reasoning_and_no_key_is_sent() {
    let s = Server::start().await;
    s.route(
        "/api/show",
        vec![ok_json(&json!({ "capabilities": ["completion"] }))],
    );
    s.route("/v1/chat/completions", vec![sse("ollama_think.sse")]);
    let events = run(config(&s, "", Some("ollama"), "qwen3:8b")).await;
    assert_eq!(reasoning(&events), "\nAlign the equations.\n");
    assert_eq!(text(&events), "Use align*.");
    assert!(!s.last().headers.contains_key("authorization"));
}

#[tokio::test]
async fn a_tool_call_cut_off_at_the_limit_never_runs() {
    let s = Server::start().await;
    s.route(
        "/compatible-mode/v1/chat/completions",
        vec![sse("qwen_cut_off.sse")],
    );
    let events = run(config(
        &s,
        "/compatible-mode/v1",
        Some("qwen"),
        "qwen3.8-max",
    ))
    .await;
    assert_eq!(calls(&events), []);
    assert_eq!(events.last(), Some(&StreamEvent::Error(LlmError::CutOff)));
}

#[tokio::test]
async fn cancelling_stops_a_stream_that_hangs() {
    let s = Server::start().await;
    let first = fixture("anthropic_text.sse")
        .split("event: content_block_stop")
        .next()
        .unwrap_or("")
        .to_owned();
    s.route("/v1/messages", vec![Reply::SseThenHang(first)]);
    let req = request();
    let cancel = req.cancel.clone();
    let mut stream = LlmClient::new().stream(
        config(&s, "/v1/messages", Some("anthropic"), "claude-opus-5-5"),
        req,
    );
    let wait = Duration::from_secs(5);
    let first = tokio::time::timeout(wait, stream.next())
        .await
        .expect("first event");
    assert_eq!(first, Some(StreamEvent::TextDelta("Done.".into())));
    cancel.cancel();
    let rest: Vec<_> = tokio::time::timeout(wait, stream.collect())
        .await
        .expect("ends after cancel");
    assert_eq!(rest, [StreamEvent::Error(LlmError::Cancelled)]);
}

#[tokio::test]
async fn a_connection_lost_part_way_says_so() {
    let s = Server::start().await;
    let first = fixture("anthropic_text.sse")
        .split("event: content_block_stop")
        .next()
        .unwrap_or("")
        .to_owned();
    s.route("/v1/messages", vec![Reply::SseThenDrop(first)]);
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(text(&events), "Done.");
    assert!(
        matches!(
            events.last(),
            Some(StreamEvent::Error(LlmError::Broken { .. }))
        ),
        "{events:?}"
    );
}

#[tokio::test]
async fn a_reply_that_comes_whole_is_read_whole() {
    let s = Server::start().await;
    let whole = json!({ "choices": [{ "message": { "role": "assistant", "content": "All fixed." }, "finish_reason": "stop" }],
        "usage": { "prompt_tokens": 5, "completion_tokens": 2 } });
    s.route("/v1/chat/completions", vec![ok_json(&whole)]);
    let events = run(config(&s, "/v1", None, "local-model")).await;
    assert_eq!(text(&events), "All fixed.");
    assert!(matches!(
        events.last(),
        Some(StreamEvent::Stop {
            reason: StopReason::EndTurn,
            ..
        })
    ));
}

#[tokio::test]
async fn statuses_become_sentences_and_busy_ones_are_tried_again() {
    let s = Server::start().await;
    s.route(
        "/v1/messages",
        vec![Reply::Json(
            401,
            Vec::new(),
            r#"{"type":"error","error":{"type":"authentication_error"}}"#.into(),
        )],
    );
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(
        error_said(&events),
        "The API key was rejected. Check it in Settings › Providers."
    );

    let busy = Reply::Json(
        429,
        vec![("retry-after", "0".into())],
        r#"{"error":{"message":"rate limited"}}"#.into(),
    );
    s.route(
        "/v1/messages",
        vec![busy.clone(), sse("anthropic_text.sse")],
    );
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(
        events[0],
        StreamEvent::Retrying {
            attempt: 2,
            of: 3,
            wait_ms: 0
        }
    );
    assert_eq!(text(&events), "Done.");

    // a spent quota is never tried again; a key the provider repeats is blanked out
    let spent = Reply::Json(
        429,
        Vec::new(),
        r#"{"error":{"message":"insufficient_quota for sk-test-1234567890"}}"#.into(),
    );
    s.route("/v1/messages", vec![spent]);
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(events.len(), 1);
    assert!(error_said(&events).contains("no quota or credit left"));
    let echo = Reply::Json(
        400,
        Vec::new(),
        r#"{"error":{"message":"bad key sk-test-1234567890"}}"#.into(),
    );
    s.route("/v1/messages", vec![echo]);
    let events = run(config(
        &s,
        "/v1/messages",
        Some("anthropic"),
        "claude-opus-5-5",
    ))
    .await;
    assert_eq!(
        error_said(&events),
        "The model provider returned an error (HTTP 400): bad key [API key]."
    );
}

#[tokio::test]
async fn a_missing_or_unsendable_key_fails_before_sending() {
    let client = LlmClient::new();
    let none = LlmConfig {
        endpoint: "https://api.openai.com/v1".into(),
        ..LlmConfig::default()
    };
    assert_eq!(
        collect(client.stream(none, request())).await,
        [StreamEvent::Error(LlmError::NoKey)]
    );
    let curly = LlmConfig {
        endpoint: "https://api.openai.com/v1".into(),
        api_key: "sk-“x”".into(),
        ..LlmConfig::default()
    };
    assert_eq!(
        collect(client.stream(curly, request())).await,
        [StreamEvent::Error(LlmError::BadKey)]
    );
}

#[tokio::test]
async fn an_unreachable_server_is_named() {
    // a port nothing listens on: refused, which waiting never mends, so no retry
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("addr").port();
    drop(listener);
    let cfg = LlmConfig {
        endpoint: format!("http://127.0.0.1:{port}/v1"),
        model: "m".into(),
        ..LlmConfig::default()
    };
    let events = collect(LlmClient::new().stream(cfg, request())).await;
    assert!(
        matches!(
            &events[..],
            [StreamEvent::Error(LlmError::Unreachable {
                kind: "refused",
                ..
            })]
        ),
        "{events:?}"
    );
}
