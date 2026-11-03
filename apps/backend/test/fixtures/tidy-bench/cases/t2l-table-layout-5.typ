#set page(paper: "a4", margin: 25mm)
#set text(size: 11pt, lang: "en", region: "AU")

Region starts here.

#figure(
  table(
    columns: (auto, 1fr, 1fr),
    table.header(table.cell(rowspan: 2)[Beam], table.cell(colspan: 2)[Deflection (mm)], [Measured], [Predicted]),
    [B1], [4.1], [3.9],
    [B2], [5.6], [5.2],
  ),
  caption: [Beam deflections.],
) <tab:beams>

Region ends here.

B2 is furthest from its prediction (@tab:beams).
