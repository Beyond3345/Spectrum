// Document
#set document(                                  // the title and author, also shown in the PDF's properties
  title: [Week 4: Systems of linear differential equations],
  author: "Your Name",
)

// References
#set bibliography(title: [References])          // APA heads the list References, not Bibliography
#show bibliography: it => context if query(cite).len() > 0 { it } // no References heading until something is cited

// Page
#set page(paper: "a4", margin: 25mm, numbering: "1") // A4, 25 mm margins all round, page numbers at the foot
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: true)                         // straight right margins, as LaTeX sets them
#set heading(numbering: "1.1")                  // numbered headings: 1, 1.1, 1.1.1

// Maths
#show figure.where(kind: "theorem"): it => align(start, it.body) // a theorem draws its own heading, left aligned
#show heading.where(level: 1): it => {          // theorems count again in each section: 2.1, 2.2, ...
  counter(figure.where(kind: "theorem")).update(0)
  it
}

// Number equations, figures and tables by section: (2.1), Figure 2.1, ...
#let by-section(pattern) = n => numbering(pattern, counter(heading).get().first(), n)
#set math.equation(numbering: by-section("(1.1)")) // equations: (2.1), (2.2), ...
#set figure(numbering: by-section("1.1"))       // figures, tables and listings: 2.1, 2.2, ...
#show heading.where(level: 1): it => {          // every section starts these counts again at 1
  counter(math.equation).update(0)
  counter(figure.where(kind: image)).update(0)
  counter(figure.where(kind: table)).update(0)
  counter(figure.where(kind: raw)).update(0)
  it
}

// Figures and tables
#show figure.where(kind: table): set figure.caption(position: top) // captions above tables, below figures

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

#align(center)[
  #title()
  Your Name \
  Semester 2, 2026
]

= Eigenvalues and eigenvectors

Throughout, $A$ is a real $2 times 2$ matrix and $upright(bold(x))(t) in RR^2$.

#definition[
  A number $lambda$ is an _eigenvalue_ of $A$ if $A upright(bold(v)) = lambda upright(bold(v))$ for some non-zero
  vector $upright(bold(v))$, called an _eigenvector_. The eigenvalues are the roots of the _characteristic
  polynomial_
  $ p(lambda) := det(A - lambda I). $ <eq:char>
]

#lemma[
  Eigenvectors $upright(bold(v))_1, upright(bold(v))_2$ belonging to distinct eigenvalues
  $lambda_1 != lambda_2$ are linearly independent.
] <lem:independent>

#proof[
  Suppose $c_1 upright(bold(v))_1 + c_2 upright(bold(v))_2 = upright(bold(0))$. Applying $A - lambda_2 I$ to
  both sides gives $c_1 (lambda_1 - lambda_2) upright(bold(v))_1 = upright(bold(0))$, so $c_1 = 0$, and then
  $c_2 = 0$.
]

= Solving $upright(bold(x))' = A upright(bold(x))$

#theorem[
  Suppose $A$ has distinct real eigenvalues $lambda_1, lambda_2$ with eigenvectors
  $upright(bold(v))_1, upright(bold(v))_2$. Then every solution of $upright(bold(x))' = A upright(bold(x))$ has
  the form
  $ upright(bold(x))(t) = c_1 e^(lambda_1 t) upright(bold(v))_1 + c_2 e^(lambda_2 t) upright(bold(v))_2,
    quad c_1, c_2 in RR. $ <eq:general>
] <thm:general>

#proof[
  Each term solves the system, since
  $d / (d t) lr((e^(lambda t) upright(bold(v))), size: #120%) = lambda e^(lambda t) upright(bold(v))
  = e^(lambda t) A upright(bold(v)) = A lr((e^(lambda t) upright(bold(v))), size: #120%)$, and so does any
  linear combination of them. By @lem:independent, $upright(bold(v))_1$ and $upright(bold(v))_2$ form a basis,
  so we can choose $c_1, c_2$ to match any initial value $upright(bold(x))(0)$, and by uniqueness of solutions
  this is the only solution with that initial value.
]

#example[
  Solve $upright(bold(x))' = A upright(bold(x))$ with
  #math.equation(block: true, numbering: none, $
    A = mat(1, 2; 2, 1), quad upright(bold(x))(0) = vec(2, 0).
  $)
] <ex:saddle>

#solution[
  By @eq:char, $p(lambda) = (1 - lambda)^2 - 4 = (lambda - 3)(lambda + 1)$, so the eigenvalues are
  $lambda_1 = 3$ and $lambda_2 = -1$. Solving $(A - lambda I) upright(bold(v)) = upright(bold(0))$ gives
  #math.equation(block: true, numbering: none, $
    upright(bold(v))_1 = vec(1, 1), quad upright(bold(v))_2 = vec(1, -1).
  $)
  At $t = 0$, @eq:general needs $c_1 + c_2 = 2$ and $c_1 - c_2 = 0$, so $c_1 = c_2 = 1$ and
  #math.equation(block: true, numbering: none, $
    x_1(t) &= e^(3t) + e^(-t), \
    x_2(t) &= e^(3t) - e^(-t).
  $)
  @fig:phase shows this trajectory in the phase plane.
]

#remark[
  If the eigenvalues are complex, @eq:general still holds with complex constants, and the real and imaginary
  parts of $e^(lambda_1 t) upright(bold(v))_1$ give two real solutions.
]

#figure(
  include "/diagrams/phase.typ",
  caption: [
    The solution of @ex:saddle (blue) leaves along $upright(bold(v))_1$ as $t$ grows. The dashed lines are the
    eigenvector directions.
  ],
) <fig:phase>

= Summary

The signs of the eigenvalues decide how solutions behave near the origin, as @tab:cases shows.

#figure(
  table(
    columns: (auto, auto, 1fr),
    align: (left, left, left),
    stroke: none,
    table.hline(stroke: 0.08em),
    table.header([Eigenvalues], [Origin], [Behaviour of solutions]),
    table.hline(stroke: 0.05em),
    [$lambda_1, lambda_2 < 0$], [stable node], [every solution tends to $upright(bold(0))$],
    [$lambda_1, lambda_2 > 0$], [unstable node], [every non-zero solution grows without bound],
    [$lambda_1 < 0 < lambda_2$], [saddle], [solutions come in along one eigenvector and leave along the other],
    [$alpha plus.minus i beta$, $alpha, beta != 0$], [spiral], [solutions rotate, growing if $alpha > 0$ and shrinking if $alpha < 0$],
    [$plus.minus i beta$, $beta != 0$], [centre], [solutions circle the origin forever],
    table.hline(stroke: 0.08em),
  ),
  caption: [Behaviour of $upright(bold(x))' = A upright(bold(x))$ by eigenvalue.],
) <tab:cases>

#bibliography("refs.bib", style: "apa")
