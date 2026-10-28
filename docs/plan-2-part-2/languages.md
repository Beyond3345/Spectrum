## Spelling and grammar: Harper 3, Hunspell 1.7.6, every language, a detected language list and LanguageTool

> **Decisions taken on 29 October 2026.** These were decided with the user after this section was written. Where the text below recommends or assumes something else, these decisions win. Every other open question in this section takes its recommended default.
>
> - Languages that share a script are decided by the listed languages' dictionaries voting, with eld XS as the fallback if the 97% gate fails.
> - About 80 languages are offered. Only English is bundled.
> - Dictionaries **do not download automatically**: Settings shows a Download button for each language, and a listed language that needs one asks first. A failed or offline download never stops the languages already on the computer.
> - In Traditional Chinese paragraphs, stray Simplified-only characters are underlined (OpenCC tables, Hong Kong and Taiwan forms left alone).
> - LanguageTool runs only as a managed local download in this round, at **version 6.8** assembled from Maven Central jars pinned by SHA-256, with Spectrum's own pinned Java runtime. A user's own server address and LanguageTool Premium are not in this round. The free public server is never used.

### Goal

You keep one ordered list of the languages you write in. Spectrum works out the language of each paragraph from that list and checks it in that language, never in one you did not list: with Australian English and Traditional Chinese listed, no paragraph is ever checked as US English or Simplified Chinese. Australian English stays the default and the first entry. Spelling moves to Hunspell 1.7.6 through a small binding of Spectrum's own, with the four SCOWL English dictionaries built in (Australian English keeps AussieDic and Spectrum's supplement) and every other maintained Hunspell dictionary from two pinned sources downloaded the first time it is needed, with checksums and licences. Grammar moves to Harper 3.0.0 with all five of its English dialects. LanguageTool checks every other language it supports (and English, if you choose it), running on this computer, on a server you name or through LanguageTool Premium. Nothing you write leaves the computer unless you choose Premium or a server on another computer, and even then only the paragraphs in the languages LanguageTool checks.

### What Spectrum does today

Checked on `feat/2.0` at `50bedf6`. The checker versions, manifests and `checkers:verify` that Codex's 2.1 proposal (`docs/SPECTRUM_2_1_PLAN.md`, sections 4.1 and 4.6) asked for are already in place, so this work builds on them. Its LanguageTool proposal (section 4.4) is taken forward here, with the managed download now in scope because you asked for it.

| Area | Where | What it does now |
| --- | --- | --- |
| Spelling engine | `apps/backend/src/services/spellWorker.mjs` | Loads `native/nodehun.node` (lines 9 to 11), which is Hunspell 1.3.3 from nodehun 3.0.2's buffer fork, and builds three dictionaries from buffers: en_AU with `spectrum-extra.dic` added, AussieDic and en_US (lines 15 to 18). `accepted()` (line 33) takes a word en_AU accepts, or one AussieDic accepts and en_US does not. The never-suggest list comes from the `!` flags in en_AU and en_US (lines 21 to 31). Five words are checked before it answers (lines 39 to 47), and the module throws if they fail. |
| Spelling service | `apps/backend/src/services/spellService.js` | Runs the worker on a thread through `workerClient` with `timeoutMs: 20_000` (lines 12 to 14). `checkWords` (lines 79 to 85) drops the words on your list (`DATA_DIR/dictionary.txt`) and the project's (`.spectrum/dictionary.txt`), then asks the worker. `spellStatus` reports `language: 'en-AU'` (line 24). |
| Spelling in the editor | `apps/frontend/src/editor/spellcheck.ts` | Masks the file with `maskLatex`, `maskTypst` or `maskMarkdown`, takes the words near the view with `proseWords`, sends unknown ones to `POST /api/spell/check` as `{ words, projectId }` and caches each answer by word (line 48). |
| Word splitting | `apps/backend/src/latex/mask.js` `proseWords` (line 253, pattern `[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*` at line 255) | Any run of letters is one word, so a run of Chinese, Japanese or Thai is one “word”. Given “我们研究了这个问题的历史与发展。We tested it.” it returns one 15-character word, which en_AU rejects, so the whole run is underlined. Positions after an emoji and in CRLF text are correct UTF-16 offsets. |
| Grammar engine | `apps/backend/src/services/grammarWorker.mjs` | One `Linter.new(Dialect.Australian)` (line 11), SpellCheck off (line 14), the serial comma set per request. |
| Grammar service | `apps/backend/src/services/grammarService.js` | `checkGrammar` (lines 43 to 56) masks LaTeX and Typst, passes Markdown as it is, hides style kinds unless asked, drops ignored rules and marks `fixable`. Ignored rules are `{ ignoredRules }` in `.spectrum/grammar.json` (lines 60 to 78). `grammarStatus` reports `en-AU` (line 32). `MAX_GRAMMAR_CHARS` is 2,000,000 (line 17). |
| Grammar panel | `apps/frontend/src/editor/GrammarPanel.tsx` | `grammarField` (line 24) maps the marks through every edit (line 28). `run()` (lines 129 to 155) sends the whole file in one `grammarCheck`, and if the file changed while it ran it starts again at once (lines 143 to 146). Checks `.tex`, `.md` and `.txt` only (line 100), so a Typst file cannot be checked from it although the service masks Typst. Harper's `Regionalism` kind is labelled “Australian English” (line 80) and the header reads “Australian English · file” (line 231). |
| Grammar request | `apps/frontend/src/api/client.ts` `grammarCheck` (line 1037) | Takes no `AbortSignal`, so a check cannot be cancelled. `request` (line 115) passes its options to `fetch`, so a signal would reach it. |
| Settings | `LanguagePane` in `apps/frontend/src/app/SettingsSheet.tsx` (lines 1471 to 1593) | The spelling switch, style suggestions, the serial comma, diagnostics and your word list. `CheckerDetails` (lines 1595 to 1611) shows each engine's version, the nodehun version and “Australian English”. |
| Shared settings | `apps/frontend/src/app/settings.ts` | `spellCheck`, `grammarStyle` and `oxfordComma` are in `SHARED_KEYS` (lines 444 to 448) and follow you through the settings repository. |
| Builds | `scripts/native.mjs`, `native/checkers.lock.json` | The lock pins Harper 2.12.0 and Hunspell 1.3.3. `buildNodehun` (lines 90 to 127) builds a universal `nodehun.node`, signs it ad hoc and tests it; `buildHarper` (lines 129 to 154) runs `wasm-pack --no-default-features --locked`; `verify` (lines 175 to 191) checks every manifest. `scripts/desktop.mjs` `resources()` copies `dictionaries/` and the built files (lines 292 and 296 to 305). The Windows workflow builds nodehun with `continue-on-error` outside a release, so a test installer can come without the spell checker (`.github/workflows/windows.yml` lines 52 to 56). |
| What travels | `gitService.js` `APP_SHARED` (line 63), `mergeRules.js` `mergeMeta` (lines 54 to 71) | `.spectrum/settings.json` goes to GitHub and merges key by key, two levels deep: a list changed on both sides keeps this computer's and the other change is lost (its own `ponytail:` note). `grammar.json` and `dictionary.txt` stay on each computer, as the 2.0 plan chose. 1.10.4 (`42ff62f`, its `grammarService.js` line 67) and today's 2.0 (line 76) both rewrite `grammar.json` with `ignoredRules` alone. |

Measured for this plan in a scratch folder, with nothing in the repository changed:

