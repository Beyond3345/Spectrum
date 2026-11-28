//! What a sandboxed program can and cannot do, on a real Windows, in both tiers. The program is
//! the probe (`tests/support/probe.rs`), which prints one line for each thing it tries.
#![cfg(windows)]
#![allow(clippy::unwrap_used)] // helpers too, not just #[test] fns

use std::ffi::OsStr;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use spectrum_win_sandbox::{
    Access, ClientError, ErrorKind, Event, ExitReason, Grant, Network, Output, Request, Session,
    Tier, spawn,
};

const WORKER: &str = env!("CARGO_BIN_EXE_spectrum-win-sandbox");
const PROBE: &str = env!("CARGO_BIN_EXE_spectrum-win-sandbox-probe");
const TIERS: [Tier; 2] = [Tier::AppContainer, Tier::RestrictedLowIntegrity];

fn system(program: &str) -> PathBuf {
    Path::new(&std::env::var_os("SystemRoot").unwrap())
        .join("System32")
        .join(program)
}

fn icacls(arguments: &[&OsStr]) -> String {
    let output = Command::new(system("icacls.exe"))
        .args(arguments)
        .output()
        .unwrap();
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    assert!(output.status.success(), "icacls {arguments:?}: {text}");
    text
}

/// A scratch folder with `work` (granted for writing), `bin` (the probe, granted for reading)
/// and `outside` (never granted, and open to this user alone, whatever the temp folder inherits).
struct Bed {
    _dir: tempfile::TempDir,
    root: PathBuf,
    work: PathBuf,
    bin: PathBuf,
    outside: PathBuf,
}

impl Bed {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        // the real path: the temp folder often comes by its short 8.3 name, which the worker
        // refuses, as it does the \\?\ form's network cousins
        let real = std::fs::canonicalize(dir.path()).unwrap();
        let root = PathBuf::from(real.to_str().unwrap().trim_start_matches(r"\\?\"));
        let bed = Self {
            work: root.join("work"),
            bin: root.join("bin"),
            outside: root.join("outside"),
            root,
            _dir: dir,
        };
        for folder in [&bed.work, &bed.bin, &bed.outside] {
            std::fs::create_dir(folder).unwrap();
        }
        std::fs::copy(PROBE, bed.probe()).unwrap();
        let user = format!("{}:(OI)(CI)F", std::env::var("USERNAME").unwrap());
        icacls(&[
            bed.outside.as_os_str(),
            "/inheritance:r".as_ref(),
            "/grant:r".as_ref(),
            user.as_ref(),
            "/grant:r".as_ref(),
            "*S-1-5-18:(OI)(CI)F".as_ref(),
        ]);
        std::fs::write(bed.private(), "private").unwrap();
        bed
    }

    fn probe(&self) -> PathBuf {
        self.bin.join("probe.exe")
    }

    fn private(&self) -> PathBuf {
        self.outside.join("private.txt")
    }

    /// The probe with these steps, the bed's grants, and the tier's own closed network.
    fn request(&self, tier: Tier, steps: &[&str]) -> Request {
        let mut request = Request::new(tier, self.probe(), &self.work);
        request.args = steps.iter().map(|step| (*step).to_owned()).collect();
        request.grants = vec![
            Grant::new(&self.work, Access::Write),
            Grant::new(&self.bin, Access::Read),
        ];
        request.network = match tier {
            Tier::AppContainer => Network::None,
            Tier::RestrictedLowIntegrity => Network::Open,
        };
        request.limits.timeout_ms = Some(120_000);
        request
    }

    fn run(&self, tier: Tier, steps: &[&str]) -> Output {
        start(&self.request(tier, steps)).wait().unwrap()
    }

    /// The access lists and labels of everything in `work`.
    fn work_security(&self) -> String {
        icacls(&[self.work.as_os_str(), "/T".as_ref()])
    }
}

fn start(request: &Request) -> Session {
    spawn(Path::new(WORKER), request).unwrap()
}

fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}

/// Asserts the probe printed a line that starts so.
#[track_caller]
fn assert_said(output: &Output, tier: Tier, start: &str) {
    let printed = String::from_utf8_lossy(&output.stdout);
    assert!(
        printed.lines().any(|line| line.starts_with(start)),
        "{tier:?}: no line starts with {start:?}.\nstdout: {printed}\nstderr: {}\nwarnings: {:?}",
        String::from_utf8_lossy(&output.stderr),
        output.warnings
    );
}

