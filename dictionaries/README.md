# Dictionaries

Spectrum's spell checker (nodehun, a Hunspell binding) loads these files.

| Folder | What it is | Licence |
| --- | --- | --- |
| `en_AU/` | SCOWL en_AU-large 2026.02.25 (wooorm/dictionaries packaging), unmodified. The Australian standard | MIT AND BSD, see `en_AU/LICENSE` |
| `en_US/` | SCOWL en_US-large 2026.02.25, unmodified. Used only to recognise American spellings in AussieDic | MIT AND BSD, see `en_US/LICENSE` |
| `aussiedic/` | AussieDic 3.1.0 (Australian-English-Dictionary), unmodified. Adds Australian places, names and slang | GPL-3.0, see `aussiedic/LICENSE` |
| `spectrum-extra.dic` | Spectrum's own supplement: words missing from every list above, such as defence, Australian place and language names, and LaTeX and research terms | MIT, as Spectrum |

A word is accepted when en_AU accepts it, when AussieDic accepts it and en_US does not (so American spellings such as color are still flagged), or when it is in the supplement or a personal word list. Words marked never-to-suggest in SCOWL are never offered as suggestions, and from AussieDic, which has no such marks, only proper nouns are offered.
