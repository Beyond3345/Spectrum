//! A language server process: started, kept to its open documents, and started again when it crashes.

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::str::FromStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use lsp_types::notification::{
    DidChangeTextDocument, DidCloseTextDocument, DidOpenTextDocument, DidSaveTextDocument,
    Notification,
};
use lsp_types::request::{
    Completion, DocumentSymbolRequest, GotoDefinition, HoverRequest, Rename, Request,
};
use lsp_types::{
    CompletionParams, CompletionResponse, DidChangeTextDocumentParams, DidCloseTextDocumentParams,
    DidOpenTextDocumentParams, DidSaveTextDocumentParams, DocumentSymbolParams,
    DocumentSymbolResponse, GotoDefinitionParams, GotoDefinitionResponse, Hover, HoverParams,
    InitializeResult, PartialResultParams, Position, RenameParams, ServerCapabilities,
    TextDocumentContentChangeEvent, TextDocumentIdentifier, TextDocumentItem,
    TextDocumentPositionParams, Uri, VersionedTextDocumentIdentifier, WorkDoneProgressParams,
    WorkspaceEdit,
};
use parking_lot::Mutex;
use serde_json::{Value, json};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use crate::document::{OpenDocument, apply_change};
use crate::rpc::Connection;
use crate::settings::{capabilities, initialization_options};
use crate::{LspError, LspEvent, texlab_settings, tinymist_settings};

/// Restarts after a crash before giving up; the count starts again after a run of `STABLE_RUN`.
const MAX_RESTARTS: u32 = 3;
const STABLE_RUN: Duration = Duration::from_secs(60);
const INITIALIZE_TIMEOUT: Duration = Duration::from_secs(20);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
/// After `exit`, how long a server has to go before it's killed.
const EXIT_GRACE: Duration = Duration::from_secs(1);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerKind {
    /// LaTeX and BibTeX.
    TexLab,
    /// Typst.
    Tinymist,
}

/// How to run a server. Start from [`ServerConfig::texlab`] or [`ServerConfig::tinymist`].
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub kind: ServerKind,
    pub program: PathBuf,
    pub args: Vec<OsString>,
    /// The project folder (absolute): the workspace root.
    pub root: PathBuf,
    /// Set on top of Spectrum's own environment.
    pub env: Vec<(OsString, OsString)>,
    /// The `texlab` or Tinymist settings object ([`texlab_settings`], [`tinymist_settings`]).
    pub settings: Value,
    pub request_timeout: Duration,
    /// The wait before the first restart; it doubles for each one after.
    pub restart_delay: Duration,
}

impl ServerConfig {
    /// TexLab, with only the system's own folders on its PATH: it reads a project's latexmkrc (Perl that can
    /// do anything) by running latexmk, and then finds none.
    pub fn texlab(program: PathBuf, root: PathBuf) -> Self {
        let path = if cfg!(windows) {
            let system = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
            let system = PathBuf::from(system);
            std::env::join_paths([system.join("System32"), system]).unwrap_or_default()
        } else {
            "/usr/bin:/bin".into()
        };
        Self::new(
            ServerKind::TexLab,
            program,
            root,
            "run",
            texlab_settings(None),
        )
        .with_env("PATH", path)
    }

    /// Tinymist. Set `TYPST_PACKAGE_CACHE_PATH` with [`ServerConfig::with_env`] to share the compiles' packages.
    pub fn tinymist(program: PathBuf, root: PathBuf) -> Self {
        Self::new(
            ServerKind::Tinymist,
            program,
            root,
            "lsp",
            tinymist_settings(&[]),
        )
    }

    fn new(kind: ServerKind, program: PathBuf, root: PathBuf, arg: &str, settings: Value) -> Self {
        Self {
            kind,
            program,
            args: vec![arg.into()],
            root,
            env: Vec::new(),
            settings,
            request_timeout: Duration::from_secs(10),
            restart_delay: Duration::from_millis(500),
        }
    }

    #[must_use]
    pub fn with_env(mut self, name: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        self.env.push((name.into(), value.into()));
        self
    }
}

/// A file path as a `file:` URI. Also escapes `[`, `]`, `^` and `|`, which a URI path can't hold.
pub fn file_uri(path: &Path) -> Result<Uri, LspError> {
    let not_absolute = || LspError::NotAbsolute(path.to_owned());
    let url = url::Url::from_file_path(path).map_err(|()| not_absolute())?;
    let escaped = url
        .as_str()
        .replace('[', "%5B")
        .replace(']', "%5D")
        .replace('^', "%5E")
        .replace('|', "%7C");
    Uri::from_str(&escaped).map_err(|_| not_absolute())
}

