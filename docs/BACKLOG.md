# Backlog

Ideas and open questions that were left for later while building Spectrum 2.0. The plans, handoffs and audits they came from were removed on 31 October 2026 once their work had shipped. They are in the Git history before that date if the detail is needed (`git log --diff-filter=D -- docs/`).

## Open questions

- **xdvipdfmx licence.** Tectonic bundles xdvipdfmx, which is usually GPL, while Tectonic declares MIT. The notices list it as MIT, and this may need a legal read.
- **Agent adapter installs.** The earlier test DMGs probably failed to install agent adapters, because npm 11 refused the shared config file. Try them again in a release build.
- **Windows agent isolation.** It cannot start a child with ignored stdio. See [WINDOWS_AGENT_VALIDATION.md](WINDOWS_AGENT_VALIDATION.md).

## Typst

- Tinymist, `typst watch`, and PNG, SVG and HTML export.
- Writing Hayagriva `.yml` bibliographies, and Typst Universe templates.
- Word counts for Typst. The panel says word counts are for LaTeX only.
- Agent compiles use the built-in Typst, not the editor's chosen version. Passing the chosen version needs new read grants in the sandbox.

## Markdown

- A visual Markdown editor, and Word and HTML import.
- `[@fig:x]` cross-references (pandoc-crossref), and exact source maps.
- Mermaid rendering. The Mermaid diagrams skill shows its diagrams as code until then.

## GitHub and projects

- SSH remotes. A project whose origin is an SSH address is refused.
- Offering, when linking, to stop tracking compiled PDFs already in a repository.
- The GitHub view reads only the 100 most recently pushed repositories.

## Research and writing

- A Zotero source for Research, and splitting a question into several queries with a model.
- A research MCP tool.
- ATS (CV) checks.

## Agents

The remaining rollout work is in [AGENT_INTEGRATION_PLAN.md](AGENT_INTEGRATION_PLAN.md): certifying real vendor workflows on Windows, WorkBuddy and Linux as a separate decision.

## Performance

Codex's 2.1 research (25 October 2026) recommended measuring before any Rust rewrite, then fixing these in the existing code:

- Reference conversion in `latex/conversion.js` waits synchronously with `Atomics.wait`, which can block the backend's event loop on a cache miss.
- Whole-project scans (`listFilesRecursive`) are repeated by the project tree, bibliography discovery, checkpoints, compiles and Git exclusions. A shared inventory with invalidation would remove most of them.
- Compiled PDFs travel as base64 in JSON and are decoded again in the editor. A binary response would remove the copies.

A Rust accelerator was worth a prototype only if an expensive operation remained after those fixes. Rewriting the backend in Rust was not judged worthwhile.
