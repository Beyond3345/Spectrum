# Spectrum 2.0, part 2: interface, agents, composer and languages

Status: plan, 29 October 2026, for approval. Nothing in it has been built. It finishes the 2.0 work left open last week and adds the features asked for on 28 October, all inside 2.0.0. Nothing is pushed to `main`, tagged or released until the user has tested a DMG and says so.

The detailed sections, written against the code at `50bedf6` and each checked by a second reviewer, are in [plan-2-part-2/](plan-2-part-2/). Each starts with the decisions taken with the user, which win over anything the section recommended before them.

| Track | Detailed section |
| --- | --- |
| Finishing 2.0: last week's open work, reviews, Windows and the order of work | [carryover.md](plan-2-part-2/carryover.md) |
| Agents: logos, the workspace list and the setup page | [agents.md](plan-2-part-2/agents.md) |
| Small interface fixes: lines between table cells and switches | [ui.md](plan-2-part-2/ui.md) |
| Diagram composer: categories, new composers and mixing symbol sets | [composer-categories.md](plan-2-part-2/composer-categories.md) |
| Diagram composer: Structures and Mohr's circle | [structures.md](plan-2-part-2/structures.md) |
| Spelling and grammar: Harper, Hunspell, languages, detection and LanguageTool | [languages.md](plan-2-part-2/languages.md) |

## What was asked

