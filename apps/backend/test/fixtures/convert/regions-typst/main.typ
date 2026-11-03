// A document with one of each construct the converter flags for tidying: a title page beyond the title page rule,
// a CV header, two functions of its own whose look pandoc cannot write, and a table drawn with a grid of lines.
#set document(title: [Rooftop solar output across a Melbourne year], author: "Your Name")
#set page(paper: "a4", margin: 25mm, numbering: "1")
#set text(size: 11pt, lang: "en", region: "AU")
#set heading(numbering: "1.1")
#let callout(body) = block(fill: luma(235), inset: 8pt, radius: 4pt, width: 100%, body)
#let kbd(key) = box(stroke: 0.5pt, inset: (x: 3pt, y: 1pt), radius: 2pt, raw(key))

#set page(numbering: none)
#align(center)[
  #v(30mm)
  #text(size: 17pt, weight: "bold", title())
  #v(12mm)
  #line(length: 60%, stroke: 0.4pt)
  #text(size: 14pt)[Your Name]
  #v(1fr)
  School of Engineering \
  Your University
]
#pagebreak()
#set page(numbering: "1")

#grid(
  columns: (1fr, auto),
  [
    Your Name \
    Engineer and researcher
  ],
  align(right)[
    your.name\@example.com \
    Canberra, Australia
  ],
)

= Results <sec:results>

#callout[Wear a hat on the roof, and read @sec:results first.]

Press #kbd("Ctrl") and #kbd("S") together to save the log.

The panels lost about four per cent of their output in the hottest weeks, as @tab:output shows.

#figure(
  table(
    columns: 2,
    align: (left, right),
    [Season], [Output (kWh)],
    [Summer], [412],
    [Winter], [198],
  ),
  caption: [Output by season.],
) <tab:output>
