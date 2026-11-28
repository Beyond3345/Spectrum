//! The window's root: Home, a project's workspace or the theme preview, with the Command Palette
//! and Quick Open over whichever is showing.

use crate::actions::{
    CompileProject, MoveFileToBin, NewFile, NewFolder, NewProject, QuickOpen, RefreshFiles,
    RenameFile, ShowCommandPalette, ShowProjects, ShowThemePreview, ToggleSidebar,
    UseDarkAppearance, UseLightAppearance, UseSimpleColours, UseSpectrumColours,
    UseSystemAppearance,
};
use crate::home::{HomeEvent, HomeView};
use crate::theme_preview::ThemePreviewView;
use crate::workspace::{WorkspaceEvent, WorkspaceView};
use gpui_kit::Hsla;
use gpui_kit::{
    Action, AnyView, App, AppContext, Context, Entity, FocusHandle, Focusable, IntoElement,
    ParentElement, Render, Styled, Subscription, Window, div, prelude::*,
};
use spectrum_core::AppPaths;
use spectrum_theme::{ColourStyle, SidebarTab, SpectrumTheme, ThemeMode, ToolbarSlot};
use spectrum_ui::{
    Icon, IconName, PaletteEvent, PaletteItem, PaletteText, PaletteView, SpectrumIcon,
    shortcut_label,
};
use std::path::PathBuf;

/// Which screen a command makes sense on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenKind {
    Home,
    Workspace,
    ThemePreview,
}

/// A palette row's icon colour: one of the workspace's calm pastels, or plain grey.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tint {
    Toolbar(ToolbarSlot),
    Tab(SidebarTab),
    /// Compile's Calm Slate.
    Compile,
    Plain,
}

impl Tint {
    pub fn colour(self, theme: &SpectrumTheme) -> Hsla {
        match self {
            Self::Toolbar(slot) => theme.toolbar(slot).fg,
            Self::Tab(tab) => theme.sidebar_tab(tab).fg,
            Self::Compile => theme.accent_muted,
            Self::Plain => theme.text_tertiary,
        }
    }
}

/// A command the palette lists: its name, group, icon, action and where it applies.
pub struct Command {
    pub label: &'static str,
    pub section: &'static str,
    pub icon: Icon,
    pub tint: Tint,
    pub action: Box<dyn Action>,
    pub on: &'static [ScreenKind],
}

const ALL: &[ScreenKind] = &[
    ScreenKind::Home,
    ScreenKind::Workspace,
    ScreenKind::ThemePreview,
];
const WORKSPACE: &[ScreenKind] = &[ScreenKind::Workspace];
const BIN_LABEL: &str = if cfg!(windows) {
    "Move file to Recycle Bin…"
} else {
    "Move file to Bin…"
};

