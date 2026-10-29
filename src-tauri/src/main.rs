//! Desktop shell (macOS and Windows): starts the Node backend on 127.0.0.1, shows
//! a splash until it answers, then points the window at it.
// no console window behind the app on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
#[cfg(unix)]
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::{env, thread};

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::window::Color;
use tauri::{
    AppHandle, Listener, Manager, RunEvent, Theme, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent, Wry,
};
#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, TitleBarStyle};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

const PREFERRED_PORT: u16 = 38787;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(40);
// Close button at x 12 (the zoom button ends at 72, left of the sidebar icon at
// 88 and the collapsed header's 76px gutter); tao grows the title bar to 14 + y,
// which puts the buttons' centre at y - 2 = 26, the middle of the 52px sidebar
// top row.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHTS: LogicalPosition<f64> = LogicalPosition { x: 12.0, y: 28.0 };
/// Keeps the backend and the tools it runs from opening console windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// How long Cmd+Q waits for a page that never answers. A reported save failure cancels quitting.
const FLUSH_TIMEOUT: Duration = Duration::from_secs(3);
/// How long the Dock's Quit gives the page to send unsaved edits before the
/// backend stops (it can't hear back: the main thread is blocked).
const FLUSH_GRACE: Duration = Duration::from_millis(500);
/// Set once quitting starts, so the editor is flushed only once.
static QUITTING: AtomicBool = AtomicBool::new(false);
static FLUSH_ID: AtomicUsize = AtomicUsize::new(0);
/// The diagram composer's window (open_diagram), beside the main one.
const DIAGRAM: &str = "diagram";

/// The backend process. Its stdin pipe stays open for as long as we hold it;
/// the backend exits when it closes, so it can't outlive a crashed shell.
struct Backend(Mutex<Option<Child>>);

/// The backend's port, for the windows built after the first.
struct Port(u16);

/// A file opened from Finder or Explorer waits here until the app's page has loaded.
#[derive(Default)]
struct Opened {
    loaded: bool,
    waiting: Option<PathBuf>,
}

// UTType, for claim_defaults (AppKit loads it too, but nothing promises that)
#[cfg(target_os = "macos")]
#[link(name = "UniformTypeIdentifiers", kind = "framework")]
extern "C" {}

