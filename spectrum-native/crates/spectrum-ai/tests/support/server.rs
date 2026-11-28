//! A small local HTTP server that serves canned replies by path and records every request it gets.

#![allow(
    dead_code,
    clippy::expect_used,
    clippy::items_after_statements,
    clippy::format_collect
)]

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use parking_lot::Mutex;
use serde_json::Value;
use spectrum_ai::{EventStream, StreamEvent};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Clone)]
pub enum Reply {
    /// A whole event stream, then the connection closes.
    Sse(String),
    /// The stream so far, then the connection stays open with nothing more.
    SseThenHang(String),
    /// The stream so far, then the connection drops before the promised length.
    SseThenDrop(String),
    /// A plain answer: status, extra headers, body.
    Json(u16, Vec<(&'static str, String)>, String),
}

pub fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path).expect("fixture")
}

pub fn sse(name: &str) -> Reply {
    Reply::Sse(fixture(name))
}

pub fn ok_json(body: &Value) -> Reply {
    Reply::Json(200, Vec::new(), body.to_string())
}

#[derive(Debug, Clone)]
pub struct Recorded {
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Value,
}

type Routes = Arc<Mutex<HashMap<String, VecDeque<Reply>>>>;

pub struct Server {
    pub base: String,
    routes: Routes,
    pub requests: Arc<Mutex<Vec<Recorded>>>,
}

impl Server {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let base = format!("http://{}", listener.local_addr().expect("addr"));
        let routes: Routes = Arc::default();
        let requests: Arc<Mutex<Vec<Recorded>>> = Arc::default();
        let (r, q) = (routes.clone(), requests.clone());
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                tokio::spawn(handle(socket, r.clone(), q.clone()));
            }
        });
        Self {
            base,
            routes,
            requests,
        }
    }

    /// Replies for a path, one per request; the last one repeats.
    pub fn route(&self, path: &str, replies: Vec<Reply>) {
        self.routes.lock().insert(path.to_owned(), replies.into());
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base)
    }

    pub fn last(&self) -> Recorded {
        self.requests.lock().last().cloned().expect("a request")
    }

    pub fn count(&self, path: &str) -> usize {
        self.requests
            .lock()
            .iter()
            .filter(|r| r.path == path)
            .count()
    }
}

async fn handle(mut socket: TcpStream, routes: Routes, requests: Arc<Mutex<Vec<Recorded>>>) {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let head_end = loop {
        let Ok(n) = socket.read(&mut chunk).await else {
            return;
        };
        if n == 0 {
            return;
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.lines();
    let path = lines
        .next()
        .and_then(|l| l.split(' ').nth(1))
        .unwrap_or("/")
        .to_owned();
    let headers: HashMap<String, String> = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_owned()))
        .collect();
    let length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    while buf.len() < head_end + length {
        let Ok(n) = socket.read(&mut chunk).await else {
            return;
        };
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let body = serde_json::from_slice(&buf[head_end..]).unwrap_or(Value::Null);
    requests.lock().push(Recorded {
        path: path.clone(),
        headers,
        body,
    });
    let reply = {
        let mut routes = routes.lock();
        match routes.get_mut(&path) {
            Some(q) if q.len() > 1 => q.pop_front(),
            Some(q) => q.front().cloned(),
            None => None,
        }
    }
    .unwrap_or_else(|| Reply::Json(404, Vec::new(), r#"{"error":"not found"}"#.into()));
    const SSE_HEAD: &str = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-cache\r\nconnection: close\r\n";
    match reply {
        Reply::Sse(text) => {
            let _ = socket
                .write_all(format!("{SSE_HEAD}\r\n{text}").as_bytes())
                .await;
        }
        Reply::SseThenHang(text) => {
            let _ = socket
                .write_all(format!("{SSE_HEAD}\r\n{text}").as_bytes())
                .await;
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
        Reply::SseThenDrop(text) => {
            let promised = text.len() + 1000;
            let _ = socket
                .write_all(format!("{SSE_HEAD}content-length: {promised}\r\n\r\n{text}").as_bytes())
                .await;
        }
        Reply::Json(status, extra, body) => {
            let extra: String = extra.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
            let response = format!(
                "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{extra}\r\n{body}",
                body.len()
            );
            let _ = socket.write_all(response.as_bytes()).await;
        }
    }
    let _ = socket.shutdown().await;
}

/// Every event of a stream (failing the test if it takes longer than ten seconds).
pub async fn collect(stream: EventStream) -> Vec<StreamEvent> {
    tokio::time::timeout(Duration::from_secs(10), stream.collect())
        .await
        .expect("the stream ended in time")
}
