# Typst editor features: where Spectrum stands and what to add

3 November 2026. Spectrum 2.1.0, built-in Typst 0.15.1.

## Summary

Spectrum's Typst support is wider than it feels. It already pins Typst versions per project, keeps an offline package cache and reads label numbers and pages from Typst's own `typst eval`. It has Typst output in the table, figure and diagram tools. It also does spelling, grammar, Zotero citations, Document insights and a Typst agent skill. Few Typst editors do all of that, and version pinning in particular is rare.

What feels lacking is the editing loop. Every compile starts a fresh `typst compile` process. Errors appear only as a list in Logs, not in the text. Completion knows Typst's built-ins but not the user's own functions or packages. There is no hover help or go to definition. PDF jumps match words rather than positions. Exports are PDF only. These are the things a Typst user meets every minute, and Tinymist, an Apache 2.0 language server, provides almost all of them.

### Recommendations

1. **Add Tinymist as the Typst language server** (medium effort). Reuse the TexLab bridge (`texlabService.js`, `routes/texlab.js`, `editor/lsp/texlab.ts`). One integration brings completion, hover, go to definition, signature help, rename, live diagnostics, typstyle formatting and a word count.
2. **Add a live Typst preview with exact two-way jumps** (medium to large). Tinymist's preview server renders unsaved text incrementally. Keep pdf.js for the final PDF.
3. **Show Typst errors in the editor now** (small). The diagnostics already reach the frontend with a line and column. The column is dropped and nothing marks the text.
4. **Browse Typst Universe for templates and manage packages offline** (medium). The package index is one 2.4 MB JSON file, and `typst init` is already in the built-in binary.
5. **Export PNG, SVG and HTML, and offer PDF/A and PDF/UA** (small). The built-in Typst 0.15.1 does all of these already.

Quick wins that need no new binary: inline errors, PNG/SVG/HTML export, PDF standards, a Typst word count, recursive `#include` scanning and alt text on figures.

Do not build real-time collaboration. It is large and risky, and Spectrum's GitHub sync and PDF notes already cover the local-first case.

### On the two projects named

