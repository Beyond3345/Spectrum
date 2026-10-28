## Unfinished work from last week (finishing 2.0)

> **Decisions taken on 29 October 2026.** These were decided with the user after this section was written. Where the text below recommends or assumes something else, these decisions win. Every other open question in this section takes its recommended default.
>
> - The new features ship inside 2.0.0. The languages track moves to 2.1 only if it slips under the rule in “The order of work”.
> - Review structure (c): review 2 (phase 5) runs now; review 1 (phase 4's second round) is folded into review 3 (the whole of 2.0); each new track gets one focused round.
> - Builders may push `feat/2.0` (never `main`, a tag or a release) and run `windows.yml` on it about five or six times.
> - Locate… and Get from GitHub may move a 1.10 mirror record aside into `DATA_DIR/mirror-aside/`, never deleting it.
> - The GitHub OAuth app is registered. Its client id `Ov23lictk8ESvCDcCwyF` goes in as the default for `SPECTRUM_GITHUB_CLIENT_ID` in Phase 0, so test DMG 3 can test the device flow.
> - No Windows installer is attached to v1.10.4. The Windows build waits until 2.0 is completely finished.
> - The user built and installed the current 2.0 on the Windows computer and found it works well with no bugs. Item 5 (“Windows never run”) is therefore partly done: the CI runs and the Windows checklist still apply to the new work.
> - The push of `feat/2.0` on 25 October was the user's request.
> - `docs/SPECTRUM_2_1_PLAN.md` is committed with a status note: the languages section replaces its grammar part, and its performance ideas are kept for later.

### Goal

Finish everything 2.0 still owes from last week and fit it around the new features. Phases 4 and 5 should get no more review than they need, nothing ships unreviewed and the user tests a DMG before anything is released. The work covers what is left of the four reviews in [SPECTRUM_2_REVIEW_PLAN.md](SPECTRUM_2_REVIEW_PLAN.md), the final verification and the release DMG. It also covers the faults found while checking phase 5's open items, three small open items from the handoff, Spectrum's first Windows runs, the open steps of the agent rollout and the items only the user can do. The new features join 2.0.0 (decision 1). Agent runs are the main cost, so decision 12 offers three review structures and recommends the one that keeps review 2 but folds review 1 into review 3. Every fault that is already known gets fixed straight away, without waiting for a review round. The features that build on phase 5 wait until phase 5's fixes have merged. The review of the whole of 2.0 runs once, after every feature is in.

### What Spectrum does today

#### The branch

| Fact | How it was checked |
| --- | --- |
| `feat/2.0` is at `50bedf6`, 412 commits ahead of `main`. `main` can fast-forward to it | `git rev-list --count main..feat/2.0`; `git merge-base --is-ancestor main feat/2.0` |
| Nothing has been committed on any branch since 25 October | `git log --all --since=2026-10-26` is empty |
| The test DMG (`OpenPrism/builds/Spectrum_2.0.0_universal.dmg`, 210 MB, built from `31c4f0b`) holds the current code. The three later commits change only `docs/` | `git diff --stat 31c4f0b 50bedf6` |
| `origin/feat/2.0` is `50bedf6`. The branch was pushed on 25 October at 22:36, after the handoff (line 3) said no push had been made. There is no 2.0 tag or release. `main`'s README credit (`b61d1ea`) is on `origin/feat/2.0` but not on `origin/main` | `git reflog show origin/feat/2.0`; `git branch -r --contains b61d1ea`; `git rev-list --count origin/main..main` is 1 |
| `docs/SPECTRUM_2_1_PLAN.md` is the only untracked file | `git status --short` |
| The repository is private. The newest Windows installer on GitHub belongs to 1.10.0, because releases 1.10.1 to 1.10.4 carry the DMG only | `gh repo view`; `gh release view v1.10.0` to `v1.10.4` |

#### Checks run for this plan

The tree at `50bedf6` was exported with `git archive` into a scratch folder. It ran on the bundled Node 24.22.1 with the arm64 TexLab, Typst and Tectonic from `src-tauri/binaries`. Its home, data, projects, templates, temp folder and Bin were all scratch folders. Nothing in the repository was changed.

| Check | Result |
| --- | --- |
| macOS native agent tests (`SPECTRUM_NATIVE_AGENT_TESTS=1`, every `test/agent-*.test.js` and `test/mcp-tools.test.js`) | 41 tests: 39 passed and 2 skipped (both are Windows only). No result had been reported since phase 2, because phase 5's builder could not run `sandbox-exec` |
| Full backend suite | 501 tests: 447 passed, 51 skipped, 1 failed and 2 cancelled. All three problems are Tectonic compiles in a fresh home. The two SyncTeX tests passed when run again with Tectonic's cache filled. The third is a real fault (item 4) |
| `tsc --noEmit` in `apps/frontend` | Passed |
| Every `*.check.ts`, bundled with esbuild | 35 of 36 passed on Node 24. `editor/preflight/pdfFacts.check.ts` fails on Node 24 with “hashOriginal.toHex is not a function” and passes on Node 26.10. The worker of pdf.js 6.4.299 calls `Uint8Array.prototype.toHex`, which Node 24 lacks. `windows.yml` runs these checks on Node 24 (line 40). The app itself is not affected, as pdf.js runs in the WebView |
| `rollback.test.js` and `github-rollback.test.js` | Skipped in the export, because they read the git history. They last passed on `fdad5b6`. Since then only the interface, the two new skills and the docs have changed |

#### The open items in the code

1. **Typst's app default version.** `compileTypst` (`apps/backend/src/services/typstService.js:126-134`) uses the project's pin, else the app default that the compile route passes as `options.typstVersion`. Four places read only the pin:
   - `typstElements` (`typstService.js:97-120`). It sits behind Document insights' Typst numbers and pages, through `typstDocumentLabels` (`services/statsService.js:217-237`) and `GET /api/projects/:id/stats` (`routes/projects.js:523-528`), which takes no version. `typstCache` is module-wide and keyed only by the document's relative path and the PDF's mtime (`statsService.js:222-224`), so two projects with the same `main.typ` path and mtime share one entry;
   - the composer's chooser (`apps/frontend/src/diagram/ComposerApp.tsx:113`), which writes a new fletcher diagram's import line;
   - the composer's loader (`ComposerApp.tsx:244`), which decides whether a diagram needs saving again. It is a module-level function with no `useSettings()` (that hook appears only at line 311), and the editor beside it uses `effectiveCompile` (line 430), so the two can disagree about the import line;
   - inserting a TikZ diagram into a Typst document (`editor/tools/FloatsTab.tsx:664`). Its Typst 0.14 check passes even when the default is older.

   Agent compiles (`mcp/tools.js:132`) and the review preview (`agentSessionService.js:543` and 547) pass no version either. A review session's copy leaves out `.spectrum` (`HIDDEN_ENTRIES`, `utils/fsUtils.js:90-92`, used at `agentWorkspace.js:56`), so those compiles use the built-in Typst and ignore both the pin and the default. This plan leaves that as a limit (see Risks).
2. **The “Use the default” loop.** It has two causes.
   - *A stale compile request.* `useDefaultTypst` (`editor/tools/LogsTab.tsx:43-52`) clears the pin with `setCompileOption` and then calls `api.compile()`. The `api` it calls comes from the render the card was drawn in (`useEditor()`, line 9). That `api.compile` (`app/EditorPage.tsx:2668`) runs that render's `runCompile` (line 1537). `runCompile` sends `typstVersion: compileOptions.typstVersion` (line 1576), and `compileOptions` comes from that same render (line 397), not from `compileOptionsRef` (line 399). So the request still carries the old pin. The backend takes `settings.compile?.typstVersion || options.typstVersion` (`typstService.js:129`). The pin is gone from disk, so it falls back to the stale pin in the request and answers `TYPST_VERSION_MISSING` again. The first click brings back the same card, and only a second click compiles.
   - *No source.* The answer names the missing version but not where it came from (lines 131-134). When the missing version is the app default, there is no pin to clear, so every click brings back the card. Settings › Engines › Typst lets the user remove the version that is the default (`remove`, `app/SettingsSheet.tsx:1218-1229`) and then leaves Default version naming it (lines 1381-1389). `compileDefaults` is not shared between computers (`SHARED_KEYS`, `app/settings.ts:444-448`), so removing a version is how a user gets into this state. The request carries the effective version (pin or default), so the backend cannot tell a stale pin from the default. Adding a source field alone would therefore give wrong answers.
3. **Move to this computer.** `whileMoving` (`services/projectService.js:114-133`) refuses new folder lookups, waits once for the project files' lock and then copies. Its `ponytail:` note (lines 120-121) names the gap. A writer that looked up the folder before the move and takes the lock afterwards writes into the folder left behind. Chats, to-dos and notes all look up the folder before taking the lock (`chatFile` in `routes/chats.js:10-15`, used at lines 57-81; `itemFile` in `routes/todos.js:15-19`, used in `routes/todos.js:75-92` and `routes/notes.js:15-34`).

   Agent sessions have the same gap, more widely. A session keeps the folder it started with (`r.root`, set in `newAgentRun` at `agentSessionService.js:164-167`). Every path in the session reads that stored folder:
   - Apply (`applyWorkspaceChanges`, `agentWorkspace.js:135-186`);
   - the draft refresh at each turn (`refreshDraft`, `agentSessionService.js:650`, which reads `workspaceFiles(run.root)` at `agentWorkspace.js:219`);
   - the preview (line 524) and its cache (lines 528-529);
   - the turn's context;
   - the sandbox's `forbiddenRoots: [r.root]` (line 227);
   - a direct session's re-baseline (line 647).

   The new folder becomes known in only two places: `moveHere` after `moveEntry` (`routes/sync.js:38`) and `relocateProject` after `register` (`projectService.js:543`). A session loaded from disk later reads the folder fresh (`loadAgentRun`, line 99). `moveHere` (`routes/sync.js:18-45`) refuses during a compile or a conversion, but not while an agent is at work. After a move, an open session therefore keeps refreshing its draft from the sync app's folder, which other computers may still edit, and its Apply lands there with its checkpoint. None of it reaches the project the user now works in. Locate… (`relocateProject`, `projectService.js:528-545`) has the same shape.
4. **The built-in Tectonic's time limit (found while checking).** `runSpawn` takes its limit from `PASS_TIMEOUT_MS[cmd]` (`services/compileService.js:26-27` and 226), keyed by the name `tectonic`. Since phase 5 (`4520c39`), `cmd` is the built-in Tectonic's path whenever Spectrum carries one (`engineCommand`, lines 84-87). `src-tauri/src/main.rs:912-921` always sets `SPECTRUM_TECTONIC`, and `builtIn` falls back to `src-tauri/binaries` in a checkout (`engineService.js:47-52`). So each pass gets the 3-minute default instead of 15 minutes. A first Tectonic compile downloads Tectonic's bundle. `test/api.test.js:480`, whose server starts with a fresh home (line 130), failed after 181 seconds with Spectrum's own “The compile took too long and was stopped.” A new user with no TeX hits this on their first compile, because Auto then picks the built-in Tectonic. A fresh Windows runner hits it too.
5. **Windows has never run 2.0.** `windows.yml` builds on a push to `windows-port` or on Run workflow (lines 6-14). It runs the backend suite without `SPECTRUM_NATIVE_AGENT_TESTS` (lines 109-113), so the LPAC tests in `test/agent-windows.test.js` are skipped there. It has no `checkers:verify` step. None of its steps after Backend tests has a condition (typecheck at line 115, the frontend checks at 117-125, `cargo test` at 127-129). So a first run on `50bedf6` would probably stop in the backend tests because of item 4 and never reach the `pdfFacts` check. Every Windows check listed under phases 1 to 5 of the handoff is still to do.
6. **Agents on Windows.** `profileFor` (`services/agentProfiles.js:30-36`) marks five agents unavailable on Windows: OpenCode, because its Bun runtime reads `C:\`, and Codex, Claude Agent, Pi and ZCode, Node adapters whose redirected child pipes stall in LPAC. Direct sessions are refused on Windows (`NO_DIRECT`, `agentSessionService.js:152-159`). A Windows preview compiles LaTeX drafts only (lines 533-544), and Windows agents get no Spectrum tools. The worker launches only a native `.exe` (`native/agent-sandbox/Worker.cs:156`), so it refuses an npm `.cmd` shim. Settings › Agents explains this in its Windows hints (`SettingsSheet.tsx:2197-2205`). The workspace's picker lists every agent not marked unavailable, whether it is set up or not (`usable`, `editor/agent/LocalAgentTab.tsx:284`), and shows each as two letters (`monogram`, line 34).
7. **The rest of the agent rollout** ([AGENT_INTEGRATION_PLAN.md](AGENT_INTEGRATION_PLAN.md), Delivery sequence and Acceptance checks). All eleven profiles exist (`agentProfiles.js:12-24`), but only OpenCode 1.18.33 on macOS arm64 has been checked, and only by a handshake without a prompt (line 12). These steps are still open:
   - step 2: Codex was never run;
   - step 3: certifying Qoder, Cursor, Kimi Code, Hermes and Claude Agent for each system, version, mode and sign-in;
   - step 4: validating Pi, DeepSeek Harness and ZCode;
   - step 5: WorkBuddy and remote agents;
   - step 6: pinned managed installs;
   - a compatibility record for each agent.

   OpenCode now has a 2.x line (2.2.0, 27 October), which needs certifying separately. The agents section corrects Kimi, Pi and Qoder: Kimi's Python CLI is archived, Pi's package was renamed and Qoder is quarantined in the ACP registry.
8. **Settings' switches.** Three controls use WebKit's `switch` attribute and nothing else: the Skills cards (`SettingsSheet.tsx:1883`), the shared-settings switch (line 2088) and Review's anonymous switch (`editor/tools/ReviewTab.tsx:363`). Their `SWITCH` constants are at `SettingsSheet.tsx:1754` and `ReviewTab.tsx:55`. No stylesheet in `apps/frontend/src/styles` styles them. They show as WebKit's small native switch on a Mac, which is the user's complaint, and as plain tick boxes in WebView2 (handoff, Phase 2 limits, line 658).
9. **Unsaved edits in Settings.** Closing the Settings sheet does not ask about unsaved skill file or persona edits (handoff line 658), so the user can lose text they typed.
10. **The GitHub view's layout switch.** The list and grid switch (`app/ProjectPage.tsx:859-876`) still shows in the GitHub view, where it does nothing (handoff line 318).

#### Items only the user can do

- **The GitHub OAuth app.** `GITHUB_CLIENT_ID` is `process.env.SPECTRUM_GITHUB_CLIENT_ID || ''` (`apps/backend/src/config/constants.js:39`), so Settings › GitHub offers only a pasted token. The app has no client secret, so its client id can ship in Spectrum (handoff, “Registering the GitHub OAuth app”).
- **Real Zotero and GitHub.** Both have only been tested against stand-ins. The handoff's Zotero checklist is out of date. Authorise now sends `{ appName: 'Spectrum' }` (`zoteroService.js:220`). Writes send `Zotero-API-Key` with `Zotero-Server-ID` and no `Authorization: Bearer` (`call`, lines 39-56).
- **The Windows checks** on the Windows computer (item 5).
- **The way back on Windows.** Installing 2.0 moves that computer's data to 2.0. The only Windows installer for going back is 1.10.0's, which no rollback test covers (decision 13).
- **The stray Harper files.** `.gitignore`, `README.md`, `harper_wasm.d.ts` and `harper_wasm_bg.wasm.d.ts` are still in `native/harper`. `git status --ignored` lists them, as the stray `.gitignore` holds `*`. `buildHarper` strips these four from new builds (`scripts/native.mjs:140-142`) and swaps the whole folder (lines 145-152). Builders work in worktrees, though, so the main checkout keeps them, and `scripts/desktop.mjs:299` copies that folder into the app.
- **The Bin file** (`main (GitHub’s conflicted copy 2026-10-25 155756).tex`). Not checked here, because the Bin holds the user's own data.
- **The mirror record.** `relocateProject` leaves 1.10's record as it is (`projectService.js:540-541`), and Get from GitHub refuses a project that has one (`githubService.js:706`). 1.10.4 reads every `DATA_DIR/mirror/<id>.json` (its `mirrorService.js:32, 48 and 107-108` at `42ff62f`).

### Each open item: what remains, when and what the new features change

This table follows decision 12's recommended default (c): no separate review 1, with review 2 kept.

| Item | What remains | When | What the new features change |
| --- | --- | --- | --- |
| Review 1: phase 4, second round | Under (c), no separate round. Its five lenses, its round 1 findings with the fixer's diff (`git diff dde8ef5 c070493`) and its added scope `ff374f5..f3d8fe0` all go to review 3. That added scope is the nine `fix/p5-sync` commits that changed phase 4's GitHub, Zotero, settings and lock code after round 1. Under (a), it runs in Phase A as before | Phase C, inside review 3 | Live-4's check of the Harper and Hunspell versions and windows-4's nodehun build check go to the languages track's round, because that work replaces both. They go back to review 3 if that track is cut |
| Review 2: phase 5 | Its fixer first lands the known findings. Then the eight lenses run in rounds until two rounds in a row find nothing high or medium | Phase A, first. The composer, languages and table work branch only after its fixes merge | Its scope adds `bd22d41` (the Typst and Markdown skills) and the compile menu commits `cd77fbd` and `b93b564`. Known findings: items 1, 2 and 4, `pdfFacts` and Windows run 1's failures. Composer-typst adds composer saves and windows-5 adds Windows packaging. Those are two of the six areas Codex's audit left uncovered. The other four (agent isolation, shared credentials, cross-phase rollback and live workflows) belong to review 3 |
| Review 3: the whole of 2.0 | All of it, heavier variant | Phase C, once every feature is in | It also reads the interface commits made after the first test DMG (`99f7828` and `31c4f0b`), which no round has read, and A1's and A4's fixes. Each of its nine lenses widens to the new work. Security takes agent sign-in, copied logins, bridge downloads and LanguageTool's connection. Data-safety takes the composer's new files and the language settings. Rollback takes every file in the data folder that 1.10.4 reads: `.spectrum/settings.json`, the shared settings, the app's own settings, `DATA_DIR/agents/config.json` and `DATA_DIR/agents/runs`. Docs-licences takes the TikZ packages, the dictionaries, Harper and LanguageTool. Performance takes memory use with many dictionaries and a LanguageTool server |
| Review 4: the DMG | All of it | Phase D | The bundle lens adds the new Harper, the dictionaries and the agent icons, and it checks that `native/harper` carries no stray files. The size lens needs a new estimate. The review plan's 195 MB DMG is already exceeded by the current 210 MB DMG, and the 520 MB installed estimate (516 MB today) will not hold with the new features |
| Final verification and release DMG | All of it | Phase D | The checks grow by the new features' own. README, CHANGELOG and THIRD_PARTY_NOTICES cover them |
| 1. Typst default version | A fix in four places | Phase A, review 2's fixer | It must land before the composer's chooser is reworked for categories |
| 2. The “Use the default” loop | A fix in `runCompile` and the card | Phase A, review 2's fixer | None |
| 3. Move to this computer | A fix covering chats, to-dos, notes, other writers, agent sessions and Locate… | Phase A, A1 | The agents redesign changes the setup page, not sessions, so the fix holds |
| 4. The built-in Tectonic's limit | A one-line fix | Phase A, the first thing review 2's fixer does | None |
| `pdfFacts` on Node 24 | A fix to the check | Phase A, with item 4 and before Windows run 1 | None |
| 5. Windows never run | About five or six CI runs (decision 2) and the user's checklist | Run 1 in Phase A after item 4 and `pdfFacts`. Fix runs as needed. Run 2 at the end of Phase B. Run 3 on the release candidate. Then the release run | New Windows paths join the checklist: the dictionaries and their engine, a LanguageTool runtime, structural symbols through the Windows TeX and the redrawn switches |
| 6. Agents disabled on Windows | Keep the refusals, check newer versions on the Windows computer and show the state honestly | The agents track (A3) builds the statuses. The user checks again in Phase D | The new setup list shows “Not available on Windows yet” with the reason. It never offers a bridge install that would leave a `.cmd` launcher. The workspace's list of set-up agents never shows a disabled agent |
| 7. The agent rollout | A record for each agent, pinned installs and certification, now including Codex and OpenCode 2.x | The agents track (A3). The user's real sign-in tests come in Phase D | Pinned managed installs (step 6) are now requested (“Install bridge”), within that step's rules: a pinned version, a checked digest, no `npx` of the latest version at each chat, and the user's own installation left alone |
| 8. The switches | One drawn switch for all three | Phase A, A4 | It also ends the phase 2 limit that showed these switches as tick boxes in WebView2 |
| 9. Unsaved Settings edits | Ask before closing | Phase A, A4 | None |
| 10. The GitHub view's layout switch | Hide it in that view | Phase A, A4 | None |
| The GitHub OAuth app | Register it, then one line in `constants.js` | Phase 0, so that DMG 3 can test the device flow | None |
| Real Zotero and GitHub tests | One pass each by the user | On test DMG 3 (under (a), on the first DMG that has review 1's fixes) | None |
| The Windows checks | The user's checklist | Phase D, on run 3's installer | It grows with the new features (item 5's row) |
| The way back on Windows | Attach a 1.10.4 installer (decision 13) | Before the user first installs 2.0 on Windows | None |
| The stray Harper files | Remove four files | When the languages track merges, or before the release DMG if it is cut (decision 6) | The Harper update rebuilds that folder anyway |
| The Bin file | Empty it if the user wishes | Any time | None |
| The mirror record decision | Decide, then a small fix if the answer is yes | Phase 0, then A1 | None |
| `SPECTRUM_2_1_PLAN.md` | Decide what happens to it | Phase 0 | The languages section replaces its grammar part. Its performance part was not requested |

### The design: what the user will see

These are the visible results of the finishing work. The new features' own screens are in their sections.

- **A missing pinned Typst version.** Logs' card keeps its wording and buttons. “Use the default” now compiles on the first click. Today it brings the same card back once.
- **A missing default Typst version.** When the missing version is the app's default, the card reads “Typst 0.13.1 is the default version in Settings › Engines, and it isn’t installed on this computer. Download it, or use the built-in version.” Its buttons are “Download Typst 0.13.1” and “Use the built-in Typst 0.15.1”. The second button sets Settings › Engines › Typst › Default version back to “Built in (0.15.1)” and compiles. If the pinned version and the default are both missing, the user sees the first card, then the second card, then a compile. No button can bring back its own card.
- **Removing the default version.** In Settings › Engines › Typst, choosing Remove on the version that is the default asks “Remove Typst 0.13.1?” with “It’s the default version, so projects that don’t pin their own will use the built-in Typst 0.15.1. A project that pins this version will ask for it again the next time it compiles.” Default version then shows “Built in (0.15.1)”.
- **One Typst version in the editor.** Document insights, the composer's import line and Insert's PDF check all use the version the editor's compile uses: the project's pin, else the app's default. Below Typst 0.15, Insights shows headings and labels without numbers or pages, as it already does for a pin. Insert keeps its message “Typst 0.12.0 can’t show PDF images. Choose Typst 0.14 or later in the compile menu.” Agent compiles and previews keep using the built-in Typst, as they do now.
- **A first Tectonic compile** gets 15 minutes for each pass, as an installed Tectonic always had.
- **Move to this computer.** A chat, to-do or note saved while its project moves either lands in the moved project or is refused with the existing message “This project is being moved to this computer. Try again once that’s finished.” Moving a project while an agent is at work is refused with ““Paper” is compiling, being converted or has an agent at work. Try again once that’s finished.” After a move or a Locate…, an open review session takes its draft, previews and Apply from the project's new folder. Its agent starts again for the next turn, so that its isolation names the new folder, and it picks up the same conversation where the agent can resume one. An open direct session (macOS only) refuses its next turn with “This project moved to another folder. Start a new session to go on.”
- **The mirror record (if approved).** Nothing new appears on screen. Get from GitHub of a project that 1.10 kept in step on this computer now works, instead of answering “Spectrum 1.10 kept “Paper” in step with a cloud copy on this computer…”. Going back to 1.10.4 afterwards shows that project as an ordinary local one, and its cloud copy stays as it was.
- **Switches.** Settings › Skills, the shared-settings switch and Review's anonymous switch use one drawn switch. It is sized to line up with the text beside it and looks the same on macOS and in WebView2.
- **Settings with unsaved edits.** Closing Settings with an unsaved skill file or persona asks “Discard your changes to “thesis-style”?” with “Discard” and “Keep editing”.
- **The GitHub view** no longer shows the list and grid switch.
- **Windows.** The user gets an installer from GitHub Actions (a workflow artifact, not a release) for the Windows computer.

### The order of work

| Phase | Work | Alongside | Ends with |
| --- | --- | --- | --- |
| 0. Approve | The user approves this plan and its decisions and registers the OAuth app (decision 5). The integrator updates the review plan and the handoff (step 1) | | The decisions recorded |
| A. Close phase 5's review and do the work that does not build on it | **A1:** the phase 4 fixes, with no review round under (c): item 3 and the mirror record. **A2:** review 2. Its fixer first lands items 4, `pdfFacts`, 2 and 1 and the `windows.yml` changes. The branch is then pushed and Windows run 1 starts. After that, review 2's lenses run with run 1's results as known findings. **A3:** the agents track (the setup page, the icons and the list of set-up agents), then its focused round. **A4:** items 8, 9 and 10. **A5:** any research the composer and languages sections leave open (no code) | All five lanes run at once. A2 is on the critical path | Review 2 with two rounds in a row finding nothing high or medium. A3 reviewed. One merge at a time into `feat/2.0`. **Test DMG 3**, with the OAuth client id if registered. The user's real Zotero and GitHub tests on it |
| B. The features that build on phase 5 | **B1:** composer categories and structural analysis. **B2:** languages (Harper, Hunspell, the language list and LanguageTool). **B3:** lines between table cells (`editor/floats.ts`, after A2's fixes). Each gets one focused round (decision 7) | All three run at the same time, after A2 has merged. The parts that review 2 does not touch (B2's engine builds and dictionaries, B1's symbol catalogue) may start during Phase A. B2 merges last | **Test DMG 4**, the branch pushed and Windows run 2 |
| C. Review 3 | The whole of 2.0, heavier variant (three verifiers for each finding and a completeness agent), with review 1's lenses and scope under (c) | Nothing else | Two rounds in a row with nothing high or medium |
| D. Release | Final verification. The release DMG. Windows run 3 and its installer. Review 4. The user tests the DMG and runs the Windows checklist | | The user's word. Then `main` is fast-forwarded, `v2.0.0` is tagged, the release is published with the DMG and `windows.yml` runs with `release_tag` |

The critical path is A2, then Phase B, then review 3, then the release. A1, A3, A4 and the Windows runs sit off it, although review 3 waits for all of them.

**When the languages track counts as slipped.** If B1 and B3 have passed their rounds and merged and B2 has not passed its round, DMG 4 is built without B2. The user then chooses whether to wait for B2 or move it to 2.1 with its own review. Review 3 starts only after that choice. If B2 moves out, live-4 and windows-4 go back to review 3, and the integrator removes the stray Harper files before the release DMG.

**Where the review rounds go.** Review 2 runs in Phase A. A focused round runs for each new track as soon as it is built: A3 in Phase A and B1 to B3 in Phase B. Each focused round has four lenses: correctness, data-safety, security and rollback. Review 3 runs once, in Phase C. Review 4 runs on the release DMG in Phase D.

**When to build test DMGs.** DMG 3 comes at the end of Phase A, DMG 4 at the end of Phase B and the release DMG in Phase D, after review 3. Each is built with `npm run desktop:build` and checked with `hdiutil verify` and `lipo -info` (never by running the Intel half). Each gets its SHA-256 file and goes in `OpenPrism/builds` beside the 1.10.4 DMG. The previous 2.0 test DMG is renamed rather than replaced.

**Merges.** Every lane branches from the newest `feat/2.0`, merges the newest `feat/2.0` into itself before its own merge and runs the checks after merging. `SettingsSheet.tsx` (2,321 lines) and `EditorPage.tsx` (3,827 lines) are touched by most lanes, so merges go one at a time.

### Implementation steps for builders

1. **Integrator, Phase 0: bring the docs up to date.**
   - In [SPECTRUM_2_REVIEW_PLAN.md](SPECTRUM_2_REVIEW_PLAN.md): the order above; decision 12's outcome, with review 1's lenses and scope moved into review 3 under (c); review 2's added scope and known findings; review 3 after the features, with its widened lenses; the focused rounds and their four lenses; the extra checks of step 11.
   - In [SPECTRUM_2_HANDOFF.md](SPECTRUM_2_HANDOFF.md): `origin/feat/2.0` is at `50bedf6`; the Zotero checklist's request shapes; this plan's status table.
   - *Check:* the docs rules (no contractions, em dashes or Oxford commas).
2. **Review 2's fixer, first: the built-in Tectonic's limit (item 4).** The two compile passes (`compileService.js:570` and 610) pass `PASS_TIMEOUT_MS[engine] || DEFAULT_PASS_TIMEOUT_MS` to `runSpawn`, keyed by the engine rather than by the command's path. *Check:* a test that a pass of the built-in Tectonic (with `SPECTRUM_TECTONIC` set) gets 15 minutes, and the Tectonic test in `test/api.test.js` passing from a fresh home.
3. **Review 2's fixer, first: `pdfFacts.check.ts` on Node 24.** When Node lacks `Uint8Array.prototype.toHex`, give the check the one pdf.js's worker calls. This is one line, in the check only. *Check:* every `*.check.ts` passes on the bundled Node 24.
4. **Review 2's fixer and the integrator: Windows CI (decisions 2 and 3).**
   - In `windows.yml`, give typecheck, the frontend checks and `cargo test` (lines 115-129) `if: ${{ !cancelled() }}`, so one run reports everything. The `attach` job still needs the whole job to pass (lines 131-133).
   - Add an `npm run checkers:verify` step.
   - Add a step with `continue-on-error: true` that runs `node --test test/agent-windows.test.js test/agent-preview.test.js test/mcp-tools.test.js` with `SPECTRUM_NATIVE_AGENT_TESTS: '1'`.
   - Once steps 2 to 4 have merged, the integrator runs `git push origin feat/2.0` (only that branch, never `main`, a tag or a release) and then `gh workflow run windows.yml --ref feat/2.0` with no `release_tag`. Record the result in the handoff and give its failures to review 2's windows lens as known findings. Batch the fixes so that each later run checks several of them.
   - *Check:* the run's log and its artifact.
5. **Review 2's fixer: no loop (item 2).**
   - `runCompile` (`EditorPage.tsx:1537`) reads `compileOptionsRef.current` in place of the render's `compileOptions`. It sends `typstVersion: loadSettings().compileDefaults.typstVersion || undefined`, which is the app default only, read when the compile runs. The backend already applies the pin from `.spectrum/settings.json` first (`typstService.js:129`), so a stale pin can never reach it.
   - The `TYPST_VERSION_MISSING` answer (`typstService.js:131-134`) adds `from: 'project'` when `settings.compile?.typstVersion` is set, else `from: 'default'`. The compile notice's type beside `api/client.ts:534` gains `from`.
   - `LogsTab.tsx:106-119` shows the default's wording when `from` is `default`. Its button calls `updateSettings({ compileDefaults: { ...loadSettings().compileDefaults, typstVersion: '' } })` and then `api.compile()`.
   - `remove` (`SettingsSheet.tsx:1218`) uses the wording above when the version is the default, then sets `typstVersion: ''`.
   - *Check:* a backend test of `from` in both cases. A live check that clicks “Use the default” once with a missing pin and the built-in Typst as default, and gets a compile on that first click. The same check with a missing default and no pin.
6. **Review 2's fixer: one Typst version in the editor (item 1).**
   - `typstElements(projectRoot, doc, fallback = '')` in `typstService.js` resolves `settings.compile?.typstVersion || fallback`, the rule `compileTypst` uses. `typstDocumentLabels(root, doc, fallback)` in `statsService.js` passes it on and keys `typstCache` by root, document and version.
   - `GET /api/projects/:id/stats` takes an optional `typstVersion`, checked with the pattern at `routes/projects.js:93`. `getProjectStats` (`api/client.ts:233`) sends it, and `InsightsPanel.tsx:112` passes `loadSettings().compileDefaults.typstVersion`.
   - `ComposerApp.tsx:113` and `FloatsTab.tsx:664` use `effectiveCompile(project.compile, settings.compileDefaults).typstVersion`, as `ComposerApp.tsx:430` already does. The module-level loader at `ComposerApp.tsx:244` uses `loadSettings().compileDefaults` in place of a hook.
   - *Check:* a `test/typst.test.js` case where an unpinned project whose fallback names a version that is not installed gets `null` from `typstElements`, and one with no fallback gets the built-in Typst's numbers. The typecheck. The live check of step 11.
7. **A1: the Move race (item 3).**
   - Look up the folder inside the project files' lock. Call `chatFile` and `itemFile` inside the `mutateProjectFiles` callbacks in `routes/chats.js`, `routes/todos.js` and `routes/notes.js`.
   - Find every other writer that takes the folder before the lock: a `getProjectRoot` call followed later by `mutateProjectFiles` or by `updateProjectSettings(root, …)`, such as the research sessions, Zotero's binding and GitHub's link. Inside the lock, check that `getProjectRoot(id)` still gives the same folder, and fail with the moving message otherwise.
   - Agent sessions, at one choke point:
     - Export `rehomeAgentRuns(projectId, root)` from `agentSessionService.js`. For each run in `runs` with that project, it sets `r.root` to the new folder. A review session also gets `disconnect(r)` (line 694), so the next `connect()` builds `forbiddenRoots` with the new folder and resumes the conversation where the agent supports it. A direct session is marked as moved, and its next turn refuses with the message above, before the re-baseline at line 647.
     - Call `rehomeAgentRuns` in `moveHere` after `moveEntry` (`routes/sync.js:38`) and in `relocateProject` after `register` (`projectService.js:543`).
     - Inside the lock, `reviewAgentChanges` (line 744) calls `getProjectRoot(r.projectId)`, which answers 409 during a move, and refuses if the folder differs from `r.root`.
     - Export `agentAtWork(projectId)`, built on the same test as `busyProject` (line 85: `busy || reviewing`). Refuse with it in `moveHere` (line 22, beside `compiling`) and in `relocateProject`.
   - Remove the `ponytail:` note at `projectService.js:120-121`.
   - *Check:* a test that pauses a chat save after its lookup, moves the project through `POST /api/projects/:id/move-here` and resumes the save. The save must land in the new folder or answer 409, and nothing may be written in the old folder. Codex's experiment did the same. A native agent test in which a turn, a preview and an Apply after a move all use the new folder only. A direct session refusing its next turn after a move.
8. **A1, if decision 4 is yes: the mirror record.** When `relocateProject` or Get from GitHub gives an id another folder and `readMirror(id)` finds a record, rename `DATA_DIR/mirror/<id>.json` and `DATA_DIR/mirror/<id>/` into `DATA_DIR/mirror-aside/`. Never delete them. Drop the refusal at `githubService.js:706`. 2.0's own readers (`readMirror`, the notice and the cloud copy claim) ignore `mirror-aside`. Review 3's rollback lens confirms that. *Check:* a `rollback.test.js` case in which, after Locate… picks another copy, 1.10.4 (`42ff62f`) lists the project as local and mirrors nothing.
9. **A3: the agents' data and the Windows rules.**
   - Keep the shape of `DATA_DIR/agents/config.json` (`command`, `args`, `keyEnv`, `apiKey`, `runtimePaths`), which 1.10.4 reads (its `agentProfiles.js:9` and 25-27). Never write a managed bridge's path into its `command`. Detected program paths, Test results and managed installs go in a new file, `DATA_DIR/agents/setup.json`, which 1.10.4 ignores.
   - Keep `profileFor`'s refusals (`agentProfiles.js:33-34`) until a run on the Windows computer with the newer version passes the LPAC tests and a handshake. Record each result in [WINDOWS_AGENT_VALIDATION.md](WINDOWS_AGENT_VALIDATION.md).
   - On Windows, the setup page points at a native `.exe`, or at the interpreter with its script, never at a `.cmd` shim (`Worker.cs:156`). The Windows hints (`SettingsSheet.tsx:2197-2205`) move into the new page.
   - Builders run handshakes only, never a prompt (decision 10).
   - *Check:* `test/agent-profiles.test.js` with `process.platform` set to `win32` around the call. A `rollback.test.js` case in which 1.10.4 at `42ff62f` lists an agent that 2.0 saved, with the same command and key as before.
10. **A4: the small Settings fixes (items 8 to 10).**
    - One CSS rule for `input[type=checkbox][role=switch]` in `styles/base.css` draws the switch at a size that lines up with its label. It uses `appearance: none`, the theme's tokens and a visible focus ring. Both `SWITCH` constants and their spreads go, because the drawn switch does not need WebKit's attribute.
    - The Settings sheet's close asks before dropping an unsaved skill file or persona.
    - `ProjectPage.tsx:859` hides the layout switch when `view === 'github'`.
    - *Check:* all three switches checked by keyboard and pointer, in light and dark, in the browser pane. The Windows checklist covers them in WebView2.
11. **Every fixer and the final verification: the checks.** The review plan's table, plus:
    - the macOS native agent tests with `SPECTRUM_NATIVE_AGENT_TESTS=1`, in a session where `/usr/bin/sandbox-exec` works (it did for this plan);
    - every `*.check.ts` on the bundled Node 24, as CI runs them;
    - Tectonic run once on a small document in the scratch home before the suite, so that its bundle download does not decide the SyncTeX tests' time limits;
    - `rollback.test.js` and `github-rollback.test.js` in a worktree with the git history;
    - live checks in the browser pane with scratch folders. Install Typst 0.12.0 into the scratch data folder and make it the default. Then an unpinned Typst project compiles with it, Insights shows headings without numbers, a new fletcher diagram imports fletcher 0.5.5 and Insert of a TikZ diagram is refused. Removing 0.12.0 in Settings sets the default back to the built-in version. A default naming a missing version gives the new card, and its button compiles on the first click.
12. **Integrator, when the languages track merges (or before the release DMG if it is cut): the stray Harper files** (decision 6). Confirm that the main checkout's `native/harper` holds exactly those four untracked files, then remove them. *Check:* `git status --short --ignored native/harper` lists nothing.
13. **Integrator: the OAuth client id and the release.**
    - If the OAuth app exists by then, make its client id the default of `GITHUB_CLIENT_ID` (`config/constants.js:39`) before DMG 3 is built.
    - In Phase D, update README, CHANGELOG (its 2.0.0 section) and THIRD_PARTY_NOTICES for the new features, and update the handoff's status table.
    - Run the checks of step 11 on the release candidate. Then build the release DMG, run review 4 and run Windows CI run 3.
    - The user tests the DMG and runs the Windows checklist on run 3's installer.
    - Only on the user's word: fast-forward `main` to `feat/2.0`, tag `v2.0.0`, publish the release with the DMG, then run `windows.yml` with `release_tag: v2.0.0` to attach the installer (that run builds and tests again).

### Tests and live checks

| What | Where | Passes when |
| --- | --- | --- |
| Item 1 | `test/typst.test.js`; the typecheck; the live check of step 11 | Insights, the composer and Insert use the editor compile's version |
| Item 2 | A backend test of `from`; the live checks of step 5 | “Use the default” compiles on its first click, and no card comes back after its own button |
| Item 3 | The paused-save test through `POST …/move-here`; a native agent test (turn, preview and Apply); the direct session's refusal | Nothing is written in the old folder or read from it after the move |
| Item 4 | A unit test; `api.test.js` from a fresh home | The built-in Tectonic gets 15 minutes a pass |
| `pdfFacts` | Every check on Node 24 | 36 of 36 |
| The mirror record (if yes) | `rollback.test.js` | 1.10.4 mirrors nothing after Locate… |
| The agents' data | `rollback.test.js` | 1.10.4 lists 2.0's saved agent as before |
| Items 8 to 10 | The browser pane; the Windows checklist | Three matching switches; the question before closing; no layout switch in the GitHub view |
| Windows | CI runs; the user's checklist | Each run passes, or each failure is a known finding with a fix |
| Agents on Windows | The user's Windows computer, handshakes only | Each agent the new page offers on Windows has a recorded passing run |

**The user's checklists.** These are not for builders, because they use real accounts and the Windows computer.

- *Zotero*, on DMG 3. Use a separate Zotero profile and data folder (Zotero's Profile Manager, opened by starting Zotero with `-P`) so the real library is untouched. Steps:
  - Settings › Zotero shows Zotero 10 and Better BibTeX.
  - Allow Spectrum in Zotero… brings up Zotero's own prompt.
  - Cite from Zotero works.
  - The Spectrum › <project> collection appears.
  - A `.bib` save adds an entry and then removes it.
  - Quit Zotero and start it again, to see whether `Zotero-Server-ID` changes. A change makes Spectrum ask again.
- *GitHub*, on DMG 3, with a throwaway project. Steps:
  - Sign in, with the device flow if the OAuth app exists, else with a token.
  - Back up makes a private repository.
  - Get from GitHub works on a second computer.
  - Make an edit on each side, then Pull.
  - Switching on the settings repository makes a private `spectrum-settings` repository on the account.
- *Windows*, in Phase D, on run 3's installer. First keep a way back (decision 13). Installing the 2.0 installer moves that computer's data to 2.0, as the Mac test DMG did. Then check:
  - the installed app opens and compiles LaTeX with MiKTeX;
  - the built-in Typst (with its `vcruntime140.dll`) and Tectonic compile;
  - Markdown compiles once pandoc is downloaded;
  - TexLab ends before a project goes to the Bin, and TexLab matches a file whose URI is spelt in another letter case;
  - Review reads the kept PDF while another program holds the PDF;
  - Zotero comes forward through AppActivate;
  - isomorphic-git's paths work with a drive letter, a deep folder and CRLF files, and Get from GitHub works with a large test repository and with the settings repository;
  - the default projects folder moves out of OneDrive at start-up;
  - only the user can read `github.json` and `zotero.json`, since mode 0600 means nothing on NTFS;
  - the Spectrum agent refuses `GIT~1/config` and `.env::$DATA`;
  - a direct session is still refused;
  - the LPAC tests and a handshake pass for each agent the new page offers;
  - what MiKTeX's `initexmf --show-config-value` prints, and whether its bibtex keeps to it;
  - the three switches;
  - the new features' own Windows checks.

### Risks and limits

- **Usage.** Reviews cost the most. Roughly, a round of review 1 takes 11 agents (five finders, five verifiers and a fixer) and review 2 takes 17. A focused round takes about 9 and review 4 about 7. Review 3 takes about 38: nine finders, 27 verifiers, a completeness agent and a fixer. Most reviews need two or three rounds. Under (a) the whole plan is about 175 to 250 agent runs. Under (c) it is about 155 to 215, a little more if review 3 needs a further round for phase 4. Under (b) it is about 120 to 170, plus about 38 for each further round review 3 needs.
- **Test DMGs before review 3.** DMGs 3 and 4 carry code that has had only one focused round: the agent bridge installs that download and run packages, the composer's new files and the language settings. The user installs them over the real data folder. The focused rounds' data-safety, security and rollback lenses lower this risk. Keep the 1.10.4 DMG for going back.
- **Merge conflicts** in `SettingsSheet.tsx` and `EditorPage.tsx`. Merges go one at a time, each branch is brought up to the newest `feat/2.0` first and the checks run after each merge.
- **Windows.** Each run takes about 45 minutes, up to the job's 90-minute limit (`windows.yml:24`). Runs are billed at double rate on the private repository, so about five or six runs come to roughly 450 to 550 billed minutes, and more if runs reach the limit. The Windows archives that `desktop.mjs` picks were checked statically only. Budget a round of fixes after run 1.
- **The way back on Windows.** Without decision 13, going back after installing 2.0 on Windows means 1.10.0, which no rollback test covers.
- **Agents on Windows** may stay off for 2.0, depending on how the vendors' newer versions behave in LPAC. The release does not wait for them.
- **Agent compiles keep the built-in Typst.** Passing the editor's version to them would need new read grants in the sandbox for the installed versions. That is left for later.
- **Real services** may disagree with the mocks. Testing on DMG 3 leaves review 3 to catch the fixes.
- **Tests that need the network** (Tectonic's bundle, Typst packages and engine downloads) can fail on a slow connection. Warm the caches before timing them.
- **pdf.js 6.4.299** calls `Uint8Array.prototype.toHex`, which needs a recent WebKit or WebView2. 1.10.4 shipped the same pdf.js, so this is not new. Review 3's live and windows lenses should still confirm that a PDF opens on the oldest macOS that `tauri.conf.json` allows (13.5, line 66).
- **The mirror record write** would be the first write 2.0 makes into 1.10's data. If the answer is no, Locate… keeps the hazard that 1.10.4's deletion brake guards against.
- **Without the OAuth app**, 2.0 ships with token sign-in only. If the app is registered after DMG 3, the device flow needs its own real test on the release DMG.

### Decisions for the user

| # | Decision | Recommended default | Why |
| --- | --- | --- | --- |
| 1 | Ship the new features in 2.0.0, or release 2.0.0 first and do them as 2.1 | In 2.0.0, with the languages track merging last and the cut-off rule above | Review 3, the rollback matrix and the DMG test happen once, and the first 2.0 has the interface fixes asked for |
| 2 | Push `feat/2.0` (that branch only, never `main`, a tag or a release) after A2's first fixes, and run `windows.yml` on it about five or six times in all (run 1, fix runs, runs 2 and 3, and the release run) | Yes | Windows has never run 2.0. A run on `50bedf6` as it is would stop at item 4 and show little. Each run is about 90 billed minutes at the private repository's double rate |
| 3 | In `windows.yml`, let the later steps run after a failed backend test, add a step that may fail for the Windows native agent tests and add a `checkers:verify` step | Yes | One run then reports everything. The LPAC tests have only ever been run by hand. The languages work makes `checkers:verify` matter more |
| 4 | Let Locate… and Get from GitHub move a 1.10 mirror record aside | Yes: into `DATA_DIR/mirror-aside/`, never deleted | It removes a path to reverted or deleted cloud files after going back to 1.10.4 and lets Get from GitHub work. 1.10.4 itself forgets such a record |
| 5 | Register the GitHub OAuth app in Phase 0 | Yes, about ten minutes with the handoff's steps | The client id goes into DMG 3, so the real GitHub test covers the device flow once, and one-click sign-in ships |
| 6 | Let the integrator remove the four stray Harper files when the languages track merges, or before the release DMG if it is cut | Yes | `desktop.mjs` copies them into the app, and the Harper update rebuilds that folder anyway |
| 7 | One focused round (four lenses) for each new track, with review 3 holding the rule of two clean rounds | Yes | It saves usage. The alternative is two clean rounds for each track, as phases 1 to 5 had |
| 8 | Build test DMG 3 at the end of Phase A | Yes | The agent setup and the switches reach the user early, and the real Zotero and GitHub tests need a build with A1's fixes |
| 9 | Release Mac and Windows together, as the standing rule says | Yes. Release the Mac DMG first only if the Windows checklist slips. That would depart from the rule | 2.0 has many Windows paths that have never run, and the rule asks for both platforms in each release |
| 10 | Builders check agents by handshake only, and the user runs one real task for each agent they use, on a test project | Yes | It keeps paid model calls out of builders' tests |
| 11 | What to do with `docs/SPECTRUM_2_1_PLAN.md` | Commit it with a status line saying the languages section replaces its grammar part | It keeps Codex's performance notes for later and ends the reviewers' rule to ignore it |
| 12 | Review structure: (a) review 1 and review 2 as planned, then review 3; (b) no separate reviews 1 and 2: a fixer lands the known items and review 3 takes both reviews' lenses; (c) keep review 2, fold review 1 into review 3 | (c) | Phase 4 already had a full round, and review 3 reads it again anyway. Composer and table work builds on phase 5, so its faults are cheaper to find before Phase B than after. (c) saves about 22 to 33 agent runs against (a) without that rework risk |
| 13 | Run `windows.yml` at `v1.10.4` with `release_tag: v1.10.4` to attach the missing 1.10.4 Windows installer to that published release | Yes, before the user first installs 2.0 on Windows | Releases 1.10.1 to 1.10.4 shipped without Windows, so the only Windows way back is 1.10.0. It is one more billed run, and it changes a published release, so it needs the user's word |

### Rough size

| Part | Size |
| --- | --- |
| Review 2, two or three rounds | L |
| Review 1, two or three rounds (only under (a)) | L |
| A focused round for each new track | M each |
| Review 3, heavier variant | L, the largest single part (larger under (b) or (c)) |
| Review 4 | S |
| Items 1, 2 and 4 and `pdfFacts` | S each |
| Item 3, with agent sessions and Locate… | M |
| The mirror record (if yes) | S |
| Items 8 to 10 | S |
| The agents' data file and its rollback test | S |
| Windows CI runs and the fixes after run 1 | M |
| Agents on Windows, checked again by the user | M |
| Final verification, release DMG and docs | M |
| The user: the OAuth app, the Bin file and the Zotero and GitHub tests | S, about two hours together |
| The user: the Windows checklist | M, about half a day |

### Reviewer points not taken

- Setting `r.forceNew` on a moved review session: `disconnect(r)` alone is enough to rebuild the sandbox with the new folder, and `forceNew` would throw away the agent's conversation.
- Passing the effective Typst version into agent compiles and previews: the sandbox would need new read grants for the installed versions, so this plan narrows the claim and lists it as a limit.
- Moving `SWITCH` into one shared module: a drawn switch with `appearance: none` makes WebKit's attribute unnecessary, so both constants are removed instead.
- A Windows check of a direct session's `mkdir .git`: direct sessions are refused on Windows (`NO_DIRECT`), so the checklist confirms that they are still refused. The `mkdir .git` case waits until the worker can block it (handoff line 648).
- Option (b) as the default review structure: it is offered under decision 12, but (c) is recommended because Phase B builds on phase 5.