# Architecture ledger

What exists, so no session duplicates it. Update at the end of every session. Keep under 150 lines.

## Crate graph

| Crate | Kind | Depends on |
|-------|------|------------|
| spectrum-core | pure lib | — |
| spectrum-compile, -ai, -references, -git, -convert | pure lib | core |
| spectrum-lsp | pure lib | — (lsp-types, tokio, url) |
| spectrum-checkers | pure lib | — (harper-core, Hunspell C++ via cc, reqwest) |
| spectrum-theme | GPUI lib | — |
| spectrum-ui | GPUI lib | theme |
| spectrum-editor | GPUI lib | core, theme, ui |
| spectrum-pdf | GPUI lib | core, compile, theme, ui |
| spectrum-diagram | GPUI lib | core, compile, theme, ui, editor, pdf |
| spectrum-app (bin `spectrum`) | GPUI bin | every lib |
| spectrum-win-setup | GPUI bin | theme, ui |
| spectrum-win-sandbox | Win32 bin | — |
| spectrum-xtask | build bin | — |

## Tooling

- `cargo xtask check`: the gate (fmt, clippy `-D warnings`, test).
- `SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-app --test snapshot`: renders views offscreen to
  `target/snapshots/*.png` (Mac only). Add a case there for every new view.

## Public API

### spectrum-theme
- `init(cx)` — call instead of `gpui_kit::init`; sets fonts first (skips a 120 ms font scan).
- `SpectrumTheme::apply(ThemeMode, ColourStyle, cx)` — installs the global and syncs the kit theme.
- `SpectrumTheme` derefs to `Colours` (plan tokens: `bg_canvas`, `bg_app`, `bg_panel`, `bg_subtle`,
  `bg_hover`, `bg_selected`, `bg_code`, `bg_code_border`, `text`, `text_secondary`, `text_tertiary`,
  `border`, `border_strong`, `accent`, `accent_soft`, `red/orange/amber/green/teal/purple/magenta`
  + `_soft`, `eff_off..eff_max`). Methods: `area(AreaHue) -> AreaColour { text, band, soft }`,
  `toolbar(ToolbarSlot) -> (fg, bg)`, `scope_bar_color(level)`, `prism() -> [Hsla; 6]`,
  `syntax_comment()`, `is_dark()`.
- `AreaHue` (12, `ALL`, `colours()`), `ToolbarSlot` (10), `ThemeMode` {Light, Dark, System},
  `ColourStyle` {Spectrum, Simple}, `PRISM`, `SCOPE_BARS`, `RADIUS_PANEL/CARD/CONTROL`, `SIDEBAR_WIDTH`.

### spectrum-app (lib)
- `runtime::init()`, `runtime::spawn_tokio(fut).await -> Result<T, RuntimeError>` — every Tokio
  future from GPUI code goes through this.
- `theme_preview::ThemePreviewView` — Phase 0 window; replaced by the workspace in 1c.

### spectrum-core

- `CoreError` (thiserror), `.notice()`; `UserNotice { title, detail, action }` (shared by every crate).
- `paths`: `BUNDLE_ID`; `AppPaths { data_dir, log_dir, projects_dir }` (`system()`, `new(..)` for tests,
  `settings_file`, `registry_file`, `keys_file`, `project_cache_dir`); `default_projects_dir`;
  `detect_sync_roots`, `place_of` → `SyncPlace { provider: SyncProvider, rel }`.
- `settings`: `AppSettings` (2.8 `settings.ts` fields, camelCase, `extra` keeps unknown keys, `from_value`),
  `load_app_settings`, `update_app_settings`; `ProjectSettings`, `read_project_settings`,
  `update_project_settings`, `project_settings_file`; choice enums (`Theme`, `PdfPageLight`, …).
  Bad JSON file → `CoreError::Unreadable`, never overwritten. Writes are atomic, one lock per file.
- `project`: `ProjectMeta` (`read_meta`, `write_meta`, `meta_file`), `Registry`/`RegistryEntry`
  (`load_registry`, `update_registry`, `register`), `create_project`, `sanitise_folder_name`,
  `make_unique_folder`, `scan_tree` → `TreeEntry { rel, kind: EntryKind }`, `is_hidden_path`,
  `detect_main_file`, `conflict_copies`, `extract_zip`, `extract_arxiv`.
