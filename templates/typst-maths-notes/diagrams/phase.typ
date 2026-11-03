// The phase plane for the example in section 2, drawn in plain Typst with no package.
// x₁ runs from -1 to 6 and x₂ from -4.5 to 5, at 10 mm to one unit.
#let unit = 10mm
#let at(x, y) = ((x + 1) * unit, (5 - y) * unit) // a point of the plane, measured from the box's top left
#let label(x, y, where, body) = place(dx: at(x, y).at(0), dy: at(x, y).at(1), box(place(where, body)))
#let tip(x, y, angle) = place(dx: at(x, y).at(0), dy: at(x, y).at(1), rotate(angle, origin: top + left,
  curve(fill: black, curve.move((0pt, 0pt)), curve.line((-5pt, -2pt)), curve.line((-5pt, 2pt)), curve.close())))

#box(width: 7 * unit, height: 9.5 * unit, {
  set text(size: 9pt)

  // the axes through the origin, with a tick and a number every 2 units
  place(line(start: at(-1, 0), end: at(6, 0), stroke: 0.5pt))
  place(line(start: at(0, -4.5), end: at(0, 5), stroke: 0.5pt))
  tip(6, 0, 0deg)
  tip(0, 5, -90deg)
  for x in (2, 4) {
    place(line(start: at(x, 0.08), end: at(x, -0.08), stroke: 0.5pt))
    label(x, -0.15, top + center, [#x])
  }
  for y in (-4, -2, 2, 4) {
    place(line(start: at(-0.08, y), end: at(0.08, y), stroke: 0.5pt))
    label(-0.15, y, right + horizon, [#y])
  }
  label(6, 0.2, bottom + right, $x_1$)
  label(0.2, 5, top + left, $x_2$)

  // the eigenvector directions, x₂ = x₁ and x₂ = -x₁
  let dashed = (paint: gray, thickness: 0.6pt, dash: "dashed")
  place(line(start: at(-1, -1), end: at(5, 5), stroke: dashed))
  place(line(start: at(-1, 1), end: at(4, -4), stroke: dashed))

  // the solution from the example, for t from -1.4 to 0.55
  let points = range(100).map(i => {
    let t = -1.4 + i * 1.95 / 99
    at(calc.exp(3 * t) + calc.exp(-t), calc.exp(3 * t) - calc.exp(-t))
  })
  place(curve(stroke: 1pt + blue, curve.move(points.first()), ..points.slice(1).map(curve.line)))

  // the starting point x(0) = (2, 0)
  place(dx: at(2, 0).at(0) - 2pt, dy: at(2, 0).at(1) - 2pt, circle(radius: 2pt, fill: black))
  label(1.9, 0.15, bottom + right, $upright(bold(x))(0)$)
})
