//! Bytes from the system's random source: the keystore's salt and project ids.

use std::fmt::Write;

use crate::CoreError;

pub(crate) fn bytes<const N: usize>() -> Result<[u8; N], CoreError> {
    let mut buf = [0u8; N];
    fill(&mut buf)
        .map_err(|e| CoreError::Keystore(format!("The system’s random source failed: {e}.")))?;
    Ok(buf)
}

#[cfg(unix)]
fn fill(buf: &mut [u8]) -> std::io::Result<()> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom")?.read_exact(buf)
}

#[cfg(windows)]
fn fill(buf: &mut [u8]) -> std::io::Result<()> {
    crate::win32::random(buf)
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// A random (version 4) UUID, as `crypto.randomUUID()` gives 2.8's project ids.
pub(crate) fn uuid_v4() -> Result<String, CoreError> {
    let mut b = bytes::<16>()?;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let h = hex(&b);
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn uuid_has_the_v4_shape() {
        let id = super::uuid_v4().unwrap();
        assert_eq!(id.len(), 36);
        assert_eq!(&id[14..15], "4");
        assert!(matches!(&id[19..20], "8" | "9" | "a" | "b"));
        assert_ne!(id, super::uuid_v4().unwrap());
    }
}