fn main() {
    let builder = tauri::Builder::default()
        // Windows: a file double-clicked while Spectrum runs starts a second copy, which hands
        // its arguments over to this one and quits
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            open_files(
                app,
                argv.iter().skip(1).map(|arg| Path::new(&cwd).join(arg)),
            );
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend(Mutex::new(None)))
        .manage(Mutex::new(Opened::default()));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![open_diagram]);
    // Windows has no menu bar: closing the window quits there
    #[cfg(target_os = "macos")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            claim_default_handler,
            open_diagram
        ])
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
        });
    let app = builder
        .setup(|app| {
            // Windows starts Spectrum with the file double-clicked in Explorer (or one named from a terminal)
            let cwd = env::current_dir().unwrap_or_default();
            open_files(
                app.handle(),
                env::args_os().skip(1).map(|arg| cwd.join(arg)),
            );
            start(app.handle())?;
            #[cfg(all(target_os = "macos", not(debug_assertions)))]
            claim_once(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Spectrum app");

    app.run(|app, event| match event {
        // a file opened from Finder, at launch (maybe before setup) or later
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            open_files(app, urls.iter().filter_map(|url| url.to_file_path().ok()));
        }
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

/// One quit attempt: a failed save cancels its timeout too, without affecting a later retry.
struct QuitFlush {
    remaining: usize,
    active: bool,
}

impl QuitFlush {
    fn new(remaining: usize) -> Self {
        Self {
            remaining,
            active: true,
        }
    }

    fn completed(&mut self, saved: bool) -> Option<bool> {
        if !self.active {
            return None;
        }
        if saved {
            self.remaining = self.remaining.saturating_sub(1);
        }
        if !saved || self.remaining == 0 {
            self.active = false;
            Some(saved)
        } else {
            None
        }
    }

    fn timed_out(&mut self) -> bool {
        std::mem::replace(&mut self.active, false)
    }
}

fn flush_event(kind: &str) -> String {
    format!("{kind}-{}", FLUSH_ID.fetch_add(1, Ordering::SeqCst))
}

fn save_failed(app: &AppHandle, payload: &serde_json::Value) {
    let error = payload
        .get("error")
        .and_then(|error| error.as_str())
        .unwrap_or("The page couldn’t save its changes.");
    app.dialog()
        .message(format!("{error}\n\nYour work is still open. Try saving again before closing or switching diagrams."))
        .title("Changes weren’t saved")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

/// Cmd+Q and the close button: quit once every window saved, or after FLUSH_TIMEOUT if none reported a failed save.
fn quit(app: &AppHandle) {
    if QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    let windows = app.webview_windows();
    if windows.is_empty() {
        app.exit(0);
        return;
    }
    let state = Arc::new(Mutex::new(QuitFlush::new(windows.len())));
    let event = flush_event("flushed");
    let flushed = app.clone();
    let answers = state.clone();
    let listener = app.listen(event.clone(), move |event| {
        let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
        let saved = payload.get("ok").and_then(|ok| ok.as_bool()) == Some(true);
        let done = answers.lock().unwrap().completed(saved);
        if let Some(saved) = done {
            flushed.unlisten(event.id());
            if saved {
                flushed.exit(0);
            } else {
                QUITTING.store(false, Ordering::SeqCst);
                save_failed(&flushed, &payload);
            }
        }
    });
    for window in windows.values() {
        if let Err(error) = flush(window, &event) {
            state.lock().unwrap().completed(false);
            app.unlisten(listener);
            QUITTING.store(false, Ordering::SeqCst);
            save_failed(app, &serde_json::json!({ "error": error.to_string() }));
            return;
        }
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(FLUSH_TIMEOUT);
        app.unlisten(listener);
        if state.lock().unwrap().timed_out() {
            app.exit(0);
        }
    });
}

/// Saves every window's open work now instead of after the autosave delay.
fn flush_editor(app: &AppHandle) {
    for window in app.webview_windows().values() {
        let _ = flush(window, "flushed");
    }
}

/// A rejected save answers with a failure instead of authorising close, navigation or quit.
fn flush_script(event: &str) -> String {
    format!(
        "Promise.resolve().then(() => window.__spectrumFlush?.()).then(\
         () => ({{ ok: true }}), error => ({{ ok: false, error: String(error?.message || error) }}))\
         .then(payload => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {{ event: {}, payload }}))",
        serde_json::Value::from(event)
    )
}

fn flush(window: &WebviewWindow, event: &str) -> tauri::Result<()> {
    window.eval(flush_script(event))
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
#[cfg(unix)]
fn kill_group(pid: u32) {
    let _ = Command::new("/bin/kill")
        .args(["-KILL", &format!("-{pid}")])
        .stderr(Stdio::null())
        .status();
}

/// Windows has no process groups: kills `pid` and the processes it started.
// ponytail: /T only reaches what a still-running backend started (it stops its own
// compiles on the way out); a job object would catch orphans too
#[cfg(windows)]
fn kill_group(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

fn start(app: &AppHandle) -> tauri::Result<()> {
    let port = pick_port();
    app.manage(Port(port));
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
                let waiting = app.state::<Mutex<Opened>>().lock().unwrap().waiting.take();
                let _ = window.navigate(app_url(port, waiting.as_deref()));
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

/// The app's first page: the projects, or the file opened from Finder or Explorer (the page's
/// /open route finds its project).
fn app_url(port: u16, file: Option<&Path>) -> Url {
    let mut url =
        Url::parse(&format!("http://127.0.0.1:{port}/projects")).expect("valid backend URL");
    if let Some(file) = file {
        url.set_path("/open");
        url.query_pairs_mut()
            .append_pair("path", &file.to_string_lossy());
    }
    url
}

/// The composer's page (App.tsx's /diagram) for a project, with the project-relative diagram file to
/// open, or the language its chooser starts in.
fn diagram_url(port: u16, project: &str, file: Option<&str>, language: Option<&str>) -> Url {
    let mut url =
        Url::parse(&format!("http://127.0.0.1:{port}/diagram")).expect("valid backend URL");
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("project", project);
        if let Some(file) = file.filter(|file| !file.is_empty()) {
            query.append_pair("file", file);
        }
        if let Some(language) = language.filter(|l| matches!(*l, "tikz" | "typst" | "mermaid")) {
            query.append_pair("lang", language);
        }
    }
    url
}

/// Draw a diagram and Edit diagram: the composer's window at the diagram asked for, built beside the
/// main one or brought forward. One showing another diagram saves it first, then turns to this one.
// async: building a window from a command that runs on the main thread can hang WebView2
#[tauri::command]
async fn open_diagram(
    app: AppHandle,
    project: String,
    file: Option<String>,
    language: Option<String>,
) -> Result<(), String> {
    let port = app.state::<Port>().0;
    let url = diagram_url(port, &project, file.as_deref(), language.as_deref());
    let Some(window) = app.get_webview_window(DIAGRAM) else {
        return build_diagram_window(&app, port, url)
            .map(|_| ())
            .map_err(|e| e.to_string());
    };
    if window.url().map_or(true, |at| at != url) {
        let event = flush_event("diagram-switch");
        let target = window.clone();
        let switching = app.clone();
        let listener = window.once(event.clone(), move |event| {
            let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
            if payload.get("ok").and_then(|ok| ok.as_bool()) == Some(true) {
                let _ = target.navigate(url);
            } else {
                save_failed(&switching, &payload);
            }
        });
        if let Err(error) = flush(&window, &event) {
            window.unlisten(listener);
            return Err(error.to_string());
        }
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

/// Brings the window forward and opens the first .tex, .ltx or .bib file of `paths` (never a
/// PDF). Until the app's page has loaded, the file waits for it (see start and build_window).
// ponytail: several files at once open the first; tabs for the rest if anyone asks
fn open_files(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let window = app.get_webview_window("main");
    if let Some(window) = &window {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let Some(path) = paths.into_iter().find(|path| openable(path)) else {
        return;
    };
    let mut opened = app.state::<Mutex<Opened>>().inner().lock().unwrap();
    match window {
        // App.tsx's __spectrumOpen keeps the open editor; the /open route reloads the page, so
        // it's only for a page that hasn't registered yet
        Some(window) if opened.loaded => {
            let _ = window.eval(format!(
                "(window.__spectrumOpen ?? ((p) => location.assign('/open?path=' + encodeURIComponent(p))))({})",
                serde_json::Value::from(path.to_string_lossy().into_owned())
            ));
        }
        _ => opened.waiting = Some(path),
    }
}

fn openable(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase);
    path.is_file() && matches!(ext.as_deref(), Some("tex" | "ltx" | "bib"))
}

/// Once per Mac (a marker in the app data folder remembers it), so another app picked in Finder
/// later stays picked. Not in a debug build: `tauri dev` leaves this Mac's defaults alone.
#[cfg(all(target_os = "macos", not(debug_assertions)))]
fn claim_once(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    if dir.join(CLAIMED).exists() {
        return;
    }
    // Launch Services can be slow to answer
    thread::spawn(move || {
        if let Err(message) = claim_defaults(&dir) {
            eprintln!("Couldn’t make Spectrum the default for .tex and .bib files: {message}");
        }
    });
}

/// Settings → Projects, for when another app has taken the files since.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn claim_default_handler(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || claim_defaults(&dir))
        .await
        .map_err(|e| e.to_string())?
}

/// Marks that Spectrum has made itself the default once.
#[cfg(target_os = "macos")]
const CLAIMED: &str = "default-handler-claimed";

/// Makes Spectrum the default app for the content types macOS gives .tex, .ltx and .bib files
/// (MacTeX declares org.tug.tex; with no app declaring one, a dynamic type), waits for macOS
/// to confirm each, then leaves the CLAIMED marker in `data_dir`.
#[cfg(target_os = "macos")]
fn claim_defaults(data_dir: &Path) -> Result<(), String> {
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;

    if cfg!(debug_assertions) {
        return Err("A debug build leaves this Mac’s defaults alone.".into());
    }
    let ut_type = AnyClass::get(c"UTType").ok_or("macOS has no UTType here.")?;
    // SAFETY: class methods and a getter of NSWorkspace and NSBundle, which AppKit always loads
    let (workspace, app_url): (Retained<AnyObject>, Retained<AnyObject>) = unsafe {
        let bundle: Retained<AnyObject> = msg_send![class!(NSBundle), mainBundle];
        (
            msg_send![class!(NSWorkspace), sharedWorkspace],
            msg_send![&bundle, bundleURL],
        )
    };
    let exts = ["tex", "ltx", "bib"];
    let (tx, rx) = mpsc::channel();
    for ext in exts {
        // SAFETY: +[UTType typeWithFilenameExtension:] takes an NSString and returns a UTType or nil
        let content_type: Option<Retained<AnyObject>> =
            unsafe { msg_send![ut_type, typeWithFilenameExtension: &*NSString::from_str(ext)] };
        let Some(content_type) = content_type else {
            return Err(format!("macOS has no type for .{ext} files."));
        };
        let tx = tx.clone();
        // called once, on a queue of macOS's choosing, with nil or an NSError
        let done = RcBlock::new(move |error: *mut AnyObject| {
            // SAFETY: error is nil or an NSError, whose localizedDescription is an NSString
            let failed = unsafe { error.as_ref() }.map(|error| {
                let text: Retained<NSString> = unsafe { msg_send![error, localizedDescription] };
                format!(".{ext}: {text}")
            });
            let _ = tx.send(failed);
        });
        // SAFETY: an app URL, a UTType and a block taking an NSError, as the method expects (macOS 12+)
        let () = unsafe {
            msg_send![&workspace, setDefaultApplicationAtURL: &*app_url, toOpenContentType: &*content_type, completionHandler: &*done]
        };
    }
    let failures: Vec<String> = exts
        .iter()
        .filter_map(|_| match rx.recv_timeout(Duration::from_secs(10)) {
            Ok(failed) => failed,
            Err(_) => Some("macOS didn’t answer.".into()),
        })
        .collect();
    // tried once, whatever came of it: a later launch never takes back a type the user gave another app
    let _ = fs::create_dir_all(data_dir).and_then(|()| fs::write(data_dir.join(CLAIMED), ""));
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join(" "))
    }
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

/// What every window gets: it stays on the app's own pages (a web address opens in the browser),
/// opens no windows of its own, saves downloads to Downloads and lets WebKit take drops itself, so
/// files dragged in from Finder reach the page.
fn guarded<'a>(
    builder: WebviewWindowBuilder<'a, Wry, AppHandle>,
    app: &AppHandle,
    port: u16,
) -> tauri::Result<WebviewWindowBuilder<'a, Wry, AppHandle>> {
    let opener = app.clone();
    let new_window_opener = app.clone();
    let download_opener = app.clone();
    let download_dir = app.path().download_dir()?;
    // the macOS "finished" event carries no path, so remember where each URL went
    let downloads = Mutex::new(HashMap::<String, PathBuf>::new());
    // WebView2 keeps the splash in its history, where Alt+Left or the mouse's back button would
    // strand the window on "Starting…"; once the app has loaded, the splash is behind it for good
    let left_splash = AtomicBool::new(false);
    Ok(builder
        .disable_drag_drop_handler()
        .on_navigation(move |url| match url.scheme() {
            _ if is_splash(url) => !(cfg!(windows) && left_splash.load(Ordering::Relaxed)),
            "about" | "blob" | "data" => true,
            "http" if url.host_str() == Some("127.0.0.1") && url.port() == Some(port) => {
                left_splash.store(true, Ordering::Relaxed);
                true
            }
            "http" | "https" => {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                false
            }
            _ => false,
        })
        .on_new_window(move |url, _| {
            // a web address, or an email address in the PDF
            if matches!(url.scheme(), "http" | "https" | "mailto") {
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
        }))
}

fn build_window(
    app: &AppHandle,
    port: u16,
    splash_ready: Arc<AtomicBool>,
) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Spectrum")
        .inner_size(1320.0, 860.0)
        .min_inner_size(960.0, 620.0)
        .center()
        .visible(false)
        // the editor's right-click Paste reads the clipboard, which WebView2 otherwise asks about each time (Windows
        // and Linux only; on_navigation keeps the window on the app's own pages)
        .enable_clipboard_access();
    // shrunk to fit a short screen before it's centred, or its title bar would start above the top
    #[cfg(windows)]
    let builder = builder.prevent_overflow();
    // Windows keeps its standard title bar
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(TRAFFIC_LIGHTS)
        // so Settings can put glass behind the page; follow_glass keeps it opaque until then
        .transparent(true);
    let window = guarded(builder, app, port)?
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            if is_splash(payload.url()) {
                splash_ready.store(true, Ordering::SeqCst);
            } else if payload.url().port() == Some(port) {
                // the app's page (the backend's): it takes files from now on, and one that came
                // while it loaded goes there now
                let mut opened = window.state::<Mutex<Opened>>().inner().lock().unwrap();
                opened.loaded = true;
                if let Some(file) = opened.waiting.take() {
                    let _ = window.navigate(app_url(port, Some(&file)));
                }
            }
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
        // closing the main window quits, so save first
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            quit(&closing);
        }
        _ => {}
    });
    window.show()?;
    Ok(window)
}

/// The diagram composer, at `url`: a window of its own with the standard title bar, so it can sit
/// beside the document or on another screen. Closing it saves its diagram and never quits. Glass
/// stays the main window's (appearance.ts).
fn build_diagram_window(app: &AppHandle, port: u16, url: Url) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, DIAGRAM, WebviewUrl::External(url))
        .title("Diagram")
        .inner_size(1180.0, 780.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .visible(false)
        .enable_clipboard_access();
    #[cfg(windows)]
    let builder = builder.prevent_overflow();
    let window = guarded(builder, app, port)?.build()?;
    // desktop.ts paints it for the app's theme once the page loads
    let _ = window.set_background_color(Some(background(window.theme().unwrap_or(Theme::Light))));
    let target = window.clone();
    let closing = Arc::new(AtomicBool::new(false));
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if closing.swap(true, Ordering::SeqCst) {
                return;
            }
            let event = flush_event("closable");
            let closed = target.clone();
            let pending = closing.clone();
            let listener = target.once(event.clone(), move |event| {
                let payload: serde_json::Value = serde_json::from_str(event.payload()).unwrap_or_default();
                if payload.get("ok").and_then(|ok| ok.as_bool()) == Some(true) {
                    let _ = closed.destroy();
                } else {
                    pending.store(false, Ordering::SeqCst);
                    save_failed(closed.app_handle(), &payload);
                }
            });
            if let Err(error) = flush(&target, &event) {
                target.unlisten(listener);
                closing.store(false, Ordering::SeqCst);
                save_failed(target.app_handle(), &serde_json::json!({ "error": error.to_string() }));
            }
        }
    });
    window.show()?;
    Ok(window)
}