/// Every command, in the palette's order before anything is typed. Icons are the line set's
/// (Blueprint 10); Bin and Refresh use the kit's Lucide, which the 92 don't cover.
pub fn commands() -> Vec<Command> {
    let c = |label, section, icon: Icon, tint, action: Box<dyn Action>, on| Command {
        label,
        section,
        icon,
        tint,
        action,
        on,
    };
    let appearance = |label, action: Box<dyn Action>| {
        c(
            label,
            "Appearance",
            SpectrumIcon::Appearance.into(),
            Tint::Plain,
            action,
            ALL,
        )
    };
    let files = Tint::Tab(SidebarTab::Files);
    vec![
        c(
            "Go to a file",
            "Files",
            SpectrumIcon::Search.into(),
            files,
            Box::new(QuickOpen),
            WORKSPACE,
        ),
        c(
            "New file…",
            "Files",
            SpectrumIcon::FileText.into(),
            files,
            Box::new(NewFile),
            WORKSPACE,
        ),
        c(
            "New folder…",
            "Files",
            SpectrumIcon::Folder.into(),
            Tint::Plain,
            Box::new(NewFolder),
            WORKSPACE,
        ),
        c(
            "Rename file…",
            "Files",
            SpectrumIcon::Editor.into(),
            Tint::Plain,
            Box::new(RenameFile),
            WORKSPACE,
        ),
        c(
            BIN_LABEL,
            "Files",
            IconName::Trash.into(),
            Tint::Plain,
            Box::new(MoveFileToBin),
            WORKSPACE,
        ),
        c(
            "Refresh files",
            "Files",
            IconName::RefreshCw.into(),
            Tint::Plain,
            Box::new(RefreshFiles),
            WORKSPACE,
        ),
        c(
            "Compile",
            "Project",
            SpectrumIcon::Compile.into(),
            Tint::Compile,
            Box::new(CompileProject),
            WORKSPACE,
        ),
        c(
            "Show or hide the sidebar",
            "View",
            SpectrumIcon::Sidebar.into(),
            Tint::Plain,
            Box::new(ToggleSidebar),
            WORKSPACE,
        ),
        c(
            "Show projects",
            "App",
            SpectrumIcon::Home.into(),
            Tint::Plain,
            Box::new(ShowProjects),
            &[ScreenKind::Workspace, ScreenKind::ThemePreview],
        ),
        c(
            "New project…",
            "Projects",
            SpectrumIcon::AllProjects.into(),
            Tint::Plain,
            Box::new(NewProject),
            &[ScreenKind::Home],
        ),
        appearance("Use light appearance", Box::new(UseLightAppearance)),
        appearance("Use dark appearance", Box::new(UseDarkAppearance)),
        appearance("Use system appearance", Box::new(UseSystemAppearance)),
        appearance("Use Spectrum colours", Box::new(UseSpectrumColours)),
        appearance("Use Simple colours", Box::new(UseSimpleColours)),
        appearance("Show theme preview", Box::new(ShowThemePreview)),
    ]
}

/// The commands that make sense on `screen`.
pub fn commands_for(screen: ScreenKind) -> Vec<Command> {
    commands()
        .into_iter()
        .filter(|c| c.on.contains(&screen))
        .collect()
}

enum Screen {
    Home(Entity<HomeView>),
    Workspace(Entity<WorkspaceView>),
    ThemePreview(Entity<ThemePreviewView>),
}

enum Picked {
    Command(Vec<Box<dyn Action>>),
    File(Vec<PathBuf>),
}

pub struct ShellView {
    paths: AppPaths,
    screen: Screen,
    palette: Option<(Entity<PaletteView>, Picked)>,
    screen_sub: Option<Subscription>,
    palette_sub: Option<Subscription>,
    _appearance: Subscription,
}

impl ShellView {
    pub fn new(paths: AppPaths, window: &mut Window, cx: &mut Context<Self>) -> Self {
        // System appearance follows the OS live
        let appearance = cx.observe_window_appearance(window, |_, _, cx| {
            let theme = cx.global::<SpectrumTheme>();
            if theme.mode == ThemeMode::System {
                SpectrumTheme::apply(theme.mode, theme.style, cx);
            }
        });
        let home = cx.new(|cx| HomeView::new(paths.clone(), window, cx));
        let mut this = Self {
            paths,
            screen: Screen::Home(home.clone()),
            palette: None,
            screen_sub: None,
            palette_sub: None,
            _appearance: appearance,
        };
        this.watch_home(&home, window, cx);
        this
    }

    fn watch_home(&mut self, home: &Entity<HomeView>, window: &mut Window, cx: &mut Context<Self>) {
        self.screen_sub = Some(cx.subscribe_in(home, window, |this, _, event, window, cx| {
            let HomeEvent::Open(root) = event;
            this.open_project(root.clone(), window, cx);
        }));
    }

    /// Shows Home, reading the project list afresh.
    pub fn show_home(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let home = cx.new(|cx| HomeView::new(self.paths.clone(), window, cx));
        self.watch_home(&home, window, cx);
        self.screen = Screen::Home(home);
        cx.notify();
    }

