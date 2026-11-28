//! Win32 calls, each behind a safe function: the only `unsafe` of the crate (`main.rs` allows
//! it for this module alone). Every `unsafe` block passes pointers to buffers that outlive the
//! call and checks the call's result before anything it wrote is read.

pub(crate) mod acl;
pub(crate) mod container;
pub(crate) mod job;
pub(crate) mod process;
pub(crate) mod sid;
pub(crate) mod token;

use std::os::windows::io::{FromRawHandle, OwnedHandle};

use windows_sys::Win32::Foundation::HANDLE;

use crate::Failure;

/// A string as Win32 takes it: UTF-16 with the closing zero.
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// The failure of the call that has just returned. Call it before anything else.
fn last_error(what: &str) -> Failure {
    Failure::os(format!("{what}: {}", std::io::Error::last_os_error()))
}

/// Takes ownership of a handle a call has just returned.
///
/// # Safety
/// `raw` is an open handle that nothing else closes.
unsafe fn own(raw: HANDLE) -> OwnedHandle {
    unsafe { OwnedHandle::from_raw_handle(raw) }
}

/// A length as the `DWORD` Win32 takes. Nothing here is near 4 GB.
fn dword(length: usize) -> u32 {
    u32::try_from(length).unwrap_or(u32::MAX)
}

/// A buffer of at least `bytes` bytes, aligned for any Win32 structure.
fn aligned(bytes: usize) -> Vec<u64> {
    vec![0; bytes.div_ceil(8)]
}