- **Harper 3.0.0 against the bundled 2.12.0** (3.0.0 as harper.js 3.0.0's slim build, which has the same features as Spectrum's). The only rule name 2.12.0 has that 3.0.0 lacks is `NobelPeacePrize`, now `NobelNoble`. 37 rules are new, such as `Gonna`, `Wanna`, `Themself` and `PassedPast`. Spectrum's test sentences give the same issues at the same UTF-16 offsets, after an emoji too (Harper converts its spans with `to_js_indices`).
- **Dialects.** With SpellCheck off, the dialect changes `Regionalisms` (“flashlight”, “diaper” and “gas station” are flagged in Australian English, “nappy” and “petrol” in American), `HaveTakeALook`, `FedUpWith`, `TillDate`, `InOnTheCards` and `OutOfTheWindow`.
- **Case.** With 3.0.0's case-sensitive dictionary, `OrthographicConsistency` no longer flags a lowercase “latex” (2.12.0 did) and still flags “bibtex” and “arxiv”.
- **Word lists.** Importing Spectrum's supplement into Harper changed nothing with SpellCheck off, so Harper needs no word lists.
- **Memory** (2.12.0 build). Five dialect linters in one WASM instance: about 230 MB and 490 ms for the first, under 10 MB and 10 ms for each further one.
- **Sources.** wooorm/dictionaries at the pinned commit lists 92 dictionaries; `sr-Latn`, `nn`, `eu`, `is` and `ka` were fetched. Catalan's affix file says `WORDCHARS ·-'`. LibreOffice's Indonesian affix file says `SET ISO8859-1`. OpenCC 1.1.9's `HKVariants.txt` maps 戶, 溫, 稅 and 脫 to 户, 温, 税 and 脱, which `STCharacters.txt` also counts as Simplified.

### The design

#### What you will see

Settings › Spelling & grammar gets four parts, and your word list stays at the end, as now.

**Languages**, under the hint “Spectrum checks each paragraph in one of these languages, and only these. It works out which one from the text. When a paragraph could be more than one, it uses the one higher in the list.”

- One row per language: its name in Australian English from the system (`Intl.DisplayNames`, which gives “Australian English”, “British English”, “English (India)”, “Traditional Chinese”, “Brazilian Portuguese” and “Serbian (Latin)”), what checks it, then up, down and remove buttons.
  - Spelling: “Spelling: built in”, “Spelling: downloaded”, “Spelling: downloading…”, “Spelling: download failed” with “Try again”, “No spelling dictionary” or, for Traditional Chinese, “Marks Simplified characters”.
  - Grammar: “Grammar: Harper”, “Grammar: LanguageTool”, “Grammar: needs LanguageTool” or “No grammar checker”.
- “Add a language…” opens the catalogue (about 80 languages, below) with a search field.
- With a project open, “All projects” and “This project” switch the list being edited, as Settings › Skills does. “This project” first reads “This project uses your list.” with “Give this project its own list”. A project's list travels with the project; “Use my list” removes it.
- Under the list: “A language’s dictionary downloads from GitHub the first time it is needed. Most are under 6 MB.” and “Remove unused dictionaries (12.4 MB)”.

**Spelling**: “Check spelling as you type”, as now, and “Hunspell 1.7.6 · Ready” with the built-in dictionaries and, for each downloaded one, where it came from and its licence (“German: wooorm/dictionaries, GPL-2.0 or GPL-3.0”).

**Grammar**:
- “English grammar”: “Harper (on this computer)” or “LanguageTool”, with “Harper checks English only. Other languages use LanguageTool.”
- “Include style suggestions” and “Serial (Oxford) comma” as now. The serial comma's hint adds “Harper only.”
- “Harper 3.0.0 · Starts with the first check · Australian, American, British, Canadian and Indian English”.

**LanguageTool**, a “Connection” choice:
- “Off”: “Without LanguageTool, Spectrum checks grammar in English only.”
- “On this computer”: “Spectrum downloads LanguageTool 6.6 (252 MB) and a Java runtime (42 to 49 MB) into its data folder when you ask, and runs them only while you check grammar. Nothing you check leaves this computer.” Then “Download”, progress (“Downloading LanguageTool: 120 of 252 MB”), “Remove” and “LanguageTool 6.6 · Java 21.0.13 · Starts with the first check”.
- “A LanguageTool server”: “Server address” (such as `http://localhost:8081`) and “Test connection”, which shows “LanguageTool 6.8 · 31 languages”. For an address that is not this computer: “This server is on another computer, so the paragraphs it checks are sent to it.” For such an address over `http`: “This address is not encrypted (http), so the text you check can be read on the network.” LanguageTool's free public server is refused: “Spectrum does not use LanguageTool’s free public server, which asks apps not to send automated requests. Use LanguageTool Premium or run LanguageTool on this computer.”
- “LanguageTool Premium”: “Email” and “API key”, “Test connection” and “Forget key”, with “Only paragraphs in languages LanguageTool checks go to LanguageTool’s servers in Germany, only when you check grammar and never as you type. Your LaTeX commands, maths, comments and text in other languages are not sent. LanguageTool says it does not keep the text. Your key stays on this computer and is never shared with your other computers.”

**In the editor and the grammar panel**:
- A misspelt word is underlined by its paragraph's language, and right-click suggests words in that language. Text in a language that is not on the list is left alone.
- The grammar panel's header names the languages in the file (“Australian English and Traditional Chinese · main.tex”). With more than one language checked, each issue shows its language. Typst files can be checked as well.
- While LanguageTool checks, the panel reads “Checking with LanguageTool… A long file can take a minute.” with “Cancel”. Editing during the check does not start it again: the results arrive mapped onto the text as it now is, with “The file changed during the check.” and “Check again”.
- The end of the list says what was not checked and why, for example “Not checked: 3 paragraphs of Traditional Chinese, which has no grammar checker.”, “German needs LanguageTool. Turn it on in Settings › Spelling & grammar.” with “Open Settings”, “LanguageTool is not downloaded yet.” with “Download (about 300 MB)”, “Cancelled: 2 of 4 parts checked.” or “LanguageTool stopped before it finished: 2 of 4 parts checked.” A check that could not run never says “No grammar issues found”.

#### The language list

- A new app setting, `languages: string[]`, holds BCP 47 tags from the catalogue, default `['en-AU']`. Order matters: the first entry is the fallback.
- A project can have its own list in `.spectrum/settings.json` (`language.languages`). It replaces yours for that project and travels with it. If two computers both change it before syncing, the merge keeps this computer's list (as `mergeMeta` does for any list); you see it in Settings and can change it again.
- The editor sends the list in effect with each check, as it sends the serial comma today.

#### How a paragraph's language is decided

The masked prose is cut into paragraphs at blank lines, and each paragraph is cut again where explicit language markup starts or ends. Each piece first gets its own verdict, a language or “undecided”, which depends only on its text, its explicit language, the document's main language and the list. Verdicts are cached on exactly those four things. Then the pieces are resolved in document order: an undecided piece takes the resolved language of the piece before it, else the fallback. Resolution is cheap and is never cached, so changing one paragraph or the document's main language updates every paragraph that inherited from it.

