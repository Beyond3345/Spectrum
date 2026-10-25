# Spectrum 2.0 continuation handoff

Updated 25 October 2026 (after phase 5's merge, its small review and the second 2.0 test DMG). Development work only: no tag, push or release was made.

## Where to resume

Paused by the user on 25 October 2026 to save usage until the week of 1 November. Every phase is built and merged into `feat/2.0`. Nothing is running: no builder, reviewer or scheduled check-in is active.

Use `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum` on **`feat/2.0`** (`e808c4c` or later; check `git log`). Read [SPECTRUM_2_PLAN.md](SPECTRUM_2_PLAN.md), especially its ground rules and Delivery section, and [SPECTRUM_2_REVIEW_PLAN.md](SPECTRUM_2_REVIEW_PLAN.md) before continuing. Nothing has been pushed, tagged or released; `main` is still 1.10.4 plus the README credit to Oleafly and CircuiTikZ-Designer, which is also in `feat/2.0`.

### Status by phase

| Phase | What | State |
| --- | --- | --- |
| 1 and 1b | Panels, floats, Document insights, to-dos, compile options and defaults, PDF sidebar and follow-the-file, Checkpoints; diagram composer (circuitikz, pgfplots, TikZ, tikz-cd, Mermaid) | Built, two review rounds, merged |
| 2 | Agent workspace, personas, skills, MCP tools, to-dos for agents | Built, three review rounds (the last found nothing serious), merged |
| 3 | TexLab, combined Review, Research sidebar, history menu | Built, two review rounds (the second found nothing serious), merged |
| 4 | Zotero, GitHub sync and the settings repository, cloud sync removed with its migration | Built and merged as `bab0316`. Reviewed once: 47 confirmed findings (8 high), fixed and merged as `efc81b2` (see Phase 4 review fixes). **The second round has not been run** (review 1 of the review plan) |
| 5 | Built-in Tectonic, Typst and Markdown engines; the composer's Typst mode | Built as planned in [PHASE5_PLAN.md](PHASE5_PLAN.md). Codex then audited the whole of 2.0 (21 findings, in `handover.md` at the repository root), and a small review reproduced and fixed all of them. Merged as `e808c4c`. **The full review has not been run** (review 2 of the review plan). See Phase 5 below |
| Test DMG | `Spectrum_2.0.0_universal.dmg` in `OpenPrism/builds` with phases 1 to 5, for the user to install and try | See "The 2.0 test DMG" below |

### Next steps, in order

1. **The user tries the test DMG** (phases 1 to 5).
2. Phase 5 is merged; its differences from the plan and its limits are under Phase 5 below, and the small review's fixes under Phase 5 small review.
3. **Reviews**, the week of 1 November, with ultracode, as set out in [SPECTRUM_2_REVIEW_PLAN.md](SPECTRUM_2_REVIEW_PLAN.md): phase 4's second round, phase 5, the whole of 2.0, then the next test DMG. Give phase 4's second round the first round's findings (Phase 4 review fixes below) and the fixer's diff (`git diff dde8ef5 c070493`). Give phase 5 the differences and limits under Phase 5 below.
4. **Final verification and the release DMG** after the reviews. Do not push, tag or release; the user tests the DMG first (and the Windows build only happens on GitHub Actions after the user approves a push).
5. **Things only the user can do** (also listed under each phase):
   - Register the Spectrum OAuth app on GitHub (steps under Phase 4 below) so one-click sign-in can be switched on; until then Settings › GitHub uses a pasted token.
   - Try Zotero 10 with Better BibTeX and a real GitHub test repository once, since both were only tested against stand-ins.
   - Run the Windows checks listed under each phase on the Windows computer.
   - Delete the four untracked files a Harper build left in the main checkout's `native/harper` (`.gitignore`, `README.md`, `harper_wasm.d.ts` and `harper_wasm_bg.wasm.d.ts`); the `.gitignore` there hides any new file in that folder from git. Until then the app bundles them too (a few kilobytes, harmless).
   - Empty one scratch file from the macOS Bin if you like: `main (GitHub’s conflicted copy 2026-10-25 155756).tex`, about 400 bytes of test LaTeX that a reviewer's live check put there.
   - Decide whether Locate… and Get from GitHub may write the one thing 2.0 never writes, moving a 1.10 mirror record aside (see Phase 4 limits).

### The 2.0 test DMG

- **File:** `OpenPrism/builds/Spectrum_2.0.0_universal.dmg` (210 MB, 516 MB installed). SHA-256 `5858f6730f67291adea115b14b0ccbbe8e03de65727e0ec788723243960d9092`, also in `Spectrum_2.0.0_universal.dmg.sha256`. The 1.10.4 DMG stays beside it for going back, and the earlier phases 1 to 4 test build is kept as `Spectrum_2.0.0-phases1-4_universal.dmg`.
- **Built** on 25 October 2026 from `feat/2.0` at `31c4f0b` with `npm run desktop:build`: every phase, with phase 4's first review fixes, phase 5's small review fixes, the two Typst and Markdown skills phase 5's build had left out and the user's interface changes after trying the first build:
  - the Compile menu offers auto compile as Off or On (Settings › Engines › LaTeX sets the pause);
  - compile error handling and the syntax check are app-wide settings, no longer in the Compile menu (a project's own value from before is left in its file and not read);
  - Settings' sections are grouped under General, Writing, Projects and AI;
  - the editor's header has two rows: the file tabs level with the PDF's header (Compile, Save checkpoint and the view stay above the PDF), then Insert (+), the floats, the assistant and the panels under them;
  - Insert figure, Insert table and an inserted diagram each open a panel with only their own cards (Figures, Tables, Diagrams).
- **Signed** ad hoc and not notarised, as the earlier local builds were, so the first open needs Open from the app's right-click menu (or Open Anyway in System Settings › Privacy & Security).
- **Checked without opening the app:**
  - `hdiutil verify` passed;
  - `spectrum`, `node`, `texlab`, `typst` and `tectonic` are universal (arm64 and x86_64);
  - Typst 0.15.1 and Tectonic 0.17.0 answer `--version`;
  - the bundle has the five Typst and Markdown templates and Spectrum's five own skills;
  - the bundled backend, started on its own against scratch folders, listed the built-in Typst and Tectonic and compiled the Typst CV template.
- **What installing it does:**
  - The first start of 2.0 runs the move to 2.0 on the real data folder: 1.10's cloud sync stops, mirrored projects become local projects and the projects page shows the notice.
  - 1.10's mirror records, `sync.json` and the cloud copies are left as they were, so 1.10.4 from its DMG still opens and syncs them if the user goes back.

### Housekeeping

- Every builder, fixer and Codex branch and worktree has been merged and removed (`fix/p4-review`, `fix/p4-texlab-flake` and `fix/p4-zotero-review` included; what was kept of the last one is in `fix/p4-review`'s commits).
- Do not cherry-pick old branches. Branch new work from the newest `feat/2.0`.

## Phase 5

### What was built

- **Engines.** `apps/backend/src/data/engines.json` is one list of Typst 0.15.1, Tectonic 0.17.0, the Typst versions that can be installed and pandoc 3.12.1, with each download's address, size and SHA-256. `scripts/desktop.mjs` fetches Typst and Tectonic for both Mac architectures, checks them and joins each pair into one universal sidecar; `src-tauri/tauri.conf.json` and `src-tauri/src/main.rs` put them beside the app and pass `SPECTRUM_TYPST` and `SPECTRUM_TECTONIC`. On Windows the Visual C++ runtime is copied beside `typst.exe`. `services/engineService.js` and `routes/engines.js` list the engines and install or remove Typst 0.14.2, 0.13.1 and 0.12.0 and pandoc 3.12.1, refusing a download whose digest differs.
- **Typst projects.** A `.typ` file is a document in the file tree and can be the main file; `main.typ` is found before `main.md`. The built-in Typst or the project's pinned version compiles it, with the project's `fonts` folder, a package cache in the app's data folder and `--input` values for the composer. Diagnostics come from `--diagnostic-format short` and open as cards in Logs, with Download and Use the default when a pinned version is missing. The editor loads `typst_lezer` on first use, follows `#include` one level in the outline, completes `@keys` and labels, masks `//` and block comments, raw text, maths and calls for spelling and grammar, reads `// TODO` and jumps from a PDF line to its words. The file tree lists a `.typ` diagram with its marker, so Edit diagram opens it in the composer.
- **Markdown projects.** A `.md` main file compiles through pandoc into LaTeX or Typst. YAML front matter supplies the title, authors, keywords, date, abstract, bibliography and CSL file; without one, every `.bib` in the project is passed. Errors in the generated LaTeX or Typst are traced to the `.md` line by word runs. Word export and Convert to LaTeX project are in the project menu. The editor has Markdown highlighting, headings in the outline, `[@key]` completion, Markdown figures and pipe tables, and a mask for the checkers.
- **Tectonic.** Auto uses the built-in Tectonic when no TeX is installed and still prefers an installed TeX. A biblatex document with Biber drops Tectonic when another engine is installed and otherwise compiles with a note. A bundle download that fails says which server to reach. The Windows workflow no longer downloads Tectonic.
- **Insights and Review.** Typst headings and labels get their number and page from `typst eval`; Markdown has headings and source items but no numbers, pages or word counts. Review runs only Compile and layout, References and assets, and Privacy and blind review for a Typst or Markdown main file, with a note that the source checks read LaTeX. Word counts stay LaTeX only, since `texcount` reads LaTeX.
- **The composer's Typst mode.** `diagram/modes/fletcher` puts fletcher flowcharts and block diagrams on the TikZ canvas. Its code follows the project's Typst version (fletcher 0.5.8 for Typst 0.13 and later, 0.5.5 for 0.12), is saved as `figures/<name>.typ` with a `//` marker, compiles in the preview with `spectrum-diagram=standalone` and inserts as `#figure(include "figures/<name>.typ")`. The Typst card is enabled only once `/api/engines` reports the built-in Typst. TikZ and Mermaid diagrams insert as images into Typst and Markdown, and PDF images are refused below Typst 0.14.
- **Templates and docs.** Four Typst starters (document, report, letter and CV) and a Markdown article join the gallery. README, CHANGELOG and THIRD_PARTY_NOTICES cover the engines, the licences and the limits.

### Phase 5 notes

- The plan names `scripts/build-windows.mjs`; that file does not exist. The build helper is `scripts/desktop.mjs` and the engines were added there.
- `engines.json` sits in `apps/backend/src/data`, where the repository's `data/` ignore rule hid it. `.gitignore` now unignores that folder.
- Fetching the sidecars during development first ran with a temporary `HOME` because the build sandbox cannot write `~/Library/Caches/spectrum-build`. A normal build uses the real cache. The workflow's downloads were not run here.
- Pandoc writes the generated file with `-o` rather than to standard output: `runSpawn` merges standard output and standard error, and pandoc warnings would join the document. A Markdown document's generated text is saved under the app's `cache/<project>/generated` folder and Typst compiles it from standard input, so this works with Typst 0.12 too.
- fletcher exports its shapes as `fletcher.shapes.rect` and so on; `shape: rect` is Typst's own drawing function and fails. Nodes therefore use `fletcher.shapes.*`, `node-stroke: 0.4pt` and positions in centimetres rather than `cell-size` and grid cells, so the picture matches the canvas. `[` is escaped as well as `]`, since an unescaped opening bracket starts another content block.
- `typst eval` exists only in Typst 0.15. Typst 0.14.2, 0.13.1 and 0.12.0 return "unrecognized subcommand 'eval'", so a project pinned to any of them has no insight numbers or pages. The built-in 0.15.1 does.
- A lone label in `typst eval` was passed as `("name")`, a grouping rather than an array, so a document with exactly one label returned nothing. The call now adds the trailing comma that keeps it an array, and a test covers one label.
- The `/stats` route originally returned Typst data without `ok`, which the Insights panel read as a failed word count. It now returns `ok: true`, and the panel shows the numbers and pages.
- The `/generated` route preferred `.tex` over `.typ` even when the last compile was Typst. It now returns the file written most recently, so Show generated Typst follows the last compile.
- Typst calls can be chained, as in `#datetime.today().display(...)`. `maskTypst` blanked only the first call; it now blanks the chained fields and methods too.
- Word export never overwrites an existing file, even one Spectrum made earlier: it uses a numbered name whenever the plain name is taken. The plan allowed overwriting a previous export; the safer rule is followed.
- The composer's fletcher version table was checked by compiling the same diagram with Typst 0.15.1, 0.14.2 and 0.13.1 through fletcher 0.5.8 and with Typst 0.12.0 through fletcher 0.5.5. Every pair compiled.
- The Windows changes were not built or run on Windows. The workflow copies `typst.exe` beside the runtime and runs `typst --version`, but the installed app and the vcruntime copy inside a release remain unverified. The engine install test for a Windows `typst.exe` beside its runtime was not added, because this environment is macOS.
- The local agent sandbox tests could not run here because `sandbox-exec` is unavailable; the code that adds the engines to the tools server and its environment was read through instead.
- Typst, Tectonic, fletcher and pandoc downloads need the internet. fletcher is fetched from Typst Universe the first time a Typst diagram compiles, so a copy of `figures/<name>.typ` is not self-contained until that cache exists.

### Phase 5 verification

- `cd apps/backend && node --test "test/*.test.js"`: 485 tests, 447 passed, 5 failed, 33 skipped in about 3 minutes. The five failures are the baseline environment failures: three tests whose temporary workspace or snapshot needs `sandbox-exec`, which this machine does not allow, and two `lualatex` SyncTeX tests. No Typst or Markdown test failed.
- `npm run typecheck` and `npm run build` passed.
- `cd src-tauri && cargo test`: 7 passed. The checkout has no `src-tauri/resources/engines` until a build makes it, so `mkdir -p src-tauri/resources/engines` came first.
- Every frontend check passed: `appearance.check`, `desktop.check`, `folders.check`, `parsers.check`, `settings.check`, `shortcuts.check`, `skills.check`, `diagram/fileFormat.check`, `diagram/modes/circuitikz/circuitikz.check`, `diagram/modes/fletcher/fletcher.check`, `diagram/modes/mermaid/pdf.check`, `diagram/modes/pgfplots/pgfplots.check`, `diagram/modes/tikz/tikz.check`, `diagram/modes/tikzcd/tikzcd.check`, `editor/floats.check`, `editor/insights.check`, `editor/outlines.check`, `editor/preflight.check` and the other `*.check.ts` files.
- Engine pairs: fletcher 0.5.8 compiled with Typst 0.15.1, 0.14.2 and 0.13.1; fletcher 0.5.5 compiled with Typst 0.12.0.
- Live browser pass on `http://127.0.0.1:5173` with a temporary backend on 8787, the built-in Typst, pandoc 3.12.1 and Typst 0.14.2 and 0.13.1 installed: a Typst document opened with highlighting, outline and PDF, compiled, showed a failed compile's error in Logs as `main.typ:32`, compiled with the pinned 0.14.2 and then the built-in version, and showed its headings, labels, pages and metadata in Document insights. Word export, Convert to LaTeX, `/generated` and compiling the new LaTeX project all worked. A Markdown article compiled to LaTeX and to Typst, its compile menu offered both PDF engines, and its Logs offered Show generated Typst. Settings › Engines installed Typst 0.13.1 from GitHub, and the Typst tab listed the built-in, installed and available versions. The composer's Typst mode created `figures/flow-1.typ`, drew a box, showed fletcher code and a PDF preview with the box, and inserted `#figure(include "figures/flow-1.typ")` into the Typst document through the Floats panel.
- The browser pass did not drag an arrow between two boxes; the fletcher edge code and its compilation were checked with the code generator and a standalone compile instead.
- The test DMG remains the phase 1 to 4 build. Phase 5 has no DMG.

### Phase 5 small review

Codex audited the whole of 2.0 at `19455ad` without changing code and left 21 findings in `handover.md` (untracked, at the repository root; its scratch worktrees are removed). Three fixer agents reproduced every one, fixed it at the root and added a test that failed before the fix:

- **Sync, privacy and Zotero (1 to 10):**
  - a public `spectrum-settings` repository is refused before anything is shared or pushed;
  - a secret staged with Git is put back out of the index before a backup commits;
  - a pull that would write through a folder linking outside the project is refused whole;
  - Zotero's authorise request sends `appName`, and every write carries `Zotero-Server-ID` (a changed database drops the key and asks again; the mock is now strict like the documented API);
  - Move to this computer waits for saves under way;
  - project settings changes and checkpoint restores take the project files' lock (always before the history lock);
  - Typst and Markdown PDFs stay out of backups;
  - `.typ` and `.markdown` count as text for checkpoints and merges.
- **Engines (11 to 15 and 21):**
  - an agent's or Review's Typst compile writes nothing into the draft;
  - Convert to LaTeX project points images at the copied `media/`;
  - the Windows build picks the `win-x64` archives (checked statically only);
  - the shared `writePdf` never writes through a link out of the project;
  - pandoc reads the bibliography its front matter names;
  - the app's default Typst version and Markdown PDF engine reach the compile.
  - `engines.test.js`'s failure on a fresh checkout was the test's: the built-in version is never offered for download.
- **Editor (16 to 20):**
  - a Typst or Markdown main file is kept as the tree changes;
  - Typst and Markdown to-dos reach the scanner, which no longer reads `%` as a comment in them;
  - Typst captions and cells escape both brackets, and a table outside a figure is `#table`;
  - figures and included diagrams use root-relative `/figures/…` paths so nested chapters find them;
  - Review's privacy scan and staleness read Typst and `.markdown` sources.
- **Also:** Review finds a Typst or Markdown document's PDF when it asks whether the PDF is older than the source.

Checks on the merged result (`fdad5b6`, scratch home and folders, TexLab and the real Typst and Tectonic):

| Check | Result |
| --- | --- |
| Backend suite | 469 passed, 0 failed, 32 skipped (501) |
| `npm run typecheck` and `npm run build` | Passed |
| Every `*.check.ts` | 36 passed |
| `npm run checkers:verify` | Exit 0 |
| Native Rust tests | 7 passed |

The live check ran the backend on scratch folders:
- all four Typst starters compiled with the built-in Typst 0.15.1;
- Typst 0.14.2 installed (checksum checked) and a project pinned to it compiled with it;
- the Markdown article compiled through XeLaTeX, then through Typst after pandoc 3.12.1 was downloaded into the scratch data folder (the computer's pandoc 3.8 is below Typst's minimum);
- a broken Typst line gave an error at its file, line and column;
- Export to Word wrote `main.docx`, and Convert to LaTeX project made a project that compiles;
- in the browser, a Typst document showed highlighting, folding and its outline, and compiled to its PDF.

Left for the full review:
- `typstElements` (insights' pages) reads only the project's pin, not the app default;
- when the app default is itself a Typst version not installed, "use the default version" clears the pin and fails again;
- Move to this computer still races a writer that looked the folder up before the move and takes the lock only afterwards (`ponytail:` in the code);
- Windows was not run.

### Phase 5 limits

- Typst insight numbers and pages need Typst 0.15. A project pinned to 0.14.2 or earlier shows the headings and labels from the source but no numbers or pages.
- Markdown has no numbers, pages or word counts, and its Review groups stop at Compile and layout, References and assets and Privacy and blind review. The generated LaTeX or Typst is not the document.
- Typst word counts are not calculated; the panel says that word counts are for LaTeX. Adding `texcount`'s equivalent for Typst is future work.
- The fletcher import needs Typst Universe once per version and machine; without the internet the first compile of a Typst diagram fails with Typst's package error.
- PDF images require Typst 0.14 or later. A TikZ diagram into an older pinned Typst is refused with the compile menu's version instruction.
- The Windows build, the vcruntime copy and the installed app are unverified in this environment.
- The composer's canvas does not yet let a mode hide the TikZ style menu; the Typst mode has no StyleMenu, so nothing is shown. The fletcher mode shares the TikZ model and inspector, and it receives positions, sizes, fills and strokes.
- The fletcher escape set is the plan's (`]`, `#`, `\\` and `$`) plus `[`. Other Typst markup in a label, such as `@`, `_` and `*`, is left as typed.

## Phase 4

### What was built

- **Zotero** (`services/zoteroService.js`, `routes/zotero.js`, `editor/ZoteroCite.tsx`, `editor/zotero.ts`):
  - Every call goes to Zotero's local API at `http://127.0.0.1:23119` (`SPECTRUM_ZOTERO_BASE` points tests at a mock). Zotero is found through `/connector/ping`, the local API through `/api/` and Better BibTeX through its JSON-RPC `api.ready`.
  - Allow Spectrum in Zotero… in Settings › Zotero sends `POST /api/local/authorize` with the `Zotero-Server-ID` header, brings Zotero forward and shows Answer in Zotero with Cancel. The key is kept in `DATA_DIR/zotero.json` (mode 0600) and never reaches the window. Zotero 7 to 9 only read.
  - Cite from Zotero (the editor's right-click menu in `.tex` files and the References card) opens Better BibTeX's picker, or Spectrum's own search of the library without it. Entries come from Better BibTeX's `item.export` or the local API's export, under Zotero's citation key, then Better BibTeX's, then Spectrum's AuthorYear key, and go into the `.bib` through the new `appendEntries` under the bib lock with the same duplicate check as `resolveItems`.
  - `\cite{` completion lists library items three letters into a key, below the project's own keys (setting `zoteroCompletion`, on by default), and Research has a Zotero source.
  - `syncCollection` keeps a Spectrum › <project> collection in step with the project's `.bib`: library items found by citation key, DOI, arXiv ID or title and year are added to it, entries Zotero lacks are created in it, and entries leave it only after a `.bib` save through the save route that read every `.bib` whole. It runs after an add, 5 seconds after a `.bib` save, on opening and on window focus. The binding `{ projectId, library: 'users/0', collectionKey }` is in `.spectrum/settings.json`, so a Finder copy gets its own collection and a collection this computer's Zotero has not received yet is waited for.
- **GitHub** (`services/gitService.js`, `services/githubService.js`, `routes/github.js`, `app/GitHubSettings.tsx`, `app/GitHubView.tsx`, `app/github.ts`, `editor/tools/GitHubTab.tsx`):
  - isomorphic-git 1.43.3 writes through `writeFileAtomic`. A repository is left alone while `.git/index.lock` exists and refused for Git LFS, submodules, a merge or rebase in progress, a detached HEAD or a `.git` file.
  - Sign-in is a pasted token checked with `GET /user`, or the device flow when `SPECTRUM_GITHUB_CLIENT_ID` is set. The token is in `DATA_DIR/github.json` (mode 0600) and never reaches the window. Commits are made as `<id>+<login>@users.noreply.github.com`.
  - `.git/info/exclude` is rewritten before each commit: everything in `.spectrum/` except `project.json`, `settings.json`, `chats/`, `todos/`, `notes/` and `research/`, the hidden names, sync apps' conflicted copies and one line per compiled document's PDF. Secret-looking files and files over 100 MB are left out with a notice.
  - Back up commits and pushes, making a private repository (`private: true`) the first time and recording `{ owner, repo, projectId }` in `.spectrum/settings.json`. A refused push pulls first. Pull is Spectrum's own: fetch outside the lock, then under `mutateProjectFiles` (which chats, to-dos, notes and research sessions now take too) commit, save a Before pull from GitHub checkpoint and merge each file with build/p4-cloud's `mergeRules.js`, writing each file only while it still holds what was committed, then make the two-parent commit and move `main`.
  - Linked projects pull on opening, back up a minute after the last change and on leaving, and only commit on quit (the push follows at the next start). Problems show as Not backed up since on the cards and in the tab.
  - Settings › GitHub, Tools › GitHub, the GitHub view in place of Cloud projects (Get from GitHub, Link…) and Sync with GitHub in each project's menu.
- **Settings repository** (`services/settingsRepoService.js`): a private `spectrum-settings` repository cloned into `DATA_DIR/settings-repo` and handed to `syncService.useSharedDir`, so the existing shared settings (`settings/<machine id>.json`) and templates (`templates/<id>/`) go through it unchanged. Personas are `personas/<id>.json` and own skills `skills/<id>/`, each taken whole from the newer side. It pulls at start-up, every 5 minutes and when the window asks, and pushes within 30 seconds of a change.
- **Cloud sync removed and the move to 2.0** (`services/mergeRules.js`, `services/mirrorService.js`, `services/syncService.js`, `routes/sync.js`, `ProjectPage.tsx`):
  - The mirror engine, cloud locations, Sync to, Download, Stop syncing, Sync now, the Cloud projects scan, presence and its banner and the `.spectrum-shared` machine lists are gone. The changed-on-disk prompt, held files, the conflicted-copy banner, merge3, chatMerge and the machine name stay. The machine name moved to `DATA_DIR/computer.json`, seeded once from `sync.json`.
  - The mirror's merge rules are in `mergeRules.js` for the GitHub pull. `readMirror`, `listMirrored`, `cloudRootOf`, `cloudCopyOwner` and the new `readMirrorBase` only read 1.10's records.
  - `migrateToV2` runs at start-up and writes `DATA_DIR/v2-migration.json`. The projects page's notice names the mirrored projects, lists the files a cloud copy has that this computer never received (Show in Finder in the app), and offers Move to this computer… for projects used in a sync app's folder (`POST /api/projects/:id/move-here`).

### Integration notes

The parts were joined where the contract drifted:

- The merges conflicted in `index.js` (the routes and timers of all three), `projectService.js` (`touchProject` now starts a linked project's backup where it ran a mirror pass), `syncService.js` (build/p4-cloud's `sharedDir` and `useSharedDir` kept), `ProjectPage.tsx`, `EditorPage.tsx`'s imports and the changelog. In `ProjectPage.tsx` the cloud badges, menus and sheets stayed removed, and the GitHub view row, Sync with GitHub, the Not backed up badge and Settings opening at a section came in beside the move notice.
- `githubService.js` used build/p4-github's own `placeOfNew`, which build/p4-cloud replaced with an ungated `placeOf`, and read 1.10's base files itself. It now calls `placeOf` and `readMirrorBase`. The client had two `moveProjectHere` functions, and build/p4-cloud's (with `left`) was kept.
- The settings repository is the transport for `settings.ts`'s `followSharedSettings`, through `useSharedDir`, so the shared settings, `takeInShared` and the templates logic are unchanged. The Use the same settings on each computer hint in Settings › Projects now says it needs the settings repository switched on in Settings › GitHub.
- Zotero follows reference adds (`resolveItems` and `appendEntries` call `syncSoon`) and `.bib` saves (the save route). The editor's first Zotero sync on opening now waits for the GitHub pull on opening, which may bring the collection the other computer made. Before, a computer opening a linked project could make a second collection before the pull brought the first one's binding.
- Two faults found in the live check were fixed: the GitHub view kept saying Sign in to GitHub after a sign-in in Settings until the window lost and regained focus (it now loads again when Settings closes, as do the badges), and Tools › GitHub kept showing commits to back up after the idle backup had pushed them (it now asks again every minute and on focus while it shows).
- build/p4-cloud's `mergeRules.js` reached build/p4-github before the merge, so it merged without a conflict.

### Registering the GitHub OAuth app

The one-click sign-in needs an OAuth app under your GitHub account. It has no client secret, so its client id can ship in Spectrum.

1. Signed in to GitHub as beyond3345, open Settings › Developer settings › OAuth Apps and choose New OAuth App (`https://github.com/settings/applications/new`).
2. Enter Spectrum as the name and `https://github.com/Beyond3345/Spectrum` as both the homepage URL and the authorisation callback URL. The device flow does not use the callback.
3. Choose Register application, then tick Enable Device Flow on the app's page and choose Update application.
4. Copy the Client ID. Do not generate a client secret, as Spectrum never uses one.
5. To try it, put `SPECTRUM_GITHUB_CLIENT_ID=<client id>` in the `.env` file (the repository's in development, or the one in the app's data folder for the desktop app) and restart Spectrum. Settings › GitHub then shows Sign in with GitHub…. For the release, make the client id the default of `GITHUB_CLIENT_ID` in `apps/backend/src/config/constants.js`, as the desktop app does not pass the environment to the backend.

### Phase 4 verification

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 390 passed, 31 skipped, 0 failed (421 total) |
| The new suites: `zotero.test.js` (15), `github-merge.test.js` (7), `github.test.js` (13), `settings-repo.test.js` (5), `github-rollback.test.js` (1), `merge-rules.test.js` and `migration.test.js` | Passed |
| The 1.10.4 round trips: `rollback.test.js` (1.10.4 from `42ff62f` mirrors again with both computers' edits after 2.0 stopped it) and `github-rollback.test.js` (1.10.4 opens and edits a project on GitHub, and 2.0 backs its edit up) | Passed |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 33 passed |
| Native Rust unit tests | 7 passed |

The tests ran in the integrator's worktree with a scratch home and temp folder. The GitHub tests run against git http-backend over scratch bare repositories and a stand-in REST server, and the Zotero tests against a mock Zotero on 127.0.0.1. No real GitHub, Zotero or user data was touched. The skips are the existing opt-in native agent and sandbox tests, the Windows-only tests, moving a project to the Bin and the live arXiv and DOI request.

The live check ran the integrated backend twice, as two computers on 127.0.0.1, each serving the built frontend with its own fake home, data and projects folders, against the tests' stand-in GitHub and a mock Zotero 10.0.6 with Better BibTeX on port 23998. Computer A's data folder was seeded as 1.10.4 leaves it: `sync.json`, a classic Synology Drive task in the fake home with a cloud location, a mirrored Thesis whose cloud copy had since gained an edit and a chapter, and a Grant used in place. It covered:

- **The move to 2.0:** the notice named Thesis and listed `chapters/intro.tex` and `refs.bib`, Move to this computer… copied Grant into the projects folder and dropped it from the notice, and the mirror record, `sync.json` and the cloud copies were left as they were.
- **GitHub:** a pasted token in Settings › GitHub (with `github.json` at 0600 and the settings repository made), Initialise only, then Back up to GitHub, which made a private repository with the sources, the `.gitignore` and the project's `project.json` and `settings.json` but not the compiled PDF. Computer B signed in, its GitHub view listed the repository as not on this computer and Get from GitHub cloned it with the project's id. An edit on B was backed up a few seconds after it was saved, and Pull on A merged it with A's own edit in another paragraph into a two-parent commit after a Before pull from GitHub checkpoint. Edits on both computers to the same line kept A's text with GitHub's beside it as `main (GitHub’s conflicted copy …).tex`, committed and shown with the editor's Compare, Delete copy and Use this copy banner. Sync with GitHub in Thesis's menu asked first and backed it up.
- **Zotero:** Settings › Zotero showed Zotero 10.0.6, the local API and Better BibTeX 7.0.30. Allow Spectrum in Zotero… showed Answer in Zotero with Cancel, and Zotero's answer made the collection Spectrum › Paper with the `.bib`'s one entry found by its DOI, its binding in `settings.json` beside the GitHub link. Cite from Zotero put the picker's `\parencite[p.~4]{…}` at the cursor, added both entries to the `.bib` without their `file` field and added both items to the collection. A `.bib` saved with two hand-typed entries added the library's item found by title and year and created the one Zotero lacked, and saving it without that entry took the item out of the collection and left it in the library. `\cite{Min` listed it again in completion's Zotero section, and picking it put its entry back and its item in the collection.
- **Settings:** the settings repository received both computers' settings files and the four starter personas, one file each.

### Phase 4 review fixes

The first review round had six lenses: GitHub, Zotero, going back to 1.10.4 with the move to 2.0, the checkers with the intermittent TexLab test, a live check with two computers and Windows. It confirmed 47 findings (8 high, 15 medium, 24 low), all fixed on `fix/p4-review` with a test for each change in behaviour, except as noted at the end.

**Codex's two branches**

- `fix/p4-texlab-flake` (`b86cc9b`) is merged. It seeds TexLab with the disk's spelling of a file TexLab found under another letter case, which was the flake. One correction: the bridge waits for that file's marks only when the other spelling had marks, as TexLab never publishes a clean file it had not published before, so a clean file made every first request wait 3 seconds.
- `fix/p4-zotero-review` (`542e6ed`) is not merged: five Zotero tests failed on it, and it changed request shapes nobody has checked on real Zotero. Taken from it by hand: the key file is written at 0600 through a temp file, and a refused write drops the key only while it is still the one refused. The key is kept with the `Zotero-Server-ID` it was given under, but a different id drops nothing until real Zotero shows whether the id names the database or the running process. Both key headers are still sent on writes and none on reads, and the authorise body is still `{ name: 'Spectrum' }`. Its global lock around Move to this computer is replaced by a guard in `getProjectRoot`: while a project is moved, anything asking for its folder gets a 409, and other projects do not wait.

**GitHub**

- A copy of a linked project (in the app, or in Finder with its `.git`) gets a repository of its own instead of pushing into the original's: the app's copy leaves `.git` behind, and Back up keeps an existing origin only when the project has no link.
- A pull writes every file the merged commit has, including those a shared repository holds back from GitHub, so the next backup no longer deletes the other computer's chats and to-dos (`mergeOrigin`'s `keep` option is gone).
- Link's preview, a Link that waits for the yes to its deletions and a failed Link leave the project unlinked with its origin as it was. The link is written once the merge has gone through, without its `here`.
- Back up on the other computer's copy of a project GitHub already has (1.10.4's, with no link) answers `GITHUB_LINK_FIRST` with the repository, and Tools › GitHub and Sync with GitHub link to it, after the preview, instead of making a second repository.
- A repository renamed on GitHub is linked under its new name from either name (both names answer with one repository id).
- A backup that GitHub's changes would make delete many files stops with `GITHUB_CONFIRM`, which shows on the card and in the tab, and opening the project asks the deletion question.
- A labelled backup is a commit of its own even with nothing new. What a backup leaves out (key-like files, files over 100 MB) is shown in the tab ("Not on GitHub: …") and on the card ("Files left out"). A Keynote `.key` deck goes up, and only a `.key` holding a PEM key stays out.
- The tab's status fetches before it counts commits to pull, and says Last change on GitHub; the GitHub view's rows say Up to date when last checked. A 5xx from GitHub's Git side or a timed-out request now waits for the connection and is retried.
- Link from a 1.10.4 mirror record merges against the record only where GitHub's copy still has what the record agreed on. GitHub's copy may come from a computer whose last sync was older, and against this computer's record its older files read as edits made there, which reverted and deleted this computer's newer work. The cost: an edit made only on GitHub since the mirror's last sync comes as a conflicted copy instead of being taken. `readMirrorBase` went with it.
- Entries both computers add to the end of a `.bib` are both kept (`mergeBibFiles` in `mergeRules.js`); one entry changed on both sides still gets its conflicted copy.

**Windows and macOS disks**

- A file with CRLF line ends from a Git for Windows checkout counts as unchanged when a pull writes over it, and on Windows a repository whose own config has no `core.autocrlf` gets `true`, as Git for Windows' system config (which isomorphic-git never reads) has it.
- Two committed names for one file (`Plot.pdf` and `plot.pdf`), and on Windows a name Windows cannot have (`Why?.tex`), are kept in the commit only: never written to the disk, never deleted from GitHub by the pull or the backups after it, and named as problems for a rename.
- A link comes through a pull as a link (its target in a plain file where Windows cannot make one), and a clone on Windows without Developer Mode no longer fails on one.
- A Mac's decomposed (NFD) file names are committed composed (NFC), as git's `core.precomposeunicode` does, and a pull renames an old decomposed name.
- A script committed as executable stays so when Windows commits it, and a clone's executables get 0755 instead of 0777.
- The default projects folder moves to the home folder's `Spectrum` at start-up when Documents is in OneDrive or iCloud Drive, where GitHub refuses projects.
- Get from GitHub names a file this computer could not write.

**Zotero**

- An entry Zotero lacks becomes an item only when every `.bib` reads whole, the entry has a title and it reads the same at two syncs in a row (a sync a minute later looks again). Autosave's half-typed entries used to stay in the library for good. Entries Spectrum itself adds (a DOI, Research or Cite from Zotero) are made at once.
- The bundled templates' sample references, and a template's working copy, never become items.
- A shared citation key counts only where DOIs and arXiv ids agree, and entries are matched to items by DOI, arXiv id and title and year before key, so an entry Spectrum renamed `taken2020a` is the library's `taken2020` and the entry still under that key gets its own item.
- `settings.json` is read strictly, so one that cannot be read stops the sync with an error instead of making a collection each time.
- No collection is made while a GitHub pull, Sync or Link of the project is under way, and the editor's syncs on focus start only after the pull on opening.
- What Spectrum makes is kept by citation key in the binding (`created`), so the other computer waits for Zotero's sync to bring those items instead of making them again.

**Going back to 1.10.4 and the move to 2.0**

- A cloud copy is claimed by its 1.10 record only while its project is listed with a folder of its own elsewhere, as 1.10.4 forgets such records, so after Remove, the Bin or a lost folder the copy opens again, and a project can be pointed at its own cloud copy. The notice leaves out projects no longer listed.
- Opening a file in a cloud copy opens the project's file only when the two hold the same bytes; otherwise it says 2.0 no longer keeps the copies in step and to copy the file over.
- Get from GitHub refuses a project 1.10 mirrored on this computer, since 1.10.4 would mirror the clone against the old record and take its missing checkpoints and PDFs for deletions in the cloud copy.
- The notice names a project used in place in a NAS share after the share, and Move to this computer takes such a project.
- A cloud copy that was missing or could not be looked through at the first start is looked at again at each start until a look succeeds or the notice is dismissed, each copy with its own time limit.
- Move to Bin warns again that a project in a sync app's folder goes from the other computers too.

**Settings and the checkers**

- Signing in, the device sign-in finishing, switching the settings repository on and Sync settings now share this computer's settings and personas at once (`followSettingsNow`), so a second computer signing in first no longer wins over them. Sync settings now pulls whatever the time since the last, and says Up to date only once this computer's settings are in the repository.
- The settings repository keeps a template's PDF beside its `.tex` (`commitAll`'s `compiled: false`), and a skill goes across without its key-like files.
- `npm run checkers:verify` holds the process open until both engines answer, so it prints their status and fails on a file that differs; it used to exit 0 having checked nothing.
- A `.gitattributes` keeps `native/`, `dictionaries/` and `templates/` out of `core.autocrlf`, so a Git for Windows checkout builds nodehun and its manifests match.
- Settings › Language no longer starts Harper to show its version (about 220 MB for the rest of the session); it says Starts with the first check. The binding's and dictionaries' versions show only when their files match, and the supplement's version is its checksum's first 12 characters.
- The Harper build leaves wasm-pack's extras out of `native/harper`, the README describes the lock file and how to move to a newer Harper or Hunspell, and the build's checksum errors print the value they found.

**Not changed in code, and not tested**

- The reviewer's live check put one scratch file in the real macOS Bin (listed under Things only the user can do), because one backend was started without `SPECTRUM_TEST_BIN_DIR`. Every live check must set it for every backend.
- The four untracked files in the main checkout's `native/harper` are outside the fixer's worktree, so they are left for the user.
- Optional parts not built: refusing in `mergeOrigin` a `project.json` whose id differs from this computer's (the copy fixes make it unneeded), refusing the Bin while 1.10.4 on another computer has the project open and running `checkers:verify` in `windows.yml`.
- Without a test: the Move to Bin warning (a dialog's text), each cloud copy's own time limit, the Settings › Language wording and Get from GitHub naming a file Windows could not write (a clone cannot fail that way on a Mac). The Windows-only paths were tested on the Mac with `process.platform` set to `win32` around the call.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 423 passed, 31 skipped, 0 failed (454). An earlier run cancelled the Tectonic SyncTeX test at its 180 s limit while Tectonic downloaded its bundle into the scratch home; with the bundle there it passed |
| `test/texlab.test.js` run 10 times | 10 of 10 passed (8 tests each, none skipped) |
| Frontend `npm run typecheck` and `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 33 passed |
| Native Rust unit tests (`cargo test` with `TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":null}}'`) | 7 passed |
| `npm run checkers:verify` | Hunspell 1.3.3 and Harper 2.12.0, every file verified, exit 0 |
| The 1.10.4 round trips, `rollback.test.js` and `github-rollback.test.js` | Passed |

The tests ran in the fixer's worktree with a scratch home, data, projects, template and temp folder, the stand-in GitHub and the mock Zotero. No real GitHub, Zotero or user data was touched.

### Phase 4 limits and open items

- Real Zotero 10 and Better BibTeX were never contacted. Before relying on collections, check against Zotero 10.0.6 on a test library: the key headers (`Zotero-API-Key` and `Authorization: Bearer` are both sent on writes, none on reads), the authorise request (`{ name: 'Spectrum' }`) and its reply, the PATCH and POST shapes, when `Zotero-Server-ID` comes and whether it changes when Zotero restarts (Codex's branch would drop the key on any change). Better BibTeX's export was reported broken on 10.0.3, and a failed export falls back to Zotero's own.
- Real GitHub was never contacted either. The device flow waits for the OAuth app above.
- Windows is untested: bringing Zotero forward with PowerShell's AppActivate, isomorphic-git's paths, the settings repository and Get from GitHub of a 1 GB repository.
- If the user deletes a project's collection in Zotero, the project waits for it for good. Removing `zotero` from `.spectrum/settings.json` starts a new one, and there is no button for that. A collection made on a computer that could not pull (offline) before Zotero sync ran can still be one of two. An item Spectrum made whose record (`created`) changed on both computers keeps this computer's list, so one of the other's may be made twice (`ponytail:`), and an item deleted in Zotero that Spectrum recorded is never made again.
- A collection's first sync runs up to four library searches for each entry it lacks (`ponytail:`). New items come from a small BibTeX field map, and the picker and imports use My Library only.
- Not built: Link's offer to stop tracking compiled PDFs already in a repository, and SSH remotes (a project whose origin is an SSH address is refused). The GitHub view's ahead and behind come from the last fetch (the tab fetches first), it reads the 100 most recently pushed repositories, and a repository whose collaborators cannot be listed counts as shared.
- A file held back from a shared repository whose copy here differs from the last commit, and which GitHub then changes, stops the pull with "A file changed while it was being pulled" until it is committed: this happens only when a repository becomes shared after its personal files were backed up.
- A persona or skill changed on both computers goes to whichever synced last. The list and grid switch still shows in the GitHub view, where it does nothing.
- Locate… on a mirrored project in 2.0 never deletes its mirror record, as nothing may write `DATA_DIR/mirror`, so going back to 1.10.4 after Locate… picked another copy mirrors that copy against the old base, behind 1.10.4's deletion brake (`ponytail:` in the code). Get from GitHub reaches the same hazard another way, so it refuses a project with a mirror record. The user may decide to allow this one narrow write: moving the record aside when Locate… or Get from GitHub gives the id another folder, as 1.10.4 itself forgets a record when its project leaves the list.
- The projects page has no per-project Move to this computer. Projects used in place get it from the notice, and Tools › GitHub offers it when Initialise or Link is refused in a sync app's folder.
- The confirm dialogs fade in, so a screenshot taken straight after opening one can catch it nearly transparent. They worked in the live check.
- Show in Finder in the notice is desktop only, so the browser check could not use it.

## Phase 3

### What was built

- **TexLab** (`services/texlabService.js`, `routes/texlab.js`, `apps/frontend/src/editor/lsp/`):
  - `scripts/desktop.mjs` downloads TexLab 5.26.0 for both Mac slices against pinned SHA-256s and joins them with lipo into `binaries/texlab-universal-apple-darwin`. On Windows it builds `texlab.exe` from the checked v5.26.0 tag tarball with the C runtime linked in, as crates.io has TexLab only up to 4.3.2, and `windows.yml` runs that as a cached step and uploads the tarball with a release.
  - `main.rs` passes `SPECTRUM_TEXLAB`, and the backend also looks on the `PATH`. Without TexLab everything works as before.
  - The backend starts `texlab run` per open project and relays it to the editor (an event stream down, POST up), keeps the latest diagnostics for `GET /api/projects/:id/diagnostics` and stops TexLab ten minutes after its last client. TexLab 5.26 never hands back a file the editor closed, so the bridge sends it the disk's text when the last editor closes a file and whenever the file changes on disk.
  - The editor (`@codemirror/lsp-client`) has squiggles, plain-text hovers, Go to definition (`F12` or `⌘`-click), Find references (`⇧F12`, in a panel under the editor) and F2's rename, which lists the files and edit counts, saves a Before rename checkpoint and writes every file through the save route with base hashes, putting back those already written if one fails.
  - The sidebar's Outline comes from TexLab's workspace symbols across `\input` files, with section numbers and floats by caption, and falls back to the parser.
  - The compile menu's Syntax checks (project `compile.syntaxCheck`, on by default in Settings › Engines › LaTeX) asks "Compile anyway?" before compiling a document with missing braces or mismatched environments. Auto compile skips it.
- **Review** (`editor/preflight/`, `editor/tools/ReviewTab.tsx`, `services/reviewService.js`, `routes/review.js`): one Review with tick boxes for the five Preflight groups and the AI review, as plan section 4 describes. `GET /api/projects/:id/review/state` says whether the PDF is older than the files the document reads and returns the `.bib` entries with their duplicates. `POST /api/review` makes one tool-free model call over the document in `\input` order and anchors each point to its quote. The Logs tab's Fix with AI is shared as `fixWithAI` in `editor/shared.tsx`.
- **Research** (`services/researchService.js`, `routes/research.js`, `editor/research/`): the sidebar is Files | Research | To-dos, and the bottom card's History lists the Ask, References and pre-2.0 Edit chats. A search runs every chosen source at once into a session in `.spectrum/research/<id>.json`, merges by DOI, arXiv ID and title and marks what the `.bib` has. Each result has Keep, Drop, Cite, Open note and Get PDF, and Add kept papers to .bib and Find citations for selection add through `resolveItems`. Deep research, Draft related work and Verify claims open the agent workspace. Settings › Search gains the research keys and emails, and the arXiv model search and summaries in the `.tex` are gone.

### Integration notes

The parts were joined where the contract drifted:

- TexLab's diagnostics have one client call, `getDiagnostics` with `TexlabDiagnostic` in `api/client.ts`; Review's copy was dropped. Review and Document insights read them through `EditorApi.diagnostics()`, which first sends TexLab the open file's latest edits. Reading the route directly could return the diagnostics from before the last edit, and nothing asked again, so a fixed problem stayed marked.
- Document insights marks the labels TexLab finds unused or defined twice and the citations missing from the `.bib`, and its Overview counts them with the references to no label (`texlabNotes` in `insights.ts`, checked in `insights.check.ts`). TexLab marks each definition of a label defined twice, so those are counted by name.
- Research's Deep research, Draft related work and Verify claims already reached phase 2's workspace with their prompt, skill, persona and the session as context. The live check confirmed it and nothing needed changing.
- The merges conflicted only in `index.js` (both new route files registered), `ToolsPanel.tsx` (Research leaves Tools, and Review takes `doc` and `active`), `EditorPage.tsx`'s imports and the changelog.
- The README (a TexLab section, Syntax checks in the compile menu, the fixed shortcuts and the build), the changelog and the third-party notices (the language server client's packages) were brought up to date.

Two faults found in the live check were fixed:

- The outline's numbers did not follow a compile. A compile renames its `.aux` files into the kept folder, which TexLab's own watcher takes for their removal, so TexLab kept the old numbers until the next edit. The compile route now calls `auxKept`, which tells TexLab to read the main document's kept `.aux` files again two seconds later (after its watcher's one-second debounce), and the outline asks again 2.6 seconds after a compile. The real-TexLab test in `test/texlab.test.js` covers it and fails without it.
- A TexLab hover open when the editor left a file came back with that file and threw a RangeError measuring itself in the next one. It is now closed with the jump highlight before the switch.

### Phase 3 verification

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 410 passed, 26 skipped, 0 failed (436 total) |
| `test/texlab.test.js`, including the real TexLab | 4 passed |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 31 passed |
| Native Rust unit tests | 7 passed |

The tests ran in the integrator's worktree with a scratch home and temp folder and no model calls. The 26 skips are phase 2's (opt-in native agent and sandbox checks, Windows-only checks, moving a project to the Bin and a live arXiv and DOI request). The real-TexLab test runs only when `texlab` is on the `PATH`, as it was here from a scratch folder.

The live check ran the integrated backend and Vite on scratch data, projects and template folders with a fake home folder, TexLab 5.26.0 from a scratch folder on the backend's `PATH` and a scripted model on 127.0.0.1, so no paid model was called. On a two-file paper it covered:

- **TexLab:** squiggles for an undefined `\ref`, an unused label and an unclosed brace, the hover on a `\cite`, `⌘`-click from a `\ref` to its label in the other file, `⇧F12`'s references panel, F2 renaming a label across both files with its Before rename checkpoint, the syntax check's dialog (Cancel went to the error, and the compile ran once it was fixed) and the project-wide outline with numbers and the figure, which followed a compile after the fix above.
- **Document insights:** the unused and duplicate label marks and the Overview's TexLab line, cleared once the duplicate was deleted.
- **Review:** every group found its planted problems, with Anonymous review on. The AI review's request had no tools and listed the findings as already reported, and its points were anchored (two moved to the lines of their quotes and one shown as "Location not found"). Line rows, a page row (which closed the panel), Show in PDF, Copy report (with a stubbed clipboard) and the screen reader view worked.
- **Research:** a keyless search of OpenAlex, arXiv, Crossref and the `.bib` with the AI sort, Keep with a reason, Drop, Add kept papers to .bib (it added the kept paper the `.bib` lacked and left out the one it had, which the add route reports as a duplicate when asked for it), Cite, the session after a reload and Verify claims opening the workspace with its skill, the Critical reviewer persona and the session, which reached the model.
- **Bottom card and settings:** History listed the new Ask chat and not the agent thread, and Settings › Search showed the research keys and emails.

### Phase 3 review fixes

The first review round's 45 confirmed findings are fixed on **`fix/p3-review`**, branched from `b971b71`, in commits by area, each behaviour fix with a test or check:

- **F2 rename** (`editor/lsp/rename.ts`, `EditorPage.tsx`): every TexLab edit must replace the old name, and one that doesn't, or that falls past the end of its line, stops the rename before the confirm dialog with "TexLab's copy of this file is out of date". It had been clamped and written, so a TexLab copy behind the disk (a reread still to come, another window's edits, a moved folder, a file under another spelling of its name) corrupted the file silently. `newName` drops a command's typed backslash and refuses a space, comma, brace, `%`, `#`, `~` or backslash (a command's name takes letters only), a label or key the project already has is refused, the same edit twice for one file is made once, and `⇧F12`'s list closes after a rename.
- **TexLab bridge** (`services/texlabService.js`, `routes/projects.js`, `routes/cloud.js`):
  - TexLab runs in the temporary folder, not the project's, and Move to the Bin, Remove, Relocate and both cloud moves end the project's TexLab with `stopProjectTexlab` and wait for it, as on Windows it held the folder for the ten minutes it idles.
  - A TexLab whose project's folder has moved since it started is ended at the next ask and started on the new folder.
  - A project whose path holds `[`, `]` or `^` goes without TexLab, which panics on such a file URI (`ponytail:` to drop when TexLab handles them).
  - TexLab gets fancyvrb's, comment's, filecontents' and tcblisting's environments as verbatim ones (`experimental.verbatimEnvironments`).
  - Diagnostics are kept by URI and given under the disk's spelling of the path on a Mac or Windows disk (`realpathSync.native`), one of each, so an `\input{Chapters/Intro}` of `chapters/intro.tex` no longer shows under a third path.
- **Editor** (`editor/lsp/`, `EditorPage.tsx`, `shortcuts.ts`):
  - The syntax check (`editor/lsp/syntax.ts`) leaves out the two misreadings of TexLab 5.26's own that stay: a missing brace in a file with `\verb+…+`, `\verb*`, `\lstinline` or `\mintinline` (marked at the file's end), and a lone `}` in verbatim, lstlisting or minted.
  - `pathOf` maps a TexLab path in another letter case to the project's file on a Mac or Windows, so jumps and edits reach that file and its open text.
  - A click with `⌥` (Alt) held adds a cursor, as in VS Code, since a click with `⌘` held is Go to definition in TeX files (README and changelog say so).
  - TexLab's squiggles are cleared when it stops (`clearMarks`), as they live in `@codemirror/lint`'s state outside the slot.
  - The outline waits until 2.6 s after a compile even when the new PDF reloads the tree, reads the files no editor has open once until the tree or a file changes, and waits 1.5 s after typing.
- **Preflight** (`editor/preflight/`):
  - pdf.js 6's MarkInfo is a Map, which read every PDF as untagged; `pdfFacts.check.ts` now runs `pdfFacts` in Node on a tagged PDF it makes. ReviewTab sets pdf.js's worker for it.
  - Text at TeX's 6pt (5.978 PDF points) isn't small.
  - Verbatim, listings and `\verb` are blanked before the source is read, and a label, key or image with a `#` (a definition's argument) is skipped. A `label=` in a listing's or box's options counts.
  - After a compile that made its PDF, an image is missing only when the log says so or never shows it used, and citations only when the log has them undefined or BibTeX couldn't open its database, so the TeX tree's images and a central `.bib` aren't errors.
  - The ?? warning links to the PDF page whose text shows ?? (the log's page is the printed number), and a citation undefined on a roman-numbered page is read.
  - CVPR's, ICCV's, ECCV's and ACL's `review` option hides the authors, and an Author field of "Anonymous …" names no one.
  - "No abstract" needs a `\maketitle` or title page, counts a `\chapter*{Abstract}` and is a note.
  - A PDF pdf.js couldn't open for its password gets only the encryption error, and Accessibility says it couldn't be read.
  - The same finding twice on a line is kept once, in `runPreflight` rather than in ReviewTab, so React's keys and Dismiss see one.
- **Review** (`services/reviewService.js`, `utils/texUtils.js`, `ReviewTab.tsx`):
  - The AI review's answer is read from its first `{`, past a `<think>`, and failing that with undoubled LaTeX backslashes doubled and trailing commas gone (`replyJSON`). A quote whose `\ref` became a carriage return is anchored again, the prompt asks for doubled backslashes, "Major" and "Minor" count as such and the same point twice is kept once.
  - `inlineInputs` follows `\import`, `\subimport` (from the importing file's folder) and `\input {x}`, so the AI review, Review's compile-first test and the word counts read those files. The editor's `INPUT_RE` knows `\subimport` too.
  - On Windows, when another program holds the PDF, Review reads the compile's kept PDF (`EditorApi.keptPdf`) and counts it from when that compile started, rather than compiling every run and checking the older copy on disk.
  - A failed Fix with AI shows its error once.
  - In a narrow panel a row's buttons go under its message, and a wrapped `file:line` link stays left-aligned.
- **Research** (`services/researchService.js`, `services/referenceService.js`, `services/mirrorService.js`, `ResearchPanel.tsx`):
  - The session keeps each result's note and PDF once made (`note`, `pdf`, kept by `combine`), and a new one takes the first free name with `-2`, `-3` and so on, so two papers with the same AuthorYear and title word get a file each and the name stays when the paper reaches the `.bib`. A device name such as CON gets an underscore.
  - A PDF download has three minutes for its whole body (`SPECTRUM_PDF_TIMEOUT_MS` shortens it in the test), and one that fails says why rather than "not a PDF".
  - A preprint is In .bib under its published version's key when the `.bib` has that without a DOI or eprint (same title and first author within three years, unless two DOIs disagree).
  - A record linking two rows (an arXiv id and a DOI) makes them one.
  - With no file chosen, references go to a `.bib` the document loads first (`pickBibTarget`), for Research and References alike.
  - A session changed on both computers is merged as a search merges results (`bothSessions` in the mirror), instead of keeping this computer's.
  - Cite inserts only where the user put the cursor, in the body, and reads the session again for the key the `.bib` has now.
  - The log says "2 searches", and Verify claims asks for the claims of the files a main document brings in.
- **Elsewhere:** the model web search's error says to turn on OpenAlex or another connection in Settings › Search, and `windows.yml` saves the texlab.exe cache right after the build, as `actions/cache` saved only when the whole job passed.

Done differently from the finding's suggestion, or left out:

- Duplicate review rows are dropped where they're made (`runPreflight`, `readReview`), not filtered in ReviewTab.
- The case mapping in the bridge asks the disk (`realpathSync.native`) rather than a project file list, which it doesn't keep.
- TexLab's exit code 101 isn't treated as a crash whatever the uptime, as the path guard covers the case found.
- No automated test covers the UI wiring with no logic of its own to check: ReviewTab's kept PDF, Cite's placed cursor and fresh key, the two Research strings, Fix with AI's return and the CSS. The typecheck and the build cover them.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 417 passed, 26 skipped, 0 failed (443 total) |
| `test/texlab.test.js`, including both real-TexLab tests | 6 passed |
| The new TexLab, pdfFacts, Preflight and mirror tests, run without their fix | Each fails on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 32 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data and projects folders, a scratch home and temp folder and TexLab 5.26.0 from a scratch folder on the `PATH`, with no model or network calls (fetch is mocked in the Research tests). The 26 skips are phase 2's.

### Phase 3 second review fixes

The second round's 13 confirmed findings are fixed on **`fix/p3-review2`**, branched from `a5a4a08`, one commit each with a test or check:

- **TexLab** (`editor/lsp/`, `EditorPage.tsx`, `services/texlabService.js`):
  - TexLab reads a file an `\input` names in another letter case (`\input{Chapters/Intro}` of `chapters/intro.tex`) once, as a file of its own, and never again. Round 1 mapped that copy to the file, so its old marks replaced the open file's squiggles, the syntax check blocked on a brace fixed since, and F2 wrote edits planned from it (they pass the check while the lines haven't moved), leaving a use on the old name. `Texlab.spelling` gives a URI's own path. The open file takes squiggles from its own spelling only, the diagnostics route keeps only the disk's spelling's marks (TexLab reads that copy too, so the file's own errors stay), and F2 refuses with "The document brings in chapters/intro.tex as Chapters/Intro.tex. Make the \input match the file's name, then rename." Jumps and Review still map the other spelling to the file.
  - The syntax check passes a brace in `\verb+…+`, `\Verb`, `\lstinline` and `\mintinline` with any delimiter or braces, and a lone `}` in `tcblisting`, `filecontents(*)`, `BVerbatim`, `LVerbatim`, `SaveVerbatim`, `VerbatimOut` and the environments the project defines with `\lstnewenvironment`, `\newminted`, `\newtcblisting`, `\DeclareTCBListing` or `\DefineVerbatimEnvironment`. A missing brace is passed only when some inline code opens more braces than it closes, not whenever the file has inline code, so a real unclosed brace beside a `\verb+natbib+` (the arXiv template) blocks again.
  - A project whose path holds `|` goes without TexLab too, which panics on it as on `[`, `]` and `^`.
  - F2 on a citation key refuses before asking when a `.bib` names the key in a `crossref`, `xref`, `xdata` or `related` field (`crossReferred` in `rename.ts`), as TexLab renames only the entry and its citations.
- **Preflight** (`editor/preflight/run.ts`):
  - After a clean compile a reference or citation is missing only when the log says so, for the scan's "Nothing has the label" and TexLab's undefined label and citation alike, and TexLab's is dropped for a label or key the scan has. The coding report's listings, the ELEC notes' `\newtcbtheorem` labels and a central `.bib`'s keys no longer get false warnings.
  - The compile hands Preflight the engine's terminal output, which has no "File: … Graphic file" line, so an image is also found by the `<…/name.pdf>` pdfTeX and LuaTeX print as they ship its page, and XeTeX's "Unable to load picture" counts as not found. The check reads a real pdfTeX 2026 terminal sample now. The ACL template's three image errors are gone.
- **AI review** (`services/reviewService.js`):
  - Only the document's `.tex` files are sent, and the limits name an `\input` `.pgf` or data file left out, which had put the document over the budget so only `main.tex` was reviewed. The PDF's freshness check still counts them.
  - The JSON is read from the first `{` followed by a quoted name, so braces in prose before it (`\section{Intro}`) no longer lose the review.
  - A single backslash before `b`, `f`, `r` or `t` and a letter is doubled before the first parse, so `\textbf`, `\ref`, `\begin` and `\frac` show as LaTeX rather than a tab, CR, backspace or form feed and the rest. `\n` stays a line break.
- **Research** (`services/researchService.js`, `services/referenceService.js`, `editor/research/`):
  - Open note and Get PDF take the `research/notes/<key>.md` or `research/papers/<key>.pdf` already there for a paper in the `.bib` (Deep research writes its notes there), unless another result in the session has it, instead of making `<key>-2`.
  - The In .bib fallback ignores arXiv's, bioRxiv's and medRxiv's DOIs and a preprint's own, as merging does, so a preprint row with an arXiv DOI and a published row whose bioRxiv preprint the `.bib` has are marked. Two publishers' DOIs still keep a row apart.
  - Deep research gives the agent the question in the box and searches again only for a question the session hasn't searched (`searched` in `results.ts`).
  - With no `.bib` chosen, the target and the "isn't included" warning come from the main document and what it brings in when the project names one, so a talk's slides loading another `.bib` don't decide it. Every `.tex` counts otherwise, as before.

Changed from the findings' suggestions, or left out:

- The finding's full fix for another spelling, the bridge opening that URI with the real file's text after each change, is left for later; F2 refuses instead, as suggested.
- The syntax check's inline code is found in the text as it is, comments included: blanking them would cut `\verb|%d|` short, and `withoutComments` shortens the text, which moves TexLab's columns. Such code in a comment can spare a file's missing brace. Code environments' bodies aren't counted for missing braces, as TexLab 5.26 marks none there (checked with the real TexLab).
- The crossref check's pattern is `[{"](?:[^}"]*[\s,])?key`, as the suggested one needed a character before the key and missed `crossref = {knuth84}`.
- The figure-code limit says "weren't sent" for more than one file.
- `referenceService.js` now imports `projectService.js`, which reaches it again through the mirror and Research. Each of the modules on that loop was imported first in a fresh Node and loaded.
- No automated test drives EditorPage's two F2 refusals or ResearchPanel's Deep research click. The logic under them (`spelling`, `ProjectWorkspace.getFile`, `crossReferred`, `searched`) is in `lsp.check.ts` and `research.check.ts`.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 422 passed, 31 skipped, 0 failed (453 total) |
| `test/texlab.test.js`, including both real-TexLab tests | 6 passed |
| Each new or extended backend test, and the Preflight and syntax checks, run without their fix | Each fails on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 32 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data and projects folders, a scratch home and temp folder and TexLab 5.26.0 from a scratch folder on the `PATH`, with no model or network calls. The 31 skips are phase 2's opt-in native agent and sandbox checks, the Windows-only ones, moving a project to the Bin and the live requests. The syntax check's cases and the image sample came from the real TexLab and pdfTeX 2026 in scratch folders.

### Phase 3 limits and open items

- Windows is untested: the TexLab build from the tag tarball (cargo, the cache in `~\AppData\Local\spectrum-build` and Windows `tar`), matching URIs whatever their letter case, ending TexLab with `taskkill` before a folder is binned or moved, and Review reading the kept PDF when another program holds the one on disk (`pdfStale`).
- The tarball's pinned SHA-256 is of GitHub's generated archive. If GitHub regenerates it, the Windows build and the release upload stop until the digest is updated.
- TexLab 5.26 limits worked around: it cannot forget a file an editor has had open, so a deleted one stays with empty text, and files changed on disk are read again two seconds after the last change, so their diagnostics can lag that long. Go to definition on a section's label lands on the `\section`.
- Outline numbers come from the main document's kept `.aux` only, so another document's outline has none.
- A folder with `[`, `]`, `^` or `|` in its name added inside a project during a session still makes TexLab panic once, and the editor then goes without it until the project is opened again.
- An `\input` spelt in another letter case than its file's name: TexLab's copy under that spelling stays as it first read it, so F2 refuses to rename in it and its marks are left out. Preflight finds an image in the TeX tree from pdfTeX's and LuaTeX's terminal output only, so with XeLaTeX one there is still reported missing.
- A research session merged across computers brings back a choice one side cleared, from the other side.
- The syntax check waits for TexLab to catch up with the latest edit, up to five seconds. When Review's compile meets it and the user chooses Cancel, the review stops with "The compile was stopped." Cancel in Review does not stop a compile it started.
- An overfull box in a paragraph that runs across an `\input` is put at the paragraph's first line in the file TeX reports from, which can be a line of the other file. This is Spectrum's existing `parseCompileLog`, so the Logs tab does the same.
- Without TexLab the console shows one 503 from the lsp stream. When TexLab's line drops while the editor is sending, the console shows an unhandled “TexLab isn’t connected.”
- Semantic Scholar often answers 429 without a key, which shows as a failed source. Sessions saved before the preprint merge fixes keep their separate preprint and published copies.
- Not built: Research's Zotero source (phase 4), splitting a question into several queries with a model and a research MCP tool. Find citations for selection and local agents receiving a research task were not run live.
- The builders' work-in-progress commits `1c11997`, `f26e0b2` and `46edd4a` keep their placeholder messages, as they are in the merged branches' history.

## Phase 2

### What was built

- **Agent workspace** (`apps/frontend/src/editor/agent/`): the Agent button opens it in the PDF's place. Its header has the Spectrum agent and Local agents tabs, the session history, the Isolated or Direct badge, the agent's options, the persona picker and Stop. Below come a welcome screen with five task buttons, the transcript with tool cards, the plan strip, the changes tray with its review and preview PDF and the composer with context chips, the `/` menu and the skill chip. `AgentPanel.tsx` and the bottom card's Edit mode and Agents tab are gone; an Edit chat from before 2.0 continues in the workspace.
- **Personas** (`editor/personas.ts`, Settings › Personas): four starters and default instructions, merged by id when a computer joins the shared settings. They go to the assistant, the Spectrum agent and local agents, never to autocomplete.
- **Skills** (`services/skillService.js`, `routes/skills.js`, Settings › Skills): 12 K-Dense skills synced by `scripts/sync-skills.mjs` at commit `593377b` into `skills/`, three of Spectrum's own, the user's own skills, switches for this computer and for a project (`skills: { on, off }` in `.spectrum/settings.json`) and sharing into `~/.agents/skills` and `~/.claude/skills` (off by default).
- **Local agent backend** (`agentSessionService.js`, `agentWorkspace.js`): review sessions keep working on their draft. Apply makes the applied bytes the new baseline, Reject resets the draft's copy and tells the agent, streamed pieces are stored joined and context goes as ACP resources. Personas go in the agent's system prompt or the first prompt of a new session, skills are copied into the agent's private home and `GET /api/agent-sessions/:id/preview` compiles the draft.
- **Spectrum tools server** (`apps/backend/src/mcp/`): an MCP server local agents start inside their isolation on macOS, bundled as `mcp.mjs` by `scripts/desktop.mjs`. Its `suggest_todo` results reach the workspace as `todo` events when the turn ends.
- **Spectrum agent** (`agentService.js`, `researchTools.js`): instructions, a skill in whole, a skills list, `load_skill`, `read_skill_file`, `list_todos`, `suggest_todo`, `literature_search` and `fetch_bibtex`, 25 steps and the thread's history in tools mode.

### Integration notes

The parts were joined where the contract drifted:

- The workspace sends a local agent's context in the routes' shape: the selection as text, `todos: true` (the backend reads the open to-dos itself) and `skill`, which the backend now sends as an embedded `SKILL.md` resource. Choosing no persona sends `null`, which clears the session's persona.
- Suggested to-dos come from the backend's `todo` events rather than from matching tool titles. A stored event's `first` replaces the pieces the client already holds, a rejection shows as a note and each turn's tool calls get cards of their own.
- The skills listed in the workspace are those `active` in the project. Settings uses the backend's `getSkillSharing`, `setSkillSharing` and `listSkillFiles` shapes.
- Persona dots take the tag colours, Manuscript review picks the `critical-reviewer` starter by id, and Settings opens at Personas or at Agents (with the agent last picked in the workspace). The picker refreshes when Settings › Agents saves.

### Phase 2 verification

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 387 passed, 13 skipped, 0 failed (400 total) |
| Native agent tests with `SPECTRUM_NATIVE_AGENT_TESTS=1` (draft, routes, tools, preview, skills home, sessions) | 6 passed |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The 13 skips are the 8 from phase 1 (opt-in native agent and sandbox checks, Windows-only checks, moving a project to the Bin and a live arXiv and DOI request) and the 5 new native agent tests, which were run separately above.

The live check ran the integrated backend and Vite on scratch data, projects and template folders with a fake home folder, with a scratch ACP agent set up through Settings › Agents and run under the real macOS isolation. It covered the welcome screen and task buttons, both tabs, the persona picker, Settings › Personas (create, edit, reset), Settings › Skills (a switch, a This project override, creating a skill, duplicating a built-in one and sharing into the fake home) and Settings › Agents (a rejected argument list, then a saved setup).

In review mode the agent read and edited two files and suggested a to-do through the Spectrum tools server. The transcript showed thinking, tool cards and the plan. Add and Save open steps as to-dos saved two to-dos, and Preview PDF compiled the draft into the cache. `main.tex` was applied, with a Restore row, and `intro.tex` rejected, with its note. Three more prompts worked on the draft. The first sent the open file, the to-dos and a skill as resources. The second set a persona, which started a new agent session, and the third cleared it. The Spectrum agent tab was checked with its model request answered in the page, so no model was called.

Three faults found in the live check were fixed: tool cards from a new agent session joined an older card with the same id, the picker did not see a setup saved in Settings and Settings opened at another agent than the one being set up.

### Phase 2 review fixes

The review's confirmed findings are fixed on `fix/p2-review`, one commit per fix or close group, each with a test or check:

- **Local agent sessions** (`agentSessionService.js`, `agentWorkspace.js`):
  - Stored events count a streamed piece by its text. Each piece had counted its whole JSON, so a long message shed the turn's start, user prompts included. A message past half the 2 MB cap goes on in a stored event of its own.
  - A review turn first brings the draft up to the project for every file the agent hasn't changed: the user's edits, new files and deletions (`refreshDraft`). A 1.10 session's file applied or rejected by path goes back to the user's file, and a direct turn that failed after clearing its baseline no longer fails every later turn.
  - Notes, the intro, the persona and the handoff are used up only once a prompt gets through. A draft Spectrum can't take for review (a link left in it, say) is told to the agent.
  - Requests still open when a turn ends, or when Spectrum closed during it, are marked answered, and the transcript treats any request no longer pending as answered. Stop ends a turn as "Stopped." and fails its tool cards still going.
  - A new session's updates that come before its id (its commands) are kept.
  - Sessions are named in the history menu by their first task.
- **Windows preview** (`previewDraft`, `compileService.js`): it runs no shell escape (`-no-shell-escape` on the command line, as MiKTeX ignores `shell_escape`), Biber, latexmk or glossary tools, all of which ignore TeX's limits. `PREVIEW_TEX_ENV` adds `openout_any` and MiKTeX's output and shell settings, and `initexmf` is asked what MiKTeX will use before compiling, so the preview refuses when MiKTeX's own configuration overrides them. The env is exported for `test/mcp-tools.test.js`, which now runs under any TeX.
- **Skills:** a skill switched off for the project can't be loaded or sent, by the Spectrum agent or to a local agent. The front matter reads after a BOM and with a description on the next line. Duplicate makes a valid id from a 64-letter one and marks a titled copy, keeping a shipped licence. Skills that run the left-out OpenRouter scripts say so when loaded. A skill's `.git`, `.env` and key files stay out of agent homes rather than stopping the copy, folders still held by a virus scanner are renamed again, and Windows copies only `.agents/skills`. `sync-skills.mjs` changes `skills/` only once every skill is fetched and checked. The related work and verify claims skills' descriptions were written afresh, as they followed Oleafly's AGPL wording.
- **Spectrum agent:** a run goes on from the thread's open proposals and each proposal keeps the file it was proposed against. A later turn no longer drops an earlier one's change to the same file, and Apply after reopening a thread merges the user's edits. Its tool calls come back as steps and show as cards with the reply. A project's last thread reopens with the workspace, and a merge keeps the Apply and Reject marks made on an older copy.
- **Workspace:**
  - Live pieces are joined as they come; 20,000 had taken about six seconds.
  - The preview PDF recompiles when a turn changes a file it already shows.
  - A task button goes back to the persona the user picked and takes its skill only while it's on.
  - The `/` menu lists every skill with its description.
  - The picker and Settings › Agents fall back to an agent that runs on this computer.
  - The workspace is mounted from the start, so the Agent button's dot shows.
  - The tab strip and plan heading work in a narrow column, a triple-clicked line counts as one, and labelled menu buttons, the listbox, the agent picker and the review's focus work with the keyboard and screen readers.
- **Settings:** persona and instruction fields are limited to what the routes take. The sharing card refreshes. A computer upgraded from 1.10.4 takes the others' personas and default instructions in, rather than sharing its starters over them, and an empty default-instructions box that was never shared never empties the others'.
- **Checkpoints:** a compile's checkpoint that becomes a "Before AI changes" one is dated then, so the local agent tab shows its Restore row.
- **Plan:** section 7 now says how a Windows preview limits TeX. Section 10b never claimed `openin_any` restricts TeX Live, so it is unchanged.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 389 passed, 22 skipped, 0 failed (411 total) |
| The same with `SPECTRUM_NATIVE_AGENT_TESTS=1` | 406 passed, 5 skipped (Windows only, the Bin, a live request), 0 failed |
| New `test/agent-turns.test.js` (9 native tests), also run on `25d0b92` | All 9 fail there, each on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data, projects and template folders, a scratch home and temp folder, and the ACP fixtures, with no model calls. The 22 skips are the earlier 13 and the 9 native agent turn tests.

Skipped as optional: marking a turn as needing attention when its draft couldn't be taken. The `.git` and `.env` filter when importing a skill, skipped here too, came back in the second round.

### Phase 2 second review fixes

The second round's ten confirmed findings are fixed on **`fix/p2-review2`**, branched from `bde28a4`, one commit each with a test or check:

- **Spectrum agent:** `read_file`, `list_files`, `propose_patch` and `apply_patch` refuse `.env` files, keys and git's, Claude's and Spectrum's folders (also through `sub/../`), and `list_files` leaves them out. It is the rule local agents' file requests already used, now `agentHidden` in `utils/pathUtils.js` for both. A closed change in a thread (applied, rejected, or superseded by a later turn's proposal for its file, made from the same base) keeps only its file and status, so a thread on a large file no longer reaches the 5 MB chat cap after a few turns.
- **Skills:** importing or duplicating a skill leaves its `.git`, `.env` files and keys behind, as the copy into agent homes does. The Spectrum agent reads the store itself, so `read_skill_file` had returned a cloned skill's token URL and its `.env`.
- **Local agent sessions:**
  - A turn's `changes` event names the changes without their texts, which the workspace fetches when it comes. Every turn had repeated the whole of every pending file, so a large file shed the transcript from the stored events, and one of about 1 MB shed everything.
  - The prompt is saved as the turn starts, and reopening a session Spectrum closed during takes the draft's changes in, so the tray shows the crashed turn's edits rather than the version before it.
  - A session whose first start failed starts the agent again for the next prompt, with its setup as it now is.
  - Preview PDF brings the draft up to the project first, as a turn does.
  - Apply takes a change the user also made (a file both deleted, or both created alike) instead of calling it a conflict.
  - Quitting stops only the sessions with a turn, a connected agent or a preview running, so the history menu keeps each session's status and time.
- **Settings:** a computer upgraded from 1.10.4 keeps personas and default instructions still at their default out of what it shares, and out of what counts as shared, until a file brings them in. When the newest file was a third computer's still on 1.10.4, it had shared its starters and an empty box over the 2.0 computer's own. The follow's logic is `followStep`, which `personas.check.ts` runs over three computers.

Skipped as optional: trimming a large ACP tool call's diff in the stored events, which can shed them the same way.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 391 passed, 26 skipped, 0 failed (417 total) |
| The same with `SPECTRUM_NATIVE_AGENT_TESTS=1` | 412 passed, 5 skipped (Windows only, the Bin, a live request), 0 failed |
| Each new backend test, and the personas check, run without its fix | Each fails on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data, projects and template folders, a scratch home and temp folder, and the ACP fixtures, with no model calls. The 26 skips are the earlier 22 and the four new native agent turn tests.

### Phase 2 third review fixes

The third round's 14 confirmed findings are fixed on **`fix/p2-review3`**, branched from `49ea758`, in 13 commits (the two about the Spectrum agent's paths share one), each with a test or check:

- **Local agent sessions** (`agentSessionService.js`):
  - The history menu and the open session load a session once between them. Reopening one Spectrum closed during had made two copies, and the open session listened to the copy that was replaced, so its next turn was never heard.
  - Every direct turn is measured from the project as it then is, with a checkpoint before it, the first too. A session whose first start or turn failed, or that Spectrum closed during, had gone on from the project as it was when the session began, so the tray counted the user's edits since as the agent's and no checkpoint held them.
  - The prompt is saved as the turn starts, before the agent does (which every turn does again), so closing Spectrum, Stop or an agent that won't start no longer loses it. The handoff to a new agent session takes only what came before it.
  - A session the agent can no longer load goes on in a new agent session, which hears the conversation so far, rather than failing every prompt as a setup fault.
  - Quitting only closes the agent a model or mode change left connected for a finished session, which keeps its status and time.
  - Preview PDF saves the editor first, as sending a task and applying do.
- **Spectrum agent threads** (`transcript.ts`, `SpectrumAgentTab.tsx`, `chatMerge.js`):
  - Where a proposal and its base pass 1 MB together, the base is kept as the patch from the proposal back to it (`storedChanges`). One proposal for a file over about 2.4 MB had made the thread too large to save from then on. Keeping no base would have brought back Apply writing over the user's edits after a reopen.
  - A turn's reply and the superseded marks it makes are one save, so a reply too large to save leaves the earlier proposal open.
  - A closed change goes in `meta.closed` with its file and status, and `meta.changes` keeps only the open ones, so 1.10.4, which offers every change in a thread for review, never meets one without its text (its review sheet crashed on one). A merge closes by file what either copy closed, and threads saved by earlier 2.0 builds, with the status in `changes`, read as before.
- **Isolation:**
  - The Spectrum agent's file tools also check a path as the disk has it (`onDiskRel` in `utils/pathUtils.js`: links followed, each name as stored), and `agentHidden` compares names as a case-insensitive file system folds them. On APFS `.ſpectrum` (a long s) had reached `.spectrum` and `id.Key` (a Kelvin sign) `id.key`, a link such as `notes.tex` to `.env` or `figs` to `.git` reached what it points to, and a proposal made through them could be applied. The isolated workspace reader uses the same names, and the file routes' check for app data looks at the path on disk too.
  - On Windows a name with a colon (an NTFS stream), a short name's `~1` or a trailing dot or space is hidden from agents: the workspace reader leaves it out of a review draft, and Apply refuses one from a proposal taken before.
  - macOS isolation keeps an agent out of `.claude` in its workspace, as it does `.git`. The skill copy, which writes `.claude/skills` in the agent's home, now runs with the home's `tmp` folder as its workspace.
  - Direct local agent sessions are refused on Windows, a 1.10 one included, and the workspace offers only Isolated there. The isolation worker grants the workspace by an inheritable ACL, which a folder the agent makes takes on whatever its name, so a direct session's agent could make `.git`, `.env` or `.claude` in the project.

Changed from the findings' suggestions:

- Names aren't refused for differing from their NFKC form, or for an upper case that lowers to something else, as that refuses ordinary names such as `straße.tex` or a decomposed `café.tex`. Each name is compared after folding instead (lower case, and upper then lower case), which catches what APFS and NTFS take for a hidden name.
- A colon counts as hidden only on Windows. Elsewhere it is an ordinary character, and hiding it would leave such files out of review drafts.
- The Windows worker isn't changed, as there is no Windows machine here. Refusing direct sessions is the finding's simplest option.
- No test drives the Spectrum agent tab's single save or Preview's save, as the workspace has no component tests. The closing the single save relies on is in `transcript.check.ts`.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 393 passed, 31 skipped, 0 failed (424 total) |
| The same with `SPECTRUM_NATIVE_AGENT_TESTS=1` | 419 passed, 5 skipped (Windows only, the Bin, a live request), 0 failed |
| Each new or extended backend test, the native sandbox test and the API path test, run on `49ea758`'s code | Each fails on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data, projects and template folders, a scratch home and temp folder, and the ACP fixtures, with no model calls. The 31 skips are the earlier 26 and the five new native agent turn tests. The two existing turn tests that stop a turn now wait for the prompt to reach the agent, as the prompt is saved before it starts.

### Phase 2 limits and open items

- Windows is untested. On the Windows build machine, run `test/agent-preview.test.js` with `SPECTRUM_NATIVE_AGENT_TESTS=1`, and `test/mcp-tools.test.js`. The checks of what `initexmf --show-config-value` prints for MiKTeX's `[Core]` settings (`false` or `0`, and `Forbidden`) come from reading MiKTeX's source, not from a run. They fail closed: no preview. Check too that MiKTeX's bibtex keeps to those settings. TeX Live 2026 and later ignore `openin_any`, so a Windows preview needs MiKTeX or TeX Live 2025 or earlier and refuses otherwise. The Windows rules for hidden names are tested on any system with `process.platform` set to Windows; on the build machine, check that the Spectrum agent's `read_file` of `GIT~1/config` and `.env::$DATA` is refused in a project with `.git` and `.env`.
- On Windows, a reparse point (a link or junction) anywhere in an agent's private home stops that agent from launching, as the isolation worker refuses to grant one.
- Direct local agent sessions are refused on Windows until the isolation worker can keep an agent from making `.git`, `.env` and `.claude` in the workspace. NTFS access rules can't match names, and placeholders made first with an access list that leaves out the agent's AppContainer cover only the folders that already exist. Then add a Windows case that `mkdir .git` fails in a direct workspace.
- On Windows, a project file whose name has `~` and digits (as a short 8.3 name does) or ends in a dot or space is hidden from agents and left out of review drafts, as it may be a short or trimmed name for a hidden one.
- The Spectrum agent's tool cards appear when its run ends; showing them live needs the run to stream.
- Settings that follow you: a computer upgraded from 1.10.4 still takes nothing in when the newest file is a third computer's, still on 1.10.4, though it no longer shares its starters over the others'. It takes them in once a 2.0 computer shares again, but personas edited on it before then go across over the others' own. Closing it needs `sharedSettings` to also return, for keys the newest file lacks, the newest file that has them.
- Local agents on Windows get no Spectrum tools, so there suggested to-dos come only through Save open steps as to-dos.
- Suggested to-dos reach the workspace when the turn ends (at most 50 a turn), and the tools server's run folders in an agent's home are not cleaned up.
- The first prompt after a session is created uses the skills copied when it was created.
- The TeX folder from Settings › Engines does not reach agent compiles or previews, which use the PATH.
- Terminal cards show only the command line for terminals Spectrum runs.
- Stop on the Spectrum agent leaves its answer unread while the backend finishes its tool loop.
- The settings switches use WebKit's `switch` attribute and are plain tick boxes in Chromium and WebView2. Closing the Settings sheet does not ask about unsaved skill file or persona edits.
- `mcp.mjs` is about 4 MB, since the reference and search services bring in the LLM service.
- Personas follow you through today's shared settings; one file each in the settings repo comes with phase 4.

## Phase 1 and 1b

Phase 1 and phase 1b are merged into `feat/2.0`:

- `9474182` merges the whole `fix/p1-review2` branch, including its 14 earlier review fixes and `bda8a3c`, which finishes the previously staged and unstaged Document insights work.
- `89a9a9a` merges the whole `build/c-integrate` branch, including the host, shared frame and circuit branches, `7f905bc` (review fixes) and `552bdf5` (refresh older generated diagrams before preview).
- `a82ccde` adds Mermaid PDF output, documentation and the phase 1 handoff.

The original Claude worktrees and branch references were retained. The initial dirty patches were also backed up under `/private/tmp/spectrum-2-continuation-N6eST2`; they are recovery copies, not patches to apply again.

### Completed in the phase 1 continuation

#### Phase 1 review

- Finished Document insights' punctuation, multi-row equation and source to-do changes. Fixed `alignat`'s column count and citation first-location/reading order.
- Refreshes now follow compiles, file switches and changes to the configured TeX folder.
- Presentation mode clamps the current page after recompiling a shorter deck.
- A PDF produced with errors is no longer eligible to create or replace a successful compile checkpoint.
- Reviewed the earlier compile-cache, bibliography rerun, history locking/cleanup, rename, mirror, note and to-do fixes. The rollback test into 1.10.4 and back passes.

#### Diagram composer

- Preserved and finished the existing canvas preferences, theme, symbol geometry and file-tree marker edits.
- Circuit symbols use the backend's `start`/`end` endpoint names and measured dimensions; failed symbol pages are not cached as valid pictures. Missing optional pins retain usable fallback positions.
- Added the circuit minimap and navigation. Fit includes measured pins. Exported component names remain unique, and adding a component after deleting another no longer repeats its label.
- Standalone documents crop the entire picture. The former `standalone[tikz]` header missed the `circuitikz` wrapper and produced a full letter page. Unchanged files from that generator are saved with the corrected header before preview; hand-edited code is preserved.
- Damaged and unsupported drawing data opens as code with its marker retained. A `.mmd` always opens as Mermaid even if its marker claims another language.
- Hand-edited diagrams have no editable drawing inspector. Exports require the current successful preview. An AI answer cannot overwrite edits made while it was pending.
- Save and conflict-backup failures now propagate. Native close, diagram switching and quit honor the failure and leave the work open. Quit attempts have independent response events and timeout state, so a failed attempt cannot close a later retry.
- Circuit symbol validation rejects TeX `^^` encodings that could otherwise bypass the literal-command allowlist.
- Mermaid exports PDF and PNG. Insert as figure creates PDF for LaTeX and retains PNG for a Markdown main file. `pdf-lib` 1.17.1 is loaded only for PDF output; its licence and dependency licences ship in `public/licences`.

### Phase 1 verification

| Check | Result |
| --- | --- |
| Full backend suite, `npm test` on the merged branch | 372 passed, 8 skipped, 0 failed (380 total) |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled and run separately | 26 passed |
| Native Rust unit tests | 7 passed |
| All 49 catalogue symbols using the installed circuitikz | American and European: no errors or missing requested pins |
| Real plot preview and inclusion using a project data file | Passed |
| Real circuit preview | One tightly cropped page; regression checks reject a full sheet |

The eight backend skips cover opt-in native agent/sandbox checks, Windows-only checks, moving a project to the Bin, and a live arXiv/DOI request. They are not passes.

The native test command used a test-only bundle override because builder worktrees do not contain the ignored app resources:

```sh
TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":null}}' cargo test --manifest-path src-tauri/Cargo.toml
```

Frontend self-checks can be repeated using the commands in their file headers. The combined pass bundled each file with esbuild for Node and ran it in a fresh process.

Browser checks used disposable projects and data folders, not the user's documents or Spectrum settings:

- Damaged drawing opens as code; incompatible Mermaid metadata does not crash the composer.
- Place a resistor, use the minimap and dark canvas, view generated code, retain hand edits, and disable exports while a new preview is pending.
- Open an unchanged old-generator circuit: the header is refreshed and its PDF measures about 61 × 30 points, rather than a letter sheet.
- While presenting slide 3 of a three-slide deck, finish compiling a one-slide replacement: presentation changes to page 1 of 1.
- Download a Mermaid PDF (one page), hand it to the editor's Floats panel, insert it in the source, and compile the resulting document successfully.

Logs from this session are in `/private/tmp/spectrum-2-continuation-backend-all.log`, `spectrum-2-continuation-typecheck.log`, `spectrum-2-continuation-build.log`, `spectrum-2-continuation-frontend-checks.log`, `spectrum-native-save-review-test.log` and `spectrum-2-symbol-catalogue.log`. They are temporary evidence; the results above do not depend on those files surviving.

### Limits before a release

- No Windows build or UI test, installed-app test, DMG, tag, push or release was performed. The native save changes were code-reviewed and unit-tested, not manually exercised through a packaged native window.
- Live paid model calls were not used. The late-answer guard was reviewed; future agent changes still need their own lifecycle and isolation checks.
- Mermaid PDFs contain the existing high-resolution raster at its correct physical size. They are not vector PDFs.
- The pre-existing three-second quit fallback for a completely unresponsive page and OS force-quit limits remain. A reported save rejection cancels that quit attempt.
- The symbol cache still has its documented version/size limitation; this continuation did not redesign it.
- Typst diagrams remain unavailable until phase 5, as planned. New agent tools, TexLab, combined Review/Research, Zotero, GitHub sync, cloud migration and additional engines are not implemented by this continuation.

## Standing rules for the next phases

Base new builder branches on the latest `feat/2.0`, not the old `main`. Continue the plan's build and review process, preserving the earlier phases' work and 1.10.4 rollback compatibility. The cloud sync is gone since phase 4: keep reading, never writing, 1.10's mirror records, `sync.json` and cloud copies, so going back to 1.10.4 stays safe. Do not tag or release 2.0 without the user's explicit instruction.
