// The energy produced in each month of 2025, drawn as bars in plain Typst with no package.
// The energy axis runs from 0 to 1,000 kWh.
#let months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
#let energy = (950, 830, 740, 530, 390, 300, 340, 470, 610, 790, 880, 960) // kWh
#let (left-margin, width, height) = (16mm, 130mm, 55mm)
#let slot = width / months.len()
#let y(kwh) = (1000 - kwh) / 1000 * height     // from kWh to the box

#box(width: left-margin + width + 4mm, height: height + 6mm, {
  set text(size: 9pt)

  // the grid every 200 kWh with its numbers, then the frame
  for e in range(0, 1001, step: 200) {
    place(line(start: (left-margin, y(e)), end: (left-margin + width, y(e)), stroke: 0.4pt + luma(210)))
    place(dx: left-margin - 2pt, dy: y(e), box(place(right + horizon)[#e]))
  }
  place(dx: left-margin, rect(width: width, height: height, stroke: 0.6pt))
  place(dx: 0pt, dy: height / 2, box(place(left + horizon, rotate(-90deg, reflow: true)[Energy (kWh)])))

  // one bar for each month, with its name below
  for (i, kwh) in energy.enumerate() {
    let x = left-margin + i * slot + slot / 2
    place(dx: x - 1.6mm, dy: y(kwh), rect(width: 3.2mm, height: height - y(kwh), fill: blue.lighten(40%), stroke: 0.4pt + blue))
    place(dx: x, dy: height + 2pt, box(place(top + center, months.at(i))))
  }
})
