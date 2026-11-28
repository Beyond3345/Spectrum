# Spectrum 3.0.0 rewrite: branch plan

Branch: `rust-gpui-rewrite-v3`. Blueprint: [gpui-rewrite-plan.html](gpui-rewrite-plan.html).
This file is the working plan for the branch: what changes from the blueprint, where the code lives,
and the order of sessions. The blueprint stays the reference for detail (formats, palette, phase steps).

## Ground rules for the branch

- New Rust workspace lives at `spectrum-native/` in this repo. The 2.8 code (`apps/`, `src-tauri/`,
  `native/`) stays in the tree untouched as the read-only reference. Nothing on this branch edits it.
- `main` keeps shipping 2.8.x. Merge `main` into this branch now and then so the reference stays current;
  never the other way until 3.0.0 is ready.
- One crate or one vertical slice per session. Every session ends with the gate below passing and a commit.
- Gate (run from `spectrum-native/`):
  ```bash
  cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
  ```
  plus the duplicate-GPUI check (see correction 1 for the package name).
- `CODING_STANDARD.md` (blueprint Section 6, condensed) and `ARCHITECTURE_LEDGER.md` (under 150 lines)
  sit in `spectrum-native/` and are read at the start of every session.

## Corrections to the blueprint (checked 28 Nov 2026)

1. **GPUI pin.** Depend on `gpui-kit =0.11.0` (23 Nov 2026), which pins `gpui-pre =0.3.14` and re-exports
   it with `gpui-component`. The crates.io `gpui` 0.2.2 and `gpui-ce` are other forks: never add them. GPUI
   crates other than `spectrum-ui`/`spectrum-theme` use `gpui = { package = "gpui-pre", version = "=0.3.14" }`.
   The duplicate check is `cargo tree -d -i gpui-pre`. The kit also ships a Tree-sitter + LSP code editor;
   session 2a evaluates it as the base for `spectrum-editor` before writing one from scratch.
2. **Mac is Apple silicon only.** Drop every macOS x64 asset the blueprint mentions (Typst SHA-256s,
   PDFium, engines). Targets: `aarch64-apple-darwin` and `x86_64-pc-windows-msvc`. Never run an x86_64
   slice under Rosetta in checks.
3. **Toolchain.** Local stable is Rust 1.99.0; pin that in `rust-toolchain.toml`, not the 1.86 example.
4. **Versions found today** (start of the Phase 0 audit, not the final pins): harper-core 3.2.0 (2.8 ships
   3.0.0 WASM), typst-syntax 0.15.1 (same as 2.8), tree-sitter 0.27.2, pdfium-render 0.9.6, ropey 1.6.1.
5. **Sizes.** 2.8 is about 97k lines of frontend and 69k of backend (not 98.5k / 88.2k). Doesn't change scope.
6. **engines.json** lives at `apps/backend/src/data/engines.json`; **checkers.lock.json** at
   `native/checkers.lock.json`. The new workspace keeps its own copies under `spectrum-native/assets/`.
7. **Windows CI.** Leave `.github/workflows/windows.yml` for the 2.8 build. Add
   `.github/workflows/native-v3.yml` (macOS arm64 + Windows x64, runs the gate) that triggers only on this
   branch.
8. **Release process carries over.** Phase 10 builds the DMG, runs `.claude/stages/dmg-probe.mjs` on the
   mounted DMG, waits for a hand test, and asks about the Windows release each time
   (see `docs/WINDOWS_TEST_RELEASE.md`). Bundle ID, copyright and identifiers use `beyond3345`.
9. **UI copy** stays Australian English ("Bin", "colour"), same as 2.8.

## Fixes over 2.8.1 (user, 28 Nov 2026)

### Look

Writing comes first. In the workspace (editor, PDF, toolbars, sidebar, Compile) colour must not
draw the eye from the text: soft, pastel, near-mono tints of the area hues instead of vibrant fills,
and no vivid prism on the Compile button or toolbar buttons (this overrides the blueprint's prism
Compile button and its 14%-tint hue pills). The prism and full-strength hues are kept for brand
moments (Home header, About, installer, progress) and small accents.

2.8.1 stays the feature target: every 2.8.1 feature is rebuilt (tracked in
`spectrum-native/FEATURE_PARITY.md`), and the sectional layout stays (files and outline in the
sidebar, editor left, PDF right, tools/logs, Assistant/Agent). Buttons, toolbars and features may be
moved and regrouped.

