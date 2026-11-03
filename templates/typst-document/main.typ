// Document
#set document(title: [Your document title], author: "Your Name") // the title and author, also shown in the PDF's properties

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1

// Maths
#set math.equation(numbering: "(1)")            // number display equations: (1), (2), ...

#align(center)[
  #title()
  Your Name \
  #datetime.today().display("[day padding:none] [month repr:long] [year]")
]

= Introduction

Start writing here. This simple document uses A4 paper, 25~mm margins and single line spacing, without a separate title page or contents. Typst sets the text and the maths neatly without extra packages.

Use `@Knuth1984` for a citation in parentheses, as in @Knuth1984, or `#cite(<Knuth1984>, form: "prose")` for one in a sentence, as #cite(<Knuth1984>, form: "prose") shows. Add more sources using Spectrum's References tab.

Typst single quotation marks are typed straight, 'like this', and Typst curls them. An apostrophe in a word, such as author's, stays an apostrophe.

= A first result

@fig:example shows the shape of the argument.

#figure(
  rect(width: 60mm, height: 30mm, stroke: 0.5pt, fill: luma(240)),
  caption: [A first figure. Replace it with an image or a diagram.],
) <fig:example>

#bibliography("refs.bib", style: "apa")
