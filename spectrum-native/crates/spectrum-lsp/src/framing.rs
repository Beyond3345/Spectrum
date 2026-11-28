//! The LSP base protocol: each JSON body behind a `Content-Length` header block.

const HEADER_END: &[u8] = b"\r\n\r\n";

/// A body in the LSP's framing.
pub(crate) fn encode(body: &[u8]) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
    out.extend_from_slice(body);
    out
}

/// Joins the bytes of a stream, however they're split, into message bodies.
#[derive(Default)]
pub(crate) struct Decoder {
    buf: Vec<u8>,
}

impl Decoder {
    pub(crate) fn push(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// The next whole body, if it has all come. A header block with no usable `Content-Length` is dropped
    /// (the stream is still in step after it, at the next header).
    pub(crate) fn next_body(&mut self) -> Option<Vec<u8>> {
        loop {
            let end = self
                .buf
                .windows(HEADER_END.len())
                .position(|w| w == HEADER_END)?;
            let start = end + HEADER_END.len();
            let Some(length) = content_length(&self.buf[..end]) else {
                tracing::warn!("LSP header without Content-Length dropped");
                self.buf.drain(..start);
                continue;
            };
            if self.buf.len() < start + length {
                return None;
            }
            let body = self.buf[start..start + length].to_vec();
            self.buf.drain(..start + length);
            return Some(body);
        }
    }
}

fn content_length(headers: &[u8]) -> Option<usize> {
    String::from_utf8_lossy(headers)
        .split("\r\n")
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse().ok())?
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bodies(decoder: &mut Decoder) -> Vec<String> {
        std::iter::from_fn(|| decoder.next_body())
            .map(|b| String::from_utf8(b).unwrap())
            .collect()
    }

    #[test]
    fn round_trip() {
        let mut d = Decoder::default();
        d.push(&encode(br#"{"a":1}"#));
        assert_eq!(bodies(&mut d), [r#"{"a":1}"#]);
        assert!(d.next_body().is_none());
    }

    #[test]
    fn byte_at_a_time() {
        let wire = [encode(b"{\"x\":true}"), encode(b"[]")].concat();
        let mut d = Decoder::default();
        let mut got = Vec::new();
        for byte in &wire {
            d.push(std::slice::from_ref(byte));
            got.extend(bodies(&mut d));
        }
        assert_eq!(got, ["{\"x\":true}", "[]"]);
    }

    #[test]
    fn several_in_one_read_and_one_split_across_reads() {
        let wire = [encode(b"1"), encode(b"22"), encode(b"333")].concat();
        let (first, rest) = wire.split_at(wire.len() - 2);
        let mut d = Decoder::default();
        d.push(first);
        assert_eq!(bodies(&mut d), ["1", "22"]);
        d.push(rest);
        assert_eq!(bodies(&mut d), ["333"]);
    }

    #[test]
    fn length_counts_bytes_not_chars() {
        // UTF-8 multi-byte text, split inside a character
        let body = r#"{"m":"Abschnitt über 数学 ∑ 😀"}"#;
        let wire = encode(body.as_bytes());
        let cut = wire.len() - 5;
        let mut d = Decoder::default();
        d.push(&wire[..cut]);
        assert!(d.next_body().is_none());
        d.push(&wire[cut..]);
        assert_eq!(bodies(&mut d), [body]);
    }

    #[test]
    fn other_headers_and_case() {
        let mut d = Decoder::default();
        d.push(b"content-type: application/vscode-jsonrpc; charset=utf-8\r\nCONTENT-LENGTH:  2\r\n\r\n{}");
        assert_eq!(bodies(&mut d), ["{}"]);
    }

    #[test]
    fn header_without_length_is_skipped() {
        let mut d = Decoder::default();
        d.push(b"X-Junk: 1\r\n\r\n");
        d.push(&encode(b"ok"));
        assert_eq!(bodies(&mut d), ["ok"]);
    }
}