    /// Opens the project in `root` in the workspace.
    pub fn open_project(&mut self, root: PathBuf, window: &mut Window, cx: &mut Context<Self>) {
        let workspace = cx.new(|cx| WorkspaceView::new(root, window, cx));
        self.screen_sub =
            Some(
                cx.subscribe_in(&workspace, window, |this, _, event, window, cx| {
                    let WorkspaceEvent::ShowProjects = event;
                    this.show_home(window, cx);
                }),
            );
        self.screen = Screen::Workspace(workspace);
        cx.notify();
    }

    fn kind(&self) -> ScreenKind {
        match self.screen {
            Screen::Home(_) => ScreenKind::Home,
            Screen::Workspace(_) => ScreenKind::Workspace,
            Screen::ThemePreview(_) => ScreenKind::ThemePreview,
        }
    }

    fn screen_focus(&self, cx: &App) -> Option<FocusHandle> {
        match &self.screen {
            Screen::Home(v) => Some(v.focus_handle(cx)),
            Screen::Workspace(v) => Some(v.focus_handle(cx)),
            Screen::ThemePreview(_) => None,
        }
    }

    /// Opens the Command Palette (also Cmd+Shift+P).
    pub fn show_command_palette(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let kind = self.kind();
        let contexts: &[&str] = match kind {
            ScreenKind::Home => &["Spectrum Home"],
            ScreenKind::Workspace => &["Spectrum Workspace FileTree"],
            ScreenKind::ThemePreview => &["Spectrum"],
        };
        let commands = commands_for(kind);
        let theme = cx.global::<SpectrumTheme>();
        let items = commands
            .iter()
            .map(|c| PaletteItem {
                label: c.label.into(),
                detail: c.section.into(),
                shortcut: shortcut_label(c.action.as_ref(), contexts, window).map(Into::into),
                icon: Some((c.icon, c.tint.colour(theme))),
            })
            .collect();
        let actions = commands.into_iter().map(|c| c.action).collect();
        let text = PaletteText {
            placeholder: "Type a command",
            empty: "No command has that name",
            // Lucide fallback: the prompt chevron isn't among the 92
            icon: IconName::ChevronRight.into(),
            paths: false,
        };
        self.open_palette(items, Picked::Command(actions), text, window, cx);
    }

    /// Opens Quick Open over the project's files (also Cmd+P).
    pub fn quick_open(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Screen::Workspace(workspace) = &self.screen else {
            return;
        };
        let (paths, items) = workspace
            .read(cx)
            .quick_open_items(cx.global::<SpectrumTheme>());
        let text = PaletteText {
            placeholder: "Type a file name",
            empty: "No file has that name",
            icon: SpectrumIcon::Search.into(),
            paths: true,
        };
        self.open_palette(items, Picked::File(paths), text, window, cx);
    }

    fn open_palette(
        &mut self,
        items: Vec<PaletteItem>,
        picked: Picked,
        text: PaletteText,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let palette = cx.new(|cx| PaletteView::new(items, text, window, cx));
        self.palette_sub = Some(cx.subscribe_in(&palette, window, Self::on_palette));
        self.palette = Some((palette, picked));
        cx.notify();
    }

    /// The open project's workspace, if one is showing.
    pub fn workspace(&self) -> Option<Entity<WorkspaceView>> {
        match &self.screen {
            Screen::Workspace(w) => Some(w.clone()),
            _ => None,
        }
    }

    /// The palette open now, for tests.
    pub fn palette(&self) -> Option<Entity<PaletteView>> {
        self.palette.as_ref().map(|(p, _)| p.clone())
    }

