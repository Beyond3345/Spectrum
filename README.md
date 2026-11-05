<p align="center"><img src="apps/frontend/public/app-icon.png" width="128" alt="Spectrum icon"></p>

# Spectrum

This project is an application for writing and compiling LaTeX, Typst and Markdown documents with deep AI integration. It is intended for students and researchers who want to keep their papers as ordinary folders on their own device offline while having AI assistance with drafting, citations and compile errors.

Spectrum is originally built from a fork of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) by OpenDCAI, which is no longer being maintained. While OpenPrism was a self-hosted web application built around real-time collaboration, Spectrum is a single-user desktop application. Apart from the AI features and reference look-ups, it works entirely offline. The full list of changes is given in [CHANGELOG.md](CHANGELOG.md).

Spectrum runs on macOS 13.5 or later on Apple silicon and on Windows 10 or 11 on an x64 PC. The installers are in the [latest release](https://github.com/Beyond3345/Spectrum/releases/latest).

The [user guide](docs/USER_GUIDE.md) describes installing, setting up and every feature in full, and [Developing Spectrum](docs/DEVELOPING.md) covers building from source and configuration.

## Key features

- **Projects as folders:** each project is a normal folder on your computer, so it can be backed up, synced or put under Git like any other. Existing LaTeX, Typst and Markdown folders open in place, and new projects start from the template gallery, Typst Universe, a `.zip` such as an Overleaf export or an arXiv ID.
- **Built-in engines:** Tectonic, Typst and TexLab come with Spectrum, so no TeX installation is needed. pdfLaTeX, XeLaTeX, LuaLaTeX and Latexmk are used when installed, and pandoc, Biber and Tinymist download on request.
- **Editor:** LaTeX, Typst and Markdown highlighting, context-aware completion, AI autocomplete, an outline, folding and language servers for errors, Go to definition and Rename. Double clicks jump between the source and the PDF.
- **PDF preview:** fast recompiles, auto compile, page colours for light and dark mode, sticky notes, links that work as in a PDF viewer and exports to PNG, SVG, HTML and PDF/A for Typst.
- **AI assistant and agents:** a chat that explains compile errors and polishes, rewrites or translates text as edits you review, and an agent workspace that runs the Spectrum agent or local agents such as OpenCode, Codex and Claude Agent in isolation. Works with OpenAI, Claude, Gemini, DeepSeek, Kimi, GLM, Qwen, Ollama and any OpenAI-compatible server.
- **LaTeX ⇄ Typst converter:** makes a new project in the other language, keeps labels, references, citations, maths, figures and tables and checks that the result compiles and nothing was lost.
- **References and research:** DOIs, links, arXiv IDs and titles become BibTeX entries, Zotero citing and collections, and a Research tab that searches OpenAlex, Semantic Scholar, arXiv, Crossref and PubMed at once.
- **Figures and diagrams:** Insert figure and Insert table panels, and a diagram composer for circuits, structures, plots, flowcharts and Mermaid diagrams that saves its source.
- **Review:** checks for compile and layout problems, missing references, anonymity, accessibility and submission readiness, with an optional AI review.
- **Spelling and grammar:** Hunspell and Harper on this computer, in Australian English by default and in other languages on request, with LanguageTool as an option.
- **Checkpoints and GitHub:** checkpoints inside each project to compare and restore, and private GitHub repositories that keep projects and settings in step between computers.

## Troubleshooting

### The first LaTeX compile takes several minutes

The built-in Tectonic downloads the packages it needs the first time they are used. When no TeX is installed, Spectrum prepares the templates' packages and Biber in the background after it first opens, and Settings › Engines › LaTeX shows "Preparing LaTeX packages…" until they are ready. Later compiles use the downloaded copies.

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