- `watcher`: `ProjectWatcher::new(root, debounce)` → `Receiver<FsEvent>` (`Changed`, `Removed`, `Error`).
- `keystore`: `KeyStore<S: SecretStore>` (`store_keys`, `with_keys`, `held_values`, `hold_values`),
  `SystemSecretStore::new(&AppPaths)` (Keychain / DPAPI), `key_ref`, `ref_id`.

### spectrum-compile (no spectrum-core dependency yet; paths come in as arguments)

- `parse_tex_log(log, root) -> Vec<Diagnostic>`: pdfLaTeX/XeLaTeX/LuaLaTeX/Latexmk/Tectonic logs,
  errors first. `last_pass(log) -> Vec<String>` (unwrapped lines of the last TeX pass, for Preflight).
  `project_file(file, main_file, files) -> String` (a log location as a project file).
- `parse_typst_diagnostics(log, project_root, cwd) -> Vec<Diagnostic>`: `--diagnostic-format short`
  and the default human format.
- `Diagnostic { path, line, column, severity: Severity, message, kind: DiagnosticKind, context }`;
  `DiagnosticKind`: General, BadBox, UndefinedReference, UndefinedCitation, MissingFile, Bibliography,
  Typst, App.
- `Synctex::read(path, ansi_code_page)`, `Synctex::parse(text)`, `.forward(&tags, line) -> Vec<SyncBox>`,
  `.inverse(page, x, y) -> Option<SyncHit>`, `.inputs()`, `.input(tag)`. Points from the page's top left.
- `SynctexStore::new(root, <cache>/synctex, ansi_code_page)`: `.keep(doc, built, cwd, copy)`,
  `.edit(doc, page, x, y) -> EditHit { file, line, column }`, `.view(doc, file, line) -> Vec<SyncBox>`;
  errors `SynctexError` (NotCompiled, NoSource, NotInPdf, OutsideProject, Io, Meta), Display is user copy.
- `decode_synctex(bytes, label)`, `windows_code_page_label(code_page)`.

### spectrum-checkers

- `Lint { range, message, suggestions: Vec<Fix>, fixable, source: LintSource, rule }`; `range` is a byte
  range in the source. `Fix::{Replace, Remove, InsertAfter}`. `LintSource::{Grammar, Spelling}`.
- `DocKind::{Latex, Typst, Markdown, Plain}` (`from_path`), `Dialect::{EnAu (default), EnUs, EnGb, EnCa, EnIn}`.
- `mask(source, kind) -> String` (same byte length, newlines kept), `prose_words(masked) -> Vec<Range>`.
- `SpellChecker::new(aff, dic)`: `check`, `suggest`, `add`, `add_dic`, `encoding`. Send, not Sync. The only
  `unsafe` (`hunspell_ffi.rs`); `build.rs` compiles `../native/hunspell/core`.
- `EnglishSpeller::open(dictionaries_dir, dialect)`: 2.8's dialect chains and self-tests; `check(source, kind)`
  (suggestions empty: ask `suggest(word)`), `is_correct`, `add_word`. Send, not Sync.
- `GrammarChecker::new(Some(dictionaries_dir))`: Send + Sync, allocates nothing until the first
  `check(source, kind, &GrammarOptions, own_words, &AtomicBool) -> GrammarReport { lints, parts, done, failure }`.
  Paragraph lint cache: a re-check after an edit re-lints one paragraph.
- `LanguageTool::new(server).check(..).await -> GrammarReport` (async reqwest; no server management).
- Perf: `cargo test --release -p spectrum-checkers --test perf -- --ignored --nocapture`.

### spectrum-lsp (needs a Tokio runtime; the caller finds the binaries)

- `LanguageServer::start(ServerConfig) -> (LanguageServer, UnboundedReceiver<LspEvent>)`; config from
  `ServerConfig::texlab(program, root)` / `::tinymist(..)` (pub fields `args`, `env`, `settings`,
  `request_timeout`, `restart_delay`; `with_env`). Settings: `texlab_settings(aux_dir)`, `tinymist_settings(fonts)`.
