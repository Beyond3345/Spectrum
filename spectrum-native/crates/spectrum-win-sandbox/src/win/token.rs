//! The restricted, low-integrity token of the second tier.
//!
//! The shape of Chromium's `USER_LIMITED` level with a low integrity label. Windows checks a
//! restricted token twice: once as the user, once against the restricting list alone, and both
//! must pass. The list holds what every user of the PC may use (Users, Everyone), the logon
//! session (named objects, the desktop), RESTRICTED (the user's registry) and this run's own
//! two identifiers, so the user's own files, which name only the user, are closed until granted.

use std::os::windows::io::{AsRawHandle, OwnedHandle};
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{GENERIC_ALL, HANDLE};
use windows_sys::Win32::Security::{
    CreateRestrictedToken, DISABLE_MAX_PRIVILEGE, GetLengthSid, GetTokenInformation,
    NO_INHERITANCE, SID_AND_ATTRIBUTES, SetTokenInformation, TOKEN_ADJUST_DEFAULT,
    TOKEN_ASSIGN_PRIMARY, TOKEN_DEFAULT_DACL, TOKEN_DUPLICATE, TOKEN_GROUPS,
    TOKEN_INFORMATION_CLASS, TOKEN_MANDATORY_LABEL, TOKEN_QUERY, TokenDefaultDacl, TokenGroups,
    TokenIntegrityLevel, WinBuiltinUsersSid, WinInteractiveSid, WinLowLabelSid,
    WinRestrictedCodeSid, WinWorldSid,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

use super::acl::with_entry;
use super::sid::Sid;
use super::{aligned, dword, last_error, own};
use crate::Failure;

const SE_GROUP_INTEGRITY: u32 = 0x20;
const SE_GROUP_LOGON_ID: u32 = 0xC000_0000;

fn information(token: HANDLE, class: TOKEN_INFORMATION_CLASS) -> Result<Vec<u64>, Failure> {
    let mut needed = 0_u32;
    // SAFETY: a size query: no buffer is written
    unsafe { GetTokenInformation(token, class, null_mut(), 0, &raw mut needed) };
    if needed == 0 {
        return Err(last_error("Read the token"));
    }
    let mut buffer = aligned(needed as usize);
    // SAFETY: the buffer is at least `needed` bytes
    let read = unsafe {
        GetTokenInformation(
            token,
            class,
            buffer.as_mut_ptr().cast(),
            needed,
            &raw mut needed,
        )
    };
    if read == 0 {
        return Err(last_error("Read the token"));
    }
    Ok(buffer)
}

/// A primary token for `CreateProcessAsUserW`: this process's own, restricted, at low
/// integrity. `unique` and `runtime` are what the run's grants name.
pub(crate) fn restricted_low(unique: &Sid, runtime: &Sid) -> Result<OwnedHandle, Failure> {
    let users = Sid::well_known(WinBuiltinUsersSid)?;
    let everyone = Sid::well_known(WinWorldSid)?;
    let interactive = Sid::well_known(WinInteractiveSid)?;
    let restricted_code = Sid::well_known(WinRestrictedCodeSid)?;
    let low = Sid::well_known(WinLowLabelSid)?;

    let mut raw: HANDLE = null_mut();
    let access = TOKEN_DUPLICATE | TOKEN_ASSIGN_PRIMARY | TOKEN_QUERY | TOKEN_ADJUST_DEFAULT;
    // SAFETY: the pseudo-handle of this process and an output valid for writes
    if unsafe { OpenProcessToken(GetCurrentProcess(), access, &raw mut raw) } == 0 {
        return Err(last_error("Open the worker's token"));
    }
    // SAFETY: a handle OpenProcessToken has just returned
    let own_token = unsafe { own(raw) };

    let groups = information(own_token.as_raw_handle(), TokenGroups)?;
    // every group but Users, Everyone and Interactive is kept only to deny by (Administrators
    // above all); the restricting list is the six below
    let mut deny = Vec::new();
    let mut restrict: Vec<SID_AND_ATTRIBUTES> =
        [&users, &everyone, &restricted_code, unique, runtime]
            .iter()
            .map(|sid| SID_AND_ATTRIBUTES {
                Sid: sid.as_ptr(),
                Attributes: 0,
            })
            .collect();
    // SAFETY: Windows wrote a TOKEN_GROUPS with GroupCount entries into `groups`, which
    // outlives every pointer taken from it here
    unsafe {
        let list = groups.as_ptr().cast::<TOKEN_GROUPS>();
        let entries = std::slice::from_raw_parts(
            (&raw const (*list).Groups).cast::<SID_AND_ATTRIBUTES>(),
            (*list).GroupCount as usize,
        );
        for group in entries {
            if group.Attributes & SE_GROUP_INTEGRITY != 0 {
                continue;
            }
            if group.Attributes & SE_GROUP_LOGON_ID == SE_GROUP_LOGON_ID {
                restrict.push(SID_AND_ATTRIBUTES {
                    Sid: group.Sid,
                    Attributes: 0,
                });
                continue;
            }
            if users.is(group.Sid) || everyone.is(group.Sid) || interactive.is(group.Sid) {
                continue;
            }
            deny.push(SID_AND_ATTRIBUTES {
                Sid: group.Sid,
                Attributes: 0,
            });
        }
    }

    let mut raw: HANDLE = null_mut();
    // SAFETY: both arrays hold their lengths of valid SIDs, which live past the call; every
    // privilege but the one to pass through folders is dropped
    let made = unsafe {
        CreateRestrictedToken(
            own_token.as_raw_handle(),
            DISABLE_MAX_PRIVILEGE,
            dword(deny.len()),
            deny.as_ptr(),
            0,
            null(),
            dword(restrict.len()),
            restrict.as_ptr(),
            &raw mut raw,
        )
    };
    if made == 0 {
        return Err(last_error("Make the restricted token"));
    }
    // SAFETY: a handle CreateRestrictedToken has just returned
    let token = unsafe { own(raw) };

    let label = TOKEN_MANDATORY_LABEL {
        Label: SID_AND_ATTRIBUTES {
            Sid: low.as_ptr(),
            Attributes: SE_GROUP_INTEGRITY,
        },
    };
    // SAFETY: a label whose SID is valid, with the length Windows asks for (structure and SID)
    let lowered = unsafe {
        SetTokenInformation(
            token.as_raw_handle(),
            TokenIntegrityLevel,
            (&raw const label).cast(),
            dword(size_of::<TOKEN_MANDATORY_LABEL>()) + GetLengthSid(low.as_ptr()),
        )
    };
    if lowered == 0 {
        return Err(last_error("Lower the token's integrity"));
    }

    // what the program makes (pipes, processes, events) is open to itself: the default list
    // names the user, which the restricting list does not, so this run's identifier is added
    let default_dacl = information(token.as_raw_handle(), TokenDefaultDacl)?;
    // SAFETY: Windows wrote a TOKEN_DEFAULT_DACL into `default_dacl`; its ACL (or null) lies
    // in the same buffer, which outlives the calls
    unsafe {
        let current = (*default_dacl.as_ptr().cast::<TOKEN_DEFAULT_DACL>()).DefaultDacl;
        if current.is_null() {
            // no default list: what it makes is open already, and a list of one would close it
            return Ok(token);
        }
        let widened =
            with_entry(current, unique, GENERIC_ALL, NO_INHERITANCE).map_err(Failure::os)?;
        let update = TOKEN_DEFAULT_DACL {
            DefaultDacl: widened.as_ptr(),
        };
        let set = SetTokenInformation(
            token.as_raw_handle(),
            TokenDefaultDacl,
            (&raw const update).cast(),
            dword(size_of::<TOKEN_DEFAULT_DACL>()),
        );
        if set == 0 {
            return Err(last_error("Set the token's default access list"));
        }
    }
    Ok(token)
}
