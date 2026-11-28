//! The worker answers a request it will not run with one `error` line, on every platform.
#![allow(clippy::unwrap_used)] // helpers too, not just #[test] fns

use std::io::{BufReader, Write};
use std::process::{Command, Stdio};

use spectrum_win_sandbox::protocol::{self, ErrorKind, Event};

/// Sends `input` as the worker's whole stdin and returns its events and whether it succeeded.
fn answer(input: &str) -> (Vec<Event>, bool) {
    let mut worker = Command::new(env!("CARGO_BIN_EXE_spectrum-win-sandbox"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    worker
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let mut reader = BufReader::new(worker.stdout.take().unwrap());
    let mut events = Vec::new();
    while let Some(line) = protocol::read_line(&mut reader).unwrap() {
        events.push(protocol::decode(&line).unwrap());
    }
    (events, worker.wait().unwrap().success())
}

fn refusal(input: &str) -> (ErrorKind, String) {
    let (mut events, success) = answer(input);
    assert!(!success);
    assert_eq!(events.len(), 1, "{events:?}");
    match events.remove(0) {
        Event::Error { kind, message } => (kind, message),
        other => panic!("{other:?}"),
    }
}

const REQUEST: &str = r#"{"v":1,"tier":"app_container","command":"C:\\engines\\typst.exe","cwd":"C:\\draft","grants":[{"path":"C:\\draft","access":"write"}]}"#;

#[test]
fn what_is_not_a_request_is_refused() {
    for input in ["", "\n", "hello\n", "{}\n", r#"{"v":1}"#] {
        assert_eq!(refusal(input).0, ErrorKind::InvalidRequest, "{input:?}");
    }
    let unknown_field = REQUEST.replace(r#""v":1"#, r#""v":1,"unrestricted":true"#);
    assert_eq!(refusal(&unknown_field).0, ErrorKind::InvalidRequest);
}

#[test]
fn another_version_is_refused_as_such() {
    let newer = REQUEST.replace(r#""v":1"#, r#""v":2,"profile":"strict""#);
    let (kind, message) = refusal(&newer);
    assert_eq!(kind, ErrorKind::Version);
    assert!(message.contains("version 1"), "{message}");
}

#[test]
fn a_request_the_rules_refuse_never_runs() {
    let script = REQUEST.replace("typst.exe", "typst.cmd");
    let drive = REQUEST.replace(r#"{"path":"C:\\draft","#, r#"{"path":"C:\\","#);
    let elsewhere = REQUEST.replace(r#""cwd":"C:\\draft""#, r#""cwd":"C:\\Users""#);
    let gate = REQUEST.replace(
        r#""grants""#,
        r#""network":{"gate":{"port":4100}},"grants""#,
    );
    for input in [script, drive, elsewhere, gate] {
        assert_eq!(refusal(&input).0, ErrorKind::InvalidRequest, "{input}");
    }
}

#[cfg(not(windows))]
#[test]
fn off_windows_a_good_request_is_unsupported() {
    assert_eq!(refusal(REQUEST).0, ErrorKind::Unsupported);
}