/// A running language server. Dropping it kills the server; [`LanguageServer::shutdown`] asks it to stop first.
pub struct LanguageServer {
    inner: Arc<Inner>,
    stop: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
}

struct Inner {
    config: ServerConfig,
    root_uri: Uri,
    events: mpsc::UnboundedSender<LspEvent>,
    /// `None` while it's restarting or after it's stopped. Locked after `documents` when both are.
    connection: Mutex<Option<Arc<Connection>>>,
    capabilities: Mutex<Option<ServerCapabilities>>,
    documents: Mutex<HashMap<Uri, OpenDocument>>,
    main_file: Mutex<Option<PathBuf>>,
    stopping: AtomicBool,
}

impl LanguageServer {
    /// Starts the server and completes the `initialize` handshake. Needs a Tokio runtime.
    pub async fn start(
        config: ServerConfig,
    ) -> Result<(Self, mpsc::UnboundedReceiver<LspEvent>), LspError> {
        let root_uri = file_uri(&config.root)?;
        // ponytail: TexLab 5.26 panics on a URI with [, ], ^ or | (2.8 went without it too); drop when it doesn't
        if config.kind == ServerKind::TexLab
            && config.root.to_string_lossy().contains(['[', ']', '^', '|'])
        {
            return Err(LspError::UnsupportedPath(config.root.clone()));
        }
        let (events, receiver) = mpsc::unbounded_channel();
        let inner = Arc::new(Inner {
            config,
            root_uri,
            events,
            connection: Mutex::new(None),
            capabilities: Mutex::new(None),
            documents: Mutex::new(HashMap::new()),
            main_file: Mutex::new(None),
            stopping: AtomicBool::new(false),
        });
        let (child, connection, caps) = inner.launch().await?;
        inner.adopt(connection, caps);
        let (stop, stopped) = oneshot::channel();
        let task = tokio::spawn(supervise(Arc::clone(&inner), child, stopped));
        let server = Self {
            inner,
            stop: Some(stop),
            task: Some(task),
        };
        Ok((server, receiver))
    }

    pub fn kind(&self) -> ServerKind {
        self.inner.config.kind
    }

    /// What the server said it can do, from its latest `initialize`.
    pub fn capabilities(&self) -> Option<ServerCapabilities> {
        self.inner.capabilities.lock().clone()
    }

    pub fn did_open(&self, uri: Uri, language_id: &str, version: i32, text: String) {
        let mut documents = self.inner.documents.lock();
        let item =
            TextDocumentItem::new(uri.clone(), language_id.to_owned(), version, text.clone());
        self.inner
            .send::<DidOpenTextDocument>(DidOpenTextDocumentParams {
                text_document: item,
            });
        let doc = OpenDocument {
            language_id: language_id.to_owned(),
            version,
            text,
        };
        documents.insert(uri, doc);
    }

    /// Incremental changes, ranges in UTF-16 code units, in the order the editor made them.
    pub fn did_change(
        &self,
        uri: &Uri,
        version: i32,
        changes: Vec<TextDocumentContentChangeEvent>,
    ) {
        let mut documents = self.inner.documents.lock();
        let Some(doc) = documents.get_mut(uri) else {
            tracing::warn!("didChange for {} which isn't open", uri.as_str());
            return;
        };
        for change in &changes {
            apply_change(&mut doc.text, change);
        }
        doc.version = version;
        self.inner
            .send::<DidChangeTextDocument>(DidChangeTextDocumentParams {
                text_document: VersionedTextDocumentIdentifier::new(uri.clone(), version),
                content_changes: changes,
            });
    }

    pub fn did_save(&self, uri: &Uri) {
        self.inner
            .send::<DidSaveTextDocument>(DidSaveTextDocumentParams {
                text_document: TextDocumentIdentifier::new(uri.clone()),
                text: None,
            });
    }

    pub fn did_close(&self, uri: &Uri) {
        let mut documents = self.inner.documents.lock();
        if documents.remove(uri).is_some() {
            self.inner
                .send::<DidCloseTextDocument>(DidCloseTextDocumentParams {
                    text_document: TextDocumentIdentifier::new(uri.clone()),
                });
        }
    }

    /// The project's main document, checked as a whole (kept across restarts). TexLab only reads the files
    /// beside and below the ones it has, so without it a project with nothing open has no diagnostics;
    /// Tinymist checks a chapter as part of it.
    pub async fn pin_main(&self, path: &Path) -> Result<(), LspError> {
        *self.inner.main_file.lock() = Some(path.to_owned());
        self.inner.pin_main(path).await
    }

