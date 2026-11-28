//! Access entries and integrity labels on files and folders, one object at a time.
//!
//! Security is read and set through the object's own handle (`SetKernelObjectSecurity`), which
//! changes that object alone: nothing here asks Windows to carry a change down a tree, where it
//! could follow a junction the program made.

use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::path::Path;
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{
    HANDLE, INVALID_HANDLE_VALUE, LocalFree, WAIT_ABANDONED, WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, EXPLICIT_ACCESS_W, GRANT_ACCESS,
    NO_MULTIPLE_TRUSTEE, SDDL_REVISION_1, SetEntriesInAclW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
    TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, AclSizeInformation, AddAce,
    DACL_SECURITY_INFORMATION, GetAce, GetAclInformation, GetKernelObjectSecurity,
    GetSecurityDescriptorControl, GetSecurityDescriptorDacl, INHERIT_ONLY_ACE, InitializeAcl,
    InitializeSecurityDescriptor, LABEL_SECURITY_INFORMATION, NO_INHERITANCE, PSECURITY_DESCRIPTOR,
    PSID, SE_DACL_AUTO_INHERIT_REQ, SE_DACL_AUTO_INHERITED, SE_DACL_PROTECTED, SECURITY_DESCRIPTOR,
    SUB_CONTAINERS_AND_OBJECTS_INHERIT, SetKernelObjectSecurity, SetSecurityDescriptorControl,
    SetSecurityDescriptorDacl,
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, CreateFileW, FILE_ATTRIBUTE_DIRECTORY,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
    FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    GetFileInformationByHandle, GetFinalPathNameByHandleW, OPEN_EXISTING, READ_CONTROL, WRITE_DAC,
    WRITE_OWNER,
};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, INFINITE, ReleaseMutex, WaitForSingleObject,
};

use spectrum_win_sandbox::paths;
use spectrum_win_sandbox::protocol::Access;

use super::sid::Sid;
use super::{aligned, dword, last_error, own, wide};
use crate::Failure;
use crate::grant::{Object, Objects, Stamp};

/// Read and execute, as Explorer's "Read & execute".
const READ_EXECUTE: u32 = 0x0012_00A9;
/// Read, write and delete, as Explorer's "Modify" (what 2.8's worker granted).
const MODIFY: u32 = 0x0013_01BF;
const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
const ACCESS_DENIED_ACE_TYPE: u8 = 1;
const SECURITY_DESCRIPTOR_REVISION: u32 = 1;
/// Append, for `AddAce`.
const LAST: u32 = u32::MAX;

fn failed(what: &str) -> String {
    last_error(what).message
}

/// An ACL that `SetEntriesInAclW` allocated.
pub(super) struct LocalAcl(*mut ACL);

impl LocalAcl {
    pub(super) fn as_ptr(&self) -> *mut ACL {
        self.0
    }
}

impl Drop for LocalAcl {
    fn drop(&mut self) {
        // SAFETY: the pointer came from SetEntriesInAclW, which allocates with LocalAlloc
        unsafe { LocalFree(self.0.cast()) };
    }
}

/// `old` with an allow entry for `sid` added in its proper place.
///
/// # Safety
/// `old` is null or points to a valid ACL.
pub(super) unsafe fn with_entry(
    old: *const ACL,
    sid: &Sid,
    rights: u32,
    inheritance: u32,
) -> Result<LocalAcl, String> {
    let entry = EXPLICIT_ACCESS_W {
        grfAccessPermissions: rights,
        grfAccessMode: GRANT_ACCESS,
        grfInheritance: inheritance,
        Trustee: TRUSTEE_W {
            pMultipleTrustee: null_mut(),
            MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
            TrusteeForm: TRUSTEE_IS_SID,
            TrusteeType: TRUSTEE_IS_UNKNOWN,
            ptstrName: sid.as_ptr().cast(),
        },
    };
    let mut new = null_mut();
    // SAFETY: one entry whose trustee is a valid SID, an ACL the caller vouches for, and an
    // output valid for writes
    let code = unsafe { SetEntriesInAclW(1, &raw const entry, old, &raw mut new) };
    if code != 0 || new.is_null() {
        let error = std::io::Error::from_raw_os_error(code.cast_signed());
        return Err(format!("Add an access entry: {error}"));
    }
    Ok(LocalAcl(new))
}

