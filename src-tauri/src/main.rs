//! macOS shell: starts the Node backend on 127.0.0.1, shows a splash until it
//! answers, then points the window at it.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use std::{env, thread};

use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::window::Color;
use tauri::{
    AppHandle, Listener, LogicalPosition, Manager, RunEvent, Theme, TitleBarStyle, Url, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

const PREFERRED_PORT: u16 = 38787;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(40);
// Close button at x 12 (the zoom button ends at 72, inside the sidebar's 76px
// gutter); tao grows the title bar to 14 + y, which puts the buttons' centre at
// y - 2 = 26, the middle of the 52px sidebar top row.
const TRAFFIC_LIGHTS: LogicalPosition<f64> = LogicalPosition { x: 12.0, y: 28.0 };

/// How long Cmd+Q and the close button wait for the page to save before quitting
/// anyway, so a hung page can't keep the app open.
const FLUSH_TIMEOUT: Duration = Duration::from_secs(3);
/// How long the Dock's Quit gives the page to send unsaved edits before the
/// backend stops (it can't hear back: the main thread is blocked).
const FLUSH_GRACE: Duration = Duration::from_millis(500);
/// Set once quitting starts, so the editor is flushed only once.
static QUITTING: AtomicBool = AtomicBool::new(false);

/// The backend process. Its stdin pipe stays open for as long as we hold it;
/// the backend exits when it closes, so it can't outlive a crashed shell.
struct Backend(Mutex<Option<Child>>);

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend(Mutex::new(None)))
        .menu(|app| {
            // the stock Quit ends the app at once; ours lets the editor save first
            let menu = Menu::default(app)?;
            if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.first() {
                app_menu.remove_at(app_menu.items()?.len() - 1)?;
                let label = format!("Quit {}", app.package_info().name);
                app_menu.append(&MenuItem::with_id(
                    app,
                    "quit",
                    label,
                    true,
                    Some("CmdOrCtrl+Q"),
                )?)?;
            }
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                quit(app);
            }
        })
        .setup(|app| {
            start(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Spectrum app");

    app.run(|app, event| match event {
        // any other way out (`app.exit`) saves first too
        RunEvent::ExitRequested { api, .. } if !QUITTING.load(Ordering::SeqCst) => {
            api.prevent_exit();
            quit(app);
        }
        RunEvent::Exit => {
            // the Dock's Quit and logging out come straight here
            if !QUITTING.swap(true, Ordering::SeqCst) {
                flush_editor(app);
                thread::sleep(FLUSH_GRACE);
            }
            if let Some(child) = app.state::<Backend>().0.lock().unwrap().take() {
                stop_backend(child);
            }
        }
        _ => {}
    });
}

/// Cmd+Q and the close button: quit once the page says it has saved, or after
/// FLUSH_TIMEOUT.
fn quit(app: &AppHandle) {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    let flushed = app.clone();
    app.once("flushed", move |_| flushed.exit(0));
    flush_editor(app);
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(FLUSH_TIMEOUT);
        app.exit(0);
    });
}

/// Saves the open file now instead of after the autosave delay, then emits
/// `flushed` (heard only while quitting).
fn flush_editor(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(
            "Promise.resolve(window.__spectrumFlush?.()).finally(() => \
             window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'flushed' }))",
        );
    }
}

/// Closes the backend's stdin so it can finish and exit, then kills its process
/// group: compilers it started (latexmk, pdflatex, tectonic) would outlive it.
fn stop_backend(mut child: Child) {
    drop(child.stdin.take());
    let since = Instant::now();
    while matches!(child.try_wait(), Ok(None)) && since.elapsed() < Duration::from_secs(2) {
        thread::sleep(Duration::from_millis(20));
    }
    kill_group(child.id());
    let _ = child.wait();
}

/// SIGKILLs every process in the group led by `pid` (spawned with `process_group(0)`).
fn kill_group(pid: u32) {
    let _ = Command::new("/bin/kill")
        .args(["-KILL", &format!("-{pid}")])
        .stderr(Stdio::null())
        .status();
}

