# Tidy benchmark: the test set

The regions a model is asked to tidy in the converter's optional AI step (docs/featureResearch/LATEX_TYPST_CONVERSION.md, section 9 and Appendix A), for measuring how well real models do it. There are 51 regions: every region kind in both directions, at four levels of difficulty.

## Files

| File | What it is |
| --- | --- |
| `cases/<id>.tex`, `cases/<id>.typ` | One small source document per region. The region sits between two plain paragraphs, `Region starts here.` and `Region ends here.` |
| `refs.bib` | The bibliography the cases that cite share |
| `cases.json` | Written by hand: each case's `id`, `kind`, `direction`, `difficulty` and `good`, a short note of what a good answer looks like |
| `regions.json` | Built from the cases by the converter; do not edit it by hand |

Each entry of `regions.json` has the fields of `cases.json` and:

- `original`: the region in the source document, between the two paragraphs;
- `converted`: the same region in the converter's output, between the same two paragraphs;
- `notes`: what the converter wrote in `conversion/notes.md` about the region's lines;
- `document`: the whole converted main file, which the answer is put back into to compile it.

## Kinds and difficulty

| Kind | LaTeX to Typst | Typst to LaTeX |
| --- | --- | --- |
| titlepage | 6 | 5 |
| cv-header | 5 | 5 |
| unknown-environment | 7 | 2 |
| unknown-command | 7 | 2 |
| table-layout | 6 | 6 |

Difficulty is `easy` (one obvious change), `typical`, `hard` (a layout the rule card only hints at, or invariants that are easy to break) or `skip` (9 regions where `SKIP` is the right answer, because the converted text is already right or the fix needs a package or words the region no longer has). The `good` notes are for people reviewing answers side by side; no check reads them.

Appendix A has rule cards for unknown environments and unknown commands from LaTeX to Typst only. The four Typst to LaTeX regions of those kinds are user functions (a callout box, numbered steps, a red flag, a key cap) whose text the converter kept without their look.

Some converted regions show the converter losing words: `\fbox{Reset}`, `\so{FRAGILE}` and `\ce{...}` are left out with their text (l2t-unknown-command-2, -7 and -4), and a `\newenvironment` list leaves its marker behind as a stray paragraph (l2t-unknown-environment-3 and -7). They are kept as they are, since a model meets the converter's real output.

## Rebuilding regions.json

After changing a case or the converter:

```sh
SPECTRUM_PANDOC=<pandoc 3.12.1> node scripts/tidy-bench-regions.mjs
```

It converts each case in a throwaway folder and stops, writing nothing, if a conversion fails its own checks or loses either paragraph. `node --test apps/backend/test/tidy-bench.test.js` checks that `regions.json` still matches the cases. No model is called.

## Licence

Every case was written for Spectrum and is under Spectrum's MIT licence. The names, places and numbers are made up. No third-party text is included.
