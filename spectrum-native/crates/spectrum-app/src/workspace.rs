//! The project workspace (plan Blueprint 1): title bar with the Compile button, the 268 px
//! sidebar (tab strip and file list), the editor slot and the PDF slot, side by side and
//! resizable. File IO runs on the background executor; the folder is watched for outside changes.

mod files;
mod sidebar;
mod view;

use crate::actions::{MoveFileToBin, NewFile, NewFolder, RefreshFiles, RenameFile, ToggleSidebar};
use crate::file_ops::{self, BIN};
use files::{FileItem, TreeKey, TreeMove, ancestors, file_items, tree_key, visible};
use gpui_kit::{
    App, AppContext, Context, Entity, EventEmitter, FocusHandle, Focusable, Global, KeyDownEvent,
    ScrollHandle, Subscription, Task, Window,
};
use spectrum_core::UserNotice;
use spectrum_core::project::{self, TreeEntry};
use spectrum_core::watcher::ProjectWatcher;
use spectrum_theme::{SidebarTab, SpectrumTheme};
use spectrum_ui::input::{InputEvent, InputState};
use spectrum_ui::{PaletteItem, Tone, show_notice};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub use files::FileKind;

pub enum WorkspaceEvent {
    /// Back to Home.
    ShowProjects,
}

/// Which folders are open in each project's Files tree, kept while the app runs so a project
/// opened again shows its tree as it was left.
// ponytail: in memory only; save it with the per-project layout (row L13) when that lands
#[derive(Default)]
struct ExpandedFolders(HashMap<PathBuf, HashSet<PathBuf>>);

impl Global for ExpandedFolders {}

/// What the sidebar's name field is for.
#[derive(Debug, Clone, PartialEq, Eq)]
enum NameFor {
    NewFile,
    NewFolder,
    Rename(PathBuf),
}

struct Naming {
    what: NameFor,
    input: Entity<InputState>,
    _subscription: Subscription,
}

// independent view flags (loaded, sidebar, outline, compiling), not a state machine
#[allow(clippy::struct_excessive_bools)]
pub struct WorkspaceView {
    focus_handle: FocusHandle,
    tree_focus: FocusHandle,
    root: PathBuf,
    name: String,
    items: Vec<FileItem>,
    loaded: bool,
    open_file: Option<PathBuf>,
    /// The tree's cursor: the row picked by a click or the arrow keys.
    selected: Option<PathBuf>,
    /// Open folders in the Files tree (all start closed).
    expanded: HashSet<PathBuf>,
    tree_scroll: ScrollHandle,
    tab: SidebarTab,
    sidebar_open: bool,
    /// The Outline docked at the sidebar's foot is expanded.
    outline_open: bool,
    /// A compile is running (Compile shows its progress ring).
    compiling: bool,
    naming: Option<Naming>,
    watcher: Option<ProjectWatcher>,
    /// Reads the project, then follows the watcher; dropped with the view.
    load_task: Option<Task<()>>,
}

impl EventEmitter<WorkspaceEvent> for WorkspaceView {}