#[test]
fn the_program_runs_in_its_grants_and_they_are_gone_afterwards() {
    for tier in TIERS {
        let bed = Bed::new();
        let made = bed.work.join("made.txt");
        let mut session = start(&bed.request(tier, &["write", text(&made), "echo", "-"]));
        session.control.write_stdin(b"typed by the test").unwrap();
        let output = session.wait().unwrap();

        assert_eq!(
            (output.code, output.reason),
            (0, ExitReason::Exited),
            "{tier:?}: {output:?}"
        );
        assert_said(&output, tier, &format!("write {} ok", text(&made)));
        assert!(String::from_utf8_lossy(&output.stdout).contains("typed by the test"));
        assert!(output.network_enforced);
        assert_eq!(
            std::fs::read_to_string(&made).unwrap(),
            "written by the probe"
        );

        // no entry of the run's own identifier (an S-1-15-2-… nobody can name) and no low
        // label is left, on the folder or on what the program made in it
        let security = bed.work_security();
        assert!(!security.contains("S-1-15-2-"), "{tier:?}: {security}");
        assert!(!security.contains("Low Mandatory"), "{tier:?}: {security}");
    }
}

#[test]
fn nothing_outside_the_grants_is_read_or_written() {
    for tier in TIERS {
        let bed = Bed::new();
        let secret = bed.work.join(".env");
        std::fs::write(&secret, "KEY=1").unwrap();
        let (private, new) = (bed.private(), bed.outside.join("new.txt"));
        let beside = bed.root.join("beside.txt");
        let output = bed.run(
            tier,
            &[
                "read",
                text(&private),
                "write",
                text(&private),
                "write",
                text(&new),
                "write",
                text(&beside),
                // a secret name inside a granted folder is never granted
                "read",
                text(&secret),
                "write",
                text(&secret),
            ],
        );
        for (step, path) in [
            ("read", &private),
            ("write", &private),
            ("write", &new),
            ("write", &beside),
            ("read", &secret),
            ("write", &secret),
        ] {
            assert_said(&output, tier, &format!("{step} {} denied", text(path)));
        }
        assert_eq!(std::fs::read_to_string(&private).unwrap(), "private");
        assert_eq!(std::fs::read_to_string(&secret).unwrap(), "KEY=1");
        assert!(!new.exists() && !beside.exists());
    }
}

#[test]
fn what_the_program_starts_is_as_confined() {
    for tier in TIERS {
        let bed = Bed::new();
        let (private, inside) = (bed.private(), bed.work.join("by-child.txt"));
        let output = bed.run(
            tier,
            &[
                "child",
                "read",
                text(&private),
                "write",
                text(&private),
                "write",
                text(&inside),
            ],
        );
        assert_said(&output, tier, &format!("read {} denied", text(&private)));
        assert_said(&output, tier, &format!("write {} denied", text(&private)));
        assert_said(&output, tier, &format!("write {} ok", text(&inside)));
        assert_eq!(std::fs::read_to_string(&private).unwrap(), "private");
    }
}

fn refused_as_unsafe(bed: &Bed, tier: Tier) {
    let made = bed.work.join("made.txt");
    let request = bed.request(tier, &["write", text(&made)]);
    match start(&request).wait() {
        Err(ClientError::Refused { kind, message }) => {
            assert_eq!(kind, ErrorKind::UnsafeGrant, "{tier:?}: {message}");
        }
        other => panic!("{tier:?}: the launch was not refused: {other:?}"),
    }
    assert!(!made.exists(), "{tier:?}: the program ran");
}

#[test]
fn a_junction_or_a_hardlink_in_a_granted_folder_refuses_the_launch() {
    for tier in TIERS {
        let bed = Bed::new();
        std::fs::create_dir(bed.work.join("sub")).unwrap();

        // a junction out of the folder, as agent-preview.test.js plants one in an agent's draft
        let junction = bed.work.join("sub").join("escape");
        let made = Command::new(system("cmd.exe"))
            .args(["/d", "/c", "mklink", "/J"])
            .args([&junction, &bed.outside])
            .output()
            .unwrap();
        assert!(made.status.success(), "mklink: {made:?}");
        refused_as_unsafe(&bed, tier);
        std::fs::remove_dir(&junction).unwrap();

        // a hardlink to a file outside: an entry on it would open that file itself
        let hardlink = bed.work.join("linked.txt");
        std::fs::hard_link(bed.private(), &hardlink).unwrap();
        refused_as_unsafe(&bed, tier);
        std::fs::remove_file(&hardlink).unwrap();

        // nothing the refused launches began is left, and the folder still works
        assert!(!bed.work_security().contains("S-1-15-2-"));
        let ok = bed.work.join("ok.txt");
        assert_said(
            &bed.run(tier, &["write", text(&ok)]),
            tier,
            &format!("write {} ok", text(&ok)),
        );
        assert_eq!(std::fs::read_to_string(bed.private()).unwrap(), "private");
    }
}

#[test]
fn an_app_container_has_no_network_and_never_this_computers_ports() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let local = listener.local_addr().unwrap().to_string();
    let bed = Bed::new();
    let tier = Tier::AppContainer;

    let closed = bed.run(tier, &["connect", &local, "connect", "1.1.1.1:443"]);
    assert_said(&closed, tier, &format!("connect {local} denied"));
    assert_said(&closed, tier, "connect 1.1.1.1:443 denied");
    assert!(closed.network_enforced);

    let mut request = bed.request(tier, &["connect", &local]);
    request.network = Network::Open;
    let open = start(&request).wait().unwrap();
    assert_said(&open, tier, &format!("connect {local} denied"));
}

