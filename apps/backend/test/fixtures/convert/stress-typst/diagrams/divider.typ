// A voltage divider drawn in plain Typst with no package, as the house diagrams are.
#box(width: 50mm, height: 24mm, {
  place(dx: 4mm, dy: 12mm, line(length: 12mm, stroke: 0.8pt))
  place(dx: 16mm, dy: 8mm, rect(width: 12mm, height: 8mm, stroke: 0.8pt))
  place(dx: 28mm, dy: 12mm, line(length: 18mm, stroke: 0.8pt))
  place(dx: 18mm, dy: 1mm, $R_1$)
})
