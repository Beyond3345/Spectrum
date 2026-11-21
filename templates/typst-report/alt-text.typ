// How each equation is read aloud by a screen reader. PDF/UA-1 (the download button's accessible PDF) needs this
// alt text on every equation, inline ones too. Each line pairs an equation, written exactly as in the text, or a
// numbered equation's label, with its words. Change an equation and change its line too, or PDF/UA-1 lists it in Logs.
#let spoken = (
  (<eq:power>, "P equals eta times A times G"),
  ($eta$, "eta"),
  ($A$, "A"),
  ($G$, "G"),
  (<eq:temperature>, "eta equals eta ref times, 1 minus beta times, T c minus T ref"),
  ($beta approx$, "beta is about"),
)

// gives every equation in the document whose body or label is listed above its words as alt text
#let alt-text(doc) = spoken.fold(doc, (doc, (key, words)) => {
  show (if type(key) == label { key } else { math.equation.where(body: key.body) }): set math.equation(alt: words)
  doc
})
