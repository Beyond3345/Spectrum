---
name: spectrum-markdown
description: Edit and fix a Markdown project in Spectrum, which pandoc turns into LaTeX or Typst for the PDF. Use when a .md document will not compile, a citation or figure does not come out, the log points into generated LaTeX or Typst, or before handing back any change to .md or .bib files.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. The compile and get_log tools come from Spectrum's tools server (local agents on macOS); without them, read the compile log the user sent or ask them to compile.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Working on a Markdown project in Spectrum

A Markdown project in Spectrum has a main `.md` file (usually `main.md`), `.bib` files and figures. Spectrum compiles it in two steps: pandoc writes LaTeX (or Typst, when the project chose Typst as its PDF engine), then that is compiled to the PDF. Your changes reach the project only after the user reviews them.

## Find your way around first

1. Read the YAML front matter at the top, between the `---` lines: `title`, `author`, `date`, `abstract`, `bibliography` and `csl`. When there is no `bibliography`, Spectrum gives pandoc every `.bib` in the project.
2. Note the PDF engine (LaTeX or Typst) from the compile menu or the log's first lines. Raw LaTeX in the text works only with the LaTeX engine; keep to plain Markdown so both work.
3. Images are found relative to the `.md` file's folder.

## The compile loop

1. Compile (`compile`, or ask the user to compile and send the log).
2. pandoc's own errors give a line and column in the `.md` (a broken front matter is the usual one). Errors from the second step are traced back to the `.md` line by their text; when one is not, look at the generated source (Logs › Show generated LaTeX) to see what pandoc made of the passage.
3. Fix the first error with the smallest change, then compile again. Stop after five rounds without progress and explain what is left.

## Reading common problems

| What happens | Usual cause | What to do |
| --- | --- | --- |
| `YAML parse exception` | a colon or quote in a front matter value | put the value in double quotes |
| A citation shows as `(key?)` or `[@key]` | the key is not in the bibliography pandoc read | add the entry, correct the key, or fix `bibliography:` |
| An image is missing | a wrong path, or an SVG without rsvg-convert installed | correct the path, or use a PNG or PDF |
| `Undefined control sequence` in the log | raw LaTeX in the Markdown, or a character pandoc passed through | replace it with Markdown, or escape the character |
| Maths does not appear | a space after the opening `$` or before the closing one | write `$x^2$`, with no inner spaces at the ends |

## Rules for changes

- Citations are `[@key]`, several as `[@a; @b]`, with a page as `[@key, p. 4]`. A citation in the running text is `@key`.
- Figures are `![Caption](figures/plot.png){#fig:plot width=80%}`. Tables are pipe tables, with `Table: Caption {#tbl:x}` on the line after.
- Headings are `#` to `####`. Keep the document's own heading levels and its blank lines between blocks.
- Inline maths is `$...$` and display maths `$$...$$`.
- Change only what the task needs. Do not reflow paragraphs or rewrite the front matter.
- Never edit anything under `.spectrum`, and never change a compiled PDF or the generated LaTeX or Typst.
- Add a `.bib` entry only from a real source (`fetch_bibtex`, or a DOI the user gave). Never invent a reference, a DOI or a page number.
- When something needs the author's judgement, leave the text as it is and use `suggest_todo` to say what needs doing.

## Before you finish

- The document compiles with the project's PDF engine, or you have said clearly why it does not.
- Every citation resolves and every image appears.
- Summarise what you changed, file by file, in a few lines.