fn start(app: &AppHandle) -> tauri::Result<()> {
    let port = pick_port();
    let splash_ready = Arc::new(AtomicBool::new(false));
    let window = build_window(app, port, splash_ready.clone())?;
    let log_path = app.path().app_log_dir()?.join("backend.log");

    // off the main thread: reading the login shell's PATH can take a second
    let app = app.clone();
    thread::spawn(move || {
        let started = spawn_backend(&app, port, &log_path).and_then(|child| {
            *app.state::<Backend>().0.lock().unwrap() = Some(child);
            wait_for_backend(&app, port)
        });
        match started {
            Ok(()) => {
                let url = format!("http://127.0.0.1:{port}/projects");
                let _ = window.navigate(Url::parse(&url).expect("valid backend URL"));
            }
            Err(message) => {
                // eval is lost if it lands before the splash has loaded
                let since = Instant::now();
                while !splash_ready.load(Ordering::SeqCst)
                    && since.elapsed() < Duration::from_secs(10)
                {
                    thread::sleep(Duration::from_millis(50));
                }
                let _ = window.eval(format!(
                    "window.showError({}, {})",
                    serde_json::Value::from(message),
                    serde_json::Value::from(log_path.display().to_string())
                ));
            }
        }
    });
    Ok(())
}

/// The first free port of 38787–38796, so the page's origin (and with it the
/// settings and API keys in localStorage) stays the same from launch to launch;
/// any free port only if all ten are taken.
fn pick_port() -> u16 {
    (PREFERRED_PORT..PREFERRED_PORT + 10)
        .chain([0])
        .find_map(|port| TcpListener::bind(("127.0.0.1", port)).ok())
        .and_then(|listener| listener.local_addr().ok())
        .map_or(PREFERRED_PORT, |addr| addr.port())
}

fn build_window(
    app: &AppHandle,
    port: u16,
    splash_ready: Arc<AtomicBool>,
) -> tauri::Result<WebviewWindow> {
    let opener = app.clone();
    let new_window_opener = app.clone();
    let download_opener = app.clone();
    let download_dir = app.path().download_dir()?;
    // the macOS "finished" event carries no path, so remember where each URL went
    let downloads = Mutex::new(HashMap::<String, PathBuf>::new());

    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Spectrum")
        .inner_size(1320.0, 860.0)
        .min_inner_size(960.0, 620.0)
        .center()
        .visible(false)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(TRAFFIC_LIGHTS)
        // so Settings can put glass behind the page; follow_glass keeps it opaque until then
        .transparent(true)
        // let WebKit take drops itself, so files dragged in from Finder reach the page
        .disable_drag_drop_handler()
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished && payload.url().scheme() == "tauri" {
                splash_ready.store(true, Ordering::SeqCst);
            }
        })
        .on_navigation(move |url| match url.scheme() {
            "tauri" | "about" | "blob" | "data" => true,
            "http" if url.host_str() == Some("127.0.0.1") && url.port() == Some(port) => true,
            "http" | "https" => {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                false
            }
            _ => false,
        })
        .on_new_window(move |url, _| {
            if matches!(url.scheme(), "http" | "https") {
                let _ = new_window_opener
                    .opener()
                    .open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    *destination = download_path(&download_dir, destination);
                    downloads
                        .lock()
                        .unwrap()
                        .insert(url.to_string(), destination.clone());
                }
                DownloadEvent::Finished { url, success, .. } => {
                    let path = downloads.lock().unwrap().remove(url.as_str());
                    if let (Some(path), true) = (path, success) {
                        let _ = download_opener.opener().reveal_item_in_dir(path);
                    }
                }
                _ => {}
            }
            true
        })
        .build()?;

    // the splash's colour; once the app's page loads, desktop.ts paints the window (opaque,
    // or clear for glass) and follows theme changes, so nothing here repaints it after that
    let _ = window.set_background_color(Some(background(window.theme().unwrap_or(Theme::Light))));
    #[cfg(target_os = "macos")]
    {
        follow_fullscreen_changes(&window);
        follow_glass(app, &window);
    }
    let resized = window.clone();
    let closing = app.clone();
    let full = AtomicBool::new(false);
    window.on_window_event(move |event| match event {
        // tao sends one more resize once a full screen change has finished, by which
        // time is_fullscreen is final (mid-way through leaving it still says true), so
        // this has the last word after follow_fullscreen_changes
        WindowEvent::Resized(_) => {
            let now = resized.is_fullscreen().unwrap_or(false);
            if full.swap(now, Ordering::Relaxed) != now {
                mark_fullscreen(&resized, now);
            }
        }
        // closing the only window quits, so save first
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            quit(&closing);
        }
        _ => {}
    });
    window.show()?;
    Ok(window)
}