1. **Explicit markup wins.** babel and polyglossia (`\foreignlanguage`, the `otherlanguage` environment, `\selectlanguage`, `\text<language>` and the `<language>` environment), Typst `#text(lang: …, region: …)[…]` and Pandoc `{lang=…}` spans and divs fix the language of their text without detection. The document's main language (babel's `main=` or last option, `\setmainlanguage`, a top-level `#set text(lang: …)`, Markdown front matter `lang:`) becomes the fallback for that document in place of the list's first entry. Markup chooses the language and the list chooses the variant: `british` with only Australian English listed is checked as Australian English, unless British English is listed too. A language named in markup but not listed is not checked.
2. **Script first.** Letters are grouped by their Unicode script, and each catalogue entry names its script (Latin, Cyrillic, Greek, Arabic, Hebrew, Armenian, Georgian, Devanagari, Tamil, Thai, Khmer, Hangul, Han and kana among them). Han in a paragraph that has kana counts as Japanese. Spaces, digits and punctuation join the run before them. A run in a script no listed language uses is not checked.
3. **One candidate.** If only one listed language uses that script, the run is in that language.
4. **Variants are never guessed.** If the candidates are variants of one language, such as Australian and US English or Eastern and Western Armenian, the first listed wins. Spelling cannot tell them apart reliably, and guessing would hide the misspellings the check is for: a paragraph with “color” would turn American.
5. **Traditional or Simplified.** With both Chinese forms listed, OpenCC's tables decide, using only characters that are Simplified in every standard: OpenCC's Simplified-only set less the forms that `HKVariants.txt` and `TWVariants.txt` give as standard in Hong Kong or Taiwan (温, 税, 脱 and 户 among them) and less characters that are their own Traditional form (台, 里). The builder records the final counts. Text with neither, such as 研究方法, is undecided.
6. **Different languages in one script.** The candidates' own dictionaries vote: the language that accepts most of the piece's first 40 words wins when it leads clearly (decision 1 gives eld as the other choice). Only dictionaries already on this computer vote. While a listed candidate's dictionary is missing (still downloading, or the download failed), a piece is decided only if the winner accepts at least 80 per cent of its words; otherwise it is undecided and its spelling waits unmarked. A piece that is too short or too even, such as “Introduction” or “Conclusion”, is undecided.

Detection lives in the backend's main thread (`detect.js`), not in the spell worker. The vote asks the worker; if the worker is not running (a build without the binding), the vote answers undecided and grammar still runs.

Your example, with Australian English and Traditional Chinese listed:

| Text | Checked as | Spelling | Grammar |
| --- | --- | --- | --- |
| “The colour of the samples…” | Australian English | en_AU, AussieDic and the supplements | Harper, Australian |
| “The color of the samples…” | Australian English, as US English is not listed | “color” underlined | Harper, Australian |
| “研究結果顯示…” | Traditional Chinese | Stray Simplified characters marked (decision 5) | None, reported as not checked |
| “研究结果显示…”, mostly Simplified | Traditional Chinese, as Simplified Chinese is not listed | Left alone: a mostly Simplified passage is not marked | None |
| A Hong Kong paragraph with 温 and 税 | Traditional Chinese | No marks: these are Hong Kong standard forms | None |
| “the term 關係 means…” | Australian English, with 關係 as Traditional Chinese | English checked, 關係 left alone | Harper reads the English with 關係 blanked |
| “日本語の文章です。” | Not checked, as Japanese is not listed | None | None |
| A French quotation without markup | Australian English, the only listed language in Latin script | Its French words are underlined, as today | Harper, as English |
| `\foreignlanguage{french}{…}` | Not checked, as French is not listed | None | None |

#### Spelling

- **Engine.** Hunspell 1.7.6 (26 October 2026) through a binding of Spectrum's own, about 120 lines in place of nodehun's 1,000 or so: open a dictionary from its two paths, add a dictionary, spell a batch of words, suggest and report the library version. Hunspell 1.7.6 reads dictionaries only from paths. On Windows a UTF-8 path must start with `\\?\`, or Hunspell opens it in the system code page and a user folder with letters outside that code page fails (`myopen` in its `csutil.cxx`). The binding reads `get_dict_encoding()`: words go to a UTF-8 dictionary as they are and to an ISO-8859-1 one as Latin-1 bytes (a word with a character above U+00FF is misspelt there), and suggestions come back the same way. The binding is built as nodehun is now: universal on the Mac (arm64 and x86_64, signed ad hoc, loaded under the existing `disable-library-validation` entitlement) and x64 in the Windows workflow.
- **One speller per language**, loaded the first time a paragraph needs it and dropped after 30 minutes unused, except the first listed language. Australian English keeps today's chain: en_AU, then the AussieDic words that are not American, then the supplements. The other English variants use their own SCOWL dictionary, and Indian English uses en_GB.
- **The supplement is split.** `spectrum-extra.dic` keeps the TeX names, research terms and Latin abbreviations and is added to every language's speller. The Australian words (defence and the Australian place, language, university and agency names) move to a new `spectrum-extra-au.dic` for Australian English only, so US English still flags “defence”.
- **Your words** on your list and the project's stay the same for every language and are applied before any engine, as now.
- **Words.** Each language uses the fixed word pattern plus its dictionary's `WORDCHARS` punctuation, which joins letters only between letters: Catalan's `·` keeps “col·legi” one word, Hebrew's `"` keeps an acronym such as צה"ל whole, and the hyphen keeps French and Dutch compounds whole so Hunspell's own `BREAK` rules check their parts. Digits are never added, and the English dictionaries keep today's pattern, so English answers do not change. Thai, which has no spaces between words, uses `Intl.Segmenter` (Node includes it, and it splits “ภาษาไทยไม่มีช่องว่าง” into five words). Chinese and Japanese make no words, as Hunspell cannot check them.
- **Traditional Chinese** (decision 5). In a paragraph that is mostly Traditional, a character in the Simplified-only set above is underlined, with its Traditional forms as suggestions (发 offers 發 and 髮). A paragraph that is mostly Simplified is left alone, and Hong Kong and Taiwan standard forms are never marked.
- **Downloads never block what is there.** A language whose dictionary is missing waits unmarked; every other language keeps being checked. A failed download is not tried again until you press “Try again” or Spectrum next starts, and Settings shows “Spelling: download failed”.

**What “every language Hunspell fully supports” means.** A language is offered when a maintained, pinned source has a Hunspell dictionary for it with an affix file, an open licence, UTF-8 or ISO-8859-1 text and a dictionary that passes a three-word self-test, and when LanguageTool checks a language with no dictionary, it is offered for grammar only. The catalogue step checks every entry and prints the final list for you before the build. Chromium's 47 dictionaries are the narrower choice (decision 2).

| Group | Languages | Source |
| --- | --- | --- |
| Built in | Australian, American, British, Canadian and Indian English | SCOWL 2026.02.25 large, still SCOWL's latest. en_GB-large and en_CA-large are new; Indian English uses en_GB |
| Downloaded when needed, checked for this plan (35) | Armenian, Bulgarian, Catalan, Croatian, Czech, Danish, Dutch, Estonian, Faroese, French, Galician, German, Greek, Hebrew, Hungarian, Italian, Korean, Latvian, Lithuanian, Norwegian Bokmål, Persian, Polish, Portuguese (Brazil), Portuguese (Portugal), Romanian, Russian, Serbian (Cyrillic), Slovak, Slovenian, Spanish, Swedish, Turkish, Ukrainian, Vietnamese and Welsh | wooorm/dictionaries at commit `8cfea406b505e4d7df52d5a19bce525df98c54ab`. From 0.04 MB (Vietnamese) to 19.4 MB (Greek), most under 6 MB, about 144 MB for all 35 |
| Downloaded when needed, the same source, to be checked by the catalogue step (24) | Basque, Breton, Esperanto, Friulian, Georgian, Icelandic, Interlingua, Interlingue, Irish, Kinyarwanda, Latgalian, Latin, Low German, Luxembourgish, Macedonian, Mongolian, Nepali, Norwegian Nynorsk, Occitan, Scottish Gaelic, Serbian (Latin), Turkmen, Western Armenian and Western Frisian | The same wooorm commit. Serbian is two entries, Cyrillic and Latin, because each entry has one script |
| Downloaded when needed (7 or more) | Afrikaans, Albanian, Hindi, Indonesian (ISO-8859-1, ASCII words), Tamil and Thai, Arabic once the catalogue step confirms it, and any other LibreOffice dictionary for a language the sources above lack that passes the checks | LibreOffice/dictionaries at commit `4f1df64b2e8e14751aa7c2205d170ca016071315` |
| Grammar only, through LanguageTool | Simplified Chinese, Japanese, Asturian, Belarusian, Crimean Tatar, Khmer and Tagalog | Found by script. The catalogue step moves any of them to a dictionary row if a source has one |
| Marks only | Traditional Chinese | OpenCC tables (decision 5) |
| Left out | Klingon (two wooorm entries, one in a private use script; a catalogue row each if you want them) and Tajik (no maintained source found). Regional variants beyond English and Portuguese are decision 3 | |

