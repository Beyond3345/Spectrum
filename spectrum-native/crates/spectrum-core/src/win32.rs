//! The Win32 calls `spectrum-core` makes, behind a safe API: DPAPI for the keys file (in place of 2.8's
//! PowerShell), and the system's random source.
#![allow(unsafe_code)]

use std::io;
use std::ptr;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    BCRYPT_USE_SYSTEM_PREFERRED_RNG, BCryptGenRandom, CRYPT_INTEGER_BLOB,
    CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
};

fn blob(data: &[u8]) -> io::Result<CRYPT_INTEGER_BLOB> {
    Ok(CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(data.len())
            .map_err(|_| io::Error::other("data too large for DPAPI"))?,
        // DPAPI only reads the input blob
        pbData: data.as_ptr().cast_mut(),
    })
}

/// Copies DPAPI's output out and frees it with `LocalFree`, as the API requires.
fn take(out: &CRYPT_INTEGER_BLOB) -> Vec<u8> {
    if out.pbData.is_null() {
        return Vec::new();
    }
    // SAFETY: on success DPAPI hands back cbData readable bytes at pbData, allocated with LocalAlloc.
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
    // SAFETY: pbData came from DPAPI's LocalAlloc and is freed once, here.
    unsafe { LocalFree(out.pbData.cast()) };
    bytes
}

/// `ProtectedData.Protect(data, null, CurrentUser)`: only this Windows account can decrypt the result.
pub(crate) fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
    let input = blob(data)?;
    let mut out = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // SAFETY: input points at data for the call's length; the optional pointers are null; out is a valid
    // place for DPAPI to write its blob.
    let ok = unsafe {
        CryptProtectData(
            &raw const input,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &raw mut out,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(take(&out))
}

/// `ProtectedData.Unprotect(data, null, CurrentUser)`.
pub(crate) fn unprotect(data: &[u8]) -> io::Result<Vec<u8>> {
    let input = blob(data)?;
    let mut out = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // SAFETY: as in protect; the description out-pointer is null, so none is allocated.
    let ok = unsafe {
        CryptUnprotectData(
            &raw const input,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &raw mut out,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(take(&out))
}

pub(crate) fn random(buf: &mut [u8]) -> io::Result<()> {
    let len = u32::try_from(buf.len()).map_err(|_| io::Error::other("buffer too large"))?;
    // SAFETY: buf is writable for len bytes; a null algorithm handle with the system-preferred flag is
    // the documented way to use the default RNG.
    let status = unsafe {
        BCryptGenRandom(
            ptr::null_mut(),
            buf.as_mut_ptr(),
            len,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status == 0 {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "BCryptGenRandom failed: {status:#x}"
        )))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn dpapi_round_trips() {
        let sealed = super::protect(b"spectrum").unwrap();
        assert_ne!(sealed, b"spectrum");
        assert_eq!(super::unprotect(&sealed).unwrap(), b"spectrum");
    }
}
