//! Surface, text and accent tokens from the plan's design (`docs/gpui-rewrite-plan.html`,
//! its `:root` and `[data-theme="dark"]` variables). The plan wins over 2.8's CSS.

// colours read as CSS writes them (0xRRGGBBAA), not in clippy's groups of four
#![allow(clippy::unreadable_literal)]

use gpui_kit::{Hsla, rgba};

/// Defines the token table once: `Tokens` (raw `0xRRGGBBAA`, testable without a window),
/// `Colours` (the same names as GPUI colours), the light and dark sets, and the CSS name of each.
macro_rules! tokens {
    ($($field:ident $css:literal $light:literal $dark:literal;)*) => {
        /// Raw token values, `0xRRGGBBAA`.
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub struct Tokens { $(pub $field: u32,)* }

        /// Token values ready to paint.
        #[derive(Debug, Clone, Copy, PartialEq)]
        pub struct Colours { $(pub $field: Hsla,)* }

        impl Tokens {
            pub const LIGHT: Tokens = Tokens { $($field: $light,)* };
            pub const DARK: Tokens = Tokens { $($field: $dark,)* };
            /// `(css name, light, dark)` for every token, as the plan names them.
            pub const CSS: &[(&str, u32, u32)] = &[$(($css, $light, $dark),)*];
        }

        impl From<&Tokens> for Colours {
            fn from(t: &Tokens) -> Self {
                Colours { $($field: rgba(t.$field).into(),)* }
            }
        }
    };
}

tokens! {
    bg_canvas "bg-canvas" 0xeef0f4ff 0x0b0b0eff;
    bg_app "bg-app" 0xf7f7f8ff 0x151518ff;
    bg_panel "bg-panel" 0xffffffff 0x1d1d21ff;
    bg_subtle "bg-subtle" 0xf3f3f5ff 0x26262cff;
    bg_hover "bg-hover" 0x0000000b 0xffffff0f;
    bg_selected "bg-selected" 0x00000013 0xffffff1c;
    bg_code "bg-code" 0xf5f6faff 0x121216ff;
    bg_code_border "bg-code-border" 0x00000014 0xffffff17;
    text "text" 0x0d0d10ff 0xf2f2f7ff;
    text_secondary "text-secondary" 0x54545cff 0xa1a1aaff;
    text_tertiary "text-tertiary" 0x71717aff 0x84848eff;
    border "border" 0x00000017 0xffffff17;
    border_strong "border-strong" 0x00000029 0xffffff2e;
    accent "accent" 0x0073dfff 0x7ab4feff;
    accent_soft "accent-soft" 0x0073df1f 0x7ab4fe29;
    red "red" 0xd23855ff 0xff8893ff;
    red_soft "red-soft" 0xd238551c 0xff889329;
    orange "orange" 0xc45001ff 0xfe8f5bff;
    orange_soft "orange-soft" 0xc450011c 0xfe8f5b29;
    amber "amber" 0x9e6a04ff 0xe8a127ff;
    amber_soft "amber-soft" 0xfcab0529 0xe8a1272e;
    green "green" 0x2f9e44ff 0x3dd68cff;
    green_soft "green-soft" 0x2f9e441f 0x3dd68c29;
    teal "teal" 0x0a8282ff 0x10cacaff;
    teal_soft "teal-soft" 0x0a82821f 0x10caca29;
    purple "purple" 0x7361e4ff 0xa9a5ffff;
    purple_soft "purple-soft" 0x7361e421 0xa9a5ff2e;
    magenta "magenta" 0xa34ec6ff 0xd592f2ff;
    magenta_soft "magenta-soft" 0xa34ec621 0xd592f22e;
    eff_off "eff-off" 0x8e8e93ff 0x8e8e93ff;
    eff_low "eff-low" 0x3b82f7ff 0x3b82f7ff;
    eff_med "eff-med" 0x279442ff 0x279442ff;
    eff_high "eff-high" 0xf1a33cff 0xf1a33cff;
    eff_xhigh "eff-xhigh" 0xf05747ff 0xf05747ff;
    eff_max "eff-max" 0xb260ebff 0xb260ebff;
}

/// Comment colour: the plan doesn't give one, so 2.8's `--syntax-comment` stands.
pub const SYNTAX_COMMENT: (u32, u32) = (0x8c959fff, 0x8b949eff);

/// Radii from the plan's Section 3, in pixels.
pub const RADIUS_PANEL: f32 = 16.0;
pub const RADIUS_CARD: f32 = 12.0;
pub const RADIUS_CONTROL: f32 = 10.0;
/// The left sidebar's width (plan Section 3, "Keep Faithful").
pub const SIDEBAR_WIDTH: f32 = 268.0;

#[cfg(test)]
mod tests {
    use super::Tokens;
    use std::collections::HashMap;

    /// The `--name: value` pairs inside the first CSS block whose selector contains `selector`.
    fn css_vars(html: &str, selector: &str) -> HashMap<String, String> {
        let start = html.find(selector).unwrap();
        let open = start + html[start..].find('{').unwrap();
        let close = open + html[open..].find('}').unwrap();
        let mut block = html[open + 1..close].to_owned();
        // drop /* comments */, which sit in front of some declarations
        while let Some(start) = block.find("/*") {
            let end = start + block[start..].find("*/").unwrap() + 2;
            block.replace_range(start..end, "");
        }
        block
            .split(';')
            .filter_map(|decl| {
                let (name, value) = decl.split_once(':')?;
                let name = name.trim().strip_prefix("--")?;
                Some((name.to_owned(), value.trim().to_owned()))
            })
            .collect()
    }

    /// `#rrggbb` or `rgba(r, g, b, a)` as `0xRRGGBBAA`, rounding alpha like a browser does.
    fn parse(value: &str) -> u32 {
        if let Some(hex) = value.strip_prefix('#') {
            return (u32::from_str_radix(hex, 16).unwrap() << 8) | 0xff;
        }
        let inner = value
            .strip_prefix("rgba(")
            .unwrap()
            .strip_suffix(')')
            .unwrap();
        let parts: Vec<f64> = inner
            .split(',')
            .map(|p| p.trim().parse().unwrap())
            .collect();
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let [r, g, b, a] =
            [parts[0], parts[1], parts[2], (parts[3] * 255.0).round()].map(|v| v as u32);
        (r << 24) | (g << 16) | (b << 8) | a
    }

    /// Every token matches the plan's light and dark variables exactly.
    #[test]
    fn matches_the_plan() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../docs/gpui-rewrite-plan.html"
        );
        let html = std::fs::read_to_string(path).unwrap();
        let light = css_vars(&html, ":root {");
        let dark = css_vars(&html, "[data-theme=\"dark\"] {");
        for &(name, l, d) in Tokens::CSS {
            assert_eq!(parse(&light[name]), l, "light --{name}");
            // tokens the plan doesn't override in dark keep their light value
            let dark_value = dark.get(name).unwrap_or(&light[name]);
            assert_eq!(parse(dark_value), d, "dark --{name}");
        }
    }
}
