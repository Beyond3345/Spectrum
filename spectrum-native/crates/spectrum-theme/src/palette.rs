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

/// The 6-hue prism of the logo, left to right. Brand moments only (Home header, About,
/// installer hairline, theme preview), never workspace buttons.
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

/// The Compile button's solid fill, Calm Slate Mono, `(light, dark)`.
pub const COMPILE: (u32, u32) = (0x3b_6ea5, 0x4c_7fb5);

/// The editor toolbar's buttons, left to right along the calm pastel spectrum: warm for
/// authoring, cool for inspection and AI.
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
    pub const ALL: [ToolbarSlot; 10] = [
        ToolbarSlot::Insert,
        ToolbarSlot::Figure,
        ToolbarSlot::Table,
        ToolbarSlot::Diagram,
        ToolbarSlot::Jyutping,
        ToolbarSlot::Insights,
        ToolbarSlot::Grammar,
        ToolbarSlot::Tools,
        ToolbarSlot::Assistant,
        ToolbarSlot::Agent,
    ];

    /// The plan's label for the slot.
    pub const fn name(self) -> &'static str {
        match self {
            ToolbarSlot::Insert => "Insert",
            ToolbarSlot::Figure => "Figure",
            ToolbarSlot::Table => "Table",
            ToolbarSlot::Diagram => "Diagram",
            ToolbarSlot::Jyutping => "Jyutping",
            ToolbarSlot::Insights => "Insights",
            ToolbarSlot::Grammar => "Grammar",
            ToolbarSlot::Tools => "Tools",
            ToolbarSlot::Assistant => "Assistant",
            ToolbarSlot::Agent => "Agent",
        }
    }

    /// `(light, dark)` as `0xRRGGBB`: Dusty Coral, Soft Apricot, Muted Ochre, Sage, Seafoam,
    /// Mist Cyan, Slate Blue, Periwinkle, Lavender, Muted Orchid.
    pub const fn colours(self) -> (u32, u32) {
        match self {
            ToolbarSlot::Insert => (0xb8_5d63, 0xe5_989b),
            ToolbarSlot::Figure => (0xb3_7242, 0xe6_aa7c),
            ToolbarSlot::Table => (0x9c_7d36, 0xde_c27a),
            ToolbarSlot::Diagram => (0x46_855a, 0x8c_c99e),
            ToolbarSlot::Jyutping => (0x3b_827a, 0x7e_cbc2),
            ToolbarSlot::Insights => (0x3e_7e99, 0x82_c4de),
            ToolbarSlot::Grammar => (0x47_73b5, 0x8e_b6e8),
            ToolbarSlot::Tools => (0x65_65ad, 0xa8_a6e6),
            ToolbarSlot::Assistant => (0x7e_5ca8, 0xc2_a3e6),
            ToolbarSlot::Agent => (0x9c_5885, 0xdf_a0c8),
        }
    }
}

/// The left sidebar's tabs, as in 2.8.1. The Outline is docked below them, not a tab.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SidebarTab {
    Files,
    Research,
    Todos,
}

impl SidebarTab {
    pub const ALL: [SidebarTab; 3] = [SidebarTab::Files, SidebarTab::Research, SidebarTab::Todos];

    pub const fn name(self) -> &'static str {
        match self {
            SidebarTab::Files => "Files",
            SidebarTab::Research => "Research",
            SidebarTab::Todos => "To-dos",
        }
    }

    /// `(light, dark)` as `0xRRGGBB`: Dusty Coral, Seafoam Teal, Soft Lavender.
    pub const fn colours(self) -> (u32, u32) {
        match self {
            SidebarTab::Files => (0xb8_5d63, 0xe5_989b),
            SidebarTab::Research => (0x3b_827a, 0x7e_cbc2),
            SidebarTab::Todos => (0x7e_5ca8, 0xc2_a3e6),
        }
    }
}

/// The Tools panel's tabs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ToolsTab {
    Logs,
    Review,
    Versions,
    Github,
}

impl ToolsTab {
    pub const ALL: [ToolsTab; 4] = [
        ToolsTab::Logs,
        ToolsTab::Review,
        ToolsTab::Versions,
        ToolsTab::Github,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            ToolsTab::Logs => "Logs",
            ToolsTab::Review => "Review",
            ToolsTab::Versions => "Versions",
            ToolsTab::Github => "GitHub",
        }
    }

    /// `(light, dark)` as `0xRRGGBB`: Soft Apricot, Sage, Seafoam, Periwinkle.
    pub const fn colours(self) -> (u32, u32) {
        match self {
            ToolsTab::Logs => (0xb3_7242, 0xe6_aa7c),
            ToolsTab::Review => (0x46_855a, 0x8c_c99e),
            ToolsTab::Versions => (0x3b_827a, 0x7e_cbc2),
            ToolsTab::Github => (0x65_65ad, 0xa8_a6e6),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AreaHue, COMPILE, SidebarTab, ToolbarSlot, ToolsTab};

    /// The `(light, dark)` pair of every plan tag named `name`, e.g.
    /// `1. Insert (+) · Dusty Coral (#b85d63 / #e5989b)` or `Compile · … (L #3b6ea5 / D #4c7fb5)`.
    fn plan_tags(html: &str, name: &str) -> Vec<(u32, u32)> {
        html.split("<span class=\"tag\"")
            .skip(1)
            .filter_map(|tag| {
                let text = &tag[tag.find('>')? + 1..tag.find("</span>")?];
                let (head, rest) = text.split_once(" · ")?;
                if !head.split_whitespace().any(|w| w == name) {
                    return None;
                }
                let pair = &rest[rest.rfind('(')? + 1..rest.rfind(')')?];
                let (l, d) = pair.split_once('/')?;
                let parse = |s: &str| {
                    let s = s.trim().trim_start_matches(['L', 'D', ' ', '#']);
                    u32::from_str_radix(s, 16).ok()
                };
                Some((parse(l)?, parse(d)?))
            })
            .collect()
    }

    /// Toolbar, sidebar-tab, Tools-tab and Compile colours are the plan's calm pastel values.
    #[test]
    fn calm_colours_match_the_plan() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../docs/gpui-rewrite-plan.html"
        );
        let html = std::fs::read_to_string(path).unwrap();
        let named = ToolbarSlot::ALL
            .map(|s| (s.name(), s.colours()))
            .into_iter()
            .chain(SidebarTab::ALL.map(|t| (t.name(), t.colours())))
            .chain(ToolsTab::ALL.map(|t| (t.name(), t.colours())))
            .chain([("Compile", COMPILE)]);
        for (name, colours) in named {
            let found = plan_tags(&html, name);
            assert!(!found.is_empty(), "no plan tag for {name}");
            assert!(found.iter().all(|c| *c == colours), "{name}: {found:x?}");
        }
    }

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
