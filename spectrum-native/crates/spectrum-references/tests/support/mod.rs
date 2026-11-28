//! A local HTTP server that answers from a handler with recorded replies and keeps every request. No network.

#![allow(clippy::pedantic)]
#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Debug, Clone)]
pub struct Request {
    pub method: String,
    /// Path and query, as sent.
    pub target: String,
    pub path: String,
    pub query: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

impl Request {
    pub fn q(&self, k: &str) -> &str {
        self.query.get(k).map_or("", String::as_str)
    }
}

pub struct Reply {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

pub fn json(status: u16, body: &str) -> Reply {
    Reply {
        status,
        headers: vec![("content-type".into(), "application/json".into())],
        body: body.into(),
    }
}

pub fn text(status: u16, kind: &str, body: &str) -> Reply {
    Reply {
        status,
        headers: vec![("content-type".into(), kind.into())],
        body: body.into(),
    }
}

pub fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("fixture")
}

type Handler = Arc<dyn Fn(&Request) -> Reply + Send + Sync>;

pub struct Server {
    pub base: String,
    pub requests: Arc<Mutex<Vec<Request>>>,
}

fn decode(s: &str) -> String {
    let s = s.replace('+', " ");
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 3 <= bytes.len()
            && let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16)
        {
            out.push(b);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

impl Server {
    pub async fn start(handler: impl Fn(&Request) -> Reply + Send + Sync + 'static) -> Self {
        let handler: Handler = Arc::new(handler);
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let base = format!("http://{}", listener.local_addr().expect("addr"));
        let requests: Arc<Mutex<Vec<Request>>> = Arc::default();
        let seen = requests.clone();
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let handler = handler.clone();
                let seen = seen.clone();
                tokio::spawn(async move {
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
                        if let Some(k) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            break k;
                        }
                    };
                    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
                    let mut lines = head.split("\r\n");
                    let first: Vec<&str> = lines.next().unwrap_or("").split(' ').collect();
                    let headers: HashMap<String, String> = lines
                        .filter_map(|l| l.split_once(':'))
                        .map(|(k, v)| (k.trim().to_lowercase(), v.trim().to_owned()))
                        .collect();
                    let length: usize = headers
                        .get("content-length")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    while buf.len() < head_end + 4 + length {
                        let Ok(n) = socket.read(&mut chunk).await else {
                            return;
                        };
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                    }
                    let body = String::from_utf8_lossy(&buf[head_end + 4..]).into_owned();
                    let target = first.get(1).copied().unwrap_or("/").to_owned();
                    let (path, qs) = target.split_once('?').unwrap_or((&target, ""));
                    let query = qs
                        .split('&')
                        .filter(|p| !p.is_empty())
                        .map(|p| p.split_once('=').unwrap_or((p, "")))
                        .map(|(k, v)| (decode(k), decode(v)))
                        .collect();
                    let req = Request {
                        method: first.first().copied().unwrap_or("GET").to_owned(),
                        path: decode(path),
                        target: target.clone(),
                        query,
                        headers,
                        body,
                    };
                    seen.lock().push(req.clone());
                    let reply = handler(&req);
                    let mut out = format!(
                        "HTTP/1.1 {} X\r\ncontent-length: {}\r\nconnection: close\r\n",
                        reply.status,
                        reply.body.len()
                    );
                    for (k, v) in &reply.headers {
                        out.push_str(&format!("{k}: {v}\r\n"));
                    }
                    out.push_str("\r\n");
                    out.push_str(&reply.body);
                    let _ = socket.write_all(out.as_bytes()).await;
                    let _ = socket.shutdown().await;
                });
            }
        });
        Self { base, requests }
    }

    pub fn hits(&self, prefix: &str) -> Vec<Request> {
        self.requests
            .lock()
            .iter()
            .filter(|r| r.path.starts_with(prefix))
            .cloned()
            .collect()
    }
}
