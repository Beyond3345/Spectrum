# Spectrum 2.0 review plan

Written 25 October 2026. These are the heavier reviews to run once there is usage to spare (the week of 1 November 2026). Until then reviews are paused. Phase 4's first round was run and its fixes merged (`efc81b2`), a test DMG with phases 1 to 4 was built for the user, and phase 5 is to be built by another agent from [PHASE5_PLAN.md](PHASE5_PLAN.md) without a review round.

Each review below is a multi-agent workflow. Start Claude Code in `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum` (worktree isolation needs the repository as the working folder) on `feat/2.0` and say, for example:

> ultracode: run review 2 from docs/SPECTRUM_2_REVIEW_PLAN.md, then merge its fixer branch into feat/2.0 and repeat the round until two rounds in a row find nothing high or medium.

Run them in the order below. After each one, merge the fixer branch into `feat/2.0`, record the outcome in [SPECTRUM_2_HANDOFF.md](SPECTRUM_2_HANDOFF.md) and tick it off in the table.

| Review | Scope | State |
| --- | --- | --- |
| 1 | Phase 4, second round | Waiting (the first round's fixes are merged as `efc81b2`) |
| 2 | Phase 5, first rounds | Waiting (merged as `e808c4c` after Codex's audit and a small review; start from the handoff's Phase 5 small review) |
| 3 | The whole of 2.0 before the test DMG | Waiting for reviews 1 and 2 |
| 4 | The test DMG itself | Waiting for review 3 and the DMG |

## How a round works

The earlier phases used one shape and it worked well, so keep it:

1. **Find:** one agent per lens (listed under each review) reads the code for its lens, proves each defect with an experiment where it can and reports at most 15 real, specific defects with a severity (high, medium or low), the file and line, the scenario, the evidence and the smallest fix.
2. **Verify:** a second agent per lens tries to refute every finding by reading the cited code and re-running the experiment. A finding survives only if the refutation fails. Anything that can lose user text or leak a secret stays unless it is shown to be impossible.
3. **Fix:** one fixer agent in its own worktree branches `fix/<name>` from `feat/2.0`, applies every confirmed finding with the smallest correct fix and a test for each behaviour fix, runs every check below and adds a section to the handoff.
4. **Repeat** with fresh reviewers until two rounds in a row confirm nothing high or medium. Give later rounds the earlier rounds' confirmed findings so they look elsewhere, and give them the fixer's diff so they check the fixes themselves.

Use `pipeline()` so each lens verifies as soon as it finishes. A round costs about two agents per lens plus the fixer.

A heavier variant for reviews 3 and 4: three independent verifiers per finding, each told to refute it, keeping a finding when at least two cannot. Add a final completeness agent that asks which feature, platform or claim no lens covered and turn its answer into the next round's lenses.

## Rules every agent is given

- Reviewers are read-only in the repository. They experiment in their own `git worktree add <scratch folder> <commit>` (removed afterwards) with `node_modules` symlinked from the main checkout.
- Scratch `DATA_DIR`, `PROJECTS_DIR` and `TEMPLATE_DIR`, a fake `HOME` and a scratch temp folder for every experiment and test run.
- Never read or write the Spectrum app data (`~/Library/Application Support/com.beyond3345.spectrum`), `~/Library/CloudStorage`, `~/SynologyDrive`, `~/Documents/Spectrum`, `~/Zotero`, the real `~/.claude`, `~/.codex` or `~/.agents` or any other real user data.
- Never contact the real Zotero on port 23119 or a real GitHub account: use mock servers on other ports, git http-backend over scratch bare repositories and the tests' stand-in REST server. Downloading public release files (Typst, Tectonic, pandoc and TexLab releases) is allowed.
- No paid model calls. Never launch a release build of the app (it claims the default apps), never run `arch -x86_64` or anything under Rosetta, never push, tag or release.
- Oleafly (AGPL) and CircuiTikZ-Designer (GPL) are ideas only: no code or text from them. Spectrum stays MIT.
- Ignore `docs/SPECTRUM_2_1_PLAN.md` (untracked research).
- UI text is Australian English with curly quotes and "Bin". Docs have no contractions, em dashes or Oxford commas. Commits end with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Setup the agents need

- **TexLab on the `PATH`:** `node scripts/desktop.mjs texlab` puts TexLab 5.26.0 in `src-tauri/binaries` (gitignored). Copy it to a scratch folder such as `<scratch>/texlab-5.26.0/bin/texlab` and put that folder on the `PATH` for the backend tests. After phase 5, `node scripts/desktop.mjs` fetches Tectonic and Typst the same way.
- **Mocks:** the backend tests already carry a mock Zotero (`SPECTRUM_ZOTERO_BASE`) and a stand-in GitHub (git http-backend plus a REST stand-in). Live checks reuse them.
- **Live checks** use the built-in browser pane (`mcp__Claude_Browser__*`) against the backend and Vite started from the agent's worktree with scratch folders, and stop every server they start.

## The checks the fixer runs

| Check | Command |
| --- | --- |
| Backend suite | `cd apps/backend && node --test "test/*.test.js"` with the scratch TexLab on the `PATH` |
| The TexLab test that used to be intermittent | `node --test test/texlab.test.js` ten times, reporting the pass rate |
| Typecheck | `npm run typecheck` |
| Frontend build | `npm run build` |
| Frontend self-checks | every `apps/frontend/src/**/*.check.ts`, each bundled with `npx esbuild <file> --bundle --platform=node --outfile=<scratch>/checks/<name>.mjs` and run with `node` (their header comments say so) |
| Native tests | `cd src-tauri && TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":null}}' cargo test` |
| Spelling and grammar engines | `npm run checkers:verify` |
| Going back to 1.10.4 | `rollback.test.js` and `github-rollback.test.js` (part of the backend suite) |

## Review 1: phase 4, second round

Scope: phase 4 (`2af6877..bab0316`), Codex's checker versions (`094b13c`, `d9cfcda`) and the first round's fixes (`git diff dde8ef5 c070493`, merged as `efc81b2`). Give the reviewers the first round's confirmed findings, listed under Phase 4 review fixes in the handoff.

Lenses:

- **github:** Spectrum's own pull (fetch outside the lock, merge per file type, conflicted copies, renames by case and Unicode form, deletion order and the deletion brake, going back to the Before pull checkpoint, the two-parent commit, `main` moved last), backups (excludes, compiled PDFs, secret-looking and 100 MB files, private repository creation, a refused push), automatic sync timing, a second computer and Link, Get from GitHub, sign-in (the token never reaching the window, the device flow without a client id) and the settings repository.
- **zotero:** the first round's fixes to the key binding and the move route, the authorise flow, Better BibTeX's picker and export, key choice, `appendEntries` under the bib lock, completion and `syncCollection` (matching, creating, removals only after a whole-read save, waiting for a collection, Finder copies, concurrency).
- **cloud-rollback:** what the cloud removal deleted and kept, the first-start migration, never writing `DATA_DIR/mirror` or `sync.json` and going back to 1.10.4 (`42ff62f`) and forward with a project that is on GitHub, has a Zotero collection and was mirrored before.
- **live-4:** the phase 4 features used the way the user would, with two scratch computers, the mock Zotero and the stand-in GitHub, plus Settings › Spelling showing the Harper and Hunspell versions.
- **windows-4:** isomorphic-git on Windows paths (drive letters, long paths, case-insensitive NTFS, CRLF), Zotero's AppActivate, the migration with OneDrive paths, the token file's permissions and `windows.yml` building nodehun with its manifest.

## Review 2: phase 5

Scope: the phase 5 merge into `feat/2.0` (plan section 10b and the Typst part of 10c), built on `build/p5` from [PHASE5_PLAN.md](PHASE5_PLAN.md), whose steps say what each part should do. The builder's notes, Codex's 21 audit findings (`handover.md`) and the small review's fixes are in the handoff's Phase 5 sections; give the reviewers those so they look elsewhere and check the fixes.

Lenses:

- **engines:** `desktop.mjs` fetching Tectonic and Typst with pinned SHA-256s and joining the Mac halves, the Windows assets (`vcruntime140.dll`, `fonts.conf`), `GET /api/engines`, installing and removing older Typst versions and pandoc (checksums, partial downloads, a second install while one runs, paths with spaces) and Auto's choice including the Biber guard.
- **compile-typst-markdown:** Typst compiles with the pinned version, the package cache and fonts folder, offline first imports, the diagnostic parser and error cards; the Markdown two-step (pandoc then LaTeX, or Typst), citations, `--extract-media`, SVGs, errors traced back to the `.md` line, Show generated LaTeX, Stop and timeouts; Convert to LaTeX project and Export to Word; and Document insights' data from `typst eval` or `typst query`.
- **editor-panels:** language by file extension, `codemirror-lang-typst` failing to plain text, outlines, `@` and `[@` completion, citations and floats in each language, the spelling masks, Document insights and Review for Typst and Markdown, the starter templates, Settings › Engines and the compile menu's Typst version and PDF engine.
- **composer-typst:** the fletcher mode (export, the drawing kept in the file, the preview through `typstInputs`, the same file working inside `#figure(include …)`), TikZ and Mermaid diagrams going into Typst and Markdown documents and the `spectrum-typst` and `spectrum-markdown` skills.
- **sandbox-security:** downloaded engines in `DATA_DIR/engines` being the only part of the data folder an agent's sandboxed compile can read or run, the caches kept in the agent's home, pandoc's `--sandbox`, Typst's `--root`, archive extraction (only the binary, no path escapes) and `typstInputs` validation.
- **windows-5:** `typst.exe` with its `vcruntime140.dll`, Tectonic with `FONTCONFIG_FILE`, pandoc's Windows archive, paths with drive letters and spaces and `windows.yml` fetching and bundling it all.
- **rollback-5:** 1.10.4 listing and opening Typst and Markdown projects and projects whose `.spectrum/settings.json` pins a Typst version, without crashing or losing anything.
- **live-5:** in the browser pane with scratch folders: a new Typst project from each starter, compile, an error card, a citation, a figure, Document insights, an older Typst version installed and pinned, a Markdown article with a citation compiled through LaTeX and through Typst, pandoc downloaded into the scratch data folder, Convert to LaTeX project, Export to Word and a fletcher diagram drawn, previewed and inserted.

## Review 3: the whole of 2.0

Scope: `main..feat/2.0`. Run it after reviews 1 and 2 are clean, before building the test DMG. Use the heavier variant (three verifiers per finding and a completeness agent).

Lenses:

- **cross-phase:** features that meet across phases: compile options and defaults with the new engines; Follow the open file with Typst and Markdown; the agent workspace, personas and skills compiling Typst and Markdown; checkpoints and GitHub backups of the new project kinds; TexLab staying off for `.typ` and `.md`; Review, Document insights, Floats and the to-do list in every project kind; Research and Zotero citations in each language.
- **data-safety:** every path that writes user files (saves, checkpoints, GitHub pulls, Zotero `.bib` writes, the composer, agents' edits, migration, exports) checked for anything that can lose or overwrite user text, including two windows and two computers at once.
- **security:** tokens and keys (GitHub, Zotero, model providers) never reaching the window, logs or repositories; the agent sandbox on Mac and Windows; downloads and their checksums; archive extraction; the local server's routes reachable only from the app.
- **rollback:** the full round trip with 1.10.4 (`42ff62f`): every kind of project 2.0 makes or changes opened in 1.10.4, edited there and opened again in 2.0.
- **windows:** the whole Windows build (`windows.yml`, `desktop.mjs`'s Windows path, every bundled binary), the tests that are skipped on the Mac and the code that branches on the platform.
- **performance:** start-up time, memory with TexLab, the spelling and grammar workers and an agent running, a 500-page document, a 1 GB repository and a large `.bib`.
- **ui-copy-accessibility:** every new dialog, menu and message in Australian English with curly quotes, keyboard use, focus, contrast in light and dark and the screen reader names.
- **docs-licences:** README, CHANGELOG, THIRD_PARTY_NOTICES and the plan's claims checked against the code; the licence of every bundled or downloaded component (TexLab, Tectonic, Typst, pandoc, `vcruntime140.dll`, Harper, Hunspell and its dictionaries, isomorphic-git, the K-Dense skills, `codemirror-lang-typst`).
- **live-all:** a fresh-eyes pass through every 2.0 feature in the browser pane, in the order a new user would meet them.

## Review 4: the test DMG

Scope: the DMG built by `npm run desktop:build` and copied into `OpenPrism/builds` beside the 1.10.4 one. Do not launch the release build itself (it claims the default apps); inspect the bundle instead.

Lenses:

- **bundle:** every sidecar and resource present and universal (`lipo -info`) for both Mac architectures without running the Intel half: the backend, TexLab, Tectonic, Typst, nodehun and the Harper and Hunspell manifests, the skills and templates. Code signing and entitlements as for 1.10.4.
- **size:** the DMG and installed sizes against the plan's estimates (about 195 MB and 520 MB).
- **first start:** the migration and the first-run state, checked by running the bundled backend sidecar against a scratch data folder rather than opening the app.

After review 4 the user tests the DMG. Nothing is pushed, tagged or released until the user says so; the Windows installer is built on GitHub Actions only after that.
