//! Request bodies as each provider receives them, compared with what 2.8 sends; effort mapping, regions,
//! rejected parameters, Ollama's live list and the price cache.

#[path = "support/server.rs"]
mod server;

use serde_json::{Value, json};
use server::{Reply, Server, collect, ok_json, sse};
use spectrum_ai::{
    Api, AssistantMessage, Effort, EffortLevel as L, LlmClient, LlmConfig, LlmError, Message, Part,
    PriceCache, Replay, Request, StreamEvent, Tool, ToolCall, preset, preset_for_endpoint, presets,
};

fn config(s: &Server, path: &str, provider: Option<&str>, model: &str) -> LlmConfig {
    LlmConfig {
        endpoint: s.url(path),
        api_key: "sk-test-1234567890".into(),
        model: model.into(),
        provider: provider.map(str::to_owned),
    }
}

fn read_tool() -> Tool {
    Tool {
        name: "read_file".into(),
        description: "Read a file".into(),
        parameters: json!({ "type": "object", "properties": { "path": { "type": "string" } } }),
    }
}

/// The body without what every chat request carries, leaving the fields effort decides.
fn effort_fields(mut body: Value) -> Value {
    if let Some(o) = body.as_object_mut() {
        for k in ["model", "messages", "stream", "stream_options"] {
            o.remove(k);
        }
    }
    body
}

#[tokio::test]
async fn openai_goes_through_the_responses_api_with_reasoning_effort() {
    let s = Server::start().await;
    s.route("/v1/responses", vec![sse("openai_responses_tool.sse")]);
    let mut req = Request::new(
        "You edit LaTeX.",
        vec![Message::User(vec![
            Part::Text("What is this?".into()),
            Part::image("image/png", b"\x89PNG"),
        ])],
    );
    req.tools = vec![read_tool()];
    req.effort = Effort::Level(L::Xhigh);
    req.cache_key = Some("thread-1".into());
    collect(LlmClient::new().stream(
        config(&s, "/v1/chat/completions", Some("openai"), "gpt-6-sol"),
        req,
    ))
    .await;
    let got = s.last();
    assert_eq!(got.path, "/v1/responses");
    assert_eq!(got.headers["authorization"], "Bearer sk-test-1234567890");
    assert_eq!(
        got.body,
        json!({
            "model": "gpt-6-sol",
            "prompt_cache_key": "thread-1",
            "input": [
                { "role": "system", "content": "You edit LaTeX." },
                { "role": "user", "content": [
                    { "type": "input_text", "text": "What is this?" },
                    { "type": "input_image", "image_url": "data:image/png;base64,iVBORw==" }
                ] }
            ],
            "tools": [{ "type": "function", "name": "read_file", "description": "Read a file",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" } } } }],
            "store": false,
            "include": ["reasoning.encrypted_content"],
            "reasoning": { "effort": "xhigh" },
            "stream": true
        })
    );
}

#[tokio::test]
async fn anthropic_body_returns_thinking_and_caches_the_prefix() {
    let s = Server::start().await;
    s.route("/v1/messages", vec![sse("anthropic_text.sse")]);
    let replay = json!([
        { "type": "thinking", "thinking": "t", "signature": "s" },
        { "type": "tool_use", "id": "toolu_1", "name": "read_file", "input": { "path": "a.tex" } }
    ]);
    let mut req = Request::new(
        "You edit LaTeX.",
        vec![
            Message::user("Fix it."),
            Message::Assistant(AssistantMessage {
                text: String::new(),
                tool_calls: vec![ToolCall {
                    id: "toolu_1".into(),
                    name: "read_file".into(),
                    arguments: json!({ "path": "a.tex" }),
                }],
                replay: Some(Replay {
                    api: Api::Anthropic,
                    items: replay.clone(),
                }),
            }),
            Message::Tool {
                call_id: "toolu_1".into(),
                content: "\\section{A}".into(),
            },
        ],
    );
    req.tools = vec![read_tool()];
    req.cache_key = Some("thread-1".into());
    collect(LlmClient::new().stream(
        config(&s, "/v1/messages", Some("anthropic"), "claude-opus-5-5"),
        req,
    ))
    .await;
    let got = s.last();
    assert_eq!(
        (
            got.headers["x-api-key"].as_str(),
            got.headers["anthropic-version"].as_str()
        ),
        ("sk-test-1234567890", "2023-06-01")
    );
    let cached = json!({ "type": "ephemeral" });
    assert_eq!(
        got.body,
        json!({
            "model": "claude-opus-5-5",
            "max_tokens": 16000,
            "system": [{ "type": "text", "text": "You edit LaTeX.", "cache_control": cached }],
            "messages": [
                { "role": "user", "content": [{ "type": "text", "text": "Fix it." }] },
                { "role": "assistant", "content": replay },
                { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "\\section{A}", "cache_control": cached }] }
            ],
            "tools": [{ "name": "read_file", "description": "Read a file",
                "input_schema": { "type": "object", "properties": { "path": { "type": "string" } } }, "cache_control": cached }],
            "output_config": { "effort": "medium" },
            "stream": true
        })
    );
}

