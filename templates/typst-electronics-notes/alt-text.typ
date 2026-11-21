// How each equation is read aloud by a screen reader. PDF/UA-1 (the download button's accessible PDF) needs this
// alt text on every equation, inline ones too. Each line pairs an equation, written exactly as in the text, or a
// numbered equation's label, with its words. Change an equation and change its line too, or PDF/UA-1 lists it in Logs.
#let spoken = (
  ($square$, "end of proof"),
  ($C$, "C"),
  ($R_"in"$, "R in"),
  ($R_f$, "R f"),
  ($f_c$, "f c"),
  ($f$, "f"),
  ($v_"in"$, "v in"),
  ($v_"out"$, "v out"),
  ($-$, "minus"),
  ($+$, "plus"),
  ($Z_f = R_f parallel 1 / (j omega C) = R_f / (1 + j omega R_f C)$, "Z f equals R f in parallel with 1 over j omega C, which equals R f over 1 plus j omega R f C"),
  (<eq:gain>, "H of j omega equals v out over v in, which equals minus Z f over R in, which equals minus R f over R in, times 1 over 1 plus j omega R f C"),
  (<eq:cutoff>, "f c equals 1 over 2 pi R f C"),
  ($omega R_f C << 1$, "omega R f C is much less than 1"),
  ($-R_f \/ R_"in" = -47 \/ 4.7 = -10$, "minus R f over R in equals minus 47 over 4.7, which equals minus 10"),
  ($20 log_10 10 = 20 thin "dB"$, "20 log base 10 of 10 equals 20 decibels"),
  ($(13 thin "V/µs") / (2 pi times 10 thin "V") approx 207 thin "kHz"$, "13 volts per microsecond over 2 pi times 10 volts, which is about 207 kilohertz"),
)

// gives every equation in the document whose body or label is listed above its words as alt text
#let alt-text(doc) = spoken.fold(doc, (doc, (key, words)) => {
  show (if type(key) == label { key } else { math.equation.where(body: key.body) }): set math.equation(alt: words)
  doc
})
