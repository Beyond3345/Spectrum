//! Drawing the workspace: title bar, the three panes and the editor toolbar (Snippet B).

use super::{WorkspaceEvent, WorkspaceView};
use crate::actions::{CompileProject, ShowCommandPalette, ToggleSidebar};
use gpui_kit::{
    AnyElement, App, Context, FontWeight, IntoElement, ParentElement, Render, Styled, Window, div,
    prelude::*, px,
};
use spectrum_core::UserNotice;
use spectrum_theme::{SIDEBAR_WIDTH, SpectrumTheme, ToolbarSlot};
use spectrum_ui::resizable::{h_resizable, resizable_panel};
use spectrum_ui::{
    IconButton, PalettePill, SpectrumIcon, SplitButton, TITLE_BAR_HEIGHT, TitleBar, Tone, icon,
    pane_bar, panel, shortcut_label, show_notice,
};

/// The editor toolbar, left to right along the calm pastel spectrum: warm authoring, then cool
/// inspection and AI (plan Section 3).
const TOOLBAR: [(ToolbarSlot, SpectrumIcon, &str, &str); 10] = [
    (
        ToolbarSlot::Insert,
        SpectrumIcon::Insert,
        "Insert",
        "the editor",
    ),
    (
        ToolbarSlot::Figure,
        SpectrumIcon::Figure,
        "Figure",
        "the editor",
    ),
    (
        ToolbarSlot::Table,
        SpectrumIcon::Table,
        "Table",
        "the editor",
    ),
    (
        ToolbarSlot::Diagram,
        SpectrumIcon::Diagram,
        "Diagram",
        "the diagram composer",
    ),
    (
        ToolbarSlot::Jyutping,
        SpectrumIcon::Jyutping,
        "Jyutping",
        "the converters",
    ),
    (
        ToolbarSlot::Insights,
        SpectrumIcon::Insights,
        "Insights",
        "the editor",
    ),
    (
        ToolbarSlot::Grammar,
        SpectrumIcon::Grammar,
        "Grammar",
        "the checkers' editor wiring",
    ),
    (
        ToolbarSlot::Tools,
        SpectrumIcon::Tools,
        "Tools",
        "the compile and version panels",
    ),
    (
        ToolbarSlot::Assistant,
        SpectrumIcon::Assistant,
        "Assistant",
        "the assistant",
    ),
    (
        ToolbarSlot::Agent,
        SpectrumIcon::Agent,
        "Agent",
        "the agent",
    ),
];

/// Says plainly that a control's feature isn't in this build yet.
pub(super) fn not_built(window: &mut Window, cx: &mut App, name: &str, comes_with: &str) {
    let notice = UserNotice::new(
        format!("{name} isn't in this build yet"),
        format!("It arrives with {comes_with}."),
    );
    show_notice(window, cx, &notice, Tone::Info);
}