impl Focusable for WorkspaceView {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

/// What opening a project reads before the first frame shows its files.
struct Opened {
    name: Option<String>,
    main_file: Option<String>,
    tree: Result<Vec<TreeEntry>, UserNotice>,
    watcher: Option<(
        ProjectWatcher,
        std::sync::mpsc::Receiver<spectrum_core::watcher::FsEvent>,
    )>,
}

fn open_project(root: &Path) -> Opened {
    let meta = project::read_meta(root).ok().flatten();
    let tree = project::scan_tree(root).map_err(|e| e.notice());
    let main_file = meta.as_ref().and_then(|m| m.main_file.clone()).or_else(|| {
        let ignore: [String; 0] = [];
        project::detect_main_file(root, &ignore).ok().flatten()
    });
    // 2.8's watch waited 300 ms
    let watcher = match ProjectWatcher::new(root, Duration::from_millis(300)) {
        Ok(w) => Some(w),
        Err(err) => {
            tracing::warn!(%err, "can't watch the project; the file list won't follow outside changes");
            None
        }
    };
    Opened {
        name: meta.map(|m| m.name),
        main_file,
        tree,
        watcher,
    }
}

impl WorkspaceView {
    pub fn new(root: PathBuf, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let expanded = cx
            .try_global::<ExpandedFolders>()
            .and_then(|m| m.0.get(&root).cloned())
            .unwrap_or_default();
        let mut this = Self {
            focus_handle,
            tree_focus: cx.focus_handle(),
            root,
            name,
            items: Vec::new(),
            loaded: false,
            open_file: None,
            selected: None,
            expanded,
            tree_scroll: ScrollHandle::new(),
            tab: SidebarTab::Files,
            sidebar_open: true,
            outline_open: true,
            compiling: false,
            naming: None,
            watcher: None,
            load_task: None,
        };
        this.load(window, cx);
        this
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Marks a compile as running or finished; Compile shows a progress ring while it runs.
    pub fn set_compiling(&mut self, compiling: bool, cx: &mut Context<Self>) {
        self.compiling = compiling;
        cx.notify();
    }

    pub fn project_name(&self) -> &str {
        &self.name
    }

    fn load(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let root = self.root.clone();
        let task = cx.spawn_in(window, async move |this, cx| {
            let opened = cx
                .background_executor()
                .spawn(async move { open_project(&root) })
                .await;
            let events = this
                .update_in(cx, |this, window, cx| this.opened(opened, window, cx))
                .ok()
                .flatten();
            // ponytail: every change rescans the whole tree (a few ms for a thesis); patch the list per
            // event if projects with tens of thousands of files show up
            if let Some(events) = events {
                use futures::StreamExt as _;
                let mut events = events;
                while events.next().await.is_some() {
                    if this.update_in(cx, WorkspaceView::refresh).is_err() {
                        break;
                    }
                }
            }
        });
        self.load_task = Some(task);
    }

    fn opened(
        &mut self,
        opened: Opened,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Option<futures::channel::mpsc::UnboundedReceiver<()>> {
        if let Some(name) = opened.name {
            self.name = name;
        }
        self.open_file = opened.main_file.map(PathBuf::from);
        if let Some(main) = self.open_file.clone() {
            self.reveal(&main, cx);
        }
        self.set_tree(opened.tree, window, cx);
        let (watcher, rx) = opened.watcher?;
        self.watcher = Some(watcher);
        // the watcher's channel blocks, so a plain thread waits on it and wakes the UI; it ends when
        // the watcher (and so its sender) is dropped with this view
        let (tx, events) = futures::channel::mpsc::unbounded();
        let spawned = std::thread::Builder::new()
            .name("spectrum-watch".into())
            .spawn(move || {
                while rx.recv().is_ok() {
                    if tx.unbounded_send(()).is_err() {
                        break;
                    }
                }
            });
        if let Err(err) = spawned {
            tracing::warn!(%err, "can't start the file watch thread");
            return None;
        }
        Some(events)
    }

    fn set_tree(
        &mut self,
        tree: Result<Vec<TreeEntry>, UserNotice>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match tree {
            Ok(entries) => {
                self.items = file_items(&entries);
                self.loaded = true;
                let exists = |p: &Option<PathBuf>| {
                    p.as_ref()
                        .is_none_or(|p| self.items.iter().any(|i| &i.rel == p))
                };
                if !exists(&self.open_file) {
                    self.open_file = None;
                }
                if !exists(&self.selected) {
                    self.selected = None;
                }
            }
            Err(notice) => show_notice(window, cx, &notice, Tone::Error),
        }
        cx.notify();
    }

    /// Rescans the folder off the UI thread.
    pub fn refresh(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let root = self.root.clone();
        let task = cx.spawn_in(window, async move |this, cx| {
            let tree = cx
                .background_executor()
                .spawn(async move { project::scan_tree(&root).map_err(|e| e.notice()) })
                .await;
            let _ = this.update_in(cx, |this, window, cx| this.set_tree(tree, window, cx));
        });
        task.detach();
    }

    /// Opens a file in the editor slot, opening the folders above it in the tree.
    pub fn open(&mut self, rel: &Path, cx: &mut Context<Self>) {
        self.selected = Some(rel.to_path_buf());
        if self.items.iter().any(|i| i.rel == rel && !i.is_dir()) {
            self.open_file = Some(rel.to_path_buf());
        }
        self.reveal(rel, cx);
        cx.notify();
    }

    /// Whether `rel` is an open folder in the Files tree.
    pub fn is_expanded(&self, rel: &Path) -> bool {
        self.expanded.contains(rel)
    }

    /// Opens or closes a folder in the Files tree.
    pub fn set_expanded(&mut self, rel: &Path, open: bool, cx: &mut Context<Self>) {
        let changed = if open {
            self.expanded.insert(rel.to_path_buf())
        } else {
            // the cursor doesn't stay on a row that is now hidden
            if self
                .selected
                .as_ref()
                .is_some_and(|s| s != rel && s.starts_with(rel))
            {
                self.selected = Some(rel.to_path_buf());
            }
            self.expanded.remove(rel)
        };
        if changed {
            self.remember_expanded(cx);
            cx.notify();
        }
    }

    /// Opens the folders holding `rel`.
    fn reveal(&mut self, rel: &Path, cx: &mut Context<Self>) {
        let before = self.expanded.len();
        self.expanded.extend(ancestors(rel));
        if self.expanded.len() != before {
            self.remember_expanded(cx);
        }
    }

    fn remember_expanded(&self, cx: &mut Context<Self>) {
        cx.default_global::<ExpandedFolders>()
            .0
            .insert(self.root.clone(), self.expanded.clone());
    }

    /// The paths of the rows the Files tree shows, top to bottom.
    pub fn visible_rows(&self) -> Vec<PathBuf> {
        visible(&self.items, &self.expanded)
            .into_iter()
            .map(|ix| self.items[ix].rel.clone())
            .collect()
    }

    /// The tree's cursor.
    pub fn selected(&self) -> Option<&Path> {
        self.selected.as_deref()
    }

    /// The file open in the editor slot.
    pub fn open_file(&self) -> Option<&Path> {
        self.open_file.as_deref()
    }

    /// Arrows, Home, End and Enter on the Files tree (2.8's keys).
    fn on_tree_key(&mut self, event: &KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        let k = &event.keystroke;
        if self.naming.is_some() || k.modifiers.modified() {
            return;
        }
        let Some(key) = TreeKey::from_key(&k.key) else {
            return;
        };
        cx.stop_propagation();
        let Some(step) = tree_key(&self.items, &self.expanded, self.selected.as_deref(), key)
        else {
            return;
        };
        match step {
            TreeMove::Select(rel) => {
                if let Some(row) = self.visible_rows().iter().position(|r| *r == rel) {
                    self.tree_scroll.scroll_to_item(row);
                }
                self.selected = Some(rel);
                cx.notify();
            }
            TreeMove::Expand(rel) => self.set_expanded(&rel, true, cx),
            TreeMove::Collapse(rel) => self.set_expanded(&rel, false, cx),
            TreeMove::Open(rel) => self.open(&rel, cx),
        }
    }

    /// Quick Open's list: every file, by its `/`-separated path, with its line icon.
    pub fn quick_open_items(&self, theme: &SpectrumTheme) -> (Vec<PathBuf>, Vec<PaletteItem>) {
        self.items
            .iter()
            .filter(|i| !i.is_dir())
            .map(|i| {
                let detail = match i.kind {
                    FileKind::Source => "Source",
                    FileKind::Bibliography => "Bibliography",
                    FileKind::Diagram => "Diagram",
                    FileKind::Image => "Image",
                    FileKind::Other | FileKind::Folder => "File",
                };
                let path = i
                    .rel
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/");
                (
                    i.rel.clone(),
                    PaletteItem {
                        label: path.into(),
                        detail: detail.into(),
                        shortcut: None,
                        icon: Some(sidebar::glyph(theme, i, false)),
                    },
                )
            })
            .unzip()
    }

    fn selected_item(&self) -> Option<&FileItem> {
        let sel = self.selected.as_ref()?;
        self.items.iter().find(|i| &i.rel == sel)
    }

    fn begin_naming(&mut self, what: NameFor, window: &mut Window, cx: &mut Context<Self>) {
        self.sidebar_open = true;
        self.tab = SidebarTab::Files;
        let (text, placeholder) = match &what {
            NameFor::NewFile => (String::new(), "File name, e.g. intro.tex"),
            NameFor::NewFolder => (String::new(), "Folder name"),
            NameFor::Rename(rel) => (
                rel.file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                "New name",
            ),
        };
        let input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder(placeholder)
                .default_value(text)
        });
        input.update(cx, |i, cx| i.focus(window, cx));
        let sub = cx.subscribe_in(
            &input,
            window,
            |this, input, event: &InputEvent, window, cx| match event {
                InputEvent::PressEnter { .. } => {
                    let name = input.read(cx).value().to_string();
                    this.finish_naming(&name, window, cx);
                }
                InputEvent::Blur => this.cancel_naming(window, cx),
                _ => {}
            },
        );
        self.naming = Some(Naming {
            what,
            input,
            _subscription: sub,
        });
        cx.notify();
    }

