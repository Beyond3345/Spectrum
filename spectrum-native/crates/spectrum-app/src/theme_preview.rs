//! Phase 0's window: the 12 area swatches, the prism, scope bars and toolbar hues, with live
//! Light/Dark/System and Spectrum/Simple switches. The project workspace replaces it in 1c.

use gpui_kit::{
    AnyElement, Context, Hsla, IntoElement, ParentElement, Render, SharedString, Styled, Window,
    div, prelude::*, px,
};
use spectrum_theme::{
    AreaHue, ColourStyle, RADIUS_CARD, RADIUS_CONTROL, RADIUS_PANEL, SpectrumTheme, ThemeMode,
    ToolbarSlot,
};

pub struct ThemePreviewView;

impl ThemePreviewView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        // System mode follows the OS live
        cx.observe_window_appearance(window, |_, _, cx| {
            let theme = cx.global::<SpectrumTheme>();
            if theme.mode == ThemeMode::System {
                SpectrumTheme::apply(theme.mode, theme.style, cx);
            }
        })
        .detach();
        Self
    }

    /// Switches appearance; the kit refreshes every window, so the view needs no notify.
    fn set(mode: Option<ThemeMode>, style: Option<ColourStyle>, cx: &mut gpui_kit::App) {
        let theme = cx.global::<SpectrumTheme>();
        SpectrumTheme::apply(mode.unwrap_or(theme.mode), style.unwrap_or(theme.style), cx);
    }
}

fn segment(
    id: &'static str,
    label: &'static str,
    on: bool,
    theme: &SpectrumTheme,
) -> gpui_kit::Stateful<gpui_kit::Div> {
    div()
        .id(id)
        .px(px(10.))
        .py(px(4.))
        .rounded(px(RADIUS_CONTROL - 2.))
        .text_color(if on { theme.text } else { theme.text_secondary })
        .when(on, |d| d.bg(theme.bg_panel).shadow_sm())
        .cursor_pointer()
        .child(label)
}

fn swatch(name: SharedString, fill: Hsla, text: Hsla, theme: &SpectrumTheme) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .gap(px(6.))
        .w(px(92.))
        .child(div().h(px(44.)).rounded(px(RADIUS_CONTROL)).bg(fill))
        .child(div().text_xs().text_color(text).child(name))
        .child(div().h(px(1.)).bg(theme.border))
        .into_any_element()
}

/// The Light/Dark/System and Spectrum/Simple segmented switches.
fn switches(theme: &SpectrumTheme) -> impl IntoElement {
    let group = || {
        div()
            .flex()
            .p(px(3.))
            .gap(px(3.))
            .rounded(px(RADIUS_CONTROL))
            .bg(theme.bg_subtle)
    };
    let modes = [
        ("system", "System", ThemeMode::System),
        ("light", "Light", ThemeMode::Light),
        ("dark", "Dark", ThemeMode::Dark),
    ]
    .map(|(id, label, m)| {
        segment(id, label, theme.mode == m, theme)
            .on_click(move |_, _, cx| ThemePreviewView::set(Some(m), None, cx))
    });
    let styles = [
        ("spectrum", "Spectrum", ColourStyle::Spectrum),
        ("simple", "Simple", ColourStyle::Simple),
    ]
    .map(|(id, label, s)| {
        segment(id, label, theme.style == s, theme)
            .on_click(move |_, _, cx| ThemePreviewView::set(None, Some(s), cx))
    });
    div()
        .flex()
        .gap(px(12.))
        .child(group().children(modes))
        .child(group().children(styles))
}

/// Every Spectrum colour family: prism, areas, toolbar hues, scope bars, code surface.
fn samples(theme: &SpectrumTheme) -> impl IntoElement {
    let label = |text: &'static str| div().text_sm().text_color(theme.text_secondary).child(text);
    let prism = div()
        .flex()
        .h(px(4.))
        .rounded(px(2.))
        .overflow_hidden()
        .children(theme.prism().map(|c| div().flex_1().h_full().bg(c)));
    let areas = div()
        .flex()
        .flex_wrap()
        .gap(px(12.))
        .children(AreaHue::ALL.map(|area| {
            let a = theme.area(area);
            swatch(area.colours().name.into(), a.band, a.text, theme)
        }));
    let toolbar = div()
        .flex()
        .gap(px(4.))
        .children(ToolbarSlot::ALL.map(|slot| {
            let calm = theme.toolbar(slot);
            let (fg, bg) = (calm.fg, calm.active);
            div()
                .size(px(24.))
                .rounded(px(6.))
                .bg(bg)
                .flex()
                .items_center()
                .justify_center()
                .child(div().size(px(8.)).rounded_full().bg(fg))
        }));
    let scope = div()
        .flex()
        .gap(px(2.5))
        .h(px(36.))
        .children((0..6).map(|level| {
            div()
                .w(px(2.5))
                .h_full()
                .rounded(px(1.25))
                .bg(theme.scope_bar_color(level))
        }));
    let code = div()
        .p(px(12.))
        .rounded(px(RADIUS_CARD))
        .bg(theme.bg_code)
        .border_1()
        .border_color(theme.bg_code_border)
        .text_color(theme.text_tertiary)
        .text_sm()
        .child("Code surface");
    div()
        .flex()
        .flex_col()
        .gap(px(16.))
        .child(prism)
        .child(label("Areas"))
        .child(areas)
        .child(label("Toolbar and scope bars"))
        .child(
            div()
                .flex()
                .gap(px(24.))
                .items_center()
                .child(toolbar)
                .child(scope),
        )
        .child(code)
}

impl Render for ThemePreviewView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>();
        let header = div()
            .flex()
            .items_center()
            .child(
                div()
                    .text_lg()
                    .font_weight(gpui_kit::FontWeight::BOLD)
                    .child("Spectrum 3.0.0"),
            )
            .child(div().flex_1())
            .child(switches(theme));
        div()
            .size_full()
            .bg(theme.bg_canvas)
            .p(px(8.))
            .pt(px(36.))
            .text_color(theme.text)
            .child(
                div()
                    .size_full()
                    .flex()
                    .flex_col()
                    .gap(px(16.))
                    .p(px(24.))
                    .rounded(px(RADIUS_PANEL))
                    .bg(theme.bg_panel)
                    .border_1()
                    .border_color(theme.border)
                    .child(header)
                    .child(samples(theme)),
            )
    }
}
