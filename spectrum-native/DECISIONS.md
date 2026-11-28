# Decisions log

Calls made where the plan (`../docs/gpui-rewrite-plan.html`) was wrong, out of date or ambiguous.
The user reviews this when 3.0.0 is finished. Newest last. Each entry: what, why, where.

## Standing rules from the user (28 Nov 2026)

- All 17 crates. 3.0.0 is a full release with 2.8 parity. Beta DMGs may be built but aren't tested
  until the whole rebuild is done.
- UI layout and colours come from the plan, not 2.8's code; redesigns are part of the plan. 2.8 is
  the reference for behaviour, formats and edge cases.
- Where the plan is wrong or ambiguous, decide, log it here, report at the end.
- The plan's design system is the target for every screen. Screens the plan doesn't draw are
  designed in its system, and any 2.8 screen that is dated or inconsistent is modernised, rather
  than copied from 2.8's CSS. (This replaces "fall back to 2.8 where the plan is silent" for looks.)
- Writing comes first: the blueprint (updated 29 Nov) now gives a calm pastel palette and a Calm
  Slate Mono Compile button; the earlier prism Compile button and vivid pills are gone.
- 2.8.1 is the feature target: nothing left out; the sectional layout (files/outline sidebar,
  editor left, PDF right, tools, Assistant) stays; controls may move.
- Removed from 3.0.0: the 1.10 migration notice, Change template (template transfer), the PDF
  parsers and their Settings pane, and Export to Word.
- 3.0.0 uses the user's new icon set (`assets/icons/app/`) for every icon, replacing 2.8's.
- Blueprint second update (29 Nov): line icons everywhere (dots only for tags/status), collapsible
  folders in Files, palette pill in headers, aux-file sweep, 18 research sources, Reference Helper
  type/format pickers, template style audit, and the Composer as 5 visual studios.
- Keep 2.8's Spectrum editor theme as **Spectrum Classic** (Light and Dark) beside 3.0.0's new
  Spectrum editor theme.
- Fix 2.8.1's update notifier, which didn't work and didn't open the GitHub release page.

## Platform and toolchain

1. **Mac builds are Apple silicon only.** The plan lists macOS x64 assets; Spectrum has been
   aarch64-only since after 2.1.0. Dropped every macOS x64 target and asset.
2. **Rust 1.99.0**, the installed stable, instead of the plan's 1.86 example.
3. **`cargo xtask check` instead of `just check`.** `just` isn't installed and would be one more tool
   to require; the plan already has a `spectrum-xtask` crate, so the gate lives there.
4. **Edition 2024, resolver 3** (current for Rust 1.99; the plan says resolver 2).
5. **Licence MIT** in the workspace manifest, matching the repo's LICENSE.

## Dependencies (see DEPENDENCY_AUDIT.md)

6. **`gpui-kit =0.11.0`**, not `gpui-component` plus a separately chosen `gpui`. gpui-kit is the
   kit's own umbrella crate: it pins `gpui-pre =0.3.14` and re-exports it, so two GPUI versions can't
   happen. The crates.io `gpui` (0.2.2) and `gpui-ce` are different forks and are never added.
7. **tree-sitter stays at 0.26.13**, not the newest 0.27.2: gpui-kit requires ^0.26.13 and only one
   tree-sitter can link. tree-sitter-bibtex from crates.io needs 0.22, so it gets vendored.
8. **ropey `=2.0.0-beta.1`** (byte-indexed), because gpui-kit pins it. The plan assumed ropey 1.x.
9. **PDFium chromium/8125**, not the newest 8179: pdfium-render 0.9.6 has bindings up to 8125.
10. **Versions aligned to what the kit already uses** so nothing builds twice: notify 8.2.2 +
    notify-debouncer-mini 0.7.0, similar 2.7.0, base64 0.22.1, zstd 0.13.6.

## Theme and look

11. **Surface, text and accent tokens are the plan's own `:root` / dark variables**, which differ
    from 2.8's tokens.css (e.g. dark panel `#1d1d21` not `#212121`, text `#0d0d10` not `#0d0d0d`,
    accent `#0073df` / `#7ab4fe` instead of the macOS accent colour). A test fails if the code drifts
    from the plan.
