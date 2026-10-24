<p align="center"><img src="apps/frontend/public/app-icon.png" width="128" alt="Spectrum icon"></p>

# Spectrum

This project is an application for macOS and Windows for writing LaTeX documents with an AI assistant, a references assistant and local checkpoints built in. It is intended for students and researchers who want to keep their papers as ordinary folders on their own Mac while still having help with drafting, citations and compile errors.

Spectrum is a fork of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) by OpenDCAI, which is no longer being maintained. While OpenPrism was a self-hosted web application built around real-time collaboration, Spectrum is a single-user desktop application. Apart from the AI features and reference look-ups, it works entirely offline. The full list of changes from upstream is given in [CHANGELOG.md](CHANGELOG.md).

## Features

The application is divided into two parts, the projects page and the editor.

### Projects

Each project is a normal folder that is chosen when the project is created. By default new projects are placed in `~/Documents/Spectrum`, so they can be backed up, synced or put under Git in the same way as any other folder. An existing LaTeX folder can also be opened in place without being copied. The file list follows changes made outside Spectrum, so a file added, removed or renamed in Finder or by another editor shows up straight away.

Double-clicking a `.tex`, `.ltx` or `.bib` file in Finder or File Explorer opens it in Spectrum, in the project it belongs to. A file from a folder Spectrum has not seen yet opens together with the folder holding its document, which becomes a project, so a chapter in `chapters/` brings the whole thesis. On macOS Spectrum makes itself the default app for these files the first time it opens, and the button under Opening files in the Projects section of Settings does it again if another app has taken them since. On Windows the installer offers Spectrum for these files and Windows asks which app to use. PDFs stay with the PDF viewer either way.

The projects page lists every project regardless of where its folder is stored. Each row shows the first page of the last compiled PDF, and projects can be tagged (right-click a tag in the sidebar to rename it or choose its colour), archived, duplicated, removed from the list or moved to the Bin. New projects can start from the template gallery (Section Templates), from a `.zip` file such as an Overleaf export or from an arXiv ID. If a folder is moved in Finder, the project is marked as missing and can be pointed at its new location.

### Templates

The template gallery has templates for notes, reports, letters, slides and a CV, listed first, and the conference templates (ACL, CVPR, NeurIPS, ICML and arXiv) under Academic.

| Template | For | Main packages |
| --- | --- | --- |
| Simple document | a short A4 article with a title, paragraphs, 25 mm margins and one-and-a-half line spacing | `article`, `geometry`, `setspace`, `biblatex` |
| Maths notes | lecture notes or assignments with theorems, worked examples and their solutions, matrices and figures | `amsmath`, `amsthm`, `mathtools`, `tikz`, `pgfplots` |
| Electronics notes | notes or lab reports with circuits, quantities with units and Bode plots | `circuitikz`, `siunitx`, `pgfplots` |
| Coding report | programming assignments with highlighted code and pseudocode | `listings`, `algorithm`, `algpseudocode`, `booktabs` |
| Report or thesis | a long document with a title page, abstract, contents, chapters and an APA 7 bibliography | `report` class, `biblatex`, `cleveref`, `setspace` |
| Formal letter | a letter in Australian block layout | `babel` with Australian English |
| Slides | a 16:9 Beamer presentation with maths, a chart and code | `beamer` (Madrid), `listings`, `pgfplots` |
| Academic CV | a one-page CV with links for email, ORCID and a website | `titlesec`, `enumitem`, `xcolor` |

Every shipped template uses APA 7 citations and references through `biblatex-apa` and Biber. Use Auto, pdfLaTeX, XeLaTeX or LuaLaTeX with a current TeX distribution; Tectonic's older bibliography bundle can require a different Biber version. `\textcite` and `\parencite` produce narrative and parenthetical citations; the familiar `\citet` and `\citep` commands also work.

The general templates use A4 paper apart from the slides, Australian English and no shell escape. Conference templates retain their page layouts but use an APA 7 bibliography adaptation. Use the venue's official reference style for an actual conference submission.

Each template in the gallery has a menu. Edit template opens a working copy of it in the editor, where it can be changed and compiled like any project, with a bar above the editor holding three buttons,

- Save template replaces the template's files with the copy's, leaving out compiled PDFs and the app's own files,
- Save as new template asks for a name, a section and a one-line description, and keeps the original as it was and
- Done closes the copy, and asks first if it has changes that were not saved to the template.

The copy is kept until Done, so Continue editing in the menu picks up where it was left. Any project can also become a template with Save as template in its menu, on the projects page or in the editor. Templates of your own are marked Yours and can be deleted. An edited built-in template is marked Edited and keeps your version when Spectrum is updated, and Restore original puts back the one that came with Spectrum. The built-in templates you have not edited follow each update. Projects already made from a template do not change when the template does.

