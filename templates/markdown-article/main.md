---
title: A Markdown article
author: Your Name
date: 2026-10-25
bibliography: refs.bib
---

# Introduction

Start writing here. A Markdown project compiles through pandoc into LaTeX, with the built-in Tectonic or your own TeX, or into Typst.

![A bar chart of the first measurements](figures/example.png){#fig:example width=60%}

@fig:example shows a first figure. Replace it with your own image or a diagram.

# Results

The first measurements are in @tbl:measures.

Table: First measurements. {#tbl:measures}

| Measure | Before | After |
| --- | --- | --- |
| Length | 12 mm | 15 mm |
| Width | 8 mm | 10 mm |
| Height | 3 mm | 4 mm |

Refer to a labelled figure, table, equation or section by its label, as in @fig:example, and Spectrum numbers it. Cite a source with its key in brackets, as in [@Knuth1984].

# References
