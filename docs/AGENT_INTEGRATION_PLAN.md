# Spectrum agent integrations

Research date: 18 October 2026 (Asia/Taipei). Versions checked again on 28 and 29 October 2026 for Spectrum 2.0.
Status: macOS local preview implemented for Spectrum 1.10.0. The compatibility and remote phases below remain a rollout plan, not completed certification.

## Implementation record

- Spectrum 2.0 (29 October 2026): the ACP client moved to `@agentclientprotocol/sdk` 2.0.2, imported from its `/unstable` entry, which keeps plan updates, elicitation questions and the system prompt session capability. Gemini CLI (`gemini --acp`) and GitHub Copilot CLI (`copilot --acp`) were added; OpenClaw was not, as its ACP mode forwards to a local gateway that isolation blocks. Settings › Agents became a card for each agent with a Test that starts it in isolation without a prompt, and the agent workspace lists only agents that are set up. Spectrum can install the pinned Codex, Claude Agent, Pi and ZCode adapters into its data folder after the user confirms, with the npm bundled beside its own Node.js, install scripts off and the checksum checked.
- Added an ACP v1 client using `@agentclientprotocol/sdk` 1.9.0, launcher/setup profiles for ten local agents, local session history, streaming, permissions/questions, agent-provided settings, cancellation and resume/handoff. WorkBuddy stays visibly planned, using official interfaces in the remote phase.
- Added isolated review by default and explicit direct editing. Review snapshots are captured by a fixed sandboxed reader, stored outside the agent's grants, hash-checked, and applied with concurrent-edit checks and recovery journals. Delegated file operations and terminal commands run inside the same policy. Editor saves share the application file-write queue.
- The macOS feasibility result uses `/usr/bin/sandbox-exec` with a per-process Seatbelt policy rather than a separately signed App Sandbox helper. Agent descendants inherit the policy. It grants the staging project/private agent state, selected runtime reads, public HTTPS/DNS, and one authenticated loopback port for OpenCode's internal server. Other local endpoints, Unix sockets, host automation, live-project access in review, and Spectrum metadata/secrets are denied. Missing isolation fails closed. This depends on the system tool remaining available; it does not establish compatibility with every macOS release or installed runtime.
- Credentials/configuration are explicitly copied from a narrow file allowlist where available, or provided as an API key/token. A clean environment and private HOME prevent implicit inheritance of host MCP/configuration. Changing provider variables clears the old key. Keychain-based authentication and subscription reuse are not claimed.
- Native checks cover forbidden reads/writes, link escape, child execution, local HTTP access, callback file operations, ACP approvals/cancel/resume, immutable review, binary/create/delete changes, concurrent-edit refusal and interrupted-apply recovery. OpenCode **1.18.33 on macOS arm64** completed initialization and session creation without an inference call. The other launcher versions and real authenticated editing workflows have not been certified.
- The initial editor context includes relative active file, selection and project outline. Dedicated scoped compilation/PDF/reference tools, attachments, managed installations, full adapter certification and remote execution remain later work. Agents can invoke installed command-line tools within their grants; the privileged host compiler is not exposed.
- Windows has an LPAC worker with explicit per-object filesystem grants, a restricted inherited-handle list, clean environment, private launch/control files, job containment, cancellation and grant/profile cleanup. Native Windows checks cover forbidden files, links, loopback services, descendants, review/direct ACP fixture execution and review/recovery. OpenCode 1.19.3 and Node adapters with redirected child pipes have exact compatibility blockers and remain unavailable on Windows; there is no unconfined fallback. See [Windows validation](WINDOWS_AGENT_VALIDATION.md). A universal macOS package contains arm64/x64 binaries; it is not proof of an Intel hardware smoke test.

## Confirmed requirements

