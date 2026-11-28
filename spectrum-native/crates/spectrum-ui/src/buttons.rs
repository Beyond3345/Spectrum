//! The area-tinted icon button and the prism Compile split button (plan Section 3B, Snippet B).

use crate::{IconName, alpha, icon};
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::{
    App, ClickEvent, ElementId, FontWeight, Hsla, IntoElement, ParentElement, RenderOnce,
    SharedString, Styled, Window, black, div, linear_color_stop, linear_gradient, prelude::*, px,
    transparent_black, white,
};
use spectrum_theme::{SpectrumTheme, ToolbarSlot};
use std::rc::Rc;

pub(crate) type ClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

/// A square icon button. `spectrum` tints it in a toolbar slot's hue (the mockup's `.mk-btn`:
/// a 14% pill, 18% and a border in the hue when active); `plain` is neutral chrome.
#[derive(IntoElement)]
pub struct IconButton {
    id: ElementId,
    icon: IconName,
    fg: Hsla,
    rest: Hsla,
    hover: Hsla,
    active_bg: Hsla,
    active: bool,
    size: f32,
    tooltip: Option<SharedString>,
    on_click: Option<ClickHandler>,
}

impl IconButton {
    pub fn spectrum(
        id: impl Into<ElementId>,
        icon: IconName,
        slot: ToolbarSlot,
        theme: &SpectrumTheme,
    ) -> Self {
        let (fg, bg) = theme.toolbar(slot);
        Self::build(id.into(), icon, fg, bg, alpha(fg, 0.22), alpha(fg, 0.18))
    }

    pub fn plain(id: impl Into<ElementId>, icon: IconName, theme: &SpectrumTheme) -> Self {
        Self::build(
            id.into(),
            icon,
            theme.text_secondary,
            transparent_black(),
            theme.bg_hover,
            theme.bg_selected,
        )
        .size(24.)
    }

    fn build(
        id: ElementId,
        icon: IconName,
        fg: Hsla,
        rest: Hsla,
        hover: Hsla,
        active_bg: Hsla,
    ) -> Self {
        Self {
            id,
            icon,
            fg,
            rest,
            hover,
            active_bg,
            active: false,
            size: 28.,
            tooltip: None,
            on_click: None,
        }
    }

    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }

    /// Side length in pixels (28 for the toolbar, 24 for small chrome).
    pub fn size(mut self, size: f32) -> Self {
        self.size = size;
        self
    }

    pub fn tooltip(mut self, text: impl Into<SharedString>) -> Self {
        self.tooltip = Some(text.into());
        self
    }

    pub fn on_click(mut self, f: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static) -> Self {
        self.on_click = Some(Rc::new(f));
        self
    }
}

impl RenderOnce for IconButton {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let hover = self.hover;
        div()
            .id(self.id)
            .size(px(self.size))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .rounded(px((self.size / 3.5).round()))
            .border_1()
            .border_color(if self.active {
                self.fg
            } else {
                transparent_black()
            })
            .bg(if self.active {
                self.active_bg
            } else {
                self.rest
            })
            .hover(move |s| s.bg(hover))
            .cursor_pointer()
            .child(icon(self.icon, (self.size * 0.57).round(), self.fg))
            .when_some(self.tooltip, |d, text| {
                d.tooltip(move |window, cx| Tooltip::new(text.clone()).build(window, cx))
            })
            .when_some(self.on_click, |d, f| {
                d.on_click(move |e, w, cx| f(e, w, cx))
            })
    }
}

/// White bold text with the mockup's 1 px dark text shadow (GPUI text has no shadow, so the
/// label is drawn twice).
fn shadowed(label: SharedString) -> impl IntoElement {
    div()
        .relative()
        .font_weight(FontWeight::BOLD)
        .child(
            div()
                .absolute()
                .top(px(1.))
                .left_0()
                .text_color(black().opacity(0.35))
                .child(label.clone()),
        )
        .child(div().relative().text_color(white()).child(label))
}

/// The prism as five two-stop gradients filling the parent, with rounded ends.
fn prism_fill(p: [Hsla; 6]) -> gpui_kit::Div {
    let last = p.len() - 2;
    div()
        .absolute()
        .inset_0()
        .flex()
        .children((0..=last).map(|i| {
            div()
                .flex_1()
                .h_full()
                .bg(linear_gradient(
                    90.,
                    linear_color_stop(p[i], 0.),
                    linear_color_stop(p[i + 1], 1.),
                ))
                .when(i == 0, Styled::rounded_l_full)
                .when(i == last, Styled::rounded_r_full)
        }))
}

/// A pill of the prism gradient (the logo's `--logo-spectrum`); the caller sizes it.
pub fn prism_bar(theme: &SpectrumTheme) -> gpui_kit::Div {
    div()
        .relative()
        .flex_none()
        .child(prism_fill(theme.prism()))
}

/// The Compile split button: a pill filled with the six-hue prism (the plan's `--logo-spectrum`),
/// a run part and a menu chevron. GPUI gradients take two stops, so the fill is five segments.
#[derive(IntoElement)]
pub struct SplitButton {
    id: ElementId,
    label: SharedString,
    prism: [Hsla; 6],
    on_click: Option<ClickHandler>,
    on_menu: Option<ClickHandler>,
}

impl SplitButton {
    pub fn primary(
        id: impl Into<ElementId>,
        label: impl Into<SharedString>,
        theme: &SpectrumTheme,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            prism: theme.prism(),
            on_click: None,
            on_menu: None,
        }
    }

    pub fn on_click(mut self, f: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static) -> Self {
        self.on_click = Some(Rc::new(f));
        self
    }

    pub fn on_menu(mut self, f: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static) -> Self {
        self.on_menu = Some(Rc::new(f));
        self
    }
}

impl RenderOnce for SplitButton {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let fill = prism_fill(self.prism);
        let press = |d: gpui_kit::Stateful<gpui_kit::Div>| d.hover(|s| s.bg(white().opacity(0.12)));
        div()
            .id(self.id)
            .relative()
            .flex_none()
            .h(px(26.))
            .flex()
            .items_center()
            .rounded_full()
            .text_size(px(12.))
            .child(fill)
            .child(
                press(div().id("run"))
                    .relative()
                    .h_full()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pl(px(12.))
                    .pr(px(9.))
                    .rounded_l_full()
                    .cursor_pointer()
                    .child(icon(IconName::Play, 11., white()))
                    .child(shadowed(self.label))
                    .when_some(self.on_click, |d, f| {
                        d.on_click(move |e, w, cx| f(e, w, cx))
                    }),
            )
            .child(
                div()
                    .relative()
                    .w(px(1.))
                    .h(px(12.))
                    .bg(white().opacity(0.7)),
            )
            .child(
                press(div().id("menu"))
                    .relative()
                    .h_full()
                    .flex()
                    .items_center()
                    .pl(px(7.))
                    .pr(px(10.))
                    .rounded_r_full()
                    .cursor_pointer()
                    .child(icon(IconName::ChevronDown, 12., white()))
                    .when_some(self.on_menu, |d, f| d.on_click(move |e, w, cx| f(e, w, cx))),
            )
    }
}
