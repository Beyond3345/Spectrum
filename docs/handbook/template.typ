// The Spectrum handbook's template: the page, the type and the helpers every chapter uses.
// A chapter starts with `#import "../template.typ": *` and one `= Title <ch-label>` heading.

#let accent = rgb("#2b6c8a")                     // the front matter's colour: About this handbook and the contents
#let muted = luma(105)                           // captions, page numbers and quiet marks
#let hair = luma(212)                            // thin rules and screenshot borders
#let ink = rgb("#1c1c1e")                        // lettering on a band too bright for white
#let warn = rgb("#a05a00")                       // the Note boxes, as the app's warning amber
#let serif = ("Libertinus Serif", "Noto Serif SC") // Typst carries Libertinus; Noto Serif SC is in Spectrum's fonts
#let mono = ("DejaVu Sans Mono", "Menlo")

// The chapters' colours: one area of the app each, from the palette the app shares (apps/frontend/src/app/palette.json).
// `light` is for text on white, `band` for bands, icons and fills. About this handbook has none and keeps the accent.
#let palette = json("palette.json") // a copy of apps/frontend/src/app/palette.json, which the app reads; palette.check.ts keeps them equal
#let chapter-areas = (
  ch-start: "projects", ch-writing: "writing", ch-assistant: "assistant", ch-references: "references",
  ch-composer: "composer", ch-circuits: "circuits", ch-structures: "structures", ch-vectors: "vectors",
  ch-flow: "flow", ch-plots: "plots", ch-forms: "forms", ch-symbols: "symbols",
)
// Each area's icon: a Fluent UI System Icon (MIT), copied into icons/ from apps/frontend/public/fluent, never the SF Symbols in public/sf,
// which Apple licenses for its own platforms only.
#let area-icons = (
  projects: "folder", writing: "text.cursor", assistant: "sparkles", references: "books.vertical",
  composer: "pencil", circuits: "bolt", structures: "building.columns", vectors: "triangle",
  flow: "arrow.triangle.branch", plots: "chart.line.uptrend.xyaxis", forms: "list.clipboard", symbols: "square.grid.2x2",
)
#let area(key) = if key == none { (light: accent, band: rgb("#3a3a3c"), icon: none) } else {
  let a = palette.at(key)
  (light: rgb(a.light), band: rgb(a.band), dark: rgb(a.dark), icon: area-icons.at(key))
}
#let area-of(label) = if label == none { none } else { chapter-areas.at(str(label), default: none) }

// The current chapter's area, set by its heading. Inside `context`, chapter-colour() is its colour for text on white,
// and chapter-colour(which: "band") its colour for fills.
#let current-area = state("hb-area", none)
#let chapter-colour(which: "light") = area(current-area.get()).at(which)

// A colour mixed into white: tint(c, 8%) is a faint wash of c.
#let tint(c, amount) = color.mix((c, amount), (white, 100% - amount))

// Lettering for a band: white where it reaches 3:1 on it, otherwise ink (the bright gold and lime bands).
#let luminance(c) = {
  let lin(v) = if v <= 0.04045 { v / 12.92 } else { calc.pow((v + 0.055) / 1.055, 2.4) }
  let (r, g, b) = rgb(c).components(alpha: false).map(v => lin(v / 100%))
  0.2126 * r + 0.7152 * g + 0.0722 * b
}
#let lettering(c) = if 1.05 / (luminance(c) + 0.05) >= 3 { white } else { ink }

// A Fluent icon in one colour, sized like a letter by default: #fluent("bolt", red).
#let fluent(name, fill, height: 1em) = box(baseline: 0.15em, image(
  bytes(read("icons/" + name + ".svg").replace("<svg ", "<svg fill=\"" + fill.to-hex() + "\" ")),
  format: "svg", height: height,
))

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
// The path is from docs/handbook, for example "figures/06-circuits/parts-list.png".
#let frame(path, width: 100%) = box(width: width, clip: true, radius: 4pt, stroke: 0.5pt + hair, image(path, width: 100%))

// A screenshot as a numbered figure: #shot("figures/…png", [Caption.], width: 70%) <fig-label>
#let shot(path, caption, width: 100%) = figure(frame(path, width: width), caption: caption)

// Two or more screenshots side by side under one caption: #shots(("a.png", "b.png"), [Caption.])
#let shots(paths, caption, columns: auto, gutter: 10pt) = figure(
  grid(columns: if columns == auto { paths.len() } else { columns }, gutter: gutter, ..paths.map(p => frame(p))),
  caption: caption,
)

// The three-dot button that opens a menu: the ··· of the app, spaced so it reads in print.
#let dots = box(text(tracking: 0.14em, weight: "semibold")[···])

