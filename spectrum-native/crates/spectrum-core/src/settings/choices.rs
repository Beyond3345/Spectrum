//! The settings that pick one of a few values, spelt as 2.8 stores them. The first variant is the default.

use serde::{Deserialize, Serialize};

macro_rules! choice {
    ($(#[$meta:meta])* $name:ident { $first:ident = $first_value:literal $(, $variant:ident = $value:literal)* $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
        pub enum $name {
            #[default]
            #[serde(rename = $first_value)]
            $first,
            $(#[serde(rename = $value)] $variant,)*
        }
    };
}

choice!(Theme { System = "system", Light = "light", Dark = "dark" });
choice!(
    /// `System` follows the macOS accent colour; `Custom` uses `accent_custom`.
    Accent {
        System = "system", Spectrum = "spectrum", Blue = "blue", Purple = "purple", Pink = "pink", Red = "red",
        Orange = "orange", Yellow = "yellow", Green = "green", Graphite = "graphite", Custom = "custom",
    }
);
choice!(
    /// Spectrum colours each area of the app; Simple is the plain look from before 2.5.
    ColourStyle { Spectrum = "spectrum", Simple = "simple" }
);
choice!(Logos { Line = "line", Full = "full" });
choice!(PdfPageLight { White = "white", Cream = "cream", Sepia = "sepia", Grey = "grey" });
choice!(PdfPageDark { Dark = "dark", Black = "black", Dimmed = "dimmed", White = "white" });
choice!(
    ReasoningEffort {
        Default = "default", None = "none", Minimal = "minimal", Low = "low", Medium = "medium", High = "high",
        Xhigh = "xhigh", Max = "max",
    }
);
choice!(TodoPlacement { Added = "added", Line = "line" });
choice!(EditorKeymap { Default = "default", Vim = "vim", Emacs = "emacs" });
choice!(
    SearchProvider {
        Llm = "llm", OpenAlex = "openalex", SemanticScholar = "semanticscholar", SerpApi = "serpapi", Exa = "exa",
        Tavily = "tavily", Brave = "brave", Ddgs = "ddgs",
    }
);
choice!(SerpEngine { GoogleScholar = "google_scholar", Google = "google", Baidu = "baidu" });
choice!(EnglishGrammar { Harper = "harper", LanguageTool = "languagetool" });
choice!(
    /// The serial comma: flag it (Australian Government style), require it, or leave it.
    OxfordComma { Avoid = "avoid", Require = "require", Off = "off" }
);
choice!(
    SyncHighlight {
        Yellow = "yellow", Accent = "accent", Green = "green", Pink = "pink", Blue = "blue", Custom = "custom",
    }
);
choice!(OpenOn { Home = "home", All = "all" });
choice!(SwitcherOpensAt { Home = "home", Folder = "folder" });
choice!(ComposerMoments { Tension = "tension", Positive = "positive" });
choice!(MohrShear { Down = "down", ClockwiseAbove = "clockwise-above", Up = "up" });
choice!(VectorNotation { Bold = "bold", Vec = "vec", Arrow = "arrow", Vv = "vv" });
choice!(
    ComposerGrid { MajorDots = "major-dots", Dots = "dots", MajorLines = "major-lines", Lines = "lines" }
);
choice!(
    CompileEngine {
        Auto = "auto", PdfLatex = "pdflatex", XeLatex = "xelatex", LuaLatex = "lualatex", Latexmk = "latexmk",
        Tectonic = "tectonic",
    }
);
choice!(BibTool { Auto = "auto", Bibtex = "bibtex", Biber = "biber" });
choice!(MarkdownEngine { Latex = "latex", Typst = "typst" });
