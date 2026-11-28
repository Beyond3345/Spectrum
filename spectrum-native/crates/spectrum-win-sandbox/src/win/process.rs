//! Starting the program, suspended, with its identity and its three pipes and nothing else.

use std::fs::File;
use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::{SECURITY_CAPABILITIES, SID_AND_ATTRIBUTES};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CREATE_NO_WINDOW, CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, CreateProcessAsUserW,
    CreateProcessW, DeleteProcThreadAttributeList, EXTENDED_STARTUPINFO_PRESENT,
    GetExitCodeProcess, InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST,
    PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, PROCESS_INFORMATION, ResumeThread,
    STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOEXW, TerminateProcess,
    UpdateProcThreadAttribute, WaitForSingleObject,
};

use spectrum_win_sandbox::protocol::KILLED_EXIT_CODE;

use super::sid::Sid;
use super::{aligned, dword, last_error, own, wide};
use crate::Failure;

const SE_GROUP_ENABLED: u32 = 4;
/// `PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT`: a less-privileged `AppContainer`, which
/// is not a member of ALL APPLICATION PACKAGES and so reads far less of the system.
const ALL_APPLICATION_PACKAGES_OPT_OUT: u32 = 1;

/// An anonymous pipe: the end to read and the end to write. Neither is inherited until
/// [`spawn_suspended`] is given it.
pub(crate) fn pipe() -> Result<(File, File), Failure> {
    let (mut read, mut write): (HANDLE, HANDLE) = (null_mut(), null_mut());
    // SAFETY: two outputs valid for writes, default security and size
    if unsafe { CreatePipe(&raw mut read, &raw mut write, null(), 0) } == 0 {
        return Err(last_error("Make a pipe"));
    }
    // SAFETY: two handles CreatePipe has just returned
    unsafe { Ok((File::from(own(read)), File::from(own(write)))) }
}

/// Who the program runs as.
pub(crate) enum Identity<'a> {
    /// A less-privileged `AppContainer` with these capabilities.
    Container {
        sid: &'a Sid,
        capabilities: &'a [Sid],
    },
    /// A primary token.
    Token(&'a OwnedHandle),
}

pub(crate) struct Spawn<'a> {
    pub command: &'a str,
    pub command_line: &'a str,
    pub environment: &'a [u16],
    pub cwd: &'a str,
    /// The program's ends of its stdin, stdout and stderr: the only handles it inherits.
    pub stdio: [&'a File; 3],
    pub identity: Identity<'a>,
}

struct Attributes(Vec<u64>);

impl Attributes {
    fn new(count: u32) -> Result<Self, Failure> {
        let mut bytes = 0_usize;
        // SAFETY: a size query: no list is written
        unsafe { InitializeProcThreadAttributeList(null_mut(), count, 0, &raw mut bytes) };
        if bytes == 0 {
            return Err(last_error("Size the process attributes"));
        }
        let mut buffer = aligned(bytes);
        // SAFETY: the buffer is at least `bytes` bytes
        if unsafe {
            InitializeProcThreadAttributeList(buffer.as_mut_ptr().cast(), count, 0, &raw mut bytes)
        } == 0
        {
            return Err(last_error("Initialise the process attributes"));
        }
        Ok(Self(buffer))
    }

    fn list(&mut self) -> LPPROC_THREAD_ATTRIBUTE_LIST {
        self.0.as_mut_ptr().cast()
    }

    /// # Safety
    /// `value` points to `bytes` bytes of what `attribute` takes, and they outlive this list.
    unsafe fn set<T>(
        &mut self,
        attribute: u32,
        value: *const T,
        bytes: usize,
    ) -> Result<(), Failure> {
        // SAFETY: an initialised list with room for the attribute; the caller vouches for the value
        let set = unsafe {
            UpdateProcThreadAttribute(
                self.list(),
                0,
                attribute as usize,
                value.cast(),
                bytes,
                null_mut(),
                null(),
            )
        };
        if set == 0 {
            return Err(last_error("Set a process attribute"));
        }
        Ok(())
    }
}

impl Drop for Attributes {
    fn drop(&mut self) {
        // SAFETY: a list InitializeProcThreadAttributeList initialised
        unsafe { DeleteProcThreadAttributeList(self.list()) };
    }
}

/// A started program. Dropping it kills it, if it is still there.
pub(crate) struct Process {
    handle: OwnedHandle,
    thread: OwnedHandle,
    pub pid: u32,
}

