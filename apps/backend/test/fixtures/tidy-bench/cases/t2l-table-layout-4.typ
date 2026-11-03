#set page(paper: "a4", margin: 25mm)
#set text(size: 11pt, lang: "en", region: "AU")

Region starts here.

#figure(
  table(
    columns: 2,
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Bolt], [Torque (Nm)]),
    table.hline(stroke: 0.05em),
    [M12], [80],
    [M16], [200],
    table.hline(stroke: 0.08em),
  ),
  caption: [Bolt torques.],
) <tab:bolts>

Region ends here.

Use a calibrated wrench for @tab:bolts.
