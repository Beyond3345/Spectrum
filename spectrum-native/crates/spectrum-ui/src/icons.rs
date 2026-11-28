//! Spectrum's 92 line icons (`assets/icons/ui` and `assets/icons/brands`: 24×24, 1.8 px stroke,
//! `currentColor`) and the asset source that serves them beside the kit's Lucide set. GPUI draws an
//! SVG as a mask, so every icon takes its colour from `text_color`.

use gpui_kit::{AssetSource, IntoElement, Result, SharedString, Styled, px, svg};
use std::borrow::Cow;

use crate::IconName;

/// The line icons. rust-embed reads the folder at run time in debug builds and embeds it in
/// release builds.
#[derive(rust_embed::RustEmbed)]
#[folder = "../../assets/icons/"]
#[prefix = "icons/"]
#[include = "ui/*.svg"]
#[include = "brands/*.svg"]
struct LineIcons;

macro_rules! line_icons {
    ($($dir:ident { $($variant:ident = $file:literal,)* })*) => {
        /// One of the blueprint's 92 line icons, one variant per file.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub enum SpectrumIcon {
            $($($variant,)*)*
        }

        impl SpectrumIcon {
            pub const ALL: &[Self] = &[$($(Self::$variant,)*)*];

            /// The file inside `assets/icons/`, e.g. `ui/folder.svg`.
            pub fn file(self) -> &'static str {
                match self {
                    $($(Self::$variant => concat!(stringify!($dir), "/", $file, ".svg"),)*)*
                }
            }
        }
    };
}

line_icons! {
    ui {
        Agent = "agent",
        AllProjects = "all-projects",
        Appearance = "appearance",
        Archive = "archive",
        Assistant = "assistant",
        Checkpoint = "checkpoint",
        Cite = "cite",
        Compile = "compile",
        ComposerCircuits = "composer-circuits",
        ComposerFlow = "composer-flow",
        ComposerForms = "composer-forms",
        ComposerMermaid = "composer-mermaid",
        ComposerPlots = "composer-plots",
        ComposerStructures = "composer-structures",
        ComposerSymbols = "composer-symbols",
        ComposerTikzcd = "composer-tikzcd",
        ComposerVectors = "composer-vectors",
        Diagram = "diagram",
        Download = "download",
        Editor = "editor",
        Engines = "engines",
        Figure = "figure",
        FileBib = "file-bib",
        FileDiagram = "file-diagram",
        FileImage = "file-image",
        FileText = "file-text",
        FolderOpen = "folder-open",
        Folder = "folder",
        Github = "github",
        Grammar = "grammar",
        Home = "home",
        Insert = "insert",
        Insights = "insights",
        Jyutping = "jyutping",
        LayoutEditor = "layout-editor",
        LayoutPdf = "layout-pdf",
        LayoutSplit = "layout-split",
        Logs = "logs",
        Models = "models",
        Outline = "outline",
        PdfFit = "pdf-fit",
        PdfNote = "pdf-note",
        PdfOutline = "pdf-outline",
        PdfPresent = "pdf-present",
        PdfZoomIn = "pdf-zoom-in",
        PdfZoomOut = "pdf-zoom-out",
        Personas = "personas",
        Providers = "providers",
        Research = "research",
        Review = "review",
        Search = "search",
        Settings = "settings",
        Shortcuts = "shortcuts",
        Sidebar = "sidebar",
        Skills = "skills",
        Snippets = "snippets",
        System = "system",
        Table = "table",
        Todo = "todo",
        ToolAnnotate = "tool-annotate",
        ToolGrid = "tool-grid",
        ToolWire = "tool-wire",
        Tools = "tools",
        Zotero = "zotero",
    }
    brands {
        AgentAntigravity = "agent-antigravity",
        AgentClaudeCode = "agent-claude-code",
        AgentCodex = "agent-codex",
        AgentCopilot = "agent-copilot",
        AgentCursor = "agent-cursor",
        AgentDeepseekHarness = "agent-deepseek-harness",
        AgentGeminiCli = "agent-gemini-cli",
        AgentKimiCode = "agent-kimi-code",
        AgentOpencode = "agent-opencode",
        AgentPi = "agent-pi",
        AgentSpectrum = "agent-spectrum",
        AgentZcode = "agent-zcode",
        Anthropic = "anthropic",
        Custom = "custom",
        Deepseek = "deepseek",
        EngineLatex = "engine-latex",
        EngineMarkdown = "engine-markdown",
        EngineTypst = "engine-typst",
        Gemini = "gemini",
        Glm = "glm",
        Mcp = "mcp",
        Meta = "meta",
        Moonshot = "moonshot",
        OllamaCloud = "ollama-cloud",
        Ollama = "ollama",
        Openai = "openai",
        Openrouter = "openrouter",
        Qwen = "qwen",
    }
}