/// The entries of an ACL.
///
/// # Safety
/// `acl` points to a valid ACL, which outlives the pointers returned.
unsafe fn entries(acl: *const ACL) -> Result<Vec<*const ACE_HEADER>, String> {
    let mut info = ACL_SIZE_INFORMATION::default();
    // SAFETY: a valid ACL and a structure of the size passed
    let read = unsafe {
        GetAclInformation(
            acl,
            (&raw mut info).cast(),
            dword(size_of::<ACL_SIZE_INFORMATION>()),
            AclSizeInformation,
        )
    };
    if read == 0 {
        return Err(failed("Read an access list"));
    }
    let mut found = Vec::new();
    for index in 0..info.AceCount {
        let mut entry = null_mut();
        // SAFETY: a valid ACL, an index below its count, an output valid for writes
        if unsafe { GetAce(acl, index, &raw mut entry) } == 0 {
            return Err(failed("Read an access entry"));
        }
        found.push(entry.cast_const().cast::<ACE_HEADER>());
    }
    Ok(found)
}

/// Whether a plain allow or deny entry names `sid`.
///
/// # Safety
/// `entry` points to a valid ACE.
#[allow(clippy::cast_ptr_alignment)] // Windows aligns every entry of an ACL to four bytes
unsafe fn names(entry: *const ACE_HEADER, sid: &Sid) -> bool {
    // SAFETY: a valid ACE starts with its header, and an allow or deny entry is a header, a
    // mask and then the SID
    unsafe {
        let kind = (*entry).AceType;
        if kind != ACCESS_ALLOWED_ACE_TYPE && kind != ACCESS_DENIED_ACE_TYPE {
            return false;
        }
        let start = &raw const (*entry.cast::<ACCESS_ALLOWED_ACE>()).SidStart;
        sid.is(start.cast_mut().cast::<core::ffi::c_void>() as PSID)
    }
}

/// `old` without the entries that name `sid`, or `None` when it has none.
///
/// # Safety
/// `old` points to a valid ACL.
unsafe fn without(old: *const ACL, sid: &Sid) -> Result<Option<Vec<u64>>, String> {
    // SAFETY: the caller's ACL is valid; the new one is as large, so every kept entry fits
    unsafe {
        let all = entries(old)?;
        if !all.iter().any(|entry| names(*entry, sid)) {
            return Ok(None);
        }
        let bytes = (*old).AclSize;
        let revision = u32::from((*old).AclRevision);
        let mut buffer = aligned(usize::from(bytes));
        let new = buffer.as_mut_ptr().cast::<ACL>();
        if InitializeAcl(new, u32::from(bytes), revision) == 0 {
            return Err(failed("Make an access list"));
        }
        for entry in all {
            if names(entry, sid) {
                continue;
            }
            let size = u32::from((*entry).AceSize);
            if AddAce(new, revision, LAST, entry.cast(), size) == 0 {
                return Err(failed("Copy an access entry"));
            }
        }
        Ok(Some(buffer))
    }
}

/// An object's DACL as Windows returned it.
struct Security(Vec<u64>);

impl Security {
    fn read(handle: HANDLE) -> Result<Self, String> {
        let mut needed = 0_u32;
        // SAFETY: a size query: no buffer is written
        unsafe {
            GetKernelObjectSecurity(
                handle,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                0,
                &raw mut needed,
            );
        }
        if needed == 0 {
            return Err(failed("Read an object's security"));
        }
        let mut buffer = aligned(needed as usize);
        // SAFETY: the buffer is at least `needed` bytes
        let read = unsafe {
            GetKernelObjectSecurity(
                handle,
                DACL_SECURITY_INFORMATION,
                buffer.as_mut_ptr().cast(),
                needed,
                &raw mut needed,
            )
        };
        if read == 0 {
            return Err(failed("Read an object's security"));
        }
        Ok(Self(buffer))
    }