/// The splash's own address: tauri://localhost, or http://tauri.localhost in WebView2.
fn is_splash(url: &Url) -> bool {
    url.scheme() == "tauri"
        || cfg!(windows)
            && url.scheme() == "http"
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none()
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
        // the test suite's stand-in for / (agent detection), never a release's
        .env_remove("SPECTRUM_SYSTEM_ROOT")
        .env("PATH", &path_var)
        // file reads waiting on a cloud provider (an online-only file downloading) hold a thread each; Node's
        // default four would leave saves queued behind them
        .env("UV_THREADPOOL_SIZE", "16")
        .stdin(Stdio::piped())
        .stdout(log)
        .stderr(log_err);
    // TexLab, Tectonic and Typst sit beside Spectrum like Node (tauri dev copies them beside the debug build); without
    // them the backend looks on the PATH, and the editor works as before when there's none
    if let Some(dir) = env::current_exe().ok().as_deref().and_then(Path::parent) {
        cmd.env("SPECTRUM_TEXLAB", dir.join(format!("texlab{}", env::consts::EXE_SUFFIX)))
            .env(
                "SPECTRUM_TECTONIC",
                dir.join(format!("tectonic{}", env::consts::EXE_SUFFIX)),
            )
            .env(
                "SPECTRUM_TYPST",
                dir.join(format!("typst{}", env::consts::EXE_SUFFIX)),
            );
    }
    // its own group, so quitting can stop the compilers it starts too
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
        // Documents may be redirected (OneDrive's folder backup); the known folder follows it
        if let Ok(docs) = app.path().document_dir() {
            cmd.env("SPECTRUM_PROJECTS_DIR", docs.join("Spectrum"));
        }
    }
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
        .map(|dir| dir.join(format!("node{}", env::consts::EXE_SUFFIX)))
        .ok_or("Couldn't find the bundled Node.js.")?;
    let mut cmd = Command::new(node);
    cmd.arg(resources.join("backend").join("server.mjs"))
        .env("SPECTRUM_REPO_ROOT", data_dir)
        .env("SPECTRUM_FRONTEND_DIST", resources.join("frontend"))
        .env("SPECTRUM_TEMPLATE_DIR", data_dir.join("templates"))
        .env("SPECTRUM_TEMPLATE_SEED_DIR", resources.join("templates"))
        .env("SPECTRUM_NATIVE_DIR", resources.join("native"))
        .env("SPECTRUM_ENGINES_RESOURCE_DIR", resources.join("engines"))
        .env("SPECTRUM_DICT_DIR", resources.join("dictionaries"))
        .env("SPECTRUM_SKILLS_SEED_DIR", resources.join("skills"));
    Ok(cmd)
}