/// Sets .fullscreen on the page, which drops the room kept for the traffic lights. .fs-moving
/// turns the page's transitions on for this change only, so showing or hiding the sidebar
/// (and the first paint) stays instant.
fn mark_fullscreen(window: &WebviewWindow, full: bool) {
    let _ = window.eval(format!(
        "{{const r = document.documentElement; r.classList.add('fs-moving'); \
         r.classList.toggle('fullscreen', {full}); clearTimeout(window.__spectrumFsMoving); \
         window.__spectrumFsMoving = setTimeout(() => r.classList.remove('fs-moving'), 400)}}"
    ));
}

/// Marks full screen as macOS starts going in or out (and undoes it if that fails), so
/// the page's transition runs alongside the system animation instead of after it.
#[cfg(target_os = "macos")]
fn follow_fullscreen_changes(window: &WebviewWindow) {
    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSString};
    use std::ptr::NonNull;

    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    let center = NSNotificationCenter::defaultCenter();
    for (name, full) in [
        ("NSWindowWillEnterFullScreenNotification", true),
        ("NSWindowWillExitFullScreenNotification", false),
        ("NSWindowDidFailToEnterFullScreenNotification", false),
        ("NSWindowDidFailToExitFullScreenNotification", true),
    ] {
        let window = window.clone();
        let block = RcBlock::new(move |_: NonNull<NSNotification>| mark_fullscreen(&window, full));
        // SAFETY: ns_window is this window's NSWindow, which lives as long as the app; with
        // no queue, the block runs on the thread that posts (the main thread)
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(&NSString::from_str(name)),
                Some(&*ns_window.cast::<AnyObject>()),
                None,
                &block,
            )
        };
        // the observers are wanted for as long as the app runs
        std::mem::forget(observer);
    }
}

/// Keeps the window opaque unless glass is on, so macOS doesn't blend it with what's behind
/// on every frame for nothing. desktop.ts emits `glass` before it clears the background for
/// glass and after it paints it solid again, so the window never shows black.
#[cfg(target_os = "macos")]
fn follow_glass(app: &AppHandle, window: &WebviewWindow) {
    set_opaque(window, true);
    let window = window.clone();
    app.listen("glass", move |event| {
        set_opaque(&window, event.payload() != "true")
    });
}

/// NSWindow's setOpaque. The window is built transparent; this is all glass needs on top.
#[cfg(target_os = "macos")]
fn set_opaque(window: &WebviewWindow, opaque: bool) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let target = window.clone();
    // queued behind any repaint the page asked for first
    let _ = window.run_on_main_thread(move || {
        if let Ok(ns_window) = target.ns_window() {
            // SAFETY: ns_window is this window's NSWindow, used on the main thread
            let () = unsafe { msg_send![&*ns_window.cast::<AnyObject>(), setOpaque: opaque] };
        }
    });
}

/// Matches --bg-app, so resizing never flashes another colour.
fn background(theme: Theme) -> Color {
    match theme {
        Theme::Dark => Color(0x18, 0x18, 0x18, 0xff),
        _ => Color(0xf7, 0xf7, 0xf8, 0xff),
    }
}

/// `~/Downloads/<suggested name>`, numbered like Finder ("main 2.pdf") when taken.
fn download_path(dir: &Path, proposed: &Path) -> PathBuf {
    let proposed = proposed
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Download".into());
    // wry splits at the first dot and renames a taken "a.b.pdf" to "a (1).b.pdf",
    // then "a (2).b.pdf" and so on; undo that, but keep a "(n)" the name came with
    let (base, ext) = proposed.split_at(proposed.find('.').unwrap_or(proposed.len()));
    let numbered = |original: &str, k: u32| match k {
        0 => format!("{original}{ext}"),
        k => format!("{original} ({k}){ext}"),
    };
    let mut name = proposed.clone();
    if let Some((original, n)) = base.strip_suffix(')').and_then(|b| b.rsplit_once(" (")) {
        if let Ok(n @ 1..) = n.parse::<u32>() {
            if (0..n).all(|k| dir.join(numbered(original, k)).exists()) {
                name = numbered(original, 0);
            }
        }
    }
    // Finder numbers before the last extension: "Thesis v1.2 2.pdf"
    let named = Path::new(&name);
    let stem = named.file_stem().unwrap_or_default().to_string_lossy();
    let ext = named
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mut path = dir.join(&name);
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} {n}{ext}"));
        n += 1;
    }
    path
}