    pub async fn completion(
        &self,
        uri: &Uri,
        position: Position,
    ) -> Result<Option<CompletionResponse>, LspError> {
        self.request::<Completion>(CompletionParams {
            text_document_position: at(uri, position),
            work_done_progress_params: WorkDoneProgressParams::default(),
            partial_result_params: PartialResultParams::default(),
            context: None,
        })
        .await
    }

    pub async fn hover(&self, uri: &Uri, position: Position) -> Result<Option<Hover>, LspError> {
        self.request::<HoverRequest>(HoverParams {
            text_document_position_params: at(uri, position),
            work_done_progress_params: WorkDoneProgressParams::default(),
        })
        .await
    }

    pub async fn definition(
        &self,
        uri: &Uri,
        position: Position,
    ) -> Result<Option<GotoDefinitionResponse>, LspError> {
        self.request::<GotoDefinition>(GotoDefinitionParams {
            text_document_position_params: at(uri, position),
            work_done_progress_params: WorkDoneProgressParams::default(),
            partial_result_params: PartialResultParams::default(),
        })
        .await
    }

    pub async fn rename(
        &self,
        uri: &Uri,
        position: Position,
        new_name: &str,
    ) -> Result<Option<WorkspaceEdit>, LspError> {
        self.request::<Rename>(RenameParams {
            text_document_position: at(uri, position),
            new_name: new_name.to_owned(),
            work_done_progress_params: WorkDoneProgressParams::default(),
        })
        .await
    }

    /// The document's outline.
    pub async fn document_symbol(
        &self,
        uri: &Uri,
    ) -> Result<Option<DocumentSymbolResponse>, LspError> {
        self.request::<DocumentSymbolRequest>(DocumentSymbolParams {
            text_document: TextDocumentIdentifier::new(uri.clone()),
            work_done_progress_params: WorkDoneProgressParams::default(),
            partial_result_params: PartialResultParams::default(),
        })
        .await
    }

    /// Any request. Times out after the config's `request_timeout`; dropping the future cancels it.
    pub async fn request<R: Request>(&self, params: R::Params) -> Result<R::Result, LspError> {
        let connection = self.inner.connection().ok_or(LspError::NotRunning)?;
        let params = serde_json::to_value(params)?;
        let timeout = self.inner.config.request_timeout;
        let result = connection.request(R::METHOD, params, timeout).await?;
        Ok(serde_json::from_value(result)?)
    }

    /// Any notification; dropped while the server isn't running.
    pub fn notify<N: Notification>(&self, params: N::Params) {
        self.inner.send::<N>(params);
    }

    /// Asks the server to stop (`shutdown`, `exit`) and waits until it has, killing it if it takes too long.
    pub async fn shutdown(mut self) {
        self.inner.stopping.store(true, Ordering::SeqCst);
        if let Some(connection) = self.inner.connection() {
            let _ = connection
                .request("shutdown", Value::Null, SHUTDOWN_TIMEOUT)
                .await;
            let _ = connection.notify("exit", Value::Null);
        }
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}

fn at(uri: &Uri, position: Position) -> TextDocumentPositionParams {
    TextDocumentPositionParams::new(TextDocumentIdentifier::new(uri.clone()), position)
}

impl Inner {
    fn connection(&self) -> Option<Arc<Connection>> {
        self.connection.lock().clone()
    }

    fn send<N: Notification>(&self, params: N::Params) {
        let Some(connection) = self.connection() else {
            return;
        };
        match serde_json::to_value(params) {
            Ok(params) => {
                // a server that has just gone gets the text again when it's restarted
                let _ = connection.notify(N::METHOD, params);
            }
            Err(err) => tracing::warn!("{} not sent: {err}", N::METHOD),
        }
    }