    fn cancel_naming(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.naming.take().is_some() {
            self.tree_focus.focus(window, cx);
            cx.notify();
        }
    }

    fn finish_naming(&mut self, name: &str, window: &mut Window, cx: &mut Context<Self>) {
        let Some(naming) = self.naming.take() else {
            return;
        };
        self.tree_focus.focus(window, cx);
        cx.notify();
        let name = name.trim().to_owned();
        if name.is_empty() {
            return;
        }
        let near = self.selected_item().map(|i| (i.rel.clone(), i.is_dir()));
        let root = self.root.clone();
        let what = naming.what;
        let target = match &what {
            NameFor::Rename(from) => from.with_file_name(&name),
            _ => file_ops::sibling_path(near.as_ref().map(|(p, d)| (p.as_path(), *d)), &name),
        };
        if let NameFor::Rename(from) = &what
            && *from == target
        {
            return;
        }
        let task = cx.spawn_in(window, async move |this, cx| {
            let job_target = target.clone();
            let job_what = what.clone();
            let done = cx
                .background_executor()
                .spawn(async move {
                    match &job_what {
                        NameFor::NewFile => file_ops::create_file(&root, &job_target),
                        NameFor::NewFolder => file_ops::create_folder(&root, &job_target),
                        NameFor::Rename(from) => file_ops::rename(&root, from, &job_target),
                    }
                    .map(|_| ())
                })
                .await;
            let _ = this.update_in(cx, |this, window, cx| match done {
                Ok(()) => {
                    match what {
                        NameFor::NewFile => this.open_file = Some(target.clone()),
                        NameFor::Rename(from) if this.open_file.as_ref() == Some(&from) => {
                            this.open_file = Some(target.clone());
                        }
                        _ => {}
                    }
                    this.reveal(&target, cx);
                    this.selected = Some(target);
                    this.refresh(window, cx);
                }
                Err(notice) => show_notice(window, cx, &notice, Tone::Error),
            });
        });
        task.detach();
    }

