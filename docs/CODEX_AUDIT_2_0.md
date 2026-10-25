# Spectrum 2.0 review handover

Updated 25 October 2026. The user stopped this review because the five-hour usage limit was near. Resume from this file and the current source, rather than repeating the older phase 4 investigation.

## Current request and permissions

The latest substantive request was: **“Phase 5 has been implemented, reviewed and checked. Review the whole 2.0 version of Spectrum.”** The user then asked for this `handover.md` so Claude can pick up the work.

This run is a **read-only audit**, not a fix or release run. No application source was changed, no fixes were committed and nothing was pushed, tagged, merged or released. Finish verifying the findings and report the review before implementing changes unless the user gives a new instruction to fix them.

Earlier the user requested maintainable Harper and Hunspell updates, visible versions and diagnostics, with updates arriving through normal Spectrum releases. That work is already in the current branch, including subsequent checker review fixes. Do not redo it. Rust and LanguageTool are documentation-only proposals and are outside implementation scope.

The user explicitly authorized subagents for the handover work. The review uses parallel lenses and scratch experiments. No scheduled work or new chats were created.

## Exact repository state

- Repository: `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum`
- Current branch: **`build/p5`**
- Reviewed commit: **`19455ad`**, `Name the frontend checks that were run for phase 5`
- `feat/2.0` is at `bb3c971`; the phase 5 branch descends from it but is not merged into it.
- Phase 4 review fixes were merged as `efc81b2`.
- Before this handover was written, the only working-tree item was the pre-existing untracked `docs/SPECTRUM_2_1_PLAN.md`. Leave it intact. This handover is the only repository file added by the current review.
- The existing phase 1–4 test DMG is not a phase 5 installer. Do not treat its checks as verification of the current complete release.

Read these for background, but prefer the latest user request over their old pause/scheduling instructions:

1. `docs/SPECTRUM_2_HANDOFF.md`
2. `docs/SPECTRUM_2_REVIEW_PLAN.md`
3. `docs/PHASE5_PLAN.md`
4. `docs/SPECTRUM_2_PLAN.md`

The handoff still says phase 5 has not been reviewed, while the user says it has. Do not argue about the wording. This request is an additional review of the complete current implementation. Several prior phase 4 issues survive the documented first review and have been reproduced again at `19455ad`.

## Safety rules for resuming

- Review application source without editing it. Put experiments in detached scratch worktrees and temporary folders.
- Every backend/test environment needs a fake `HOME`, scratch data, projects, templates, temporary folder and `SPECTRUM_TEST_BIN_DIR`. Never use real Spectrum data, user documents, cloud folders, Zotero libraries or real agent homes.
- Never contact real Zotero at port 23119 or a real GitHub account. Use local stand-ins and scratch repositories. No paid model calls.
- Public official release downloads are allowed. Never run the release app, Rosetta or `arch -x86_64`; never push, tag or publish.
- No installer was requested in this audit. Windows was inspected statically, not run.
- Preserve all original code, existing changes and the untracked 2.1 plan.
- Existing managed-worktree tooling previously targeted the parent OpenPrism folder and failed with “Not a git repository”. Normal detached Git worktrees were used for this read-only audit.

## Findings already reproduced

Severity: P1 means a release blocker involving privacy, file safety, lost edits or a central broken feature. P2 means a functional defect to fix before calling the feature complete. These are findings, not implemented fixes. Line numbers refer to `19455ad` and should be checked again if the branch changes.

### Privacy, GitHub, Zotero and concurrent writes

1. **P1: An existing public settings repository receives private prompts and settings.**
   - `apps/backend/src/services/settingsRepoService.js:51`, `ensureRepo`.
   - It ignores the remote repository's `private` field. A pre-existing local clone bypasses even that lookup.
   - A fake public `octo/spectrum-settings` received a confidential persona prompt after sign-in and sync.
   - Smallest fix: verify that the destination is private before enabling sharing and before uploads, including existing clones. Refuse a public destination.