12. **Control radius 10 px** (the plan's Section 3 text says 16/12/10). The plan's HTML page itself
    uses 9 px; the written spec wins over the page's own styling.
13. **Scope bar colours use the labelled hex values** (d0 `#d23855` / `#ff7b86` …). The small swatches
    beside them in the plan, and the mockup's bars, use slightly different colours (`#e5484d`,
    `#e8890c` …); the labels are the spec.
14. **Comment syntax colour from 2.8** (`#8c959f` / `#8b949e`): the plan gives colours for commands
    (green), brackets (amber), environment names (purple) and maths (magenta) but none for comments.
15. **Diff colours are the plan's green-soft and red-soft tokens** (12% / 11%), not 2.8's 14% / 13%.
16. **Simple colour style** neutralises area icons and toolbar buttons to `text-secondary` but keeps
    scope bars and error/warning colours, as the plan says.
17. **UI font `.AppleSystemUIFont` / Segoe UI, mono SF Mono / Consolas**, from the plan's `--font-ui`
    and `--font-mono` stacks. Named explicitly because otherwise the kit enumerates every installed
    font at startup (about 120 ms). Windows uses Consolas rather than the stack's Cascadia Mono, which
    Windows 10 doesn't ship. The editor's own bundled fonts come in Phase 2.
18. **Body text 14 px** (the plan's `body { font: 14px … }`); the kit defaults to 16.
19. **Cold start target not met yet**: the window opens in about 150–210 ms on an M-series Mac
    (GPUI platform start ~85–125 ms, Metal window ~70 ms; Spectrum's own setup ~1 ms). The plan wants
    <100 ms. Left for the Phase 10 performance audit, which measures the signed .app bundle.
20. **Window background is Blurred** (macOS vibrancy), with the plan's opaque canvas painted on top
    for now. Glass clarity becomes a setting when Settings is built.
21. **Snapshot tests** (`SPECTRUM_SNAPSHOT=1 cargo test -p spectrum-app --test snapshot`) render
    views offscreen with the real Metal renderer to PNGs, because the shell can't screen-capture.
    Every UI session checks its work this way. Not part of the gate (needs a Mac GPU).

## spectrum-core (sessions 1a, 1b)

22. **zip without default features** (deflate only). The defaults pull in zstd-sys, a C build that
    needs the Windows SDK headers; Overleaf and arXiv archives use deflate.
23. **Imports reject unsafe archives outright**: a `..` or absolute entry fails the whole zip or tar
    import (2.8 silently dropped or skipped it); symlinks are skipped and logged. (`import.rs`)
24. **The file tree hides node_modules, target, `_minted-*` and 2.8's gitignored TeX build files.**
    2.8's tree showed them. (`tree.rs`)
25. **App settings live in `DATA_DIR/settings.json`.** 2.8 kept them in the WebView's localStorage,
    which the native app can't read directly; migrating them is a later session's job (`paths.rs`).
    Snippets, personas, project folders and composer diagrams stay as raw JSON until their owner
    crates parse them (`settings.rs`).
26. **A field of the wrong type falls back to its default on its own**, keeping the rest of the file,
    rather than failing the whole settings file. (`json.rs`)
27. **Sync folders (iCloud, OneDrive and any other sync app's folder, as 2.8's `placeOf` checks) are
    detected once at startup**, not every minute. (`paths/sync.rs`)

## spectrum-compile (session 3c, log parser)

28. **Forward search ignores the column**, as 2.8 does. (`synctex/forward.rs`)
29. **Typst diagnostics are also read in the CLI's default human format**; errors with no location
    are dropped, as 2.8 did. (`log_parser/typst.rs`)
30. **A SyncTeX file outside the project gives no jump** (`None` / `OutsideProject`); 2.8 returned an
    absolute path on another drive. 2.8's symlink check isn't needed with that rule. (`synctex/store.rs`)
31. **Constant regexes are built through one helper that may `expect`**, allowed with a reason, since
    a bad constant pattern is a programming error caught by every test run. (`lib.rs`)
32. **New `DiagnosticKind`** (overfull box, undefined reference, missing file …), derived from the
    message, so the UI can group and filter. (`log_parser/tex.rs`)
33. **Legacy SyncTeX cache locations from 1.4.0 and 1.7.0 aren't read**; a recompile rebuilds them.
34. **Test fixture logs are committed** via a `.gitignore` exception (the repo ignores `*.log`).

## spectrum-checkers (session 5b)

35. **Harper lints each paragraph separately and caches by its text**, so an edit re-lints one
    paragraph. A whole-paper Harper pass takes ~80 ms warm; with the cache a 5,000-word paper
    re-checks in ~5 ms after an edit (plan target <15 ms). A never-seen paper takes ~0.5 s and the
    very first check ~0.8 s (dictionary load), both off the UI thread. (`harper.rs`)
36. **Byte offsets everywhere**, not 2.8's UTF-16 offsets; LanguageTool's UTF-16 offsets are converted.
    The editor converts once at its boundary. (`masking.rs`, `languagetool.rs`)
37. **Combining accents aren't blanked as "other script"** (2.8 blanked them), so accented Latin words
    are checked properly; emoji and CJK still are. (`harper.rs`)
38. **Spelling lints carry no suggestions**; `suggest()` runs when the user opens the fix menu, as in
    2.8. (`spelling.rs`)
39. **A LanguageTool failure keeps what was already checked** and reports the failure alongside,
    rather than discarding the whole result. (`harper.rs`, `languagetool.rs`)
40. **Not yet ported**: language detection, downloaded dictionaries, starting a local LanguageTool
    server, ignored-rules files. They come with the editor wiring session (5c) and Settings.

## spectrum-lsp (session 5a)

41. **The server handle keeps each open document's text** so a restarted server gets everything
    re-opened. (`server.rs`)
42. **Restart backoff**: first retry after 500 ms, doubling, at most 3 retries; the count resets after
    60 s of healthy uptime. Requests made mid-restart fail with `NotRunning` instead of waiting;
    document changes are kept and sent on re-open. (`server.rs`)
43. **TexLab completion is turned on**; 2.8 didn't use it, and the plan asks for completion.
    (`settings.rs`)
44. **TexLab refuses a project root containing `[ ] ^ |`**, as 2.8 did (TexLab mis-handles them).

## Update notifier

45. **Root cause of 2.8.1's broken update notice** (see the plan's "Fixes over 2.8.1"): a 24-hour
    on-disk cache of the *answer* hid a release published after the day's check (2.8.1 came out
    11 minutes after the user's check on 28 Nov), failures were cached for a day too, and the link
    relied on the WebView passing `target="_blank"` to the browser. 3.0.0 re-asks every 6 hours,
    retries failures after 30 minutes, shows the notice in the title bar and on Home, adds "Check for
    updates", and opens the release page with the OS's own URL opener.

46. **Saved editor-theme ids `spectrum-light` / `spectrum-dark` mean the new 3.0.0 Spectrum theme**;
    2.8's own colours live on as `spectrum-classic-light` / `spectrum-classic-dark`. So an upgraded
    user sees the new design by default and can pick Classic in Settings, rather than being pinned to
    the old look. **Confirmed by the user, 28 Nov.**

## spectrum-ai providers (session 6a)

47. **The Fast and References roles both read 2.8's single "quick model" settings** (`references*`),
    because 2.8 had one quick model for both. (`roles.rs`)
48. **Effort keeps the providers' 7 levels** (Spectrum's 6 colours plus Minimal, drawn in the Low
    colour). (`presets.rs`)