/// Debug: the system Node runs the backend straight from the repo, so the repo's
/// `.env`, `apps/frontend/dist` and `templates/` are used as they are.
#[cfg(debug_assertions)]
fn backend_command(_app: &AppHandle, _data_dir: &Path, path_var: &str) -> Result<Command, String> {
    let repo = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root");
    let node = env::split_paths(path_var)
        .map(|dir| dir.join(format!("node{}", env::consts::EXE_SUFFIX)))
        .find(|p| p.is_file())
        .ok_or("Node.js wasn't found on your PATH.")?;
    let mut cmd = Command::new(node);
    cmd.arg(repo.join("apps/backend/src/index.js"))
        .env("SPECTRUM_REPO_ROOT", repo);
    Ok(cmd)
}

/// Apps started from Explorer get the PATH Explorer started with, so a MiKTeX or TeX
/// Live installed since isn't on it yet: add their folders when they're there.
#[cfg(windows)]
fn search_path() -> String {
    let local = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = env::var_os("ProgramFiles").map(PathBuf::from);
    search_path_from(
        &env::var("PATH").unwrap_or_default(),
        local.as_deref(),
        program_files.as_deref(),
        Path::new(r"C:\texlive"),
    )
}

#[cfg(windows)]
fn search_path_from(
    path: &str,
    local: Option<&Path>,
    program_files: Option<&Path>,
    texlive: &Path,
) -> String {
    // C:\texlive\<year>\bin\windows, the newest year
    let newest = fs::read_dir(texlive).ok().and_then(|years| {
        years
            .flatten()
            .map(|year| year.file_name())
            .filter(|name| name.to_string_lossy().parse::<u16>().is_ok())
            .max()
    });
    let tex = [
        local.map(|dir| dir.join(r"Programs\MiKTeX\miktex\bin\x64")),
        program_files.map(|dir| dir.join(r"MiKTeX\miktex\bin\x64")),
        newest.map(|year| texlive.join(year).join(r"bin\windows")),
    ];
    let mut dirs: Vec<String> = path
        .split(';')
        .filter(|dir| !dir.is_empty())
        .map(str::to_string)
        .collect();
    for dir in tex.into_iter().flatten().filter(|dir| dir.is_dir()) {
        let dir = dir.to_string_lossy().into_owned();
        if !dirs
            .iter()
            .any(|d| d.trim_end_matches('\\').eq_ignore_ascii_case(&dir))
        {
            dirs.push(dir);
        }
    }
    dirs.join(";")
}

