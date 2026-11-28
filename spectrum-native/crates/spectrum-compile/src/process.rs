//! One program of a compile, as 2.8's `runSpawn`: in its own process group (on Windows its own tree, with no
//! console window), its output streamed line by line, stopped with everything it started on a time limit, a
//! cancel, or when the compile is dropped.

#[cfg(unix)]
mod unix;

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, watch};

use crate::{CompileError, CompileEvent};

/// Windows' `CREATE_NO_WINDOW`: every child process gets it, or each would flash a console window.
#[cfg(windows)]
pub(crate) const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A compile's log is kept to this many bytes, as in 2.8; every line still streams.
pub(crate) const MAX_LOG_BYTES: usize = 200_000;

/// Stops a compile: [`CancelToken::cancel`] from anywhere, and every program it runs is killed with what it
/// started.
#[derive(Debug, Clone)]
pub struct CancelToken {
    sender: std::sync::Arc<watch::Sender<bool>>,
}

impl Default for CancelToken {
    fn default() -> Self {
        Self::new()
    }
}

impl CancelToken {
    pub fn new() -> Self {
        Self {
            sender: std::sync::Arc::new(watch::channel(false).0),
        }
    }

    pub fn cancel(&self) {
        self.sender.send_replace(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.sender.borrow()
    }

    /// The same token (a clone of it), not just one in the same state.
    pub(crate) fn same(&self, other: &Self) -> bool {
        std::sync::Arc::ptr_eq(&self.sender, &other.sender)
    }

    pub(crate) async fn cancelled(&self) {
        let mut receiver = self.sender.subscribe();
        // the sender lives as long as self, so this only returns once cancelled
        let _ = receiver.wait_for(|stopped| *stopped).await;
    }
}

/// The environment a compile's programs get, with Windows' case-blind names (`Path`).
#[derive(Debug, Clone, Default)]
pub(crate) struct Env(Vec<(OsString, OsString)>);

impl Env {
    /// This process's environment without any key, token, secret, password or credential: a document reads
    /// them with `kpsewhich -var-value` or Lua's `os.getenv`, and a filter or plot as easily.
    pub(crate) fn safe_system() -> Self {
        Self(
            std::env::vars_os()
                .filter(|(name, _)| !secret_name(name))
                .collect(),
        )
    }

    fn same(a: &OsStr, b: &OsStr) -> bool {
        if cfg!(windows) {
            a.to_string_lossy()
                .eq_ignore_ascii_case(&b.to_string_lossy())
        } else {
            a == b
        }
    }

    pub(crate) fn get(&self, name: &str) -> Option<&OsStr> {
        self.0
            .iter()
            .find(|(k, _)| Self::same(k, OsStr::new(name)))
            .map(|(_, v)| v.as_os_str())
    }

    pub(crate) fn set(&mut self, name: &str, value: impl Into<OsString>) {
        let value = value.into();
        match self
            .0
            .iter_mut()
            .find(|(k, _)| Self::same(k, OsStr::new(name)))
        {
            Some(slot) => slot.1 = value,
            None => self.0.push((name.into(), value)),
        }
    }

    pub(crate) fn path(&self) -> OsString {
        self.get("PATH")
            .map(OsStr::to_os_string)
            .unwrap_or_default()
    }

