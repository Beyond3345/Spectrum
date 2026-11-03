// A stand-in for a drawing package: a framed box with a line across it and a label in the middle.
#let sketch(width: 40mm, label) = box(width: width, height: 12mm, stroke: 0.6pt, inset: 3pt, {
  place(horizon, line(length: 100%, stroke: 0.4pt + gray))
  align(center + horizon, box(fill: white, inset: 2pt, label))
})
