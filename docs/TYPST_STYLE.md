# Spectrum Typst style

The house style for `.typ` files written in Spectrum. It is the Typst counterpart of [LATEX_STYLE.md](LATEX_STYLE.md): the same page, the same references, the same conventions for figures, tables, units, code and cross-references, written the way Typst does them. Give this file to an agent or a person writing a new Typst document, or converting a LaTeX one, and the result should look and read like a Spectrum document.

Every example in this guide was compiled with Spectrum's built-in Typst, 0.15.1, on 3 November 2026. The reasons behind the choices, and the alternatives, are in [featureResearch/TYPST_STANDARD_NOTES.md](featureResearch/TYPST_STANDARD_NOTES.md).

## The rules in brief

1. A4, 11 pt, 25 mm margins, single line spacing, a blank line between paragraphs, Australian English (`lang: "en", region: "AU"`).
2. It compiles with Spectrum's built-in Typst (0.15 or later), offline, with no packages. Packages appear only in drawings under `diagrams/`; see [Packages](#packages).
3. The preamble is grouped under short `//` headings in a fixed order, and every set or show rule has a plain English comment saying what it is for.
4. Numbers with units are typed as text: the number, a non-breaking space `~`, then the unit's symbol, as in `4.7~kΩ`. Never in maths, and never without the space.
5. References are APA 7 from `refs.bib`, with `#bibliography("refs.bib", style: "apa")` at the end and the list headed References.
6. Every cross-reference is `@label`, equations included, with labels that have a type prefix (`fig:`, `tab:`, `eq:`).
7. Tables have booktabs rules drawn with `table.hline` and no vertical lines, with number columns right aligned and their decimals kept equal. Captions go above tables and below figures, and images that belong together are sub-figures made with `subfigure`.
8. Code is a `raw` block in the house code box, with a language on every block. Theorems come from the house theorem set, which shares one counter per section.
9. The document's title and author are set once in `#set document`, which also fills the PDF's properties. Links need no setting: Typst draws them without boxes.

## Files and layout

| File | What it holds |
| --- | --- |
| `main.typ` | The document. Short documents keep everything here. |
| `refs.bib` | The bibliography, loaded with `#bibliography("refs.bib", style: "apa")`. |
| `figures/` | Images. Spectrum's Insert figure saves each image here. Typst reads PNG, JPEG, GIF, SVG, PDF and WebP directly, so an SVG needs no converting. |
| `diagrams/` | Diagrams. Spectrum's diagram composer saves each drawing here as a `.typ` file that imports its own package. |
| `chapters/` | Optional, for long reports: one file per chapter, brought in with `#include "chapters/introduction.typ"`. |
| `style.typ` | Optional, for documents with chapters: the `#let` definitions (the theorem set, `subfigure`, `proof`) that chapter files import. |
| `fonts/` | Optional: font files for a typeface Typst does not bundle. Spectrum passes this folder to Typst. |

- The LaTeX guide names the bibliography `references.bib`; the Typst templates and their test use `refs.bib`, and this guide follows them. Spectrum's References tab adds new entries to the `.bib` file the document's `#bibliography` loads, so keep the path a plain string in that call.
- Write every path in the project from its root, with a leading slash: `image("/figures/measured.png")`, `include "/diagrams/flow.typ"`. A chapter in `chapters/` then finds the same file. Spectrum's Insert tools write paths this way. Use forward slashes only; Typst 0.15 refuses a backslash.

### Imports and includes

- `#include "chapters/introduction.typ"` places a file's content where the line is. The main file's set and show rules apply to it, but its `#let` definitions do not reach into it.
- `#import "/style.typ": *` brings in definitions. A chapter that uses `#theorem` or `#subfigure` starts with this line, and so does `main.typ`. Importing a file of your own project is not a package and is always allowed.
- Keep every set and show rule in `main.typ`. A set or show rule inside `style.typ` has no effect on the files that import it.

## Typst versions

Spectrum ships Typst 0.15.1 built in, and a project may pin an older version (0.14.2 or 0.13.1) in Settings › Engines. This standard targets 0.15:

- The sub-figure reference rule uses `counter.display(..., at: ...)`, which is new in 0.15.
- `#title()` needs 0.14 or later.
- A project pinned to 0.13 or 0.14 should move to the built-in version before it adopts this standard.

Typst bundles four fonts: Libertinus Serif (the default text face), New Computer Modern, New Computer Modern Math and DejaVu Sans Mono (code). Use these, or put font files in `fonts/`. Do not name a font that only exists on your own computer: the document would change on another one.

## Packages

**The rule: a Spectrum document's `.typ` files use plain Typst, with no `@preview` packages, except a drawing in `diagrams/`, which may import one drawing package at an exact version.**

