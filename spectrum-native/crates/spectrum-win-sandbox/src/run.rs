//! One run on Windows: grant, start isolated, relay, wait, take the grants back.

use std::fs::File;
use std::io::{BufReader, Read, Stdin, Write};
use std::os::windows::io::OwnedHandle;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use spectrum_win_sandbox::paths;
use spectrum_win_sandbox::protocol::{
    self, Access, CHUNK, Control, Event, ExitReason, KILLED_EXIT_CODE, Network, Request, Tier,
};
use spectrum_win_sandbox::validate::Launch;

use crate::grant::{self, Objects};
use crate::win::acl::WinFs;
use crate::win::container::Profile;
use crate::win::job::Job;
use crate::win::process::{self, Identity, Process, Spawn};
use crate::win::sid::Sid;
use crate::win::token;
use crate::{Failure, cmdline, emit};

/// The capability every sandboxed run holds and runtime grants name. Its name is its identity:
/// never change it, or every runtime folder is granted again under the new one.
const RUNTIME_CAPABILITY: &str = "spectrumSandboxRuntime";

/// What a run must undo, whatever happened.
struct Cleanup {
    fs: Option<WinFs>,
    /// The per-run grants made or begun, with whether their low label is to be reset.
    granted: Vec<(String, bool)>,
    profile: Option<Profile>,
}

impl Cleanup {
    fn run(&mut self) {
        if let Some(fs) = &self.fs {
            for (root, reset_label) in self.granted.drain(..) {
                if let Some(message) = grant::revoke(fs, &root, reset_label) {
                    emit(&Event::Warning { message });
                }
            }
        }
        if let Some(mut profile) = self.profile.take()
            && let Err(message) = profile.delete()
        {
            emit(&Event::Warning { message });
        }
    }
}

impl Drop for Cleanup {
    /// For a panic on the way. After the explicit call there is nothing left to do.
    fn drop(&mut self) {
        self.run();
    }
}

/// Runs the request and returns the last event. Everything the program started is dead and
/// every per-run grant is revoked by the time it returns.
pub(crate) fn run(request: &Request, launch: &Launch, input: BufReader<Stdin>) -> Event {
    let mut cleanup = Cleanup {
        fs: None,
        granted: Vec::new(),
        profile: None,
    };
    let result = isolate(request, launch, input, &mut cleanup);
    cleanup.run();
    match result {
        Ok((code, reason)) => Event::Exit { code, reason },
        Err(failure) => Event::Error {
            kind: failure.kind,
            message: failure.message,
        },
    }
}

fn isolate(
    request: &Request,
    launch: &Launch,
    input: BufReader<Stdin>,
    cleanup: &mut Cleanup,
) -> Result<(u32, ExitReason), Failure> {
    let low_integrity = request.tier == Tier::RestrictedLowIntegrity;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let name = format!("Spectrum.Sandbox.{:x}.{nanos:x}", std::process::id());

    // this run's own identifier: an AppContainer's, or (second tier) the one such a container
    // would have, used only as a name no other run shares
    let unique = if low_integrity {
        Sid::of_container_name(&name)?
    } else {
        let profile = cleanup.profile.insert(Profile::create(&name)?);
        profile.sid().clone()
    };
    let runtime = Sid::capability(RUNTIME_CAPABILITY)?;
    let fs = cleanup
        .fs
        .insert(WinFs::new(unique.clone(), runtime.clone())?);

    for granted in &launch.grants {
        if granted.access != Access::Runtime {
            let labelled = low_integrity && granted.access == Access::Write;
            cleanup.granted.push((granted.path.clone(), labelled));
        }
        for message in grant::grant(fs, granted, low_integrity)? {
            emit(&Event::Warning { message });
        }
    }
    let (_, cwd) = fs.open(&launch.cwd, None).map_err(Failure::os)?;
    if cwd.link || !cwd.dir || !paths::same(&cwd.real_path, &launch.cwd) {
        return Err(Failure::unsafe_grant(format!(
            "The working folder “{}” is not a folder at its real path (it is really “{}”).",
            launch.cwd, cwd.real_path
        )));
    }

    let gate = match request.network {
        Network::Gate { port } => Some(port),
        Network::None | Network::Open => None,
    };
    let variables = cmdline::environment(&request.env, |name| std::env::var(name).ok(), gate);
    let environment = cmdline::environment_block(&variables);
    let command_line = cmdline::command_line(&launch.command, &request.args);

    let (stdin_read, stdin_write) = process::pipe()?;
    let (stdout_read, stdout_write) = process::pipe()?;
    let (stderr_read, stderr_write) = process::pipe()?;
    let capabilities = container_capabilities(request.network, runtime)?;
    let restricted: Option<OwnedHandle> = low_integrity
        .then(|| token::restricted_low(&unique, &capabilities[0]))
        .transpose()?;
    let identity = match &restricted {
        Some(token) => Identity::Token(token),
        None => Identity::Container {
            sid: &unique,
            capabilities: &capabilities,
        },
    };
    let program = process::spawn_suspended(&Spawn {
        command: &launch.command,
        command_line: &command_line,
        environment: &environment,
        cwd: &launch.cwd,
        stdio: [&stdin_read, &stdout_write, &stderr_write],
        identity,
    })?;
    // the worker's copies of the program's ends: while they are open no pipe reaches its end
    drop((stdin_read, stdout_write, stderr_write));

    let job = contain(&program, request)?;
    program.resume()?;
    emit(&Event::Started {
        pid: program.pid,
        network_enforced: gate.is_none(),
    });

    let kill = Arc::new(AtomicBool::new(false));
    let relays = [
        relay(stdout_read, |data| Event::Stdout { data }),
        relay(stderr_read, |data| Event::Stderr { data }),
    ];
    listen(input, stdin_write, Arc::clone(&kill));

    // a time too far off to add up is no deadline
    let deadline = request
        .limits
        .timeout_ms
        .and_then(|ms| Instant::now().checked_add(Duration::from_millis(ms)));
    let reason = loop {
        if program.wait(100)? {
            break ExitReason::Exited;
        }
        if kill.load(Ordering::Relaxed) {
            break ExitReason::Killed;
        }
        if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            break ExitReason::TimedOut;
        }
    };
    let code = if reason == ExitReason::Exited {
        program.exit_code()?
    } else {
        KILLED_EXIT_CODE
    };
    // what the program left running goes too; then its pipes end and the relays finish
    job.terminate(KILLED_EXIT_CODE);
    for relay in relays {
        let _ = relay.join();
    }
    Ok((code, reason))
}

