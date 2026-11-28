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

pub use palette::{
    AreaColours, AreaHue, COMPILE, PRISM, SCOPE_BARS, SidebarTab, ToolbarSlot, ToolsTab,
};
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

/// An area's colours for the current theme. Full strength: for brand moments (Home, About, the
/// theme preview), not the workspace chrome, which uses [`Calm`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AreaColour {
    /// Icons and text in this area's hue (neutral in Simple style).
    pub text: Hsla,
    /// The saturated band or chip swatch.
    pub band: Hsla,
    /// The 16% tint behind an active pill.
    pub soft: Hsla,
}

/// A workspace control's calm pastel colours (the plan's writing-first palette): nothing behind it
/// at rest, a faint tint under the pointer, a 12% tint when on.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Calm {
    /// Icon colour: the plan's pastel (3:1 or better on every surface it sits on).
    pub fg: Hsla,
    /// Label colour: the pastel, deepened a quarter of the way toward `text` in the light theme so
    /// 12 px labels reach 4.5:1 (the plan's light pastels alone give 3.1–4.5).
    pub text: Hsla,
    /// Background under the pointer.
    pub hover: Hsla,
    /// Background of the on or open control (and the open file's row).
    pub active: Hsla,
}

/// The app-wide theme. Derefs to its [`Colours`], so `theme.bg_panel` reads a token.
#[derive(Debug, Clone)]
pub struct SpectrumTheme {
    pub mode: ThemeMode,
    pub style: ColourStyle,
    /// The Compile button's solid fill, Calm Slate Mono (white text on it).
    pub accent_muted: Hsla,
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

/// The plan's "12% tinted background when active"; hover sits a little under it.
const CALM_ACTIVE: f32 = 0.12;
const CALM_HOVER: f32 = 0.07;

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
            accent_muted: hex(if dark { COMPILE.1 } else { COMPILE.0 }),
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

    /// A pastel `(light, dark)` pair as calm colours; plain neutral chrome in Simple style.
    fn calm(&self, colours: (u32, u32)) -> Calm {
        match self.style {
            ColourStyle::Spectrum => {
                let fg = self.pick(colours);
                Calm {
                    fg,
                    text: if self.dark {
                        fg
                    } else {
                        fg.blend(tint(self.text, 0.25))
                    },
                    hover: tint(fg, CALM_HOVER),
                    active: tint(fg, CALM_ACTIVE),
                }
            }
            ColourStyle::Simple => Calm {
                fg: self.text_secondary,
                text: self.text_secondary,
                hover: self.bg_hover,
                active: self.bg_selected,
            },
        }
    }

    /// An editor toolbar button's pastel colours.
    pub fn toolbar(&self, slot: ToolbarSlot) -> Calm {
        self.calm(slot.colours())
    }

    /// A sidebar tab's pastel colours: its label, and the tint behind the open file's row.
    pub fn sidebar_tab(&self, tab: SidebarTab) -> Calm {
        self.calm(tab.colours())
    }

    /// A Tools panel tab's pastel colours. Error and warning badges stay `red` / `amber`.
    pub fn tools_tab(&self, tab: ToolsTab) -> Calm {
        self.calm(tab.colours())
    }

    /// The scope gutter bar for nesting `level` (cycles every six); bars keep their hue in
    /// Simple style too.
    pub fn scope_bar_color(&self, level: usize) -> Hsla {
        self.pick(SCOPE_BARS[level % SCOPE_BARS.len()])
    }

    /// The six prism stops, left to right. Brand moments only.
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
    use gpui_kit::white;

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