/// Starts the program with its first thread suspended, so it can be put in a job before it
/// runs a single instruction. It has no console window, and inherits its three pipes only.
pub(crate) fn spawn_suspended(spawn: &Spawn<'_>) -> Result<Process, Failure> {
    let handles: [HANDLE; 3] = spawn.stdio.map(AsRawHandle::as_raw_handle);
    for handle in handles {
        // SAFETY: an open handle
        if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) } == 0 {
            return Err(last_error("Let the program inherit a pipe"));
        }
    }

    // everything the attribute list points to is declared before it, so it is dropped after it
    let mut capability_list: Vec<SID_AND_ATTRIBUTES> = Vec::new();
    let mut capabilities = SECURITY_CAPABILITIES::default();
    let policy = ALL_APPLICATION_PACKAGES_OPT_OUT;
    let mut attributes = Attributes::new(match spawn.identity {
        Identity::Container { .. } => 3,
        Identity::Token(_) => 1,
    })?;
    if let Identity::Container {
        sid,
        capabilities: held,
    } = spawn.identity
    {
        capability_list.extend(held.iter().map(|capability| SID_AND_ATTRIBUTES {
            Sid: capability.as_ptr(),
            Attributes: SE_GROUP_ENABLED,
        }));
        capabilities.AppContainerSid = sid.as_ptr();
        capabilities.Capabilities = capability_list.as_mut_ptr();
        capabilities.CapabilityCount = dword(capability_list.len());
        // SAFETY: both values are locals declared before `attributes`, of the types and sizes
        // these attributes take; the SIDs they point to belong to the caller
        unsafe {
            attributes.set(
                PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                &raw const capabilities,
                size_of::<SECURITY_CAPABILITIES>(),
            )?;
            attributes.set(
                PROC_THREAD_ATTRIBUTE_ALL_APPLICATION_PACKAGES_POLICY,
                &raw const policy,
                size_of::<u32>(),
            )?;
        }
    }
    // SAFETY: an array of three inheritable handles, declared before `attributes`
    unsafe {
        attributes.set(
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            handles.as_ptr(),
            size_of_val(&handles),
        )?;
    }

    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = dword(size_of::<STARTUPINFOEXW>());
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    startup.StartupInfo.wShowWindow = 0; // SW_HIDE, for a program that makes a window anyway
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[1];
    startup.StartupInfo.hStdError = handles[2];
    startup.lpAttributeList = attributes.list();

    let command = wide(spawn.command);
    let mut command_line = wide(spawn.command_line);
    let cwd = wide(spawn.cwd);
    let flags = EXTENDED_STARTUPINFO_PRESENT
        | CREATE_SUSPENDED
        | CREATE_UNICODE_ENVIRONMENT
        | CREATE_NO_WINDOW;
    let mut info = PROCESS_INFORMATION::default();
    // SAFETY: zero-ended strings (the command line writable, as Windows asks), an environment
    // block that ends with two zeros, a startup structure whose size says it carries the
    // attribute list, and an output valid for writes; all outlive the call
    let created = unsafe {
        match spawn.identity {
            Identity::Container { .. } => CreateProcessW(
                command.as_ptr(),
                command_line.as_mut_ptr(),
                null(),
                null(),
                1,
                flags,
                spawn.environment.as_ptr().cast(),
                cwd.as_ptr(),
                &raw const startup.StartupInfo,
                &raw mut info,
            ),
            Identity::Token(token) => CreateProcessAsUserW(
                token.as_raw_handle(),
                command.as_ptr(),
                command_line.as_mut_ptr(),
                null(),
                null(),
                1,
                flags,
                spawn.environment.as_ptr().cast(),
                cwd.as_ptr(),
                &raw const startup.StartupInfo,
                &raw mut info,
            ),
        }
    };
    if created == 0 {
        return Err(last_error(&format!("Start “{}” isolated", spawn.command)));
    }
    // SAFETY: two handles the call has just returned
    unsafe {
        Ok(Process {
            handle: own(info.hProcess),
            thread: own(info.hThread),
            pid: info.dwProcessId,
        })
    }
}

impl Process {
    pub(crate) fn handle(&self) -> &OwnedHandle {
        &self.handle
    }

    pub(crate) fn resume(&self) -> Result<(), Failure> {
        // SAFETY: the thread handle of this process
        if unsafe { ResumeThread(self.thread.as_raw_handle()) } == u32::MAX {
            return Err(last_error("Resume the program"));
        }
        Ok(())
    }

    /// Whether the program has exited, waiting up to `milliseconds` for it.
    pub(crate) fn wait(&self, milliseconds: u32) -> Result<bool, Failure> {
        // SAFETY: an open process handle
        match unsafe { WaitForSingleObject(self.handle.as_raw_handle(), milliseconds) } {
            WAIT_OBJECT_0 => Ok(true),
            WAIT_TIMEOUT => Ok(false),
            _ => Err(last_error("Wait for the program")),
        }
    }

    pub(crate) fn exit_code(&self) -> Result<u32, Failure> {
        let mut code = 0_u32;
        // SAFETY: an open process handle and an output valid for writes
        if unsafe { GetExitCodeProcess(self.handle.as_raw_handle(), &raw mut code) } == 0 {
            return Err(last_error("Read the program's exit code"));
        }
        Ok(code)
    }
}

impl Drop for Process {
    fn drop(&mut self) {
        // a program that was never put in the job must not be left suspended for ever
        // SAFETY: an open process handle; on one that has exited this does nothing
        unsafe { TerminateProcess(self.handle.as_raw_handle(), KILLED_EXIT_CODE) };
    }
}
