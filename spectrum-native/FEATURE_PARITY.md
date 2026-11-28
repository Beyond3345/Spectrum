# Feature parity: Spectrum 2.8.1 → 3.0.0

Every feature 2.8.1 has, as its user sees it, with the session of the rewrite that owns it and how far 3.0.0 has
got. 2.8.1 is the binding feature target (100% parity, `docs/gpui-rewrite-plan.html` and `docs/REWRITE_V3_PLAN.md`):
nothing on this list is dropped, though controls may move and screens may be redesigned in the plan's system.

How to use it:

- A session that makes a feature work in the 3.0.0 app sets its Status to **built**. "Works" means a user can do it
  in the app, not that a crate has the logic.
- **partial** means some of it is merged: usually the logic in a crate with no UI yet, or the UI with part of the
  behaviour. Say what is missing in the row if it isn't obvious.
- **not started** means nothing of it is merged.
- A deferred feature is never deleted. It stays unticked and its Session column names its new owner. A row moved to
  another session keeps its place here.
- New 2.8.x features merged from `main` get rows here when they land.
- Sessions in the plan's table keep their ids (`2d`, `6b`…). Sessions invented by this file are listed at the end,
  for adding to the plan.

Sources are abbreviated: `fe/` is `apps/frontend/src/`, `be/` is `apps/backend/src/`, `tauri/` is `src-tauri/`,
`guide` is `docs/USER_GUIDE.md`. Status was judged from the merged 3.0.0 code at commit 397eb4c3 and
`ARCHITECTURE_LEDGER.md` (sessions 0a, 0b, 1a, 1b, 1c, 2a, 3a, 3b, 3c, 5a, 5b and 6a merged).

## The sectional layout (must stay)

From the plan: a **collapsible Left Sidebar with Files / Research / To-dos tabs at top, the Outline docked as a
collapsible panel at the bottom-left (above Settings), Editor on the left/center, PDF on the right (with Editor /
Split / PDF view modes), toggleable Tools/Assistant/Agent panels**.

2.8.1 as it is (`fe/app/EditorPage.tsx`, `fe/app/ProjectPage.tsx`):

- **Window header:** project switcher (Home as a list, folders opened in place, each project marked TeX/Typ/MD), the
  view switcher (editor only / editor and PDF / PDF only, `⌘1/⌘2/⌘3`), Save checkpoint, and the Compile split
  button with its menu. The header keeps one height whether the sidebar shows or not.
- **Editor top bar:** Insert (+), Insert figure, Insert table, the open files' tabs, Draw a diagram, 粵 Jyutping,
  Assistant, Check grammar, Document insights, Tools, Agent. At narrow widths figure and table fold into Insert (+).
