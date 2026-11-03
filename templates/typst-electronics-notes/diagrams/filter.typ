// The inverting low-pass filter, drawn in plain Typst with no package.
// Points are in units of 8 mm, with the op-amp's centre at (0, 0) and y counting upwards.
#let unit = 8mm
#let at(x, y) = ((x + 5.8) * unit, (4.6 - y) * unit) // a point of the drawing, measured from the box's top left
#let wire(..points) = place(curve(stroke: 0.8pt, curve.move(at(..points.pos().first())),
  ..points.pos().slice(1).map(p => curve.line(at(..p)))))
#let label(x, y, where, body) = place(dx: at(x, y).at(0), dy: at(x, y).at(1), box(place(where, body)))
#let dot(x, y) = place(dx: at(x, y).at(0) - 2pt, dy: at(x, y).at(1) - 2pt, circle(radius: 2pt, fill: black))
#let terminal(x, y) = place(dx: at(x, y).at(0) - 2.2pt, dy: at(x, y).at(1) - 2.2pt,
  circle(radius: 2.2pt, fill: white, stroke: 0.8pt))

// A zigzag resistor or a capacitor between two points on the same level, the part centred between them
#let resistor(x1, x2, y) = {
  let (a, b) = ((x1 + x2) / 2 - 0.45, (x1 + x2) / 2 + 0.45)
  let zigzag = range(1, 7).map(i => (a + (i - 0.5) * 0.15, y + if calc.odd(i) { 0.18 } else { -0.18 }))
  wire((x1, y), (a, y), ..zigzag, (b, y), (x2, y))
}
#let capacitor(x1, x2, y) = {
  let (a, b) = ((x1 + x2) / 2 - 0.1, (x1 + x2) / 2 + 0.1)
  wire((x1, y), (a, y))
  wire((b, y), (x2, y))
  wire((a, y - 0.35), (a, y + 0.35))
  wire((b, y - 0.35), (b, y + 0.35))
}

#box(width: 9.2 * unit, height: 6.3 * unit, {
  // the op-amp: inverting input at (-1.2, 0.5), non-inverting input at (-1.2, -0.5), output at (1.2, 0)
  wire((-1, 1), (-1, -1), (1, 0), (-1, 1))
  wire((-1.2, 0.5), (-1, 0.5))
  wire((-1.2, -0.5), (-1, -0.5))
  wire((1, 0), (1.2, 0))
  label(-0.75, 0.5, left + horizon, $-$)
  label(-0.75, -0.5, left + horizon, $+$)

  // the input resistor, from the input terminal to the inverting input
  terminal(-4.7, 0.5)
  label(-4.85, 0.5, right + horizon, $v_"in"$)
  resistor(-4.7, -1.7, 0.5)
  label(-3.2, 0.2, top + center, $R_"in"$)
  wire((-1.7, 0.5), (-1.2, 0.5))
  dot(-1.7, 0.5)

  // the feedback resistor and the capacitor across it, from the inverting input to the output
  wire((-1.7, 0.5), (-1.7, 3.5))
  resistor(-1.7, 1.2, 2)
  label(-0.25, 2.35, bottom + center, $R_f$)
  capacitor(-1.7, 1.2, 3.5)
  label(-0.25, 3.95, bottom + center, $C$)
  wire((1.2, 3.5), (1.2, 0))
  dot(-1.7, 2)
  dot(1.2, 2)
  dot(1.2, 0)

  // the non-inverting input to earth
  wire((-1.2, -0.5), (-1.2, -1.4))
  wire((-1.5, -1.4), (-0.9, -1.4))
  wire((-1.38, -1.52), (-1.02, -1.52))
  wire((-1.26, -1.64), (-1.14, -1.64))

  // the output terminal
  wire((1.2, 0), (2.2, 0))
  terminal(2.2, 0)
  label(2.35, 0, left + horizon, $v_"out"$)
})
