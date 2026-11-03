# Typst standard: decisions and sources

Research behind [TYPST_STYLE.md](../TYPST_STYLE.md), written 3 November 2026. The standard is the Typst counterpart of [LATEX_STYLE.md](../LATEX_STYLE.md) and the target of the LaTeX to Typst converter.

## How it was checked

- Typst: Spectrum's built-in binary, `src-tauri/binaries/typst-aarch64-apple-darwin`, which reports `typst 0.15.1 (9dfd3a08)`. `apps/backend/src/data/engines.json` pins 0.15.1 as `builtIn` and offers 0.14.2 and 0.13.1 for download.
- Every `typst` block in the guide (21 of them) was extracted by a script and compiled with `--root` set to a test project holding `refs.bib`, `figures/` and `diagrams/`. A fragment was compiled after the standard preamble; a drawing file was included in a figure. **All 21 compiled with no errors and no warnings.**
- Extra checks, outside the guide's examples: a 90-row long table (header and top rule repeat on each page), an 89-line listing (breaks across pages), chapters brought in with `#include` that import `/style.typ` (the definitions and the main file's caption rule both work), references across sections with numbering by section (Figure 2.1a, Equation (1.1)), the PDF's `/Lang (en-AU)` and a `.bib` holding `{\LaTeX}` and `G{\"o}del` (printed as LaTeX and Gödel).
- Packages were downloaded only into a scratch cache (`TYPST_PACKAGE_CACHE_PATH` and `TYPST_PACKAGE_PATH`).

**What failed:** `@preview/metro:0.3.0` does not compile on Typst 0.15.1 (`error: unknown variable: kelvin` in its `src/defs/units.typ`). Nothing in the guide failed. Three drafts were corrected before the final run: a show-set rule cannot set a figure's own `numbering` (so `subfigure` is now `figure.with(...)`), theorems inherited the figure's centring (now `align(start, it.body)`), and the code grid was centred in its box (now `columns: (auto, 1fr)`).

## 1. Packages

**Decision: plain Typst everywhere, except a drawing file in `diagrams/`, which may import one drawing package at an exact version (fletcher, CeTZ or Lilaq).** A document that truly needs another package puts it in a `// Packages` group with an exact version and says so to the user.

Candidates, all tested on 0.15.1:

| Need | Package (latest) | Result on 0.15.1 | Why not in the standard |
| --- | --- | --- | --- |
| Units | `metro` 0.3.0 (May 2024), a siunitx port | **Fails to compile** | Unmaintained since 2024 and broken by Typst's symbol changes. |
| Units | `unify` 0.8.1 (May 2026) | Works: `qty("4.7", "kilo ohm")` | Closest mapping from siunitx names, but no grouping by default and no table alignment. Typed text does the same job with nothing to download. |
| Units, numbers, decimal columns | `zero` 0.7.1 (Sep 2026) | Works; groups with a thin space by default, `set-group(separator: ",", threshold: 4)` gives 7,790; `format-table` aligns decimals | The strongest candidate. Rejected because equal decimals plus tabular digits align columns natively, and the rest is typed text. Revisit if mixed-precision columns become common. |
| Sub-figures | `subpar` 0.2.2 (Mar 2025) | Works; prints Figure 1a | The house `subfigure` does the same in about 15 lines of preamble. |
| Theorems | `ctheorems` 2.0.0 (Sep 2026, a breaking rewrite), `theorion` 0.6.0 (Apr 2026, pulls in `showybox` and `octique`), `great-theorems` 0.1.2, `lemmify` 0.1.8 | All import; `theorion` gives Theorem 1.1 and a proof box | The house set (one figure kind, one counter per section) matches amsthm's three styles in about 20 lines, and `ctheorems`' rewrite shows how quickly these APIs change. |
| Code | `codly` 2.0.0 (Oct 2026) | Works | Needs Typst 0.15 or later and pulls in `elembic`. A show rule on `raw` gives the box and line numbers. |
| Tables | `tablex` | Merged into Typst 0.11 (`table.cell`, `table.hline`, `table.header`) | Built in. |
| Pseudocode | `lovelace` 0.3.1 (Mar 2026) | Not needed | A numbered list in a figure of kind `"algorithm"`. |
| Flowcharts | `fletcher` 0.5.8 (May 2025) | Works (pulls in `cetz` 0.3.4, `oxifmt` 0.2.1) | Allowed: Spectrum's composer already writes it, choosing the version by Typst version (`fletcherFor` in `apps/frontend/src/diagram/modes/fletcher/code.ts`). |
| Drawings | `cetz` 0.5.3 (Oct 2026, needs 0.15) | Works | Allowed, in `diagrams/`. |
| Plots | `lilaq` 0.6.0 (Mar 2026) | Works (pulls in `zero` 0.6.1, `tiptoe` 0.4.0) | Allowed, in `diagrams/`. |

