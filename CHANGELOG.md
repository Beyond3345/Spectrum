# Changelog

This file records the changes in Spectrum. Version 1.0.0 is the first release of the fork, so its entries are given relative to the last state of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) in February 2026.

## 1.4.0 (12 October 2026)

### Added

- A view switcher at the top right of the window, as in Texifier, that shows the editor only, the editor and the PDF side by side, or the PDF only, also with `⌘1`, `⌘2` and `⌘3`. The choice is kept, and the split width comes back with the split. The hidden side stays loaded, so undo, the scroll position, autosave and the PDF carry on
- In editor only, the compile status shows in the editor's bar
- Double-clicking the PDF jumps to the line of the source that made it, opening another file when needed, and double-clicking a line of the source scrolls the PDF to it. Every compile now writes SyncTeX data for this, with pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk and Tectonic, and Spectrum reads it itself. In PDF only, a double-click switches to the split so the source shows. Without SyncTeX data, a double-click on the PDF falls back to matching the text
- The spot a jump lands on is marked with a highlight that fades after a few seconds. Its colour (yellow by default, or the accent, green, pink, blue or any colour) and how long it stays (1 to 10 seconds) are set in Settings under Editor, where double-click jumping can also be turned off

### Changed

- A single click on the PDF no longer jumps to the source; a double-click does
- The review sheet for AI changes and the version comparison show only the changed parts, with three lines around each and the unchanged stretches folded into rows that open in place (Show whole file shows everything). An edited line sits beside its replacement and only the words that changed are marked, and both sides scroll and wrap together, so long files no longer slow the sheet down

- Opening Tools, Grammar, the assistant or a chat, or anything that needs the cursor, from a single view switches back to the editor and PDF side by side. In PDF only, clicking the page doesn't jump to the source, so reading isn't interrupted
- In a narrow PDF column, the labels of Save version and the zoom menu fold away earlier to make room for the switcher

## 1.3.1 (12 October 2026)

### Added

- Typing `$` with text selected puts the text in maths (`$…$`) and keeps it selected, in the same way as `(` brackets a selection. With nothing selected, `$` is typed as before

## 1.3.0 (12 October 2026)

### Added

- Completion that follows where the cursor is. In maths (`$…$`, `\(…\)`, `\[…\]` and the `equation`, `align` and `gather` families) it lists maths commands such as `\vec`, `\lambda`, `\frac`, `\sum` and `\mathbb` with their symbols, and `\label` and `\tag` only in displays that take them. In text it lists text commands, with the preamble's own commands only before `\begin{document}`. Commands from packages appear once the package is loaded, and the project's own `\newcommand` and `\DeclareMathOperator` commands are included
- Inside braces, completion lists the project's labels after `\ref{` and its kin, BibTeX keys with author and year after `\cite{` and its kin, packages, classes and bibliography styles, and the project's images and `.tex` and `.bib` files after `\includegraphics{`, `\input{`, `\include{` and `\bibliography{`
- Commands with arguments insert with fields, and `Tab` moves to the next one
- A Floats tab in Tools with Insert figure and Insert table. Insert figure saves a dropped, pasted or chosen image in `images/` and inserts it as a figure with a caption, a label, a width and a placement; an image dropped on the editor opens it too. Insert table builds a `tabular` or `tabularx` from a grid that takes pasted spreadsheet cells, with booktabs, grid or minimal lines and a live preview. The packages they need are added to the preamble when missing
- Placement letters that combine (`h`, `t`, `b`, `p` and `!`), or `H` on its own as the default, each explained in the tab, and a Span both columns option for `figure*` and `table*`

### Changed

- The Figures tab in Tools is now Floats: Insert figure, Insert table, Project figures, Table to chart and Image to LaTeX. Inserting a project figure goes through Insert figure, so its options apply
- Environments are listed once `\beg` is typed, so `\ve` no longer offers `\begin{verse}`, and `\begin{` in maths offers only the environments that work there. `\end{` offers the open environments
- A command name only matches commands that contain it, and three letters that match none list the environments they start, so `\ali` offers `\begin{align}`
- The `/` shortcut for commands works in text only, since `/` divides in maths
- Uploads into a folder keep the folder

## 1.2.1 (12 October 2026)

