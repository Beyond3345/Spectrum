#import "../template.typ": *

= Symbol reference <ch-symbols>

// The symbols and their pictures come from symbols/symbols.json, which symbols/build.mjs makes from the app's own
// data: run it again after the catalogue or a composer's shapes change, and this chapter follows.
#let data = json("/docs/handbook/symbols/symbols.json")
#let groups-of(id) = data.sections.find(s => s.id == id).groups
#let count(id) = groups-of(id).map(g => g.symbols.len()).sum()

// One group's symbols, a row at a time: each picture at the group's one scale (its printed size, or smaller when the
// group's widest or tallest symbol would not fit a cell), its name beneath, then its key and university style. The rows
// are 150 mm wide, the template's text width.
#let symbol-rows(symbols) = {
  let width = 150mm
  let gap = 8pt
  let widest = calc.max(..symbols.map(s => s.width)) * 1pt
  let tallest = calc.max(..symbols.map(s => s.height)) * 1pt
  let fit(columns) = calc.min(1, ((width - gap * (columns - 1)) / columns - 4pt) / widest, 6.5cm / tallest)
  let columns = if fit(5) >= 0.8 { 5 } else if fit(4) >= 0.7 { 4 } else { 3 }
  let scale = fit(columns)
  symbols.chunks(columns).map(row => {
    let blanks = (none,) * (columns - row.len())
    grid(
      columns: (1fr,) * columns,
      column-gutter: gap,
      row-gutter: 5pt,
      align: (_, y) => if y == 0 { center + horizon } else { center + top },
      ..row.map(s => image("/docs/handbook/symbols/" + s.picture, width: s.width * 1pt * scale)),
      ..blanks,
      ..row.map(s => {
        set par(justify: false, leading: 0.45em)
        // DejaVu Sans Mono, which Typst carries, for the arrows some names show, such as ↣
        text(size: 7.5pt, font: serif + mono, s.name)
        if "key" in s { linebreak(); text(font: mono, size: 6.3pt, fill: muted, s.key) }
        if "style" in s { linebreak(); text(size: 6.8pt, fill: accent, s.style) }
      }),
      ..blanks,
    )
  })
}

// A group: its heading, with its count in quiet type, and its note, kept on a page with its first row of symbols.
#let group-heading(level, title, n) = heading(level: level, outlined: false)[#title #h(0.4em) #text(size: 0.8em, weight: "regular", fill: muted)[#n]]
#let show-group(group, note, level: 3, lead: none) = {
  let rows = symbol-rows(group.symbols)
  block(breakable: false, below: 0pt, {
    lead
    group-heading(level, group.title, group.symbols.len())
    if note != none { note }
    block(above: 1.1em, rows.first())
  })
  for row in rows.slice(1) { block(breakable: false, above: 1.1em, below: 0pt, row) }
  v(0.8em)
}
#let show-section(id, notes) = for group in groups-of(id) {
  show-group(group, notes.at(group.title, default: none))
}

This chapter lists every symbol the diagram composer places, each with its picture as it prints and its name as the parts list shows it. It covers the circuit catalogue, the symbol sets of General drawing, Annotate, the supports and loads of Structures, the marks of Vector diagrams, the shapes of flowcharts, the arrows of commutative diagrams and the marks of plots, #data.sections.map(s => count(s.id)).sum() symbols in all. To find a symbol in the app, type part of its name into #ui[Find a part] at the top of the parts list. The list keeps the parts whose name, circuitikz key or another word for them matches, so `nmos` finds every N-channel MOSFET and `elbow` finds both bends. The search in #ui[Draw a diagram] finds a symbol in the same way and opens a drawing that has it.

Every picture is compiled from the code the composer writes for that symbol, so it shows the symbol as it prints in a document. The circuit catalogue and the symbol sets are drawn by Spectrum's own symbol drawing, the one that gives the parts list and the canvas their pictures, in the style of a new drawing. The rest are each placed once in a small drawing with the composer's own tools, written by the composer and compiled with pdfLaTeX, or with Typst for the Typst flowchart. Each group keeps one scale: its printed size, or smaller where its largest symbol would not fit the page. The number beside a group's heading is the number of symbols in it. The script `docs/handbook/symbols/build.mjs` draws them all again from the app's data, so this reference follows the app.