    fn descriptor(&self) -> PSECURITY_DESCRIPTOR {
        self.0.as_ptr().cast_mut().cast()
    }

    /// The DACL, inside this buffer. `None`: the object has none, so it is open to everyone
    /// and an entry would only close it.
    fn dacl(&self) -> Result<Option<*mut ACL>, String> {
        let (mut present, mut defaulted, mut dacl) = (0, 0, null_mut());
        // SAFETY: a descriptor Windows wrote and three outputs valid for writes
        let read = unsafe {
            GetSecurityDescriptorDacl(
                self.descriptor(),
                &raw mut present,
                &raw mut dacl,
                &raw mut defaulted,
            )
        };
        if read == 0 {
            return Err(failed("Read an object's access list"));
        }
        Ok((present != 0 && !dacl.is_null()).then_some(dacl))
    }

    fn control(&self) -> Result<u16, String> {
        let (mut control, mut revision) = (0_u16, 0_u32);
        // SAFETY: a descriptor Windows wrote and two outputs valid for writes
        let read = unsafe {
            GetSecurityDescriptorControl(self.descriptor(), &raw mut control, &raw mut revision)
        };
        if read == 0 {
            return Err(failed("Read an object's security flags"));
        }
        Ok(control)
    }
}

/// Sets `dacl` on the object, keeping whether it inherits from its folder.
///
/// # Safety
/// `dacl` points to a valid ACL.
unsafe fn set_dacl(handle: HANDLE, control: u16, dacl: *const ACL) -> Result<(), String> {
    let mut descriptor = SECURITY_DESCRIPTOR::default();
    let pointer: PSECURITY_DESCRIPTOR = (&raw mut descriptor).cast();
    let mut keep = control & SE_DACL_PROTECTED;
    if control & SE_DACL_AUTO_INHERITED != 0 {
        // the kernel keeps the flag only when asked with both
        keep |= SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ;
    }
    let all = SE_DACL_PROTECTED | SE_DACL_AUTO_INHERITED | SE_DACL_AUTO_INHERIT_REQ;
    // SAFETY: the descriptor is initialised before it is used and lives to the end of the
    // call, as the caller's ACL does
    let set = unsafe {
        InitializeSecurityDescriptor(pointer, SECURITY_DESCRIPTOR_REVISION) != 0
            && SetSecurityDescriptorDacl(pointer, 1, dacl, 0) != 0
            && SetSecurityDescriptorControl(pointer, all, keep) != 0
            && SetKernelObjectSecurity(handle, DACL_SECURITY_INFORMATION, pointer) != 0
    };
    if set {
        Ok(())
    } else {
        Err(failed("Set an object's access list"))
    }
}

/// A security descriptor that holds only an integrity label, from its SDDL text.
fn label(sddl: &str) -> Result<Vec<u64>, Failure> {
    let text = wide(sddl);
    let mut descriptor: PSECURITY_DESCRIPTOR = null_mut();
    let mut bytes = 0_u32;
    // SAFETY: zero-ended text and two outputs valid for writes
    let made = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            text.as_ptr(),
            SDDL_REVISION_1,
            &raw mut descriptor,
            &raw mut bytes,
        )
    };
    if made == 0 || descriptor.is_null() {
        return Err(last_error("Make an integrity label"));
    }
    let mut buffer = aligned(bytes as usize);
    // SAFETY: Windows allocated `bytes` bytes at `descriptor` with LocalAlloc
    unsafe {
        std::ptr::copy_nonoverlapping(
            descriptor.cast::<u8>(),
            buffer.as_mut_ptr().cast::<u8>(),
            bytes as usize,
        );
        LocalFree(descriptor);
    }
    Ok(buffer)
}

