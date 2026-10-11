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
| Node.js, CodeMirror, PDF.js, Fastify, React, Tauri and the other npm and Cargo dependencies | bundled into the application | their own licences, listed in `package-lock.json` and `src-tauri/Cargo.lock` |

Spectrum's own word list, `dictionaries/spectrum-extra.dic`, is part of Spectrum and under its MIT Licence.

If the application is given to anyone else, this file and the licence files it points to must go with it.
