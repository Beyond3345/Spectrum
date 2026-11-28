//! Spectrum's side of the worker: start it, feed the program, read what it says.
//!
//! Blocking, with no runtime of its own: call it from a background thread or
//! `spawn_blocking`. [`Session::control`] and [`Session::events`] are separate so one thread can
//! write the program's input while another reads its output.

use std::io::{BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use crate::protocol::{self, CHUNK, Control, ErrorKind, Event, ExitReason, ProtocolError, Request};
use crate::validate::{ValidationError, validate};

#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("Windows isolation is only available on Windows")]
    Unsupported,
    #[error(transparent)]
    Invalid(#[from] ValidationError),
    #[error("the isolation worker could not be started or reached: {0}")]
    Worker(#[from] std::io::Error),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    #[error("the isolation worker stopped without saying how the program ended")]
    Ended,
    /// The worker's `error` event: nothing ran.
    #[error("{message}")]
    Refused { kind: ErrorKind, message: String },
}

/// A program running (or about to) in the worker. Dropping it kills the program.
#[derive(Debug)]
pub struct Session {
    pub control: Controller,
    pub events: Events,
}

/// Starts `worker` (the path of `spectrum-win-sandbox.exe`) and hands it `request`.
/// Off Windows this is [`ClientError::Unsupported`], before anything is started.
pub fn spawn(worker: &Path, request: &Request) -> Result<Session, ClientError> {
    if !cfg!(windows) {
        return Err(ClientError::Unsupported);
    }
    validate(request, &[])?;
    let mut command = Command::new(worker);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = command.spawn()?;
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return Err(ClientError::Ended);
    };
    stdin.write_all(protocol::encode(request)?.as_bytes())?;
    stdin.flush()?;
    Ok(Session {
        control: Controller { stdin },
        events: Events {
            reader: BufReader::new(stdout),
            child,
            done: false,
        },
    })
}

impl Session {
    /// Closes the program's stdin, reads to the end and gathers the output.
    pub fn wait(mut self) -> Result<Output, ClientError> {
        self.control.close_stdin()?;
        // `control` stays alive until the last event: dropping it would kill the program
        collect(&mut self.events)
    }
}

/// The program's input and the kill switch. Dropping it kills the program.
#[derive(Debug)]
pub struct Controller {
    stdin: ChildStdin,
}

impl Controller {
    pub fn write_stdin(&mut self, bytes: &[u8]) -> Result<(), ClientError> {
        for chunk in bytes.chunks(CHUNK) {
            self.send(&Control::Stdin {
                data: chunk.to_vec(),
            })?;
        }
        Ok(())
    }

    /// The program reads the end of its input.
    pub fn close_stdin(&mut self) -> Result<(), ClientError> {
        self.send(&Control::CloseStdin)
    }

    /// Kills the program and everything it started. The `exit` event still follows.
    pub fn kill(&mut self) -> Result<(), ClientError> {
        self.send(&Control::Kill)
    }

    fn send(&mut self, control: &Control) -> Result<(), ClientError> {
        self.stdin
            .write_all(protocol::encode(control)?.as_bytes())?;
        Ok(self.stdin.flush()?)
    }
}

/// The worker's events, ending after `exit` or `error`.
#[derive(Debug)]
pub struct Events {
    reader: BufReader<ChildStdout>,
    child: Child,
    done: bool,
}

impl Iterator for Events {
    type Item = Result<Event, ClientError>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }
        let event = match protocol::read_line(&mut self.reader) {
            Ok(Some(line)) => protocol::decode::<Event>(&line).map_err(ClientError::from),
            Ok(None) => Err(ClientError::Ended),
            Err(e) => Err(e.into()),
        };
        if event.as_ref().map_or(true, Event::is_last) {
            self.done = true;
            // the worker exits right after its last line; a failure here changes nothing
            let _ = self.child.wait();
        }
        Some(event)
    }
}

/// How a run ended, with all it printed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Output {
    pub code: u32,
    pub reason: ExitReason,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub warnings: Vec<String>,
    /// From `Event::Started`: whether the kernel holds the request's network rule.
    pub network_enforced: bool,
}

fn collect(
    events: impl Iterator<Item = Result<Event, ClientError>>,
) -> Result<Output, ClientError> {
    let (mut stdout, mut stderr, mut warnings) = (Vec::new(), Vec::new(), Vec::new());
    let mut network_enforced = false;
    for event in events {
        match event? {
            Event::Started {
                network_enforced: enforced,
                ..
            } => network_enforced = enforced,
            Event::Stdout { data } => stdout.extend(data),
            Event::Stderr { data } => stderr.extend(data),
            Event::Warning { message } => warnings.push(message),
            Event::Exit { code, reason } => {
                return Ok(Output {
                    code,
                    reason,
                    stdout,
                    stderr,
                    warnings,
                    network_enforced,
                });
            }
            Event::Error { kind, message } => return Err(ClientError::Refused { kind, message }),
        }
    }
    Err(ClientError::Ended)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Tier;

    #[cfg(not(windows))]
    #[test]
    fn off_windows_nothing_is_started() {
        let request = Request::new(Tier::AppContainer, r"C:\t\tex.exe", r"C:\d");
        let missing = Path::new("/no/such/worker");
        assert!(matches!(
            spawn(missing, &request),
            Err(ClientError::Unsupported)
        ));
    }

    #[cfg(windows)]
    #[test]
    fn a_bad_request_is_refused_before_the_worker_starts() {
        let request = Request::new(Tier::AppContainer, r"C:\t\tex.cmd", r"C:\d");
        let missing = Path::new(r"C:\no\such\worker.exe");
        assert!(matches!(
            spawn(missing, &request),
            Err(ClientError::Invalid(_))
        ));
    }

    #[test]
    fn output_is_gathered_up_to_the_exit() {
        let events = vec![
            Event::Warning {
                message: "no UI limits".into(),
            },
            Event::Started {
                pid: 7,
                network_enforced: true,
            },
            Event::Stdout {
                data: b"a".to_vec(),
            },
            Event::Stderr {
                data: b"e".to_vec(),
            },
            Event::Stdout {
                data: b"b".to_vec(),
            },
            Event::Exit {
                code: 2,
                reason: ExitReason::Exited,
            },
        ];
        let output = collect(events.into_iter().map(Ok)).unwrap();
        assert_eq!((output.code, output.reason), (2, ExitReason::Exited));
        assert_eq!(
            (output.stdout.as_slice(), output.stderr.as_slice()),
            (&b"ab"[..], &b"e"[..])
        );
        assert_eq!(output.warnings, ["no UI limits"]);
        assert!(output.network_enforced);
    }

    #[test]
    fn a_refusal_or_a_cut_stream_is_an_error() {
        let refused = collect(
            [Ok(Event::Error {
                kind: ErrorKind::UnsafeGrant,
                message: "a link".into(),
            })]
            .into_iter(),
        );
        assert!(matches!(
            refused,
            Err(ClientError::Refused {
                kind: ErrorKind::UnsafeGrant,
                ..
            })
        ));
        assert!(matches!(
            collect(std::iter::empty()),
            Err(ClientError::Ended)
        ));
        assert!(matches!(
            collect([Err(ClientError::Ended)].into_iter()),
            Err(ClientError::Ended)
        ));
    }
}
