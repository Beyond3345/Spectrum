//! Security identifiers, as owned copies.

use std::ptr::null_mut;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Isolation::DeriveAppContainerSidFromAppContainerName;
use windows_sys::Win32::Security::{
    CreateWellKnownSid, DeriveCapabilitySidsFromName, EqualSid, FreeSid, GetLengthSid, PSID,
    WELL_KNOWN_SID_TYPE,
};

use super::{aligned, last_error, wide};
use crate::Failure;

/// `SECURITY_MAX_SID_SIZE`.
const MAX_SID_BYTES: u32 = 68;

#[derive(Clone)]
pub(crate) struct Sid(Vec<u64>);

impl Sid {
    pub(crate) fn as_ptr(&self) -> PSID {
        self.0.as_ptr().cast_mut().cast()
    }

    /// # Safety
    /// `sid` points to a valid SID.
    pub(super) unsafe fn copy(sid: PSID) -> Self {
        // SAFETY: the caller's SID is valid, so its length is; the buffer is at least that long
        unsafe {
            let bytes = GetLengthSid(sid) as usize;
            let mut buffer = aligned(bytes);
            std::ptr::copy_nonoverlapping(
                sid.cast::<u8>(),
                buffer.as_mut_ptr().cast::<u8>(),
                bytes,
            );
            Self(buffer)
        }
    }

    /// # Safety
    /// `other` points to a valid SID.
    pub(super) unsafe fn is(&self, other: PSID) -> bool {
        // SAFETY: both point to valid SIDs
        unsafe { EqualSid(self.as_ptr(), other) != 0 }
    }

    pub(crate) fn well_known(kind: WELL_KNOWN_SID_TYPE) -> Result<Self, Failure> {
        let mut buffer = aligned(MAX_SID_BYTES as usize);
        let mut bytes = MAX_SID_BYTES;
        // SAFETY: the buffer holds the largest SID, and `bytes` says so
        let made = unsafe {
            CreateWellKnownSid(kind, null_mut(), buffer.as_mut_ptr().cast(), &raw mut bytes)
        };
        if made == 0 {
            return Err(last_error("Make a well-known identifier"));
        }
        Ok(Self(buffer))
    }

    /// The SID of a capability, by its name. Any name has one; a token holds it only if the
    /// process was started with it.
    pub(crate) fn capability(name: &str) -> Result<Self, Failure> {
        let name = wide(name);
        let (mut groups, mut group_count) = (null_mut::<PSID>(), 0_u32);
        let (mut capabilities, mut capability_count) = (null_mut::<PSID>(), 0_u32);
        // SAFETY: the name is zero-ended and the four outputs are valid for writes
        let derived = unsafe {
            DeriveCapabilitySidsFromName(
                name.as_ptr(),
                &raw mut groups,
                &raw mut group_count,
                &raw mut capabilities,
                &raw mut capability_count,
            )
        };
        if derived == 0 {
            return Err(last_error("Derive a capability"));
        }
        // SAFETY: on success both arrays hold their counts of valid SIDs, each allocated with
        // LocalAlloc, as the arrays are; each is read before it is freed, and freed once
        unsafe {
            let sid = (capability_count > 0).then(|| Self::copy(*capabilities));
            for index in 0..group_count as usize {
                LocalFree(*groups.add(index));
            }
            for index in 0..capability_count as usize {
                LocalFree(*capabilities.add(index));
            }
            LocalFree(groups.cast());
            LocalFree(capabilities.cast());
            sid.ok_or_else(|| Failure::os("Derive a capability: Windows returned none"))
        }
    }

    /// The SID an `AppContainer` of this name has, whether or not its profile exists.
    pub(crate) fn of_container_name(name: &str) -> Result<Self, Failure> {
        let name = wide(name);
        let mut sid: PSID = null_mut();
        // SAFETY: the name is zero-ended and `sid` is valid for writes
        let result =
            unsafe { DeriveAppContainerSidFromAppContainerName(name.as_ptr(), &raw mut sid) };
        if result < 0 || sid.is_null() {
            return Err(Failure::os(format!(
                "Derive the run's identifier: HRESULT {result:#010x}"
            )));
        }
        // SAFETY: on success `sid` is a valid SID that FreeSid frees
        unsafe {
            let copy = Self::copy(sid);
            FreeSid(sid);
            Ok(copy)
        }
    }
}
