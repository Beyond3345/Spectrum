# Spectrum 2.0 continuation handoff

Updated 25 October 2026. Development work only: no installer, tag, push or release was made.

## Where to resume

Use `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum`. Read [SPECTRUM_2_PLAN.md](SPECTRUM_2_PLAN.md), especially its ground rules and Delivery section, before starting the next phase.

Phase 3 (TexLab with the syntax check before compiling, Review and Research) was built on `build/p3-texlab`, `build/p3-review` and `build/p3-research`, branched from `feat/2.0` at `49ea758`, and integrated on **`build/p3-integrate`** (see Phase 3 below). Next:

1. Merge `build/p3-integrate` into `feat/2.0` (no fast-forward, like the earlier phases) and give phase 3 its adversarial review rounds.
2. Run the Windows checks listed under Phase 3 limits and open items, and phase 2's, on the Windows build machine.
3. Start phase 4 (Zotero, GitHub sync and the cloud removal) on branches from the new `feat/2.0`.

Phase 2 (the agent workspace, personas and skills, with the to-do list's agent parts) was built and integrated on `build/p2-integrate`, branched from `feat/2.0` at `a82ccde`, and is in `feat/2.0` at `25d0b92`, with its two adversarial review rounds fixed in `feat/2.0` up to `49ea758` (see Phase 2 review fixes and Phase 2 second review fixes below).

Phase 1 and phase 1b are in `feat/2.0` as described under Phase 1 and 1b below. Stop any stale paused builder or reviewer tasks rather than resuming their old edits, and do not cherry-pick the old builder branches: their work is already in `feat/2.0` or `build/p2-integrate`.

## Phase 3

### What was built

- **TexLab** (`services/texlabService.js`, `routes/texlab.js`, `apps/frontend/src/editor/lsp/`):
  - `scripts/desktop.mjs` downloads TexLab 5.26.0 for both Mac slices against pinned SHA-256s and joins them with lipo into `binaries/texlab-universal-apple-darwin`. On Windows it builds `texlab.exe` from the checked v5.26.0 tag tarball with the C runtime linked in, as crates.io has TexLab only up to 4.3.2, and `windows.yml` runs that as a cached step and uploads the tarball with a release.
  - `main.rs` passes `SPECTRUM_TEXLAB`, and the backend also looks on the `PATH`. Without TexLab everything works as before.
  - The backend starts `texlab run` per open project and relays it to the editor (an event stream down, POST up), keeps the latest diagnostics for `GET /api/projects/:id/diagnostics` and stops TexLab ten minutes after its last client. TexLab 5.26 never hands back a file the editor closed, so the bridge sends it the disk's text when the last editor closes a file and whenever the file changes on disk.
  - The editor (`@codemirror/lsp-client`) has squiggles, plain-text hovers, Go to definition (`F12` or `⌘`-click), Find references (`⇧F12`, in a panel under the editor) and F2's rename, which lists the files and edit counts, saves a Before rename checkpoint and writes every file through the save route with base hashes, putting back those already written if one fails.
  - The sidebar's Outline comes from TexLab's workspace symbols across `\input` files, with section numbers and floats by caption, and falls back to the parser.
  - The compile menu's Syntax checks (project `compile.syntaxCheck`, on by default in Settings › Engines › LaTeX) asks "Compile anyway?" before compiling a document with missing braces or mismatched environments. Auto compile skips it.
- **Review** (`editor/preflight/`, `editor/tools/ReviewTab.tsx`, `services/reviewService.js`, `routes/review.js`): one Review with tick boxes for the five Preflight groups and the AI review, as plan section 4 describes. `GET /api/projects/:id/review/state` says whether the PDF is older than the files the document reads and returns the `.bib` entries with their duplicates. `POST /api/review` makes one tool-free model call over the document in `\input` order and anchors each point to its quote. The Logs tab's Fix with AI is shared as `fixWithAI` in `editor/shared.tsx`.
- **Research** (`services/researchService.js`, `routes/research.js`, `editor/research/`): the sidebar is Files | Research | To-dos, and the bottom card's History lists the Ask, References and pre-2.0 Edit chats. A search runs every chosen source at once into a session in `.spectrum/research/<id>.json`, merges by DOI, arXiv ID and title and marks what the `.bib` has. Each result has Keep, Drop, Cite, Open note and Get PDF, and Add kept papers to .bib and Find citations for selection add through `resolveItems`. Deep research, Draft related work and Verify claims open the agent workspace. Settings › Search gains the research keys and emails, and the arXiv model search and summaries in the `.tex` are gone.

### Integration notes

The parts were joined where the contract drifted:

- TexLab's diagnostics have one client call, `getDiagnostics` with `TexlabDiagnostic` in `api/client.ts`; Review's copy was dropped. Review and Document insights read them through `EditorApi.diagnostics()`, which first sends TexLab the open file's latest edits. Reading the route directly could return the diagnostics from before the last edit, and nothing asked again, so a fixed problem stayed marked.
- Document insights marks the labels TexLab finds unused or defined twice and the citations missing from the `.bib`, and its Overview counts them with the references to no label (`texlabNotes` in `insights.ts`, checked in `insights.check.ts`). TexLab marks each definition of a label defined twice, so those are counted by name.
- Research's Deep research, Draft related work and Verify claims already reached phase 2's workspace with their prompt, skill, persona and the session as context. The live check confirmed it and nothing needed changing.
- The merges conflicted only in `index.js` (both new route files registered), `ToolsPanel.tsx` (Research leaves Tools, and Review takes `doc` and `active`), `EditorPage.tsx`'s imports and the changelog.
- The README (a TexLab section, Syntax checks in the compile menu, the fixed shortcuts and the build), the changelog and the third-party notices (the language server client's packages) were brought up to date.

Two faults found in the live check were fixed:

- The outline's numbers did not follow a compile. A compile renames its `.aux` files into the kept folder, which TexLab's own watcher takes for their removal, so TexLab kept the old numbers until the next edit. The compile route now calls `auxKept`, which tells TexLab to read the main document's kept `.aux` files again two seconds later (after its watcher's one-second debounce), and the outline asks again 2.6 seconds after a compile. The real-TexLab test in `test/texlab.test.js` covers it and fails without it.
- A TexLab hover open when the editor left a file came back with that file and threw a RangeError measuring itself in the next one. It is now closed with the jump highlight before the switch.

### Phase 3 verification

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"`, with TexLab 5.26.0 on the `PATH` | 410 passed, 26 skipped, 0 failed (436 total) |
| `test/texlab.test.js`, including the real TexLab | 4 passed |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 31 passed |
| Native Rust unit tests | 7 passed |

The tests ran in the integrator's worktree with a scratch home and temp folder and no model calls. The 26 skips are phase 2's (opt-in native agent and sandbox checks, Windows-only checks, moving a project to the Bin and a live arXiv and DOI request). The real-TexLab test runs only when `texlab` is on the `PATH`, as it was here from a scratch folder.

The live check ran the integrated backend and Vite on scratch data, projects and template folders with a fake home folder, TexLab 5.26.0 from a scratch folder on the backend's `PATH` and a scripted model on 127.0.0.1, so no paid model was called. On a two-file paper it covered:

- **TexLab:** squiggles for an undefined `\ref`, an unused label and an unclosed brace, the hover on a `\cite`, `⌘`-click from a `\ref` to its label in the other file, `⇧F12`'s references panel, F2 renaming a label across both files with its Before rename checkpoint, the syntax check's dialog (Cancel went to the error, and the compile ran once it was fixed) and the project-wide outline with numbers and the figure, which followed a compile after the fix above.
- **Document insights:** the unused and duplicate label marks and the Overview's TexLab line, cleared once the duplicate was deleted.
- **Review:** every group found its planted problems, with Anonymous review on. The AI review's request had no tools and listed the findings as already reported, and its points were anchored (two moved to the lines of their quotes and one shown as "Location not found"). Line rows, a page row (which closed the panel), Show in PDF, Copy report (with a stubbed clipboard) and the screen reader view worked.
- **Research:** a keyless search of OpenAlex, arXiv, Crossref and the `.bib` with the AI sort, Keep with a reason, Drop, Add kept papers to .bib (it added the kept paper the `.bib` lacked and left out the one it had, which the add route reports as a duplicate when asked for it), Cite, the session after a reload and Verify claims opening the workspace with its skill, the Critical reviewer persona and the session, which reached the model.
- **Bottom card and settings:** History listed the new Ask chat and not the agent thread, and Settings › Search showed the research keys and emails.

### Phase 3 limits and open items

- Windows is untested: the TexLab build from the tag tarball (cargo, the cache in `~\AppData\Local\spectrum-build` and Windows `tar`), matching URIs whatever their letter case, ending TexLab with `taskkill` and Review reading an older PDF another program holds (`pdfStale`).
- The tarball's pinned SHA-256 is of GitHub's generated archive. If GitHub regenerates it, the Windows build and the release upload stop until the digest is updated.
- TexLab 5.26 limits worked around: it cannot forget a file an editor has had open, so a deleted one stays with empty text, and files changed on disk are read again two seconds after the last change, so their diagnostics can lag that long. Go to definition on a section's label lands on the `\section`.
- Outline numbers come from the main document's kept `.aux` only, so another document's outline has none.
- The syntax check waits for TexLab to catch up with the latest edit, up to five seconds. When Review's compile meets it and the user chooses Cancel, the review stops with "The compile was stopped." Cancel in Review does not stop a compile it started.
- An overfull box in a paragraph that runs across an `\input` is put at the paragraph's first line in the file TeX reports from, which can be a line of the other file. This is Spectrum's existing `parseCompileLog`, so the Logs tab does the same.
- Without TexLab the console shows one 503 from the lsp stream. When TexLab's line drops while the editor is sending, the console shows an unhandled “TexLab isn’t connected.”
- Semantic Scholar often answers 429 without a key, which shows as a failed source. Sessions saved before the preprint merge fixes keep their separate preprint and published copies.
- Not built: Research's Zotero source (phase 4), splitting a question into several queries with a model and a research MCP tool. Find citations for selection and local agents receiving a research task were not run live.
- The builders' work-in-progress commits `1c11997`, `f26e0b2` and `46edd4a` keep their placeholder messages, as they are in the merged branches' history.

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

### Phase 2 review fixes

The review's confirmed findings are fixed on `fix/p2-review`, one commit per fix or close group, each with a test or check:

- **Local agent sessions** (`agentSessionService.js`, `agentWorkspace.js`):
  - Stored events count a streamed piece by its text. Each piece had counted its whole JSON, so a long message shed the turn's start, user prompts included. A message past half the 2 MB cap goes on in a stored event of its own.
  - A review turn first brings the draft up to the project for every file the agent hasn't changed: the user's edits, new files and deletions (`refreshDraft`). A 1.10 session's file applied or rejected by path goes back to the user's file, and a direct turn that failed after clearing its baseline no longer fails every later turn.
  - Notes, the intro, the persona and the handoff are used up only once a prompt gets through. A draft Spectrum can't take for review (a link left in it, say) is told to the agent.
  - Requests still open when a turn ends, or when Spectrum closed during it, are marked answered, and the transcript treats any request no longer pending as answered. Stop ends a turn as "Stopped." and fails its tool cards still going.
  - A new session's updates that come before its id (its commands) are kept.
  - Sessions are named in the history menu by their first task.
- **Windows preview** (`previewDraft`, `compileService.js`): it runs no shell escape (`-no-shell-escape` on the command line, as MiKTeX ignores `shell_escape`), Biber, latexmk or glossary tools, all of which ignore TeX's limits. `PREVIEW_TEX_ENV` adds `openout_any` and MiKTeX's output and shell settings, and `initexmf` is asked what MiKTeX will use before compiling, so the preview refuses when MiKTeX's own configuration overrides them. The env is exported for `test/mcp-tools.test.js`, which now runs under any TeX.
- **Skills:** a skill switched off for the project can't be loaded or sent, by the Spectrum agent or to a local agent. The front matter reads after a BOM and with a description on the next line. Duplicate makes a valid id from a 64-letter one and marks a titled copy, keeping a shipped licence. Skills that run the left-out OpenRouter scripts say so when loaded. A skill's `.git`, `.env` and key files stay out of agent homes rather than stopping the copy, folders still held by a virus scanner are renamed again, and Windows copies only `.agents/skills`. `sync-skills.mjs` changes `skills/` only once every skill is fetched and checked. The related work and verify claims skills' descriptions were written afresh, as they followed Oleafly's AGPL wording.
- **Spectrum agent:** a run goes on from the thread's open proposals and each proposal keeps the file it was proposed against. A later turn no longer drops an earlier one's change to the same file, and Apply after reopening a thread merges the user's edits. Its tool calls come back as steps and show as cards with the reply. A project's last thread reopens with the workspace, and a merge keeps the Apply and Reject marks made on an older copy.
- **Workspace:**
  - Live pieces are joined as they come; 20,000 had taken about six seconds.
  - The preview PDF recompiles when a turn changes a file it already shows.
  - A task button goes back to the persona the user picked and takes its skill only while it's on.
  - The `/` menu lists every skill with its description.
  - The picker and Settings › Agents fall back to an agent that runs on this computer.
  - The workspace is mounted from the start, so the Agent button's dot shows.
  - The tab strip and plan heading work in a narrow column, a triple-clicked line counts as one, and labelled menu buttons, the listbox, the agent picker and the review's focus work with the keyboard and screen readers.
- **Settings:** persona and instruction fields are limited to what the routes take. The sharing card refreshes. A computer upgraded from 1.10.4 takes the others' personas and default instructions in, rather than sharing its starters over them, and an empty default-instructions box that was never shared never empties the others'.
- **Checkpoints:** a compile's checkpoint that becomes a "Before AI changes" one is dated then, so the local agent tab shows its Restore row.
- **Plan:** section 7 now says how a Windows preview limits TeX. Section 10b never claimed `openin_any` restricts TeX Live, so it is unchanged.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 389 passed, 22 skipped, 0 failed (411 total) |
| The same with `SPECTRUM_NATIVE_AGENT_TESTS=1` | 406 passed, 5 skipped (Windows only, the Bin, a live request), 0 failed |
| New `test/agent-turns.test.js` (9 native tests), also run on `25d0b92` | All 9 fail there, each on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data, projects and template folders, a scratch home and temp folder, and the ACP fixtures, with no model calls. The 22 skips are the earlier 13 and the 9 native agent turn tests.

Skipped as optional: marking a turn as needing attention when its draft couldn't be taken. The `.git` and `.env` filter when importing a skill, skipped here too, came back in the second round.

### Phase 2 second review fixes

The second round's ten confirmed findings are fixed on **`fix/p2-review2`**, branched from `bde28a4`, one commit each with a test or check:

- **Spectrum agent:** `read_file`, `list_files`, `propose_patch` and `apply_patch` refuse `.env` files, keys and git's, Claude's and Spectrum's folders (also through `sub/../`), and `list_files` leaves them out. It is the rule local agents' file requests already used, now `agentHidden` in `utils/pathUtils.js` for both. A closed change in a thread (applied, rejected, or superseded by a later turn's proposal for its file, made from the same base) keeps only its file and status, so a thread on a large file no longer reaches the 5 MB chat cap after a few turns.
- **Skills:** importing or duplicating a skill leaves its `.git`, `.env` files and keys behind, as the copy into agent homes does. The Spectrum agent reads the store itself, so `read_skill_file` had returned a cloned skill's token URL and its `.env`.
- **Local agent sessions:**
  - A turn's `changes` event names the changes without their texts, which the workspace fetches when it comes. Every turn had repeated the whole of every pending file, so a large file shed the transcript from the stored events, and one of about 1 MB shed everything.
  - The prompt is saved as the turn starts, and reopening a session Spectrum closed during takes the draft's changes in, so the tray shows the crashed turn's edits rather than the version before it.
  - A session whose first start failed starts the agent again for the next prompt, with its setup as it now is.
  - Preview PDF brings the draft up to the project first, as a turn does.
  - Apply takes a change the user also made (a file both deleted, or both created alike) instead of calling it a conflict.
  - Quitting stops only the sessions with a turn, a connected agent or a preview running, so the history menu keeps each session's status and time.
- **Settings:** a computer upgraded from 1.10.4 keeps personas and default instructions still at their default out of what it shares, and out of what counts as shared, until a file brings them in. When the newest file was a third computer's still on 1.10.4, it had shared its starters and an empty box over the 2.0 computer's own. The follow's logic is `followStep`, which `personas.check.ts` runs over three computers.

Skipped as optional: trimming a large ACP tool call's diff in the stored events, which can shed them the same way.

| Check | Result |
| --- | --- |
| Full backend suite, `node --test "test/*.test.js"` | 391 passed, 26 skipped, 0 failed (417 total) |
| The same with `SPECTRUM_NATIVE_AGENT_TESTS=1` | 412 passed, 5 skipped (Windows only, the Bin, a live request), 0 failed |
| Each new backend test, and the personas check, run without its fix | Each fails on the fault it covers |
| Frontend, `npm run typecheck` | Passed |
| Frontend production build, `npm run build` | Passed |
| Every `apps/frontend/src/**/*.check.ts`, bundled with esbuild and run separately | 29 passed |
| Native Rust unit tests | 7 passed |

The tests ran in a worktree with scratch data, projects and template folders, a scratch home and temp folder, and the ACP fixtures, with no model calls. The 26 skips are the earlier 22 and the four new native agent turn tests.

### Phase 2 limits and open items

- Windows is untested. On the Windows build machine, run `test/agent-preview.test.js` with `SPECTRUM_NATIVE_AGENT_TESTS=1`, and `test/mcp-tools.test.js`. The checks of what `initexmf --show-config-value` prints for MiKTeX's `[Core]` settings (`false` or `0`, and `Forbidden`) come from reading MiKTeX's source, not from a run. They fail closed: no preview. Check too that MiKTeX's bibtex keeps to those settings. TeX Live 2026 and later ignore `openin_any`, so a Windows preview needs MiKTeX or TeX Live 2025 or earlier and refuses otherwise.
- On Windows, a reparse point (a link or junction) anywhere in an agent's private home stops that agent from launching, as the isolation worker refuses to grant one.
- The Spectrum agent's tool cards appear when its run ends; showing them live needs the run to stream.
- Settings that follow you: a computer upgraded from 1.10.4 still takes nothing in when the newest file is a third computer's, still on 1.10.4, though it no longer shares its starters over the others'. It takes them in once a 2.0 computer shares again, but personas edited on it before then go across over the others' own. Closing it needs `sharedSettings` to also return, for keys the newest file lacks, the newest file that has them.
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