49. **Reasoning from `<think>` blocks and `reasoning_content` streams as reasoning**; 2.8 dropped it.
    (`provider/chat.rs`)
50. **Tool calls are released when the answer ends**; an answer cut off mid-call is an error rather
    than a half-built call. (`provider.rs`)
51. **Each message keeps the provider's raw reply** to send back next turn, as 2.8's
    `_anthropic`/`_responses` did. (`types.rs`)
52. **OpenAI Responses requests no reasoning summary** (unchanged from 2.8), so OpenAI's reasoning
    shows only if OpenAI sends it. (`provider/responses.rs`)
53. **A failed request is retried only before anything has streamed**; a stream that breaks midway
    reports the error. Not ported yet: `testConnection`, native web search, `Retry-After` dates.

## spectrum-editor core (session 2a)

54. **Spectrum has its own editor element and document core** rather than building on the kit's
    code editor (evidence in `crates/spectrum-editor/DESIGN.md`). The kit's editor is fast (20k-line
    .tex opens in 32–42 ms, ~2 ms per keystroke frame), but it has no view zones for inline diff
    hunks, no modal input or block cursor for Vim, private transactions, only a primary selection,
    literal-only find, no snippets and a single-colour gutter; getting those means forking ~41,700
    lines. The kit still supplies the rope type and the chrome widgets. Our core: open 0.8–0.9 ms,
    keystroke with undo ~1 µs.