#[tokio::test]
async fn anthropic_effort_off_disables_thinking_only_where_the_model_allows() {
    let s = Server::start().await;
    s.route("/v1/messages", vec![sse("anthropic_text.sse")]);
    let send = |model: &'static str, effort: L| {
        let mut req = Request::new("", vec![Message::user("Hi")]);
        req.effort = Effort::Level(effort);
        LlmClient::new().stream(config(&s, "/v1/messages", Some("anthropic"), model), req)
    };
    collect(send("claude-haiku-5-5", L::None)).await;
    let body = s.last().body;
    assert_eq!(
        (&body["thinking"], &body["output_config"]),
        (&json!({ "type": "disabled" }), &json!({ "effort": "low" }))
    );
    // Opus can't turn thinking off: the nearest level it takes is Low
    collect(send("claude-opus-5-5", L::None)).await;
    let body = s.last().body;
    assert_eq!(
        (body.get("thinking"), &body["output_config"]["effort"]),
        (None, &json!("low"))
    );
    // thinking counts towards the limit
    collect(send("claude-fable-5-1", L::Max)).await;
    assert_eq!(s.last().body["max_tokens"], 32000);
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // one table row per case
async fn chat_presets_map_effort_as_2_8_does() {
    let s = Server::start().await;
    s.route(
        "/v1/chat/completions",
        vec![sse("deepseek_reasoning_tool.sse")],
    );
    let cases: &[(&str, &str, Effort, Value)] = &[
        (
            "deepseek",
            "deepseek-flash",
            Effort::Level(L::None),
            json!({ "thinking": { "type": "disabled" } }),
        ),
        // a tie rounds up
        (
            "deepseek",
            "deepseek-flash",
            Effort::Level(L::Medium),
            json!({ "thinking": { "type": "enabled" }, "reasoning_effort": "high" }),
        ),
        (
            "deepseek",
            "deepseek-next",
            Effort::Level(L::High),
            json!({ "thinking": { "type": "enabled" }, "reasoning_effort": "high" }),
        ),
        ("deepseek", "deepseek-next", Effort::Default, json!({})),
        (
            "moonshot",
            "kimi-k2.6",
            Effort::Level(L::None),
            json!({ "thinking": { "type": "disabled" } }),
        ),
        ("moonshot", "kimi-k2.6", Effort::Level(L::High), json!({})),
        (
            "moonshot",
            "kimi-k3",
            Effort::Default,
            json!({ "reasoning_effort": "high" }),
        ),
        (
            "glm",
            "glm-5.2",
            Effort::Level(L::Low),
            json!({ "thinking": { "type": "enabled" }, "reasoning_effort": "high" }),
        ),
        (
            "glm",
            "glm-5.3-flash",
            Effort::Fast,
            json!({ "thinking": { "type": "enabled" }, "reasoning_effort": "low" }),
        ),
        (
            "qwen",
            "qwen3.7-plus",
            Effort::Level(L::Low),
            json!({ "enable_thinking": true, "thinking_budget": 4096 }),
        ),
        (
            "qwen",
            "qwen3.7-plus",
            Effort::Level(L::Medium),
            json!({ "enable_thinking": true, "thinking_budget": 16384 }),
        ),
        (
            "qwen",
            "qwen3.7-flash",
            Effort::Level(L::Max),
            json!({ "enable_thinking": true }),
        ),
        (
            "qwen",
            "qwen3.8-max",
            Effort::Level(L::None),
            json!({ "enable_thinking": false }),
        ),
        (
            "qwen",
            "qwen3.8-max",
            Effort::Level(L::Medium),
            json!({ "reasoning_effort": "medium" }),
        ),
        (
            "gemini",
            "gemini-3.5-flash-lite",
            Effort::Fast,
            json!({ "reasoning_effort": "minimal" }),
        ),
        (
            "gemini",
            "gemini-3.8-flash",
            Effort::Level(L::None),
            json!({ "reasoning_effort": "low" }),
        ),
        (
            "openrouter",
            "z-ai/glm-5.3",
            Effort::Level(L::Max),
            json!({ "reasoning": { "effort": "max" } }),
        ),
        (
            "meta",
            "muse-spark-1.2",
            Effort::Level(L::Max),
            json!({ "reasoning_effort": "xhigh" }),
        ),
        (
            "ollama-cloud",
            "gemma4:31b",
            Effort::Default,
            json!({ "reasoning_effort": "none" }),
        ),
    ];
    for (provider, model, effort, want) in cases {
        let mut req = Request::new("", vec![Message::user("Hi")]);
        req.effort = *effort;
        collect(LlmClient::new().stream(config(&s, "/v1", Some(provider), model), req)).await;
        assert_eq!(
            &effort_fields(s.last().body),
            want,
            "{provider} {model} {effort:?}"
        );
    }
}