| Need | Use | Not |
| --- | --- | --- |
| Units and numbers | Typed text: `4.7~kΩ`, `7,790` | `unify`, `metro`, `zero` |
| Sub-figures | The house `subfigure` | `subpar` |
| Theorems and proofs | The house theorem set | `ctheorems`, `theorion`, `great-theorems`, `lemmify` |
| Code | `raw` blocks with the house code box | `codly` |
| Tables | Typst's `table`, `table.hline`, `table.cell` | `tablex` (merged into Typst in 0.11) |
| Pseudocode | A numbered list in a figure; see [Pseudocode](#pseudocode) | `lovelace`, `algo` |
| Flowcharts and node diagrams | `@preview/fletcher`, written by the composer | |
| Drawings with coordinates (TikZ) | `@preview/cetz:0.5.3` in a `diagrams/` file | |
| Charts from data (pgfplots) | `@preview/lilaq:0.6.0` in a `diagrams/` file, or a saved SVG in `figures/` | |

- Plain Typst covers everything else in this guide in a few lines of preamble, so the document compiles offline on the first try, on any computer, with any Typst version from 0.15 on.
- A drawing file imports its package on its first line, at an exact version: `#import "@preview/cetz:0.5.3"`. Typst downloads it the first time and keeps it in Spectrum's package cache, so later compiles work offline. Never write a version without all three numbers.
- The composer chooses fletcher's version from the project's Typst version (0.5.8 for 0.13 and later). Leave its import line as it wrote it.
- If a document truly needs a package for something this guide does not cover (chemistry, say), import it at an exact version in a `// Packages` group at the very top of `main.typ`, with a comment saying what it gives. Compile it and tell the user that the document now needs the internet on its first compile.
- Do not copy package files into a project. Spectrum's package cache already keeps them, and a copied package is easy to leave out of date.

## The preamble

### Order

The groups always come in this order. Leave out a group the document does not need, but do not reorder them.

| Heading | Holds |
| --- | --- |
| `// Packages` | Only in the rare document that needs one (see [Packages](#packages)). Absent from the standard preamble. |
| `// Document` | `#set document(title: ..., author: ...)` |
| `// References` | `#set bibliography(title: [References])` |
| `// Page` | `#set page`, `#set text`, `#set par`, `#set heading` |
| `// Maths` | Equation numbering, the theorem rules and numbering by section when the document uses it |
| `// Figures and tables` | Caption positions, table digits, the sub-figure rules |
| `// Code` | `#set raw` and the code box |
| `// Links` | Only in the CV, which colours its links |

Within a group, set rules come first, then show rules that only set something (`#show figure.where(...): set ...`), then show rules with a function (`#show ref: it => ...`). Typst applies rules from where they are written onwards, so a rule must come before the text it styles.

After the groups come the document's own definitions (`#let`): the sub-figure, the theorem set and the proof. Then the title block, then the body. In a document with chapters the definitions live in `style.typ` instead and `main.typ` imports them straight after the groups.

### Comments

Every set and show rule line ends with a comment that says, in plain words, what it does for this document. The comments line up in one column (column 49), and a line too long for that gets a single space before its comment. A rule that runs over several lines has its comment on the first line. Write for a student who has never seen Typst. Say what it gives them, not what it is.

```typst
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#show table: set text(number-width: "tabular")  // digits of equal width, so numbers line up in columns
```

Comments are `//` line comments. Do not use `/* ... */` blocks in a Spectrum document.

### The standard preamble

This is the canonical preamble, followed by the title block of an article. Start from it and remove what the document does not use.

```typst
// Document
#set document(                                  // the title and author, also shown in the PDF's properties
  title: [Rooftop solar output across a Melbourne year],
  author: "Your Name",
)

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1

// Maths
#set math.equation(numbering: "(1)")            // number display equations: (1), (2), ...
#show figure.where(kind: "theorem"): it => align(start, it.body) // a theorem draws its own heading, left aligned
#show heading.where(level: 1): it => {          // theorems count again in each section: 2.1, 2.2, ...
  counter(figure.where(kind: "theorem")).update(0)
  it
}

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures
#show table: set text(number-width: "tabular")  // digits of equal width, so numbers line up in columns
#show figure.caption.where(kind: "subfigure"): it => [#context it.counter.display(it.numbering) #it.body] // a panel's caption: (a) Measured output.
#show figure: it => {                           // each figure starts its panels again at (a)
  if it.kind != "subfigure" { counter(figure.where(kind: "subfigure")).update(0) }
  it
}
#show ref: it => {                              // a reference to a panel reads Figure 1a
  let panel = it.element
  if panel == none or panel.func() != figure or panel.kind != "subfigure" { return it }
  let parent = query(figure.where(kind: image).before(panel.location())).last()
  let number = parent.counter.display(parent.numbering, at: parent.location())
  link(panel.location(), [Figure~#number#numbering("a", ..panel.counter.at(panel.location()))])
}

// Code
#set raw(tab-size: 4)                           // a tab in code is four spaces wide
#show raw.where(block: true): it => block(      // code in a light box, with line numbers down the left
  width: 100%, fill: luma(249), stroke: 0.5pt + luma(204), inset: (x: 0.5em, y: 0.65em),
  grid(columns: (auto, 1fr), column-gutter: 0.8em, row-gutter: 0.65em, align: (right, start),
    ..it.lines.map(line => (text(fill: luma(128), size: 0.8em, str(line.number)), line)).flatten()),
)
#show figure.where(kind: raw): set figure.caption(position: top) // listing captions above the code
#show figure.where(kind: raw): set block(breakable: true) // a long listing may run onto the next page

// A panel of a figure: #subfigure(image(...), caption: [...]) <fig:name>, numbered (a), (b), ...
#let subfigure = figure.with(kind: "subfigure", supplement: [Figure], numbering: "(a)")

// Theorem-like environments, all sharing one counter per section: Theorem 2.1, Example 2.2, ...
#let theorem-number = n => numbering("1.1", counter(heading).get().first(), n)
#let theorem-like(name, head-style: strong, body-style: body => body) = (title: none, body) => figure(
  kind: "theorem", supplement: name, numbering: theorem-number, outlined: false,
  [
    #head-style[#name #context counter(figure.where(kind: "theorem")).display(theorem-number)#if title != none [ (#title)].]
    #body-style(body)
  ],
)
#let theorem = theorem-like([Theorem], body-style: emph)     // italic text, for statements
#let lemma = theorem-like([Lemma], body-style: emph)
#let corollary = theorem-like([Corollary], body-style: emph)
#let definition = theorem-like([Definition])                 // upright text, for definitions and examples
#let example = theorem-like([Example])
#let remark = theorem-like([Remark], head-style: emph)       // italic heading and upright text, for asides
#let proof(body, name: [Proof]) = block(width: 100%)[_#name._ #body #h(1fr) $square$] // ends with the proof box
#let solution = proof.with(name: [Solution])

#align(center)[
  #title()
  Your Name \
  #datetime.today().display("[day padding:none] [month repr:long] [year]")
]
```

- `#title()` prints the title from `#set document`, so it is written once. Keep the PDF title and the printed title the same.
- The date prints as 3 November 2026. Write `[day padding:none]`, or Typst prints 03.
- The document ends with `#bibliography("refs.bib", style: "apa")`.

### What Typst does without being told

These need no line in the preamble, and a document should not add one:

| LaTeX line | Why Typst needs nothing |
| --- | --- |
| `\usepackage{parskip}` | Typst already puts space between paragraphs (`par.spacing`, 1.2em) and indents no first lines. |
| Single spacing, no `setspace` | Typst's default line spacing is single spacing. Do not change `par.leading`. |
| `fontenc`, `lmodern`, `iftex` | Typst always works in Unicode with its bundled fonts. |
| `microtype` | Typst already lets punctuation hang into the margin (`text.overhang`). |
| `hyperref` with `hidelinks` | Links, references and citations are clickable and drawn without boxes. The outline becomes the PDF's bookmarks. |
| `pdflang = {en-AU}` | `#set text(lang: "en", region: "AU")` writes `en-AU` into the PDF. |
| `float` and `[H]` | A Typst figure stays where it is written unless given a `placement`. |

### Page settings by document type

Every document uses 25 mm margins and single line spacing, except the CV.

| Document | Page and text | Other |
| --- | --- | --- |
| Article, notes, assignment | `paper: "a4", margin: 25mm, numbering: "1"`, 11 pt | the title block |
| Report or thesis | as the article | title page, roman front matter, `#outline` for contents and lists of figures and tables, chapters; see [Document structure](#document-structure) |
| Simple document | as the article | no title page or contents |
| CV | `margin: (x: 20mm, y: 18mm)`, 10 pt, `numbering: none` | accent colour, no heading numbers |
| Letter | `numbering: none`, 11 pt, `par(justify: false)` | no title block |
| Slides | none | Spectrum has no Typst slides template. Use the LaTeX slides template. |

## Language and text

- Australian English spelling (colour, behaviour, organise, analyse), with `#set text(lang: "en", region: "AU")`.
- Dates are written day month year: `3 November 2026`. Type them, or print today's with `datetime.today().display("[day padding:none] [month repr:long] [year]")`.
- Quotation marks are single. Type straight quotes, `'like this'`, and Typst curls them. Double quotes, `"like this"`, are for a quotation inside a quotation.
- `~` is a space that never breaks a line. Use it between a number and its unit (`25~mm`) and before a reference number that is typed by hand.
- Write `\` at the end of a line for a line break, and a blank line for a new paragraph.
- Plain, direct sentences. A template's sample text explains what it shows, for example "Use `@Masters2013` for a citation in parentheses".

## Units and numbers

Typst has no siunitx. Spectrum writes quantities as text, by the same rules siunitx applies: the number, a non-breaking space, then the unit's symbol in upright text.

| Write | Not | Prints | siunitx |
| --- | --- | --- | --- |
| `4.7~kΩ` | `$4.7 "k" Omega$`, `4.7kΩ` | 4.7 kΩ | `\qty{4.7}{\kilo\ohm}` |
| `13~V/µs` | `13 V/$mu$s` | 13 V/µs | `\qty{13}{\volt\per\micro\second}` |
| `±15~V` | `$plus.minus$15 V` | ±15 V | `\qty{\pm 15}{\volt}` |
| `$47 times 10^3$~Ω` | `47e3 Ω` | 47 × 10³ Ω | `\qty{47e3}{\ohm}` |
| `(1.2~±~0.1)~m` | `1.2±0.1 m` | (1.2 ± 0.1) m | `\qty{1.2 \pm 0.1}{\metre}` |
| `Hz` | `$"Hz"$` | Hz | `\unit{\hertz}` |
| `7,790` | `7790`, `7 790`, `$7,790$` | 7,790 | `\num{7790}` |
| `22.5°` | `22.5~°`, `$22.5 degree$` | 22.5° | `\ang{22.5}` |
| `65~°C` | `65°C` | 65 °C | `\qty{65}{\degreeCelsius}` |
| `19.0~%` | `19.0%` | 19.0 % | `\qty{19.0}{\percent}` |

- Type the symbols themselves: Ω, µ, °, ±, ×, ², ³. Where a symbol is hard to type, `#sym.Omega` and `#sym.plus.minus` print the same.
- Numbers of four or more digits take a comma between groups of three: `7,790`, `12,345.678`. Never a space, which a screen reader can read as two numbers. Years and the like (`2026`, page `1024`) take no comma.
- Keep numbers with commas in text, not maths: in maths Typst puts a space after the comma.
- A minus sign is typed `-`: Typst prints a proper minus before a digit, as in `-5.4`.
- Use one solidus for a rate, `V/µs` and `m/s²`, never two.
- In running prose a percentage is written in words, `6 per cent`. In a table or next to other measured values, use `19.0~%`.
- Values that are compared use the same unit, prefix and number of decimal places.
- Do not use maths for a unit: Typst sets maths letters in italic, and `kΩ` is not a product of `k` and `Ω`.
- Where a quantity has to sit inside an equation, as in a worked calculation, put the unit in quotes after a thin space: `$f_c approx 1.03 thin "kHz"$`. Typst sets quoted text upright.

## Maths

- Inline maths is `$x$`. Display maths has a space inside each dollar: `$ P = eta A G $`.
- Every display equation is numbered by the preamble. Give one a label right after its closing `$`: `$ P = eta A G $ <eq:power>`.
- An equation that should not be numbered is `#math.equation(block: true, numbering: none, $ ... $)`.
- Several aligned lines are one equation with `&` and `\`, and take one number. Write separate equations when each line needs its own number.
- Refer to equations with `@eq:power`, which prints "Equation 1". Do not type "Equation" or brackets around it.
- Vectors are bold upright, `upright(bold(x))`: Typst's `bold(x)` alone is bold italic. Sets of numbers use `RR`, `NN`, `ZZ`.
- Subscripts that are words or labels are upright: `R_"in"`, `eta_"ref"`. Subscripts that are variables stay italic: `x_i`.
- Typst sizes brackets to their contents. Use `lr((...), size: #120%)` for brackets that need to be a little larger, and `thin` between multiplied symbols where it helps reading (`eta thin A thin G`).
- In notes and assignments, number equations, figures and tables by section. Put this block at the end of the `// Maths` group:

```typst
// Number equations, figures and tables by section: (2.1), Figure 2.1, ...
#let by-section(pattern) = n => numbering(pattern, counter(heading).get().first(), n)
#set math.equation(numbering: by-section("(1.1)")) // equations: (2.1), (2.2), ...
#set figure(numbering: by-section("1.1"))       // figures, tables and listings: 2.1, 2.2, ...
#show heading.where(level: 1): it => {          // every section starts these counts again at 1
  counter(math.equation).update(0)
  counter(figure.where(kind: image)).update(0)
  counter(figure.where(kind: table)).update(0)
  counter(figure.where(kind: raw)).update(0)
  it
}
```

With this block `@eq:power` prints "Equation (2.1)".

### Theorems and worked examples

The standard preamble defines the house theorem set. All its environments share one counter per section, so they read Theorem 2.1, Example 2.2 and so on, as in the LaTeX set. Leave out the definitions the document does not use.

```typst
= Primes

#theorem(title: [Euclid])[There are infinitely many prime numbers.] <thm:euclid>

#proof[Suppose there were finitely many. Their product plus one has a prime factor not in the list.]

#definition[A number is _prime_ when it has exactly two divisors.] <def:prime>

#example[Find $x$ when $2x = 4$.] <ex:first>

#solution[Divide both sides by 2, so $x = 2$.]

#remark[Any proof needs only one prime outside the list.]

@thm:euclid rests on @def:prime, and @ex:first is a warm-up.
```

- A worked example is an `#example` followed by a `#solution`, which ends with the proof box.
- A theorem's optional name goes in `title:`, and its label after the closing bracket.
- Theorems use the `thm:`, `lem:`, `def:` and `ex:` prefixes, and `@thm:euclid` prints "Theorem 1.1".

## Figures

- A figure is `#figure(image(...), caption: [...]) <fig:...>`. The caption goes below the picture.
- Captions are sentences: they start with a capital and end with a full stop.
- Images live in `figures/` and are included with `image("/figures/name.png", width: 75%)`.
- Prefer drawing in Typst (a composer diagram, CeTZ or Lilaq in `diagrams/`) or an SVG over a screenshot of a plot, so the text stays sharp.
- A figure stays where it is written, like LaTeX's `[H]`. In a long document, `placement: auto` lets it move to the top or bottom of a page, like `[ht]`.

```typst
#figure(
  image("/figures/measured.png", width: 75%),
  caption: [Measured output across the year.],
) <fig:measured>
```

### Image sizes

Size an image one way, chosen from these:

| Way | Write | Use it for |
| --- | --- | --- |
| A share of the line | `width: 75%` | Most images. It keeps the layout when the margins or columns change. |
| An exact width | `width: 60mm` | Images that must be a set size, such as a logo. |
| An exact height | `height: 40mm` | Images of different shapes side by side, so they line up. Tall images such as a phone screenshot. |
| A box it fits in | `width: 60mm, height: 40mm, fit: "contain"` | Images of unknown shape that must not exceed a size. |
| A scale | `scale(50%, reflow: true, image(...))` | Rarely: it depends on the size the file was saved at. |

- Typst cannot crop an image. Crop the file itself, or leave the image whole.
- Never set both `width` and `height` without `fit: "contain"`: Typst's default fit, `"cover"`, cuts off the edges.

### Several images in one figure

Put images that belong together in one figure, laid out in a `grid`. Spectrum's Insert figure offers three kinds, side by side or in a grid of two to four columns.

**Sub-figures (a), (b)** share one figure number and caption, and each has a short caption and a label of its own. Each panel is a `#subfigure`, defined in the standard preamble.

```typst
#figure(
  grid(
    columns: (1fr, 1fr), column-gutter: 1em, align: bottom,
    [#subfigure(image("/figures/measured.png", width: 100%), caption: [Measured output.]) <fig:measured>],
    [#subfigure(image("/figures/modelled.png", width: 100%), caption: [Modelled output.]) <fig:modelled>],
  ),
  caption: [Energy across the year.],
) <fig:energy>

@fig:measured and @fig:modelled make up @fig:energy.
```

- `@fig:measured` prints "Figure 1a" and `@fig:energy` prints "Figure 1".
- Each panel sits in square brackets with its label, because a label in Typst attaches to the element just before it in markup.
- `columns: (1fr, 1fr)` gives two equal columns, `(1fr, 1fr, 1fr)` three and so on up to four. Inside a panel, `width: 100%` fills the panel. More panels than columns run on to a new row; add `row-gutter: 1em`.

**Separate figures** side by side each have their own number (Figure 2 and Figure 3), caption and label: a grid of ordinary figures, with no outer figure.

```typst
#grid(
  columns: (1fr, 1fr), column-gutter: 1em, align: bottom,
  [#figure(image("/figures/measured.png", width: 100%), caption: [Measured output.]) <fig:left>],
  [#figure(image("/figures/modelled.png", width: 100%), caption: [Modelled output.]) <fig:right>],
)
```

**One caption** puts the images together under a single caption and label, with no letters: a grid of plain images inside one `#figure`.

**Lining up** panels of different heights is the grid's `align`:

| Line up | Write | Result |
| --- | --- | --- |
| Bottoms | `align: bottom` | The images' bottoms line up, so the captions under them start level. The default. |
| Centres | `align: horizon` | The panels' centres line up. |
| Tops | `align: top` | The panels' tops line up. Unlike LaTeX, this needs no trick. |

### Plots and drawings

Plain Typst draws lines, rectangles, circles and curves, but nothing like pgfplots or TikZ. Put a plot or drawing in its own file in `diagrams/`, import one package there at an exact version and include the file in a figure:

```typst
#import "@preview/lilaq:0.6.0" as lq           // charts drawn from data, as pgfplots draws them
#lq.diagram(
  width: 10cm, height: 5cm,
  xlabel: [Month], ylabel: [Output (kWh)],
  lq.plot(range(1, 13), (950, 820, 700, 520, 400, 330, 360, 480, 600, 760, 880, 990)),
)
```

- Set the width in centimetres or millimetres, and give axis labels as `Quantity (unit)`.
- A drawing with coordinates uses `#import "@preview/cetz:0.5.3"` in the same way.
- A plot made elsewhere (Python, R) is saved as SVG in `figures/` and included with `image`, which keeps it sharp.
- A simple plot or circuit can be drawn in plain Typst instead, with `line`, `curve`, `circle` and `place` in a fixed-size `box`, in a `diagrams/` file with no import. It then compiles offline. The Typst maths notes, electronics notes and their diagrams show how.

### Diagrams from Spectrum's composer

The composer saves each drawing as `diagrams/<name>.typ`, which imports fletcher, sets its own page when Spectrum previews it alone and ends with a `// spectrum-diagram v1 ...` line holding the drawing. Do not edit or remove that last line. Spectrum's Floats tab inserts the drawing as a figure:

```typst
#figure(include "/diagrams/flow.typ", caption: [The order of the steps.]) <fig:flow>
```

To make a diagram smaller, wrap it: `scale(80%, reflow: true, include "/diagrams/flow.typ")`.

## Tables

```typst
#figure(
  table(
    columns: 4,
    align: (left, right, right, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Season], [Measured (kWh)], [Modelled (kWh)], [Difference (%)]),
    table.hline(stroke: 0.05em),
    [Summer], [2,740], [2,810], [2.6],
    [Winter], [1,110], [1,050], [-5.4],
    table.hline(stroke: 0.05em),
    [Year], [7,790], [7,790], [0.0],
    table.hline(stroke: 0.08em),
  ),
  caption: [Energy by season, measured and modelled.],
) <tab:seasons>
```

- The caption goes above the table, through the preamble's caption rule.
- `stroke: none`, then booktabs' three rules as `table.hline`: `0.08em` at the top and bottom (`\toprule`, `\bottomrule`) and `0.05em` under the header (`\midrule`). No `table.vline`.
- The header row is `table.header(...)`, so it repeats if the table runs across pages and is marked as a header in the PDF.
- Text columns are `left`, number columns are `right`, and units go in the column heading, not in every cell.
- One row per line in the source, with the cells of a row on that line.

### Choosing the layout

| Layout | Write | Width | Use it for |
| --- | --- | --- | --- |
| Natural | `columns: 4` | Each column as wide as its widest cell | Short entries and numbers. The default. |
| Full width | `columns: (auto, auto, 1fr)` | Exactly the line; `1fr` columns share the spare width and wrap | Tables with sentences in them, like `tabularx`. |
| Long | A full width or natural table in a breakable figure | As above, and runs across pages | Long tables only, such as data listings or appendices, like `xltabular`. |

A long table puts its rules inside `table.header`, so the top rule and the header repeat on every page. Its figure is made breakable inside a `#[ ... ]` block, so only this figure is affected:

```typst
#[
  #show figure: set block(breakable: true)      // this table may run across pages
  #figure(
    table(
      columns: (auto, auto, 1fr),
      align: (left, right, left),
      stroke: none,
      table.header(
        table.hline(stroke: 0.08em),
        [Month], [Output (kWh)], [Notes],
        table.hline(stroke: 0.05em),
      ),
      [January], [950.0], [Hot and clear.],
      [February], [820.0], [Two days of storms.],
      table.hline(stroke: 0.08em),
    ),
    caption: [Readings over the year.],
  ) <tab:readings>
]
```

Typst has no "Continued on the next page" line like `\endfoot`; the repeated header is enough.

### Numbers: lining up decimals

Typst has no `S` column. Number columns line up on the decimal point when:

- the column is `right` aligned,
- every number in it has the same number of decimal places (`2.6`, `-5.4`, `0.0`), which the comparison rule in [Units and numbers](#units-and-numbers) asks for anyway, and
- the preamble's `#show table: set text(number-width: "tabular")` gives every digit the same width.

Write the commas yourself (`2,740`). Text in a number column, such as `n/a`, is right aligned with the numbers.

### Merged cells and grouped headings

```typst
#figure(
  table(
    columns: 3,
    align: (left, right, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header(
      table.cell(rowspan: 2, align: horizon)[Season], table.cell(colspan: 2, align: center)[Energy (kWh)],
      table.hline(start: 1, end: 3, stroke: 0.03em),
      [Measured], [Modelled],
    ),
    table.hline(stroke: 0.05em),
    [Summer], [2,740], [2,810.5],
    [Winter], [1,110], [1,050.0],
    table.hline(stroke: 0.08em),
  ),
  caption: [Energy by season, with a grouped heading.],
) <tab:grouped>
```

- Merge across columns with `table.cell(colspan: n)[...]` and centre a merged heading with `align: center`.
- Merge down rows with `table.cell(rowspan: n)[...]`, and leave out the cells it covers.
- Under a heading that spans a group of columns, draw `table.hline(start: a, end: b, stroke: 0.03em)`, the `\cmidrule`. Columns count from 0 and `end` is the column after the last. Typst cannot trim the rule's ends as `(lr)` does; leave `column-gutter` at its default so neighbouring groups stay apart.
- A rule must not cross a cell merged down the rows. Start it after that cell instead.
- In a table with a merged header, all the header rows go in `table.header`.

### Line breaks and notes

- For a line break inside a cell, write `\` in the cell: `[First line \ second line]`. No package is needed.
- For notes under a table, mark the cell with `#super[a]` and put the notes under the table inside the same figure, in smaller text.

```typst
#figure(
  [
    #table(
      columns: 2,
      align: (left, right),
      stroke: none,
      table.hline(stroke: 0.08em),
      table.header([Method], [Score#super[a]]),
      table.hline(stroke: 0.05em),
      [Ours], [0.91],
      table.hline(stroke: 0.08em),
    )
    #text(size: 0.9em)[#super[a] Averaged over five runs.]
  ],
  caption: [Results.],
) <tab:results>
```

## Code

### Listings

Code blocks are Typst `raw` blocks, written between three backticks with the language after them. The standard preamble's `// Code` group puts every code block in a light box with line numbers, wraps long lines and keeps straight quotes as typed. Typst highlights the syntax itself.

````typst
#figure(
  ```python
  import heapq

  def shortest(graph, start):
      queue = [(0, start)]  # the nearest vertex comes out first
      return heapq.heappop(queue)
  ```,
  caption: [Dijkstra's algorithm in Python.],
) <lst:python>
````

- Give every block a language: `python`, `c`, `java`, `matlab`, `bash`, `sql`, `typst`, `latex`. Use one Typst knows by name, as 0.15 warns about unclear tags.
- A listing with a caption is a `#figure` around the block, with a `lst:` label. `@lst:python` prints "Listing 1", and the caption goes above the code, as in `listings`.
- Short code in a sentence uses single backticks: `` `heapq.heappop(queue)` ``. A language can be added with `` ```py heapq.heappop(queue)``` ``.
- A listing figure may break across pages, so long code runs on rather than leaving a gap.
- Typst reads Unicode, so code may hold accented letters. Keep code ASCII anyway when the same code also appears in a LaTeX document.
- Code in the document should run as shown, with comments in the code where a reader needs them, and the expected output as a trailing comment where useful.

### Pseudocode

Plain Typst has no algorithm environment. Write pseudocode as a figure of kind `"algorithm"` holding a numbered list:

```typst
#figure(
  kind: "algorithm", supplement: [Algorithm],
  caption: [Shortest distances from one vertex.],
  align(start)[
    *Input:* a graph $G$ with weights $w$ and a start vertex $s$ \
    *Output:* the distance $d(v)$ to every vertex $v$
    + $d(v) <- infinity$ for every vertex $v$, and $d(s) <- 0$
    + *while* the queue $Q$ is not empty *do*
    + #h(1.5em) $u <-$ the vertex in $Q$ with the least $d(u)$ #h(1fr) $triangle.r$ nearest first
    + #h(1.5em) *for each* edge $(u, v)$ *do* $d(v) <- min(d(v), d(u) + w(u, v))$
    + *return* $d$
  ],
) <alg:dijkstra>
```

- Start with *Input:* and *Output:*, use `<-` for assignment and maths for every variable. End a line with `#h(1fr) $triangle.r$ ...` for a short comment.
- Indent the body of a loop with `#h(1.5em)` at the start of the item, so the line numbers keep counting.
- `@alg:dijkstra` prints "Algorithm 1".

## References

```typst
#bibliography("refs.bib", style: "apa")
```

- APA 7 through Typst's built-in style `"apa"` (in full, `"american-psychological-association"`). The preamble's `#set bibliography(title: [References])` heads the list References, as APA asks.
- Keep the call exactly as above, with the path as a plain string: Spectrum's References tab, its citation checks and the template test look for it.
- Cite in parentheses with `@Masters2013`, which prints (Masters, 2013). Cite in a sentence with `#cite(<Masters2013>, form: "prose")`, which prints Masters (2013).
- Typst merges citations written next to each other: `@Masters2013 @Duffie2013` prints (Duffie & Beckman, 2013; Masters, 2013).
- Add a page in brackets: `@Masters2013[p.~45]` prints (Masters, 2013, p. 45).
- `form: "author"` prints only the author and `form: "year"` only the year. `#cite(<key>, form: none)` lists a work without citing it in the text, like `\nocite`.
- The bibliography goes at the end of the document, and appears in the contents by itself.
- Typst 0.15 allows several bibliographies in one document. A Spectrum document has one.
- Typst prints the References heading even when nothing is cited, where `\printbibliography` prints nothing. Notes that may cite nothing yet add one line to the `// References` group, so the list appears with the first citation:

```typst
#show bibliography: it => context if query(cite).len() > 0 { it } // no References heading until something is cited
```

```typst
As #cite(<Masters2013>, form: "prose") shows, output follows the sun @Duffie2013.
Several sources agree @Masters2013 @WorldHealth2024, and the losses are small @Masters2013[p.~45].

#bibliography("refs.bib", style: "apa")
```

### The .bib file

The bibliography is a BibTeX `.bib` file, the same as in a LaTeX document, and the keys follow the same rules (`baseKey` in `apps/backend/src/services/referenceService.js`): the first author's surname with a capital letter, then the year, with no spaces or punctuation, such as `Masters2013`, `VanderWaals1873`, `Godel1931`, `OpenAI2023` and `Smith2020a`. See [The .bib file](LATEX_STYLE.md#the-bib-file) in the LaTeX guide for the full rules and an example entry.

- Do not write Hayagriva `.yml` files in a Spectrum document. Typst reads them, but Spectrum's References tab writes BibTeX, and a `.bib` file serves a LaTeX version of the same document too.
- Typst reads accents written as LaTeX commands (`G{\"o}del`) and prints `{\LaTeX}` as LaTeX. Protect capitals with braces, as for LaTeX.

## Cross-references and labels

- Every reference is `@label`: figures, tables, sections, chapters, appendices, equations, listings, algorithms, theorems and examples. Never type the name before it, as in `Figure @fig:monthly`. Typst prints "Figure 4", "Table 2", "Section 3.1", "Equation 1", "Listing 1", "Theorem 2.1" for you.
- Put the label right after what it names: after the closing `)` of a `#figure`, at the end of a heading line (`= Results <sec:results>`), after the closing `$` of an equation, after the closing `]` of a theorem.
- A reference to a heading needs numbered headings, which the standard preamble sets.
- Every label has a type prefix, the same as in LaTeX:

| Prefix | For |
| --- | --- |
| `ch:` | chapter |
| `sec:` | section |
| `app:` | appendix |
| `eq:` | equation |
| `fig:` | figure |
| `tab:` | table |
| `lst:` | code listing |
| `alg:` | algorithm |
| `thm:`, `lem:`, `def:`, `ex:` | theorem, lemma, definition, example |

- After the prefix, use short lower-case words joined by hyphens: `fig:monthly`, `tab:system`, `eq:cutoff`.
- To refer to two things, write both: `@eq:power and @eq:temperature`.
- To change the word Typst puts before the number, give it in brackets: `@sec:results[Part]` prints Part 3.

## Links and PDF details

- Links are drawn without boxes or colour. A CV colours them with its accent colour (see [CV and letter extras](#cv-and-letter-extras)).
- Always set `title` and `author` in `#set document`. `lang: "en", region: "AU"` writes the PDF's language as en-AU.
- A web address in the text is `#link("https://example.com")`, or a bare `https://...`, which Typst links by itself.

## Document structure

- Articles: the title block, then `=` sections. A report adds a title page, an abstract and acknowledgements as unnumbered headings, the contents, lists of figures and tables, then chapters.
- In a report, the title page has no number, the front matter is numbered `i`, `ii`, `iii` and the chapters start again at 1. A `#set page` starts a new page by itself.

```typst
#set page(numbering: none)                      // the title page has no number
#align(center + horizon)[
  #title()
  Your Name \
  #datetime.today().display("[day padding:none] [month repr:long] [year]")
]

#set page(numbering: "i")                       // front matter: i, ii, iii
#counter(page).update(1)
#heading(numbering: none)[Abstract]
What the report found, in one paragraph.

#outline(title: [Contents])
#outline(title: [List of figures], target: figure.where(kind: image))
#outline(title: [List of tables], target: figure.where(kind: table))

#set page(numbering: "1")                       // chapter 1 starts again at 1
#counter(page).update(1)
```

- In a report, a level 1 heading is a chapter. Add these two rules to the `// Page` group, so `@ch:...` prints "Chapter 2" and each chapter starts a new page:

```typst
#show heading.where(level: 1): set heading(supplement: [Chapter]) // references to a chapter read Chapter 2
#show heading.where(level: 1): it => pagebreak(weak: true) + it // each chapter starts on a new page
```

- Long chapters go in their own files with `#include "chapters/name.typ"`.
- Appendices come after the bibliography, numbered A, B, C:

```typst
#counter(heading).update(0)                     // appendices count again from A
#set heading(numbering: "A.1")                  // Appendix A, then A.1 for its sections
#show heading.where(level: 1): set heading(supplement: [Appendix]) // references read Appendix A
```

- Indent the arguments of a function call by two spaces, one argument per line when they do not fit on one line, with a comma after the last. Keep source lines to about 100 characters, breaking at the end of a sentence or clause.

## CV and letter extras

The CV keeps its look in a few lines that are easy to change:

```typst
#let accent = rgb(0, 82, 147)                   // a deep blue; change it to restyle the whole CV
#set page(paper: "a4", margin: (x: 20mm, y: 18mm), numbering: none) // narrower margins and no page numbers
#set text(size: 10pt, lang: "en", region: "AU") // 10 pt fits more on a page
#set heading(numbering: none)                   // section headings without numbers
#show heading.where(level: 1): set text(fill: accent) // coloured section headings
#show heading.where(level: 1): it => block(below: 0.6em, stroke: (bottom: 0.5pt + accent), inset: (bottom: 0.3em), width: 100%, it.body) // a rule under each heading

// Links
#show link: set text(fill: accent)              // links in the accent colour

// One line per entry: what on the left, when on the right, details below
#let entry(what, when, details) = [*#what* #h(1fr) #when \ #details]

= Experience

#entry[Engineering intern, Example Company][2022--2023][Worked with the structural team on bridge inspections.]
```

A `grid` of plain text, such as a list of skills, needs `row-gutter: 0.65em`: without it the rows touch, and one row's descenders run into the next.

Letters and CVs use `numbering: none`, since they have no page numbers. A letter sets `#set par(justify: false)` and has no title block.

## From LaTeX

Each rule in [LATEX_STYLE.md](LATEX_STYLE.md) and its Typst equivalent in this guide. A converter from a Spectrum LaTeX document writes the right-hand column.

| LaTeX | Typst |
| --- | --- |
| `\documentclass[11pt,a4paper]{article}` | `#set page(paper: "a4")`, `#set text(size: 11pt)` |
| `\usepackage[margin=25mm]{geometry}` | `margin: 25mm` in `#set page` |
| `parskip`, `microtype`, `fontenc`, `lmodern`, `iftex` | Nothing (see [What Typst does without being told](#what-typst-does-without-being-told)) |
| `\usepackage[australian]{babel}`, `pdflang = {en-AU}` | `#set text(lang: "en", region: "AU")` |
| `\title`, `\author`, `pdftitle`, `pdfauthor` | `#set document(title: [...], author: "...")` |
| `\maketitle` | The title block with `#title()` |
| `\today` | `datetime.today().display("[day padding:none] [month repr:long] [year]")` |
| `\usepackage[hidelinks]{hyperref}` | Nothing |
| `% comment` | `// comment` |
| `\newcommand` | `#let` |
| `\usepackage{...}` | Nothing, or a pinned import in a `diagrams/` file (see [Packages](#packages)) |
| `\enquote{text}`, `` `text' `` | `'text'` |
| `25\,mm` | `25~mm` |
| `\qty{4.7}{\kilo\ohm}` | `4.7~kΩ` |
| `\qty{13}{\volt\per\micro\second}` | `13~V/µs` |
| `\qty{\pm 15}{\volt}` | `±15~V` |
| `\qty{47e3}{\ohm}` | `$47 times 10^3$~Ω` |
| `\unit{\hertz}` | `Hz` |
| `\num{7790}` | `7,790` |
| `\ang{22.5}` | `22.5°` |
| `\qty{65}{\degreeCelsius}` | `65~°C` |
| `\qty{19.0}{\percent}` | `19.0~%` |
| `\begin{equation} ... \label{eq:x} \end{equation}` | `$ ... $ <eq:x>` |
| `\[ ... \]` | `#math.equation(block: true, numbering: none, $ ... $)` |
| `align` | `$ a &= b \ &= c $` (one number), or one equation per numbered line |
| `\numberwithin{equation}{section}` and the like | The by-section block in [Maths](#maths) |
| `\mathbf{x}`, `\mathbb{R}` | `upright(bold(x))`, `RR` |
| `R_\mathrm{in}`, `\text{if}` | `R_"in"`, `"if"` |
| `\bigl( ... \bigr)`, `\,` | `lr((...), size: #120%)`, `thin` |
| `\newtheorem` set, `\theoremstyle` | The house theorem set in the standard preamble |
| `\begin{theorem}[Euclid] ... \label{thm:e}` | `#theorem(title: [Euclid])[...] <thm:e>` |
| `\begin{proof}`, the `solution` environment | `#proof[...]`, `#solution[...]` |
| `\begin{figure}[H]`, `\centering`, `\includegraphics`, `\caption`, `\label` | `#figure(image("/figures/x.png", width: 75%), caption: [...]) <fig:x>` |
| `[ht]` | `placement: auto` |
| `width=0.75\linewidth`, `width=60mm`, `height=40mm` | `width: 75%`, `width: 60mm`, `height: 40mm` |
| `width=60mm,height=40mm,keepaspectratio` | `width: 60mm, height: 40mm, fit: "contain"` |
| `scale=0.5` | `scale(50%, reflow: true, image(...))` |
| `trim=...,clip` | No equivalent: crop the file |
| `subfigure` from `subcaption`, `0.48\linewidth` panels, `\hfill` | `#subfigure(...)` in a `grid` with `columns: (1fr, 1fr)` and `column-gutter: 1em` |
| `minipage` figures side by side | A `#grid` of `#figure`s |
| `[t]`, `[c]`, the `\vtop` trick | `align: bottom`, `align: horizon`, `align: top` |
| `\includestandalone{diagrams/amp}` | `include "/diagrams/amp.typ"` |
| pgfplots, TikZ, circuitikz | A `diagrams/` file with Lilaq or CeTZ, or an SVG |
| `\begin{table}`, caption above | `#figure(table(...), caption: [...]) <tab:x>`, caption above by the preamble |
| `\toprule`, `\midrule`, `\bottomrule` | `table.hline(stroke: 0.08em)`, `0.05em`, `0.08em` with `stroke: none` |
| `\cmidrule(lr){2-3}` | `table.hline(start: 1, end: 3, stroke: 0.03em)` |
| `l`, `c`, `r` columns | `align: (left, center, right)` |
| `S[table-format=4.1]` | `right`, equal decimals, the preamble's tabular digits |
| `{Measured (kWh)}` heading in an `S` column | `[Measured (kWh)]` |
| `tabularx` with `X` | `columns: (auto, 1fr)` |
| `xltabular` with `\endhead` | A breakable figure with the rules inside `table.header` |
| `\multicolumn{2}{c}{...}`, `\multirow{2}{*}{...}` | `table.cell(colspan: 2, align: center)[...]`, `table.cell(rowspan: 2)[...]` |
| `\makecell{a \\ b}` | `[a \ b]` |
| `threeparttable`, `\tnote{a}` | `#super[a]` and a note under the table in the figure |
| `lstlisting` with the `report` style | A `raw` block with a language, in the house code box |
| `caption=..., label={lst:x}` | `#figure(```lang ...```, caption: [...]) <lst:x>` |
| `\lstinline` | `` `code` `` |
| `algorithm`, `algpseudocode` | A figure of kind `"algorithm"` with a numbered list |
| `\addbibresource{references.bib}`, `\printbibliography` | `#bibliography("refs.bib", style: "apa")` at the end |
| `\parencite{key}`, `\citep{key}` | `@key` |
| `\textcite{key}`, `\citet{key}` | `#cite(<key>, form: "prose")` |
| `\parencite[p.~45]{key}` | `@key[p.~45]` |
| `\parencite{a,b}` | `@a @b` |
| `\citeauthor`, `\citeyear`, `\nocite` | `form: "author"`, `form: "year"`, `form: none` |
| `\cref{fig:x}` | `@fig:x` |
| `\label{sec:x}` after `\section{...}` | `= ... <sec:x>` |
| `\section`, `\subsection`, `\chapter` | `=` and `==`; in a report, `=` with the Chapter supplement |
| `\include{chapters/x}` | `#include "chapters/x.typ"` |
| `\tableofcontents`, `\listoffigures`, `\listoftables` | `#outline(...)` |
| `\pagenumbering{alph}`, `{roman}`, `{arabic}` | `#set page(numbering: none)`, `"i"`, `"1"`, with `#counter(page).update(1)` |
| `\appendix` | The appendix block in [Document structure](#document-structure) |
| `\pagestyle{empty}` | `numbering: none` |

## Checklist for an agent

Before handing back a new `.typ` file, check that:

1. `#set page` is `paper: "a4", margin: 25mm` (or the table above for a CV), and `#set text` is `size: 11pt, lang: "en", region: "AU"`.
2. The preamble groups are in the order Document, References, Page, Maths, Figures and tables, Code, each with a `//` heading, and the `#let` definitions follow them.
3. Every set and show rule has a plain English comment, lined up with the others.
4. There is no `@preview` import outside `diagrams/`, and every import in `diagrams/` has an exact version.
5. The spelling is Australian, and the date prints without a leading zero.
6. Every number with a unit is the number, `~` and the unit's symbol in text, with commas in numbers of four or more digits.
7. The document ends with `#bibliography("refs.bib", style: "apa")` and the preamble sets the title to References. The keys are in Spectrum's `AuthorYear` form. A letter or CV, which cites nothing, has no bibliography.
8. Every figure, table, equation, listing, algorithm and theorem that is referred to has a prefixed label, and every reference is `@label`.
9. Tables have `stroke: none`, booktabs rules as `table.hline`, a `table.header`, captions above, right-aligned number columns with equal decimals. Only a table longer than a page has a breakable figure. Figures have captions below.
10. Images are sized one way from [Image sizes](#image-sizes), with paths from the project root, and images that belong together are `subfigure` panels in a grid.
11. Every code block has a language, and every listing that is referred to is a figure with a caption and a `lst:` label.
12. The document compiles in Spectrum with the built-in Typst without errors or warnings.

## The templates and this standard

Spectrum's seven Typst templates follow this standard: `typst-document`, `typst-report`, `typst-maths-notes`, `typst-electronics-notes`, `typst-coding-report`, `typst-letter` and `typst-cv`. The maths notes, electronics notes and coding report carry the same content as their LaTeX versions. There is no Typst slides template.

- Their drawings are plain Typst in `diagrams/`, with no package, so every template compiles offline on the first try.
- Each `main.typ` keeps its definitions rather than importing `style.typ`, so a template is one file to read.
- `apps/backend/test/templates.test.js` checks each one for `#set page(paper: "a4"`, `lang: "en", region: "AU"`, `#set document`, no `@preview` and no `#import`, and, apart from the letter and CV, a closing `#bibliography("refs.bib", style: "apa")` with its `refs.bib`.

Spectrum's Insert tools write plain Typst that fits this standard, with two differences:

- **Tables** from the table tool write each rule as `table.hline(y: n, ...)` with the row number, rather than between the rows. The two are the same table. A number column (`S` in the tool) is right aligned.
- **Sub-figures** from Insert figure are written as an image with `(a) caption` text under it in a `stack`, with no label for each panel, and the grid uses `columns: 2` rather than `(1fr, 1fr)`. To refer to a panel, rewrite it as a `#subfigure` with a label.
