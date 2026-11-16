// The Spectrum handbook's template: the page, the type and the helpers every chapter uses.
// A chapter starts with `#import "../template.typ": *` and one `= Title <ch-label>` heading.

#let accent = rgb("#2b6c8a")                     // the one accent colour: chapter numbers, links, callout rules
#let muted = luma(105)                           // captions, headers and footers
#let hair = luma(212)                            // thin rules and screenshot borders
#let serif = ("Libertinus Serif", "Noto Serif SC") // Typst carries Libertinus; Noto Serif SC is in Spectrum's fonts
#let mono = ("DejaVu Sans Mono", "Menlo")

// A name as the app shows it: a button, a menu, a field, a tab.
#let ui(body) = text(weight: "semibold", body)

// A path through menus or settings: #menu[Settings][Diagram composer] gives Settings › Diagram composer.
#let menu(..steps) = steps.pos().map(ui).join([ › ])

// Keys to press: #key("W"), or #key("⌘", "Enter") for a combination.
#let key(..keys) = keys.pos().map(k => box(
  inset: (x: 3.5pt), outset: (y: 2.5pt), radius: 2.5pt, stroke: 0.5pt + luma(165), fill: luma(248),
  text(font: mono, size: 0.8em, k),
)).join([#h(2pt)+#h(2pt)])

// A picture with the handbook's thin border and rounded corners, for use inside a grid or figure.
// The path is from docs/handbook, for example "images/06-circuits/parts-list.png".
#let frame(path, width: 100%) = box(width: width, clip: true, radius: 4pt, stroke: 0.5pt + hair, image(path, width: 100%))

// A screenshot as a numbered figure: #shot("images/…png", [Caption.], width: 70%) <fig-label>
#let shot(path, caption, width: 100%) = figure(frame(path, width: width), caption: caption)

// Two or more screenshots side by side under one caption: #shots(("a.png", "b.png"), [Caption.])
#let shots(paths, caption, columns: auto, gutter: 10pt) = figure(
  grid(columns: if columns == auto { paths.len() } else { columns }, gutter: gutter, ..paths.map(p => frame(p))),
  caption: caption,
)

// An aside the reader should not miss: #note[…], or #note(title: [Before 2.5])[…]
#let note(title: [Note], body) = block(
  width: 100%, inset: (left: 11pt, y: 3pt), stroke: (left: 1.5pt + accent),
  [#text(size: 0.86em, weight: "semibold", fill: accent, title) \ #body],
)

#let handbook(title: [], subtitle: [], author: "", version: "", date: none, body) = {
  set document(title: [#title #subtitle], author: author, date: date)
  set page(
    paper: "a4",
    margin: (x: 30mm, top: 30mm, bottom: 30mm),
    header: context {                            // the chapter's name, except on the page that starts it
      let page = here().page()
      let starts = query(heading.where(level: 1)).any(h => h.location().page() == page)
      let before = query(heading.where(level: 1).before(here()))
      if page > 1 and not starts and before.len() > 0 {
        set text(size: 8.5pt, fill: muted)
        [#before.last().body #h(1fr) #title #subtitle]
      }
    },
    footer: context if here().page() > 1 { align(center, text(size: 8.5pt, fill: muted, counter(page).display("1"))) },
  )
  set text(font: serif, size: 10.5pt, lang: "en", region: "AU")
  set par(justify: true, leading: 0.68em, spacing: 1.05em)
  set heading(numbering: "1.1")
  set enum(indent: 0.4em, body-indent: 0.7em, spacing: 0.8em)
  set list(indent: 0.4em, body-indent: 0.7em, marker: text(fill: muted)[–])
  show link: set text(fill: accent)
  show ref: set text(fill: accent)
  show raw: set text(font: mono, size: 0.86em)
  show raw.where(block: true): it => block(width: 100%, inset: 9pt, radius: 3pt, fill: luma(247), it)

  // Figures count again in each chapter (Figure 6.3); captions are small and quiet; a table's goes above it.
  set figure(numbering: n => numbering("1.1", counter(heading).get().first(), n), gap: 0.9em)
  show figure: set block(above: 1.5em, below: 1.5em)
  show figure.caption: set text(size: 0.86em, fill: muted)
  show figure.where(kind: table): set figure.caption(position: top)

  // Tables: horizontal hairlines only, a semibold heading row, digits of equal width.
  set table(stroke: (x, y) => (bottom: 0.5pt + hair, top: if y == 0 { 0.5pt + hair }), inset: (x: 6pt, y: 5.5pt))
  show table: set text(size: 0.92em, number-width: "tabular")
  show table: set par(justify: false)
  show table.cell.where(y: 0): set text(weight: "semibold")

  // A chapter starts a page, under a small coloured "Chapter 6".
  show heading.where(level: 1): set heading(supplement: [Chapter])
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    counter(figure.where(kind: image)).update(0)
    counter(figure.where(kind: table)).update(0)
    block(above: 0pt, below: 2em, {
      if it.numbering != none {
        text(size: 9.5pt, weight: "semibold", fill: accent, tracking: 0.09em, upper[Chapter #counter(heading).display("1")])
        v(0.5em, weak: true)
      }
      text(size: 25pt, weight: "semibold", it.body)
    })
  }
  show heading.where(level: 2): it => block(above: 1.9em, below: 0.9em, text(size: 14.5pt, weight: "semibold", {
    if it.numbering != none { text(fill: muted, weight: "regular", counter(heading).display("1.1")); h(0.7em) }
    it.body
  }))
  show heading.where(level: 3): it => block(above: 1.5em, below: 0.75em, text(size: 11.5pt, weight: "semibold", it.body))
  show heading.where(level: 4): it => block(above: 1.2em, below: 0.6em, text(size: 10.5pt, style: "italic", it.body))

  // The cover.
  page(header: none, footer: none, margin: (x: 30mm, top: 62mm, bottom: 30mm), {
    image("images/icon.png", width: 22mm)
    v(9mm)
    text(size: 40pt, weight: "semibold", title)
    linebreak()
    v(1mm)
    text(size: 22pt, fill: muted, subtitle)
    v(1fr)
    set text(size: 11pt)
    [#author \ ]
    text(fill: muted)[Version #version#if date != none [, #date.display("[day padding:none] [month repr:long] [year]")]]
  })

  // The contents: chapters and their sections.
  {
    show heading: it => block(below: 1.6em, text(size: 25pt, weight: "semibold", it.body))
    show outline.entry.where(level: 1): set block(above: 1.25em)
    show outline.entry.where(level: 1): set text(weight: "semibold")
    outline(title: [Contents], depth: 2, indent: 1.4em)
  }

  body
}
