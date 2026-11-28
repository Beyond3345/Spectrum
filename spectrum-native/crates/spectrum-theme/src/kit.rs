//! Pushes Spectrum's tokens into the component kit's theme, so kit widgets (buttons, inputs,
//! lists, popovers) draw in Spectrum's colours and radii instead of the kit's defaults.

use crate::{RADIUS_CARD, RADIUS_CONTROL, SpectrumTheme};
use gpui_kit::component::{Theme, ThemeMode, ThemeRegistry};
use gpui_kit::{App, px, white};

/// The plan's `--font-ui` and `--font-mono`, named as the platform knows them. Naming them up
/// front stops the kit enumerating every installed font (about 120 ms at startup) to find a
/// fallback for its defaults.
#[cfg(target_os = "macos")]
const FONTS: (&str, &str) = (".AppleSystemUIFont", "SF Mono");
#[cfg(not(target_os = "macos"))]
const FONTS: (&str, &str) = ("Segoe UI", "Consolas");

/// Initialises the component kit with Spectrum's fonts already set. Call instead of
/// `gpui_kit::init`, before [`SpectrumTheme::apply`].
pub fn init(cx: &mut App) {
    let mut theme = Theme::default();
    theme.font_family = FONTS.0.into();
    theme.mono_font_family = FONTS.1.into();
    cx.set_global(theme);
    gpui_kit::init(cx);
    // a theme installed before init has no registered light and dark configs; take the kit's
    let registry = ThemeRegistry::global(cx);
    let (light, dark) = (
        registry.default_light_theme().clone(),
        registry.default_dark_theme().clone(),
    );
    Theme::update(cx, |k| {
        k.light_theme = light;
        k.dark_theme = dark;
    });
}

pub(crate) fn sync(theme: &SpectrumTheme, cx: &mut App) {
    let mode = if theme.is_dark() {
        ThemeMode::Dark
    } else {
        ThemeMode::Light
    };
    // change() loads the kit's base theme for the mode; the colours go in a second update,
    // as Theme::update's docs ask
    Theme::change(mode, None, cx);
    let c = **theme;
    Theme::update(cx, |k| {
        // the plan's body text is 14 px (its `body { font: 14px … }`); the kit defaults to 16
        k.font_size = px(14.);
        k.radius = px(RADIUS_CONTROL);
        k.radius_lg = px(RADIUS_CARD);

        k.colors.background = c.bg_panel;
        k.colors.foreground = c.text;
        k.colors.border = c.border;
        k.colors.input = c.border_strong;
        k.colors.ring = c.accent;
        k.colors.caret = c.accent;
        k.colors.selection = c.accent_soft;
        k.colors.overlay = c.bg_selected;
        k.colors.window_border = c.border_strong;

        k.colors.muted = c.bg_subtle;
        k.colors.muted_foreground = c.text_secondary;
        k.colors.accent = c.bg_hover;
        k.colors.accent_foreground = c.text;
        k.colors.secondary = c.bg_subtle;
        k.colors.secondary_hover = c.bg_hover;
        k.colors.secondary_active = c.bg_selected;
        k.colors.secondary_foreground = c.text;
        k.colors.primary = c.accent;
        k.colors.primary_hover = c.accent.opacity(0.9);
        k.colors.primary_active = c.accent.opacity(0.8);
        k.colors.primary_foreground = if theme.is_dark() {
            c.bg_canvas
        } else {
            white()
        };

        k.colors.popover = c.bg_panel;
        k.colors.popover_foreground = c.text;
        k.colors.list = c.bg_panel;
        k.colors.list_hover = c.bg_hover;
        k.colors.list_active = c.accent_soft;
        k.colors.list_active_border = c.accent;
        k.colors.list_even = c.bg_panel;
        k.colors.list_head = c.bg_subtle;
        k.colors.table = c.bg_panel;
        k.colors.table_hover = c.bg_hover;
        k.colors.table_active = c.accent_soft;
        k.colors.table_active_border = c.accent;
        k.colors.table_even = c.bg_panel;
        k.colors.table_head = c.bg_subtle;
        k.colors.table_head_foreground = c.text_secondary;
        k.colors.table_row_border = c.border;

        k.colors.sidebar = c.bg_app;
        k.colors.sidebar_foreground = c.text;
        k.colors.sidebar_border = c.border;
        k.colors.sidebar_accent = c.bg_selected;
        k.colors.sidebar_accent_foreground = c.text;
        k.colors.sidebar_primary = c.accent;
        k.colors.sidebar_primary_foreground = white();
        k.colors.title_bar = c.bg_app;
        k.colors.title_bar_border = c.border;
        k.colors.status_bar = c.bg_app;
        k.colors.status_bar_border = c.border;
        k.colors.tab_bar = c.bg_subtle;
        k.colors.tab_bar_segmented = c.bg_subtle;
        k.colors.tab = c.bg_subtle;
        k.colors.tab_active = c.bg_panel;
        k.colors.tab_foreground = c.text_secondary;
        k.colors.tab_active_foreground = c.text;

        k.colors.link = c.accent;
        k.colors.link_hover = c.accent.opacity(0.85);
        k.colors.link_active = c.accent;
        k.colors.danger = c.red;
        k.colors.danger_hover = c.red.opacity(0.9);
        k.colors.danger_active = c.red.opacity(0.8);
        k.colors.success = c.green;
        k.colors.success_hover = c.green.opacity(0.9);
        k.colors.success_active = c.green.opacity(0.8);
        k.colors.warning = c.amber;
        k.colors.warning_hover = c.amber.opacity(0.9);
        k.colors.warning_active = c.amber.opacity(0.8);
        k.colors.info = c.teal;
        k.colors.info_hover = c.teal.opacity(0.9);
        k.colors.info_active = c.teal.opacity(0.8);
        k.colors.progress_bar = c.accent;
        k.colors.switch = c.border_strong;
        k.colors.slider_bar = c.accent;
        k.colors.skeleton = c.bg_subtle;
        k.colors.scrollbar_thumb = c.text_tertiary.opacity(0.5);
        k.colors.scrollbar_thumb_hover = c.text_tertiary;
        k.colors.drag_border = c.accent;
        k.colors.drop_target = c.accent_soft;
    });
}
