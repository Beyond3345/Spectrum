---
name: spectrum-verify-claims
description: Compares each factual statement in a passage with the work its citation points to, and grades the support as full, partial, none or not checkable, leaving the author's wording alone. Choose it when a draft's citations need testing against what their sources say, or before a manuscript goes out.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. check_references, literature_search, fetch_bibtex and bib_entries come from Spectrum's own tools; read_source and record_claim are the Spectrum agent's. Without them, check against the sources the user provides and write the table to research/claims.md.
metadata:
  version: "1.1"
  skill-author: Spectrum
---

# Verify claims against their sources

This is an audit, not an edit. The author decides what to change; your job is to show them, claim by claim, how well the cited sources back what the text says.

## 1. Pick the claims

- Work through the section the user named, in order. If they named none, ask which one, or start with the introduction.
- A claim is a sentence (or part of one) that states something checkable, such as a finding, a number, a comparison, what other work did or a claim to be the first.
- Skip the author's own descriptions of their method and plans; they are not claims about sources.

## 2. Match each claim to its sources

- Note the citation keys attached to the claim and find each entry in the bibliography (`bib_entries`, or the `.bib` files).
- Run `check_references` on those keys before you read anything. An entry that is retracted, not found or differs from its record is a finding in itself: say so for every claim that cites it.
- A claim with no citation that needs one is a finding in itself: mark it "needs a source".

## 3. Read the sources

- Read the source with `read_source` (by its key, DOI or arXiv id). It gives the open full text page by page, or the abstract alone when there is no open copy, and says which. Read the pages that bear on the claim, not only the first.
- Without `read_source`, find the work (`literature_search`) and read what is openly available: the abstract at least, the full text when it is open access.
- Read only what you can actually see. If you cannot reach the source, say so and mark the claim "not checkable". A claim checked against the abstract alone was checked against the abstract only: say so. Never guess what a paper says.

## 4. Rate the support

Give each claim one of these:

| Rating | Meaning |
| --- | --- |
| Supported | the source says this, in substance |
| Partly supported | the source says something weaker, narrower or different in a detail (a number, a population, a condition) |
| Unsupported | the source does not say this, or says the opposite |
| Needs a source | the claim cites nothing and should |
| Not checkable | the source could not be reached or does not cover the point |

For Supported, Partly supported and Unsupported, copy the source's own words that decide it, six words or more, exactly as `read_source` gave them, with the page. Never paraphrase in the quote: a paraphrase goes in the note.

## 5. Record and report

- With `record_claim`, record every claim as you rate it: file and line, the claim's words, its keys, the rating, and for a rating that says what the source says, the quote and the source (`{ key }`, `{ doi }`, `{ arxiv }` or `{ path }`) with its page. Spectrum checks that the claim is at that line and that the quote is in the source word for word, and finds its page. If it refuses a quote, read the page again and copy the words as they are; never change the rating to get past the check.
- The user sees the recorded claims in Research, under Claims checked, each with its quote, the page and a link to the source.
- Then give a table with the claim (quoted, with its file and line), its keys, the rating and a short note.
- Then a short summary: how many claims of each rating, and the three findings that matter most.
- If the user wants a file, propose `research/claims.md` with the same table, as one new file (without `record_claim`, always). Never edit the manuscript itself in this task.
- Use `suggest_todo` for each claim the author should revisit, linked to its file and line.

## Things to avoid

- Rewriting the author's sentences. Suggest wording in the note only if the user asks for it.
- Treating a citation to a review as support for a specific primary result without saying so.
- Calling a claim supported because a related paper exists. The cited work has to say it.