Each downloaded dictionary comes with its licence file and stays unmodified, as AussieDic (GPL-3.0) already does in the app. The licences range from MIT and BSD (Turkish, Russian and Lithuanian) through MPL and LGPL to GPL and AGPL (Hebrew). Settings shows each one's licence. GitHub serves these files compressed (German's 1.1 MB `.dic` arrives as 333 KB).

#### Grammar

| Language | Default | Option |
| --- | --- | --- |
| English, five dialects | Harper 3.0.0, one linter for each dialect in use | LanguageTool (Indian English as en-GB, which LanguageTool has) |
| Arabic, Asturian, Belarusian, Breton, Catalan, Crimean Tatar, Danish, Dutch, Esperanto, French, Galician, German, Greek, Irish, Italian, Khmer, Persian, Polish, Portuguese (both), Romanian, Russian, Slovak, Slovenian, Spanish, Swedish, Tagalog, Tamil, Ukrainian, Simplified Chinese and Japanese | LanguageTool, once it is connected | None |
| The rest, among them Traditional Chinese, Korean, Thai, Hebrew, Czech and Turkish | None, reported as not checked | None |

LanguageTool's depth varies: 6,074 XML rules for English, 32 for Swedish and none for Traditional Chinese. When connected to a server, Spectrum takes that server's own language list from `GET /v2/languages` and reports any listed language it lacks.

**Harper.** Spectrum keeps its own pinned build (`wasm-pack --no-default-features`, without Typst or the thesaurus) rather than harper.js, as the research advised. The worker keeps one linter per dialect in use. SpellCheck stays off because Hunspell spells. Each linter reads only its dialect's text: everything else is blanked to spaces, so the offsets stay as they are.

**The LanguageTool connection** has four modes. The mode, server address, email and key are kept in `DATA_DIR/languagetool.json`, readable by you only and written as `github.json` and `zotero.json` are. Settings reads the mode, address and email so you can edit them; the key never leaves the backend (the status carries `hasKey` only). None of it goes to the settings repository or a template, and agents cannot read the file (their sandbox reads only `DATA_DIR/engines` of the data folder).
- **Off**, the default.
- **On this computer.** LanguageTool 6.6 is the last version published as a single download (March 2025); 6.7 and 6.8 were tagged but not published as one, and 6.8 is on Maven Central as separate jars (decision 6). It comes with a Temurin 21 Java runtime. Both are pinned with their SHA-256 in `engines.json`, downloaded only when you click Download and kept in `DATA_DIR/engines`. Spectrum starts `languagetool-server.jar` on a free port on this computer the first time a check needs it, with a 1 GB memory cap, and stops it after 10 minutes without a check and when Spectrum quits, as it does TexLab.
- **A server address.** Any LanguageTool you run already, through Docker, Homebrew or on another computer. Addresses on `api.languagetool.org` and `languagetool.org/api` are refused, as the 2.1 plan section 4.4 asks.
- **Premium.** `https://api.languagetoolplus.com/v2` with your email and API key in the request body, never in the address.

**Requests** go only from the grammar panel, never as you type.
- **Only that language's text.** Each request carries one language's runs and nothing else. Spectrum builds LanguageTool's `data` form from its masks: prose is `text`, and each masked stretch inside a run is `markup` sent as the same number of spaces with an `interpretAs` of a space, `x` for inline maths or nothing for a citation or reference just before punctuation (so “bread \cite{key}.” reads “bread.”). No LaTeX source, comment or text in another language is sent. Runs are joined by a `markup` paragraph break.
- **Offsets.** LanguageTool counts offsets in UTF-16 code units over the whole `data`, markup included, which are the editor's own units. Spectrum keeps a table of each run's start in the request and in the file and maps every match back through it (to confirm against a real server in live check L3).
- **Parts.** Each language's runs go in parts of at most 20,000 characters, cut at the end of a run or paragraph. Premium takes parts of up to 60,000 characters, its published limit, and Spectrum paces them under its published 300,000 characters and 80 requests a minute.
- **Fields.** `disabledCategories=TYPOS` is sent where Hunspell spells the language, so a misspelling is not reported twice, and `disabledRules` carries the project's ignored rules for that language. With style suggestions on, `level=picky` is sent too, as most of LanguageTool's style rules need it.
- **Kinds** come from LanguageTool's categories: GRAMMAR is Grammar, TYPOGRAPHY Formatting, CASING Capitalisation and so on. STYLE and REDUNDANCY show only with style suggestions on. The serial comma setting is Harper's and does not apply.
- **Edits and cancelling.** A check that used LanguageTool is never restarted by an edit. `grammarField` already maps the marks through edits; it also keeps the changes made since the check started, and late results are mapped through them onto the current text. A check that used only Harper still starts again on an edit, as now, since it is quick and local. “Cancel” aborts the panel's request; the backend aborts its remaining parts when the request closes, so no further part is sent.

**Ignoring a rule.** Harper's ignored rules stay in `.spectrum/grammar.json`, read through a rename map (`NobelPeacePrize` ignores `NobelNoble` too). The file is never rewritten for the rename, so 1.10.4 and 2.0 read it as before. LanguageTool's go to `.spectrum/settings.json` as a top-level group, `languageToolIgnored: { "de:RULE_ID": true }`, one key per rule (decision 8). One key per rule means `mergeMeta` merges two computers' ignored rules rule by rule with no change to `mergeRules.js`, where a list per language would lose one side's change. Rule names are never translated between the two engines.

**When LanguageTool cannot check**, the panel's summary and Settings say so:

| State | Message |
| --- | --- |
| Off, and a listed language needs it | “German needs LanguageTool. Turn it on in Settings › Spelling & grammar.” |
| Not downloaded yet | “LanguageTool is not downloaded yet.” with “Download” |
| Download failed | “Could not download LanguageTool. Check the internet connection and try again.” or “The download did not match its checksum, so it was not installed.” |
| Stopped or would not start | “LanguageTool stopped (exit code 1).”, its last lines under “Diagnostic details” |
| Server unreachable | “Could not reach the LanguageTool server at http://… Check that it is running.” |
| Language not on that server | “This LanguageTool server does not check Tamil.” |
| Premium refused | “LanguageTool did not accept the email and API key.” |
| Premium limit | “LanguageTool’s limit was reached. Try again in a minute.”, with the parts already checked |
| Too slow | “LanguageTool took too long to answer.” |
| Cancelled | “Cancelled: 2 of 4 parts checked.” |

When English is set to LanguageTool and LanguageTool is off or failing on this computer, Harper checks English and the summary says so.

#### Settings, sharing and going back

| What | Where | Shared | Older versions |
| --- | --- | --- | --- |
| `languages` and `englishGrammar` | App settings, in the window's storage | Yes, through the settings repository (`SHARED_KEYS`) | 1.10.4 and 2.0 keep keys they do not know and ignore them; `keysBackFromOlder` brings them back from the newest computer's file |
| A project's list | `.spectrum/settings.json` under `language.languages` | With the project through GitHub; changed on both sides, this computer's list is kept | 1.10.4 ignores the file; 2.0 keeps keys it does not know when it writes it |
| LanguageTool's ignored rules | `.spectrum/settings.json` under `languageToolIgnored`, one key per rule | With the project, merged rule by rule | As above |
| Harper's ignored rules | `.spectrum/grammar.json`, unchanged | No, as in 2.0 | Read as before. 1.10.4 and 2.0 rewrite only `ignoredRules`, which is all that is in it |
| The LanguageTool connection and key | `DATA_DIR/languagetool.json`, mode 0600 | Never | Ignored |
| Downloaded dictionaries, LanguageTool and Java | `DATA_DIR/dictionaries/<tag>/` with a `source.json`, `DATA_DIR/engines` | No: each computer downloads its own | Ignored. A 2.1.x whose catalogue differs from a folder's `source.json` downloads its own copy |
| Your words | `DATA_DIR/dictionary.txt`, `.spectrum/dictionary.txt` | As now | Unchanged |

