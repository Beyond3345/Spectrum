// Document
#set document(title: [A stress test for the converter], author: "Your Name") // the title and author, also shown in the PDF's properties

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
#show figure.where(kind: "algorithm"): set figure.caption(position: top) // an algorithm's caption above it
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
#show figure.where(kind: raw): set figure.caption(position: top) // listing captions above the code

#import "/style.typ": *

// The document's own shorthand
#let tool = [Spectrum]

#align(center)[
  #title()
  Your Name \
  3 November 2026
]

= Text and references <sec:text>

This document exercises every construct of the house style. #tool reads it, and @sec:maths and
@sec:floats hold the maths and the floats. @sec:code has the code.

As #cite(<Masters2013>, form: "prose") shows, output follows the sun @Duffie2013. A page can be cited
too @Lamport1994[p.~12], two works at once @Masters2013 @Duffie2013, and the author and year alone:
#cite(<Knuth1984>, form: "author") and #cite(<Lamport1994>, form: "year").#footnote[A footnote with a
link to #link("https://example.com")[an example].]

// A comment on a line of its own comes over as a comment.

Single quotes look like 'this'. A web address such as #link("https://typst.app") is a link, and code in
a sentence reads `heapq.heappop(queue)`.

- A bullet point with _emphasis_ and *weight*.
- Another, with #smallcaps[small capitals].

+ The first step.
+ The second step.

/ Term: What the term means.

Quantities are typed as text: a resistor of 4.7~kΩ, a slew rate of 13~V/µs, a supply of ±15~V, a
length of (1.2~±~0.1)~m and a resistance of $47 times 10^3$~Ω. A year gave 7,790 hours of light at a
pitch of 22.5°, the panel reached 65~°C, its efficiency was 19.0~%, the gravity there is 9.81~m/s² and
the coefficient is 0.004~K⁻¹. In maths a quantity stays text: $f_c approx 1.03 thin "kHz"$.

= Maths <sec:maths>

For $upright(bold(x)) in RR^n$ and a matrix $A$ with $op("tr") A = 0$, the gain of the stage is
$ A_"v" = -R_f / R_"in", quad eta_"ref" [1 - beta thin (T_c - T_"ref")]. $ <eq:gain>
The derivation has one number, @eq:derived:
$ p(lambda) &:= det(A - lambda I) \
  &= (lambda - 3)(lambda + 1). $ <eq:derived>
An unnumbered display:
#math.equation(block: true, numbering: none, $ f(x) = cases(1 & x > 0, 0 & "otherwise"), quad mat(1, 2; 2, 1) $)

#theorem(title: [Euclid])[There are infinitely many prime numbers.] <thm:euclid>

#proof[Suppose there were finitely many. Their product plus one has a prime factor not in the list.]

#lemma[Every integer greater than one is a product of primes.] <lem:split>

#corollary[@thm:euclid and @lem:split together give unique factorisation.] <cor:many>

#definition[A number is _prime_ when it has exactly two divisors.] <def:prime>

#example[Find $x$ when $2x = 4$.] <ex:first>

#solution[Divide both sides by 2, so $x = 2$.]

#remark[Any proof needs only one prime outside the list, as @def:prime and @ex:first suggest.]

= Floats <sec:floats>

@fig:site is a photo, @fig:energy has two panels, @fig:measured and @fig:modelled, @fig:divider and
@fig:box are drawn in Typst, and @fig:left and @fig:right sit side by side.

#figure(image("/figures/site.png", width: 50%), caption: [The site, from the north.]) <fig:site>

#figure(
  grid(
    columns: (1fr, 1fr), column-gutter: 1em, align: bottom,
    [#subfigure(image("/figures/measured.png", width: 100%), caption: [Measured output.]) <fig:measured>],
    [#subfigure(image("/figures/modelled.png", width: 100%), caption: [Modelled output.]) <fig:modelled>],
  ),
  caption: [Energy across the year.],
) <fig:energy>

#figure(include "/diagrams/divider.typ", caption: [A divider, drawn in plain Typst.]) <fig:divider>

#figure(
  rect(width: 40mm, height: 15mm, stroke: 0.5pt, fill: luma(240)),
  caption: [A box drawn by the figure itself.],
) <fig:box>

#grid(
  columns: (1fr, 1fr), column-gutter: 1em, align: bottom,
  [#figure(image("/figures/measured.png", width: 100%), caption: [Measured on its own.]) <fig:left>],
  [#figure(image("/figures/modelled.png", width: 100%), caption: [Modelled on its own.]) <fig:right>],
)

@tab:seasons lines its numbers up, @tab:grouped groups its heading, @tab:results has a note and
@tab:parts stretches to the line.

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
      [The method before], [0.84],
      table.hline(stroke: 0.08em),
    )
    #text(size: 0.9em)[#super[a] Averaged over five runs.]
  ],
  caption: [Results of the two methods.],
) <tab:results>

#figure(
  table(
    columns: (auto, auto, 1fr),
    align: (left, left, left),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Part], [Value], [Purpose]),
    table.hline(stroke: 0.05em),
    [$R_"in"$], [4.7~kΩ], [sets the input current],
    [Op-amp], [TL071], [JFET-input op-amp on a ±15~V supply],
    table.hline(stroke: 0.08em),
  ),
  caption: [Parts, with a column that wraps.],
) <tab:parts>

= Code <sec:code>

@lst:python and @lst:c are listings, and @alg:dijkstra is pseudocode.

#figure(
  ```python
  import heapq

  def shortest(graph, start):
      queue = [(0, start)]  # the nearest vertex comes out first
      return heapq.heappop(queue)
  ```,
  caption: [Dijkstra's algorithm in Python.],
) <lst:python>

#figure(
  ```c
  int relax(int dist[], int u, int v, int w)
  {
      return dist[u] + w < dist[v];
  }
  ```,
  caption: [Relaxing an edge in C.],
) <lst:c>

#figure(
  kind: "algorithm", supplement: [Algorithm],
  caption: [Shortest distances from one vertex.],
  align(start)[
    *Input:* a graph $G$ with weights $w$ and a start vertex $s$ \
    *Output:* the distance $d(v)$ to every vertex $v$
    + $d(v) <- infinity$ for every vertex $v$, and $d(s) <- 0$
    + *while* the queue $Q$ is not empty *do*
    + #h(1.5em) $u <- #smallcaps[ExtractMin];(Q)$ #h(1fr) $triangle.r$ nearest first
    + #h(1.5em) *for all* edges $(u, v)$ *do*
    + #h(3em) *if* $d(u) + w(u, v) < d(v)$ *then*
    + #h(4.5em) $d(v) <- d(u) + w(u, v)$
    + *return* $d$
  ],
) <alg:dijkstra>

#include "chapters/results.typ"

#bibliography("refs.bib", style: "apa")
