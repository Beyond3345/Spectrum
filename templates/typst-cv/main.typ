#set document(title: "Your name: curriculum vitae", author: "Your Name")
#set page(paper: "a4", margin: (x: 20mm, y: 18mm))
#set text(size: 10pt)
#set heading(numbering: none)

#grid(
  columns: (1fr, auto),
  [
    #text(size: 22pt, weight: "bold")[Your Name] \
    Engineer and researcher
  ],
  align(right)[
    your.name\@example.com \
    +61 400 000 000 \
    Canberra, Australia
  ],
)

#v(4mm)
#line(length: 100%)
#v(2mm)

= Education

#grid(
  columns: (1fr, auto),
  [*Bachelor of Engineering (Honours)*, University of Sydney],
  [2019--2023],
)
Final project: a footbridge design for a local council. Graduated with first class honours.

= Experience

#grid(
  columns: (1fr, auto),
  [*Engineering intern*, Example Company],
  [2022--2023],
)
Worked with the structural team on bridge inspections and wrote the summary reports.

= Skills

#grid(
  columns: (1fr, 1fr),
  [Structural design], [Report writing],
  [Typst and LaTeX], [Python],
)

= References

Available on request.