- Support Codex, OpenCode, Claude Agent, Qoder, Cursor, Kimi Code, ZCode, DeepSeek Harness, WorkBuddy, Hermes, and Pi.
- Start with local execution; add remote agents later.
- Offer review and direct editing. Review is the default and must enforce filesystem isolation before release.
- Use native isolation on macOS and Windows; do not require Docker or another container runtime.
- Reuse agents' own login/configuration where officially supported, with API-key setup as another option where supported.
- Use official WorkBuddy interfaces only, even if its integration ships later.
- Claude Agent remains an integration target, always under that name and with an Anthropic API key only (the adapter starts with `--hide-claude-auth`). Its configuration for developing Spectrum is separate: the only project `.claude` directory found contained an empty `worktrees` folder; both were removed. No global agent configuration or Anthropic model support was removed.

## Recommendation

Make Spectrum an ACP client in its existing Node backend. Keep model APIs for quick features and the built-in assistant. Implement one shared ACP connection and session lifecycle, then small agent launch profiles and only the vendor exceptions that are actually required.

Treat isolation as the first feasibility milestone, ahead of a large agent picker. ACP is a communication protocol, not a security boundary. A working directory, a plan mode, an approval prompt, and a project copy do not confine a process.

Use stable ACP v1 initially. Current documentation separates v1 from a v2 draft; remote HTTP transport is also still described as a draft/custom transport. Do not equate a vendor's HTTP/SSE API with universal ACP HTTP compatibility. [ACP overview](https://agentclientprotocol.com/protocol/v1/overview), [transports](https://agentclientprotocol.com/protocol/v1/transports).

## Coverage and integration routes

These are documentation/source findings, not compatibility certifications. Check the installed release's handshake and behavior before enabling features. Source `main` can be ahead of a published package.

