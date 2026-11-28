//! Spectrum-themed facade over the GPUI component kit. Every other crate takes its widgets from
//! here, so kit defaults never leak into the UI and a kit upgrade touches one crate.

// builder methods (`.active(true)`) only ever sit in chains; must_use on each adds nothing
#![allow(clippy::return_self_not_must_use)]

mod buttons;
mod controls;
pub mod fuzzy;
mod notice;
mod palette;

pub use buttons::{IconButton, SplitButton, prism_bar};
pub use controls::{FileRow, Segmented, card, pane_bar, panel, sidebar_tabs};
pub use notice::{Tone, confirm, notice_message, show_notice};
pub use palette::{PaletteEvent, PaletteItem, PaletteText, PaletteView};

/// Every bundled Lucide icon (the full catalog, so any [`IconName`] draws).
pub use gpui_kit::assets::{AllAssets as Assets, IconName};

/// Text fields: a kit input with Spectrum's theme applied through spectrum-theme.
pub mod input {
    pub use gpui_kit::component::input::{Input, InputEvent, InputState};
}

/// Right-click menus.
pub mod menu {
    pub use gpui_kit::component::menu::{ContextMenuExt, PopupMenu};
}

/// Resizable pane groups (the workspace's sidebar | editor | PDF split).
pub mod resizable {
    use gpui_kit::base::{ResizablePanelGroup, ResizeHandleState};
    pub use gpui_kit::component::{ResizableState, resizable_panel};
    use gpui_kit::{ElementId, IntoElement, ParentElement, Styled, div, px};
    use spectrum_theme::SpectrumTheme;
    use std::rc::Rc;

    /// Side-by-side panes for Spectrum's floating panels: the gap between panels is the divider,
    /// so nothing is drawn at rest (the kit draws a hairline); hovering or dragging shows a pill.
    pub fn h_resizable(id: impl Into<ElementId>) -> ResizablePanelGroup {
        gpui_kit::base::h_resizable(id).with_handle_appearance(Rc::new(|handle, _, cx| {
            let theme = cx.global::<SpectrumTheme>();
            let (length, colour) = match handle.state() {
                ResizeHandleState::Idle => return Some(div().into_any_element()),
                ResizeHandleState::Hovered => (28., theme.text_tertiary.opacity(0.6)),
                _ => (44., theme.accent),
            };
            Some(
                div()
                    .flex_none()
                    .w(px(1.))
                    .h_full()
                    .flex()
                    .items_center()
                    .child(
                        div()
                            .flex_none()
                            .ml(px(-1.))
                            .w(px(3.))
                            .h(px(length))
                            .rounded_full()
                            .bg(colour),
                    )
                    .into_any_element(),
            )
        }))
    }
}

/// The window title bar: drags the window, leaves room for the traffic lights on macOS and draws
/// the caption buttons on Windows.
pub use gpui_kit::component::TitleBar;

use gpui_kit::{Action, Hsla, IntoElement, KeyContext, Keystroke, Styled, Window, px, svg};

/// An icon at `size` px in `colour`.
pub fn icon(name: IconName, size: f32, colour: Hsla) -> impl IntoElement {
    svg()
        .path(name.path())
        .flex_none()
        .size(px(size))
        .text_color(colour)
}

pub(crate) fn alpha(colour: Hsla, a: f32) -> Hsla {
    Hsla { a, ..colour }
}

/// The key binding of `action` as the platform writes it (`⇧⌘P`, `Ctrl+Shift+P`): the first
/// binding in one of `contexts` (key contexts, most specific first), else one that applies where
/// focus is now.
pub fn shortcut_label(action: &dyn Action, contexts: &[&str], window: &Window) -> Option<String> {
    let binding = contexts
        .iter()
        .filter_map(|c| KeyContext::parse(c).ok())
        .find_map(|c| window.highest_precedence_binding_for_action_in_context(action, c))
        .or_else(|| window.highest_precedence_binding_for_action(action))?;
    let stroke = binding.keystrokes().first()?;
    Some(format_keystroke(&Keystroke {
        modifiers: *stroke.modifiers(),
        key: stroke.key().into(),
        key_char: None,
    }))
}

fn format_keystroke(key: &Keystroke) -> String {
    gpui_kit::component::kbd::Kbd::format(key)
}

/// Window options' title bar for Spectrum's own drawn bar: transparent, traffic lights centred in
/// its 36 px height (the mockup's `.mockup-titlebar`).
pub fn titlebar_options(title: &str) -> gpui_kit::TitlebarOptions {
    gpui_kit::TitlebarOptions {
        title: Some(title.to_owned().into()),
        appears_transparent: true,
        traffic_light_position: Some(gpui_kit::point(px(12.), px(11.))),
    }
}

/// Height of [`TitleBar`] as Spectrum draws it.
pub const TITLE_BAR_HEIGHT: f32 = 36.;
