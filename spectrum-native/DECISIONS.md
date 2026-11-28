# Decisions log

Calls made where the plan (`../docs/gpui-rewrite-plan.html`) was wrong, out of date or ambiguous.
The user reviews this when 3.0.0 is finished. Newest last. Each entry: what, why, where.

## Standing rules from the user (28 Nov 2026)

- All 17 crates. 3.0.0 is a full release with 2.8 parity. Beta DMGs may be built but aren't tested
  until the whole rebuild is done.
- UI layout and colours come from the plan, not 2.8's code; redesigns are part of the plan. 2.8 is
  the reference for behaviour, formats and edge cases.
- Where the plan is wrong or ambiguous, decide, log it here, report at the end.

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
