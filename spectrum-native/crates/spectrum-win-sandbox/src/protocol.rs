//! The worker's wire format: one JSON object a line, UTF-8, over the worker's stdin and stdout.
//!
//! Spectrum writes one [`Request`] line, then [`Control`] lines. The worker writes [`Event`]
//! lines and ends with exactly one `exit` or `error`. Closing the worker's stdin without a
//! `close_stdin` first means Spectrum is gone: the worker kills everything it started.

use std::collections::BTreeMap;
use std::io::{BufRead, Read};
use std::path::PathBuf;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

/// The `v` a request must carry. Raise it for any change an older worker would misread.
pub const PROTOCOL_VERSION: u32 = 1;
/// The longest line either side accepts.
pub const MAX_LINE: usize = 1 << 20;
/// The most bytes of program input or output one message carries.
pub const CHUNK: usize = 32 * 1024;
/// The exit code of a program the worker killed (cancelled or out of time).
pub const KILLED_EXIT_CODE: u32 = 130;

/// What to run and what it may touch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub v: u32,
    pub tier: Tier,
    /// Full path of a native `.exe`. For a script, the interpreter, with the script in `args`.
    pub command: PathBuf,
    #[serde(default)]
    pub args: Vec<String>,
    /// The program's whole environment: nothing is inherited but `SystemRoot` and `windir`.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Must be inside a grant.
    pub cwd: PathBuf,
    #[serde(default)]
    pub grants: Vec<Grant>,
    /// Folders no grant may hold or be inside (the live project, Spectrum's data).
    #[serde(default)]
    pub forbidden: Vec<PathBuf>,
    #[serde(default)]
    pub network: Network,
    #[serde(default)]
    pub limits: Limits,
}

impl Request {
    /// A request with this version, no grants, no network and the default limits.
    pub fn new(tier: Tier, command: impl Into<PathBuf>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            tier,
            command: command.into(),
            args: Vec::new(),
            env: BTreeMap::new(),
            cwd: cwd.into(),
            grants: Vec::new(),
            forbidden: Vec::new(),
            network: Network::None,
            limits: Limits::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// A less-privileged `AppContainer` and a job object: for native programs and Spectrum's own
    /// tools. Reads and writes only what is granted; the network is off or open, by the kernel.
    AppContainer,
    /// A restricted token at low integrity and a job object: for Node and npm agents, whose pipes
    /// an `AppContainer` refuses. Writes only what is granted; reads that and what every user of
    /// the PC may read (not the user's own profile); the gate is asked for, not enforced.
    RestrictedLowIntegrity,
}

/// A folder (or file) the program may use, with everything in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Grant {
    pub path: PathBuf,
    pub access: Access,
    /// Also grant what [`crate::paths::is_secret_name`] names. Only for the program's own
    /// private home, never for a copy of the user's project.
    #[serde(default)]
    pub include_secrets: bool,
}

