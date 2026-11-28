//! What the Windows escape tests run inside the sandbox. Never shipped.
//!
//! `probe <step> <argument> …`: tries each step and prints one line for it,
//! `<step> <argument> ok <result>` or `<step> <argument> denied <error>`.
//! Steps: `write` and `read` a file, `connect` to an address, `env` a variable, `echo` stdin
//! to stdout, `sleep` seconds, `breakaway` (start a process outside the job), `child` (run the
//! rest of the line in a process of its own).

use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::process::{Command, ExitCode};
use std::time::Duration;

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let mut out = std::io::stdout();
    for (at, pair) in arguments.chunks(2).enumerate() {
        let step = pair[0].as_str();
        let argument = pair.get(1).map_or("", String::as_str);
        let result = match step {
            "write" => std::fs::write(argument, "written by the probe")
                .map(|()| String::new())
                .map_err(|e| e.to_string()),
            "read" => std::fs::read_to_string(argument).map_err(|e| e.to_string()),
            "connect" => connect(argument),
            "env" => Ok(std::env::var(argument).unwrap_or_default()),
            "echo" => std::io::copy(&mut std::io::stdin(), &mut out)
                .map(|bytes| bytes.to_string())
                .map_err(|e| e.to_string()),
            "sleep" => {
                std::thread::sleep(Duration::from_secs(argument.parse().unwrap_or(1)));
                Ok(String::new())
            }
            "breakaway" => breakaway(),
            "child" => {
                // everything after `child` is the child's own line
                let rest = &arguments[at * 2 + 1..];
                return match own()
                    .and_then(|mut c| c.args(rest).status().map_err(|e| e.to_string()))
                {
                    Ok(status) if status.success() => ExitCode::SUCCESS,
                    Ok(_) | Err(_) => ExitCode::FAILURE,
                };
            }
            _ => Err("unknown step".to_owned()),
        };
        let line = match result {
            Ok(value) => format!("{step} {argument} ok {value}\n"),
            Err(error) => format!("{step} {argument} denied {error}\n"),
        };
        if out
            .write_all(line.as_bytes())
            .and_then(|()| out.flush())
            .is_err()
        {
            return ExitCode::FAILURE;
        }
    }
    ExitCode::SUCCESS
}

fn own() -> Result<Command, String> {
    std::env::current_exe()
        .map(Command::new)
        .map_err(|e| e.to_string())
}

fn connect(address: &str) -> Result<String, String> {
    let address: SocketAddr = address.parse().map_err(|_| "not an address".to_owned())?;
    TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map(|_| String::new())
        .map_err(|e| e.to_string())
}

/// A job that allows no breakaway refuses the flag, and the process is never made.
fn breakaway() -> Result<String, String> {
    // a plain child first, with the program's own pipes (the null device is closed to an
    // AppContainer): the refusal below must be the flag's, not every process's
    if let Err(error) = own()?.args(["env", "PROBE"]).status() {
        return Ok(format!("but no process starts at all: {error}"));
    }
    let mut command = own()?;
    command.args(["env", "PROBE"]);
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0100_0000 | 0x0800_0000); // CREATE_BREAKAWAY_FROM_JOB, CREATE_NO_WINDOW
    command
        .status()
        .map(|_| String::new())
        .map_err(|e| e.to_string())
}