/// Apps launched from Finder get a bare PATH; use the login shell's (where
/// Homebrew, MacTeX, pyenv etc. are set up) plus the usual tool folders.
#[cfg(unix)]
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

#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    shell_path(&env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()))
}

#[cfg(unix)]
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
    fn a_failed_save_cancels_only_its_quit_attempt_and_timer() {
        let mut attempt = QuitFlush::new(2);
        assert_eq!(attempt.completed(true), None);
        assert_eq!(attempt.completed(false), Some(false));
        assert!(!attempt.timed_out());
        assert_eq!(attempt.completed(true), None);
        let mut retry = QuitFlush::new(2);
        assert_eq!(retry.completed(true), None);
        assert_eq!(retry.completed(true), Some(true));
        assert!(!retry.timed_out());
        let mut hung = QuitFlush::new(1);
        assert!(hung.timed_out());
        assert_eq!(hung.completed(false), None);
    }

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
    fn opens_tex_ltx_and_bib_files_only() {
        let dir = env::temp_dir().join(format!("spectrum-open-{}", std::process::id()));
        fs::create_dir_all(dir.join("folder.tex")).unwrap();
        for name in ["a.tex", "b.LTX", "c.bib", "d.pdf"] {
            fs::write(dir.join(name), "").unwrap();
        }
        let ok = |name: &str| openable(&dir.join(name));
        assert!(ok("a.tex") && ok("b.LTX") && ok("c.bib"));
        assert!(!ok("d.pdf") && !ok("gone.tex") && !ok("folder.tex"));
        // the path survives the trip through the query string
        let file = dir.join("a b&c#d.tex");
        let url = app_url(PREFERRED_PORT, Some(&file));
        assert_eq!(url.path(), "/open");
        assert_eq!(url.query_pairs().next().unwrap().1, file.to_string_lossy());
        assert_eq!(app_url(PREFERRED_PORT, None).path(), "/projects");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn diagram_url_names_the_project_file_and_known_languages() {
        let url = diagram_url(
            PREFERRED_PORT,
            "p1",
            Some("figures/a b&c.tex"),
            Some("tikz"),
        );
        assert_eq!(url.path(), "/diagram");
        let query: Vec<(String, String)> = url.query_pairs().into_owned().collect();
        let pair = |k: &str, v: &str| (k.to_string(), v.to_string());
        assert_eq!(
            query,
            [
                pair("project", "p1"),
                pair("file", "figures/a b&c.tex"),
                pair("lang", "tikz")
            ]
        );
        // no file, and a language the composer doesn't know, leave the chooser as it starts
        let chooser = diagram_url(PREFERRED_PORT, "p1", Some(""), Some("dot"));
        assert_eq!(chooser.query(), Some("project=p1"));
    }

    #[test]
    #[cfg(unix)]
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
    #[cfg(unix)]
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
    #[cfg(unix)]
    fn search_path_has_tex_and_no_duplicates() {
        let path = search_path();
        let dirs: Vec<&str> = path.split(':').collect();
        assert!(dirs.contains(&"/Library/TeX/texbin"));
        assert_eq!(
            dirs.len(),
            dirs.iter().collect::<std::collections::HashSet<_>>().len()
        );
    }

    #[test]
    #[cfg(windows)]
    fn search_path_adds_tex_once() {
        // a MiKTeX installed for this user only, after the PATH was set
        let local = env::temp_dir().join(format!("spectrum-local-{}", std::process::id()));
        let miktex = local.join(r"Programs\MiKTeX\miktex\bin\x64");
        fs::create_dir_all(&miktex).unwrap();
        let texlive = local.join("texlive");
        let path = search_path_from(r"C:\Windows;", Some(&local), Some(&local), &texlive);
        assert_eq!(path, format!(r"C:\Windows;{}", miktex.display()));
        // already there, in any case
        assert_eq!(
            search_path_from(&path.to_uppercase(), Some(&local), Some(&local), &texlive),
            path.to_uppercase()
        );
        // TeX Live is discovered as well, using the newest year, with neither directory duplicated.
        for year in ["2024", "2025"] {
            fs::create_dir_all(texlive.join(year).join(r"bin\windows")).unwrap();
        }
        fs::create_dir_all(texlive.join("not-a-year").join(r"bin\windows")).unwrap();
        let expected = format!(r"{};{}", path, texlive.join("2025").join(r"bin\windows").display());
        assert_eq!(search_path_from(&path, Some(&local), Some(&local), &texlive), expected);
        assert_eq!(
            search_path_from(&expected.to_uppercase(), Some(&local), Some(&local), &texlive),
            expected.to_uppercase()
        );
        fs::remove_dir_all(&local).unwrap();
    }
}