2. **P1: A pre-staged secret is committed despite being reported as excluded.**
   - `apps/backend/src/services/gitService.js:250` and the commit around line 265.
   - Staging `.env` with native Git, then changing an ordinary source and calling `commitAll`, produces a commit containing `.env`. `left` still claims the file was excluded.
   - Skipping `git.add` does not remove an already staged object from the index that `git.commit` consumes.
   - Refuse unsafe staged changes or build an explicitly allowed commit without destroying the user's staging.

3. **P1: Pull can write outside a project through an ignored folder symlink.**
   - `apps/backend/src/services/mergeRules.js:198`; related writes/deletions/renames around `gitService.js:499`.
   - Recipient has an ignored `assets` link to a scratch outside folder; sender adds ordinary `assets/new.txt`. Pull returns `merged` and creates `outside/new.txt`.
   - Validate all affected destinations and parent links before mutations, reusing existing containment helpers. Cover recovery, deletion and rename paths too.

4. **P1: Zotero authorization uses the wrong request field.**
   - `apps/backend/src/services/zoteroService.js:221` sends `{ name: 'Spectrum' }`.
   - The official local API contract requires `{ appName: 'Spectrum' }`. A strict fixture returns HTTP 400.
   - Primary source: https://www.zotero.org/support/dev/web_api/v3/local_api#authorizing_writes

5. **P1: Zotero collection/item writes omit the required database identity.**
   - `zoteroService.js:39`, collection creation around line 526 and membership PATCH/item POST calls.
   - A pre-authorized strict fixture returns HTTP 428 because writes have no `Zotero-Server-ID`.
   - Official documentation says the ID identifies a database across restarts and is required on every write. This resolves the uncertainty left in the older handoff; verify the actual primary source, rather than assuming the old mock is correct.
   - Carry the proper database identity through each write and handle changed database state safely.
   - Primary source: https://www.zotero.org/support/dev/web_api/v3/local_api#server_id

6. **P1: Move to this computer can strand a successful in-flight save in the old folder.**
   - Moving guard in `projectService.js:118`; registry switch in `routes/sync.js:38`.
   - Both production routes were exercised through `Fastify.inject`. Pause a save after it obtained the old root, complete Move, then release the save. Both return 200. The active local copy retains old text while the old cloud folder gets the newly saved text.
   - The guard rejects future root lookups but does not drain writers that already have the old root. Coordinate Move with in-flight project mutations.

7. **P2: A settings edit can undo settings successfully received by Pull.**
   - `services/projectSettings.js:34` uses a different lock from `githubService.js:329`.
   - Pause a setter after reading `xelatex`, pull `lualatex`, resume adding skill preferences: the setter restores stale `xelatex`.
   - Coordinate settings read/modify/write with pull mutations and check lock ordering.

8. **P2: New document types' compiled PDFs are backed up as source assets.**
   - `services/gitService.js:175`, `compiledPdfs` only scans `.tex` and `.ltx`.
   - For `main.typ` plus its generated `main.pdf`, `compiledPdfs` returns `[]` and `commitAll` commits the PDF. Markdown has the same integration gap.
   - Extend output detection while preserving PDFs deliberately used as project assets.

9. **P2: Typst source is classified as binary by Checkpoints and Git merging.**
   - `services/versionService.js:31`, `TEXT_EXTENSIONS`, reused by Git merging.
   - A checkpoint containing `main.typ` cannot show its source: `readVersionFile` answers “Binary files can’t be shown.”
   - Add `.typ` to shared text classification and cover preview, diff and merge behavior.

10. **P1: Restoring a checkpoint can erase a concurrent successful save without retaining it in history.**
    - `services/versionService.js:419–458`; restore route in `routes/versions.js` does not use the normal project mutation lock.
    - Root's deterministic experiment pauses restore after its safety checkpoint, saves new text under `mutateProjectFiles`, then resumes restore. The new edit is overwritten and is absent from both checkpoints.
    - Actual result: `savedBeforeRestoreFinished: 'NEW EDIT SAVED DURING RESTORE'`, final file `ORIGINAL CHECKPOINT`, `savedEditInHistory: false`, two versions.
    - Coordinate restore with editor/agent/GitHub writes, preserving lock order. This experiment used the production restore and normal mutation helper; a full HTTP variant would strengthen coverage.