// The boxes: a thin rounded frame with a title bar. Their text stays black; the colour is on the frame and the title.
#let titled-box(title, body, frame: hair, title-fill: none, title-colour: black, fill: none) = block(
  width: 100%, radius: 4pt, clip: true, stroke: 0.6pt + frame, above: 1.4em, below: 1.4em, {
    set block(above: 0pt, below: 0pt)
    block(width: 100%, sticky: true, fill: title-fill, inset: (x: 9pt, y: 5pt),
      text(size: 0.86em, weight: "semibold", fill: title-colour, title))
    block(width: 100%, fill: fill, inset: (x: 9pt, top: 7pt, bottom: 8pt), body)
  },
)

// An aside the reader should not miss, in the app's warning amber: #note[…], or #note(title: [Before 2.5])[…]
#let note(title: [Note], body) = titled-box(
  [#fluent("exclamationmark.triangle", warn, height: 1.05em)#h(4pt)#title], body,
  frame: warn, title-fill: tint(warn, 12%), title-colour: warn, fill: tint(warn, 4%),
)

// Numbered steps under "How to …" on a bar in the chapter's colour: #howto[draw members][+ Press M + Drag …]
#let howto(title, body) = context {
  let a = area(current-area.get())
  let on = lettering(a.band)
  titled-box(
    [#if a.icon != none [#fluent(a.icon, on, height: 1.05em)#h(4pt)]How to #title], {
      set enum(numbering: n => text(fill: a.light, weight: "semibold")[#n.])
      body
    },
    frame: a.band, title-fill: a.band, title-colour: on, fill: white,
  )
}

// A worked example with real numbers, on a soft wash of the chapter's colour: #worked[…], or #worked(title: […])[…]
#let worked(title: none, body) = context {
  let c = chapter-colour()
  titled-box([Worked example#if title != none [: #title]], body,
    frame: c, title-fill: tint(c, 14%), title-colour: c, fill: tint(c, 5%))
}

// A formula and its working, in a neutral grey box: #calculation[…], or #calculation(title: [P/E])[…]
// (named in full, since `calc` is Typst's maths module, which the chapters use)
#let calculation(title: none, body) = titled-box([Calculation#if title != none [: #title]], body,
  frame: luma(170), title-fill: luma(234), title-colour: black, fill: luma(248))

