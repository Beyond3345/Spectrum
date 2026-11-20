---
title: "Week 4: Systems of linear differential equations"
author: Your Name
date: 20 November 2026
lang: en-AU
papersize: a4
fontsize: 11pt
geometry: margin=25mm
numbersections: true
bibliography: refs.bib
---

# Linear systems {#sec:systems}

A system of two first-order linear equations with constant coefficients can be written with a matrix [@Boyce2017]:

$$ \mathbf{x}'(t) = A\,\mathbf{x}(t), \qquad A = \begin{pmatrix} a & b \\ c & d \end{pmatrix}. $$ {#eq:system}

**Definition.** A number $\lambda$ is an *eigenvalue* of $A$ when $A\mathbf{v} = \lambda\mathbf{v}$ for some vector $\mathbf{v} \neq \mathbf{0}$, its *eigenvector*.

**Theorem.** If $A$ has two different real eigenvalues $\lambda_1$ and $\lambda_2$, with eigenvectors $\mathbf{v}_1$ and $\mathbf{v}_2$, every solution of @eq:system is

$$ \mathbf{x}(t) = c_1 e^{\lambda_1 t}\mathbf{v}_1 + c_2 e^{\lambda_2 t}\mathbf{v}_2. $$ {#eq:general}

# Worked example {#sec:example}

Solve $\mathbf{x}' = A\mathbf{x}$ with

$$ A = \begin{pmatrix} 1 & 1 \\ 4 & 1 \end{pmatrix}. $$

*Solution.* The eigenvalues are the roots of the characteristic equation:

$$
\begin{aligned}
\det(A - \lambda I) &= (1 - \lambda)^2 - 4 \\
&= (\lambda - 3)(\lambda + 1) = 0,
\end{aligned}
$$

so $\lambda_1 = 3$ and $\lambda_2 = -1$, with eigenvectors $\mathbf{v}_1 = (1, 2)^\top$ and $\mathbf{v}_2 = (1, -2)^\top$. By @eq:general,

$$ \mathbf{x}(t) = c_1 e^{3t}\begin{pmatrix} 1 \\ 2 \end{pmatrix} + c_2 e^{-t}\begin{pmatrix} 1 \\ -2 \end{pmatrix}. $$

Table: The two kinds of solution in @sec:example. {#tbl:kinds}

| Eigenvalue | Eigenvector | Behaviour as $t$ grows |
| --- | --- | --- |
| $3$ | $(1, 2)^\top$ | grows |
| $-1$ | $(1, -2)^\top$ | dies away |

# Exercises

1. Find the general solution when $A = \begin{pmatrix} 2 & 0 \\ 0 & -1 \end{pmatrix}$.
2. Show that the solution in @sec:example with $c_1 = 0$ tends to $\mathbf{0}$.

# References
