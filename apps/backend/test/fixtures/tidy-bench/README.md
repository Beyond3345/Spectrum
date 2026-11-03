# Tidy benchmark

The regions a model is asked to tidy in the converter's optional AI step (docs/featureResearch/LATEX_TYPST_CONVERSION.md, section 9 and Appendix A), and a runner that measures how well real models do it. There are 51 regions, each one the converter flags itself: every region kind in both directions, at four levels of difficulty.

## Running it

```sh
DEEPSEEK_API_KEY=... node scripts/tidy-bench.mjs --models models.json [--regions <filter>] [--out <dir>] [--concurrency <n>] [--dry-run]
```

- `--models`: a JSON list of models, as in `models.example.json` here. Each entry has `name`, `provider`, `model` and, where the server needs one, `apiKeyEnv`, the name of the environment variable that holds the key. Keys come only from those variables; the runner ignores Spectrum's settings and `.env`. Optional: `baseUrl`, `temperature` (default 0), `effort` (default `fast`, as the converter asks) and `price`, `{ "input": 0.5, "output": 2 }` in US dollars per million tokens, for an estimated cost.
- `provider`: any of Spectrum's providers (`deepseek`, `openrouter`, `openai`, `anthropic`, `gemini`, `moonshot`, `glm`, `qwen`, `meta`, `ollama`, `ollama-cloud`), `lmstudio` (LM Studio at `http://localhost:1234/v1` unless `baseUrl` says otherwise) or `openai-compatible` with a `baseUrl`.
- `--regions`: a comma-separated filter matching part of a region's id, or its kind, difficulty or direction, for example `titlepage,t2l-` or `hard`.
- `--out`: where the results go; by default `tidy-bench-results/<date and time>`.
- `--concurrency`: requests at once, 1 by default. A 429 or 5xx reply is tried again after 1, 2, 4, 8 and 16 seconds.
- `--dry-run`: no model is called. Answers come from a script (right first time, right after a chatty answer, SKIP, or a word added every time), so the run can be checked without keys.

Each region goes to each model as the converter's tidying sends it (`apps/backend/src/services/convertTidy.js`): the checklist and rule card from `skills/spectrum-convert-tidy/SKILL.md` as the system message, the same user message, up to three answers, and the same checks on every answer, including a compile of the converted document with the answer in it. Nothing is written back.

The run writes:

- `report.md`: a comparison of the models, then a table per model by kind and direction and by difficulty. It counts answers that were right first time, right within three, skipped (and how many of those were where SKIP is right), failed after three and API errors, with the reasons answers were rejected by check, tokens in and out, seconds per region and the cost.
- `results.json`: the same per region, with each accepted edit and each model's last answer.
- `review.html`: every accepted edit beside the original, the converted text and the note of what a good answer looks like, for spot checks by hand.

## Files

| File | What it is |
| --- | --- |
| `cases/<id>.tex`, `cases/<id>.typ` | One small source document per region. The region sits between two plain paragraphs, `Region starts here.` and `Region ends here.` |
| `refs.bib` | The bibliography the cases that cite share |
| `cases.json` | Written by hand: each case's `id`, `kind`, `direction`, `difficulty` and `good`, a short note of what a good answer looks like |
| `regions.json` | Built from the cases by the converter; do not edit it by hand |
| `models.example.json` | A models file to copy, with placeholder model names and key variables |

Each entry of `regions.json` has the fields of `cases.json` and:

- `region`: the id the converter gave the region (`r1`);
- `original`: the region's source, as the conversion record keeps it;
- `converted`: the text between the converter's `spectrum:region` markers;
- `notes`: what the converter wrote in `conversion/notes.md` about the region's lines;
- `document`: the whole converted main file, markers included, which the answer goes back into to compile.

## Kinds and difficulty

| Kind | LaTeX to Typst | Typst to LaTeX |
| --- | --- | --- |
| titlepage | 5 | 4 |
| cv-header | 4 | 5 |
| unknown-environment | 7 | 2 |
| unknown-command | 12 | 3 |
| table-layout | 4 | 5 |

Difficulty is `easy` (10, one obvious change), `typical` (24), `hard` (11: a layout the rule card only hints at, or invariants that are easy to break) or `skip` (6, where `SKIP` is the right answer, because the converted text is already right or the fix needs a package). The `good` notes are for people reviewing answers; no check reads them.

The kind is the one the converter flags the region as. What the rules convert exactly is not flagged, so none of it is in the set: a title page aligned any way, size switches, `\fbox`, soul's `\so`, `\ce` and `multicols`, for example.

No converted region loses a word of its source. The converter keeps the text of every command it does not know, and its word check names any word a conversion lacks in `conversion/notes.md`. What the regions lose is the look: a rotated or scaled word, a drop cap, a symbol or icon (`\checkmark`, `\dag`, `\ding`, Font Awesome), a margin note set in the sentence, a box, a frame or a fill.

## Rebuilding regions.json

After changing a case or the converter:

```sh
SPECTRUM_PANDOC=<pandoc 3.12.1> node scripts/tidy-bench-regions.mjs
```

It converts each case in a throwaway folder and takes the one region the converter marked between the two paragraphs. It stops, writing nothing, if a conversion fails its own checks, or marks no region, more than one or one of another kind between the paragraphs. `node --test apps/backend/test/tidy-bench.test.js` checks that `regions.json` still matches the cases and runs the runner against a fake server. No real model is called.

## Licence

Every case was written for Spectrum and is under Spectrum's MIT licence. The names, places and numbers are made up. No third-party text is included.
