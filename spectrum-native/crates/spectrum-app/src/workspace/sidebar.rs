//! The left sidebar: the Files / Research / To-dos strip, the Files tree with its name field and
//! right-click menu, and the Outline and Settings docked at its foot.

use super::files::{FileItem, visible};
use super::view::not_built;
use super::{FileKind, NameFor, WorkspaceView};
use crate::actions::{MoveFileToBin, NewFile, NewFolder, RefreshFiles, RenameFile};
use crate::file_ops::BIN;
use gpui_kit::{
    AnyElement, Context, FontWeight, Hsla, IntoElement, MouseButton, ParentElement, Styled, div,
    prelude::*, px,
};
use spectrum_theme::{SidebarTab, SpectrumTheme, ToolbarSlot};
use spectrum_ui::input::Input;
use spectrum_ui::menu::{ContextMenuExt, PopupMenu};
use spectrum_ui::{FileRow, Icon, IconButton, IconName, SpectrumIcon, icon, panel, sidebar_tabs};

/// A row's line icon in the calm pastels Blueprint 1 gives it: sources coral, `.bib` teal,
/// diagrams and the `diagrams/` folder green, images apricot, other folders and files grey
/// (neutral in Simple style).
pub(super) fn glyph(theme: &SpectrumTheme, item: &FileItem, open: bool) -> (Icon, Hsla) {
    let diagram = theme.toolbar(ToolbarSlot::Diagram).fg;
    match item.kind {
        FileKind::Source => (
            SpectrumIcon::FileText.into(),
            theme.sidebar_tab(SidebarTab::Files).fg,
        ),
        FileKind::Bibliography => (
            SpectrumIcon::FileBib.into(),
            theme.sidebar_tab(SidebarTab::Research).fg,
        ),
        FileKind::Diagram => (SpectrumIcon::FileDiagram.into(), diagram),
        FileKind::Image => (
            SpectrumIcon::FileImage.into(),
            theme.toolbar(ToolbarSlot::Figure).fg,
        ),
        // Lucide fallback: the 92 have no generic file
        FileKind::Other => (IconName::File.into(), theme.text_tertiary),
        FileKind::Folder => {
            let folder = if open {
                SpectrumIcon::FolderOpen
            } else {
                SpectrumIcon::Folder
            };
            let top_diagrams = item.depth == 0 && item.label.eq_ignore_ascii_case("diagrams");
            (
                folder.into(),
                if top_diagrams {
                    diagram
                } else {
                    theme.text_tertiary
                },
            )
        }
    }
}

fn menu(menu: PopupMenu, on_file: bool) -> PopupMenu {
    let menu = menu
        .menu("New file…", Box::new(NewFile))
        .menu("New folder…", Box::new(NewFolder));
    let menu = if on_file {
        menu.separator()
            .menu("Rename…", Box::new(RenameFile))
            .menu(format!("Move to {BIN}…"), Box::new(MoveFileToBin))
    } else {
        menu
    };
    menu.separator().menu("Refresh", Box::new(RefreshFiles))
}

impl WorkspaceView {
    fn name_field(&self, theme: &SpectrumTheme) -> Option<AnyElement> {
        let naming = self.naming.as_ref()?;
        Some(
            div()
                .h(px(30.))
                .px(px(2.))
                .rounded(px(8.))
                .border_1()
                .border_color(theme.accent)
                .text_size(px(13.))
                .child(Input::new(&naming.input).appearance(false))
                .into_any_element(),
        )
    }

