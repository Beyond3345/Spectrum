# Feature research

Research done in November 2026 for the update after Spectrum 2.1.0. Each topic has its own report. Nothing here is built yet.

| Report | Topic |
| --- | --- |
| [TYPST_EDITOR_FEATURES.md](TYPST_EDITOR_FEATURES.md) | What would make Spectrum a stronger Typst editor, compared with Tinymist, typst.app, Typsastra, texpile and others |
| [LATEX_TYPST_CONVERSION.md](LATEX_TYPST_CONVERSION.md) | Converting between LaTeX and Typst in both directions, and a converter design |
| [TYPST_STANDARD_NOTES.md](TYPST_STANDARD_NOTES.md) | The decisions behind the Typst house style in [../TYPST_STYLE.md](../TYPST_STYLE.md) |
| [PERFORMANCE_AND_RUST.md](PERFORMANCE_AND_RUST.md) | Where Spectrum spends its time, and whether rewriting parts in Rust is worth it |
| [LIVE_PREVIEW.md](LIVE_PREVIEW.md) | Live preview for LaTeX and Typst: what exists, the options and the open questions, kept for later |

## Shortlisted for the next update

Marked by the user on 3 November 2026, to become the update's plan once every report has been reviewed. The numbers are the ranks in TYPST_EDITOR_FEATURES.md.

1. **Tinymist as the Typst language server:** completion for the document's own functions and packages, hover, go to definition, rename, errors as you type, formatting with typstyle and a word count. Downloaded on demand with a pinned checksum, like the Typst versions, rather than bundled.
   - **Exact jumps between the PDF and the source, both ways,** replacing today's word matching. Tinymist's jumps come from its preview engine, not the language server alone, so it runs hidden, with no live preview shown. A double click in Spectrum's own PDF sends the page and position to it and gets the exact place in the source, and the reverse scrolls Spectrum's PDF. This works only when the project's Typst version matches the one inside Tinymist, so the layouts agree; other projects keep word matching. Driving the preview engine hidden beside Spectrum's PDF is not proven yet, so a short test comes first.
2. **Errors marked in the text:** Typst's errors underlined at their line and column in the editor, not only listed in Logs.
3. **PNG, SVG and HTML export, and PDF/A and PDF/UA:** offered from the built-in Typst, which already supports them.

4. **Typst Universe templates and packages, kept separate:** Spectrum's own Typst templates stay the standard on offer in the gallery. Each LaTeX template with a Typst equivalent gets one, following [../TYPST_STYLE.md](../TYPST_STYLE.md); today only document, report, letter and CV exist in Typst, so maths notes, electronics notes, coding report and slides would be added. Typst Universe is a separate section the user opens on purpose. It works from the package index (2.4 MB, 270 KB as downloaded), cached for offline use. A template downloads only when chosen, and a package only when a document imports it.

5. **Typst templates follow the standard:** the four existing Typst templates (document, report, letter, CV) brought into line with [../TYPST_STYLE.md](../TYPST_STYLE.md), as the LaTeX templates were with LATEX_STYLE.md. The new ones in item 4 are written to it from the start.
6. **Insert figure's Typst sub-figures get their own labels:** each image in a Typst sub-figure set gets a label, so `@fig:measured` prints "Figure 1a", using the standard's sub-figure definition rather than (a) and (b) written as text.
7. **The References tool names a new bibliography `refs.bib` in Typst projects:** when a Typst project has no bibliography yet, it creates `refs.bib`, as the standard and the Typst template use, rather than `references.bib` (`pickBibTarget` in `referenceService.js`).

8. **Performance fixes,** the top five from [PERFORMANCE_AND_RUST.md](PERFORMANCE_AND_RUST.md), all in JavaScript:
   - The compiled PDF sent to the editor as binary, or decoded with the browser's built-in `Uint8Array.fromBase64`, not slowly from base64: 0.12 to 0.76 s saved on each large compile.
   - A project's text files read in one request when it opens, not one request each: 0.8 s saved on an 1,800-file project, over 4.5 s on very large ones.
   - Checkpoint fingerprints remembered by file size and date, not every file hashed one at a time on each compile: about 0.45 s saved per checkpointed compile.
   - No redraw of the editor page and no fresh spelling scan of the whole document on every keystroke: about 20 ms saved per key, and a 65 ms stall on long files.
   - Typst kept running between compiles rather than started afresh each time: a 302-page recompile falls from 1.53 s to 0.23 s. Tinymist (item 1) does this anyway; `typst watch` is the fallback for projects whose Typst version Tinymist does not match.
9. **Mac releases for Apple silicon only:** Intel Macs are dropped from every future release, decided by the user on 3 November 2026. The Mac build becomes `aarch64-apple-darwin` rather than universal, which also makes the app about 252 MB smaller (537 MB today). The DMG name, the README's requirements and install steps, the release checks (`lipo` shows `arm64` only) and the release notes change to match, and the notes say plainly that Intel Macs stay on 2.1.0.
10. **A LaTeX and Typst converter,** as designed in [LATEX_TYPST_CONVERSION.md](LATEX_TYPST_CONVERSION.md): "Convert to Typst project…" and "Convert to LaTeX project…" in the project menu, each making a new project and leaving the original as it is. It works without AI for documents written to [../LATEX_STYLE.md](../LATEX_STYLE.md) and [../TYPST_STYLE.md](../TYPST_STYLE.md). pandoc reads the prose, Spectrum's own rules handle references, maths, units, tables, pictures, listings, pseudocode and theorems, and code checks that every label, reference, citation, numbered equation and float survived. Pictures are compiled to PDF with their source kept beside them. In the report's order:
    - LaTeX to Typst first (3 to 4 weeks).
    - Typst to LaTeX on pandoc's reader with a Spectrum pre-pass (2 to 3 weeks), then Typst's own parser, `typst-syntax`, in place of pandoc's Typst reader (3 to 4 weeks).
    - Round trip details: the report class, title pages, roman page numbers and picture sources restored (1 to 2 weeks).
    - Last and optional, AI tidying of flagged regions only, one region at a time with a replace or skip answer that code checks (1.5 to 2 weeks). It is offered only after its success rate on DeepSeek V4.1 Flash and one local model has been measured.
    - Before phase 1, the LaTeX side is checked with Spectrum's own Tectonic and Biber 2.17, since the research compiled it with TeX Live.

Left out: the visible live preview (rank 2), for both Typst and LaTeX. The user will come back to it later; [LIVE_PREVIEW.md](LIVE_PREVIEW.md) keeps what is known so far. Typst's exact jumps are kept, as part of item 1.
