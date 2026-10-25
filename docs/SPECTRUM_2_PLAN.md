# Spectrum 2.0.0 plan

Status: implementation in progress, 25 October 2026. Phases 1, 1b, 2 and 3 are merged into `feat/2.0`, and phase 4 is integrated on `build/p4-integrate`; the continuation and verification notes are in [SPECTRUM_2_HANDOFF.md](SPECTRUM_2_HANDOFF.md). Phase 5 remains. Version 2.0.0 is not to be released until you say so.

Research behind it: Spectrum 1.10.4's code, Oleafly's source and docs (`CodingProjects/Oleafly-main`), and the TexLab, Zotero, Better BibTeX, GitHub, pdf.js, Overleaf and LaTeX Workshop documentation.

## Ground rules

- **Oleafly is AGPL-3.0, Spectrum is MIT.** Spectrum takes Oleafly's ideas and layouts but copies none of its code, text or rule files. The README now thanks Oleafly and says so (committed on main, not pushed). Short labels that match Oleafly's English (the compile menu's, which are Overleaf's own words, Compiler (this project), Compile error handling, No checkpoints yet, Submission metadata and Copy submission metadata) were checked in the phase 1 review and kept on purpose; the full sentences that matched were reworded.
- **New code dependencies must be MIT/BSD-style or Apache-2.0:** `isomorphic-git` (MIT), `@codemirror/lsp-client` and `@codemirror/lint` (MIT), `@modelcontextprotocol/sdk` (MIT), `codemirror-lang-typst` (Apache-2.0), `@codemirror/lang-markdown` (MIT), `@xyflow/react` (MIT) for the diagram canvas, and `mermaid` 11 (MIT; not 12, which pulls in an EPL-licensed layout library).
- **TexLab is GPL-3.0-only.** It can only ship as a separate program beside Spectrum, with its licence and a source offer, like the AussieDic dictionary today.
- **Other bundled programs:** Typst (Apache-2.0) and Tectonic (MIT) ship inside the app; pandoc (GPL-2.0-or-later) is downloaded on first use. All are listed with their licences in the third-party notices, and so, on Windows, is Microsoft's `vcruntime140.dll` under its redistribution terms.
- **Bundled skills** come from K-Dense's upstream repository at a pinned commit, never from Oleafly's modified copies. Each keeps the licence and author its own front matter names (MIT, or Apache-2.0 for the Mermaid diagrams skill by Clayton Young; a skill that names no licence falls under the repository's MIT licence), all listed in the third-party notices, with the Elsevier `.bst` files listed as LPPL 1.3c. The scripts that spend an OpenRouter key (`generate_schematic*.py` and `generate_slide_image*.py`) are left out.
- **Everything new keeps working without the optional parts.** No TexLab, no Zotero, no GitHub account, no agent: Spectrum behaves as it does today. The one exception: without GitHub, projects and settings no longer sync between computers (section 10a).
- **GitHub replaces the cloud sync (your request).** OneDrive, Synology Drive, Dropbox and iCloud cloud locations, Mirror and Move, and the Cloud projects view are removed (section 10a). Projects travel between computers through GitHub (section 10), and so do the chats and project details that used to ride on the mirror, plus the new to-dos, PDF notes, research sessions and project settings.
- **Rollback:** 1.10.4 must still open projects 2.0.0 has touched. 1.10.4 rewrites `project.json` through its own list of keys, so new per-project data never goes in `project.json`. Per-project settings (compiler, Zotero collection, GitHub repo, the project id each binding was made for) go in a new `.spectrum/settings.json`, which travels through GitHub and which 1.10.4 ignores. 2.0's own `project.json` handling keeps keys it doesn't know.
- **Reviewed:** three reviewers checked this plan for feasibility on Mac and Windows, data safety and coverage of your requests; 31 of their 36 findings were real and are folded in below. A second round of three reviewers checked the GitHub sync, the cloud removal, personas, skills and engines; all 36 of their findings were real and are folded in too.

## 1. Editor top bar and right-hand panels

Today the top bar has Insert (+), file tabs, Assistant, Check grammar and Tools. Tools and Grammar take the PDF's place through two flags.

- Replace the two flags with one panel state: `tools | grammar | insights | floats | agent | null`. Every panel takes the PDF's place, has a header with Close and the view switcher, and keeps the PDF one click away.
- New top-bar buttons, in order: Insert (+), **Insert figure**, **Insert table**, file tabs, Assistant, Check grammar, **Document insights**, Tools, **Agent**.
- At narrow widths the float buttons hide (a container query on the editor column) and stay reachable from Insert (+).
- While a panel replaces the PDF, the top bar shows the Compile button, its menu and status, so compiling never disappears.

## 2. Floats move to the top bar

- Floats is today the last of six Tools tabs (Insert figure, Insert table, Project figures, Table to chart, Image to LaTeX). It leaves Tools and becomes its own panel.
- The top-bar buttons open that panel scrolled to the figure or table card. Insert (+) › Figure… and Table… open the same cards instead of pasting placeholder snippets.
- Dropping an image on the editor opens the figure card, as now.

## 3. Document insights

A new panel next to the AI and grammar buttons, replacing Tools › Project info.

- **Tabs with counts:** Overview, Headings, Figures, Tables, Equations, Labels, Citations, To-dos (the source to-dos; the working list is the sidebar's To-dos tab, section 4b). Rows show the number and page from the last compile (read from the kept `.aux` files) and the label, and jump to the source line when clicked.
- **Overview:** the count cards, plus the current texcount word counts, plus **Submission metadata** (title, authors, keywords, date, abstract) with **Copy submission metadata**.
- **Footer:** "Numbers and pages come from the last compile", marked stale when the source is newer, and **Refresh**.
- Built as one pure scanner (`editor/insights.ts` plus a self-check) over the files the project scan already walks.

## 4. Review (Preflight and the current Review, combined in Tools)

Your request: one **Review** button in Tools that runs the Preflight checks and the current review procedures together. Preflight lives here, not in the sidebar. The slot beside Files goes to Research (section 4a), and chat history moves to a history menu on the bottom card: today's chat list, with every saved Ask and References chat and the Edit chats saved before 2.0. Spectrum agent threads are listed in the agent workspace's history (section 7). Chats stay in `.spectrum/chats` in today's format, so 1.10.4 still reads them, and they travel through GitHub with the project (your choice).

Tools then holds **Checkpoints, Logs, Review and GitHub**.

**What one press of Review runs**
1. A compile first if the source is newer than the PDF (a failed build doesn't stop the review).
2. **Preflight checks** (instant, no internet, no key), built fresh from the behaviour Oleafly describes. Each group has a tick box and a disclosure; one run computes every ticked group from the latest log, PDF and source. A group without its inputs says "Compile first" rather than "No problems".
   - **Compile and layout:** failed build, unresolved references and citations, missing glyphs, overfull boxes (with line links), rerun warnings, duplicate destinations, mixed page sizes, text outside the page.
   - **References and assets:** undefined citations and references, duplicate labels and keys, missing images, uncited entries, incomplete or duplicate bib entries (DOI, title), floats never referenced.
   - **Privacy and blind review:** secret-looking files and keys, `\todo`/`\hl`/fixme marks, and with Anonymous review on, `\author`, `\thanks`, acknowledgements and the PDF's Author field.
   - **Accessibility:** document title and language, tagged PDF or not, figure alt text, heading skips, link text, small text, bookmarks, selectable text, and a **screen reader view** of the text pdf.js extracts, page by page.
   - **Submission readiness (generic):** PDF version, encryption, unembedded fonts, non-portable or absolute paths, figure formats, abstract and keywords. arXiv and IEEE profiles later; ATS (CV) checks later.
3. **AI review** (when ticked and a model is set up): one read-only pass over the whole document in `\input` order with line numbers, told what Preflight already found. It covers what today's four buttons did (full report with strengths, weaknesses, questions, missing experiments, clarity, suggestions, score and confidence; the consistency check's terminology, notation, data, logic and style categories; missing citations). It returns findings as **Major, Minor and Notes**, each anchored to a file, line and quote; a finding whose quote can't be found is shown without a link. It never edits your files, and it costs about one read of the paper instead of today's several.

**Results**
- A counts line ("2 errors · 6 warnings · 3 major · 9 minor"), then the groups in order, each with its counts; the AI review adds a collapsible report (summary, strengths, score, confidence, limits).
- Rows jump to the source line, or to the PDF page; AI rows also get Show in PDF.
- **Fix with AI** per row and per group, through the same path the Logs tab uses, so fixes arrive as reviewable changes; **Dismiss** per row.
- Cancel while running, "Last run 3 min ago · source changed", and Copy report.
- Without a model key Preflight still runs and the AI group says how to set one up.

## 4a. Research in the left sidebar, with deep research

Your request: Research leaves Tools and becomes a sidebar tab beside Files (**Files | Research | To-dos**), expanded with ideas from how Oleafly does deep research.

**Today's problems it fixes:** each search uses only the first provider that answers; Web search and the citation assistant can add the same paper twice under two keys; and results vanish when the panel closes.

**The panel, top to bottom**
- **A question box** with source chips: OpenAlex, Semantic Scholar, arXiv, Crossref, PubMed, the web (your search provider), your Zotero library and the project's `.bib`. Year and preprint filters. Two buttons: **Search** (plain backend code, no AI needed) and **Deep research** (an agent run).
- **Find citations for selection:** today's citation assistant, kept.
- **Sessions,** one per question, saved in the project as `.spectrum/research/<id>.json` (travels through GitHub; 1.10.4 ignores them). Each shows a run log (queries, and counts or failures per source) and merged results with badges (sources, year, citations, open access, "already in .bib as Key").
- **Per result:** keep or drop with a reason, Cite, **Add kept to .bib**, Open note, Get PDF.
- **Draft related work** and **Verify claims** open the agent workspace with a prepared task.

**How Search works:** every query runs against every chosen source at once, and one failing source doesn't stop the rest. Results are merged by DOI and title, keeping the fullest record, and marked if already in the project. An optional single AI pass adds a one-line "why it matters", a keep or drop suggestion and a theme to each. Every add goes through the backend's duplicate-checking reference path. That fixes the double-key problem.

**What Deep research does (agent, through section 7):**
- **Wider search:** starts from the session, tries more phrasings, and follows each kept paper's references and citations through Semantic Scholar.
- **Reading:** reads open-access full text (Unpaywall or arXiv) and writes `research/notes/<key>.md` and `research/reading-list.md` grouped by theme, with where each fact came from.
- **References:** proposes `.bib` additions through the changes tray.
- **Claim checks:** Verify claims audits a section claim by claim against its cited sources (verified, partial or unsupported) and never edits your text.
- **Tools on every system:** the research functions are also built into the Spectrum agent's own tools, so this works on Windows too, where local agents get no Spectrum tools yet.

**Also:**
- **Settings › Search** gains the OpenAlex key and email, the Semantic Scholar and NCBI keys, and the Unpaywall email.
- **Removed:** the arXiv "AI search model" mode and the inserting of summaries into the `.tex`.
- **Zotero:** papers you add reach the project's Zotero collection through section 9 unchanged.

## 4b. To-do list

Your request, modelled on Oleafly, which has two separate kinds: to-dos found in the source (a read-only tab in its Document insights) and the agent's plan checklist. Oleafly has no list you edit yourself; Spectrum adds one.

- **Where:** a third sidebar tab, **Files | Research | To-dos**, with a badge showing how many are open. It stays visible while you edit.
- **Two groups in one list:**
  - **Mine:** your own items, each with a tick box, text, an optional link and edit or delete.
  - **In the source:** `\todo`, `\missingfigure`, `\fixme` and the fixme package's notes, plus `TODO`, `FIXME` and `XXX` in comments. Each jumps to its line, and it counts as done when you remove the mark. The same scanner feeds Document insights' To-dos tab, which keeps showing these as in your screenshot, and Review's privacy check.
- **Links:** an item can point at a source line (found again by its text if lines move), a PDF page, or a reference.
- **Adding:** the box at the top of the tab, or right-click "Add to-do here" in the editor (links the line) or on the PDF (links the page).
- **Filters:** Open, Done or All; Mine or Source; and the sidebar's search.
- **Storage:** one small file per item in `.spectrum/todos/`, so both computers' lists merge through GitHub without overwriting each other; 1.10.4 ignores the folder.
- **Agents:**
  - They can read the list: the open to-dos (and, for Deep research, the session) are sent with the first prompt as ACP resources.
  - An agent's suggested to-dos appear as cards you confirm with Add. They come from a `suggest_todo` tool (the Spectrum agent's own, and the MCP server's on macOS); local agents on Windows use "Save open steps as to-dos" instead.
  - The agent's own working plan stays in the workspace's plan strip, with "Save open steps as to-dos".

## 4c. Versions become Checkpoints

Your request: the offline version history is renamed **Checkpoints** everywhere, so it can't be confused with GitHub. The Tools tab, the Save version button and its shortcut (now Save checkpoint, ⇧⌘S), toasts, Settings and the README all say checkpoint. Automatic ones keep their reasons in the new words ("Before pull from GitHub", "Before AI changes", "Before rename").

- **Settings › Checkpoints**, like Oleafly's:
  - **Save a checkpoint when a compile succeeds** (on by default): saved in the background, only when the source changed since the last checkpoint, and at most one every 10 minutes (a newer compile checkpoint replaces the last automatic one inside that window). Manual and "Before…" checkpoints are never replaced.
  - **Warn me when a checkpoint fails to save** (on by default): says when storage fails or a file couldn't be captured (too large or unreadable), instead of failing silently.
- **Storage is unchanged** (`.spectrum/history`), so 1.10.4 still lists every checkpoint as a version, and the clean-up rules are as before, plus the 10-minute replacement above (a replaced compile checkpoint takes the stored files only it used with it) and the new delete option. Tools › Checkpoints adds **Delete automatic checkpoints older than…**.
- **Going back to 1.10.4:** it lists compile checkpoints as its own versions, so a Save version or a restore there with nothing changed since a compile checkpoint saves nothing new and leans on that one. A compile checkpoint isn't replaced when the files match an older checkpoint (a restore made there), but Delete automatic checkpoints can't tell, and removes it.
- Checkpoints stay on each computer; GitHub's history is what crosses computers.

## 5. Compile

- **Compiler saved per project** in `.spectrum/settings.json`, so it follows the project to your other computer. The menu heading becomes "Compiler (this project)".
- **App-wide defaults for every compile setting (your request):** compiler, auto compile, error handling, bibliography tool, draft mode, syntax checks and the Markdown PDF engine each have a default that applies across the app, set in Settings › Engines › LaTeX (the Markdown PDF engine in the Markdown tab) or from the compile menu with "Use for all projects". A project uses the defaults until you change a setting for that project, and "Use the default" puts it back. The compiler's default is **Auto**, for existing users too: it is a new setting that starts on Auto, not today's saved compiler choice. The defaults stay on each computer; per-project choices travel in `.spectrum/settings.json`.
- **Auto compile:** Off (default) / After a pause (1 to 10 s). A newer automatic compile replaces an out-of-date one instead of being dropped.
- **Compile error handling:** Try to compile despite errors (default) / Stop on first error. This also fixes today's inconsistency (Tectonic stops at the first error while pdfLaTeX carries on).
- **Syntax check before compiling:** from TexLab's diagnostics (section 8); blocks the compile only on errors you choose.
- **Faster builds:** keep each document's `.aux`, `.bbl`, `.toc` and similar between compiles (per engine), skip BibTeX/Biber when nothing is cited, and run the third pass only when the log asks. Kept files are reused only when the compile that wrote them succeeded; if a compile fails while reading a kept file, Spectrum clears them and compiles once more from scratch, so a bad `.aux` never locks you out.
- **Recompile from scratch:** clears the open document's kept files and compiles.
- **Recompile all:** clears every document's kept files and compiles every document in the project, linked documents first (the xr-hyper order).
- **Fast (draft) mode:** one pass with images drawn as boxes (Overleaf's approach); Tectonic gets `--reruns 0`.
- **Bibliography tool:** Auto / BibTeX / Biber, honouring `% !BIB program`; makeindex and makeglossaries run when their files appear. `% !TEX root` is honoured too.
- **Shell escape is left out of 2.0** (you didn't ask for it, and it would give agents a way out of their sandbox). latexmk now always runs with `-norc`, so a project's own `latexmkrc` can't run code.
- **Stop compilation** also appears in the menu (it is already on the Compile button while compiling).
- **Open Logs when a compile fails** (setting) and a **TeX folder** field for a second TeX installation.

## 6. PDF viewer

- **PDF sidebar,** opened from a new Document outline button in the PDF header, with two tabs:
  - **Contents:** the PDF's bookmarks with the current section marked; without `hyperref`, the source headings across `\input` files. Clicking stays in the PDF.
  - **Pages:** page thumbnails with the current page outlined.
  - It replaces the hidden More › Table of contents popover. The sidebar Outline at the bottom left stays for the source.
- **Find in the PDF** (⌘F when the PDF has focus), an editable page box, PgUp/PgDn/Home/End and ⌘0/⌘9 for fit width and fit page, and the page remembered per document.
- **Presentation mode** for Beamer slides.
- **PDF notes saved with the project,** one small file per note in `.spectrum/notes/`, so notes from both computers merge through GitHub without overwriting each other; 1.10.4 ignores them.
- **PDF follows the open file** (new setting, default on): switching to another document's `.tex` switches the PDF to that document's PDF, and Compile and auto compile then build the document being shown. Opening a file that isn't a document (a `.bib`, a chapter without `\documentclass`) leaves the PDF as it is. A chapter with `% !TEX root` shows its root's PDF. In Typst and Markdown projects only the main file is a document. Picking a PDF or document by hand turns following off until the next file switch. Off keeps today's behaviour, where the PDF stays put.

## 7. Agent workspace (redesign)

Simple chat (Ask) and References stay in the bottom card. Full agentic work moves into a workspace that fills the whole right side in place of the PDF, modelled on Oleafly's layout.

- **Header:** tabs for **Spectrum agent** (the built-in Edit mode, moved here from the bottom card; your choice) and **Local agents** (the 1.10 ACP agents: OpenCode, Codex, Claude, Qoder, Cursor, Kimi and the others); session history, Isolated or Direct badge, model and mode options, Stop, and a PDF button to switch back. Closing the workspace does not stop a run; a dot on the Agent button shows running, waiting for you, or changes to review.
- **Welcome screen:** "What would you like to do today?", the project it is working on, and task buttons (Literature sweep, Related work, Citation audit, Manuscript review and similar), each a prepared prompt.
- **Agent picker:** a row of agent icons with the selected one named, above the message box.
- **Transcript:** messages, collapsed thinking, one card per tool call that updates in place (with output, terminal output or a side-by-side diff), and permission and question cards in line.
- **Plan strip** that follows the agent's plan, and a **changes tray** ("N files, +a −b") that opens a review view in the pane: per-file Apply/Reject and a preview PDF compiled from the agent's copy. On macOS that preview compiles inside the agent's sandbox; on Windows it compiles outside isolation with TeX told to read and write only in the copy and its build folder and to run nothing, output in Spectrum's cache, never in the copy. MiKTeX takes that from its `[Core]` settings (`AllowUnsafeInputFiles`, `AllowUnsafeOutputFiles` and `ShellCommandMode`) through its environment, which a value in its own configuration overrides, so Spectrum asks `initexmf` what MiKTeX will use and makes no preview when it can't confirm them. TeX Live 2025 and earlier take `openin_any`/`openout_any`; TeX Live 2026 and later ignore `openin_any`, so with them a Windows preview isn't made and the changes are reviewed as text. Shell escape is turned off on the command line too (MiKTeX ignores `shell_escape`), and Biber, latexmk and the glossary tools, which are Perl or Lua and ignore those limits, don't run for a Windows preview. A test on the Windows build machine (GitHub Actions, where MiKTeX is installed) checks that an `\input` of a file outside the copy fails and that `\write18` doesn't run. Tectonic's file reading can't be restricted, so on Windows a preview that would use it shows the diff with "Preview PDF needs TeX Live or MiKTeX on Windows". The built-in engines also run locked down: Tectonic with `--untrusted`, Typst with `--root` set to the copy, pandoc with `--sandbox`.
- **Checkpoints:** the "Before AI changes" checkpoints shown as Restore rows in the transcript.
- **Setup** moves to Settings › Agents.
- **Spectrum tools for agents:** a small bundled MCP server the agent runs inside its sandbox, offering `compile`, `get_log`, `project_map`, `bib_entries`, `bib_search`, `literature_search`, `fetch_bibtex` and `suggest_todo`. **macOS first:** on Windows the sandbox stalls new Node pipes (a known 1.10 limit), so Windows agents get no Spectrum tools until that is solved, and Settings › Agents says so. The task buttons work without the tools.
- **Kept from 1.10:** the ACP client, the macOS and Windows isolation, review snapshots, apply with merge and journal. **Rebuilt:** the whole UI.
- **Review mode (your choice):** you can keep prompting on the agent's draft copy; changes pile up in the tray and you apply or reject them per file whenever you like. Applying a file makes it the new baseline for that file; rejecting a file resets the draft's copy to your live file and tells the agent. The Spectrum agent uses the same tray, Apply/Reject and "Before AI changes" checkpoint.
- **Where sessions are kept:** Spectrum agent threads are `.spectrum/chats` files marked as agent threads, so they travel through GitHub; the workspace lists them and the bottom card doesn't. An old Edit chat opened from the bottom card continues in the workspace. Local-agent runs stay on each computer.
- **Backend fixes:** merge streamed chunks so long turns keep their start, let review sessions keep iterating on the draft, send context as ACP resources instead of pasted text, and report the real app version.

## 7a. Personas and skills

Your request, modelled on Oleafly's Settings › Personas and Skills.

**Personas** (Settings › Personas): reusable instructions you pick in chat for a task; while one is selected it replaces your default instructions.
- Create, edit (name, colour dot, instructions), delete, and Reset to defaults. Four starters written for Spectrum in Australian English: Research writer, Document editor, Critical reviewer, Draw a figure.
- A picker in the composer of the bottom card and of the agent workspace; the choice is remembered per chat.
- Applied to the Spectrum agent and Ask (never to autocomplete), and also to local agents, which Oleafly doesn't do. Spectrum reconnects a local agent every turn, so the persona goes in the agent's own system-prompt option on every new, loaded or resumed session where it offers one; otherwise it goes in the prompt on every turn that opens a new session (the first turn, or every turn for agents that can't load sessions). Changing persona starts a fresh session.
- Personas follow you through the private settings repo (section 10).

**Skills** (Settings › Skills): instructions in the open Agent Skills format (a folder with `SKILL.md`). The assistant sees each skill's name and description and loads the full instructions only when it needs them, or straight away when you type `/skill-id`.
- **Built-in pack (your choice): 12 writing and research skills from K-Dense's repository (each with its own licence, see Ground rules):** paper lookup, literature review, citation management, peer review, scientific writing, critical thinking, hypothesis generation, venue templates, research grants, scientific slides, LaTeX posters and Mermaid diagrams. Plus Spectrum's own LaTeX, Typst, Markdown, related-work and verify-claims skills, written fresh. Each card shows the author, licence, version, file count and what it needs to run (some scripts need Python 3.11 or later, which you add as a runtime folder in Settings › Agents).
- **Your own skills:** Create skill, Add folder (copies it in, regular files only), Duplicate a built-in to edit it, Delete, and a file browser. They follow you through the settings repo.
- **On or off:** every skill has a switch; All projects / This project lets a project differ, stored in `.spectrum/settings.json`.
- **Spectrum agent:** a skills list in its instructions and `load_skill` / `read_skill_file` tools, so skills work on Windows too. Its skills list says a skill's scripts can't run there.
- **Local agents:** before each session, Spectrum copies the skills on for that project into the agent's private sandbox home (marked as Spectrum's, so skills the agent installed itself are never touched). While another project's session of the same agent is running, Spectrum only adds skills to that home and removes stale ones later. No links into your real folders are needed for this.
- **Share skills with other agents on this computer** (off by default): links your skills into `~/.agents/skills` and `~/.claude/skills` for agents you run outside Spectrum, only where those folders already exist, never replacing anything already there.
- **Task buttons** in the agent workspace become a prompt plus a skill and persona (Literature sweep with paper lookup, Citation audit with citation management, Manuscript review with peer review and Critical reviewer, Related work with Spectrum's own skill).

## 8. TexLab

What it adds that Spectrum lacks: diagnostics before compiling (undefined, duplicate or unused labels and citations, brace and environment mismatches, bib errors), go to definition and find references for `\ref`, `\cite` and `\input`, rename of labels and citation keys across files (including the `.bib`), hover previews of citations and labels, and a project-wide outline across `\input` files.

What it duplicates and is left off: completion (Spectrum's is better for maths and snippets), building, forward search, and formatting by default.

- **Bundled (your choice):** TexLab 5.26.0 ships inside the app beside Node, a universal Mac binary (about +31 MB) and a Windows one (about +15 MB), with its GPL licence and source link in the third-party notices.
- **Build:** the Mac binary is downloaded at build time against a pinned SHA-256 and joined into a universal binary like Node; the Windows one is built on GitHub Actions with the C runtime linked in (no Visual C++ install needed) from the checked v5.26.0 source tarball, as crates.io has TexLab only up to 4.3.2, and that tarball is the source attached for the GPL.
- **How:** the backend starts `texlab run` per open project and relays it to the editor through `@codemirror/lsp-client`, with a custom workspace so jumps open files through Spectrum's own file opening; `.bib` files are sent as BibTeX.
- **Rename is Spectrum's own command (F2):** it asks TexLab for the edits, saves a "Before rename" checkpoint, and writes every affected file through the normal save path with its change checks, all files or none.
- **Feeds:** squiggles in the editor, the syntax check before compiling, Document insights counts and Review.
- **Without TexLab** Spectrum works as today.

## 9. Zotero

- **Reading:** pick citations with Zotero's own picker through Better BibTeX when installed, or a search box in Spectrum; `\cite{` completion can include your Zotero library; imported entries keep their Zotero citation key.
- **Writing:** each project gets a `Spectrum/<project>` collection. Spectrum keeps it in step with the project's references after every add, after a `.bib` save, on opening and on window focus. It finds existing library items by citation key, DOI, arXiv id or title and year, adds them to the collection, and creates items only for entries Zotero lacks.
- **Removals** happen only after this computer saves a `.bib` and every `.bib` was read in full; opening and window focus only ever add. A half-written or unreadable `.bib` never strips the collection.
- **Two computers:** the collection is created only when none is stored; if the name `Spectrum/<project>` is already taken, it is `Spectrum/<project> (2)`, and a collection keeps its first name when the project is renamed. If the stored collection hasn't reached this computer's Zotero yet, Spectrum waits ("Waiting for Zotero to sync this project's collection") rather than making a second one.
- **Copies:** the stored binding records which project it belongs to, so a Finder copy of a project gets its own collection instead of fighting over one.
- **Prompts:** Zotero calls go through Spectrum's backend; while Zotero's citation picker or its one-time Allow prompt is waiting, Spectrum brings Zotero forward and shows "Answer in Zotero" with Cancel.
- **Safety:** Spectrum never deletes Zotero items and never edits the `.bib` from the Zotero side; the `.bib` stays the source of truth and compiles never wait for Zotero. The collection key is stored in `.spectrum/settings.json` so both computers use the same collection.
- **Channel (you run Zotero 10 with Better BibTeX):** Zotero 10's local API for reading and writing, authorised once in Zotero ("Always Allow"); Better BibTeX's picker and citation keys.
- **Collection contents (your choice):** it mirrors the project's `.bib`. An entry removed from the `.bib` is taken out of the collection; the item stays in your library.

## 10. GitHub (now the way projects sync)

- **Engine:** isomorphic-git (MIT, pure JavaScript, about 5 MB), so it works on Windows and on a Mac without the developer tools. It writes through Spectrum's own file saving, which writes each file whole or not at all, so a crash or kill can't leave half a file in `.git`. Spectrum leaves the repo alone while `.git/index.lock` exists.
- **Sign-in (your choice):** one-click device-code sign-in through a "Spectrum" OAuth app you register under beyond3345 (steps provided when we get there), with pasting a personal access token as a fallback. The token stays in the backend, never in the window.
- **What goes in the repo (your choice):** your source files, figures and `.bib`, plus Spectrum's `.spectrum/project.json`, `settings.json`, `chats/`, `todos/`, `notes/` and `research/`. Not committed: checkpoints (`.spectrum/history`, which stay on each computer; GitHub's history is the shared one), other per-computer files, TeX build files, and compiled PDFs (your choice: before each backup Spectrum puts each compiled document's PDF in `.git/info/exclude`, one line each, not `*.pdf`, since figures are often PDFs; a PDF that a source includes, through `\includegraphics` or `\includepdf`, is never excluded). Link offers to stop tracking compiled PDFs already in the repo. The project's `.gitignore` holds only the TeX build-file patterns and is written only if none exists.
- **Shared repos:** when the linked repo is public or has other collaborators, Spectrum asks before committing chats, to-dos, notes and research (default: leave them out). Deleting a chat says GitHub's history keeps earlier copies.
- **Initialise:** `git init` on `main`, the ignore rules above and a first commit. Every backup repeats the checks for secret-looking files and files over GitHub's 100 MB limit, leaving such files out with a notice.
- **When it syncs (your choice: automatic plus a button):** pull when you open a project, back up about a minute after you stop editing and when you close the project, and **Sync** any time. Chats and research sessions are committed at Sync and when you leave the project, not on every idle backup. When you quit Spectrum, only the local commit is made; the push runs at the next start or when the connection returns.
- **Offline and errors:** only a network failure waits quietly and catches up when the connection returns. A sign-in GitHub no longer accepts shows "Sign in to GitHub again", a repo you can't reach shows "No access to owner/repo", and a refused push shows GitHub's own message. Each also shows as "Not backed up since <time>" on the project card and in the GitHub tab. Opening a project offline shows "Couldn't check GitHub, so this may not be the latest".
- **Back up:** commit what changed ("Backup from <computer>", or your label) and push; the first time, create a **private** repo and record `{owner, repo}` in `.spectrum/settings.json`. If GitHub has newer commits it pulls first.
- **Pull,** built by Spectrum rather than isomorphic-git's own pull (which moves the branch before the files and mangles binary files): fetch first, outside the project lock. Then, under the lock: commit this computer's changes, save a "Before pull from GitHub" checkpoint, find the common commit, and merge each file changed on both sides:
  - text files on their raw bytes with Spectrum's line merge;
  - `project.json` and `settings.json` key by key (one level deeper where a value is itself a group of settings), and chats by message (a line merge would always clash on them), reusing the cloud mirror's merge rules;
  - every other JSON file in `.spectrum/` (to-dos, notes, research sessions) item by item and field by field against the common commit, with a session's results joined; a deletion wins only over an item the other side didn't change; nothing inside `.spectrum/` ever gets a conflicted copy;
  - one-sided changes take that side; a delete and an add whose paths differ only in capital letters or in how accented letters are stored are one rename (as the mirror treated them), and deletions are applied before writes;
  - a compiled document's PDF stays this computer's, with no conflicted copy; any other binary or unmergeable file keeps this computer's copy with GitHub's beside it as a conflicted copy; deleted-versus-changed keeps the changed one; a pull that would delete many files at once asks first.
  Chat, to-do, note and research-session saves take the same lock, and a pull waits while a compile or a Direct-mode agent turn is running. Each file is written only if it still holds what was just committed (the mirror's place check); if one doesn't, or a write fails, the files already written are put back from the "Before pull from GitHub" checkpoint, `main` stays where it was, and the pull runs again. Once every file is written comes a two-parent commit, and only then does `main` move. After a pull that changed anything in `.spectrum/`, the To-dos, PDF notes and Research panels reload. No conflict markers ever land in `.tex` files, and conflicted copies are committed so the other computer sees the banner too.
- **GitHub projects view (your choice)** replaces Cloud projects in the projects page sidebar: your repos that are Spectrum projects (they carry `.spectrum/settings.json`), each linked project with ahead and behind counts, **Get from GitHub** (clone into your projects folder, keeping the project's id from `project.json`) for ones not on this computer, and **Link** when a repo matches a project already here. Link on a project with a 1.10.4 mirror record uses the files as they were at the last mirror sync as the common starting point, so only files changed on both sides conflict; without one it starts from nothing and shows "N files from GitHub, N conflicts" before writing anything.
- **Refused:** existing repos that use Git LFS or submodules, or are mid-merge or on a detached HEAD, with a message saying why. A Finder copy of a project shows GitHub as not linked (the link records the project id).
- **Projects inside a sync app's folder** (Synology Drive, Dropbox, Google Drive, OneDrive or iCloud, including Documents when iCloud keeps Desktop & Documents; some were used in place under 1.9) get a warning at Initialise and Link, since sync apps corrupt repositories, and an offer to move them into your projects folder. Get from GitHub never clones into one, and Settings won't accept one as your projects folder.
- **UI:** Settings › GitHub (connect or disconnect, the private settings repo), a GitHub tab in Tools (status, ahead and behind, last sync, Sync, Pull, Back up, Open on GitHub), the GitHub view on the projects page, and "Sync with GitHub" in a project's menu. No staging, branches or diff UI; Checkpoints already shows diffs.

**Your settings follow you (your choice):** Spectrum keeps one private repo on your GitHub (for example `spectrum-settings`) for your settings, personas, your own skills and templates, project folders and tag colours. Each computer writes only its own settings file there, so the two never clash; the newer value wins per setting, as with today's settings sync. Your own skills and templates go as folders (`skills/<id>/`, `templates/<id>/`) in today's shared-template layout, each with when it changed, where it came from and a deletion mark; personas are one file each. When both computers changed the same one, the newer wins; it never gets a line merge or a conflicted copy. A computer that has never shared its settings, and the first GitHub sign-in on a computer, take the repo's settings first, so a new computer's defaults never overwrite the others. The repo is pulled at start-up and pushed shortly after a change; signed out, settings stay on this computer. API keys and tokens are never put in it.

## 10a. Cloud sync removed, and moving your Synology projects

What goes: cloud locations in Settings, Sync to (Mirror and Move), Download, Stop syncing, the Cloud projects view, the mirror engine, the "also open on another computer" banner, and the shared `.spectrum-shared` folder. What stays because GitHub and outside edits still need it: the changed-on-disk prompt, held unsaved text, the conflicted-copy banner, the line merge, and the machine name. Also kept, moved into the GitHub pull: the mirror's merge rules (`project.json` and `settings.json` key by key, chats by message), its check before writing a file, its rename rule and its many-deletions brake; the sync-app folder detection, for section 10's warning; reading (never writing) the mirror records, used only by this migration and by Link; and today's Move to this computer, kept only as the offer to move a project out of a sync app's folder into your projects folder.

On the first start of 2.0:
- **Your three Synology projects** are already ordinary folders on this computer, so they simply become local projects; mirroring stops. Spectrum checks whether the Synology copies have changes this computer never received and, if so, lists them with Show in Finder (it never merges them itself).
- **Projects used in place inside a sync folder** keep working where they are; the GitHub tab offers to move them into your projects folder.
- **Nothing is deleted:** the copies in Synology Drive, and Spectrum's mirror records, are left as they are, so going back to 1.10.4 resumes mirroring safely (tested).
- A one-time notice says this, and suggests linking each project to GitHub here, then using Link on the other computer's copy.
- Before updating, open 1.10.4 on each computer and let it show Synced, so both copies are level.

## 10b. Engines: LaTeX, Typst and Markdown

**Settings › Engines** gets LaTeX, Typst and Markdown tabs like Oleafly's. The LaTeX tab holds section 5's compile defaults. Like TexLab, Tectonic and Typst are fetched by `desktop.mjs` for both dev and release builds, checked against pinned SHA-256s, with the Mac halves joined into universal binaries.

**Tectonic built in (your choice).** Tectonic 0.17 ships inside the app, about +45 MB to the DMG (+109 MB installed on Mac), so LaTeX and Markdown compile even with no TeX installed. The compile menu lists it as "Tectonic (built in)". Auto prefers your installed TeX and falls back to the built-in Tectonic. Each TeX package's first use downloads it from Tectonic's own server; after that it works offline. When the log shows a download failure, the error says Tectonic couldn't reach its server, offers Try again, and suggests installing TeX Live or MiKTeX.

Biblatex with Biber isn't covered: Tectonic's packages need Biber 2.17, so with only the built-in Tectonic Spectrum says "biblatex with Biber needs TeX Live or MiKTeX (or use backend=bibtex)", and Auto never picks the built-in Tectonic for such a document when another TeX exists. On Windows, Spectrum ships a small font settings file (`fonts.conf`, listing the Windows and per-user font folders) and points Tectonic at it whenever it runs, so Tectonic finds system fonts by name.

**Typst (built in, your choice)**
- **Versions:** Typst 0.15.1 ships inside the app, about +30 MB to the DMG (+94 MB installed on Mac) and +22 MB to the Windows installer. Settings › Engines › Typst shows the built-in version and a Typst found on your computer. Older versions (0.14.2, 0.13.1, 0.12.0) install on demand, checked against pinned SHA-256s.
- **Windows:** Typst's own builds need Microsoft's `vcruntime140.dll`, which Windows doesn't always have. Spectrum ships that signed file (Microsoft allows apps to carry their own copy) and puts a copy beside every `typst.exe` it bundles or downloads.
- **Version per project:** a project pins its version in the compile menu ("Typst version (this project)") and keeps it until you change it. A missing version offers Download or Use default.
- **Projects:** a `.typ` main file makes a Typst project; there are new Typst starter templates (simple document, report, letter, CV).
- **Compile:** compiles into Spectrum's build folder. `@preview` packages are cached by Spectrum, so only a package's first import needs the internet; offline, the error says so. Errors appear as error cards with file:line.
- **Editor:** Typst highlighting, folding and completion, from `codemirror-lang-typst` 0.6.0 (pinned exactly) through its `typst_lezer` entry, which needs no WebAssembly; if it fails to load, the file shows as plain text. Its own completions are offered only in Typst 0.15 projects. The outline shows `=` headings across `#include`; `@` completes `.bib` keys and labels; Cite inserts `@key`.
- **PDF and source:** Typst has no SyncTeX, so jumping between them matches text in 2.0. The precise jump, and Tinymist's language features, come later as an on-demand download.
- **Other panels:** spell and grammar checks learn Typst markup. Document insights and Review read headings, figures, equations and citations with their pages from Typst itself. Floats insert `#figure(...)`.
- **Left for later:** Tinymist, `typst watch`, PNG/SVG/HTML export, Hayagriva `.yml` writing, and Typst Universe templates.

**Markdown**
- **pandoc (your choice):** Spectrum uses a pandoc already on your computer (3.1 or later for LaTeX output, 3.8.3 or later when the project uses Typst; an older one gets the download offer). Otherwise Settings › Engines › Markdown offers a one-time download of pandoc 3.12.1 (about 42 MB, checksum-checked).
- **Projects:** a `.md` main file makes a Markdown project, so a LaTeX project's `README.md` never becomes one. There is a "Markdown article" template with YAML title, author, date and bibliography.
- **Compile in two steps:** pandoc writes LaTeX, then Spectrum compiles that like any LaTeX document, with the built-in Tectonic or your TeX. Stop, timeouts, draft mode, error handling, the log and page numbers carry over; jumps between the PDF and the `.md` match text, as errors do. pandoc runs with `--extract-media` into the build folder so remote and embedded images become files, SVGs are converted with rsvg-convert when it's installed (otherwise the log says so), and the `.md` file's folder is on TeX's search path.
- **Typst instead:** a project can choose Typst as its PDF engine.
- **Citations:** pandoc's citeproc with the front matter's `bibliography:` and `csl:` (or every `.bib` in the project). Cite, Zotero and Research insert `[@key]` in `.md` files.
- **Errors:** pandoc's errors link to their line. TeX errors are traced back to the `.md` line by matching text, and Logs offers "Show generated LaTeX". With Typst, errors in the generated `.typ` are traced back to the `.md` the same way.
- **Editor and panels:**
  - Markdown highlighting, folding and an outline.
  - Spell checking learns to ignore code, URLs, `[@key]`, maths and front matter.
  - Document insights reads headings, figures, tables, equations, citations, `<!-- TODO -->` and metadata.
  - Review runs its compile, log, PDF and privacy checks; the LaTeX-only source checks say they don't apply.
  - Floats insert `![caption](path){#fig:x}` and pipe tables, and Insert (+) offers Markdown snippets (Typst snippets in Typst projects).
- **Exports:** Convert to LaTeX project and Export to Word (.docx).
- **Left for later:** a visual Markdown editor, Word and HTML import, `[@fig:x]` cross-references (pandoc-crossref), Mermaid, and exact source maps.

**Engines and the agent sandbox:** downloaded engines (pandoc, older Typst versions) go in their own folder, `engines` in Spectrum's data folder, which sandboxed compiles may read and run; nothing else in Spectrum's data folder is opened to them. Sandboxed compiles keep Tectonic's and Typst's package caches in the agent's home, so an agent's first compile may download again; Spectrum never passes its own cache folders into the sandbox.

## 10c. Diagram composer

Your request, modelled on Oleafly's composer but going further: Oleafly only draws boxes and arrows, while you draw circuits.

- **Where the ideas come from (your choice):** the window, layout and controls follow Oleafly's composer; the circuit logic (how parts, pins, wires, rotation, labels and the circuitikz export work) follows [CircuiTikZ-Designer](https://github.com/Circuit2TikZ/CircuiTikZ-Designer). Both are GPL-family licensed, so Spectrum studies them and writes its own version in its own words; it copies none of their code or symbol drawings and stays MIT. The README thanks CircuiTikZ-Designer alongside Oleafly.

- **Its own window (your request):** Draw a diagram (top bar and Insert (+)) opens a chooser (TikZ diagram, Typst diagram, Mermaid diagram), then a separate composer window you can put beside the document or on another screen. The main window keeps working, and closing the composer never quits Spectrum.
- **TikZ package menu (your choice: all four):**
  - **circuitikz:** about 40 parts in groups (resistors, capacitors, inductors, voltage and current sources including controlled ones, batteries, switches, diodes including LED and Zener, BJTs, MOSFETs, op-amps, logic gates, ground and supply, meters, transformers). Two-terminal parts sit on wires between grid points; op-amps, transistors and gates are placed parts with their named pins, so wires follow them when moved. Junction dots appear where three wires meet. An inspector sets each part's label, value, voltage and current arrows, and pole dots.
  - **pgfplots:** a plot dialog (functions or data from a file, domain, axes, labels, grid, legend) with a live preview, rather than drawing.
  - **Plain TikZ:** flowcharts and block diagrams: rectangles, rounded boxes, circles, diamonds, text and maths labels, and arrows (straight, right-angled, curved).
  - **tikz-cd:** commutative diagrams on a grid, with objects and labelled arrows.
- **Circuit logic taken from CircuiTikZ-Designer (rewritten):**
  - **Catalogue:** each part has options and mutually exclusive option groups. Every option combination is its own variant, with its symbol, reference point, size, pins and label anchor. It starts with about 40 parts and grows through Spectrum's own symbol generator.
  - **Two-terminal parts** sit between two grid points at any angle. The symbol keeps its size, lead lines fill the gap, and mirror, invert and the size slider are supported.
  - **Placed parts** turn in 45° and 90° steps and flip.
  - **Snapping:** every pin of what you drag tests the grid (0.25 cm) and nearby pins, and the nearest wins.
  - **Export:** one `\draw` or `\node` per element, with the options in circuitikz's order (part, options, mirror, invert, poles, size, name, label, voltage, current).
  - **Improvements on it:** wires stay attached to pins and follow moved parts, junction dots appear automatically, and nothing loads from the internet, so it works offline.
  - **Symbols:** Spectrum's own generator compiles each part from your installed circuitikz in your chosen style, then reads back the pin positions. Voltage and current arrows are drawn approximately on the canvas, and the compiled preview shows them exactly.
- **Style menu:** circuit symbols **American by default (your choice)** or European, with overrides (inductor style, voltage direction convention, siunitx values, diode fill, label placement) and a size slider. The style is kept inside the diagram, so your document's preamble only needs a plain `\usepackage{circuitikz}` and never clashes.
- **Draw and Code tabs:** the canvas writes clean TikZ (one `\draw` per wire or part, plain coordinates). The Code tab shows it and can be edited; editing the code by hand detaches the drawing ("Redraw from the canvas" replaces your edits; "Keep as code" leaves them). Spectrum doesn't try to read arbitrary hand-written TikZ back into a drawing.
- **Canvas:** grid snapping, pan and zoom, minimap, undo and redo, copy and paste, rotate and mirror, delete, and a light or dark canvas. Symbols on the canvas are drawn by your own circuitikz in your chosen style (rendered once and cached), so they always match the PDF.
- **Preview:** compiles the diagram on its own about a second after you stop changing it, using your installed TeX (or phase 5's built-in Tectonic), and shows the result; errors appear with "Fix with AI".
- **Saved file:** one file per diagram, `figures/<name>.tex` (a standalone TikZ document), with the drawing stored in a comment at the end, so checkpoints and GitHub carry it and reopening restores the drawing. Right-click a diagram in the file tree, or its line in the editor, and choose **Edit diagram**.
- **Into your document (your choice: `\includestandalone`):** **Insert as figure** hands the diagram to the Floats panel's figure card (caption, label, placement, width or natural size), which inserts `\includestandalone{figures/<name>}` in a figure float and adds the `standalone` package and the diagram's packages and TikZ libraries to the preamble if missing. Labels then use your document's fonts and maths.
- **Mermaid:** flowcharts and other Mermaid diagrams drawn in the window, rendered in the app, saved as `figures/<name>.mmd`; for Markdown documents they go in as an image, for LaTeX as a PDF figure.
- **Typst (fletcher):** the same canvas writing a fletcher diagram, included with `#figure(include …)`. This mode arrives with phase 5's built-in Typst.

## 11. Defaults I chose (say if you want any changed)

- PDF sidebar sits beside the pages (they narrow) rather than sliding over them; Contents uses the PDF's bookmarks, falling back to source headings.
- Auto compile is off by default. The compiler choice follows the project to your other computer.
- Not adding upLaTeX/pLaTeX; say if you write Japanese documents.
- Document insights and Floats take the PDF's place like Tools does, rather than opening as dialogs.
- GitHub repos are created private.
- ATS (CV) checks are left for later.
- Review compiles first when the source is newer; the AI review is ticked by default only when a model is set up.
- To-dos: ticking a source `\todo` doesn't edit your file (remove the mark yourself); the badge counts your open items plus source to-dos; agents' to-dos need your Add.
- Research writes `research/` notes only when you ask (Open note, Deep research), and PDFs download only when you click Get PDF.
- With TexLab, Tectonic and Typst built in, the Mac app grows from about 283 MB to about 520 MB installed, and the DMG from about 100 MB to about 195 MB.
- The Mermaid diagrams skill's diagrams show as code until Mermaid rendering comes (left for later).

## 12. Delivery

- **Phases,** each built on branches from the latest `feat/2.0` integration tip by parallel builders, merged there, then given adversarial review rounds until clean, as for 1.9. `main` remains the released version until 2.0 is ready:
  1. Panels, floats, Document insights, the to-do list, compile options and defaults, PDF sidebar, follow-the-file setting, the Checkpoints rename and settings (4c), and the rest of section 6 (Find, page box and keys, presentation mode, PDF notes), and Settings › Engines with its LaTeX tab for section 5's defaults (the syntax-check default arrives in phase 3). Until phase 3 the sidebar is Files | Chats | To-dos.
  1b. Diagram composer (your choice: straight after phase 1): the window, circuitikz, pgfplots, plain TikZ, tikz-cd and Mermaid. Its Typst mode comes with phase 5.
  2. Agent workspace, personas and skills, plus the to-do list's agent parts (open to-dos sent to agents, `suggest_todo`, Save open steps as to-dos).
  3. TexLab with the syntax check before compiling, then Review (Preflight checks with the AI review), then Research, which replaces the Chats tab; the bottom card's history menu ships with it.
  4. Zotero (with Research's Zotero source chip), GitHub sync with the settings repo, and removing the cloud sync with its migration.
  5. Engines: built-in Tectonic, Typst and Markdown, adding the Typst and Markdown tabs to Settings › Engines (with the Markdown PDF engine default).
- **Tests** for every new service and scanner, plus rollback checks against 1.10.4. Before relying on isomorphic-git, test Get from GitHub of a 1 GB repo on the Windows computer.
- README and CHANGELOG for 2.0.0. Version 2.0.0 is set; nothing is pushed as a release, tagged or published until you say so.
