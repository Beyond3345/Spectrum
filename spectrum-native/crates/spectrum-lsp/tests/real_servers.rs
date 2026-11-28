//! TexLab and Tinymist themselves, when this machine has them; skipped with a printed reason otherwise.
//! Found from `SPECTRUM_TEXLAB` / `SPECTRUM_TINYMIST`, the PATH, `~/.cargo/bin`, the 2.8 repo's
//! `src-tauri/binaries` and the engines folder 2.8 downloads Tinymist into.
#![allow(clippy::expect_used, clippy::unwrap_used, clippy::print_stdout)]

use std::path::{Path, PathBuf};
use std::time::Duration;

use lsp_types::{DocumentSymbolResponse, PublishDiagnosticsParams, Uri};
use spectrum_lsp::{LanguageServer, LspEvent, ServerConfig, file_uri};
use tokio::sync::mpsc::UnboundedReceiver;

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

fn find(name: &str, env: &str) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = std::env::var_os(env)
        .map(PathBuf::from)
        .into_iter()
        .collect();
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join(exe(name))));
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    if let Some(home) = &home {
        candidates.push(home.join(".cargo/bin").join(exe(name)));
        let engines = home
            .join("Library/Application Support/com.beyond3345.spectrum/engines")
            .join(name);
        if let Ok(versions) = std::fs::read_dir(engines) {
            candidates.extend(versions.flatten().map(|v| v.path().join(exe(name))));
        }
    }
    // the 2.8 repo, from this checkout or a worktree inside it
    let triple = if cfg!(windows) {
        "x86_64-pc-windows-msvc.exe"
    } else {
        "aarch64-apple-darwin"
    };
    for dir in Path::new(env!("CARGO_MANIFEST_DIR")).ancestors() {
        candidates.push(
            dir.join("src-tauri/binaries")
                .join(format!("{name}-{triple}")),
        );
    }
    candidates.into_iter().find(|p| p.is_file())
}

async fn diagnostics_for(
    events: &mut UnboundedReceiver<LspEvent>,
    uri: &Uri,
) -> PublishDiagnosticsParams {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            match events.recv().await.expect("events open") {
                LspEvent::Diagnostics(d) if &d.uri == uri && !d.diagnostics.is_empty() => return d,
                _ => {}
            }
        }
    })
    .await
    .expect("diagnostics in time")
}

fn symbol_names(response: Option<DocumentSymbolResponse>) -> Vec<String> {
    match response.expect("symbols") {
        DocumentSymbolResponse::Nested(symbols) => symbols.into_iter().map(|s| s.name).collect(),
        DocumentSymbolResponse::Flat(symbols) => symbols.into_iter().map(|s| s.name).collect(),
    }
}

/// The outline a server gives, asked a few times: a server may answer before it has read the text.
async fn outline(server: &LanguageServer, uri: &Uri, want: &str) -> Vec<String> {
    let mut names = Vec::new();
    for _ in 0..20 {
        names = symbol_names(server.document_symbol(uri).await.unwrap());
        if names.iter().any(|n| n.contains(want)) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    names
}

#[tokio::test]
async fn texlab_diagnostics_and_outline() {
    let Some(program) = find("texlab", "SPECTRUM_TEXLAB") else {
        println!("skipped: no texlab (set SPECTRUM_TEXLAB)");
        return;
    };
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("main.tex");
    let text = "\\documentclass{article}\n\\begin{document}\n\\section{Einführung}\nText 😀 \\ref{nowhere}.\n\\begin{itemize}\n\\end{enumerate}\n\\end{document}\n";
    std::fs::write(&file, text).unwrap();
    let mut config = ServerConfig::texlab(program, root.path().to_owned());
    config.request_timeout = Duration::from_secs(20);
    let (server, mut events) = LanguageServer::start(config).await.unwrap();
    let uri = file_uri(&file).unwrap();
    server.did_open(uri.clone(), "latex", 1, text.into());
    let diagnostics = diagnostics_for(&mut events, &uri).await;
    println!(
        "texlab: {:?}",
        diagnostics
            .diagnostics
            .iter()
            .map(|d| &d.message)
            .collect::<Vec<_>>()
    );
    let names = outline(&server, &uri, "Einführung").await;
    assert!(names.iter().any(|n| n.contains("Einführung")), "{names:?}");
    server.shutdown().await;
}

#[tokio::test]
async fn tinymist_diagnostics_and_outline() {
    let Some(program) = find("tinymist", "SPECTRUM_TINYMIST") else {
        println!("skipped: no tinymist (set SPECTRUM_TINYMIST)");
        return;
    };
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("main.typ");
    let text = "= Einführung\nText 😀 #undefined-thing\n";
    std::fs::write(&file, text).unwrap();
    let mut config = ServerConfig::tinymist(program, root.path().to_owned());
    config.request_timeout = Duration::from_secs(20);
    let (server, mut events) = LanguageServer::start(config).await.unwrap();
    let uri = file_uri(&file).unwrap();
    server.did_open(uri.clone(), "typst", 1, text.into());
    server.pin_main(&file).await.unwrap();
    let diagnostics = diagnostics_for(&mut events, &uri).await;
    println!(
        "tinymist: {:?}",
        diagnostics
            .diagnostics
            .iter()
            .map(|d| &d.message)
            .collect::<Vec<_>>()
    );
    let names = outline(&server, &uri, "Einführung").await;
    assert!(names.iter().any(|n| n.contains("Einführung")), "{names:?}");
    server.shutdown().await;
}
