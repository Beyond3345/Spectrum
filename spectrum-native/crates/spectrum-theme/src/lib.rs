//! Spectrum palette, light and dark tokens, typography.
//!
//! Colours come from the plan's design (`docs/gpui-rewrite-plan.html`). Read them through
//! `cx.global::<SpectrumTheme>()`; no other crate holds a hex value.

mod kit;
mod palette;
mod tokens;

pub use kit::init;

use gpui_kit::{App, Global, Hsla, WindowAppearance, rgb, rgba};
use std::ops::Deref;

pub use palette::{AreaColours, AreaHue, PRISM, SCOPE_BARS, SidebarTab, ToolbarSlot};
pub use tokens::{
    Colours, RADIUS_CARD, RADIUS_CONTROL, RADIUS_PANEL, SIDEBAR_WIDTH, SYNTAX_COMMENT, Tokens,
};

/// The appearance the user picked.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ThemeMode {
    Light,
    Dark,
    #[default]
    System,
}

/// Spectrum colours every area; Simple keeps the chrome neutral (scope bars and
/// error/warning colours stay).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ColourStyle {
    #[default]
    Spectrum,
    Simple,
}

/// An area's colours for the current theme.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AreaColour {
    /// Icons and text in this area's hue (neutral in Simple style).
    pub text: Hsla,
    /// The saturated band or chip swatch.
    pub band: Hsla,
    /// The 16% tint behind an active pill.
    pub soft: Hsla,
}

/// The app-wide theme. Derefs to its [`Colours`], so `theme.bg_panel` reads a token.
#[derive(Debug, Clone)]
pub struct SpectrumTheme {
    pub mode: ThemeMode,
    pub style: ColourStyle,
    dark: bool,
    colours: Colours,
}

impl Global for SpectrumTheme {}

impl Deref for SpectrumTheme {
    type Target = Colours;
    fn deref(&self) -> &Colours {
        &self.colours
    }
}

fn hex(value: u32) -> Hsla {
    rgb(value).into()
}

fn tint(colour: Hsla, alpha: f32) -> Hsla {
    Hsla { a: alpha, ..colour }
}

impl SpectrumTheme {
    /// A theme for `mode`, resolving System against `appearance`.
    pub fn new(mode: ThemeMode, style: ColourStyle, appearance: WindowAppearance) -> Self {
        let dark = match mode {
            ThemeMode::Light => false,
            ThemeMode::Dark => true,
            ThemeMode::System => {
                matches!(
                    appearance,
                    WindowAppearance::Dark | WindowAppearance::VibrantDark
                )
            }
        };
        let tokens = if dark { &Tokens::DARK } else { &Tokens::LIGHT };
        Self {
            mode,
            style,
            dark,
            colours: tokens.into(),
        }
    }

    /// Installs (or replaces) the global theme and pushes it into the component kit.
    /// Call again when the user changes appearance or the system appearance changes.
    pub fn apply(mode: ThemeMode, style: ColourStyle, cx: &mut App) {
        let theme = Self::new(mode, style, cx.window_appearance());
        kit::sync(&theme, cx);
        cx.set_global(theme);
    }

    pub fn is_dark(&self) -> bool {
        self.dark
    }

    fn pick(&self, (light, dark): (u32, u32)) -> Hsla {
        hex(if self.dark { dark } else { light })
    }

    pub fn area(&self, area: AreaHue) -> AreaColour {
        let c = area.colours();
        let hue = self.pick((c.light, c.dark));
        let text = match self.style {
            ColourStyle::Spectrum => hue,
            ColourStyle::Simple => self.text_secondary,
        };
        AreaColour {
            text,
            band: hex(c.band),
            soft: tint(hue, 0.16),
        }
    }

    /// A toolbar button's `(icon, background)`: its hue and a 14% tint of it.
    pub fn toolbar(&self, slot: ToolbarSlot) -> (Hsla, Hsla) {
        let fg = match self.style {
            ColourStyle::Spectrum => self.pick(slot.colours()),
            ColourStyle::Simple => self.text_secondary,
        };
        (fg, tint(fg, 0.14))
    }

    /// A sidebar tab's `(label, soft)`: its hue, and the 13% tint behind the active file row
    /// (the mockup's `.mk-file.on`).
    pub fn sidebar_tab(&self, tab: SidebarTab) -> (Hsla, Hsla) {
        let hue = self.pick(tab.colours());
        let fg = match self.style {
            ColourStyle::Spectrum => hue,
            ColourStyle::Simple => self.text_secondary,
        };
        (fg, tint(hue, 0.13))
    }

    /// The scope gutter bar for nesting `level` (cycles every six); bars keep their hue in
    /// Simple style too.
    pub fn scope_bar_color(&self, level: usize) -> Hsla {
        self.pick(SCOPE_BARS[level % SCOPE_BARS.len()])
    }

    /// The six prism stops, left to right.
    pub fn prism(&self) -> [Hsla; 6] {
        PRISM.map(hex)
    }

    pub fn syntax_comment(&self) -> Hsla {
        let (light, dark) = SYNTAX_COMMENT;
        rgba(if self.dark { dark } else { light }).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_follows_appearance() {
        let theme = |a| SpectrumTheme::new(ThemeMode::System, ColourStyle::Spectrum, a);
        assert!(theme(WindowAppearance::VibrantDark).is_dark());
        assert!(!theme(WindowAppearance::Light).is_dark());
        assert!(
            SpectrumTheme::new(
                ThemeMode::Dark,
                ColourStyle::Spectrum,
                WindowAppearance::Light
            )
            .is_dark()
        );
    }

    #[test]
    fn simple_style_neutralises_chrome_but_not_scope_bars() {
        let spectrum = SpectrumTheme::new(
            ThemeMode::Light,
            ColourStyle::Spectrum,
            WindowAppearance::Light,
        );
        let simple = SpectrumTheme::new(
            ThemeMode::Light,
            ColourStyle::Simple,
            WindowAppearance::Light,
        );
        assert_eq!(simple.area(AreaHue::Flow).text, simple.text_secondary);
        assert_ne!(spectrum.area(AreaHue::Flow).text, spectrum.text_secondary);
        assert_eq!(simple.toolbar(ToolbarSlot::Insert).0, simple.text_secondary);
        assert_eq!(simple.scope_bar_color(2), spectrum.scope_bar_color(2));
        assert_eq!(spectrum.scope_bar_color(6), spectrum.scope_bar_color(0));
    }
}
