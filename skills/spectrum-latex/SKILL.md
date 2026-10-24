---
name: spectrum-latex
description: Edit and fix a LaTeX project in Spectrum. Use when a document will not compile or its log shows errors, undefined references or missing files, and before handing back any change to .tex or .bib files, so the project still builds cleanly.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. The compile and get_log tools come from Spectrum's tools server (local agents on macOS); without them, read the compile log the user sent or ask them to compile.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Working on a LaTeX project in Spectrum

Spectrum keeps the user's project as plain files: one or more `.tex` documents, `.bib` files, figures and anything else the author added. Your changes reach the project only after the user reviews them, so make each change one they can read and accept with confidence.

## Find your way around first

1. Find the main document. With Spectrum's tools, `project_map` names it and lists the outline, labels, inputs, unresolved references and the engine. Otherwise look for the `.tex` file with `\documentclass`, or a `% !TEX root = ...` comment in a chapter.
2. Follow `\input`, `\include` and `\subfile` from the main document to see which files are part of the build. A `.tex` file nothing includes is not part of this document.
3. Note the engine. A preamble with `fontspec`, `unicode-math` or `polyglossia` needs XeLaTeX or LuaLaTeX; everything else usually builds with pdfLaTeX. A `% !TEX program = ...` comment overrides the guess.
4. Read the preamble before adding a package. Many projects load a class or a style file that already provides what you need.

## The compile loop

1. Compile (`compile`, or ask the user to compile and send the log).
2. Read the first error, not the last. Later errors are often caused by the first one. With `-file-line-error` each error starts with `file:line:`.
3. Fix that one error with the smallest change that removes its cause.
4. Compile again. Stop after five rounds without progress and explain what is left, rather than making speculative edits.
5. When the build succeeds, check the warnings that matter: `Citation ... undefined`, `Reference ... undefined`, `There were undefined references` and `Label(s) may have changed` (which only needs another run).

## Reading common errors

| Log says | Usual cause | What to do |
| --- | --- | --- |
| `Undefined control sequence` | a command from a package that is not loaded, or a typing slip | load the package, or correct the command name |
| `File 'x.sty' not found` | the package is not installed | use a package that is, or tell the user which one to install |
| `Missing $ inserted` | maths outside maths mode, often `_` or `^` in text | put the maths in `$...$` or escape the character |
| `Runaway argument` or `File ended while scanning` | an unclosed brace or environment | find the opening brace or `\begin` on the line given |
| `Environment x undefined` | a missing package or a misspelt environment | load the package or fix the name |
| `LaTeX Error: File 'figure' not found` | a wrong path or extension | check the path relative to the main document's folder |
| `Citation 'key' undefined` | the key is not in any `.bib` the document reads | add the entry, or correct the key |

## Rules for changes

- Keep to the project's own style: its indentation, its line breaks (some authors write one sentence per line) and its way of naming labels (`sec:`, `fig:`, `tab:`, `eq:`).
- Change only what the task needs. Do not reformat files, reorder the preamble or replace packages that work.
- Never edit anything under `.spectrum`, and never change a compiled PDF.
- Do not ask for shell escape, `\write18` or `--shell-escape`. Spectrum does not compile with it.
- Add a `.bib` entry only from a real source (`fetch_bibtex`, or a DOI the user gave). Never invent a reference, a DOI or a page number.
- When you add a figure, put the file in the project's figures folder if it has one, and refer to it relative to the main document.
- When something needs the author's judgement (a claim, a number, a missing figure), leave the text as it is and use `suggest_todo` to say what needs doing.

## Before you finish

- The document compiles, or you have said clearly why it does not.
- No new undefined citations or references.
- Summarise what you changed, file by file, in a few lines.