No key is added to `project.json`.

#### Effect on the DMG

| Change | Installed | DMG |
| --- | --- | --- |
| Harper 2.12.0 to 3.0.0 | +4.1 MB (the WASM grows from 16.0 to 20.1 MB) | +0.3 MB |
| en_GB-large and en_CA-large | +1.7 MB | +0.6 MB |
| The Hunspell binding in place of nodehun | About the same (nodehun.node is 0.95 MB) | About the same |
| Catalogue and OpenCC tables (with the Hong Kong and Taiwan variant tables) | +0.2 MB | +0.05 MB |
| eld, only if decision 1 picks it | +0.9 MB | +0.3 MB |
| LanguageTool and Java | Not bundled | Nothing |
| Total | About +6 MB | About +1 MB, so the 210 MB DMG becomes about 211 MB |

Bundling LanguageTool with both Mac Java runtimes instead would add about 340 MB, for a DMG of about 550 MB. Harper's figures come from harper.js 3.0.0's slim build, which has the same features as Spectrum's.

### Implementation steps

Branch from the newest `feat/2.0` once the reviews still open in `SPECTRUM_2_HANDOFF.md` are done (phase 4's second round, then phase 5's). Each step ends when its check passes.

**Before step 1, for you.** Delete the four untracked files in the main checkout's `native/harper` (`.gitignore`, `README.md`, `harper_wasm.d.ts` and `harper_wasm_bg.wasm.d.ts`), as the handoff's list of things only you can do asks; that `.gitignore` hides new files in the folder from git. Builders work in a fresh worktree, which does not have them. Check: `git status native/harper` is clean in the main checkout.

**Step 1. Harper 3.0.0 with five dialects (S).**
1. `native/checkers.lock.json` `harper`: `version` `3.0.0`, `commit` `dd536c3009d8f4f8e8e28841fe3115dc944d67bb`, `url` `https://codeload.github.com/Automattic/harper/tar.gz/dd536c3009d8f4f8e8e28841fe3115dc944d67bb`, `sha256` `e46bd0e3d7481c19e6b98d4be2947d755f8e50e0336036fb657f394eac28f837` (downloaded and checked for this plan). Run `node scripts/native.mjs harper`; its flags stay as they are.
2. `grammarWorker.mjs`: a `Map` of linters by dialect, each made with `harper.Linter.new(harper.Dialect[name])` on first use and given `BASE` and the serial comma, with its own `configured` value. Each message carries `dialect`, `Australian` when absent.
3. `grammarService.js`: `const RENAMED = { NobelPeacePrize: 'NobelNoble' }`. `readIgnoredRules` adds the new name of each renamed rule to what it returns; `changeIgnoredRule(…, remove)` also removes the old names of a rule it removes. `grammarStatus` returns `languages: ['en-AU', 'en-US', 'en-GB', 'en-CA', 'en-IN']` in place of `language`.
4. `GrammarPanel.tsx`: `Regionalism: 'Regional word'`; `CHECKABLE` takes `.typ`, and the message for other files names Typst.
- Check: the build's own test (“This is a apple.”); `npm run checkers:verify` shows Harper 3.0.0 verified; the grammar test in `language.test.js` passes unchanged; T7.

