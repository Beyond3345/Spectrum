//! One fuzzy picker for the Command Palette (Cmd+Shift+P) and Quick Open (Cmd+P): a search field
//! over a ranked list. Up/Down move, Enter chooses, Escape or a click outside closes. The caller
//! builds the items and acts on [`PaletteEvent`].

use crate::fuzzy::{FuzzyMatch, rank};
use crate::{Icon, icon, key_tag};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::{
    App, Context, Entity, EventEmitter, FocusHandle, Focusable, FontWeight, HighlightStyle, Hsla,
    IntoElement, KeyDownEvent, MouseButton, ParentElement, Render, ScrollStrategy, SharedString,
    StyledText, Subscription, UniformListScrollHandle, Window, div, prelude::*, px, uniform_list,
};
use spectrum_theme::{RADIUS_CARD, SpectrumTheme, ToolbarSlot};

/// How many rows show before the list scrolls.
const VISIBLE_ROWS: usize = 10;
const ROW_HEIGHT: f32 = 34.;

/// A line in the picker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaletteItem {
    /// What is matched and shown first (a command's name, a file's path).
    pub label: SharedString,
    /// Shown dimmed on the right (a command's group, a file's kind).
    pub detail: SharedString,
    /// The key binding, already formatted for the platform.
    pub shortcut: Option<SharedString>,
    /// The line icon on the left and its calm tint (Blueprint 10).
    pub icon: Option<(Icon, Hsla)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaletteEvent {
    /// The item at this index (of the items given to [`PaletteView::new`]) was chosen.
    Confirmed(usize),
    Dismissed,
}

/// What the picker says when it opens.
pub struct PaletteText {
    pub placeholder: &'static str,
    pub empty: &'static str,
    pub icon: Icon,
    /// Rank labels as `/`-separated paths.
    pub paths: bool,
}

pub struct PaletteView {
    focus_handle: FocusHandle,
    input: Entity<InputState>,
    items: Vec<PaletteItem>,
    matches: Vec<FuzzyMatch>,
    active: usize,
    text: PaletteText,
    scroll: UniformListScrollHandle,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<PaletteEvent> for PaletteView {}

impl Focusable for PaletteView {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl PaletteView {
    pub fn new(
        items: Vec<PaletteItem>,
        text: PaletteText,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder(text.placeholder));
        input.update(cx, |input, cx| input.focus(window, cx));
        let sub = cx.subscribe_in(&input, window, |this, _, event: &InputEvent, _, cx| {
            if matches!(event, InputEvent::Change) {
                this.refilter(cx);
            }
        });
        let matches = rank("", &labels(&items), text.paths);
        Self {
            focus_handle: cx.focus_handle(),
            input,
            items,
            matches,
            active: 0,
            text,
            scroll: UniformListScrollHandle::new(),
            _subscriptions: vec![sub],
        }
    }

    /// The indices of the items now listed, best first.
    pub fn listed(&self) -> Vec<usize> {
        self.matches.iter().map(|m| m.index).collect()
    }

    fn refilter(&mut self, cx: &mut Context<Self>) {
        let query = self.input.read(cx).value();
        self.matches = rank(&query, &labels(&self.items), self.text.paths);
        self.active = 0;
        self.scroll.scroll_to_item(0, ScrollStrategy::Top);
        cx.notify();
    }

    fn step(&mut self, down: bool, cx: &mut Context<Self>) {
        let n = self.matches.len();
        if n == 0 {
            return;
        }
        self.active = if down {
            (self.active + 1) % n
        } else {
            (self.active + n - 1) % n
        };
        self.scroll
            .scroll_to_item(self.active, ScrollStrategy::Nearest);
        cx.notify();
    }

    fn choose(&mut self, ix: usize, cx: &mut Context<Self>) {
        if let Some(m) = self.matches.get(ix) {
            cx.emit(PaletteEvent::Confirmed(m.index));
        }
    }

    fn on_key(&mut self, event: &KeyDownEvent, _: &mut Window, cx: &mut Context<Self>) {
        let k = &event.keystroke;
        if k.modifiers.modified() {
            return;
        }
        match k.key.as_str() {
            "up" => self.step(false, cx),
            "down" => self.step(true, cx),
            "enter" => self.choose(self.active, cx),
            "escape" => cx.emit(PaletteEvent::Dismissed),
            _ => return,
        }
        cx.stop_propagation();
    }

