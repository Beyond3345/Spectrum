# Architecture ledger

What exists, so no session duplicates it. Update at the end of every session. Keep under 150 lines.

## Crate graph

| Crate | Kind | Depends on |
|-------|------|------------|
| spectrum-core | pure lib | — |
| spectrum-compile, -lsp, -ai, -references, -git, -convert | pure lib | core |
| spectrum-checkers | pure lib | — (harper-core, Hunspell C++ via cc, reqwest) |
| spectrum-theme | GPUI lib | — |
| spectrum-ui | GPUI lib | theme, core (UserNotice) |
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
  `target/snapshots/*.png` (Mac only; cases live in its `mod mac`). Add a case there for every new view.

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
- `AreaHue` (12, `ALL`, `colours()`), `ToolbarSlot` (10), `SidebarTab` (4; `theme.sidebar_tab(tab) -> (fg, 13% tint)`), `ThemeMode` {Light, Dark, System},
  `ColourStyle` {Spectrum, Simple}, `PRISM`, `SCOPE_BARS`, `RADIUS_PANEL/CARD/CONTROL`, `SIDEBAR_WIDTH`.

### spectrum-ui (the only crate besides theme that imports `gpui_kit::component`)
- `IconButton::spectrum(id, IconName, ToolbarSlot, theme)` / `::plain(id, icon, theme)`; `.active .size .tooltip .on_click`.
- `SplitButton::primary(id, label, theme)` (prism pill, white bold shadowed label; `.on_click`, `.on_menu`); `prism_bar(theme)`.
- `Segmented::new(id).item(label).icon_item(icon).selected(ix).on_select(|&ix, w, cx|)`; `sidebar_tabs(id, SidebarTab, theme)`.
- `FileRow::new(id, label, dot).active().selected().on_click()`; `panel(theme)` (16 px), `card(theme)` (12 px), `pane_bar(theme)`.
- `show_notice(window, cx, &UserNotice, Tone)` toast; `confirm(window, cx, title, message, ok, on_ok)` (red OK).
- `PaletteView::new(Vec<PaletteItem>, PaletteText, window, cx)` → `PaletteEvent::{Confirmed(ix), Dismissed}`; `.listed()`.
  `fuzzy::rank(query, items, paths) -> Vec<FuzzyMatch { index, score, ranges }>` (nucleo, byte ranges).
- `shortcut_label(action, contexts, window)`, `icon(IconName, size, colour)`, `Assets` (every Lucide icon), `IconName`,
  `TitleBar`, `titlebar_options(title)`, `TITLE_BAR_HEIGHT`; re-exports `input::{Input, InputState, InputEvent}`,
  `menu::{ContextMenuExt, PopupMenu}`, `resizable::{h_resizable (no resting hairline), resizable_panel, ResizableState}`.

### spectrum-app (lib)
- `runtime::init()`, `runtime::spawn_tokio(fut).await -> Result<T, RuntimeError>` — every Tokio
  future from GPUI code goes through this.
- `init(mode, style, cx)`: kit, theme, key bindings. `shell::ShellView::new(AppPaths, window, cx)` is the window root:
  Home ↔ workspace ↔ theme preview, with the palette over them (`show_command_palette`, `quick_open`,
  `open_project(root)`, `palette()`); `shell::commands_for(ScreenKind)` lists the palette's commands.
- `home::HomeView` (`HomeEvent::Open(root)`), `home::{load_projects, new_project, time_ago, ProjectCard}`.
- `workspace::WorkspaceView` (`WorkspaceEvent::ShowProjects`; `open(rel)`, `refresh`, `quick_open_items`): title bar,
  268 px sidebar, editor slot, PDF slot. Sessions 2c and 4b replace `editor_pane` / `pdf_pane` in `workspace/view.rs`.
  Session 10a: update pill before Compile in `title_bar`, update card in Home (`// session 10a` comments).
- `file_ops::{create_file, create_folder, rename, move_to_bin, editable, unfit_name, BIN}` (blocking; background only).
- `theme_preview::ThemePreviewView` — reachable from the palette ("Show theme preview").

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

## Globals

- `SpectrumTheme` (spectrum-theme); the kit's `Theme` is driven from it, never edited directly.

## Events and actions

- `spectrum_app::actions` (namespace `spectrum`): ShowCommandPalette (Mod-Shift-P), QuickOpen (Mod-P), ShowProjects,
  ShowThemePreview, NewProject (Mod-N, Home), OpenProject, ToggleSidebar (Mod-\), NewFile (Mod-N), NewFolder
  (Mod-Shift-N), RenameFile (F2, FileTree), MoveFileToBin (Cmd-Backspace / Delete, FileTree), RefreshFiles,
  CompileProject (Mod-Enter), UseLight/Dark/SystemAppearance, UseSpectrum/SimpleColours. Key contexts: `Spectrum` >
  `Home` | `Workspace` > `FileTree`; `Palette`.
- `HomeEvent::Open`, `WorkspaceEvent::ShowProjects`, `PaletteEvent::{Confirmed, Dismissed}`.
