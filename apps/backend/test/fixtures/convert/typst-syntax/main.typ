// What only Typst's own parser reads: a package's drawings, statements ended by semicolons, a #text over two lines in
// the title block, table rules that stop short of the edges, and the document's own functions, simple and not.

// Packages
#import "@preview/spectrum-sketch:0.1.0": sketch // a drawing package, a stand-in for CeTZ in the converter's tests

// Document
#set document(title: [What only Typst's own parser reads], author: "Your Name") // the title and author, also shown in the PDF's properties

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1"); #set text(size: 11pt, lang: "en", region: "AU") // two rules on one line
#set par(justify: true); #set heading(numbering: "1.1") // and two more

// Maths
#set math.equation(numbering: "(1)")            // number display equations: (1), (2), ...

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures
#show table: set text(number-width: "tabular")  // digits of equal width, so numbers line up in columns

// The document's own shorthand and functions: three to fill in, and two with logic
#let tool = [Spectrum]; #let rated(value) = [rated at #value]
#let note(body, size: 0.9em) = text(size: size, body)
#let stars(n) = for i in range(n) [★]
#let boxed(body) = { set text(weight: "bold"); box(stroke: 0.5pt, inset: 2pt, body) }

#align(center)[
  #title()
  #text(size: 12pt)[Your Name \
    School of Engineering] \
  3 November 2026
]

= Statements on one line <sec:statements>

#let speed = [13~V/µs]; The op-amp's slew rate is #speed, as @sec:pictures shows. #tool reads a resistor #rated[4.7~kΩ]
too.

#note[A note in smaller text, which cites @Masters2013[p.~45].] The rating is #stars(3), and #boxed[@tab:rules] keeps
its words.

= Pictures and tables <sec:pictures>

A package can draw in a line, #sketch(width: 14mm)[inline], or on its own:

#sketch(width: 50mm)[Outside any figure]

@fig:sketch is drawn with the package inside a figure, and @tab:rules has rules that stop short of the edges.

#figure(sketch[Inside a figure], caption: [A drawing made with a package.]) <fig:sketch>

#figure(
  table(
    columns: 4,
    align: (left, right, right, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Site], [Spring], [Summer], [Autumn]),
    table.hline(stroke: 0.05em),
    [North], [1.0], [2.0], [3.0],
    table.hline(
      start: 1,
      end: 3,
      stroke: 0.03em,
    ),
    [South], [4.0], [5.0], [6.0],
    table.hline(start: 2, stroke: 0.03em),
    [East], [7.0], [8.0], [9.0],
    table.hline(end: 2, stroke: 0.03em),
    [West], [1.5], [2.5], [3.5],
    table.hline(start: 1, end: none, stroke: 0.03em),
    [Year], [13.5], [17.5], [22.0],
    table.hline(stroke: 0.08em),
  ),
  caption: [Rules that stop short of the edges.],
) <tab:rules>

$ E = m c^2 $ <eq:energy>

@eq:energy is numbered, as #cite(<Duffie2013>, form: "prose") would expect.

#bibliography("refs.bib", style: "apa")
