#set page(paper: "a4", margin: 25mm)
#set text(size: 11pt, lang: "en", region: "AU")

Region starts here.

#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header([Material], [Cost (AUD)], [Life (years)]),
    [Timber], [120], [25],
    [Steel], [210], [50],
    table.cell(colspan: 3)[Prices from two local suppliers, May 2026.],
  ),
  caption: [Decking options.],
) <tab:deck>

Region ends here.

Steel lasts twice as long (@tab:deck).