    /// Runs the server and does the handshake. Dropping the future (or an error) kills the process.
    async fn launch(&self) -> Result<(Child, Arc<Connection>, ServerCapabilities), LspError> {
        let config = &self.config;
        let mut command = Command::new(&config.program);
        command
            .args(&config.args)
            .envs(config.env.iter().map(|(k, v)| (k, v)))
            // not the project's folder, which Windows then wouldn't let be moved or binned
            .current_dir(std::env::temp_dir())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);
        let mut child = command.spawn().map_err(LspError::Spawn)?;
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            return Err(LspError::Spawn(std::io::Error::other("no stdio pipes")));
        };
        let connection =
            Connection::spawn(stdout, stdin, config.settings.clone(), self.events.clone());
        let name = config
            .root
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
        let params = json!({
            "processId": std::process::id(),
            "clientInfo": { "name": "Spectrum" },
            "rootUri": self.root_uri.as_str(),
            "workspaceFolders": [{ "uri": self.root_uri.as_str(), "name": name }],
            "initializationOptions": initialization_options(config.kind, &config.settings),
            "capabilities": capabilities(config.kind),
        });
        let result = connection
            .request("initialize", params, INITIALIZE_TIMEOUT)
            .await?;
        let result: InitializeResult = serde_json::from_value(result)?;
        connection.notify("initialized", json!({}))?;
        if config.kind == ServerKind::TexLab {
            let settings = json!({ "settings": { "texlab": config.settings } });
            connection.notify("workspace/didChangeConfiguration", settings)?;
        }
        Ok((child, connection, result.capabilities))
    }

    /// Makes a newly started server the current one, with every open document opened in it.
    fn adopt(&self, connection: Arc<Connection>, capabilities: ServerCapabilities) {
        let documents = self.documents.lock();
        for (uri, doc) in documents.iter() {
            let item = TextDocumentItem::new(
                uri.clone(),
                doc.language_id.clone(),
                doc.version,
                doc.text.clone(),
            );
            let params = DidOpenTextDocumentParams {
                text_document: item,
            };
            if let Ok(params) = serde_json::to_value(params) {
                let _ = connection.notify(DidOpenTextDocument::METHOD, params);
            }
        }
        *self.capabilities.lock() = Some(capabilities);
        *self.connection.lock() = Some(connection);
    }

    async fn pin_main(&self, path: &Path) -> Result<(), LspError> {
        let connection = self.connection().ok_or(LspError::NotRunning)?;
        match self.config.kind {
            ServerKind::TexLab => {
                // as if it had just been made: TexLab reads it from disk, and follows it there
                let uri = file_uri(path)?;
                let changes = json!({ "changes": [{ "uri": uri.as_str(), "type": 1 }] });
                connection.notify("workspace/didChangeWatchedFiles", changes)
            }
            ServerKind::Tinymist => {
                let params = json!({ "command": "tinymist.pinMain", "arguments": [path] });
                let timeout = self.config.request_timeout;
                connection
                    .request("workspace/executeCommand", params, timeout)
                    .await
                    .map(drop)
            }
        }
    }

    fn emit(&self, event: LspEvent) {
        let _ = self.events.send(event);
    }
}

/// Waits for the server to stop; one that stops unasked is started again, with a doubling delay.
async fn supervise(inner: Arc<Inner>, mut child: Child, mut stop: oneshot::Receiver<()>) {
    let mut started = Instant::now();
    let mut attempts = 0;
    loop {
        tokio::select! {
            status = child.wait() => {
                *inner.connection.lock() = None;
                if inner.stopping.load(Ordering::SeqCst) {
                    return;
                }
                tracing::warn!(kind = ?inner.config.kind, ?status, "language server stopped unasked");
            }
            // shutdown, or the handle was dropped
            _ = &mut stop => {
                let _ = tokio::time::timeout(EXIT_GRACE, child.wait()).await;
                let _ = child.kill().await;
                *inner.connection.lock() = None;
                return;
            }
        }
        if started.elapsed() >= STABLE_RUN {
            attempts = 0;
        }
        loop {
            attempts += 1;
            if attempts > MAX_RESTARTS {
                let message = format!("it stopped {MAX_RESTARTS} times in a row");
                inner.emit(LspEvent::Failed { message });
                return;
            }
            let delay = inner.config.restart_delay * 2_u32.pow(attempts - 1);
            inner.emit(LspEvent::Restarting {
                attempt: attempts,
                delay,
            });
            let launched = tokio::select! {
                launched = async {
                    tokio::time::sleep(delay).await;
                    inner.launch().await
                } => launched,
                _ = &mut stop => return,
            };
            match launched {
                Ok((new_child, connection, caps)) => {
                    child = new_child;
                    inner.adopt(connection, caps);
                    let main = inner.main_file.lock().clone();
                    if let Some(main) = main
                        && let Err(err) = inner.pin_main(&main).await
                    {
                        tracing::warn!("main document not pinned after restart: {err}");
                    }
                    inner.emit(LspEvent::Restarted);
                    started = Instant::now();
                    break;
                }
                Err(err) => tracing::warn!("language server didn't start again: {err}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_uris() {
        let path = if cfg!(windows) {
            "C:\\Users\\a b\\x[1].tex"
        } else {
            "/Users/a b/x[1]^|.tex"
        };
        let uri = file_uri(Path::new(path)).unwrap();
        assert!(uri.as_str().starts_with("file:///"));
        assert!(uri.as_str().contains("a%20b/x%5B1%5D"));
        assert!(matches!(
            file_uri(Path::new("rel/x.tex")),
            Err(LspError::NotAbsolute(_))
        ));
    }
}