    /// WCAG relative luminance of an opaque colour.
    fn luminance(c: Hsla) -> f32 {
        let c = c.to_rgb();
        let lin = |v: f32| {
            if v <= 0.040_45 {
                v / 12.92
            } else {
                ((v + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }

    /// WCAG contrast of `fg` on `bg`, a tint laid over the opaque `base`.
    fn contrast(fg: Hsla, bg: Hsla, base: Hsla) -> f32 {
        let (a, b) = (luminance(fg), luminance(base.blend(bg)));
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }

    fn both() -> [SpectrumTheme; 2] {
        [ThemeMode::Light, ThemeMode::Dark]
            .map(|m| SpectrumTheme::new(m, ColourStyle::Spectrum, WindowAppearance::Light))
    }

    /// The worst contrast of `calm`'s colour on the pane bar and panel, at rest and when on.
    fn worst(theme: &SpectrumTheme, calm: Calm, fg: Hsla) -> f32 {
        let none = tint(calm.fg, 0.);
        [none, calm.hover, calm.active]
            .into_iter()
            .flat_map(|bg| [theme.bg_subtle, theme.bg_panel].map(|base| contrast(fg, bg, base)))
            .fold(f32::MAX, f32::min)
    }

    /// Toolbar and Tools-tab icons are 3:1 wherever they sit (WCAG 1.4.11).
    #[test]
    fn pastel_icons_meet_3_to_1() {
        for theme in both() {
            for slot in ToolbarSlot::ALL {
                let calm = theme.toolbar(slot);
                let ratio = worst(&theme, calm, calm.fg);
                assert!(ratio >= 3.0, "{slot:?} dark={} {ratio:.2}", theme.dark);
            }
            for tab in ToolsTab::ALL {
                let calm = theme.tools_tab(tab);
                let ratio = worst(&theme, calm, calm.fg);
                assert!(ratio >= 3.0, "{tab:?} dark={} {ratio:.2}", theme.dark);
            }
        }
    }

    /// Sidebar and Tools tab labels are text: 4.5:1 on the tab track, the chosen chip and the file tint.
    #[test]
    fn sidebar_tab_labels_meet_4_5_to_1() {
        for theme in both() {
            for tab in SidebarTab::ALL {
                let calm = theme.sidebar_tab(tab);
                let ratio = worst(&theme, calm, calm.text);
                assert!(ratio >= 4.5, "{tab:?} dark={} {ratio:.2}", theme.dark);
            }
            for tab in ToolsTab::ALL {
                let calm = theme.tools_tab(tab);
                let ratio = worst(&theme, calm, calm.text);
                assert!(ratio >= 4.5, "{tab:?} dark={} {ratio:.2}", theme.dark);
            }
        }
    }

    /// Compile's white label on Calm Slate. The plan's dark Slate `#4c7fb5` gives 4.2:1, the one
    /// label short of 4.5:1; it stays because the plan names the hex.
    #[test]
    fn compile_label_is_legible() {
        for theme in both() {
            let ratio = contrast(white(), theme.accent_muted, theme.bg_app);
            let floor = if theme.dark { 4.0 } else { 4.5 };
            assert!(ratio >= floor, "dark={} {ratio:.2}", theme.dark);
        }
    }

    /// Prints the worst contrasts (run with `--nocapture` when tuning).
    #[test]
    fn contrast_report() {
        for theme in both() {
            let icons = ToolbarSlot::ALL
                .map(|s| worst(&theme, theme.toolbar(s), theme.toolbar(s).fg))
                .into_iter()
                .fold(f32::MAX, f32::min);
            let tabs = SidebarTab::ALL
                .map(|t| worst(&theme, theme.sidebar_tab(t), theme.sidebar_tab(t).text))
                .into_iter()
                .fold(f32::MAX, f32::min);
            let compile = contrast(white(), theme.accent_muted, theme.bg_app);
            eprintln!(
                "dark={} icons {icons:.2} tabs {tabs:.2} compile {compile:.2}",
                theme.dark
            );
        }
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
        assert_eq!(
            simple.toolbar(ToolbarSlot::Insert).fg,
            simple.text_secondary
        );
        assert_eq!(
            simple.sidebar_tab(SidebarTab::Files).fg,
            simple.text_secondary
        );
        assert_eq!(simple.tools_tab(ToolsTab::Logs).fg, simple.text_secondary);
        assert_eq!(simple.scope_bar_color(2), spectrum.scope_bar_color(2));
        assert_eq!(spectrum.scope_bar_color(6), spectrum.scope_bar_color(0));
        assert_eq!(simple.accent_muted, spectrum.accent_muted);
    }
}
