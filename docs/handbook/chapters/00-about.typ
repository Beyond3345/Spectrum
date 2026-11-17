#import "../template.typ": *

#heading(numbering: none)[About this handbook] <ch-about>

Spectrum is a desktop editor for LaTeX, Typst and Markdown documents, for students and researchers who write papers, notes, reports and slides. It keeps each project as an ordinary folder on the computer, compiles it beside the source and adds an assistant, a reference manager and a diagram composer that writes TikZ, Typst and Mermaid code for the document.

This handbook describes every feature of Spectrum 2.5.0 on macOS and Windows. It assumes that the reader already writes LaTeX, Typst and Markdown, so it never explains the languages themselves. It only explains what Spectrum does with them: what a feature is for, where it is, how it is used, what its options mean and what it writes into the project.

The handbook is divided into twelve chapters,

- @ch-start covers installing Spectrum, the projects page, templates, the Settings window and syncing between computers,
- @ch-writing covers the editor, the three languages and their engines, compiling and the preview, the language servers, floats, Jyutping and the writing checks,
- @ch-assistant and @ch-references cover the assistant, the agents, references, Zotero, research, checkpoints and GitHub,
- @ch-composer describes what every diagram composer shares, and @ch-circuits to @ch-forms describe each composer in turn, from circuits to form presets, and
- @ch-symbols lists every symbol the diagram composer can place.

The chapters can be read in any order, and each one points to the others where a feature crosses between them.

#heading(level: 2, numbering: none)[Conventions] <sec-about-conventions>

A name as Spectrum shows it, such as a button, a field or a tab, is set in semibold, as in #ui[Compile]. A path through menus or the Settings window is joined with arrows, as in #menu[Settings][Engines][LaTeX]. Keys are drawn as caps, as in #key("⌘", "Enter") for Command and Return together. Shortcuts are given for macOS. On Windows, #key("Ctrl") takes the place of #key("⌘"), #key("Alt") of #key("⌥") and #key("Shift") of #key("⇧"), and @ch-start lists the other differences. File names, commands and code are set in `monospace`, and a note that should not be missed is set apart with a rule down its left side.