/// A clearly labelled empty slot that another part of the rewrite fills.
fn slot(
    theme: &SpectrumTheme,
    glyph: SpectrumIcon,
    title: String,
    line: &'static str,
) -> impl IntoElement + use<> {
    div()
        .size_full()
        .flex()
        .flex_col()
        .items_center()
        .justify_center()
        .gap(px(8.))
        .child(icon(glyph, 28., theme.text_tertiary))
        .child(
            div()
                .text_size(px(14.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(theme.text_secondary)
                .child(title),
        )
        .child(
            div()
                .text_size(px(12.))
                .text_color(theme.text_tertiary)
                .child(line),
        )
}

impl WorkspaceView {
    fn title_bar(
        &self,
        theme: &SpectrumTheme,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let file = self
            .open_file
            .as_ref()
            .map(|f| format!(" / {}", f.to_string_lossy().replace('\\', "/")))
            .unwrap_or_default();
        let left = div()
            .flex()
            .items_center()
            .gap(px(6.))
            .text_size(px(12.))
            .text_color(theme.text_secondary)
            .child(
                IconButton::plain("projects", SpectrumIcon::Home, theme)
                    .tooltip("Projects")
                    .on_click(cx.listener(|_, _, _, cx| cx.emit(WorkspaceEvent::ShowProjects))),
            )
            .child(
                IconButton::plain("sidebar", SpectrumIcon::Sidebar, theme)
                    .active(self.sidebar_open)
                    .tooltip("Show or hide the sidebar")
                    .on_click(|_, window, cx| window.dispatch_action(Box::new(ToggleSidebar), cx)),
            )
            .child(
                div()
                    .ml(px(4.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.text)
                    .child(concat!("Spectrum ", env!("CARGO_PKG_VERSION"))),
            )
            .child(format!("— {}{file}", self.name));
        let pill = PalettePill::new("palette-pill", "Search commands & files…")
            .keys(shortcut_label(
                &ShowCommandPalette,
                &["Spectrum Workspace"],
                window,
            ))
            .on_click(|_, window, cx| window.dispatch_action(Box::new(ShowCommandPalette), cx));
        // session 10a puts the update pill before Compile
        let right = div().flex().items_center().gap(px(8.)).pr(px(10.)).child(
            SplitButton::primary(
                "compile",
                if self.compiling {
                    "Compiling"
                } else {
                    "Compile"
                },
                theme,
            )
            .compiling(self.compiling)
            .on_click(|_, window, cx| window.dispatch_action(Box::new(CompileProject), cx))
            .on_menu(|_, window, cx| not_built(window, cx, "Compile options", "the compiler")),
        );
        TitleBar::new()
            .h(px(TITLE_BAR_HEIGHT))
            .bg(theme.bg_app)
            .border_color(theme.border)
            .child(left)
            .child(pill)
            .child(right)
    }

    fn editor_pane(&self, theme: &SpectrumTheme) -> impl IntoElement + use<> {
        let button = |(slot, glyph, name, comes_with): (
            ToolbarSlot,
            SpectrumIcon,
            &'static str,
            &'static str,
        )| {
            IconButton::pastel(name, glyph, slot, theme)
                .tooltip(name)
                .on_click(move |_, window, cx| not_built(window, cx, name, comes_with))
        };
        let (warm, cool) = TOOLBAR.split_at(5);
        let title = self.open_file.as_ref().map_or_else(
            || "No file open".to_owned(),
            |f| f.to_string_lossy().replace('\\', "/"),
        );
        panel(theme)
            .size_full()
            .flex()
            .flex_col()
            .child(
                pane_bar(theme)
                    .children(warm.iter().copied().map(button))
                    .child(div().flex_1())
                    .children(cool.iter().copied().map(button)),
            )
            .child(div().flex_1().min_h_0().bg(theme.bg_code).child(slot(
                theme,
                SpectrumIcon::FileText,
                title,
                "The code editor fills this pane (spectrum-editor).",
            )))
    }

    fn pdf_pane(theme: &SpectrumTheme) -> impl IntoElement + use<> {
        panel(theme)
            .size_full()
            .flex()
            .flex_col()
            .child(
                pane_bar(theme)
                    .justify_center()
                    .text_size(px(12.))
                    .text_color(theme.text_secondary)
                    .child("No PDF yet"),
            )
            .child(div().flex_1().min_h_0().bg(theme.bg_subtle).child(slot(
                theme,
                SpectrumIcon::LayoutPdf,
                "PDF preview".to_owned(),
                "Compiled pages show here (spectrum-pdf).",
            )))
    }
}

/// A pane inside the resizable group: half the 8 px gap on each side, so neighbours sit 8 px apart
/// with the drag handle in between.
fn gap(child: impl IntoElement) -> AnyElement {
    div().size_full().p(px(4.)).child(child).into_any_element()
}

impl Render for WorkspaceView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>().clone();
        let sidebar = self.sidebar(&theme, cx);
        div()
            .id("workspace")
            .track_focus(&self.focus_handle)
            .key_context("Workspace")
            .on_action(cx.listener(Self::on_toggle_sidebar))
            .on_action(cx.listener(Self::on_new_file))
            .on_action(cx.listener(Self::on_new_folder))
            .on_action(cx.listener(Self::on_rename))
            .on_action(cx.listener(Self::on_bin))
            .on_action(cx.listener(Self::on_refresh))
            .on_action(cx.listener(|_, _: &CompileProject, window, cx| {
                not_built(window, cx, "Compiling", "the compiler");
            }))
            .size_full()
            .flex()
            .flex_col()
            .bg(theme.bg_app)
            .text_color(theme.text)
            .child(self.title_bar(&theme, window, cx))
            .child(
                div().flex_1().min_h_0().p(px(4.)).child(
                    h_resizable("workspace-panes")
                        .child(
                            resizable_panel()
                                .size(px(SIDEBAR_WIDTH))
                                .size_range(px(200.)..px(440.))
                                .fixed()
                                .visible(self.sidebar_open)
                                .child(gap(sidebar)),
                        )
                        .child(
                            resizable_panel()
                                .size(px(560.))
                                .size_range(px(280.)..px(10_000.))
                                .child(gap(self.editor_pane(&theme))),
                        )
                        .child(
                            resizable_panel()
                                .size(px(430.))
                                .size_range(px(240.)..px(10_000.))
                                .child(gap(Self::pdf_pane(&theme))),
                        ),
                ),
            )
    }
}
