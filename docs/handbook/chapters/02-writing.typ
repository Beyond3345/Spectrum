#import "../template.typ": *

= Writing and compiling <ch-writing>

This chapter describes the editor, where a project's documents are written and compiled. It starts with the layout of the editor and the tools around the source, then covers the three languages and their engines, compiling and the PDF preview, and the language servers that check the source as it is typed. The later sections cover the tools for a finished document: floats, document insights, spelling and grammar, the to-do list and Jyutping. The chapter ends with every keyboard shortcut outside the diagram composer.

== The editor <sec-writing-editor>

The editor is divided into three columns (@fig-writing-editor). The sidebar on the left holds the project's files, Research and the to-do list, the middle column holds the source of the open file and the right column holds the compiled PDF. The switcher at the top right shows the source only, the source and the PDF side by side, or the PDF only, as do #key("⌘", "1"), #key("⌘", "2") and #key("⌘", "3"). #key("⌘", "\\") hides and shows the sidebar, and the line between the source and the PDF can be dragged to share the width between them.

#shot("figures/02-writing/editor-synctex.jpg", [The editor with a LaTeX project open. A double click in the PDF has jumped to line 109 of the source, which is highlighted, and the Outline in the sidebar marks the section the cursor is in.]) <fig-writing-editor>

=== The sidebar

The sidebar has three tabs. #ui[Files] is the project's file tree, #ui[Research] searches for papers (@ch-references) and #ui[To-dos] is the to-do list (@sec-writing-todos). The magnifying glass searches the tab that is showing: the project's files, the research sessions or the to-dos. The #ui[+] button and a right-click on the file tree both hold #ui[New file…], #ui[New folder…], #ui[New .bib], #ui[Upload files…] and #ui[Upload folder…], and a right-click on a file adds #ui[Rename…], #ui[Move to Bin…] and, for a document, #ui[Set as main file]. #ui[Move to Bin…] moves the file or folder to the Bin, the Recycle Bin on Windows, after saving any text typed in it, so it can be put back from there. On macOS 15 and later the message that follows has #ui[Undo], which puts it back in the project at once, as the main file again if it was one. On a drive with no Bin, such as a network share, Spectrum says so and asks before it deletes the file for good. Files can also be dragged between folders and dropped in from Finder. When a renamed or moved file is named elsewhere in the project, by `\include`, `\input`, `\includegraphics` or `\bibliography` in LaTeX, `#include` or `image()` in Typst, or an image or link in Markdown, Spectrum lists each of these and offers to update them. It saves a Before updating references checkpoint first, so the change can be undone from #menu[Tools][Checkpoints]. Only a path that names the file exactly is changed. The main file, which Compile builds, is marked #ui[Main], and a drawing from the diagram composer has #ui[Edit diagram] in its menu (@ch-composer).

On #ui[Files] the search looks through the text of the project as well as the names of its files. The matching file names come first, and #ui[In text] below them lists each line that holds the search, grouped by file with its line number and the match highlighted (@fig-writing-search). A click on a line opens the file there with the match selected. The three buttons beside #ui[In text] narrow the search: #ui[Aa] matches the case, #ui[ab] matches whole words only, so `\label` does not find `\labelcref`, and #ui[.\*] reads the search as a regular expression. Specifically, the search reads every text file of the project as it is saved, after saving the open file, and leaves out the `.spectrum` folder, hidden files and binary files. Only the first 100 matches are listed, so a longer search narrows a long list. The agents search the project's text in the same way (@ch-assistant).

#shot("figures/02-writing/text-search.png", [Search on the Files tab. No file is named "quick", while #ui[In text] lists the three lines that hold it, in two chapters.], width: 42%) <fig-writing-search>

Below the files, #ui[Outline] lists the headings of the document, with the figures and tables by their captions, and a click on one moves the cursor to it. For LaTeX the outline follows `\input` and `\include` across the whole document and, with TexLab running (@sec-writing-lsp), shows the section numbers of the last compile. For Typst it follows `#include` to any depth and shows the numbers of the last compile as the PDF prints them, such as "A.1" in an appendix or "Table 4.1", and opening a chapter keeps the whole document's outline. For Markdown it lists the headings. The heading the cursor is in is shown in bold.

=== The toolbar

Above the source is a row of tabs, one for each open file, and below it the toolbar (@fig-writing-toolbar). The buttons on its left insert things at the cursor, and the buttons on its right open tools in the PDF's place. Each one is listed in @tab-writing-toolbar.

