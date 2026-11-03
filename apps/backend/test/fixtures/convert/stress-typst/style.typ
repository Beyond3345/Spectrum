// The definitions the chapters share; main.typ and each chapter import them

// A panel of a figure: #subfigure(image(...), caption: [...]) <fig:name>, numbered (a), (b), ...
#let subfigure = figure.with(kind: "subfigure", supplement: [Figure], numbering: "(a)")

// Theorem-like environments, all sharing one counter per section: Theorem 2.1, Example 2.2, ...
#let theorem-number = n => numbering("1.1", counter(heading).get().first(), n)
#let theorem-like(name, head-style: strong, body-style: body => body) = (title: none, body) => figure(
  kind: "theorem", supplement: name, numbering: theorem-number, outlined: false,
  [
    #head-style[#name #context counter(figure.where(kind: "theorem")).display(theorem-number)#if title != none [ (#title)].]
    #body-style(body)
  ],
)
#let theorem = theorem-like([Theorem], body-style: emph)     // italic text, for statements
#let lemma = theorem-like([Lemma], body-style: emph)
#let corollary = theorem-like([Corollary], body-style: emph)
#let definition = theorem-like([Definition])                 // upright text, for definitions and examples
#let example = theorem-like([Example])
#let remark = theorem-like([Remark], head-style: emph)       // italic heading and upright text, for asides
#let proof(body, name: [Proof]) = block(width: 100%)[_#name._ #body #h(1fr) $square$] // ends with the proof box
#let solution = proof.with(name: [Solution])
