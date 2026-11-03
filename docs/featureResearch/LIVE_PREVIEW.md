# Live preview for LaTeX and Typst

3 November 2026. A starting point for later work, not a plan: the user has left live preview out of the next update and will come back to it. Unlike the other reports here, this one has not been researched in depth. What is verified and what is not is marked.

## What a live preview means here

The PDF beside the editor updates as you type, or within a moment of a pause, for both LaTeX and Typst, with exact jumps between the PDF and the source in both directions.

## What Spectrum already has

| Piece | LaTeX | Typst |
| --- | --- | --- |
| Update after a pause | Yes: Settings › Auto compile after a pause (off by default), the same setting for both | Yes, the same setting |
| Faster draft compiles | Yes: draft mode draws images as boxes (`DRAFT_IMAGES` in `compileService.js`) | Not needed |
| Exact jumps between PDF and source | Yes, through SyncTeX (`apps/backend/src/services/synctex.js`) | No: Typst has no SyncTeX, so a double click matches words. Exact jumps through Tinymist are shortlisted for the next update (README, item 1) |
| Speed of one compile | Usually one to several seconds, longer with Biber or TikZ | 0.34 to 0.38 s for the Typst template, of which about 0.3 s is Typst rescanning system fonts (measured; 0.06 s with `--ignore-system-fonts`) |

## Ways to get there

### Typst

- **Tinymist's preview** (verified in [TYPST_EDITOR_FEATURES.md](TYPST_EDITOR_FEATURES.md), section 4.2): an incremental SVG preview served on 127.0.0.1, which previews unsaved edits and jumps both ways by source span. Apache 2.0. Medium to large effort. It would build on the Tinymist language server already shortlisted.
- **A cheaper step:** keep one `typst watch` process running instead of a new process for each compile. [PERFORMANCE_AND_RUST.md](PERFORMANCE_AND_RUST.md) measured a 302-page recompile falling from 1.53 s to 0.23 s.

### LaTeX

LaTeX cannot re-lay out a document incrementally the way Typst can, so the options are about making each compile faster, or a different engine.

| Approach | What it gives | Effort | Status |
| --- | --- | --- | --- |
| Faster auto compile: a precompiled preamble (a format file, so packages are not loaded again on every run), compiling only the chapter being edited (`\includeonly`), and draft mode while typing | Updates within about a second after a pause for most documents, with every engine, and SyncTeX jumps stay exact | Medium. A precompiled preamble needs care with packages that dislike it | Not researched; my assessment |
| [TeXpresso](https://github.com/let-def/texpresso) | True as-you-type updates, and errors reported at once. It is a driver plus a modified Tectonic, which is the engine Spectrum already bundles | Large | Verified only that it is MIT licensed ([Gitee mirror](https://gitee.com/wpttt/texpresso), [Nix package](https://mynixos.com/nixpkgs/package/texpresso)), has editor support for Neovim, VS Code and Emacs, and was last pushed in April 2026 ([gittrend](https://gittrend.io/repo/let-def/texpresso)). Which systems it runs on, and Windows in particular, is not verified |
| Leave auto compile as it is, and make it easier to find | Nothing new | Small | |

A suggested pairing: Tinymist's preview for Typst, and the faster auto compile for LaTeX. Both would show an updating PDF beside the editor with exact jumps, through Tinymist for Typst and SyncTeX for LaTeX.

## Related findings

- Sending the PDF to the editor as binary rather than base64 text (PERFORMANCE_AND_RUST.md, improvement 1) saves 0.12 to 0.76 s on each large compile. Any live preview refreshes faster with it, LaTeX included.
- Caching Typst's font scan would cut most of a Typst compile on its own.

## Questions for the research

1. Does TeXpresso build and run on macOS (Apple silicon and Intel) and Windows, and with which Tectonic version? Can it share Spectrum's Tectonic bundle and cache?
2. How fast is a precompiled-preamble compile of each Spectrum LaTeX template with pdfLaTeX, XeLaTeX, LuaLaTeX and Tectonic? Which packages in the templates break with a format file?
3. What do Overleaf, LaTeX Workshop and other editors do for fast or live LaTeX preview?
4. Can Tinymist's preview be shown in Spectrum's PDF pane, or must it be its own SVG view?
5. How should a live preview treat Biber, TikZ and other slow steps: skip them while typing and run them on a full compile?
