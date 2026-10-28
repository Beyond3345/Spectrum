# Dictionaries

Spectrum's spell checker (Hunspell, through Spectrum's own binding) loads these files.

| Folder | What it is | Licence |
| --- | --- | --- |
| `en_AU/` | SCOWL en_AU-large 2026.02.25 (wooorm/dictionaries packaging), unmodified. The Australian standard | MIT AND BSD, see `en_AU/LICENSE` |
| `en_US/` | SCOWL en_US-large 2026.02.25, unmodified. American English, and for Australian English only to recognise American spellings in AussieDic | MIT AND BSD, see `en_US/LICENSE` |
| `en_GB/` | SCOWL en_GB-large 2026.02.25 from SCOWL's [release](https://github.com/en-wl/wordlist/releases/tag/rel-2026.02.25), unmodified apart from the file names. British and Indian English | MIT AND BSD, see `en_GB/LICENSE` (the zip's README) |
| `en_CA/` | SCOWL en_CA-large 2026.02.25 from the same release, unmodified apart from the file names. Canadian English | MIT AND BSD, see `en_CA/LICENSE` (the zip's README) |
| `aussiedic/` | AussieDic 3.1.0 (Australian-English-Dictionary), unmodified. Adds Australian places, names and slang | GPL-3.0, see `aussiedic/LICENSE` |
| `spectrum-extra.dic` | Spectrum's own supplement for every language: LaTeX names, research terms and Latin abbreviations missing from the lists above | MIT, as Spectrum |
| `spectrum-extra-au.dic` | Spectrum's Australian supplement, for Australian English only: defence, and Australian place, language, university and agency names | MIT, as Spectrum |

A word is accepted when en_AU accepts it, when AussieDic accepts it and en_US does not (so American spellings such as color are still flagged), or when it is in either supplement or a personal word list. The other English variants use their own SCOWL dictionary and the general supplement. Words marked never-to-suggest in SCOWL are never offered as suggestions, and from AussieDic, which has no such marks, only proper nouns are offered.