#[tokio::test]
async fn a_preset_chat_body_is_exactly_2_8s() {
    let s = Server::start().await;
    s.route(
        "/chat/completions",
        vec![sse("deepseek_reasoning_tool.sse")],
    );
    let mut req = Request::new("You edit LaTeX.", vec![Message::user("Fix it.")]);
    req.effort = Effort::Level(L::None);
    collect(LlmClient::new().stream(
        config(&s, "/chat/completions", Some("deepseek"), "deepseek-flash"),
        req,
    ))
    .await;
    assert_eq!(
        s.last().body,
        json!({
            "model": "deepseek-flash",
            "messages": [{ "role": "system", "content": "You edit LaTeX." }, { "role": "user", "content": "Fix it." }],
            "thinking": { "type": "disabled" },
            "stream": true,
            "stream_options": { "include_usage": true }
        })
    );
}

#[tokio::test]
async fn a_server_with_no_preset_loses_each_parameter_it_rejects() {
    let s = Server::start().await;
    let reject = |status, text: &str| {
        Reply::Json(
            status,
            Vec::new(),
            json!({ "error": { "message": text } }).to_string(),
        )
    };
    s.route(
        "/v1/chat/completions",
        vec![
            reject(
                400,
                "Unrecognized request argument supplied: prompt_cache_key",
            ),
            reject(422, "stream_options is not allowed"),
            reject(400, "reasoning_effort is not supported by this model"),
            reject(400, "Unsupported value: temperature"),
            sse("ollama_think.sse"),
        ],
    );
    let mut req = Request::new("", vec![Message::user("Hi")]);
    req.effort = Effort::Level(L::Low);
    req.cache_key = Some("thread-1".into());
    let events = collect(LlmClient::new().stream(config(&s, "/v1", None, "my-model"), req)).await;
    assert!(
        matches!(events.last(), Some(StreamEvent::Stop { .. })),
        "{events:?}"
    );
    let bodies: Vec<Value> = s
        .requests
        .lock()
        .iter()
        .map(|r| effort_fields(r.body.clone()))
        .collect();
    assert_eq!(
        bodies[0],
        json!({ "temperature": 0.2, "prompt_cache_key": "thread-1", "reasoning_effort": "low" })
    );
    assert_eq!(
        bodies[2],
        json!({ "temperature": 0.2, "reasoning_effort": "low" })
    );
    assert_eq!(bodies[4], json!({}));
    assert_eq!(s.requests.lock()[2].body["stream_options"], Value::Null);
}

#[tokio::test]
async fn an_address_ending_in_messages_speaks_the_messages_api() {
    let s = Server::start().await;
    s.route("/proxy/v1/messages", vec![sse("anthropic_text.sse")]);
    let mut req = Request::new("", vec![Message::user("Hi")]);
    req.effort = Effort::Level(L::High);
    collect(LlmClient::new().stream(
        config(&s, "/proxy/v1/messages", None, "claude-sonnet-5-5"),
        req,
    ))
    .await;
    let body = s.last().body;
    assert_eq!(
        (
            &body["output_config"],
            &body["max_tokens"],
            body.get("temperature")
        ),
        (&json!({ "effort": "high" }), &json!(16000), None)
    );
}

#[test]
fn every_region_belongs_to_its_preset() {
    for p in presets() {
        assert_eq!(preset_for_endpoint(p.endpoint).map(|x| x.id), Some(p.id));
        for r in p.regions {
            assert_eq!(
                preset_for_endpoint(r.endpoint).map(|x| x.id),
                Some(p.id),
                "{}",
                r.label
            );
        }
    }
    let labels: Vec<&str> = ["moonshot", "glm", "qwen"]
        .iter()
        .flat_map(|id| preset(id).map(|p| p.regions).unwrap_or_default())
        .map(|r| r.label)
        .collect();
    assert_eq!(
        labels,
        ["China", "China (BigModel)", "China (Beijing)", "Hong Kong"]
    );
}

