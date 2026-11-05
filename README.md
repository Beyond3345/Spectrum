<p align="center"><img src="apps/frontend/public/app-icon.png" width="128" alt="Spectrum icon"></p>

# Spectrum

This project is an application for writing and compiling LaTeX/Typst/Markdown documents with deep AI integration.. It is intended for students and researchers who want to keep their papers as ordinary folders on their own device offline while having AI assistance with drafting, citations and compile errors.

Spectrum is originally built from a fork of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) by OpenDCAI, which is no longer being maintained. While OpenPrism was a self-hosted web application built around real-time collaboration, Spectrum is a single-user desktop application. Apart from the AI features and reference look-ups, it works entirely offline. The full list of changes from upstream is given in [CHANGELOG.md](CHANGELOG.md).

## Features

The application is divided into two parts, the projects page and the editor.

### Projects

Each project is a normal folder that is chosen when the project is created. By default new projects are placed in `~/Documents/Spectrum`, so they can be backed up, synced or put under Git in the same way as any other folder. An existing LaTeX, Typst or Markdown folder can also be opened in place without being copied. The file list follows changes made outside Spectrum, so a file added, removed or renamed in Finder or by another editor shows up straight away.

Double-clicking a `.tex`, `.ltx` or `.bib` file in Finder or File Explorer opens it in Spectrum, in the project it belongs to. A file from a folder Spectrum has not seen yet opens together with the folder holding its document, which becomes a project, so a chapter in `chapters/` brings the whole thesis. On macOS Spectrum makes itself the default app for these files the first time it opens, and the button under Opening files in the Projects section of Settings does it again if another app has taken them since. On Windows the installer offers Spectrum for these files and Windows asks which app to use. PDFs stay with the PDF viewer either way.

The projects page lists every project regardless of where its folder is stored. Each row shows the first page of the last compiled PDF, and projects can be tagged (right-click a tag in the sidebar to rename it or choose its colour), archived, duplicated, removed from the list or moved to the Bin. New projects can start from the template gallery (Section Templates), from a `.zip` file such as an Overleaf export or from an arXiv ID. If a folder is moved in Finder, the project is marked as missing and can be pointed at its new location.

### Templates

The template gallery has templates for notes, reports, letters, slides and a CV, listed first, and the conference templates (ACL, CVPR, NeurIPS, ICML and arXiv) under Academic.

| Template | For | Main packages |
| --- | --- | --- |
| Simple document | a short A4 article with a title, paragraphs, 25 mm margins and single line spacing | `article`, `geometry`, `biblatex` |
| Maths notes | lecture notes or assignments with theorems, worked examples and their solutions, matrices and figures | `amsmath`, `amsthm`, `mathtools`, `tikz`, `pgfplots` |
| Electronics notes | notes or lab reports with circuits, quantities with units and Bode plots | `circuitikz`, `siunitx`, `pgfplots` |
| Coding report | programming assignments with highlighted code and pseudocode | `listings`, `algorithm`, `algpseudocode`, `booktabs` |
| Report or thesis | a long document with a title page, abstract, contents, chapters and an APA 7 bibliography | `report` class, `biblatex`, `cleveref`, `siunitx` |
| Formal letter | a letter in Australian block layout | `babel` with Australian English |
| Slides | a 16:9 Beamer presentation with maths, a chart and code | `beamer` (Madrid), `listings`, `pgfplots` |
| Academic CV | a one-page CV with links for email, ORCID and a website | `titlesec`, `enumitem`, `xcolor` |
| Typst document | a short A4 article in Typst with a figure, a reference and APA 7 references | Typst only |
| Typst report | the Report or thesis template in Typst: a title page, abstract, contents, chapters, a chart, tables, an appendix and APA 7 references | Typst only |
| Typst maths notes | lecture notes or assignments in Typst with theorems, worked examples and their solutions and a plot drawn in Typst | Typst only |
| Typst electronics notes | notes or lab reports in Typst with a circuit, quantities with units and a Bode plot drawn in Typst | Typst only |
| Typst coding report | programming assignments in Typst with highlighted code and pseudocode | Typst only |
| Typst letter | a formal letter in Typst with sender, date, recipient and sign-off | Typst only |
| Typst CV | a one-page CV in Typst with dated education, experience and skills | Typst only |
| Markdown article | a Markdown article for pandoc with a YAML title, a figure, a pipe table and citations | pandoc only |

Every LaTeX template uses APA 7 citations and references through `biblatex-apa` and Biber. Use Auto, pdfLaTeX, XeLaTeX or LuaLaTeX with a current TeX distribution, or the built-in Tectonic; Tectonic's older bibliography bundle can require a different Biber version. `\textcite` and `\parencite` produce narrative and parenthetical citations; the familiar `\citet` and `\citep` commands also work. The Typst templates follow [docs/TYPST_STYLE.md](docs/TYPST_STYLE.md), compile offline with no packages and use Typst's own APA style, and the Markdown article uses pandoc's citeproc with the `.bib` its front matter names.

The general templates use A4 paper apart from the slides, Australian English and no shell escape. Conference templates retain their page layouts but use an APA 7 bibliography adaptation. Use the venue's official reference style for an actual conference submission.

Each template in the gallery has a menu. Edit template opens a working copy of it in the editor, where it can be changed and compiled like any project, with a bar above the editor holding three buttons,

- Save template replaces the template's files with the copy's, leaving out compiled PDFs and the app's own files,
- Save as new template asks for a name, a section and a one-line description, and keeps the original as it was and
- Done closes the copy, and asks first if it has changes that were not saved to the template.

The copy is kept until Done, so Continue editing in the menu picks up where it was left. Any project can also become a template with Save as template in its menu, on the projects page or in the editor. Templates of your own are marked Yours and can be deleted. An edited built-in template is marked Edited and keeps your version when Spectrum is updated, and Restore original puts back the one that came with Spectrum. The built-in templates you have not edited follow each update. Projects already made from a template do not change when the template does.

### Editor

The editor is divided into three columns, the file tree, Research and the to-do list on the left, the document source in the middle and the compiled PDF on the right. The switcher at the top right of the window, or `⌘1`, `⌘2` and `⌘3`, shows the source only, the source and the PDF side by side, or the PDF only.

