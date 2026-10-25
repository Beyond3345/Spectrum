# Third-party notices

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE). It includes the following components under their own licences. Each one is shipped unmodified unless noted.

| Component | Where | Licence |
| --- | --- | --- |
| [OpenPrism](https://github.com/OpenDCAI/OpenPrism) | the code Spectrum was forked from | MIT, see [LICENSE](LICENSE) |
| [pylatexenc](https://github.com/phfaist/pylatexenc) 3.0b2, upstream revision `316f9c0`, generated with Transcrypt 3.9.3 | `apps/backend/src/latex/pylatexenc/`, adapted as documented in its README and shipped with the backend | MIT, Apache 2.0 and W3C Software Licence; includes debug 4.4.3 and ms under MIT. See [the included licences](apps/backend/src/latex/pylatexenc/licences/) |
| [nodehun](https://github.com/Wulf/nodehun) 3.0.2 | `native/nodehun/`, built into `native/nodehun.node` | MIT, see [native/nodehun/LICENSE.md](native/nodehun/LICENSE.md) |
| [Hunspell](https://hunspell.github.io) 1.3.3 (the hunspell-distributed fork bundled with nodehun) | `native/nodehun/hunspell/`, compiled into `native/nodehun.node` | MPL 1.1, LGPL 2.1 or GPL 2, at the user's choice. Spectrum uses it under the MPL 1.1, see [native/nodehun/hunspell/COPYING.MPL](native/nodehun/hunspell/COPYING.MPL). The source is included in this repository |
| [Harper](https://github.com/Automattic/harper) 2.12.0 | `native/harper/`, built from harper-wasm without the thesaurus and Typst features | Apache 2.0, see [native/harper/LICENSE](native/harper/LICENSE) |
| SCOWL en_AU-large and en_US-large 2026.02.25 ([wordlist.aspell.net](https://wordlist.aspell.net)), packaged by [wooorm/dictionaries](https://github.com/wooorm/dictionaries) | `dictionaries/en_AU/`, `dictionaries/en_US/` | MIT AND BSD, see the LICENSE file in each folder |
| [AussieDic](https://github.com/Caskexe/Australian-English-Dictionary) 3.1.0 | `dictionaries/aussiedic/`, kept as separate files | GPL 3.0, see [dictionaries/aussiedic/LICENSE](dictionaries/aussiedic/LICENSE). The files are the source |
| [TexLab](https://github.com/latex-lsp/texlab) 5.26.0 by Eric Förster and Patrick Förster | `texlab` (`texlab.exe` on Windows) beside the application's own executable, a separate program that Spectrum starts and talks to over the Language Server Protocol. The Mac binaries are the release's own; the Windows one is built from the same tagged source with the C runtime linked in | GPL 3.0 only, see [apps/frontend/public/licences/texlab-GPL-3.0.txt](apps/frontend/public/licences/texlab-GPL-3.0.txt), which is also inside the application. Its source is the [v5.26.0 tarball](https://github.com/latex-lsp/texlab/archive/refs/tags/v5.26.0.tar.gz) (SHA-256 `47af7e71247fe186ddbaa62373ce5fbebc802ab8df9924958ac62788a644f84e`), which is also attached to each Spectrum release that includes TexLab |
| [Typst](https://typst.app) 0.15.1, with 0.14.2, 0.13.1 and 0.12.0 downloadable from Settings › Engines › Typst | `typst` (`typst.exe` on Windows, with Microsoft's `vcruntime140.dll` beside it) beside the application's own executable, and each downloaded version under the data folder's `engines/typst/` | Apache 2.0, see the [LICENSE](https://github.com/typst/typst/blob/v0.15.1/LICENSE) in its source. The source of each version is the [v0.15.1 tarball](https://github.com/typst/typst/archive/refs/tags/v0.15.1.tar.gz), and of the others the tarball at their tag |
| [Tectonic](https://tectonic-typesetting.github.io) 0.17.0 | `tectonic` (`tectonic.exe` on Windows) beside the application's own executable | MIT, see the [LICENSE](https://github.com/tectonic-typesetting/tectonic/blob/tectonic%400.17.0/LICENSE) in its source. Its source is the [tectonic@0.17.0 tarball](https://github.com/tectonic-typesetting/tectonic/archive/refs/tags/tectonic%400.17.0.tar.gz) |
| [pandoc](https://pandoc.org) 3.12.1 | downloaded from its [GitHub release](https://github.com/jgm/pandoc/releases/tag/3.12.1) into the data folder's `engines/pandoc/` when the user asks for it in Settings › Engines › Markdown; never bundled | GPL 2.0 or later, see the [COPYING](https://github.com/jgm/pandoc/blob/3.12.1/COPYING.md) in its source |
| [fletcher](https://github.com/Jollywatt/typst-fletcher) 0.5.8 and 0.5.5 | fetched from [Typst Universe](https://typst.app/universe/package/fletcher) by Typst the first time a diagram imports it, into Typst's own package cache; never bundled | MIT |
| Microsoft Visual C++ Redistributable (`vcruntime140.dll`) | on Windows, `resources/engines/vcruntime140.dll`, copied beside Typst | Microsoft's redistribution terms, as part of the Visual Studio Build Tools |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [Fira Code](https://github.com/tonsky/FiraCode), [IBM Plex Mono](https://github.com/IBM/plex) and [Source Code Pro](https://github.com/adobe-fonts/source-code-pro), packaged by [Fontsource](https://fontsource.org) 5.3.0 | bundled into the interface as editor fonts (Latin, regular and italic) | SIL Open Font License 1.1, see the files in [apps/frontend/public/licences/](apps/frontend/public/licences/), which are also inside the application |
| [Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons) 1.1.344 | `apps/frontend/public/fluent/`, used by the Windows version only | MIT, see [apps/frontend/public/licences/FluentUI-System-Icons-MIT.txt](apps/frontend/public/licences/FluentUI-System-Icons-MIT.txt) |
| [React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`) 12.12.0, with zustand and the d3 modules it uses | bundled into the diagram composer as its canvas | MIT (the d3 modules ISC) |
| [Mermaid](https://github.com/mermaid-js/mermaid) 11.17.2, with the packages it depends on | bundled into the diagram composer, loaded only for Mermaid diagrams | MIT; of its dependencies DOMPurify is used under Apache 2.0 (it is offered under MPL 2.0 or Apache 2.0), robust-predicates is under the Unlicense and the rest are MIT, ISC or BSD 3-Clause |
| [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 | loaded when a Mermaid diagram is exported or inserted as PDF; its high-resolution image is embedded at its original size | MIT; @pdf-lib/standard-fonts and @pdf-lib/upng are MIT, pako is MIT AND Zlib, and tslib is 0BSD. Their licence texts are included in `apps/frontend/public/licences/` |
| [CodeMirror's language server client](https://github.com/codemirror/lsp-client) (`@codemirror/lsp-client`) 6.3.0, with `@codemirror/lint` 6.9.7, `vscode-languageserver-protocol` 3.17.5, `vscode-jsonrpc` 8.2.0, `vscode-languageserver-types` 3.17.5 and marked 15.0.12 | bundled into the editor, which talks to TexLab through them | MIT |
| [codemirror-lang-typst](https://github.com/kxxt/codemirror-lang-typst) 0.6.0 and [@codemirror/lang-markdown](https://github.com/codemirror/lang-markdown) 6.5.2 | bundled into the editor for Typst and Markdown highlighting, folding and completion | Apache 2.0 and MIT |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/sdk`) 1.32.1, with ajv, ajv-formats, @cfworker/json-schema, fast-deep-equal, fast-uri, json-schema-traverse, zod and zod-to-json-schema | bundled into `mcp.mjs`, the server of Spectrum's tools that local agents start on macOS | MIT; fast-uri is BSD 3-Clause and zod-to-json-schema ISC |
| [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) 1.43.3, with async-lock, clean-git-ref, crc-32, diff3, ignore, pako, pify, readable-stream, sha.js, simple-get and the packages they depend on | shipped with the backend, which keeps projects and settings on GitHub through it | MIT; clean-git-ref and crc-32 are Apache 2.0, ieee754 is BSD 3-Clause, pako is MIT AND Zlib and sha.js is MIT AND BSD 3-Clause |
| [K-Dense scientific agent skills](https://github.com/K-Dense-AI/scientific-agent-skills), 12 skills at commit `593377b` | `skills/`, copied unmodified by `scripts/sync-skills.mjs`, without the scripts that spend an OpenRouter key (`generate_schematic*.py` and `generate_slide_image*.py`); listed below | MIT, see [skills/K-Dense-LICENSE.md](skills/K-Dense-LICENSE.md); one skill is Apache 2.0, see [skills/Apache-2.0.txt](skills/Apache-2.0.txt); the Elsevier files in venue-templates are LPPL 1.3c |
| Node.js, CodeMirror, PDF.js, Fastify, React, Tauri and the other npm and Cargo dependencies | bundled into the application | their own licences, listed in `package-lock.json` and `src-tauri/Cargo.lock` |

The editor themes reuse the colour values of the themes below. Only the colours are taken, no files or code of theirs are included, and the Texifier-like and Overleaf-like themes are Spectrum's own approximations, built from Apple's system colours and from Ace's TextMate theme respectively.

| Editor theme | Colours taken from | Licence |
| --- | --- | --- |
| GitHub Light and Dark | [primer/github-vscode-theme](https://github.com/primer/github-vscode-theme) 6.3.5 and @primer/primitives 7.10.0 | MIT |
| One Light and One Dark | [atom/atom](https://github.com/atom/atom) one-light-syntax and one-dark-syntax | MIT |
| Solarized Light and Dark | [altercation/solarized](https://github.com/altercation/solarized), mapped as in microsoft/vscode | MIT |
| Tokyo Night and Tokyo Night Day | [folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) | Apache 2.0 |
| Catppuccin Latte and Mocha | [catppuccin/palette](https://github.com/catppuccin/palette) 1.8.0 | MIT |
| Gruvbox Light and Dark | [morhetz/gruvbox](https://github.com/morhetz/gruvbox) | MIT |
| Nord and Nord Light | [nordtheme/nord](https://github.com/nordtheme/nord); Nord Light is derived from the Nord colours | MIT |
| Dracula and Alucard | [draculatheme.com/spec](https://draculatheme.com/spec) | MIT |
| Monokai | microsoft/vscode theme-monokai, after the original by Wimer Hazenberg | MIT |
| Rosé Pine and Rosé Pine Dawn | [rose-pine/neovim](https://github.com/rose-pine/neovim) | MIT |
| Ayu Light and Ayu Mirage | [ayu-theme/ayu-colors](https://github.com/ayu-theme/ayu-colors) 9.1.0 | MIT |
| Overleaf-like Light | the TextMate theme of [Ace](https://github.com/ajaxorg/ace), Copyright (c) 2010, Ajax.org B.V. | BSD 3-Clause |
| Xcode Light and Dark | the colour values of Xcode's default themes | no Apple file is included |

Spectrum's own word list, `dictionaries/spectrum-extra.dic`, is part of Spectrum and under its MIT Licence.

## Bundled skills

The skills in `skills/` come from [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) at commit `593377bb048752abb0152deab9fbb1083a6087df`, each as its own front matter names its author and licence. `scripts/sync-skills.mjs` copies them, checks every file against that commit and stops on a licence other than MIT or Apache 2.0. `skills/manifest.json` records the same list.

| Skill | Author | Licence |
| --- | --- | --- |
| citation-management | K-Dense Inc. | MIT |
| hypothesis-generation | K-Dense Inc. | MIT |
| latex-posters | K-Dense Inc. | MIT (the skill names none, so the repository’s MIT licence applies) |
| literature-review | K-Dense Inc. | MIT |
| markdown-mermaid-writing | Clayton Young / Superior Byte Works, LLC (@borealBytes) | Apache-2.0 |
| paper-lookup | K-Dense Inc. | MIT |
| peer-review | K-Dense Inc. | MIT |
| research-grants | K-Dense Inc. | MIT |
| scientific-critical-thinking | K-Dense Inc. | MIT |
| scientific-slides | K-Dense Inc. | MIT |
| scientific-writing | K-Dense Inc. | MIT |
| venue-templates | K-Dense Inc. | MIT |

In venue-templates, `assets/journals/elsarticle-*.bst` and `assets/journals/elsarticle-template-*.tex` are © Elsevier Ltd under the LaTeX Project Public License 1.3c, as their headers say.

Spectrum's own skills (`spectrum-latex`, `spectrum-markdown`, `spectrum-related-work`, `spectrum-typst` and `spectrum-verify-claims`) are part of Spectrum and under its MIT Licence.

If the application is given to anyone else, this file and the licence files it points to must go with it.

## Agent Client Protocol SDK

Spectrum includes `@agentclientprotocol/sdk` 1.9.0 by the Agent Client Protocol contributors, licensed under Apache-2.0. Source and license: https://github.com/agentclientprotocol/typescript-sdk. Agent executables/adapters are installed separately and retain their own licenses; launcher profiles do not bundle those agents.
