<p align="center"><img src="apps/frontend/public/app-icon.png" width="128" alt="Spectrum icon"></p>

# Spectrum

This project is a macOS application for writing LaTeX documents with an AI assistant, a references assistant and local version history built in. It is intended for students and researchers who want to keep their papers as ordinary folders on their own Mac while still having help with drafting, citations and compile errors.

Spectrum is a fork of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) by OpenDCAI, which is no longer being maintained. While OpenPrism was a self-hosted web application built around real-time collaboration, Spectrum is a single-user desktop application. Apart from the AI features and reference look-ups, it works entirely offline. The full list of changes from upstream is given in [CHANGELOG.md](CHANGELOG.md).

## Features

The application is divided into two parts, the projects page and the editor.

### Projects

Each project is a normal folder that is chosen when the project is created. By default new projects are placed in `~/Documents/Spectrum`, so they can be backed up, synced or put under Git in the same way as any other folder. An existing LaTeX folder can also be opened in place without being copied.

The projects page lists every project regardless of where its folder is stored. Each row shows the first page of the last compiled PDF, and projects can be tagged, archived, duplicated, removed from the list or moved to the Bin. New projects can start from the template gallery (ACL, CVPR, NeurIPS, ICML and arXiv), from a `.zip` file such as an Overleaf export or from an arXiv ID. If a folder is moved in Finder, the project is marked as missing and can be pointed at its new location.

### Editor

The editor is divided into three columns, the file tree and saved chats on the left, the LaTeX source in the middle and the compiled PDF on the right.

- The source editor has LaTeX highlighting, folding, an outline of the main file, snippets for common environments, AI autocomplete (`⌥/`, accepted with `Tab`) and spell checking in Australian English. `Tab` indents at the cursor by four spaces, pressing Return after `\begin{…}` adds the matching `\end{…}` at the same indent, and long lines wrap under their own indent, with formulas breaking between terms,
- the PDF preview fits the page to the width of its column by default, zooms with a trackpad pinch, `⌘` and the scroll wheel or `⌘=` and `⌘−`, shows the pages dark in dark mode, and supports a two-page view, sticky notes and jumping to the source by clicking text in the PDF,
- the compiler can be pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk or Tectonic, and the Auto setting picks one from the `% !TEX program` comment and the packages the document uses and
- the Tools panel holds the project information (word counts from `texcount`), version history, compile logs, research tools, AI review and figure tools.

The assistant chat is opened with `⌘L` and has two modes. Assistant mode answers questions about the open file, the selection and the compile log, or proposes edits. Proposed edits are shown as a side-by-side diff that can be accepted or rejected file by file. References mode adds citations to the project's `.bib` file (Section References).

### References

A DOI, a link, an arXiv ID or a paper title can be pasted into the references chat, and the matching BibTeX entry is written to `references.bib`. The look-up is done in the following order,

1. a DOI is resolved through doi.org content negotiation, which covers both Crossref and DataCite DOIs, with the Crossref API as a fallback
2. an arXiv ID uses the arXiv API, and the published DOI is used instead when the paper has one
3. any other link is read for the citation metadata that publishers embed in their pages
4. a title is searched on Crossref, and if no single result clearly matches, the closest candidates are shown to choose from

The citation key is the first author's surname followed by the year, for example `Vaswani2017`. Accents are removed and name particles are joined, so "van der Waals" becomes `VanderWaals`. When the key already exists for a different paper, a letter is added (`Smith2020a`, `Smith2020b`). A paper whose DOI or arXiv ID is already in the project is reported as a duplicate and is not added again.

### Spelling and grammar

Spectrum checks writing in Australian English. Spelling is checked as you type in `.tex`, `.md` and `.txt` files, and misspelt words get a red underline. Right-clicking one offers suggestions, Add to dictionary, Add to project dictionary and Ignore. The project dictionary is kept in the project's `.spectrum` folder, so it travels with the project, while the main dictionary covers every project and can be edited in Settings under Spelling & grammar.