### Fixed

- The app icon at the top of the sidebar sat almost against the window buttons. It now keeps 16 points from them, the same distance it keeps from the edge of the window in full screen

## 1.2.0 (12 October 2026)

### Added

- `\begin{` completion lists every common environment, including `equation*`, the `align` and `gather` families, the matrices, `figure*`, `table*`, `tabular` and `minipage`, followed by the environments of the packages and classes the project loads and the ones it defines itself with `\newtheorem`, `\declaretheorem`, `\newtcolorbox`, `\newenvironment` and similar commands. Each entry says where it comes from and inserts its usual arguments, such as `{lcc}` for `tabular` and `{2}` for `alignat`. The project is read from the main file through `\input`, `\include`, `\subfile` and `\import` and its own `.sty` and `.cls` files, in the same way as the compiler finds them
- Editor themes, chosen separately for light and dark mode, so any light theme goes with any dark one: Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula and Alucard, Monokai, Rosé Pine, Ayu and Texifier-like and Overleaf-like themes, each with a preview in Settings. Any colour of a theme can be changed for each mode and reset afterwards
- A choice of editor font, from the Mac's own fonts (SF Mono, Menlo, Monaco, PT Mono, Andale Mono and Courier New), four bundled open-source fonts (JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro) or any installed font by name
- Accent colours in Settings under Appearance: Follow macOS, Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite or a custom colour
- A see-through window, with Liquid Glass on macOS 26 and later and the system blur before that, and a Clarity slider that sets how much of the desktop shows through. The editor and the PDF always stay readable
- A page colour for the PDF in each mode: White, Cream, Sepia or Grey in light mode and Dark, Black, Dimmed or White in dark mode, set in Settings or from the PDF's More menu
- Six more PDF parsers for template transfer besides MinerU: Mathpix, Mistral OCR, Datalab (Marker), LlamaParse, PaddleOCR-VL and Docling, plus Other for a self-hosted or compatible server. Each has its own address and key, and a key is only ever sent to the address it was entered for
- A Save version button beside Compile, also on `⇧⌘S`, which saves a version at once and offers Rename in the notice that follows. Versions are still saved automatically before AI changes are applied

### Changed

- Highlighting colours environment names and the keys and paths of labels, references, citations, files and packages
- The sidebar icon, the header and the editor tabs move with the window when it goes in or out of full screen, instead of jumping once macOS has finished
- The files a PDF parser reads and writes during a template transfer are kept in the new project's hidden `.spectrum` folder instead of in visible folders
- The `.env` MinerU token is only sent to the MinerU address in the `.env` file or to MinerU's own address

### Fixed

- `\%` was coloured as the start of a comment and `\$` started maths in the highlighting
- The `/` shortcut for commands listed nothing
- The label of the "Insert `\cite`" option in Settings put each part on its own line

## 1.1.3 (12 October 2026)

### Changed

- With the completion list open, `Tab` fills in as much as the listed entries share, so `\beg` becomes `\begin{` and the environments stay listed. When there is nothing more to fill in, `Tab` picks the highlighted entry, as Return does. Before, `Tab` added spaces and closed the list
- The environment list stays open after `\begin{`, so the name can be typed or picked from it, and picking one replaces a `}` already after the cursor instead of leaving it behind

### Fixed

- After leaving full screen, the app icon stayed in the top left corner, on top of the window buttons, until the app was restarted. The window now waits until macOS has finished leaving full screen before moving it back

## 1.1.2 (12 October 2026)

### Changed

- In full screen, where macOS hides the window buttons, the app icon moves to the top left corner, and with the sidebar hidden the header and editor tabs move left too, instead of leaving room for buttons that aren't there

## 1.1.1 (12 October 2026)

### Changed

- `Tab` indents at the cursor by four spaces, as other LaTeX editors do, and indents the selected lines when there is a selection. Indents are four spaces instead of two
- The rows of a wrapped line start under the line's own indent, four columns in, instead of at the left edge
- Long formulas break between terms, after `=`, `+`, `&` and commas and before `\cdot`, `\approx` and similar, instead of in the middle of a command such as `\vec{b}`
- Pressing Return straight after `\begin{…}` adds the matching `\end{…}` at the same indent, with the cursor on an indented line between them, unless the environment is already closed

