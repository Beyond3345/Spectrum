// Document
#set document(title: [Your report title], author: "Your Name") // the title and author, also shown in the PDF's properties

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1
#show heading.where(level: 1): set heading(supplement: [Chapter]) // references to a chapter read Chapter 2
#show heading.where(level: 1): it => pagebreak(weak: true) + it // each chapter starts on a new page

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures
#show table: set text(number-width: "tabular")  // digits of equal width, so numbers line up in columns

#set page(numbering: none)                      // the title page has no number
#align(center + horizon)[
  #title()
  #v(1cm)
  Your Name \
  #datetime.today().display("[day padding:none] [month repr:long] [year]")
]

#set page(numbering: "i")                       // front matter: i, ii, iii
#counter(page).update(1)
#heading(numbering: none)[Abstract]
What the report found, in one paragraph.

#outline(title: [Contents])
#outline(title: [List of tables], target: figure.where(kind: table))

#set page(numbering: "1")                       // chapter 1 starts again at 1
#counter(page).update(1)

// Long chapters can live in their own files: #include "chapters/introduction.typ"
= Introduction <ch:intro>

This report is set in A4 with 25~mm margins. Its chapters are numbered and its contents are built from them. Typst breaks paragraphs into lines much as TeX does @Knuth1984.

== Scope

The report covers the first questions and leaves the rest for later. @ch:results gives the first measurements.

= Results <ch:results>

@tab:results sums up the first measurements.

#figure(
  table(
    columns: 3,
    align: (left, right, right),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Measure], [Before (mm)], [After (mm)]),
    table.hline(stroke: 0.05em),
    [Length], [12], [15],
    [Width], [8], [10],
    [Height], [3], [4],
    table.hline(stroke: 0.08em),
  ),
  caption: [First measurements.],
) <tab:results>

= Conclusion <ch:conclusion>

The first results are in @tab:results.

#bibliography("refs.bib", style: "apa")