fn spawn_backend(app: &AppHandle, port: u16, log_path: &Path) -> Result<Child, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Couldn't create {}: {e}", data_dir.display()))?;
    if let Some(dir) = log_path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let log = File::create(log_path).map_err(|e| format!("Couldn't create the log file: {e}"))?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;
    let path_var = search_path();

    let mut cmd = backend_command(app, &data_dir, &path_var)?;
    cmd.current_dir(&data_dir)
        .env("PORT", port.to_string())
        .env("SPECTRUM_HOST", "127.0.0.1")
        .env("SPECTRUM_DATA_DIR", &data_dir)
        .env("SPECTRUM_EXIT_WITH_STDIN", "1")
        .env("NODE_ENV", "production")
        .env("PATH", &path_var)
        .stdin(Stdio::piped())
        .stdout(log)
        .stderr(log_err)
        // its own group, so quitting can stop the compilers it starts too
        .process_group(0);
    cmd.spawn()
        .map_err(|e| format!("Couldn't start the Spectrum server: {e}"))
}

/// Release: the bundled Node runs the bundled server, which seeds templates into
/// the data folder and reads `.env` from it.
#[cfg(not(debug_assertions))]
fn backend_command(app: &AppHandle, data_dir: &Path, _path_var: &str) -> Result<Command, String> {
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let exe = env::current_exe().map_err(|e| e.to_string())?;
    let node = exe
        .parent()
        .map(|dir| dir.join("node"))
        .ok_or("Couldn't find the bundled Node.js.")?;
    let mut cmd = Command::new(node);
    cmd.arg(resources.join("backend").join("server.mjs"))
        .env("SPECTRUM_REPO_ROOT", data_dir)
        .env("SPECTRUM_FRONTEND_DIST", resources.join("frontend"))
        .env("SPECTRUM_TEMPLATE_DIR", data_dir.join("templates"))
        .env("SPECTRUM_TEMPLATE_SEED_DIR", resources.join("templates"))
        .env("SPECTRUM_NATIVE_DIR", resources.join("native"))
        .env("SPECTRUM_DICT_DIR", resources.join("dictionaries"));
    Ok(cmd)
}

/// Debug: the system Node runs the backend straight from the repo, so the repo's
/// `.env`, `apps/frontend/dist` and `templates/` are used as they are.
#[cfg(debug_assertions)]
fn backend_command(_app: &AppHandle, _data_dir: &Path, path_var: &str) -> Result<Command, String> {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root");
    let node = path_var
        .split(':')
        .map(|dir| Path::new(dir).join("node"))
        .find(|p| p.is_file())
        .ok_or("Node.js wasn't found on your PATH.")?;
    let mut cmd = Command::new(node);
    cmd.arg(repo.join("apps/backend/src/index.js"))
        .env("SPECTRUM_REPO_ROOT", repo);
    Ok(cmd)
}

/// Apps launched from Finder get a bare PATH; use the login shell's (where
/// Homebrew, MacTeX, pyenv etc. are set up) plus the usual tool folders.
fn search_path() -> String {
    let home = env::var("HOME").unwrap_or_default();
    let login = login_shell_path().unwrap_or_default();
    let extra = [
        "/Library/TeX/texbin".to_string(),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        format!("{home}/.cargo/bin"),
        "/usr/bin".into(),
        "/bin".into(),
        "/usr/sbin".into(),
        "/sbin".into(),
    ];
    let mut dirs: Vec<String> = Vec::new();
    for dir in login.split(':').map(str::to_string).chain(extra) {
        if !dir.is_empty() && !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

fn login_shell_path() -> Option<String> {
    shell_path(&env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()))
}

fn shell_path(shell: &str) -> Option<String> {
    const MARK: &str = "__SPECTRUM_PATH__";
    // works in sh, bash, zsh and fish
    let script = format!("printf '%s%s%s' {MARK} \"$PATH\" {MARK}");
    let mut child = Command::new(shell)
        .args(["-ilc", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    // stop at the second mark: a job the rc files leave running keeps stdout open
    thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0; 4096];
        loop {
            let text = String::from_utf8_lossy(&out);
            if let [_, path, _, ..] = text.split(MARK).collect::<Vec<_>>()[..] {
                let _ = tx.send(path.to_string());
                return;
            }
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => return,
                Ok(n) => out.extend_from_slice(&buf[..n]),
            }
        }
    });
    let path = rx.recv_timeout(Duration::from_secs(4)).ok();
    kill_group(child.id());
    let _ = child.wait();
    path
}

