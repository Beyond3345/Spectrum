//! The left sidebar: the four-tab strip and the Files list with its name field and right-click menu.

use super::{FileKind, NameFor, WorkspaceView};
use crate::actions::{MoveFileToBin, NewFile, NewFolder, RefreshFiles, RenameFile};
use crate::file_ops::BIN;
use gpui_kit::{
    AnyElement, Context, Hsla, IntoElement, MouseButton, ParentElement, Styled, div, prelude::*, px,
};
use spectrum_theme::{SidebarTab, SpectrumTheme};
use spectrum_ui::input::Input;
use spectrum_ui::menu::{ContextMenuExt, PopupMenu};
use spectrum_ui::{FileRow, IconButton, IconName, panel, sidebar_tabs};

fn dot(theme: &SpectrumTheme, kind: FileKind) -> Hsla {
    match kind {
        FileKind::Source => theme.red,
        FileKind::Bibliography => theme.teal,
        FileKind::Diagram => theme.green,
        FileKind::Other | FileKind::Folder => theme.text_tertiary,
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
        for (ix, item) in self.items.iter().enumerate() {
            if renaming.as_ref() == Some(&item.rel) {
                if let Some(field) = self.name_field(theme) {
                    rows.push(field);
                }
                continue;
            }
            let rel = item.rel.clone();
            let pick = rel.clone();
            let row = FileRow::new(("file", ix), item.label.clone(), dot(theme, item.kind))
                .active(self.open_file.as_ref() == Some(&item.rel))
                .selected(self.selected.as_ref() == Some(&item.rel))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.tree_focus.focus(window, cx);
                    this.open(&rel, cx);
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
                let (title, comes) = match tab {
                    SidebarTab::Outline => (
                        "Outline",
                        "The document's headings show here once the editor reads them.",
                    ),
                    SidebarTab::Research => (
                        "Research",
                        "Sources and reading notes show here (spectrum-references).",
                    ),
                    _ => ("To-dos", "The project's to-dos show here."),
                };
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .gap(px(4.))
                    .px(px(9.))
                    .pt(px(8.))
                    .child(
                        div()
                            .text_size(px(13.))
                            .font_weight(gpui_kit::FontWeight::SEMIBOLD)
                            .text_color(theme.sidebar_tab(tab).0)
                            .child(title),
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
    }
}