- **Left sidebar** (`⌘\` hides it): tabs Files, Research and To-dos (with a badge of open to-dos). Files has the
  search box (names, then "In text" matches), the file tree and the Outline as a collapsible section.
- **Centre:** the source editor, with panels under it for Preview this figure and Find references, the maths
  preview under the cursor, and banners for held files and conflicted copies.
- **Right:** the PDF with its header (Document outline sidebar with Contents/Pages, Live for Typst, the eye for a
  Markdown preview, zoom, Download, ··· menu) and its page bar (page number, which document's PDF, switcher).
  Tools (Checkpoints, Logs, Review, GitHub), Check grammar, Document insights, the Floats panel, the agent
  workspace (Spectrum agent and Local agents tabs) and the live compile output each take the PDF's place with a
  header holding Close and the view switcher; Compile stays in the header.
- **Assistant** (`⌘L`): a chat panel beside the editor, Assistant and References modes.
- **Projects page:** sidebar (Home folders, All projects, Archived, tags, GitHub, templates gallery entry) and a
  main area of tiles or a list; the template gallery and Typst Universe as sheets.
- **Diagram composer:** a window of its own, gallery first, then rails/canvas/inspector with Code and Preview.
- **Settings:** a sheet with a searchable sidebar of 19 panes in five groups.
- **First-run setup page:** fills the window on the first start on a computer.

3.0.0 so far (session 1c): title bar with Home, Projects and Compile; a 268 px sidebar whose tab strip has Files,
**Outline**, Research and To-dos; the editor slot and PDF slot side by side; a ten-button toolbar (Insert, Figure,
Table, Diagram, Jyutping, Insights, Grammar, Tools, Assistant, Agent). The Outline must move out of the tab strip
into the docked bottom-left panel the plan now draws (row L4).

| # | Layout element | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| L1 | Collapsible left sidebar, `⌘\` | fe/app/EditorPage.tsx | 1c | built |
| L2 | Files / Research / To-dos tabs at the top of the sidebar | fe/app/EditorPage.tsx | 1c | partial (only Files works; an extra Outline tab) |
| L3 | To-dos tab badge counting open to-dos | fe/app/EditorPage.tsx | 11c to-dos & PDF notes | not started |
| L4 | Outline docked as a collapsible panel at the bottom-left, above Settings | fe/app/EditorPage.tsx | 2b (data) + 1c follow-up (dock) | not started |
| L5 | Editor left/centre, PDF right, resizable split remembered per project | fe/app/EditorPage.tsx (Layout) | 1c / 4b | partial (split resizes, not remembered) |
| L6 | View modes Editor / Split / PDF with `⌘1 ⌘2 ⌘3` and a header switcher | fe/app/EditorPage.tsx | 4b | not started |
| L7 | Panels take the PDF's place with Close and the view switcher: Tools, Grammar, Insights, Floats, Agent | fe/app/EditorPage.tsx, fe/editor/ToolsPanel.tsx | 4b | not started |
| L8 | Toggleable Assistant panel (`⌘L`) | fe/editor/Composer.tsx | 6b | not started |
| L9 | Editor top bar with Insert, Figure, Table, Diagram, Jyutping, Assistant, Grammar, Insights, Tools, Agent | fe/app/EditorPage.tsx | 1c | partial (buttons say "isn't in this build yet") |
| L10 | Open-file tabs in the top bar | fe/app/EditorPage.tsx | 2c | not started |
| L11 | Compile split button and Save checkpoint in the header | fe/app/EditorPage.tsx | 3d compile extras / 8 | partial (button only) |
| L12 | Project switcher in the header (folders in place, TeX/Typ/MD marks) | fe/app/ProjectSwitcher.tsx | 1d projects page & templates | not started |
| L13 | Per-project layout memory (sidebar collapsed, view, split, outline open, PDF zoom, PDF sidebar tab) | fe/app/EditorPage.tsx (DEFAULT_LAYOUT) | 4c PDF extras | not started |
| L14 | Header keeps one height whether the sidebar shows or not | fe/app/EditorPage.tsx | 1c | built |
| L15 | Esc then Tab moves focus out of the editor | fe/app/shortcuts.ts | 2d | not started |

## Projects & Home

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| P1 | Projects are plain folders; new ones in `~/Documents/Spectrum` (`Documents\Spectrum` on Windows) | be/services/projectService.js | 1a | built |
| P2 | Projects page lists every project wherever its folder is | fe/app/ProjectPage.tsx | 1c | built |
| P3 | Home of folders, opened in place with a path back up and `⌘↑` | fe/app/Home.tsx | 1d projects page & templates | not started |
| P4 | Folders as large coloured tiles or a list, each folder keeping its own layout and sort | fe/app/Home.tsx | 1d | partial (grid/list toggle only) |
| P5 | Icon size slider in the icons view | fe/app/ProjectPage.tsx | 1d | not started |
| P6 | Sort: Newest first, Oldest first, Created, Modified | fe/app/ProjectPage.tsx | 1d | not started |
| P7 | Search projects | fe/app/ProjectPage.tsx | 1c | built |
| P8 | Hide/show the projects sidebar | fe/app/ProjectPage.tsx | 1d | not started |
| P9 | Each project row shows the first page of its last PDF (thumbnail) | be/routes/projects.js (thumbnail) | 1d | not started |
| P10 | Project folders: New folder…, Rename…, Delete… (contents move up), nested folders | fe/app/folders.ts | 1d | not started |
| P11 | Move a project into a folder by dragging or Move to folder… | fe/app/folders.ts | 1d | not started |
| P12 | Customise Folder…: colour row (No colour + 7 tag colours), ~190 symbols in categories, any emoji | fe/app/CustomiseFolderSheet.tsx | 1d | not started |
| P13 | Tags: New tag, Tags… on a project, right-click a tag to rename it or choose its colour | fe/app/ProjectPage.tsx | 1d | not started |
| P14 | Archive / Unarchive a project; Archived view | fe/app/ProjectPage.tsx, be/routes/projects.js | 1d | partial (archived hidden on Home) |
| P15 | Duplicate a project | fe/app/ProjectPage.tsx (copy) | 1d | not started |
| P16 | Rename project | fe/app/ProjectPage.tsx | 1d | not started |
| P17 | Remove from list (keeps the folder) | fe/app/ProjectPage.tsx | 1d | not started |
| P18 | Move project to the Bin / Recycle Bin, asking first | fe/app/ProjectPage.tsx | 1d | not started |
| P19 | Show in Finder / Show in File Explorer | fe/app/ProjectPage.tsx | 1d | not started |
| P20 | Missing project marked; Locate… points it at the moved folder | fe/app/ProjectPage.tsx (relocate) | 1d | not started |
| P21 | Open existing folder… as a project in place, without copying | fe/app/ProjectPage.tsx | 1d | partial (OpenProject action) |
| P22 | New project: choose LaTeX, Typst or Markdown first, then a template or Blank project | fe/app/ProjectPage.tsx | 1d | partial (Simple document only, decision 73) |
| P23 | Blank project here… inside the open folder | fe/app/ProjectPage.tsx | 1d | not started |
| P24 | Choose where to create the project (folder picker) | fe/app/ProjectPage.tsx | 1d | not started |
| P25 | Upload a .zip… (Overleaf export) as a new project; a Git repo inside is left out | be/routes/projects.js (import-zip) | 1a + 1d | partial (core extract_zip) |
| P26 | From arXiv…: an arXiv ID or URL becomes a project, with live progress | be/routes/arxiv.js, be/services/arxivService.js | 1a + 1d | partial (core extract_arxiv) |
| P27 | Sync with GitHub in a project's menu | fe/app/ProjectPage.tsx | 8b GitHub sync & settings repo | not started |
| P28 | Change template… in a project's menu | fe/app/ProjectPage.tsx | 11b import, export & transfer | not started |
| P29 | Convert to Typst project… / Convert to LaTeX project… in a project's menu | fe/app/ProjectPage.tsx | 9a | not started |
| P30 | Save as template… from a project (Home and editor) | fe/app/ProjectPage.tsx | 1d | not started |
| P31 | Back to <folder> in the editor's project menu opens Home at the project's folder | fe/app/EditorPage.tsx | 1d | not started |
| P32 | Open Spectrum on Home or All projects (setting) | fe/app/settings.ts (openOn) | 1d | not started |
| P33 | Project switcher opens at Home or the project's folder (setting) | fe/app/settings.ts (switcherOpensAt) | 1d | not started |
| P34 | Projects in a sync app's folder warned about, with Move to this computer… (copies and checks every file) | be/routes/projects.js (move-here), be/services/syncService.js | 8b | partial (sync roots detected, decision 27) |
| P35 | 1.10 migration notice: mirrored projects named, files the cloud copy has listed, Show in Finder, Dismiss | be/services/mirrorService.js, be/routes/sync.js | 1d | not started |
| P36 | Project list follows outside changes (folder moved, file added in Finder) | be/services/projectService.js | 1a | built |
| P37 | "Spectrum needs to be opened again" guard for a stale window | tauri/src/main.rs | 10a | not started |
| P38 | Pre-2.1 project: diagrams and images moved into `diagrams/` and `figures/` with a checkpoint first | be/services/projectService.js | 1d | not started |
| P39 | Get started block on Home was removed in 2.6.4; first-run page replaces it | CHANGELOG 2.6.4 | 1e first-run & migration | n/a (not a target) |

### Templates

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| T1 | Template gallery: general templates first, Academic (ACL, CVPR, NeurIPS, ICML, arXiv) | fe/app/ProjectPage.tsx, templates/manifest.json | 1d | not started |
| T2 | All 24 bundled templates (8 LaTeX general, 5 conference, 7 Typst, 4 Markdown) ship and compile | templates/ | 1d | partial (Simple document used) |
| T3 | Search templates | fe/app/ProjectPage.tsx | 1d | not started |
| T4 | Edit template: a working copy with Save template / Save as new template / Done bar | fe/app/ProjectPage.tsx, be/services/templateService.js | 1d | not started |
| T5 | Continue editing a template copy kept until Done | fe/app/ProjectPage.tsx | 1d | not started |
| T6 | Save as new template asks name, section and one-line description | fe/app/ProjectPage.tsx | 1d | not started |
| T7 | Your templates marked Yours and deletable; edited built-ins marked Edited | fe/app/ProjectPage.tsx | 1d | not started |
| T8 | Restore original for an edited built-in; unedited built-ins follow updates | be/services/templateService.js | 1d | not started |
| T9 | Upload a template | be/routes/projects.js (templates/upload) | 1d | not started |
| T10 | Typst Universe: searchable gallery section; a template becomes a project | fe/app/UniverseSheet.tsx, be/services/universeService.js | 1d | not started |

## Files & sidebar

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| F1 | File tree of the project, folders expandable | fe/editor/FileTree.tsx | 1c | partial (flat path list, decision: mockup) |
| F2 | Expand all / Collapse all | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F3 | New file… / New folder… / New .bib | fe/editor/FileTree.tsx | 1c | partial (no New .bib) |
| F4 | Rename… (inline in 3.0.0) | fe/editor/FileTree.tsx | 1c | built |
| F5 | Move to Bin… with Undo on macOS 15+; delete for good asks where a drive has no Bin | fe/editor/FileTree.tsx | 1c | partial (no Undo, no no-Bin path) |
| F6 | Upload files… / Upload folder… | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F7 | Drag files to move them between folders and reorder; order kept per folder | fe/editor/FileTree.tsx, be/routes/projects.js (file-order) | 1c follow-up | not started |
| F8 | Drop files from Finder into the tree | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F9 | Set as main file (marked in the tree) | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F10 | Edit diagram on a file under `diagrams/` | fe/editor/FileTree.tsx | 9b | not started |
| F11 | Show in Finder / File Explorer for a file | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F12 | Refresh | fe/editor/FileTree.tsx | 1c | built |
| F13 | Tree follows outside changes (watcher) | be/routes/projects.js (events) | 1a/1c | built |
| F14 | Main file detected on open (`% !TEX root`, documents list) | be/services/projectService.js | 1a | partial (detect_main_file, no UI) |
| F15 | Rename/move offers to update `\include`, `\input`, `\includegraphics`, `\bibliography`, `#include`, `image()`, Markdown links, after a Before updating references checkpoint | fe/editor/references.ts | 1c follow-up + 8 | not started |
| F16 | Search box filters file names | fe/editor/FileTree.tsx | 1c follow-up | not started |
| F17 | Search "In text": lines matching across the project, by file, first 100 | fe/editor/TextSearch.tsx, be/routes/projects.js (search) | 1c follow-up | not started |
| F18 | Search options Aa (case), ab (whole words), .* (regex); click opens the line with the match selected | fe/editor/textMatches.ts | 1c follow-up | not started |
| F19 | Quick Open `⌘P` to a file | fe/app/CommandPalette.tsx | 1c | built |
| F20 | Quick Open to an Outline heading by name; `>` there switches to commands | fe/app/CommandPalette.tsx | 2b | not started |
| F21 | Conflicted copies marked in the list with Compare, Use this copy, Delete copy | fe/editor/SyncBanners.tsx, be/routes/projects.js (conflict-copy) | 8b | partial (core conflict_copies) |
| F22 | Hidden: `.spectrum`, `.git`, build files; non-UTF-8 names shown | be/services/projectService.js | 1a | built (also hides node_modules etc., decision 24) |
| F23 | File dots by kind (3.0.0 addition, decision 69) | — | 1c | built |
| F24 | Open a binary or image file shows a preview instead of text | fe/app/EditorPage.tsx | 2c | not started |

## Editor

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| E1 | Text buffer, undo/redo grouped by pause and word | fe/editor/latexEditor.ts (CodeMirror) | 2a | partial (core, no view) |
| E2 | CRLF/CR files kept as they were on save | — | 2a | partial (core) |
| E3 | LaTeX highlighting | fe/latex/lang.ts | 2b | not started |
| E4 | Typst highlighting (fast on 20k-line files) | fe/editor/typstChunks.ts | 2b | not started |
| E5 | Markdown highlighting | fe/editor/languages.ts | 2b | not started |
| E6 | BibTeX highlighting | fe/editor/languages.ts | 2b | not started |
| E7 | Folding with gutter; Fold/Unfold `⌥⌘[ ]`, Fold all/Unfold all `⌃⌥[ ]` | fe/app/shortcuts.ts | 2b | not started |
| E8 | Line numbers, active line, bracket matching | fe/editor/latexEditor.ts | 2c | not started |
| E9 | Long lines wrap under their own indent; formulas break between terms | fe/editor/latexEditor.ts | 2c | not started |
| E10 | Find and replace `⌘F`, find next/previous (`F3`/`⇧F3` on Windows) | fe/app/EditorPage.tsx (@codemirror/search) | 2d | not started |
| E11 | Go to line `⌃G` | fe/app/shortcuts.ts | 2d | not started |
| E12 | Multiple cursors: `⌘D` next match, `⇧⌘L` all matches, `⌥⌘↑/↓` cursor above/below | fe/app/shortcuts.ts | 2d | not started |
| E13 | Alt-click adds a cursor, in every file | guide (TexLab) | 2d | not started |
| E14 | Indent/unindent `⌘] ⌘[`, Tab on a selection indents, Tab alone indents at the cursor (4 spaces) | fe/editor/latexEditor.ts | 2d | not started |
| E15 | Comment/uncomment `⌘/` (per language) | fe/app/shortcuts.ts | 2d | not started |
| E16 | Move lines `⌥↑/↓`, duplicate `⇧⌥↑/↓`, delete lines `⇧⌘K` | fe/app/shortcuts.ts | 2d | not started |
| E17 | Bold/italic/emphasis `⌘B ⌘I ⇧⌘E` wrap in `\textbf`/`\textit`/`\emph` (language-aware) | fe/app/shortcuts.ts | 2d | not started |
| E18 | Go to matching bracket `⇧⌘\` | fe/app/shortcuts.ts | 2d | not started |
| E19 | IME input (Cantonese, Pinyin, Japanese) | — | 2d | not started |
| E20 | Save `⌘S`; unsaved marks on tabs | fe/app/EditorPage.tsx | 2c | not started |
| E21 | Unsaved changes flushed on quit; "Changes weren't saved" if not | tauri/src/main.rs (flush) | 10a | not started |
| E22 | File changed on disk reloads when clean; asks keep mine / use theirs / compare when dirty; the unused text kept in a checkpoint | fe/editor/heldFiles.ts, fe/app/EditorPage.tsx | 2c + 8 | not started |
| E23 | File deleted on disk marked in its tab instead of re-created by a save | fe/editor/heldFiles.ts | 2c | not started |
| E24 | Editor font: system, 4 bundled (JetBrains Mono, Fira Code, IBM Plex Mono, Source Code Pro) or any installed by name; font size | fe/app/settings.ts | 2e | not started |
| E25 | Editor themes, light and dark chosen separately: Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, Monokai, Rosé Pine, Ayu, Texifier-like, Overleaf-like | fe/editor/editorThemes.ts | 2e | not started |
| E26 | 2.8's Spectrum themes kept as Spectrum Classic Light/Dark; new Spectrum Light/Dark the default | REWRITE_V3_PLAN (fix) | 2e | not started |
| E27 | Each theme colour changeable per mode (bg, fg, gutter, active line, selection, cursor, command, comment, bracket, maths, argument, environment) | fe/app/settings.ts (editorColours) | 2e | not started |
| E28 | Editing keys Standard / Vim / Emacs; `:w` saves in Vim | fe/editor/keymaps.ts | 2e | not started |
| E29 | Shortcuts customisable (see Settings S-SH) | fe/app/shortcuts.ts | 2e | not started |
| E30 | Errors and warnings of the last compile underlined at their place, hover for the message | fe/editor/compileMarks.ts | 3d / 5c | not started |
| E31 | Overfull/underfull boxes not underlined unless the setting is on | fe/app/settings.ts (underlineBoxWarnings) | 5c | not started |
| E32 | Right-click menu: Cut, Copy, Paste, Preview this figure, Add to-do here, Cite from Zotero…, Jyutping wraps, Format document, spelling fixes | fe/app/EditorPage.tsx | 2c (+ owners) | not started |
| E33 | Scope bars by nesting depth (3.0.0 plan addition) | plan | 2c | not started |
| E34 | Paste or drop an image into the editor saves it to `figures/` and opens Insert figure | fe/app/EditorPage.tsx | 2f Insert & floats | not started |
| E35 | Large files stay fast (20k lines) | fe/editor/typstChunks.ts | 2c | not started |

### Smart editing, completion & snippets

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| C1 | Typing `\` lists commands that work at the cursor (maths vs text), with symbols | fe/editor/latexCommands.ts, fe/editor/latexContext.ts | 2d | not started |
| C2 | `/` at the start of a word in text lists commands too | fe/editor/latexEditor.ts | 2d | not started |
| C3 | Project's own `\newcommand` / `\DeclareMathOperator` in completion | fe/editor/latexEditor.ts | 2d | not started |
| C4 | Commands with arguments insert with Tab fields (`\frac` numerator → denominator) | fe/editor/latexEditor.ts | 2d | not started |
| C5 | `\ref{` lists labels, `\cite{` BibTeX keys, `\usepackage{` packages, `\includegraphics{`/`\input{` project files | fe/editor/latexEditor.ts | 2d | not started |
| C6 | `\beg` + Tab fills shared prefix to `\begin{`; environments from loaded packages/classes and the project, marked with source; maths-only ones in maths | fe/editor/latexEnvs.ts | 2d | not started |
| C7 | Return after `\begin{…}` adds the matching `\end{…}` at the same indent | fe/editor/latexEditor.ts | 2d | not started |
| C8 | `$` with a selection wraps it in maths; `(` brackets a selection | fe/editor/smartTyping.ts | 2d | not started |
| C9 | `$`, `\(`, `\[`, `\left(` add closers; Backspace in an empty pair removes both (setting) | fe/editor/smartTyping.ts | 2d | not started |
| C10 | `''` gives two quotes; `'`/`"` not auto-paired in LaTeX/Markdown, `'` not in Typst | CHANGELOG 2.6.3 | 2d | not started |
| C11 | Return after `\item` continues the list, on an empty item ends it; Typst lists too (setting) | fe/editor/smartTyping.ts | 2d | not started |
| C12 | `\ref{notes:` completes labels of a linked `\externaldocument` | fe/editor/latexEditor.ts | 3d compile extras | not started |
| C13 | Typst completion of the project's `#let` functions without Tinymist; `⌘`-click a quoted path opens it | fe/editor/latexEditor.ts | 2d | not started |
| C14 | Markdown/Typst citation completion `@key`, `[@key]`; Markdown `@` lists labels (`@fig:`) | fe/editor/latexEditor.ts | 2d | not started |
| C15 | Citation with a page/pages/chapter/section locator, in LaTeX, Typst and Markdown | fe/editor/citationLocator.check.ts | 7b research & references UI | not started |
| C16 | Built-in snippets for common environments | fe/editor/userSnippets.ts | 2d | not started |
| C17 | User snippets: name, trigger, file kinds, text with `${1:x}`, `${0}`; trigger + Tab or from Insert (+); synced with settings | fe/app/SnippetsPane.tsx, fe/editor/userSnippets.ts | 2d | not started |
| C18 | Maths at the cursor drawn under it (LaTeX, Markdown) with the document's macros; note for unknown commands; Esc hides | fe/editor/mathPreview.ts, fe/editor/texMacros.ts | 2d | not started |
| C19 | Preview this figure (`⌥⌘P` / `⇧⌥P`): tikzpicture/table/figure/equation or selection compiled alone with the preamble, confined, in a panel under the editor, recompiling a second after changes | fe/editor/figurePreview.ts, be/services/figurePreview.js | 3d compile extras | not started |
| C20 | AI autocomplete `⌥/`, accept with Tab; abandons on typing/moving/Esc and re-asks on pause | fe/app/EditorPage.tsx (suggest) | 6b | not started |
| C21 | Mermaid blocks in Markdown highlighted as diagrams | fe/editor/mermaidBlocks.ts | 2b | not started |

### Language servers

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| LS1 | TexLab 5.26 bundled, started per open project | be/services/texlabService.js | 5a/5c | partial (client in spectrum-lsp) |
| LS2 | TexLab squiggles: undefined refs/cites, duplicate/unused labels, missing braces, wrong `\end`, `.bib` mistakes, with hover message | fe/editor/lsp/texlab.ts | 5c | not started |
| LS3 | Hover shows a citation's entry or what a `\ref` points to | fe/editor/lsp/texlab.ts | 5c | not started |
| LS4 | Go to definition `F12` / `⌘`-click on `\ref`, `\cite`, `\input` | fe/editor/lsp/texlab.ts | 5c | not started |
| LS5 | Find references `⇧F12` in a panel under the editor | fe/editor/lsp/texlab.ts | 5c | not started |
| LS6 | Rename `F2` across the project incl. `.bib`, listing files and counts, Before rename checkpoint, rollback if a save fails | fe/editor/lsp/rename.ts | 5c | not started |
| LS7 | Syntax check before compiling: lists missing braces / mismatched environments, asks, Cancel goes to the first | fe/app/EditorPage.tsx | 5c | not started |
| LS8 | TexLab completion on (3.0.0 change, decision 43) | — | 5c | partial |
| LS9 | Tinymist 0.15.10 download (31 MB, SHA-256) from Settings › Engines › Typst | be/routes/engines.js | 3e engine downloads | not started |
| LS10 | Tinymist completion, hovers, definition, references, rename, errors as you type, linter warnings | fe/editor/lsp/tinymist.ts | 5c | not started |
| LS11 | Format document with typstyle `⇧⌥F` | fe/editor/lsp/tinymist.ts | 5c | not started |
| LS12 | Tinymist errors replace compile marks when the project is on its Typst version | fe/app/EditorPage.tsx | 5c | not started |
| LS13 | Projects whose root has `[ ] ^ \|` skip TexLab (decision 44) | be/services/texlabService.js | 5a | built |
| LS14 | Crash restart with backoff, documents reopened | — | 5a | partial |

## Insert (Insert menu, figures, tables, Jyutping)

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| I1 | Insert (+) LaTeX: Section, Subsection, Subsubsection, Itemize, Enumerate, Equation, Algorithm, Code listing, Citation, Reference, Label, Footnote, Comment, Link | fe/app/EditorPage.tsx | 2f Insert & floats | not started |
| I2 | Insert (+) Typst/Markdown: Heading, List, Block maths, Code block, Strong, Emphasis, Maths, Footnote, Comment, Reference | fe/app/EditorPage.tsx | 2f | not started |
| I3 | Insert (+) also holds Figure…, Table…, Draw a diagram…, Jyutping…, user snippets | fe/app/EditorPage.tsx | 2f | not started |
| I4 | Floats panel opens at the figure or table card | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I5 | Insert figure: drop, paste or choose an image, saved in `figures/` without overwriting, caption, label, width | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I6 | HEIC, WebP, SVG converted for pdfLaTeX | fe/editor/floats.ts | 2f | not started |
| I7 | Project figures shown as tiles to pick | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I8 | Several images: side by side or grid of 2–4 columns, sub-figures (a)(b), separate figures, one caption; line up along tops; reorder | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I9 | Size by width/height/scale, fit in box, crop edges | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I10 | Alt text field (needed for Typst PDF/UA-1) | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I11 | Placement letters H h t b p ! (H default), Span both columns (`figure*`) | fe/editor/floats.ts | 2f | not started |
| I12 | Typst placement (In the text, Top, Bottom, Top or bottom), `scope: "parent"` | fe/editor/floats.ts | 2f | not started |
| I13 | Insert table grid with header row; paste cells from Numbers/Excel/CSV; Paste CSV | fe/editor/tools/FloatsTab.tsx, fe/editor/tableRows.ts | 2f | not started |
| I14 | Table environments tabular, tabularx, xltabular (breaks across pages, repeats header) | fe/editor/floats.ts | 2f | not started |
| I15 | Line presets Booktabs, Grid (double line under header), Minimal, None; click between rows/columns to toggle a line; "changed from preset" note | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I16 | Lines at row/column buttons from the keyboard | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I17 | Merge cells (`\multicolumn`, `\multirow`, Typst spans); short rule `\cmidrule`/`\cline` | fe/editor/floats.ts | 2f | not started |
| I18 | Column alignment Left, Centre, Right, Fill (X); numbers lined up on the decimal point (siunitx S) | fe/editor/floats.ts | 2f | not started |
| I19 | Line breaks in cells (makecell), notes under the table (threeparttable), escape special characters | fe/editor/floats.ts | 2f | not started |
| I20 | Typst `#table` with `table.hline/vline`; Markdown pipe table (no merges) | fe/editor/floats.ts | 2f | not started |
| I21 | Needed packages (graphicx, float, booktabs, tabularx, …) added before `\begin{document}` | fe/editor/preamble.ts | 2f | not started |
| I22 | Source folded away and editable; Copy the source | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I23 | "What these options mean" explanations | fe/editor/tools/FloatsTab.tsx | 2f | not started |
| I24 | Insert a composer diagram as a figure (`\includestandalone`, Typst `#figure(include …)`, PDF/PNG for others) | fe/editor/tools/FloatsTab.tsx | 2f + 9b | not started |
| I25 | Jyutping sheet: Off / Apply when compiling / In the .tex file | fe/app/JyutpingSheet.tsx | 9a | not started |
| I26 | Apply when compiling reads each paragraph whole (行 hong4 vs haang4); verbatim/code left alone | be/services/jyutpingService.js | 9a + 3d | not started |
| I27 | In the .tex file: Add to preamble, wrap selection in `jyutpingscope` or `\xjyutping*{}`, insert scope at cursor | fe/app/JyutpingSheet.tsx | 9a | not started |
| I28 | Every xjyutping option (size, position, cell width, colours, fancy tones, lazy sounds, script, line breaks, alignment) with a live sample preview, saved with the project | fe/app/JyutpingSheet.tsx, be/routes/jyutping.js | 9a | not started |
| I29 | Chinese support added (xeCJK or luatexja-fontspec) with the chosen font; changing font/engine edits existing lines | be/services/jyutpingService.js | 9a | not started |
| I30 | Six bundled Chinese fonts (Noto Serif/Sans TC/SC, LXGW WenKai TC/SC) or any installed font | be/data/fonts.json | 9a + 3d | not started |
| I31 | Auto/pdfLaTeX switches to XeLaTeX while Jyutping is on, logged | be/services/compileService.js | 3d | not started |
| I32 | Completion lists xjyutping commands; right-click wraps | fe/app/EditorPage.tsx | 9a | not started |

## Compile & engines

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| CE1 | Compile `⌘↩` builds the main file | be/services/compileService.js | 3a + 4b | partial (runner; button not wired) |
| CE2 | Compile the open document `⇧⌘↩`; menu lists other documents to compile once | fe/app/EditorPage.tsx | 3d | not started |
| CE3 | Compile becomes Stop while running; Stop compilation keeps the last PDF | be/routes/compile.js | 3a + 3d | partial (cancel in runner) |
| CE4 | Engines pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk (`-norc`), Tectonic, Auto | be/services/compileService.js | 3a | partial |
| CE5 | Auto picks from `% !TEX program` and packages, falls back to Tectonic | be/services/compileService.js | 3a | partial |
| CE6 | Built-in Tectonic 0.17 downloads bundle and packages on first use; offline compile says so | be/services/engineService.js | 3a | partial |
| CE7 | Built-in Typst 0.15.1; projects pin a version; older versions installed/removed in Settings | be/services/typstService.js | 3a + 3e | partial (pin only) |
| CE8 | Markdown via pandoc to LaTeX or Typst (PDF engine per project) | be/services/markdownService.js | 3a | partial |
| CE9 | Compiler (this project) saved in `.spectrum/settings.json`; Use the default; Use for all projects | fe/app/EditorPage.tsx | 3d | partial (settings fields in core) |
| CE10 | Auto compile Off or after 1–10 s pause; newer auto compile replaces a stale one | fe/app/EditorPage.tsx | 3d | not started |
| CE11 | Typst Auto compile As you type (0.3 s) | fe/app/EditorPage.tsx | 3d | not started |
| CE12 | Bibliography tool Auto/BibTeX/Biber; `% !BIB program` | be/services/compileService.js | 3a | partial |
| CE13 | Fast draft mode (one pass, images as boxes) | be/services/compileService.js | 3a + 3d | partial (draft flag) |
| CE14 | Compile error handling: Try despite errors / Stop on first error | fe/app/settings.ts | 3a + 3d | partial (halt_on_error) |
| CE15 | `% !TEX root` in a chapter compiles the document it names | be/services/compileService.js | 3a | partial |
| CE16 | makeindex and makeglossaries when needed | be/services/compileService.js | 3a | partial |
| CE17 | Extra passes only when the log asks or read-back files changed | be/services/compileService.js | 3a | partial |
| CE18 | Build files (.aux, .bbl, .toc) kept per document per compiler; unchanged doc in one pass; damaged .aux cleared and retried | be/services/compileService.js | 3d compile extras | not started (decision 65) |
| CE19 | Biber skipped when citations and .bib are unchanged | be/services/compileService.js | 3d | not started (decision 65) |
| CE20 | Latexmk in a kept folder of its own, back to the last good build after error/Stop | be/services/compileService.js | 3d | not started |
| CE21 | Precompile the preamble (pdfLaTeX format, checked to give the same pages, remade when the preamble changes) | be/services/preambleFormat.js | 3d | not started (decision 65) |
| CE22 | Only the open chapter (`\includeonly`) with Whole document to go back | fe/app/EditorPage.tsx | 3d | not started (decision 65) |
| CE23 | `\externaldocument` (xr-hyper): linked document compiled first when stale | be/services/compileService.js | 3d | not started (decision 65) |
| CE24 | `% !TEX recipe = …` with `%DOC%`, `%OUTDIR%`, `%DIR%`; `% !TEX options`; untrusted runs only TeX programs | be/services/buildRecipe.js | 3d | not started (decision 65) |
| CE25 | Recompile from scratch (clears kept files) and Recompile all (linked documents first) | fe/app/EditorPage.tsx | 3d | not started |
| CE26 | Compile with page colour (PDF gets the preview's light page colour; document's own colour wins) | fe/app/EditorPage.tsx | 3d | not started (decision 65) |
| CE27 | macOS sandbox for every LaTeX compile program incl. Markdown and composer compiles; restricted shell escape stays on | be/services/compileSandbox.js | 3b | partial (crate) |
| CE28 | Blocked actions explained in Logs | be/services/compileSandbox.js | 3b | partial (blocked_notes) |
| CE29 | Trust this project (asks first; full shell escape, no sandbox; kept on this computer, not in the project; copies need trust again) | be/services/trustService.js | 3b + 3d | partial (trust store) |
| CE30 | Windows: Trust only turns on shell escape; matched by folder creation time | be/services/trustService.js | 3b | partial |
| CE31 | Confined Tectonic reaches the network through Spectrum's proxy gate | be/services/networkProxy.js | 3d | not started (decision 65) |
| CE32 | Tectonic warm-up | be/services/tectonicWarmUp.js | 3d | not started (decision 65) |
| CE33 | Biber for Tectonic: downloaded on need; notice over the PDF with one-click download and recompile when offline | fe/editor/BiberNotice.tsx, be/routes/engines.js | 3e | not started |
| CE34 | Live output while compiling: engine output in the PDF's place, with a status line (file downloading/reading, counts); per engine setting | fe/editor/LiveCompile.tsx | 3d | partial (Output events) |
| CE35 | Open Logs when a compile fails (setting) | fe/app/settings.ts | 3d | not started |
| CE36 | Checkpoint after a successful compile | be/services/versionService.js | 8 | not started |
| CE37 | MiKTeX installs missing packages without asking (hidden window) | be/services/compileService.js | 3a | partial |
| CE38 | TeX folder for a second TeX installation, searched before PATH | fe/app/settings.ts (texFolder) | 3a + 11a | partial (with_tex_folder) |
| CE39 | Login-shell PATH plus texbin/Homebrew/MiKTeX found | tauri/src/main.rs | 3a | partial |
| CE40 | Windows: Biber finds `.bib` in folders the code page can't spell (大學) | be/services/compileService.js | 3a | partial |
| CE41 | Markdown CJK text in Noto Serif SC/TC unless front matter names a font; XeLaTeX for it; Korean warning | be/services/markdownService.js | 3d | not started (decision 65) |
| CE42 | Markdown citations APA 7 unless `csl:`; pandoc-crossref `@fig:` numbers | be/services/markdownService.js | 3a | partial (csl, crossref filter) |
| CE43 | Markdown `include:` front matter to split files; Logs names the file of each error | be/services/markdownService.js | 3a + 3d | partial (mapping errors deferred) |
| CE44 | Markdown errors mapped back to `.md` lines | be/services/markdownService.js | 3d | not started (decision 65) |
| CE45 | Markdown `slides: true` makes Beamer slides | be/services/markdownService.js | 3a | partial |
| CE46 | Mermaid blocks in Markdown drawn in the PDF and Word; caption makes a numbered figure | be/routes/markdown.js (mermaid) | 3d | not started |
| CE47 | Typst watch mode | be/services/typstService.js | 3d | not started (decision 65) |
| CE48 | Typst export: PDF/A-2b, PDF/UA-1, PNG and SVG (zipped per page), HTML (experimental) | be/services/typstService.js | 3d | not started (SVG in decision 65) |
| CE49 | Failed Typst export lists each place in Logs and marks the editor | fe/app/EditorPage.tsx | 3d | not started |
| CE50 | Older pinned Typst handled (fletcher version, PDF include from 0.14) | be/services/typstService.js | 3a + 9b | partial |
| CE51 | Compile writes only the PDF into the project; SyncTeX and kept files in the data folder | be/services/compileService.js | 3a | partial (decision 63) |
| CE52 | Pre-2.1 projects: diagrams/images moved on first compile | be/services/compileService.js | 1d | not started |
| CE53 | xjyutping folder setting overrides Spectrum's copy | fe/app/settings.ts | 3d | not started |

### Engine downloads & system check

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| EN1 | Engines manifest with pinned versions and SHA-256 | be/data/engines.json | 3a | built (decision 61) |
| EN2 | Install/remove Typst versions; default version setting | be/routes/engines.js | 3e engine downloads | not started |
| EN3 | Download/remove Tinymist | be/routes/engines.js | 3e | not started |
| EN4 | Download pandoc 3.12.1 on request | be/routes/engines.js | 3e | not started |
| EN5 | Download/remove Biber for Tectonic | be/routes/engines.js | 3e | not started |
| EN6 | System check: which TeX tools are found, broken or missing, with install hints; Check again | fe/app/SettingsSheet.tsx, be/routes/system.js | 3e | not started |
| EN7 | Python and `ddgs` found, which Python DDGS uses | be/services/python.js | 3e | not started |
| EN8 | App data and default projects folder paths shown | fe/app/SettingsSheet.tsx | 11a Settings window | not started |

## PDF

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| PDF1 | PDF preview fits the page width by default | fe/editor/PdfPreview.tsx | 4a | not started |
| PDF2 | Zoom: pinch, `⌘`+wheel, `⌘=`/`⌘−`; fit width `⌘0`, fit page `⌘9` | fe/editor/PdfPreview.tsx | 4a | not started |
| PDF3 | Page colours: White/Cream/Sepia/Grey in light, Dark/Black/Dimmed/White in dark | fe/editor/PdfPreview.tsx | 4a | not started |
| PDF4 | Two-page view | fe/app/EditorPage.tsx | 4c PDF extras | not started |
| PDF5 | Sticky notes on the PDF ("Add a note here"), saved in `.spectrum/notes` | fe/app/EditorPage.tsx, be/routes/notes.js | 11c to-dos & PDF notes | not started |
| PDF6 | Links work: contents, `\ref`, `\eqref`, `\cite` jump; web links open the browser; links into a linked document open its PDF | fe/editor/PdfPreview.tsx | 4b | not started |
| PDF7 | Double-click PDF → source line (SyncTeX for LaTeX; word matching for Typst/Markdown; Tinymist exact on its version) | fe/editor/synctex.ts, be/services/synctex.js | 3c + 4b | partial (parser) |
| PDF8 | Double-click source → PDF scrolls there | fe/editor/synctex.ts | 3c + 4b | partial (parser) |
| PDF9 | Jump highlight fades; colour and duration settings; double-click jumping can be turned off | fe/app/settings.ts (sync*) | 4b | not started |
| PDF10 | Document outline sidebar: Contents (PDF bookmarks, current marked, or source headings) and Pages (thumbnails, current outlined) | fe/editor/PdfSidebar.tsx | 4c | not started |
| PDF11 | Find in PDF `⌘F` with previous/next and all matches highlighted (slim bar) | fe/editor/PdfFindBar.tsx, fe/editor/pdfFind.ts | 4b | not started |
| PDF12 | Editable page number; Page Up/Down, Home, End | fe/editor/PdfPreview.tsx | 4b | not started |
| PDF13 | Each document's PDF opens at the page it was left at | fe/app/EditorPage.tsx | 4c | not started |
| PDF14 | Presentation mode: full screen, one page, arrows and Escape | fe/editor/PdfPresentation.tsx | 4c | not started |
| PDF15 | PDF follows the open file (setting, on): another document's source or a `% !TEX root` chapter shows its PDF; Compile builds what shows | fe/app/EditorPage.tsx | 4b | not started |
| PDF16 | Page bar names the showing PDF and switches between documents' PDFs | fe/app/EditorPage.tsx | 4b | not started |
| PDF17 | Download the PDF (Finder-style "Thesis v1.2 2.pdf" naming) | fe/app/EditorPage.tsx, tauri/src/main.rs (download_path) | 4c | not started |
| PDF18 | Export to Word (.docx) | be/routes/projects.js (export/docx) | 11b import, export & transfer | not started |
| PDF19 | Send page to agent (right-click), with the source line of the spot | fe/editor/agent/handoff.ts | 6e agent workspace UI | not started |
| PDF20 | Add to-do here on a PDF page | fe/app/EditorPage.tsx | 11c | not started |
| PDF21 | Live (Typst): Tinymist's preview as you type; says why when it can't show, Back to the PDF | fe/editor/liveFrame.ts, be/routes/tinymist.js | 4c | not started |
| PDF22 | Markdown live preview (eye): maths, Mermaid, numbered refs, pictures; follows scroll; double-click goes to the line | fe/editor/MarkdownPreview.tsx, fe/editor/previewText.ts | 4c | not started |
| PDF23 | Chapter-only compile named in the PDF pane | fe/app/EditorPage.tsx | 3d | not started |
| PDF24 | 100-page TikZ PDF within memory budget; tile cache | — | 4a | not started |

## Diagnostics & logs

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| D1 | Log parsed: errors first, warnings, file and line, for pdfLaTeX/XeLaTeX/LuaLaTeX/Latexmk/Tectonic | fe/editor/compileLog.ts, be/services/compileLog.js | 3c | partial (parser) |
| D2 | Typst diagnostics parsed | be/services/typstService.js | 3c | partial |
| D3 | Tools › Logs: Warnings and errors list, rows jump to the line; Full log | fe/editor/tools/LogsTab.tsx | 3d | not started |
| D4 | Tools opens on Logs when the last compile had errors | fe/app/EditorPage.tsx | 3d | not started |
| D5 | Fix with AI on a log error: fix compiled on a copy first, "Builds." / "Still fails at"; opens Settings › Models without a model | fe/editor/tools/LogsTab.tsx | 6b | not started |
| D6 | Status line of the compile (compileStatus) | fe/editor/compileStatus.ts | 3d | not started |
| D7 | Diagnostic details / Copy diagnostics in Settings | fe/app/SettingsSheet.tsx | 11a | not started |

## Spelling & grammar

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| SG1 | Spelling as you type in `.tex`, `.typ`, `.md`, `.txt`, red underline (setting) | fe/editor/spellcheck.ts | 5c | partial (checker crate) |
| SG2 | Hunspell 1.7.6 with SCOWL en_AU-large + AussieDic + en_US-recognition chain | be/services/spellService.js | 5b | partial |
| SG3 | US, British, Canadian, Indian English dictionaries | be/services/spellService.js | 5b | partial |
| SG4 | Right-click: suggestions, Add to dictionary, Add to project dictionary, Ignore | fe/app/EditorPage.tsx | 5c | not started |
| SG5 | Project dictionary in `.spectrum`; main dictionary editable in Settings | be/routes/language.js | 5c + 5d | not started |
| SG6 | Languages list (AU English default); per-project list that travels | fe/app/settings.ts (languages) | 5d languages & grammar panel | not started |
| SG7 | Language per paragraph from markup (babel, polyglossia, Typst `text(lang:)`, Markdown `lang`, Pandoc spans) then script, then dictionaries vote | be/services/grammarService.js | 5d | not started (decision 40) |
| SG8 | Dictionary catalogue (wooorm, LibreOffice) downloaded on request with SHA-256 and self-test | be/data/languages.json | 5d | not started (decision 40) |
| SG9 | Traditional Chinese: stray Simplified-only characters underlined with Traditional suggestions (OpenCC) | be/data/opencc | 5d | not started |
| SG10 | Prose masking for LaTeX, Typst, Markdown | be/services/grammarService.js | 5b | partial |
| SG11 | Check grammar `⇧⌘;`: panel in the PDF's place, issues underlined and listed with sentence, one-click fix, Ignore, Ignore rule (project) | fe/editor/GrammarPanel.tsx | 5d | not started |
| SG12 | Harper 3.x for English in the chosen dialect | be/services/grammarService.js | 5b | partial |
| SG13 | LanguageTool 6.8 download (~310 MB, jars + Temurin, SHA-256), run locally only while checking; cancellable | be/services/languageToolService.js | 5d | not started (decision 40) |
| SG14 | English grammar via Harper or LanguageTool (setting) | fe/app/settings.ts | 5d | not started |
| SG15 | Style suggestions (off), serial comma (flagged by default) | fe/app/settings.ts | 5b + 5d | partial |
| SG16 | Panel names the languages without a grammar checker | fe/editor/GrammarPanel.tsx | 5d | not started |
| SG17 | Ignored rules file per project | be/routes/language.js (grammar/ignored) | 5d | not started (decision 40) |

## Outline & to-dos

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| O1 | Outline of the main file's headings, click to jump | fe/editor/outline.ts | 2b | not started |
| O2 | With TexLab: whole document across `\input`, section numbers from the last compile, figures/tables by caption | fe/editor/lsp/outline.ts | 5c | not started |
| O3 | Typst outline follows `#include` at any depth, numbered from the last compile, whole document when a chapter is open | fe/editor/outlines.ts | 2b | not started |
| O4 | Markdown outline | fe/editor/outlines.ts | 2b | not started |
| TD1 | Mine: to-dos with tick box, text, optional link (source line found again by text, PDF page, reference), Edit, Delete | fe/editor/TodosList.tsx, fe/editor/todos.ts | 11c to-dos & PDF notes | not started |
| TD2 | In the source: `\todo`, `\missingfigure`, `\fixme`, fixme `\fx*`, `TODO`/`FIXME`/`XXX`, `// TODO`, `<!-- TODO -->` | fe/editor/todos.ts | 11c | not started |
| TD3 | Add box with Return or +, stays at the top; Open/Done/All with counts | fe/editor/TodosList.tsx | 11c | not started |
| TD4 | Add to-do here (editor right-click) links selected words or the line | fe/app/EditorPage.tsx | 11c | not started |
| TD5 | Notes on a to-do (up to 4000 chars), two lines until clicked | fe/editor/TodosList.tsx | 11c | not started |
| TD6 | Edit in place by double-click; Return / ⌘Return saves, Esc reverts | fe/editor/TodosList.tsx | 11c | not started |
| TD7 | Delete and Clear done with Undo | fe/editor/TodosList.tsx | 11c | not started |
| TD8 | Groups: New group, starter groups (Checking, Spelling, References, Still to write) showing their colour, fold, rename, move up/down, delete (keeps to-dos, Undo) | fe/editor/TodosList.tsx | 11c | not started |
| TD9 | Drag to a group, to the top, or between to-dos; Esc cancels; Move up/down/to group from the row's arrows button | fe/editor/TodosList.tsx | 11c | not started |
| TD10 | Colours from the wheel without blue; group colour; ungrouped get the least-similar of five | fe/editor/todos.ts | 11c | not started |
| TD11 | Highlight of linked words in the to-do's colour, follows typing; "text changed" / "text removed" | fe/editor/todoHighlights.ts | 11c | not started |
| TD12 | New to-dos go at the end or by line (setting) | fe/app/settings.ts (todoPlacement) | 11c | not started |
| TD13 | Sidebar search finds to-dos by text, notes, links and group | fe/editor/TodosList.tsx | 11c | not started |
| TD14 | Send to agent on a to-do | fe/editor/agent/handoff.ts | 6e | not started |
| TD15 | Each to-do a file in `.spectrum/todos`; groups in project settings; old order kept | be/routes/todos.js | 11c | not started |

## Document insights

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| DI1 | Panel in the PDF's place with tabs Overview, Headings, Figures, Tables, Equations, Labels, Citations, To-dos, with counts | fe/editor/InsightsPanel.tsx | 11d document insights | not started |
| DI2 | Rows show number and page from the last compile (.aux; Typst eval), click jumps | fe/editor/insights.ts | 11d | not started |
| DI3 | Markdown: headings/figures/tables/equations/citations/labels from source; prose word count | fe/editor/insights.ts | 11d | not started |
| DI4 | Overview: counts, submission metadata (title, authors, keywords, date, abstract), Copy submission metadata | fe/editor/InsightsPanel.tsx | 11d | not started |
| DI5 | texcount word counts; says why when none (not found, its error); Windows non-ASCII paths | be/services/statsService.js | 11d | not started |
| DI6 | Tinymist word count of the PDF for Typst | fe/editor/lsp/tinymist.ts | 11d | not started |
| DI7 | Unused/duplicate labels and missing citations from TexLab marked | fe/editor/InsightsPanel.tsx | 11d | not started |
| DI8 | Out-of-date marker when source changed; Refresh | fe/editor/InsightsPanel.tsx | 11d | not started |

## Research & references

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| R1 | References mode: paste DOI, ISBN, link, arXiv ID, title, formatted citation (APA/IEEE/Chicago/MLA), BibTeX or RIS | fe/editor/Composer.tsx, be/services/referenceService.js | 7 + 7b research & references UI | not started |
| R2 | Each reference a card: entry type (Biber types), fields, key, the entry as written, edition menu, locator; Add to .bib only / Add & insert citation | fe/editor/ReferenceDraftCard.tsx | 7b | not started |
| R3 | New entry by hand | fe/editor/Composer.tsx | 7b | not started |
| R4 | DOI via doi.org content negotiation (Crossref, DataCite), Crossref fallback | be/services/referenceService.js | 7 | not started |
| R5 | arXiv API, published DOI preferred | be/services/referenceService.js | 7 | not started |
| R6 | Links read for publisher metadata, JSON-LD, displayed BibTeX (alphaXiv); search connections for blocked pages (Exa Contents) | be/services/referenceService.js | 7 | not started |
| R7 | Title search on Crossref with candidates to choose | be/services/referenceService.js | 7 | not started |
| R8 | Books from Open Library, Google Books, Crossref; cite any edition | be/routes/references.js (editions) | 7 | not started |
| R9 | Keys Surname+Year, accents stripped, particles joined, a/b suffixes; DOI/arXiv duplicates refused | be/services/bibEntry.js | 7 | not started |
| R10 | Classic BibTeX: `howpublished` for URL in `plain`; Biber types written for BibTeX projects | be/services/bibEntry.js | 7 | not started |
| R11 | Titles get LaTeX quotes keeping apostrophes; arXiv URL kept; unknown dates left empty | be/services/bibEntry.js | 7 | not started |
| R12 | Insert `\cite` at the cursor after adding (setting) | fe/app/settings.ts (autoInsertCite) | 7b | not started |
| RS1 | Research tab: question, sources (OpenAlex, Semantic Scholar, arXiv, Crossref, PubMed, .bib, Web, Zotero), years, preprints | fe/editor/research/ResearchPanel.tsx, be/services/researchService.js | 7 + 7b | not started |
| RS2 | All sources at once; one failing doesn't stop others | be/services/researchService.js | 7 | not started |
| RS3 | Results merged by DOI/arXiv/title, fullest record, published over preprint | fe/editor/research/results.ts | 7 | not started |
| RS4 | Result shows authors, year, venue, sources, citations, Open access, Preprint, In .bib | fe/editor/research/ResearchPanel.tsx | 7b | not started |
| RS5 | Sort the results with AI: why it matters, keep/drop suggestion, theme | be/services/researchService.js | 7 + 6a | not started |
| RS6 | Sessions in `.spectrum/research` with a log of searches; Search again; All/Kept/Dropped/To decide; Delete session | be/routes/research.js | 7b | not started |
| RS7 | Keep/Drop with reason; Cite; Open note (`research/notes/<key>.md`); Get PDF (arXiv, Unpaywall, named copy) into `research/papers/` | be/routes/research.js | 7b | not started |
| RS8 | Add kept papers to .bib through the reference look-up | be/routes/research.js | 7b | not started |
| RS9 | Workflows: Find citations for selection, Draft related work, Verify claims, Deep research (open agent with task, skill, session) | fe/editor/research/CitationAssistant.tsx | 7b + 6e | not started |
| RS10 | Claims checked ledger: Supported/Partly/Unsupported with the source's words found on their page; refresh, show in source, add to-do | fe/editor/research/ClaimsLedger.tsx, be/services/claimsLedger.js | 7b | not started |
| WS1 | Web search connections: model's own search, OpenAlex, Semantic Scholar, SerpApi (Scholar/Google/Baidu), Exa, Tavily, Brave, DDGS | be/services/searchService.js | 7 | not started |
| WS2 | Several connections enabled with own keys; default tried first, then the others in order | be/services/searchService.js | 7 | not started |
| WS3 | Native model search on OpenAI Responses / Claude Messages with provider sources | be/services/searchService.js | 6a + 7 | not started (decision 53) |
| WS4 | Chat can call general web search | be/routes/search.js | 6b | not started |

## Zotero

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| Z1 | Status: Zotero open, version, local API on, Better BibTeX | fe/editor/ZoteroCite.tsx, be/services/zoteroService.js | 7 + 7b | not started |
| Z2 | Cite from Zotero (right-click in `.tex`, References card): BBT picker, Answer in Zotero / Cancel; otherwise a library search in Spectrum | fe/editor/ZoteroCite.tsx | 7b | not started |
| Z3 | Entries added under Zotero's key, BBT key or author-year; `file` field dropped; duplicate check | be/services/zoteroService.js | 7 | not started |
| Z4 | `\cite` completion lists Zotero items after 3 letters (setting) | fe/editor/zotero.ts | 7b | not started |
| Z5 | Project collections (Zotero 10): Allow Spectrum in Zotero… once, `zotero.json`; Spectrum › name collection synced after adds, `.bib` saves, open, focus | be/services/zoteroService.js | 7 | not started |
| Z6 | Items matched by key/DOI/arXiv/title+year; never deletes Zotero items | be/services/zoteroService.js | 7 | not started |
| Z7 | Collection recorded with the project id; "Waiting for Zotero to sync" on the other computer; Zotero 7–9 read-only | be/services/zoteroService.js | 7 | not started |
| Z8 | Disconnect | fe/editor/ZoteroCite.tsx | 7b | not started |

## Import, convert & template transfer

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| IM1 | Overleaf/any `.zip` import (unsafe entries refused outright, decision 23) | be/services/projectService.js | 1a + 1d | partial |
| IM2 | arXiv source import | be/services/arxivService.js | 1a + 1d | partial |
| IM3 | Open a file from Finder: its project, or a new project from its document's folder | tauri/src/main.rs, be/routes/projects.js (open-file) | 10a | not started |
| IM4 | Change template… Quick switch (preamble swap, checkpoint, no model) | fe/app/TransferPanel.tsx | 11b import, export & transfer | not started |
| IM5 | Change template… Classic (LaTeX source with the main model) | be/services/transferAgent | 11b | not started |
| IM6 | Change template… From the PDF: parser → Markdown with maths and figures → main model writes into the template; vision layout check | fe/app/TransferPanel.tsx | 11b | not started |
| IM7 | Change template… With an agent: new project with `source/` and the template-transfer skill | be/routes/transfer.js (agent) | 11b + 6e | not started |
| IM8 | PDF parsers: MinerU (default), Mathpix, Mistral OCR, Datalab, LlamaParse (US/EU), PaddleOCR-VL, Docling, Other; each with own address and key | be/services/parsers, fe/app/parsers.ts | 11b | not started |
| IM9 | Parser output and PDF kept in the new project's `.spectrum` | be/routes/transfer.js | 11b | not started |
| IM10 | Export to Word (.docx) | be/routes/projects.js | 11b | not started |
| IM11 | import-refine skill offered after an import | skills/spectrum-convert-tidy | 6g | not started |

## LaTeX ↔ Typst

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| LT1 | Convert to Typst project… / Convert to LaTeX project… make a new project, original untouched | fe/app/ConvertSheet.tsx, be/services/convertService.js | 9a | not started |
| LT2 | Keeps labels, references, citations, numbered equations, figures, sub-figures, tables | be/services/convert | 9a | not started |
| LT3 | Tidy flagged parts with the AI model (experimental, off); Review the AI's edits… | be/services/convertTidy.js | 9a + 6a | not started |
| LT4 | Open new project from the sheet | fe/app/ConvertSheet.tsx | 9a | not started |

## Diagram Composer

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| DC1 | Separate composer window(s), opened from Draw a diagram / Insert (+) / Edit diagram | tauri/src/main.rs (open_diagram), fe/diagram/ComposerApp.tsx | 9b | not started |
| DC2 | Gallery: Engineering, Physics, Mathematics, Computing, Others with groups; Recently used (8); Standard; All; search by name/group/package and circuit symbols | fe/diagram/starters.ts | 9b | not started |
| DC3 | Starter cards show a small line drawing | fe/diagram/thumbs.tsx | 9b | not started |
| DC4 | Saved in `diagrams/` as `.tex`/`.typ`/`.mmd` with the drawing trailer (2.8 format verbatim) | fe/diagram/fileFormat.ts | 9b | not started |
| DC5 | Code tab for hand edits; "Edited by hand" note; Redraw from the canvas; files with no drawing open as code | fe/diagram/CodePane.tsx | 9b | not started |
| DC6 | Preview compiles automatically (LaTeX or built-in Typst) with errors at their lines | fe/diagram/Preview.tsx, be/routes/diagram.js | 9b | not started |
| DC7 | Export PDF / PNG image from the last good preview | fe/diagram/ComposerApp.tsx | 9b | not started |
| DC8 | Insert as figure opens the editor's Floats panel | fe/diagram/ComposerApp.tsx | 9b + 2f | not started |
| DC9 | Delete this diagram (file, PDF/PNG, empty folder; warns when still included) | fe/diagram/ComposerApp.tsx | 9b | not started |
| DC10 | Rename, Duplicate, Copy/Paste, Undo/Redo | fe/diagram/ComposerApp.tsx | 9b | not started |
| DC11 | Canvas: snapping, pan/zoom, minimap, dark canvas, grid styles (major dots, lines every N, grid, dots) | fe/diagram/CanvasGrid.tsx | 9b | not started |
| DC12 | Tool keys over the drawing only (W, M, T, P, V), changeable | fe/diagram/toolKeys.ts | 9b | not started |
| DC13 | Gear opens Settings › Diagram composer | fe/diagram/ComposerApp.tsx | 9b | not started |
| DC14 | siunitx units in labels load siunitx in every figure (2.8.1 fix) | CHANGELOG 2.8.1 | 9b | not started |
| DC15 | Circuits: 120 circuitikz parts drawn by the installed circuitikz, every MOSFET style, 5 mechanical supports | fe/diagram/modes/circuitikz/symbols.ts, be/services/symbolService.js | 9c composer: circuits | not started |
| DC16 | 20 circuit templates + logic schematic | fe/diagram/modes/circuitikz/templates.ts | 9c | not started |
| DC17 | Place parts (Return/Space places at centre), wires follow parts, labels/values/arrows/styles | fe/diagram/modes/circuitikz/Canvas.tsx | 9c | not started |
| DC18 | Label pins (G/D/S, B/C/E, C/G/E), Voltage +/− with Flip polarity, Voltage between two points | fe/diagram/modes/circuitikz/labels.ts | 9c | not started |
| DC19 | Labels placed clear of symbols, `_`/`^` drawn as sub/superscripts; texts never overlap | fe/diagram/modes/circuitikz/labels.ts | 9c | not started |
| DC20 | Inspector folds Voltage, current and more | fe/diagram/modes/circuitikz/panels.tsx | 9c | not started |
| DC21 | Wire segments take current/flow arrows | fe/diagram/modes/circuitikz/edit.ts | 9c | not started |
| DC22 | Logic gates American/IEC/IEEE, IEC inverted output triangle or circle | fe/diagram/modes/circuitikz/symbols.ts | 9c | not started |
| DC23 | MU Style parts (HKMU slides) and their variants; University styles switches | fe/diagram/universityStyles.ts | 9c | not started |
| DC24 | Symbol kinds per drawing; Symbols from other packages + Symbol sets… | fe/diagram/sets.ts | 9c | not started |
| DC25 | General drawing: every set incl. flowchart shapes; Fluid mechanics and Construction materials sets; synonyms in Find a part | be/data/symbolSets.js | 9c | not started |
| DC26 | Annotate: lines/arrows with heads, rectangles, ellipses, crosses, colour/dash/width, text styling, presets (Resistance looking in, Current arrow, Loop/Mesh current, Frame, Highlight) | fe/diagram/modes/circuitikz/annotate.ts | 9c | not started |
| DC27 | Annotate: Liquid or solid fills (water, seawater, oil, mercury, air, concrete; tint or pattern), hatched boundary, dimension, free surface, points (C, CP, G, B, M), leader | fe/diagram/modes/circuitikz/annotate.ts | 9c | not started |
| DC28 | Structures: members, truss bars, joints, hinges, releases, shear release, 6 supports, point/moment/UDL/linearly varying loads at any angle, annotations | fe/diagram/modes/structures/model.ts | 9d composer: structures, vectors & forms | not started |
| DC29 | Structures solved live: reactions, SFD, BMD, AFD, truss member forces (T/C, zero-force dashed), joint and section FBDs; unstable joint named | fe/diagram/modes/structures/solve.ts | 9d | not started |
| DC30 | EI/EA, springs, settlements, per-horizontal loads, deflected shape (fitted or true ×factor), zero-shear x | fe/diagram/modes/structures/solve.ts | 9d | not started |
| DC31 | Units kN·m / N·mm / kip·ft / lb·in with convert-or-keep; significant figures; BMD tension side or positive up | fe/diagram/modes/structures/panels.tsx | 9d | not started |
| DC32 | Bent beam tool (parabola or S-bend) with sag handle, dashed axis | fe/diagram/modes/structures/bend.check.ts | 9d | not started |
| DC33 | Twelve ready structures, each opens solved | fe/diagram/modes/structures/templates.ts | 9d | not started |
| DC34 | Marquee select, drag, nudge, mirror X/Y, rotate by angle; Space-drag pans; colour and thickness for selection | fe/diagram/modes/structures/Canvas.tsx | 9d | not started |
| DC35 | Vector diagrams: free and constructed points (midpoint, ratio, projection foot, u+v, v−u, intersection, scalar multiple, translate, reflection, parallel, perpendicular) following parents | fe/diagram/modes/vectors/model.ts | 9d | not started |
| DC36 | Vectors: segments, lines, highlighted segments, polygons, text, axes, grid, right-angle marks, drops, line from equation, circle, arc, angle, equal ticks | fe/diagram/modes/vectors/model.ts | 9d | not started |
| DC37 | Vectors: coordinate table, panels side by side with captions, label placement "Where it's clear", vector names notation (`\vv`, `\overrightarrow`) | fe/diagram/modes/vectors/panels.tsx | 9d | not started |
| DC38 | Form presets: Mohr's circle, hydrostatic gate, manometer walk, accelerating tank, floating body; Lecture/Exam look; Names fold | fe/diagram/modes/form/*.ts | 9d | not started |
| DC39 | Form presets: conic section (classification, working, rotated axes) and linear transformation (eigenvectors, determinant) | fe/diagram/modes/form/conics.ts, transformation.ts | 9d | not started |
| DC40 | Liquids and levels in manometers, piezometer, barometer, columns | fe/diagram/modes/form/manometer.ts | 9d | not started |
| DC41 | Plots (pgfplots): functions, parametric, polar, data files, fields, points typed in with error bars and labels, least-squares line, shaded area between series, equal axes, tick format | fe/diagram/modes/pgfplots/code.ts | 9e composer: plots, flow, tikz-cd, Mermaid | not started |
| DC42 | Plot starters (normal curve, Bode, damped oscillation, polar rose, Lissajous, conics, phase portrait, stress–strain, grading curve) | fe/diagram/modes/pgfplots/index.tsx | 9e | not started |
| DC43 | Plot › Import table…: tables from the project's documents (open one first, unsaved) or a CSV; x column, series; word column as tick labels/bars | fe/diagram/modes/pgfplots/index.tsx | 9e | not started |
| DC44 | Venn diagrams of 2–3 sets, regions shaded and counted | fe/diagram/modes/form/venn.ts | 9e | not started |
| DC45 | Flowcharts in TikZ and Typst (fletcher): boxes, arrows with label side/position, Gain, Takeoff, Operator circle with signs, swimlanes carrying boxes, Turn or mirror, Connect (W) | fe/diagram/FlowCanvas.tsx, fe/diagram/modes/tikz | 9e | not started |
| DC46 | Commutative diagrams (tikz-cd): grid objects, loops, shifted parallel arrows, multi-arrow edits; square, pullback, SES starters | fe/diagram/modes/tikzcd | 9e | not started |
| DC47 | State machines, decision flowchart, feedback loop, swimlane process, model architecture starters | fe/diagram/modes/tikz/examples.ts | 9e | not started |
| DC48 | Mermaid: flowchart, sequence, Gantt, ER, pie, bar/line, mind map, timeline, Git graph; export PNG/PDF; insert as PDF or image | fe/diagram/modes/mermaid | 9e | not started |
| DC49 | Maths in flowchart text with `$…$` in TikZ and Typst | fe/diagram/modes/tikz/code.ts | 9e | not started |
| DC50 | Older Spectrum compatibility notes (drawings open as code in 2.3/2.4) | fe/diagram/compat.check.ts | 9b | not started |

## Assistant

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| A1 | Assistant chat `⌘L` about the open file, selection and compile log | fe/editor/Composer.tsx | 6b | not started |
| A2 | Quick actions at the top: Polish, Rewrite, Restructure, Translate (scope Selection/Current file/Whole project, target language) | fe/editor/Composer.tsx | 6b | not started |
| A3 | Try input presets | fe/editor/Composer.tsx | 6b | not started |
| A4 | Edits as a side-by-side diff of changed parts, words marked, unchanged folded; accept/reject/edit each; PDF before and after | fe/editor/SplitDiffView.tsx, fe/editor/reviewHunks.ts | 6b | not started |
| A5 | Suggested changes with Apply, Review diff, Continue in Spectrum agent | fe/editor/Composer.tsx | 6b | not started |
| A6 | References mode in the same panel | fe/editor/Composer.tsx | 7b | not started |
| A7 | History of Assistant/References chats and pre-2.0 Edit chats, search, delete; New chat | fe/editor/ChatsList.tsx, be/routes/chats.js | 6b | not started |
| A8 | Persona picker in Assistant, remembered per chat | fe/editor/Composer.tsx | 6b + 6g | not started |
| A9 | Model and effort menu in the message box, kept per chat; Manage models… | fe/editor/Composer.tsx | 6b | not started |
| A10 | Send the selected text with the message | fe/editor/Composer.tsx | 6b | not started |
| A11 | "Answer cut off by output limit" note | fe/editor/Composer.tsx | 6b | not started |
| A12 | Every request told the file's language; outside material marked as material, never instructions | be/services/llmService.js | 6a/6b | partial |
| A13 | Approved `AGENTS.md` and project memory given to the assistant | be/services/agentInstructions.js | 6g | not started |
| A14 | Provider retry on busy (twice, up to 20 s Retry-After) | be/services/llmService.js | 6a | partial (Retry-After dates not ported, decision 53) |
| A15 | Chats saved in `.spectrum` with the project | be/routes/chats.js | 6b | not started |

## Agent & MCP/ACP

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| AG1 | Agent workspace in the PDF's place, PDF in its header to go back; Spectrum agent and Local agents tabs | fe/editor/agent/AgentWorkspace.tsx | 6e agent workspace UI | not started |
| AG2 | Header: threads/session history, Isolated/Direct (lock for Spectrum agent), persona picker, Stop | fe/editor/agent/AgentHeader.tsx | 6e | not started |
| AG3 | Model menu beside Send: keys 1–9, effort side menu in coloured levels, Recommended, Manage models…, session switches (Plan before editing) | fe/editor/agent/AgentTuning.tsx | 6e | not started |
| AG4 | Usage row: turns/tasks with steps and time, tokens with cache share and cost (est.), context fill; each opens its figures | fe/editor/agent/usage.ts | 6e | not started |
| AG5 | Costs in 14 currencies, never summed across currencies; OpenRouter/agent-reported cost preferred | fe/editor/agent/usage.ts | 6a + 6e | partial (price cache) |
| AG6 | Start screen "What would you like to do today?" with Literature sweep, Related work, Citation audit, Manuscript review, Verify claims | fe/editor/agent/parts.tsx | 6e | not started |
| AG7 | Transcript: messages, thinking folded, tool cards updating live with output/terminal/diff, questions and permissions inline, Restore rows | fe/editor/agent/parts.tsx, fe/editor/agent/transcript.ts | 6e | not started |
| AG8 | Chips: open file, selection, compile log, open to-dos (first message), research session | fe/editor/agent/parts.tsx | 6e | not started |
| AG9 | `/` lists commands and skills; a picked skill goes whole | fe/editor/agent/parts.tsx | 6e + 6g | not started |
| AG10 | Pictures: paste, drop or choose up to 4; non-vision models told one was left out | fe/editor/agent/pictures.tsx | 6e | not started |
| AG11 | Spectrum agent tools: search text, project map, bibliography, exact-text edit, propose new/deleted file, compile, look at a draft page or figure (Open in composer), literature search, to-dos, load skill | be/services/agentRunService.js, be/services/researchTools.js | 6c | not started |
| AG12 | Agent compiles its changes on a copy, fixes the first error, three tries; untrusted compile | be/services/agentRunService.js | 6c | not started |
| AG13 | Live step cards with time; streamed answer | fe/editor/agent/SpectrumAgentTab.tsx | 6e | not started |
| AG14 | Stop keeps prepared changes and words; Continue (25-step limit, cut-off, failure) in the same run for an hour, else a new run told what happened | be/routes/agent.js | 6c | not started |
| AG15 | Steer now: queued message handed over between steps; queue survives reload | be/routes/agent.js (steer) | 6c + 6e | not started |
| AG16 | Plan: untick steps, Edit as text, Approve and run, Approve and ask before each file, Keep planning; auto-plan for larger tasks | fe/editor/agent/parts.tsx | 6c + 6e | not started |
| AG17 | Questions with choices and own words; waiting plan/question costs nothing and persists | fe/editor/agent/parts.tsx | 6c | not started |
| AG18 | `AGENTS.md` chip: create, open, in use; Use it approval for files from elsewhere; folder/override/local files excluded | fe/editor/agent/instructionCard.ts, be/services/agentInstructions.js | 6g personas, skills & memory | not started |
| AG19 | Other agents' instruction files (CLAUDE.md, GEMINI.md, copilot, cursor rules, .agents, .pi, .qoder) held out of isolated copies with Allow / Leave out / Allow all / Leave all out, keyed by content | fe/editor/agent/InstructionFiles.tsx | 6g | not started |
| AG20 | Memory: suggested lines kept only on Add; edit/delete/add; 30 lines × 300 chars; on this computer only | be/services/agentMemory.js | 6g | not started |
| AG21 | Changes tray "3 files, +12 −4" opens review grouped under headings; Apply/Reject/Edit per change, J K A R E, Apply all, Reject all | fe/editor/HunkReview.tsx, fe/editor/ReviewChangesSheet.tsx | 6e | not started |
| AG22 | One Before AI changes checkpoint per review (or per change, setting); deleted file gets its own | be/services/versionService.js | 6e + 8 | not started |
| AG23 | Overlap with your edits: Keep mine, Use the agent's, Take both, Edit | fe/editor/HunkReview.tsx | 6e | not started |
| AG24 | PDF before and after on confined copies | be/routes/agentSessions.js (preview) | 6e | not started |
| AG25 | Proposed deletion applied whole moves to the Bin; line-ending change offered separately | fe/editor/reviewHunks.ts | 6e | not started |
| AG26 | Save open steps as to-dos; suggested to-dos as cards with Add | fe/editor/agent/parts.tsx | 6e + 11c | not started |
| AG27 | Dot on the Agent button: running, waiting, or changes to review | fe/app/EditorPage.tsx | 6e | not started |
| AG28 | Pre-2.0 Edit chats continue in the workspace | fe/editor/chatThread.ts | 6e | not started |
| AG29 | Send to agent from PDF notes, to-dos, Review rows (file, line, source lines) | fe/editor/agent/handoff.ts | 6e | not started |
| AG30 | Automations: compile after applying, offer Fix with AI on failure | fe/app/settings.ts | 6e | not started |
| AG31 | Local agents tab: pick an installed ACP agent from a row; sessions history; New session | fe/editor/agent/LocalAgentTab.tsx | 6f local agents & adapters | not started |
| AG32 | Isolated (default): Seatbelt on macOS, project copy and private home; apply/reject text, new, deleted, binary files; recovery journals | be/services/agentSandbox.js, be/services/agentWorkspace.js | 6c | not started |
| AG33 | Direct: edits in place with recovery copies before each task; warns it can't leave out AGENTS.md | be/services/agentService.js | 6c | not started |
| AG34 | Isolated agent stays up 5 minutes between turns; applied files become its base, rejected ones are reverted in its copy | be/services/agentSessionService.js | 6c | not started |
| AG35 | Network per agent: Any host / Listed hosts only; Allow card for a refused host | be/services/agentNetwork.js | 6c | not started |
| AG36 | Refuses projects with links, files >50 MB, >500 MB or 10,000 files | be/services/agentSandbox.js | 6c | not started |
| AG37 | Windows isolation: LPAC AppContainer, file grants, job object; no host list yet | be/services/agentSandboxWindows.js | 6d | not started |
| AG38 | Local agents get Spectrum's tools (compile, get_log, project_map, search_text, bib_entries, bib_search, literature_search, fetch_bibtex, list_todos, suggest_todo, load_skill) on macOS | be/routes/agent.js (/mcp) | 6c | not started |
| AG39 | Use from another agent: Offer this project's tools, copy command for Claude Code or MCP config; secret per switch-on, ends at quit | fe/editor/agent/OutsideTools.tsx, be/routes/outsideTools.js | 6c + 6e | not started |
| AG40 | Profiles: OpenCode 2, Codex, Claude Agent, Gemini CLI, Antigravity, Copilot CLI, Cursor, Kimi Code, Hermes, Qoder, Pi, DeepSeek Harness, ZCode; WorkBuddy planned | be/services/agentProfiles.js | 6f | not started |
| AG41 | Agent found in installer folders, `/Applications`, package managers, Homebrew | be/services/agentProfiles.js | 6f | not started |
| AG42 | Pinned adapters installed with bundled npm (scripts off); Update needed with both versions, Update adapter then retest | be/routes/agent.js (adapter) | 6f | not started |
| AG43 | Agent model/effort mid-session sticks; choice before start applied at open | fe/editor/agent/LocalAgentTab.tsx | 6f | not started |
| AG44 | Sign-in needed / Ended without changes / refused key named with the way back | be/services/agentSessionService.js | 6f | not started |
| AG45 | Persona to local agents via system prompt or first message; persona change starts a new session told the history | be/services/agentSessionService.js | 6f + 6g | not started |
| AG46 | Skills copied into the agent's private home before each session, marked as Spectrum's | be/services/skillService.js | 6g | not started |
| AG47 | MCP servers for the Spectrum agent: add by command, Check lists tools, switch on; run isolated; non-read-only tools ask first | fe/app/McpServers.tsx, be/services/mcpServers.js | 6c + 11a | not started |
| AG48 | MCP env variables in keychain/DPAPI, shown as dots, redacted; isolation names refused; change switches off | fe/app/McpServers.tsx | 6c | not started |
| AG49 | MCP local ports (e.g. 23119) on macOS, never Spectrum's | fe/app/McpServers.tsx | 6c | not started |
| AG50 | MCP host lists: npx/uvx registry hosts offered; Allow and check again; Details shows the program's error; Any host | fe/app/McpServers.tsx | 6c | not started |
| AG51 | Proxy for agents and MCP through Spectrum's gate | be/services/networkProxy.js | 6c + 1e | not started |
| AG52 | Agents can't read `.env`, `.netrc`, `.npmrc`, `.pypirc`, private keys | be/services/agentSandbox.js | 6c | not started |
| AG53 | Local agents on Windows: no Spectrum tools, no Direct; Codex/Claude Agent/Pi/ZCode unavailable | guide (Windows) | 6d | not started |

## Review & preflight

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| RV1 | Tools › Review: a panel per check with icon, line, status and Run; Run all; Reset | fe/editor/tools/ReviewTab.tsx | 7c review & preflight | not started |
| RV2 | Compiles first only for PDF checks and only when the PDF is stale | fe/editor/tools/reviewRun.ts | 7c | not started |
| RV3 | Compile and layout checks (errors, overfull, ??, missing glyphs, rerun, duplicate destinations, page sizes, text past edge) | fe/editor/preflight/run.ts | 7c | partial (last_pass in 3c) |
| RV4 | References and assets (missing entries/labels, duplicates, missing fields, bad DOIs, uncited, missing images, unreferenced floats, TexLab) | fe/editor/preflight/run.ts | 7c | not started |
| RV5 | Privacy and blind review (secrets, `\todo`, TODO, highlights; Double-blind: `\author`, `\thanks`, acknowledgements, PDF Author) | fe/editor/preflight/run.ts | 7c | not started |
| RV6 | Accessibility (title, language, tags, bookmarks, small text, textless pages, alt text, skipped headings, vague links); Tags and alt text switch; Screen reader view | fe/editor/preflight/pdfFacts.ts | 7c | not started |
| RV7 | Submission readiness (PDF version, encryption, unembedded/Type 3 fonts, absolute paths, case-only names, image formats, file names, abstract, keywords) | fe/editor/preflight/run.ts | 7c | not started |
| RV8 | Verify citations: Crossref/doi.org, arXiv, OpenAlex; retracted/unknown/differing with record and link; which .bib read | fe/editor/tools/ReferenceCheck.tsx, be/services/referenceCheck.js | 7 + 7c | not started |
| RV9 | AI review: summary, strengths, score, confidence, limits, Major/Minor/Note points with line; parts of ~160k chars with progress; Stop keeps parts | be/services/reviewService.js | 7c + 6a | not started |
| RV10 | Typst and Markdown documents run their subsets | fe/editor/tools/ReviewTab.tsx | 7c | not started |
| RV11 | "Compile first" instead of false all-clear; unreadable PDF says why | fe/editor/tools/ReviewTab.tsx | 7c | not started |
| RV12 | Rows jump to line or PDF page; Show in PDF; Fix with AI per row or group; Dismiss; Send to agent | fe/editor/tools/ReviewTab.tsx | 7c | not started |
| RV13 | Status line (last run, source changed since); Copy report as Markdown; latest run kept until quit | fe/editor/tools/ReviewTab.tsx | 7c | not started |

## Versions & checkpoints

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| V1 | Checkpoints in `.spectrum`, compressed, stored once; readable by 1.10.4 as versions | be/services/versionService.js | 8 | not started |
| V2 | Save checkpoint button and `⇧⌘S`; notice offers to name it | fe/app/EditorPage.tsx | 8 | not started |
| V3 | Tools › Checkpoints: list, save with label, Rename, Delete, What changed, Compare with current, Restore this checkpoint…, restore one file | fe/editor/tools/VersionsTab.tsx | 8 | not started |
| V4 | Automatic checkpoints before AI changes, restore, template change, pull, rename, reference update | be/services/versionService.js | 8 | not started |
| V5 | Compile checkpoints at most one per 10 minutes, replacing the earlier; manual/named/Before kept | be/services/versionService.js | 8 | not started |
| V6 | Warn when a checkpoint fails or a file >50 MB is skipped | fe/app/settings.ts | 8 | not started |
| V7 | Delete automatic checkpoints older than… (Settings and Tools) | fe/editor/tools/VersionsTab.tsx | 8 | not started |
| V8 | Binary files: "no preview" in compare | fe/editor/tools/VersionsTab.tsx | 8 | not started |

## GitHub & sync

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| G1 | Sign in with a personal access token; device-code sign-in in an OAuth build; token in `github.json`, never in the window | fe/app/GitHubSettings.tsx, be/services/githubService.js | 8 | not started |
| G2 | Sign out | fe/app/GitHubSettings.tsx | 8 | not started |
| G3 | No Git install needed; commits as the account's noreply address | be/services/gitService.js | 8b GitHub sync & settings repo | not started |
| G4 | Back up: private repo named after the project, recorded with the project id; Initialise without GitHub | be/routes/github.js | 8b | not started |
| G5 | Pull on open, back up a minute after typing stops and on leaving; quit commits, push next start | be/services/githubService.js | 8b | not started |
| G6 | Tools › GitHub: Sync, Pull, Back up… with label, Open on GitHub, ahead/behind counts | fe/editor/tools/GitHubTab.tsx | 8b | not started |
| G7 | What goes: sources, figures, .bib, project settings, chats, to-dos, notes, research; excluded: checkpoints, build files, compiled PDFs, key-like files, >100 MB; `.git/info/exclude`, `.gitignore` when none | be/services/mergeRules.js | 8b | not started |
| G8 | Public or shared repos: chats/to-dos/notes/research held until Back them up / Leave them out | fe/editor/tools/GitHubTab.tsx | 8b | not started |
| G9 | Pull merges text by lines, settings by key, chats by message, research by search, to-dos/notes by field, after a Before pull checkpoint | be/services/mergeRules.js | 8b | not started |
| G10 | Unmergeable file gets "(GitHub's conflicted copy <date>)" beside it; deletions/renames rules; mass delete asks | be/services/githubService.js | 8b | not started |
| G11 | Files written only if unchanged since commit; branch moves last | be/services/githubService.js | 8b | not started |
| G12 | To-dos, notes and Research reload after a pull | fe/app/EditorPage.tsx | 8b | not started |
| G13 | GitHub view on the projects page: Spectrum repos, Get from GitHub (clone with the project id), Link (with file/conflict counts), Open on GitHub, Public badge | fe/app/GitHubView.tsx | 8b | not started |
| G14 | 1.10.4 mirror records used as the merge base | be/services/mirrorService.js | 8b | not started |
| G15 | Refused: index.lock, LFS, submodules, mid-merge, detached; sync-app folders | be/routes/github.js (problems) | 8b | not started |
| G16 | Offline retry every 2 minutes; Sign in again / No access / GitHub's message; Not backed up since | be/services/githubService.js | 8b | not started |
| G17 | Settings repo `spectrum-settings`: appearance, editor, spelling, shortcuts, personas, skills, templates, project folders, tag colours; newer value per setting wins; keys and paths never sent | be/services/settingsRepoService.js | 8b | not started |
| G18 | Use the same settings on each computer (per-machine settings files); This computer's name | be/services/presenceService.js | 8b | not started |

## Settings (19 panes)

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| S0a | Settings sheet `⌘,` with 5 groups, coloured pane icons | fe/app/SettingsSheet.tsx, fe/app/settingsNav.ts | 11a Settings window | not started |
| S0b | Search box finds a pane by name or by a setting label | fe/app/settingsNav.ts | 11a | not started |
| S0c | App settings from 2.8's localStorage migrated into `DATA_DIR/settings.json` | fe/app/settings.ts | 1e first-run & migration | not started (decision 25) |
| S0d | `.env` in the data dir for model settings; app settings win | be/services/llmService.js | 6a | not started |
| **Appearance** | | | | |
| S-AP1 | Theme System/Light/Dark | fe/app/appearance.ts | 0b + 11a | partial (palette commands) |
| S-AP2 | Accent colour: follow macOS, Spectrum (wheel), Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite, custom | fe/app/appearance.ts | 0b + 11a | not started |
| S-AP3 | Colour style Spectrum/Simple | fe/app/appearance.ts | 0b + 11a | partial (palette commands) |
| S-AP4 | Logos: line marks or full logos | fe/app/settings.ts | 11a | not started |
| S-AP5 | See-through window (Liquid Glass/frosted) with Clarity; solid under Reduce transparency | tauri/src/main.rs (follow_glass) | 0b + 11a | partial (blurred window, decision 20) |
| S-AP6 | PDF page colour for light and dark | fe/app/settings.ts | 4a + 11a | not started |
| **Shortcuts** | | | | |
| S-SH1 | Every shortcut listed by group; click and press keys; Delete removes; Escape cancels | fe/app/shortcuts.ts | 2e + 11a | not started |
| S-SH2 | Clashes marked; system shortcuts refused; canvas key clashes explained | fe/app/shortcuts.ts | 2e | not started |
| S-SH3 | Fixed shortcuts listed (find, undo, redo, settings, LSP keys, Esc Tab) | fe/app/shortcuts.ts | 2e | not started |
| S-SH4 | Restore all defaults; Dvorak/Colemak match labelled keys | fe/app/shortcuts.ts | 2e | not started |
| **System & Network** | | | | |
| S-SY1 | Proxy found from the field, macOS network settings or shell variables; shown with source, credentials hidden; Save/Clear | fe/app/ProxySettings.tsx, be/services/networkProxy.js | 1e | not started |
| S-SY2 | Tools check, Folders, Check again | fe/app/SettingsSheet.tsx | 3e | not started |
| S-SY3 | About with version and Licences page | fe/app/Licences.tsx | 11a | not started |
| S-SY4 | Show the setup page again | fe/app/SettingsSheet.tsx | 1e | not started |
| S-SY5 | Tell me when a newer Spectrum is out | fe/app/settings.ts (updateCheck) | 10a | not started |
| **Editor** | | | | |
| S-ED1 | Insert `\cite` after adding a reference | fe/app/settings.ts | 7b | not started |
| S-ED2 | Typing: Continue lists, Close maths delimiters | fe/app/settings.ts | 2d | not started |
| S-ED3 | Show the maths at the cursor | fe/app/settings.ts | 2d | not started |
| S-ED4 | New to-dos go | fe/app/settings.ts | 11c | not started |
| S-ED5 | Jump between source and PDF: double-click switch, highlight colour (accent/yellow/green/pink/blue/custom), seconds; PDF follows the open file | fe/app/settings.ts | 4b | not started |
| S-ED6 | Font, size, keys, light/dark themes, colours | fe/app/settings.ts | 2e | not started |
| **Engines** | | | | |
| S-EN1 | Open Logs on failure; Underline boxes | fe/app/settings.ts | 3d | not started |
| S-EN2 | LaTeX tab: compiler, auto compile, error handling, bib tool, draft, precompile, syntax check, live output per engine, TeX folder, xjyutping folder | fe/app/SettingsSheet.tsx | 3d + 11a | not started |
| S-EN3 | Typst tab: default version, install/remove versions, Tinymist | fe/app/SettingsSheet.tsx | 3e | not started |
| S-EN4 | Markdown tab: PDF engine, pandoc download | fe/app/SettingsSheet.tsx | 3e | not started |
| S-EN5 | Changed for this project marker vs defaults | fe/app/SettingsSheet.tsx | 3d | not started |
| **Spelling & grammar** | | | | |
| S-LA1 | Languages list with search, Add a language, Download per dictionary, project list (Give this project its own list / Use my list) | fe/app/SettingsSheet.tsx | 5d | not started |
| S-LA2 | Check spelling as you type; English grammar Harper/LanguageTool; style suggestions; serial comma | fe/app/settings.ts | 5d | not started |
| S-LA3 | LanguageTool download/remove | fe/app/SettingsSheet.tsx | 5d | not started |
| S-LA4 | Your dictionary: add/remove words | fe/app/SettingsSheet.tsx | 5d | not started |
| **Snippets** | | | | |
| S-SN1 | Create/Edit/Delete snippets, Works in, Reset to defaults | fe/app/SnippetsPane.tsx | 2d | not started |
| **Diagram composer** | | | | |
| S-DC1 | Canvas background, grid every N, dark canvas, minimap, tool keys | fe/app/settings.ts | 9b | not started |
| S-DC2 | New drawings: symbols from other packages, BMD side, Mohr shear axis, vector names, diagram fills/opacity, siunitx | fe/app/settings.ts | 9c/9d | not started |
| S-DC3 | University styles switches | fe/app/settings.ts | 9c | not started |
| **Projects** | | | | |
| S-PR1 | Open Spectrum on; project switcher opens at; default folder (sync folders refused) | fe/app/SettingsSheet.tsx | 1d | not started |
| S-PR2 | Opening files: default app per kind on macOS (LaTeX, .bib, other TeX, Typst, Markdown) | fe/app/SettingsSheet.tsx, tauri/src/main.rs | 10a | not started |
| S-PR3 | Your other computers: same settings on each, this computer's name | fe/app/SettingsSheet.tsx | 8b | not started |
| **Checkpoints** | | | | |
| S-CP1 | On compile, warn on failure, before every apply, clearing out | fe/app/settings.ts | 8 | not started |
| **GitHub** | | | | |
| S-GH1 | Account sign-in/out, token, device code steps; settings repo switch; Sync settings now | fe/app/GitHubSettings.tsx | 8 + 8b | not started |
| **Providers** | | | | |
| S-PV1 | Connected and available providers; connect once with key, endpoint, region; Edit, Disconnect (waits for running models) | fe/app/ProvidersPane.tsx | 6a + 11a | partial (presets in 6a) |
| S-PV2 | Test connection: model list, no message sent, plain-language failure reasons | fe/app/connectionTest.ts, be/routes/llm.js | 6a | not started (decision 53) |
| S-PV3 | Custom endpoint / Other (OpenAI-compatible, plain http needs no key); Ollama with Refresh; Ollama Cloud | fe/app/ProvidersPane.tsx | 6a | partial |
| S-PV4 | Keys in Keychain/DPAPI with `spectrum-key:` refs; fallback to settings with reason | fe/app/keys.ts, be/services/keyStore.js | 1b | partial (keystore) |
| S-PV5 | Keys sent only to the address they were entered for | be/services/providers.js | 6a | partial |
| **Models** | | | | |
| S-MO1 | Default roles: main, quick, vision; each may use another provider | fe/app/ModelsPane.tsx | 6a + 11a | partial |
| S-MO2 | Reasoning effort Off–Max, only the model's levels; Recommended | fe/app/ModelsPane.tsx | 6a | partial |
| S-MO3 | Models in the menus switch (model in use can't be switched off); search across providers | fe/app/ModelsPane.tsx | 11a | not started |
| S-MO4 | Prices per model in 14 currencies; models.dev auto prices every 6 h, Update now, off switch; local models never priced | fe/app/ModelsPane.tsx, be/services/modelsDev.js | 6a + 11a | partial (PriceCache) |
| S-MO5 | Context length shown | fe/app/ModelsPane.tsx | 11a | not started |
| **Agents** | | | | |
| S-AG1 | Agent cards: logo, status chip (Supported/In progress/Untested), program found, Test, sign-in command, key, adapter, next step | fe/app/AgentSettings.tsx | 6f | not started |
| S-AG2 | Advanced: program, launcher arguments, runtime folders; import login files; Codex key vs ChatGPT login | fe/app/AgentSettings.tsx | 6f | not started |
| S-AG3 | Network per agent; local-port switch for OpenCode 2 and Antigravity | fe/app/AgentSettings.tsx | 6f | not started |
| S-AG4 | MCP servers section; Automations | fe/app/McpServers.tsx | 6c + 6e | not started |
| **Personas** | | | | |
| S-PE1 | Default instructions; personas with name, colour, instructions; Create/Edit/Delete/Reset; four starters | fe/app/SettingsSheet.tsx, fe/editor/personas.ts | 6g | not started |
| **Skills** | | | | |
| S-SK1 | Skills in groups with search; card shows author, licence, version, files, script needs | fe/app/SettingsSheet.tsx, be/services/skillService.js | 6g | not started |
| S-SK2 | Switch per skill for All projects / This project | fe/app/skills.ts | 6g | not started |
| S-SK3 | Create skill, Add folder (regular files only), Duplicate built-in, file browser editing, Delete | be/routes/skills.js | 6g | not started |
| S-SK4 | Share skills with other agents (`~/.agents/skills`, `~/.claude/skills`, only where present) | be/routes/skills.js (share) | 6g | not started |
| S-SK5 | 19 bundled skills (12 K-Dense, 7 Spectrum) with licences | skills/manifest.json | 6g | not started |
| **Search & Web** | | | | |
| S-SW1 | Default search, connections with keys, SerpApi engine, research keys and emails (OpenAlex, NCBI, Unpaywall), search model | fe/app/SettingsSheet.tsx | 7b + 11a | not started |
| **Zotero** | | | | |
| S-ZO1 | Status, Allow in Zotero…, collections, citing, completion switch | fe/editor/ZoteroCite.tsx | 7b | not started |
| **Document parsers** | | | | |
| S-DP1 | Parser choice and per-parser endpoint/key/app ID, Other protocol | fe/app/parsers.ts | 11b | not started |

## OS integration

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| OS1 | Single instance: a second launch or file open goes to the running app | tauri/src/main.rs | 10a | not started |
| OS2 | Window size and position remembered | tauri/src/main.rs (window_state) | 10a | not started |
| OS3 | File associations: .tex/.ltx/.bib (owner), .sty/.cls/.clo/.dtx/.ins/.bst/.bbx/.cbx/.lbx/.dbx, .typ, .md/.markdown (alternate); PDFs never | tauri/tauri.conf.json | 10b / 10c | not started |
| OS4 | Claims default app for TeX/.bib on first macOS launch; per-kind switches; previous app restored when released | tauri/src/main.rs (claim_defaults) | 10a | not started |
| OS5 | Opened files (Finder/Explorer, Open With) open in their project | tauri/src/main.rs (RunEvent::Opened) | 10a | not started |
| OS6 | App menu with Quit flushing unsaved editors first | tauri/src/main.rs (quit, flush) | 10a | not started |
| OS7 | Composer windows numbered (diagram, diagram-2…) | tauri/src/main.rs | 9b | not started |
| OS8 | Full-screen tracking (layout adjusts) | tauri/src/main.rs | 10a | not started |
| OS9 | Splash while starting | tauri/tauri.conf.json (splash) | 10a | not started |
| OS10 | Native folder and file pickers | fe/app/desktop.ts | 1c | partial |
| OS11 | Bin / Recycle Bin for deletes | be/routes/projects.js (trash) | 1c | built |
| OS12 | Liquid Glass app icon on macOS 26; Fluent icons on Windows; SF Symbols on Mac | fe/app/Icon.tsx | 10b / 0b | not started |
| OS13 | Windows: per-user installer, no admin, Start menu, `%APPDATA%\com.beyond3345.spectrum` | src-tauri (NSIS) | 10c | not started |
| OS14 | Mac DMG layout, ad-hoc signing, hardened runtime, macOS 13.5+ | tauri/tauri.conf.json | 10b | not started |
| OS15 | Links open in the default browser | tauri plugin opener | 10a | not started |
| OS16 | Data dir `com.beyond3345.spectrum`, Windows `Ctrl` for `⌘` key labels | — | 1a / 2e | built (paths) |

## Update notice

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| U1 | Check GitHub's latest release with a HEAD request, nothing about the user sent; setting turns it off | be/services/updateService.js | 10a | not started |
| U2 | At startup and every 6 h; success cached 6 h, failure retried after 30 min and never cached as "no update" (fix) | REWRITE_V3_PLAN | 10a | not started |
| U3 | Semver comparison; betas notify betas only | REWRITE_V3_PLAN | 10a | not started |
| U4 | Pill in the title bar and card on Home (2.8.1: projects page only) | fe/app/UpdateNotice.tsx | 10a | not started |
| U5 | Check for updates in the palette and About | REWRITE_V3_PLAN | 10a | not started |
| U6 | Open the release page in the default browser (2.8.1's link didn't open; fix) | fe/app/UpdateNotice.tsx | 10a | not started |
| U7 | Not now hides that version | REWRITE_V3_PLAN | 10a | not started |

## Command palette & toasts

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| CP1 | Command palette `⇧⌘P` lists every shortcut command and menu item, Tools tabs and Settings panes, with shortcuts and checks | fe/app/CommandPalette.tsx, fe/app/commands.ts | 1c (+ every session adds its commands) | partial (shell commands only) |
| CP2 | Fuzzy match favouring word starts | fe/app/commands.ts | 1c | built (nucleo) |
| CP3 | Toasts with an action (Undo, Name it) | fe/app/Toast.tsx | 1c | partial (show_notice) |
| CP4 | Confirm dialogs with destructive red OK | fe/app/Dialogs.tsx | 1c | built |

## First-run, migration & network

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| FR1 | Setup page on a computer's first start: TeX used, model (optional), first project from template or folder; Set up ticks; Skip/Continue | fe/app/FirstRunPage.tsx, fe/app/firstRun.ts | 1e first-run & migration | not started |
| FR2 | Never shown to someone updating; reopens if quit while open | fe/app/firstRun.ts | 1e | not started |
| FR3 | Proxy used for everything Spectrum reaches on the internet | be/services/networkProxy.js | 1e | not started |
| FR4 | 1.10 → 2.0 mirror stop (still read for migration notice and merge base) | be/services/mirrorService.js | 1d / 8b | not started |

## Accessibility & language

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| AX1 | Australian English UI copy ("Bin", "colour") | all | every session; checked in 11e | partial |
| AX2 | Every icon button labelled for screen readers (2.8 used aria-label throughout) | fe/** | 11e accessibility & copy pass | not started |
| AX3 | Full keyboard operation: menus, palette, review keys, to-do moves without a mouse | fe/editor/TodosList.tsx, fe/editor/HunkReview.tsx | 11e | not started |
| AX4 | Reduce transparency gives solid surfaces | fe/styles | 0b + 11e | not started |
| AX5 | Windows shortcut table (`Ctrl`, `Alt`, F3, `Ctrl+Y`) | fe/app/shortcuts.ts | 2e | not started |
| AX6 | Typst templates export as PDF/UA-1 with `alt-text.typ` for equations | templates/typst-* | 1d + 3d | not started |

## On-disk compatibility

| # | Feature | 2.8.1 source | 3.0.0 session | Status |
|---|---|---|---|---|
| DK1 | Reads 2.8's data dir and project registry without loss | be/services/projectService.js | 1a | built |
| DK2 | `project.json` read/written as 2.8 (1.10.4 still opens projects) | be/services/projectService.js | 1a | built |
| DK3 | `.spectrum/settings.json` keeps unknown keys; atomic writes | be/services/projectSettings.js | 1a | built |
| DK4 | API keys from 2.8 (Keychain service names, `keys.dpapi`) still read | be/services/keyStore.js | 1b | built (crate tests) |
| DK5 | `trusted-projects.json` format | be/services/trustService.js | 3b | built |
| DK6 | SyncTeX cache location and code-page decoding | be/services/synctex.js | 3c | built (legacy 1.4/1.7 caches not read, decision 33) |
| DK7 | `.spectrum/todos`, `.spectrum/notes`, `.spectrum/research`, chats, todo groups | be/routes/*.js | 11c / 7b / 6b | not started |
| DK8 | Checkpoint store compatible with 2.8 and 1.10.4 | be/services/versionService.js | 8 | not started |
| DK9 | `github.json`, `zotero.json`, settings repo clone, `.git/info/exclude` | be/services/githubService.js | 8b / 7 | not started |
| DK10 | Agent memory, sessions, transcripts, instruction approvals on this computer | be/services/agentMemory.js | 6c / 6g | not started |
| DK11 | Composer diagram files with trailer, composer settings blobs | fe/diagram/fileFormat.ts | 9b | not started |
| DK12 | `models-dev.json` cache | be/services/modelsDev.js | 6a | built |
| DK13 | Snippets, personas, project folders, tag colours parsed from settings (raw JSON until then) | fe/app/settings.ts | 2d / 6g / 1d | partial (decision 25) |
| DK14 | Per-machine shared settings files and `.spectrum/open/<machine>.json` names | be/services/presenceService.js | 8b | not started |
| DK15 | Templates edited by the user and their own templates kept across updates | be/services/templateService.js | 1d | not started |

## Removed in 2.8.x (not targets, kept for the record)

Image to LaTeX and Table to chart (removed in 2.8.0; Plot imports tables instead), 1.10 cloud sync (Sync to,
Download, Cloud projects view, presence banner; replaced by GitHub in 2.0), Get started on Home (2.6.4, replaced by
the setup page). Their removal is 2.8.1 behaviour; nothing to rebuild.

## New sessions proposed by this file

| Session | Scope |
|---|---|
| 1d projects page & templates | Home folders, tags, archive, customise folder, thumbnails, project menus, template gallery and editing, Typst Universe, zip/arXiv import UI, project switcher, 1.10 migration notice |
| 1e first-run, settings migration & proxy | Setup page, moving 2.8's localStorage settings into `settings.json`, the network proxy finder and gate used by every crate |
| 2f Insert menu & floats panel | Insert (+) per language, Insert figure and Insert table cards, pasted/dropped images, package additions |
| 3d compile extras | Decision 65's list plus the compile menu, Recompile all/from scratch, figure preview, live output, Logs tab, Typst export formats, Mermaid in Markdown |
| 3e engine downloads & system check | Typst versions, Tinymist, pandoc and Biber downloads; the Tools check and Python/ddgs |
| 4c PDF extras | Two-page view, PDF sidebar (Contents/Pages), presentation mode, per-document page memory, layout memory, Download, Typst Live, Markdown preview |
| 5d languages & grammar panel | Language list and detection, dictionary catalogue downloads, LanguageTool install and server, Check grammar panel, ignored rules, project dictionary |
| 6e agent workspace UI | Both tabs' shell, transcript cards, plan/questions, chips, pictures, usage row, changes tray and hunk review, Send to agent, automations, outside-tools switch |
| 6f local agents & adapters | Agent profiles, discovery, adapter install/update, Settings › Agents cards, sign-in and refusal handling |
| 6g personas, skills & memory | Personas, skills (bundled, own, sharing, per-project switches), AGENTS.md and other instruction-file approvals, project memory |
| 7b research, references & Zotero UI | References mode cards, Research tab and sessions, claims ledger, Zotero cite/completion/collections UI, Search & Web pane |
| 7c review & preflight | Tools › Review: the six checks, AI review, reporting and handoffs |
| 8b GitHub sync & settings repo | Repo backup/pull/merge engine, conflicted copies, GitHub view, settings repository, sync-folder refusals |
| 9c composer: circuits & general drawing | circuitikz parts and templates, MU Style, symbol sets, Annotate and fluid/materials tools |
| 9d composer: structures, vectors & forms | Structures solver and drawing, vector diagrams, form presets (Mohr, fluids, conics, transformations) |
| 9e composer: plots, flow, tikz-cd, Mermaid | pgfplots with table import, Venn, TikZ/fletcher flowcharts, tikz-cd, Mermaid |
| 11a Settings window | The Settings sheet with its 19 panes, search and the panes no feature session owns (Appearance, Models list, About/Licences) |
| 11b import, export & template transfer | Change template (four routes), PDF parsers, Export to Word |
| 11c to-dos & PDF notes | To-do list with groups, colours, highlights, drag; PDF sticky notes |
| 11d document insights | The insights panel with counts, numbers and pages, metadata, texcount |
| 11e accessibility & copy pass | Screen reader labels, keyboard paths, reduce transparency, Australian English copy check across every screen |