- The source editor has LaTeX, Typst or Markdown highlighting for the file it shows, folding, an outline of the main file (following `#include` in Typst), snippets for common environments, AI autocomplete (`⌥/`, accepted with `Tab`) and spell checking in Australian English. Typing `\` (or `/` at the start of a word in text) lists the commands that work where the cursor is. In maths, inside `$…$`, `\[…\]` or an `equation` or `align` environment, it lists maths commands such as `\vec`, `\lambda` and `\frac` with their symbols, and in text it lists text commands, together with the project's own commands from `\newcommand` and `\DeclareMathOperator`. Commands with arguments go in with fields that `Tab` moves through, so `\frac` then `Tab` goes from the numerator to the denominator. Inside braces it lists the project's labels after `\ref{`, its BibTeX keys after `\cite{`, packages after `\usepackage{` and the project's images and files after `\includegraphics{` and `\input{`. Environments are listed once `\beg` is typed, where `Tab` fills in as much as the entries share, so `\beg` becomes `\begin{` with the environments still listed, and `Tab` or Return then picks one. After `\begin{` the list holds the common environments, such as `equation*`, `align*` and `gather` (only those that work in maths when the cursor is in maths), the environments of the packages and classes the project loads and the ones it defines itself, each marked with where it comes from. Typing `$` with text selected puts the text in maths, in the same way as `(` brackets it. Otherwise `Tab` indents at the cursor by four spaces, pressing Return after `\begin{…}` adds the matching `\end{…}` at the same indent, and long lines wrap under their own indent, with formulas breaking between terms,
- the PDF preview fits the page to the width of its column by default, zooms with a trackpad pinch, `⌘` and the scroll wheel or `⌘=` and `⌘−`, shows the pages in a colour chosen for each mode (White, Cream, Sepia or Grey in light mode and Dark, Black, Dimmed or White in dark mode), and supports a two-page view and sticky notes, which are saved with the project. Links in the PDF work as in a PDF viewer: the contents, `\ref`, `\eqref` and `\cite` jump to the spot they point to, a web address opens in the browser and a reference into a linked document opens that document's PDF at the place it names. Double-clicking the PDF jumps to the line of the source that made it, and double-clicking a line of the source scrolls the PDF to it. LaTeX uses the SyncTeX data every compile writes; Typst and Markdown find the line by its words in the PDF. The spot is marked with a highlight that fades after a few seconds, whose colour and length are set in Settings under Editor,
- Document outline in the PDF's header opens a sidebar beside the pages with two tabs, Contents, which lists the PDF's bookmarks with the current section marked (or the source headings across `\input` files when the PDF has none), and Pages, which shows a thumbnail of each page with the current one outlined. `⌘F` finds text in the PDF while it has the focus, the page number in the page bar can be typed over, Page Up, Page Down, Home and End move through the pages and `⌘0` and `⌘9` fit the width and the whole page. Each document's PDF opens at the page it was left at, and Presentation mode shows slides one page at a time in full screen,
- the compiler can be pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or the built-in Tectonic, and the Auto setting picks one from the `% !TEX program` comment and the packages the document uses, falling back to Tectonic when no TeX is installed. A Typst document pins a Typst version instead, and a Markdown document chooses LaTeX or Typst as its PDF engine (Section Compiling) and
- the top bar holds Insert (+), Insert figure, Insert table, the file tabs, Assistant, Check grammar, Document insights, Tools and Agent. Tools, Check grammar, Document insights, the Floats panel and the agent workspace each take the PDF's place with a header holding Close (PDF in the agent workspace) and the view switcher, and the Compile button stays in the top bar while one of them is open. Tools has the Checkpoints, Logs and Review tabs. Document insights, Floats and Checkpoints have sections of their own below.

A project can hold more than one LaTeX, Typst or Markdown document, such as a set of lecture notes and the tutorial solutions that refer to them. Compile and `⌘↩` compile the main file, which is chosen with Set as main file in a file's menu. The menu beside Compile lists the other documents, and choosing one compiles it once without changing the main file, as does `⇧⌘↩` for the open document. With PDF follows the open file in Settings (on by default), opening another document's source, or a chapter whose `% !TEX root` comment names one, shows that document's PDF, and Compile and auto compile then build the document that is showing. Opening a file that is not a document leaves the PDF as it is, and choosing a PDF or a document by hand stops the PDF following until another file is opened. The page bar at the bottom of the PDF names the PDF that is showing and switches between the PDFs of the documents. Documents can refer to the labels of another with `xr-hyper`, for example `\externaldocument[notes:]{notes}` and `\eqref{notes:eq:ohm}`. Spectrum keeps the `.aux` files of every document for this, compiles a linked document first when it has not been compiled or has changed since, and completes `\ref{notes:` with the labels of the linked document.

The assistant chat is opened with `⌘L` and has two modes. Assistant mode answers questions about the open file, the selection and the compile log, and polishes, rewrites or translates a selection as proposed edits; work across the project's files belongs to the agent workspace (Section External agents). Proposed edits are shown as a side-by-side diff of the changed parts, with the changed words marked and the unchanged stretches folded away, and they can be accepted or rejected file by file. References mode adds citations to the project's `.bib` file (Section References). History in the chat's header lists the saved Assistant and References chats with the Edit chats from before 2.0, and has a search and Delete. A persona picked in the chat replaces your default instructions for that chat (Section Personas and skills).

### Compiling

The menu beside Compile holds the following choices. Use for all projects beside each one makes it the default in Settings › Engines, which every project uses until one of its own compile settings is changed,

- Compiler (this project), which is pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk, Tectonic or Auto, the default. The project's choice is saved in its `.spectrum/settings.json`, so it follows the project to your other computer, and Use the default puts it back,
- Auto compile, which is Off, the default, or compiles after a pause of 1 to 10 seconds since the last edit. A newer automatic compile takes the place of one that is out of date,
- Compile error handling, which is Try to compile despite errors, the default, or Stop on first error,
- Bibliography tool, which is Auto, BibTeX or Biber. Auto follows a `% !BIB program = biber` comment in the main file and otherwise uses Biber for `biblatex` and BibTeX for the rest,
- Syntax checks, which is Check before compiling, the default, or Don’t check (Section TexLab) and
- Fast draft mode, which compiles in one pass with each image drawn as a box of its size,
- Typst version (this project), for a Typst document: Default, the built-in version or one installed in Settings, saved with the project like the other choices, and
- PDF engine (this project), for a Markdown document: LaTeX, through your TeX or the built-in Tectonic, or Typst.

The menu changes with the document it compiles. A Typst document has the Typst version in place of the compiler, and a Markdown document has the PDF engine above it. The menu also has Stop compilation and Recompile from scratch, which first clears what earlier compiles of the open document kept. Recompile all does the same for every document in the project and compiles each one, linked documents first. While a compile runs, Compile becomes Stop, which ends it at once and keeps the last PDF.

The `.aux`, `.bbl`, `.toc` and similar files of each document are kept between compiles, for each compiler, in the app's own data folder, and the next compile reads them back, so a document whose labels, headings and citations have not changed is done in one pass. BibTeX and Biber only run when something is cited and another pass only runs when the log asks for one or a pass changed what TeX reads back. makeindex and makeglossaries run when the document has an index or glossaries. Files are kept only from a compile without errors, and when TeX cannot read one of them, Spectrum clears them and compiles once more from scratch, so a damaged `.aux` never locks a document out.

A chapter with a `% !TEX root = ../thesis.tex` comment compiles the document it names. Latexmk always runs with `-norc`, so a project's own `latexmkrc` cannot run code. Settings › Engines has LaTeX, Typst and Markdown tabs. The LaTeX tab has a TeX folder for a second TeX installation, whose programs are used before the ones on the `PATH`, and Open Logs when a compile fails. The Typst tab installs and removes older Typst versions and downloads Tinymist (Section Tinymist), and the Markdown tab downloads pandoc 3.12.1. The built-in Tectonic downloads its TeX bundle and each package on first use, and a compile that cannot reach the server says so. A checkpoint is saved after each successful compile (Section Checkpoints).

### TexLab

Spectrum includes [TexLab](https://github.com/latex-lsp/texlab) 5.26.0, a language server for LaTeX, and starts it for each open project. TexLab reads the project's files from the disk and the open file as it is typed, and gives the editor the following,

- squiggles under references and citations that have no label or entry, labels defined twice or never used, missing braces, environments that end with the wrong `\end` and mistakes in `.bib` files, each with its message when the pointer rests on it,
- the entry a citation stands for, or what a `\ref` points to, when the pointer rests on it,
- Go to definition (`F12`, or a click with `⌘` held) on a `\ref`, `\cite` or `\input`, which opens the file it leads to (a click with `⌥` held adds a cursor, in every file),
- Find references (`⇧F12`), which lists every use of the label, citation key or command at the cursor in a panel below the editor, with each line a click away and
- Rename (`F2`), which renames a label, citation key or command everywhere in the project, the `.bib` files included. It lists the files with the number of changes in each, saves a Before rename checkpoint and then saves every file through the usual save, or puts back those already saved when one cannot be.

With TexLab the sidebar's Outline covers the whole document across its `\input` files, with the section numbers of the last compile and the figures and tables by their captions. Document insights marks the labels TexLab finds unused or defined twice and the citations missing from the `.bib`, and Review adds TexLab's findings to its References and assets group (Section Review).

When Syntax checks in the compile menu is set to Check before compiling, the default, Compile first looks at TexLab's findings in the document's files. When there are missing braces or mismatched environments, it lists them and asks whether to compile anyway, and Cancel goes to the first one. References and citations with no label or entry never stop a compile, and auto compile skips the check. The default for every project is in Settings › Engines › LaTeX.

TexLab's own completion, building and formatting are left off, so Spectrum's completion stays as it is. Without TexLab, for example when Spectrum runs in a browser and `texlab` is not on the `PATH`, the editor works as before and the Outline reads the headings itself.

### Tinymist

[Tinymist](https://github.com/Myriad-Dreamin/tinymist) 0.15.10, a language server for Typst, downloads from Settings › Engines › Typst (about 31 MB, checked against its SHA-256) and then starts for each open project. In `.typ` files it gives the editor completion for the document's own functions, packages, labels and citations, hovers with signatures and docs, Go to definition, Find references and Rename as TexLab does, errors as you type, Format document with typstyle (`⇧⌥F`, or from the editor's right-click menu) and a word count of the PDF in Document insights.

Tinymist has Typst 0.15.1 inside it. In a project on that version, its errors take the place of the syntax check and the last compile's marks, and a double click jumps between the PDF and the source exactly, through Tinymist's preview running out of sight. A project pinned to another version keeps the compile's marks and the word matching for its jumps, since Tinymist would judge its code by 0.15's rules. Without Tinymist the editor works as before.

### Appearance

Settings has the following options under Appearance and Editor,

- the theme (System, Light or Dark) and an accent colour, which can follow macOS or be Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite or any other colour,
- a see-through window, which uses Liquid Glass on macOS 26 and later and the system blur on older versions, with a Clarity slider that sets how much of the desktop shows through while the editor and the PDF stay readable,
- the PDF page colour for light mode and for dark mode,
- the editor font, which can be one of the Mac's own fonts, one of four bundled open-source fonts (JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro) or any installed font by name, and the font size and
- an editor theme for light mode and another for dark mode, chosen from Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, Monokai, Rosé Pine, Ayu and Texifier-like and Overleaf-like themes. Any light theme can be paired with any dark one, and each colour of a theme can be changed for its mode.

### Floats

The Floats panel inserts figures and tables at the cursor. Insert figure and Insert table in the top bar open it at the figure or the table card, and so do Figure… and Table… in Insert (+), which also holds the two buttons when the editor is too narrow for them.

- Insert figure takes an image that is dropped on the card or on the editor, pasted or chosen, saves it in the project's `images` folder without replacing an existing file and inserts it as a figure with a caption, a label and a width. Formats that pdfLaTeX cannot read, such as HEIC, WebP and SVG, are converted first,
- Insert table builds a `tabular` or `tabularx` from a grid, which also takes cells pasted from Numbers, Excel or a CSV file, with a caption, a label and Booktabs, Grid, Minimal or None lines. Clicking between two rows or two columns, or along an edge, adds or removes a line across the table, and the Lines at row and column buttons do the same from the keyboard for the cell last edited. Grid draws a double line under the header. Once a line is changed by hand the panel says which preset it was changed from, until a preset is chosen again. In a Typst document the table is a `#table` with its lines as `table.hline` and `table.vline`, and in a Markdown document a pipe table, which has no lines of its own, and
- the packages a float needs (`graphicx`, `float`, `booktabs` and `tabularx`) are added before `\begin{document}` when the project does not load them yet.

The placement of a figure or table is chosen with the letters below, which can be combined. `H` is used on its own and is the default. Span both columns makes a `figure*` or `table*` for two-column papers, which only takes `t`, `p` and `!`.

| Letter | Meaning |
| --- | --- |
| `H` | Exactly here, no longer floating (needs the `float` package) |
| `h` | Roughly here in the text, if there is room on the page |
| `t` | At the top of a page |
| `b` | At the bottom of a page |
| `p` | On a separate page that holds only floats |
| `!` | Ignore LaTeX's limits on how many floats a page holds and how much of it they fill |

With no letter, LaTeX uses `tbp`. The letters allow places rather than order them, so `[ht]` means here or else the top of a page.

### Diagram composer

Draw a diagram in the top bar or Insert (+) opens a separate window on a gallery of starters in five categories, Engineering, Physics, Mathematics, Computing and Others, each in groups such as Electrical and electronics or Machine learning. Recently used holds the last eight you started, All lists every category and the search finds starters by name, group or package and circuit symbols by name. The starters are

- a circuit, 20 circuit templates (op amp stages, rectifiers, a transistor stage and its small-signal model, 555 timers, buck and boost converters, an RC ladder, a block diagram and a mass, spring and damper) and a logic schematic,
- structures, beams, trusses and frames with supports and loads, solved for their reactions with shear force and bending moment diagrams, and Mohr's circle from σx, σy and τxy,
- a plot of functions or project data, a signal sketch, a vector and slope field and a Venn diagram of two or three sets,
- a commutative diagram, a TikZ flowchart, a Typst flowchart with fletcher, a state machine in TikZ or Typst and a model architecture and
- a Mermaid diagram, a sequence diagram and a Gantt chart.

Circuits have 91 circuitikz parts and 5 supports for mechanical drawings, with symbols drawn by your installed circuitikz. Place parts, join their pins with wires and edit labels, values, arrows and styles. Wires follow their parts. The canvas has snapping, pan and zoom, a minimap, light and dark colours, copy and paste, and undo and redo. Plots use functions or columns from a project data file.

Each drawing is saved in `figures/` with its source, as `.tex` for TikZ, `.typ` for Typst and `.mmd` for Mermaid, and Edit diagram in the file tree opens it again. The Code tab allows hand edits; Redraw from the canvas replaces those edits only when you choose it. The preview compiles automatically, through LaTeX or through the built-in Typst, and its errors come with their lines. Export uses the current successful preview, and Insert as figure opens the editor's Floats panel with the diagram ready to place. TikZ figures use `\includestandalone`, so their labels follow your document's fonts and maths. A Typst diagram is included with `#figure(include "figures/<name>.typ")`, and a TikZ or Mermaid diagram goes into a Typst document as its PDF or PNG image, from Typst 0.14 for a PDF. An older pinned Typst gets the fletcher version it can load.

Mermaid diagrams export as PNG or PDF and insert as PDF figures in LaTeX, or as the image a Typst or Markdown document needs. The PDF embeds the high-resolution image at its original size.

### Document insights

Document insights, beside Check grammar in the top bar, takes the PDF's place with tabs for the Overview, Headings, Figures, Tables, Equations, Labels, Citations and To-dos, each with its count. Rows show the label with the number and page it had in the last compile, read from the `.aux` files that compile kept for LaTeX and from Typst's own eval for Typst, and clicking one jumps to its line in the source. A Markdown document lists its headings, figures, tables, equations, citations and labels from the source, without word counts, numbers or pages, since pandoc's generated LaTeX is not the document. The To-dos tab lists the to-dos in the source (Section To-do list). The Overview has the counts and the submission metadata (title, authors, keywords, date and abstract), with Copy submission metadata for a submission form; a LaTeX document also has the word counts from `texcount`. The footer says that the numbers and pages are from the last compile, marks them as out of date when the source has changed since and has Refresh.

### Review

Tools › Review checks the document Compile builds before it goes anywhere. One press of Review saves the open file, compiles when the PDF is older than the source (a failed build does not stop the review) and then runs each ticked group of checks:

- **Compile and layout:** a failed build, the log's errors, lines past the margin, citations and references the PDF shows as ??, missing glyphs, a compile that needs another pass, link targets used twice, pages of another size and text past the edge of a page,
- **References and assets:** citations with no entry, references with no label, labels used twice, keys or works in the bibliography twice, entries missing a field the type needs, DOIs that do not look like one, entries never cited, images that cannot be found and figures or tables the text never refers to, with TexLab's diagnostics when it runs,
- **Privacy and blind review:** files and lines that look like keys or passwords, `\todo` notes, `TODO` comments and highlighted text. With Anonymous review on, also `\author`, `\thanks`, the acknowledgements and the PDF's Author field,
- **Accessibility:** the PDF's title, language, tags, bookmarks, small text and pages with no text, alt text for figures, heading levels that skip and vague link text. Screen reader view shows the text a screen reader gets from each page,
- **Submission readiness:** the PDF version, encryption, fonts that are not embedded and Type 3 fonts, absolute paths, names that match only when letter case is ignored, image formats pdfLaTeX cannot include, awkward file names, the abstract and the keywords,
- **AI review** (ticked by default when a model is set up): one read of the whole document in `\input` order with numbered lines, told what the checks already found. It returns a summary, strengths, a score and confidence, the limits of the review and points marked Major, Minor or Note, each with a category and the line it is about. It never changes your files.

A Typst or Markdown document runs Compile and layout and Privacy and blind review, with a note in References and assets that the source checks read LaTeX. Accessibility and Submission readiness run for LaTeX only.

A group that needs the PDF or the log and has neither says Compile first rather than reporting no problems. Rows jump to their line or to their page in the PDF, and the AI review's rows also have Show in PDF. Fix with AI, on a row or for a whole group, asks the assistant for a fix that opens as changes to review, as in the Logs tab, and Dismiss hides a row. Cancel stops a review. The status line says when it last ran and whether the source has changed since, and Copy report copies the results as Markdown. The latest run is kept for each project until Spectrum quits.

### To-do list

The To-dos tab in the sidebar, beside Files and Research, holds a to-do list with a badge counting the open to-dos. It has two groups,

- Mine, your own to-dos, each with a tick box, its text, an optional link, Edit and Delete. A link points at a line of the source, which is found again by its text when lines move, at a PDF page or at a reference and
- In the source, which lists `\todo`, `\missingfigure` and `\fixme`, the notes of the fixme package (`\fxnote`, `\fxwarning`, `\fxerror` and `\fxfatal`) and `TODO`, `FIXME` and `XXX` in comments. Each one jumps to its line and is done once its mark is removed from the source.

A to-do is added in the box at the top of the tab or with Add to-do here in the editor's right-click menu, which links the line, or in the PDF's, which links the page. The tab shows Open, Done or All and Mine or Source, and the sidebar's search finds to-dos too. Each to-do is a small file in the project's `.spectrum/todos` folder, and each PDF note one in `.spectrum/notes`.

The open to-dos go with an agent's first message. A to-do an agent suggests appears in the agent workspace as a card with Add and is only saved once it is added, and Save open steps as to-dos adds the open steps of an agent's plan (Section External agents).

### Personas and skills

A persona is a set of instructions for a kind of task, picked in the assistant chat or in the agent workspace. While one is chosen it replaces your default instructions, and each chat remembers its own. Settings › Personas holds the default instructions and the personas, each with a name, a colour and its instructions, with Create, Edit, Delete and Reset to defaults. Spectrum starts with four, Research writer, Document editor, Critical reviewer and Draw a figure, and they follow you to your other computer with the shared settings. Personas go to the assistant, the Spectrum agent and local agents but never to autocomplete. A local agent gets the persona in its own system prompt where it offers one, and otherwise with the first message of each new agent session, so changing the persona starts a new session that is told the conversation so far.

Skills are instructions in the open Agent Skills format, a folder with a `SKILL.md`. An agent sees each skill's name and description and loads the rest when it needs it, or straight away when the skill is picked with `/` in the agent workspace. Spectrum ships 12 skills from K-Dense's scientific agent skills (paper lookup, literature review, citation management, peer review, scientific writing, critical thinking, hypothesis generation, venue templates, research grants, scientific slides, LaTeX posters and Mermaid diagrams), each under its own licence (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)), and five of its own for LaTeX, Markdown, Typst, related work and verifying claims. Settings › Skills lists them in groups with a search, and each card shows the skill's author, licence, version, file count and what its scripts need to run. Every skill has a switch. All projects sets it for this computer, and This project lets the open project differ, saved in its `.spectrum/settings.json`. Your own skills are made with Create skill, with Add folder, which copies a folder in (regular files only), or by duplicating a built-in skill. They are edited in the skill's file browser and removed with Delete.

The Spectrum agent has the list of skills in its instructions and loads them itself, on Windows too, but cannot run their scripts. Before each local agent session, Spectrum copies the skills that are on for the project into the agent's private home, marked as Spectrum's, so skills the agent installed itself are never touched. Share skills with other agents on this computer (off by default) links your own skills that are on into `~/.agents/skills` and `~/.claude/skills` for agents you run outside Spectrum, only where `~/.agents` or `~/.claude` already exists and never in place of anything already there.

### References

A DOI, a link, an arXiv ID or a paper title can be pasted into the references chat, and the matching BibTeX entry is written to `references.bib`. The look-up is done in the following order,

1. a DOI is resolved through doi.org content negotiation, which covers both Crossref and DataCite DOIs, with the Crossref API as a fallback
2. an arXiv ID uses the arXiv API, and the published DOI is used instead when the paper has one
3. any other link is read for publisher metadata, including JSON-LD, authors and complete publication dates. If authors are absent, a displayed BibTeX export with the same title can supply them, including on alphaXiv. When a page is blocked or missing author/date metadata, enabled search connections are tried for the exact page, starting with the default. Exa uses its Contents endpoint; other providers use citation-focused queries. Unknown dates and authors are left empty
4. a title is searched on Crossref, and if no single result clearly matches, the closest candidates are shown to choose from

The citation key is the first author's surname followed by the year, for example `Vaswani2017`. Accents are removed and name particles are joined, so "van der Waals" becomes `VanderWaals`. When the key already exists for a different paper, a letter is added (`Smith2020a`, `Smith2020b`). A paper whose DOI or arXiv ID is already in the project is reported as a duplicate and is not added again.

Built-in templates use `xurl` so long bibliography links can wrap within the page. In an existing document, add `\usepackage{xurl}` after the bibliography package (such as `biblatex` or `natbib`) and before `hyperref`, then recompile. Keep URLs intact in the `.bib` file. Generated webpage entries store the address once in `url`; the reference importer uses `howpublished` instead for classic styles such as `plain` that ignore `url`. If an older generated entry contains both fields, remove `howpublished` when using APA 7 or another URL-aware style.

Imported titles use LaTeX opening/closing quotation marks while preserving apostrophes inside words. arXiv references retain their canonical `https://arxiv.org/abs/…` URL alongside their DOI and identifier. Unknown publication dates stay unknown rather than being guessed from an address or copyright notice.

### Zotero

Spectrum reads your Zotero library through Zotero's local API on this computer, and with Zotero 10 it also keeps a collection for each project. Zotero must be open with "Allow other applications on this computer to communicate with Zotero" ticked in its Settings › Advanced. Settings › Zotero shows whether Zotero is open, its version, whether the local API is on and whether Better BibTeX is installed. Without Zotero, Spectrum works as before.

- **Citing.** Cite from Zotero, in the editor's right-click menu for `.tex` files and on the References card, opens Zotero's own citation picker when Better BibTeX is installed, brings Zotero to the front and shows Answer in Zotero with Cancel until you have picked. Without Better BibTeX it opens a search of your library in Spectrum. The chosen entries go into the `.bib` under their Zotero citation key (Zotero's own field, then Better BibTeX's key, then an author and year key as in Section References), through the same duplicate check as the references chat, and the citation command is put at the cursor. A key the `.bib` already uses for another work gets the next free letter. The `file` field, which holds paths to PDFs on this computer, is left out.
- **Completion.** Three letters into a `\cite` key, completion also lists the matching items of your Zotero library in a Zotero section below the project's own keys, leaving out the ones the project already has. Picking one adds its entry to the `.bib`. It can be turned off in Settings › Zotero.
- **Research.** Research has a Zotero source, and Add kept papers to .bib takes a paper found there from Zotero under its own key.
- **Project collections.** With Zotero 10, Allow Spectrum in Zotero… in Settings › Zotero asks Zotero for permission once (choose Always Allow), and Zotero's answer stays in `zotero.json` in the app's data folder, readable by your account only. Each project then gets a collection, Spectrum › its name (or its name with (2) when that is taken), kept in step with its `.bib` after each reference is added, a few seconds after a `.bib` is saved, when the project is opened and when you come back to the window. Items your library already has are found by citation key, DOI, arXiv ID or title and year and added to the collection, and the other entries become new items in it. An entry taken out of the `.bib` leaves the collection only after this computer saved a `.bib` that was read in full, and its item stays in your library. Spectrum never deletes a Zotero item and never changes the `.bib` from Zotero's side.
- **Two computers.** The collection is recorded in the project's `.spectrum/settings.json` with the project's id, so it goes with the project to your other computer through GitHub and a Finder copy of the project gets a collection of its own. When the other computer's Zotero has not received the collection yet, Spectrum says Waiting for Zotero to sync this project's collection and makes no second one. Zotero 7 to 9 can be read but not written, so they cite and complete without collections.

### Research

The Research tab in the sidebar, between Files and To-dos, looks for papers on a question without needing a model. Type the question, choose the sources (OpenAlex, Semantic Scholar, arXiv, Crossref, PubMed, the project's `.bib` and Web, which uses your search connections), a range of years if you want one and whether preprints count, then press Search. Every source is searched at once, and one that fails or is busy does not stop the others. The results are merged by DOI, arXiv ID and title, keeping the fullest record, so a paper found as a preprint and as published is shown once, as published. Each result shows its authors, year and venue, the sources that found it, its citation count, Open access when there is a free copy, Preprint when no source knows it as published and In .bib with its key when the project already has it. Sort the results with AI makes one call to the search model, which adds a line on why each result matters, a keep or drop suggestion and a theme.

Each question is kept as a session in the project's `.spectrum/research` folder, with a log of every search (the words, the filters and how many results each source gave or why it failed) and your decisions. Search again runs another search, with the same or other words, into the open session, and the list shows All, Kept, Dropped or To decide. Each result has

- Keep and Drop, each with an optional reason,
- Cite, which adds the paper to the `.bib` when it is not there yet and puts the citation command at the cursor,
- Open note, which opens the paper's `research/notes/<key>.md`, first made with its details, where it was found and its abstract word for word and
- Get PDF, which downloads a free copy from arXiv, from Unpaywall (with the email in Settings › Search) or from the copy a source named into `research/papers/`.

Add kept papers to .bib adds every kept paper the `.bib` does not have through the same look-up as the references chat (Section References), so a paper already in the project keeps its key and is never added twice. Find citations for selection finds papers that support the selected passage and adds the chosen ones in the same way. Nothing is written to `research/` until Open note or Get PDF is used.

Deep research, Draft related work and Verify claims open the agent workspace with a prepared task, its skill and the session, and Verify claims also takes the Critical reviewer persona. Deep research searches further with other words, follows the kept papers' references and citations, reads the free full text and writes notes and a reading list. Draft related work cites only keys in the `.bib`, and Verify claims checks each claim in the open file against its sources without changing the text.

Settings › Search holds the keys and emails Research uses, which stay on this computer: the OpenAlex and Semantic Scholar keys (the same as those search connections' keys), an email for OpenAlex, an NCBI key for PubMed and the email Unpaywall asks for.

### Web search

Research's Web source, the references chat and Find citations for selection search through the search connections. Settings → Search lets you enable several connections with separate keys and choose the default. The default is tried first, then the other enabled connections in their displayed order when a request fails or returns no usable results. Existing saved keys are retained. Each fallback can use the next provider's search allowance.

Chat can call general web search without academic ranking or BibTeX generation. References, citation suggestions and Research request authors, publication dates, source links and bibliography metadata. Model search uses real provider-side search on supported OpenAI Responses and Claude Messages APIs and requires provider-returned sources; models without verified native search, including DeepSeek's chat API, fall back to enabled connections.

| Provider | What it searches | Needs |
| --- | --- | --- |
| The model's own search | whatever the search model finds, asked for peer-reviewed or authoritative sources with a DOI or arXiv ID | a model with built-in web search |
| [OpenAlex](https://openalex.org) | scholarly works only (articles, conference papers, preprints, books, theses, reports and standards), without retracted ones | nothing, or a free key for more searches a day |
| [Semantic Scholar](https://www.semanticscholar.org) | papers in every field | nothing, or a free key, since the shared pool is often busy |
| [SerpApi](https://serpapi.com) | Google Scholar by default, or Google or Baidu | a SerpApi key |
| [Exa](https://exa.ai) | its publications category for research questions, and the whole web for questions about LaTeX or software | an Exa key |
| [Tavily](https://tavily.com) | the web, preferring arXiv, DOI publishers, the main proceedings, standards bodies, CTAN and TeX Stack Exchange | a Tavily key (two credits a search) |
| [Brave Search](https://brave.com/search/api/) | the web, with the same sites boosted | a Brave Search key |
| [DDGS](https://pypi.org/project/ddgs/) | Google, Bing, Brave, DuckDuckGo, Mojeek and Yahoo at once | no key, but Python 3.10 or later with `ddgs` installed (`python3 -m pip install ddgs`) |

The System section of Settings shows whether Python and `ddgs` are found, and DDGS uses the same Python as the table to chart tool.

### Spelling and grammar

Spectrum checks writing in the languages you list in Settings › Spelling & grammar, Australian English alone unless you add others. Each paragraph is checked in one of them, and never in a language you did not list: with Australian English and Traditional Chinese listed, no paragraph is checked as US English or Simplified Chinese. Language markup decides first (babel and polyglossia in LaTeX, `text(lang:)` in Typst, `lang` in Markdown front matter and Pandoc spans and divs). Otherwise the script of the text decides, and for listed languages that share a script, their own dictionaries vote on the paragraph's words. Variants of one language, such as Australian and US English, are never guessed: the higher one in the list is used. A paragraph whose language cannot be told, such as a one-word heading, takes the language of the paragraph before it. A project can have its own list, which travels with it. Spelling is checked as you type in `.tex`, `.typ`, `.md` and `.txt` files, and misspelt words get a red underline. Right-clicking one offers suggestions, Add to dictionary, Add to project dictionary and Ignore. The project dictionary is kept in the project's `.spectrum` folder, so it travels with the project, while the main dictionary covers every project and can be edited in Settings under Spelling & grammar.

Spelling uses the [Hunspell](https://hunspell.github.io) 1.7.6 spell checker through a small binding of Spectrum's own. Australian English uses three dictionaries,

1. SCOWL en_AU-large, which sets the standard (colour, organise, centre, defence)
2. AussieDic, which adds Australian places, names and slang such as Parramatta, Wiradjuri and arvo and
3. SCOWL en_US, which is used only to recognise the American spellings in AussieDic, so color, organize and center are still flagged.

American, British and Canadian English use their own SCOWL dictionaries, and Indian English uses the British one. Dictionaries for other languages are listed in a catalogue pinned to fixed versions of [wooorm/dictionaries](https://github.com/wooorm/dictionaries) and [LibreOffice's dictionaries](https://github.com/LibreOffice/dictionaries), and each one downloads only when asked for, from its row in Settings or when the editor first meets a listed language that needs it. It is checked against its SHA-256 and a short self-test before it is used, and a failed or offline download never stops the languages already on the computer. Traditional Chinese has no dictionary, so in a mostly Traditional paragraph Spectrum underlines stray Simplified-only characters from [OpenCC](https://github.com/BYVoid/OpenCC)'s tables, leaving the forms standard in Hong Kong and Taiwan alone, and suggests their Traditional forms.

The grammar check reads each paragraph of the open file in its language. English goes to [Harper](https://github.com/Automattic/harper) 3.0.0, in the listed dialect (Australian, American, British, Canadian or Indian), or to LanguageTool if you choose that in Settings. Other languages go to [LanguageTool](https://languagetool.org) 6.8 when it is turned on in Settings › Spelling & grammar, which downloads it (its jars from Maven Central and a Temurin Java runtime, about 310 MB, each checked against its SHA-256) into the data folder when you ask and runs it on this computer only while you check grammar, so nothing you check leaves the computer. Only one language's paragraphs go to LanguageTool in each request, with LaTeX commands, maths and comments sent as blanks. The panel says which languages had no grammar checker, and a long LanguageTool check can be cancelled. It is started with the button beside the assistant button or with `⇧⌘;`, and its results take the place of the PDF until the panel is closed. Each issue is underlined in the editor and listed with its sentence, and it can be fixed with one click, ignored, or turned off for the project with Ignore rule. Settings has options for style suggestions, such as long sentences and wordiness, which are off by default, and for the serial comma, which is flagged by default in line with the Australian Government Style Manual.

Both checkers read only the prose. In LaTeX, commands, maths, comments, citation and reference keys, URLs, the preamble and code blocks are skipped, while the text of headings, captions, footnotes and `\emph`, `\textbf` and similar commands is checked. Typst skips its comments, raw text and blocks, maths, calls and their arguments apart from the content in brackets, labels, references and URLs, keeping headings and captions. Markdown skips front matter, fenced and indented code, inline code, HTML, maths, URLs, image and link targets, citations and attributes, keeping prose and link text. Harper reads Markdown itself.

### Checkpoints

Checkpoints are kept inside each project in a hidden `.spectrum` folder, together with the project settings, saved chats, to-dos, PDF notes and research sessions, so they travel with the project. Builds run in a temporary folder, and the SyncTeX data and the files kept from the last compile of each document are in the app's own data folder. File contents are compressed and stored once, so unchanged files cost no extra space between checkpoints. A checkpoint is saved with one click from the Save checkpoint button beside Compile or with `⇧⌘S`, and the notice that follows offers to name it. Checkpoints can also be saved and named in the Checkpoints tab of Tools. One is also saved automatically before AI changes are applied, before a restore and before a template change, so each of these can be undone. A checkpoint can be compared with the current files, restored as a whole or restored one file at a time.

Settings › Checkpoints has the following options,

- Save a checkpoint when a compile succeeds (on by default), which saves one when the source has changed since the last checkpoint. Compiles save at most one every 10 minutes, as a newer compile's checkpoint takes the place of the one saved earlier in that time, while manual, named and Before checkpoints are never replaced,
- Warn me when a checkpoint fails to save (on by default), which says when saving fails or when a file was too large (over 50 MB) or could not be read and
- Delete automatic checkpoints older than…, which removes the compile checkpoints older than the chosen age and is also in Tools › Checkpoints.

Checkpoints are stored as 1.10.4 stored its versions, so going back to 1.10.4 lists every checkpoint as a version.

### GitHub

Projects go between your computers through GitHub. Spectrum keeps each project in a private repository of yours and settings in another, through isomorphic-git, so no Git installation is needed on a Mac or on Windows.

- **Signing in.** Settings › GitHub takes a personal access token: a fine-grained token for all your repositories with Contents and Administration set to Read and write, or a classic token with the `repo` scope. A copy of Spectrum built with an OAuth app's client id (`SPECTRUM_GITHUB_CLIENT_ID`) also signs in with a code entered at github.com, and Settings › GitHub lists the steps to register one. The token stays in the backend, in `github.json` in the app's data folder, readable by your account only, and never reaches the window. Commits are made as your GitHub account with its noreply email address.
- **Backing up.** Sync with GitHub in a project's menu, or Back up to GitHub in Tools › GitHub, makes a private repository named after the project and records it in the project's `.spectrum/settings.json` with the project's id, so a Finder copy of the project is not linked. Initialise makes the folder a Git repository without GitHub. From then on Spectrum pulls when the project is opened, backs up about a minute after you stop typing and backs up when you leave the project. Quitting only commits, and the push follows at the next start. Tools › GitHub has Sync, Pull, Back up… (with an optional label) and Open on GitHub, with how many commits are still to back up or pull.
- **What goes to GitHub.** The sources, figures and `.bib` files, with the project's details, its settings, chats, to-dos, PDF notes and research sessions. Checkpoints, presence and other files of this computer, TeX's build files, each compiled document's PDF (but never a PDF a source includes), files that look like keys and files over GitHub's 100 MB limit stay on this computer, and a backup says which files it left out. Spectrum writes these rules to `.git/info/exclude` before each backup, and a `.gitignore` for TeX's build files only when the project has none. In a repository that is public or has other collaborators, chats, to-dos, notes and research stay out until you say yes in Tools › GitHub. Chats and research sessions are committed at Sync and when you leave the project, not at every backup.
- **Pulling.** Spectrum fetches first, then commits this computer's changes, saves a "Before pull from GitHub" checkpoint and merges each file changed on both computers: text by lines, the project's details and settings key by key, chats by message, research sessions by search and to-dos and notes field by field. A file that does not merge keeps this computer's copy with GitHub's beside it as a conflicted copy, for example `main (GitHub’s conflicted copy 2026-10-25 104233).tex`, which the editor offers to compare, keep or delete. A deletion only wins over a file the other computer did not change, a rename that only changes letter case is followed and a pull that would delete many files at once asks first. Each file is written only while it still holds what was just committed, and the branch moves only once every file is written, so a file you change during a pull is never written over. The to-dos, PDF notes and Research reload after a pull that changed them.
- **The other computer.** The GitHub view in the projects page's sidebar lists your repositories that are Spectrum projects. Get from GitHub clones one into the folder for new projects with the project's own id, and Link joins a repository with the project of the same id already on this computer, after showing how many files would come from GitHub and how many conflicts there would be. A project with a 1.10.4 mirror record merges from the files the mirror last agreed on, so only files changed on both computers conflict.
- **Refused.** Spectrum leaves a repository alone while another Git program works in it (`.git/index.lock`), and does not sync one that uses Git LFS or submodules, is in the middle of a merge or has no branch checked out. A project inside a sync app's folder (Synology Drive, Dropbox, Google Drive, OneDrive or iCloud Drive, including Documents kept in iCloud) is not made a repository, as sync apps damage them, and Spectrum offers to move it to this computer first.
- **When it cannot reach GitHub.** Without a connection Spectrum waits and tries again every two minutes. A token GitHub no longer accepts says Sign in to GitHub again, a repository you cannot reach says No access to it and a push GitHub refuses shows GitHub's message. Each also shows as Not backed up since on the project and in Tools › GitHub, and opening a project offline says Spectrum could not check GitHub.
- **Settings.** With Keep my settings in a private repository on (in Settings › GitHub), appearance, editor, spelling, shortcuts, personas, your own skills and templates, the folders on the Projects page and tag colours go through a private `spectrum-settings` repository, cloned into the app's data folder. Each computer writes its own settings file, so the newer value of each setting wins. Personas, skills and templates are one file or folder each, and when two computers changed the same one the newer is kept whole. A computer signing in for the first time takes the settings already there. API keys, tokens and folders on disk never go to GitHub.

### Syncing between computers

From 2.0, projects and settings go between your computers through GitHub, and the cloud sync of 1.10 (cloud locations, Sync to, Download, Stop syncing and the Cloud projects view) is gone. Without a GitHub account, projects and settings stay on each computer.

- **Moving from 1.10.** On its first start, 2.0 stops mirroring. A project 1.10 mirrored into a cloud location is an ordinary project on this computer from then on, and its copy in the cloud location is left as it is and no longer updated. A notice on the projects page names these projects and lists any files the copy in the cloud location has that this computer never received, with Show in Finder, so you can copy over what you need. Spectrum never merges them itself. Before updating, open 1.10.4 on each computer and wait until it shows Synced, so both copies are level. Then update the other computer too, as 1.10 there keeps changing its copy, use Sync with GitHub here and use Link or Get from GitHub there.
- **Projects in a sync app's folder.** A project used in its cloud location under 1.10, or kept in a folder that Synology Drive, OneDrive, Dropbox, Google Drive or iCloud Drive syncs, keeps working where it is. Sync apps can damage a project's GitHub history, so Spectrum warns about it and offers Move to this computer…, which copies the project into the default folder for new projects, checks every file and works on that copy from then on. The folder in the sync app stays as it is, for a computer still on 1.10. Settings does not accept a folder in a sync app's folder as the default folder for new projects.
- **Project folders.** Projects can be sorted into folders under All projects, and folders can hold folders. A folder's menu has New folder…, Rename… and Delete…, and a project goes into a folder when it is dragged there or with Move to folder…. Deleting a folder moves what was in it up a level. Folders only arrange the list, so the projects stay where they are on disk, and the arrangement follows you to your other computers with your settings.
- **Changes from the other computer.** A file changed on disk by a pull from GitHub or another app is reloaded in the editor when it has no unsaved edits here. If it does, Spectrum asks whether to keep this computer's text or use the other one, and offers to compare them. The text that is not used is kept in a checkpoint, so nothing is lost. A file deleted on disk is marked in its tab rather than brought back by a save.
- **Conflicted copies.** When a file changed on both computers cannot be merged, the other computer's version is kept beside it as a conflicted copy, for example `main (GitHub’s conflicted copy 2026-10-18 104233).tex`, as sync apps also make. These are marked in the file list, with Compare, Use this copy and Delete copy.
- **Compiling.** A compile writes only the PDF into the project. SyncTeX data, the kept `.aux` files and the thumbnail are kept on each computer, so the other computer needs one compile of its own before double-click jumping works there.
- **Going back to 1.10.4.** 1.10.4 opens every project 2.0 has used. 2.0 keeps its new data (the GitHub link, the Zotero collection, the compiler, to-dos, PDF notes and research sessions) in `.spectrum/settings.json` and folders that 1.10.4 does not read, and adds nothing to `project.json`. 1.10.4 leaves a project's `.git` folder out of its file list, checkpoints and mirroring. 2.0 only reads 1.10's mirror records, its `sync.json` and the copies in the cloud locations, so 1.10.4 resumes mirroring from the last state both copies agreed on, with the edits made in 2.0 going to the cloud copy.

## Requirements

- macOS 13.5 or later on Apple silicon (Intel Macs stay on version 2.1.0; the Liquid Glass app icon needs macOS 26 or later), or Windows 10 or 11 on an x64 PC (Section Windows),
- a LaTeX distribution is optional: Typst 0.15.1 and Tectonic 0.17.0 are built in, and [MacTeX](https://www.tug.org/mactex/), [MiKTeX](https://miktex.org) or [TeX Live](https://www.tug.org/texlive/) can be used instead of Tectonic. Markdown needs pandoc, which Settings › Engines › Markdown downloads on request,
- an API key from one of the providers in Section Models, or any OpenAI-compatible server, for the AI features,
- Python 3 with matplotlib for the table to chart tool and with `ddgs` for DDGS web search (both optional) and
- an account with one of the PDF parsers in Section Template transfer, for converting a paper from its PDF (optional).

## Installing

Download the macOS or Windows installer and the SHA-256 checksums from the [latest GitHub release](https://github.com/Beyond3345/Spectrum/releases/latest).

1. Open `Spectrum_<version>_aarch64.dmg`
2. Drag Spectrum into the Applications folder
3. Open Spectrum from the Applications folder

Since the application is signed ad hoc rather than with an Apple Developer ID, macOS blocks it on the first launch when the DMG has been downloaded from the internet. To allow it, open System Settings, go to Privacy & Security and select Open Anyway. Alternatively, run the following command once,

```bash
xattr -dr com.apple.quarantine /Applications/Spectrum.app
```

On Windows, run `Spectrum_2.2.3_x64-setup.exe`. It installs Spectrum for the current user without administrator rights and adds it to the Start menu, and it installs Microsoft Edge WebView2 when the PC does not have it yet. Since the installer is not signed, Windows SmartScreen may warn about it on the first run. To continue, select More info and then Run anyway.

## Windows

The Windows version is a preview. Version 2.0 was built and tested on a Windows x64 PC, including the packaged backend, the spelling and grammar engines and native agent isolation; see the [Windows 2.0 validation report](docs/WINDOWS_2_0_VALIDATION.md). To build the installer yourself on a Windows PC, follow [Building Spectrum on Windows](docs/BUILDING_ON_WINDOWS.md). It differs from the macOS version as follows,

- the window has the standard Windows title bar, and Liquid Glass is not available,
- the icons are Microsoft's Fluent UI System Icons, since Apple's SF Symbols may only be used on Apple platforms,
- the shortcuts use `Ctrl` for `⌘`, `Alt` for `⌥` and `Shift` for `⇧`, so Compile is `Ctrl+Enter`. Fold and unfold are `Ctrl+Shift+[` and `Ctrl+Shift+]`, find next and previous are `F3` and `Shift+F3`, and redo is `Ctrl+Y`,
- Show in Finder is Show in File Explorer, and projects are moved to the Recycle Bin,
- local agents get no Spectrum tools yet. Preview PDF in the agent workspace needs MiKTeX or TeX Live 2025 or earlier, since TeX Live 2026 no longer limits which files a compile reads,
- MiKTeX installs a missing package without asking, since its question would appear in a hidden window and
- settings are kept in `%APPDATA%\com.beyond3345.spectrum` and new projects are placed in `Documents\Spectrum`.

## Setting up

1. Open Settings with `⌘,`
2. Choose a provider under Models and paste its API key
3. Choose the theme under Appearance and the default compiler under Engines
4. Check the System section to confirm which TeX tools Spectrum can find
5. Set up the local agents you use, such as OpenCode or Codex, under Agents (Section External agents)

Choosing a provider fills in its endpoint, the recommended models and the recommended reasoning effort, which are described in Section Models. The model settings can also be given in a `.env` file at `~/Library/Application Support/com.beyond3345.spectrum/.env` (`%APPDATA%\com.beyond3345.spectrum\.env` on Windows), using the variables listed in Section Configuration. Settings entered in the application take priority over the `.env` file.

## Models

Spectrum does not include a model of its own, so the AI features use an API key from a provider of your choice. Settings has presets for the providers below. Each preset sets three models, the main model for the assistant and the tools, a quick model for autocomplete and for splitting pasted references, and a vision model for image to LaTeX. The recommended models were checked against each provider's documentation in October 2026.

| Provider | Main model | Quick model | Vision model | Effort |
| --- | --- | --- | --- | --- |
| OpenAI | GPT-6 Sol | GPT-6 Luna | GPT-6 Sol | Medium |
| Anthropic Claude | Claude Opus 5.5 | Claude Haiku 5.5 | Claude Sonnet 5.5 | Medium |
| Google Gemini | Gemini 3.8 Flash | Gemini 3.5 Flash-Lite | Gemini 3.8 Flash | Medium |
| OpenRouter | Claude Sonnet 5.5 | GPT-6 Luna | Gemini 3.8 Flash | Medium |
| DeepSeek | DeepSeek Flash | DeepSeek Flash | DeepSeek Flash | High |
| Moonshot Kimi | Kimi K3 | Kimi K2.6 | Kimi K3 | High |
| Z.ai GLM | GLM-5.3 | GLM-5.3 Flash | GLM-5.3 Flash | High |
| Alibaba Qwen | Qwen3.8 Max | Qwen3.8 Flash | Qwen3.8 Max | Medium |
| Meta | Muse Spark 1.3 | Muse Spark 1.3 | Muse Spark 1.3 | Medium |
| Ollama | the newest installed model | the smallest installed model | the first installed model that reads images | the model's own, at most High |
| Ollama Cloud | Kimi K3 | DeepSeek V4.1 Flash | Kimi K3 | High |

Other models from the same provider can be picked from the list, and any other name can be typed in. The quick and vision models can each be set separately. By default they use the main model's provider and key and move with it when it changes. Choosing another provider for either one gives it its own region, model and key, for example Gemini 3.8 Flash for images while Claude writes the text. A key is only ever sent to the address it was entered for, including the key in the `.env` file. The Other provider takes any server that speaks the OpenAI chat completions API, such as LM Studio or vLLM, and a server at a plain `http://` address needs no key. Each provider's key is kept when switching between them, so going back to a provider does not need the key again.

The reasoning effort sets how long the model may think before answering, from Off to Max. Settings and the assistant only offer the levels the chosen model accepts, and Recommended uses the level in the table. Autocomplete, reference parsing and search queries use the lowest level a listed model accepts, so they stay quick, while models on other servers use their own default. Spectrum sends the effort in the form each provider expects,

- OpenAI is called through the Responses API, since its chat completions API does not allow reasoning together with the file editing tools. Requests are sent with storage turned off, so nothing is kept on OpenAI's servers,
- Claude is called through Anthropic's Messages API, since the OpenAI-compatible endpoint ignores the effort setting,
- DeepSeek, GLM and Qwen turn thinking off when the effort is Off, and Gemini 3, Kimi K3, GLM-5.3 and Meta's Muse models always think a little, so they start at their lowest level instead and
- temperature is left at each provider's default, since several of them reject any other value.

Keys for Moonshot, GLM and Qwen only work in the region they were created in, so choose the same region under Region. Meta lists Muse Wonder 1.0 (a preview) and Muse Spark 1.3, 1.2 and 1.1. Its cheaper Contributor models are left out of the list on purpose, since Meta trains on what is sent to them.

Ollama runs models on your own computer, or on another one on the network when its address is entered. It needs no key, and its models are read from Ollama itself with Refresh, so the list is whatever has been downloaded, with the effort levels each model offers. Ollama keeps a short context by default, so raising Context length to 32k or more in its settings lets whole documents fit. Ollama Cloud runs larger models on Ollama's servers with a key from [ollama.com](https://ollama.com/settings/keys), and Ollama says it does not keep or train on what is sent.

## Template transfer

Change template moves a paper into another template, either directly from its LaTeX source or from its PDF. The PDF route first turns the PDF into Markdown with LaTeX maths and extracted figures, using one of the parsers below, and the main model then writes the paper into the new template. Each parser keeps its own address and key in Settings under Template transfer, and a key is only ever sent to the address it was entered for.

| Parser | Where it runs | Key |
| --- | --- | --- |
| [MinerU](https://mineru.net) (default) | MinerU's servers, free with 1,000 priority pages a day | token |
| [Mathpix](https://mathpix.com) | Mathpix's servers, paid per page | app ID and app key |
| [Mistral OCR](https://mistral.ai) | Mistral's servers, paid per page | API key |
| [Datalab](https://www.datalab.to) (Marker) | Datalab's servers, with a free monthly allowance | API key |
| [LlamaParse](https://www.llamaindex.ai) | LlamaIndex's servers in the US or the EU, with free monthly credits | API key |
| [PaddleOCR-VL](https://www.paddleocr.ai) | Baidu AI Studio, which needs an AI Studio account | access token |
| [Docling](https://github.com/docling-project/docling-serve) | your own computer or server, for example with `docker run -p 5001:5001 quay.io/docling-project/docling-serve` | none, unless the server sets one |
| Other | any server that speaks one of the APIs above | as that API needs |

The PDF and the parser's output are kept in the new project's hidden `.spectrum` folder.

## Keyboard shortcuts

Every shortcut below can be changed in the Shortcuts section of Settings. Click a shortcut and press the new keys, press Delete to remove it or press Escape to cancel. A shortcut that is already in use is marked, and shortcuts that macOS keeps for itself, such as `⌘C`, are refused.

| Action | Default |
| --- | --- |
| Indent lines | `⌘]` (or `Tab` on a selection, while `Tab` alone indents at the cursor) |
| Unindent lines | `⌘[` (or `⇧Tab`) |
| Comment or uncomment lines | `⌘/` |
| Move lines up or down | `⌥↑` and `⌥↓` |
| Duplicate lines above or below | `⇧⌥↑` and `⇧⌥↓` |
| Delete lines | `⇧⌘K` |
| Bold, italic and emphasis | `⌘B`, `⌘I` and `⇧⌘E` |
| Add the next match to the selection | `⌘D` |
| Select all matches | `⇧⌘L` |
| Add a cursor above or below | `⌥⌘↑` and `⌥⌘↓` |
| Go to the matching bracket | `⇧⌘\` |
| Go to line | `⌃G` |
| Fold and unfold | `⌥⌘[` and `⌥⌘]` |
| Fold all and unfold all | `⌃⌥[` and `⌃⌥]` |
| Save | `⌘S` |
| Save a checkpoint | `⇧⌘S` |
| Compile | `⌘↩` |
| Compile the open document | `⇧⌘↩` |
| Show or hide the assistant | `⌘L` |
| Check grammar | `⇧⌘;` |
| AI autocomplete | `⌥/` |
| Show or hide the sidebar | `⌘\` |
| Show the editor only, the editor and PDF, or the PDF only | `⌘1`, `⌘2` and `⌘3` |
| Zoom the PDF in or out | `⌘=` and `⌘−` (or pinch) |
| Fit the PDF to the width | `⌘0` |

Find (`⌘F`), undo (`⌘Z`), redo (`⇧⌘Z`) and Settings (`⌘,`) cannot be changed, and nor can TexLab's Go to definition (`F12`), Find references (`⇧F12`) and Rename (`F2`) (Section TexLab). While the PDF has the focus, `⌘F` finds text in it, `⌘9` fits the whole page and Page Up, Page Down, Home and End move through its pages.

## Building from source

Building requires Node.js 20.12 or later, Rust with the `aarch64-apple-darwin` target and Xcode.

1. Run `npm install`
2. Run `npm test` to run the backend tests
3. Run `npm run desktop:build` to build the application for Apple silicon and the DMG

The test that moves a project to the Bin is skipped by default, since it moves a real folder into the macOS Bin. Set `SPECTRUM_TEST_BIN=1` to include it.

The spell checker and the grammar checker are compiled code that is kept in `native/`, so a normal build does not need to rebuild them. Their sources and build tools are pinned in `native/checkers.lock.json`. Hunspell's source is kept unmodified in `native/hunspell/core`, beside Spectrum's binding (`native/hunspell/binding.cc`), and checked against the hash recorded there, and Harper's is downloaded from its pinned release archive and checked against its SHA-256 (or taken from a checkout that `HARPER_DIR` names, or from an archive given with `--archive`). `npm run native:build` rebuilds both, tests each build and records its versions and file hashes in a manifest beside it, and `npm run checkers:verify` checks that the files in `native/` and `dictionaries/` match their manifests. Rebuilding needs Xcode and Python for the Hunspell binding, and Rust with the `wasm32-unknown-unknown` target and `wasm-pack` for Harper.

To move to a newer Harper or Hunspell, put its version, archive URL and SHA-256 in `native/checkers.lock.json` and rebuild it (`node scripts/native.mjs harper`, or `node scripts/native.mjs hunspell --update`, which also replaces the source kept in `native/hunspell/core`). A checksum or source hash that differs stops the build and prints the one it found, so the lock can be updated once the new source has been reviewed. Then run `npm run checkers:verify`.

The language catalogue in `apps/backend/src/data/languages.json` is written by `node scripts/native.mjs catalogue` from the dictionary sources pinned in `native/checkers.lock.json`. It downloads each dictionary, keeps those with a licence file, a UTF-8 or ISO-8859-1 encoding and three words of their own that they accept, and prints every language it kept or refused. `node scripts/native.mjs catalogue --check` downloads them again and compares, for use before a release.

The build script downloads Node.js 24 LTS, TexLab 5.26.0, Tectonic 0.17.0 and Typst 0.15.1 for Apple silicon and checks them against pinned SHA-256 sums (the engines' sums are in `apps/backend/src/data/engines.json`). It then bundles the backend with esbuild and runs `tauri build --target aarch64-apple-darwin`. The results are written to `src-tauri/target/aarch64-apple-darwin/release/bundle/`. The engines' versions and checksums live in that one file, which Settings and the backend read as well.

The Windows installer is built on Windows with the same command. It needs Node.js, Rust with the MSVC toolchain and the Visual Studio Build Tools with C++ and Python for the Hunspell binding, which is built for Windows with `node scripts/native.mjs hunspell`. The build script downloads the Windows Node.js 24 LTS and the engines, checks them in the same way, builds `texlab.exe` from TexLab's checked source with the C runtime linked in, puts Microsoft's `vcruntime140.dll` beside Typst and runs `tauri build --target x86_64-pc-windows-msvc`, which writes an NSIS installer. The workflow in `.github/workflows/windows.yml` does all of this on GitHub Actions, runs the backend tests with MiKTeX and attaches the installer to a release when it is run with a release tag. The Fluent icons in `apps/frontend/public/fluent/` are written by `node scripts/fluent-icons.mjs`.

For development there are two options. `npm run desktop:dev` runs the macOS shell against the backend in the repository, fetching the engines first if needed, and `npm run dev` runs the interface in a browser at `http://localhost:5173` with the backend on port 8787, which uses a `texlab` on the `PATH` (`brew install texlab`) when there is one. For a browser build, run `node scripts/desktop.mjs typst` and `node scripts/desktop.mjs tectonic` once so the backend finds the built-in engines beside the repository.

## Running in a browser

1. Run `npm run build`
2. Run `npm start`
3. Open `http://localhost:8787`

The server only accepts requests from the same computer, since it has full access to the project folders.

## Configuration

The backend reads the following environment variables, either from the environment or from a `.env` file.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SPECTRUM_LLM_ENDPOINT` | OpenAI-compatible chat completions endpoint | `https://api.openai.com/v1/chat/completions` |
| `SPECTRUM_LLM_API_KEY` | API key used when none is entered in Settings | none |
| `SPECTRUM_LLM_MODEL` | Model name | `gpt-6-sol` |
| `SPECTRUM_PROJECTS_DIR` | Default folder for new projects | `~/Documents/Spectrum` |
| `SPECTRUM_DATA_DIR` | Project list and user templates | `data/` in the repository, or the application support folder in the app |
| `SPECTRUM_HOST` and `PORT` | Address the server listens on | `127.0.0.1` and `8787` |
| `SPECTRUM_PYTHON` | Python used by the table to chart tool | `python3` |
| `SPECTRUM_MINERU_TOKEN` | MinerU token for template conversion, sent only to MinerU's own address or to `SPECTRUM_MINERU_API_BASE` | none |
| `SPECTRUM_MINERU_API_BASE` | MinerU API address | `https://mineru.net/api/v4` |
| `SPECTRUM_GITHUB_CLIENT_ID` | Client id of the OAuth app (with Enable Device Flow) Settings › GitHub signs in with; there is never a client secret | none: a pasted token only |

## External agents (local preview)

The **Agent** button in the top bar opens the agent workspace in the PDF's place, with PDF in its header to go back. It has two tabs. **Spectrum agent** is the built-in agent (Edit in the assistant before 2.0): it reads the project through the main model and proposes changes. Its threads are saved with the project's chats, marked as agent threads, so the workspace lists them and the assistant does not, and an Edit chat from before 2.0 has Continue there to carry it on in the workspace. **Local agents** runs an installed ACP agent, chosen from the row of agents above the message box. An agent that is not set up yet is set up in Settings › Agents, which holds its program, API key, launcher arguments and runtime folders and can also copy supported login and configuration files into the agent's private state.

The header holds the session history, the Isolated or Direct badge, the agent's model and mode options, the persona picker and Stop. A new conversation opens on What would you like to do today?, with task buttons for a literature sweep, related work, a citation audit, a manuscript review and verifying claims. Each fills in a prepared prompt with its skill, and Manuscript review also picks the Critical reviewer persona. The transcript shows the messages, the agent's thinking folded away, a card for each tool call that updates as it runs (with its output, its terminal or a side-by-side diff), questions and permission requests in line and a Restore row for each Before AI changes checkpoint. The agent's plan stays at the top, and Save open steps as to-dos adds its open steps to the to-do list. Chips below the message box choose what goes with a message: the open file, the selection, the compile log and the open to-dos, which go with the first message unless taken off. Typing `/` lists the agent's commands and the project's skills, and a skill chosen there goes with the message in whole.

Changes wait in a tray above the message box, such as "3 files, +12 −4", which opens a review in the pane. It has each file's diff with Apply and Reject, Apply all, Reject all and Preview PDF, which compiles a local agent's copy where it cannot read outside that copy. An isolated agent keeps working on its copy while changes wait, so you can go on prompting and apply or reject each file whenever you like. An applied file becomes the agent's new starting point, and a rejected one is put back to your version in the agent's copy, which the agent is told with its next task. Closing the workspace does not stop a task: a dot on the Agent button shows a task running, waiting for an answer or with changes to review. Keys, working copies, session mappings and transcripts stay on this computer.

On macOS a local agent also gets Spectrum's tools, a small server it starts inside its isolation, with `compile`, `get_log`, `project_map`, `bib_entries`, `bib_search`, `literature_search`, `fetch_bibtex`, `list_todos`, `suggest_todo` and `load_skill`. The to-dos it suggests appear as cards with Add when its task ends. Local agents on Windows get no Spectrum tools yet, as Settings › Agents says, and the task buttons work without them.

The launcher profiles cover OpenCode, Codex, Claude Agent, Gemini CLI, GitHub Copilot CLI, Cursor, Kimi Code, Hermes, Qoder, Pi, DeepSeek Harness and ZCode. Some need a separately installed ACP adapter; each profile links its setup guide. Pi and ZCode use community adapters, and DeepSeek’s source and published versions can differ. An available launcher does not certify every installed release or login method. WorkBuddy is listed as planned: it will use official interfaces in the later remote integration, without private desktop gateways. Agent names and logos belong to their owners: Spectrum shows them only to identify each agent and is not affiliated with or endorsed by them.

**Isolated** is the default. On macOS, the agent and its commands run under a native Seatbelt policy, in a separate project copy and private agent home. The live project is excluded. Apply or reject the resulting text, new, deleted and binary files; overlapping edits are refused. Application journals preserve recovery copies if an operation is interrupted. **Direct** permits immediate project edits and saves recovery copies before each task.

On macOS the isolated process can use public HTTPS and DNS. It cannot call arbitrary local HTTP services or Unix sockets. OpenCode receives one private loopback port for its internal server. Windows uses a less-privileged AppContainer (LPAC), explicit file grants and a job that contains descendants. It grants public Internet client access, without private-network access or a loopback exemption. Local model endpoints, host browser automation and host MCP servers are unavailable unless a future integration explicitly brokers them. Runtime folders grant read access to installed agent libraries; choose specific folders rather than personal data directories.

The default grants exclude unrelated home files. Some CLI installations need their runtime folder added in Advanced setup, and some authentication methods require an API key or separate sandbox login. Claude subscription reuse is not assumed. The preview requires macOS `sandbox-exec` or the bundled Windows isolation worker and fails closed when either is unavailable. Projects containing symlinks/hardlinks, files above 50 MB or more than 500 MB/10,000 files are refused rather than copied incompletely. Windows launchers must be native `.exe` programs; script adapters need an explicit interpreter and script arguments. OpenCode 1.19.3 and the Codex, Claude Agent, Pi and ZCode adapters remain unavailable on Windows while runtime compatibility is unresolved. They remain integration targets; global Claude configuration is unchanged. See [Windows validation](docs/WINDOWS_AGENT_VALIDATION.md) for the tested boundary and current limitations.

The existing Assistant, References, autocomplete and image-to-LaTeX continue to use model APIs. `npm run test:agents` exercises native containment, an ACP fixture lifecycle, review/recovery and an installed OpenCode handshake, without inference calls. The [integration plan](docs/AGENT_INTEGRATION_PLAN.md) records the remaining rollout work.

## Repository layout

- `apps/backend` is the Fastify server that manages projects, compiling, the AI tools, references and checkpoints,
- `apps/frontend` is the React interface,
- `src-tauri` is the macOS application shell, which starts the bundled backend and opens the interface,
- `templates` holds the bundled LaTeX, Typst and Markdown templates,
- `native` holds the spell checker (Spectrum's Hunspell binding, with Hunspell's source) and the grammar checker (Harper) as built for the application,
- `dictionaries` holds the spell-check dictionaries, with their licences,
- `skills` holds the agent skills that ship with Spectrum, with their licences (Section Personas and skills) and
- `scripts` holds the desktop build script, the script that builds `native`, the script that copies the skills from K-Dense's repository and the SF Symbols renderer used for the interface icons.

## Troubleshooting

### The first Tectonic compile takes several minutes

Tectonic downloads the packages it needs the first time they are used, which took about 3 minutes for the ACL template. Spectrum allows up to 15 minutes per Tectonic run, and later compiles use the downloaded copies.

### A biblatex document fails to compile with Tectonic

The TeX bundle that Tectonic downloads contains biblatex 3.8, which only works with biber 2.17, while current TeX Live installs a newer biber. Compile documents that use biblatex with Auto, pdfLaTeX or XeLaTeX instead.

### biber prints the usage text of `lipo`

The universal biber in TeX Live 2026 unpacks itself with a `lipo` command that macOS 27 rejects. Updating TeX Live with `sudo tlmgr update --self --all` installs a working biber, and the System section in Settings shows whether biber runs.

### Spectrum cannot find `pdflatex` or `tectonic`

Applications opened from Finder do not receive the `PATH` that Terminal uses. Spectrum reads the `PATH` from the login shell and adds `/Library/TeX/texbin`, `/opt/homebrew/bin` and `/usr/local/bin`. If TeX is installed somewhere else, add its folder to `PATH` in `~/.zprofile` and restart Spectrum, or choose the folder as the TeX folder in Settings › Engines › LaTeX.

### Spelling or grammar checking says it is not available

The spell checker is a compiled add-on and the grammar checker a WebAssembly module, both loaded by the backend when they are first needed. If one cannot load, the editor shows the reason once and carries on without it. The details are in the backend log, at `~/Library/Logs/com.beyond3345.spectrum/backend.log` in the app. Rebuilding with `npm run native:build` fixes a missing or damaged file in a copy built from source.

### The table to chart tool fails

The tool runs Python with matplotlib. Install it with `pip install matplotlib`, or set `SPECTRUM_PYTHON` to a Python that already has it.

## Acknowledgements and licence

Spectrum is based on OpenPrism by OpenDCAI. Many ideas in Spectrum's later versions, such as the agent workspace, the preflight checks, Zotero and source control, were inspired by [Oleafly](https://github.com/Oleafly/Oleafly) by Prajwal Murthy and contributors, and the circuit drawing in the diagram composer by [CircuiTikZ-Designer](https://github.com/Circuit2TikZ/CircuiTikZ-Designer). Thank you to both teams for building them in the open. Oleafly is released under the GNU Affero General Public License and CircuiTikZ-Designer under the GNU General Public License, so Spectrum learns from their designs but contains none of their code. Spectrum uses CodeMirror, PDF.js, Fastify, LangGraph and Tauri, runs TexLab beside it as a separate program, checks spelling with Hunspell (through a binding of Spectrum's own), SCOWL and AussieDic and grammar with Harper, and bundles the JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro fonts. The editor themes reuse the colours of the themes they are named after. Their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The interface icons are drawn from Apple's SF Symbols, which are licensed for use in applications on Apple platforms.

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE).