### Fixed

- The `\begin{…}` completions and the Insert menu snippets put `\end{…}` at the start of the line instead of under `\begin{…}` when used on an indented line

## 1.1.0 (11 October 2026)

### Added

- Spell checking as you type in Australian English, using nodehun (Hunspell) with SCOWL en_AU-large and the Australian words from AussieDic. American spellings are still flagged, and offensive words are never suggested. Right-clicking a misspelt word offers suggestions, Add to dictionary, Add to project dictionary and Ignore
- A grammar check in Australian English, using Harper. The button beside the assistant button, or `⇧⌘;`, shows its results in place of the PDF, where each issue can be fixed with one click, ignored or turned off for the project
- A Spelling & grammar section in Settings, with switches for spell checking and style suggestions, the serial comma setting (flagged by default, following the Australian Government Style Manual) and the personal dictionary
- One LaTeX reader for both checkers, so commands, maths, comments, keys and code are skipped while the prose in headings, captions and footnotes is checked
- THIRD_PARTY_NOTICES.md, listing the licences of everything Spectrum includes

### Changed

- A full stop or comma at the end of a wrapped line now hangs past the edge instead of moving to a line of its own

### Security

- The application is allowed to load libraries that are not signed by Apple or a developer team, which the spell checker's add-on needs

## 1.0.1 (11 October 2026)

### Added

- Pinch to zoom the PDF on a trackpad, and `⌘` with the scroll wheel on a mouse. The point under the fingers stays in place, and the pages are drawn sharp again once the pinch ends
- Keyboard shortcuts to zoom the PDF in and out (`⌘=` and `⌘−`) and to fit it to the width (`⌘0`), which can be changed in Settings
- Dark pages in dark mode, so the PDF matches the rest of the window. They can be turned off from the PDF's More menu

### Changed

- The PDF zoom is kept between launches, Fit width is the default and Zoom to fit is now called Fit page
- The pages sit closer to the edges of the PDF column, so Fit width shows them larger
- The zoom buttons step by a tenth of the current size, the same way a pinch scales
- The editor's lines are closer together

## 1.0.0 (11 October 2026)

### Added

- A native macOS application built with Tauri. It is a universal binary for Apple silicon and Intel, includes its own Node.js runtime and is distributed as a DMG
- Projects stored as ordinary folders chosen by the user, with `~/Documents/Spectrum` as the default location. Existing LaTeX folders can be opened in place, and moved folders can be located again
- A hidden `.spectrum` folder in each project for its settings, version history, saved chats and build files, which keeps the project folder itself clean
- Version history with manual versions, optional labels, comparison with the current files and restoring of the whole project or a single file. A version is saved automatically before AI changes are applied, before a restore and before a template change
- A references chat that turns a DOI, link, arXiv ID or title into a BibTeX entry with an AuthorYear key (for example `Vaswani2017`) and adds it to the project's `.bib` file. Clashing keys get a letter suffix and duplicates are detected by DOI, arXiv ID and title
- An assistant chat over the editor with Ask and Edit modes, quick actions on the selection, image to LaTeX attachments and a reasoning effort setting. Chats are saved per project
- A Tools panel with project information (word counts from `texcount`, or an estimate when it is not installed), versions, compile logs with Fix with AI, research, AI review and figure tools
- Provider presets for OpenAI, Anthropic Claude, Google Gemini, OpenRouter, DeepSeek, Moonshot Kimi, Z.ai GLM, Alibaba Qwen and Meta Muse Spark. Choosing one fills in the endpoint, a recommended main, quick and vision model and the recommended reasoning effort, and each provider's key is kept when switching
- Reasoning effort from Off to Max, limited to the levels the chosen model accepts and sent in the form each provider expects. Claude is called through Anthropic's Messages API and OpenAI through the Responses API, so the effort also applies when the assistant edits files
- Separate provider, model and key settings for the quick model, used for autocomplete and for splitting pasted references, and for the vision model. Both use the main model's provider by default and can be moved to any other provider. The quick model replaces the references model setting
- Customisable keyboard shortcuts in Settings, including indent and unindent lines, move and duplicate lines, delete lines, multiple cursors, go to line, folding and bold, italic and emphasis. Clashing shortcuts are marked and shortcuts that macOS keeps are refused
- Light, dark and system themes, and a setting for the default compiler
- An Auto compile setting that reads the `% !TEX program` comment and the packages in use, and support for Tectonic as a compiler
- PDF thumbnails, list and grid views, tags and archiving on the projects page
- A System section in Settings that checks which TeX tools, biber and Python are installed and whether they actually run
- Search providers for the web search tool (OpenAlex, Semantic Scholar, SerpAPI with Google, Google Scholar or Baidu, Tavily and Brave), alongside the model's own search
- A citation assistant that finds papers supporting the selected passage
- A Quick switch template change that keeps the document body without using AI
- Backend tests for projects, versions, chats, compiling, references and the local-only access rule