/// Under the kit's own `icons/` (Lucide sits at `icons/<name>.svg`), so other crates can name
/// a line icon by path: `icons/ui/pdf-fit.svg`.
const PREFIX: &str = "icons/";

impl SpectrumIcon {
    /// The asset path [`Assets`] serves it at, e.g. `icons/ui/folder.svg`.
    pub fn path(self) -> SharedString {
        format!("{PREFIX}{}", self.file()).into()
    }
}

/// An icon from either set: a line icon, or the kit's Lucide icon where none of the 92 fits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Icon {
    Line(SpectrumIcon),
    Lucide(IconName),
}

impl Icon {
    pub fn path(self) -> SharedString {
        match self {
            Self::Line(i) => i.path(),
            Self::Lucide(i) => i.path(),
        }
    }
}

impl From<SpectrumIcon> for Icon {
    fn from(icon: SpectrumIcon) -> Self {
        Self::Line(icon)
    }
}

impl From<IconName> for Icon {
    fn from(icon: IconName) -> Self {
        Self::Lucide(icon)
    }
}

/// An icon at `size` px in `colour`.
pub fn icon(name: impl Into<Icon>, size: f32, colour: gpui_kit::Hsla) -> impl IntoElement {
    svg()
        .path(name.into().path())
        .flex_none()
        .size(px(size))
        .text_color(colour)
}

/// The app's assets: the line icons at `icons/ui/` and `icons/brands/`, then every Lucide icon.
#[derive(Debug, Clone, Copy, Default)]
pub struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        if path.starts_with(PREFIX)
            && let Some(file) = LineIcons::get(path)
        {
            return Ok(Some(file.data));
        }
        gpui_kit::assets::AllAssets.load(path)
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        let mut paths = gpui_kit::assets::AllAssets.list(path)?;
        paths.extend(
            LineIcons::iter()
                .filter(|name| name.starts_with(path))
                .map(|name| SharedString::from(name.into_owned())),
        );
        Ok(paths)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn one_variant_per_svg_in_the_folder() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../assets/icons");
        let mut on_disk = BTreeSet::new();
        for dir in ["ui", "brands"] {
            for entry in std::fs::read_dir(root.join(dir)).unwrap() {
                let name = entry.unwrap().file_name().to_string_lossy().into_owned();
                if std::path::Path::new(&name)
                    .extension()
                    .is_some_and(|e| e == "svg")
                {
                    on_disk.insert(format!("{dir}/{name}"));
                }
            }
        }
        let named: BTreeSet<String> = SpectrumIcon::ALL
            .iter()
            .map(|i| i.file().to_owned())
            .collect();
        assert_eq!(named.len(), SpectrumIcon::ALL.len(), "a file named twice");
        assert_eq!(named, on_disk);
        assert_eq!(named.len(), 92);
    }

    #[test]
    fn every_icon_loads_and_lucide_still_does() {
        for i in SpectrumIcon::ALL {
            let bytes = Assets.load(&i.path()).unwrap().unwrap();
            assert!(bytes.starts_with(b"<svg"), "{}", i.file());
        }
        assert!(
            Assets
                .load(&IconName::ChevronRight.path())
                .unwrap()
                .is_some()
        );
        assert_eq!(
            Assets.list("icons/brands/").unwrap().len(),
            28,
            "brand marks"
        );
    }
}
