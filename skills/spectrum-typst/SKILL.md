---
name: spectrum-typst
description: Edit and fix a Typst project in Spectrum. Use when a .typ document will not compile, its log shows file:line:column errors, a package import fails, or before handing back any change to .typ or .bib files, so the project still builds cleanly with its pinned Typst version.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. The compile and get_log tools come from Spectrum's tools server (local agents on macOS); without them, read the compile log the user sent or ask them to compile.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Working on a Typst project in Spectrum

A Typst project in Spectrum is a folder of plain files: a main `.typ` document, any chapters it includes, `.bib` files, figures and fonts. Spectrum compiles it with its own Typst, from the project's folder as the root. Your changes reach the project only after the user reviews them.

## Find your way around first

1. Find the main document. With Spectrum's tools, `project_map` names it. Otherwise it is usually `main.typ`.
2. Follow `#include "…"` and `#import "…"` from the main document to see which files are part of the build.
3. Read the top of the main document: its `#set` and `#show` rules decide the page, the text and the headings for everything after them. Change a rule there rather than styling each place by hand.
4. Note the Typst version. A project can be pinned to an older one (0.12, 0.13 or 0.14) in Spectrum's compile menu; write only what that version understands. When unsure, keep to features that have existed since 0.12.

## The compile loop

1. Compile (`compile`, or ask the user to compile and send the log).
2. Errors come as `file:line:column: error: message`, sometimes followed by `hint:` lines. Fix the first error first.
3. Fix it with the smallest change that removes its cause, then compile again. Stop after five rounds without progress and explain what is left.
4. When it builds, check the warnings too, for example a label nothing refers to or a font that was not found.

## Reading common errors

| Log says | Usual cause | What to do |
| --- | --- | --- |
| `unknown variable: x` | a name used before it is defined or imported, or code where text was meant | define or import it, or escape the `#` |
| `unclosed delimiter` | a `[`, `(` or `{` left open | find the opening bracket near the line given |
| `file not found` | a wrong path | paths are relative to the file that names them; a path starting with `/` is relative to the project folder |
| `failed to download package` | a first `@preview` import without the internet | say so; after one online compile the package works offline |
| `label <x> does not exist` | a reference to a label nothing has | add the label after the element, or correct the reference |
| `expected content, found string` | a string where content is needed | wrap it in `[...]` or use the string's value as text |

## Rules for changes

- Labels follow their element, as in `#figure(...) <fig:results>`, and are referred to with `@fig:results`. Keep the project's own prefixes (`fig:`, `tab:`, `eq:`, `sec:`).
- Citations are `@key` for keys from the `.bib` that `#bibliography("refs.bib")` reads; use `#cite(label("key"))` for a key with characters `@` cannot take, such as `/`.
- Figures are `#figure(image("/figures/plot.png", width: 80%), caption: [...])`. Tables are `#figure(table(columns: 3, [a], [b], [c]), caption: [...])`.
- In content, `#`, `$`, `*`, `_`, `@`, `<`, `[` and `]` have meaning. Escape them with `\` when they are meant as text.
- Use `@preview` packages only when the project already uses them or the user asked; each one needs the internet on its first compile.
- Change only what the task needs. Do not reformat files or rewrite working `#set` rules.
- Never edit anything under `.spectrum`, and never change a compiled PDF.
- Add a `.bib` entry only from a real source (`fetch_bibtex`, or a DOI the user gave). Never invent a reference, a DOI or a page number.
- When something needs the author's judgement, leave the text as it is and use `suggest_todo` to say what needs doing.

## Before you finish

- The document compiles with the project's Typst version, or you have said clearly why it does not.
- Every `@` reference and citation resolves.
- Summarise what you changed, file by file, in a few lines.