### Editor

The editor is divided into three columns, the file tree, Research and the to-do list on the left, the LaTeX source in the middle and the compiled PDF on the right. The switcher at the top right of the window, or `⌘1`, `⌘2` and `⌘3`, shows the source only, the source and the PDF side by side, or the PDF only.

- The source editor has LaTeX highlighting, folding, an outline of the main file, snippets for common environments, AI autocomplete (`⌥/`, accepted with `Tab`) and spell checking in Australian English. Typing `\` (or `/` at the start of a word in text) lists the commands that work where the cursor is. In maths, inside `$…$`, `\[…\]` or an `equation` or `align` environment, it lists maths commands such as `\vec`, `\lambda` and `\frac` with their symbols, and in text it lists text commands, together with the project's own commands from `\newcommand` and `\DeclareMathOperator`. Commands with arguments go in with fields that `Tab` moves through, so `\frac` then `Tab` goes from the numerator to the denominator. Inside braces it lists the project's labels after `\ref{`, its BibTeX keys after `\cite{`, packages after `\usepackage{` and the project's images and files after `\includegraphics{` and `\input{`. Environments are listed once `\beg` is typed, where `Tab` fills in as much as the entries share, so `\beg` becomes `\begin{` with the environments still listed, and `Tab` or Return then picks one. After `\begin{` the list holds the common environments, such as `equation*`, `align*` and `gather` (only those that work in maths when the cursor is in maths), the environments of the packages and classes the project loads and the ones it defines itself, each marked with where it comes from. Typing `$` with text selected puts the text in maths, in the same way as `(` brackets it. Otherwise `Tab` indents at the cursor by four spaces, pressing Return after `\begin{…}` adds the matching `\end{…}` at the same indent, and long lines wrap under their own indent, with formulas breaking between terms,
- the PDF preview fits the page to the width of its column by default, zooms with a trackpad pinch, `⌘` and the scroll wheel or `⌘=` and `⌘−`, shows the pages in a colour chosen for each mode (White, Cream, Sepia or Grey in light mode and Dark, Black, Dimmed or White in dark mode), and supports a two-page view and sticky notes, which are saved with the project. Links in the PDF work as in a PDF viewer: the contents, `\ref`, `\eqref` and `\cite` jump to the spot they point to, a web address opens in the browser and a reference into a linked document opens that document's PDF at the place it names. Double-clicking the PDF jumps to the line of the source that made it, and double-clicking a line of the source scrolls the PDF to it, using the SyncTeX data every compile writes. The spot is marked with a highlight that fades after a few seconds, whose colour and length are set in Settings under Editor,
- Document outline in the PDF's header opens a sidebar beside the pages with two tabs, Contents, which lists the PDF's bookmarks with the current section marked (or the source headings across `\input` files when the PDF has none), and Pages, which shows a thumbnail of each page with the current one outlined. `⌘F` finds text in the PDF while it has the focus, the page number in the page bar can be typed over, Page Up, Page Down, Home and End move through the pages and `⌘0` and `⌘9` fit the width and the whole page. Each document's PDF opens at the page it was left at, and Presentation mode shows slides one page at a time in full screen,
- the compiler can be pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or Tectonic, and the Auto setting picks one from the `% !TEX program` comment and the packages the document uses (Section Compiling) and
- the top bar holds Insert (+), Insert figure, Insert table, the file tabs, Assistant, Check grammar, Document insights, Tools and Agent. Tools, Check grammar, Document insights, the Floats panel and the agent workspace each take the PDF's place with a header holding Close (PDF in the agent workspace) and the view switcher, and the Compile button stays in the top bar while one of them is open. Tools has the Checkpoints, Logs and Review tabs. Document insights, Floats and Checkpoints have sections of their own below.

A project can hold more than one document, such as a set of lecture notes and the tutorial solutions that refer to them. Compile and `⌘↩` compile the main file, which is chosen with Set as main file in a file's menu. The menu beside Compile lists the other documents, and choosing one compiles it once without changing the main file, as does `⇧⌘↩` for the open document. With PDF follows the open file in Settings (on by default), opening another document's `.tex`, or a chapter whose `% !TEX root` comment names one, shows that document's PDF, and Compile and auto compile then build the document that is showing. Opening a file that is not a document leaves the PDF as it is, and choosing a PDF or a document by hand stops the PDF following until another file is opened. The page bar at the bottom of the PDF names the PDF that is showing and switches between the PDFs of the documents. Documents can refer to the labels of another with `xr-hyper`, for example `\externaldocument[notes:]{notes}` and `\eqref{notes:eq:ohm}`. Spectrum keeps the `.aux` files of every document for this, compiles a linked document first when it has not been compiled or has changed since, and completes `\ref{notes:` with the labels of the linked document.

The assistant chat is opened with `⌘L` and has two modes. Assistant mode answers questions about the open file, the selection and the compile log, and polishes, rewrites or translates a selection as proposed edits; work across the project's files belongs to the agent workspace (Section External agents). Proposed edits are shown as a side-by-side diff of the changed parts, with the changed words marked and the unchanged stretches folded away, and they can be accepted or rejected file by file. References mode adds citations to the project's `.bib` file (Section References). History in the chat's header lists the saved Assistant and References chats with the Edit chats from before 2.0, and has a search and Delete. A persona picked in the chat replaces your default instructions for that chat (Section Personas and skills).

### Compiling

The menu beside Compile holds the following choices. Use for all projects beside each one makes it the default in Settings › Engines › LaTeX, which every project uses until one of its own compile settings is changed,

- Compiler (this project), which is pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk, Tectonic or Auto, the default. The project's choice is saved in its `.spectrum/settings.json`, so it follows the project to your other computer, and Use the default puts it back,
- Auto compile, which is Off, the default, or compiles after a pause of 1 to 10 seconds since the last edit. A newer automatic compile takes the place of one that is out of date,
- Compile error handling, which is Try to compile despite errors, the default, or Stop on first error,
- Bibliography tool, which is Auto, BibTeX or Biber. Auto follows a `% !BIB program = biber` comment in the main file and otherwise uses Biber for `biblatex` and BibTeX for the rest and
- Fast draft mode, which compiles in one pass with each image drawn as a box of its size.

The menu also has Stop compilation and Recompile from scratch, which first clears what earlier compiles of the open document kept. Recompile all does the same for every document in the project and compiles each one, linked documents first. While a compile runs, Compile becomes Stop, which ends it at once and keeps the last PDF.

The `.aux`, `.bbl`, `.toc` and similar files of each document are kept between compiles, for each compiler, in the app's own data folder, and the next compile reads them back, so a document whose labels, headings and citations have not changed is done in one pass. BibTeX and Biber only run when something is cited and another pass only runs when the log asks for one or a pass changed what TeX reads back. makeindex and makeglossaries run when the document has an index or glossaries. Files are kept only from a compile without errors, and when TeX cannot read one of them, Spectrum clears them and compiles once more from scratch, so a damaged `.aux` never locks a document out.

A chapter with a `% !TEX root = ../thesis.tex` comment compiles the document it names. Latexmk always runs with `-norc`, so a project's own `latexmkrc` cannot run code. Settings › Engines › LaTeX also has a TeX folder for a second TeX installation, whose programs are used before the ones on the `PATH`, and Open Logs when a compile fails. A checkpoint is saved after each successful compile (Section Checkpoints).

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
- Insert table builds a `tabular` or `tabularx` from a grid, which also takes cells pasted from Numbers, Excel or a CSV file, with booktabs, grid or minimal lines, a caption and a label and
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

Draw a diagram in the top bar or Insert (+) opens a separate window. Choose a circuit, a TikZ flowchart, a commutative diagram, a plot or a Mermaid diagram. Typst diagrams arrive with the later Typst work.

Circuits have 49 parts, with symbols drawn by your installed circuitikz. Place parts, join their pins with wires, and edit labels, values, arrows and styles. Wires follow their parts. The canvas has snapping, pan and zoom, a minimap, light and dark colours, copy and paste, and undo and redo. Plots use functions or columns from a project data file.

Each drawing is saved in `figures/` with its source, and Edit diagram in the file tree opens it again. The Code tab allows hand edits; Redraw from the canvas replaces those edits only when you choose it. The preview compiles automatically. Export uses the current successful preview, and Insert as figure opens the editor's Floats panel with the diagram ready to place. TikZ figures use `\includestandalone`, so their labels follow your document's fonts and maths.

Mermaid diagrams export as PNG or PDF and insert as PDF figures in LaTeX. The PDF embeds the high-resolution image at its original size.

### Document insights

Document insights, beside Check grammar in the top bar, takes the PDF's place with tabs for the Overview, Headings, Figures, Tables, Equations, Labels, Citations and To-dos, each with its count. Rows show the label with the number and page it had in the last compile, read from the `.aux` files that compile kept, and clicking one jumps to its line in the source. The To-dos tab lists the to-dos in the source (Section To-do list). The Overview has the counts, the word counts from `texcount` and the submission metadata (title, authors, keywords, date and abstract), with Copy submission metadata for a submission form. The footer says that the numbers and pages are from the last compile, marks them as out of date when the source has changed since and has Refresh.

### Review

Tools › Review checks the document Compile builds before it goes anywhere. One press of Review saves the open file, compiles when the PDF is older than the source (a failed build does not stop the review) and then runs each ticked group of checks:

- **Compile and layout:** a failed build, the log's errors, lines past the margin, citations and references the PDF shows as ??, missing glyphs, a compile that needs another pass, link targets used twice, pages of another size and text past the edge of a page,
- **References and assets:** citations with no entry, references with no label, labels used twice, keys or works in the bibliography twice, entries missing a field the type needs, DOIs that do not look like one, entries never cited, images that cannot be found and figures or tables the text never refers to, with TexLab's diagnostics when it runs,
- **Privacy and blind review:** files and lines that look like keys or passwords, `\todo` notes, `TODO` comments and highlighted text. With Anonymous review on, also `\author`, `\thanks`, the acknowledgements and the PDF's Author field,
- **Accessibility:** the PDF's title, language, tags, bookmarks, small text and pages with no text, alt text for figures, heading levels that skip and vague link text. Screen reader view shows the text a screen reader gets from each page,
- **Submission readiness:** the PDF version, encryption, fonts that are not embedded and Type 3 fonts, absolute paths, names that match only when letter case is ignored, image formats pdfLaTeX cannot include, awkward file names, the abstract and the keywords,
- **AI review** (ticked by default when a model is set up): one read of the whole document in `\input` order with numbered lines, told what the checks already found. It returns a summary, strengths, a score and confidence, the limits of the review and points marked Major, Minor or Note, each with a category and the line it is about. It never changes your files.

A group that needs the PDF or the log and has neither says Compile first rather than reporting no problems. Rows jump to their line or to their page in the PDF, and the AI review's rows also have Show in PDF. Fix with AI, on a row or for a whole group, asks the assistant for a fix that opens as changes to review, as in the Logs tab, and Dismiss hides a row. Cancel stops a review. The status line says when it last ran and whether the source has changed since, and Copy report copies the results as Markdown. The latest run is kept for each project until Spectrum quits.

### To-do list

The To-dos tab in the sidebar, beside Files and Research, holds a to-do list with a badge counting the open to-dos. It has two groups,

- Mine, your own to-dos, each with a tick box, its text, an optional link, Edit and Delete. A link points at a line of the source, which is found again by its text when lines move, at a PDF page or at a reference and
- In the source, which lists `\todo`, `\missingfigure` and `\fixme`, the notes of the fixme package (`\fxnote`, `\fxwarning`, `\fxerror` and `\fxfatal`) and `TODO`, `FIXME` and `XXX` in comments. Each one jumps to its line and is done once its mark is removed from the source.

A to-do is added in the box at the top of the tab or with Add to-do here in the editor's right-click menu, which links the line, or in the PDF's, which links the page. The tab shows Open, Done or All and Mine or Source, and the sidebar's search finds to-dos too. Each to-do is a small file in the project's `.spectrum/todos` folder, and each PDF note one in `.spectrum/notes`.

The open to-dos go with an agent's first message. A to-do an agent suggests appears in the agent workspace as a card with Add and is only saved once it is added, and Save open steps as to-dos adds the open steps of an agent's plan (Section External agents).

### Personas and skills

A persona is a set of instructions for a kind of task, picked in the assistant chat or in the agent workspace. While one is chosen it replaces your default instructions, and each chat remembers its own. Settings › Personas holds the default instructions and the personas, each with a name, a colour and its instructions, with Create, Edit, Delete and Reset to defaults. Spectrum starts with four, Research writer, Document editor, Critical reviewer and Draw a figure, and they follow you to your other computer with the shared settings. Personas go to the assistant, the Spectrum agent and local agents but never to autocomplete. A local agent gets the persona in its own system prompt where it offers one, and otherwise with the first message of each new agent session, so changing the persona starts a new session that is told the conversation so far.

Skills are instructions in the open Agent Skills format, a folder with a `SKILL.md`. An agent sees each skill's name and description and loads the rest when it needs it, or straight away when the skill is picked with `/` in the agent workspace. Spectrum ships 12 skills from K-Dense's scientific agent skills (paper lookup, literature review, citation management, peer review, scientific writing, critical thinking, hypothesis generation, venue templates, research grants, scientific slides, LaTeX posters and Mermaid diagrams), each under its own licence (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)), and three of its own for LaTeX, related work and verifying claims. Settings › Skills lists them in groups with a search, and each card shows the skill's author, licence, version, file count and what its scripts need to run. Every skill has a switch. All projects sets it for this computer, and This project lets the open project differ, saved in its `.spectrum/settings.json`. Your own skills are made with Create skill, with Add folder, which copies a folder in (regular files only), or by duplicating a built-in skill. They are edited in the skill's file browser and removed with Delete.

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

Spectrum checks writing in Australian English. Spelling is checked as you type in `.tex`, `.md` and `.txt` files, and misspelt words get a red underline. Right-clicking one offers suggestions, Add to dictionary, Add to project dictionary and Ignore. The project dictionary is kept in the project's `.spectrum` folder, so it travels with the project, while the main dictionary covers every project and can be edited in Settings under Spelling & grammar.

Spelling uses [nodehun](https://github.com/Wulf/nodehun), a binding for the Hunspell spell checker, with three dictionaries,

1. SCOWL en_AU-large, which sets the standard (colour, organise, centre, defence)
2. AussieDic, which adds Australian places, names and slang such as Parramatta, Wiradjuri and arvo and
3. SCOWL en_US, which is used only to recognise the American spellings in AussieDic, so color, organize and center are still flagged.

The grammar check runs [Harper](https://github.com/Automattic/harper) with its Australian dialect over the open file. It is started with the button beside the assistant button or with `⇧⌘;`, and its results take the place of the PDF until the panel is closed. Each issue is underlined in the editor and listed with its sentence, and it can be fixed with one click, ignored, or turned off for the project with Ignore rule. Settings has options for style suggestions, such as long sentences and wordiness, which are off by default, and for the serial comma, which is flagged by default in line with the Australian Government Style Manual.

Both checkers read only the prose of a LaTeX file. Commands, maths, comments, citation and reference keys, URLs, the preamble and code blocks are skipped, while the text of headings, captions, footnotes and `\emph`, `\textbf` and similar commands is checked.

### Checkpoints

Checkpoints are kept inside each project in a hidden `.spectrum` folder, together with the project settings, saved chats, to-dos, PDF notes and research sessions, so they travel with the project. Builds run in a temporary folder, and the SyncTeX data and the files kept from the last compile of each document are in the app's own data folder. File contents are compressed and stored once, so unchanged files cost no extra space between checkpoints. A checkpoint is saved with one click from the Save checkpoint button beside Compile or with `⇧⌘S`, and the notice that follows offers to name it. Checkpoints can also be saved and named in the Checkpoints tab of Tools. One is also saved automatically before AI changes are applied, before a restore and before a template change, so each of these can be undone. A checkpoint can be compared with the current files, restored as a whole or restored one file at a time.

Settings › Checkpoints has the following options,

- Save a checkpoint when a compile succeeds (on by default), which saves one when the source has changed since the last checkpoint. Compiles save at most one every 10 minutes, as a newer compile's checkpoint takes the place of the one saved earlier in that time, while manual, named and Before checkpoints are never replaced,
- Warn me when a checkpoint fails to save (on by default), which says when saving fails or when a file was too large (over 50 MB) or could not be read and
- Delete automatic checkpoints older than…, which removes the compile checkpoints older than the chosen age and is also in Tools › Checkpoints.

Checkpoints are stored as 1.10.4 stored its versions, so going back to 1.10.4 lists every checkpoint as a version.

### Syncing between computers

Spectrum works with sync apps such as Synology Drive on a Synology NAS, OneDrive, Dropbox or iCloud Drive, so the same projects can be used on a Mac and a Windows PC. Spectrum does not connect to the NAS or the cloud itself: the sync app keeps a normal folder the same on each computer, and Spectrum keeps the projects you choose in that folder.

To set it up, add a cloud location under Cloud locations in the Projects section of Settings on each computer. Spectrum suggests the sync folders it finds and makes a `Spectrum` folder inside the one you add, for example `SynologyDrive/Spectrum`, or uses that folder itself when a computer with 1.8.0 already shares through it. Add… takes any folder that syncs. Your other projects stay in the default folder for new projects and never leave this computer. With Synology Drive, use a classic two-way sync task on both computers rather than On-demand Sync, so every file is on each computer and works offline, and turn on versioning for the Team Folder on the NAS as a safety net. One folder should only ever be in one sync app. The sync app must also sync files and folders whose names start with a dot, as Spectrum keeps each project's details in a `.spectrum` folder. Synology Drive can skip them with a "`.`" prefix rule in a sync task. When folders with LaTeX files but no `.spectrum` folder are in a cloud location, Cloud projects says so rather than listing them.

- **Sync to.** A project's menu lists the cloud locations under Sync to, and When a project syncs in Settings chooses what that does. Keep a local copy and mirror it, the default, leaves the project in its folder on this computer and keeps a copy in the cloud location in step with it, so the project works offline and a slow sync app never holds up the editor. Move it into the cloud location moves the folder there, as 1.8.0 kept its projects, and the sync app keeps it the same on each computer. A project already in a sync app's folder, for example in Documents backed up by iCloud Drive or OneDrive, syncs as it is.
- **Cloud projects.** The sidebar lists All projects, Cloud projects, Archived and your tags. Cloud projects shows the projects that sync, each with a cloud symbol and how it stands (Synced, Syncing…, Waiting for OneDrive or Needs attention), and the projects your other computers put in a cloud location that this one does not have yet ("In OneDrive, not on this computer") with Download. Download keeps a mirrored copy on this computer, or with Move opens the project where it is.
- **How mirroring works.** Spectrum compares the two copies file by file, much as git merges branches: a file changed on one side goes across, and a file changed on both is merged line by line. When both changed the same lines, this computer's file is kept and the other text is put beside it as a conflicted copy, for example `main (OneDrive’s conflicted copy 2026-10-18 104233).tex`. Before a sync replaces or deletes files on this computer, Spectrum saves a checkpoint named "Before sync from" and the other computer's name, or the cloud location's name when several computers share the project. When the files only came from the other computer, it saves one at most every 10 minutes. Deletions only go across from a complete view of both copies, and a sync that would delete many files at once stops with Needs attention until you choose Sync anyway. Projects sync every minute, two seconds after a change made in Spectrum and with Sync now.
- **Stop syncing.** Stop syncing… keeps the project on this computer, and either keeps the copy in the cloud location for your other computers or deletes it there. Delete is refused, with the reason, while the two copies are not yet in step or another computer has the project open, works on the cloud copy itself or runs 1.8.0. A moved project is first copied back to the default folder for new projects. Move to Bin on a moved project is refused for the same reasons, as it deletes the project on the other computers too.
- **Project folders.** Projects can be sorted into folders under All projects, and folders can hold folders. A folder's menu has New folder…, Rename… and Delete…, and a project goes into a folder when it is dragged there or with Move to folder…. Deleting a folder moves what was in it up a level. Folders only arrange the list, so the projects stay where they are on disk, and the arrangement follows you to your other computers with your settings.
- **Changes from the other computer.** A file changed on the other computer is reloaded in the editor when it has no unsaved edits here. If it does, Spectrum asks whether to keep this computer's text or use the other computer's, and offers to compare them. The text that is not used is kept in a checkpoint, so nothing is lost. A file deleted on the other computer is marked in its tab rather than brought back by a save.
- **Open on both computers.** A banner says when the project is also open on the other computer, for example "Also open on DESKTOP-AB12CD since 10:42". The conflicted copies a sync app or the mirror makes when both computers changed a file are marked in the file list, with Compare, Use this copy and Delete copy.
- **What else follows.** Checkpoints, chats, to-dos, PDF notes and research sessions travel with each cloud project, and checkpoints made on either computer appear on both. A mirrored project's compile settings are not mirrored yet, so they stay on each computer. Your own templates and the built-in ones you edited follow too, and so do settings such as the theme, the editor, the shortcuts and your project folders, which can be turned off in Settings. API keys, model choices and folder paths stay on each computer, so no key is ever stored on the NAS.
- **Compiling.** A compile writes only the PDF into the project. SyncTeX data, the kept `.aux` files and the thumbnail are kept on each computer, so the other computer needs one compile of its own before double-click jumping works there.

## Requirements

- macOS 13.5 or later on Apple silicon or Intel (the Liquid Glass app icon needs macOS 26 or later), or Windows 10 or 11 on an x64 PC (Section Windows),
- a LaTeX distribution, either [MacTeX](https://www.tug.org/mactex/) or [Tectonic](https://tectonic-typesetting.github.io/) (`brew install tectonic`) on macOS, or [MiKTeX](https://miktex.org), [TeX Live](https://www.tug.org/texlive/) or Tectonic on Windows,
- an API key from one of the providers in Section Models, or any OpenAI-compatible server, for the AI features,
- Python 3 with matplotlib for the table to chart tool and with `ddgs` for DDGS web search (both optional) and
- an account with one of the PDF parsers in Section Template transfer, for converting a paper from its PDF (optional).

## Installing

Download the macOS 1.10.4 installer and its SHA-256 checksum from the [latest GitHub release](https://github.com/Beyond3345/Spectrum/releases/latest). The Windows 1.10.4 installer will be added to the same release later; Windows users can use [version 1.10.0](https://github.com/Beyond3345/Spectrum/releases/tag/v1.10.0) meanwhile.

1. Open `Spectrum_1.10.4_universal.dmg`
2. Drag Spectrum into the Applications folder
3. Open Spectrum from the Applications folder

Since the application is signed ad hoc rather than with an Apple Developer ID, macOS blocks it on the first launch when the DMG has been downloaded from the internet. To allow it, open System Settings, go to Privacy & Security and select Open Anyway. Alternatively, run the following command once,

```bash
xattr -dr com.apple.quarantine /Applications/Spectrum.app
```

On Windows, run `Spectrum_1.10.0_x64-setup.exe`. It installs Spectrum for the current user without administrator rights and adds it to the Start menu, and it installs Microsoft Edge WebView2 when the PC does not have it yet. Since the installer is not signed, Windows SmartScreen may warn about it on the first run. To continue, select More info and then Run anyway.

## Windows

The Windows version is a preview. Version 1.10.0 was built and tested on a Windows x64 PC, including the packaged backend and native agent isolation. An installed GUI walkthrough has not been performed; see the [Windows delivery report](docs/WINDOWS_DELIVERY_REPORT.md). It differs from the macOS version as follows,

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

Find (`⌘F`), undo (`⌘Z`), redo (`⇧⌘Z`) and Settings (`⌘,`) cannot be changed. While the PDF has the focus, `⌘F` finds text in it, `⌘9` fits the whole page and Page Up, Page Down, Home and End move through its pages.

## Building from source

Building requires Node.js 20.12 or later, Rust with the `aarch64-apple-darwin` and `x86_64-apple-darwin` targets and Xcode.

1. Run `npm install`
2. Run `npm test` to run the backend tests
3. Run `npm run desktop:build` to build the universal application and the DMG

The test that moves a project to the Bin is skipped by default, since it moves a real folder into the macOS Bin. Set `SPECTRUM_TEST_BIN=1` to include it.

The spell checker and the grammar checker are compiled code that is kept in `native/`, so a normal build does not need to rebuild them. To rebuild them after changing their sources, run `npm run native:build`. This needs Xcode and Python for nodehun, and Rust with the `wasm32-unknown-unknown` target and `wasm-pack` for Harper, which is built from a Harper checkout at `../harper-master` unless `HARPER_DIR` points elsewhere.

The build script downloads Node.js 24 LTS for both architectures, checks it against the published SHA-256 sums and joins the two into one universal binary. It then bundles the backend with esbuild and runs `tauri build --target universal-apple-darwin`. The results are written to `src-tauri/target/universal-apple-darwin/release/bundle/`.

The Windows installer is built on Windows with the same command. It needs Node.js, Rust with the MSVC toolchain and the Visual Studio Build Tools with C++ and Python for nodehun, which is built for Windows with `node scripts/native.mjs nodehun`. The build script downloads the Windows Node.js 24 LTS, checks it in the same way and runs `tauri build --target x86_64-pc-windows-msvc`, which writes an NSIS installer. The workflow in `.github/workflows/windows.yml` does all of this on GitHub Actions, runs the backend tests with MiKTeX and attaches the installer to a release when it is run with a release tag. The Fluent icons in `apps/frontend/public/fluent/` are written by `node scripts/fluent-icons.mjs`.

For development there are two options. `npm run desktop:dev` runs the macOS shell against the backend in the repository, and `npm run dev` runs the interface in a browser at `http://localhost:5173` with the backend on port 8787.

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

## External agents (local preview)

The **Agent** button in the top bar opens the agent workspace in the PDF's place, with PDF in its header to go back. It has two tabs. **Spectrum agent** is the built-in agent (Edit in the assistant before 2.0): it reads the project through the main model and proposes changes. Its threads are saved with the project's chats, marked as agent threads, so the workspace lists them and the assistant does not, and an Edit chat from before 2.0 has Continue there to carry it on in the workspace. **Local agents** runs an installed ACP agent, chosen from the row of agents above the message box. An agent that is not set up yet is set up in Settings › Agents, which holds its program, API key, launcher arguments and runtime folders and can also copy supported login and configuration files into the agent's private state.

The header holds the session history, the Isolated or Direct badge, the agent's model and mode options, the persona picker and Stop. A new conversation opens on What would you like to do today?, with task buttons for a literature sweep, related work, a citation audit, a manuscript review and verifying claims. Each fills in a prepared prompt with its skill, and Manuscript review also picks the Critical reviewer persona. The transcript shows the messages, the agent's thinking folded away, a card for each tool call that updates as it runs (with its output, its terminal or a side-by-side diff), questions and permission requests in line and a Restore row for each Before AI changes checkpoint. The agent's plan stays at the top, and Save open steps as to-dos adds its open steps to the to-do list. Chips below the message box choose what goes with a message: the open file, the selection, the compile log and the open to-dos, which go with the first message unless taken off. Typing `/` lists the agent's commands and the project's skills, and a skill chosen there goes with the message in whole.

Changes wait in a tray above the message box, such as "3 files, +12 −4", which opens a review in the pane. It has each file's diff with Apply and Reject, Apply all, Reject all and Preview PDF, which compiles a local agent's copy where it cannot read outside that copy. An isolated agent keeps working on its copy while changes wait, so you can go on prompting and apply or reject each file whenever you like. An applied file becomes the agent's new starting point, and a rejected one is put back to your version in the agent's copy, which the agent is told with its next task. Closing the workspace does not stop a task: a dot on the Agent button shows a task running, waiting for an answer or with changes to review. Keys, working copies, session mappings and transcripts stay on this computer.

On macOS a local agent also gets Spectrum's tools, a small server it starts inside its isolation, with `compile`, `get_log`, `project_map`, `bib_entries`, `bib_search`, `literature_search`, `fetch_bibtex`, `list_todos`, `suggest_todo` and `load_skill`. The to-dos it suggests appear as cards with Add when its task ends. Local agents on Windows get no Spectrum tools yet, as Settings › Agents says, and the task buttons work without them.

The launcher profiles cover OpenCode, Codex, Claude Agent, Qoder, Cursor, Kimi Code, Hermes, Pi, DeepSeek Harness and ZCode. Some need a separately installed ACP adapter; each profile links its setup guide. Pi and ZCode use community adapters, and DeepSeek’s source and published versions can differ. An available launcher does not certify every installed release or login method. WorkBuddy is listed as planned: it will use official interfaces in the later remote integration, without private desktop gateways.

**Isolated** is the default. On macOS, the agent and its commands run under a native Seatbelt policy, in a separate project copy and private agent home. The live project is excluded. Apply or reject the resulting text, new, deleted and binary files; overlapping edits are refused. Application journals preserve recovery copies if an operation is interrupted. **Direct** permits immediate project edits and saves recovery copies before each task.

On macOS the isolated process can use public HTTPS and DNS. It cannot call arbitrary local HTTP services or Unix sockets. OpenCode receives one private loopback port for its internal server. Windows uses a less-privileged AppContainer (LPAC), explicit file grants, and a job that contains descendants. It grants public Internet client access, without private-network access or a loopback exemption. Local model endpoints, host browser automation and host MCP servers are unavailable unless a future integration explicitly brokers them. Runtime folders grant read access to installed agent libraries; choose specific folders rather than personal data directories.

The default grants exclude unrelated home files. Some CLI installations need their runtime folder added in Advanced setup, and some authentication methods require an API key or separate sandbox login. Claude subscription reuse is not assumed. The preview requires macOS `sandbox-exec` or the bundled Windows isolation worker and fails closed when either is unavailable. Projects containing symlinks/hardlinks, files above 50 MB, or more than 500 MB/10,000 files are refused rather than copied incompletely. Windows launchers must be native `.exe` programs; script adapters need an explicit interpreter and script arguments. OpenCode 1.19.3 and the Codex, Claude Agent, Pi and ZCode adapters remain unavailable on Windows while runtime compatibility is unresolved. They remain integration targets; global Claude configuration is unchanged. See [Windows validation](docs/WINDOWS_AGENT_VALIDATION.md) for the tested boundary and current limitations.

The existing Assistant, References, autocomplete and image-to-LaTeX continue to use model APIs. `npm run test:agents` exercises native containment, an ACP fixture lifecycle, review/recovery and an installed OpenCode handshake, without inference calls. The [integration plan](docs/AGENT_INTEGRATION_PLAN.md) records the remaining rollout work.

## Repository layout

- `apps/backend` is the Fastify server that manages projects, compiling, the AI tools, references and checkpoints,
- `apps/frontend` is the React interface,
- `src-tauri` is the macOS application shell, which starts the bundled backend and opens the interface,
- `templates` holds the bundled LaTeX templates and
- `native` holds the spell checker (nodehun, with its source) and the grammar checker (Harper) as built for the application,
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

Spectrum is based on OpenPrism by OpenDCAI. Many ideas in Spectrum's later versions, such as the agent workspace, the preflight checks, Zotero and source control, were inspired by [Oleafly](https://github.com/Oleafly/Oleafly) by Prajwal Murthy and contributors, and the circuit drawing in the diagram composer by [CircuiTikZ-Designer](https://github.com/Circuit2TikZ/CircuiTikZ-Designer). Thank you to both teams for building them in the open. Oleafly is released under the GNU Affero General Public License and CircuiTikZ-Designer under the GNU General Public License, so Spectrum learns from their designs but contains none of their code. Spectrum uses CodeMirror, PDF.js, Fastify, LangGraph and Tauri, checks spelling with nodehun, Hunspell, SCOWL and AussieDic and grammar with Harper, and bundles the JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro fonts. The editor themes reuse the colours of the themes they are named after. Their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The interface icons are drawn from Apple's SF Symbols, which are licensed for use in applications on Apple platforms.

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE).