**Step 2. Hunspell 1.7.6 through Spectrum's own binding (M).**
1. `native/hunspell/core/`: Hunspell 1.7.6's `src/hunspell`, `COPYING`, `COPYING.LESSER`, `COPYING.MPL`, `license.hunspell`, `license.myspell` and `AUTHORS`, unmodified, from tag commit `15faca15532b34db3106d50f162e5edc2503d6d6` (codeload archive SHA-256 `58eb4c2933c2c4c20952c3022fcbf99c0f1d95eaaeda35ad32ac1706b34194d6`, checked). `CORE_INPUTS` in `native.mjs` (line 54) becomes this list.
2. `native/hunspell/binding.cc`, Spectrum's own under MIT: a node-addon-api class `Speller` with `new Speller(affPath, dicPath)`, `addDic(path)`, `spell(words: string[]): boolean[]`, `suggest(word: string): string[]`, `encoding()` and a static `version()` from `Hunspell::get_library_version()`. For an `ISO8859-1` dictionary it converts words to Latin-1 and suggestions back; any other non-UTF-8 encoding is refused when the speller opens. Calls are synchronous; the spell worker's thread makes them.
3. `native/hunspell/binding.gyp` builds a static `hunspell` library from `core/src/hunspell/*.cxx` with `HUNSPELL_STATIC` defined, then the addon. No configure step is needed: no library source includes `config.h`, and `hunvisapi.h` and `hunversion.h` come with the release. It uses no C++ exceptions and needs C++14 or later. Add `/utf-8` for MSVC. `native/hunspell/package.json` and its lock pin node-addon-api 8.5.0, as nodehun's do.
4. `scripts/native.mjs`: `buildHunspell` replaces `buildNodehun` with the same flow (source hash, node-gyp for each architecture, `lipo`, ad hoc `codesign`, self-test, manifest, install). The command `hunspell` replaces `nodehun`, and `--update` reads the archive's root, where nodehun's had a `hunspell/` folder. The lock's `hunspell` keeps `version`, `commit`, `url`, `sha256` and `sourceHash`, and drops `variant` and `providerVersion`. The self-test adds `Speller.version() === '1.7.6'` and loads en_AU from a temporary folder named `spectrum-拼写-é`.
5. `spellWorker.mjs`: loads `hunspell.node` (the platform folder first, as now) and passes every path through `hunPath(p)`: unchanged on macOS; on Windows `\\?\` and the absolute path with backslashes (`\\?\UNC\server\share\…` for a network path).
6. `spellService.js` `spellStatus` reads `hunspell.manifest.json` and checks `hunspell.node`. `CheckerDetails` names “Spectrum’s Hunspell binding” where it named nodehun (line 1600).
7. `scripts/desktop.mjs` `resources()` copies `hunspell.node` and its manifest, from `native/win32-x64/` on Windows. In `windows.yml` the step becomes “Spell checker (Hunspell)” running `node scripts/native.mjs hunspell`, keeping `continue-on-error` outside a release.
8. Delete `native/nodehun/`, `native/nodehun.node` and `native/nodehun.manifest.json`. Update the README's build section and THIRD_PARTY_NOTICES (Hunspell 1.7.6 under the MPL 1.1 of its three licences; the nodehun row goes).
- Check: `lipo -info native/hunspell.node` lists arm64 and x86_64; `npm run checkers:verify` passes; `language.test.js` gives today's answers; the Windows workflow builds the binding, runs its self-test and `npm test`; T5.

**Step 3. English dictionaries and the split supplement (S).**
1. `dictionaries/en_GB/` and `dictionaries/en_CA/` from SCOWL 2026.02.25's `hunspell-en_GB-large-2026.02.25.zip` (SHA-256 `704a49438a3a9d4f11cd76db433a6b230b9ce8770ee13fa28700052c4517ddc1`) and `hunspell-en_CA-large-2026.02.25.zip` (`b4b7bf4a7885de1c35fa1b3aa68317209afa58f04d60e8a07e124693485c59e3`), unmodified apart from their names, with each zip's README as `LICENSE`.
2. `spectrum-extra-au.dic` takes defence, defences, defenceless and the Australian place, language, university and agency names. `spectrum-extra.dic` keeps the rest.
3. `checkerMetadata.js` `DICTIONARY_FILES`, the lock's `dictionaries.components`, `node scripts/native.mjs dictionaries` (the manifest) and the table in `dictionaries/README.md`, which keeps the AussieDic and supplement rows with their links.
4. The worker's never-suggest list reads all four SCOWL dictionaries.
- Check: the Australian test is unchanged; for each variant, a few distinguishing words the builder confirms by hand (“colour” and “color”, “defence” and “defense”) become its self-test.

**Step 4. The catalogue and dictionary downloads (M).**
1. The lock gains `dictionarySources`: `wooorm` at `8cfea406b505e4d7df52d5a19bce525df98c54ab` and `libreoffice` at `4f1df64b2e8e14751aa7c2205d170ca016071315`, each with its tags and the file that holds each one's licence.
2. `node scripts/native.mjs catalogue` writes `apps/backend/src/data/languages.json`, one entry per language: `{ tag, script, babel: [names], harper: dialect | null, languageTool: code | null, wordChars: string, spelling: { bundled: folder } | { files: { aff, dic, licence: [url, sha256, bytes] }, encoding: 'UTF-8' | 'ISO8859-1', licence: SPDX, selfTest: [3 words] } | null }`. `wordChars` is the `.aff` file's `WORDCHARS` without digits. It refuses a dictionary with any other `SET`, with no licence file, or whose self-test words are rejected, and prints every language it kept and every one it refused with the reason. It also adds the LanguageTool languages that have no dictionary. `catalogue --check` downloads every file again and compares, for use before a release.
3. `spellService.js` `installDictionary(tag)` fetches the three files into `DATA_DIR/dictionaries/<tag>.part-<uuid>/`, checks each SHA-256, the encoding and the self-test, writes `source.json` (`{ tag, source, commit, files: { name: sha256 } }`), moves any old `<tag>/` aside to `<tag>.old-<uuid>/` (Windows cannot rename over a folder), renames the new folder into place and deletes the old one; one download per language at a time (`serialiser`). Loading a dictionary compares its `source.json` with the catalogue and downloads a fresh copy when they differ. A failed download is remembered until “Try again” or the next start. `useLanguageList(next)` lets tests use another catalogue, as `useEngineList` does.
4. `routes/language.js`: `GET /api/languages` (each language with its state on this computer: `bundled`, `downloaded`, `available`, `downloading`, `failed` or `none`, its size and licence), `POST /api/languages/:tag/dictionary` and `POST /api/languages/prune` with `{ keep }`.
- Check: T6; `catalogue --check` passes; the printed list goes to you before the build ships.

**Step 5. Detection and spelling by paragraph (L).**
1. `mask.js` `proseWords(text, { wordChars })`: letters of the Han, Hiragana, Katakana, Thai, Lao, Khmer and Myanmar scripts no longer make words, and `wordChars` join letters only between letters. On its own the first part ends the underlined Chinese runs.
2. A new shared `apps/backend/src/language/markup.js` with `markup.d.ts` (the editor imports it as it imports `mask.js`): `languageMarkup(source, kind)` returns `{ main, ranges: [{ from, to, lang }] }` for the markup listed under detection. babel and polyglossia names map through the catalogue's `babel` lists. Typst's `lang` and `region`, Markdown's `lang` and Pandoc's attributes are BCP 47 already; regions TW, HK and MO mean Traditional Chinese, CN and SG Simplified.
3. A new `apps/backend/src/language/detect.js`, run in the backend's main thread: `verdict(piece, { languages, main, vote })` returns a language or `null` by the rules above, cached by text, explicit language, `main` and the list; `resolve(verdicts, fallback)` walks them in order. `vote` asks the spell worker and answers `null` when the worker is not running. OpenCC's `STCharacters.txt`, `TSCharacters.txt`, `HKVariants.txt` and `TWVariants.txt` from tag `ver.1.1.9`, with OpenCC's Apache-2.0 licence, go in `apps/backend/src/data/opencc/`; the marked set is built from them at load.
4. `spellWorker.mjs` keeps one speller per language, loaded on first use (after its catalogue self-test) and dropped after 30 minutes unused, and a `lang:word` answer cache. Its requests: `vote` (a piece's first 40 words and the candidate languages present), `check` (`{ lang, words }`) and `suggest` (`{ word, lang }`). `spellService.js` gives `suggest` a 3-second limit and answers no suggestions when it passes.
5. `spellService.js` `checkPieces({ languages, main, pieces, projectId })` resolves the pieces, drops your words as `checkWords` does now and checks each resolved piece whose dictionary is present. A listed language without its dictionary starts its download (unless it failed this session) and is returned in `pending`; only pieces resolved to it wait. `POST /api/spell/check` takes `{ projectId, languages, main, pieces: [{ text, lang? }] }` in document order (at most 200 pieces and 200,000 characters) and answers `{ pieces: [{ lang, misspelt: [[from, to]] }], pending }`. `POST /api/spell/suggest` takes `lang`.
6. `spellcheck.ts` cuts the masked prose into pieces and sends the pieces near the view plus up to 20 before them, so an undecided piece can inherit. It sends nothing when the pieces, main language and list are the same as last time; the backend's caches make a repeat cheap. It draws the ranges, keeping each one's language in its decoration; `opts.languages()` gives the list. `EditorPage.tsx` keeps the project's list from `getProjectSettings` (as it keeps `compile`, line 2270) and sends `lang` with `spellSuggest`. `ponytail:` an undecided piece more than 20 pieces after the last decided one takes the fallback; a longer lookback can follow if that shows up.
- Check: T1 to T4; typing stays smooth in a 500-page file.

**Step 6. The list in Settings, a project's own list and sharing (M).**
1. `settings.ts`: `languages` (default `['en-AU']`) and `englishGrammar` (`'harper' | 'languagetool'`, default `'harper'`). `parse` keeps well-formed tags once each, at most 20, and falls back to `['en-AU']`. Both join `SHARED_KEYS`, and `languages` joins `ownShared`'s list of keys never sent at their default (line 530), as the personas did.
2. `routes/projects.js` `PATCH /api/projects/:id/settings` (lines 480 to 497) accepts `language: { languages: string[] | null }`; `null` removes the project's list. `client.ts` gains `ProjectSettings.language`.
3. `SettingsSheet.tsx`: `LanguagePane({ projectId })` with the list, the picker, the scope switch from `SkillsPane` (lines 1834 to 1849), the English grammar choice and the LanguageTool part (steps 7 to 9).
- Check: new cases in `settings.check.ts`; T10; T11.

**Step 7. LanguageTool through a server address (L).**
1. A new `apps/backend/src/services/languageToolService.js`: `readConnection()` and `saveConnection()` on `DATA_DIR/languagetool.json` (mode 0600, a temporary file then `renameOver`, like `zoteroService.js` `saveKey`, line 119). `languageToolStatus()` returns the mode, address, email and `hasKey`, never the key, and `remote` and `plainHttp` for the address warnings. `testConnection()` asks `GET /v2/languages`, then checks one sentence to read `software.version`. Addresses on `api.languagetool.org` or `languagetool.org/api` are refused.
2. `checkWithLanguageTool({ prose, runs, code, ignored, spelt, style, signal })` builds the parts and the `data` annotation from that language's runs only, with the run-start table, posts form fields `data`, `language`, `disabledRules`, `disabledCategories` and, with style on, `level=picky`, stops between parts when `signal` aborts and maps each match through the table to `{ rule: id, kind, from, to, message, suggestions: first 5 replacements, fixable, engine: 'languagetool', lang }`, with `fixable` worked out as Harper's is.
3. `grammarService.js` `checkGrammar`: masks as now, resolves the pieces with `detect.js`, sends each English dialect's runs to Harper (or to LanguageTool when `englishGrammar` says so and it answers) and every other language's runs to LanguageTool. It returns `issues` with `engine` and `lang`, and `coverage: [{ lang, engine, chars, parts, done, state, message }]`. `routes/language.js` passes an `AbortController` whose signal fires when the request closes.
4. `POST /api/grammar/ignored` takes `engine` and `lang`: Harper's rules go to `grammar.json` as now, LanguageTool's to `languageToolIgnored` in `.spectrum/settings.json` through `updateProjectSettings`. `GET` and `PUT /api/languagetool` and `POST /api/languagetool/test` are new.
5. `client.ts` `grammarCheck` takes a `signal`. `GrammarPanel.tsx` sends `languages`, keeps an `AbortController` per run with a “Cancel” button, and shows each issue's language when more than one was checked, the coverage and any partial check. `grammarField` keeps the composed `tr.changes` since a check started (a new effect starts and ends the record); `run()` keeps its restart on edit only when no part went to LanguageTool, and otherwise maps each issue's `from` and `to` through the record and shows “The file changed during the check.” with “Check again”.
- Check: T8.

**Step 8. LanguageTool on this computer (M).**
1. `apps/backend/src/data/engines.json` gains `languagetool` (6.6, `https://languagetool.org/download/LanguageTool-6.6.zip`, 251,998,221 bytes; the publisher lists no checksum, so the SHA-256 is computed when pinning) and `java` (a Temurin 21 JRE for each of `arm64`, `x64` and `win-x64`, with Adoptium's SHA-256).
2. `engineService.js` `install` (line 140) hashes while it downloads (it reads the whole file at line 159, which is 252 MB here), reports progress, can keep a whole folder and takes an address outside GitHub.
3. `languageToolService.js` `ensureServer()` starts `java -Xmx1g -cp languagetool-server.jar org.languagetool.server.HTTPServer --port <free port>`, which answers this computer only, in its own process group. It waits for `GET /v2/languages`, stops after 10 minutes without a check (TexLab's rule, `texlabService.js` line 17) and in `index.js` `quit()` beside `stopTexlab()` (line 159).
4. `POST` and `DELETE /api/languagetool/install`; the status carries the download's progress.
- Check: T8's install and start cases; live check L3.

**Step 9. LanguageTool Premium (S).** The `premium` mode posts to `https://api.languagetoolplus.com/v2/check` with `username` and `apiKey` in the body, parts of up to 60,000 characters and pacing under the published limits, only from the panel. 401, 403 and 429 get their own messages and keep the parts already checked.
- Check: T8's Premium cases; live check L5 only if you choose.

**Step 10. Documents (S).** The README's spelling, grammar and build sections; THIRD_PARTY_NOTICES for Hunspell 1.7.6, Harper 3.0.0, SCOWL en_GB and en_CA, the OpenCC tables and eld if chosen, and, as downloads that are not bundled, the catalogue's dictionaries with their licences, LanguageTool under LGPL-2.1 and Temurin under GPL-2.0 with the Classpath Exception; the CHANGELOG.

### Tests and live checks

Backend tests (`node --test`) use no network and no paid service; servers are local stand-ins on 127.0.0.1, and the data folder is a scratch one.

| Test | What it proves |
| --- | --- |
| T1 Words and offsets | `proseWords` makes no words of Chinese, Japanese or Thai runs; Korean splits at spaces; `wordChars` keeps “col·legi” and צה"ל whole and never joins at a word's edge; positions after an emoji are UTF-16; a CRLF text keeps every position, through `maskLatex`, `maskTypst` and `maskMarkdown` |
| T2 Detection (`detect.js`, with stand-in spellers) | Your example row by row; the first entry is the fallback; with both Chinese forms listed, OpenCC decides and 研究方法 takes the previous paragraph's; a Hong Kong paragraph with 温 and 税 gets no marks; with Australian English and French listed, “Méthodes” is French and “Introduction” follows the paragraph before it; a chain of “Méthodes…”, “Introduction” and “Conclusion” turns English in all three when the first is rewritten in English; changing babel's main language changes every piece that used the fallback; with French listed but its dictionary missing, an English paragraph is still decided and a French one waits; markup wins; a language named in markup but not listed is not checked; Japanese with kana is not checked unless listed |
| T3 Markup | babel options and `main=`, `\selectlanguage`, `\foreignlanguage`, `otherlanguage*`, polyglossia, Typst `lang` and `region`, Markdown front matter and Pandoc spans and divs |
| T4 Spelling route | With the bundled English dictionaries and small test dictionaries in `test/fixtures` (one UTF-8, one ISO-8859-1): resolved languages, misspelt ranges and suggestions per language, your words for every language, `pending` while a dictionary downloads, Australian English still marked while French fails to download, a slow `suggest` answering no suggestions |
| T5 Binding | Version 1.7.6, today's Australian answers, a dictionary loaded from a folder named `spectrum-拼写-é` (on Windows this takes the `\\?\` path) and an ISO-8859-1 dictionary spelling and suggesting through Latin-1 |
| T6 Downloads | A download is checked and installed with its `source.json`; a checksum mismatch, an unsupported `SET` or a failed self-test leaves nothing behind; a `source.json` that differs from the catalogue brings a fresh copy and replaces the old folder; no connection gives a plain message and is not retried until “Try again” |
| T7 Harper | “flashlight” flagged in Australian English and “nappy” in American; the serial comma per dialect; an ignored `NobelPeacePrize` also hides `NobelNoble` and `grammar.json` is not rewritten |
| T8 LanguageTool (stand-in server) | The form fields, with the key in the body and never the address; with English on Harper, the German request holds no English text, no LaTeX source and no comment; the annotation for `\cite` before a full stop, inline maths and `\LaTeX`; offsets through the run table after an emoji, in Chinese and in CRLF text; a 50,000-character file split at paragraph ends; `level=picky` only with style on; Premium pacing on a fake clock; an aborted request sends no further part; refused connections, 401, 429, a timeout and bad JSON, each with its message and the parts already checked; both public hosts refused; the remote and plain `http` flags; no status holds the key and the file is 0600; the install path with a small archive; start, readiness and stop with a stand-in `java`; grammar still runs when the spell worker cannot start |
| T9 `checkers:verify` | Hunspell 1.7.6, Harper 3.0.0 and the dictionaries verified, and a changed file still fails it (the existing test, with the new names) |
| T10 Going back | `rollback.test.js`: 1.10.4 opens a project with `language` and `languageToolIgnored` in `settings.json` and ignores a Harper rule there, and 2.1 still finds its list and LanguageTool's ignored rules. The same test runs against the last 2.0 commit before this work |
| T11 Merging | `mergeRules` test: two computers ignoring different German rules keep both; one removing a rule while the other is unchanged removes it |

Frontend checks: `settings.check.ts` (parsing the list, both keys shared, `keysBackFromOlder` and `ownShared` with them), the piece cutting in `spellcheck.ts`, and `grammarField` mapping a late result through an edit made during the check, with no second check started.

Live checks, on real machines. Every backend started for a live check sets `SPECTRUM_TEST_BIN_DIR`, as the handoff requires, and none uses your real profile, projects, Zotero or GitHub account.

- **L1, Mac test DMG.** Settings shows Hunspell 1.7.6 and Harper 3.0.0. Adding German downloads its dictionary. A document in Australian English and Traditional Chinese: no paragraph checked as US English or Simplified Chinese, Chinese not underlined, stray Simplified characters marked (if decision 5 is yes). With the network off and French added, English is still checked. Memory with three languages loaded.
- **L2, Windows installer** from the workflow, on an account whose user folder has letters outside the system code page: German downloads and spelling works.
- **L3, LanguageTool on this computer.** Download time and size, first start time and memory, French and German issues in a LaTeX file with `\cite` and inline maths, each fix applied in the right place (this confirms the offsets), typing during a check and Cancel, no Java process left after quitting Spectrum and the stop after 10 idle minutes.
- **L4, a server address**: a LanguageTool you already run (Docker or Homebrew). Test connection shows its version and languages.
- **L5, Premium**: only with your own account and your say-so, as it is a paid service.
- **L6, going back**: on a separate macOS user, or with a copied data folder and a copied project, install the 1.10.4 DMG and the 2.0 test DMG over what 2.1 used, ignore a rule in each, then return to 2.1.

### Risks and limits

- **Detection is unmeasured.** A side-by-side run of the dictionary vote and eld on sample paragraphs could not run in this session, so decision 1 carries a gate: on a fixed set of paragraphs of eight words or more, the chosen detector must pick the right language at least 97% of the time for English with French, German, Spanish and Dutch, else the builder switches to the other.
- **Variants are never detected.** Australian and US English (and the like) cannot be told apart from text; the list and markup decide. Two same-script languages mixed inside one paragraph need markup.
- **A missing dictionary leaves some text unchecked.** While a listed language's dictionary is missing, a paragraph the others do not clearly accept waits unmarked; a very misspelt English paragraph can wait too. The 80 per cent threshold is a plain heuristic.
- **Many languages have no grammar checker**: Traditional Chinese, Korean, Thai, Hebrew, Czech, Turkish and others. Spelling still works for those with a dictionary.
- **The 24 newer wooorm dictionaries and the extra LibreOffice ones are not yet checked** for licence, encoding and quality. The catalogue step drops any that fail and tells you which.
- **LanguageTool 6.6 dates from March 2025** (decision 6). Newer rules come through a server you run, or through 6.8 from Maven Central if you choose it.
- **LanguageTool's memory and start time are unmeasured** (its Docker images use a 512 MB heap; the maintainers suggest up to 2 GB for heavy use). Spectrum caps it at 1 GB and stops it when idle.
- **Long checks show no running progress**, only “Cancel” and, at the end, the parts checked. Premium's limits (60,000 characters a request; 80 requests and 300,000 characters a minute; API plans from 100 calls a day) make a long thesis take a few minutes there. Spectrum sends as few parts as it can, only when you ask, and never again because you typed.
- **A native crash in Hunspell** inside the worker thread would stop the backend, as it would today with nodehun. Every dictionary passes a self-test before use; running Hunspell in a child process is the later fix if a crash is ever seen.
- **Windows paths.** Every path to Hunspell needs the `\\?\` form; T5 and L2 cover it.
- **Dictionaries in encodings other than UTF-8 and ISO-8859-1 are left out.**
- **Licences.** Copyleft dictionaries download unmodified from their publishers with their licence files, and LanguageTool and Java run as separate programs downloaded from theirs, so Spectrum's code stays MIT. This is not legal advice.
- **Your word lists are shared by every language**, so a word added for French is accepted in English too.
- **What travels differs by engine.** LanguageTool's ignored rules travel with the project; Harper's and the project's word list stay on each computer, as the 2.0 plan chose. A project's language list changed on two computers before syncing keeps this computer's.
- **Harper 3.0.0 gives some new advice**: 37 new rules, among them `Gonna`, `Wanna` and `Themself`.
- **Packaging of English.** Spectrum's en_AU and en_US differ slightly from SCOWL's own zips (an extra `ICONV` line for ʼ, one more never-suggest mark and the word math in en_AU). en_GB and en_CA come straight from SCOWL's zips, and the never-suggest list then covers all four.
- **A CRLF line that is all LaTeX markup** keeps its carriage return in the masked prose. The editor gives the checkers LF text, so only text that reaches the backend another way can carry it; T1 and T8 cover it.

### Decisions for you

| # | Question | Recommended default | Why |
| --- | --- | --- | --- |
| 1 | How to choose between listed languages that share a script | The listed languages' own dictionaries vote | Nothing new to ship, covers every language with a dictionary (eld lacks Welsh, Faroese and Galician) and cannot pick a language you did not list. eld XS limited to your list with `setLanguageSubset` (Apache-2.0, 0.9 MB, 98.7% on sentences in its author's tests) is the fallback if the gate fails |
| 2 | Which languages to offer | Every dictionary in the two pinned sources that passes the catalogue's checks (about 70), plus the languages LanguageTool checks without one (about 80 in all) | It is the closest reading of “every language Hunspell fully supports” and of LanguageTool as the default for other languages. Chromium's 47 is the narrower choice, all already checked |
| 3 | Regional variants | One per language, except English (five, for Harper), Portuguese (two) and Serbian (two scripts) | Swiss and Austrian German, Finland Swedish, Valencian and the 20 regional Spanish dictionaries in the same source can follow as catalogue rows |
| 4 | Dictionary downloads | Automatic the first time a listed language needs one | You chose the language; most are under 6 MB; a list shared from your other computer then just works; a failed download never stops the others |
| 5 | Traditional Chinese | Mark stray Simplified characters in Traditional text, leaving Hong Kong and Taiwan standard forms alone | It is the only check Spectrum can offer for Traditional Chinese, and it costs about 150 KB of tables |
| 6 | LanguageTool on this computer | 6.6 with Spectrum's own pinned Java runtime | One archive the LanguageTool team ships and tests as a whole. 6.8 (May 2026) from Maven Central is a real option with newer rules: it needs a step that resolves the server and language-module jars at pin time and pins each one's SHA-256, about M of extra work. A Java you have installed would save only 42 to 49 MB of a 300 MB download |
| 7 | Premium | In this release | Little extra work once the server address works, and it is the only choice for a computer that cannot spare the memory |
| 8 | Where LanguageTool's ignored rules live | `.spectrum/settings.json`, one key per rule | It travels with the project, merges rule by rule, and 1.10.4 and 2.0 never rewrite it; in `grammar.json` they would be lost when an older Spectrum ignores a Harper rule |
| 9 | Whether a project's word list and Harper's ignored rules start travelling too | No change in this work | The 2.0 plan kept them on each computer |
| 10 | LanguageTool's free public server for checks you start | Not offered | The panel checks when it opens and when settings change, which the server's policy on automated requests does not allow, and the 2.1 plan section 4.4 chose the same |
| 11 | When to start | After the 2.0 reviews still open in the handoff | Those reviews may change the files this work touches |

### Rough size

| Part | Size |
| --- | --- |
| Harper 3.0.0 and its dialects | S |
| Hunspell 1.7.6 binding (with Latin-1), builds and Windows workflow | M |
| English dictionaries and the split supplement | S |
| Catalogue, its checks and dictionary downloads | M |
| Detection and spelling by paragraph | L |
| Settings, a project's own list and sharing | M |
| LanguageTool through a server address, with cancelling and late results | L |
| LanguageTool on this computer | M |
| LanguageTool Premium | S |
| Tests and live checks | M |
| Documents | S |

### Reviewer points not taken

- Allowing more than one script per catalogue entry: Serbian becomes two entries (Cyrillic and Latin) instead, which gives the same result with no change to detection.
- Running Hunspell in a child process now: detection moved out of the worker and `suggest` got a time limit; the child process is listed as the later fix, since no crash has been seen and the packaged backend's process model would need its own work.
- Live progress by part for long LanguageTool checks: “Cancel”, partial results and no restart on edit cover the cost problem; progress needs a streaming response and can follow if checks often take more than a minute.
- Merging lists by union in `mergeMeta`: one key per ignored rule merges correctly with no change to `mergeRules.js`; only the project's language list keeps this computer's when both change, which is stated.
- Offering the free public server for manual checks: kept as decision 10 with “not offered” recommended, because the panel's automatic checks on open would breach its policy.
