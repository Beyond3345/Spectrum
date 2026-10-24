# Spectrum 2.0 continuation handoff

Updated 24 October 2026. Development work only: no installer, tag, push or release was made during this continuation.

## Where to resume

Use `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum` on **`feat/2.0`**. Read [SPECTRUM_2_PLAN.md](SPECTRUM_2_PLAN.md), especially its ground rules and Delivery section, before starting the next phase.

Phase 1 and phase 1b are merged locally:

- `9474182` merges the whole `fix/p1-review2` branch, including its 14 earlier review fixes and `bda8a3c`, which finishes the previously staged and unstaged Document insights work.
- `89a9a9a` merges the whole `build/c-integrate` branch, including the host, shared frame and circuit branches, `7f905bc` (review fixes), and `552bdf5` (refresh older generated diagrams before preview).
- The continuation commit after that merge adds Mermaid PDF output, documentation and this handoff. Check `git log` for its final ID.

Stop any stale paused builder/reviewer tasks rather than resuming their old edits. Do not cherry-pick the old builder branches or redo their unfinished edits: their work is already in `feat/2.0`. The original Claude worktrees and branch references were retained. The initial dirty patches were also backed up under `/private/tmp/spectrum-2-continuation-N6eST2`; they are recovery copies, not patches to apply again.

## Completed in this continuation

### Phase 1 review

- Finished Document insights' punctuation, multi-row equation and source to-do changes. Fixed `alignat`'s column count and citation first-location/reading order.
- Refreshes now follow compiles, file switches and changes to the configured TeX folder.
- Presentation mode clamps the current page after recompiling a shorter deck.
- A PDF produced with errors is no longer eligible to create or replace a successful compile checkpoint.
- Reviewed the earlier compile-cache, bibliography rerun, history locking/cleanup, rename, mirror, note and to-do fixes. The rollback test into 1.10.4 and back passes.

### Diagram composer

- Preserved and finished the existing canvas preferences, theme, symbol geometry and file-tree marker edits.
- Circuit symbols use the backend's `start`/`end` endpoint names and measured dimensions; failed symbol pages are not cached as valid pictures. Missing optional pins retain usable fallback positions.
- Added the circuit minimap and navigation. Fit includes measured pins. Exported component names remain unique, and adding a component after deleting another no longer repeats its label.
- Standalone documents crop the entire picture. The former `standalone[tikz]` header missed the `circuitikz` wrapper and produced a full letter page. Unchanged files from that generator are saved with the corrected header before preview; hand-edited code is preserved.
- Damaged and unsupported drawing data opens as code with its marker retained. A `.mmd` always opens as Mermaid even if its marker claims another language.
- Hand-edited diagrams have no editable drawing inspector. Exports require the current successful preview. An AI answer cannot overwrite edits made while it was pending.
- Save and conflict-backup failures now propagate. Native close, diagram switching and quit honor the failure and leave the work open. Quit attempts have independent response events and timeout state, so a failed attempt cannot close a later retry.
- Circuit symbol validation rejects TeX `^^` encodings that could otherwise bypass the literal-command allowlist.
- Mermaid exports PDF and PNG. Insert as figure creates PDF for LaTeX and retains PNG for a Markdown main file. `pdf-lib` 1.17.1 is loaded only for PDF output; its licence and dependency licences ship in `public/licences`.

## Verification

| Check | Result |
| --- | --- |
| Full backend suite, `npm test` on the merged branch | 372 passed, 8 skipped, 0 failed (380 total) |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled and run separately | 26 passed |
| Native Rust unit tests | 7 passed |
| All 49 catalogue symbols using the installed circuitikz | American and European: no errors or missing requested pins |
| Real plot preview and inclusion using a project data file | Passed |
| Real circuit preview | One tightly cropped page; regression checks reject a full sheet |

The eight backend skips cover opt-in native agent/sandbox checks, Windows-only checks, moving a project to the Bin, and a live arXiv/DOI request. They are not passes.

The native test command used a test-only bundle override because builder worktrees do not contain the ignored app resources:

```sh
TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":null}}' cargo test --manifest-path src-tauri/Cargo.toml
```

Frontend self-checks can be repeated using the commands in their file headers. The combined pass bundled each file with esbuild for Node and ran it in a fresh process.

Browser checks used disposable projects and data folders, not the user's documents or Spectrum settings:

- Damaged drawing opens as code; incompatible Mermaid metadata does not crash the composer.
- Place a resistor, use the minimap and dark canvas, view generated code, retain hand edits, and disable exports while a new preview is pending.
- Open an unchanged old-generator circuit: the header is refreshed and its PDF measures about 61 × 30 points, rather than a letter sheet.
- While presenting slide 3 of a three-slide deck, finish compiling a one-slide replacement: presentation changes to page 1 of 1.
- Download a Mermaid PDF (one page), hand it to the editor's Floats panel, insert it in the source, and compile the resulting document successfully.

Logs from this session are in `/private/tmp/spectrum-2-continuation-backend-all.log`, `spectrum-2-continuation-typecheck.log`, `spectrum-2-continuation-build.log`, `spectrum-2-continuation-frontend-checks.log`, `spectrum-native-save-review-test.log` and `spectrum-2-symbol-catalogue.log`. They are temporary evidence; the results above do not depend on those files surviving.

## Limits before a release

- No Windows build or UI test, installed-app test, DMG, tag, push or release was performed. The native save changes were code-reviewed and unit-tested, not manually exercised through a packaged native window.
- Live paid model calls were not used. The late-answer guard was reviewed; future agent changes still need their own lifecycle and isolation checks.
- Mermaid PDFs contain the existing high-resolution raster at its correct physical size. They are not vector PDFs.
- The pre-existing three-second quit fallback for a completely unresponsive page and OS force-quit limits remain. A reported save rejection cancels that quit attempt.
- The symbol cache still has its documented version/size limitation; this continuation did not redesign it.
- Typst diagrams remain unavailable until phase 5, as planned. New agent tools, TexLab, combined Review/Research, Zotero, GitHub sync, cloud migration and additional engines are not implemented by this continuation.

## Next work

Start **phase 2** of the approved plan: agent workspace, personas and skills, plus the to-do list's agent context and suggested-item flow. Base new builder branches on the latest `feat/2.0`, not the old `main`. Continue the plan's build-and-review process, preserving the phase 1/1b work and 1.10.4 rollback compatibility. Do not remove cloud sync before its planned migration phase. Do not tag or release 2.0 without the user's explicit instruction.