55. **All editor offsets are UTF-8 bytes**; UTF-16 only at the LSP and IME boundaries.
56. **CRLF and CR are stored as LF and the file's ending is restored on save**, so no cursor can sit
    inside a CRLF and a CRLF file stays CRLF. (`buffer.rs`)
57. **Linear undo, not an undo tree** (the plan says "undo tree"): groups break after 400 ms, on a
    cursor move, or at the first space after a word. Redo branches are rarely used and a tree
    complicates every other feature. (`history.rs`)
58. **Selections belong to views**, so two panes can show one document with their own cursors.
    (`document.rs`)
59. **Overlapping edits in one transaction are dropped and logged**, not applied in an undefined
    order. (`document.rs`)
60. **Tree-sitter's first parse of a big file (~120 ms) runs off the UI thread** on a rope snapshot;
    later edits reparse incrementally. (for 2b)

## spectrum-compile runner and macOS confinement (sessions 3a, 3b)

61. **Engines manifest keyed by target** (`assets/engines.json`), now including TexLab and Tinymist;
    LanguageTool's download stays with spectrum-checkers.
62. **Cancelling on Windows uses `taskkill /T /F`**, as 2.8 did, rather than a Job Object (the
    sandbox worker uses Job Objects for confined compiles). (`process.rs`)
63. **The caller owns the build folder**, emptied before each compile; the PDF is copied beside the
    source as in 2.8. (`runner.rs`)
64. **Windows "Trust this project" is matched by the folder's creation time.** (`trust.rs`)
65. **Deferred, not dropped** (tracked in FEATURE_PARITY.md): keeping build files between runs, the
    Biber skip, preamble formats, recipes, `\externaldocument`, `\includeonly`, page colour,
    xjyutping, Typst watch mode, Biber download, Tectonic warm-up, mapping Markdown errors back to
    `.md` lines, SVG export, CJK fonts, and 2.8's proxy gate for a confined Tectonic.

## spectrum-ui and the workspace shell (session 1c)

66. **`SidebarTab` colours live in spectrum-theme**, keeping hex values out of the UI crates.
67. **The mockup is scaled ×1.2 to real sizes** (28 px toolbar buttons, 13 px file rows); the
    mockup's 11–12 px text would be too small to work in.
68. **Full tab labels** ("Research", "To-dos") instead of the mockup's "Res." and "To-do".
69. **File dots**: TeX/Typst/Markdown rose, .bib teal, files under `diagrams/` green, others tertiary.
70. **No resting divider between panes**; a handle pill appears on hover.
71. **Home and Projects buttons in the title bar**; room left before Compile for the update pill.
72. **Home design** (the plan has none): one panel with a prism header bar, Flow-blue New button,
    rose folder tiles, `~`-shortened paths; archived projects hidden.
73. **New project uses 2.8's Simple document template**; new file/folder/rename use an inline name
    field instead of a dialog.
74. **One palette for commands and files** (Cmd+Shift+P commands, Cmd+P files), with a dimmed
    backdrop; commands are filtered by the current screen.
75. **Toolbar buttons and Compile report "isn't in this build yet"** until their sessions wire them,
    rather than looking like they work.
76. **Superseded by the user's calm-workspace rule**: the shell's prism Compile button and bright
    toolbar pills are toned down in the follow-up UI session.

## Blueprint update of 29 Nov

77. **Compile uses the labelled Calm Slate `#3b6ea5` / `#4c7fb5`**, not the accent blue the updated
    mockup's CSS paints it with (written spec over the page's own styling, as in decision 12).
78. **Sidebar goes back to 2.8.1's three tabs** (Files, Research, To-dos) with the Outline docked
    bottom-left above Settings, replacing session 1c's four-tab strip (decision 68's "Outline" tab).
79. **Toolbar, sidebar-tab and Tools-tab colours are the blueprint's pastel values exactly**, checked
    by a test against the plan HTML; session 1c's vivid `ToolbarSlot` values are replaced.

## Calm workspace pass

80. **Toolbar buttons have no fill at rest**, a 7% tint on hover and 12% when on, with the blueprint's
    pastel icon colours. Contrast: icons ≥3.08:1 light, ≥5.29:1 dark.