- **Typsastra exists.** It is [Sovichea/typsastra](https://github.com/Sovichea/typsastra): MIT, Tauri with Bun and CodeMirror 6, Tinymist for preview, diagnostics, completion, formatting and sync. It is young and small: 32 stars, beta, v0.10.0 released on 31 October 2026, Windows and Linux first, with macOS builds unsigned. Its focus is Khmer, Lao and other complex scripts. It is not a mature benchmark, but it is the closest architectural sibling to Spectrum and a good reference for running Tinymist inside a Tauri app.
- **Texpile exists** and is roughly what it claims. It is [texpile/texpile](https://github.com/texpile/texpile): a LaTeX, Typst and Markdown desktop editor, 318 stars, created on 1 July 2026, v1.6.2 released on 24 October 2026. It is **AGPL 3.0**, so none of its code can be copied into Spectrum. Its Typst intelligence is Tinymist installed with one click. Its claim to cover Typst in its visual editor was not tested here.

## 1. What Spectrum already does for Typst

Sources: the files named below, `CHANGELOG.md`, `docs/BACKLOG.md`, `README.md` and `THIRD_PARTY_NOTICES.md`.

| Area | State | Where |
|---|---|---|
| Compiling | Done. One `typst compile` process per compile with `--diagnostic-format short`, the project folder as root, a project `fonts/` folder as `--font-path` and Spectrum's own package cache. Auto compile saves and then compiles after a pause. | `apps/backend/src/services/typstService.js` (`compileTypst`), `compileService.js`, `EditorPage.tsx` (`autoCompile`) |
| Version pinning | Done, and strong. 0.15.1 built in, with 0.14.2, 0.13.1 and 0.12.0 downloadable with SHA-256 checks. A project can pin a version, and there is an app-wide default. Logs offers a way out when the pinned version is missing. | `apps/backend/src/data/engines.json`, `engineService.js`, `tools/LogsTab.tsx` |
| Diagnostics | Partial. Parsed from the short format with hints. They are listed in Logs with a count badge, but the column is dropped and nothing marks the source. | `parseTypstDiagnostics` in `typstService.js`; `EditorPage.tsx` around line 537 |
| Highlighting, folding | Done, from `codemirror-lang-typst` 0.6.0 (Apache 2.0). | `editor/languages.ts` |
| Completion | Partial. A static list of Typst 0.15's built-ins, only when the project uses the built-in version. `@` completes `.bib` keys and labels. There is no completion for the user's functions, package exports or file paths. | `languages.ts` (`typstCompletions`, `referenceCompletions`) |
| Hover, go to definition, rename, signature help | None for Typst. TexLab provides these for LaTeX only. | `editor/lsp/texlab.ts` |
| Outline | Partial. `=` headings, following `#include` one level deep. | `editor/outlines.ts`, `EditorPage.tsx` around line 2770 |
| Labels and numbers | Done, and unusual. One `typst eval` per compile returns each heading's and label's number and page. | `typstElements` in `typstService.js`, `statsService.js` |
| Source and PDF jumps | Partial. There is no SyncTeX for Typst, so a double click searches for the line's words in the PDF, or the PDF text in the source. | `EditorPage.tsx` (`jumpFromPdf`, `showInPdf`) |
| Preview | PDF only, through pdf.js, refreshed after each full compile. `LiveCompile.tsx` shows nothing for Typst. | `editor/PdfPreview.tsx`, `LiveCompile.tsx` |
| Word count | None. Insights says that word counts come from texcount and are for LaTeX. | `InsightsPanel.tsx` line 241, BACKLOG |
| Export | PDF only. | `compileTypst` |
| Packages | Partial. `@preview` imports download on first use into `DATA_DIR/typst/packages` and then work offline, with a clear note when a download fails. There is no browsing, listing, updating or clearing. | `typstService.js` (`PACKAGE_NOTE`) |
| Templates | Four starters: document, report, letter and CV. No Typst Universe templates. | `templates/typst-*` |
| Bibliography | `.bib` only. `#bibliography("x.bib")` is detected, and Zotero adds BibTeX. Hayagriva `.yml` files are not read. | `referenceService.js` (`texIncludesBib`) |
| Figures and tables | Done. `figureTypst`, `figureSetTypst` (a grid, since there are no sub-figures without a package), `tableTypst` with `table.cell` spans and `table.hline`/`vline`. TikZ diagrams go into Typst documents as PDF images from Typst 0.14. | `editor/floats.ts`, `tools/FloatsTab.tsx` around lines 935 to 1060 |
| Diagram composer | Partial. A Typst mode writes fletcher (0.5.8, or 0.5.5 for older pins) for flowcharts and state machines on the TikZ canvas. The other starters (circuits, plots, structures and commutative diagrams) are TikZ only. | `diagram/modes/fletcher/code.ts`, `diagram/starters.ts` |
| Spelling, grammar, to-dos | Done, with Typst markup masked. | `apps/backend/src/latex/mask.js` (`maskTypst`), `editor/spellcheck.ts`, `editor/todos.ts` |
| Insights and Review | Partial. Headings, figures, tables, equations, labels and citations are scanned. Preflight's source checks say that they read LaTeX only. | `editor/insights.ts`, `editor/preflight/run.ts` line 440 |
| Presentation | Done for any PDF: full screen, one page at a time. No speaker notes. | `editor/PdfPresentation.tsx` |
| Formatting | None, for LaTeX or Typst. | |
| Agents | Typst in local agents' isolation, a `spectrum-typst` skill and Typst errors in `get_log`. Agent compiles use the built-in version, not the pin (BACKLOG). | `skills/spectrum-typst`, `mcp/tools.js` |
| Markdown via Typst | Done. pandoc writes Typst, errors are traced back to the `.md` file. | `markdownService.js` |

Measured on this Mac (Apple silicon, 475 font families): a cold `typst compile` of a one-page document took 0.27 to 0.44 seconds, and 0.01 seconds with `--ignore-system-fonts`. Almost all of Spectrum's per-compile cost for a short document is Typst scanning system fonts again, because the process does not stay alive. A persistent compiler (Tinymist, or `typst watch`) pays it once and also keeps Typst's incremental cache between edits.

## 2. The landscape

Facts below were checked this session against the linked page or the GitHub API (stars and dates as of 2 November 2026 UTC). Items marked † come from general knowledge and were not re-checked.

| Project | What it is | Licence | Activity and maturity |
|---|---|---|---|
| [typst.app](https://typst.app) | Official web editor | Proprietary | Commercial. Free and Pro ($7.99 a month) [plans](https://typst.app/pricing/) |
| [Tinymist](https://github.com/Myriad-Dreamin/tinymist) | Language server, preview server and CLI | **Apache 2.0** | 3.6k stars. v0.15.10 on 16 October 2026. 246,704 [VS Code installs](https://marketplace.visualstudio.com/items?itemName=myriad-dreamin.tinymist) |
| [typst-preview](https://github.com/Enter-tainer/typst-preview) | Former preview extension | MIT | Archived in July 2024. Merged into Tinymist |
| [Typsastra](https://github.com/Sovichea/typsastra) | Tauri desktop editor on Tinymist | MIT | 32 stars. v0.10.0 on 31 October 2026. Beta |
| [Texpile](https://github.com/texpile/texpile) | LaTeX, Typst and Markdown desktop editor | **AGPL 3.0** | 318 stars. v1.6.2 on 24 October 2026 |
| [Typstudio](https://github.com/Cubxity/typstudio) | Tauri and Svelte desktop editor | **GPL 3.0** | 736 stars. Last push in April 2025. The README says it is not actively maintained |
| [Zed Typst extension](https://zed.dev/extensions/typst) | Grammar and Tinymist for Zed | | v0.2.1. No live preview; an [RFC](https://github.com/zed-industries/zed/discussions/51633) proposes one |
| Neovim | [nvim-lspconfig's tinymist](https://github.com/neovim/nvim-lspconfig/blob/master/lsp/tinymist.lua), [typst-preview.nvim](https://github.com/chomosuke/typst-preview.nvim), [typst.vim](https://github.com/kaarmu/typst.vim) | lspconfig Apache 2.0†, typst-preview.nvim **GPL 3.0**, typst.vim MIT | typst-preview.nvim has 1k stars and was pushed in July 2026 |
| Helix | Tinymist defined in [languages.toml](https://github.com/helix-editor/helix/blob/master/languages.toml) | MPL 2.0† | |
| [typstyle](https://github.com/typstyle-rs/typstyle) | Formatter: CLI, Rust crate, WASM on npm | Apache 2.0 | 906 stars, active. Built into Tinymist |
| [typstfmt](https://github.com/astrale-sharp/typstfmt) | Formatter | Apache 2.0 | Archived in June 2024 |
| [typst-lsp](https://github.com/nvarner/typst-lsp) | Early language server | MIT | Archived and deprecated in favour of Tinymist |
| [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) | Typst compiler and renderer in WASM | Apache 2.0 | 1.25k stars, active. Powers Tinymist's preview rendering |
| [Typst Universe](https://typst.app/universe/) ([typst/packages](https://github.com/typst/packages)) | Package and template registry | Apache 2.0 repository; each package has its own licence | 1,727 packages, 884 of them templates, 5,098 versions in [the index](https://packages.typst.org/preview/index.json) |
| [Hayagriva](https://github.com/typst/hayagriva) | Typst's bibliography engine and YAML format | Apache 2.0 | Active. 0.10 ships with Typst 0.15 |
| [Detypify](https://github.com/QuarticCat/detypify) | Draw a symbol, get its Typst name | MIT | 266 stars, active. Used in Tinymist's symbol view |
| [Touying](https://github.com/touying-typ/touying), [Polylux](https://github.com/polylux-typ/polylux) | Slide packages | MIT | Touying 2.4k stars, 0.8.0 needs Typst 0.15. Polylux 1.6k stars, 0.4.0 |
| Others | [typstwriter](https://github.com/Bzero/typstwriter) (PyQt, 177 stars), [Typwriter](https://github.com/Ahdeyyy/typwriter) (Tauri, MIT, 30 stars), [typst-studio](https://github.com/junity233/typst-studio) (Tauri and React, MIT, 2 stars), [shiroa](https://github.com/Myriad-Dreamin/shiroa) (books, Apache 2.0) | | Small projects. None changes the picture |

### 2.1 typst.app (the benchmark)

Verified from its documentation: live preview beside the editor and in a separate window, a choice of which file to preview, paged or HTML preview, and [export](https://typst.app/docs/web-app/export-and-preview/) to PDF, PNG, SVG and HTML (HTML needs Typst 0.14 and an experimental switch). Real-time co-editing and share links, spell check and uploaded fonts are covered in [Concepts](https://typst.app/docs/web-app/concepts/). Universe templates are on the Free plan. Pro adds comments, private packages, GitHub and GitLab sync (marked experimental), Zotero and Mendeley sync and a presentation mode with a pen, a laser pointer and a speaker view. The 2023 [launch post](https://typst.app/blog/2023/beta-oss-launch) describes clicking the preview to place the cursor and the preview following the cursor. Autocomplete and hover help are † (well known, not re-checked). The [roadmap](https://typst.app/docs/roadmap/) still lists word count, a symbol picker, version history, change tracking, an offline PWA and a compiler version picker as planned. It also lists Git integration as planned, though that has shipped, so the roadmap is partly out of date.

### 2.2 Tinymist

Verified by running the v0.15.10 binary (see Method). Over the Language Server Protocol it offers completion, hover with full signatures, go to definition, references, rename, signature help, document and workspace symbols, folding, semantic tokens, inlay hints, colour picking, code actions, code lens, document links and range formatting. Diagnostics arrive as you type, with hints. Its `tinymist/compileStatus` notification carries a page count and a word count (`{"words":15,"chars":108,"cjkChars":0,"spaces":14}` on the test file). Commands export PDF, PNG, SVG, HTML, Markdown, plain text and TeX. They also start, scroll and kill a preview, list the fonts used (`getDocumentMetrics`), list labels, pin the main file and create a project from a template. `tinymist preview` serves an incremental SVG preview over HTTP and WebSocket, with `--partial-rendering`, a slide mode and an HTML mode. The [preview docs](https://myriad-dreamin.github.io/tinymist/feature/preview.html) describe jumps in both directions. The README adds a symbol view with Detypify, linting, a template gallery and package views.

Important limits: one Tinymist build embeds one Typst (`tinymist --version` reports Typst 0.15.1). The arm64 macOS binary is 65 MB (a 30 MB download), and the x64 one is 71 MB. Memory grows with document size: Typsastra's author reports about 1.3 GB at peak for 500 pages in a small virtual machine ([forum thread](https://forum.typst.app/t/introducing-typsastra-a-complex-script-first-desktop-editor-for-typst/9323), a user report, not a benchmark).

### 2.3 Typsastra

From its [README](https://github.com/Sovichea/typsastra) and the forum thread: Tinymist is the authority for preview, diagnostics, completion, formatting and sync. Typsastra uses a validated Tinymist from the PATH or downloads a managed one, and needs no separate Typst. It has a virtualised PDF preview that can be docked or in its own window. It renders on type for short documents and on save for long ones, and its Draft Preview swaps images for placeholders. Forward sync goes to the right page and line (not column), and inverse sync works through clickable references. A Low Memory Mode runs Tinymist once to build the PDF and a navigation index, then stops it. Projects start from searchable Typst Universe templates with offline copies, and it has a table tool and per-script font settings. It exports PDF only and has no word count or collaboration. Its macOS builds are experimental and unsigned.

### 2.4 Texpile

From its [README](https://github.com/texpile/texpile/blob/master/README.md): a visual editor with Knuth-Plass line breaking that saves `.tex`, `.typ` and `.md` natively; LaTeX IntelliSense from its own package data; a LuaLaTeX-hooked live preview; and "Typst's instant live preview". Tinymist installs in one click from Preferences › Toolchain. It has end-to-end encrypted shared sessions through a relay (self-hostable, with the hosted one closed to unofficial builds) and word-processor-style comments and suggestions. The `electron` folder and `electron-builder.yml` suggest Electron (inference). It is AGPL 3.0, with its name and logo held as trademarks.

### 2.5 Editors that use Tinymist (VS Code, Zed, Neovim, Helix)

These get the same language features from Tinymist. VS Code also has the full preview, sidebars for symbols, fonts, packages, labels and outline, export tasks and a template gallery. Zed has the language server but no preview yet. Neovim adds a preview through typst-preview.nvim (GPL 3.0). The lesson for Spectrum: a desktop editor gets most of its Typst depth from Tinymist, not from its own code.

## 3. Feature matrix

Key: **Y** yes, **P** partial, **N** no, **?** not found. Spectrum is 2.1.0. "Tinymist (VS Code)" is the reference integration.

| Feature | Spectrum | typst.app | Tinymist (VS Code) | Typsastra | Texpile | Typstudio | Zed | Neovim |
|---|---|---|---|---|---|---|---|---|
| Completion: built-ins | Y | Y† | Y | Y | Y | Y | Y | Y |
| Completion: own functions, packages, paths | N | Y† | Y | Y | Y | ? | Y | Y |
| Hover, signature help | N | Y† | Y | Y | Y | ? | Y | Y |
| Go to definition, references, rename | N | ?† | Y | ? | Y | N | Y | Y |
| Errors marked in the text | N (list in Logs) | Y† | Y | Y | Y | Y | Y | Y |
| Live diagnostics while typing | N | Y† | Y | Y | Y | P | Y | Y |
| Formatter (typstyle) | N | N | Y | Y | ? | P | Y | Y |
| Preview refresh | Full compile, PDF | Instant | Instant, incremental | Debounced | Instant | Live | N | Plugin |
| Preview to source jump | P (word match) | Y | Y | Y (references) | ? | Y | N | Y |
| Source to preview jump | P (word match) | Y | Y | Y (page and line) | ? | ? | N | Y |
| Export PNG, SVG | N | Y | Y | N | ? | ? | Y (commands) | Y (commands) |
| Export HTML | N | Y (experimental) | Y | N | ? | N | Y | Y |
| PDF/A, PDF/UA choice | N | Y (export settings) | Y (`--pdf-standard`) | ? | ? | N | via config | via config |
| Word count | N | N (roadmap) | Y | N | ? | N | N | N |
| Universe templates | N (4 own starters) | Y | Y | Y (offline copies) | ? | P | N | N |
| Package browsing and cache control | N (cache only) | Y (search) | P (package view) | N | ? | N | N | N |
| Offline package use | Y | N | Y | Y | Y | Y | Y | Y |
| Hayagriva `.yml` | N | Y (compiler) | Y | Y (compiler) | ? | ? | Y | Y |
| Zotero | Y (BibTeX) | Pro | N | N | ? | N | N | N |
| Symbol search | N | ?† | Y (with Detypify) | N | ? | N | N | N |
| Multi-file: full include graph | P (one level) | Y | Y | Y | Y | ? | Y | Y |
| Fonts: project folder | Y | Y (upload) | Y | Y | ? | ? | Y | Y |
| Fonts: list and inspect | N | ? | Y | Y (typography panel) | ? | N | N | N |
| Typst version pinning | **Y (0.12 to 0.15)** | N (roadmap) | N (one per build) | N | N | N | N | N |
| Real-time collaboration | N (GitHub sync) | Y | N (Live Share) | N | Y (E2E relay) | N | Y (Zed's own) | N |
| Comments | P (PDF notes) | Pro | N | N | Y | N | N | N |
| Slides: present mode | Y (no notes) | Pro (speaker mode) | Y (slide preview) | N | ? | N | N | N |
| Diagram tools | **Y (fletcher; TikZ as PDF)** | N | N | N | ? | N | N | N |
| Table and figure builders | **Y** | N | N | Y (table tool) | Y (visual editor) | N | N | N |
| Spell and grammar check | **Y** | Spell | Plugin | Y (complex scripts) | ? | N | Plugin | Plugin |
| AI agent with Typst skill | **Y** | Assists (fixes) | Third-party | N | ? | N | Y (Zed's) | Plugin |
| Licence | MIT | Proprietary | Apache 2.0 | MIT | AGPL 3.0 | GPL 3.0 | GPL 3.0 and others† | Various |

Bold marks where Spectrum is ahead of most of the field.

## 4. Ranked features to add

Ranked by user value against effort, with the Tinymist work first because several others then come almost free.

| Rank | Feature | Value | Effort | Risk |
|---|---|---|---|---|
| 1 | Tinymist language service | Very high | Medium | Medium |
| 2 | Live preview and exact two-way jumps | Very high | Medium to large | Medium |
| 3 | Inline error display | High | Small | Low |
| 4 | Typst Universe templates and package management | High | Medium | Low to medium |
| 5 | PNG, SVG and HTML export, and PDF standards | Medium to high | Small | Low |
| 6 | Word count | Medium | Small | Low |
| 7 | Maths input aids and symbol search | Medium | Small to medium | Low |
| 8 | Multi-file projects in depth | Medium | Small | Low |
| 9 | Formatting with typstyle | Medium | Free with 1; small without | Low |
| 10 | Accessibility | Medium | Small | Low |
| 11 | Fonts management | Medium | Small to medium | Low |
| 12 | Typst version pinning polish | Medium | Small to medium | Medium |
| 13 | Slides (Touying, Polylux) | Medium | Medium | Low |
| 14 | Hayagriva bibliographies | Low to medium | Small to medium | Low |
| 15 | Diagram composer's Typst modes | Low to medium | Medium per mode | Low |
| 16 | Collaboration | Low for this audience | Large | High |

### 4.1 Tinymist language service

- **Value.** Completion for the user's own `#let` functions, package exports, file paths, fonts and labels; hover with signatures and docs; go to definition into chapters and packages; references; rename across files; signature help; live diagnostics with hints as you type; typstyle formatting; and a word count. This is the biggest single change in how Typst feels in Spectrum.
- **Fit.** Copy the shape of the TexLab bridge rather than writing a new one. `apps/backend/src/services/texlabService.js` already frames JSON-RPC, keeps one server per project, stops it when idle, avoids crash loops and relays to editors. Generalise it, or add `tinymistService.js` beside it, with a route like `routes/texlab.js`. In the frontend, add `editor/lsp/tinymist.ts` modelled on `texlab.ts`, using `@codemirror/lsp-client`, which is already bundled. In `editor/languages.ts`, turn off `typstCompletions` while Tinymist runs so that the lists do not double up. Set `TYPST_PACKAGE_CACHE_PATH` to the same `DATA_DIR/typst/packages` that `compileTypst` uses and pass the project's `fonts/` folder. Call `tinymist.pinMain` with the project's main file so that editing a chapter checks the whole document. Initialisation options seen to work: `formatterMode: "typstyle"`, `exportPdf: "never"` (Spectrum keeps its own PDF) and `compileStatus: "enable"`.
- **Shipping the binary.** Download it on demand from Settings › Engines, with a SHA-256 pin in `apps/backend/src/data/engines.json` and an `installTinymist` beside `installTypst` in `engineService.js`. This matches how Typst versions are handled and how Typsastra and Texpile ship Tinymist. Bundling would add about 65 to 71 MB per architecture, or about 136 MB to the universal Mac build. Without Tinymist the editor works as it does today, as it does without TexLab.
- **Risk.** (a) One Tinymist embeds one Typst. For a project pinned to 0.12, 0.13 or 0.14, Tinymist 0.15.10 will judge the code by 0.15 rules (for example, 0.15 refuses backslashes in paths). Tinymist's minor version follows Typst's, and older lines exist (for example tinymist-package 0.14.6 on crates.io), so a matching Tinymist per pin is plausible (inference); otherwise disable diagnostics for older pins and keep completion. (b) Memory on long documents. (c) Tinymist writes exports beside the source when asked (seen in the probe), so Spectrum must pass output paths. (d) Its Windows build needs the same Visual C++ runtime handling as Typst (inference; check).

### 4.2 Live preview and exact two-way jumps

- **Value.** Typst's main selling point is instant feedback. Spectrum shows a new PDF only after a full compile with a cold process, and jumps by matching words, which fails on repeated phrases, maths and generated text.
- **Fit.** Two steps.
  1. *Interim, small to medium:* keep one compiler alive per open Typst project so that fonts and Typst's incremental cache stay warm. Either `typst watch` with the current arguments writing into the build folder (it reads files from disk, which works because auto compile saves first), or Tinymist's `exportPdf: "onType"`, which compiles unsaved text. `compileTypst` in `typstService.js` and the auto compile path in `EditorPage.tsx` change. pdf.js reloading stays as it is.
  2. *Full, medium to large:* a "Live" view for Typst documents that embeds Tinymist's preview (started with `tinymist.doStartPreview` from the language server, so it previews unsaved edits). It renders incrementally in SVG with partial rendering and handles jumps in both directions by source span. The probe confirmed `tinymist preview` serves its page on 127.0.0.1. `src-tauri/tauri.conf.json` has `"csp": null`, so an iframe to a loopback port is allowed. Keep pdf.js for the final PDF, find, notes, presentation and links. Hook the jumps into `jumpFromPdf` and `showInPdf` in `EditorPage.tsx`.
- **Alternative considered.** typst.ts in WASM inside the webview avoids a sidecar process, but it is a second copy of one Typst version with no pinning and is more work. Tinymist's preview already uses its renderer.
- **Risk.** Medium: two preview surfaces to keep consistent, a loopback server to secure (bind to 127.0.0.1 and a random port) and dark-mode inversion choices.

### 4.3 Inline error display

- **Value.** The error appears where it is, while the user looks at the text. Today it is a list in Logs.
- **Fit.** `parseTypstDiagnostics` already returns `line` and `column`. The mapping in `EditorPage.tsx` around line 537 drops `column`. Feed the diagnostics of the open file into `@codemirror/lint` (`setDiagnostics`, already used by `texlab.ts`), marking from the column to the end of the word, with the hint text in the tooltip. Once Tinymist runs, its live diagnostics with exact ranges replace these.
- **Effort and risk.** Small, low. Typst's short format gives only a start position, so the end of the mark is a guess until Tinymist.

### 4.4 Typst Universe templates and package management, with offline caching

- **Value.** 884 templates (journal, thesis, CV, slides and letters) and 1,727 packages. Users expect to start from `charged-ieee` or a university thesis template, and to know which packages a project needs offline.
- **Fit.**
  - *Index:* fetch `https://packages.typst.org/preview/index.json` (2.4 MB; fields include `name`, `version`, `compiler`, `license`, `description`, `keywords` and, for templates, `template.path`, `template.entrypoint` and `template.thumbnail`). Cache it in the data folder with its date, and work from the cache offline.
  - *Templates:* a Typst Universe tab in Templates (`templateService.js`) with search, licence and thumbnail. Create the project with the built-in `typst init @preview/<name>:<version> <dir>` and `TYPST_PACKAGE_CACHE_PATH` set to Spectrum's cache. Hide templates whose `compiler` is newer than the project's Typst version.
  - *Packages:* a panel listing what is in `DATA_DIR/typst/packages/preview` with sizes and the versions each project imports. Add "Newer version available" from the index, "Download for offline use" (compile once, or fetch the tarballs a project imports), "Remove unused" and `@local` packages through `TYPST_PACKAGE_PATH`.
  - *Import completion:* Tinymist completes `@preview/` names and versions once it shares the cache.
- **Risk.** Low to medium. Network failures are already handled. Package licences vary (CeTZ is LGPL 3.0, `lemmify` is GPL 3.0), but they are fetched by the user's Typst into a cache, never shipped, as with fletcher today. Show each template's licence before creating the project.

### 4.5 PNG, SVG and HTML export, and PDF standards

- **Value.** Slides as images, figures for the web, HTML for accessible reading, PDF/A for theses and PDF/UA for accessibility rules.
- **Fit.** Built-in Typst 0.15.1 (checked with `--help` and test exports) takes an output of `.png`, `.svg` or `.html`, a `{p}` page template for multi-page PNG and SVG, `--ppi`, `--pages`, `--features html` for HTML (still experimental) and `--pdf-standard` with `a-1b` to `a-4e` and `ua-1`, several at once. Add an `export` option to `compileTypst` that writes into the project's folder or a chosen folder, and an Export menu entry for Typst like the Markdown one. Add the PDF standard as a project compile choice in `.spectrum/settings.json`.
- **Risk.** Low. Mark HTML as experimental in the interface, as Typst does. Older pins lack some of these (HTML needs 0.14 or later per typst.app's docs), so gate by version.

### 4.6 Word count

- **Value.** Requested in BACKLOG. Theses and journals have limits.
- **Fit.** Two options. (a) Count the source's prose with `maskTypst` from `apps/backend/src/latex/mask.js` (already used for spell check), split into text, headings and captions using what `editor/insights.ts` already finds, in `statsService.js`. This matches texcount's categories for LaTeX. (b) Take `wordsCount` from Tinymist's compile status, which counts the rendered document, including numbering and generated text. Do (a) now and show (b) as "Words in the PDF" when Tinymist runs. Then update the footnote in `InsightsPanel.tsx` line 241.
- **Effort and risk.** Small, low.

### 4.7 Maths input aids and symbol search

- **Value.** LaTeX users moving to Typst do not know that `\rightarrow` is `arrow.r` or that `\mathbb{R}` is `RR`. Spectrum's LaTeX side lists maths commands with Unicode previews (`editor/latexCommands.ts`); Typst has nothing comparable.
- **Fit.** Generate a symbol table at build time from the built-in Typst. `typst eval 'dictionary(sym)'` lists the 299 base symbols, and each has modifiers (variants). Write `editor/typstSymbols.ts` with name, character and LaTeX aliases. Use it for (a) a searchable symbol palette that inserts the Typst name, (b) completion inside `$…$` that matches LaTeX names (typing `\alpha` offers `alpha`) and (c) a "paste LaTeX maths as Typst" helper for common cases. Detypify (MIT) could add drawing a symbol later; it is a separate model and service, so treat it as optional.
- **Risk.** Low. The table must follow the pinned version, since symbol names change between Typst releases.

### 4.8 Multi-file projects in depth

- **Value.** Theses split into chapters and imported modules.
- **Fit.** The outline follows `#include` one level (`EditorPage.tsx` around line 2770), `labelNames` in `typstService.js` stops at depth one. `#import "chapter.typ"` is not followed. Make these recursive with a visited set, as `mcp/tools.js` already does. Tinymist's pinned main and dependency graph cover the rest.
- **Effort and risk.** Small, low.

### 4.9 Formatting with typstyle

- **Value.** Tidy code, especially after an agent or a template writes it.
- **Fit.** Free with Tinymist (`textDocument/formatting` with `formatterMode: "typstyle"`, confirmed in the probe). Without Tinymist, typstyle ships as WASM on npm (`@typstyle/typstyle-wasm-bundler`), which could run in the frontend. Offer Format document and Format selection; do not format on save by default, because that makes noisy Git diffs. Respect `// @typstyle off`.
- **Risk.** Low. typstyle leaves code with syntax errors unchanged.

### 4.10 Accessibility

- **Value.** Universities and publishers increasingly ask for accessible PDFs. Typst tags PDFs by default and checks PDF/UA-1.
- **Fit.** (a) The PDF/UA option from 4.5. (b) An Alt text field in the Floats panel that writes `image(..., alt: "...")` in `figureTypst` and `figureSetTypst` (`editor/floats.ts` writes none today). (c) Typst source checks in Preflight (`editor/preflight/run.ts` line 440 says they do not apply to Typst): images without `alt`, a missing `#set document(title: ...)` and a missing `#set text(lang: ...)`. (d) Keep the editor itself usable with a screen reader: the Typst symbol palette and any preview need labels and keyboard access.
- **Effort and risk.** Small, low.

### 4.11 Fonts management

- **Value.** "Unknown font family" is a common Typst warning. A thesis needs its fonts to travel with the project.
- **Fit.** A Fonts panel that lists what the document uses (Tinymist's `getDocumentMetrics` returns `fontInfo` per family, confirmed) and what Typst can see (`typst fonts --variants --font-path fonts`). Add "Copy into this project's fonts folder" and a project switch for `--ignore-system-fonts`, for reproducible builds that also compile faster. Font names complete inside `font: "..."` once Tinymist runs (†). Files: `typstService.js` (arguments), a small route, Settings or Tools.
- **Risk.** Low. Font licences: copying a system font into a project that is then shared is the user's decision; say so.

### 4.12 Typst version pinning polish

- **Value.** Spectrum is already ahead here. The gaps: agent compiles use the built-in version (BACKLOG); Universe templates and packages declare a minimum `compiler` that Spectrum does not check; and Tinymist must follow the pin (4.1).
- **Fit.** `agentSessionService.js` read grants for installed versions; the `compiler` field from the index in Templates and in the package panel; and a Tinymist version per Typst minor version in `engines.json`, if Tinymist is downloaded per version.
- **Risk.** Medium, because of the agent sandbox's read grants on Windows and macOS.

### 4.13 Slides (Touying, Polylux)

- **Value.** Typst slides are a common reason to choose Typst. Presentation mode exists but has no speaker notes.
- **Fit.** Add a Touying starter (MIT; 0.8.0 needs Typst 0.15) and, for older pins, a Polylux one (MIT) in `templates/`. For speaker notes, query the notes both packages write (they support pdfpc) with `typst eval` after compiling, and show them in a presenter window beside `PdfPresentation.tsx` (inference on the exact query; check against each package's docs). Tinymist's preview also has a slide mode.
- **Risk.** Low. The packages download on first use, as fletcher does.

### 4.14 Hayagriva bibliographies

- **Value.** Lower than it looks. Typst reads `.bib` well, and Zotero produces BibTeX. Hayagriva YAML matters for users who already keep `.yml` files and for Typst 0.15's multiple bibliographies.
- **Fit.** Read first: let `texIncludesBib` in `referenceService.js` accept `.yml` and `.yaml`, and parse top-level keys for `@` completion and Insights. Writing (Zotero adding entries to a `.yml`) is a second step, and converting BibTeX to YAML would need the Hayagriva CLI (Apache 2.0), a new binary. Leave conversion out.
- **Risk.** Low.

### 4.15 The diagram composer's Typst support

- **Value.** Lower than it looks, because TikZ diagrams already go into Typst documents as PDF images from Typst 0.14 (`tools/FloatsTab.tsx`; checked that Typst 0.15.1 embeds a PDF image). Native Typst output helps where the figure should share the document's fonts and colours.
- **Fit.** New modes beside `diagram/modes/fletcher/`: commutative diagrams in fletcher (designed for them; the tikzcd canvas can write fletcher code), plots with lilaq (MIT, 0.6.0) and circuits with zap (MIT, 0.6.0). Each needs its own starters in `starters.ts` and a version map like `fletcherFor`. Also lift the "Needs Spectrum's built-in Typst" limit in `ComposerApp.tsx` where an installed version would do.
- **Risk.** Low, but each mode is medium effort and the packages change often.

### 4.16 Collaborative features

- **Value.** For Spectrum's users (one author per folder, GitHub to share), real-time editing adds little. typst.app's comments are Pro-only, and Texpile's relay is AGPL code.
- **Fit.** Not recommended. If anything, add source comments and suggestions on top of the existing PDF sticky notes and Git, which works the same for LaTeX.
- **Risk.** High: a relay service, encryption, conflicts with folder sync and support load.

## 5. Licence fit

Spectrum is MIT and already ships one GPL program, TexLab 5.26.0 (GPL 3.0 only), as a separate executable that it talks to over the Language Server Protocol, with the licence and source tarball listed in `THIRD_PARTY_NOTICES.md`. So shipping a separate GPL binary is a known pattern for this project. Copying GPL or AGPL source into Spectrum's own code is not allowed.

| Item | Licence | Fit |
|---|---|---|
| Tinymist | **Apache 2.0** (GitHub's licence detection on the repository, 2 November 2026) | Fits. Ship or download it as a separate program, with its LICENSE and NOTICE in `THIRD_PARTY_NOTICES.md` and `apps/frontend/public/licences/`. It embeds Typst and typstyle (both Apache 2.0); run a dependency licence report (for example cargo-about) on the tagged source before bundling. |
| typstyle, typst.ts, Hayagriva, Typst | Apache 2.0 | Fit. |
| Typsastra, Detypify, Touying, Polylux, fletcher, lilaq, zap | MIT | Fit. Typsastra's code can be studied and borrowed with attribution. |
| codemirror-lang-typst | Apache 2.0 | Already bundled. |
| **Texpile** | **AGPL 3.0** | Do not copy code. Use it only as a product reference. |
| **Typstudio** | **GPL 3.0** | Do not copy code. Unmaintained anyway. |
| **typst-preview.nvim** | **GPL 3.0** | Not relevant to bundle. Do not copy code. |
| CeTZ, cetz-plot, gantty | LGPL 3.0 | Fetched by Typst into a cache, never bundled. Already the case for CeTZ through fletcher. |
| lemmify (and any GPL package) | GPL 3.0 | Only if a user imports it. Do not put it in a Spectrum template. |
| pandoc | GPL 2.0 | Already downloaded separately on demand. |

## 6. Where the premise is off

- **The gap is smaller than it feels in breadth.** Version pinning, offline packages, eval-based label numbers, Typst-aware tables, figures and diagrams, spell and grammar checking, Zotero, Insights, presentation mode and an agent with a Typst skill are more than Typsastra, Typstudio or the plain editors offer, and some exceed typst.app's Free plan. TikZ diagrams already work in Typst documents.
- **The gap is larger than it looks in depth.** The everyday loop (type, see, fix) is LaTeX-grade, not Typst-grade: a cold compile each time, errors only in a list, no language intelligence beyond built-ins and jumps by word matching. That is why it feels lacking, and it is one integration (Tinymist) away, not many features away.
- **Typsastra is not an established editor.** It is a young beta with 32 stars. It is worth studying because it is MIT and built on the same stack, not because users expect parity with it.
- **Texpile cannot be a code source.** It is AGPL 3.0. Its Typst depth is Tinymist, which Spectrum can use directly.
- **Hayagriva and collaboration matter less than the BACKLOG ordering suggests.** Typst reads `.bib` natively, and real-time editing does not fit a local-first folder app.
- **typst.app is not ahead everywhere.** Its roadmap still lists word count, a symbol picker, version history and a compiler version picker as planned, and Spectrum already has version pinning.

## 7. Method

What was run, all inside `/private/tmp/claude-501/-Users-beyond555-Documents-CodingProjects-OpenPrism/fbabb042-6bf1-46be-83a9-ed218926f0d7/scratchpad/typst-editors/`:

- Downloaded `tinymist-aarch64-apple-darwin.tar.gz` v0.15.10 from the GitHub release and checked it against the published SHA-256 (`34f5cd17…dd27e`). Ran `tinymist --version`, `--help`, `compile --help` and `preview --help`.
- A Node script (`scripts/lsp-probe.mjs`) started `tinymist lsp` against a scratch `main.typ` and sent `initialize`, `didOpen`, hover, completion, definition, formatting, document symbols and the export commands. It recorded capabilities, diagnostics and `tinymist/compileStatus` notifications (including the word count).
- `tinymist compile` to PNG and HTML. `tinymist preview` on loopback ports for a few seconds, fetching its page, then stopped.
- Spectrum's own built-in Typst (`src-tauri/binaries/typst-aarch64-apple-darwin`, 0.15.1, read only): timed `compile` with and without `--ignore-system-fonts`, exported SVG and HTML (`--features html`), listed `compile` and `watch` options, counted `sym` with `typst eval` and compiled a document that embeds a PDF image.
- Downloaded the Universe index (`packages.typst.org/preview/index.json`) and counted packages, templates and the latest versions of named packages.
- GitHub's public API (unauthenticated) for stars, licences, push dates and releases. Web search and page fetches for the rest, cited inline.

No Spectrum file other than this one was changed. The Spectrum app was not launched, and no user data folders were read.