/// The real file system. One per run.
pub(crate) struct WinFs {
    /// This run's own identifier: per-run grants name it, and revoking removes it.
    unique: Sid,
    /// Every sandboxed run's: runtime grants name it and stay.
    runtime: Sid,
    /// Serialises changes with other workers: an entry is added by reading, then writing.
    mutex: OwnedHandle,
    /// Low and medium integrity, for a folder (inherited by what is made in it) and a file.
    low: [Vec<u64>; 2],
    medium: [Vec<u64>; 2],
}

struct Lock<'a>(&'a OwnedHandle);

impl Drop for Lock<'_> {
    fn drop(&mut self) {
        // SAFETY: this thread took the mutex in `WinFs::lock`
        unsafe { ReleaseMutex(self.0.as_raw_handle()) };
    }
}

impl WinFs {
    pub(crate) fn new(unique: Sid, runtime: Sid) -> Result<Self, Failure> {
        // ponytail: one lock a logon session; a second user in the same session (runas) cannot
        // open it and is refused. Add the user's SID to the name if that is ever wanted.
        let name = wide(r"Local\Spectrum.Sandbox.Acl");
        // SAFETY: a zero-ended name and default security
        let raw = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
        if raw.is_null() {
            return Err(last_error("Open the lock that orders access changes"));
        }
        Ok(Self {
            unique,
            runtime,
            // SAFETY: a handle CreateMutexW has just returned
            mutex: unsafe { own(raw) },
            low: [label("S:(ML;OICI;NW;;;LW)")?, label("S:(ML;;NW;;;LW)")?],
            medium: [label("S:(ML;OICI;NW;;;ME)")?, label("S:(ML;;NW;;;ME)")?],
        })
    }

    fn lock(&self) -> Result<Lock<'_>, String> {
        // SAFETY: a mutex handle this struct owns
        match unsafe { WaitForSingleObject(self.mutex.as_raw_handle(), INFINITE) } {
            // abandoned: a worker died holding it, between two whole changes at worst
            WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Lock(&self.mutex)),
            _ => Err(failed("Wait for the lock that orders access changes")),
        }
    }

    fn set_label(handle: HANDLE, label: &[u64]) -> Result<(), String> {
        let descriptor: PSECURITY_DESCRIPTOR = label.as_ptr().cast_mut().cast();
        // SAFETY: a whole descriptor made by `label`, which Windows only reads
        if unsafe { SetKernelObjectSecurity(handle, LABEL_SECURITY_INFORMATION, descriptor) } == 0 {
            return Err(failed("Set an integrity label"));
        }
        Ok(())
    }
}

/// Where a handle really is, as a normalised path.
fn final_path(handle: HANDLE) -> Result<String, String> {
    let mut buffer = vec![0_u16; 512];
    loop {
        // SAFETY: the buffer is as long as the length passed
        let length = unsafe {
            GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), dword(buffer.len()), 0)
        } as usize;
        if length == 0 {
            return Err(failed("Resolve a path"));
        }
        if length < buffer.len() {
            buffer.truncate(length);
            break;
        }
        buffer.resize(length + 1, 0);
    }
    let text = String::from_utf16(&buffer).map_err(|_| "A path is not Unicode".to_owned())?;
    paths::normalise(Path::new(&text)).map_err(|e| e.to_string())
}

impl Objects for WinFs {
    type Node = OwnedHandle;