Reasons for the rule:

1. **Offline on the first compile.** `typstService.js` already explains that an `@preview` import needs the internet the first time (`PACKAGE_NOTE`). Plain Typst never does.
2. **Versions.** A project may pin Typst 0.13.1, 0.14.2 or 0.15.1. Packages follow Typst: `metro` broke, `codly` 2.0.0 and `cetz` 0.5.3 need 0.15 and the composer already keeps a table of fletcher versions per Typst version. Plain Typst has no such matrix.
3. **The templates.** `apps/backend/test/templates.test.js` forbids `@preview` and `#import` in the four Typst templates. A package-free standard lets them adopt it unchanged.
4. **The converter.** A converted document that needs nothing but Typst compiles on any machine, and an agent can check it without reading package manuals.
5. **Drawing is the exception** because plain Typst has no equivalent of TikZ, pgfplots or circuitikz, and the composer already isolates its package in its own file, as LaTeX's `standalone` diagrams carry their own packages.

Universe packages are immutable once published, and Typst only accepts full `name:x.y.z` versions, so pinning is automatic; the risk is not drift within a version but a version that stops compiling on a newer Typst.

**Vendoring.** Copying packages into projects was rejected (stale copies, licence files to carry and an `#import "/vendor/..."` that the template test forbids). The better option, left for a later change, is for Spectrum to pre-seed its own cache (`DATA_DIR/typst/packages/preview/<name>/<version>`, the path `typstService.js` sets) with the composer's fletcher and its dependencies, so diagrams compile offline on first use. Typst also reads a data directory (`TYPST_PACKAGE_PATH`) before its cache, which would suit a read-only bundle shipped with the app.

## 2. Document setup

| Setting | Decision | Notes |
| --- | --- | --- |
| Metadata | `#set document(title: [...], author: "...")`, printed with `#title()` | `#title()` needs 0.14 or later; it replaces the templates' retyped title. |
| Page | `#set page(paper: "a4", margin: 25mm, numbering: "1")` | Typst's default is no page number, unlike LaTeX's article. |
| Language | `#set text(size: 11pt, lang: "en", region: "AU")` | Verified: the PDF's `/Lang` is `en-AU`. |
| Paragraphs | `#set par(justify: true)` only | Typst's defaults (1.2em between paragraphs, no indent, leading 0.65em) already match parskip and single spacing. |
| Headings | `numbering: "1.1"` | `"1."` (the document template) prints a trailing full stop that LaTeX does not. |
| Equations | `numbering: "(1)"` | A reference prints "Equation 1": Typst drops a string pattern's brackets in references. With the by-section function it prints "Equation (2.1)". Accepted rather than adding a show rule. |
| By section | A `by-section` numbering function and one show rule that resets the counters at each level 1 heading | References evaluate the function at the referenced element, so cross-section references are right (verified). |
| Font | Typst's default, Libertinus Serif | New Computer Modern would look like LaTeX, but the templates use the default and the LaTeX guide's own rule is to keep the engine's default font. Only bundled fonts or `fonts/` (Spectrum passes it with `--font-path`). |
| Date | `[day padding:none] [month repr:long] [year]` | The templates' `[day]` prints 03 November. |

## 3. Bibliography

