//! The job object every program runs in.

use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::ptr::null;

use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_ACTIVE_PROCESS,
    JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION, JOB_OBJECT_LIMIT_JOB_MEMORY,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_BASIC_UI_RESTRICTIONS,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectBasicUIRestrictions,
    JobObjectExtendedLimitInformation, SetInformationJobObject, TerminateJobObject,
};

use spectrum_win_sandbox::protocol::Limits;

use super::{dword, last_error, own};
use crate::Failure;

/// Other processes' window handles, the clipboard (read and write), system parameters, display
/// settings, global atoms, other desktops, and logging off or shutting down.
const EVERY_UI_LIMIT: u32 = 0xFF;

/// Closing it kills every process in it.
pub(crate) struct Job(OwnedHandle);

impl Job {
    /// No process leaves the job: the breakaway flags are never set. `ui_limits` are refused
    /// by Windows for a job inside another, so the caller may have to do without.
    pub(crate) fn create(limits: &Limits, ui_limits: bool) -> Result<Self, Failure> {
        // SAFETY: default security, no name
        let raw = unsafe { CreateJobObjectW(null(), null()) };
        if raw.is_null() {
            return Err(last_error("Create the job"));
        }
        // SAFETY: a handle CreateJobObjectW has just returned
        let job = Self(unsafe { own(raw) });

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
            // a crash ends the program; no error dialog waits for a click nobody can make
            | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION;
        info.BasicLimitInformation.ActiveProcessLimit = limits.max_processes;
        if let Some(bytes) = limits.memory_bytes {
            info.BasicLimitInformation.LimitFlags |= JOB_OBJECT_LIMIT_JOB_MEMORY;
            info.JobMemoryLimit = usize::try_from(bytes).unwrap_or(usize::MAX);
        }
        // SAFETY: the structure this information class takes, with its size
        let set = unsafe {
            SetInformationJobObject(
                raw,
                JobObjectExtendedLimitInformation,
                (&raw const info).cast(),
                dword(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>()),
            )
        };
        if set == 0 {
            return Err(last_error("Set the job's limits"));
        }
        if ui_limits {
            let ui = JOBOBJECT_BASIC_UI_RESTRICTIONS {
                UIRestrictionsClass: EVERY_UI_LIMIT,
            };
            // SAFETY: the structure this information class takes, with its size
            let set = unsafe {
                SetInformationJobObject(
                    raw,
                    JobObjectBasicUIRestrictions,
                    (&raw const ui).cast(),
                    dword(size_of::<JOBOBJECT_BASIC_UI_RESTRICTIONS>()),
                )
            };
            if set == 0 {
                return Err(last_error("Set the job's desktop limits"));
            }
        }
        Ok(job)
    }

    pub(crate) fn assign(&self, process: &OwnedHandle) -> Result<(), Failure> {
        // SAFETY: two open handles
        if unsafe { AssignProcessToJobObject(self.0.as_raw_handle(), process.as_raw_handle()) } == 0
        {
            return Err(last_error("Put the program in the job"));
        }
        Ok(())
    }

    /// Kills every process in the job.
    pub(crate) fn terminate(&self, code: u32) {
        // SAFETY: an open job handle; a job with nothing left in it is not an error to act on
        unsafe { TerminateJobObject(self.0.as_raw_handle(), code) };
    }
}