The plan's design system is the target for every screen, not 2.8's CSS. Screens the plan doesn't
draw (About, dialogs, sheets, empty states, onboarding, notices, the Composer's rails…) are designed
in its system, and any 2.8 screen that is dated or inconsistent is modernised to match. Each such
redesign goes in `spectrum-native/DECISIONS.md`.

### Editor themes (session 2e)

Port all of 2.8's editor themes (`apps/frontend/src/editor/editorThemes.ts`) with their exact
colours. 2.8's Spectrum Light and Spectrum Dark are kept, renamed **Spectrum Classic Light** and
**Spectrum Classic Dark** (ids `spectrum-classic-light` / `spectrum-classic-dark`). 3.0.0's new
**Spectrum Light / Dark** (ids `spectrum-light` / `spectrum-dark`, the defaults) use the plan's
editor design: `bg-code` background, plan syntax colours (commands green, brackets amber,
environment names purple, maths magenta) and the plan's text and gutter tokens. A 2.8 setting of
`spectrum-light`/`spectrum-dark` lands on the new Spectrum; Classic is one pick away in Settings.

### Update notifier (session 10a; the core can land earlier in `spectrum-core`)

2.8.1's notice didn't work. Causes found:
- `updateService.js` saved each check's *answer* to `update-check.json` for 24 hours. A check made
  shortly before a release kept reporting "no update" until the next day (on 28 Nov the check at
  ~14:10 UTC recorded 2.8.0; 2.8.1 was published at 14:21). A failed (offline) check was also cached
  for a day.
- The button was an `<a target="_blank">` that relied on the WebView handing new windows to the
  system browser; the release page didn't open.
- The notice lived only on the projects page.

3.0.0 behaviour:
- Ask `https://github.com/Beyond3345/Spectrum/releases/latest` with a HEAD request and no redirect
  following (no API rate limit, nothing about the user sent); the `Location` tag names the newest
  release. Same privacy promise as 2.8: no identifiers, setting "Tell me when a newer Spectrum is out"
  (on by default) turns it off entirely.
- Ask at startup and every 6 hours while running. Keep a successful answer for 6 hours; a failed
  ask is retried after 30 minutes and never cached as "no update".
- Compare versions as semver (3.0.0 > 2.8.1; pre-release betas `3.0.0-beta.N` only notify betas).
- Show the notice everywhere: a pill in the title bar plus a card on Home; "Check for updates" in
  the Command Palette and About gives an immediate answer ("You're up to date" / the new version).
- "Open the release page" opens `…/releases/tag/vX.Y.Z` in the default browser through GPUI's
  `cx.open_url` (NSWorkspace on macOS, ShellExecute on Windows). "Not now" hides that version only.
- Tests: version parsing and comparison, the cache rules (stale, failed, clock moved backwards),
  a local HTTP server standing in for GitHub, and a check that the open action calls the platform
  opener with the exact tag URL.

## Order of work

The UI crates form the critical path. The pure crates have no GPUI dependency, so once Phase 0 lands
they can run in parallel sessions, each in its own worktree, because they don't share files.

| # | Session | Crate(s) | Depends on | Done when |
|---|---------|----------|------------|-----------|
| 0a | Workspace, standard, ledger, dependency audit | root, `spectrum-xtask` (stub `fetch-deps`) | — | Gate passes on Mac + Windows CI; pins recorded |
| 0b | Theme + smoke window | `spectrum-theme`, `spectrum-app` | 0a | Window opens < 100 ms, 12 area swatches, Light/Dark and Spectrum/Simple toggle live |
| 1a | Paths, settings, project model, watcher | `spectrum-core` | 0a | Reads a real 2.8 data dir and `.spectrum/settings.json` without loss; tests for unknown fields, atomic save, non-UTF-8 names |
| 1b | Keystore (Keychain + DPAPI, `spectrum-key:` refs) | `spectrum-core` | 1a | Reads existing 2.8 keys on both OSes |
| 1c | UI facade, shell, palette, Quick Open | `spectrum-ui`, `spectrum-app` | 0b, 1a | Opens projects, file tree, create/rename/Bin, Cmd+Shift+P, Cmd+P |
| 2a | Buffer: rope, undo tree, selections, offsets | `spectrum-editor` | 0a | Unit tests incl. UTF-16 conversions |
| 2b | Highlight, outline, folds, scope depths | `spectrum-editor` | 2a | Tree-sitter for LaTeX/Typst/Markdown/BibTeX |
| 2c | Editor element, gutter, scope bars | `spectrum-editor` | 2b, 1c | 20k-line file < 30 ms, < 4 ms frames |
| 2d | Input handler + IME, search, smart typing, snippets | `spectrum-editor` | 2c | Cantonese/Pinyin IME tested by hand on Mac and Windows |
| 2e | Themes (port all from editorThemes.ts), shortcuts, Vim | `spectrum-editor` | 2c | |
| 3a | Engines, runner, log parser | `spectrum-compile` | 1a | Compiles fixtures with Tectonic, TeX Live, Typst headless |
| 3b | macOS sandbox (thin_biber, real_python), trust | `spectrum-compile` | 3a | Untrusted project compiles confined |
| 3c | SyncTeX parser | `spectrum-compile` | 1a | Fixture forward/inverse tests pass |
| 4a | PDFium actor, tile cache, colour modes | `spectrum-pdf` | 0b | 100-page TikZ PDF under 128 MB |
| 4b | Selection, links, search, SyncTeX pulse, notes | `spectrum-pdf`, `spectrum-app` | 4a, 3c, 2c | **First full writing loop: edit → compile → PDF → jump** |
| 5a | LSP client (TexLab, Tinymist) | `spectrum-lsp` | 1a | Headless tests against real servers |
| 5b | Harper + Hunspell FFI + LanguageTool | `spectrum-checkers` | 1a | Masking and CJK tests ported from grammarService.js |
| 5c | Wire LSP + checkers into editor | `spectrum-editor` | 5a, 5b, 2d | |
| 6a | Providers (OpenAI Responses, Anthropic, Gemini, Ollama, rest) | `spectrum-ai` | 1b | Streaming tests with recorded fixtures |
| 6b | Assistant view, diff hunks | `spectrum-ai`, `spectrum-app` | 6a, 2c | |
| 6c | Agent loop, isolation, MCP, ACP | `spectrum-ai` | 6a | Limits and symlink rejection tests from agentSandbox.js |
| 6d | Windows sandbox worker | `spectrum-win-sandbox` | 0a | Junction/symlink escape tests on Windows CI |
| 7 | BibTeX, resolvers, research, Zotero, review | `spectrum-references` | 1a | |
| 8 | Checkpoints, diffs, GitHub device flow | `spectrum-git` | 1b | |
| 9a | LaTeX ↔ Typst, Jyutping | `spectrum-convert` | 1a | Round-trip fixture keeps labels/citations |
| 9b | Diagram composer window (trailer format verbatim) | `spectrum-diagram` | 2c, 3a | Opens 2.8 diagram files, hand-edited bodies open in code mode |
| 10a | Single instance, menus, quit flush, updater | `spectrum-app` | all UI | |
| 10b | Mac bundle, sign, notarise, DMG + probe | `spectrum-xtask` | 10a | Hand test passes |
| 10c | Windows installer/updater/uninstaller | `spectrum-win-setup` | 10a, 6d | 2.8.x → 3.0.0 update keeps projects and keys.dpapi |
| 10d | Performance audit + 30-min soak | — | 10b, 10c | Blueprint targets met |

Parallel once 0a lands: 1a/1b, 2a/2b, 3a/3c, 5a, 5b, 6a, 6d, 7, 8, 9a. Hold back anything that needs
`spectrum-app` or `spectrum-editor` until 1c and 2c are in.

## First session

Run 0a only: create `spectrum-native/` with the workspace manifest, lints from blueprint Section 6.5,
`rust-toolchain.toml` (1.99.0), `CODING_STANDARD.md`, `ARCHITECTURE_LEDGER.md`, the `native-v3.yml`
workflow, and an audit table (current vs latest for every engine, checker, dictionary and crate) in
`spectrum-native/DEPENDENCY_AUDIT.md`. All 17 crates are created as empty members so the graph is fixed from day one.

## Decisions (28 Nov 2026)

- **All 17 crates**, created as members in session 0a so the dependency graph is fixed from the start.
- **3.0.0 is a full release** with feature parity with 2.8. No cut-down first version.
- **Beta DMGs** (`3.0.0-beta.N`) may be built along the way into `OpenPrism/builds/` as checkpoints,
  but nobody hand-tests them. The one hand test happens when the whole rebuild is finished, before
  anything merges to `main` or ships.
