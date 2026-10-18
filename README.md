<p align="center"><img src="apps/frontend/public/app-icon.png" width="128" alt="Spectrum icon"></p>

# Spectrum

This project is an application for macOS and Windows for writing LaTeX documents with an AI assistant, a references assistant and local version history built in. It is intended for students and researchers who want to keep their papers as ordinary folders on their own Mac while still having help with drafting, citations and compile errors.

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
| Maths notes | lecture notes or assignments with theorems, worked examples and their solutions, matrices and figures | `amsmath`, `amsthm`, `mathtools`, `tikz`, `pgfplots` |
| Electronics notes | notes or lab reports with circuits, quantities with units and Bode plots | `circuitikz`, `siunitx`, `pgfplots` |
| Coding report | programming assignments with highlighted code and pseudocode | `listings`, `algorithm`, `algpseudocode`, `booktabs` |
| Report or thesis | a long document with a title page, abstract, contents, chapters and an author-year bibliography | `report` class, `natbib`, `cleveref`, `setspace` |
| Formal letter | a letter in Australian block layout | `babel` with Australian English |
| Slides | a 16:9 Beamer presentation with maths, a chart and code | `beamer` (Madrid), `listings`, `pgfplots` |
| Academic CV | a one-page CV with links for email, ORCID and a website | `titlesec`, `enumitem`, `xcolor` |

Every package these templates load has a short comment beside it saying what it does, so a preamble can be read and changed without looking each package up. All of them load `hyperref` for links and `parskip` for a blank line between paragraphs, except the slides, where Beamer handles both itself. They are A4 apart from the slides, use Australian English, need no shell escape and compile with pdfLaTeX, XeLaTeX, LuaLaTeX and Tectonic. The conference templates also have a comment on each package, but nothing else in them changed, since those venues do not allow changes to their layout.

Each template in the gallery has a menu. Edit template opens a working copy of it in the editor, where it can be changed and compiled like any project, with a bar above the editor holding three buttons,

- Save template replaces the template's files with the copy's, leaving out compiled PDFs and the app's own files,
- Save as new template asks for a name, a section and a one-line description, and keeps the original as it was and
- Done closes the copy, and asks first if it has changes that were not saved to the template.

The copy is kept until Done, so Continue editing in the menu picks up where it was left. Any project can also become a template with Save as template in its menu, on the projects page or in the editor. Templates of your own are marked Yours and can be deleted. An edited built-in template is marked Edited and keeps your version when Spectrum is updated, and Restore original puts back the one that came with Spectrum. The built-in templates you have not edited follow each update. Projects already made from a template do not change when the template does.

### Editor

The editor is divided into three columns, the file tree and saved chats on the left, the LaTeX source in the middle and the compiled PDF on the right. The switcher at the top right of the window, or `⌘1`, `⌘2` and `⌘3`, shows the source only, the source and the PDF side by side, or the PDF only.

