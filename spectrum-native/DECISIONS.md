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