### Changed

- The interface has been redesigned around a sidebar, a rounded content panel and a floating chat, with SF Symbols icons and SF fonts
- The interface is in Australian English only
- The tool agent calls the OpenAI-compatible API directly instead of going through LangChain, and requests are retried without `temperature` or `reasoning_effort` when a model rejects them
- The compiled PDF is written next to the main file, while auxiliary files stay in the hidden build folder
- All dependencies have been updated (Fastify 5, Vite 8, PDF.js 6, React Router 7, LangGraph 1 and others)
- Compile runs have time limits, with longer limits for Tectonic's first-use downloads and for Latexmk
- The default model is now GPT-6 Sol, and temperature is left at each provider's default for the presets
- The tool agent sends each reply back to the model in full, which DeepSeek, Kimi and Gemini need for reasoning between tool calls
- Saving a file replaces it in one step, so a crash during a save cannot leave half a file
- Quitting or closing the window saves open edits first and stops any running compiler
- The window background follows the theme, so it no longer flashes white in dark mode
- Start conversion only warns when no key is set in Settings, since the key can also come from the `.env` file

### Fixed

- Deleting the file that was open in the editor crashed the editor
- `⌘/` did not toggle LaTeX comments
- AI autocomplete never detected the current environment
- Compiling used the last autosaved content instead of what was on screen, and downloaded every binary file in the project on each compile
- Bibliographies using biblatex never compiled, because biber was told to look for its control file in the project folder instead of the build folder
- A main file inside a subfolder could not find the files it included with pdfLaTeX, XeLaTeX, LuaLaTeX or Latexmk. Compiling now starts from the main file's folder, as TeXShop, LaTeX Workshop and Tectonic do, and paths written relative to the project root still work
- Template conversion and transfer to the ACL template failed, and the arXiv template was missing from the gallery
- Importing from arXiv failed for single-file papers and gave an unclear error for papers without LaTeX source
- The layout check in template transfer never received the page images, so those jobs never finished
- Requests over 1 MB, such as large files and layout check images, were rejected
- The web search summary was inserted after `\end{document}`, and the table to chart tool replaced the selected table
- `npm start` did not exist and the documented `.env` file was never read
- Menus and drop-downs did not close when clicking elsewhere
- The outline lost headings with nested braces, such as `\section{Bib\TeX{} Files}`
- Cancelling an arXiv import still downloaded the paper and added the project
- Quick switch could overwrite the project's `.bib` file and wrote the merged document to a new `main.tex`
- Opening a folder that holds or sits inside another project, or the projects folder itself, was allowed
- A project without a `.tex` file opened its first file even when it was very large
- New files and new `.bib` files could replace an existing file whose name differed only in case
- Some text in dark mode did not have enough contrast
- The layout check in template transfer sent page images to the main model even when it reads text only, and a failed check deleted the converted project. It now uses the vision model and is skipped if the model cannot look at the pages

### Removed

- Real-time collaboration, invite links and public tunnels
- The Chinese interface and the language switch
- The landing page, the soft-delete Trash view and the unused bulk selection
- The unused SwiftLaTeX WebAssembly engine

### Security

- Updated dependencies, which reduced the reported advisories from 43 (4 critical) to none, including path traversal through crafted tar archives and code execution through crafted PDFs
- The server only accepts requests from the same computer and refuses requests from other websites and DNS rebinding. Upstream allowed any website to call the API and treated every visitor through a tunnel as local
- Project and template identifiers are validated so they cannot reach files outside their folders
