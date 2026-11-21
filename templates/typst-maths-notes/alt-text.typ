// How each equation is read aloud by a screen reader. PDF/UA-1 (the download button's accessible PDF) needs this
// alt text on every equation, inline ones too. Each line pairs an equation, written exactly as in the text, or a
// numbered equation's label, with its words. Change an equation and change its line too, or PDF/UA-1 lists it in Logs.
#let spoken = (
  ($square$, "end of proof"),
  ($A$, "A"),
  ($t$, "t"),
  ($lambda$, "lambda"),
  ($2 times 2$, "2 by 2"),
  ($upright(bold(x))(t) in RR^2$, "vector x of t is in R 2"),
  ($A upright(bold(v)) = lambda upright(bold(v))$, "A times vector v equals lambda times vector v"),
  ($upright(bold(v))$, "vector v"),
  ($upright(bold(0))$, "the zero vector"),
  (<eq:char>, "p of lambda is defined as the determinant of A minus lambda I"),
  ($upright(bold(v))_1$, "vector v 1"),
  ($upright(bold(v))_2$, "vector v 2"),
  ($upright(bold(v))_1, upright(bold(v))_2$, "vectors v 1 and v 2"),
  ($lambda_1, lambda_2$, "lambda 1 and lambda 2"),
  ($lambda_1 != lambda_2$, "lambda 1 is not equal to lambda 2"),
  ($c_1 upright(bold(v))_1 + c_2 upright(bold(v))_2 = upright(bold(0))$, "c 1 times vector v 1, plus c 2 times vector v 2, equals the zero vector"),
  ($A - lambda_2 I$, "A minus lambda 2 times I"),
  ($c_1 (lambda_1 - lambda_2) upright(bold(v))_1 = upright(bold(0))$, "c 1 times lambda 1 minus lambda 2, times vector v 1, equals the zero vector"),
  ($c_1 = 0$, "c 1 equals 0"),
  ($c_2 = 0$, "c 2 equals 0"),
  ($upright(bold(x))' = A upright(bold(x))$, "vector x prime equals A times vector x"),
  (<eq:general>, "vector x of t equals c 1 times e to the lambda 1 t times vector v 1, plus c 2 times e to the lambda 2 t times vector v 2, for any real c 1 and c 2"),
  ($d / (d t) lr((e^(lambda t) upright(bold(v))), size: #120%) = lambda e^(lambda t) upright(bold(v))
    = e^(lambda t) A upright(bold(v)) = A lr((e^(lambda t) upright(bold(v))), size: #120%)$,
    "the derivative with respect to t of e to the lambda t times vector v equals lambda e to the lambda t vector v, which equals e to the lambda t times A vector v, which equals A times e to the lambda t vector v"),
  ($c_1, c_2$, "c 1 and c 2"),
  ($upright(bold(x))(0)$, "vector x of 0"),
  ($p(lambda) = (1 - lambda)^2 - 4 = (lambda - 3)(lambda + 1)$, "p of lambda equals 1 minus lambda, squared, minus 4, which equals lambda minus 3, times lambda plus 1"),
  ($lambda_1 = 3$, "lambda 1 equals 3"),
  ($lambda_2 = -1$, "lambda 2 equals minus 1"),
  ($(A - lambda I) upright(bold(v)) = upright(bold(0))$, "A minus lambda I, times vector v, equals the zero vector"),
  ($t = 0$, "t equals 0"),
  ($c_1 + c_2 = 2$, "c 1 plus c 2 equals 2"),
  ($c_1 - c_2 = 0$, "c 1 minus c 2 equals 0"),
  ($c_1 = c_2 = 1$, "c 1 equals c 2 equals 1"),
  ($e^(lambda_1 t) upright(bold(v))_1$, "e to the lambda 1 t times vector v 1"),
  ($x_1$, "x 1"),
  ($x_2$, "x 2"),
  ($lambda_1, lambda_2 < 0$, "lambda 1 and lambda 2 both less than 0"),
  ($lambda_1, lambda_2 > 0$, "lambda 1 and lambda 2 both greater than 0"),
  ($lambda_1 < 0 < lambda_2$, "lambda 1 less than 0, less than lambda 2"),
  ($alpha plus.minus i beta$, "alpha plus or minus i beta"),
  ($alpha, beta != 0$, "alpha and beta not equal to 0"),
  ($alpha > 0$, "alpha greater than 0"),
  ($alpha < 0$, "alpha less than 0"),
  ($plus.minus i beta$, "plus or minus i beta"),
  ($beta != 0$, "beta not equal to 0"),
)

// gives every equation in the document whose body or label is listed above its words as alt text
#let alt-text(doc) = spoken.fold(doc, (doc, (key, words)) => {
  show (if type(key) == label { key } else { math.equation.where(body: key.body) }): set math.equation(alt: words)
  doc
})
