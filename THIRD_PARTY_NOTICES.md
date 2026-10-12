# Third-party notices

Spectrum is released under the MIT Licence given in [LICENSE](LICENSE). It includes the following components under their own licences. Each one is shipped unmodified unless noted.

| Component | Where | Licence |
| --- | --- | --- |
| [OpenPrism](https://github.com/OpenDCAI/OpenPrism) | the code Spectrum was forked from | MIT, see [LICENSE](LICENSE) |
| [nodehun](https://github.com/Wulf/nodehun) 3.0.2 | `native/nodehun/`, built into `native/nodehun.node` | MIT, see [native/nodehun/LICENSE.md](native/nodehun/LICENSE.md) |
| [Hunspell](https://hunspell.github.io) 1.3.3 (the hunspell-distributed fork bundled with nodehun) | `native/nodehun/hunspell/`, compiled into `native/nodehun.node` | MPL 1.1, LGPL 2.1 or GPL 2, at the user's choice. Spectrum uses it under the MPL 1.1, see [native/nodehun/hunspell/COPYING.MPL](native/nodehun/hunspell/COPYING.MPL). The source is included in this repository |
| [Harper](https://github.com/Automattic/harper) 2.12.0 | `native/harper/`, built from harper-wasm without the thesaurus and Typst features | Apache 2.0, see [native/harper/LICENSE](native/harper/LICENSE) |
| SCOWL en_AU-large and en_US-large 2026.02.25 ([wordlist.aspell.net](https://wordlist.aspell.net)), packaged by [wooorm/dictionaries](https://github.com/wooorm/dictionaries) | `dictionaries/en_AU/`, `dictionaries/en_US/` | MIT AND BSD, see the LICENSE file in each folder |
| [AussieDic](https://github.com/Caskexe/Australian-English-Dictionary) 3.1.0 | `dictionaries/aussiedic/`, kept as separate files | GPL 3.0, see [dictionaries/aussiedic/LICENSE](dictionaries/aussiedic/LICENSE). The files are the source |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [Fira Code](https://github.com/tonsky/FiraCode), [IBM Plex Mono](https://github.com/IBM/plex) and [Source Code Pro](https://github.com/adobe-fonts/source-code-pro), packaged by [Fontsource](https://fontsource.org) 5.3.0 | bundled into the interface as editor fonts (Latin, regular and italic) | SIL Open Font License 1.1, see the files in [apps/frontend/public/licences/](apps/frontend/public/licences/), which are also inside the application |
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

If the application is given to anyone else, this file and the licence files it points to must go with it.