    fn move_selected_to_bin(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(item) = self.selected_item().cloned() else {
            return;
        };
        let entity = cx.entity().downgrade();
        let name = item.label.clone();
        let message = if item.is_dir() {
            format!("The folder and everything in it will be moved to the {BIN}.")
        } else {
            format!("You can put it back from the {BIN}.")
        };
        spectrum_ui::confirm(
            window,
            cx,
            format!("Move “{name}” to the {BIN}?"),
            message,
            format!("Move to {BIN}"),
            move |window, cx| {
                let _ = entity.update(cx, |this, cx| this.bin(item.rel.clone(), window, cx));
            },
        );
    }

    fn bin(&mut self, rel: PathBuf, window: &mut Window, cx: &mut Context<Self>) {
        let root = self.root.clone();
        let task = cx.spawn_in(window, async move |this, cx| {
            let job = rel.clone();
            let done = cx
                .background_executor()
                .spawn(async move { file_ops::move_to_bin(&root, &job) })
                .await;
            let _ = this.update_in(cx, |this, window, cx| {
                let shown = rel
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                match done {
                    Ok(()) => {
                        let notice = UserNotice::new(format!("Moved “{shown}” to the {BIN}"), "");
                        show_notice(window, cx, &notice, Tone::Success);
                        this.refresh(window, cx);
                    }
                    Err(notice) => show_notice(window, cx, &notice, Tone::Error),
                }
            });
        });
        task.detach();
    }

    fn on_toggle_sidebar(&mut self, _: &ToggleSidebar, _: &mut Window, cx: &mut Context<Self>) {
        self.sidebar_open = !self.sidebar_open;
        cx.notify();
    }

    fn on_new_file(&mut self, _: &NewFile, window: &mut Window, cx: &mut Context<Self>) {
        self.begin_naming(NameFor::NewFile, window, cx);
    }

    fn on_new_folder(&mut self, _: &NewFolder, window: &mut Window, cx: &mut Context<Self>) {
        self.begin_naming(NameFor::NewFolder, window, cx);
    }

    fn on_rename(&mut self, _: &RenameFile, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(item) = self.selected_item() {
            let rel = item.rel.clone();
            self.begin_naming(NameFor::Rename(rel), window, cx);
        }
    }

    fn on_bin(&mut self, _: &MoveFileToBin, window: &mut Window, cx: &mut Context<Self>) {
        self.move_selected_to_bin(window, cx);
    }

    fn on_refresh(&mut self, _: &RefreshFiles, window: &mut Window, cx: &mut Context<Self>) {
        self.refresh(window, cx);
    }
}
