//! Panels, the segmented control, the sidebar tab strip and file rows, sized from the plan's
//! Blueprint 1 mockup (scaled from its 185 px sidebar to the real 268 px).

use crate::buttons::ClickHandler;
use crate::{IconName, icon};
use gpui_kit::{
    App, ClickEvent, Div, ElementId, FontWeight, Hsla, IntoElement, ParentElement, RenderOnce,
    SharedString, Styled, Window, div, prelude::*, px,
};
use spectrum_theme::{RADIUS_CARD, RADIUS_PANEL, SidebarTab, SpectrumTheme};
use std::rc::Rc;

/// A main pane: panel surface, hairline border, 16 px corners (`.mk-pane`).
pub fn panel(theme: &SpectrumTheme) -> Div {
    div()
        .bg(theme.bg_panel)
        .border_1()
        .border_color(theme.border)
        .rounded(px(RADIUS_PANEL))
        .overflow_hidden()
}

/// A card inside a panel: subtle surface, 12 px corners.
pub fn card(theme: &SpectrumTheme) -> Div {
    div()
        .bg(theme.bg_subtle)
        .border_1()
        .border_color(theme.border)
        .rounded(px(RADIUS_CARD))
}

/// A pane's top bar (`.mk-toolbar`): subtle surface with a bottom hairline.
pub fn pane_bar(theme: &SpectrumTheme) -> Div {
    div()
        .flex_none()
        .h(px(40.))
        .px(px(8.))
        .flex()
        .items_center()
        .gap(px(4.))
        .bg(theme.bg_subtle)
        .border_b_1()
        .border_color(theme.border)
}

type SelectHandler = Rc<dyn Fn(&usize, &mut Window, &mut App)>;

struct Segment {
    label: Option<SharedString>,
    icon: Option<IconName>,
    colour: Option<Hsla>,
}

/// A row of mutually exclusive choices on a subtle track; the chosen one is a raised panel chip.
/// Also the sidebar's tab strip ([`sidebar_tabs`]), which fills its width and tints each label.
#[derive(IntoElement)]
pub struct Segmented {
    id: ElementId,
    segments: Vec<Segment>,
    selected: usize,
    fill: bool,
    on_select: Option<SelectHandler>,
}

impl Segmented {
    pub fn new(id: impl Into<ElementId>) -> Self {
        Self {
            id: id.into(),
            segments: Vec::new(),
            selected: 0,
            fill: false,
            on_select: None,
        }
    }

    pub fn item(mut self, label: impl Into<SharedString>) -> Self {
        self.segments.push(Segment {
            label: Some(label.into()),
            icon: None,
            colour: None,
        });
        self
    }

    pub fn icon_item(mut self, icon: IconName) -> Self {
        self.segments.push(Segment {
            label: None,
            icon: Some(icon),
            colour: None,
        });
        self
    }

    pub fn selected(mut self, ix: usize) -> Self {
        self.selected = ix;
        self
    }

    pub fn on_select(mut self, f: impl Fn(&usize, &mut Window, &mut App) + 'static) -> Self {
        self.on_select = Some(Rc::new(f));
        self
    }
}

/// The left sidebar's tab strip (`.mk-tabs`): Files, Research, To-dos, each label in its calm
/// pastel (plan Section 3).
pub fn sidebar_tabs(
    id: impl Into<ElementId>,
    selected: SidebarTab,
    theme: &SpectrumTheme,
) -> Segmented {
    let mut strip = Segmented::new(id);
    strip.fill = true;
    strip.selected = SidebarTab::ALL
        .iter()
        .position(|t| *t == selected)
        .unwrap_or(0);
    for tab in SidebarTab::ALL {
        strip.segments.push(Segment {
            label: Some(tab.name().into()),
            icon: None,
            colour: Some(theme.sidebar_tab(tab).text),
        });
    }
    strip
}

impl RenderOnce for Segmented {
    fn render(self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>();
        let (panel, subtle, text, secondary) = (
            theme.bg_panel,
            theme.bg_subtle,
            theme.text,
            theme.text_secondary,
        );
        let fill = self.fill;
        let on_select = self.on_select;
        div()
            .id(self.id)
            .flex()
            .flex_none()
            .p(px(3.))
            .gap(px(3.))
            .rounded(px(9.))
            .bg(subtle)
            .children(self.segments.into_iter().enumerate().map(|(ix, seg)| {
                let on = ix == self.selected;
                let colour = seg.colour.unwrap_or(if on { text } else { secondary });
                let on_select = on_select.clone();
                div()
                    .id(ix)
                    .when(fill, Styled::flex_1)
                    .flex()
                    .items_center()
                    .justify_center()
                    .px(px(match (fill, seg.label.is_some()) {
                        (true, _) => 2.,
                        (false, true) => 10.,
                        (false, false) => 6.,
                    }))
                    .py(px(4.))
                    .rounded(px(7.))
                    .text_size(px(12.))
                    .font_weight(if fill {
                        FontWeight::BOLD
                    } else {
                        FontWeight::MEDIUM
                    })
                    .text_color(colour)
                    .when(on, |d| d.bg(panel).shadow_sm())
                    .cursor_pointer()
                    .when_some(seg.icon, |d, i| d.child(icon(i, 14., colour)))
                    .when_some(seg.label, ParentElement::child)
                    .when_some(on_select, move |d, f| {
                        d.on_click(move |_, w, cx| f(&ix, w, cx))
                    })
            }))
    }
}

/// A file in the sidebar (`.mk-file`): a coloured dot for its kind and its path. The open file
/// sits on its tab's 12% pastel tint in full-strength bold text.
#[derive(IntoElement)]
pub struct FileRow {
    id: ElementId,
    label: SharedString,
    dot: Hsla,
    active: bool,
    selected: bool,
    on_click: Option<ClickHandler>,
}

impl FileRow {
    pub fn new(id: impl Into<ElementId>, label: impl Into<SharedString>, dot: Hsla) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            dot,
            active: false,
            selected: false,
            on_click: None,
        }
    }

    /// The file open in the editor.
    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }

    /// Picked for a file action (rename, Bin) without being open.
    pub fn selected(mut self, selected: bool) -> Self {
        self.selected = selected;
        self
    }

    pub fn on_click(mut self, f: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static) -> Self {
        self.on_click = Some(Rc::new(f));
        self
    }
}

impl RenderOnce for FileRow {
    fn render(self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>();
        let tint = theme.sidebar_tab(SidebarTab::Files).active;
        let hover = theme.bg_hover;
        div()
            .id(self.id)
            .h(px(28.))
            .px(px(9.))
            .flex()
            .items_center()
            .gap(px(8.))
            .rounded(px(8.))
            .text_size(px(13.))
            .overflow_hidden()
            .map(|d| {
                if self.active {
                    d.bg(tint)
                        .text_color(theme.text)
                        .font_weight(FontWeight::SEMIBOLD)
                } else if self.selected {
                    d.bg(theme.bg_selected).text_color(theme.text)
                } else {
                    d.text_color(theme.text_secondary)
                        .hover(move |s| s.bg(hover))
                }
            })
            .child(div().flex_none().size(px(7.)).rounded_full().bg(self.dot))
            .child(div().flex_1().min_w_0().truncate().child(self.label))
            .when_some(self.on_click, |d, f| {
                d.on_click(move |e, w, cx| f(e, w, cx))
            })
    }
}
