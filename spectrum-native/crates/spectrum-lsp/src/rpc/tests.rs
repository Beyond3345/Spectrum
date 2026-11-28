//! The connection against a hand-driven server on an in-memory stream.

use super::*;
use tokio::io::{DuplexStream, ReadHalf, WriteHalf, split};

struct FakeEnd {
    reader: ReadHalf<DuplexStream>,
    writer: WriteHalf<DuplexStream>,
    decoder: Decoder,
}

impl FakeEnd {
    async fn recv(&mut self) -> Value {
        let mut chunk = [0; 4096];
        loop {
            if let Some(body) = self.decoder.next_body() {
                return serde_json::from_slice(&body).unwrap();
            }
            let n = self.reader.read(&mut chunk).await.unwrap();
            assert!(n > 0, "client closed");
            self.decoder.push(&chunk[..n]);
        }
    }

    async fn send(&mut self, message: Value) {
        self.writer
            .write_all(&encode(message.to_string().as_bytes()))
            .await
            .unwrap();
    }
}

fn pair() -> (Arc<Connection>, FakeEnd, mpsc::UnboundedReceiver<LspEvent>) {
    let (client, server) = tokio::io::duplex(1 << 16);
    let (cr, cw) = split(client);
    let (sr, sw) = split(server);
    let (events, rx) = mpsc::unbounded_channel();
    let connection = Connection::spawn(cr, cw, json!({ "k": 1 }), events);
    let fake = FakeEnd {
        reader: sr,
        writer: sw,
        decoder: Decoder::default(),
    };
    (connection, fake, rx)
}

const LONG: Duration = Duration::from_secs(5);

#[tokio::test]
async fn answers_out_of_order_reach_their_requests() {
    let (connection, mut fake, _rx) = pair();
    let a = connection.request("a", json!(null), LONG);
    let b = connection.request("b", json!(null), LONG);
    let server = async {
        let first = fake.recv().await;
        let second = fake.recv().await;
        // answer the second first, in one write with a unicode body
        let wire = [
            encode(
                json!({ "jsonrpc": "2.0", "id": second["id"], "result": "B ∑ 😀" })
                    .to_string()
                    .as_bytes(),
            ),
            encode(
                json!({ "jsonrpc": "2.0", "id": first["id"], "result": first["method"] })
                    .to_string()
                    .as_bytes(),
            ),
        ]
        .concat();
        fake.writer.write_all(&wire).await.unwrap();
    };
    let (a, b, ()) = tokio::join!(a, b, server);
    assert_eq!(a.unwrap(), json!("a"));
    assert_eq!(b.unwrap(), json!("B ∑ 😀"));
}

#[tokio::test]
async fn error_answers_are_errors() {
    let (connection, mut fake, _rx) = pair();
    let request = connection.request("x", json!(null), LONG);
    let server = async {
        let id = fake.recv().await["id"].clone();
        fake.send(
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32600, "message": "no" } }),
        )
        .await;
    };
    let (result, ()) = tokio::join!(request, server);
    assert!(matches!(result, Err(LspError::Server { code: -32600, .. })));
}

#[tokio::test]
async fn timeout_sends_cancel() {
    let (connection, mut fake, _rx) = pair();
    let result = connection
        .request("slow", json!(null), Duration::from_millis(50))
        .await;
    assert!(matches!(result, Err(LspError::Timeout(m)) if m == "slow"));
    let request = fake.recv().await;
    let cancel = fake.recv().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert_eq!(cancel["params"]["id"], request["id"]);
    // a late answer goes nowhere and breaks nothing
    fake.send(json!({ "jsonrpc": "2.0", "id": request["id"], "result": 1 }))
        .await;
    let next = connection.request("next", json!(null), LONG);
    let server = async {
        let id = fake.recv().await["id"].clone();
        fake.send(json!({ "jsonrpc": "2.0", "id": id, "result": 2 }))
            .await;
    };
    let (next, ()) = tokio::join!(next, server);
    assert_eq!(next.unwrap(), json!(2));
}

#[tokio::test]
async fn dropping_the_future_cancels() {
    let (connection, mut fake, _rx) = pair();
    {
        let request = connection.request("dropped", json!(null), LONG);
        // poll it once so it's sent, then drop it
        let _ = tokio::time::timeout(Duration::from_millis(20), request).await;
    }
    let request = fake.recv().await;
    let cancel = fake.recv().await;
    assert_eq!(cancel["method"], "$/cancelRequest");
    assert_eq!(cancel["params"]["id"], request["id"]);
}

#[tokio::test]
async fn server_requests_are_answered_and_notifications_become_events() {
    let (_connection, mut fake, mut rx) = pair();
    fake.send(
        json!({ "jsonrpc": "2.0", "id": "c1", "method": "workspace/configuration",
        "params": { "items": [{ "section": "texlab" }, {}] } }),
    )
    .await;
    assert_eq!(
        fake.recv().await,
        json!({ "jsonrpc": "2.0", "id": "c1", "result": [{ "k": 1 }, { "k": 1 }] })
    );
    fake.send(json!({ "jsonrpc": "2.0", "id": 7, "method": "workspace/applyEdit", "params": {} }))
        .await;
    assert_eq!(fake.recv().await["error"]["code"], -32601);
    fake.send(json!({ "jsonrpc": "2.0", "method": "window/logMessage", "params": { "type": 3, "message": "x" } }))
        .await;
    fake.send(json!({ "jsonrpc": "2.0", "method": "textDocument/publishDiagnostics",
        "params": { "uri": "file:///a.tex", "diagnostics": [{ "range": { "start": { "line": 0, "character": 0 },
        "end": { "line": 0, "character": 1 } }, "message": "Ünbalanced" }] } }))
        .await;
    let Some(LspEvent::Diagnostics(params)) = rx.recv().await else {
        panic!("expected diagnostics");
    };
    assert_eq!(params.uri.as_str(), "file:///a.tex");
    assert_eq!(params.diagnostics[0].message, "Ünbalanced");
}

#[tokio::test]
async fn closed_stream_fails_waiting_and_later_requests() {
    let (connection, fake, _rx) = pair();
    let request = connection.request("x", json!(null), LONG);
    let close = async {
        tokio::time::sleep(Duration::from_millis(20)).await;
        drop(fake);
    };
    let (result, ()) = tokio::join!(request, close);
    assert!(matches!(result, Err(LspError::Exited)));
    let later = connection.request("y", json!(null), LONG).await;
    assert!(matches!(later, Err(LspError::Exited)));
}
