## Agents: logos, the set-up list in the workspace and an Oleafly-style setup page

> **Decisions taken on 29 October 2026.** These were decided with the user after this section was written. Where the text below recommends or assumes something else, these decisions win. Every other open question in this section takes its recommended default.
>
> - Logos are shown in **brand colours** (not one colour), inside the same tile for every agent. Claude Agent uses the Claude spark in orange and is never called Claude Code or shown with its mascot. ZCode uses Z.ai's mark.
> - The workspace lists agents that are set up, including those configured but not tested and those whose last Test failed.
> - “Install bridge” is offered for Codex, Claude Agent, Pi **and** ZCode. Each card says plainly whether its adapter is official or from the community, and nothing installs until the user confirms a dialog naming the package, version, publisher, size and folder.
> - npm is bundled with Spectrum's own Node for these installs.
> - WorkBuddy stays as a “Planned” card in Settings and never appears in the workspace.
> - Only Gemini CLI and GitHub Copilot CLI are added. OpenClaw is dropped.
> - On Windows, Gemini CLI and Copilot CLI are not forced off: the sandboxed Test decides.

### Goal

Make local agents easy to recognise and easy to set up, and make Spectrum honest about which ones work. Each agent gets its own logo in one shared tile style in place of two letters. The agent workspace lists only the agents set up on this computer, plus the agent of an open session. Settings › Agents becomes a list of cards, one for every supported agent, WorkBuddy included as a planned card. Each card has a status chip and, when opened, the program Spectrum found, a Test that starts the agent inside isolation, the sign-in command to copy, a key field where the agent reads one, the ACP adapter, one next step and the setup guide. The card layout follows Oleafly's idea; no Oleafly code or text is used. The agent list catches up with the 28 October research: ACP SDK 2.0.2, the new Kimi Code 2 and OpenCode 2, two new agents (Gemini CLI and GitHub Copilot CLI), managed installs for the two stable adapters (Codex and Claude Agent) and a stated reason for every experimental agent. Settings saved by 1.10.4 and 2.0 keep working, and isolation, private homes and key handling stay as strict as they are now.

### What Spectrum does today

Checked on `feat/2.0` at `50bedf6`. `agentProfiles.js` is unchanged since 1.10.4.

