# LaTeX and Typst conversion

3 November 2026. This report asks whether Spectrum 2.1.0 can convert a document between its standard LaTeX ([../LATEX_STYLE.md](../LATEX_STYLE.md)) and its standard Typst ([../TYPST_STYLE.md](../TYPST_STYLE.md)) in both directions, with or without an AI model. It surveys every existing converter, reports experiments run on the built-in templates and two stress documents, and proposes a design. Nothing in it has been built into Spectrum. The prototype scripts live in the scratch folder named in [Appendix B](#appendix-b-files-and-how-to-rerun).

## 1. Summary and verdict

**A converter without AI is achievable in both directions for documents written to Spectrum's two style guides.** It is not achievable for arbitrary LaTeX or arbitrary Typst, and it should not try to be. The house styles fix the package set and the way each construct is written, so every construct in them has either a deterministic mapping or a deterministic fallback (a compiled picture with its source kept beside it).

| Direction | Without AI | Evidence (measured, section 5) |
| --- | --- | --- |
| LaTeX to Typst | **Yes**, for house-style LaTeX | A prototype built on pandoc plus Spectrum passes (about 630 lines of JavaScript) compiled all 9 LaTeX documents with no errors (the Beamer slides only as a flagged plain document). It kept 57 of 57 labels, 12 of 12 citations and 62 of 62 cross-references, all as live Typst references. Raw pandoc compiled 6 of 9, turned 61 of 62 cross-references into fixed text or broken links and lost all 8 pictures without a warning. tylax compiled 0 of 9. |
| Typst to LaTeX | **Yes**, for house-style Typst, but not on pandoc's Typst reader alone | The prototype (about 575 lines) compiled all 5 Typst documents with XeLaTeX and Biber with no errors and no undefined references, keeping 20 of 20 labels, 20 of 20 references and 6 of 6 citations. Raw pandoc could not read the stress document at all (it imports a package) and broke every reference whose label has a colon, which is every Spectrum label. tylax compiled 2 of 5. |
| LaTeX to Typst to LaTeX | **Yes for meaning, no for exact layout** | With the prototype all 9 round trips compiled with 62 of 62 references, 57 of 57 labels, 12 of 12 citations and 9 of 9 numbered equations intact. siunitx quantities and `S` column tables were recovered, and 91 to 100 per cent of the words of each prose document came back. Raw pandoc kept 0 of 62 references and 0 of 9 equation numbers, and failed outright on 1 of 9. |

**AI clean-up is not needed for house-style documents in either direction.** It earns its place only on regions the converter flags: constructs outside the house subset (an unknown package or environment), layout pages without a rule yet (a title page, a CV header) and, optionally, redrawing a TikZ picture in CeTZ. A weak model such as DeepSeek V4 Flash can do the first two safely only under a protocol in which the model edits one small region at a time in a strict format and code checks every edit (section 9). The third should stay manual.

**Recommendation.**

1. Build a deterministic converter as a backend service that drives pandoc through its JSON format, with Spectrum passes before and after it that write [LATEX_STYLE.md](../LATEX_STYLE.md) and [TYPST_STYLE.md](../TYPST_STYLE.md) directly, reusing the table and figure writers Spectrum already has in `apps/frontend/src/editor/floats.ts`.
2. Validate every conversion with code: it compiles, and the labels, references, citations, numbered equations, floats and words are all still there.
3. Offer it as "Convert to Typst project…" and "Convert to LaTeX project…" in the project menu, next to the existing "Convert to LaTeX project…" for Markdown. The original project is never changed.
4. Ship LaTeX to Typst first (3 to 4 weeks), then Typst to LaTeX on pandoc's reader with a Spectrum pre-pass (2 to 3 weeks), then replace that reader with Typst's own parser, `typst-syntax` (3 to 4 weeks). Add the optional AI clean-up last (1.5 to 2 weeks).

### Claims tested

| Claim | Verdict | Why |
| --- | --- | --- |
| A converter without AI is too hard | **Wrong** for house-style documents, **right** for arbitrary ones | Section 5: 13 of 14 documents converted and compiled with no AI; the fourteenth, the Beamer slides, compiled but is out of scope. Arbitrary LaTeX is a macro language and Typst is a programming language, so no static converter covers either completely. |
| So code should do a rough pass and AI should clean up | **Wrong as a default** | The rough pass is the problem: raw pandoc loses references, numbering, pictures and tables silently, and no weak model can reliably notice what is missing. A careful deterministic pass plus validators leaves almost nothing to clean. |
| Round-tripping is realistic | **Right for meaning, wrong for layout and drawings** | References, labels, citations, units, tables, theorems and pseudocode came back. Title pages, roman page numbers, the report class and TikZ source did not, though each has a deterministic fix (section 5.3). |
| AI clean-up is needed in one direction more than the other | **Neither, for house documents** | Where AI helps at all it is LaTeX to Typst of foreign LaTeX, because LaTeX in the wild varies far more than Typst does. |
| pandoc can be the base in both directions | **Right for reading LaTeX, wrong for reading Typst** | pandoc 3.12.1 and 3.13 both fail on any Typst document that imports a package, read `@fig:x` as a citation of `fig`, drop citation supplements such as `[p.~12]` and freeze `datetime.today()` (section 4.1). |
| The cleaning model may be weak, so the instructions must be explicit and checkable | **Right** | The protocol in section 9 never depends on the model being right: code accepts or rejects every edit. |

Some of the starting context was also not quite right. pandoc is not bundled with Spectrum; the pinned 3.12.1 is downloaded on request from Settings › Engines › Markdown (`apps/backend/src/data/engines.json`, `pandocPath` in `engineService.js`). There is no `skills/import-refine` in Spectrum; that skill is Oleafly's (`Oleafly-main/src-tauri/resources/skills/import-refine`). Spectrum has no Word import: `services/transferAgent/` moves a LaTeX project into another template, or rebuilds a PDF through an external parser (Mathpix, MinerU and others), and Word appears only as an export from Markdown. texpile is an AGPL editor, not a converter, and the Typst package index has no package named `tex`.

## 2. Method and conventions

- **Date and machine.** Everything was run on 3 November 2026 on the user's Mac (Apple silicon), in a scratch folder. Nothing in the repository was changed apart from this file.
- **Tools.** Typst 0.15.1, the bundled `src-tauri/binaries/typst-aarch64-apple-darwin`. pandoc 3.12.1, the pinned version, downloaded from GitHub into scratch; its SHA-256 matched `engines.json`. pandoc 3.13 (26 October 2026, the newest) was also downloaded to recheck pandoc's faults. tylax 0.3.8, built from crates.io. tex2typst 0.6.2 from npm (`--ignore-scripts`). mitex 0.2.7, unify 0.8.1 and subpar 0.2.2 from Typst Universe into a scratch package cache. Ghostscript 10.07.1 for PDF text and page images.
- **LaTeX engine.** XeLaTeX and Biber 2.22 from TeX Live through `latexmk`. Tectonic 0.17.0 was tried first and failed every document with a bibliography: it ran the system's Biber 2.22 against its own biblatex 3.17 ("Found biblatex control file version 3.8, expected version 3.11"), which is why Spectrum pins Biber 2.17 for Tectonic. Tectonic is XeTeX underneath, so XeLaTeX is a fair stand-in. Tectonic did compile the standalone composer diagram.
- **Corpus.** The 8 LaTeX templates (simple document, report or thesis, maths notes, electronics notes, coding report, CV, letter, slides), the 4 Typst templates (document, report, letter, CV) and two stress documents written for this study. The LaTeX one is in house style and covers `align`, `cases`, three kinds of matrix, `\mathbf` and `\mathrm` subscripts, `\operatorname`, `\DeclareMathOperator`, siunitx `\qty`, `\num`, `\unit`, `\ang` and `\SI`, an `S` column table with `\multicolumn`, `\multirow` and `\cmidrule`, `threeparttable` and `makecell`, `tabularx`, sub-figures, pgfplots, TikZ, a composer diagram through `\includestandalone`, cleveref (including two labels in one `\cref`), `\textcite`, `\parencite` with a page, the natbib forms, `\eqref`, footnotes, links, lists, the full theorem set, `lstlisting` with captions, `algpseudocode`, five `\newcommand` macros, `\input` and `\include`. The Typst one uses unify and subpar, user `#let` macros, theorem helpers, a merged-header table and a code figure. It was written before TYPST_STYLE.md appeared, so the house Typst constructs (typed units, `subfigure`, the theorem set, pseudocode as a list) were tested through the round trip, whose middle step writes them.
- **What was measured.** Whether it compiles, and how many errors. Labels kept, live cross-references (references that still point at a label rather than fixed text) and citations, counted from the output source so that a document that does not compile is still counted. Numbered equations. **Word coverage**: the share of the original PDF's words, repeats included and order ignored, that the converted PDF still has; it measures lost content, not layout. Page counts, and for LaTeX against LaTeX a mean grey-level difference per page at 40 dpi (0 is identical, 255 is inverted). Pages were also looked at side by side.
- **Limits.** The prototype was refined on this same corpus, so its numbers are an upper bound until it meets documents it has not seen. Word coverage undercounts prose: the words it misses are mostly maths extracted differently from the two engines, ligatures (`efficiency` read as `e iciency`), hyphenation and the word "Chapter".
- **AI.** No free or local model was available. LM Studio is installed with an empty models folder and Ollama is not installed. The Hugging Face cache holds only Qwen3-ASR-1.7B, a speech model. No paid API was called. The clean-up protocol's checking side was tested with scripted answers instead (section 9.6).

## 3. What Spectrum already has

| Piece | Where | Use for conversion |
| --- | --- | --- |
| pandoc, pinned 3.12.1, minimum 3.8.3 for Typst | `apps/backend/src/data/engines.json`, `engineService.js` (`pandocPath`, `PANDOC_MINIMUM`) | The reader and writer for prose. Downloaded on request, not bundled. |
| Markdown to LaTeX and Typst through pandoc | `services/markdownService.js` | The pattern to follow: pandoc as a subprocess with `--sandbox`, and `vettedMarkdown`, which already edits pandoc's JSON in Node before writing. |
| A new project made from a document | `POST /api/projects/:id/export/latex` in `routes/projects.js`; "Convert to LaTeX project…" in the project menu (`convertMarkdownToLatex` in `apps/frontend/src/app/EditorPage.tsx`) | The route, the confirm dialog and the menu entry to copy. |
| Template transfer with an AI model | `services/transferAgent/` (LangGraph: `applyTransfer`, `fixCompile`, `compile`, `finalize`) and `routes/transfer.js` | Its compile loop, job store and step API carry over. Its prompts ask the model to rewrite the whole file, which is exactly what a weak model cannot do safely. |
| Snapshots and checkpoints | `writeFileWithSnapshot` in `transferAgent/utils.js` (`.spectrum/agent-runs/<jobId>/`), `createVersion` in `versionService.js` | Undo for the AI step. |
| Reviewed agent edits | `agentService.js` (`apply_patch`, `propose_patch`), `ReviewChangesSheet` and `SplitDiffView` in the frontend | Showing the AI step's changes before they are kept. |
| House writers for tables and figures in both formats | `apps/frontend/src/editor/floats.ts`: `TableModel`, `tableLatex`, `tableTypst`, `figureTypst`, `figureSetTypst`, `figureTypstInclude`, `numberFormat`, `typstMarkup` | A table converts by parsing it into a `TableModel` and writing it with the other format's writer, so the result is house style by construction, `S` columns and their `table-format` included. |
| Includes, labels and Typst queries | `inlineInputs` in `utils/texUtils.js`; `documentLabels` (from `.aux`) in `statsService.js`; `typstElements` in `typstService.js` (`typst eval`, new in Typst 0.15) | Safe `\input` resolution and the label checks of the validator. |
| Diagram composer files | `diagrams/<name>.tex`, `.typ` or `.mmd`, ending with `% spectrum-diagram v1 <model> <hash>` (`apps/frontend/src/diagram/fileFormat.ts`) | The TikZ mode and the fletcher mode share one model (`modes/fletcher/index.tsx` imports `TikzModel` from `modes/tikz/code.ts`), so a composer flowchart can be written again in the other language exactly. circuitikz, pgfplots, tikz-cd, structures, vectors and form have no Typst writer. |
| Models | `services/providers.js`, `llmService.js` | DeepSeek (`deepseek-flash`), OpenRouter (`deepseek/deepseek-v4.1-flash`) and a local Ollama preset already exist, and `missingKey` lets a local `http://` server run without a key. |

## 4. Existing routes

### 4.1 Comparison

| Route | Version (date) | Licence | Kind | What it gets right | What it gets wrong (measured unless marked) |
| --- | --- | --- | --- | --- | --- |
| **[pandoc](https://github.com/jgm/pandoc/releases)**, LaTeX reader to Typst writer | 3.12.1 (8 Oct 2026, pinned); 3.13 (26 Oct 2026) rechecked | GPL-2.0-or-later | Full documents, both directions; a separate program | Reads real-world LaTeX well: expands `\newcommand` macros, follows `\input` and `\include`, keeps citations (`\textcite` becomes `#cite(<k>, form: "prose")`), footnotes, links, lists and simple tables. Converts siunitx to text. Its JSON AST keeps what a filter needs: each `\cref` as a link with `reference-type` and `reference`, display maths with its `\label`, theorem environments as `Div`s and listing options as attributes. | Every `\cref` becomes fixed text such as `#link(<ch:background>)[2]`, or `[\[tab:seasons\]]` when it cannot count; two labels in one `\cref` make an invalid label. Equation numbers vanish (no numbering is set). TikZ, pgfplots and `\includestandalone` become an empty `#figure([])`, and circuitikz becomes its own source printed as text. siunitx's `\decibel` comes out as "db". An `S` column table becomes a paragraph of raw cells. `\multirow` is ignored and `\cmidrule(lr)` becomes a row reading "2-3". `\makecell` splits a cell into two rows. Listing captions and labels, and all of `algpseudocode`, are lost. `vmatrix` becomes `mat(delim: "||")`, which does not compile (still in 3.13). Page is US Letter with 1.25 in margins and `region: "US"` (still in 3.13), and the bibliography has no style, so Typst prints IEEE numbers instead of APA. |
| **[pandoc](https://github.com/jgm/pandoc/releases)**, Typst reader to LaTeX writer | 3.12.1; 3.13 | GPL-2.0-or-later | As above | Evaluates Typst through its own Haskell implementation, [typst-hs](https://hackage.haskell.org/package/typst) (BSD-3-Clause, 0.9.0.1, March 2026), so a user's `#let` macros expand. Reads tables with `colspan` and `rowspan`, figures, images, maths, lists, emphasis and `form: "prose"` citations (since 3.12). | typst-hs targets Typst 0.13 and calls its own support partial, while Spectrum runs 0.15.1. Fails on a document that imports a package: it looks only in Typst's default folders, not in `TYPST_PACKAGE_CACHE_PATH`, and once pointed at the package it could not evaluate unify's code. Reads `@fig:example` as a citation of `fig` followed by the text ":example" (still in 3.13). Drops citation supplements: `@Lamport1994[p.~12]` and `#cite(..., supplement:)` lose the page (still in 3.13). Labels come out as `\phantomsection\label{...}` outside the float, so `\ref` would number the section. References become `\hyperref[x]{[x]}`. Drops `table.hline`. Turns `#pagebreak()` into a centred rule. Evaluates `datetime.today()` once, in UTC. Reads its own Typst output wrongly for 1 of 9 documents ("Content does not have a method body"). |
| **[tylax](https://github.com/scipenai/tylax)** (`t2l`) | [0.3.8](https://crates.io/crates/tylax) (crates.io); [announced](https://forum.typst.app/t/tylax-open-source-bidirectional-latex-typst-converter-for-full-documents-ast-based-cli-wasm/7547) 5 Jan 2026 | Apache-2.0 | Full documents, both directions, Rust CLI, WASM and Python; parses with mitex-parser and typst-syntax | Real `@label` references; numbered equations; appendices; `\multicolumn` and `\multirow`; a simple TikZ flow became a rough CeTZ canvas; `\norm` and `\xrightarrow` mapped well. | 0 of 9 LaTeX documents and 2 of 5 Typst documents compiled. Drops `\bigl[ ... \bigr]` and `\Bigl( ... \Bigr)` delimiters, changing meaning (`\lim (1 + 1/n)^n` became `lim 1 + 1/n^(n)`); maps `pmatrix` to `matrix` and Typst `EE` to `\exists`. Does not follow `\input` or `\include`, printing "sections/units" as text. Leaves `\pagenumbering{alph}` as the word "alph". Renames `fig:x` to `fig-x`. Emits no bibliography. Writes LaTeX tables with vertical rules and `\hline`, and dropped the minus from `-5.4`. Uses polylux 0.3.1, which no longer compiles on Typst 0.15. |
| **[tex2typst](https://github.com/qwinsi/tex2typst)** | [0.6.2](https://www.npmjs.com/package/tex2typst) (npm, 14 Jun 2026) | Apache-2.0 since 0.3.15, GPL-3.0 before | Maths only, both directions, JavaScript | The cleanest Typst maths of all routes: `eta_"ref"`, `op("rank")`, `RR`, `(mod m)`, `mat(delim: "|", ...)`, `[1 - ...]` for `\bigl[`. Runs in Node, so it fits Spectrum's backend. Accepts zero-argument custom macros. | Does not know siunitx, `\coloneqq`, `\xrightarrow` or `\left\lVert`. Writes `R_\mathrm{in}` as `upright(i n)`. Writes `n/2` as `n \/ 2`, which its own Typst to TeX direction then cannot read. |
| **[mitex](https://github.com/mitex-rs/mitex)** | [0.2.7](https://typst.app/universe/package/mitex) (7 Apr 2026) | Apache-2.0 | A Typst package (WASM plugin) that renders LaTeX maths inside Typst at compile time; `mitex-convert` returns Typst code | 150 of 156 snippets rendered. Lets a Typst document keep LaTeX maths as it is. | Not a converter: the source stays LaTeX, and it needs a package download, which TYPST_STYLE.md forbids outside `diagrams/`. Does not know siunitx. Text mode is basic (no figures, algorithms or description lists). |
| **[typst-syntax](https://crates.io/crates/typst-syntax)** | 0.15.1 (17 Jul 2026) | Apache-2.0 | Typst's own parser as a Rust crate | Parses exactly what Spectrum's Typst compiles, with spans, without evaluating anything. | A building block, not a converter. |
| **[Typst](https://github.com/typst/typst)** itself | 0.15.1 | Apache-2.0 | `typst eval` returns the evaluated document as JSON | Tested: headings, labels, `ref` targets, `cite` keys and forms, figures, tables, block and inline equations with structured maths (`frac`, `attach`, `mat`, `cases`, `lr`, `op`, `accent`), with packages and macros evaluated by the real compiler. Typst 0.14 and later also include PDF files as images, which the TikZ fallback relies on. | Maths styles are opaque: `bold`, `upright`, `bb` and `cal` all serialise as `{"func": "styled", "styles": "styles(..)"}`, so the evaluated tree alone cannot write `\mathbf` or `\mathbb`. |
| [cmarker](https://typst.app/universe/package/cmarker), [tidy](https://typst.app/universe/package/tidy) | 0.1.10, 0.4.3 | MIT | Typst packages | cmarker renders Markdown inside Typst; tidy documents Typst code. | Neither touches LaTeX. No package named `tex` exists among the 1,727 in the [package index](https://packages.typst.org/preview/index.json) on 3 November 2026; the nearest is [texst](https://typst.app/universe/package/texst) 0.1.2, LaTeX-like styling. |
| Smaller tools | [tex2typst-rs](https://github.com/Unpredictability/tex2typst-rs), [tex2typst-py](https://pypi.org/project/tex2typst/), [typsytex](https://pypi.org/project/typsytex/), [Image2Typst](https://github.com/Wellshh/Image2Typst) | various | Maths fragments, OCR | | Not tested: maths-only ports or wrappers of the above, or OCR from images. |
| [texpile](https://github.com/texpile/texpile) | | AGPL-3.0 | A desktop editor | | Not a converter. Its code cannot be reused in an MIT app. |
| Web and commercial (benchmark only) | tylax demo (convert.silkyai.cn), [tex2typst web app](https://qwinsi.github.io/tex2typst-webapp/), [MiTeX demo](https://mitex-rs.github.io/mitex/), [Mathpix](https://mathpix.com/docs/mpxpy/formats) | various | | The three demos front the libraries above. | Mathpix documents docx, md and mmd output, not Typst. Chat assistants were not tried, because that would need paid calls. |

**Maturity, in short.** pandoc's LaTeX reader is mature and widely used. Its Typst reader rests on typst-hs, which describes its own support as partial and targets Typst 0.13. tylax is young: 0.3.x, announced in January 2026, about 500 GitHub stars. tex2typst and mitex are focused on maths and active (tex2typst 0.6.2 in June 2026; mitex first published on Typst Universe in December 2023 and at 0.2.7 since April 2026). typst-syntax is part of Typst itself and moves with each Typst release.

### 4.2 Maths on its own

The 156 maths snippets of the LaTeX corpus (139 inline, 17 display) were each converted and compiled on their own in Typst 0.15.1. The stress document's five macros were expanded first, as a Spectrum pre-pass would, and `align` bodies were wrapped in `aligned` for the maths-only tools.

| LaTeX to Typst | Compiled | Fails on |
| --- | --- | --- |
| pandoc 3.12.1 (texmath) | 154 of 156 | `vmatrix` and `\Call` from pseudocode |
| tylax 0.3.8 | 152 of 156 | `\coloneqq`, `47e3` in maths, `\Call`. Compiled snippets include silent errors: dropped `\bigl[`, `\Bigl(` |
| mitex 0.2.7 | 150 of 156 | siunitx (5), `\Call` |
| tex2typst 0.6.2 | 146 of 156 | siunitx (5), `\coloneqq` (2), `\left\lVert`, `\xrightarrow`, `\Call` |

The 146 snippets tex2typst wrote were then converted back to LaTeX and compiled with XeLaTeX.

| Typst to LaTeX | Compiled | Same as the original after normalising spaces and braces |
| --- | --- | --- |
| pandoc 3.12.1 (Typst reader) | 146 of 146 | 113 |
| tylax 0.3.8 | 142 of 146 | 98 (and `pmatrix` came back as `matrix`, `EE` as `\exists`) |
| tex2typst 0.6.2 (`typst2tex`) | 141 of 146 | 102 (cannot read its own `\/`) |

**Conclusion for maths:** maths is the easy part. Use tex2typst for LaTeX to Typst, after a Spectrum pass that expands the document's macros and maps siunitx, `\coloneqq`, `\xrightarrow` and `\mathrm{word}`, with pandoc's maths as the fallback when tex2typst throws. For Typst to LaTeX, pandoc's reader was the most faithful. Compile success alone hides tylax's dropped brackets, so the validator also compares delimiter counts.

## 5. Experiments on whole documents

Three routes were run on every document: raw pandoc (`pandoc -s`), tylax (`t2l -f`) and the Spectrum prototype (`spx_l2t.mjs` and `spx_t2l.mjs`). The prototype writes what TYPST_STYLE.md and LATEX_STYLE.md ask for. An earlier version that wrote units with the unify package also compiled all 9 LaTeX documents; it was changed when TYPST_STYLE.md settled on typed units.

### 5.1 LaTeX to Typst

| Document | pandoc: compiles | pandoc: live refs | tylax: compiles | Prototype: compiles | Prototype: labels | Prototype: live refs | Prototype: citations | Word coverage (pandoc, prototype) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Simple document | yes | none to keep | no (5 errors) | yes | none | none | 2 of 2 | 0.93, 0.99 |
| Report or thesis | no (2 errors) | 0 of 10 | no (3) | yes | 11 of 11 | 10 of 10 | 3 of 3 | none, 0.91 |
| Maths notes | yes | 0 of 7 | no (1) | yes | 7 of 7 | 7 of 7 | none | 0.76, 0.79 |
| Electronics notes | yes | 0 of 10 | no (1) | yes | 6 of 6 | 10 of 10 | none | 0.75, 0.83 |
| Coding report | no (4) | 0 of 8 | no (1) | yes | 7 of 7 | 8 of 8 | none | none, 0.85 |
| CV | yes | none | no (6) | yes | none | none | none | 0.95, 1.00 |
| Letter | yes | none | no (1) | yes | none | none | none | 0.98, 0.98 |
| Slides (Beamer) | yes | none | no (1) | yes, flagged | none | none | none | 0.48, 0.54 |
| Stress document | no (1) | 1 of 27 | no (8) | yes | 26 of 26 | 27 of 27 | 7 of 7 | none, 0.85 |
| **Total** | **6 of 9** | **1 of 62** | **0 of 9** | **9 of 9** | **57 of 57** | **62 of 62** | **12 of 12** | |

What the prototype adds to pandoc, each a deterministic rule:

- **References.** pandoc's reference links become `@label`; `\cref{a,b}` becomes `@a and @b`; references inside captions are converted before pandoc sees them.
- **Maths.** tex2typst on the TeX that pandoc keeps in each `Math` node, after expanding the document's macros. Numbered environments become `$ ... $ <eq:x>`; unnumbered displays become `#math.equation(block: true, numbering: none, ...)`.
- **Units.** siunitx becomes typed text as TYPST_STYLE.md's table writes it: `4.7~kΩ`, `13~V/µs`, `±15~V`, `$47 times 10^(3)$~Ω`, `7,790`, `22.5°`, `65~°C`, `19.0~%`, `9.81~m/s²`. Inside maths the text goes in `#[...]`.
- **Tables.** A small parser reads `tabular` and `tabularx` (column spec with `S[...]`, `\multicolumn`, `\multirow`, booktabs rules, `\cmidrule`, `\makecell`, `\tnote`, `threeparttable` notes) and writes the house Typst table: `stroke: none`, `table.hline` at 0.08em and 0.05em, `table.header` holding every header row, `table.cell(colspan:, rowspan:)` and comma-grouped numbers right aligned.
- **Pictures.** Each `tikzpicture` and `circuitikz` is wrapped in a standalone document with the preamble's drawing packages, compiled to PDF and included with `image("/diagrams/converted-N.pdf")`; `\includestandalone{diagrams/amp}` uses the composer's `amp.pdf`.
- **Theorems, proofs and solutions** become the house theorem set (`#theorem[...] <thm:x>`, `#solution[...]`), numbered per section.
- **Listings** become a `#figure` around a fenced block with its language, caption and label, inside the house code box. `\lstinline` becomes inline raw. pandoc calls `language=C` `objectivec`, so the listings option is used rather than pandoc's class.
- **Pseudocode** becomes the house numbered list in a figure of kind `"algorithm"`: `\Require` and `\Ensure` become **Input:** and **Output:**, blocks indent with `#h(1.5em)`, `\Comment` becomes `#h(1fr) $triangle.r$ ...` and `\Call` becomes small capitals.
- **Sub-figures** become house `#subfigure` panels in a grid, so `@fig:measured` prints "Figure 1a".
- **Structure.** `\appendix`, `\tableofcontents`, the lists of figures and tables, `\printbibliography` (as `#bibliography("refs.bib", style: "apa")`, with the `.bib` copied to `refs.bib`), the abstract and `\hfill` (as `#h(1fr)`) are all written in Typst. The TYPST_STYLE.md preamble comes first, with its group headings and comments. It numbers by section when the LaTeX asks for it, and gives level 1 headings the Chapter supplement in a report.

What still needed a person after the prototype, from looking at every page:

| Document | Left to fix | Rule possible? |
| --- | --- | --- |
| Report or thesis | The title page lost its centring, sizes and spacing; roman page numbers for the front matter were dropped. | Yes: `titlepage` with `\vspace`, `\vfill` and size commands maps to `#page` with `#v` and `#text(size:)`; `\pagenumbering` maps to `#set page(numbering:)` and `#counter(page).update(1)`. |
| Coding report | The algorithm caption sits below the list, where LaTeX's ruled box puts it above. | Yes: one show rule. |
| Slides | Beamer frames, overlays and blocks are not converted. | Out of scope: TYPST_STYLE.md has no Typst slides template. The converter should refuse Beamer and say so. |
| Every document | Body comments are dropped by pandoc. Heading labels land on the line after the heading, which compiles but is not TYPST_STYLE.md's layout. | Yes: carry whole-line comments as placeholders; join the label to its heading. |

Raw pandoc, for comparison, would have needed a person to retype 61 references, give back 9 equation numbers, replace 8 pictures that were dropped or printed as code, rebuild 3 tables, restore 3 listing captions and 2 algorithms, fix the page, language and citation style of all 9 documents and repair 7 compile errors.

### 5.2 Typst to LaTeX

| Document | pandoc: compiles | pandoc: live refs | tylax: compiles | Prototype: compiles | Prototype: labels | Prototype: live refs | Prototype: citations | Word coverage (pandoc, prototype) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Typst document | yes | 0 of 1 (citation lost too) | no (3 errors) | yes | 1 of 1 | 1 of 1 | 1 of 1 | 0.79, 0.95 |
| Typst report | yes | 0 of 2 | no (2) | yes | 1 of 1 | 2 of 2 | none | 0.76, 0.99 |
| Typst letter | yes | none | yes | yes | none | none | none | 0.96, 0.97 |
| Typst CV | yes | none | yes (1 undefined reference) | yes | none | none | none | 1.00, 1.00 |
| Typst stress document | cannot read it | 0 of 17 | no (6) | yes | 18 of 18 | 17 of 17 | 5 of 5 | none, 0.95 |
| **Total** | **4 of 5** | **0 of 20** | **2 of 5** | **5 of 5** | **20 of 20** | **20 of 20** | **6 of 6** | |

The prototype's pre-pass works on the Typst source before pandoc reads it:

- **Packages and rules.** `@preview` imports and every `#set` and `#show` rule are removed whole, however many lines they run to, after their facts (title, author, margin, size, numbering) are read. The house definitions (`theorem-like`, `subfigure`, `by-section`) go too.
- **References and citations.** Every `@label` whose label exists becomes `\cref{label}`; every other `@key` becomes `\parencite{key}`, with neighbouring keys merged and a `[p.~12]` supplement kept; `#cite(<k>, form: "prose")` becomes `\textcite{k}`.
- **Units.** Typed units are recognised by their `~`: `4.7~kΩ` becomes `\qty{4.7}{\kilo\ohm}`, `13~V/µs` becomes `\qty{13}{\volt\per\micro\second}`, `7,790` becomes `\num{7790}`, `22.5°` becomes `\ang{22.5}` and `$47 times 10^(3)$~Ω` becomes `\qty{47e3}{\ohm}`. A symbol run is split into prefixes and units by longest match, with whole symbols such as `dB`, `Pa`, `min` and `°C` tried first. unify's `qty("4.7", "kilo ohm")` is read as well.
- **Floats.** House sub-figure grids become `subfigure` from subcaption, and theorem calls become amsthm environments with their optional title.
- **Pseudocode.** The house algorithm list becomes `algorithm` and `algpseudocode` again, its block ends worked out from the `#h(1.5em)` indents.
- **Typst-drawn figures.** A figure drawn in Typst (shapes, CeTZ, fletcher) is compiled to PDF by Spectrum's own Typst and included as a picture.
- **Layout.** A CV's `(1fr, auto)` grids become `\hfill` lines, as the house CV writes them, and other grids become a plain `tabular`.

The post-pass on pandoc's JSON puts each label back inside its figure, table or equation. It writes house tables (booktabs, `S[table-format=...]` worked out from the numbers as `numberFormat` does, `\multirow`, `\multicolumn`, `\cmidrule(lr)`), house figures and `lstlisting` with its caption and label. It also writes the LATEX_STYLE.md preamble, with its groups and its comments in column 41.

### 5.3 What a round trip loses

LaTeX to Typst to LaTeX, compiled with XeLaTeX and Biber, compared with the original PDF:

| Document | Raw pandoc: compiles, refs, equation numbers | Prototype: compiles | Labels | Live refs | Citations | Numbered equations | Word coverage | Pages | Mean pixel difference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Simple document | yes, none, none | yes | none | none | 2 of 2 | none | 0.99 | 1 to 1 | 0.11 |
| Report or thesis | yes, 0 of 10, 0 of 2 | yes | 11 of 11 | 10 of 10 | 3 of 3 | 2 of 2 | 0.91 | 13 to 3 | 12.4 |
| Maths notes | yes, 0 of 7, 0 of 2 | yes | 7 of 7 | 7 of 7 | none | 2 of 2 | 0.95 | 2 to 3 | 13.1 |
| Electronics notes | yes, 0 of 10, 0 of 2 | yes | 6 of 6 | 10 of 10 | none | 2 of 2 | 0.92 | 2 to 2 | 11.9 |
| Coding report | **no** | yes | 7 of 7 | 8 of 8 | none | none | 0.98 | 3 to 2 | 17.9 |
| CV | yes | yes | none | none | none | none | 1.00 | 1 to 2 | 18.2 |
| Letter | yes | yes | none | none | none | none | 0.99 | 1 to 1 | 12.6 |
| Slides | yes | yes | none | none | none | none | 0.58 | 11 to 5 | 35.1 |
| Stress document | yes, 0 of 27, 0 of 3 | yes | 26 of 26 | 27 of 27 | 7 of 7 | 3 of 3 | 0.97 | 6 to 5 | 11.9 |

The simple document came back almost pixel for pixel (0.11). Elsewhere the pixel difference is layout moving, not content: a float or a page break shifts and every later page differs. What the prototype's round trip loses, and how to keep it:

| Loss | Example | Fix |
| --- | --- | --- |
| Drawing source | TikZ and pgfplots return as `\includegraphics` of the PDF made on the way out | Keep `diagrams/converted-N.tex` beside its PDF (the prototype already writes it) and turn an image whose PDF has a `.tex` sibling back into `\includestandalone`. The same works for Typst drawings with a `.typ` sibling. |
| The report class | The report came back as an `article`: no chapters, no title page, so 13 pages became 3 | Read the Chapter supplement rule Typst was given, or keep the source class in a conversion record (section 6.4). |
| Front matter numbering | Roman page numbers | The `\pagenumbering` rule in section 5.1. |
| Inner table rules | The `\midrule` above the Year row | pandoc's Typst reader drops `table.hline`; read the rules in the pre-pass, or use the typst-syntax front end. |
| A lone unit | `\unit{\hertz}` came back as the text Hz | Harmless to the PDF. Recognising lone unit symbols risks false matches in prose, so leave it. |
| `\SI` | `\SI{3.3}{\nano\farad}` came back as `\qty{3.3}{\nano\farad}` | Intended: LATEX_STYLE.md asks for `\qty`. |
| Comments and source layout | Comments, alignment of `&` and line breaks in the source | Carry whole-line comments; the rest is cosmetic. |
| Pseudocode details | The `\EndWhile` lines are rebuilt from indentation, so an `algorithmic` with `noend` or unusual nesting may differ | Acceptable; the numbered list keeps the meaning. |
| Beamer | Frames, overlays, blocks | Out of scope. |

### 5.4 Time

On the stress document the LaTeX to Typst prototype took 3.4 s and the Typst to LaTeX prototype 1.4 s. Most of the first is pandoc started once per table cell and caption; one pandoc call per table would take it under a second.

## 6. Recommended architecture

### 6.1 The pipeline

```text
source project (never changed)
  1. read      the main file and every \input, \include or #include file, each kept as its own file
  2. pre-pass  recognise house constructs and hold them as placeholders: tables, pictures, units,
               algorithms, theorem calls, references and citations, title block, appendix
  3. parse     LaTeX: pandoc to JSON; Typst: typst-syntax's tree, with pandoc writing the prose left in it
  4. AST pass  in Node: references, maths (tex2typst with a fallback), theorems, listings, labels
  5. write     pandoc's writer for the prose; Spectrum's writers for everything held in step 2,
               and the house preamble for the target format
  6. validate  compile; compare labels, references, citations, equations, floats and words
  7. report    conversion/notes.md and .spectrum/conversion.json: what was flagged and why
  8. optional  AI clean-up of flagged regions only (section 9), each edit checked by step 6
new project, opened when done
```

- **pandoc's JSON, edited in Node, rather than Lua filters.** The logic stays in JavaScript beside `markdownService.js`, testable with Spectrum's existing check scripts, and pandoc stays a separate program that Spectrum talks to through files and pipes (section 10.2).
- **One file in, one file out.** `\include{chapters/intro}` becomes `#include "chapters/intro.typ"` and back, and the definitions a chapter needs go in `style.typ`, as TYPST_STYLE.md asks. Spectrum resolves includes itself, inside the project (`safeJoin`, as `inlineInputs` does), and runs pandoc with `--sandbox`, so a document cannot make pandoc read a file outside the project.
- **Spectrum's own writers for anything with a house form.** Move `tableLatex`, `tableTypst`, `figureTypst`, `figureSetTypst`, `numberFormat` and `typstMarkup` out of `apps/frontend/src/editor/floats.ts` into a module the backend can import, and add a LaTeX table parser and a Typst table parser that produce a `TableModel`. Then a converted table is identical to one made with Insert table.
- **A Typst front end of Spectrum's own.** pandoc's Typst reader is the weakest link (section 4.1). Phase 2 started on it with the prototype's pre-pass; phase 3 replaced that with `typst-syntax` 0.15.1, Typst's own parser, built to WebAssembly from a small wrapper in `native/typst-syntax` (`node scripts/native.mjs typst-syntax`) and loaded in Node, so no helper program has to be bundled for each platform. It reads exactly what Spectrum's Typst compiles, packages, colons and semicolons included, without evaluating anything. The pre-pass in `convert/toLatex.js` walks its tree. Rules become facts and the document's own simple `#let` functions are expanded where they are used. A package's drawing or Typst scripting becomes a picture Typst compiles, with its source kept. What is left is plain Typst prose, which pandoc still writes, and it never sees a package, a rule or a definition.
- **Pictures are compiled, never redrawn.** TikZ, pgfplots and circuitikz pictures compile to PDF with Tectonic, as Spectrum compiles composer previews; the standalone source stays beside the PDF. Composer flowcharts in TikZ mode are written again as fletcher (and back) from their stored model; other composer modes, which have no Typst writer, keep their PDF. In the other direction a Typst drawing compiles with Spectrum's Typst. TYPST_STYLE.md prefers CeTZ or Lilaq in `diagrams/`, so the notes file lists each PDF picture as a candidate to redraw by hand.

### 6.2 Validators

All deterministic, run after conversion and after every AI edit.

| Check | How | Fails when |
| --- | --- | --- |
| Compiles | Typst: `typst compile`; LaTeX: Spectrum's compile service with the project's engine | Any new error, or a new warning in Typst |
| Labels | LaTeX: `\label` and listing `label=`; Typst: `typst eval` querying labelled headings, figures and equations, as `typstElements` does | A label in the source is missing in the output |
| References | Count and targets of `\cref` against `@label` and `#ref` | A reference became text, or points elsewhere |
| Citations | The multiset of keys | A key was lost or invented |
| Equations | Numbered displays; `\left`, `\bigl` and bracket counts per equation | A number or a bracket was lost (catches tylax's fault) |
| Floats | Figures, tables, listings and algorithms by kind | Any count changes |
| Words | Order-free word coverage per section, from the PDFs or from the source with markup stripped | Below a threshold (0.95 per section in prose; maths excluded) |
| House style | The checklists at the end of both style guides, as code: page, language, no `@preview` outside `diagrams/`, preamble order, `refs.bib` or `references.bib` | Any item fails |

### 6.3 Where it plugs in

| Layer | Change |
| --- | --- |
| Backend service | `apps/backend/src/services/convertService.js`: `latexToTypst(projectRoot, mainFile, options)` and `typstToLatex(...)`, using `runSpawn` and `pandocPath` as `markdownService.js` does, and `compileTypst` and `compileDocument` for validation. |
| Route | `POST /api/projects/:id/convert` with `{ to: 'typst' \| 'latex', doc, aiCleanup?: boolean, llmConfig? }`. It creates a new project with `createProject`, as `/export/latex` does, and runs as a job with progress over server-sent events, as `import-arxiv-sse` does, or with the transfer route's `step` API. |
| Frontend entry | The project menu in `EditorPage.tsx` (`switcherItems`) gains "Convert to Typst project…" when the main file is `.tex` and "Convert to LaTeX project…" when it is `.typ`, beside the Markdown one. A confirm dialog says "Spectrum makes a new Typst project from this LaTeX. This project stays as it is." with one option, "Tidy flagged parts with the AI model", off by default and shown only when a model is set up. |
| Progress | Steps shown as they finish: Reading, Converting, Pictures (N of M), Checking, Tidying (N of M regions), Done. A panel in the style of `TransferPanel.tsx`. |
| Result | The new project opens with `conversion/notes.md` listing every flagged region, every picture kept as a PDF and every rule that was approximated, each with its file and line. |
| Undo | The source project is never written. In the new project a checkpoint is saved with `createVersion` before the AI step, and every AI edit goes through `writeFileWithSnapshot` and is shown in `ReviewChangesSheet`. The new project can also simply be moved to the Bin. |

### 6.4 The conversion record

A small `.spectrum/conversion.json` in the new project records the source format, class and options, the picture sources and the rules applied. It is what lets a later conversion back restore the report class and the TikZ sources without putting markers in the document. If the record is missing (the project was edited elsewhere), recognition of the house constructs still does most of the work, as the prototype showed.

## 7. Mapping tables

The spelling on each side is the house spelling from the two style guides; TYPST_STYLE.md's "From LaTeX" table is the authority for the Typst side. Round trip says whether the construct came back as it was in the experiments, or what the converter needs to make it so.

### 7.1 Document and page

| LaTeX | Typst | LaTeX to Typst | Typst to LaTeX | Round trip |
| --- | --- | --- | --- | --- |
| `\documentclass[11pt,a4paper]{article}` | `#set page(paper: "a4")`, `#set text(size: 11pt)` | From the class options | `article`, or `report` when level 1 headings have the Chapter supplement | Class needs the record or the supplement rule |
| `\usepackage[margin=25mm]{geometry}` | `margin: 25mm` | Yes | Yes | Exact |
| `babel` `australian`, `pdflang = {en-AU}` | `#set text(lang: "en", region: "AU")` | Yes | Yes | Exact |
| `parskip`, `microtype`, `iftex`, `fontenc`, `lmodern`, `hyperref` | Nothing | Dropped | Written back by the house preamble | Exact |
| `\title`, `\author`, `\date`, `\maketitle` | `#set document(...)`, the title block with `#title()` | Yes | Yes (a centred block holding `#title()` or the title) | Exact |
| `titlepage` | `#set page(numbering: none)` and a centred block | Rule to add | Rule to add | Lost in the prototype |
| `\pagenumbering{alph}`, `{roman}`, `{arabic}` | `numbering: none`, `"i"`, `"1"` with `#counter(page).update(1)` | Rule to add | Rule to add | Lost in the prototype |
| `\pagestyle{empty}` | `numbering: none` | Yes | Yes | Exact |
| `\tableofcontents`, `\listoffigures`, `\listoftables` | `#outline(...)` with a target | Yes | Contents yes; the two lists to add | Partly |
| `\appendix` | The appendix block (counter, `"A.1"`, Appendix supplement) | Yes | Yes | Exact |

### 7.2 Text and structure

| LaTeX | Typst | Notes |
| --- | --- | --- |
| Paragraphs, `\emph`, `\textbf`, `\texttt`, `\textsc`, `\footnote`, `\href`, `\url`, lists | Blank lines, `_..._`, `*...*`, `` `...` ``, `#smallcaps`, `#footnote`, `#link` | pandoc, both ways |
| `` `single' ``, `\enquote{...}`, `--`, `---` | `'single'`, `--`, `---` | pandoc, both ways |
| `25\,mm` | `25~mm` | Typst to LaTeX gives `\qty{25}{\milli\metre}`, which LATEX_STYLE.md allows |
| `\section{X}\label{sec:x}` | `= X <sec:x>` | Join pandoc's label to the heading line |
| `\chapter` in a report | `=` with the Chapter supplement and a page break | Rule in the preamble |
| `\section*{X}` | `#heading(numbering: none, outlined: false)[X]` | pandoc writes `numbering: none`; add `outlined: false`, as `\chapter*` is not in the contents |
| `\include{chapters/x}`, `\input{x}` | `#include "chapters/x.typ"` | One file each way |
| `% comment` | `// comment` | pandoc drops them; carry whole-line comments as placeholders |
| `\newcommand` | `#let` | Expanded on conversion; a simple symbol macro may become a `#let` |
| `\hfill`, `\vspace{x}`, `\clearpage` | `#h(1fr)`, `#v(x)`, `#pagebreak()` | Both ways in the prototype (`\clearpage` Typst to LaTeX only so far) |

### 7.3 References and citations

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `\cref{fig:x}`, `\Cref`, `\ref`, `\autoref` | `@fig:x` | Typst to LaTeX always writes `\cref` |
| `\cref{eq:a,eq:b}` | `@eq:a and @eq:b` | The plural "Equations (1) and (2)" becomes "Equation 1 and Equation 2" |
| `\eqref{eq:x}` | `@eq:x` | |
| `\pageref{x}` | `#ref(<x>, form: "page")` | |
| `\textcite{k}`, `\citet{k}` | `#cite(<k>, form: "prose")` | |
| `\parencite{k}`, `\citep{k}` | `@k` | |
| `\parencite[p.~45]{k}` | `@k[p.~45]` | pandoc's Typst reader drops the page; the pre-pass keeps it |
| `\parencite{a,b}` | `@a @b` | |
| `\citeauthor`, `\citeyear`, `\nocite` | `form: "author"`, `form: "year"`, `form: none` | |
| `\addbibresource{references.bib}`, `\printbibliography` | `#set bibliography(title: [References])`, `#bibliography("refs.bib", style: "apa")` | The `.bib` is copied to the other name |

### 7.4 Maths

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `$x$`, `\[ ... \]` | `$x$`, `#math.equation(block: true, numbering: none, $ ... $)` | |
| `equation` with `\label{eq:x}` | `$ ... $ <eq:x>` | |
| `align` with one number | `$ a &= b \ &= c $ <eq:x>` | Typst to LaTeX writes `equation` with `aligned`, so there is still one number |
| `align` with several labels | One equation per labelled line | Flagged: Typst numbers a whole equation |
| `cases`, `pmatrix`, `bmatrix`, `vmatrix` | `cases(...)`, `mat(...)`, `mat(delim: "[", ...)`, `mat(delim: "\|", ...)` | Avoid pandoc's `vmatrix` fault |
| `\mathbf{x}`, `\mathbb{R}`, `\mathcal{L}` | `upright(bold(x))`, `RR`, `cal(L)` | |
| `R_\mathrm{in}`, `\eta_{\text{ref}}` | `R_"in"`, `eta_"ref"` | Map a multi-letter `\mathrm` to a string |
| `\operatorname{rank}`, `\DeclareMathOperator{\tr}{tr}` | `op("rank")`, `op("tr")` | |
| `\left( ... \right)`, `\bigl[ ... \bigr]` | Plain brackets, `lr([...], size: #120%)` | Never drop them (tylax does) |
| `\coloneqq`, `\xrightarrow{f}` | `:=`, `limits(-->)^f` | Not in tex2typst; a Spectrum rule |
| `\numberwithin{equation}{section}` | The by-section block | Both ways |

### 7.5 Units (siunitx and typed text)

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `\qty{4.7}{\kilo\ohm}` | `4.7~kΩ` | The `~` is what lets Typst to LaTeX find it again |
| `\qty{13}{\volt\per\micro\second}` | `13~V/µs` | One solidus, as TYPST_STYLE.md asks |
| `\qty{0.004}{\per\kelvin}` | `0.004~K⁻¹` | No numerator, so a negative power |
| `\qty{\pm 15}{\volt}` | `±15~V` | |
| `\qty{1.2 \pm 0.1}{\metre}` | `(1.2~±~0.1)~m` | |
| `\qty{47e3}{\ohm}` | `$47 times 10^(3)$~Ω` | |
| `\num{7790}` | `7,790` | Commas from four digits |
| `\ang{22.5}` | `22.5°` | |
| `\qty{65}{\degreeCelsius}`, `\qty{19.0}{\percent}` | `65~°C`, `19.0~%` | |
| `\unit{\hertz}` | `Hz` | Comes back as text |
| `\SI{3.3}{\nano\farad}` | `3.3~nF` | Comes back as `\qty` |
| An unknown unit macro | Kept as written and flagged | |

### 7.6 Figures and pictures

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `figure` with `\includegraphics[width=0.75\linewidth]{figures/x.png}`, `\caption`, `\label` | `#figure(image("/figures/x.png", width: 75%), caption: [...]) <fig:x>` | Root-relative paths in Typst |
| `width=0.5\linewidth,height=0.8\textheight,keepaspectratio` | `width: 50%` | The height guard dropped; both sizes without `fit` stretched the image off the page in raw pandoc |
| `width=60mm,height=40mm,keepaspectratio`, `scale=0.5` | `width: 60mm, height: 40mm, fit: "contain"`, `scale(50%, reflow: true, ...)` | |
| `trim=...,clip` | None | Flag: crop the file |
| `[H]`, `[ht]` | Default, `placement: auto` | |
| `subfigure` panels | `#subfigure(...)` in a grid | Both ways |
| `minipage` figures side by side | A grid of figures | Rule to add |
| `\includestandalone{diagrams/x}` | `image("/diagrams/x.pdf")`, or `include "/diagrams/x.typ"` when the composer can write Typst | Restored from the record on the way back |
| `tikzpicture`, pgfplots, circuitikz | `image` of the compiled PDF | Source kept beside it; redrawing in CeTZ or Lilaq is a manual option |
| A Typst drawing (CeTZ, Lilaq, fletcher, shapes) | | `\includegraphics` of a PDF compiled by Typst, source kept beside it |

### 7.7 Tables

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `table` with caption above | `#figure(table(...), caption: [...]) <tab:x>`, caption above by the preamble | |
| `\toprule`, `\midrule`, `\bottomrule` | `table.hline(stroke: 0.08em)`, `0.05em`, `0.08em` with `stroke: none` | |
| `\cmidrule(lr){2-3}` | `table.hline(start: 1, end: 3, stroke: 0.03em)` | Typst cannot trim the ends |
| `l`, `c`, `r`, `X` | `left`, `center`, `right`, `1fr` | |
| `S[table-format=4.1]` and `{Heading}` | `right`, comma-grouped numbers, tabular digits | `table-format` recomputed on the way back from the numbers |
| `\multicolumn`, `\multirow` | `table.cell(colspan:)`, `table.cell(rowspan:)` | |
| `\makecell{a \\ b}` | `[a \ b]` | |
| `threeparttable`, `\tnote{a}` | `#super[a]` and a note under the table | Notes come back as a paragraph after the table; rule to add |
| `xltabular` | A breakable figure with the rules inside `table.header` | Rule to add |

### 7.8 Code, pseudocode and theorems

| LaTeX | Typst | Notes |
| --- | --- | --- |
| `lstlisting` with `language`, `caption`, `label` | `` #figure(```lang ...```, caption: [...]) <lst:x> `` | Use the listings option, not pandoc's class |
| The `report` listings style | The house code box | |
| `\lstinline[language=Python]\|x\|` | `` `x` `` | Comes back as `\texttt`; rule to add |
| `algorithm`, `algpseudocode` | A figure of kind `"algorithm"` holding a numbered list | Both ways; `\EndWhile` and the like rebuilt from indentation |
| `\Require`, `\Ensure`, `\State`, `\If`, `\While`, `\For`, `\ForAll`, `\Return`, `\Comment`, `\Call` | **Input:**, **Output:**, `+`, `*if* ... *then*`, `*while* ... *do*`, `*for* ... *do*`, `*for all* ... *do*`, `*return*`, `#h(1fr) $triangle.r$`, `#smallcaps[F];(...)` | In maths, `#smallcaps[F];` needs the semicolon, or Typst reads `(...)` as a call |
| `\newtheorem` set and `\theoremstyle` | The house theorem set | |
| `\begin{theorem}[Euclid]\label{thm:e}` | `#theorem(title: [Euclid])[...] <thm:e>` | |
| `proof`, `solution` | `#proof[...]`, `#solution[...]` | |

## 8. What cannot convert, and what the converter does instead

| Construct | LaTeX to Typst | Typst to LaTeX |
| --- | --- | --- |
| TikZ, pgfplots, circuitikz, tikz-cd | A PDF picture with its standalone source beside it; listed in the notes as a candidate to redraw | Restored from the source on the way back |
| Typst drawings and plots | | A PDF picture with its `.typ` source beside it |
| User macros | Expanded by pandoc in text and by Spectrum in maths; the notes list each macro expanded. A zero-argument symbol macro may become `#let` | A simple `#let` expanded; a function with logic becomes a picture of its output, or text with a note |
| Packages with no house equivalent (`chemfig`, `mhchem`, `tcolorbox`, `glossaries`, `todonotes`, `fancyhdr`, `multicol`, `wrapfig`) | Display content becomes a compiled picture; inline commands keep their text with a `// TODO(spectrum):` comment; the region is flagged for the optional AI step | |
| Typst scripting (`for`, `if`, `context`, `state`, `query`, show rules with functions) | | The output of a scripted block is compiled to a picture; document-wide show rules that only style are read as facts or dropped with a note |
| Beamer | Refused with a message: TYPST_STYLE.md has no Typst slides template | |
| Bibliography styles other than APA | The matching CSL style name if Typst has it, otherwise APA and a note | biblatex style by name if one exists, otherwise APA and a note |
| Hayagriva `.yml` bibliography | | Not converted; TYPST_STYLE.md forbids it in Spectrum documents |
| Exact page layout (line breaks, float positions, page count) | Not attempted: the engines differ | Not attempted |

A raw LaTeX block cannot be passed through to Typst, and a raw Typst block cannot be passed through to LaTeX, so "keep a raw block" is not available here as it is in pandoc's Markdown. The choices are a picture (which keeps the look), text with a TODO comment (which keeps the words) or an AI attempt on that region alone.

## 9. AI clean-up for weak models

### 9.1 When it runs

Only after the deterministic conversion has passed its validators, only if the user turned it on and only on regions the converter flagged. A region is one construct the rules could not place: a title page, a CV header, an unknown environment, an unknown command with its paragraph, an approximated table. The converter also flags an environment the document defines with `\newenvironment`, and in Typst a call of the document's own `#let` function whose look pandoc cannot write (a box, a fill, a size), since all of these keep their words but lose their look. Each region is at most 60 lines. The model never sees or rewrites the whole document, which is the difference from `transferAgent`'s `applyTransfer` and `fixCompile`.

### 9.2 The task

Each task is one region and carries:

1. the original source of that region in the other format (from the conversion record);
2. the converted region, between markers the converter wrote: `// spectrum:region r3 start kind=titlepage` and `// spectrum:region r3 end` (or `%` in LaTeX);
3. the rule card for that kind of region (Appendix A), and nothing else from the style guides;
4. the invariants the answer must keep: the same words, labels, references, citations and maths.

### 9.3 The answer

Exactly one block, or a skip:

```text
<<<REPLACE r3
...the new text for the region, without the markers...
>>>
```

```text
SKIP r3
```

A full replacement of a small region is easier for a weak model than a unified diff, whose line numbers and context lines small models often get wrong. Spectrum works out the diff itself and shows it in the review sheet.

### 9.4 Checks after every answer

In this order, stopping at the first failure:

1. Exactly one `<<<REPLACE rN ... >>>` block for the region asked, or `SKIP rN`. No markers inside.
2. The words of the region are still there, in any order, ignoring Typst or LaTeX calls and their settings, so layout may change and text may not. A word may be added only if the ORIGINAL has it. The converter keeps the text of every command it does not know, and its own word check names in `conversion/notes.md` any word of the original that the conversion lacks.
3. The labels are the same. The references and citations are the same.
4. No package, `#import`, page, document or text setting and no show rule appears (no `\usepackage` or preamble command in LaTeX).
5. The replacement is no more than three times the region's length plus 200 characters.
6. The document compiles with no more errors than before.
7. After the last region, the full validator of section 6.2 runs again.

### 9.5 Retries and failure

- Up to 3 answers per region. Each retry sends the check's message back in one sentence, for example "The words changed. Keep every word of the region, and add none."
- After 3 failures, or a `SKIP`, the deterministic text stays, a `TODO(spectrum)` comment goes above the region and `conversion/notes.md` records why.
- A run stops after 20 regions or the user's token limit, whichever comes first, and says how many were left.
- Temperature 0 where the provider allows it; thinking off or low for a fast model, since each task is short.
- Every accepted edit is saved with `writeFileWithSnapshot` and shown in the review sheet before the user keeps it, after a checkpoint made with `createVersion`.

### 9.6 Test without a model

No model was available (section 2), so the checking side was tested with eight scripted answers to one real region, the converted report's title page, using `cleanup_protocol.mjs`:

| Scripted answer | Applied | Answers used | First reason given back |
| --- | --- | --- | --- |
| A correct layout with `#page`, `#align`, `#v` and `#text(size:)` | Yes | 1 | |
| Correct, but only after a first answer wrapped in chat and a Markdown fence | Yes | 2 | Answer with exactly one `<<<REPLACE r1 ... >>>` block, or `SKIP r1`. You gave 0. |
| Drops the line "School of Engineering" | No | 3 | The words changed. Keep every word of the region, and add none. |
| Chat and a fence every time | No | 3 | As the second row |
| Adds `#import "@preview/showybox:2.0.4"` | No | 3 | The words changed... A reference or citation was added or removed... Do not add `#import`... |
| An invalid font weight | No | 3 | It does not compile: error: expected integer, "thin", ... |
| Answers for region r2 | No | 3 | The block must be for r1, not r2. |
| `SKIP r1` | No | 1 | Deterministic text kept, with a TODO comment |

The checks behaved as designed in all eight cases. What remains unknown is how often a real weak model gets a region right on its first or second answer. That decides how useful the step is, not whether it is safe, and it should be measured on DeepSeek V4.1 Flash and one local model before the step is offered.

### 9.7 The prompt

The system message is the rule card and the checklist from Appendix A; the user message is generated per region:

```text
Region r3, kind titlepage. Rewrite the CONVERTED text so it matches the ORIGINAL's layout,
following the rule card. Keep every word, label, reference and citation exactly.

ORIGINAL (LaTeX):
<the LaTeX source of the title page>

CONVERTED (Typst), the only text you may change:
<the region between its markers>

Answer with exactly one block:
<<<REPLACE r3
the new text
>>>
or the line: SKIP r3
```

On a retry the same message is sent with one line added at the top: `Your last answer was not used: <the check's sentence> Try again.`

### 9.8 Measuring the AI tidy step

`apps/backend/test/fixtures/tidy-bench` holds 51 regions the converter flags, every kind in both directions, from small source documents written for the purpose. `scripts/tidy-bench.mjs` sends each region to each model exactly as the converter's tidying does (the same system message, user message, retries and checks, the compile included) and counts what happens:

```sh
DEEPSEEK_API_KEY=... OPENROUTER_API_KEY=... node scripts/tidy-bench.mjs --models models.json --out tidy-bench-results/run1
```

`models.json` lists the models, as in `apps/backend/test/fixtures/tidy-bench/models.example.json`; each names the environment variable that holds its key, and nothing else is read for keys. `--regions titlepage,t2l-` limits the run, `--concurrency 4` runs four requests at once and `--dry-run` answers from a script without calling any model. The run writes `report.md` (right first time, right within three answers, skipped, failed after three, the failure reasons by check, tokens, time per region and, with prices in the models file, the cost), `results.json` and `review.html`, which shows every accepted edit beside the original and a note of what a good answer looks like. The fixture's README has the details.

## 10. Phased plan

| Phase | Work | Effort (one developer) | Exit test |
| --- | --- | --- | --- |
| 1. LaTeX to Typst | `convertService.js` and the route; pandoc JSON with the passes of section 5.1; the shared table and figure writers; the LaTeX table parser; pictures through Tectonic; validators; `conversion/notes.md`; the menu entry and progress panel | 3 to 4 weeks | The 9 templates, the stress document and 20 real house-style documents not used during development all compile, with no lost label, reference, citation, numbered equation or float, and word coverage of at least 0.95 per prose section |
| 2. Typst to LaTeX on pandoc | The pre-pass of section 5.2, the post-pass, the LaTeX preamble writer; package-free documents first | 2 to 3 weeks | The same bar for the 4 Typst templates, the stress document and 10 real Typst documents |
| 3. Typst front end | `typst-syntax` as a Rust helper or WebAssembly; replaces the regex pre-pass; reads `table.hline`, packages and user functions | 3 to 4 weeks | Phase 2's corpus, plus documents that import packages |
| 4. Round trip | The conversion record; picture sources restored; report class, title page, roman numbering, table notes, `minipage`, `xltabular` and comment rules | 1 to 2 weeks | LaTeX to Typst to LaTeX of every corpus document compiles with labels, references, citations, equations, units, tables and picture sources unchanged |
| 5. Optional AI clean-up | Region markers, the protocol of section 9, the skill file in Appendix A, the option in the dialog | 1.5 to 2 weeks | Measured first-answer and third-answer success on DeepSeek V4.1 Flash and one local model across 50 flagged regions; no unchecked edit can reach a file |
| Later | Foreign LaTeX (arXiv sources and the like) | Open | |

### 10.1 Risks

| Risk | Mitigation |
| --- | --- |
| The prototype was tuned on this corpus | Hold-out documents in every phase's exit test |
| pandoc changes behaviour between versions | Keep the pin; run the corpus as a test before raising it. 3.13 changed none of the faults found here |
| pandoc's Typst reader lags Typst | Phase 3 replaces it |
| Tectonic must download its bundle before the first picture compiles | Say so when offline, as compiles already do; skip pictures with a note rather than fail |
| A project pinned to Typst 0.13 or 0.14 | The house sub-figure reference rule needs 0.15; convert for 0.15 and say so, as TYPST_STYLE.md does |
| The typed-unit recogniser matches something that is not a unit | It needs the `~` that TYPST_STYLE.md requires, a number before it and a symbol run that parses fully; a near miss stays text. The validator's word check catches the rest |
| pandoc reading files outside the project through `\input` | Spectrum resolves includes with `safeJoin` and runs pandoc with `--sandbox` |
| Speed on long documents | One pandoc call per table, not per cell; pictures compiled in parallel |

### 10.2 Licences

| Component | Licence | Implication |
| --- | --- | --- |
| Spectrum | MIT | |
| pandoc | GPL-2.0-or-later | Spectrum runs it as a separate program, downloaded at the user's request, and talks to it through files, pipes and its JSON format. That is two programs side by side, not one combined work ([GPL FAQ: mere aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)), so Spectrum's code stays MIT. The GPL's conditions apply to distributing pandoc itself: Spectrum already ships its licence text (`apps/frontend/public/licences/pandoc-GPL-2.0-or-later.txt`), and if pandoc were ever bundled in the installer, the offer of its source would have to come with it. Doing the AST work in Node over JSON, rather than as Lua filters run inside pandoc, keeps that separation plain. |
| tex2typst | Apache-2.0 from 0.3.15; GPL-3.0 before | Pin 0.3.15 or later; add it to `THIRD_PARTY_NOTICES.md` with its licence |
| typst-syntax | Apache-2.0 | Compatible with MIT; carry the licence |
| tylax, mitex | Apache-2.0 | Compatible, but not recommended (section 4) |
| Typst packages (CeTZ is LGPL-3.0-or-later, lemmify GPL-3.0-only) | Various | Downloaded by the user's own compile, not distributed by Spectrum; TYPST_STYLE.md keeps documents free of them except in `diagrams/` |
| texpile | AGPL-3.0 | Do not copy code from it |

### 10.3 What is achievable without AI

Everything in both style guides converts without AI: text, structure, references, citations, maths, units, figures, sub-figures, tables, listings, pseudocode and theorems. Pictures convert as compiled PDFs with their source kept, which is lossless for a round trip but not editable in the other language. Without AI, the converter cannot redraw TikZ in CeTZ, convert Beamer or handle packages and scripting outside the two guides. The AI step, when added, is a convenience on those leftovers, never a dependency.

## Appendix A: Weak-model instructions

To be shipped as `skills/spectrum-convert-tidy/SKILL.md`. The orchestrator puts the checklist and the one rule card that matches the region into the system message.

````markdown
---
name: spectrum-convert-tidy
description: Tidy one flagged region of a document Spectrum converted between LaTeX and Typst. Use only when Spectrum's converter asks, one region at a time. The answer is one replacement block or a skip, and Spectrum checks it before anything is kept.
license: MIT
compatibility: Called by Spectrum's converter with one region per request. Needs no tools. Works with small, fast models.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Tidy one converted region

Spectrum has converted a document between LaTeX and Typst with fixed rules. Most of it is
finished. You get one small region the rules could not place well. You change that region
only, and only its layout.

## What you get

- ORIGINAL: the region as it was, in the source format.
- CONVERTED: the region as converted, in the target format. This is the only text you may
  change.
- KIND: what the region is, and the rule card for that kind below.

## What you answer

Exactly this, with nothing before or after it:

<<<REPLACE r3
the new text for the region
>>>

If you are not sure, answer only:

SKIP r3

Use the region's own name (r3 here). Do not copy the `spectrum:region` marker lines.

## Checklist before you answer

1. I changed only the CONVERTED text, and only its layout.
2. Every word of the region is still there. I added no words, except ones the ORIGINAL has
   that the CONVERTED text lost.
3. Every label, such as <fig:x> or \label{fig:x}, is still there, exactly as written.
4. Every reference and citation, such as @fig:x, @Masters2013, \cref{fig:x} or
   \parencite{Masters2013}, is still there, exactly as written.
5. Every piece of maths is still there, unchanged.
6. I added no #import, no #set page, #set text or #set document, no #show rule,
   no \usepackage and no preamble command.
7. My answer is one <<<REPLACE ...>>> block, or SKIP. No explanation, no Markdown fence.

## Rules for every region

- Write the target format as Spectrum's style guide writes it (the rule card says how).
- Keep it short. A region is a few lines; your answer should be about as long.
- When the ORIGINAL does something the target format cannot do, keep the words and drop the
  effect. Do not invent a replacement.
- Never invent text, numbers, references, labels or citations.
- If the CONVERTED text already looks right, answer SKIP.

## Rule cards

### titlepage (LaTeX to Typst)

The ORIGINAL is a LaTeX titlepage. Write a Typst page:

- Start with #page(numbering: none)[ and end with ].
- Inside, #align(center)[ ... ].
- \vspace*{30mm} or \vspace{12mm} becomes #v(30mm) or #v(12mm). \vfill becomes #v(1fr).
- {\LARGE\bfseries Text\par} becomes #text(size: 17pt, weight: "bold")[Text].
  \Large is 14pt, \large is 12pt, \normalsize is the default and needs no #text.
- Each \par or line of its own becomes its own line. Use \ at the end of a line only where
  the ORIGINAL used \\.

### titlepage (Typst to LaTeX)

The ORIGINAL is a Typst title block or page. Write:

- \begin{titlepage} ... \end{titlepage}, with \centering first.
- #v(30mm) becomes \vspace*{30mm} at the top, \vspace{30mm} elsewhere. #v(1fr) becomes \vfill.
- #text(size: 17pt, weight: "bold")[Text] becomes {\LARGE\bfseries Text\par}.

### cv-header (both directions)

The ORIGINAL puts a name and a line about the person on the left and contact details on the
right.

- Typst: #grid(columns: (1fr, auto), [left lines], align(right)[right lines]).
- LaTeX: \begin{minipage}[t]{0.6\linewidth} left lines \end{minipage}\hfill
  \begin{minipage}[t]{0.38\linewidth}\raggedleft right lines \end{minipage}
- Lines inside each side end with \ in Typst and \\ in LaTeX.

### unknown-environment (LaTeX to Typst)

The ORIGINAL uses an environment the converter does not know, and the CONVERTED text keeps its
words with a TODO comment.

- If the environment only boxes or highlights text, write #block(inset: 0.6em,
  stroke: 0.5pt + luma(180))[ ... ] around the words.
- If it is a list of some kind, write a Typst list (- items, or + for numbered ones).
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### unknown-command (LaTeX to Typst)

The ORIGINAL uses a command the converter does not know, inside one paragraph.

- If it only changes how text looks (bold, italic, colour, size), write the Typst equivalent:
  *bold*, _italic_, #text(fill: blue)[...], #text(size: 0.9em)[...].
- If it prints a symbol, write the symbol itself.
- Otherwise answer SKIP.

### unknown-environment (Typst to LaTeX)

The ORIGINAL is a call, on its own, of a function the document defines with #let (a box, a
list of steps), and the CONVERTED text keeps its words without its look, with a TODO comment.

- If the function only boxes or shades text, write \fbox{\parbox{\linewidth}{ ... }} around the
  words, or \begin{quote} ... \end{quote} if it only sets them apart.
- If it is a list of some kind, write \begin{itemize} or \begin{enumerate} with an \item for each
  part.
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### unknown-command (Typst to LaTeX)

The ORIGINAL calls a function the document defines with #let, inside one paragraph, and the
CONVERTED text keeps its words without its look.

- If it only changes how text looks, write the LaTeX: \textbf{...}, \emph{...}, {\small ...},
  \texttt{...}, or \fbox{...} for a box around a word. A colour needs a package, so keep the
  words and drop the colour.
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### table-layout (both directions)

The ORIGINAL table has a layout the converter approximated (column widths, a note, a rule).

- Keep every cell, in order. Keep the caption and the label.
- Typst: stroke: none, table.hline(stroke: 0.08em) at the top and bottom, 0.05em under
  the header, table.header(...) for header rows, no table.vline.
- LaTeX: booktabs (\toprule, \midrule, \bottomrule), no vertical lines, no \hline.

## Examples

Good answer:

<<<REPLACE r1
#page(numbering: none)[
  #align(center)[
    #v(30mm)
    #text(size: 17pt, weight: "bold")[Rooftop solar output across a Melbourne year]
    #v(12mm)
    #text(size: 14pt)[Your Name]
    #v(1fr)
    School of Engineering \
    Your University
  ]
]
>>>

Bad answer (an explanation and a fence; Spectrum cannot use it):

Sure, here is the improved title page:
```typst
#page(...)
```

## If Spectrum says your answer was not used

It tells you why in one sentence. Fix only that and answer again in the same format. After
three tries Spectrum keeps its own text, and that is fine.
````

## Appendix B: Files and how to rerun

Everything is in `/private/tmp/claude-501/-Users-beyond555-Documents-CodingProjects-OpenPrism/fbabb042-6bf1-46be-83a9-ed218926f0d7/scratchpad/latex-typst/`, which is temporary.

| Path (under that folder) | What it is |
| --- | --- |
| `scripts/spx_l2t.mjs` | The LaTeX to Typst prototype: `node spx_l2t.mjs <source folder> <output folder>` |
| `scripts/spx_t2l.mjs` | The Typst to LaTeX prototype, same arguments |
| `scripts/run_spx_l2t.sh`, `scripts/run_spx_t2l.sh`, `scripts/run_roundtrip.sh` | Run a prototype on every document and compile the results |
| `scripts/harness.py` | Raw pandoc and tylax runs and the baselines: `python3 -I harness.py l2t-pandoc` and so on |
| `scripts/measure.py`, `scripts/summary.py` | The measurements in section 5 (`measure.py l2t`, `t2l` or `rt`, then `summary.py`) |
| `scripts/extract_math.py`, `scripts/math_l2t.mjs`, `scripts/math_t2l.mjs` | The maths comparison in section 4.2 |
| `scripts/cleanup_protocol.mjs` | The protocol test in section 9.6 |
| `scripts/compare_pages.py` | Side-by-side page sheets of two PDFs |
| `work/src/stress-latex/`, `work/src/stress-typst/` | The two stress documents |
| `work/l2t-*/`, `work/t2l-*/`, `work/rt-*/` | Every converted document, with its PDF and, for the prototype, `conversion-report.json` |
| `work/results/` | Raw results: `summary.txt`, `measure-*.json`, `protocol.txt` |
| `tools/` | pandoc 3.12.1 and 3.13, tylax, tex2typst and the scratch Tectonic cache, each in its own folder |
