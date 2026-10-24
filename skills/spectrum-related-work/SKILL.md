---
name: spectrum-related-work
description: Writes a background or prior-work section from the project's own .bib entries, adding a missing source only after fetching its BibTeX. Choose it for literature context, for positioning a contribution against earlier studies, or for fixing undefined \cite keys.
license: MIT
compatibility: Works with the Spectrum agent and with local agents. literature_search, fetch_bibtex, bib_search and project_map come from Spectrum's own tools; with none of them, work only from the references the user provides.
metadata:
  version: "1.0"
  skill-author: Spectrum
---

# Related work with citations that resolve

A related work section is only as good as its references. The aim is a section that groups prior work into a few themes, says how each theme relates to the user's contribution and cites only entries that exist in the project's `.bib` and match the papers they describe.

## 1. Understand the paper

- Read the abstract, the introduction and any existing related work. Write down, in one or two sentences, what the paper contributes. Every paragraph you write should come back to that.
- Note the citation commands the project uses (`\cite`, `\citep`, `\citet`, `\parencite`, `\autocite`) and keep to them.
- With `project_map`, list the citations that do not resolve yet.

## 2. Know what is already cited

- List the entries in the project's bibliography (`bib_entries`, or read the `.bib` files). Before adding a paper, search for it (`bib_search` by title, author or DOI) so the same work never gets a second key.
- Prefer papers the author already cites when they fit a theme.

## 3. Find the missing work

- Search with several phrasings of each theme (`literature_search`). Prefer peer-reviewed versions over preprints when both exist, and say when only a preprint is available.
- Read enough of each paper (its abstract at least) to say what it does. Do not describe a paper from its title alone.
- Keep a short list per theme: the key, one line on what the paper does and one on how it differs from the user's work.

## 4. Add references properly

- Get each new entry's BibTeX from its DOI or arXiv id (`fetch_bibtex`). Never write an entry from memory and never invent a DOI, a venue, a year or a page range.
- Add new entries to the `.bib` the document already reads, in one proposed change, keeping that file's order and formatting.
- If a paper cannot be found or verified, leave it out and use `suggest_todo` to ask the author to check it.

## 5. Write the section

- Open with a sentence that says what the section covers.
- Give each theme its own paragraph. Say what that line of work does and what it found, then how the user's work differs from it or builds on it.
- Compare and contrast. A list of papers each with one sentence is a bibliography, not related work.
- Be fair to prior work. Say what it achieved before saying what it lacks.
- Keep claims about other papers to what their abstracts or text support.
- Match the paper's voice, tense and spelling conventions.

## 6. Check before you finish

- Every key you cite exists in a `.bib` the document reads.
- Compile (`compile`, or ask the user to) and confirm there are no undefined citations.
- Summarise the themes, the entries you added and anything the author should check.
