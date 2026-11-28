//! Process lifecycle against the fake server (`tests/support/fake_lsp.rs`).
#![allow(clippy::expect_used, clippy::unwrap_used)] // helpers too, not just #[test] fns

use std::path::PathBuf;
use std::time::Duration;

use lsp_types::{Position, Range, TextDocumentContentChangeEvent};
use spectrum_lsp::{LanguageServer, LspError, LspEvent, ServerConfig, ServerKind, file_uri};
use tokio::sync::mpsc::UnboundedReceiver;

fn config(root: &tempfile::TempDir) -> ServerConfig {
    let mut config = ServerConfig::tinymist(
        PathBuf::from(env!("CARGO_BIN_EXE_spectrum-lsp-fake")),
        root.path().to_owned(),
    );
    config.restart_delay = Duration::from_millis(20);
    config.request_timeout = Duration::from_millis(300);
    config
}

async fn next(events: &mut UnboundedReceiver<LspEvent>) -> LspEvent {
    tokio::time::timeout(Duration::from_secs(10), events.recv())
        .await
        .expect("an event in time")
        .expect("the event stream open")
}

#[tokio::test]
async fn opens_syncs_and_reopens_after_a_crash() {
    let root = tempfile::tempdir().unwrap();
    let (server, mut events) = LanguageServer::start(config(&root)).await.unwrap();
    assert_eq!(server.kind(), ServerKind::Tinymist);
    assert!(server.capabilities().is_some());

    let uri = file_uri(&root.path().join("main.typ")).unwrap();
    server.did_open(uri.clone(), "typst", 1, "= Über".into());
    let LspEvent::Diagnostics(d) = next(&mut events).await else {
        panic!("diagnostics")
    };
    assert_eq!(d.diagnostics[0].message, "open:= Über");

    let end = Position {
        line: 0,
        character: 6,
    };
    server.did_change(
        &uri,
        2,
        vec![TextDocumentContentChangeEvent {
            range: Some(Range { start: end, end }),
            range_length: None,
            text: " 😀".into(),
        }],
    );
    server.notify::<Crash>(());
    assert_eq!(
        next(&mut events).await,
        LspEvent::Restarting {
            attempt: 1,
            delay: Duration::from_millis(20)
        }
    );
    // re-opened with the edited text and its version (the server's answer and Restarted race)
    let (a, b) = (next(&mut events).await, next(&mut events).await);
    let (d, restarted) = match (a, b) {
        (LspEvent::Diagnostics(d), r) | (r, LspEvent::Diagnostics(d)) => (d, r),
        other => panic!("unexpected {other:?}"),
    };
    assert_eq!(restarted, LspEvent::Restarted);
    assert_eq!(d.diagnostics[0].message, "open:= Über 😀");
    assert_eq!(d.version, Some(2));
    assert!(server.document_symbol(&uri).await.unwrap().is_some());
    server.shutdown().await;
}

#[tokio::test]
async fn gives_up_after_three_restarts_with_doubling_delays() {
    let root = tempfile::tempdir().unwrap();
    let counter = root.path().join("starts");
    let config = config(&root).with_env("FAKE_LSP_COUNTER", &counter);
    let (server, mut events) = LanguageServer::start(config).await.unwrap();
    server.notify::<Crash>(());
    for (attempt, ms) in [(1, 20), (2, 40), (3, 80)] {
        assert_eq!(
            next(&mut events).await,
            LspEvent::Restarting {
                attempt,
                delay: Duration::from_millis(ms)
            }
        );
    }
    assert!(matches!(next(&mut events).await, LspEvent::Failed { .. }));
    assert!(matches!(
        server.document_symbol(&file_uri(&counter).unwrap()).await,
        Err(LspError::NotRunning)
    ));
    assert_eq!(std::fs::read_to_string(&counter).unwrap(), "4");
}

#[tokio::test]
async fn timeout_cancels_on_the_server() {
    let root = tempfile::tempdir().unwrap();
    let (server, mut events) = LanguageServer::start(config(&root)).await.unwrap();
    let result = server.request::<Hang>(()).await;
    assert!(matches!(result, Err(LspError::Timeout(_))));
    let LspEvent::ShowMessage(m) = next(&mut events).await else {
        panic!("showMessage")
    };
    assert!(m.message.starts_with("cancelled "));
}

#[tokio::test]
async fn shutdown_is_not_a_crash() {
    let root = tempfile::tempdir().unwrap();
    let (server, mut events) = LanguageServer::start(config(&root)).await.unwrap();
    server.shutdown().await;
    // the stream ends with no Restarting
    assert!(
        tokio::time::timeout(Duration::from_secs(5), events.recv())
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn missing_binary_is_a_spawn_error() {
    let root = tempfile::tempdir().unwrap();
    let mut config = config(&root);
    config.program = root.path().join("no-such-server");
    assert!(matches!(
        LanguageServer::start(config).await,
        Err(LspError::Spawn(_))
    ));
}

enum Crash {}
impl lsp_types::notification::Notification for Crash {
    type Params = ();
    const METHOD: &'static str = "test/crash";
}

enum Hang {}
impl lsp_types::request::Request for Hang {
    type Params = ();
    type Result = ();
    const METHOD: &'static str = "test/hang";
}