- **Agents.** Replace the two-letter monograms with each app's logo; show only agents that are set up in the agent workspace while Settings lists every supported agent; rebuild Settings › Agents as a list of cards with options and a guide to linking each agent (in the style of Oleafly, ideas only); update how agents are set up, since some are experimental.
- **Table generator.** Add lines between cells.
- **Skills page.** Fix the switch, which is too small and badly sized.
- **Diagram composer.** Structural analysis drawings (beam forces and moments, shear force and bending moment diagrams, the method of sections, the method of joints, Mohr's circle) drawn from a list of components like the circuit composer; research tikz.net for further features; classify the composers (Engineering, Physics, Mathematics and others); a setting to combine symbols from different TikZ packages.
- **Spelling and grammar.** Update Harper and Hunspell to their latest versions; every English dialect Harper supports, with Australian English the standard and the extra dictionaries kept; every language Hunspell fully supports; a list of the user's languages that automatic detection is limited to; LanguageTool, with Harper the default for English and LanguageTool for other languages.
- **Last week's work.** Finish the 2.0 tasks left open.

## What the research found

- **Agents** (checked 28 October): the official Codex and Claude Agent adapters moved on (ACP SDK 2.x is a breaking update); Gemini CLI now uses `--acp`; the old Kimi CLI is archived in favour of Kimi Code 2.x; Qoder is quarantined in the ACP registry; Pi, ZCode and DeepSeek Harness are still unofficial or pre-release. Lobe Icons (MIT) has every agent's logo except ZCode's.
- **Structural drawings:** stanli and structmech only draw symbols from numbers the user already knows, and their global macro names clash with other packages. Spectrum therefore solves the structure itself (a small stiffness solver) and writes plain TikZ that compiles everywhere, including the built-in Tectonic.
- **tikz.net** has 552 posts (Physics 339, Mathematics 169, Engineering 75, Computing 34). Most figures are plain TikZ from a small set of shapes, so the value is in three existing canvases plus one new Form mode for drawings Spectrum calculates from inputs, with symbol sets as data that can be mixed.
- **Harper 3.0.0** (27 October) supports five English dialects (American, British, Australian, Canadian and Indian) and English only; Spectrum's own build updates to it without code changes. **Hunspell 1.7.6** (26 October) needs a new small binding, because nodehun is Hunspell 1.3.3. LanguageTool's last ZIP was 6.6; 6.8 is on Maven Central. Traditional Chinese has no Hunspell dictionary and no LanguageTool support.

## Decisions

| # | Decision |
| --- | --- |
| 1 | The new features ship inside 2.0.0. Languages move to 2.1 only if that track slips. |
| 2 | Reviews: the phase 5 review now; phase 4's second round folded into the review of the whole of 2.0; one focused round for each new track. |
| 3 | Builders may push `feat/2.0` (never `main`, a tag or a release) and run the Windows workflow on it about five or six times. |
| 4 | No Windows installer for 1.10.4; the Windows build waits until 2.0 is finished. The current 2.0 already runs well on the user's Windows computer. |
| 5 | A 1.10 mirror record may be moved aside (never deleted) so Locate… and Get from GitHub work for such projects. |
| 6 | The GitHub OAuth app is registered (client id `Ov23lictk8ESvCDcCwyF`); one-click sign-in is tested on test DMG 3. |
| 7 | `docs/SPECTRUM_2_1_PLAN.md` is committed with a status note. |
| 8 | Agent logos in brand colours inside one uniform tile; Claude Agent shows the Claude spark in orange and is never called Claude Code. |
| 9 | The workspace shows agents that are set up, including untested ones and those whose last Test failed. |
| 10 | “Install bridge” for Codex, Claude Agent, Pi and ZCode, each marked official or community, installing only after the user confirms; npm bundled with Spectrum's Node. |
| 11 | New agents: Gemini CLI and GitHub Copilot CLI (on Windows the sandboxed Test decides). OpenClaw dropped; WorkBuddy a “Planned” card. |
| 12 | Table lines: click the gap between rows or columns; presets set them; partial lines later. |
| 13 | Switches 36 by 20 px, and every on/off tick box in Settings becomes a switch. |
| 14 | Composer categories: Engineering, Physics, Mathematics, Computing and Others. |
| 15 | Composer scope this round: the categorised chooser, symbol sets and mixing (off by default, with clash warnings and “Insert as image”), the circuit catalogue and blocks, mechanical supports, the plot upgrade, Venn diagrams, flowchart shapes (also writing fletcher where possible), circuit templates, Structures and Mohr's circle. Afterwards, the Mechanics and physics sets first. No chemfig editor. |
| 16 | Bending moment diagrams default to the tension side and Mohr's circle to τ positive downward; both defaults can be changed in Settings › Composer and in each drawing. |
| 17 | Languages: about 80 offered, only English bundled; a Download button for each language (nothing downloads without asking); same-script languages decided by their dictionaries; stray Simplified characters underlined in Traditional Chinese. |
| 18 | LanguageTool 6.8, downloaded with its own Java when first needed and run on this computer only. Harper stays the default for English. |

Every other question raised in the detailed sections takes its recommended default.

## Order of work

Taken from [carryover.md](plan-2-part-2/carryover.md), with the decisions applied.

| Phase | Work | Ends with |
| --- | --- | --- |
| 0. Approve | The user approves this plan. The OAuth client id goes in. The review plan and the handoff are updated, and the 2.1 research note is committed. | The plan recorded as approved |
| A. Phase 5's review and the work that does not build on it | **A1** phase 4 fixes (the Move to this computer race, the mirror record). **A2** the phase 5 review, whose fixer first lands the known items (the Typst default version in four places, the “Use the default” loop, the Tectonic time limit, `pdfFacts` on Node 24, the Windows workflow changes); then Windows run 1. **A3** the agents track. **A4** switches everywhere, asking before closing Settings with unsaved skill or persona edits, and hiding the GitHub view's unused layout switch. All four lanes run at once. | Review 2 clean twice; A3's focused round; **test DMG 3** with the OAuth client id; the user's real Zotero and GitHub tests |
| B. Features that build on phase 5 | **B1** the composer: foundations (chooser, symbol sets, flowchart canvas), then Structures and Mohr's circle, then the catalogue, plot, Venn, flowchart and template work. **B2** languages. **B3** lines between table cells. All three in parallel after A2 merges; B2 merges last. Each gets a focused round. | **Test DMG 4**; Windows run 2 |
| C. Review of the whole of 2.0 | The heavier review with phase 4's second-round lenses folded in | Two rounds in a row with nothing high or medium |
| D. Release | Final verification, the release DMG, Windows run 3 and its installer, the DMG review; the user tests the DMG and runs the Windows checklist | The user's word, then `main`, the `v2.0.0` tag and the Mac and Windows release |

The composer track is the largest piece: the research estimates its v1 list at 14 to 18 weeks for one developer, before Structures. It is split into sub-tracks that builders can run in parallel (foundations first, then Structures and Mohr's circle, the circuit work and the plot, Venn and flowchart work), and each merges when its focused round is clean. If the composer is not ready when the other tracks are, the user decides whether to wait or move the unfinished composer items to 2.1, as for languages.

## Standing rules

- Oleafly (AGPL), CircuiTikZ-Designer (GPL) and tikz.net examples (CC BY-SA) are ideas only. Spectrum stays MIT; third-party icons, dictionaries, LanguageTool and Java keep their own licences and notices.
- Going back to 1.10.4 keeps working: no `project.json` keys; per-project data goes in `.spectrum/settings.json`.
- Agents stay inside Spectrum's sandbox; secrets stay in the backend's private files.
- Tests use scratch folders and stand-ins, never the user's data, Zotero or GitHub account, and make no paid model calls.
- UI text in Australian English with curly quotes; docs without contractions, em dashes or Oxford commas.
- Builders work on branches from the newest `feat/2.0` and merge one at a time; nothing reaches `main`, a tag or a release without the user.