/// The capabilities of the first tier, the runtime one first. Registry reads are what Winsock
/// needs to start; `internetClient` is every public address and never this computer's own.
fn container_capabilities(network: Network, runtime: Sid) -> Result<Vec<Sid>, Failure> {
    let mut capabilities = vec![runtime, Sid::capability("registryRead")?];
    if network == Network::Open {
        capabilities.push(Sid::capability("internetClient")?);
    }
    Ok(capabilities)
}

/// Puts the suspended program in a job with the request's limits. Windows refuses a job with
/// desktop limits inside another job (Spectrum started from a job, a CI runner): the run goes
/// on without those limits, and says so.
fn contain(program: &Process, request: &Request) -> Result<Job, Failure> {
    let job = Job::create(&request.limits, true)?;
    let Err(refused) = job.assign(program.handle()) else {
        return Ok(job);
    };
    let plain = Job::create(&request.limits, false)?;
    plain.assign(program.handle())?;
    emit(&Event::Warning {
        message: format!(
            "The job's desktop limits (clipboard, other windows, logging off) are off: {}",
            refused.message
        ),
    });
    Ok(plain)
}

/// Sends what the program writes on, a message a chunk, until its pipe ends.
fn relay(mut pipe: File, event: fn(Vec<u8>) -> Event) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buffer = vec![0; CHUNK];
        while let Ok(read @ 1..) = pipe.read(&mut buffer) {
            emit(&event(buffer[..read].to_vec()));
        }
    })
}

/// Follows Spectrum's control lines for the rest of the run. Input for the program goes
/// through a queue to a writer of its own, so a program that is not reading never holds up a
/// kill. The end of the worker's stdin, or a line that is no control, is a kill.
fn listen(mut input: BufReader<Stdin>, stdin: File, kill: Arc<AtomicBool>) {
    let (queue, queued) = mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut stdin = stdin;
        for data in queued {
            if stdin.write_all(&data).is_err() {
                break;
            }
        }
        // dropping `stdin` here is the end of the program's input
    });
    std::thread::spawn(move || {
        let mut queue = Some(queue);
        loop {
            let control = match protocol::read_line(&mut input) {
                Ok(Some(line)) => protocol::decode::<Control>(&line).ok(),
                Ok(None) | Err(_) => None,
            };
            match control {
                Some(Control::Stdin { data }) => {
                    if let Some(queue) = &queue {
                        let _ = queue.send(data);
                    }
                }
                Some(Control::CloseStdin) => queue = None,
                Some(Control::Kill) | None => {
                    kill.store(true, Ordering::Relaxed);
                    return;
                }
            }
        }
    });
}