    fn without_secrets(&self) -> impl Iterator<Item = &(OsString, OsString)> {
        self.0.iter().filter(|(name, _)| !secret_name(name))
    }
}

fn secret_name(name: &OsStr) -> bool {
    let upper = name.to_string_lossy().to_uppercase();
    ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL"]
        .iter()
        .any(|word| upper.contains(word))
}

/// Gives a Windows child no console window; nothing elsewhere.
pub(crate) fn no_window(command: &mut tokio::process::Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    #[cfg(not(windows))]
    let _ = command;
}

/// Kills a process group (Unix: the child was its leader) or, on Windows, the tree under the process.
pub(crate) fn kill_group(pid: u32) {
    #[cfg(unix)]
    unix::kill_group(pid);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // no process groups: taskkill walks the tree down from the child, so only while it still runs
        let _ = std::process::Command::new("taskkill")
            .args(["/pid", &pid.to_string(), "/t", "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

/// Kills the group when dropped, so a compile future dropped mid-pass leaves nothing running.
struct GroupGuard(Option<u32>);

impl Drop for GroupGuard {
    fn drop(&mut self) {
        if let Some(pid) = self.0.take() {
            kill_group(pid);
        }
    }
}

/// The log of a compile: each line goes to the window as it comes, and into the kept log up to
/// [`MAX_LOG_BYTES`].
#[derive(Debug, Default)]
pub(crate) struct LogSink {
    events: Option<mpsc::UnboundedSender<CompileEvent>>,
    pub(crate) log: String,
}

impl LogSink {
    pub(crate) fn new(events: Option<mpsc::UnboundedSender<CompileEvent>>) -> Self {
        Self {
            events,
            log: String::new(),
        }
    }

    /// One line of output (or of Spectrum's own, `[spectrum note] ...`).
    pub(crate) fn line(&mut self, text: &str) {
        if let Some(events) = &self.events {
            let _ = events.send(CompileEvent::Output(text.to_owned()));
        }
        let room = MAX_LOG_BYTES.saturating_sub(self.log.len());
        if room == 0 {
            return;
        }
        let mut end = text.len().min(room);
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        self.log.push_str(&text[..end]);
        if self.log.len() < MAX_LOG_BYTES {
            self.log.push('\n');
        }
    }

    pub(crate) fn event(&self, event: CompileEvent) {
        if let Some(events) = &self.events {
            let _ = events.send(event);
        }
    }
}

/// One program to run.
pub(crate) struct Spawn<'a> {
    pub(crate) program: &'a Path,
    pub(crate) args: Vec<OsString>,
    pub(crate) cwd: &'a Path,
    pub(crate) env: &'a Env,
    pub(crate) limit: Duration,
    pub(crate) stdin: Option<Vec<u8>>,
    /// macOS: the sandbox-exec profile the program and what it starts run under.
    pub(crate) profile: Option<&'a str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Exit {
    /// `None` when it was killed.
    pub(crate) code: Option<i32>,
    pub(crate) timed_out: bool,
    pub(crate) stopped: bool,
}

/// Runs one program to its end, a time limit or a cancel. `program` that is a bare name is looked up on the
/// environment's PATH first (on Windows never in the working folder), so a missing one is
/// [`CompileError::NotFound`].
pub(crate) async fn run(
    spawn: Spawn<'_>,
    sink: &mut LogSink,
    cancel: &CancelToken,
) -> Result<Exit, CompileError> {
    if cancel.is_cancelled() {
        return Ok(Exit {
            code: None,
            timed_out: false,
            stopped: true,
        });
    }
    let program = resolve(spawn.program, spawn.env)?;
    let mut command = command_for(&program, spawn.args, spawn.profile);
    command
        .current_dir(working_dir(spawn.cwd))
        .env_clear()
        .envs(spawn.env.without_secrets().map(|(k, v)| (k, v)))
        .stdin(if spawn.stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    no_window(&mut command);
    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            CompileError::NotFound(name_of(spawn.program))
        } else {
            CompileError::io("couldn't start", &program, e)
        }
    })?;
    let mut guard = GroupGuard(child.id());
    if let (Some(input), Some(mut pipe)) = (spawn.stdin, child.stdin.take()) {
        // a program that never reads it closes the pipe first
        tokio::spawn(async move {
            let _ = pipe.write_all(&input).await;
        });
    }
    let (tx, mut rx) = mpsc::unbounded_channel();
    let readers = [
        child
            .stdout
            .take()
            .map(|out| tokio::spawn(lines(out, tx.clone()))),
        child
            .stderr
            .take()
            .map(|err| tokio::spawn(lines(err, tx.clone()))),
    ];
    drop(tx);

    let deadline = tokio::time::sleep(spawn.limit);
    tokio::pin!(deadline);
    let (mut timed_out, mut stopped) = (false, false);
    let status = loop {
        tokio::select! {
            Some(line) = rx.recv() => sink.line(&line),
            status = child.wait() => break status,
            () = &mut deadline, if !timed_out => {
                timed_out = true;
                if let Some(pid) = guard.0 { kill_group(pid); }
            }
            () = cancel.cancelled(), if !stopped => {
                stopped = true;
                if let Some(pid) = guard.0 { kill_group(pid); }
            }
        }
    };
    // what it left running would hold the pipes open; the output still drains into the log
    if cfg!(unix) {
        drop(guard);
    } else {
        guard.0 = None;
    }
    let drain = async {
        while let Some(line) = rx.recv().await {
            sink.line(&line);
        }
    };
    let _ = tokio::time::timeout(Duration::from_secs(2), drain).await;
    for reader in readers.into_iter().flatten() {
        reader.abort();
    }
    let status = status.map_err(|e| CompileError::io("couldn't wait for", &program, e))?;
    if timed_out {
        sink.line(&format!(
            "\n[spectrum] {} was stopped after {}s.",
            name_of(spawn.program),
            spawn.limit.as_secs()
        ));
    }
    Ok(Exit {
        code: if timed_out || stopped {
            None
        } else {
            status.code()
        },
        timed_out,
        stopped: stopped && !timed_out,
    })
}

async fn lines(stream: impl AsyncRead + Unpin, tx: mpsc::UnboundedSender<String>) {
    let mut reader = BufReader::new(stream);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => return,
            Ok(_) => {
                let text = String::from_utf8_lossy(&buf);
                let text = text.trim_end_matches(['\n', '\r']);
                if tx.send(text.to_owned()).is_err() {
                    return;
                }
            }
        }
    }
}

