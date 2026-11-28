//! Build tasks: the gate, dependency fetching, the TexLab build, packaging.
//!
//! `cargo xtask check` runs the gate every session must pass before it commits.

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
    if std::env::args().nth(1).as_deref() == Some("check") {
        return check();
    }
    eprintln!("usage: cargo xtask check");
    ExitCode::FAILURE
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