#shot("figures/02-writing/toolbar.png", [The file tabs and the toolbar above the source, left, and the PDF's header with Compile, Save checkpoint and the view switcher, right.]) <fig-writing-toolbar>

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header([Button], [What it does]),
    [#ui[Insert] (+)], [inserts a snippet: a section, a list, an equation, an algorithm, a code listing, a citation, a reference or a label in LaTeX, and the Typst and Markdown equivalents, then your own snippets for that kind of file (@sec-writing-snippets). It also holds the four buttons beside it when the editor is too narrow for them],
    [#ui[Insert figure]], [opens the Floats panel at the figure card (@sec-writing-floats)],
    [#ui[Insert table]], [opens the Floats panel at the table card],
    [#ui[Draw a diagram]], [opens the diagram composer (@ch-composer)],
    [#ui[Jyutping] (粵)], [opens the Jyutping window, in a LaTeX document (@sec-writing-jyutping); a Markdown document has no such button],
    [#ui[Assistant]], [shows or hides the assistant chat (@ch-assistant)],
    [#ui[Check grammar]], [checks the grammar of the open file (@sec-writing-checks)],
    [#ui[Document insights]], [counts and lists the document's parts (@sec-writing-insights)],
    [#ui[Tools]], [opens the Checkpoints, Logs, Review and GitHub tabs, on Logs when the last compile had errors. A badge counts the errors and warnings of the last compile],
    [#ui[Agent]], [opens the agent workspace (@ch-assistant)],
  ),
  caption: [The buttons of the editor's toolbar.],
) <tab-writing-toolbar>

The tools that take the PDF's place, which are Floats, Check grammar, Document insights, Tools and the agent workspace, each have a header with #ui[Close] and the view switcher, and Compile moves into the editor's tab row while one of them is open.

=== Typing in the source

The source editor highlights LaTeX, Typst and Markdown, folds environments and blocks, and wraps long lines under their own indent, with formulas breaking between terms. #key("Tab") indents at the cursor by four spaces, Return after `\begin{…}` adds the matching `\end{…}` at the same indent, and typing `$` with text selected puts the text in maths, in the same way as `(` brackets it.

Return at the end of an `\item` in an `itemize`, `enumerate` or `description` list starts the next item at the same indent, and in a `description` list the cursor goes between the brackets of `\item[]`. Return on an item with nothing in it ends the list by taking its `\item` away. Typst's `-`, `+`, numbered and `/` term items carry on in the same way, and Markdown's lists always have. Typing `$` in text gives `$$` with the cursor between, and `$` again in the empty pair makes display maths. `\(` and `\[` bring `\)` and `\]`, and `\left(`, `\left[`, `\left|` and `\left\{` bring their `\right`, as do `\bigl` and its larger sizes. Typing a closer that is already there steps over it, and Backspace in an empty pair removes both halves. Typst has the `$` pairs too. Markdown has none, since a `$` there is often money. The two switches, #ui[Continue lists] and #ui[Close maths delimiters], are in #menu[Settings][Editor] and are on by default.

While the cursor is in maths in a LaTeX or Markdown file, the maths is drawn under it by KaTeX, so a missing brace or a wrong subscript shows before any compile (@fig-writing-maths-preview). This covers `$…$`, `\(…\)`, `\[…\]`, `$$…$$` and environments such as `equation` and `align`, which are drawn without their numbers. The document's own commands from `\newcommand`, `\renewcommand`, `\def`, `\DeclareMathOperator` and mathtools' `\DeclarePairedDelimiter` are used, from the open file and the files of its document. A command whose first argument is optional, a package's command that KaTeX does not know, such as siunitx's `\qty`, and anything that would link or load a file give a short note instead of a picture, so a picture is never a guess. #key("Esc") hides it until the cursor leaves that maths, and #ui[Show the maths at the cursor] in #menu[Settings][Editor] turns it off. Typst's maths is not drawn, since KaTeX reads only LaTeX.

#shot("figures/02-writing/maths-preview.png", [The `align` environment the cursor is in, drawn under it with the document's own commands.], width: 62%) <fig-writing-maths-preview>

#ui[Preview this figure], with #key("⌥", "⌘", "P") or in the source's right-click menu and the command palette, compiles the `tikzpicture`, `circuitikz`, table, figure or displayed equation the cursor is in on its own, with the document's preamble, and shows it in a panel under the source (@fig-writing-figure-preview). A selection is previewed as it is instead. The panel compiles again a second after the piece changes, so each nudge to a drawing shows without a full compile. A figure's caption shows with it. Errors are given in the panel's header, and a picture that compiled with errors still shows. The preview is compiled from a copy that holds the preamble and the piece, in a build of its own, so nothing is written into the project and the document's PDF stays as it was. It is always confined on a Mac, even in a trusted project, so a piece that needs shell escape, such as `minted`, does not preview. #ui[Compile the preview again] and #ui[Close the preview] are the panel's two buttons.

#shot("figures/02-writing/figure-preview.png", [Preview this figure under the source, with the `tikzpicture` compiled on its own.], width: 62%) <fig-writing-figure-preview>

=== Snippets <sec-writing-snippets>

A snippet is text you write once and put in with a few keys, such as a theorem with its proof, a `cases` block or two figures side by side. #menu[Settings][Snippets] lists them (@fig-writing-snippets). Each has a name, a trigger, the kinds of file it works in, which are LaTeX, Typst and Markdown, and its text. Typing the trigger at the start of a word and pressing #key("Tab") puts the snippet in its place, and every snippet for the open kind of file is also at the bottom of #ui[Insert] (+) and in the command palette. In the text, `${1:text}` is the first place #key("Tab") goes to, with `text` selected to type over, `${2}` is the next, empty, and `${0}` is where the cursor ends. The same number twice is filled in twice. A `$` followed by a number without braces is plain text, so maths such as `$1$` is safe. Spectrum starts you with five snippets, which can be changed or deleted, and #ui[Reset to defaults] puts them back without touching your own. Snippets follow you to your other computers with your settings.

#shot("figures/02-writing/settings-snippets.png", [#menu[Settings][Snippets], with a new snippet being written below the starters.], width: 70%) <fig-writing-snippets>

Completion lists what can be typed where the cursor is (@fig-writing-complete). Typing `\`, or `/` at the start of a word in text, lists the commands that work there. In maths, inside `$…$`, `\[…\]` or an `equation` or `align` environment, it lists maths commands such as `\vec`, `\lambda` and `\frac` with their symbols, and in text it lists text commands, together with the project's own commands from `\newcommand` and `\DeclareMathOperator`. Each command shows the package it comes from. Commands with arguments go in with fields that #key("Tab") moves through, so `\frac` then #key("Tab") goes from the numerator to the denominator. Inside braces it lists the project's labels after `\ref{` and `\cref{`, its citation keys after `\cite{`, packages after `\usepackage{`, the project's images and files after `\includegraphics{` and `\input{`, and siunitx's units in a unit argument, so `/vo` offers `\volt`.

#shots(("figures/02-writing/complete-maths.png", "figures/02-writing/complete-ref.png"), [Completion in maths, left, lists commands with their symbols and packages. After `\cref{`, right, it lists the project's labels and the file each is in.]) <fig-writing-complete>

Environments are listed once `\beg` is typed (@fig-writing-begin). #key("Tab") fills in as much as the entries share, so `\beg` becomes `\begin{` with the environments still listed, and #key("Tab") or Return then picks one. After `\begin{` the list holds the common environments, such as `equation*`, `align*` and `gather` (only those that work in maths when the cursor is in maths), the environments of the packages and classes the project loads and the ones it defines itself, each marked with where it comes from.

#shot("figures/02-writing/complete-begin.png", [Environments listed after `\beg`, each with the package it comes from. The project's own environments are marked this project.], width: 60%) <fig-writing-begin>

Vim's or Emacs's keys can take the place of the standard ones, in #ui[Editing keys] under #menu[Settings][Editor]. Both are off by default. With Vim, a bar under the source shows the mode and the command being typed, and `:w` saves. Spectrum's own shortcuts still work, apart from any that Vim or Emacs uses for itself.

A grey suggestion after the cursor is AI autocomplete, which @ch-assistant covers. It is asked for with #key("⌥", "/"), and #key("Tab") accepts it, #key("→") accepts its next word and #key("Esc") dismisses it.

=== Finding and moving around

#key("⌘", "F") opens find and replace in the open file, and #key("⌘", "G") and #key("⇧", "⌘", "G") go to the next and previous match. #key("⌃", "G") goes to a line by its number. #key("⌘", "D") adds the next match of the selection to the selection, #key("⇧", "⌘", "L") selects every match and #key("⌥", "⌘", "↑") and #key("⌥", "⌘", "↓") add a cursor above or below. A click with #key("⌥") held also adds a cursor. The other editing shortcuts are listed in @sec-writing-shortcuts.

The command palette finds a command by its name, for one whose menu or shortcut is not at hand. #key("⇧", "⌘", "P") opens it with `>` typed, and the list narrows as the name is typed, where the first letters of its words are enough, so `rfs` finds #ui[Recompile from scratch] (@fig-writing-palette). It lists every command that has a shortcut, the items of the Compile button's menu, the #ui[Insert] menu, the file tree's #ui[+] menu, the project menu and the PDF's #dots menu, the tabs of Tools, the panels and the sections of Settings. Each line shows where the command lives and its shortcut, and a tick marks a choice in use, such as the project's compiler. #key("Enter") runs the highlighted command and #key("Esc") closes the palette. #key("⌘", "P") opens the same box without the `>`, to go to a file of the project or a heading of the Outline by its name. Typing `>` there turns it into the command palette.

#shot("figures/02-writing/command-palette.png", [The command palette with `>compiler` typed. The project's compiler choices from the Compile button's menu come first, and the tick marks the one in use.], width: 62%) <fig-writing-palette>

== Languages and engines <sec-writing-engines>

Spectrum writes three languages: LaTeX, Typst and Markdown. Each document is compiled by an engine, which is a program that turns the source into a PDF. This section describes the engines each language can use and how to choose between them. The default for every project is set in #menu[Settings][Engines], which has a tab for each language (@fig-writing-engines), and a project can choose its own in the Compile button's menu (@sec-writing-compile).

#shots(("figures/02-writing/engines-latex.png", "figures/02-writing/engines-typst.png"), [#menu[Settings][Engines] on its LaTeX tab, left, with the default compile settings, and on its Typst tab, right, with the built-in Typst, older versions to install and Tinymist.]) <fig-writing-engines>

=== LaTeX

A LaTeX document compiles with pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or the built-in Tectonic. Auto, the default, reads a `% !TEX program` comment in the main file, uses XeLaTeX when the document needs Unicode fonts and pdfLaTeX otherwise. When no TeX is installed, Auto uses Tectonic, which downloads its TeX bundle and each package the first time a document needs it, and a compile that cannot reach the server says so. Latexmk always runs with `-norc`, so a project's own `latexmkrc` cannot run code.

A document can set its own steps in a `% !TEX recipe` comment, which then takes the place of Spectrum's passes for pdfLaTeX, XeLaTeX and LuaLaTeX. The steps are separated by semicolons, for example `% !TEX recipe = pdflatex; pythontex %DOC%; pdflatex`. An engine step runs as Spectrum runs that engine, with any options in the step added before the file, and every other step runs in the build folder, where `%DOC%` is the document's name without `.tex`, `%OUTDIR%` is the build folder and `%DIR%` is the document's own folder. A `% !TEX options` comment, such as `% !TEX options = -8bit`, adds options to every pass of the engine. Each step of a recipe appears in Tools › Logs.

Because these comments arrive with a project from someone else, a project that is not trusted (@sec-writing-trust) runs only TeX's own programs in a recipe, which are the three engines, BibTeX, Biber, makeindex, makeglossaries, bib2gls and PythonTeX, and only options that leave shell escape alone, such as `-8bit` and `-recorder`. Every step runs in the same sandbox as the rest of the compile. A trusted project's recipe can run any program, such as `python3 %DIR%/figures.py`. When a recipe asks for more than the project may have, the compile uses Spectrum's own passes and the log says why.

The LaTeX tab of #menu[Settings][Engines] holds the defaults for every project: the compiler, auto compile, compile error handling, the bibliography tool, fast draft mode, the precompiled preamble and the syntax check, which @sec-writing-compile describes. Below them it has the following,

- #ui[Show live output while compiling], one switch for each engine, which shows the engine's output in the PDF's place while it runs, with a line saying what it is doing. Tectonic's is on by default, since it shows each package it downloads, which can take minutes on a first compile,
- #ui[TeX folder], for a second TeX installation, whose programs are tried before the ones on the `PATH`, for example `/usr/local/texlive/2026/bin/universal-darwin`,
- #ui[xjyutping folder], which uses your own copy of the xjyutping package in place of Spectrum's (@sec-writing-jyutping) and
- #ui[Biber for Tectonic], which downloads the Biber version that Tectonic's biblatex needs, since another Biber on the computer will not do. TeX Live and MiKTeX use their own.

Above the three tabs, #ui[Open Logs when a compile fails] opens Tools › Logs in the PDF's place after a failed compile of a LaTeX, Typst or Markdown document. Auto compile leaves it closed. Below it, #ui[Underline overfull and underfull boxes] underlines a LaTeX compile's Overfull and Underfull `\hbox` and `\vbox` warnings in the source. It is off at first, since a long document can have many: they are always listed in Logs.

=== Typst

Typst 0.15.1 is built into Spectrum, so a Typst document needs nothing installed. The Typst tab installs older versions of Typst (0.14, 0.13 and 0.12) and removes them again, and #ui[Default version] chooses the one a project uses when it does not pin its own. A project pins a version in the Compile button's menu, which saves it with the project, so the document compiles the same way on another computer. The tab also downloads Tinymist, Typst's language server (@sec-writing-lsp).

A Typst document can be downloaded in more forms than a PDF. The download button in the PDF's header offers PDF, PDF/A-2b for archiving, PDF/UA-1 for accessibility, PNG or SVG with one image per page and HTML, which is experimental (@fig-writing-typst-menus). PDF/UA-1 needs alt text, a short description read aloud by screen readers, on every image and every equation, inline ones too. When a download fails, each place Typst names is listed in Tools › Logs and marked in the editor, as a compile's errors are, with what to write: `image("…", alt: "…")` for an image, `figure(…, alt: "…")` for a drawing and `#math.equation(alt: "…", $ … $)` for an equation. The figure card asks for the alt text of an image (@sec-writing-figures). The Typst templates have alt text on every equation already, listed with the words a screen reader says in each template's `alt-text.typ`, so each downloads as PDF/UA-1 as it stands. An equation changed or added there needs its own line in that list.

#shots(("figures/02-writing/compile-menu-typst.png", "figures/02-writing/typst-download.png"), [For a Typst document the Compile button's menu pins a Typst version, left, and the download button offers the forms Typst can write, right.]) <fig-writing-typst-menus>

=== Markdown

A Markdown document compiles through pandoc, which turns it into LaTeX or Typst, and then through that language's engine. Spectrum uses a pandoc found on the computer when it is new enough, and the Markdown tab of #menu[Settings][Engines] downloads pandoc 3.12.1 (about 42 MB) when it is not. The Typst route needs pandoc 3.8.3 or later. #ui[PDF engine] on the same tab sets the default route, and each project can choose its own in the Compile button's menu, where a Markdown document has #ui[PDF engine (this project)] above the compiler (@fig-writing-compile). Tools › Logs then has #ui[Show generated LaTeX] or #ui[Show generated Typst], which shows what pandoc wrote. The errors and warnings of both steps are listed there once each: pandoc's own, such as a citation with no entry in the `.bib`, and those of the engine, such as an undefined reference, a line too wide for the page or a character the font does not have. Each is traced back to the line of the `.md` whose words made it, so a click jumps there, while one whose words cannot be found has no line.

Chinese, Japanese and Korean text needs a font that has its characters. When the front matter names neither `CJKmainfont` nor `mainfont`, Spectrum gives pandoc one of the Chinese fonts it includes: Noto Serif TC for Traditional Chinese, and Noto Serif SC for Simplified Chinese, mixed text and Japanese, since it also has the Traditional characters and the kana. Through LaTeX the document is then compiled with XeLaTeX, or LuaLaTeX when XeLaTeX is not installed, in place of pdfLaTeX, and the log says so. Japanese prints with the Chinese shapes of some kanji, so a Japanese document reads better with a Japanese font named in the front matter, such as `CJKmainfont: Hiragino Mincho ProN` on a Mac or `Yu Mincho` on Windows. Neither font has Korean letters. Through LaTeX, Logs lists the letters a font is missing with the name of the font and suggests a Korean font, such as `CJKmainfont: Apple SD Gothic Neo` on a Mac or `Malgun Gothic` on Windows, while the Typst route finds a Korean font on the computer by itself. A font the front matter names always wins.

A figure, table, equation or section with a label can be referred to by number, as in LaTeX. A picture's label goes after it, `![Caption](plot.png){#fig:plot}`, a table's at the end of its `Table:` caption line, `{#tbl:use}`, an equation's after its closing `$$`, `$$ Q = vA $$ {#eq:flow}`, and a heading's at its end, `# Method {#sec:method}`. `@fig:plot` then prints "Figure 1", `[@fig:a; @fig:b]` prints "Figures 1 and 2", `[see @tbl:use, left]` keeps the words around it and `[-@eq:flow]` prints the number alone. Quarto's forms with a hyphen, such as `@fig-plot`, work too. LaTeX and Typst number the labels themselves, so the numbers follow the document's own numbering, and Word gets the numbers as text. A section is referred to by number when the front matter has `numbersections: true`, and by its title otherwise. Typing `@` lists the labels of the open file, and #ui[Insert] (+) has #ui[Reference]. A reference to a label that does not exist prints as *??*, and Logs lists it at its line. The labels and references are read by a small filter that Spectrum gives pandoc, so nothing needs to be installed for them.

A fenced code block marked `mermaid` is drawn as a diagram. Before each compile, the editor draws every Mermaid block that has changed with the composer's Mermaid (@ch-flow), with the same settings, so nothing is fetched from the internet, and keeps the picture in the project's hidden `.spectrum` folder. A block written as ```` ```{.mermaid caption="The steps" #fig:steps} ```` becomes a numbered figure with that caption and label. A block Mermaid cannot draw stays as code, and Logs gives its error at its line. A compile started outside the editor, such as the agent's, uses the pictures drawn last.

A long document can be split across files. The main file names the others in its front matter, in order, as `include: [chapters/introduction.md, chapters/method.md]`, and they are joined after it when it compiles, exports to Word or becomes a LaTeX project. The main file then holds the front matter, and the last file holds the `# References` heading, since the bibliography comes at the end. Pictures are found from the main file's folder. Logs gives each error at its line in the file it is in, and Document insights reads every file of the document. A file named in `include:` that is not in the project is a warning.

With `slides: true` in the front matter, the document becomes Beamer slides: a `#` heading starts a section and a `##` heading a slide, and `aspectratio: 169` makes them widescreen. Slides always go through LaTeX, whatever the PDF engine.

The eye button in the PDF's header, which a Markdown file has, shows a live preview of the open file in the PDF's place (@fig-writing-preview). It is drawn from the text as it is typed, so it shows a change at once, without a compile. Maths is drawn by KaTeX, Mermaid blocks by the composer's Mermaid, references are numbered as the compile numbers them, citations are shown by their keys, pictures in the project are shown and the front matter's title, authors and date are at the top. The preview follows the editor as it scrolls, and a double click on a paragraph moves the cursor to its line. The preview is for writing: the PDF is the document, and the button shows it again. A picture on the web is shown by its description and never fetched.

#shot("figures/02-writing/markdown-preview.png", [A Markdown document with its live preview: numbered references, a Mermaid figure, a table with its caption and a numbered equation.], width: 85%) <fig-writing-preview>

The project switcher of a Markdown project has two more choices. #ui[Export to Word] writes a `.docx` of the document into the project, and #ui[Convert to LaTeX project…] makes a new LaTeX project from it, leaving the Markdown project as it is.

=== Converting between LaTeX and Typst <sec-writing-convert>

#ui[Convert to Typst project…], in the project switcher or in a project's menu on the projects page, makes a new Typst project from a LaTeX one, and #ui[Convert to LaTeX project…] does the reverse (@fig-writing-convert). The original project stays as it is. The conversion runs through pandoc, so it needs pandoc 3.8.3 or later, and the window offers #ui[Download pandoc] when the one on the computer is older.

#shot("figures/02-writing/convert.png", [Convert to a Typst project asks first, and says what the conversion does with pictures and where it lists what to check.], width: 62%) <fig-writing-convert>

After #ui[Convert], the window lists each step as it runs and then checks the result against the original: whether it compiles, how many labels, references, citations, numbered equations and floats came through and what share of the words. Pictures drawn in the source, such as TikZ, are compiled to PDF with their source kept beside them, and `conversion/notes.md` in the new project lists anything to check. With a model set up, #ui[Tidy flagged parts with the AI model], which is experimental, has the quick model rewrite each part the rules could only approximate, such as a title page or a table. Spectrum checks that each answer keeps the words, labels, references and maths and still compiles before using it, and #ui[Review the AI's edits…] shows them afterwards. #ui[Open new project] opens the result.

== Compiling <sec-writing-compile>

#ui[Compile], at the top of the PDF, builds the main file and shows the result beside the source. #key("⌘", "Enter") does the same from the keyboard, and the line beside the button says when it last compiled, or that it failed with a link to the log. While a compile runs, the button becomes #ui[Stop], which ends it at once and keeps the last PDF. The clock button beside it saves a checkpoint (@ch-references).

The editor saves each file about 1.5 seconds after the last keystroke, and Compile saves what is still waiting first, so there is nothing to save by hand. #key("⌘", "S") saves at once. A file can also be edited while a compile runs: the compile reads the files as they were when it started, and the next compile picks up the change.

=== The Compile button's menu

The arrow beside #ui[Compile] opens its menu (@fig-writing-compile), which changes with the document it compiles. Each setting is the project's own, saved in its `.spectrum/settings.json`, so it follows the project to your other computer. Once a project has changed one, the menu also offers #ui[Use the default], which goes back to the setting in #menu[Settings][Engines], and #ui[Use for all projects], which makes the project's choice the default for every project. The settings are,

- #ui[Compiler (this project)], which is Auto, pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or Tectonic (built in), for a LaTeX document or Markdown through LaTeX,
- #ui[Typst version (this project)], for a Typst document, in place of the compiler,
- #ui[PDF engine (this project)], for a Markdown document: LaTeX or Typst,
- #ui[Auto compile], which is Off, the default, or On. On compiles the document once you stop typing for the pause set in #menu[Settings][Engines], from 1 to 10 seconds. A newer automatic compile takes the place of one that is out of date. A Typst document also has #ui[As you type], which compiles 0.3 seconds after typing stops, since its kept Typst compiles a change in a fraction of a second, and saves no checkpoint at each pause,
- #ui[Bibliography tool], which is Auto, BibTeX or Biber. Auto follows a `% !BIB program = biber` comment in the main file and otherwise runs the tool the document's bibliography package needs,
- #ui[Fast draft mode], which compiles in one pass with each image drawn as a box of its size, for quick previews. Numbers and references can lag behind until a full compile and
- #ui[Only the open chapter], for a LaTeX document written in chapters, which typesets the chapter open in the editor alone (@sec-writing-chapter).

Below them are #ui[Trust this project], which is described under Confined compiles below, #ui[Stop compilation] and #ui[Recompile from scratch], which first clears what earlier compiles of the document kept. Three more settings apply to every project and are only in #menu[Settings][Engines][LaTeX]: #ui[Compile error handling], which is Try to compile despite errors, the default, or Stop on first error, #ui[Precompile the preamble], which is on by default (@sec-writing-kept) and #ui[Syntax check before compiling] (@sec-writing-lsp).

#shots(("figures/02-writing/compile-menu.png", "figures/02-writing/compile-menu-markdown.png"), [The Compile button's menu for a LaTeX document, left, and for a Markdown document, right, which chooses its PDF engine first.]) <fig-writing-compile>

=== What a compile keeps <sec-writing-kept>

The `.aux`, `.bbl`, `.toc` and similar files of each document are kept between compiles, for each compiler, in the app's own data folder, and the next compile reads them back. A document whose labels, headings and citations have not changed is therefore done in one pass. BibTeX only runs when something is cited, another pass only runs when the log asks for one, and makeindex and makeglossaries run when the document has an index or glossaries. Files are kept only from a compile without errors, and when TeX cannot read one of them, Spectrum clears them and compiles once more from scratch, so a damaged `.aux` never locks a document out. The compile itself runs in a temporary folder and writes only the PDF into the project. A checkpoint is saved after each successful compile (@ch-references).

Biber takes a second or two, which is about half of a compile after a small edit, so Spectrum leaves it out while nothing it reads has changed. Biber reads the control file biblatex writes, which holds the citations and the style, and the `.bib` files. When those, and Biber itself, are byte for byte what they were for the kept `.bbl`, the log says that the bibliography is unchanged and Biber does not run. A changed `.bib` file, a new citation, another style, a Biber that failed last time or #ui[Recompile from scratch] runs it again. A `.bib` file that Spectrum cannot find in the project, such as one named by a pattern, runs Biber every time.

Latexmk builds in a folder of the document's own, also in the app's data folder, which stays between compiles. It then runs only what a change calls for, as it does on a command line: nothing at all when nothing changed, and one pass for an edit to the text. The folder is built on only as a compile without errors left it. After an error or #ui[Stop compilation] it goes back to how the last good compile left it, and it starts from nothing when the project's trust changes, when another TeX is used and on #ui[Recompile from scratch]. A draft builds elsewhere and leaves the folder alone.

With #ui[Precompile the preamble] on, pdfLaTeX does not load the preamble's packages again in every pass. Loading TikZ, pgfplots, siunitx or biblatex is most of a pass for a short set of notes, and a pass with the preamble already loaded takes about half the time. After a compile, and behind it, Spectrum makes a format, which is TeX's own saved copy of everything the preamble set up, and tries it once: it runs one pass without the format and one with it on a copy of the project and uses the format only when both give the same pages and the same kept files. From the next compile on, each pass starts from the format, and the log says so. The format is made again when the preamble changes, when a package, class or other file it reads changes, when TeX is updated and when the project's trust changes. It is never used for a draft, for #ui[Compile with page colour] or for a document with a `% !TEX recipe` or `% !TEX options` comment, and never with XeLaTeX, LuaLaTeX, Latexmk or Tectonic. Some preambles cannot be kept in a format, such as one that sets a text colour for the whole document or puts an image in a box. The trial finds these out, and such a document compiles as it always did.

=== Only the open chapter <sec-writing-chapter>

A thesis whose main file brings in its chapters with `\include` can be compiled one chapter at a time. With #ui[Only the open chapter] ticked in the Compile button's menu, a compile typesets only the chapter open in the editor, in one pass, and takes the page numbers, references and contents of the other chapters from the files the last full compile kept. The PDF pane then shows that chapter with the pages around it that are not in any chapter, such as the title page and the contents, and a label at the top names the chapter (@fig-writing-chapter). #ui[Whole document] on that label compiles everything again. Auto compile follows the choice, which lasts until the project is closed.

#shot("figures/02-writing/chapter-only.png", [With Only the open chapter on, the PDF pane names the chapter it shows. Whole document compiles every chapter again.], width: 62%) <fig-writing-chapter>

A chapter compiled alone is a preview. The PDF file beside the source stays the whole document from the last full compile, so what is downloaded, exported or sent is never a single chapter. A citation or an index entry added since the last full compile shows only after the next one, because BibTeX, Biber and makeindex do not run for a single chapter. The whole document is compiled instead when the open file is not one of the document's `\include` chapters, when nothing is kept from a full compile yet, on #ui[Recompile from scratch] and with Latexmk, Tectonic or a recipe.

=== Confined compiles and Trust this project <sec-writing-trust>

A LaTeX document is a program. Its packages can write files and, with shell escape, start other programs, so compiling a document from someone else is running their code. On a Mac, Spectrum therefore runs every program of a LaTeX compile in a sandbox, which covers the engine, BibTeX or Biber, makeindex, makeglossaries and whatever they start, and Markdown through LaTeX and the composer's own compiles as well. A confined compile can read the project, the TeX installation and your fonts and files, as TeX always has. It can write only its own build files, run only the programs of the TeX installation and use no network, apart from the built-in Tectonic downloading its packages. It also cannot read Spectrum's own data, the usual stores of keys such as `~/.ssh`, or key files such as `.env` and `.pem`. TeX's restricted shell escape stays on, so minted, EPS figures and the other tools on TeX's own short list work as before, and ordinary documents compile as they did.

Some documents need more, such as one that runs gnuplot, Inkscape or a script of its own through full shell escape, one that writes files into other folders, or a bibliography that Biber fetches from a web address. When a compile is stopped for one of these reasons, Tools › Logs says what was blocked and names the switch that allows it. #ui[Trust this project], in the Compile button's menu, is off for every project at first. Turning it on asks once (@fig-writing-trust), and the project's compiles then run without the sandbox and with full shell escape, which means that its documents can run any program as you. It should therefore only be turned on for a project whose files are all your own, or ones you have checked.

Unlike the other settings in the menu, the choice is kept on this computer, in the app's data folder and never in the project. A project that arrives from someone else is therefore never trusted already, and a copy of a trusted project, or its folder once it is moved or renamed, has to be trusted again.

#shot("figures/02-writing/trust-project.png", [Turning on Trust this project asks first and says what the project's documents can then do.], width: 62%) <fig-writing-trust>

#note[On Windows a compile is not confined yet. It runs with TeX's restricted shell escape, and #ui[Trust this project] only turns on full shell escape there. A document's `% !TEX recipe` runs on Windows only in a trusted project.]

=== Several documents in one project

A project can hold more than one document, such as a set of lecture notes and the tutorial solutions that refer to them. Compile and #key("⌘", "Enter") build the main file, which is chosen with #ui[Set as main file] in a file's menu. The Compile button's menu then lists the other documents at its top, and choosing one compiles it once without changing the main file, as does #key("⇧", "⌘", "Enter") for the document that is open. #ui[Recompile all] compiles every document, linked documents first.

With #ui[PDF follows the open file] on, in #menu[Settings][Editor], opening another document's source, or a chapter whose `% !TEX root = ../thesis.tex` comment names one, shows that document's PDF, and Compile and auto compile then build the document that is showing. Opening a file that is not a document leaves the PDF as it is. The page bar at the bottom of the PDF names the PDF that is showing and switches between the documents' PDFs.

Documents can refer to the labels of another with `xr-hyper`, for example `\externaldocument[notes:]{notes}` and `\eqref{notes:eq:ohm}`. Spectrum keeps the `.aux` files of every document for this, compiles a linked document first when it has not been compiled or has changed since, and completes `\ref{notes:` with the labels of the linked document.

=== The log

A failed compile marks the status line #ui[Failed — see Logs], and the #ui[Tools] button shows a badge with the number of errors and warnings. Tools › Logs lists them as cards under #ui[Warnings and errors], each with its message and its file and line, which a click jumps to (@fig-writing-logs). #ui[Full log] shows the engine's whole output. #ui[Fix with AI] on a card, or #ui[Fix all with AI] for the whole list, asks the assistant for a fix that opens as changes to review (@ch-assistant). The fix is compiled on a copy of the project first, and the card then says "Builds." or "Still fails at" with the first error left. Until a model is set up, these buttons open #menu[Settings][Models] instead. When a compile needs something Spectrum can download, such as pandoc, Biber for Tectonic or a pinned Typst version, the log says so with a button to download it. When pandoc is missing or too old, or the pinned Typst version is not installed, nothing was compiled, so the cards have no #ui[Fix with AI] and a Markdown document has no #ui[Show generated LaTeX] until pandoc is there.

#shot("figures/02-writing/logs.png", [Tools › Logs after a compile with one error and two warnings. Each card links to its line in the source and has Fix with AI.], width: 72%) <fig-writing-logs>

The errors and warnings of the last compile are also underlined in the source until the next compile, and the pointer resting on one shows its message (@fig-writing-marks). A Typst error is underlined where Typst points. TeX gives only the line, together with what it had read of the line when it stopped, so a LaTeX error is underlined under the command it stopped after, such as an undefined `\gainval`, or else along the whole line. A LaTeX warning, such as a reference with no label, is underlined along its line. Overfull and Underfull box warnings are left out unless #ui[Underline overfull and underfull boxes] is on in #menu[Settings][Engines], as a long document can have many. An edit in or beside an underline takes it away, since it may well be the fix. The underlines of the compile and those of TexLab (@sec-writing-lsp) are shown together.

#shot("figures/02-writing/compile-marks.png", [An undefined command underlined in red after a compile, under the command itself. The reference with no label on the same line has TexLab's red underline and the compile's yellow one along the line.], width: 80%) <fig-writing-marks>

== The PDF preview <sec-writing-preview>

The PDF preview fits the page to the width of its column by default. It zooms with a trackpad pinch, with #key("⌘") and the scroll wheel, with #key("⌘", "=") and #key("⌘", "−") or from the zoom menu in its header, which also holds Fit width (#key("⌘", "0")), Fit page (#key("⌘", "9")) and fixed sizes from 50 to 200 per cent. The page bar at the bottom moves between pages, and its page number can be typed over. While the PDF has the focus, #key("⌘", "F") finds text in it, and Page Up, Page Down, Home and End move through its pages. Each document's PDF opens at the page it was left at.

Links in the PDF work as in a PDF viewer. The contents, `\ref`, `\eqref` and `\cite` jump to the spot they point to, a web address opens in the browser and a reference into a linked document opens that document's PDF at the place it names.

#shots(("figures/02-writing/pdf-outline.png", "figures/02-writing/pdf-more-menu.png"), [Document outline beside the pages, left, lists the PDF's bookmarks with the current section marked. The #dots menu, right, holds the other views, the page colours and Compile with page colour, here on with cream pages.], columns: (1.6fr, 1fr)) <fig-writing-pdf>

The PDF's header holds the following,

- #ui[Document outline], which opens a sidebar beside the pages with two tabs: #ui[Contents], which lists the PDF's bookmarks with the current section marked (or the source's headings when the PDF has none), and #ui[Pages], which shows a thumbnail of each page with the current one outlined (@fig-writing-pdf),
- the zoom menu,
- #ui[Download PDF], which saves a copy of the PDF, or the download menu of a Typst document (@sec-writing-engines) and
- the #dots menu, which holds #ui[Two-page view], #ui[Annotate], #ui[Find in PDF], #ui[Presentation mode], the colour of the pages for the mode showing (@sec-start-appearance), #ui[Compile with page colour] and #ui[Show logs].

The page colours only tint the pages in the preview, while the PDF itself stays white. #ui[Compile with page colour] gives the PDF the same colour, so it looks the same in any PDF reader, in presentation mode, when printed and when downloaded or exported. Turned on, it keeps the light page colour chosen at that moment, and choosing another page colour in the #dots menu while it is on changes the project's colour too. Each change compiles the document again. The colour is saved in the project's `.spectrum/settings.json` with its other compile settings, so the project compiles the same on another computer, whatever page colour that computer shows. White gives no colour.

Spectrum adds the colour while it compiles and never writes it into the source. A LaTeX document is compiled from a copy of its main file with a few lines added on the `\documentclass` line, which load `xcolor` only when the document does not already and set `\pagecolor`, or the slide background in beamer. A Typst document is compiled with `#set page(fill: ...)` set before it, from a two-line file Spectrum keeps in the project's `.spectrum/compile` folder, so the kept Typst compiles it as quickly as the document itself. A Markdown document gets the colour through its PDF engine. The lines of the source stay where they were, so errors, SyncTeX and the jumps between the source and the PDF still point at the right lines. A page colour the document sets itself, with `\pagecolor`, a beamer theme or `set page(fill: ...)`, wins over the project's.

Presentation mode shows the PDF one page at a time in full screen, for slides. A right-click on the PDF offers #ui[Add a note here], which pins a sticky note to that spot, #ui[Add to-do here], which adds a to-do linked to that page (@sec-writing-todos) and #ui[Send page to agent], which puts the page in the agent's message box (@sec-assistant-ask). The notes are listed under the PDF with their pages, each a click away, with a paper plane that sends a note to the agent, #ui[Send to agent] for all of them and #ui[Clear all] (@fig-writing-note, @sec-assistant-handoff). They are saved with the project, one small file each in `.spectrum/notes`.

#shot("figures/02-writing/pdf-note.png", [Two notes added with a right-click on the PDF. The notes are listed under the pages with the page each one is on, and the paper plane sends one to the agent.], width: 72%) <fig-writing-note>

=== Jumping between the source and the PDF

A double click in the PDF jumps to the line of the source that made it, and a double click on a line of the source scrolls the PDF to it (@fig-writing-synctex). The spot is marked with a highlight that fades after a few seconds. LaTeX uses the SyncTeX data that every compile writes. Typst and Markdown find the line by its words in the PDF, and a Typst project with Tinymist jumps exactly (@sec-writing-lsp). #menu[Settings][Editor] turns the double-click jumps off and on and sets the highlight's colour and how long it lasts, from 1 to 10 seconds.

#shot("figures/02-writing/synctex-to-pdf.png", [A double click on a line of the source has scrolled the PDF to the paragraph it made, which is highlighted until the highlight fades.], width: 80%) <fig-writing-synctex>

== TexLab and Tinymist <sec-writing-lsp>

A language server is a program that reads a project's source as it is typed and tells the editor what it finds. Spectrum uses two: TexLab for LaTeX and Tinymist for Typst. Both are optional, and without them the editor works as described in the rest of this chapter.

=== TexLab

Spectrum includes TexLab 5.26.0 and starts it for each open project. TexLab reads the project's files from the disk and the open file as it is typed, and gives the editor the following,

- squiggles under references and citations that have no label or entry, labels defined twice or never used, missing braces, environments that end with the wrong `\end` and mistakes in `.bib` files, each with its message when the pointer rests on it (@fig-writing-texlab),
- the entry a citation stands for, or what a `\ref` points to, when the pointer rests on it,
- Go to definition (#key("F12"), or a click with #key("⌘") held) on a `\ref`, `\cite` or `\input`, which opens the file it leads to,
- Find references (#key("⇧", "F12")), which lists every use of the label, citation key or command at the cursor in a panel below the editor, with each line a click away and
- Rename (#key("F2")), which renames a label, citation key or command everywhere in the project, the `.bib` files included. It shows the files with the number of changes in each, saves a Before rename checkpoint and then saves every file (@fig-writing-rename).

#shots(("figures/02-writing/texlab-hover.png", "figures/02-writing/find-references.png"), [A reference with no label, left, is underlined, and the pointer resting on it shows TexLab's message. Find references, right, lists every use of `eq:gain` below the editor.], columns: (1fr, 2fr)) <fig-writing-texlab>

#shots(("figures/02-writing/rename.png", "figures/02-writing/rename-confirm.png"), [Rename asks for the new name, left, and then lists the files it will change with the number of changes in each, right.]) <fig-writing-rename>

With TexLab the sidebar's Outline covers the whole document across its `\input` files, with the section numbers of the last compile and the figures and tables by their captions. A reference or citation in a caption shows as "…". Document insights marks the labels TexLab finds unused or defined twice and the citations missing from the `.bib`, and Review adds TexLab's findings to its checks (@ch-references).

When #ui[Syntax check before compiling] is on, in #menu[Settings][Engines][LaTeX], a compile you start first looks at TexLab's findings in the document's files. When there are missing braces or mismatched environments, it lists them and asks whether to compile anyway, and #ui[Cancel] goes to the first one (@fig-writing-syntax). References and citations with no label or entry never stop a compile, and auto compile skips the check.

#shot("figures/02-writing/syntax-check.png", [The syntax check before a compile has found a brace that is never closed.], width: 55%) <fig-writing-syntax>

TexLab's own completion, building and formatting are left off, so Spectrum's completion stays as it is.

=== Tinymist

Tinymist 0.15.10 is downloaded from #menu[Settings][Engines][Typst] (about 31 MB, checked against its SHA-256), and then starts for each open project. In `.typ` files it gives the editor completion for the document's own functions, packages, labels and citations, hovers with signatures and documentation, Go to definition, Find references and Rename as TexLab does, errors as they are typed with its linter's warnings beside them, such as a variable that is never used, #ui[Format document] with typstyle (#key("⌥", "⇧", "F"), or from the editor's right-click menu) and a word count of the PDF in Document insights. Without Tinymist, completion after `#` still lists the functions and values the project's other `.typ` files define with `#let`, and a click with #key("⌘") held on a quoted path, such as `#include "chapters/one.typ"` or `image("/figures/a.png")`, opens that file.

Tinymist has Typst 0.15.1 inside it. In a project on that version, its errors take the place of the last compile's marks, and a double click jumps between the PDF and the source exactly. #ui[Live], in the PDF's header, then shows Tinymist's own preview in the PDF's place, which lays out the text as it is typed, before it is saved. #ui[Live] again goes back to the PDF, for find, notes, links and presentation mode. A project pinned to another version keeps the compile's marks and the word matching for its jumps, since Tinymist would judge its code by the rules of 0.15. #ui[Remove Tinymist] in the same place takes it away again.

== Floats <sec-writing-floats>

A float is a figure or table that LaTeX places where it fits. The Floats panel inserts figures and tables at the cursor, writing the environment, caption and label for you. #ui[Insert figure] and #ui[Insert table] in the toolbar open it at the figure or the table card, and so do #ui[Figure…] and #ui[Table…] in Insert (+). Each card ends with #ui[What these options mean], which explains its options in the panel.

=== Figures <sec-writing-figures>

The figure card takes an image that is dropped on the card or on the editor, pasted or chosen with a click (@fig-writing-figure). It saves the image in the project's `figures` folder, adding `-2` to the name when that name is taken, and inserts it as a figure with a caption, a label and a size. PNG, JPEG, PDF and EPS go in as they are, HEIC photos are converted to JPEG, and GIF, WebP, BMP, TIFF and SVG are converted to PNG. Its options are,

- #ui[Layout], which is Single, Side by side or Grid, for several images under one caption as sub-figures,
- #ui[File name], #ui[Caption] and #ui[Label], which is made from the file name,
- #ui[Size by], which is a share of the line width (Full, ¾, Half, Third or Custom), a width, a height, a box to fit in or a scale. A tall image is kept within the page,
- #ui[Alt text], in a Typst document, which says what the image shows for someone who cannot see it, and which PDF/UA-1 needs. Side by side and grid figures have a field for each image,
- #ui[Crop edges], which trims the image's edges with `trim` and `clip` and
- #ui[Placement] and #ui[Span both columns], which @tab-writing-placement describes.

#shots(("figures/02-writing/floats-figure.png", "figures/02-writing/floats-table.png"), [The figure card with an image chosen, left, and the table card with a filled grid, right. Booktabs draws the heavier rules at the top and bottom of the table.]) <fig-writing-figure>

Below the card, #ui[Project figures] lists the images already in the project, ready to insert. #ui[Image → LaTeX] turns a picture of an equation, a table or other content into LaTeX with the vision model (@ch-assistant). In a Typst document it is #ui[Image → Typst] and writes Typst: maths between `$`, a `#table`, a `#figure` with alt text.

=== Tables

The table card builds a table from a grid (@fig-writing-figure). #key("Tab") moves to the next cell and Return moves down, and rows pasted from Numbers, Excel or a CSV file fill the grid. The buttons below it add and remove rows and columns, and each column's alignment is chosen above it. Its options are,

- #ui[Lines], which is Booktabs, Grid, Minimal or None. Clicking between two rows or two columns, or along an edge, adds or removes a line across the table, and the buttons under #ui[Lines at row and column] do the same from the keyboard for the cell last edited. Once a line is changed by hand, the card says which preset it was changed from,
- #ui[Merge right], #ui[Merge down] and #ui[Split], which merge cells with `\multicolumn` and `\multirow`, and #ui[Short rule below], which draws a `\cmidrule` under a heading over a group of columns,
- #ui[Environment], which is `tabular`, `tabularx` or `xltabular` for a table that runs over pages,
- #ui[Header row], #ui[Line breaks in cells] (with `makecell`), #ui[Notes under the table] (with `threeparttable`) and #ui[Escape special characters], which makes `&`, `%`, `#`, `_` and a price's `$` print as themselves while commands still work and
- #ui[Float], with #ui[Placement], #ui[Span both columns], #ui[Caption] and #ui[Label]. A table inserted with no caption gets `Caption.` to fill in and a label made from its header row.

#ui[Source] shows the LaTeX the card will insert, which can be edited before #ui[Insert table] or copied with #ui[Copy] (@fig-writing-table-source). In a Typst document the table is a `#table` with its lines as `table.hline` and `table.vline`, a `\\` in a cell is Typst's line break and the notes are set in smaller text under the table inside its figure, with a `\tnote{a}` in a cell raised as #super[a]. In a Markdown document it is a pipe table, which has no lines of its own and no line breaks or notes. The packages a float needs, such as `graphicx`, `float`, `booktabs` and `tabularx`, are added before `\begin{document}` when the project does not load them yet. #ui[Table → chart], below the card, plots a table selected in the editor with matplotlib (@fig-writing-table-chart), a LaTeX `tabular` or a Typst `#table`. #ui[Write the code] asks the main model (@ch-assistant) for the plotting code and shows it, and nothing runs until #ui[Run this code]. #ui[Edit] lets you change the code first. The code runs on its own, in the isolation the local agents use: it is given the table, it can write only to a folder of its own, it cannot read the project or your other files or reach the network, and it is stopped after two minutes. Spectrum then saves the chart in `assets/plots`, as a PNG or, when the file name ends in `.pdf`, `.svg` or `.jpg`, in that form, and inserts it as a figure after the table, in the document's own language. When the code fails, the card says on which line and why, and #ui[Write it again with this error] asks the model for code that works. Charts need Python 3 with matplotlib on the computer.

#shot("figures/02-writing/table-chart.png", [Table → chart with the model's code shown. It runs only when #ui[Run this code] is clicked.], width: 55%) <fig-writing-table-chart>

#shot("figures/02-writing/floats-table-source.png", [The caption, label and source of the table above. The label is made from the caption and can be typed over.], width: 62%) <fig-writing-table-source>

=== Placement

The placement of a figure or table is chosen with the letters in @tab-writing-placement, which can be combined. `H` is used on its own and is the default. With no letter, LaTeX uses `tbp`. The letters allow places rather than order them, so `[ht]` means here or else the top of a page. #ui[Span both columns] makes a `figure*` or `table*` for two-column papers, which only takes `t`, `p` and `!`.

A Typst document has Typst's own choices instead of the letters. #ui[In the text], the default, leaves the figure where it is written, #ui[Top] and #ui[Bottom] write `placement: top` or `placement: bottom`, which put it at the top or bottom of the page or column, and #ui[Top or bottom] writes `placement: auto`, which takes the nearer. #ui[Span both columns] adds `scope: "parent"`, which runs the figure across both columns at the top or bottom of the page. A Markdown document has no placement, since pandoc places its figures itself.

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header([Letter], [Meaning]),
    [`H`], [exactly here, no longer floating (needs the `float` package, which is added)],
    [`h`], [roughly here in the text, if there is room on the page],
    [`t`], [at the top of a page],
    [`b`], [at the bottom of a page],
    [`p`], [on a separate page that holds only floats],
    [`!`], [ignore LaTeX's limits on how many floats a page holds and how much of it they fill],
  ),
  caption: [The placement letters of a float.],
) <tab-writing-placement>

== Document insights <sec-writing-insights>

#ui[Document insights] in the toolbar takes the PDF's place with tabs for the Overview, Headings, Figures, Tables, Equations, Labels, Citations and To-dos, each with its count (@fig-writing-insights). The Overview has the counts, the number of pages and, for a LaTeX document, the word counts from `texcount`: the words in the text, in headings and outside the text, and the inline and displayed maths. Its #ui[Submission metadata] lists the document's title, authors, keywords, date and abstract, and #ui[Copy submission metadata] copies them for a submission form.

#shots(("figures/02-writing/insights-overview.png", "figures/02-writing/insights-labels.png"), [Document insights. The Overview, left, has the counts and the word counts from texcount, and the Labels tab, right, gives each label its number and page from the last compile.]) <fig-writing-insights>

The other tabs list each item with the number and page it had in the last compile, read from the `.aux` files that compile kept for LaTeX and from Typst's own evaluation for Typst, and a click on a row jumps to its line in the source. A Markdown document lists its headings, figures, tables, equations, citations and labels from the source, in its own file and the files its `include:` names, without numbers or pages, since the LaTeX pandoc writes is not the document. Its Overview counts the words in the `.md` itself, the prose alone, leaving out the front matter, code, maths and citations, and says so under the counts. The footer says that the numbers and pages come from the last compile, marks them as out of date when the source has changed since and has #ui[Refresh].

== Spelling and grammar <sec-writing-checks>

Spectrum checks spelling as you type and grammar when you ask, and both run on the computer, so nothing you write is sent anywhere. Their settings are in #menu[Settings][Spelling & grammar] (@fig-writing-spelling-settings).

=== Languages

Spectrum checks writing in the languages listed in #menu[Settings][Spelling & grammar], which is Australian English alone unless others are added with #ui[Add a language…]. Each paragraph is checked in one of the listed languages and never in another. Language markup decides first: babel and polyglossia in LaTeX, `text(lang:)` in Typst and `lang` in Markdown front matter and pandoc's spans and divs. Otherwise the script of the text decides, and for listed languages that share a script, their own dictionaries vote on the paragraph's words. Variants of one language, such as Australian and US English, are never guessed: the one higher in the list is used. A project can have its own list of languages, which travels with it.

=== Spelling

Spelling is checked in `.tex`, `.typ`, `.md` and `.txt` files, and misspelt words get a red underline. A right-click on one offers suggestions, #ui[Add to dictionary], #ui[Add to project dictionary] and #ui[Ignore] (@fig-writing-spelling). The project dictionary is kept in the project's `.spectrum` folder, so it travels with the project, while your dictionary covers every project and can be edited at the foot of #menu[Settings][Spelling & grammar].

#shot("figures/02-writing/spelling-menu.png", [A right-click on a misspelt word offers its corrections and the two dictionaries.], width: 62%) <fig-writing-spelling>

Spelling uses the Hunspell 1.7.6 spell checker. Australian English uses SCOWL's `en_AU-large`, which sets the standard (colour, organise, centre), AussieDic, which adds Australian places, names and slang such as Parramatta and arvo, and SCOWL's `en_US`, which is only used to recognise the American spellings in AussieDic, so color and organize are still flagged. American, British and Canadian English use their own SCOWL dictionaries. Dictionaries for other languages download only when asked for, from their row in Settings or when the editor first meets a listed language that needs one, and each is checked against its SHA-256 before it is used. Traditional Chinese has no dictionary, so in a mostly Traditional paragraph Spectrum underlines stray Simplified-only characters and suggests their Traditional forms.

=== Grammar

#ui[Check grammar] in the toolbar, or #key("⇧", "⌘", ";"), reads each paragraph of the open file in its language and lists the issues in the PDF's place (@fig-writing-grammar). Each issue is underlined in the editor and listed with its sentence, and it can be fixed with one click on the suggestion, ignored, or turned off for the project with #ui[Ignore rule]. English goes to Harper 3.0.0, in the listed dialect, which starts with the first check and runs on the computer. #ui[Include style suggestions] adds long sentences, wordiness and readability, and #ui[Serial comma] chooses whether the Oxford comma is flagged, which it is by default in line with the Australian Government Style Manual.

#shot("figures/02-writing/grammar.png", [Check grammar has found two issues in the open file, each with its sentence, a suggestion to apply and Ignore and Ignore rule.], width: 72%) <fig-writing-grammar>

Other languages go to LanguageTool 6.8 when it is turned on in #menu[Settings][Spelling & grammar]. Spectrum downloads it when you ask (its jars and a Java runtime, about 310 MB, each checked against its SHA-256) and runs it on the computer only while you check grammar. English can go to LanguageTool too, in place of Harper.

#shot("figures/02-writing/settings-spelling.png", [#menu[Settings][Spelling & grammar], with the listed languages, the spell checker and its dictionaries and the grammar checkers.], width: 72%) <fig-writing-spelling-settings>

Both checkers read only the prose. In LaTeX, commands, maths, comments, citation and reference keys, URLs, the preamble and code are skipped, while the text of headings, captions, footnotes and `\emph`, `\textbf` and similar commands is checked. Typst skips its comments, raw text, maths, labels and references and the arguments of calls apart from content in brackets. Markdown skips front matter, code, HTML, maths, URLs, link targets and citations, keeping the prose and the link text.

== The to-do list <sec-writing-todos>

The #ui[To-dos] tab in the sidebar holds a to-do list for the project, with a badge counting the open to-dos (@fig-writing-todos). It has two groups,

- #ui[Mine], your own to-dos, each with a tick box, its text, an optional note and an optional link. A link points at a line of the source, which is found again by its text when lines move, at a page of the PDF or at a reference, and a click on it goes there and
- #ui[In the source], which lists `\todo`, `\missingfigure` and `\fixme`, the notes of the fixme package (`\fxnote`, `\fxwarning`, `\fxerror` and `\fxfatal`) and `TODO`, `FIXME` and `XXX` in comments. Each one jumps to its line, and it is done once its mark is taken out of the source.

#shot("figures/02-writing/todos.png", [The To-dos tab with two of your own to-dos, one with a note and one linked to a line, and two from the source, a `\todo` and a `TODO` comment, each with its line.], width: 42%) <fig-writing-todos>

A to-do is added by typing it in the box at the top of the tab and pressing #key("Return") or the #ui[+] at the end of the box, or with #ui[Add to-do here] in the editor's right-click menu, which links the line, or in the PDF's, which links the page. #ui[Open], #ui[Done] and #ui[All] below the box choose what is listed, each with its count, and a click on #ui[Mine] or #ui[In the source] folds that group away. The box and these buttons stay at the top while the list scrolls. The sidebar's search finds to-dos by their text, their notes and their links.

Pointing at one of your own to-dos shows #ui[Send to agent] (the paper plane), #ui[Edit] and #ui[Delete] at the end of its row, with #ui[Add a note] before them when it has none. #ui[Send to agent] puts the to-do, its note and the lines it links to in the agent's message box (@sec-assistant-handoff). A note is a few lines of detail under the to-do, up to 4000 characters, and it shows in two lines until it is clicked. #ui[Edit], or a double click on the text, changes the to-do and its note in place. #key("Return") in the text, or #key("⌘", "Return") in the note, saves the change, #key("Esc") puts both back and clicking elsewhere also saves. #ui[Delete] removes the to-do and the message that follows has #ui[Undo]. When ticked to-dos are listed, #ui[Clear done] under them deletes them all, again with #ui[Undo].

Each to-do is a small file in the project's `.spectrum/todos` folder, so it travels with the project. Spectrum 2.5 opens a to-do with a note and keeps the note when it saves the to-do, without showing it. Document insights also has a To-dos tab, and the open to-dos go with an agent's first message (@ch-assistant).

== Jyutping <sec-writing-jyutping>

Jyutping is the romanisation of Cantonese that the Linguistic Society of Hong Kong devised. The #ui[Jyutping] button (粵) in the toolbar, also in Insert (+), adds Jyutping above the Chinese characters of a LaTeX document with the xjyutping package, which Spectrum includes. It opens a window with three modes (@fig-writing-jyutping),

- #ui[Off], the default, where Spectrum adds nothing,
- #ui[Apply when compiling], where Spectrum adds the Jyutping each time it compiles without changing your `.tex` files and
- #ui[In the .tex file], where the package and the font go into the preamble and the Chinese text is put in a `jyutpingscope` or `\xjyutping*{…}` by hand.

#shot("figures/02-writing/jyutping-auto.png", [The Jyutping window in Apply when compiling, with the Chinese font, a preview of the sample line and the package's options.], width: 62%) <fig-writing-jyutping>

=== Applying it automatically

With #ui[Apply when compiling], each paragraph that holds Chinese is read as a whole, so 行 is read _hong4_ in 銀行 and _haang4_ in 行路 (@fig-writing-jyutping-pdf). Verbatim text, `\verb` and code listings are left as they are, and so is a document that loads xjyutping itself. This is the simplest mode for a document that should carry Jyutping throughout.

#shot("figures/02-writing/jyutping-pdf.png", [A document compiled with Apply when compiling. The source has only the Chinese text, and 行 takes its reading from the word around it.], width: 80%) <fig-writing-jyutping-pdf>

=== Writing it into the .tex file

#ui[In the .tex file] suits a document that needs Jyutping on some passages only, or one that must compile elsewhere. Its buttons are #ui[Add to preamble], which writes `\usepackage[…]{xjyutping}` with the chosen options and the Chinese font into the preamble (and becomes #ui[Update preamble] and #ui[Remove from preamble] once it is there), #ui[Wrap selection in scope], #ui[Wrap selection in \\xjyutping\*] and #ui[Insert scope at cursor] (@fig-writing-jyutping-manual). The editor's right-click menu has the same wrapping, and completion lists the package's commands.

#shots(("figures/02-writing/jyutping-manual.png", "figures/02-writing/jyutping-preamble.png"), [In the .tex file, left, writes the package into the preamble and wraps the selection. The preamble it wrote, right, loads xeCJK with the chosen font before xjyutping.]) <fig-writing-jyutping-manual>

=== Options and fonts

The window has every option of the package: the size, height and spacing of the Jyutping, its font and formatting, the formatting of guessed readings for proofreading, the cell width, the script, lazy sounds (懶音), the alignment, fancy tones drawn as pitch strokes, keeping the source's line breaks for verse and lyrics, and a debug log. #ui[Preview] compiles a sample line, which can be typed over, with the options as they are set. The settings are saved with the project, and #ui[Reset to defaults] clears them.

Chinese support is turned on with Jyutping. When the document does not load ctex, xeCJK or LuaTeX-ja, xeCJK (or `luatexja-fontspec` under LuaLaTeX) is added with the font chosen under #ui[Chinese font]. Spectrum includes six Chinese fonts, which load by file name in every LaTeX compile: Noto Serif TC and SC and Noto Sans TC and SC, each with bold, and LXGW WenKai TC and LXGW WenKai. #ui[Other font installed on this computer…] names any other font. Changing the font or the engine changes the lines already in the preamble rather than adding new ones, so the `\setCJKmainfont` line is rewritten in place when the window closes.

xjyutping needs XeLaTeX or LuaLaTeX from a TeX installation, so a project set to Auto or pdfLaTeX compiles with XeLaTeX while Jyutping is on, and the log says so. The built-in Tectonic's LaTeX is too old for it. #menu[Settings][Engines][LaTeX] has an #ui[xjyutping folder], which can be a copy of the package's repository, used in place of Spectrum's own when set.

== Keyboard shortcuts <sec-writing-shortcuts>

Every shortcut in @tab-writing-shortcuts can be changed in #menu[Settings][Shortcuts]. Click a shortcut and press the new keys, press Delete to remove it or press Escape to cancel. A shortcut that is already in use is marked, and shortcuts that macOS keeps for itself, such as #key("⌘", "C"), are refused. #ui[Restore all defaults] puts every shortcut back. The diagram composer's tool keys are set in #menu[Settings][Diagram composer] and described in @ch-composer.

#figure(
  table(
    columns: (1fr, auto),
    align: left,
    table.header([Action], [Default]),
    [Indent and unindent lines], [#key("⌘", "]") and #key("⌘", "[") (or #key("Tab") and #key("⇧", "Tab") on a selection)],
    [Comment or uncomment lines], [#key("⌘", "/")],
    [Move lines up or down], [#key("⌥", "↑") and #key("⌥", "↓")],
    [Duplicate lines above or below], [#key("⌥", "⇧", "↑") and #key("⌥", "⇧", "↓")],
    [Delete lines], [#key("⇧", "⌘", "K")],
    [Bold, italic and emphasis], [#key("⌘", "B"), #key("⌘", "I") and #key("⇧", "⌘", "E")],
    [Preview this figure], [#key("⌥", "⌘", "P")],
    [Add the next match to the selection], [#key("⌘", "D")],
    [Select all matches], [#key("⇧", "⌘", "L")],
    [Add a cursor above or below], [#key("⌥", "⌘", "↑") and #key("⌥", "⌘", "↓")],
    [Go to the matching bracket], [#key("⇧", "⌘", "\\")],
    [Go to line], [#key("⌃", "G")],
    [Fold and unfold], [#key("⌥", "⌘", "[") and #key("⌥", "⌘", "]")],
    [Fold all and unfold all], [#key("⌃", "⌥", "[") and #key("⌃", "⌥", "]")],
    [Zoom the PDF in or out], [#key("⌘", "=") and #key("⌘", "−") (or pinch)],
    [Fit the PDF to the width or the page], [#key("⌘", "0") and #key("⌘", "9")],
    [Save], [#key("⌘", "S")],
    [Save a checkpoint], [#key("⇧", "⌘", "S")],
    [Compile], [#key("⌘", "Enter")],
    [Compile the open document], [#key("⇧", "⌘", "Enter")],
    [Show or hide the assistant], [#key("⌘", "L")],
    [Check grammar], [#key("⇧", "⌘", ";")],
    [AI autocomplete], [#key("⌥", "/")],
    [Show or hide the sidebar], [#key("⌘", "\\")],
    [Editor only, editor and PDF, PDF only], [#key("⌘", "1"), #key("⌘", "2") and #key("⌘", "3")],
    [Find a command], [#key("⇧", "⌘", "P")],
    [Go to a file or heading], [#key("⌘", "P")],
  ),
  caption: [The shortcuts that can be changed in #menu[Settings][Shortcuts].],
) <tab-writing-shortcuts>

A few shortcuts are fixed, and they are listed in @tab-writing-fixed. #key("Tab") indents in the editor, so to move the focus on by keyboard, press #key("Esc") first and then #key("Tab"). While the PDF has the focus, #key("⌘", "F") finds text in the PDF, and Page Up, Page Down, Home and End move through its pages.

#figure(
  table(
    columns: (1fr, auto),
    align: left,
    table.header([Action], [Key]),
    [Find and replace], [#key("⌘", "F")],
    [Find next and previous], [#key("⌘", "G") and #key("⇧", "⌘", "G")],
    [Undo and redo], [#key("⌘", "Z") and #key("⇧", "⌘", "Z")],
    [Settings], [#key("⌘", ",")],
    [Move the focus out of the editor], [#key("Esc"), then #key("Tab")],
    [Go to definition (TexLab, Tinymist)], [#key("F12"), or a click with #key("⌘") held],
    [Find references], [#key("⇧", "F12")],
    [Rename a label, citation key or command], [#key("F2")],
    [Format a Typst document (Tinymist)], [#key("⌥", "⇧", "F")],
    [Next and previous change in a review], [#key("J") and #key("K")],
    [Accept or apply, reject and edit the change in focus], [#key("A"), #key("R") and #key("E")],
  ),
  caption: [The fixed shortcuts.],
) <tab-writing-fixed>
