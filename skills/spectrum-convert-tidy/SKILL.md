---
name: spectrum-convert-tidy
description: Tidy one flagged region of a document Spectrum converted between LaTeX and Typst. Use only when Spectrum's converter asks, one region at a time. The answer is one replacement block or a skip, and Spectrum checks it before anything is kept.
license: MIT
compatibility: Called by Spectrum's converter with one region per request. Needs no tools. Works with small, fast models.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Tidy one converted region

Spectrum has converted a document between LaTeX and Typst with fixed rules. Most of it is
finished. You get one small region the rules could not place well. You change that region
only, and only its layout.

## What you get

- ORIGINAL: the region as it was, in the source format.
- CONVERTED: the region as converted, in the target format. This is the only text you may
  change.
- KIND: what the region is, and the rule card for that kind below.

## What you answer

Exactly this, with nothing before or after it:

<<<REPLACE r3
the new text for the region
>>>

If you are not sure, answer only:

SKIP r3

Use the region's own name (r3 here). Do not copy the `spectrum:region` marker lines.

## Checklist before you answer

1. I changed only the CONVERTED text, and only its layout.
2. Every word of the region is still there. I added no words, except ones the ORIGINAL has
   that the CONVERTED text lost.
3. Every label, such as <fig:x> or \label{fig:x}, is still there, exactly as written.
4. Every reference and citation, such as @fig:x, @Masters2013, \cref{fig:x} or
   \parencite{Masters2013}, is still there, exactly as written.
5. Every piece of maths is still there, unchanged.
6. I added no #import, no #set page, #set text or #set document, no #show rule,
   no \usepackage and no preamble command.
7. My answer is one <<<REPLACE ...>>> block, or SKIP. No explanation, no Markdown fence.

## Rules for every region

- Write the target format as Spectrum's style guide writes it (the rule card says how).
- Keep it short. A region is a few lines; your answer should be about as long.
- When the ORIGINAL does something the target format cannot do, keep the words and drop the
  effect. Do not invent a replacement.
- Never invent text, numbers, references, labels or citations.
- If the CONVERTED text already looks right, answer SKIP.

## Rule cards

### titlepage (LaTeX to Typst)

The ORIGINAL is a LaTeX titlepage. Write a Typst page:

- Start with #page(numbering: none)[ and end with ].
- Inside, #align(center)[ ... ].
- \vspace*{30mm} or \vspace{12mm} becomes #v(30mm) or #v(12mm). \vfill becomes #v(1fr).
- {\LARGE\bfseries Text\par} becomes #text(size: 17pt, weight: "bold")[Text].
  \Large is 14pt, \large is 12pt, \normalsize is the default and needs no #text.
- Each \par or line of its own becomes its own line. Use \ at the end of a line only where
  the ORIGINAL used \\.

### titlepage (Typst to LaTeX)

The ORIGINAL is a Typst title block or page. Write:

- \begin{titlepage} ... \end{titlepage}, with \centering first.
- #v(30mm) becomes \vspace*{30mm} at the top, \vspace{30mm} elsewhere. #v(1fr) becomes \vfill.
- #text(size: 17pt, weight: "bold")[Text] becomes {\LARGE\bfseries Text\par}.

### cv-header (both directions)

The ORIGINAL puts a name and a line about the person on the left and contact details on the
right.

- Typst: #grid(columns: (1fr, auto), [left lines], align(right)[right lines]).
- LaTeX: \begin{minipage}[t]{0.6\linewidth} left lines \end{minipage}\hfill
  \begin{minipage}[t]{0.38\linewidth}\raggedleft right lines \end{minipage}
- Lines inside each side end with \ in Typst and \\ in LaTeX.

### unknown-environment (LaTeX to Typst)

The ORIGINAL uses an environment the converter does not know, and the CONVERTED text keeps its
words with a TODO comment.

- If the environment only boxes or highlights text, write #block(inset: 0.6em,
  stroke: 0.5pt + luma(180))[ ... ] around the words.
- If it is a list of some kind, write a Typst list (- items, or + for numbered ones).
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### unknown-command (LaTeX to Typst)

The ORIGINAL uses a command the converter does not know, inside one paragraph.

- If it only changes how text looks (bold, italic, colour, size), write the Typst equivalent:
  *bold*, _italic_, #text(fill: blue)[...], #text(size: 0.9em)[...].
- If it prints a symbol, write the symbol itself.
- Otherwise answer SKIP.

### unknown-environment (Typst to LaTeX)

The ORIGINAL is a call, on its own, of a function the document defines with #let (a box, a
list of steps), and the CONVERTED text keeps its words without its look, with a TODO comment.

- If the function only boxes or shades text, write \fbox{\parbox{\linewidth}{ ... }} around the
  words, or \begin{quote} ... \end{quote} if it only sets them apart.
- If it is a list of some kind, write \begin{itemize} or \begin{enumerate} with an \item for each
  part.
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### unknown-command (Typst to LaTeX)

The ORIGINAL calls a function the document defines with #let, inside one paragraph, and the
CONVERTED text keeps its words without its look.

- If it only changes how text looks, write the LaTeX: \textbf{...}, \emph{...}, {\small ...},
  \texttt{...}, or \fbox{...} for a box around a word. A colour needs a package, so keep the
  words and drop the colour.
- Otherwise answer SKIP.
- Remove the TODO comment only if you replaced the region.

### table-layout (both directions)

The ORIGINAL table has a layout the converter approximated (column widths, a note, a rule).

- Keep every cell, in order. Keep the caption and the label.
- Typst: stroke: none, table.hline(stroke: 0.08em) at the top and bottom, 0.05em under
  the header, table.header(...) for header rows, no table.vline.
- LaTeX: booktabs (\toprule, \midrule, \bottomrule), no vertical lines, no \hline.

## Examples

Good answer:

<<<REPLACE r1
#page(numbering: none)[
  #align(center)[
    #v(30mm)
    #text(size: 17pt, weight: "bold")[Rooftop solar output across a Melbourne year]
    #v(12mm)
    #text(size: 14pt)[Your Name]
    #v(1fr)
    School of Engineering \
    Your University
  ]
]
>>>

Bad answer (an explanation and a fence; Spectrum cannot use it):

Sure, here is the improved title page:
```typst
#page(...)
```

## If Spectrum says your answer was not used

It tells you why in one sentence. Fix only that and answer again in the same format. After
three tries Spectrum keeps its own text, and that is fine.
