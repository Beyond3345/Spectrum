# Local agent acceptance test

Written 26 November 2026 for Spectrum 2.6.4. DeepSeek Harness was the first local agent to pass every stage below in a packaged build on macOS. This file is the same test for each of the others, so a run says which stage an agent first fails at and why, and the results can be compared.

Use a scratch project only, never one of your own. Do each agent in a new Isolated session unless a stage says otherwise.

## The sample project

Make a new Typst project from the simple Typst template, then put one mistake in `main.typ`: change a correct line to call a function that does not exist, for example `#nofunction()`. Compile once and check that Logs shows the error.

## The stages

| Stage | What to do | What passes |
| --- | --- | --- |
| 1. Found | Open Settings › Agents and the agent's card | The card finds the program and shows its version, or says what to install |
| 2. Session opened | Press Test | The card says Session opened or Ready, not Test failed |
| 3. Signed in | Add the key or copy the login, then Test again | The card says Ready |
| 4. Reply | Ask in the Local agents tab: "Say hello and do nothing else." | A reply arrives and the turn ends as completed, with no changes |
| 5. Compile tool | Ask: "Compile the project with Spectrum's compile tool and tell me the error." | The agent calls the compile tool and names the error and its line |
| 6. Fix proposed | Ask: "Fix it." | A change waits in the tray for review, and `main.typ` in the editor is unchanged |
| 7. Draft compiles | Ask: "Compile your draft again." | The compile tool reports no errors |
| 8. Apply | Apply the change in the review | `main.typ` changes, and a compile from the toolbar succeeds |
| 9. Follow-up | Ask in the same session: "What did you change?" | The agent answers about its own change |
| 10. Wrong credential | Replace the key with a wrong one, or remove the copied login, and send a message | The turn fails with a line saying which credential was refused, and the card offers the way to fix it |

## Per agent

Record the first stage that does not pass, the exact message shown, the card's status after it, and whether the card's Network setting was Any host or Listed hosts only.

| Agent | Credential | Notes for this test |
| --- | --- | --- |
| DeepSeek Harness | `DEEPSEEK_API_KEY` | Passed stages 1 to 9 in 2.6.4 |
| Claude Agent | `ANTHROPIC_API_KEY` | Uses Spectrum's installed adapter. Update it first if the card says Update needed. Shown as untested until it passes this test |
| Codex | ChatGPT login or `OPENAI_API_KEY` | Run the whole test twice, once with each credential. In an Isolated session it runs commands without asking (Full access), so check one runs. For a routing failure, follow `CODEX_ROUTING_CHECK.md` |
| Antigravity | `GEMINI_API_KEY` | Needs the switch for its language server under Network, on by default since 2.7.0 |
| Gemini CLI | `GEMINI_API_KEY` or Google sign-in | |
| Cursor | `CURSOR_API_KEY` | |
| Kimi Code | `KIMI_API_KEY` or its login | |
| Qoder | `QODER_PERSONAL_ACCESS_TOKEN` | Marked experimental: some releases fail to start in ACP mode |
| Hermes | Its login or a provider key | |
| Pi | Its login | Needs the Pi CLI as well as its adapter, and does not get Spectrum's tools, so stages 5 and 7 cannot pass |
| OpenCode 2 | A provider key, such as `OPENAI_API_KEY`, or its login | Needs the switch for its local server under Network, on by default. Mac only |

## On Windows

Codex, Claude Agent, Pi and ZCode do not start in Windows isolation (`WINDOWS_AGENT_VALIDATION.md`), and local agents do not get Spectrum's tools there yet, so stages 5 and 7 cannot pass for any agent on Windows. Run stages 1 to 4, 6, 8, 9 and 10, and see `WINDOWS_AGENT_CHECKS.md` for the checks that only Windows can settle.
