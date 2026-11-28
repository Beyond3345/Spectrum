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
| spectrum-win-sandbox | Win32 bin + pure lib (the client) | — (windows-sys, serde, base64) |
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

### spectrum-win-sandbox (lib: Spectrum's side, every platform; bin `spectrum-win-sandbox.exe`: the worker)

- `spawn(worker_exe, &Request) -> Result<Session, ClientError>`: blocking; off Windows `ClientError::Unsupported`.
  `Session { control, events }`: `control.write_stdin / close_stdin / kill` (dropping it kills), `events` iterates
  `Event`s to `Exit` or `Error`, `wait() -> Output { code, reason, stdout, stderr, warnings, network_enforced }`.
- `Request::new(tier, command, cwd)` + pub `args`, `env` (the whole environment), `grants: Vec<Grant { path,
  access: Access::{Write, Read, Runtime}, include_secrets }>`, `forbidden`, `network: Network::{None, Gate { port },
  Open}`, `limits: Limits { max_processes, timeout_ms, memory_bytes }`. `validate(&Request, &protected)`: the rules.
- `Tier::AppContainer` (native programs: reads and writes only its grants; network `None` or `Open`, never this
  computer's ports, so no gate) and `Tier::RestrictedLowIntegrity` (Node agents: writes only its grants, reads them
  and what every user of the PC may read; `Gate` or `Open`; the gate is proxy variables only: `network_enforced`
  is false). Both: a job object (kill on close, process limit, no breakaway) and no window.
- The caller's part: a native `.exe` (an npm shim becomes `node.exe` + script, with `--preserve-symlinks
  --preserve-symlinks-main`); real paths (`std::fs::canonicalize`); no grant on a drive, the profile or Windows'
  folder, none overlapping; `cwd` in a grant; `TEMP`, `USERPROFILE` and the like in `env`, set to a `Write` grant.
  `Write`/`Read` grants are revoked after the run and refuse links and hardlinks; `Runtime` grants (engines, TeX
  trees) stay. Scan a workspace for links again before Spectrum reads it back: the program may have made some.
- Wire format v1 (`protocol`): JSON lines on the worker's stdin/stdout. A `Request`, then `Control::{Stdin { data:
  base64 }, CloseStdin, Kill}`; back come `Event::{Started, Stdout, Stderr, Warning, Exit { code, reason },
  Error { kind, message }}`. The worker's stdin closing is a kill.
- `paths::{normalise, within, overlaps, is_secret_name}` (Windows path rules as text; 2.8's secret names). Test
  bin `spectrum-win-sandbox-probe` (never shipped); `tests/escape.rs` runs on Windows only.

## Globals

- `SpectrumTheme` (spectrum-theme); the kit's `Theme` is driven from it, never edited directly.

## Events and actions

None yet.