impl Grant {
    pub fn new(path: impl Into<PathBuf>, access: Access) -> Self {
        Self {
            path: path.into(),
            access,
            include_secrets: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Access {
    /// Read, write and delete, for this run only (the draft, the build cache, a private home).
    /// A link or a hardlinked file inside refuses the launch.
    Write,
    /// Read and execute, for this run only. A link or a hardlinked file inside refuses the launch.
    Read,
    /// Read and execute for every sandboxed run from now on, granted once and left in place: an
    /// engine, a TeX tree, an agent's runtime. Never the user's own files. Links inside are
    /// left ungranted.
    Runtime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Network {
    /// No network at all. `AppContainer` only.
    #[default]
    None,
    /// The proxy on this port of this computer is the way out: the proxy variables are set to it.
    /// Restricted tier only, and not enforced there (see `Event::Started`).
    Gate { port: u16 },
    /// Any public address. In an `AppContainer`, never this computer's own ports.
    Open,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    /// The most processes alive at once, the program itself included.
    #[serde(default = "default_max_processes")]
    pub max_processes: u32,
    /// Kill everything after this long.
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// The most memory all the processes may commit together.
    #[serde(default)]
    pub memory_bytes: Option<u64>,
}

const fn default_max_processes() -> u32 {
    64
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_processes: default_max_processes(),
            timeout_ms: None,
            memory_bytes: None,
        }
    }
}

/// What Spectrum sends after the request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Control {
    /// Bytes for the program's stdin, at most [`CHUNK`].
    Stdin {
        #[serde(with = "base64_bytes")]
        data: Vec<u8>,
    },
    CloseStdin,
    Kill,
}

/// What the worker sends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Event {
    /// The program is running. `network_enforced` is false when the request's network rule is
    /// only asked of the program (a gate in the restricted tier), not held by the kernel.
    Started { pid: u32, network_enforced: bool },
    Stdout {
        #[serde(with = "base64_bytes")]
        data: Vec<u8>,
    },
    Stderr {
        #[serde(with = "base64_bytes")]
        data: Vec<u8>,
    },
    /// Something the run went on without (a restriction or a clean-up that could not be done).
    Warning { message: String },
    /// Last line of a run that started. Grants are revoked by now.
    Exit { code: u32, reason: ExitReason },
    /// Last line of a run that did not start.
    Error { kind: ErrorKind, message: String },
}

impl Event {
    /// Whether nothing follows this event.
    pub fn is_last(&self) -> bool {
        matches!(self, Self::Exit { .. } | Self::Error { .. })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExitReason {
    Exited,
    Killed,
    TimedOut,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// Not JSON, not a request, or one the rules refuse.
    InvalidRequest,
    /// A `v` this worker does not speak.
    Version,
    /// Not Windows.
    Unsupported,
    /// A grant holds a link, a hardlinked file or too many files, or is not its own real path.
    UnsafeGrant,
    /// Windows refused a step of the isolation or the launch.
    Os,
}

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("a line is longer than {MAX_LINE} bytes")]
    LineTooLong,
    #[error("not a message of this protocol: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// One message as its line, newline included.
pub fn encode<T: Serialize>(message: &T) -> Result<String, ProtocolError> {
    let mut line = serde_json::to_string(message)?;
    line.push('\n');
    Ok(line)
}

pub fn decode<T: DeserializeOwned>(line: &str) -> Result<T, ProtocolError> {
    Ok(serde_json::from_str(line.trim_end_matches(['\r', '\n']))?)
}

/// The `v` of a request line, read before the rest so a newer request is refused for its
/// version and not for a field this worker does not know.
pub fn request_version(line: &str) -> Result<u32, ProtocolError> {
    #[derive(Deserialize)]
    struct Head {
        v: u32,
    }
    Ok(decode::<Head>(line)?.v)
}

/// The next line, or `None` at the end. Never buffers more than [`MAX_LINE`].
pub fn read_line(reader: &mut impl BufRead) -> Result<Option<String>, ProtocolError> {
    let mut line = Vec::new();
    let read = reader
        .by_ref()
        .take(MAX_LINE as u64 + 1)
        .read_until(b'\n', &mut line)?;
    if read == 0 {
        return Ok(None);
    }
    if line.len() > MAX_LINE {
        return Err(ProtocolError::LineTooLong);
    }
    match String::from_utf8(line) {
        Ok(text) => Ok(Some(text)),
        Err(e) => Err(std::io::Error::new(std::io::ErrorKind::InvalidData, e).into()),
    }
}

mod base64_bytes {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use serde::{Deserialize, Deserializer, Serializer};