- Sync (plain fns; the handle keeps each document's text): `did_open(uri, lang, version, text)`,
  `did_change(uri, version, changes)` (UTF-16 ranges), `did_save`, `did_close`; `pin_main(path).await`.
- Requests: `completion`, `hover`, `definition`, `rename`, `document_symbol`, generic `request::<R>` and
  `notify::<N>`; a timeout or a dropped future sends `$/cancelRequest`. `capabilities()`, `kind()`, `shutdown().await`.
- `LspEvent::{Diagnostics, ShowMessage, Restarting{attempt, delay}, Restarted, Failed}`; `LspError` (thiserror).
- Crash: 3 restarts (delay doubles from 500 ms; count resets after 60 s up), documents re-opened, main re-pinned.
- `file_uri(path)`; `pub use lsp_types`. Test bin `spectrum-lsp-fake` (never shipped); `tests/real_servers.rs`
  runs TexLab/Tinymist when found (`SPECTRUM_TEXLAB`, `SPECTRUM_TINYMIST`, PATH, 2.8 binaries), else prints skipped.

### spectrum-ai (session 6a: providers only)

- `LlmClient::new()` (Clone): `.stream(LlmConfig, Request) -> EventStream` (Tokio; no GPUI executor),
  `.list_live_models(&Preset, endpoint) -> LiveModels`, `.reads_images(&LlmConfig)`. Retries busy statuses and
  dropped connections before anything is heard (`StreamEvent::Retrying`), drops rejected parameters.
- `LlmConfig { endpoint, api_key (the key itself), model, provider: Option<preset id> }`;
  `role_config(&AppSettings, ModelRole, &KeyStore)` / `role_config_refs`; `ModelRole::{Main, Fast, Vision,
  References}` (Fast and References share 2.8's `references*` quick model), `.effort(&settings)`.
- `Request { system, messages: Vec<Message>, tools: Vec<Tool>, effort: Effort, max_tokens, temperature,
  cache_key, cancel: CancellationToken }`; `Message::{User(Vec<Part>), Assistant(AssistantMessage), Tool}`;
  `Part::{Text, Image{url}}`, `Part::image(mime, bytes)`; `AssistantMessage { text, tool_calls, replay }` —
  send `replay` back unchanged on the next tool-loop turn (thinking signatures, encrypted reasoning).
- `StreamEvent::{TextDelta, ReasoningDelta, ToolCall, Usage, Retrying, Stop { reason, message }, Error}`;
  tool calls and usage come just before `Stop`. `Usage { input, output, cache_read, cache_write, cost }`,
  `StopReason::{EndTurn, ToolUse, MaxTokens, Refusal}`, `LlmError` (Display = user copy, `.notice()`).
- `LlmProvider` (one per format: `ChatCompletions`, `AnthropicMessages`, `OpenAiResponses`; `provider(Api)`)
  with `body(BodyParts)`, `parser() -> Box<dyn StreamParser>`.
- Presets: `presets()`, `preset(id)`, `preset_for_endpoint`, `Preset { models, regions, recommended, .. }`,
  `Model { levels, effort, vision }`, `EffortLevel` (7 wire levels; `colour_slot()` → eff_off..eff_max),
  `Effort::{Default, Fast, Level}` (`From<ReasoningEffort>`), `effort_for`, `ollama_model`.
- `PriceCache::new(data_dir).prices(refresh) -> PriceList` (`DATA_DIR/models-dev.json`, 6 h), `.price(model)`,
  `Price::cost(&Usage)`; `normalize_model_id`, `is_local_model`, `prices_of`.
- Tests: `tests/streams.rs` + `tests/bodies.rs` on a local server (`tests/support/server.rs`), fixtures in
  `tests/fixtures/*.sse`. No network.

## Globals

- `SpectrumTheme` (spectrum-theme); the kit's `Theme` is driven from it, never edited directly.

## Events and actions

None yet.
