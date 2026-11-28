# Architecture ledger

What exists, so no session duplicates it. Update at the end of every session. Keep under 150 lines.

## Crate graph

| Crate | Kind | Depends on |
|-------|------|------------|
| spectrum-core | pure lib | — |
| spectrum-compile, -lsp, -checkers, -ai, -references, -git, -convert | pure lib | core |
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

## Public API

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

## Globals

None yet.

## Events and actions

None yet.