- **`.bib`, not Hayagriva `.yml`.** Spectrum's References tab writes BibTeX, `pickBibTarget` and `texIncludesBib` in `referenceService.js` find a `.bib` loaded by `#bibliography("...")` (string paths only) and the same file serves a LaTeX version. Typst reads both formats.
- **`style: "apa"`**, Typst's alias for `american-psychological-association`, APA 7th edition.
- **Title.** With `lang: "en"` the default title is "Bibliography" (verified), and APA wants "References". The title goes in `#set bibliography(title: [References])` in the preamble rather than in the call, because the template test matches `#bibliography("refs.bib", style: "apa")` exactly.
- **File name.** The LaTeX guide uses `references.bib`; the Typst templates and their test use `refs.bib`, and the brief asked for `refs.bib`. One gap: with no `.bib` in a project, `pickBibTarget` creates `references.bib`, which a Typst document starting from the standard will not load until its `#bibliography` call names it. Worth aligning in a later change.
- **Citations.** `@key` is `\parencite`; `#cite(<key>, form: "prose")` is `\textcite`; `@key[p.~45]` adds a page; adjacent `@a @b` merge into one parenthesis, sorted by APA (verified: "(Duffie & Beckman, 2013; Masters, 2013)"); `form: "author"`, `"year"` and `none` cover `\citeauthor`, `\citeyear` and `\nocite`. A `#textcite` helper was considered and rejected: the built-in call maps one to one.
- Typst 0.15 allows several bibliographies (`target`, `group`); the standard keeps one.

## 4. Figures and tables

- **Caption positions** by show-set rules: `figure.where(kind: table)` and `figure.where(kind: raw)` take `position: top`, as LaTeX's table and listings captions do.
- **Booktabs** is `stroke: none` plus `table.hline` at `0.08em` (top, bottom), `0.05em` (mid) and `0.03em` (cmidrule): booktabs' own `\heavyrulewidth`, `\lightrulewidth` and `\cmidrulewidth`, and the weights `tableTypst` in `apps/frontend/src/editor/floats.ts` already writes. Typst cannot trim a rule's ends like `\cmidrule(lr)`.
- **Decimal alignment** without `S` columns: right alignment, equal decimals and `number-width: "tabular"`. Equal decimals is also the Australian Government Style Manual's rule for values that are compared. Typst prints a true minus for `-5.4` in text (verified).
- **Long tables**: `table.header` repeats with the rules inside it (verified); the figure is made breakable only within a `#[ ... ]` scope, so short tables never split.
- **Sub-figures**: a figure of kind `"subfigure"` inside the outer figure, a caption rule for "(a) ...", a counter reset at each figure and a `ref` rule for "Figure 1a". The `ref` rule uses `counter.display(..., at: ...)`, new in 0.15, so numbering by section is read at the figure, not at the reference. This is why the standard targets 0.15.
- **Generator differences**, recorded in the guide: `figureSetTypst` writes "(a)" as text in a `stack` with no panel labels and `columns: n` (auto columns); `tableTypst` places rules by `y:`. Both compile; only the sub-figures lose referencing.
- **Images**: Typst cannot crop, and its default `fit` is `"cover"`, so the box size uses `fit: "contain"`, as `typstImage` already writes. Paths start with `/` from the project root, as `typstPath` writes.

## 5. Units and numbers

- **Decision: typed text**, the number, `~` and the symbol, with the converter mapping siunitx macros to Unicode symbols.
- Findings: in maths Typst puts a space after a comma (`$7,790$` prints "7, 790"), so numbers stay in text; a full non-breaking space (`~`) is used because Typst markup has no short form for a narrow one.
- Australian Government Style Manual: commas in numbers of four or more digits, and never a space instead, because screen readers can read spaced digits as separate numbers. This matches the LaTeX guide's `group-separator={,},group-minimum-digits=4`.
- `zero` would add grouping and decimal alignment in one package, and `unify` would map most directly from siunitx names; see the package table.

## 6. Code, theorems and pseudocode

