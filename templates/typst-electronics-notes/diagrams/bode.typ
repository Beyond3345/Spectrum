// The filter's gain against frequency, drawn in plain Typst with no package.
// The frequency axis is logarithmic, from 10 Hz to 100 kHz; the gain runs from -25 dB to 25 dB.
#let (left-margin, width, height) = (16mm, 108mm, 55mm)
#let at(f, gain) = (left-margin + (calc.log(f) - 1) / 4 * width, (25 - gain) / 50 * height) // from Hz and dB to the box
#let label(f, gain, where, body) = place(dx: at(f, gain).at(0), dy: at(f, gain).at(1), box(place(where, body)))
#let gain(f) = 20 - 10 * calc.log(1 + calc.pow(f / 1026, 2)) // the gain in dB at f Hz, from the equation for H

#box(width: left-margin + width + 4mm, height: height + 14mm, {
  set text(size: 9pt)

  // the grid at each decade and every 10 dB, then the frame and its numbers
  for e in range(1, 6) {
    place(line(start: at(calc.pow(10, e), -25), end: at(calc.pow(10, e), 25), stroke: 0.4pt + luma(210)))
    label(calc.pow(10, e), -26, top + center, $10^#e$)
  }
  for g in (-20, -10, 0, 10, 20) {
    place(line(start: at(10, g), end: at(1e5, g), stroke: 0.4pt + luma(210)))
    label(9, g, right + horizon, [#g])
  }
  place(dx: left-margin, rect(width: width, height: height, stroke: 0.6pt))
  label(316, -32, top + center, [Frequency $f$ (Hz)])
  place(dx: 0pt, dy: height / 2, box(place(left + horizon, rotate(-90deg, reflow: true)[Gain (dB)])))

  // the gain, sampled in powers of ten so the points spread evenly along the axis
  let points = range(100).map(i => at(calc.pow(10, 1 + i * 4 / 99), gain(calc.pow(10, 1 + i * 4 / 99))))
  place(curve(stroke: 1pt + blue, curve.move(points.first()), ..points.slice(1).map(curve.line)))

  // the cut-off frequency, where the gain is 3 dB below the passband
  place(line(start: at(1026, -25), end: at(1026, 17), stroke: (thickness: 0.6pt, dash: "dashed")))
  place(dx: at(1026, 17).at(0) - 2pt, dy: at(1026, 17).at(1) - 2pt, circle(radius: 2pt, fill: black))
  label(1150, 18, bottom + left, [$f_c$, 17~dB])
})