#[test]
fn the_restricted_tier_is_pointed_at_the_gate_and_says_it_is_not_enforced() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let local = address.to_string();
    let bed = Bed::new();
    let tier = Tier::RestrictedLowIntegrity;

    let mut request = bed.request(
        tier,
        &["env", "HTTPS_PROXY", "env", "HTTP_PROXY", "connect", &local],
    );
    request.network = Network::Gate {
        port: address.port(),
    };
    request
        .env
        .insert("https_proxy".into(), "http://elsewhere:8080".into());
    let output = start(&request).wait().unwrap();
    assert_said(
        &output,
        tier,
        &format!("env HTTPS_PROXY ok http://127.0.0.1:{}", address.port()),
    );
    assert_said(
        &output,
        tier,
        &format!("env HTTP_PROXY ok http://127.0.0.1:{}", address.port()),
    );
    // the gate is reachable, which is also what shows the probe's connect works at all
    assert_said(&output, tier, &format!("connect {local} ok"));
    assert!(!output.network_enforced);
}

#[test]
fn no_process_breaks_away_from_the_job() {
    for tier in TIERS {
        let bed = Bed::new();
        let output = bed.run(tier, &["breakaway", "-"]);
        assert_said(&output, tier, "breakaway - denied");
    }
}

#[test]
fn a_kill_ends_the_program_and_what_it_started() {
    for tier in TIERS {
        let bed = Bed::new();
        let began = Instant::now();
        let mut session = start(&bed.request(tier, &["child", "sleep", "300"]));
        let started = session
            .events
            .by_ref()
            .map(Result::unwrap)
            .find(|event| matches!(event, Event::Started { .. } | Event::Error { .. }));
        assert!(
            matches!(started, Some(Event::Started { .. })),
            "{tier:?}: {started:?}"
        );
        session.control.kill().unwrap();
        // the events end only when every process holding the program's pipes is gone: the
        // sleeping child too
        let last = session.events.by_ref().map(Result::unwrap).last();
        let killed = Event::Exit {
            code: 130,
            reason: ExitReason::Killed,
        };
        assert_eq!(last, Some(killed), "{tier:?}");
        assert!(began.elapsed() < Duration::from_secs(120), "{tier:?}");
    }
}

#[test]
fn a_program_out_of_time_is_killed() {
    for tier in TIERS {
        let bed = Bed::new();
        let mut request = bed.request(tier, &["sleep", "300"]);
        request.limits.timeout_ms = Some(1500);
        let output = start(&request).wait().unwrap();
        assert_eq!(
            (output.code, output.reason),
            (130, ExitReason::TimedOut),
            "{tier:?}"
        );
    }
}

#[test]
fn a_runtime_grant_stays_for_the_next_run() {
    let bed = Bed::new();
    let tier = Tier::AppContainer;
    let mut request = bed.request(tier, &["env", "SystemRoot"]);
    request.grants[1].access = Access::Runtime;
    for _ in 0..2 {
        let output = start(&request).wait().unwrap();
        assert_said(&output, tier, "env SystemRoot ok ");
        // the capability every sandboxed run holds, an S-1-15-3-… on the folder and the probe
        let security = icacls(&[bed.bin.as_os_str(), "/T".as_ref()]);
        assert_eq!(security.matches("S-1-15-3-").count(), 2, "{security}");
    }
}

/// The reason the second tier exists: libuv names its pipes where an `AppContainer` may not.
#[test]
#[ignore = "needs Node on the PATH: a Windows hand test"]
fn node_in_the_restricted_tier_starts_a_child_with_new_pipes() {
    let found = Command::new(system("where.exe"))
        .arg("node.exe")
        .output()
        .unwrap();
    let node = String::from_utf8_lossy(&found.stdout);
    let node = Path::new(node.lines().next().expect("node.exe is not on the PATH"));
    let node = std::fs::canonicalize(node).unwrap();
    let node = Path::new(node.to_str().unwrap().trim_start_matches(r"\\?\"));

    let bed = Bed::new();
    let tier = Tier::RestrictedLowIntegrity;
    let mut request = bed.request(tier, &[]);
    request.command = node.to_owned();
    request.grants[1] = Grant::new(node.parent().unwrap(), Access::Runtime);
    // without these Node walks every folder up to the drive, which it may not read
    request.args = ["--preserve-symlinks", "--preserve-symlinks-main", "-e"]
        .map(str::to_owned)
        .to_vec();
    request.args.push(
        "const { execFileSync } = require('node:child_process');\
         process.stdout.write(execFileSync(process.execPath, ['-e', 'console.log(6 * 7)']));"
            .to_owned(),
    );
    for name in ["TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"] {
        request
            .env
            .insert(name.to_owned(), text(&bed.work).to_owned());
    }
    let output = start(&request).wait().unwrap();
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "42",
        "stderr: {}\nwarnings: {:?}",
        String::from_utf8_lossy(&output.stderr),
        output.warnings
    );
}