### Engines, compilation and conversion

11. **P1: Typst scratch compilation writes into the draft despite the scratch contract.**
    - `services/typstService.js:192–195` always invokes `writePdf`; `compileFolder` passes `scratch: true`.
    - Real Typst `compileFolder({ root: draft, mainFile: 'main.typ' })` overwrites `draft/main.pdf`.
    - On a read-only isolated preview this write can fail; writable agent/tool compilation dirties or overwrites the draft PDF.
    - Honor the scratch flag and return the built PDF without publishing it beside the source.

12. **P1: Markdown to LaTeX conversion leaves image paths pointing into a deleted temporary tree.**
    - `routes/projects.js:457` writes `made.text` unchanged, line 462 copies media elsewhere, line 468 removes the temporary tree.
    - Real pandoc export returns success, but `main.tex` contains `/private/tmp/.../generated/media/images/dot.png`, which is then deleted.
    - Rewrite generated paths to the copied project-relative assets before publishing the new project.

13. **P1: Windows engine packaging selects Mac archives.**
    - `scripts/desktop.mjs:221`: `assets[arch]`, while Windows passes `arch = 'x64'`; Windows entries in `engines.json` use `win-x64`.
    - A source-level stub of the actual function with Windows constants requests the Apple Darwin Typst/Tectonic archive, then attempts to extract `.exe` paths that are not in it. The installer build fails.
    - Select the Windows asset key explicitly and add a platform-selection regression. This was reproduced statically, not on Windows.

14. **P1: Publishing a compiled PDF follows a link outside the project.**
    - `services/compileService.js:825`, `writePdf`, uses `fs.writeFile(absPdf, pdf)` without checking output containment.
    - Real Typst compiling `main.typ` with `main.pdf` linked to an outside sentinel returns success and replaces the outside sentinel with a PDF.
    - Validate and publish the output safely in the shared helper, respecting the intended link policy. The shared TeX path may inherit the same pre-existing issue.

15. **P2: Ordinary YAML inline comments break bibliography resolution.**
    - `services/markdownService.js:24–48`, handwritten front matter parser; bibliography arguments around lines 61–68.
    - Valid `bibliography: refs.bib # Sources` becomes a literal filename including ` # Sources`. Real pandoc fails although `refs.bib` exists.
    - Let pandoc interpret its own metadata or use a proper existing YAML parser; keep the all-bibliographies fallback only when no bibliography was supplied.

### Editor and new document types

16. **P1/P2: Main-file maintenance clears a Typst or Markdown main file.**
    - `app/EditorPage.tsx:974–979` keeps only `texFiles` and replaces a valid `main.typ` or `main.md` with `''` or the first `.tex`.
    - Root confirmed in a real browser using a newly created Typst document. With PDF follows the open file enabled, toolbar Compile still works through `shownDoc`. After disabling that preference, Compile says “There’s no document to compile”. Do not claim default toolbar compilation always fails.
    - `markdownMain` at line 2772 also controls the Markdown Word export/Convert menus, which disappear when the main file was cleared. Initial empty-state Compile is disabled too.
    - Maintain the main file using all supported document types.

17. **P2: Typst and Markdown source to-dos never reach their scanner.**
    - `app/EditorPage.tsx:533–537`, `todoSources` filters only TeX-related extensions.
    - `editor/todos.ts` recognizes Typst `// TODO` and Markdown `<!-- TODO -->`, but the hook receives neither kind of file.
    - Extend the source selection and test the integration, not only the scanner.

18. **P2: Typst float generation produces invalid or literal code.**
    - `editor/floats.ts:288` escapes `]` but not `[`. A caption such as `A cat, [x]` fails real Typst compilation with an unclosed delimiter. Cells use the same helper.
    - `floats.ts:309–310` returns bare `table(...)` when Float is unticked; without `#`, it is literal document text. Real `typst query` finds zero tables, versus one after adding `#`.
    - Existing `floats.check.ts` even asserts the malformed caption output. Fix balanced content escaping and the bare-table prefix, with real compilation checks.
    - These two cases were independently confirmed by the engine reviewer as well as the frontend reviewer.