| Agent | Route to investigate/build | Qualification |
| --- | --- | --- |
| Codex | ACP-maintained `@agentclientprotocol/codex-acp`; executable `codex-acp` | Adapter runs Codex App Server. Begin with this shared ACP route; use a dedicated App Server implementation only if a required capability cannot pass through it. [Adapter](https://github.com/agentclientprotocol/codex-acp), [OpenAI documentation](https://learn.chatgpt.com/docs/app-server). |
| OpenCode | Native `opencode acp` over stdio | Good initial integration candidate; use its own configuration and advertised options. [Official ACP guide](https://opencode.ai/docs/acp/). |
| Claude Agent | `@agentclientprotocol/claude-agent-acp`, backed by the Claude Agent SDK | Preserve as a target; label the integration “Claude Agent” where required by vendor branding. Authentication is a separate release gate: do not assume a Claude subscription can be reused in a third-party product. [Adapter](https://github.com/agentclientprotocol/claude-agent-acp), [vendor SDK guidance](https://code.claude.com/docs/en/agent-sdk/overview). |
| Qoder | Native `qoder --acp` | Documents CLI-login reuse, personal access tokens, host filesystem/terminal delegation, and platform limits. Use normal permissions, never its bypass mode by default. [Official guide](https://docs.qoder.com/cli/acp). |
| Cursor | Native `agent acp` | Standard sessions plus vendor blocking question/plan requests. Implement those requests or return a clear supported failure; otherwise a turn may hang. [Official guide](https://cursor.com/docs/cli/acp). |
| Kimi Code | Native `kimi acp` | Documents sessions, config options, editor file/terminal delegation, and user questions. Negotiate the installed version; do not assume all documented extensions are present. [Official reference](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html). |
| ZCode | Evaluate community `zcode-acp-server` against the official ZCode CLI/app-server | A real ACP adapter exists, but no native ACP server was established from the official project materials reviewed. Ship only as an explicitly experimental adapter after version and isolation tests. Its documented historical default is unrestricted `yolo`; override and verify policy before starting a task. [Official project](https://github.com/zai-org/ZCode), [adapter](https://github.com/william0wang/zcode-acp). |
| DeepSeek Harness | Official source composition: `pnpm dsh --profile acp` | Native ACP package exists. Current source contract is automation-oriented: resume/list/close and model configuration, but no transcript replay, interactive plans, client filesystem/terminal delegation, or elicitation. Establish a released installation recipe before shipping; this source command is not a universal npm launcher. [Official package contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md). |
| WorkBuddy | Official Open Platform integration in the later remote phase; investigate any documented local interface separately | Official docs distinguish local-assistant messaging from cloud-task ACP over HTTP/SSE. Developer registration/OAuth are required. The docs reviewed target `.cn`; availability for the user's `.ai` product/account remains unverified. Do not silently replace WorkBuddy with CodeBuddy or use its unofficial desktop gateway. [Official Open API](https://open.workbuddy.cn/en/docs/openapi), [application registration](https://open.workbuddy.cn/docs/third-party-app). |
| Hermes | Native `hermes acp`, with the ACP extra installed | Keeps Hermes configuration, skills, memory, and provider setup. Validate the extra, toolset and child-process behavior in the selected runtime. [Official integration guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp). |
| Pi | Community `pi-acp`, driving `pi --mode rpc` | Adapter currently performs file/terminal operations locally rather than delegating them to Spectrum. Passed-in MCP servers are not wired through by this adapter. Isolation must contain its whole process tree; do not advertise full Spectrum tool parity. [Adapter and limitations](https://github.com/svkozak/pi-acp). |

For optional later compatibility, Tencent separately documents `codebuddy --acp`. This is evidence for CodeBuddy, not proof that the WorkBuddy desktop product is interchangeable. [CodeBuddy documentation](https://www.codebuddy.ai/docs/cli/acp).

The ACP registry provides distribution metadata, not proof of safety or feature completeness. As research anchors on 18 October, its source entries listed Codex adapter 2.2.2, Claude adapter 0.93.0, OpenCode 1.19.3, Qoder 0.2.14, Kimi CLI 1.52.0 and Pi adapter 0.0.34. On 28 and 29 October: Codex adapter 2.3.0 (pinned, with Codex 0.164), Claude Agent adapter 0.98.0 (pinned, with the Claude Agent SDK 0.3.310; 0.99.0 was a day old), Pi adapter 0.0.34 (pinned; Pi itself is now `@earendil-works/pi-coding-agent`), ZCode adapter `zcode-acp-server` 0.76.3 (pinned; 0.77 to 0.79 were a day old), OpenCode 2.2.0 (`@opencode/cli`) beside 1.19.5, Kimi Code 2.3.3 (`@moonshot-ai/kimi-code`; the Python Kimi CLI is archived), Gemini CLI 0.66.0, GitHub Copilot CLI 1.0.105, Qoder CLI 1.1.80 (paused in the registry) and DeepSeek Harness 0.2.1-rc.4 (`@deepseek-ai/dsh`, pre-release only). The pins and their sha512 checksums live in `apps/backend/src/services/agentProfiles.js`. These are not a tested compatibility set. Record resolved versions and hashes when implementing. [Registry source](https://github.com/agentclientprotocol/registry).

## Isolation: a release gate

Required behavior in review mode:

1. Create a private, durable working copy from the editor's current content and project assets, excluding Spectrum identity/history/sync state and secrets. Keep the source manifest separately in trusted Spectrum storage. Refuse incomplete copies or unsupported external links.
2. Run the agent, its shell commands, subagents, MCP servers, and compilation inside an enforced boundary. Grant writes only to the working copy and private runtime state. Do not grant access to the live project or unrelated personal files.
3. Keep permission to apply changes exclusively in Spectrum. An ACP permission answer cannot expand host access or convert a review session into direct editing.
4. Scope every host callback to the session and working copy. Do not let an agent invoke the ordinary host compiler, filesystem endpoints, or an existing external MCP server to write outside the boundary.
5. Test indirect bypasses: localhost HTTP APIs, inherited sockets, browser/desktop automation, symlinks/hardlinks, mount paths, child processes, and background tasks. Spectrum's current backend trusts loopback requests; that alone cannot distinguish an isolated agent from the trusted UI. Either prevent access to these endpoints or add authenticated/scoped brokering before review mode ships.
6. If isolation is unavailable or fails, refuse to start review mode. Never fall back silently to ordinary local execution.

Selected implementation: native per-platform isolation, with no container runtime requirement.

- **macOS:** the local preview uses the per-process Seatbelt implementation recorded above. A separately signed helper remains an alternative if the system launcher becomes unavailable or incompatible. Further certification must cover independently installed runtimes, signing and lifecycle behavior on each supported release. Do not sandbox the whole current Spectrum app merely to contain the agent. Apple's App Sandbox documentation describes a different entitlement-based integration; it does not certify the current Seatbelt policy. [Apple entitlements](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html).
- **Windows:** prototype an AppContainer worker, using a private profile and explicit access grants for the staging/runtime directories. Evaluate LPAC if ordinary AppContainer grants exceed the required scope. Validate process-tree containment, cleanup, interpreter execution, filesystem grants, and networking on packaged Windows builds. AppContainer provides OS-enforced file/network/process boundaries, but agent compatibility still needs proof. [Isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation), [launch APIs](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer).
- **Shared contract:** the trusted backend owns session policy and change application; the worker owns agent/terminal/MCP execution. Communicate over a private, authenticated channel. Grant only session paths and explicitly approved services. Support each OS implementation only after containment tests pass; never treat an agent's own “sandbox” setting as the common enforcement layer without verifying its guarantees.

If native confinement proves incompatible with an agent or authentication method, record the exact blocker and keep that combination unavailable in review mode. Do not silently add a container dependency, weaken confinement, or substitute direct editing for the user's default.

Reuse host login only when both the vendor and the isolation design permit it. Never expose the whole user home or raw credential directory simply to make authentication work. Some integrations will require a separate sandbox login or API key. Preconfigured MCP/desktop services with host authority cannot be inherited unchanged in review mode.

Direct editing is a separate, explicit session choice. Flush and reconcile editor changes first, capture a complete recoverable snapshot, then allow access to the selected live project. Project history does not undo network actions or changes outside that project. Keep project scoping where possible; direct mode is not a synonym for unrestricted permission bypass.

## ACP client and user experience

Use the official `@agentclientprotocol/sdk` in the existing ESM backend. Its current guide recommends the fluent `client()` API; verify the published version before coding against it. This protocol dependency is justified; avoid handwritten JSON-RPC framing. [TypeScript SDK](https://agentclientprotocol.com/libraries/typescript).

Maintain one session per Spectrum chat initially, with one active prompt per session and at most one editing run per project. An agent change starts a new agent session. Optional transcript handoff is a fresh context summary, not migration of hidden state.

- Startup: detect the configured executable/runtime, verify the version, initialize and negotiate capabilities, complete authentication, then create/load/resume the correct session.
- Runtime: stream messages, tool updates, plans, commands, config choices, permissions, questions, and errors into the existing composer. Separate permission decisions from ordinary user questions.
- Model/mode/effort controls come from agent-provided session configuration. Keep the existing model provider picker for direct model calls. Do not pretend every agent supports “Ask,” “Plan,” images, or every reasoning level.
- Stop: cancel the turn, resolve pending UI requests safely, and stop owned descendants/background jobs. Process exit, EOF, timeout, partial output, failure, and cancellation remain distinct outcomes. A disconnected stream never means success.
- Reconnect: preserve the Spectrum transcript and local run journal, then use advertised load/resume support. Deduplicate replayed events. A stored session ID does not prove it still exists or can resume on another computer.
- Extension handling: ignore unknown notifications safely; return method-not-found for unsupported requests rather than leaving them unanswered. Add Cursor's required blocking flows and other vendor extensions only when testing demonstrates a need.

Advertise host file and terminal operations only after their scoped handlers work. ACP filesystem callbacks can expose unsaved editor text; they do not stop an agent from having independent file access. [Filesystem specification](https://agentclientprotocol.com/protocol/v1/file-system). Terminal execution must stay in the same isolation boundary as the agent, even if Spectrum owns the terminal UI. [Terminal specification](https://agentclientprotocol.com/protocol/v1/terminals).

## Reviewing and applying results

Reuse the existing change sheet, conflict detection, atomic file helpers, file watcher, and version history. Extend them only where external agents require more kinds of changes.

Compare working-copy files with the immutable baseline; do not depend on an agent's reported diffs. Handle added, modified, deleted, and binary files. A rename can initially appear as deletion plus addition. Validate returned paths and filesystem object types again in trusted host code; never follow an output link into another host path.

The current `PendingChange` is text replacement only. Extend it for create/delete/binary operations and adapt the review, acceptance, chat serialization, summaries, and tests together. Show binary preview/metadata rather than decoding it as text.

On apply, compare baseline hashes against both current disk contents and current editor contents. Rebase non-overlapping text edits; keep conflicts for review. Never treat a failed file read as an empty original. Preflight all writes, save a complete before-AI version, and journal application so partial failure can recover without overwriting later user work. The existing history skips files above 50 MB and some unreadable files; skipped items require separate recovery or a refused operation, not an “everything is backed up” claim.

After accepting or rejecting a batch, reconcile the working copy with the actual project before the next prompt. If only some edits were accepted, tell the agent; otherwise it will continue from files that never became the user's project. Preserve private run state after an interrupted task so recovery is possible.

## Spectrum-specific capabilities

First pass: include relative active-file and selection context, the existing project outline, main document, engine, current compile log, and supported attachments. Materialize unsaved files into the working copy. Convert host paths into session paths; avoid accidentally revealing a usable path to the live project.

Next, provide a small scoped Spectrum tool bridge for compilation/logs, PDF preview/pages, and reference search/BibTeX. Reuse existing services. Where the agent supports client-provided MCP, use MCP for those tools; add a proper MCP SDK only when implementing that surface. Pi's current adapter needs another documented tool route or must clearly show those capabilities as unavailable.

Compile review-mode files inside the boundary. Do not register the temporary copy as another synced Spectrum project. Refactor a root-aware compile entry point only if needed, preserving existing validation, linked-document handling, cancellation and limits. A host compile broker must not execute agent-supplied shell commands on the host.

## Files and existing behavior the implementation must reach

| Area | Existing files / planned reach |
| --- | --- |
| ACP and lifecycle | New backend agent-session service and launch-profile data; `apps/backend/src/index.js` for registration and shutdown; official SDK in backend `package.json` and workspace lockfile. |
| HTTP/UI transport | New scoped agent-session routes; `apps/frontend/src/api/client.ts`; reuse existing SSE conventions instead of introducing another realtime framework. Keep `/api/agent/run` working for existing callers. |
| Existing callers | `editor/Composer.tsx`, `app/EditorPage.tsx`, `editor/tools/LogsTab.tsx`, `ReviewTab.tsx`, and `ResearchTab.tsx` all call `runAgent`. Autocomplete and specialized tools should keep direct models unless deliberately routed to an agent. |
| Settings and chat identity | `app/settings.ts`, `SettingsSheet.tsx`, chat types in `api/client.ts`, backend `routes/chats.js`, and `utils/chatMerge.js`. Store executable paths, credentials, agent session mappings, working-copy paths and machine identity locally, outside cloud-shared chats/settings. |
| Editing and review | `editor/EditorContext.tsx`, `ReviewChangesSheet.tsx`, `SplitDiffView.tsx`, `shared.tsx`, `app/EditorPage.tsx`; existing disk-change/conflict handling and file APIs. |
| Files/history/sync | `services/versionService.js`, `projectService.js`, `mirrorService.js`, `utils/pathUtils.js`, `fsUtils.js`, `projectCopy.js`, `merge3.js`, and project/version routes. Verify helpers fit before reusing them: project copying currently carries project identity and is not a staging helper unchanged. |
| Security and process ownership | Isolation worker/helper; `utils/authUtils.js`, local request checks, inherited environment, executable discovery, agent/terminal/MCP descendants, and shutdown. Review-mode processes cannot inherit the backend's full environment or host authority. |
| Desktop packaging | `scripts/desktop.mjs`, Tauri launch/signing/configuration, macOS arm64/x64 and Windows x64 smoke tests. Bundled Node is not bundled npm/Python or a guarantee that a user's shell PATH is available. |
| Checks/docs | Focused backend tests, protocol fixture agent, frontend state checks/typecheck/build, desktop smoke checks, README setup/troubleshooting, changelog, and third-party license notices. |

## Delivery sequence

1. **Native isolation and authentication proof.** Build the macOS helper and Windows AppContainer proof; use one native ACP agent and one adapter to prove subprocess confinement, host-API protection, login, cancellation and staged compilation on the target OSes. Record signing/runtime constraints and required OS bindings. No container dependency or broad compatibility claim at this stage.
2. **Shared ACP client with OpenCode and Codex.** Complete real session lifecycle, streaming, approval/question handling, default isolated review, optional direct edits, change application and recovery. Keep model features working.
3. **Qoder, Cursor, Kimi, Hermes and Claude Agent.** Add launch profiles and supported extensions; certify each tested OS/version/mode/auth combination. Resolve Claude authentication/branding with vendor guidance before enabling an account flow.
4. **Pi, DeepSeek Harness and ZCode.** Validate adapters and published releases, package their runtime requirements, and document capability gaps. Experimental status is visible. A listed profile is not a completed integration.
5. **WorkBuddy and remote execution.** Use official application registration and authorized APIs. Validate `.ai`/`.cn` account eligibility; agree a server-side secret/token design, workspace transfer, artifact retrieval and conflict review. WorkBuddy's Open API requires an application secret which must not be embedded in a distributed desktop app. Do not implement private gateway discovery as a shortcut. Other remote ACP agents can share lifecycle/UI but need their actual supported transports and authentication.
6. **Setup convenience.** Start with installed runtimes and explicit setup instructions. Add pinned managed installs/updates only after integration behavior is stable; verify artifacts and preserve user installations. No automatic `npx latest` execution on each chat. Done in 2.0 for the Codex, Claude Agent, Pi and ZCode adapters, at the user's request: pinned versions and checksums, each install only after the user confirms, into Spectrum's data folder and never system-wide. Vendor programs stay manual.

## Acceptance checks

- Protocol fixture tests: split/multiple frames, interleaved notifications and server requests, capability omissions, invalid input, stderr noise, EOF, authentication failure, cancel while permission UI is open, process crash, reconnect and duplicate replay.
- Isolation tests: an agent, shell child, background child and MCP child each attempt to read/write outside the granted workspace; access the live project through absolute paths, symlinks, alternate path spellings, and host APIs; exercise grants expiring at session end. Every forbidden operation must fail independently of the agent cooperating.
- Editing tests: unsaved text, concurrent edits, new/delete/rename/binary changes, partial acceptance, large files, disk-full/write failure, application restart and recovery. Check that partial rejection does not leave a stale working copy silently in use.
- Integration fixture: a small multi-file LaTeX project with BibTeX, an intentional compile error and a CSV-derived figure. Each shipped agent must complete the supported workflow, show its actions, stop reliably, and leave live files untouched until review acceptance. Test direct editing separately.
- Compatibility record per agent: exact runtime/adapter version, OS/architecture, installation source, auth method, review/direct mode, images, plans, commands, config options, permissions, resume, MCP, and actual filesystem/terminal execution owner.
- Run relevant existing backend tests, frontend typecheck/build and packaged-app smoke tests. ACP's experimental TCK can help assess agents, but it does not certify Spectrum's client or isolation. [TCK documentation](https://agentclientprotocol.com/libraries/testing).

## Open decisions and evidence limits

- Native isolation is selected. macOS and Windows have the preview mechanisms recorded above. Windows compatibility remains limited to the verified execution boundary and ACP fixture; real authenticated vendor workflows remain release gates. No product-preference questions remain unanswered from this research.
- Proposed desktop certification scope follows current packaging: macOS arm64/x64 and Windows x64. Linux support is a separate product decision.
- WorkBuddy remains in scope but later, using official interfaces only. Regional/account access and application approval have not been verified.
- Broader sandbox compatibility, login portability, and adapter redistribution require further verification. OpenCode was invoked for a protocol/session handshake; no paid inference, imported personal login, cross-agent benchmark or broad compatibility certification was performed.
- Prompt confidentiality and network side effects are separate from filesystem isolation. Review protects project application; it does not make external tool actions reversible.

No model-provider removal, broad assistant rewrite, parallel agent orchestration, or remote control server is needed for the first local integration.