Spelling uses [nodehun](https://github.com/Wulf/nodehun), a binding for the Hunspell spell checker, with three dictionaries,

1. SCOWL en_AU-large, which sets the standard (colour, organise, centre, defence)
2. AussieDic, which adds Australian places, names and slang such as Parramatta, Wiradjuri and arvo and
3. SCOWL en_US, which is used only to recognise the American spellings in AussieDic, so color, organize and center are still flagged.

The grammar check runs [Harper](https://github.com/Automattic/harper) with its Australian dialect over the open file. It is started with the button beside the assistant button or with `⇧⌘;`, and its results take the place of the PDF until the panel is closed. Each issue is underlined in the editor and listed with its sentence, and it can be fixed with one click, ignored, or turned off for the project with Ignore rule. Settings has options for style suggestions, such as long sentences and wordiness, which are off by default, and for the serial comma, which is flagged by default in line with the Australian Government Style Manual.

Both checkers read only the prose of a LaTeX file. Commands, maths, comments, citation and reference keys, URLs, the preamble and code blocks are skipped, while the text of headings, captions, footnotes and `\emph`, `\textbf` and similar commands is checked.

### Version history

Versions are kept inside each project in a hidden `.spectrum` folder, together with the project settings, saved chats and temporary build files. File contents are compressed and stored once, so unchanged files cost no extra space between versions. A version can be saved by hand from the Versions tab with an optional label. One is also saved automatically before AI changes are applied, before a restore and before a template change, so each of these can be undone. A version can be compared with the current files, restored as a whole or restored one file at a time.

## Requirements

- macOS 13.5 or later on Apple silicon or Intel (the Liquid Glass app icon needs macOS 26 or later),
- a LaTeX distribution, either [MacTeX](https://www.tug.org/mactex/) or [Tectonic](https://tectonic-typesetting.github.io/) (`brew install tectonic`),
- an API key from one of the providers in Section Models, or any OpenAI-compatible server, for the AI features,
- Python 3 with matplotlib for the table to chart tool (optional) and
- a [MinerU](https://mineru.net) token for PDF-based template conversion (optional).

## Installing

1. Open `Spectrum_1.1.1_universal.dmg`
2. Drag Spectrum into the Applications folder
3. Open Spectrum from the Applications folder

Since the application is signed ad hoc rather than with an Apple Developer ID, macOS blocks it on the first launch when the DMG has been downloaded from the internet. To allow it, open System Settings, go to Privacy & Security and select Open Anyway. Alternatively, run the following command once,

```bash
xattr -dr com.apple.quarantine /Applications/Spectrum.app
```

## Setting up

1. Open Settings with `⌘,`
2. Choose a provider under Models and paste its API key
3. Choose the theme and the default compiler
4. Check the System section to confirm which TeX tools Spectrum can find

Choosing a provider fills in its endpoint, the recommended models and the recommended reasoning effort, which are described in Section Models. The model settings can also be given in a `.env` file at `~/Library/Application Support/com.beyond3345.spectrum/.env`, using the variables listed in Section Configuration. Settings entered in the application take priority over the `.env` file.

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
| Meta Muse Spark | Muse Spark 1.3 | Muse Spark 1.3 | Muse Spark 1.3 | Medium |

Other models from the same provider can be picked from the list, and any other name can be typed in. The quick and vision models can each be set separately. By default they use the main model's provider and key and move with it when it changes. Choosing another provider for either one gives it its own region, model and key, for example Gemini 3.8 Flash for images while Claude writes the text. A key is only ever sent to the address it was entered for, including the key in the `.env` file. The Other provider takes any server that speaks the OpenAI chat completions API, such as LM Studio, Ollama or vLLM. Each provider's key is kept when switching between them, so going back to a provider does not need the key again.

The reasoning effort sets how long the model may think before answering, from Off to Max. Settings and the assistant only offer the levels the chosen model accepts, and Recommended uses the level in the table. Autocomplete, reference parsing and search queries use the lowest level a listed model accepts, so they stay quick, while models on other servers use their own default. Spectrum sends the effort in the form each provider expects,

- OpenAI is called through the Responses API, since its chat completions API does not allow reasoning together with the file editing tools. Requests are sent with storage turned off, so nothing is kept on OpenAI's servers,
- Claude is called through Anthropic's Messages API, since the OpenAI-compatible endpoint ignores the effort setting,
- DeepSeek, GLM and Qwen turn thinking off when the effort is Off, and Gemini 3, Kimi K3, GLM-5.3 and Muse Spark always think a little, so they start at their lowest level instead and
- temperature is left at each provider's default, since several of them reject any other value.

Keys for Moonshot, GLM and Qwen only work in the region they were created in, so choose the same region under Region. Meta's cheaper Contributor models are left out of the list on purpose, since Meta trains on what is sent to them.

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
| Compile | `⌘↩` |
| Show or hide the assistant | `⌘L` |
| Check grammar | `⇧⌘;` |
| AI autocomplete | `⌥/` |
| Show or hide the sidebar | `⌘\` |
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
| `SPECTRUM_MINERU_TOKEN` | MinerU token for template conversion | none |

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

Spectrum is based on OpenPrism by OpenDCAI. It uses CodeMirror, PDF.js, Fastify, LangGraph and Tauri, and checks spelling with nodehun, Hunspell, SCOWL and AussieDic and grammar with Harper. Their licences are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The interface icons are drawn from Apple's SF Symbols, which are licensed for use in applications on Apple platforms.

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE).