19. **P2: Figures and included diagrams use the wrong paths from nested Typst source files.**
    - `editor/tools/FloatsTab.tsx` around line 643 passes project-root `figures/flow.typ` into `figureTypstInclude`, and image helpers use the same style of path.
    - Insert into `chapters/intro.typ`: Typst looks under `chapters/figures`, even though the file is under project-root `figures`. Real compilation fails; using `/figures/...` succeeds.
    - Emit proper Typst root-relative paths or relativize against the insertion file. Independently confirmed by the engine reviewer.

20. **P2: Review skips Typst source when looking for private information and does not reliably mark new document types stale.**
    - `editor/tools/ReviewTab.tsx:53` excludes `.typ` and `.markdown` from `SCANNED`; line 54 excludes new formats from `SOURCE`.
    - Text is loaded only for `SCANNED` files, while the secret scan needs loaded text. A Typst source with a key can escape the enabled Privacy group. Source edits also miss the old source-only staleness classification.
    - Extend the supported source classification and test the panel-to-scanner integration.

21. **P2 candidate, needs runtime verification: Global new-engine defaults do not reach compilation.**
    - Settings offers default Typst version and Markdown PDF engine; EditorPage's effective settings/menu reflects them.
    - The compile payload around `EditorPage.tsx:1568`, API type around `client.ts:566` and `routes/compile.js` omit these options. Backend compilers appear to use only per-project settings or explicit options.
    - Expected failure: an unpinned project displays a global older Typst version or Typst Markdown PDF engine but compiles using built-in Typst or LaTeX.
    - The frontend reviewer traced this and asked the engine reviewer to verify. Do not present it as runtime-proven until that happens.

## Evidence and scratch resources

All paths below are temporary and may disappear. Copy relevant reproductions into durable regression tests only when a fix run is authorized.

### Detached review worktrees

- Root: `/private/tmp/spectrum-audit-root-19455ad`
- Engines: `/private/tmp/spectrum-audit-engines-19455ad`
- Frontend: `/private/tmp/spectrum-audit-frontend-19455ad`
- Sync/privacy: `/private/tmp/spectrum-audit-sync-19455ad`

They all point to `19455ad`. The main checkout is unchanged. Keep the worktrees while the reproductions need them; inspect `git status` before eventual cleanup. Never remove the user's primary checkout.

### Reproduction scripts

- `/private/tmp/spectrum-audit-sync-run/public-and-staged.mjs` (public repository case; its staged-secret part was superseded)
- `/private/tmp/spectrum-audit-sync-run/staged-secret.mjs`
- `/private/tmp/spectrum-audit-sync-run/symlink.mjs`
- `/private/tmp/spectrum-audit-sync-run/settings-race.mjs`
- `/private/tmp/spectrum-audit-sync-run/zotero-contract.mjs`
- `/private/tmp/spectrum-audit-sync-run/move-inflight-save.mjs`
- `/private/tmp/spectrum-audit-sync-run/typst-git-checkpoints.mjs`
- `/private/tmp/spectrum-audit-checkpoint-race.mjs`
- `/private/tmp/spectrum-engine-audit-repro.mjs`
- `/private/tmp/spectrum-typst-pdf-link-repro.mjs`
- `/private/tmp/spectrum-markdown-yaml-repro.mjs`
- Frontend: `/private/tmp/spectrum-audit-frontend-state/repro.ts`, `repro.mjs`, `repro-paths.ts` and any compiled companions

Root context: `/private/tmp/spectrum-audit-context.json`. It records the scratch environment and uses the bundled ARM Node from the original checkout. Root scratch state is `/private/tmp/spectrum-audit-state-y4CDaJ`. Do not accidentally substitute the user's real HOME/data paths.

### Test results collected in this run

