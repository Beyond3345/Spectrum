// Document
#set document(title: [Week 6: Active filters], author: "Your Name") // the title and author, also shown in the PDF's properties

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1

// Maths
#show figure.where(kind: "theorem"): it => align(start, it.body) // an example draws its own heading, left aligned
#show heading.where(level: 1): it => {          // examples count again in each section: 1.1, 1.2, ...
  counter(figure.where(kind: "theorem")).update(0)
  it
}

// Number equations, figures and tables by section: (1.1), Figure 1.1, ...
#let by-section(pattern) = n => numbering(pattern, counter(heading).get().first(), n)
#set math.equation(numbering: by-section("(1.1)")) // equations: (1.1), (1.2), ...
#set figure(numbering: by-section("1.1"))       // figures and tables: 1.1, 1.2, ...
#show heading.where(level: 1): it => {          // every section starts these counts again at 1
  counter(math.equation).update(0)
  counter(figure.where(kind: image)).update(0)
  counter(figure.where(kind: table)).update(0)
  it
}

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures

// Worked examples, numbered by section, each followed by a solution
#let theorem-number = n => numbering("1.1", counter(heading).get().first(), n)
#let theorem-like(name, head-style: strong, body-style: body => body) = (title: none, body) => figure(
  kind: "theorem", supplement: name, numbering: theorem-number, outlined: false,
  [
    #head-style[#name #context counter(figure.where(kind: "theorem")).display(theorem-number)#if title != none [ (#title)].]
    #body-style(body)
  ],
)
#let example = theorem-like([Example])                       // upright text
#let proof(body, name: [Proof]) = block(width: 100%)[_#name._ #body #h(1fr) $square$] // ends with the proof box
#let solution = proof.with(name: [Solution])

#align(center)[
  #title()
  Your Name \
  Semester 2, 2026
]

= The inverting low-pass filter

Putting a capacitor $C$ across the feedback resistor of an inverting amplifier turns it into a first-order
low-pass filter (@fig:filter). It passes low frequencies with the gain of the amplifier and rolls off at
-20~dB per decade above its cut-off frequency.

#figure(
  include "/diagrams/filter.typ",
  caption: [An inverting amplifier with a capacitor in its feedback path.],
) <fig:filter>

With an ideal op-amp the inverting input is a virtual earth, so the current through $R_"in"$ all flows
through the feedback impedance $Z_f = R_f parallel 1 / (j omega C) = R_f / (1 + j omega R_f C)$. Hence
$ H(j omega) = v_"out" / v_"in" = -Z_f / R_"in" = -R_f / R_"in" dot 1 / (1 + j omega R_f C), $ <eq:gain>
and the cut-off frequency, where the gain has fallen by 3~dB, is
$ f_c = 1 / (2 pi R_f C). $ <eq:cutoff>

#example[
  The filter in @fig:filter uses the parts in @tab:parts. Find its passband gain in decibels and its cut-off
  frequency.
] <ex:design>

#figure(
  table(
    columns: (auto, auto, 1fr),
    align: (left, left, left),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Part], [Value], [Purpose]),
    table.hline(stroke: 0.05em),
    [$R_"in"$], [4.7~kΩ], [sets the input current],
    [$R_f$], [47~kΩ], [sets the passband gain, with $R_"in"$],
    [$C$], [3.3~nF], [rolls the gain off above $f_c$],
    [Op-amp], [TL071], [JFET-input op-amp on a ±15~V supply],
    table.hline(stroke: 0.08em),
  ),
  caption: [Parts for the filter in @ex:design.],
) <tab:parts>

#solution[
  At low frequencies $omega R_f C << 1$, so by @eq:gain the gain is $-R_f \/ R_"in" = -47 \/ 4.7 = -10$, that
  is $20 log_10 10 = 20 thin "dB"$ with the output inverted. By @eq:cutoff,
  #math.equation(block: true, numbering: none, $
    f_c = 1 / (2 pi times 47 times 10^3 thin "Ω" times 3.3 times 10^(-9) thin "F") approx 1.03 thin "kHz".
  $)
  @fig:bode plots the magnitude of @eq:gain for these values.
]

#figure(
  include "/diagrams/bode.typ",
  caption: [Gain of the filter in @ex:design: flat at 20~dB, then falling at 20~dB per decade above $f_c$.],
) <fig:bode>

= Practical limits

A real op-amp only approximates @eq:gain @Horowitz2015. The TL071's slew rate of 13~V/µs caps how fast the output can
swing, so a 10~V peak sine wave starts to distort above about
$(13 thin "V/µs") / (2 pi times 10 thin "V") approx 207 thin "kHz"$, well above this filter's cut-off.

#bibliography("refs.bib", style: "apa")