- The source editor has LaTeX highlighting, folding, an outline of the main file, snippets for common environments, AI autocomplete (`⌥/`, accepted with `Tab`) and spell checking in Australian English. Typing `\` (or `/` at the start of a word in text) lists the commands that work where the cursor is. In maths, inside `$…$`, `\[…\]` or an `equation` or `align` environment, it lists maths commands such as `\vec`, `\lambda` and `\frac` with their symbols, and in text it lists text commands, together with the project's own commands from `\newcommand` and `\DeclareMathOperator`. Commands with arguments go in with fields that `Tab` moves through, so `\frac` then `Tab` goes from the numerator to the denominator. Inside braces it lists the project's labels after `\ref{`, its BibTeX keys after `\cite{`, packages after `\usepackage{` and the project's images and files after `\includegraphics{` and `\input{`. Environments are listed once `\beg` is typed, where `Tab` fills in as much as the entries share, so `\beg` becomes `\begin{` with the environments still listed, and `Tab` or Return then picks one. After `\begin{` the list holds the common environments, such as `equation*`, `align*` and `gather` (only those that work in maths when the cursor is in maths), the environments of the packages and classes the project loads and the ones it defines itself, each marked with where it comes from. Typing `$` with text selected puts the text in maths, in the same way as `(` brackets it. Otherwise `Tab` indents at the cursor by four spaces, pressing Return after `\begin{…}` adds the matching `\end{…}` at the same indent, and long lines wrap under their own indent, with formulas breaking between terms,
- the PDF preview fits the page to the width of its column by default, zooms with a trackpad pinch, `⌘` and the scroll wheel or `⌘=` and `⌘−`, shows the pages in a colour chosen for each mode (White, Cream, Sepia or Grey in light mode and Dark, Black, Dimmed or White in dark mode), and supports a two-page view and sticky notes. Links in the PDF work as in a PDF viewer: the contents, `\ref`, `\eqref` and `\cite` jump to the spot they point to, a web address opens in the browser and a reference into a linked document opens that document's PDF at the place it names. Double-clicking the PDF jumps to the line of the source that made it, and double-clicking a line of the source scrolls the PDF to it, using the SyncTeX data every compile writes. The spot is marked with a highlight that fades after a few seconds, whose colour and length are set in Settings under Editor,
- the compiler can be pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or Tectonic, and the Auto setting picks one from the `% !TEX program` comment and the packages the document uses. While a compile runs, Compile becomes Stop, which ends it at once and keeps the last PDF, and
- the Tools panel holds the project information (word counts from `texcount`), version history, compile logs, research tools, AI review and the Floats tools (Section Floats).

A project can hold more than one document, such as a set of lecture notes and the tutorial solutions that refer to them. Compile and `⌘↩` compile the main file, which is chosen with Set as main file in a file's menu. The menu beside Compile lists the other documents, and choosing one compiles it once without changing the main file, as does `⇧⌘↩` for the open document. The page bar at the bottom of the PDF names the PDF that is showing and switches between the PDFs of the documents. Documents can refer to the labels of another with `xr-hyper`, for example `\externaldocument[notes:]{notes}` and `\eqref{notes:eq:ohm}`. Spectrum keeps the `.aux` files of every document for this, compiles a linked document first when it has not been compiled or has changed since, and completes `\ref{notes:` with the labels of the linked document.

The assistant chat is opened with `⌘L` and has two modes. Assistant mode answers questions about the open file, the selection and the compile log, or proposes edits. Proposed edits are shown as a side-by-side diff of the changed parts, with the changed words marked and the unchanged stretches folded away, and they can be accepted or rejected file by file. References mode adds citations to the project's `.bib` file (Section References).

### Appearance

Settings has the following options under Appearance and Editor,

- the theme (System, Light or Dark) and an accent colour, which can follow macOS or be Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite or any other colour,
- a see-through window, which uses Liquid Glass on macOS 26 and later and the system blur on older versions, with a Clarity slider that sets how much of the desktop shows through while the editor and the PDF stay readable,
- the PDF page colour for light mode and for dark mode,
- the editor font, which can be one of the Mac's own fonts, one of four bundled open-source fonts (JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro) or any installed font by name, and the font size and
- an editor theme for light mode and another for dark mode, chosen from Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, Monokai, Rosé Pine, Ayu and Texifier-like and Overleaf-like themes. Any light theme can be paired with any dark one, and each colour of a theme can be changed for its mode.

### Floats

The Floats tab in Tools inserts figures and tables at the cursor.

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

### References

A DOI, a link, an arXiv ID or a paper title can be pasted into the references chat, and the matching BibTeX entry is written to `references.bib`. The look-up is done in the following order,

1. a DOI is resolved through doi.org content negotiation, which covers both Crossref and DataCite DOIs, with the Crossref API as a fallback
2. an arXiv ID uses the arXiv API, and the published DOI is used instead when the paper has one
3. any other link is read for the citation metadata that publishers embed in their pages
4. a title is searched on Crossref, and if no single result clearly matches, the closest candidates are shown to choose from

The citation key is the first author's surname followed by the year, for example `Vaswani2017`. Accents are removed and name particles are joined, so "van der Waals" becomes `VanderWaals`. When the key already exists for a different paper, a letter is added (`Smith2020a`, `Smith2020b`). A paper whose DOI or arXiv ID is already in the project is reported as a duplicate and is not added again.

### Web search

The Research tab in Tools finds sources for a question and writes their BibTeX into the project. It splits the question into two to four searches, runs them at once, merges the repeats (by DOI, arXiv ID, title or address) and shows each result with its authors, year and venue. Entries are built from the provider's metadata as `@article`, `@inproceedings`, `@book` and so on, in the same way as the references chat builds them. A result that is a DOI or arXiv link is looked up for its full metadata, and a page that is neither becomes `@misc` with its address and the day it was found. The provider is chosen in Settings under Search, and each provider's key is kept when switching between them.

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

### Version history

Versions are kept inside each project in a hidden `.spectrum` folder, together with the project settings and saved chats, so they travel with the project. Builds run in a temporary folder, and the SyncTeX data and `.aux` files kept from the last compile of each document are in the app's own data folder. File contents are compressed and stored once, so unchanged files cost no extra space between versions. A version is saved with one click from the Save version button beside Compile or with `⇧⌘S`, and the notice that follows offers to name it. Versions can also be saved and named from the Versions tab. One is also saved automatically before AI changes are applied, before a restore and before a template change, so each of these can be undone. A version can be compared with the current files, restored as a whole or restored one file at a time.

### Syncing between computers

Spectrum works with sync apps such as Synology Drive on a Synology NAS, OneDrive, Dropbox or iCloud Drive, so the same projects can be used on a Mac and a Windows PC. Spectrum does not connect to the NAS or the cloud itself: the sync app keeps a normal folder the same on each computer, and Spectrum keeps the projects you choose in that folder.

To set it up, add a cloud location under Cloud locations in the Projects section of Settings on each computer. Spectrum suggests the sync folders it finds and makes a `Spectrum` folder inside the one you add, for example `SynologyDrive/Spectrum`, or uses that folder itself when a computer with 1.8.0 already shares through it. Add… takes any folder that syncs. Your other projects stay in the default folder for new projects and never leave this computer. With Synology Drive, use a classic two-way sync task on both computers rather than On-demand Sync, so every file is on each computer and works offline, and turn on versioning for the Team Folder on the NAS as a safety net. One folder should only ever be in one sync app.

- **Sync to.** A project's menu lists the cloud locations under Sync to, and When a project syncs in Settings chooses what that does. Keep a local copy and mirror it, the default, leaves the project in its folder on this computer and keeps a copy in the cloud location in step with it, so the project works offline and a slow sync app never holds up the editor. Move it into the cloud location moves the folder there, as 1.8.0 kept its projects, and the sync app keeps it the same on each computer. A project already in a sync app's folder, for example in Documents backed up by iCloud Drive or OneDrive, syncs as it is.
- **Cloud projects.** The sidebar lists All projects, Cloud projects, Archived and your tags. Cloud projects shows the projects that sync, each with a cloud symbol and how it stands (Synced, Syncing…, Waiting for OneDrive or Needs attention), and the projects your other computers put in a cloud location that this one does not have yet ("In OneDrive, not on this computer") with Download. Download keeps a mirrored copy on this computer, or with Move opens the project where it is.
- **How mirroring works.** Spectrum compares the two copies file by file, much as git merges branches: a file changed on one side goes across, and a file changed on both is merged line by line. When both changed the same lines, this computer's file is kept and the other text is put beside it as a conflicted copy, for example `main (OneDrive’s conflicted copy 2026-10-18 104233).tex`. Before a sync replaces or deletes files on this computer, Spectrum saves a version named "Before sync from" and the other computer's name, or the cloud location's name when several computers share the project. When the files only came from the other computer, it saves one at most every 10 minutes. Deletions only go across from a complete view of both copies, and a sync that would delete many files at once stops with Needs attention until you choose Sync anyway. Projects sync every minute, two seconds after a change made in Spectrum and with Sync now.
- **Stop syncing.** Stop syncing… keeps the project on this computer, and either keeps the copy in the cloud location for your other computers or deletes it there. Delete is refused, with the reason, while the two copies are not yet in step or another computer has the project open, works on the cloud copy itself or runs 1.8.0. A moved project is first copied back to the default folder for new projects. Move to Bin on a moved project is refused for the same reasons, as it deletes the project on the other computers too.
- **Project folders.** Projects can be sorted into folders under All projects, and folders can hold folders. A folder's menu has New folder…, Rename… and Delete…, and a project goes into a folder when it is dragged there or with Move to folder…. Deleting a folder moves what was in it up a level. Folders only arrange the list, so the projects stay where they are on disk, and the arrangement follows you to your other computers with your settings.
- **Changes from the other computer.** A file changed on the other computer is reloaded in the editor when it has no unsaved edits here. If it does, Spectrum asks whether to keep this computer's text or use the other computer's, and offers to compare them. The text that is not used is kept in a version, so nothing is lost. A file deleted on the other computer is marked in its tab rather than brought back by a save.
- **Open on both computers.** A banner says when the project is also open on the other computer, for example "Also open on DESKTOP-AB12CD since 10:42". The conflicted copies a sync app or the mirror makes when both computers changed a file are marked in the file list, with Compare, Use this copy and Delete copy.
- **What else follows.** Version history and chats travel with each cloud project, and versions made on either computer appear on both. Your own templates and the built-in ones you edited follow too, and so do settings such as the theme, the editor, the shortcuts and your project folders, which can be turned off in Settings. API keys, model choices and folder paths stay on each computer, so no key is ever stored on the NAS.
- **Compiling.** A compile writes only the PDF into the project. SyncTeX data, the kept `.aux` files and the thumbnail are kept on each computer, so the other computer needs one compile of its own before double-click jumping works there.

## Requirements

- macOS 13.5 or later on Apple silicon or Intel (the Liquid Glass app icon needs macOS 26 or later), or Windows 10 or 11 on an x64 PC (Section Windows),
- a LaTeX distribution, either [MacTeX](https://www.tug.org/mactex/) or [Tectonic](https://tectonic-typesetting.github.io/) (`brew install tectonic`) on macOS, or [MiKTeX](https://miktex.org), [TeX Live](https://www.tug.org/texlive/) or Tectonic on Windows,
- an API key from one of the providers in Section Models, or any OpenAI-compatible server, for the AI features,
- Python 3 with matplotlib for the table to chart tool and with `ddgs` for DDGS web search (both optional) and
- an account with one of the PDF parsers in Section Template transfer, for converting a paper from its PDF (optional).

## Installing

1. Open `Spectrum_1.9.1_universal.dmg`
2. Drag Spectrum into the Applications folder
3. Open Spectrum from the Applications folder

Since the application is signed ad hoc rather than with an Apple Developer ID, macOS blocks it on the first launch when the DMG has been downloaded from the internet. To allow it, open System Settings, go to Privacy & Security and select Open Anyway. Alternatively, run the following command once,

```bash
xattr -dr com.apple.quarantine /Applications/Spectrum.app
```

On Windows, run `Spectrum_1.9.1_x64-setup.exe`. It installs Spectrum for the current user without administrator rights and adds it to the Start menu, and it installs Microsoft Edge WebView2 when the PC does not have it yet. Since the installer is not signed, Windows SmartScreen may warn about it on the first run. To continue, select More info and then Run anyway.

## Windows

The Windows version is a preview. It is built and tested on GitHub Actions, but it has had less use than the macOS version. It differs from the macOS version as follows,

- the window has the standard Windows title bar, and Liquid Glass is not available,
- the icons are Microsoft's Fluent UI System Icons, since Apple's SF Symbols may only be used on Apple platforms,
- the shortcuts use `Ctrl` for `⌘`, `Alt` for `⌥` and `Shift` for `⇧`, so Compile is `Ctrl+Enter`. Fold and unfold are `Ctrl+Shift+[` and `Ctrl+Shift+]`, find next and previous are `F3` and `Shift+F3`, and redo is `Ctrl+Y`,
- Show in Finder is Show in File Explorer, and projects are moved to the Recycle Bin,
- MiKTeX installs a missing package without asking, since its question would appear in a hidden window and
- settings are kept in `%APPDATA%\com.beyond3345.spectrum` and new projects are placed in `Documents\Spectrum`.

## Setting up

1. Open Settings with `⌘,`
2. Choose a provider under Models and paste its API key
3. Choose the theme and the default compiler
4. Check the System section to confirm which TeX tools Spectrum can find

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
| Save a version | `⇧⌘S` |
| Compile | `⌘↩` |
| Compile the open document | `⇧⌘↩` |
| Show or hide the assistant | `⌘L` |
| Check grammar | `⇧⌘;` |
| AI autocomplete | `⌥/` |
| Show or hide the sidebar | `⌘\` |
| Show the editor only, the editor and PDF, or the PDF only | `⌘1`, `⌘2` and `⌘3` |
| Zoom the PDF in or out | `⌘=` and `⌘−` (or pinch) |
| Fit the PDF to the width | `⌘0` |

Find (`⌘F`), undo (`⌘Z`), redo (`⇧⌘Z`) and Settings (`⌘,`) cannot be changed.

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

## Repository layout

- `apps/backend` is the Fastify server that manages projects, compiling, the AI tools, references and versions,
- `apps/frontend` is the React interface,
- `src-tauri` is the macOS application shell, which starts the bundled backend and opens the interface,
- `templates` holds the bundled LaTeX templates and
- `native` holds the spell checker (nodehun, with its source) and the grammar checker (Harper) as built for the application,
- `dictionaries` holds the spell-check dictionaries, with their licences and
- `scripts` holds the desktop build script, the script that builds `native` and the SF Symbols renderer used for the interface icons.

## Troubleshooting

### The first Tectonic compile takes several minutes

Tectonic downloads the packages it needs the first time they are used, which took about 3 minutes for the ACL template. Spectrum allows up to 15 minutes per Tectonic run, and later compiles use the downloaded copies.

### A biblatex document fails to compile with Tectonic

The TeX bundle that Tectonic downloads contains biblatex 3.8, which only works with biber 2.17, while current TeX Live installs a newer biber. Compile documents that use biblatex with Auto, pdfLaTeX or XeLaTeX instead.

### biber prints the usage text of `lipo`

The universal biber in TeX Live 2026 unpacks itself with a `lipo` command that macOS 27 rejects. Updating TeX Live with `sudo tlmgr update --self --all` installs a working biber, and the System section in Settings shows whether biber runs.

### Spectrum cannot find `pdflatex` or `tectonic`

Applications opened from Finder do not receive the `PATH` that Terminal uses. Spectrum reads the `PATH` from the login shell and adds `/Library/TeX/texbin`, `/opt/homebrew/bin` and `/usr/local/bin`. If TeX is installed somewhere else, add its folder to `PATH` in `~/.zprofile` and restart Spectrum.

### Spelling or grammar checking says it is not available

The spell checker is a compiled add-on and the grammar checker a WebAssembly module, both loaded by the backend when they are first needed. If one cannot load, the editor shows the reason once and carries on without it. The details are in the backend log, at `~/Library/Logs/com.beyond3345.spectrum/backend.log` in the app. Rebuilding with `npm run native:build` fixes a missing or damaged file in a copy built from source.

### The table to chart tool fails

The tool runs Python with matplotlib. Install it with `pip install matplotlib`, or set `SPECTRUM_PYTHON` to a Python that already has it.

## Acknowledgements and licence

Spectrum is based on OpenPrism by OpenDCAI. It uses CodeMirror, PDF.js, Fastify, LangGraph and Tauri, checks spelling with nodehun, Hunspell, SCOWL and AussieDic and grammar with Harper, and bundles the JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro fonts. The editor themes reuse the colours of the themes they are named after. Their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The interface icons are drawn from Apple's SF Symbols, which are licensed for use in applications on Apple platforms.

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE).