- **Full backend suite:** 485 tests, **446 passed, 1 failed, 38 skipped**, about 200 seconds. Log: `/private/tmp/spectrum-audit-state-y4CDaJ/logs/backend.log`.
- The failure is `test/engines.test.js:61`, “listEngines reports the built-in Typst, the one on the PATH and pandoc”. The test deletes explicit built-in engine environment variables; the clean scratch worktree has no `src-tauri/binaries`. `available` excludes 0.15.1 even when no built-in binary is present, contrary to the assertion. Do not call the suite green. Re-run with a deliberate scratch built-in-binary setup to distinguish the fresh-checkout availability bug from release behavior.
- The 38 skipped cases are not verified. Native isolation/platform/network opt-ins remain gaps; read the log rather than assuming all are equivalent.
- **Typecheck passed.**
- **Frontend production build passed**, in the root scratch worktree. There is a large main-bundle warning, not a demonstrated performance defect.
- **Focused sync/privacy suites:** 68/68 passed; the new reproduction cases still expose gaps not covered by those tests.
- **Focused engines/Typst/Markdown suites:** reviewer reports 21/21 passed after setting up scratch binaries and granting local mock-server access.
- The whole frontend self-check collection, native Rust suite, ten repeated TexLab runs and complete rollback matrix were not rerun by root in this audit. Do not inherit previous runs as new verification.
- No native Windows execution, large repository performance trial, 500-page document trial, real GitHub/Zotero or full phase 5 installer test.

### Live browser check

A disposable backend ran at `http://127.0.0.1:50317` with scratch state `/private/tmp/spectrum-audit-ui-x7VPQq` and frontend built from the reviewed snapshot.

- Created `Audit Typst` from the normal Typst document template.
- Toolbar Compile produced the expected one-page PDF using Typst.
- In that scratch origin only, unticked PDF follows the open file. Compile then displayed “There’s no document to compile. Add one, or choose ‘Set as main file’ from a file’s menu.” This independently confirms finding 16 under its precise condition.
- Backend PID 6268 was sent SIGTERM successfully before this handover. Root unified exec session was 22089; it may still need its final completion read. The audit tab may remain open but should no longer have a server.
- No real project was opened or changed. Do not launch the installed app to repeat this.

## Review status and next actions

1. Read this file, inspect HEAD/status and ensure the source snapshot is still the intended release candidate.
2. Complete independent refutation of the findings. Root had asked the sync/privacy reviewer to cross-check the other lenses, but the user stopped the run before the response. The engine reviewer independently confirmed findings 18 and 19. The root independently confirmed finding 16 in the browser and finding 10 with a deterministic concurrency experiment.
3. Verify the candidate global engine defaults issue. Confirm the Review privacy/staleness and TODO integration examples with executable fixtures if not already left in the frontend scratch directory.
4. The heavier review plan asks for three independent verifiers per finding. That has **not** been completed. Most findings currently have their discoverer's concrete reproduction plus root source inspection; do not claim the heavier review finished.
5. Finish coverage of agent isolation/permissions, shared credentials, composer saves, cross-phase rollback, Windows packaging and missing live workflows. Focus on high-cost failure paths rather than creating more low-impact findings.
6. Produce the ranked review report. There are 20 reproduced/source-supported findings plus one candidate here; combine only genuinely shared-root-cause cases or place smaller items in an appendix if following the audit skill's 20-item limit.
7. Recommended verdict from current evidence: **do not release yet**. Secret uploads, outside-project writes, successful-save loss and broken Windows packaging need resolution before release approval.
8. If the user then authorizes fixes, isolate a fixer branch/worktree, preserve current source and the 2.1 plan, add meaningful regressions and run the review plan's checks. Do not blindly cherry-pick old fix branches. Several earlier fixes were intentionally not merged or were partially superseded.
9. Update the main handoff/review plan only after the findings and work actually completed are settled. Nothing in this handover marks phase 5 or the complete release approved.

## Prompt to resume

“Read `handover.md` in the Spectrum repository. Resume the read-only review of the full 2.0 snapshot, including phase 5. Independently verify the listed findings and finish the remaining coverage, then give me a ranked review and release-readiness verdict. Do not change application code, merge branches, build an installer or publish anything yet. Use only scratch data and mock accounts.”