#[tokio::test]
async fn ollama_lists_its_models_and_their_thinking_levels() {
    let s = Server::start().await;
    // no /api/show: older servers, so capabilities come from the tags
    s.route(
        "/api/tags",
        vec![ok_json(&json!({ "models": [
            { "name": "kimi-k3:cloud", "remote_host": "https://ollama.com:443", "size": 384, "details": {}, "capabilities": ["completion", "thinking", "vision"] },
            { "name": "nomic-embed-text:latest", "size": 274_302_450, "details": { "parameter_size": "137M" }, "capabilities": ["embedding"] },
            { "name": "gemma4:31b", "size": 19_000_000_000_u64, "details": { "parameter_size": "31B", "quantization_level": "Q4_K_M" }, "capabilities": ["completion", "vision"] },
            { "name": "qwen3:8b", "size": 5_200_000_000_u64, "details": { "parameter_size": "8.2B", "quantization_level": "Q4_K_M" }, "capabilities": ["completion", "thinking"] }
        ] }))],
    );
    let ollama = preset("ollama").expect("preset");
    let live = LlmClient::new()
        .list_live_models(ollama, &s.base)
        .await
        .expect("models");
    let ids: Vec<&str> = live.models.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["kimi-k3:cloud", "gemma4:31b", "qwen3:8b"]);
    assert_eq!(live.models[0].note, "Runs on Ollama’s servers");
    assert_eq!(live.models[1].note, "31B, Q4_K_M");
    assert_eq!(live.models[2].levels, [L::None, L::Low, L::Medium, L::High]);
    assert_eq!(
        (live.main.as_str(), live.fast.as_str(), live.vision.as_str()),
        ("gemma4:31b", "qwen3:8b", "gemma4:31b")
    );
    assert_eq!(live.references, live.fast);

    let dead = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let gone = format!("http://{}", dead.local_addr().expect("addr"));
    drop(dead);
    let err = LlmClient::new()
        .list_live_models(ollama, &gone)
        .await
        .expect_err("unreachable");
    assert_eq!(
        err.to_string(),
        "Couldn’t reach Ollama. Start Ollama, or install it from ollama.com."
    );
}

#[tokio::test]
async fn an_ollama_models_effort_comes_from_the_server_once_a_session() {
    let s = Server::start().await;
    s.route("/api/show", vec![ok_json(&json!({ "capabilities": ["completion", "thinking"], "thinking": { "values": [false, true], "default": true } }))]);
    s.route("/v1/chat/completions", vec![sse("ollama_think.sse")]);
    let client = LlmClient::new();
    for (effort, want) in [
        (Effort::Default, "high"),
        (Effort::Level(L::Minimal), "none"),
    ] {
        let mut req = Request::new("", vec![Message::user("Hi")]);
        req.effort = effort;
        collect(client.stream(config(&s, "", Some("ollama"), "qwen3:8b"), req)).await;
        let got = s.last();
        assert_eq!(got.body["reasoning_effort"], want);
        assert!(!got.headers.contains_key("authorization"));
    }
    assert_eq!(s.count("/api/show"), 1);
}

#[tokio::test]
async fn vision_follows_the_preset_or_a_known_models_name() {
    let s = Server::start().await;
    let client = LlmClient::new();
    let cases = [
        (Some("anthropic"), "claude-haiku-5-5", true),
        (Some("deepseek"), "deepseek-v4-pro", false),
        (None, "claude-opus-5-5", true),
        (None, "glm-5.3", false),
    ];
    for (provider, model, vision) in cases {
        assert_eq!(
            client
                .reads_images(&config(&s, "/v1", provider, model))
                .await,
            vision,
            "{model}"
        );
    }
}

#[tokio::test]
async fn prices_are_kept_on_disk_and_asked_for_at_most_every_six_hours() {
    let s = Server::start().await;
    let list = json!({ "anthropic": { "models": { "claude-opus-5-5": { "cost": { "input": 5, "output": 25, "cache_read": 0.5 } } } } });
    s.route("/api.json", vec![ok_json(&list)]);
    let dir = tempfile::tempdir().expect("dir");
    let cache = PriceCache::with_url(dir.path(), &s.url("/api.json"));
    let first = cache.prices(false).await;
    assert_eq!(
        first.price("anthropic/claude-opus-5-5").map(|p| p.input),
        Some(5.0)
    );
    assert!(dir.path().join("models-dev.json").exists());
    let again = cache.prices(false).await;
    assert_eq!(
        (again.synced_at, s.count("/api.json")),
        (first.synced_at, 1)
    );
    cache.prices(true).await;
    assert_eq!(s.count("/api.json"), 2);
    // a failure keeps the last list and says why
    s.route("/api.json", vec![Reply::Json(500, Vec::new(), "{}".into())]);
    let failed = cache.prices(true).await;
    assert_eq!(failed.error.as_deref(), Some("models.dev answered 500"));
    assert_eq!(
        failed.price("claude-opus-5-5").and_then(|p| p.cache_read),
        Some(0.5)
    );
    // and isn't asked again for ten minutes
    let after = PriceCache::with_url(dir.path(), &s.url("/api.json"))
        .prices(false)
        .await;
    assert_eq!((after.error.is_some(), s.count("/api.json")), (true, 3));
    assert_eq!(LlmError::NoKey.notice().action, None);
}