    fn open(&self, path: &str, change: Option<Stamp>) -> Result<(OwnedHandle, Object), String> {
        let mut access = READ_CONTROL | FILE_READ_ATTRIBUTES;
        if change.is_some() {
            access |= WRITE_DAC;
        }
        let labels = matches!(
            change,
            Some(
                Stamp::Grant {
                    low_label: true,
                    ..
                } | Stamp::Revoke { reset_label: true }
            )
        );
        if labels {
            access |= WRITE_OWNER;
        }
        // the \\?\ form: long paths, and no name is trimmed or reinterpreted
        let name = wide(&format!(r"\\?\{path}"));
        // SAFETY: a zero-ended name; the flags open the object itself, a folder or a link too
        let raw = unsafe {
            CreateFileW(
                name.as_ptr(),
                access,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
                null_mut(),
            )
        };
        if raw == INVALID_HANDLE_VALUE {
            return Err(failed(&format!("Open “{path}” without following links")));
        }
        // SAFETY: a handle CreateFileW has just returned
        let handle = unsafe { own(raw) };
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        // SAFETY: an open handle and a structure valid for writes
        if unsafe { GetFileInformationByHandle(raw, &raw mut info) } == 0 {
            return Err(failed(&format!("Inspect “{path}”")));
        }
        let object = Object {
            dir: info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0,
            link: info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0,
            hard_links: info.nNumberOfLinks,
            real_path: final_path(raw)?,
        };
        Ok((handle, object))
    }

    fn children(&self, path: &str) -> Result<Vec<String>, String> {
        let listing =
            std::fs::read_dir(format!(r"\\?\{path}")).map_err(|e| format!("List “{path}”: {e}"))?;
        let mut found = Vec::new();
        for entry in listing {
            let entry = entry.map_err(|e| format!("List “{path}”: {e}"))?;
            let child = Path::new(path).join(entry.file_name());
            let child = child
                .into_os_string()
                .into_string()
                .map_err(|_| format!("A name in “{path}” is not Unicode"))?;
            found.push(child);
        }
        Ok(found)
    }

    fn stamp(&self, node: &OwnedHandle, object: &Object, stamp: Stamp) -> Result<(), String> {
        let raw = node.as_raw_handle();
        let which = usize::from(!object.dir);
        let _lock = self.lock()?;
        let security = Security::read(raw)?;
        let control = security.control()?;
        let dacl = security.dacl()?;
        match stamp {
            Stamp::Grant { access, low_label } => {
                let (sid, rights) = match access {
                    Access::Write => (&self.unique, MODIFY),
                    Access::Read => (&self.unique, READ_EXECUTE),
                    Access::Runtime => (&self.runtime, READ_EXECUTE),
                };
                let inheritance = if object.dir {
                    SUB_CONTAINERS_AND_OBJECTS_INHERIT
                } else {
                    NO_INHERITANCE
                };
                if let Some(dacl) = dacl {
                    // SAFETY: `dacl` points into `security`, which lives to the end of the arm
                    unsafe {
                        let new = with_entry(dacl, sid, rights, inheritance)?;
                        set_dacl(raw, control, new.as_ptr())?;
                    }
                }
                if low_label {
                    Self::set_label(raw, &self.low[which])?;
                }
            }
            Stamp::Revoke { reset_label } => {
                if let Some(dacl) = dacl {
                    // SAFETY: `dacl` points into `security`, which lives to the end of the arm
                    unsafe {
                        if let Some(new) = without(dacl, &self.unique)? {
                            set_dacl(raw, control, new.as_ptr().cast())?;
                        }
                    }
                }
                if reset_label {
                    Self::set_label(raw, &self.medium[which])?;
                }
            }
        }
        Ok(())
    }

    #[allow(clippy::cast_ptr_alignment)] // Windows aligns every entry of an ACL to four bytes
    fn holds_runtime(&self, node: &OwnedHandle) -> Result<bool, String> {
        let security = Security::read(node.as_raw_handle())?;
        let Some(dacl) = security.dacl()? else {
            return Ok(true);
        };
        // SAFETY: `dacl` points into `security`, which outlives the loop; an allow entry is a
        // header, a mask and a SID
        unsafe {
            for entry in entries(dacl)? {
                let applies = (*entry).AceType == ACCESS_ALLOWED_ACE_TYPE
                    && u32::from((*entry).AceFlags) & INHERIT_ONLY_ACE == 0
                    && (*entry.cast::<ACCESS_ALLOWED_ACE>()).Mask & READ_EXECUTE == READ_EXECUTE;
                if applies && names(entry, &self.runtime) {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }
}
