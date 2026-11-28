//! The one libc call the runner makes: killing a compile's process group.
#![allow(unsafe_code)]

/// `killpg(pid, SIGKILL)`: the child was started as its group's leader (`process_group(0)`), so this stops it and
/// everything it started (latexmk's pdflatex, Biber's unpacked Perl). A group that is gone already is fine.
pub(crate) fn kill_group(pid: u32) {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return;
    };
    if pid <= 1 {
        return;
    }
    // SAFETY: killpg takes plain integers and touches no memory of ours; a stale group only gives ESRCH.
    unsafe {
        libc::killpg(pid, libc::SIGKILL);
    }
}
