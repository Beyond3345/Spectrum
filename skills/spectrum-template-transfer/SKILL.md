---
name: spectrum-template-transfer
description: Moves a paper into another template, LaTeX or Typst, keeping every word, label, citation, figure and equation, then compiles until it builds. Choose it when a project made by Template transfer › With an agent holds the old paper in source/ beside the new template's files, or when the user asks to move a document to another journal's or conference's template.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. project_map, compile and get_log come from Spectrum's own tools; without them, read the files yourself and ask the user to compile.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Moving a paper into a new template

The project holds two things: the new template's own files (its main file, class or style files, sample sections)
and the old paper, which Template transfer › With an agent puts in `source/`. The aim is the old paper's content in
the template's layout: the template's preamble, title block and bibliography style, with the paper's words, maths,
figures, tables, labels and citations unchanged.

## 1. Read both before changing anything

- With `project_map`, find the template's main file and the files it includes. Read them: where the title, authors,
  affiliations, abstract, keywords, sections, acknowledgements and bibliography go, and what the sample text is.
- Find the old paper's main file in `source/` (the file with `\documentclass`, or the `.typ` or `.md` file named
  main) and read it with every file it includes. Note its packages or imports, its own commands and functions, its
  figures, its bibliography files and its citation commands.
- For a task that touches more than two files, show a plan first: which part of the old paper goes where.

## 2. Move the content, not the layout

- Fill the template's title block from the old paper: title, authors, affiliations, emails, abstract, keywords.
  Keep the template's commands or function arguments for them.
- Replace the template's sample sections with the old paper's sections, in order. Keep the template's file layout:
  if it puts sections in their own files, do the same.
- Copy the figure files and the bibliography files the paper uses out of `source/` into the places the template
  expects, and fix the paths in the text.
- Bring over only the packages, imports and commands the paper's own text needs, and only where the template does
  not already give them. Never bring over page size, margins, fonts, line spacing or a document class option that
  the template sets: those are the template's to decide.
- Use the template's bibliography style. Keep every citation key exactly as written.

## 3. When the languages differ (LaTeX to Typst, or Typst to LaTeX)

- Rewrite the markup, never the words. Headings, emphasis, lists, figures, tables and cross references take the
  target's own form: `\section{…}` and `= …`, `\label{x}` and `<x>`, `\ref{x}` or `\cref{x}` and `@x`,
  `\cite{k}` and `@k` or `#cite(<k>)`.
- Maths: rewrite each formula in the target's syntax with the same meaning; check fractions, matrices, aligned
  equations and their numbering.
- A `.bib` file works in both. Keep it as it is and point the template's bibliography at it.
- A LaTeX package with no Typst equivalent (or the other way round): keep the content plain and say so in your
  answer, rather than inventing a function or a command.

## 4. Compile and check

- Compile with `compile`. Fix the first error, compile again, and stop after five tries to say what is left.
- With `project_map`, check that no label or citation is left unresolved that resolved in the old paper.
- Check that nothing was lost: every section heading of the old paper is in the new one, and every figure, table
  and equation, with the same labels.
- Leave `source/` as it is. Say in your answer that the user can remove it once they are happy with the new
  layout.

## Answer

Say which template the paper is now in, whether it builds, what could not be carried over (a package, a custom
layout, a length limit the template sets) and anything the user must check by eye, such as figure sizes.