    fn files(&self, theme: &SpectrumTheme, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let renaming = self.naming.as_ref().and_then(|n| match &n.what {
            NameFor::Rename(rel) => Some(rel.clone()),
            _ => None,
        });
        let creating = self.naming.is_some() && renaming.is_none();
        let mut rows: Vec<AnyElement> = Vec::new();
        if creating && let Some(field) = self.name_field(theme) {
            rows.push(field);
        }
        for ix in visible(&self.items, &self.expanded) {
            let item = &self.items[ix];
            if renaming.as_ref() == Some(&item.rel) {
                if let Some(field) = self.name_field(theme) {
                    rows.push(field);
                }
                continue;
            }
            let rel = item.rel.clone();
            let pick = rel.clone();
            let open = item.is_dir() && self.expanded.contains(&item.rel);
            let (glyph, tint) = glyph(theme, item, open);
            let is_dir = item.is_dir();
            let row = FileRow::new(("file", ix), item.label.clone(), glyph, tint)
                .depth(item.depth)
                .when(is_dir, |r| r.folder(open))
                .when(is_dir && !open && item.children > 0, |r| {
                    r.count(item.children)
                })
                .active(self.open_file.as_ref() == Some(&item.rel))
                .selected(self.selected.as_ref() == Some(&item.rel))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.tree_focus.focus(window, cx);
                    if is_dir {
                        this.selected = Some(rel.clone());
                        this.set_expanded(&rel, !open, cx);
                        cx.notify();
                    } else {
                        this.open(&rel, cx);
                    }
                }));
            rows.push(
                div()
                    .id(("file-menu", ix))
                    .on_mouse_down(
                        MouseButton::Right,
                        cx.listener(move |this, _, window, cx| {
                            this.tree_focus.focus(window, cx);
                            this.selected = Some(pick.clone());
                            cx.notify();
                        }),
                    )
                    .child(row)
                    .context_menu(|m, _, _| menu(m, true))
                    .into_any_element(),
            );
        }
        let empty = if self.loaded && self.items.is_empty() && !creating {
            Some(
                div()
                    .px(px(9.))
                    .py(px(6.))
                    .text_size(px(12.))
                    .text_color(theme.text_tertiary)
                    .child("No files yet. New file makes one."),
            )
        } else {
            None
        };
        div()
            .id("file-list")
            .track_focus(&self.tree_focus)
            .key_context("FileTree")
            .on_key_down(cx.listener(Self::on_tree_key))
            .track_scroll(&self.tree_scroll)
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(2.))
            .children(rows)
            .children(empty)
            .context_menu(|m, _, _| menu(m, false))
    }

    fn header(&self, theme: &SpectrumTheme, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        div()
            .flex()
            .items_center()
            .gap(px(2.))
            .pl(px(9.))
            .pr(px(2.))
            .pt(px(2.))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .text_size(px(12.))
                    .font_weight(gpui_kit::FontWeight::SEMIBOLD)
                    .text_color(theme.text_tertiary)
                    .child(self.name.clone()),
            )
            // Lucide fallbacks: the 92 have no new-file, new-folder or refresh icon
            .child(
                IconButton::plain("new-file", IconName::FilePlus, theme)
                    .tooltip("New file")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.begin_naming(NameFor::NewFile, window, cx);
                    })),
            )
            .child(
                IconButton::plain("new-folder", IconName::FolderPlus, theme)
                    .tooltip("New folder")
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.begin_naming(NameFor::NewFolder, window, cx);
                    })),
            )
            .child(
                IconButton::plain("refresh", IconName::RefreshCw, theme)
                    .tooltip("Refresh")
                    .on_click(cx.listener(|this, _, window, cx| this.refresh(window, cx))),
            )
    }

    /// The Outline docked at the sidebar's foot (2.8.1's place for it): the open file's headings,
    /// collapsible. The headings arrive with the editor; until then it says so.
    fn outline(&self, theme: &SpectrumTheme, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let file = self
            .open_file
            .as_ref()
            .and_then(|f| f.file_name())
            .map(|n| format!(" · {}", n.to_string_lossy()))
            .unwrap_or_default();
        let open = self.outline_open;
        let hover = theme.bg_hover;
        div()
            .flex_none()
            .flex()
            .flex_col()
            .gap(px(2.))
            .pt(px(6.))
            .border_t_1()
            .border_color(theme.border)
            .child(
                div()
                    .id("outline-toggle")
                    .h(px(26.))
                    .px(px(9.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .rounded(px(8.))
                    .text_size(px(12.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.text_secondary)
                    .hover(move |s| s.bg(hover))
                    .cursor_pointer()
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .child(format!("Outline{file}")),
                    )
                    // Lucide fallback: no chevron among the 92
                    .child(icon(
                        if open {
                            IconName::ChevronDown
                        } else {
                            IconName::ChevronRight
                        },
                        12.,
                        theme.text_tertiary,
                    ))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.outline_open = !this.outline_open;
                        cx.notify();
                    })),
            )
            .when(open, |d| {
                d.child(
                    div()
                        .px(px(9.))
                        .pb(px(4.))
                        .text_size(px(12.))
                        .text_color(theme.text_tertiary)
                        .child("Headings show here once the editor reads them."),
                )
            })
    }

    /// The Settings entry under the Outline.
    fn settings_row(theme: &SpectrumTheme) -> impl IntoElement + use<> {
        let hover = theme.bg_hover;
        div()
            .flex_none()
            .pt(px(4.))
            .border_t_1()
            .border_color(theme.border)
            .child(
                div()
                    .id("settings")
                    .h(px(26.))
                    .px(px(9.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .rounded(px(8.))
                    .text_size(px(12.))
                    .text_color(theme.text_secondary)
                    .hover(move |s| s.bg(hover))
                    .cursor_pointer()
                    .child(icon(SpectrumIcon::Settings, 14., theme.text_tertiary))
                    .child("Settings")
                    .on_click(|_, window, cx| {
                        not_built(window, cx, "Settings", "the settings window");
                    }),
            )
    }

    pub(super) fn sidebar(
        &self,
        theme: &SpectrumTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let tabs = sidebar_tabs("sidebar-tabs", self.tab, theme).on_select(cx.listener(
            |this, ix: &usize, _, cx| {
                this.tab = SidebarTab::ALL[*ix];
                cx.notify();
            },
        ));
        let body = match self.tab {
            SidebarTab::Files => div()
                .flex_1()
                .min_h_0()
                .flex()
                .flex_col()
                .gap(px(4.))
                .child(self.header(theme, cx))
                .child(self.files(theme, cx))
                .into_any_element(),
            tab => {
                let comes = match tab {
                    SidebarTab::Research => {
                        "Sources and reading notes show here (spectrum-references)."
                    }
                    _ => "The project's to-dos show here.",
                };
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .gap(px(4.))
                    .px(px(9.))
                    .pt(px(8.))
                    .child(
                        div()
                            .text_size(px(13.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(theme.sidebar_tab(tab).text)
                            .child(tab.name()),
                    )
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(theme.text_tertiary)
                            .child(comes),
                    )
                    .into_any_element()
            }
        };
        panel(theme)
            .size_full()
            .flex()
            .flex_col()
            .gap(px(8.))
            .p(px(8.))
            .child(tabs)
            .child(body)
            .child(self.outline(theme, cx))
            .child(Self::settings_row(theme))
    }
}
