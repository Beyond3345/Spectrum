#set document(title: "Your report title", author: "Your Name")
#set page(paper: "a4", margin: 25mm, numbering: "1")
#set text(size: 11pt)
#set heading(numbering: "1.1")

#align(center + horizon)[
  #text(size: 24pt, weight: "bold")[Your report title]
  #v(1cm)
  Your Name \
  #datetime.today().display("[day] [month repr:long] [year]")
]
#pagebreak()

#outline(title: [Contents])

#pagebreak()

= Introduction

This report is set in A4 with 25 mm margins. Its headings are numbered and its contents are built from them.

== Scope

The report covers the first questions and leaves the rest for later.

= Results

@tab:results sums up the first measurements.

#figure(
  table(
    columns: 3,
    table.header([Measure], [Before], [After]),
    [Length], [12 mm], [15 mm],
    [Width], [8 mm], [10 mm],
    [Height], [3 mm], [4 mm],
  ),
  caption: [First measurements.],
) <tab:results>

= Conclusion

The first results are in @tab:results.