- **Code**: Typst's `raw` with a show rule (box, line numbers in a grid so wrapped lines keep their indent), `#set raw(tab-size: 4)` (Typst's default is 2, listings' `tabsize = 4`), captions above and breakable listing figures. Typst 0.15 warns about unclear language tags.
- **Theorems**: one figure kind, `"theorem"`, so all environments share a counter; numbers per section; head and body styles for amsthm's plain, definition and remark styles; `proof` and `solution` end with □, as amsthm does.
- **Pseudocode**: a figure of kind `"algorithm"` with a flat numbered list, indentation by `#h(1.5em)` so line numbers keep counting and `$triangle.r$` for comments, as algpseudocode prints them.

## 7. Files, naming and comments

- `main.typ`, `refs.bib`, `figures/`, `diagrams/` and `chapters/` as in LaTeX. Insert figure and the composer already write `/figures/...` and `/diagrams/...` paths. Typst 0.15 refuses backslashes in paths.
- **Imports and includes**: `#include` for chapters (the main file's rules apply inside, verified); `#import "/style.typ": *` for definitions, because a `#let` does not reach into an included file; set and show rules stay in `main.typ`, since rules in an imported module do not apply to the importer.
- **Labels**: the LaTeX prefixes unchanged; Typst accepts `:` in labels, and the templates already use `<fig:example>`.
- **Comments**: `//` aligned at column 49 (Typst rules are longer than `\usepackage` lines, so column 41 would overflow on most of them).
- **Rule order**: set, then show-set, then show with a function, within groups ordered as the LaTeX preamble's; definitions after the groups, as `\newtheorem` and `\newcommand` come after the packages.

## 8. Follow-ups outside this change

- Bring the four Typst templates into line (the table in the guide's last section), keeping `templates.test.js` passing.
- Let `figureSetTypst` write `#subfigure` panels with labels and `(1fr, ...)` columns when the document defines `subfigure`.
- Align `pickBibTarget`'s default name with `refs.bib` for Typst projects.
- Pre-seed Spectrum's package cache with the composer's fletcher.

## Sources

Typst documentation:

- [Typst 0.15.0 changelog](https://typst.app/docs/changelog/0.15.0/) and [Typst 0.15 announcement](https://typst.app/blog/2026/typst-0.15)
- [bibliography](https://typst.app/docs/reference/model/bibliography/), [cite](https://typst.app/docs/reference/model/cite/), [figure](https://typst.app/docs/reference/model/figure/), [text](https://typst.app/docs/reference/text/text/)

Typst Universe package pages (versions and dates as listed on 3 November 2026):

- [metro](https://typst.app/universe/package/metro), [unify](https://typst.app/universe/package/unify), [zero](https://typst.app/universe/package/zero)
- [subpar](https://typst.app/universe/package/subpar), [codly](https://typst.app/universe/package/codly), [lovelace](https://typst.app/universe/package/lovelace)
- [ctheorems](https://typst.app/universe/package/ctheorems), [theorion](https://typst.app/universe/package/theorion), [great-theorems](https://typst.app/universe/package/great-theorems), [lemmify](https://typst.app/universe/package/lemmify)
- [fletcher](https://typst.app/universe/package/fletcher), [cetz](https://typst.app/universe/package/cetz), [lilaq](https://typst.app/universe/package/lilaq)

Style:

- Australian Government Style Manual, [Numbers and measurements](https://stylemanual.gov.au/node/138) and [Quick guide: numbers](https://www.stylemanual.gov.au/style-manual-resources/quick-guides/quick-guide-numbers)

Spectrum:

- `docs/LATEX_STYLE.md`; `templates/typst-*/main.typ`; `apps/backend/test/templates.test.js`; `apps/frontend/src/editor/floats.ts` (`tableTypst`, `figureTypst`, `figureSetTypst`, `typstText`); `apps/backend/src/services/typstService.js`; `apps/backend/src/services/referenceService.js` (`baseKey`, `pickBibTarget`, `texIncludesBib`); `apps/frontend/src/diagram/modes/fletcher/code.ts`; `apps/backend/src/data/engines.json`