    #[allow(clippy::ptr_arg)] // serde's `with` passes the field as it is
    pub(super) fn serialize<S: Serializer>(
        bytes: &Vec<u8>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&STANDARD.encode(bytes))
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<u8>, D::Error> {
        let text = String::deserialize(deserializer)?;
        STANDARD.decode(text).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_round_trips_and_reads_as_documented() {
        let mut request = Request::new(
            Tier::RestrictedLowIntegrity,
            r"C:\node\node.exe",
            r"C:\work",
        );
        request.args = vec!["agent.js".into()];
        request.env.insert("HOME".into(), r"C:\home".into());
        request.grants = vec![
            Grant::new(r"C:\work", Access::Write),
            Grant::new(r"C:\node", Access::Runtime),
        ];
        request.network = Network::Gate { port: 4100 };
        request.limits.timeout_ms = Some(5000);
        let line = encode(&request).unwrap();
        assert!(line.ends_with('\n') && !line.trim_end().contains('\n'));
        assert_eq!(decode::<Request>(&line).unwrap(), request);
        assert_eq!(request_version(&line).unwrap(), PROTOCOL_VERSION);

        let wire = r#"{"v":1,"tier":"app_container","command":"C:\\t\\tex.exe","cwd":"C:\\d",
            "grants":[{"path":"C:\\d","access":"write"}],"network":"none"}"#
            .replace('\n', "");
        let read: Request = decode(&wire).unwrap();
        assert_eq!(read.tier, Tier::AppContainer);
        assert_eq!(read.limits, Limits::default());
        assert_eq!(read.grants[0].access, Access::Write);
        assert!(!read.grants[0].include_secrets);
    }

    #[test]
    fn unknown_fields_and_newer_versions_are_told_apart() {
        let newer = r#"{"v":2,"tier":"app_container","command":"x","cwd":"y","sandbox_level":9}"#;
        assert_eq!(request_version(newer).unwrap(), 2);
        assert!(decode::<Request>(newer).is_err());
        assert!(request_version("{}").is_err());
        assert!(request_version("not json").is_err());
    }

    #[test]
    fn events_and_controls_carry_bytes_as_base64() {
        let event = Event::Stdout {
            data: vec![0, 159, 255, b'\n'],
        };
        let line = encode(&event).unwrap();
        assert_eq!(line, "{\"t\":\"stdout\",\"data\":\"AJ//Cg==\"}\n");
        assert_eq!(decode::<Event>(&line).unwrap(), event);
        assert_eq!(
            decode::<Control>(r#"{"t":"stdin","data":"aGk="}"#).unwrap(),
            Control::Stdin {
                data: b"hi".to_vec()
            }
        );
        assert_eq!(
            decode::<Control>("{\"t\":\"close_stdin\"}\r\n").unwrap(),
            Control::CloseStdin
        );
        assert_eq!(
            encode(&Event::Exit {
                code: 3,
                reason: ExitReason::TimedOut
            })
            .unwrap(),
            "{\"t\":\"exit\",\"code\":3,\"reason\":\"timed_out\"}\n"
        );
        assert!(decode::<Control>(r#"{"t":"stdin","data":"***"}"#).is_err());
        assert!(event_is_last());
    }

    fn event_is_last() -> bool {
        let last = Event::Error {
            kind: ErrorKind::Unsupported,
            message: String::new(),
        };
        last.is_last()
            && !Event::Warning {
                message: String::new(),
            }
            .is_last()
    }

    #[test]
    fn lines_are_read_one_at_a_time_and_bounded() {
        let mut input = std::io::Cursor::new(b"one\ntwo".to_vec());
        assert_eq!(read_line(&mut input).unwrap().as_deref(), Some("one\n"));
        assert_eq!(read_line(&mut input).unwrap().as_deref(), Some("two"));
        assert_eq!(read_line(&mut input).unwrap(), None);

        let mut long = std::io::Cursor::new(vec![b'x'; MAX_LINE + 2]);
        assert!(matches!(
            read_line(&mut long),
            Err(ProtocolError::LineTooLong)
        ));
        let mut exact = std::io::Cursor::new([vec![b'x'; MAX_LINE - 1], vec![b'\n']].concat());
        assert_eq!(
            read_line(&mut exact).unwrap().map(|l| l.len()),
            Some(MAX_LINE)
        );
    }
}
