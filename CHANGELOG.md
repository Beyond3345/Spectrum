# Changelog

This file records the changes in Spectrum. Version 1.0.0 is the first release of the fork, so its entries are given relative to the last state of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) in February 2026.

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
