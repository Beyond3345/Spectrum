# Spectrum 2.0 continuation handoff

Updated 25 October 2026. Development work only: no installer, tag, push or release was made.

## Where to resume

Use `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum`. Read [SPECTRUM_2_PLAN.md](SPECTRUM_2_PLAN.md), especially its ground rules and Delivery section, before starting the next phase.

Phase 2 (the agent workspace, personas and skills, with the to-do list's agent parts) is built and integrated on **`build/p2-integrate`**, branched from `feat/2.0` at `a82ccde`. It merges `build/p2-backend`, `build/p2-settings` and `build/p2-workspace` in that order, then adds the commits that wire them together, the documentation and the fixes from the live check. It is not merged into `feat/2.0` yet. Next:

1. Give `build/p2-integrate` its adversarial review rounds, as the plan's Delivery section asks.
2. Merge it into `feat/2.0` (no fast-forward, like the earlier phases).
3. Start phase 3 (TexLab, Review and Research) on branches from the new `feat/2.0`.

Phase 1 and phase 1b are in `feat/2.0` as described under Phase 1 and 1b below. Stop any stale paused builder or reviewer tasks rather than resuming their old edits, and do not cherry-pick the old builder branches: their work is already in `feat/2.0` or `build/p2-integrate`.

## Phase 2

### What was built

- **Agent workspace** (`apps/frontend/src/editor/agent/`): the Agent button opens it in the PDF's place. Its header has the Spectrum agent and Local agents tabs, the session history, the Isolated or Direct badge, the agent's options, the persona picker and Stop. Below come a welcome screen with five task buttons, the transcript with tool cards, the plan strip, the changes tray with its review and preview PDF and the composer with context chips, the `/` menu and the skill chip. `AgentPanel.tsx` and the bottom card's Edit mode and Agents tab are gone; an Edit chat from before 2.0 continues in the workspace.
- **Personas** (`editor/personas.ts`, Settings › Personas): four starters and default instructions, merged by id when a computer joins the shared settings. They go to the assistant, the Spectrum agent and local agents, never to autocomplete.
- **Skills** (`services/skillService.js`, `routes/skills.js`, Settings › Skills): 12 K-Dense skills synced by `scripts/sync-skills.mjs` at commit `593377b` into `skills/`, three of Spectrum's own, the user's own skills, switches for this computer and for a project (`skills: { on, off }` in `.spectrum/settings.json`) and sharing into `~/.agents/skills` and `~/.claude/skills` (off by default).
- **Local agent backend** (`agentSessionService.js`, `agentWorkspace.js`): review sessions keep working on their draft. Apply makes the applied bytes the new baseline, Reject resets the draft's copy and tells the agent, streamed pieces are stored joined and context goes as ACP resources. Personas go in the agent's system prompt or the first prompt of a new session, skills are copied into the agent's private home and `GET /api/agent-sessions/:id/preview` compiles the draft.
- **Spectrum tools server** (`apps/backend/src/mcp/`): an MCP server local agents start inside their isolation on macOS, bundled as `mcp.mjs` by `scripts/desktop.mjs`. Its `suggest_todo` results reach the workspace as `todo` events when the turn ends.
- **Spectrum agent** (`agentService.js`, `researchTools.js`): instructions, a skill in whole, a skills list, `load_skill`, `read_skill_file`, `list_todos`, `suggest_todo`, `literature_search` and `fetch_bibtex`, 25 steps and the thread's history in tools mode.

### Integration notes

The parts were joined where the contract drifted:

- The workspace sends a local agent's context in the routes' shape: the selection as text, `todos: true` (the backend reads the open to-dos itself) and `skill`, which the backend now sends as an embedded `SKILL.md` resource. Choosing no persona sends `null`, which clears the session's persona.
- Suggested to-dos come from the backend's `todo` events rather than from matching tool titles. A stored event's `first` replaces the pieces the client already holds, a rejection shows as a note and each turn's tool calls get cards of their own.
- The skills listed in the workspace are those `active` in the project. Settings uses the backend's `getSkillSharing`, `setSkillSharing` and `listSkillFiles` shapes.
- Persona dots take the tag colours, Manuscript review picks the `critical-reviewer` starter by id, and Settings opens at Personas or at Agents (with the agent last picked in the workspace). The picker refreshes when Settings › Agents saves.

### Phase 2 verification

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 387 passed, 13 skipped, 0 failed (400 total) |
| Native agent tests with `SPECTRUM_NATIVE_AGENT_TESTS=1` (draft, routes, tools, preview, skills home, sessions) | 6 passed |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The 13 skips are the 8 from phase 1 (opt-in native agent and sandbox checks, Windows-only checks, moving a project to the Bin and a live arXiv and DOI request) and the 5 new native agent tests, which were run separately above.

The live check ran the integrated backend and Vite on scratch data, projects and template folders with a fake home folder, with a scratch ACP agent set up through Settings › Agents and run under the real macOS isolation. It covered the welcome screen and task buttons, both tabs, the persona picker, Settings › Personas (create, edit, reset), Settings › Skills (a switch, a This project override, creating a skill, duplicating a built-in one and sharing into the fake home) and Settings › Agents (a rejected argument list, then a saved setup).

In review mode the agent read and edited two files and suggested a to-do through the Spectrum tools server. The transcript showed thinking, tool cards and the plan. Add and Save open steps as to-dos saved two to-dos, and Preview PDF compiled the draft into the cache. `main.tex` was applied, with a Restore row, and `intro.tex` rejected, with its note. Three more prompts worked on the draft. The first sent the open file, the to-dos and a skill as resources. The second set a persona, which started a new agent session, and the third cleared it. The Spectrum agent tab was checked with its model request answered in the page, so no model was called.

Three faults found in the live check were fixed: tool cards from a new agent session joined an older card with the same id, the picker did not see a setup saved in Settings and Settings opened at another agent than the one being set up.

### Phase 2 limits and open items

- Windows is untested. The MiKTeX setting names for refusing unsafe input files are a best guess, so run `test/agent-preview.test.js` with `SPECTRUM_NATIVE_AGENT_TESTS=1` on the Windows build machine. TeX Live 2026 and later ignore `openin_any`, so a Windows preview needs MiKTeX or TeX Live 2025 or earlier and refuses otherwise. The plan's sections 7 and 10b still say `openin_any=p` restricts TeX Live and should be corrected.
- Local agents on Windows get no Spectrum tools, so there suggested to-dos come only through Save open steps as to-dos.
- Suggested to-dos reach the workspace when the turn ends (at most 50 a turn), and the tools server's run folders in an agent's home are not cleaned up.
- The first prompt after a session is created uses the skills copied when it was created.
- The TeX folder from Settings › Engines does not reach agent compiles or previews, which use the PATH.
- Terminal cards show only the command line for terminals Spectrum runs.
- Stop on the Spectrum agent leaves its answer unread while the backend finishes its tool loop.
- The settings switches use WebKit's `switch` attribute and are plain tick boxes in Chromium and WebView2. Closing the Settings sheet does not ask about unsaved skill file or persona edits.
- `mcp.mjs` is about 4 MB, since the reference and search services bring in the LLM service.
- Personas follow you through today's shared settings; one file each in the settings repo comes with phase 4.

## Phase 1 and 1b

Phase 1 and phase 1b are merged into `feat/2.0`:

- `9474182` merges the whole `fix/p1-review2` branch, including its 14 earlier review fixes and `bda8a3c`, which finishes the previously staged and unstaged Document insights work.
- `89a9a9a` merges the whole `build/c-integrate` branch, including the host, shared frame and circuit branches, `7f905bc` (review fixes) and `552bdf5` (refresh older generated diagrams before preview).
- `a82ccde` adds Mermaid PDF output, documentation and the phase 1 handoff.

The original Claude worktrees and branch references were retained. The initial dirty patches were also backed up under `/private/tmp/spectrum-2-continuation-N6eST2`; they are recovery copies, not patches to apply again.

### Completed in the phase 1 continuation

#### Phase 1 review

- Finished Document insights' punctuation, multi-row equation and source to-do changes. Fixed `alignat`'s column count and citation first-location/reading order.
- Refreshes now follow compiles, file switches and changes to the configured TeX folder.
- Presentation mode clamps the current page after recompiling a shorter deck.
- A PDF produced with errors is no longer eligible to create or replace a successful compile checkpoint.
- Reviewed the earlier compile-cache, bibliography rerun, history locking/cleanup, rename, mirror, note and to-do fixes. The rollback test into 1.10.4 and back passes.

#### Diagram composer

- Preserved and finished the existing canvas preferences, theme, symbol geometry and file-tree marker edits.
- Circuit symbols use the backend's `start`/`end` endpoint names and measured dimensions; failed symbol pages are not cached as valid pictures. Missing optional pins retain usable fallback positions.
- Added the circuit minimap and navigation. Fit includes measured pins. Exported component names remain unique, and adding a component after deleting another no longer repeats its label.
- Standalone documents crop the entire picture. The former `standalone[tikz]` header missed the `circuitikz` wrapper and produced a full letter page. Unchanged files from that generator are saved with the corrected header before preview; hand-edited code is preserved.
- Damaged and unsupported drawing data opens as code with its marker retained. A `.mmd` always opens as Mermaid even if its marker claims another language.
- Hand-edited diagrams have no editable drawing inspector. Exports require the current successful preview. An AI answer cannot overwrite edits made while it was pending.
- Save and conflict-backup failures now propagate. Native close, diagram switching and quit honor the failure and leave the work open. Quit attempts have independent response events and timeout state, so a failed attempt cannot close a later retry.
- Circuit symbol validation rejects TeX `^^` encodings that could otherwise bypass the literal-command allowlist.
- Mermaid exports PDF and PNG. Insert as figure creates PDF for LaTeX and retains PNG for a Markdown main file. `pdf-lib` 1.17.1 is loaded only for PDF output; its licence and dependency licences ship in `public/licences`.

### Phase 1 verification

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

### Limits before a release

- No Windows build or UI test, installed-app test, DMG, tag, push or release was performed. The native save changes were code-reviewed and unit-tested, not manually exercised through a packaged native window.
- Live paid model calls were not used. The late-answer guard was reviewed; future agent changes still need their own lifecycle and isolation checks.
- Mermaid PDFs contain the existing high-resolution raster at its correct physical size. They are not vector PDFs.
- The pre-existing three-second quit fallback for a completely unresponsive page and OS force-quit limits remain. A reported save rejection cancels that quit attempt.
- The symbol cache still has its documented version/size limitation; this continuation did not redesign it.
- Typst diagrams remain unavailable until phase 5, as planned. New agent tools, TexLab, combined Review/Research, Zotero, GitHub sync, cloud migration and additional engines are not implemented by this continuation.

## Standing rules for the next phases

Base new builder branches on the latest `feat/2.0`, not the old `main`. Continue the plan's build and review process, preserving the earlier phases' work and 1.10.4 rollback compatibility. Do not remove cloud sync before its planned migration phase. Do not tag or release 2.0 without the user's explicit instruction.
