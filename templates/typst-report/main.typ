// Document
#set document(title: [Rooftop solar output across a Melbourne year], author: "Your Name") // the title and author, also shown in the PDF's properties

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1
#show heading.where(level: 1): set heading(supplement: [Chapter]) // references to a chapter read Chapter 2
#show heading.where(level: 1): it => pagebreak(weak: true) + it // each chapter starts on a new page

// Maths
// Number equations, figures and tables by chapter: (2.1), Figure 4.1, ...
#let by-section(pattern) = n => numbering(pattern, counter(heading).get().first(), n)
#set math.equation(numbering: by-section("(1.1)")) // equations: (2.1), (2.2), ...
#set figure(numbering: by-section("1.1"))       // figures and tables: 4.1, 4.2, ...
#show heading.where(level: 1): it => {          // every chapter starts these counts again at 1
  counter(math.equation).update(0)
  counter(figure.where(kind: image)).update(0)
  counter(figure.where(kind: table)).update(0)
  it
}

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures
#show table: set text(number-width: "tabular")  // digits of equal width, so numbers line up in columns

#set page(numbering: none)                      // the title page has no number
#align(center)[
  #v(30mm)
  #text(size: 17pt, weight: "bold", hyphenate: false, title())
  #v(12mm)
  #text(size: 14pt)[Your Name]
  #v(25mm)
  A thesis submitted in partial fulfilment of the requirements for the degree of
  #v(3mm)
  #text(size: 12pt)[Bachelor of Engineering (Honours)]
  #v(1fr)
  School of Engineering \
  Your University
  #v(6mm)
  October 2026
]

#set page(numbering: "i")                       // front matter: i, ii, iii
#counter(page).update(1)
#heading(numbering: none, outlined: false)[Abstract]
A typical 6.6~kW rooftop system in suburban Melbourne was logged every five minutes for a year. It produced
7,790~kWh, three times as much in December as in June. Output followed the sun's height more closely than
the weather: cloudy summer days still beat clear winter ones. A simple model built from panel area,
efficiency and temperature predicts the monthly totals to within 6 per cent, which is close enough to size a
system before it is bought.

#heading(numbering: none, outlined: false)[Acknowledgements]
Thanks to my supervisor for their patience, and to the household that let a data logger live in their meter
box for a year.

#outline(title: [Contents])
#outline(title: [List of figures], target: figure.where(kind: image))
#outline(title: [List of tables], target: figure.where(kind: table))

#set page(numbering: "1")                       // chapter 1 starts again at 1
#counter(page).update(1)

// Long chapters can live in their own files: #include "chapters/introduction.typ"
= Introduction <ch:intro>

One in three Australian houses now has solar panels on the roof, yet most owners only see a quarterly bill.
This thesis asks a simple question: how much does a typical system produce in each month of the year, and
can that be predicted before it is installed?

@ch:background sets out the physics of a photovoltaic panel, @ch:method describes the system and how it was
measured, @ch:results presents a year of data, and @ch:conclusion draws the threads together.

= Background <ch:background>

A panel turns a fraction of the sunlight that falls on it into electricity @Masters2013. To a first
approximation the power it delivers is
$ P = eta thin A thin G, $ <eq:power>
where $eta$ is the panel's efficiency, $A$ its area and $G$ the irradiance on its surface. Efficiency drops
as the panel heats up, which #cite(<Duffie2013>, form: "prose") model as a straight line,
$ eta = eta_"ref" lr([1 - beta thin (T_c - T_"ref")], size: #120%), $ <eq:temperature>
with $beta approx$ 0.004~K⁻¹ for crystalline silicon. On a hot January afternoon a roof-mounted panel can
reach 65~°C, costing it about 16 per cent of its rated output.

= Method <ch:method>

The system faces north at a pitch of 22.5°, the most common roof angle in the area. @tab:system lists its
main parts. A logger on the inverter recorded power every five minutes from 1 January to 31 December 2025.

#figure(
  table(
    columns: 2,
    align: (left, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Part], [Value]),
    table.hline(stroke: 0.05em),
    [Panels], [18 × 370~W],
    [Panel area], [35.1~m²],
    [Rated efficiency], [19.0~%],
    [Inverter], [5.0~kW],
    table.hline(stroke: 0.08em),
  ),
  caption: [The system that was measured.],
) <tab:system>

= Results <ch:results>

@fig:monthly shows the energy produced in each month. Output peaks in December and January and bottoms out
in June, when the sun is low and days are short.

#figure(
  // a saved image works too: image("/figures/monthly.png", width: 80%)
  include "/diagrams/monthly.typ",
  caption: [Energy produced in each month of 2025.],
) <fig:monthly>

Grouping the months by season (@tab:seasons) makes the pattern plainer: summer produces about two and a half
times as much as winter. Using @eq:power and @eq:temperature with monthly irradiance and temperature gives
totals within 6 per cent of those measured.

#figure(
  table(
    columns: 4,
    align: (left, right, right, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Season], [Measured (kWh)], [Modelled (kWh)], [Difference (%)]),
    table.hline(stroke: 0.05em),
    [Summer], [2,740], [2,810], [2.6],
    [Autumn], [1,660], [1,580], [-4.8],
    [Winter], [1,110], [1,050], [-5.4],
    [Spring], [2,280], [2,350], [3.1],
    table.hline(stroke: 0.05em),
    [Year], [7,790], [7,790], [0.0],
    table.hline(stroke: 0.08em),
  ),
  caption: [Energy by season, measured and modelled.],
) <tab:seasons>

= Conclusion <ch:conclusion>

A year of five-minute readings shows that a north-facing 6.6~kW system in Melbourne produces about 7.8~MWh a
year, most of it between October and March. The simple model of @ch:background is good enough to size a
system, and #cite(<Lamport1994>, form: "prose") made writing it up rather less painful.

// The bibliography comes from refs.bib; it shows only the entries you cite
#bibliography("refs.bib", style: "apa")

#counter(heading).update(0)                     // appendices count again from A
#set heading(numbering: "A.1")                  // Appendix A, then A.1 for its sections
#show heading.where(level: 1): set heading(supplement: [Appendix]) // references read Appendix A

= Logger settings <app:logger>

The logger sampled the inverter's output every 5~min and stored the readings as comma-separated values, one
file per day.