81. **Light-theme tab labels are darkened 25% toward the text colour**: the blueprint's light pastels
    give only 3.1–4.5:1 as text, below the 4.5:1 it asks for. The icon colours stay exact.
82. **Dark-theme Compile keeps the blueprint's `#4c7fb5` with white text at 4.19:1**, the one label
    under 4.5:1, because the blueprint names that colour. If it reads too faint, a slightly darker
    `#4373a8` reaches 4.6:1.
83. **Compiling state**: the button reads "Compiling" with a turning ring; no colour change.
84. **The Outline and Settings docks are honest placeholders** until 2b (outline) and 11a (Settings).

## Windows sandbox worker (session 6d)

85. **No loopback exemption** for AppContainer: it needs admin rights and opens every local port.
    The network gate is proxy variables only in the restricted tier (`network_enforced: false`), and
    AppContainer refuses a gate. (`validate.rs`)
86. **Read-only "runtime" grants (TeX trees) persist** under the capability `spectrumSandboxRuntime`,
    so a TeX tree is stamped once, not per run. (`grant.rs`, `run.rs`)
87. **The restricted tier is Chromium's `USER_LIMITED` token plus low integrity**; it can still read
    anything all users can read. (`win/token.rs`)
88. **Only `.exe` programs run; npm `.cmd` shims become `node.exe` + the script.** (`validate.rs`)
89. **Desktop (UI) limits are dropped with a warning when Spectrum is already inside a job.** (`run.rs`)
90. **`CREATE_NO_WINDOW` instead of 2.8's hidden new console.** A hard-killed worker can leave stale
    ACL entries and its AppContainer profile; the next run cleans what it finds. (`win/process.rs`)

## spectrum-editor syntax (session 2b)

91. **The BibTeX grammar is vendored inside spectrum-editor** (`vendor/`, MIT licence, built by
    `build.rs` + cc) rather than as its own crate. Added to THIRD_PARTY_NOTICES.
92. **A background first parse that finishes after more typing replays those edits** instead of being
    thrown away. (`syntax.rs`)
93. **Scope bars include the `\begin` and `\end` lines** (2.8 drew only the lines between), and depths
    come from the text so they don't jump while the tree reparses. (`scope.rs`)
94. **Outline levels**: `\part` 0 to `\subparagraph` 6; Markdown gets all six levels plus setext headings
    (2.8 had `#`–`####`); LaTeX floats come from the tree, not TexLab. (`outline.rs`)
95. **Outline and folds use a pruned tree walk** (4–13 ms on 20k lines) instead of queries (~50 ms).
96. **Incremental reparse is 0.7 ms**, over the plan's 0.3 ms, still well inside a frame.
97. **`\iff` / `\ifthenelse` aren't folded; a Typst `// TODO` ends at its line.**

## Blueprint second update

98. **Superseded**: 1c's flat file list (decision 4 of 1c, entry 69's file dots) → collapsible folders
    with file-type line icons (session 1f).
99. **The kit's Lucide icons stay as a fallback** for anything the 92 line icons don't cover, so no
    button ever lacks an icon; each use of the fallback is listed in 1f's report.

## spectrum-git (session 8)

100. **Checkpoints stay in 2.8's own `.spectrum/history` format** (manifests, gzipped objects,
     `index.json`), not git: 2.8 never kept checkpoints in git, so existing checkpoints list and
     restore unchanged, and the store works inside sync-app folders. Tested on a hand-made 2.8 project
     with 1.7.0- and 2.8-era checkpoints and a sync-app conflict copy. (`history.rs`)
101. **`.spectrum/settings.json` is committed to GitHub, as in 2.8**: it carries the repo link and
     holds only key *references*, never keys. Checkpoints never include `.spectrum`. (`repo.rs`)
102. **The GitHub token moves into the keystore** (Keychain / DPAPI) under `github`; `github.json`
     keeps only the account. A token 2.8 left in `github.json` is moved on first run. (`github/auth.rs`)
103. **libgit2's own HTTPS is off** (on macOS it needs OpenSSL); a reqwest/rustls transport sends the
     token as a header, never writing it to `.git/config`. Push over real HTTPS is not yet tested
     (fetch is); covered by the hand tests. (`transport.rs`)
104. **A research session changed on both sides keeps this computer's copy.** Templates in the
     settings repo, the 1.10.4 mirror merge base, `computer.json` and pull scheduling are left to
     session 8b.
