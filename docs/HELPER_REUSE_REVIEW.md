# Helper replacement review

This change reviews handwritten text conversion, parsing, validation and shared utilities. It replaces clear substitutes and duplicates; it does not treat every small function as unnecessary.

| Previous helper | Replacement | Effect |
| --- | --- | --- |
| `stripTex` in references | Upstream pylatexenc JavaScript build | Decodes groups, accents, math symbols, formatting and TeX quotes for title matching and reference display. Imported citation authors and publishers use the same conversion. |
| Regular-expression TeX removal in fallback citation queries | The same pylatexenc converter | Keeps words inside formatting commands instead of deleting them. |
| Greek-to-TeX dictionary | pylatexenc encoder | Uses the library's symbol mapping. A small compound Latin accent fallback remains because the library leaves characters such as Vietnamese ễ unchanged; extra grouping preserves those accents through Biber. |
| Partial HTML entity table | `parse-entities` 4.0.2, already installed through Markdown dependencies | Handles the complete named-entity set and invalid numeric code points without a local table. |
| Handwritten JSON schema validator | The existing Zod dependency | Rejects wrong types and invalid layout severities. Invalid answers remain rejected after the final retry, and model-provided `ok` cannot override a failed layout check. |
| Separate frontend and backend JSON block extraction | One shared balanced extractor | Preserves complete-object validation and the frontend's separate repair for literal newlines in model strings. Truncated edits remain rejected. |
| Duplicate plain-text TeX escaping | One shared literal escaper | Project titles retain backslashes, carets and tildes. Existing TeX-aware reference escaping remains separate. |
| Comment removal in reference detection, compilation utilities, project context, editor and environment discovery | One escape-aware helper | Handles percent signs after odd and even runs of backslashes consistently. |
| Identical source and target transfer outline parsers | One shared parser | Preserves the existing transfer outline shape. The editor keeps its position-aware parser. |

## pylatexenc integration

The source is pinned to [upstream commit 316f9c0](https://github.com/phfaist/pylatexenc/tree/316f9c00814da019ec24d3b06e9866f3be94258d), version 3.0b2, using its Transcrypt 3.9.3 recipe. The [upstream JavaScript port](https://github.com/phfaist/pylatexenc/blob/316f9c00814da019ec24d3b06e9866f3be94258d/js-transcrypt/README.md) is alpha. Its generated ES modules are checked in with their licences and copied into desktop resources; application builds and users do not need Python. Regenerate with `node scripts/build-pylatexenc.mjs /path/to/the/pinned/checkout`.

The runtime stays in a worker because Transcrypt extends JavaScript prototypes. Keeping its ES modules separate also avoids failures observed when bundling the parser. Spectrum supplies documented default contexts and a few display rules for TeX logos, visible link labels and literal carets. File inclusion stays disabled; parsing never runs a TeX engine or shell command.

Conversion is synchronous to preserve existing reference helper interfaces. Successful results are cached, each call has a two-second bound, and inputs over 65,536 JavaScript characters remain verbatim. Failures retain the original text. This is appropriate for reference fields and short citation passages, not whole-document conversion.

## Helpers retained deliberately

- Bibliography parsing retains raw field values and citation keys. Text conversion runs only where readable text or comparison is needed; it does not rewrite existing bibliography files.
- TeX-aware escaping, quote formatting and case protection preserve imported commands and capitalization. A plain text encoder cannot substitute for those policies.
- Spell-check masking and the editor's structural scans preserve offsets, verbatim regions and cursor positions; pylatexenc's text converter does not provide that interface.
- Statistics categorize document content rather than simply extracting visible text.
- File copying, path validation, atomic writes and cloud merging enforce application-specific safety and conflict rules. They were not replaced with a different default filesystem operation.

## Verification

- Upstream's generated JavaScript test runner completed with “All tests succeeded.”
- Focused regressions cover accents, TeX and Unicode title matching, Greek symbols, quotes, nested formatting, malformed input, literal escaping, full HTML entities and comment escape parity.
- Tests confirm that file-input and shell macros do not access files or execute commands, and that the main JavaScript prototypes remain unchanged.
- JSON regressions cover balanced extraction, quoted delimiters, incomplete instructions, schema retries and malformed layout replies. Provider calls in these checks are mocked.
- Final backend suite: 304 passed, 15 skipped, zero failures. All 17 frontend self-checks, type checking and the desktop resource build passed.
- All 15 focused tests also passed with the bundled Node 24.22.0 runtime, including a real pdfLaTeX/Biber APA 7 compile with Greek and Vietnamese text.
- A standalone copy of the bundled backend started without repository dependencies or Python. Its reference route decoded the title, detected the existing DOI, preserved the citation key and original bibliography bytes, and served the frontend.

Custom macros remain an approximation, as documented by pylatexenc; it is not a TeX compiler. The helper-integration validation did not produce an installer; see the release notes for subsequent builds.
