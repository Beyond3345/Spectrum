//! The pastel toolbar button, the Calm Slate Compile split button (plan Section 3B, Snippet B) and
//! the prism bar for brand moments.

use crate::{IconName, alpha, icon};
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::{
    Animation, AnimationExt as _, AnyElement, App, ClickEvent, ElementId, FontWeight, Hsla,
    IntoElement, ParentElement, RenderOnce, SharedString, Styled, Transformation, Window, div,
    linear_color_stop, linear_gradient, percentage, prelude::*, px, svg, transparent_black, white,
};
use spectrum_theme::{SpectrumTheme, ToolbarSlot};
use std::rc::Rc;
use std::time::Duration;

pub(crate) type ClickHandler = Rc<dyn Fn(&ClickEvent, &mut Window, &mut App)>;

/// A square icon button. `pastel` draws a toolbar slot's calm pastel icon with nothing behind it,
/// a faint tint on hover and the plan's 12% tint (with a soft ring) when on; `plain` is neutral
/// chrome.
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
    pub fn pastel(
        id: impl Into<ElementId>,
        icon: IconName,
        slot: ToolbarSlot,
        theme: &SpectrumTheme,
    ) -> Self {
        let calm = theme.toolbar(slot);
        Self::build(
            id.into(),
            icon,
            calm.fg,
            transparent_black(),
            calm.hover,
            calm.active,
        )
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
                alpha(self.fg, 0.35)
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

/// A pill of the six-hue prism (the logo's `--logo-spectrum`) for brand moments; the caller sizes
/// it. GPUI gradients take two stops, so the fill is five segments with rounded ends.
pub fn prism_bar(theme: &SpectrumTheme) -> gpui_kit::Div {
    let p = theme.prism();
    let last = p.len() - 2;
    div()
        .relative()
        .flex_none()
        .child(
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
                })),
        )
}

/// The Compile split button: a solid Calm Slate pill (`theme.accent_muted`) with a white semibold
/// label, a run part and a menu chevron. While compiling, a turning ring replaces the play icon.
#[derive(IntoElement)]
pub struct SplitButton {
    id: ElementId,
    label: SharedString,
    fill: Hsla,
    compiling: bool,
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
            fill: theme.accent_muted,
            compiling: false,
            on_click: None,
            on_menu: None,
        }
    }

    /// Shows the subtle in-progress ring.
    pub fn compiling(mut self, compiling: bool) -> Self {
        self.compiling = compiling;
        self
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

/// The run part's leading glyph: play, or a slowly turning ring while compiling.
fn run_glyph(compiling: bool) -> AnyElement {
    if !compiling {
        return icon(IconName::Play, 11., white()).into_any_element();
    }
    svg()
        .path(IconName::LoaderCircle.path())
        .flex_none()
        .size(px(11.))
        .text_color(white().opacity(0.85))
        .with_animation(
            "compiling",
            Animation::new(Duration::from_millis(1100)).repeat(),
            |s, delta| s.with_transformation(Transformation::rotate(percentage(delta))),
        )
        .into_any_element()
}

impl RenderOnce for SplitButton {
    fn render(self, _: &mut Window, _: &mut App) -> impl IntoElement {
        let press = |d: gpui_kit::Stateful<gpui_kit::Div>| d.hover(|s| s.bg(white().opacity(0.1)));
        div()
            .id(self.id)
            .flex_none()
            .h(px(26.))
            .flex()
            .items_center()
            .rounded_full()
            .bg(self.fill)
            .text_size(px(12.))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(white())
            .child(
                press(div().id("run"))
                    .h_full()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pl(px(12.))
                    .pr(px(9.))
                    .rounded_l_full()
                    .cursor_pointer()
                    .child(run_glyph(self.compiling))
                    .child(self.label)
                    .when_some(self.on_click, |d, f| {
                        d.on_click(move |e, w, cx| f(e, w, cx))
                    }),
            )
            .child(div().w(px(1.)).h(px(12.)).bg(white().opacity(0.4)))
            .child(
                press(div().id("menu"))
                    .h_full()
                    .flex()
                    .items_center()
                    .pl(px(7.))
                    .pr(px(10.))
                    .rounded_r_full()
                    .cursor_pointer()
                    .child(icon(IconName::ChevronDown, 12., white().opacity(0.9)))
                    .when_some(self.on_menu, |d, f| d.on_click(move |e, w, cx| f(e, w, cx))),
            )
    }
}