fn name_of(program: &Path) -> String {
    program.file_stem().map_or_else(
        || program.display().to_string(),
        |s| s.to_string_lossy().into_owned(),
    )
}

fn resolve(program: &Path, env: &Env) -> Result<PathBuf, CompileError> {
    if program.is_absolute() {
        return Ok(program.to_path_buf());
    }
    crate::engines::find_executable(&program.to_string_lossy(), &env.path())
        .ok_or_else(|| CompileError::NotFound(name_of(program)))
}

#[cfg(target_os = "macos")]
const SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";

fn command_for(
    program: &Path,
    args: Vec<OsString>,
    profile: Option<&str>,
) -> tokio::process::Command {
    if let Some(profile) = profile {
        #[cfg(target_os = "macos")]
        {
            let mut command = tokio::process::Command::new(SANDBOX_EXEC);
            command.arg("-p").arg(profile).arg(program).args(args);
            return command;
        }
        #[cfg(not(target_os = "macos"))]
        let _ = profile;
    }
    #[cfg(windows)]
    if is_batch(program) {
        let mut command = tokio::process::Command::new(
            std::env::var_os("ComSpec").unwrap_or_else(|| "cmd.exe".into()),
        );
        command.raw_arg(batch_line(program, &args));
        return command;
    }
    let mut command = tokio::process::Command::new(program);
    command.args(args);
    command
}

/// `CreateProcess` needs the extended-length form for a working folder beyond `MAX_PATH`.
fn working_dir(cwd: &Path) -> PathBuf {
    if cfg!(windows) && cwd.as_os_str().len() >= 248 && !cwd.to_string_lossy().starts_with(r"\\?\")
    {
        let text = cwd.to_string_lossy();
        return match text.strip_prefix(r"\\") {
            Some(unc) => PathBuf::from(format!(r"\\?\UNC\{unc}")),
            None => PathBuf::from(format!(r"\\?\{text}")),
        };
    }
    cwd.to_path_buf()
}

#[cfg_attr(
    not(windows),
    allow(dead_code, reason = "Windows only; tested everywhere")
)]
fn is_batch(program: &Path) -> bool {
    program
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| ext.eq_ignore_ascii_case("bat") || ext.eq_ignore_ascii_case("cmd"))
}

