//! An `AppContainer` profile that lives for one run.

use std::ptr::{null, null_mut};

use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile,
};
use windows_sys::Win32::Security::{FreeSid, PSID};

use super::sid::Sid;
use super::wide;
use crate::Failure;

pub(crate) struct Profile {
    /// Empty once deleted.
    name: Vec<u16>,
    sid: Sid,
}

impl Profile {
    pub(crate) fn create(name: &str) -> Result<Self, Failure> {
        let name = wide(name);
        let description = wide("Spectrum isolated program");
        let mut sid: PSID = null_mut();
        // SAFETY: the strings are zero-ended, no capabilities are passed, `sid` is valid for writes
        let result = unsafe {
            CreateAppContainerProfile(
                name.as_ptr(),
                name.as_ptr(),
                description.as_ptr(),
                null(),
                0,
                &raw mut sid,
            )
        };
        if result < 0 || sid.is_null() {
            return Err(Failure::os(format!(
                "Create the AppContainer profile: HRESULT {result:#010x}"
            )));
        }
        // SAFETY: on success `sid` is a valid SID that FreeSid frees
        let sid = unsafe {
            let copy = Sid::copy(sid);
            FreeSid(sid);
            copy
        };
        Ok(Self { name, sid })
    }

    pub(crate) fn sid(&self) -> &Sid {
        &self.sid
    }

    /// Removes the profile and its folder under `%LOCALAPPDATA%\Packages`.
    pub(crate) fn delete(&mut self) -> Result<(), String> {
        if self.name.is_empty() {
            return Ok(());
        }
        // SAFETY: the name is zero-ended
        let result = unsafe { DeleteAppContainerProfile(self.name.as_ptr()) };
        self.name.clear();
        if result < 0 {
            return Err(format!(
                "The AppContainer profile could not be removed: HRESULT {result:#010x}"
            ));
        }
        Ok(())
    }
}

impl Drop for Profile {
    fn drop(&mut self) {
        // delete() was the place to hear of a failure
        let _ = self.delete();
    }
}