== Circuit symbols <sec-symbols-circuits>

The circuit catalogue is circuitikz's parts, in the groups and the order of the parts list. Both Circuits and General drawing have them, and @ch-circuits explains how to place, wire and label them. The key beneath each name is the circuitikz key the drawing writes, and a part of a university style is marked with the style's name.

#show-section("circuits", (
  "Resistors and impedances": [Resistors, a potentiometer with its wiper pin, impedances and a fuse. Each sits on a wire between two points.],
  "Capacitors and inductors": [Plain, polarised and variable capacitors, and plain, variable and centre-tapped inductors.],
  "Sources": [Independent and controlled sources, an AC source, a battery and a cell, photovoltaic sources and two converters.],
  "Switches": [Switches drawn open, closed, closing and opening, a push button and a changeover switch with three pins.],
  "Diodes and thyristors": [The diodes circuitikz draws, and a thyristor and a triac with a gate pin.],
  "Transistors": [Bipolar transistors, JFETs and IGBTs, placed as nodes with their pins named.],
  "MOSFETs": [Every MOSFET style circuitikz draws: its own symbols, the IEEE ones and the IGFETs, with and without a bulk pin.],
  "MU Style": [The symbols of Hong Kong Metropolitan University's lecture slides that circuitikz does not draw. A drawing that uses one declares it in its own picture, and the switch in #menu[Settings][Diagram composer][University styles] hides them from the parts list.],
  "Amplifiers and chips": [An op amp and an amplifier, both with text inside, a buffer and an eight-pin chip.],
  "Logic": [Logic gates, drawn in the style the drawing chooses, which is American in a new drawing.],
  "Meters and lamps": [An ammeter, a voltmeter, a lamp, two meters that take a letter inside and an oscilloscope.],
  "Ground, supply and terminals": [Grounds, supply rails, a terminal and two crossings. Voltage between two points draws nothing of its own and marks a voltage between its ends, so its picture shows it as a drawing writes it, with its voltage.],
  "Transformers": [Transformers with and without a core, which can also show polarity dots.],
  "Mechanical": [circuitikz's mechanical parts: a spring, a damper, a mass, an inerter, a viscoelastic element and a motor or generator.],
  "Blocks": [Blocks, filters and converters for block diagrams, an adder, a mixer, an oscillator and three antennas.],
))

== Symbol sets of General drawing <sec-symbols-sets>

General drawing has every symbol set on one canvas, after the circuit catalogue in its parts list. The sets are Spectrum's own, written in plain TikZ as `\pic` definitions that a drawing declares in its own picture, and their use is explained in @ch-circuits. The key beneath each name is the pic the drawing writes.

#{
  let notes = (
    "Supports": [Hatched ground, a wall and a ceiling, a pinned support and a cart. The Mass, spring and damper starter has them too.],
    "Flowchart shapes": [Flowchart shapes as parts of a drawing, each with text inside and a pin in the middle of each side.],
    "Points and marks": [A point, an open point, a right-angle mark and a pair of axes, for a geometry sketch beside other parts.],
    "Pipes and fittings": [Pipes with a 1~cm bore, and the fittings and machines that join them end to end by their pins.],
    "Flow": [Section markers, a centre line, a control volume, velocity profiles, a streamline and a streamtube.],
    "Tanks and manometers": [The free surface mark, tanks, four manometers, a column of three liquids, a piezometer, a barometer and a hydraulic jack.],
    "Hydrostatics and buoyancy": [A gate with its hinge and stop, pressure distributions and the resultant force, floating bodies, a hull section and an incline.],
    "Viscosity and surface tension": [Fixed and moving plates, capillary tubes in a liquid and a contact angle.],
    "Test specimens": [The specimens of the compression, flexural, slump, tension and shear tests, at 150~mm to the centimetre, with a roller and a platen.],
    "Sections and brickwork": [A reinforced concrete section, rolled steel sections and brickwork in three bonds.],
  )
  let sets = (
    "Fluid mechanics (Spectrum)": [Pipes, tanks and manometers, and the marks of flow and hydrostatics, as the lectures of a fluid mechanics course draw them.],
    "Construction materials (Spectrum)": [Test specimens and sections of a construction materials course.],
  )
  let groups = groups-of("sets")
  for name in groups.map(g => g.set).dedup() {
    let these = groups.filter(g => g.set == name)
    let title = name.replace(" (Spectrum)", "")
    if these.len() == 1 {
      show-group((title: title, symbols: these.first().symbols), notes.at(these.first().title, default: none))
    } else {
      let lead = [#group-heading(3, title, these.map(g => g.symbols.len()).sum()) #sets.at(name, default: none)]
      for (i, g) in these.enumerate() { show-group(g, notes.at(g.title, default: none), level: 4, lead: if i == 0 { lead }) }
    }
  }
}

