//! Git's smart HTTP for libgit2, carried by reqwest with rustls. libgit2's own https needs OpenSSL on a Mac
//! (its `https` feature pulls openssl-sys there) and differs per platform, so it's left off and this one
//! transport serves both. A token arrives as the URL's user part (`x-access-token:<token>@`) and goes out
//! as a Basic header; it is never written anywhere.

use std::io::{self, Cursor, Read, Write};
use std::sync::Once;
use std::time::Duration;

use base64::Engine;
use git2::transport::{Service, SmartSubtransport, SmartSubtransportStream, Transport};

/// Registers the transport for https:// and http:// (libgit2 adds the "://") once, before the first fetch, push or clone.
pub(crate) fn ensure() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        for prefix in ["https", "http"] {
            // SAFETY: libgit2 asks that registration not race the creation of transports; `Once` runs it
            // exactly once, and every fetch, push and clone in this crate calls `ensure` before making one.
            let done = unsafe {
                git2::transport::register(prefix, |remote| Transport::smart(remote, true, Http))
            };
            if let Err(err) = done {
                tracing::error!(%err, prefix, "couldn't register the HTTP transport");
            }
        }
    });
}

struct Http;

impl SmartSubtransport for Http {
    fn action(
        &self,
        url: &str,
        action: Service,
    ) -> Result<Box<dyn SmartSubtransportStream>, git2::Error> {
        let (base, auth) = split_auth(url);
        let base = base.trim_end_matches('/');
        let (path, post) = match action {
            Service::UploadPackLs => ("/info/refs?service=git-upload-pack", None),
            Service::UploadPack => ("/git-upload-pack", Some("upload-pack")),
            Service::ReceivePackLs => ("/info/refs?service=git-receive-pack", None),
            Service::ReceivePack => ("/git-receive-pack", Some("receive-pack")),
        };
        Ok(Box::new(Stream {
            url: format!("{base}{path}"),
            auth,
            post,
            body: Vec::new(),
            response: None,
        }))
    }

    fn close(&self) -> Result<(), git2::Error> {
        Ok(())
    }
}

/// `https://user:pass@host/x` as `https://host/x` and its Basic credentials.
fn split_auth(url: &str) -> (String, Option<String>) {
    let Some((scheme, rest)) = url.split_once("://") else {
        return (url.to_owned(), None);
    };
    let host_end = rest.find('/').unwrap_or(rest.len());
    let Some(at) = rest[..host_end].rfind('@') else {
        return (url.to_owned(), None);
    };
    let userinfo = percent_decode(&rest[..at]);
    let auth = base64::engine::general_purpose::STANDARD.encode(userinfo);
    (
        format!("{scheme}://{}", &rest[at + 1..]),
        Some(format!("Basic {auth}")),
    )
}

fn percent_decode(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 3 <= b.len()
            && let Some(v) = s
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
        {
            out.push(v);
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

struct Stream {
    url: String,
    auth: Option<String>,
    /// `Some(service)` for a POST with the written body; `None` for the GET of the refs.
    post: Option<&'static str>,
    body: Vec<u8>,
    response: Option<Cursor<Vec<u8>>>,
}

impl Read for Stream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.response.is_none() {
            let body = std::mem::take(&mut self.body);
            let (url, auth, post) = (self.url.clone(), self.auth.clone(), self.post);
            // its own thread and runtime, so a caller inside a Tokio runtime never nests one
            let bytes = std::thread::spawn(move || send(&url, auth.as_deref(), post, body))
                .join()
                .map_err(|_| io::Error::other("the request thread stopped"))??;
            self.response = Some(Cursor::new(bytes));
        }
        self.response.as_mut().map_or(Ok(0), |r| r.read(buf))
    }
}

impl Write for Stream {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.body.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

// ponytail: each response is held whole in memory before libgit2 reads it, fine for papers' repositories;
// stream it through a channel if someone syncs gigabytes
fn send(url: &str, auth: Option<&str>, post: Option<&str>, body: Vec<u8>) -> io::Result<Vec<u8>> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    rt.block_on(async {
        let client = reqwest::Client::builder()
            .user_agent("git/2.0 (Spectrum)")
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(120))
            .build()
            .map_err(io::Error::other)?;
        let mut req = match post {
            Some(service) => client
                .post(url)
                .header(
                    "content-type",
                    format!("application/x-git-{service}-request"),
                )
                .header("accept", format!("application/x-git-{service}-result"))
                .body(body),
            None => client.get(url),
        };
        if let Some(auth) = auth {
            req = req.header("authorization", auth);
        }
        let res = req
            .send()
            .await
            .map_err(|e| io::Error::new(io::ErrorKind::ConnectionRefused, offline_message(e)))?;
        let status = res.status();
        if !status.is_success() {
            return Err(io::Error::other(format!(
                "GitHub answered {}",
                status.as_u16()
            )));
        }
        Ok(res.bytes().await.map_err(io::Error::other)?.to_vec())
    })
}

fn offline_message(err: reqwest::Error) -> String {
    format!("couldn’t reach the server: {}", err.without_url())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_leave_the_url() {
        let (url, auth) = split_auth("https://x-access-token:ab%2Fc@github.com/o/r.git");
        assert_eq!(url, "https://github.com/o/r.git");
        let want = base64::engine::general_purpose::STANDARD.encode("x-access-token:ab/c");
        assert_eq!(auth.unwrap(), format!("Basic {want}"));
        assert_eq!(
            split_auth("http://127.0.0.1:9/o/r.git"),
            ("http://127.0.0.1:9/o/r.git".into(), None)
        );
    }
}