#let handbook(title: [], subtitle: [], author: "", version: "", date: none, body) = {
  set document(title: [#title #subtitle], author: author, date: date)
  let starts-chapter(page) = query(heading.where(level: 1)).any(h => h.location().page() == page)
  let mark(page) = [#box(baseline: 22%, image("figures/icon.png", height: 9.5pt))#h(4pt)#page]
  set page(
    paper: "a4",
    margin: (x: 30mm, top: 30mm, bottom: 30mm),
    header: context {                            // the chapter's name in its colour, except on the page that starts it
      let n = here().page()
      let before = query(heading.where(level: 1).before(here()))
      if n > 1 and not starts-chapter(n) and before.len() > 0 {
        let a = area(current-area.get())
        set text(size: 8.5pt)
        block(width: 100%, inset: (bottom: 4pt), stroke: (bottom: 0.4pt + a.light), grid(
          columns: (1fr, auto), align: (left + bottom, right + bottom),
          text(fill: a.light)[#if a.icon != none [#fluent(a.icon, a.light, height: 1.1em)#h(4pt)]#before.last().body],
          text(fill: muted, mark(counter(page).display("1"))),
        ))
      }
    },
    footer: context {                            // the page number, on the pages that have no running head
      let n = here().page()
      if n > 1 and starts-chapter(n) { align(center, text(size: 8.5pt, fill: muted, mark(counter(page).display("1")))) }
    },
  )
  set text(font: serif, size: 10.5pt, lang: "en", region: "AU")
  set par(justify: true, leading: 0.68em, spacing: 1.05em)
  set heading(numbering: "1.1")
  set enum(indent: 0.4em, body-indent: 0.7em, spacing: 0.8em)
  set list(indent: 0.4em, body-indent: 0.7em, marker: text(fill: muted)[–])
  // Links to the web in the chapter's colour; a cross-reference to a chapter in that chapter's colour, with its icon,
  // and any other cross-reference in the colour of the chapter it is in.
  show link: it => if type(it.dest) == str { context text(fill: chapter-colour(), it) } else { it }
  show ref: it => {
    let key = if it.element != none and it.element.func() == heading and it.element.level == 1 { area-of(it.element.at("label", default: none)) }
    if key != none {
      let a = area(key)
      text(fill: a.light, box[#fluent(a.icon, a.light, height: 0.9em)#h(2.5pt)#it])
    } else { context text(fill: chapter-colour(), it) }
  }
  show raw: set text(font: mono, size: 0.86em)
  show raw.where(block: true): it => block(width: 100%, inset: 9pt, radius: 3pt, fill: luma(247), it)

  // Figures count again in each chapter (Figure 6.3); captions are small and quiet; a table's goes above it.
  set figure(numbering: n => numbering("1.1", counter(heading).get().first(), n), gap: 0.9em)
  show figure: set block(above: 1.5em, below: 1.5em)
  show figure.where(kind: image): set figure(placement: bottom) // pictures sit at the foot of a page, so no page is left half empty
  set place(clearance: 1.6em)
  show figure.caption: set text(size: 0.86em, fill: muted)
  show figure.where(kind: table): set figure.caption(position: top)

  // Tables: horizontal hairlines only, a semibold heading row on a faint wash of the chapter's colour, digits of equal width.
  set table(stroke: (x, y) => (bottom: 0.5pt + hair, top: if y == 0 { 0.5pt + hair }), inset: (x: 6pt, y: 5.5pt))
  show table: set text(size: 0.92em, number-width: "tabular")
  show table: set par(justify: false)
  show table.cell.where(y: 0): set text(weight: "semibold")
  show table: it => if it.fill != none { it } else {   // a table that sets its own fill keeps it
    let fields = it.fields()
    let cells = fields.remove("children")
    let _ = fields.remove("fill", default: none)
    context {
      let wash = tint(chapter-colour(which: "band"), 9%)
      table(..fields, fill: (x, y) => if y == 0 { wash }, ..cells)
    }
  }

  // A chapter starts a page with a band in its colour: "Chapter 6" small, then its icon and title.
  show heading.where(level: 1): set heading(supplement: [Chapter])
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    counter(figure.where(kind: image)).update(0)
    counter(figure.where(kind: table)).update(0)
    let key = area-of(it.at("label", default: none))
    current-area.update(key)
    let a = area(key)
    let on = lettering(a.band)
    block(width: 100%, above: 0pt, below: 2em, fill: a.band, radius: 5pt, inset: (x: 15pt, top: 13pt, bottom: 15pt), {
      set text(fill: on)
      if it.numbering != none {
        text(size: 9.5pt, weight: "semibold", tracking: 0.09em, upper[Chapter #counter(heading).display("1")])
        v(0.6em, weak: true)
      }
      grid(columns: (auto, 1fr), column-gutter: if a.icon != none { 9pt } else { 0pt }, align: horizon,
        if a.icon != none { fluent(a.icon, on, height: 22pt) },
        par(justify: false, text(size: 25pt, weight: "semibold", hyphenate: false, it.body)))
    })
  }
  show heading.where(level: 2): it => block(above: 1.9em, below: 0.9em, text(size: 14.5pt, weight: "semibold", {
    if it.numbering != none { context text(fill: chapter-colour(), weight: "regular", counter(heading).display("1.1")); h(0.7em) }
    it.body
  }))
  show heading.where(level: 3): it => block(above: 1.5em, below: 0.75em, text(size: 11.5pt, weight: "semibold", it.body))
  show heading.where(level: 4): it => block(above: 1.2em, below: 0.6em, text(size: 10.5pt, style: "italic", it.body))

  // The cover: the app icon on the ink of its own square, the name, a spectrum of the chapters' colours and their icons.
  let areas = palette.keys().sorted(key: k => palette.at(k).chapter)
  let cover-ink = rgb("#1d1f2a")
  page(header: none, footer: none, fill: cover-ink, margin: (x: 30mm, top: 40mm, bottom: 26mm), {
    set align(center)
    set text(fill: white)
    image("figures/icon.png", width: 46mm)
    v(12mm)
    text(size: 40pt, weight: "semibold", title)
    v(-4mm)
    text(size: 22pt, fill: rgb("#b9bccb"), subtitle)
    v(10mm)
    box(width: 96mm, height: 2.2pt, radius: 1.1pt, clip: true,
      grid(columns: (1fr,) * areas.len(), ..areas.map(k => rect(width: 100%, height: 100%, fill: rgb(palette.at(k).band)))))
    v(10mm)
    set text(size: 11pt, fill: rgb("#d4d6df"))
    [Version #version]
    if date != none { linebreak(); date.display("[day padding:none] [month repr:long] [year]") }
    v(1fr)
    areas.map(k => fluent(area-icons.at(k), rgb(palette.at(k).dark), height: 6.5mm)).join(h(4.2mm))
    v(9mm)
    text(size: 11pt, fill: rgb("#d4d6df"), author)
  })

  // The contents: chapters and their sections, each chapter with a dot of its colour.
  {
    show heading: it => block(width: 100%, below: 1.8em, fill: area(none).band, radius: 5pt,
      inset: (x: 15pt, top: 13pt, bottom: 15pt), text(size: 25pt, weight: "semibold", fill: white, it.body))
    show outline.entry.where(level: 1): set block(above: 1.25em)
    show outline.entry.where(level: 1): set text(weight: "semibold")
    show outline.entry.where(level: 1): it => {
      let key = area-of(it.element.at("label", default: none))
      if key == none { it } else {                 // the dot hangs in the margin, on the same page as its entry
        block(breakable: false, { place(left, dx: -11pt, dy: 0.22em, circle(radius: 3.2pt, fill: area(key).band)); it })
      }
    }
    outline(title: [Contents], depth: 2, indent: 1.4em)
  }

  body
}