== Annotate <sec-symbols-annotate>

Annotate comes at the end of the parts list in Circuits and General drawing. Its tools draw over the drawing and never join it, and @ch-circuits explains each. The pictures show each tool as it is first placed, then the looks a line, a point and a liquid or solid can take.

#show-section("annotate", (
  "Tools": [Annotate's tools, each as a click or a short drag places it.],
  "Presets": [Groups of annotations and text that one click puts down, which are then edited like anything else.],
  "Arrowheads and point marks": [The heads a line or arrow takes from the inspector, then the cross that Point places instead of its dot.],
  "Liquids and solids": [The fills of Liquid or solid, as their tints.],
  "Patterns": [The patterns #ui[Drawn as] gives a fill instead of its tint, shown here on water.],
))

== Structures <sec-symbols-structures>

Structures places members, joints, supports, loads and annotations from its own parts list, explained in @ch-structures. Each tool here is used once with the composer's own placing, most of them on a short beam, and drawn as the loading diagram prints it.

#show-section("structures", (
  "Members": [A beam or frame member, drawn heavy, and a truss bar, pinned at both ends.],
  "Joints": [A joint, an internal hinge, an internal shear release and a released member end.],
  "Supports": [Each support is drawn at the left end of a beam, where a fixed or guided support turns to face along it.],
  "Loads": [Point forces, moments and distributed loads, with the value each is placed with.],
  "Annotations": [Dimensions, a label, an angle arc, axes and a section cut.],
))

== Vector diagrams <sec-symbols-vectors>

Vector diagrams draws its marks on points of its own, as @ch-vectors explains. The pictures show the marks of the parts list's Axes and marks group, the shapes a point takes and the tips a vector or line takes.

#show-section("vectors", (
  "Axes and marks": [The marks of the Axes and marks group, each on the points it needs.],
  "Point shapes": [The shapes of a point's dot.],
  "Arrow tips": [The tips of a vector or line, each on a vector.],
))

== Flowcharts <sec-symbols-flow>

The flowchart composers place shapes from their parts list, at the size and with the text shown here, as @ch-flow explains. The TikZ flowchart writes TikZ, and the Typst flowchart writes the same drawing with the fletcher package, which draws all but a few of the shapes.

#show-section("flow", (
  "Shapes in TikZ": [The shapes of the TikZ flowchart, as it writes them.],
  "Shapes in Typst": [The shapes of the Typst flowchart, as fletcher draws them.],
))

== Commutative diagrams <sec-symbols-cd>

A commutative diagram's arrows take a kind and marks from the inspector, as @ch-flow explains. Each is shown between two objects.

#show-section("cd", (
  "Arrows": [Each kind of arrow, then each mark an arrow can carry.],
))

== Plot marks <sec-symbols-plots>

A plot's series takes a mark from its #ui[Mark] menu, as @ch-plots explains, and #ui[Auto] leaves pgfplots its own. Each picture is the mark of a first series at a plot's usual size, with the axis left out.

#show-section("plots", (
  "Marks": [The marks of a series; the key is the pgfplots name the code writes.],
))
