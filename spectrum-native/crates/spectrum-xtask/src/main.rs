//! Build tasks: the gate, dependency fetching, the TexLab build, packaging.
//!
//! `cargo xtask check` runs the gate every session must pass before it commits.
//! `cargo xtask fetch-pdfium [--target <triple>]` downloads the pinned PDFium (`assets/pdfium.json`)
//! into `target/pdfium/<triple>/`, where spectrum-pdf's tests and a dev build find it.

mod pdfium;

use std::process::{Command, ExitCode};

const GATE: &[&[&str]] = &[
    &["fmt", "--all", "--check"],
    &[
        "clippy",
        "--workspace",
        "--all-targets",
        "--",
        "-D",
        "warnings",
    ],
    &["test", "--workspace"],
];

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("check") => check(),
        Some("fetch-pdfium") => {
            let target = match args.get(1).map(String::as_str) {
                Some("--target") => args.get(2).cloned(),
                Some(_) => None,
                None => pdfium::host_target().map(str::to_owned),
            };
            let Some(target) = target else {
                eprintln!(
                    "usage: cargo xtask fetch-pdfium [--target aarch64-apple-darwin|x86_64-pc-windows-msvc]"
                );
                return ExitCode::FAILURE;
            };
            match pdfium::fetch(&target) {
                Ok(path) => {
                    eprintln!("PDFium ready: {}", path.display());
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("fetch-pdfium: {e:#}");
                    ExitCode::FAILURE
                }
            }
        }
        _ => {
            eprintln!("usage: cargo xtask check | fetch-pdfium [--target <triple>]");
            ExitCode::FAILURE
        }
    }
}

fn check() -> ExitCode {
    for args in GATE {
        eprintln!("cargo {}", args.join(" "));
        let ok = Command::new(env!("CARGO"))
            .args(*args)
            .status()
            .is_ok_and(|s| s.success());
        if !ok {
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}