/// cmd.exe reads its own command line: each argument quoted, then its specials caret-escaped, `%` too
/// (cross-spawn's way, as 2.8 ran a batch file). Passed verbatim after `/d /s /c`.
/// ponytail: a batch file that turns on delayed expansion still expands !name! in its arguments
#[cfg_attr(
    not(windows),
    allow(dead_code, reason = "Windows only; tested everywhere")
)]
fn batch_line(program: &Path, args: &[OsString]) -> String {
    let escape = |s: &str| {
        let mut out = String::with_capacity(s.len());
        for c in s.chars() {
            if "()][%!^\"`<>&|;, *?".contains(c) {
                out.push('^');
            }
            out.push(c);
        }
        out
    };
    let parts: Vec<String> = std::iter::once(escape(&program.to_string_lossy()))
        .chain(
            args.iter()
                .map(|a| escape(&format!("\"{}\"", a.to_string_lossy()))),
        )
        .collect();
    format!("/d /s /c \"{}\"", parts.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_never_reach_a_compile() {
        let mut env = Env::default();
        env.set("PATH", "/bin");
        env.set("OPENAI_API_KEY", "x");
        env.set("GITHUB_TOKEN", "x");
        env.set("db_password", "x");
        env.set("TEXINPUTS", ".:");
        let kept: Vec<_> = env
            .without_secrets()
            .map(|(k, _)| k.to_string_lossy().into_owned())
            .collect();
        assert_eq!(kept, ["PATH", "TEXINPUTS"]);
        env.set("PATH", "/usr/bin");
        assert_eq!(env.path(), OsString::from("/usr/bin"));
    }

    #[test]
    fn log_keeps_its_cap_but_streams_every_line() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut sink = LogSink::new(Some(tx));
        let long = "é".repeat(MAX_LOG_BYTES);
        sink.line(&long);
        sink.line("after");
        assert!(sink.log.len() <= MAX_LOG_BYTES);
        assert!(!sink.log.contains("after"));
        let mut count = 0;
        while rx.try_recv().is_ok() {
            count += 1;
        }
        assert_eq!(count, 2);
    }

    #[test]
    fn batch_files_go_through_cmd_escaped() {
        assert!(is_batch(Path::new(r"C:\x\latexmk.BAT")));
        assert!(!is_batch(Path::new("pdflatex.exe")));
        let line = batch_line(
            Path::new(r"C:\Program Files\x.cmd"),
            &["a b".into(), "100%".into()],
        );
        assert_eq!(
            line,
            r#"/d /s /c "C:\Program^ Files\x.cmd ^"a^ b^" ^"100^%^"""#
        );
    }

    #[test]
    fn long_working_folders_get_the_extended_prefix_on_windows() {
        let long = format!(r"C:\{}", "a".repeat(260));
        let expected = if cfg!(windows) {
            format!(r"\\?\{long}")
        } else {
            long.clone()
        };
        assert_eq!(working_dir(Path::new(&long)), PathBuf::from(expected));
        assert_eq!(working_dir(Path::new("/short")), PathBuf::from("/short"));
    }

    #[cfg(unix)]
    fn env_with_path() -> Env {
        let mut env = Env::default();
        env.set("PATH", "/bin:/usr/bin");
        env
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn output_streams_line_by_line_with_the_exit_code() {
        let env = env_with_path();
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut sink = LogSink::new(Some(tx));
        let exit = run(
            Spawn {
                program: Path::new("sh"),
                args: vec!["-c".into(), "echo one; echo two >&2; cat; exit 3".into()],
                cwd: Path::new("/"),
                env: &env,
                limit: Duration::from_secs(10),
                stdin: Some(b"three\n".to_vec()),
                profile: None,
            },
            &mut sink,
            &CancelToken::new(),
        )
        .await
        .unwrap();
        assert_eq!(exit.code, Some(3));
        let mut lines = Vec::new();
        while let Ok(CompileEvent::Output(line)) = rx.try_recv() {
            lines.push(line);
        }
        lines.sort();
        assert_eq!(lines, ["one", "three", "two"]);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_missing_program_is_not_found() {
        let env = env_with_path();
        let err = run(
            Spawn {
                program: Path::new("no-such-engine"),
                args: vec![],
                cwd: Path::new("/"),
                env: &env,
                limit: Duration::from_secs(1),
                stdin: None,
                profile: None,
            },
            &mut LogSink::default(),
            &CancelToken::new(),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, CompileError::NotFound(name) if name == "no-such-engine"));
    }

    /// Whether a process is still alive (a zombie counts as gone).
    #[cfg(unix)]
    fn alive(pid: &str) -> bool {
        std::process::Command::new("ps")
            .args(["-o", "stat=", "-p", pid])
            .output()
            .is_ok_and(|o| {
                let stat = String::from_utf8_lossy(&o.stdout);
                !stat.trim().is_empty() && !stat.trim().starts_with('Z')
            })
    }

    #[cfg(unix)]
    async fn grandchild_after(
        script: &str,
        limit: Duration,
        cancel_after: Option<Duration>,
    ) -> (Exit, String) {
        let dir = tempfile::tempdir().unwrap();
        let pid_file = dir.path().join("pid");
        let env = env_with_path();
        let cancel = CancelToken::new();
        if let Some(after) = cancel_after {
            let cancel = cancel.clone();
            tokio::spawn(async move {
                tokio::time::sleep(after).await;
                cancel.cancel();
            });
        }
        let started = std::time::Instant::now();
        let exit = run(
            Spawn {
                program: Path::new("sh"),
                args: vec![
                    "-c".into(),
                    format!("{script} echo $! > '{}'; wait", pid_file.display()).into(),
                ],
                cwd: dir.path(),
                env: &env,
                limit,
                stdin: None,
                profile: None,
            },
            &mut LogSink::default(),
            &cancel,
        )
        .await
        .unwrap();
        assert!(started.elapsed() < Duration::from_secs(10));
        let pid = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .to_owned();
        (exit, pid)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancel_kills_the_whole_process_group() {
        let (exit, pid) = grandchild_after(
            "sleep 30 &",
            Duration::from_secs(60),
            Some(Duration::from_millis(300)),
        )
        .await;
        assert!(exit.stopped && !exit.timed_out && exit.code.is_none());
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !alive(&pid),
            "the grandchild sleep {pid} outlived the cancel"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn the_time_limit_kills_the_whole_process_group() {
        let (exit, pid) = grandchild_after("sleep 30 &", Duration::from_millis(300), None).await;
        assert!(exit.timed_out && !exit.stopped);
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(!alive(&pid));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropping_a_run_kills_its_group() {
        let dir = tempfile::tempdir().unwrap();
        let pid_file = dir.path().join("pid");
        let env = env_with_path();
        let script = format!("sleep 30 & echo $! > '{}'; wait", pid_file.display());
        let cancel = CancelToken::new();
        let mut sink = LogSink::default();
        let fut = run(
            Spawn {
                program: Path::new("sh"),
                args: vec!["-c".into(), script.into()],
                cwd: dir.path(),
                env: &env,
                limit: Duration::from_secs(60),
                stdin: None,
                profile: None,
            },
            &mut sink,
            &cancel,
        );
        let _ = tokio::time::timeout(Duration::from_millis(400), fut).await;
        tokio::time::sleep(Duration::from_millis(200)).await;
        let pid = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .to_owned();
        assert!(!alive(&pid));
    }
}