    fn on_palette(
        &mut self,
        _: &Entity<PaletteView>,
        event: &PaletteEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some((_, picked)) = self.palette.take() else {
            return;
        };
        self.palette_sub = None;
        cx.notify();
        let focus = self.screen_focus(cx);
        if let Some(focus) = &focus {
            focus.focus(window, cx);
        }
        let PaletteEvent::Confirmed(ix) = event else {
            return;
        };
        match picked {
            Picked::Command(actions) => {
                if let Some(action) = actions.get(*ix) {
                    let action = action.boxed_clone();
                    // after the frame without the palette, so the action starts from the screen
                    cx.defer_in(window, move |_, window, cx| match focus {
                        Some(focus) => focus.dispatch_action(action.as_ref(), window, cx),
                        None => window.dispatch_action(action, cx),
                    });
                }
            }
            Picked::File(paths) => {
                if let (Some(rel), Screen::Workspace(w)) = (paths.get(*ix), &self.screen) {
                    w.update(cx, |w, cx| w.open(rel, cx));
                }
            }
        }
    }

    fn set_theme(mode: Option<ThemeMode>, style: Option<ColourStyle>, cx: &mut App) {
        let theme = cx.global::<SpectrumTheme>();
        SpectrumTheme::apply(mode.unwrap_or(theme.mode), style.unwrap_or(theme.style), cx);
    }
}

impl Render for ShellView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let screen: AnyView = match &self.screen {
            Screen::Home(v) => v.clone().into(),
            Screen::Workspace(v) => v.clone().into(),
            Screen::ThemePreview(v) => v.clone().into(),
        };
        let theme = cx.global::<SpectrumTheme>();
        div()
            .key_context("Spectrum")
            .on_action(cx.listener(|this, _: &ShowCommandPalette, window, cx| {
                this.show_command_palette(window, cx);
            }))
            .on_action(cx.listener(|this, _: &QuickOpen, window, cx| this.quick_open(window, cx)))
            .on_action(cx.listener(|this, _: &ShowProjects, window, cx| this.show_home(window, cx)))
            .on_action(cx.listener(|this, _: &ShowThemePreview, window, cx| {
                this.screen = Screen::ThemePreview(cx.new(|cx| ThemePreviewView::new(window, cx)));
                this.screen_sub = None;
                cx.notify();
            }))
            .on_action(|_: &UseLightAppearance, _, cx| {
                Self::set_theme(Some(ThemeMode::Light), None, cx);
            })
            .on_action(|_: &UseDarkAppearance, _, cx| {
                Self::set_theme(Some(ThemeMode::Dark), None, cx);
            })
            .on_action(|_: &UseSystemAppearance, _, cx| {
                Self::set_theme(Some(ThemeMode::System), None, cx);
            })
            .on_action(|_: &UseSpectrumColours, _, cx| {
                Self::set_theme(None, Some(ColourStyle::Spectrum), cx);
            })
            .on_action(|_: &UseSimpleColours, _, cx| {
                Self::set_theme(None, Some(ColourStyle::Simple), cx);
            })
            .relative()
            .size_full()
            .bg(theme.bg_app)
            .child(screen)
            .children(self.palette.as_ref().map(|(p, _)| p.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_screen_lists_only_its_commands() {
        let labels = |s| commands_for(s).iter().map(|c| c.label).collect::<Vec<_>>();
        let home = labels(ScreenKind::Home);
        assert!(home.contains(&"New project…"));
        assert!(home.contains(&"Show theme preview"));
        assert!(!home.contains(&"New file…"));
        assert!(!home.contains(&"Show projects"));
        let workspace = labels(ScreenKind::Workspace);
        assert!(workspace.contains(&BIN_LABEL));
        assert!(workspace.contains(&"Show projects"));
        assert!(!workspace.contains(&"New project…"));
    }

    #[test]
    fn the_palette_ranks_commands_by_name() {
        let commands = commands_for(ScreenKind::Workspace);
        let labels: Vec<_> = commands.iter().map(|c| c.label).collect();
        let found = spectrum_ui::fuzzy::rank("theme", &labels, false);
        assert_eq!(labels[found[0].index], "Show theme preview");
        let found = spectrum_ui::fuzzy::rank("bin", &labels, false);
        assert_eq!(labels[found[0].index], BIN_LABEL);
        let found = spectrum_ui::fuzzy::rank("nf", &labels, false);
        assert_eq!(labels[found[0].index], "New file…");
    }
}
