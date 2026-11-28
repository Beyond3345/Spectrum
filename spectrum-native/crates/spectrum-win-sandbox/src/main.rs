//! Windows sandbox worker: `AppContainer`, low integrity and job objects.
//!
//! Trusted and small. It reads one request from stdin (`spectrum_win_sandbox::protocol`), grants
//! the folders, starts the program isolated, relays its input and output, and takes the grants
//! back. Only the program it starts is isolated; no command is ever given to a shell.

mod cmdline;
mod grant;
#[cfg(windows)]
mod run;
// the only unsafe code of the crate: Win32 calls, each behind a safe function
#[cfg(windows)]
#[allow(unsafe_code)]
mod win;

use std::io::{BufReader, Stdin, Write};
use std::process::ExitCode;

use spectrum_win_sandbox::paths;
use spectrum_win_sandbox::protocol::{self, ErrorKind, Event, PROTOCOL_VERSION, Request};
use spectrum_win_sandbox::validate::{Launch, ValidationError, validate};

/// Why nothing ran.
#[derive(Debug)]
pub(crate) struct Failure {
    pub kind: ErrorKind,
    pub message: String,
}

impl Failure {
    pub(crate) fn os(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Os,
            message: message.into(),
        }
    }

    pub(crate) fn unsafe_grant(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::UnsafeGrant,
            message: message.into(),
        }
    }

    fn invalid(error: &dyn std::fmt::Display) -> Self {
        Self {
            kind: ErrorKind::InvalidRequest,
            message: error.to_string(),
        }
    }
}

/// Writes one event as one line.
pub(crate) fn emit(event: &Event) {
    if let Ok(line) = protocol::encode(event) {
        let mut out = std::io::stdout().lock();
        // nobody is left to tell when Spectrum is gone; the closed stdin ends the run
        let _ = out.write_all(line.as_bytes());
        let _ = out.flush();
    }
}

fn main() -> ExitCode {
    let mut input = BufReader::new(std::io::stdin());
    let last = match read_request(&mut input) {
        Ok((request, launch)) => serve(&request, &launch, input),
        Err(failure) => Event::Error {
            kind: failure.kind,
            message: failure.message,
        },
    };
    emit(&last);
    if matches!(last, Event::Exit { .. }) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn read_request(input: &mut BufReader<Stdin>) -> Result<(Request, Launch), Failure> {
    let line = protocol::read_line(input)
        .map_err(|e| Failure::invalid(&e))?
        .ok_or_else(|| Failure::invalid(&"no request"))?;
    let wrong_version = |version| Failure {
        kind: ErrorKind::Version,
        message: ValidationError::Version(version).to_string(),
    };
    let version = protocol::request_version(&line).map_err(|e| Failure::invalid(&e))?;
    if version != PROTOCOL_VERSION {
        return Err(wrong_version(version));
    }
    let request: Request = protocol::decode(&line).map_err(|e| Failure::invalid(&e))?;
    // no grant may hold the user's own folder or Windows'
    let protected: Vec<String> = ["USERPROFILE", "SystemRoot"]
        .into_iter()
        .filter_map(std::env::var_os)
        .filter_map(|dir| paths::normalise(dir.as_ref()).ok())
        .collect();
    let launch = validate(&request, &protected).map_err(|e| Failure::invalid(&e))?;
    Ok((request, launch))
}

#[cfg(windows)]
fn serve(request: &Request, launch: &Launch, input: BufReader<Stdin>) -> Event {
    run::run(request, launch, input)
}

#[cfg(not(windows))]
fn serve(_: &Request, _: &Launch, _: BufReader<Stdin>) -> Event {
    Event::Error {
        kind: ErrorKind::Unsupported,
        message: "Windows isolation only runs on Windows.".to_owned(),
    }
}
