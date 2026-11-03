// Document
#set document(title: [Your Name: curriculum vitae], author: "Your Name") // the title and author, also shown in the PDF's properties

// Page
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

#grid(
  columns: (1fr, auto),
  [
    #text(size: 22pt, weight: "bold")[Your Name] \
    Engineer and researcher
  ],
  align(right)[
    #link("mailto:your.name@example.com")[your.name\@example.com] \
    +61 400 000 000 \
    Canberra, Australia
  ],
)

= Education

#entry[Bachelor of Engineering (Honours), University of Sydney][2019--2023][Final project: a footbridge design for a local council. Graduated with first class honours.]

= Experience

#entry[Engineering intern, Example Company][2022--2023][Worked with the structural team on bridge inspections and wrote the summary reports.]

= Skills

#grid(
  columns: (1fr, 1fr), row-gutter: 0.65em,
  [Structural design], [Report writing],
  [Typst and LaTeX], [Python],
)

= Referees

Available on request.
