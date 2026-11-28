//! Panels, the segmented control, the sidebar tab strip and file rows, sized from the plan's
//! Blueprint 1 mockup (scaled from its 185 px sidebar to the real 268 px).

use crate::buttons::ClickHandler;
use crate::{Icon, IconName, SpectrumIcon, icon};
use gpui_kit::{
    App, ClickEvent, Div, ElementId, FontWeight, Hsla, IntoElement, ParentElement, RenderOnce,
    SharedString, Styled, Window, div, prelude::*, px,
};
use spectrum_theme::{RADIUS_CARD, RADIUS_CONTROL, RADIUS_PANEL, SidebarTab, SpectrumTheme};
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
    icon: Option<Icon>,
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

    pub fn icon_item(mut self, icon: impl Into<Icon>) -> Self {
        self.segments.push(Segment {
            label: None,
            icon: Some(icon.into()),
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

/// Indent per tree level: a child's icon lines up with its folder's icon (chevron 12 + gap 8).
const TREE_INDENT: f32 = 20.;

/// A row of the Files tree (`.mk-file`): a folder's disclosure chevron, the file-type or folder
/// line icon in its calm tint, the name, and a collapsed folder's count. The open file sits on its
/// tab's 12% pastel tint in full-strength bold text.
#[derive(IntoElement)]
pub struct FileRow {
    id: ElementId,
    label: SharedString,
    glyph: Icon,
    tint: Hsla,
    depth: usize,
    /// `Some(open)` for a folder.
    folder: Option<bool>,
    count: Option<usize>,
    active: bool,
    selected: bool,
    on_click: Option<ClickHandler>,
}

impl FileRow {
    pub fn new(
        id: impl Into<ElementId>,
        label: impl Into<SharedString>,
        glyph: impl Into<Icon>,
        tint: Hsla,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            glyph: glyph.into(),
            tint,
            depth: 0,
            folder: None,
            count: None,
            active: false,
            selected: false,
            on_click: None,
        }
    }

    /// Nesting level (0 at the project's top).
    pub fn depth(mut self, depth: usize) -> Self {
        self.depth = depth;
        self
    }

    /// A folder row, open or closed: draws the disclosure chevron.
    pub fn folder(mut self, open: bool) -> Self {
        self.folder = Some(open);
        self
    }

    /// Shown dimmed on the right (a closed folder's item count).
    pub fn count(mut self, count: usize) -> Self {
        self.count = Some(count);
        self
    }

    /// The file open in the editor.
    pub fn active(mut self, active: bool) -> Self {
        self.active = active;
        self
    }

    /// The tree's cursor: picked for a file action or the arrow keys without being open.
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
        #[allow(clippy::cast_precision_loss)]
        let indent = self.depth as f32 * TREE_INDENT;
        div()
            .id(self.id)
            .flex_none()
            .h(px(28.))
            .pl(px(9. + indent))
            .pr(px(9.))
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
            .when_some(self.folder, |d, open| {
                // Lucide fallback: the 92 line icons have no disclosure chevron
                d.child(icon(
                    if open {
                        IconName::ChevronDown
                    } else {
                        IconName::ChevronRight
                    },
                    12.,
                    theme.text_tertiary,
                ))
            })
            .child(icon(self.glyph, 15., self.tint))
            .child(div().flex_1().min_w_0().truncate().child(self.label))
            .when_some(self.count, |d, n| {
                d.child(
                    div()
                        .flex_none()
                        .text_size(px(12.))
                        .text_color(theme.text_tertiary)
                        .child(n.to_string()),
                )
            })
            .cursor_pointer()
            .when_some(self.on_click, |d, f| {
                d.on_click(move |e, w, cx| f(e, w, cx))
            })
    }
}

/// The header's palette pill (Blueprints 1, 4 and 10): a quiet search field look-alike that opens
/// the Command Palette, with its shortcut.
#[derive(IntoElement)]
pub struct PalettePill {
    id: ElementId,
    label: SharedString,
    keys: Option<SharedString>,
    on_click: Option<ClickHandler>,
}

impl PalettePill {
    pub fn new(id: impl Into<ElementId>, label: impl Into<SharedString>) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            keys: None,
            on_click: None,
        }
    }

    /// The shortcut as the platform writes it (`⇧⌘P`, `Ctrl+Shift+P`).
    pub fn keys(mut self, keys: Option<impl Into<SharedString>>) -> Self {
        self.keys = keys.map(Into::into);
        self
    }

    pub fn on_click(mut self, f: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static) -> Self {
        self.on_click = Some(Rc::new(f));
        self
    }
}

impl RenderOnce for PalettePill {
    fn render(self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>();
        let strong = theme.border_strong;
        div()
            .id(self.id)
            .flex_none()
            .w(px(300.))
            .h(px(26.))
            .pl(px(10.))
            .pr(px(4.))
            .flex()
            .items_center()
            .gap(px(7.))
            .rounded(px(RADIUS_CONTROL))
            .bg(theme.bg_panel)
            .border_1()
            .border_color(theme.border)
            .hover(move |s| s.border_color(strong))
            .cursor_pointer()
            .text_size(px(12.))
            .text_color(theme.text_tertiary)
            .child(icon(SpectrumIcon::Search, 13., theme.text_tertiary))
            .child(div().flex_1().min_w_0().truncate().child(self.label))
            .when_some(self.keys, |d, keys| d.child(key_tag(theme, keys)))
            .when_some(self.on_click, |d, f| {
                d.on_click(move |e, w, cx| f(e, w, cx))
            })
    }
}

/// A key binding drawn as a small tag (`⌘↵`), as the palette and the header pill show them.
pub fn key_tag(theme: &SpectrumTheme, keys: impl Into<SharedString>) -> Div {
    div()
        .flex_none()
        .px(px(5.))
        .py(px(1.))
        .rounded(px(5.))
        .bg(theme.bg_subtle)
        .border_1()
        .border_color(theme.border)
        .text_size(px(11.))
        .text_color(theme.text_secondary)
        .child(keys.into())
}
