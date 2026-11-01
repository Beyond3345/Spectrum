#set document(title: "Your document title", author: "Your Name")
#set page(paper: "a4", margin: 25mm)
#set text(size: 11pt)
#set par(justify: true)
#set heading(numbering: "1.")

#align(center)[
  #text(size: 20pt, weight: "bold")[Your document title] \
  Your Name \
  #datetime.today().display("[day] [month repr:long] [year]")
]

= Introduction

Start writing here. This simple document uses A4 paper and 25 mm margins. Typst sets the text and the maths neatly without extra packages.

= A first result

@fig:example shows the shape of the argument.

#figure(
  rect(width: 60mm, height: 30mm, stroke: 0.5pt, fill: luma(240)),
  caption: [A first figure. Replace it with an image or a diagram.],
) <fig:example>

= References

Place the cursor after an at sign to cite a source, as in @Knuth1984.

#bibliography("refs.bib", style: "apa")