fn wait_for_backend(app: &AppHandle, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(child) = app.state::<Backend>().0.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!(
                    "The Spectrum server stopped while starting ({status})."
                ));
            }
        }
        if health_ok(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err("The Spectrum server didn't respond within 40 seconds.".into())
}

fn health_ok(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.starts_with("HTTP/1.1 200")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_names_follow_finder() {
        let dir = env::temp_dir().join(format!("spectrum-dl-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(
            download_path(&dir, &dir.join("main.pdf")),
            dir.join("main.pdf")
        );
        fs::write(dir.join("main.pdf"), "").unwrap();
        // wry's own pick for a taken name
        assert_eq!(
            download_path(&dir, &dir.join("main (1).pdf")),
            dir.join("main 2.pdf")
        );
        fs::write(dir.join("main 2.pdf"), "").unwrap();
        assert_eq!(
            download_path(&dir, &dir.join("main (1).pdf")),
            dir.join("main 3.pdf")
        );
        assert_eq!(download_path(&dir, &dir.join("notes")), dir.join("notes"));
        // dotted names: wry proposes "Thesis v1 (1).2.pdf" when the name is taken
        fs::write(dir.join("Thesis v1.2.pdf"), "").unwrap();
        assert_eq!(
            download_path(&dir, &dir.join("Thesis v1 (1).2.pdf")),
            dir.join("Thesis v1.2 2.pdf")
        );
        // a "(2)" that's part of the name stays, even with "Results.pdf" there
        assert_eq!(
            download_path(&dir, &dir.join("Results (2).pdf")),
            dir.join("Results (2).pdf")
        );
        fs::write(dir.join("Results.pdf"), "").unwrap();
        assert_eq!(
            download_path(&dir, &dir.join("Results (2).pdf")),
            dir.join("Results (2).pdf")
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn shell_path_ignores_jobs_left_running() {
        use std::os::unix::fs::PermissionsExt;
        // an rc file that leaves a job holding stdout open, then prints the PATH
        let shell = env::temp_dir().join(format!("spectrum-sh-{}", std::process::id()));
        fs::write(&shell, "#!/bin/sh\nsleep 30 &\neval \"$2\"\n").unwrap();
        fs::set_permissions(&shell, fs::Permissions::from_mode(0o755)).unwrap();
        let since = Instant::now();
        let path = shell_path(shell.to_str().unwrap());
        fs::remove_file(&shell).unwrap();
        assert_eq!(path, env::var("PATH").ok());
        assert!(since.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn stopping_the_backend_stops_what_it_started() {
        // `cat` exits when stdin closes, like the backend; `sleep` stands in for a
        // compile it started, which would be left running
        let child = Command::new("/bin/sh")
            .args(["-c", "sleep 30 & exec cat"])
            .stdin(Stdio::piped())
            .process_group(0)
            .spawn()
            .unwrap();
        let group = format!("-{}", child.id());
        stop_backend(child);
        // anything left in the group? (give launchd a moment to reap it)
        let alive = || {
            Command::new("/bin/kill")
                .args(["-0", &group])
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success()
        };
        let since = Instant::now();
        while alive() && since.elapsed() < Duration::from_secs(1) {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(!alive(), "process group {group} outlived the backend");
    }

    #[test]
    fn search_path_has_tex_and_no_duplicates() {
        let path = search_path();
        let dirs: Vec<&str> = path.split(':').collect();
        assert!(dirs.contains(&"/Library/TeX/texbin"));
        assert_eq!(
            dirs.len(),
            dirs.iter().collect::<std::collections::HashSet<_>>().len()
        );
    }
}