| Area | Where | What it does now |
|---|---|---|
| Profiles | `apps/backend/src/services/agentProfiles.js:11-23` `PROFILES` | Eleven profiles: OpenCode, Codex, Claude Agent, Qoder, Cursor, Kimi Code, Hermes, Pi, DeepSeek Harness, ZCode and WorkBuddy (line 22, planned and never startable). Each has one command, its arguments, one key variable, a setup URL, login files and a note. Claude Agent's arguments are empty (line 14). |
| Key variables | `agentProfiles.js:10` `PROVIDER_KEYS` | Nine allowed variable names. `listAgents()` sends all nine as `keyEnvs` (line 46), so any of them can be saved for any agent. |
| Windows rules | `agentProfiles.js:30-36` `profileFor()` | OpenCode (line 33) and Codex, Claude Agent, Pi and ZCode (line 34) are unavailable on Windows. Kimi Code, Hermes, Qoder, Cursor and DeepSeek Harness are available. |
| Listing | `agentProfiles.js:37-48` `listAgents()` | Returns `command: saved.command \|\| p.command` (line 43). `installed` only says whether `resolveExecutable()` finds that command. Nothing is started, so a listed agent can still fail at its first prompt. Keys never leave the backend (line 46). |
| Saving | `agentProfiles.js:49-67` `saveAgentConfig()` | Merges with the saved entry, then writes `config[id] = { command, args, runtimePaths, apiKey, keyEnv }` to `agents/config.json` with mode 0600 (lines 64 and 66). Choosing another key variable clears the old key (line 60). The form sends the listed command and arguments back on every save (`SettingsSheet.tsx:2146`, `2177` and `2190`, and 1.10.4's `AgentPanel.tsx` does the same), so most saved entries hold a bare default name such as `codex-acp` or `agent`. |
| Logins | `agentProfiles.js:74-92` `importAgentLogin()` | Copies the listed regular files under 1 MB from the real home into the agent's private home, `agents/homes/<id>`. |
| Finding programs | `agentSandbox.js:48-59` `resolveExecutable()` | Searches the backend's PATH only and returns the real path. On macOS that PATH is the login shell's (`src-tauri/src/main.rs:1019` `search_path()`, run with `-ilc` at line 1052) plus Homebrew and a few tool folders. On Windows it is Explorer's PATH plus TeX folders (`main.rs:981`). |
| Isolation | `agentSandbox.js:12` `SYSTEM_READS`, `15-46` `sandboxProfile()` and `61-83` `spawnAgentProcess()`; `agentSandboxWindows.js:17-55` `spawnWindowsAgent()`; `native/agent-sandbox/Worker.cs:156` | macOS Seatbelt: reads limited to the system folders (including `/opt/homebrew`, `/usr/local` and `/Applications`), the folder of the program's real path and the runtime folders; a home folder or system root is refused (line 67); writes only to the workspace and the private home; HTTPS and DNS only, with loopback only for OpenCode's own port. The child gets the backend's PATH and the private home as HOME (line 76). Windows LPAC: a clean environment the agent cannot override (lines 43-46) and native `.exe` launchers only (Worker.cs line 156). |
| Starting a session | `agentSessionService.js:220-335` `connect()` | Builds the launch at lines 225-237 (command, arguments, key, `ZCODE_ACP_MODE=build`, OpenCode's port and password), copies skills, starts the tools server on macOS, spawns the agent (243), sends `initialize` (303, 30 seconds) and calls Cursor's `authenticate` (307), then loads, resumes or creates the session (315-329). Only the load and create calls sit in the `try`: their failures become a new “Agent setup failed: … Configure its API key or import a supported login in Agents.” error (330), which drops the agent's error code. `connect()` never checks `unavailable`; only `newAgentRun()` does (line 161). |
| ACP SDK | `agentSessionService.js:10`; `apps/backend/package.json` | `client` and `ndJsonStream` from `@agentclientprotocol/sdk` 1.9.0, whose root entry still includes the unstable schema Spectrum relies on. |
| Routes | `apps/backend/src/routes/agentSessions.js:7-9` | `GET /api/agents`, `PUT /api/agents/:id` and `POST /api/agents/:id/import-login`. |
| Workspace picker | `apps/frontend/src/editor/agent/LocalAgentTab.tsx` | `monogram()` (line 34) draws two letters. `usable` (line 284) is every agent that is not unavailable, so every startable agent shows (ten on a Mac) whether set up or not; one that is not set up only gets a dashed, dimmer tile (line 455). Arrow keys move through `usable` in a radio group (lines 433-464). “Set up in Settings › Agents” appears for a chosen agent that is not set up (lines 469-473). |
| Settings › Agents | `apps/frontend/src/app/SettingsSheet.tsx:2112-2321` `AgentsPane()` | One drop-down of every agent, then Executable, Provider credential (all nine variables), the key, Advanced (launcher arguments and runtime folders), “Save setup”, “Copy existing login” and “Remove saved key”. Nothing checks that an agent starts. The Windows intro names “Kimi Code, Hermes, Qoder and Cursor” (line 2198). |
| Icons | `apps/frontend/src/app/Icon.tsx:6-24`; `styles/base.css:139` `.sf`; `styles/tools.css:2794-2814` `.agent-icon` | Icons are CSS masks that take the text colour: SF Symbols on macOS, Fluent icons on Windows. The agent tile is 26 px with an 8 px radius, dashed when not set up and ringed in the accent colour when chosen. |
| Bundled Node | `scripts/desktop.mjs:128-140` `nodeBinary()` | Only `bin/node` is taken from the verified Node archive (line 138); npm is not bundled. |
| Notices and plan | `THIRD_PARTY_NOTICES.md:79`; `docs/AGENT_INTEGRATION_PLAN.md:18`, `24`, `42` and `135` | The notice still names SDK 1.9.0 and says launcher profiles do not bundle agents. The plan still calls the target “Claude Code” (lines 18, 24 and 42), lists WorkBuddy as a confirmed requirement (lines 18 and 23) and allows pinned managed installs “only after integration behavior is stable” (step 6, line 135). |

Last week's documents left two things this section touches. `docs/AGENT_INTEGRATION_PLAN.md` still records the 18 October versions and leaves managed installs for later. `docs/SPECTRUM_2_HANDOFF.md` lists review rounds that have not run: phase 4's second round, phase 5 and the whole of 2.0. This work changes `agentSessionService.js` and `agentProfiles.js`, which those reviews cover, so it should land after them or get its own review round before the next test DMG.

### The design

#### 1. Agent logos

- **Source.** Lobe Icons, static SVG package `@lobehub/icons-static-svg` 1.101.0 (MIT, Copyright (c) 2023 LobeHub): the one-colour drawings on a 24 px grid. Twelve files are copied into `apps/frontend/public/agents/<agent id>.svg`, renamed to Spectrum's ids and otherwise unchanged: `opencode`, `codex`, `claude`, `geminicli` as `gemini`, `githubcopilot` as `copilot`, `cursor`, `kimi`, `hermesagent` as `hermes`, `qoder`, `pi`, `deepseek` and `zai` as `zcode`. WorkBuddy has no file and uses the fallback.
- **Checked.** None of the twelve has a script, link, image or style element. All twelve read clearly at 16 px in light and dark tiles; Hermes's portrait is the weakest but still distinct.
- **Not used.** The React package `@lobehub/icons` (it pulls in `@lobehub/ui` and `lucide-react`), Lobe's Claude Code mascot (`claudecode`) and any icon fetched at run time, including the ACP registry's CDN.
- **Licence.** The npm package has no LICENSE file, so the logo script takes the MIT text from the lobe-icons repository into `apps/frontend/public/licences/lobe-icons-MIT.txt`, and THIRD_PARTY_NOTICES.md gains a row like the Fluent icons' (line 21). The MIT licence covers LobeHub's drawings; the marks stay their owners'.
- **One colour.** Each logo is a CSS mask that takes the text colour, as `Icon.tsx` does, so it matches Spectrum's icons in light and dark mode and on both systems.
- **Tile.** The existing `.agent-icon` tile (26 px, 8 px radius, subtle background) with a 16 px logo. Chosen: accent border and ring, as now. An open session's agent that is not set up: dashed border and tertiary colour, as now. The tile's title is the agent's name. Each card in Settings starts with the same tile, not clickable.
- **Fallback.** An agent without a bundled logo shows `monogram()` (its first two letters) in the same tile.
- **The Claude naming rule.** The agent is always “Claude Agent”: in the picker, on its card, in the history menu and in the docs. Never “Claude Code” or “Claude Code Agent”, never the Claude Code mascot or terminal-style art. Its logo is a decision for the user (see Decisions). It uses an Anthropic API key only: Anthropic's Agent SDK page says third-party products may not offer claude.ai login unless approved. Spectrum therefore always starts the adapter with `--hide-claude-auth`, which hides the claude.ai login from `initialize` and refuses any session a subscription would pay for; it shows no `claude` sign-in command and copies no Claude login. A test fails if any profile text contains “Claude Code”.
- **Affiliation note** at the foot of Settings › Agents: “Agent names and logos belong to their owners. Spectrum shows them only to identify each agent and is not affiliated with or endorsed by them.”

#### 2. The workspace lists only agents that are set up

The backend decides each agent's state in one place, `agentState()` in `agentProfiles.js`, checking in this order:

| Order | State | When | Chip |
|---|---|---|---|
| 0 | `planned` | The profile is planned (WorkBuddy) | “Planned” |
| 1 | `unavailable` | Isolation is unavailable, or the agent is off on this system | “Unavailable” |
| 2 | `missing` | Its program is not found, or a program it needs is not (Pi itself, the ZCode app) | “Not installed” |
| 3 | `adapter` | It needs an ACP adapter and none is found | “Adapter needed” |
| 4 | `ready`, `sign-in` or `failed` | A result is stored for the program found now: a session came back (`ready`), the agent asked for authentication (`sign-in`) or the Test failed in another way (`failed`) | “Ready”, “Sign-in needed” or “Test failed” |
| 5 | `untested` | No result for the program found now, but it is configured in Spectrum | “Not tested” |
| 6 | `sign-in` | Anything else: found, never tested and nothing configured in Spectrum | “Sign-in needed” |

**Configured in Spectrum** means at least one of: a saved key, a copied login in the private home, a program the user chose (an absolute path) or an adapter Spectrum installed. A saved bare name such as `codex-acp`, `agent` or `opencode` is not a choice: it is what the 1.10.4 and 2.0 forms saved by default, so it counts as no choice (see the migration in step 3).

**Set up** means `ready`, `untested`, or `failed` while configured in Spectrum. A Test that times out or stops on a network fault therefore never hides an agent the user set up; it stays in the workspace with the chip “Test failed”. Only `sign-in`, `not-acp` or a missing program take a configured agent out. The backend sends both `state` and `setUp`, so the rule lives in one place.

- A stored result records the absolute program path it ran. After a Homebrew update or a different “Choose…” the path differs, and the agent goes back to `untested` (still set up if configured). A change made in Spectrum (key, login, program, arguments, runtime folders or adapter) deletes the result.
- A session that opens records `ready`, and one refused with ACP error -32000 (authentication required) records `sign-in`. Other failed starts are not recorded. Agents set up before this update (a saved key, a copied login or an absolute program path) therefore show as “Not tested” and turn “Ready” after their first session. An agent the user never configured in Spectrum appears once a Test passes.

The picker in `LocalAgentTab.tsx`:

- Logos in a row with the chosen agent's name beside them, plus “ · Experimental” where it applies, as now. A “+” tile at the end, titled “Set up another agent”, opens Settings › Agents.
- Which logo is chosen: the open session's agent; otherwise the remembered pick (`spectrum-agent-pick`) if it is set up; otherwise the first set-up agent. Falling back does not overwrite the remembered pick.
- An open session whose agent is no longer set up still shows that agent, dashed and titled “Codex · Not set up”, with the existing “Set up in Settings › Agents” button. Sending continues the session, which reconnects with the current setup and reports a clear error when it cannot. A set-up agent whose last Test failed is titled “Codex · Test failed”.
- Empty state, when nothing is set up and no session is open: the picker row says “No agents are set up yet.” with a “Set up an agent” button, and the message box stays disabled. The welcome task buttons still fill the box.
- Keyboard: as now, the radio group is one tab stop on the chosen logo and the arrow keys move and choose, wrapping at the ends. Tab then reaches “+”. Each logo's accessible name is the agent's name. The logos are disabled while a turn runs.
- Opening Settings from the workspace expands the remembered agent's card when that agent is not ready, scrolls it into view and puts focus on its header. From “+”, or for a ready agent, no card is expanded.

#### 3. Settings › Agents as a list of cards

Spectrum's AI settings already split most of what Oleafly puts in tabs (Models, Personas, Skills, Agents), so only the Agents pane changes. Top to bottom:

1. Intro: “Coding agents on this computer work on a project from the agent workspace. Each runs isolated, with a private home of its own. Agents you set up here appear in the workspace.” The existing Windows note about Spectrum tools stays.
2. A “Check again” button that reloads the list. It only looks for programs; nothing is started.
3. The cards in groups, each under a heading:
   - “Set up”, with the hint “These appear in the agent workspace.”
   - “Finish setting up” (Sign-in needed, Adapter needed, and Test failed when not configured)
   - “Not installed”
   - “Unavailable on Windows” on Windows, or “Unavailable” when isolation is missing
   - “Planned” (WorkBuddy), never shown in the workspace
4. The existing privacy note and the affiliation note.

A closed card shows the logo tile, the name, an “Experimental” badge where it applies, a one-line status (for example “Version 2.3.0, tested 3 minutes ago” or “Install the ACP adapter to use Codex here.”), the chip and a chevron. The whole header is one button with `aria-expanded` and `aria-controls`; its accessible name is the agent's name, and the status line and chip are attached with `aria-describedby`.

An open card shows these sections in order, leaving out any with nothing to show:

| Section | Contents |
|---|---|
| “Program” | The path (shortened with ~, monospaced) or “Not found”; its source: “Found automatically”, “Installed by Spectrum” or “Chosen by you”; “Version 2.2.0” from the last result, or “Version not reported”. “Also readable in isolation:” followed by the folders derived for it (section 5), when there are any. Buttons “Choose…” (the native file picker, filtered to `.exe` on Windows), “Test” and, for a chosen program, “Find automatically”. The last result as a sentence, with “Details” showing the agent's last lines of output (saved keys shown as “[hidden]”). Pi and ZCode add a line for what they need, such as “Needs Pi: found at ~/.local/bin/pi”. |
| “Sign-in” | Only where Spectrum can copy the login a sign-in makes. “Sign-in command” in a code box with a copy button (“Copy sign-in command”; the toast says “Copied the command.”) and the hint “Run it in Terminal, then copy the login into Spectrum. If you sign in again later, copy it again.” (“in PowerShell” on Windows). Then “Copy existing login”, with “A login was found on this computer.” or “A copied login is in Spectrum.” |
| Key | Only where the agent reads one, or where a key is already saved. “API key”, or “Personal access token” for Qoder and GitHub Copilot CLI. A “Provider” choice where the agent takes several (OpenCode, Hermes and Pi). “Save key” and “Remove saved key”. The hint names the variable: “Passed to Codex as OPENAI_API_KEY and kept in Spectrum’s private data on this computer.” A key saved earlier under a variable this agent no longer lists (for example ZCode's `ZAI_API_KEY`) is still shown by name with “Remove saved key”, so it can be cleared. |
| “ACP adapter” | Only for Codex, Claude Agent, Pi and ZCode. The package and version, such as “@agentclientprotocol/codex-acp 2.3.0”; “Installed by Spectrum”, “Found on this computer” or “Not installed”; “Platform: macOS, Apple silicon” (or Intel). For Codex and Claude Agent: buttons “Install adapter”, “Update adapter” (when an older version installed by Spectrum is found) and “Remove”. For Pi and ZCode: the install command in a code box with a copy button. Hint: “The adapter lets Spectrum talk to Codex through the Agent Client Protocol.” |
| “Next step” | One sentence and at most one button, from the table below. Not shown when Ready. |
| Links | “Setup guide”, the vendor's ACP page. |
| “Advanced” | Launcher arguments and runtime folders, as now, with “Save”. |
| Experimental or planned | The reason, for experimental and planned agents. |

| State | Next step | Button |
|---|---|---|
| Not installed | “Install Gemini CLI, then press Check again.” with the install command in a code box and a copy button | none |
| Not installed, needs another program | “Install Pi first, then install the adapter.” with Pi's install command | none |
| Adapter needed, Codex or Claude Agent | “Install the ACP adapter to use Codex here.” | “Install adapter” |
| Adapter needed, Pi or ZCode | “Install the ACP adapter with the command above, then press Check again.” | none |
| Sign-in needed, a login was found | “A Codex login was found on this computer. Copy it into Spectrum.” | “Copy existing login” |
| Sign-in needed, command known | “Run the sign-in command in Terminal, then press Copy existing login.” | none |
| Sign-in needed, app sign-in | “Sign in inside the ZCode app, then press Copy existing login.” | none |
| Sign-in needed, key only | “Add your Cursor API key, then press Save key.” | none |
| Sign-in needed, never tested | “Sign in, copy the login or add a key, then press Test. Some agents work without one.” | “Test” |
| Not tested | “Press Test to check that OpenCode starts in isolation.” | “Test” |
| Test failed, no answer | “Hermes did not answer within 30 seconds. Check that it starts in Terminal, then press Test again.” | “Test” |
| Test failed, it stopped | “Hermes stopped before it answered. See Details. If it needs another folder, add it under Advanced.” | none |
| Test failed, an error | “Hermes answered with an error: ‹its message›.” | “Test” |
| Test failed, not ACP | “This program did not answer as an ACP agent. Choose the right program or check the launcher arguments.” | “Choose…” |
| Ready, but Kimi CLI 1 | “This is the archived Kimi CLI. Install Kimi Code, run kimi migrate, then press Test.” | none |
| Planned | “WorkBuddy will connect through its official platform in a later release.” | none |

Confirmations use Spectrum's own dialog. Install: title “Install the Codex adapter?”, message “Spectrum downloads @agentclientprotocol/codex-acp 2.3.0 from the npm registry into ~/Library/Application Support/com.beyond3345.spectrum/agents/adapters/codex/2.3.0. It needs about 360 MB. Install scripts do not run, and nothing outside that folder changes.”, button “Install”. The size is the one measured for this Mac's architecture. Remove: title “Remove the Codex adapter?”, message “Spectrum deletes that folder. You can install it again at any time.”, button “Remove” (destructive).

**When Test runs by itself.** Only after a change the user made on that card, and only when its program is found: after “Save key”, “Remove saved key”, “Copy existing login”, “Choose…”, “Find automatically”, “Install adapter”, “Update adapter” and the Advanced “Save”. Never on listing, on opening Settings or on “Check again”. Tests run one at a time across all agents; a second waits its turn with “Waiting to test…”. Each card has its own busy state (“Testing…”, “Installing…”) so the other cards stay usable, and every change sends `AGENTS_CHANGED` so the workspace refreshes.

#### 4. The agent list after this round

In picker order. “Spectrum installs” is the managed adapter of section 5; everything under “You install” stays manual.

| Agent | Starts | Spectrum installs | You install | Sign-in | Key it reads | Login Spectrum copies | Status |
|---|---|---|---|---|---|---|---|
| OpenCode | `opencode acp` with a private loopback port | nothing | `brew install anomalyco/tap/opencode-v2`, `npm install -g @opencode/cli` or the vendor script (into `~/.opencode/bin`) | OpenCode 1: `opencode auth login`. OpenCode 2: `/connect` inside `opencode` | a provider key, chosen | `.local/share/opencode/auth.json`, `.config/opencode/opencode.json` (OpenCode 2's location to confirm) | Stable; Test re-checks version 2 |
| Codex | `codex-acp` | `@agentclientprotocol/codex-acp` 2.3.0, which brings Codex 0.164.0 | nothing | `codex login` | `OPENAI_API_KEY` | `.codex/auth.json` | Stable |
| Claude Agent | `claude-agent-acp --hide-claude-auth` | `@agentclientprotocol/claude-agent-acp` 0.98.0, which brings the Claude Agent SDK 0.3.310 | nothing | none: an Anthropic API key only | `ANTHROPIC_API_KEY` | none | Stable |
| Gemini CLI | `gemini --acp` | nothing | `npm install -g @google/gemini-cli` or `brew install gemini-cli` | `gemini`, then Sign in with Google | `GEMINI_API_KEY` | `.gemini/settings.json`, `.gemini/oauth_creds.json`, `.gemini/google_accounts.json` (to confirm) | Stable, new |
| GitHub Copilot CLI | `copilot --acp` | nothing | `npm install -g @github/copilot` or `brew install copilot-cli` | a fine-grained token with the Copilot Requests permission | `GH_TOKEN` | none: a token is used (where its login is kept is not confirmed) | Stable, new; needs a Copilot plan |
| Cursor | `cursor-agent acp`, else `agent acp` | nothing | the vendor script (both names into `~/.local/bin`) | an API key | `CURSOR_API_KEY` | none: its login is in the keychain | Stable |
| Kimi Code | `kimi acp` | nothing | the vendor script (into `~/.kimi-code/bin`), `brew install kimi-code` or `npm install -g @moonshot-ai/kimi-code` | `kimi`, then `/login` | `KIMI_API_KEY`, read only when Kimi's own configuration names it (`api_key_env`) | `.kimi-code/config.toml`, `.kimi-code/credentials.json` (OAuth file to confirm) and Kimi CLI 1's `.kimi` files | Stable; Kimi CLI 1 is archived |
| Hermes | `hermes acp` | nothing | the vendor script, then its ACP extra | `hermes model` | a provider key, chosen | `.hermes/config.yaml`, `.hermes/auth.json`, `.hermes/.env` (new) | Stable |
| Qoder | `qoder --acp`, else `qodercli --acp` | nothing | the vendor script or `npm install -g @qoder-ai/qodercli` | a personal access token | `QODER_PERSONAL_ACCESS_TOKEN` | none | Experimental |
| Pi | `pi-acp`, which drives `pi --mode rpc`; Spectrum passes Pi's path as `PI_ACP_PI_COMMAND` | nothing | `npm install -g pi-acp@0.0.34`, and Pi: `npm install -g @earendil-works/pi-coding-agent` (the old `@mariozechner` package is deprecated) or the vendor script | `pi`, then `/login` | a provider key, chosen | `.pi/agent/auth.json`, `.pi/agent/models.json`, `.pi/agent/settings.json` (Pi 1's location to confirm) | Experimental |
| DeepSeek Harness | `dsh --profile acp` | nothing | `npm install -g @deepseek-ai/dsh@next`, a pre-release (to confirm) | none: its `authenticate` always succeeds | `DEEPSEEK_API_KEY` (to confirm) | none | Experimental |
| ZCode | `zcode-acp-server`, always in build mode | nothing | `npm install -g zcode-acp-server@0.76.3`, and the ZCode app | inside the ZCode app | none | `.zcode/v2/config.json`, `.zcode/v2/credentials.json` | Experimental |
| WorkBuddy | not startable | nothing | nothing | not yet | none | none | Planned |

Setup guides stay as now, plus `https://opencode.ai/v2/docs/acp` for OpenCode 2, `https://github.com/google-gemini/gemini-cli` for Gemini CLI and `https://github.com/github/copilot-cli` for GitHub Copilot CLI. Logins kept in the macOS keychain cannot be read inside isolation, which is why Cursor and GitHub Copilot CLI take a key or token.

Why each experimental or planned agent is marked (its card shows the reason):

- **Qoder:** “The ACP registry has paused Qoder because its ACP start failed in some releases. Test checks the version you have.” It stops being experimental once a Test passes on the current 1.1 releases.
- **Pi:** “Uses a community adapter. Pi edits files and runs commands itself, so Spectrum does not show them as they happen, and Spectrum’s tools do not reach it.”
- **DeepSeek Harness:** “A pre-release on npm. Its ACP mode is built for automation, so the workspace shows no plans, questions or terminals for it.”
- **ZCode:** “Uses a community adapter that drives ZCode’s internal app server. The adapter also installs about 330 MB of packages from other publishers, including a community DeepSeek harness. Spectrum always starts it in build mode, as its own default lets it act without asking.”
- **WorkBuddy:** “Planned. WorkBuddy needs a registered application secret that cannot live in a desktop app, so it will connect through its official platform with remote support in a later release.”

Not experimental but re-checked by Test: OpenCode 2 (new package and sign-in; its `acp --port --hostname` flags need confirming), Kimi Code 2 (rebuilt on Node.js; Kimi CLI 1 is archived and will stop working), Gemini CLI and GitHub Copilot CLI (new to Spectrum).

Not added:

- **OpenClaw.** Its ACP mode forwards to a local Gateway over WebSocket, which isolation blocks by design.
- **Later candidates:** Qwen Code, Goose, Mistral Vibe, Kiro, Cline and CodeBuddy Code (see Decisions).

ACP SDK: pin `@agentclientprotocol/sdk` to **2.0.2** and import from `@agentclientprotocol/sdk/unstable`. Checked in the 2.0.2 package: its root entry is now stable only, and its session update schema has no `plan_update` or `plan_removed` (Spectrum stores both) and no `systemPrompt` session capability (personas use it). The `/unstable` entry has all three. `client()`, `ndJsonStream()`, `connection.agent`, `connection.signal`, the `{ params }` handler context and the `(v) => v` parser for Cursor's methods keep the same shape in 2.0.2's type definitions. Not 2.1.0: it was published on 28 October, one day before this plan, and both official adapters use 2.0.2. The protocol is still ACP v1.

#### 5. Detection, Test and adapter installs

**Detection** (`findProgram()`), first match wins:

1. A program the user chose: a saved `command` that is an absolute path.
2. The adapter Spectrum installed, found from its folder: `agents/adapters/<id>/<pinned version>/node_modules/<package>/package.json` records the pinned version and the bin file exists. Nothing in config.json records it, so going back to 1.10.4 and saving there loses nothing.
3. The command, then its alternatives (Qoder: `qodercli`; Cursor: `cursor-agent` first, then `agent`), on the backend's PATH and then in known folders. A saved bare name that is not the profile's command or one of its alternatives is searched for the same way.

Known folders on macOS, from the vendors' install scripts read on 28 October: `~/.opencode/bin` (OpenCode 1 and 2), `~/.local/bin` (Cursor puts both names there and Pi can), `~/.kimi-code/bin` (Kimi Code) and `~/.pi/agent/bin` (Pi), plus `~/.npm-global/bin` and `~/.bun/bin` for global npm and Bun installs. Volta's folder is left out: its shims look for Volta under HOME, which isolation points at the private home. Homebrew's folders are already on the PATH. On Windows Spectrum keeps to the PATH until a Windows run confirms where the agents available there install. A program found in a known folder is launched by its absolute path; the backend's PATH does not change.

**Derived read folders.** Today isolation can read only the folder of the program's real path. A program installed under the home folder usually needs more of its own files, so `findProgram()` also returns `reads`, for the program and for a program it needs (Pi, the ZCode app):

- its package root: the nearest folder above the real path that holds `package.json` inside `node_modules/<package>`, or `pyvenv.cfg` for a Python environment;
- its interpreter's installation folder, when the first line names one outside the system folders (an absolute path such as `#!/…/venv/bin/python3.12`, or `#!/usr/bin/env node` resolved through the backend's PATH), taken from the interpreter's real path.

These are added to the launch's runtime folders, listed on the card as “Also readable in isolation:” and refused, as now, when one is a home folder or a system root. They are read-only and are the user's own installation of that agent (see Decisions). This covers Hermes's Python, Kimi CLI 1, Node installed with nvm and npm or Bun global installs in the home folder. It does not cover editable Python installs that point elsewhere; those are still added under Advanced.

**Programs an adapter starts.** pi-acp starts `pi` by name, so `launchOptions()` sets `PI_ACP_PI_COMMAND` to the Pi that `findProgram()` found and adds Pi's derived folders. zcode-acp-server looks for `/Applications/ZCode.app`, which isolation can already read; when the app is elsewhere, Spectrum passes it through the adapter's `ZCODE_APP_PATH` or `ZCODE_BIN` variable (which one to confirm) and adds its folder.

**Test** (`testAgent()`, route `POST /api/agents/:id/test`):

1. Refuse when the agent is unavailable or planned, its program is not found, or an install or turn of it is running (they share the private home). A turn that starts while that agent's Test runs waits for the Test to end; a Test is bounded, so the wait is short.
2. Make an empty folder in the agent's private home, `homes/<id>/tmp/spectrum-test-…`, as the workspace.
3. Start the agent exactly as a session would (`launchOptions()`: the same command, arguments, key, runtime and derived folders, OpenCode port and password, Pi's path, ZCode build mode and Claude's `--hide-claude-auth`) through `spawnAgentProcess()`, so the Test runs inside Seatbelt or LPAC. No project, skills or tools server.
4. Send `initialize` with a session's client capabilities (30 seconds) and require protocol version 1.
5. Cursor only: `authenticate` with `cursor_login` (30 seconds), as `connect()` does.
6. Send `session/new` with the empty folder and no MCP servers (30 seconds). No prompt is sent, so no model is called.
7. Stop the agent's process tree, delete the folder and store the result in config.json.

| What happened | Stored `code` | Chip |
|---|---|---|
| A session id came back | `ready`, with the agent's reported name and version | “Ready” |
| `session/new` or Cursor's `authenticate` failed with ACP error -32000 (authentication required) | `sign-in`, with the sign-in methods the agent advertised | “Sign-in needed” |
| Any other ACP error response (an invalid key, a failed model list) | `error`, with the agent's message, saved keys hidden | “Test failed” |
| No answer in time | `timeout` | “Test failed” |
| The process exited first | `exited`, with the last 2,000 characters of its output, saved keys hidden | “Test failed” |
| An answer that is not ACP v1 | `not-acp` | “Test failed” |

**Adapter installs** (`installAdapter()`, route `POST /api/agents/:id/adapter`; `removeAdapter()`, route `DELETE /api/agents/:id/adapter`):

- Only Codex and Claude Agent, only on macOS (they are unavailable on Windows) and only the package, version and checksum pinned in the profile. The request carries no package name or version. Pi and ZCode stay manual this round: they are experimental, the integration plan allows managed installs only once an integration is stable, and ZCode's adapter brings 55 packages (about 330 MB on Apple silicon) from several publishers.
- Refused while a Test or turn of that agent runs: “Codex is in use. Try again when it finishes.”
- Folder: `<data folder>/agents/adapters/<id>/<version>/`, beside the private homes, never inside one. npm installs into `agents/adapters/<id>/.staging-<random>/`, which is renamed into place only after the checks below. A leftover target folder from an earlier attempt is moved aside and deleted first. Older versions of that adapter are deleted afterwards, and a failed install leaves nothing behind.
- Command, run by Spectrum's own Node with the npm bundled in the Mac app (see Decisions): `npm install --prefix <staging> --save-exact --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ <package>@<version>`. Its environment holds only PATH, a temporary HOME and npm cache inside the staging folder and empty `npm_config_userconfig` and `npm_config_globalconfig` files, so the user's npm settings, tokens and registries are never read. Proxy variables pass through when the backend has them. Ten-minute limit.
- Checksums: npm checks every tarball against the registry's sha512. Spectrum then requires the staging `package-lock.json` to record the pinned version and integrity for the adapter itself. The bin file must exist too.
- npm is the only program in this work that runs outside isolation. With `--ignore-scripts` it only downloads and unpacks; nothing from the package runs until a Test or session starts it inside isolation.
- Launch: Spectrum's Node with `<folder>/node_modules/<package>/<bin>` and the profile's arguments, with the folder as its one extra runtime folder.

| Agent | Package and version | Bin | Pinned sha512 integrity | Installed size |
|---|---|---|---|---|
| Codex | `@agentclientprotocol/codex-acp` 2.3.0 | `dist/index.js` | `sha512-VdTYaOGXqLh/aVuAKIgFG7BIzbeq537FHGo28kgBhybDbeOdFVFTtc43k/tCpScFhZyqPQWHuWf8w/QQd0qtXQ==` | about 360 MB on Apple silicon (Codex's binary is 354 MB); Intel to be measured |
| Claude Agent | `@agentclientprotocol/claude-agent-acp` 0.98.0 | `dist/index.js` | `sha512-6UGEODegNXXgS6wKX9T1v72oSLVtSmM1N/9H780ljqkaR7B+OdlfMYFdscNurfodt9l3xjGy0Bga/NtnLs/Vlw==` | about 280 MB on Apple silicon (the SDK's binary is 274 MB); Intel to be measured |

These are npm's values on 28 October. Builders re-check them on the day they build and pin the newest release that is a few days old and passes Test. The Claude Agent adapter had two stable releases on 27 and 28 October (0.98.0 and 0.99.0) plus previews. On each pin refresh the builder also lists the resolved packages and their publishers and measures the size for both Mac architectures. No pinned package needs an install script: Codex and the Claude Agent SDK ship their binaries as optional platform packages.

**What stays manual.** Spectrum shows the command with a copy button and links the setup guide; it never runs these:

- Installing vendor programs and the Pi and ZCode adapters: OpenCode, Gemini CLI, GitHub Copilot CLI, Cursor, Kimi Code, Hermes and its ACP extra, Qoder, Pi and pi-acp, DeepSeek Harness, zcode-acp-server and the ZCode app. No `curl … | bash`, Homebrew or global npm install. Never `npx …@latest`. The commands shown name a pinned version where Spectrum depends on one. The look-alike npm package `zcode-acp` is not the adapter.
- Browser and OAuth sign-ins. ACP's “agent” sign-in opens a browser and waits on a local port, which isolation blocks, so sign-in happens in Terminal and the result is copied, or a key is used.
- Creating keys and tokens. For GitHub Copilot CLI that is a fine-grained token with only the Copilot Requests permission; Spectrum never passes its own GitHub sign-in to an agent.
- Updating vendor programs.

#### 6. Windows

| Agents | On Windows | The card says |
|---|---|---|
| Kimi Code, Hermes, Qoder, Cursor and DeepSeek Harness | Available as in 1.10 and 2.0, not certified for real tasks; Test decides Ready | a normal card. Where the program found is a `.cmd` or `.bat` (an npm install), the next step says “Windows isolation starts only native .exe programs. Choose the agent’s .exe, or install it with its Windows installer.” |
| OpenCode | Unavailable, as now | “OpenCode does not run inside Windows isolation yet. Its runtime needs to read the top of drive C:, and its internal server has not passed Spectrum’s Windows checks. Spectrum never runs an agent outside isolation.” |
| Codex, Claude Agent, Pi and ZCode | Unavailable, as now | “This agent’s adapter starts another program through Node.js, which stalls inside Windows isolation. It works on a Mac.” |
| Gemini CLI and GitHub Copilot CLI | Unavailable until tested (new agents) | “Gemini CLI runs on Node.js, which can stall inside Windows isolation when it starts a program. It stays off on Windows until it passes Spectrum’s Windows checks.” (with each agent's name) |

Unavailable cards sit under “Unavailable on Windows” with the chip “Unavailable”, the reason's first sentence as the status line and, when opened, the whole reason and the setup guide only. `connect()` now refuses an unavailable agent with the same reason, so an old session cannot start an agent its card calls unavailable. Windows also gets no adapter installs, no known folders and no derived read folders, and “Choose…” offers only `.exe` programs (the worker refuses `.cmd` and `.bat`). The note that Windows agents get no Spectrum tools stays.

#### Sandbox and privacy

- Every agent process, Test included, starts through `spawnAgentProcess()`. Nothing runs an agent outside isolation.
- Reads widen only by the derived folders of section 5: read-only, the agent's own installation, shown on its card and never a home folder or system root.
- Keys stay in `agents/config.json` (mode 0600) and reach only the agent's environment. `GET /api/agents` returns `hasKey`, never the key. Test details and session diagnostics hide the saved key and OpenCode's password.
- Copying a login reads only the listed files and only when the user presses the button. Listing only checks whether those files exist.
- Nothing is fetched at run time except an adapter the user confirms.
- No project data changes: nothing goes in project.json or `.spectrum/settings.json`. 1.10.4 ignores the new `test` field and drops it if it saves that agent; the agent then reads as “Not tested”. 1.10.4 reads an empty `command` as its default, as now.

### Implementation steps for builders

Branch from the newest `feat/2.0`. Each step ends with its check.

1. **ACP SDK 2.0.2.** Pin `@agentclientprotocol/sdk` to `2.0.2` in `apps/backend/package.json` and update `package-lock.json`. In `agentSessionService.js:10` import `client` and `ndJsonStream` from `@agentclientprotocol/sdk/unstable`. Add a `--plan-update` flag to `apps/backend/test/fixtures/acp-draft-agent.mjs` that sends a `plan_update` update and an `elicitation/create` request during a turn, and assert in `agent-draft.test.js` that both reach the run's events.
   *Check:* the new assertions pass with the `/unstable` import and fail with the root import; `SPECTRUM_NATIVE_AGENT_TESTS=1 npm run test:agents` and `npm test` pass, including the `systemPrompt` assertions in `agent-draft.test.js` (lines 73, 74 and 111).

2. **Profiles.** Rewrite `PROFILES` in `agentProfiles.js` from section 4, in picker order, with this shape:
   ```js
   { id: 'cursor', name: 'Cursor', command: 'cursor-agent', alt: ['agent'], args: ['acp'], url: 'https://cursor.com/docs/cli/acp',
     keys: ['CURSOR_API_KEY'], login: [], signIn: '', install: 'curl https://cursor.com/install -fsS | bash',
     adapter: undefined, needs: undefined, experimental: undefined, windows: undefined, planned: undefined }
   // adapter: { package, version, bin, managed, integrity?, size? } (integrity and size only where managed)
   // needs: { name: 'Pi', command: 'pi', install: '…', env: 'PI_ACP_PI_COMMAND' }
   // experimental, windows and planned: the reason texts of sections 4 and 6
   ```
   Claude Agent's `args` are `['--hide-claude-auth']`. Keep WorkBuddy with `planned`. Add `GEMINI_API_KEY` and `GH_TOKEN` to `PROVIDER_KEYS`, which stays the allow-list `saveAgentConfig()` checks; each profile's `keys` drives its card. `profileFor()` returns `{ ...profile, unavailable: profile.windows }` on Windows in place of lines 33 and 34.
   *Check:* `agent-profiles.test.js` asserts unique ids, WorkBuddy planned and never startable, “Claude Agent” as the Claude profile's name and `--hide-claude-auth` in its arguments, no string containing “Claude Code”, a reason on every experimental, planned and Windows-off profile, a version and a `sha512-` integrity on every managed adapter (Codex and Claude Agent only) and, with `process.platform` set to `win32`, the unavailable set of section 6 (Kimi Code and DeepSeek Harness still available).

3. **Detection, state, migration and config.** In `agentProfiles.js`:
   - `updateConfig(id, change)`: one promise chain for every read, change and write of config.json, so a session's result and a Settings save never overwrite each other. `saveAgentConfig()`, `importAgentLogin()` and results all go through it.
   - `chosenCommand(profile, saved)`: the saved command when it is an absolute path or a bare name other than the profile's command and its alternatives (`agent`, the old Cursor default, is an alternative); otherwise `''`. This is the migration for entries saved by the 1.10.4 and 2.0 forms. `saveAgentConfig()` writes the same normalised value, and saves `args` only when they differ from the profile's.
   - `findProgram(profile, saved)` returns `{ program, source, command, args, reads, needs }` or null, in section 5's order, using `resolveExecutable(command, [process.env.PATH, ...KNOWN_DIRS].join(path.delimiter))`. `reads` and the needed program's path come from `programReads(realPath)`, which follows section 5.
   - `adapterFound(profile)`: the pinned version folder with a matching `package.json` and bin, or an older version folder (for “Update adapter”). No config field.
   - `launchOptions(id, { workspace, home, forbiddenRoots })`: lines 225 to 237 of `connect()` moved here and built on `findProgram()`. It always appends `--hide-claude-auth` for Claude Agent when the arguments lack it (so Advanced cannot remove it), sets `needs.env` to the needed program's path and adds `reads` to the runtime folders.
   - `agentState(entry)`: a pure function with section 2's order and its `setUp` rule.
   - `agentEntry(id)` and `listAgents()` return the shape below. `loginFound` and `loginCopied` only check that the listed files exist (in the real home and in the private home).
   - `saveAgentConfig()` deletes `test` whenever the command, arguments, runtime folders, key or key variable change; `importAgentLogin()` deletes `test`; install and remove delete it too.

   A config.json entry:
   ```json
   "codex": { "command": "", "runtimePaths": [], "apiKey": "…", "keyEnv": "OPENAI_API_KEY",
     "test": { "ok": false, "code": "sign-in", "version": "2.3.0", "detail": "", "at": "2026-10-28T09:00:00.000Z",
               "program": "…/agents/adapters/codex/2.3.0/node_modules/@agentclientprotocol/codex-acp/dist/index.js" } }
   ```
   `LocalAgent` in `apps/frontend/src/api/client.ts:1502` keeps its fields so nothing else breaks, and gains:
   ```ts
   export type AgentState = 'planned' | 'unavailable' | 'missing' | 'adapter' | 'ready' | 'sign-in' | 'failed' | 'untested';
   // added to LocalAgent; keyEnvs becomes the agent's own keys plus a saved keyEnv outside them, and experimental becomes the reason text
   experimental?: string; planned?: string; program?: string; source?: 'chosen' | 'spectrum' | 'found'; reads?: string[];
   needs?: { name: string; found: boolean; install: string }; signIn?: string; install?: string;
   loginFound: boolean; loginCopied: boolean; configured: boolean;
   adapter?: { package: string; version: string; managed: boolean; install?: string; size?: string; found?: string; folder?: string; platform: string };
   test?: { ok: boolean; code: string; version?: string; detail?: string; at: string };
   state: AgentState; setUp: boolean;
   ```
   *Check:* unit tests with a scratch `HOME` and `SPECTRUM_DATA_DIR`: a 1.10.4-shaped entry `{ "command": "codex-acp", "args": [], "runtimePaths": [], "apiKey": "", "keyEnv": "OPENAI_API_KEY" }` reads as not chosen and not configured, and the same entry with a key reads as `untested` and set up; a Cursor entry saved as `agent` is not chosen; a Claude entry saved with `args: []` still launches with `--hide-claude-auth`; an installed adapter folder gives source `spectrum` with no config field, before and after an entry is rewritten in 1.10.4's shape; an executable `~/.local/bin/cursor-agent` is found with source `found`; `qodercli` is found when `qoder` is not; a fake `pi` under the scratch home, outside PATH, is passed as `PI_ACP_PI_COMMAND` with its package root in `reads`, and a derived folder equal to the scratch home is refused; a saved `ZAI_API_KEY` on ZCode is still listed; `agentState()` gives every row of section 2, and a configured agent with a `timeout` result stays set up; two `saveAgentConfig()` calls at once both land; `JSON.stringify(await listAgents())` never contains a saved key. The native tests still pass with `connect()` using `launchOptions()`.

4. **Test and session results.** Add `testAgent(id, { limit = 30000 } = {})` to `agentSessionService.js` as in section 5, behind one app-wide queue so Tests run one at a time. Its handlers answer file, terminal and permission requests with an error (no prompt is sent, so none should come), and its output uses line 246's redaction. In `connect()`: refuse an unavailable agent with its reason; wait for a running Test of the same agent; wrap Cursor's `authenticate` with the session calls and classify the original error (code -32000 gives `sign-in`) before it becomes “Agent setup failed: …”; once a session id comes back, store `ready` (only when it differs from the stored result, as every turn reconnects). Route `POST /api/agents/:id/test` returns `{ ok: true, agent }`. Add fixture flags to `apps/backend/test/fixtures/acp-agent.mjs`: `--auth-required` (session/new answers -32000), `--error` (session/new answers another error), `--exit` (prints a fake key to stderr, then exits) and `--silent` (never answers).
   *Check:* a new native test, `apps/backend/test/agent-test.test.js`, opt-in like the others and added to `scripts/check-agents.mjs`: `ready` with version “1”; `sign-in`; `error`; `exited` with the key shown as “[hidden]”; `timeout` with a short `limit`; a session start stores `ready` and an `--auth-required` session stores `sign-in`; a Test is refused while that agent's turn runs and a turn waits for that agent's Test; two Tests of different agents run one after the other; `connect()` refuses an agent marked unavailable. `agent-opencode.test.js` also runs `testAgent('opencode')` when OpenCode is installed and accepts `ready` or `sign-in`.

5. **Adapter installs.** Add `installAdapter(id, { npm } = {})` and `removeAdapter(id)` to `agentProfiles.js` as in section 5, for Codex and Claude Agent only, with routes `POST` and `DELETE /api/agents/:id/adapter` returning `{ ok: true, agent }`. npm is the copy bundled beside the backend, found with `new URL('./npm/bin/npm-cli.js', import.meta.url)` as `agentSandboxWindows.js:9` finds the worker; in development it is the npm beside the running Node (`<prefix>/lib/node_modules/npm/bin/npm-cli.js`); tests pass a fake through `npm`. In `scripts/desktop.mjs` `nodeBinary()` (line 138), also extract `lib/node_modules/npm` from the same verified archive on macOS and copy it into `resources/backend/npm`. Add npm (Artistic License 2.0, its own licence files kept) to THIRD_PARTY_NOTICES.md.
   *Check:* a unit test with a fake npm that records its arguments and environment and writes a lockfile: a wrong integrity or version is refused and leaves nothing behind; the right one is installed and found from its folder; a leftover target folder is replaced; install for Pi or ZCode is refused; install and remove are refused while that agent's Test or turn runs; the user's HOME and npm configuration are never passed; `--ignore-scripts`, `--save-exact` and the npmjs.org registry are always there; no request field reaches the command; remove deletes the folder. The live install is in the live checks.

6. **Logos.** Write `scripts/agent-logos.mjs` like `scripts/fluent-icons.mjs`: fetch `@lobehub/icons-static-svg@1.101.0` with `npm pack`, check its integrity (`sha512-Ob6WJOjXauLP/A1qZ9OlPlrncPNbwsIGH+ToFdxWt3APtaaMKtbIBGqJ0/LY2eBeUwTQuG7GpUw9LwPiv7OTdg==`), copy the twelve mapped files, refuse any file containing `<script`, `href`, `<image` or `<style` and write the MIT text from the repository. Add `apps/frontend/src/editor/agent/AgentLogo.tsx`: a `span.sf` masked with `/agents/<id>.svg` at 16 px, or `monogram()` (moved from `LocalAgentTab.tsx:34`) for an id without a file. Make `.agent-icon` centre its content. Add the THIRD_PARTY_NOTICES.md row.
   *Check:* running the script again changes no file; `npm run typecheck`; the picker and cards look right in light and dark mode.

7. **Workspace picker.** Add `apps/frontend/src/editor/agent/agents.ts` with `shownAgents(agents, sessionAgentId)` and `agentGroups(agents)`. In `LocalAgentTab.tsx` replace `usable` (line 284) with `shownAgents()`, `current` (line 79) with section 2's rule and `ready` (line 282) with `!!current?.setUp`; draw `<AgentLogo>` in place of the monogram (line 461); add “+” and the empty state.
   *Check:* `agents.check.ts`, run like `skills.check.ts` (`npx esbuild apps/frontend/src/editor/agent/agents.check.ts --bundle --platform=node --log-level=warning | node`): set-up agents in profile order, the open session's agent added once, WorkBuddy never shown, groups by state with planned last. `npm run typecheck`.

8. **Settings › Agents.** Add `apps/frontend/src/app/AgentSettings.tsx` with `AgentsPane` and `AgentCard`, in the manner of `GitHubSettings.tsx`. `SettingsSheet.tsx` imports it for line 521 and loses lines 2112 to 2321. The cards send `command` only from “Choose…” (an absolute path) and “Find automatically” (`''`), and never echo the listed command or arguments back. `client.ts` adds `testLocalAgent(id)`, `installLocalAgentAdapter(id)` and `removeLocalAgentAdapter(id)`. `desktop.ts` adds `pickFile()` beside `pickFolder()` (lines 19 to 34): `plugin:dialog|open` without `directory`, an `.exe` filter on Windows and the typed-path prompt in a browser (the existing `dialog:allow-open` permission covers it). Copy buttons use `navigator.clipboard.writeText` and a toast, as `GitHubSettings.tsx:131` does. Cards reuse the `.skill-card` border and radius and the `.badge` colours (`success`, `warning` and `danger`). The SF names needed (`plus`, `doc.on.doc`, `chevron.right`, `folder`, `arrow.down.circle`) are already in `scripts/sf-symbols.txt`.
   *Check:* `npm run typecheck`, `npm run build` and the live checks.

9. **Docs.** README's agent paragraphs (lines 476 to 484): the new list, managed adapters for Codex and Claude Agent and Windows. CHANGELOG's unreleased 2.0.0 entry. `docs/AGENT_INTEGRATION_PLAN.md`: 28 October versions; step 6 marked done for the Codex and Claude Agent adapters only; “Claude Code” replaced with “Claude Agent” where it names the integration (lines 18, 24 and 42). `docs/WINDOWS_AGENT_VALIDATION.md`: the table of section 6. THIRD_PARTY_NOTICES.md: Lobe Icons and npm, and line 79 rewritten for SDK 2.0.2 and for adapters that Spectrum downloads on request, which are not bundled and keep their own licences.
   *Check:* no contractions, em dashes or Oxford commas in the changed text, and no “Claude Code” left for the integration.

### Tests and live checks

Automated, with scratch data, projects and home folders and no model calls:

- `npm test`: profiles, the migration of 1.10.4 and 2.0 entries, detection and derived folders, `agentState()`, the config queue, key hiding and adapter installs with a fake npm.
- `SPECTRUM_NATIVE_AGENT_TESTS=1 npm run test:agents` on macOS: the SDK 2.0.2 checks, every Test outcome, results stored by sessions, the Test and turn exclusion and all existing native agent tests.
- Frontend: `agents.check.ts`, `npm run typecheck` and `npm run build`.

Live checks by the builder on the Mac, with the backend and Vite on scratch `SPECTRUM_DATA_DIR`, `SPECTRUM_PROJECTS_DIR` and `HOME` (never the real home, Zotero or GitHub):

1. Settings › Agents shows thirteen cards in the right groups (WorkBuddy under “Planned”), with chips and next steps as in section 3. Cards open with the mouse and the keyboard, and the copy buttons work. Opening Settings and pressing “Check again” start no agent.
2. With a scratch config.json in 1.10.4's shape (default commands saved, one with a key), only the agent with a key shows as “Not tested” and in the workspace; the others show “Found automatically” or “Not installed”.
3. “Choose…” the ACP fixture, with its folder as a runtime folder. Test makes it Ready; the workspace then lists it. Arrow keys and Tab behave, and “+” opens Settings with nothing expanded.
4. Remove its setup. The workspace says “No agents are set up yet.”, and “Set up an agent” opens Settings at that card.
5. Install the real Codex adapter 2.3.0 into the scratch data folder (network to registry.npmjs.org only), after checking that the confirmation names the package, folder and size. Test should say “Sign-in needed”, as there is no login or key. Do the same for Claude Agent's adapter and check that `initialize` advertises no claude.ai login, then remove both.
6. “Copy existing login” with a fake `~/.codex/auth.json` in the scratch home: the file lands in the private home and the card says so.
7. Light and dark mode, a narrow Settings window and the accessible names of the picker and card headers.

Checks only the user can do:

- With their own accounts, sign in to the agents they use, copy the logins and run one real task each. Codex matters most (it sandboxes its own shell commands with Seatbelt, which has to work inside Spectrum's), then OpenCode 2 (its internal server flags) and Pi (the derived folders). These tasks make model calls on the user's accounts.
- Confirm the login files for Gemini CLI, Kimi Code 2, OpenCode 2 and Pi 1: the toast after “Copy existing login” says how many files were copied.
- On the Windows computer: run `npm run test:agents`, check the Windows cards and their wording, then press Test for Kimi Code, Qoder, Cursor, Hermes and DeepSeek Harness where installed.
- Try the next test DMG before anything is pushed.

### Risks and limits

- A copied OAuth login can be refreshed inside Spectrum. If the provider rotates refresh tokens, that can sign the agent out in the user's own terminal, or the reverse. Copying again fixes it, and a key avoids it.
- Logins kept in the macOS keychain (Cursor, probably GitHub Copilot CLI and possibly Gemini CLI and Kimi Code) cannot be read inside isolation, so those agents need a key or token in Spectrum.
- Test proves that the agent starts, speaks ACP and accepts its sign-in. It does not prove model access, the agent's own tools or, on Windows, that child processes work inside LPAC. Only a real task shows those.
- Codex sandboxes its own commands with Seatbelt; whether that works inside Spectrum's Seatbelt profile needs a real task to show.
- OpenCode 2 may not accept `acp --port --hostname`. Its Test then fails and `launchOptions()` needs the new flags.
- Derived read folders find the usual layouts (npm, Bun, Python environments, nvm). A launcher that is a shell script, such as Pi's vendor install (to confirm), or an editable Python install can still need a folder added under Advanced.
- Versions move daily, so pins need a refresh each Spectrum release. A dependency inside an adapter can still move within its version range (see Decisions).
- The managed adapters are large (Codex about 360 MB, Claude Agent about 280 MB on Apple silicon) and are downloaded on each computer. ZCode's adapter, installed by the user, brings about 330 MB from several publishers.
- Some login files, DeepSeek Harness's key and install, and ZCode's app path variable are unverified (marked “to confirm”).
- Hermes's logo is a detailed portrait and reads weakly at 16 px.
- The marks belong to their owners. Lobe's licence covers the drawings only; Spectrum shows the marks only to identify each agent, with the affiliation note.
- Going back to 1.10.4 keeps working, but 1.10.4 cannot use an adapter Spectrum installed (it looks on the PATH), has no Gemini CLI or GitHub Copilot CLI profile and hides their sessions. Returning to 2.x finds the adapter again from its folder.

### Decisions for the user

1. **Claude Agent's logo.** Recommended: the Claude spark, in one colour, because you asked for each agent's own logo and users know it; the ACP registry shows the same mark for this adapter. Anthropic's guidelines name “Claude Agent” as allowed and forbid Claude Code names and look-alike visuals, but they do not address the Claude mark, so this is your call. The cautious choice is a neutral “CA” monogram, which avoids any suggestion that the integration is an Anthropic product.
2. **ZCode's logo.** Recommended: Z.ai's mark, as ZCode is Z.ai's own product and Lobe has no separate ZCode mark. The other choice is a “ZC” monogram.
3. **One colour or brand colours.** Recommended: one colour. Brand-colour files exist for only a few agents, and one colour follows light and dark mode and matches Spectrum's icons.
4. **What counts as set up.** Recommended: Ready, Not tested, or Test failed while configured in Spectrum. Agents set up before this update stay in the workspace and turn Ready after one session, and a network fault never hides one. Ready only would empty the workspace until each agent is tested.
5. **Where npm comes from.** Recommended: bundle npm in the Mac app from the same verified Node download (about 13 MB unpacked). It works for everyone, matches the bundled Node and never reads the user's npm settings. The other choice is the npm on the computer, with the manual command shown when there is none.
6. **How much to pin.** Recommended: each adapter's own version and checksum, as asked, with npm checking every other tarball against the registry and the builder reviewing the resolved packages on each refresh. A lockfile per adapter, installed with `npm ci`, would pin every dependency too, at the cost of a maintainer script and a lockfile per adapter.
7. **What Spectrum installs.** Recommended: the Codex and Claude Agent adapters only. Both are stable, which is when the integration plan allows managed installs. Pi and ZCode are experimental, and ZCode's adapter brings about 330 MB from several publishers, so both keep a copyable command. The other choice is all four adapters; later the same mechanism could install npm-distributed agents.
8. **Read folders for an agent's own installation.** Recommended: add the derived folders (the program's package or Python environment and its interpreter's folder) automatically and show them on the card. They are read-only and the agent's own files, and without them most agents installed under the home folder fail their first Test. The other choice is to offer them only through an “Add folders” button after a failed Test.
9. **New Node.js agents on Windows.** Recommended: Gemini CLI and GitHub Copilot CLI stay off on Windows until a Windows run passes a real task, because a passing Test does not show that a turn will not stall inside LPAC. Kimi Code and DeepSeek Harness stay available as in 1.10 and 2.0, with Test deciding, so no Windows user loses a working agent. The other choice is to let Test decide for all of them.
10. **Kimi Code's key.** Recommended: keep the key field with the hint that Kimi Code reads `KIMI_API_KEY` only when its own configuration names it (`api_key_env`); Spectrum does not write Kimi's configuration, which also needs model settings Spectrum cannot choose. The other choice is no key field and sign-in only.
11. **WorkBuddy.** Recommended: keep it as a “Planned” card in Settings and never in the workspace, as it is a confirmed requirement and you asked for every supported agent to show in Settings. The other choice is to remove it until its remote integration exists. OpenClaw is not added either way.
12. **More agents.** Recommended: none beyond Gemini CLI and GitHub Copilot CLI this round. Qwen Code, Goose, Mistral Vibe, Kiro, Cline and CodeBuddy Code (labelled as not WorkBuddy) can follow, each with its sign-in checked and a card.
13. **Order against the outstanding reviews.** Recommended: land this after the review rounds listed in the handoff (phase 4's second round, phase 5 and the whole of 2.0), since it changes files they cover. The other choice is its own review round before the next test DMG.

### Rough size

| Part | Size |
|---|---|
| Logos: script, files, licence and `AgentLogo` | S |
| Workspace picker: set-up list, empty state, “+” and keyboard | S |
| Settings › Agents cards | L |
| Agent list and ACP SDK 2.0.2 | M |
| Detection, migration, derived folders and state | M |
| Test, session results and the Test queue | M |
| Adapter installs with bundled npm (two adapters) | M |
| Windows rules and wording | S |
| Docs | S |

Overall: L.

### Reviewer points not taken

- **Make the “CA” monogram the default for Claude Agent.** Not taken: you asked for each app's logo, and the guidelines are silent on the mark, so Decision 1 is now worded neutrally and leaves the choice to you with the monogram as the cautious option.
- **Treat saved arguments equal to the old default as default.** Not needed: only Claude Agent's default arguments change, and `launchOptions()` always adds `--hide-claude-auth`, so no table of old defaults is kept.
- **Keep `adapter` in config.json as a hint.** Dropped instead: the folder is the only record, which is simpler and survives 1.10.4 rewriting the entry.
- **AGENT_INTEGRATION_PLAN.md line 132 says “Claude Code”.** Line 132 already says “Claude Agent”; the lines that say “Claude Code” are 18, 24 and 42, which step 9 now covers.