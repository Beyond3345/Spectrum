//! A stand-in language server for spectrum-lsp's tests.
//!
//! - `initialize`, `shutdown`, `exit` as the protocol says; `documentSymbol` answers `[]`.
//! - `didOpen` publishes one diagnostic whose message is `open:<text>`.
//! - `test/crash` (notification) exits with code 1.
//! - `$/cancelRequest` shows the message `cancelled <id>`.
//! - `FAKE_LSP_COUNTER=<file>`: every start after the first in that file exits at once.

use std::io::{BufRead, BufReader, Write};

use serde_json::{Value, json};

fn main() {
    if let Some(file) = std::env::var_os("FAKE_LSP_COUNTER") {
        let starts = std::fs::read_to_string(&file)
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0);
        let _ = std::fs::write(&file, (starts + 1).to_string());
        if starts > 0 {
            std::process::exit(2);
        }
    }
    let mut input = BufReader::new(std::io::stdin().lock());
    while let Some(message) = read(&mut input) {
        let method = message["method"].as_str().unwrap_or_default();
        let id = &message["id"];
        let params = &message["params"];
        match method {
            "initialize" => reply(
                id,
                &json!({ "capabilities": { "documentSymbolProvider": true } }),
            ),
            "shutdown" => reply(id, &Value::Null),
            "exit" => std::process::exit(0),
            "textDocument/documentSymbol" => reply(id, &json!([])),
            "textDocument/didOpen" => {
                let doc = &params["textDocument"];
                let text = doc["text"].as_str().unwrap_or_default();
                let range = json!({ "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 0 } });
                notify(
                    "textDocument/publishDiagnostics",
                    &json!({ "uri": doc["uri"], "version": doc["version"],
                        "diagnostics": [{ "range": range, "message": format!("open:{text}") }] }),
                );
            }
            "test/crash" => std::process::exit(1),
            "$/cancelRequest" => notify(
                "window/showMessage",
                &json!({ "type": 3, "message": format!("cancelled {}", params["id"]) }),
            ),
            _ => {}
        }
    }
}

fn read(input: &mut impl BufRead) -> Option<Value> {
    let mut length = None;
    loop {
        let mut line = String::new();
        if input.read_line(&mut line).ok()? == 0 {
            return None;
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':')
            && name.eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().ok();
        }
    }
    let mut body = vec![0; length?];
    input.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}

fn write(message: &Value) {
    let body = message.to_string();
    let mut out = std::io::stdout().lock();
    let _ = write!(out, "Content-Length: {}\r\n\r\n{body}", body.len());
    let _ = out.flush();
}

fn reply(id: &Value, result: &Value) {
    write(&json!({ "jsonrpc": "2.0", "id": id, "result": result }));
}

fn notify(method: &str, params: &Value) {
    write(&json!({ "jsonrpc": "2.0", "method": method, "params": params }));
}
