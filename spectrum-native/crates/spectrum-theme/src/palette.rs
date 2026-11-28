//! The 12 Spectrum areas, from 2.8's `apps/frontend/src/app/palette.json`.

/// One area of the Spectrum colour wheel, in chapter order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AreaHue {
    Projects,
    Writing,
    Assistant,
    References,
    Composer,
    Circuits,
    Structures,
    Vectors,
    Flow,
    Plots,
    Forms,
    Symbols,
}

/// An area's colours as `0xRRGGBB`: `light` and `dark` are text-safe on each theme's panel,
/// `band` is the saturated swatch used for bands and chips.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AreaColours {
    pub key: &'static str,
    pub name: &'static str,
    /// Position on the wheel in degrees; `None` for the neutral Symbols area.
    pub hue: Option<u16>,
    pub light: u32,
    pub band: u32,
    pub dark: u32,
}

impl AreaHue {
    pub const ALL: [AreaHue; 12] = [
        AreaHue::Projects,
        AreaHue::Writing,
        AreaHue::Assistant,
        AreaHue::References,
        AreaHue::Composer,
        AreaHue::Circuits,
        AreaHue::Structures,
        AreaHue::Vectors,
        AreaHue::Flow,
        AreaHue::Plots,
        AreaHue::Forms,
        AreaHue::Symbols,
    ];

    pub const fn colours(self) -> AreaColours {
        const fn c(
            key: &'static str,
            name: &'static str,
            hue: Option<u16>,
            light: u32,
            band: u32,
            dark: u32,
        ) -> AreaColours {
            AreaColours {
                key,
                name,
                hue,
                light,
                band,
                dark,
            }
        }
        match self {
            AreaHue::Projects => c(
                "projects",
                "Projects",
                Some(15),
                0xd2_3855,
                0xd2_3855,
                0xff_8893,
            ),
            AreaHue::Writing => c(
                "writing",
                "Editor",
                Some(45),
                0xc4_5001,
                0xc4_5001,
                0xfe_8f5b,
            ),
            AreaHue::Assistant => c(
                "assistant",
                "Assistant",
                Some(75),
                0x9e_6a04,
                0xfc_ab05,
                0xe8_a127,
            ),
            AreaHue::References => c(
                "references",
                "References",
                Some(105),
                0x7f_7703,
                0xd5_c918,
                0xc0_b529,
            ),
            AreaHue::Composer => c(
                "composer",
                "Composer",
                Some(135),
                0x43_8303,
                0x43_8303,
                0x86_c660,
            ),
            AreaHue::Circuits => c(
                "circuits",
                "Circuits",
                Some(165),
                0x03_845f,
                0x03_845f,
                0x2c_ce99,
            ),
            AreaHue::Structures => c(
                "structures",
                "Structures",
                Some(195),
                0x0a_8282,
                0x0a_8282,
                0x10_caca,
            ),
            AreaHue::Vectors => c(
                "vectors",
                "Vectors",
                Some(225),
                0x06_7fa1,
                0x06_7fa1,
                0x00_c3f5,
            ),
            AreaHue::Flow => c("flow", "Flow", Some(255), 0x00_73df, 0x00_73df, 0x7a_b4fe),
            AreaHue::Plots => c("plots", "Plots", Some(285), 0x73_61e4, 0x73_61e4, 0xa9_a5ff),
            AreaHue::Forms => c("forms", "Forms", Some(315), 0xa3_4ec6, 0xa3_4ec6, 0xd5_92f2),
            AreaHue::Symbols => c("symbols", "Symbols", None, 0x6e_6e73, 0x6e_6e73, 0xa1_a1a6),
        }
    }
}

/// The 6-hue prism of the logo and the Compile button, left to right.
pub const PRISM: [u32; 6] = [
    0xf0_5747, 0xf1_a33c, 0xf8_d84a, 0x6c_db6c, 0x3b_82f7, 0xb2_60eb,
];

/// Nesting colours of the editor's scope gutter bars, `(light, dark)`, outermost first.
pub const SCOPE_BARS: [(u32, u32); 6] = [
    (0xd2_3855, 0xff_7b86),
    (0xc4_6d01, 0xf5_b82e),
    (0x2f_9e44, 0x52_d67a),
    (0x06_7fa1, 0x22_c3f5),
    (0x00_73df, 0x62_a8ff),
    (0x89_4ec6, 0xc0_84fc),
];

/// The editor toolbar's buttons, left to right: warm for authoring, cool for inspection and AI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ToolbarSlot {
    Insert,
    Figure,
    Table,
    Diagram,
    Jyutping,
    Insights,
    Grammar,
    Tools,
    Assistant,
    Agent,
}

impl ToolbarSlot {
    /// `(light, dark)` as `0xRRGGBB`.
    pub const fn colours(self) -> (u32, u32) {
        match self {
            ToolbarSlot::Insert => (0xe5_484d, 0xff_6369),
            ToolbarSlot::Figure => (0xd9_5f02, 0xfe_8f5b),
            ToolbarSlot::Table => (0xb8_7a00, 0xf5_b82e),
            ToolbarSlot::Diagram => (0x2f_9e44, 0x52_d67a),
            ToolbarSlot::Jyutping => (0x0a_8a7a, 0x2c_ce99),
            ToolbarSlot::Insights => (0x06_7fa1, 0x22_c3f5),
            ToolbarSlot::Grammar => (0x00_73df, 0x62_a8ff),
            ToolbarSlot::Tools => (0x58_56d6, 0x8b_89ff),
            ToolbarSlot::Assistant => (0x89_4ec6, 0xc0_84fc),
            ToolbarSlot::Agent => (0xc0_398f, 0xf4_72b6),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AreaHue;

    fn hex(v: &serde_json::Value) -> u32 {
        let s = v.as_str().unwrap().trim_start_matches('#');
        u32::from_str_radix(s, 16).unwrap()
    }

    /// The table must match 2.8's palette.json exactly, so both apps draw the same areas.
    #[test]
    fn matches_palette_json() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../apps/frontend/src/app/palette.json"
        );
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let map = json.as_object().unwrap();
        assert_eq!(map.len(), AreaHue::ALL.len());
        for (i, area) in AreaHue::ALL.into_iter().enumerate() {
            let c = area.colours();
            let entry = &map[c.key];
            assert_eq!(
                entry["chapter"].as_u64().unwrap(),
                i as u64 + 1,
                "{}",
                c.key
            );
            assert_eq!(entry["name"], c.name);
            assert_eq!(entry["hue"].as_u64(), c.hue.map(u64::from), "{}", c.key);
            assert_eq!(hex(&entry["light"]), c.light, "{}", c.key);
            assert_eq!(hex(&entry["band"]), c.band, "{}", c.key);
            assert_eq!(hex(&entry["dark"]), c.dark, "{}", c.key);
        }
    }
}
