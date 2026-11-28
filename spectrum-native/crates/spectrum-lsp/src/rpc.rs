//! JSON-RPC 2.0 over a byte stream: requests matched to responses by id, the server's own requests
//! answered, its notifications turned into events.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

use lsp_types::notification::{Notification as _, PublishDiagnostics, ShowMessage};
use parking_lot::Mutex;
use serde_json::{Value, json};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};

use crate::framing::{Decoder, encode};
use crate::{LspError, LspEvent};

type Reply = Result<Value, LspError>;
/// Requests waiting for an answer; `None` once the stream has ended.
type Pending = Arc<Mutex<Option<HashMap<i64, oneshot::Sender<Reply>>>>>;

/// One running conversation with a server. Dropping it leaves its tasks to end when the stream closes.
pub(crate) struct Connection {
    out: mpsc::UnboundedSender<Vec<u8>>,
    pending: Pending,
    next_id: AtomicI64,
}

impl Connection {
    /// Starts the reader and writer tasks. `settings` answers the server's `workspace/configuration`;
    /// notifications go to `events`.
    pub(crate) fn spawn(
        reader: impl AsyncRead + Unpin + Send + 'static,
        writer: impl AsyncWrite + Unpin + Send + 'static,
        settings: Value,
        events: mpsc::UnboundedSender<LspEvent>,
    ) -> Arc<Self> {
        let (out, out_rx) = mpsc::unbounded_channel();
        let pending = Arc::new(Mutex::new(Some(HashMap::new())));
        tokio::spawn(write_loop(writer, out_rx));
        tokio::spawn(read_loop(
            reader,
            Arc::clone(&pending),
            out.clone(),
            settings,
            events,
        ));
        Arc::new(Self {
            out,
            pending,
            next_id: AtomicI64::new(1),
        })
    }

    pub(crate) fn notify(&self, method: &str, params: Value) -> Result<(), LspError> {
        let mut message = json!({ "jsonrpc": "2.0", "method": method });
        message["params"] = params;
        self.send(&message)
    }

    /// Sends a request and waits for its answer. On a timeout, or when the caller drops the future,
    /// the server is sent `$/cancelRequest`.
    pub(crate) async fn request(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, LspError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending
            .lock()
            .as_mut()
            .ok_or(LspError::Exited)?
            .insert(id, tx);
        let mut guard = CancelGuard {
            id,
            connection: self,
            armed: true,
        };
        let mut message = json!({ "jsonrpc": "2.0", "id": id, "method": method });
        message["params"] = params;
        self.send(&message)?;
        let reply = tokio::time::timeout(timeout, rx).await;
        let Ok(reply) = reply else {
            return Err(LspError::Timeout(method.to_owned()));
        };
        guard.armed = false;
        reply.unwrap_or(Err(LspError::Exited))
    }

    fn send(&self, message: &Value) -> Result<(), LspError> {
        self.out
            .send(encode(message.to_string().as_bytes()))
            .map_err(|_| LspError::Exited)
    }
}

/// Cancels a request that's given up on before its answer came.
struct CancelGuard<'a> {
    id: i64,
    connection: &'a Connection,
    armed: bool,
}

impl Drop for CancelGuard<'_> {
    fn drop(&mut self) {
        let waiting = self.armed
            && (self.connection.pending.lock().as_mut())
                .and_then(|p| p.remove(&self.id))
                .is_some();
        if waiting {
            // the server may have gone; nothing to cancel then
            let _ = self
                .connection
                .notify("$/cancelRequest", json!({ "id": self.id }));
        }
    }
}

async fn write_loop(
    mut writer: impl AsyncWrite + Unpin,
    mut out: mpsc::UnboundedReceiver<Vec<u8>>,
) {
    while let Some(bytes) = out.recv().await {
        if let Err(err) = async {
            writer.write_all(&bytes).await?;
            writer.flush().await
        }
        .await
        {
            tracing::debug!("LSP write failed: {err}");
            break;
        }
    }
}

async fn read_loop(
    mut reader: impl AsyncRead + Unpin,
    pending: Pending,
    out: mpsc::UnboundedSender<Vec<u8>>,
    settings: Value,
    events: mpsc::UnboundedSender<LspEvent>,
) {
    let mut decoder = Decoder::default();
    let mut chunk = vec![0; 64 * 1024];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => decoder.push(&chunk[..n]),
        }
        while let Some(body) = decoder.next_body() {
            match serde_json::from_slice::<Value>(&body) {
                Ok(message) => dispatch(message, &pending, &out, &settings, &events),
                Err(err) => tracing::warn!("LSP message that isn't JSON dropped: {err}"),
            }
        }
    }
    // the stream has ended: every waiting request fails with Exited
    pending.lock().take();
}

fn dispatch(
    mut message: Value,
    pending: &Pending,
    out: &mpsc::UnboundedSender<Vec<u8>>,
    settings: &Value,
    events: &mpsc::UnboundedSender<LspEvent>,
) {
    let id = message.get_mut("id").map(Value::take);
    let params = message.get_mut("params").map_or(Value::Null, Value::take);
    let method = message.get("method").and_then(Value::as_str);
    match (method, id) {
        (None, Some(id)) => {
            let tx = id
                .as_i64()
                .and_then(|id| pending.lock().as_mut()?.remove(&id));
            let Some(tx) = tx else {
                return;
            };
            let reply = match message.get_mut("error") {
                Some(error) => Err(LspError::Server {
                    code: error.get("code").and_then(Value::as_i64).unwrap_or(0),
                    message: error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                }),
                None => Ok(message.get_mut("result").map_or(Value::Null, Value::take)),
            };
            let _ = tx.send(reply);
        }
        (Some(method), Some(id)) => {
            let body = match answer(method, &params, settings) {
                Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                Err(message) => {
                    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": message } })
                }
            };
            let _ = out.send(encode(body.to_string().as_bytes()));
        }
        (Some(method), None) => {
            if let Some(event) = event(method, params) {
                let _ = events.send(event);
            }
        }
        (None, None) => {}
    }
}

/// Spectrum's answer to a request of the server's, as 2.8 answered them.
fn answer(method: &str, params: &Value, settings: &Value) -> Result<Value, String> {
    match method {
        "workspace/configuration" => {
            let items = params
                .get("items")
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            Ok(Value::Array(vec![settings.clone(); items]))
        }
        "window/showDocument" => Ok(json!({ "success": false })),
        "client/registerCapability"
        | "client/unregisterCapability"
        | "window/workDoneProgress/create" => Ok(Value::Null),
        _ => Err(format!("{method} isn’t supported.")),
    }
}

fn event(method: &str, params: Value) -> Option<LspEvent> {
    let parsed = match method {
        PublishDiagnostics::METHOD => serde_json::from_value(params).map(LspEvent::Diagnostics),
        ShowMessage::METHOD => serde_json::from_value(params).map(LspEvent::ShowMessage),
        // logs, progress, Tinymist's outline (documentSymbol gives it on asking)
        _ => return None,
    };
    parsed
        .inspect_err(|err| tracing::warn!("bad {method} from the server: {err}"))
        .ok()
}

#[cfg(test)]
mod tests;
