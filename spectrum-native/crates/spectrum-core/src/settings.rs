//! `AppSettings` (2.8's `settings.ts`) in `DATA_DIR/settings.json`, and `ProjectSettings` in
//! `<project>/.spectrum/settings.json`. A field of the wrong type falls back to its default, a field this
//! version doesn't know survives a save, and a file that exists but can't be parsed is never overwritten.

mod choices;
mod project;

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use choices::*;
pub use project::{
    ProjectSettings, project_settings_file, read_project_settings, update_project_settings,
};

use crate::{CoreError, json};

/// The colours an editor theme sets, each changeable on its own: the keys of [`EditorColours`] maps.
pub const EDITOR_COLOUR_ROLES: [&str; 12] = [
    "bg",
    "fg",
    "gutter",
    "activeLine",
    "selection",
    "cursor",
    "command",
    "comment",
    "bracket",
    "math",
    "arg",
    "env",
];

/// Colours changed from the chosen editor theme, per mode: role → `#rrggbb[aa]`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct EditorColours {
    pub light: BTreeMap<String, String>,
    pub dark: BTreeMap<String, String>,
}

/// What a project compiles with until it makes its own choice.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)]
pub struct CompileDefaults {
    pub engine: CompileEngine,
    /// Seconds after the last edit, 0 = off, 0.3 = as you type.
    pub auto_compile: f64,
    pub halt_on_error: bool,
    pub bib_tool: BibTool,
    pub draft: bool,
    pub syntax_check: bool,
    pub precompile: bool,
    /// '' is the built-in Typst.
    pub typst_version: String,
    pub markdown_engine: MarkdownEngine,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for CompileDefaults {
    fn default() -> Self {
        Self {
            engine: CompileEngine::Auto,
            auto_compile: 0.0,
            halt_on_error: false,
            bib_tool: BibTool::Auto,
            draft: false,
            syntax_check: true,
            precompile: true,
            typst_version: String::new(),
            markdown_engine: MarkdownEngine::Latex,
            extra: BTreeMap::new(),
        }
    }
}

/// The compile's output shown in the PDF's place while it runs, by engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[allow(clippy::struct_excessive_bools)]
pub struct LiveOutput {
    pub tectonic: bool,
    pub pdflatex: bool,
    pub xelatex: bool,
    pub lualatex: bool,
    pub latexmk: bool,
    pub markdown: bool,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for LiveOutput {
    fn default() -> Self {
        // Tectonic's first compiles download for minutes; the others are quick enough without
        Self {
            tectonic: true,
            pdflatex: false,
            xelatex: false,
            lualatex: false,
            latexmk: false,
            markdown: false,
            extra: BTreeMap::new(),
        }
    }
}

/// A provider's key, endpoint and model, kept when switching between providers.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SavedProvider {
    pub key: String,
    pub endpoint: String,
    pub model: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

/// A document parser's endpoint ('' = the preset's own) and key.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SavedParser {
    pub endpoint: String,
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

/// The app's settings, field for field as 2.8's `settings.ts` names them. API keys are `spectrum-key:` references
/// into the keystore, never the keys. `snippets`, `personas`, `project_folders` and `composer_diagrams` stay
/// JSON (`null` until set) for the crates that own them to read.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)]
pub struct AppSettings {
    pub theme: Theme,
    pub accent: Accent,
    pub colour_style: ColourStyle,
    pub logos: Logos,
    pub accent_custom: String,
    pub glass: bool,
    /// 0 = least see-through, 100 = clearest.
    pub glass_clarity: f64,
    pub pdf_page_light: PdfPageLight,
    pub pdf_page_dark: PdfPageDark,
    pub editor_font: String,
    pub editor_font_custom: String,
    pub editor_theme_light: String,
    pub editor_theme_dark: String,
    pub editor_colours: EditorColours,
    pub parser: String,
    pub parser_saved: BTreeMap<String, SavedParser>,
    pub parser_protocol: String,
    // the main model
    pub llm_provider: String,
    pub provider_saved: BTreeMap<String, SavedProvider>,
    pub llm_endpoint: String,
    pub llm_api_key: String,
    pub llm_model: String,
    pub reasoning_effort: ReasoningEffort,
    pub model_prices: BTreeMap<String, Value>,
    pub auto_prices: bool,
    pub hidden_models: BTreeMap<String, Vec<String>>,
    // the search model
    pub search_endpoint: String,
    pub search_api_key: String,
    pub search_model: String,
    // the vision model ('' provider = the main model's)
    pub vision_provider: String,
    pub vision_endpoint: String,
    pub vision_api_key: String,
    pub vision_model: String,
    // the quick model (autocomplete, pasted references), named for its first use
    pub references_provider: String,
    pub references_endpoint: String,
    pub references_api_key: String,
    pub references_model: String,
    pub auto_insert_cite: bool,
    pub continue_lists: bool,
    pub todo_placement: TodoPlacement,
    pub close_maths: bool,
    pub math_preview: bool,
    #[serde(skip_serializing_if = "Value::is_null")]
    pub snippets: Value,
    pub zotero_completion: bool,
    pub compile_defaults: CompileDefaults,
    pub tex_folder: String,
    pub xjyutping_folder: String,
    pub open_logs_on_fail: bool,
    pub underline_box_warnings: bool,
    pub live_output: LiveOutput,
    pub checkpoint_on_compile: bool,
    pub checkpoint_notice: bool,
    pub checkpoint_every_apply: bool,
    pub compile_after_apply: bool,
    pub offer_fix_after_apply: bool,
    pub pdf_follows_file: bool,
    pub editor_font_size: f64,
    pub editor_keymap: EditorKeymap,
    pub update_check: bool,
    /// '' = the default ([`crate::AppPaths::projects_dir`]).
    pub projects_dir: String,
    pub search_provider: SearchProvider,
    pub search_provider_key: String,
    pub search_provider_keys: BTreeMap<String, String>,
    pub search_connections: Vec<String>,
    pub serp_engine: SerpEngine,
    pub openalex_email: String,
    pub ncbi_key: String,
    pub unpaywall_email: String,
    /// Shortcut id → key, only for those changed ('' = removed).
    pub shortcuts: BTreeMap<String, String>,
    pub spell_check: bool,
    /// BCP 47 tags; the first is the fallback.
    pub languages: Vec<String>,
    pub english_grammar: EnglishGrammar,
    pub grammar_style: bool,
    pub oxford_comma: OxfordComma,
    pub sync_double_click: bool,
    pub sync_highlight_colour: SyncHighlight,
    pub sync_highlight_custom: String,
    /// 1 to 10.
    pub sync_highlight_seconds: u32,
    pub sync_settings: bool,
    #[serde(skip_serializing_if = "Value::is_null")]
    pub project_folders: Value,
    pub open_on: OpenOn,
    pub switcher_opens_at: SwitcherOpensAt,
    /// Tag → one of blue, green, orange, red, yellow, purple, teal.
    pub tag_colours: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Value::is_null")]
    pub personas: Value,
    pub default_instructions: String,
    pub composer_mix_sets: bool,
    pub composer_styles_off: Vec<String>,
    pub composer_moments: ComposerMoments,
    pub composer_mohr_shear: MohrShear,
    pub composer_vector_notation: VectorNotation,
    pub composer_si_units: bool,
    pub composer_grid: ComposerGrid,
    pub composer_grid_every: u32,
    pub composer_dark: bool,
    pub composer_minimap: bool,
    #[serde(skip_serializing_if = "Value::is_null")]
    pub composer_diagrams: Value,
    pub composer_recent: Vec<String>,
    /// Fields this version doesn't know (a newer Spectrum's, or an older one's), kept through every save.
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let s = String::new;
        Self {
            theme: Theme::System,
            accent: Accent::System,
            colour_style: ColourStyle::Spectrum,
            logos: Logos::Line,
            accent_custom: "#0a84ff".into(),
            glass: false,
            glass_clarity: 50.0,
            pdf_page_light: PdfPageLight::White,
            pdf_page_dark: PdfPageDark::Dark,
            editor_font: "system".into(),
            editor_font_custom: s(),
            editor_theme_light: "spectrum-light".into(),
            editor_theme_dark: "spectrum-dark".into(),
            editor_colours: EditorColours::default(),
            parser: "mineru".into(),
            parser_saved: BTreeMap::new(),
            parser_protocol: "mineru".into(),
            llm_provider: s(),
            provider_saved: BTreeMap::new(),
            llm_endpoint: "https://api.openai.com/v1/chat/completions".into(),
            llm_api_key: s(),
            llm_model: "gpt-6-sol".into(),
            reasoning_effort: ReasoningEffort::Default,
            model_prices: BTreeMap::new(),
            auto_prices: true,
            hidden_models: BTreeMap::new(),
            search_endpoint: s(),
            search_api_key: s(),
            search_model: s(),
            vision_provider: s(),
            vision_endpoint: s(),
            vision_api_key: s(),
            vision_model: s(),
            references_provider: s(),
            references_endpoint: s(),
            references_api_key: s(),
            references_model: "gpt-6-luna".into(),
            auto_insert_cite: true,
            continue_lists: true,
            todo_placement: TodoPlacement::Added,
            close_maths: true,
            math_preview: true,
            snippets: Value::Null,
            zotero_completion: true,
            compile_defaults: CompileDefaults::default(),
            tex_folder: s(),
            xjyutping_folder: s(),
            open_logs_on_fail: false,
            underline_box_warnings: false,
            live_output: LiveOutput::default(),
            checkpoint_on_compile: true,
            checkpoint_notice: true,
            checkpoint_every_apply: false,
            compile_after_apply: true,
            offer_fix_after_apply: true,
            pdf_follows_file: true,
            editor_font_size: 13.0,
            editor_keymap: EditorKeymap::Default,
            update_check: true,
            projects_dir: s(),
            search_provider: SearchProvider::Llm,
            search_provider_key: s(),
            search_provider_keys: BTreeMap::new(),
            search_connections: vec!["llm".into()],
            serp_engine: SerpEngine::GoogleScholar,
            openalex_email: s(),
            ncbi_key: s(),
            unpaywall_email: s(),
            shortcuts: BTreeMap::new(),
            spell_check: true,
            languages: vec!["en-AU".into()],
            english_grammar: EnglishGrammar::Harper,
            grammar_style: false,
            oxford_comma: OxfordComma::Avoid,
            sync_double_click: true,
            sync_highlight_colour: SyncHighlight::Yellow,
            sync_highlight_custom: "#ffd60a".into(),
            sync_highlight_seconds: 3,
            sync_settings: true,
            project_folders: Value::Null,
            open_on: OpenOn::Home,
            switcher_opens_at: SwitcherOpensAt::Home,
            tag_colours: BTreeMap::new(),
            personas: Value::Null,
            default_instructions: s(),
            composer_mix_sets: false,
            composer_styles_off: Vec::new(),
            composer_moments: ComposerMoments::Tension,
            composer_mohr_shear: MohrShear::Down,
            composer_vector_notation: VectorNotation::Bold,
            composer_si_units: true,
            composer_grid: ComposerGrid::MajorDots,
            composer_grid_every: 5,
            composer_dark: false,
            composer_minimap: false,
            composer_diagrams: Value::Null,
            composer_recent: Vec::new(),
            extra: BTreeMap::new(),
        }
    }
}

fn is_hex_colour(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

fn is_language_tag(tag: &str) -> bool {
    let mut parts = tag.split('-');
    let first = parts.next().unwrap_or_default();
    (2..=3).contains(&first.len())
        && first.bytes().all(|b| b.is_ascii_lowercase())
        && parts.all(|p| (2..=8).contains(&p.len()) && p.bytes().all(|b| b.is_ascii_alphanumeric()))
}

impl AppSettings {
    /// Settings from parsed JSON, field by field, then the ranges 2.8's `parse` keeps. `None` for a non-object.
    pub fn from_value(value: Value) -> Option<Self> {
        let Value::Object(map) = value else {
            return None;
        };
        let mut settings: Self = json::lenient(map);
        settings.clean();
        Some(settings)
    }

    fn clean(&mut self) {
        let d = Self::default();
        self.glass_clarity = self.glass_clarity.clamp(0.0, 100.0);
        self.sync_highlight_seconds = self.sync_highlight_seconds.clamp(1, 10);
        if !(2..=20).contains(&self.composer_grid_every) {
            self.composer_grid_every = d.composer_grid_every;
        }
        if !is_hex_colour(&self.accent_custom) {
            self.accent_custom = d.accent_custom;
        }
        if !is_hex_colour(&self.sync_highlight_custom) {
            self.sync_highlight_custom = d.sync_highlight_custom;
        }
        let mut seen = std::collections::HashSet::new();
        self.languages
            .retain(|tag| is_language_tag(tag) && seen.insert(tag.clone()));
        self.languages.truncate(20);
        if self.languages.is_empty() {
            self.languages = d.languages;
        }
        self.composer_recent.truncate(8);
    }
}

/// The app's settings from `path` (`AppPaths::settings_file`): the defaults when there is no file yet;
/// `CoreError::Unreadable` when it exists but isn't a JSON object.
pub fn load_app_settings(path: &Path) -> Result<AppSettings, CoreError> {
    let lock = json::lock_for(path);
    let _held = lock.lock();
    read_app_settings(path)
}

fn read_app_settings(path: &Path) -> Result<AppSettings, CoreError> {
    Ok(json::read_object(path)?
        .and_then(|map| AppSettings::from_value(Value::Object(map)))
        .unwrap_or_default())
}

/// Reads the settings, lets `f` change them and writes them back atomically, one update at a time per file.
/// A file that can't be read is left alone (`CoreError::Unreadable`); an unchanged one isn't rewritten.
pub fn update_app_settings(
    path: &Path,
    f: impl FnOnce(&mut AppSettings),
) -> Result<AppSettings, CoreError> {
    let lock = json::lock_for(path);
    let _held = lock.lock();
    let before = read_app_settings(path)?;
    let mut next = before.clone();
    f(&mut next);
    if next != before || !path.exists() {
        json::write_pretty(path, &next)?;
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_fields_survive_and_bad_ones_fall_back() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        let stored = json!({
            "theme": "dark",
            "glassClarity": "clear",
            "accent": "chartreuse",
            "pdfPageDark": "black",
            "cloudMode": { "kept": [1, 2] },
            "liveOutput": { "pdflatex": true, "futureEngine": true },
            "snippets": [{ "trigger": "fig" }]
        });
        std::fs::write(&file, stored.to_string()).unwrap();
        let settings = load_app_settings(&file).unwrap();
        assert_eq!(settings.theme, Theme::Dark);
        assert_eq!(settings.glass_clarity, 50.0);
        assert_eq!(settings.accent, Accent::System);
        assert_eq!(settings.pdf_page_dark, PdfPageDark::Black);
        assert!(settings.live_output.pdflatex && settings.live_output.tectonic);

        let saved = update_app_settings(&file, |s| s.glass = true).unwrap();
        assert!(saved.glass);
        let back: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(back["cloudMode"], json!({ "kept": [1, 2] }));
        assert_eq!(back["liveOutput"]["futureEngine"], json!(true));
        assert_eq!(back["snippets"], json!([{ "trigger": "fig" }]));
        assert_eq!(back["pdfPageDark"], json!("black"));
        assert!(back.get("personas").is_none());
    }

    #[test]
    fn a_broken_file_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        std::fs::write(&file, "{\"theme\": \"dark\",").unwrap();
        assert!(matches!(
            load_app_settings(&file),
            Err(CoreError::Unreadable { .. })
        ));
        assert!(matches!(
            update_app_settings(&file, |s| s.glass = true),
            Err(CoreError::Unreadable { .. })
        ));
        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "{\"theme\": \"dark\","
        );
    }

    #[test]
    fn missing_file_gives_the_2_8_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let settings = load_app_settings(&dir.path().join("none.json")).unwrap();
        assert_eq!(settings, AppSettings::default());
        assert_eq!(settings.languages, ["en-AU"]);
        assert_eq!(settings.serp_engine, SerpEngine::GoogleScholar);
    }

    #[test]
    fn ranges_are_kept() {
        let s = AppSettings::from_value(json!({
            "glassClarity": 140, "syncHighlightSeconds": 0, "composerGridEvery": 40,
            "accentCustom": "blue", "languages": ["EN", "zh-HK", "zh-HK"]
        }))
        .unwrap();
        assert_eq!(s.glass_clarity, 100.0);
        assert_eq!(s.sync_highlight_seconds, 1);
        assert_eq!(s.composer_grid_every, 5);
        assert_eq!(s.accent_custom, "#0a84ff");
        assert_eq!(s.languages, ["zh-HK"]);
    }
}
