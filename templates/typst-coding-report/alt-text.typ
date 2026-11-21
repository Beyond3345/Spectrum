// How each equation is read aloud by a screen reader. PDF/UA-1 (the download button's accessible PDF) needs this
// alt text on every equation, inline ones too. Each line pairs an equation, written exactly as in the text, or a
// numbered equation's label, with its words. Change an equation and change its line too, or PDF/UA-1 lists it in Logs.
#let spoken = (
  ($s$, "s"),
  ($v$, "v"),
  ($d$, "d"),
  ($Q$, "Q"),
  ($d[v]$, "d of v"),
  ($G = (V, E)$, "G equals V, E"),
  ($w(u, v) >= 0$, "w of u, v is at least 0"),
  ($s in V$, "s in V"),
  ($v in V$, "v in V"),
  ($d[v] <- infinity$, "set d of v to infinity"),
  ($d[s] <- 0$, "set d of s to 0"),
  ($Q <- {(0, s)}$, "set Q to hold the pair 0, s"),
  ($triangle.r$, "comment"),
  ($(k, u) <-$, "set k, u to"),
  ($(Q)$, "of Q"),
  ($k > d[u]$, "k is greater than d of u"),
  ($(u, v) in E$, "u, v in E"),
  ($d[u] + w(u, v) < d[v]$, "d of u plus w of u, v is less than d of v"),
  ($d[v] <- d[u] + w(u, v)$, "set d of v to d of u plus w of u, v"),
  ($(Q, (d[v], v))$, "of Q and the pair d of v, v"),
  ($|V|$, "the size of V"),
  ($|E|$, "the size of E"),
  ($|V|^2$, "the size of V squared"),
  ($O(1)$, "order 1"),
  ($O(|V|)$, "order of the size of V"),
  ($O(|V|^2)$, "order of the size of V squared"),
  ($O(log |V|)$, "order of log of the size of V"),
  ($O(lr(((|V| + |E|) log |V|), size: #120%))$, "order of, the size of V plus the size of E, times log of the size of V"),
  ($O(|E| + |V| log |V|)$, "order of the size of E plus the size of V times log of the size of V"),
)

// gives every equation in the document whose body or label is listed above its words as alt text
#let alt-text(doc) = spoken.fold(doc, (doc, (key, words)) => {
  show (if type(key) == label { key } else { math.equation.where(body: key.body) }): set math.equation(alt: words)
  doc
})
