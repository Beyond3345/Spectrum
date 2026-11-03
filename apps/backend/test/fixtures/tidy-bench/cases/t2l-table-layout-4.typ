#set page(paper: "a4", margin: 25mm)
#set text(size: 11pt, lang: "en", region: "AU")

Region starts here.

#figure(
  table(
    columns: 3,
    fill: (_, y) => if y == 0 { luma(220) },
    table.header([Week], [Rain (mm)], [Site visits]),
    [1], [12], [2],
    [2], [0], [3],
    [3], [31], [1],
  ),
  caption: [Weekly rain and visits.],
) <tab:weeks>

Region ends here.

Week 3 was the wettest (@tab:weeks).