    fn render_row(
        &self,
        ix: usize,
        theme: &SpectrumTheme,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let m = &self.matches[ix];
        let item = &self.items[m.index];
        let strong = HighlightStyle {
            font_weight: Some(FontWeight::BOLD),
            ..HighlightStyle::default()
        };
        let label = StyledText::new(item.label.clone())
            .with_highlights(m.ranges.iter().map(|r| (r.clone(), strong)));
        let on = ix == self.active;
        div()
            .id(ix)
            .w_full()
            .h(px(ROW_HEIGHT))
            .px(px(10.))
            .flex()
            .items_center()
            .gap(px(12.))
            .rounded(px(8.))
            .text_size(px(13.))
            .text_color(theme.text)
            // Blueprint 10's calm blue (the Grammar pastel at 12%), not the accent
            .when(on, |d| d.bg(theme.toolbar(ToolbarSlot::Grammar).active))
            .cursor_pointer()
            .on_mouse_move(cx.listener(move |this, _, _, cx| {
                if this.active != ix {
                    this.active = ix;
                    cx.notify();
                }
            }))
            .on_click(cx.listener(move |this, _, _, cx| this.choose(ix, cx)))
            .when_some(item.icon, |d, (glyph, tint)| {
                d.child(icon(glyph, 15., tint))
            })
            .child(div().flex_1().min_w_0().truncate().child(label))
            .child(
                div()
                    .flex_none()
                    .text_size(px(12.))
                    .text_color(theme.text_tertiary)
                    .child(item.detail.clone()),
            )
            .when_some(item.shortcut.clone(), |d, keys| {
                d.child(key_tag(theme, keys))
            })
    }
}

fn labels(items: &[PaletteItem]) -> Vec<SharedString> {
    items.iter().map(|i| i.label.clone()).collect()
}

impl Render for PaletteView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<SpectrumTheme>().clone();
        let count = self.matches.len();
        #[allow(clippy::cast_precision_loss)]
        let list_height = px(ROW_HEIGHT * count.clamp(1, VISIBLE_ROWS) as f32);
        let field = div()
            .flex_none()
            .h(px(46.))
            .px(px(14.))
            .flex()
            .items_center()
            .gap(px(10.))
            .border_b_1()
            .border_color(theme.border)
            .child(icon(self.text.icon, 16., theme.text_tertiary))
            .child(
                div()
                    .flex_1()
                    .text_size(px(14.))
                    .child(Input::new(&self.input).appearance(false)),
            );
        let list = if count == 0 {
            div()
                .h(list_height)
                .px(px(10.))
                .flex()
                .items_center()
                .text_size(px(13.))
                .text_color(theme.text_tertiary)
                .child(self.text.empty)
                .into_any_element()
        } else {
            let row_theme = theme.clone();
            uniform_list(
                "palette-rows",
                count,
                cx.processor(move |this, range: std::ops::Range<usize>, _, cx| {
                    range
                        .map(|ix| this.render_row(ix, &row_theme, cx).into_any_element())
                        .collect::<Vec<_>>()
                }),
            )
            .track_scroll(&self.scroll)
            .h(list_height)
            .into_any_element()
        };
        div()
            .id("palette-backdrop")
            .track_focus(&self.focus_handle)
            .key_context("Palette")
            .capture_key_down(cx.listener(Self::on_key))
            .absolute()
            .inset_0()
            .flex()
            .justify_center()
            .items_start()
            .pt(px(72.))
            .bg(gpui_kit::black().opacity(if theme.is_dark() { 0.3 } else { 0.12 }))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|_, _, _, cx| cx.emit(PaletteEvent::Dismissed)),
            )
            .child(
                div()
                    .id("palette")
                    .occlude()
                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .w(px(580.))
                    .h_auto()
                    .flex()
                    .flex_col()
                    .bg(theme.bg_panel)
                    .border_1()
                    .border_color(theme.border_strong)
                    .rounded(px(RADIUS_CARD))
                    .shadow_lg()
                    .overflow_hidden()
                    .child(field)
                    .child(div().p(px(6.)).child(list)),
            )
    }
}
