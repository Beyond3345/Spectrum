# Local Agent Integrations — Working Plan

**Target repo:** `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum` (HEAD `fc0de91f`, Spectrum `2.7.0`)  
**Goal:** Bring **Codex**, **Claude Agent**, **OpenCode 2**, and **Antigravity** to the same verified level as **DeepSeek Harness** across all 10 stages of `docs/AGENT_ACCEPTANCE_TEST.md` on macOS (while keeping Windows limitations honest and fail-closed).

---

## Baseline Verified by Live Seatbelt Probes

All four installed runtimes were probed inside Spectrum’s real macOS `sandbox-exec` profile (`agentSandbox.js`), with Spectrum’s real MCP server (`apps/backend/src/mcp/server.js`) and Spectrum’s network gate (`openGate`):

| Agent | Installed Runtime | Handshake (`initialize` + `session/new`) | Spectrum MCP (`tools/list`) | Network Gate (`HTTPS_PROXY` + `NO_PROXY`) | Blocking / Remaining Issues |
| --- | --- | --- | --- | --- | --- |
| **Codex** | `@agentclientprotocol/codex-acp` `2.7.0` (`codex` `0.166.0`) | Passes (`api-key`) | Passes | Passes (`gateAsked: 33`) | Verify real runs after `c77bd0dc`; check nested `sandbox-exec` on shell commands; `github.com`/`api.github.com` hit on gated runs; still marked `progress` |
| **Claude Agent** | `@agentclientprotocol/claude-agent-acp` `0.108.1` (SDK `0.3.326`) | `initialize` passes; `session/new` rejects missing key (`-32000`), **contacts `api.anthropic.com` when a key is set** | Passes (falls back from `server/discover` to `initialize`) | Passes (`api.anthropic.com` only) | `Test` stalls/retries if `api.anthropic.com` is blocked; `air: ['sessionFailure']` not enabled; `signInOf()` breaks Stage 10; prematurely marked `supported` |
| **OpenCode 2** | `opencode` `2.3.2` | Fails with `loopback: false`; **passes with `loopback: true`** | Passes (14 tools) | Passes (`gateAsked: 9`) | Currently hardcoded `unsupported`; needs `loopback: 'local server'` on macOS + `models.opencode.ai` in `hosts` + retry/error handling + dead OpenCode 1 cleanup |
| **Antigravity** | `agy` `1.5.18` | Passes with `loopback: true` + `gemini-api-key` | Passes (falls back from `server/discover` to `initialize`) | Passes (`generativelanguage.googleapis.com`) | Failed turns return `stopReason: "end_turn"` with plain-text `⚠ agent executor error:` → Spectrum marks them `completed`; Stage 10 fails; telemetry hits `play.googleapis.com` |

---

## Phase 1 — Cross-Cutting Credential Refusal & AIR Error Handling

Fixes **Stage 10 (Wrong credential)** across Claude Agent, Codex, Antigravity, OpenCode 2, DeepSeek Harness, and other agents.

### 1.1 Generalize `signInOf()` in `apps/backend/src/services/agentProfiles.js`
- **Current bug (`agentProfiles.js:272-276`):**
  ```js
  async function signInOf(profile, saved, home) {
    if (!profile.keyAuth) return undefined;
    const login = !!saved.loginCopied && await anyFile(home, profile.login);
    return saved.apiKey && !(login && saved.signInWith === 'login') ? 'key' : login ? 'login' : undefined;
  }
  ```
  Because of `if (!profile.keyAuth) return undefined;`, `options.signIn` is always `undefined` for `claude`, `opencode`, `deepseek`, `cursor`, `kimi`, `hermes`, and `qoder`. When any of those returns `-32000`, `signInNeeded()` says *"needs a sign-in"* instead of *"refused the saved API key"* and never sets `test.refused`.
- **Change:**
  - Compute `login` and `hasKey = !!saved.apiKey` for every profile.
  - For profiles **with** `profile.keyAuth` (where Settings offers `signInWith`): keep exact current logic (`hasKey && !(login && saved.signInWith === 'login') ? 'key' : login ? 'login' : undefined`).
  - For profiles **without** `profile.keyAuth`: return `'key'` when `hasKey && !login`, `'login'` when `login && !hasKey`, and `undefined` when neither or both exist (since without `signInWith`, Spectrum cannot tell which one the agent used).
  - Verify `launchOptions()` lines `313` and `335`:
    - Line `313`: `saved.apiKey && keyEnv && !(profile.keyAuth && signIn === 'login')` (so agents without `keyAuth` keep receiving their saved key as before).
    - Line `335`: `(profile.auth || (signIn === 'key' && profile.keyAuth))` — unchanged, still only sends ACP `authenticate` when `profile.auth` or `profile.keyAuth` is declared.

### 1.2 Record `refused` during `runTest()` in `apps/backend/src/services/agentSessionService.js`
- **Current gap (`agentSessionService.js:591`):**
  `runTest()` records `{ code: 'sign-in', methods }` on `-32000`, omitting `refused`. If an agent (like Claude Agent or Codex) refuses a saved key during **Test**, the card won’t say *"refused the saved API key"*.
- **Change:** Include `...(options.signIn && { refused: options.signIn })` in the `sign-in` result recorded by `runTest()`.

### 1.3 Handle AIR `sessionFailure` auth errors for both `login` and `key`
- **Current gap (`agentSessionService.js:1044-1048`):**
  ```js
  const failure = r.processOptions.air?.includes('sessionFailure') && result._meta?.jetbrains?.air?.sessionFailure;
  if (outcome[0] === 'completed' && failure?.severity === 'error') {
    const title = String(failure.title || 'The task failed.').slice(0, 2000);
    outcome = ['failed', r.processOptions.signIn === 'login' && LOGIN_REFUSED.some((words) => title.includes(words)) ? await signInNeeded(r) : title];
  }
  ```
- **Change:**
  - Also treat `failure` as a refused credential (calling `await signInNeeded(r)`) when `r.processOptions.signIn` is `'key'` or `'login'` AND either:
    - `failure.category === 'access'` or `Array.isArray(failure.actions) && failure.actions.includes('login')` (used by `claude-agent-acp`’s `session-failure-extension.js` for `auth_required`), OR
    - `r.processOptions.signIn === 'login' && LOGIN_REFUSED.some((words) => title.includes(words))` (Codex’s ChatGPT login refusal).

### 1.4 Tests for Phase 1
- `apps/backend/test/agent-profiles.test.js`: verify `launchOptions` sets `signIn: 'key'` for `claude` with a saved key (without setting `authMethod`) and `signIn: undefined` without one.
- `apps/backend/test/agent-test.test.js`: verify `testAgent` with a saved key + `--auth-required` stores `test.refused = 'key'`.
- `apps/backend/test/agent-codex.test.js`: verify AIR `sessionFailure` with `category: 'access'` / `actions: ['login']` triggers `signInNeeded()` for a saved key.
- `apps/frontend/src/app/agentCard.check.ts`: add a case for `claude` with `test: { ok: false, code: 'sign-in', refused: 'key' }` confirming `nextStep()` prompts to replace the API key.

---

## Phase 2 — Claude Agent (`@agentclientprotocol/claude-agent-acp` `0.108.1`)

### 2.1 Enable JetBrains AIR `sessionFailure` on `claude`
- **File:** `apps/backend/src/services/agentProfiles.js:46`
- **Why:** `claude-agent-acp` `0.108.1` ships `session-failure-extension.js` supporting `air: ['sessionFailure']` (`auth_required`, `access_denied`, `rate_limited`, `quota_exhausted`, `overloaded`, `provider_error`, `transport_lost`, etc.). Adding `air: ['sessionFailure']` to the `claude` profile lets Spectrum turn adapter-reported failures into real `Failed` turns with clean error text.

### 2.2 Investigate & harden `session/new` network behavior and bad-key handling
- **What we observed:**
  - Without `ANTHROPIC_API_KEY`, `session/new` completes in ~3.8 s and returns `-32000`.
  - With a fake `ANTHROPIC_API_KEY` and `api.anthropic.com` refused by the gate, `session/new` retried 16 times (`>12 s`).
- **Action:**
  1. Run a quick live check with a deliberately invalid `ANTHROPIC_API_KEY` (e.g. `sk-ant-invalid`) and `api.anthropic.com` reachable (outside the empty gate) to record the exact JSON-RPC response on both `session/new` (`Test`) and `session/prompt` (Stage 10).
  2. Check `claude-agent-acp/dist/result-end.js` and `v1/acp-agent.js`: when Anthropic returns HTTP `401` (`authentication_error` / `invalid x-api-key`), verify whether `claude-agent-acp` returns `-32000`, a JSON-RPC error with `data.errorKind === 'authentication_failed'`, or `sessionFailure` (`auth_required`).
  3. In `agentSessionService.js`:
     - In `promptAgent` `catch (err)`: if `err.data?.errorKind === 'authentication_failed'` (or `err.code === -32000`), route through `await signInNeeded(r)` so Stage 10 flips the card to `Sign-in needed` and names the refused API key.
     - In `runTest()`: if `session/new` times out or fails while a gate refused a host, include the refused host or clean diagnostic in `test.detail` so a blocked proxy/host during `Test` explains why instead of a bare timeout.

### 2.3 Align support badge with actual verification
- **File:** `apps/backend/src/services/agentProfiles.js:19`
- Keep `claude: 'supported'` **only** once Stages 1–10 of `AGENT_ACCEPTANCE_TEST.md` pass in a packaged macOS build; otherwise set it to `'progress'` or `'untested'` until verified.

### 2.4 Manual acceptance run (Stages 1–10)
- Run `docs/AGENT_ACCEPTANCE_TEST.md` on a scratch Typst project with `ANTHROPIC_API_KEY`:
  - Verify MCP `compile` tool is called (check permission card formatting for MCP tool calls and file edits).
  - Verify `Listed hosts only` works (Claude is marked `documented: true` with `api.anthropic.com` + `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`).
  - Verify Stage 10 with an invalid `ANTHROPIC_API_KEY`.

---

## Phase 3 — Antigravity (`agy` `1.5.18`)

### 3.1 Disable telemetry and clean up launch flags
- **File:** `apps/backend/src/services/agentProfiles.js:51, 319-320`
- **Problem:** `agy acp` posts telemetry to `https://play.googleapis.com/log`, which triggers a `Host refused: play.googleapis.com` card under `Listed hosts only`. It also logs an error trying to resolve relative `--gemini-dir ".gemini"`.
- **Change:**
  - When `id === 'antigravity'` and `listed` (or always, matching `AGY_CLI_DISABLE_AUTO_UPDATE: 'true'`), append `--disable-telemetry` to `args` (unless already present).
  - Optionally pass `--gemini-dir`, `path.join(agentHomeDir, '.gemini')` (verify `agy acp` still finds `.gemini/config/skills` when `--gemini-dir` is explicit — test before keeping).
  - Check whether `daily-cloudcode-pa.googleapis.com` should be added to `antigravity.hosts` (default `--cloud_code_endpoint` in `agy acp --help`).

### 3.2 Fix silent `completed` on failed turns & Stage 10 wrong-key detection
- **File:** `apps/backend/src/services/agentSessionService.js:1042-1093`
- **Problem:** When the Gemini API request failed in our probe, `agy acp` streamed `\n⚠ agent executor error: ...` as an ordinary `agent_message_chunk` and resolved `session/prompt` with `stopReason: "end_turn"` and no error/metadata. Spectrum therefore marked the turn **`completed`**.
- **Action:**
  1. Run a 1-shot probe of `agy acp` with a syntactically plausible **invalid** `GEMINI_API_KEY` against the real `generativelanguage.googleapis.com` endpoint (costs \$0 — returns HTTP 400 `API_KEY_INVALID` / 401 / 403) to capture the exact `agent_message_chunk` text, `stopReason`, and any `_meta` fields `agy` emits on a bad key.
  2. In `agentSessionService.js` (after `session/prompt` resolves with `outcome[0] === 'completed'` and `!changed` and no `tool_call` in that turn):
     - Add an Antigravity-scoped check (or generalize the `adapterError` / failure detector) for `r.agentId === 'antigravity'` when the turn’s sole assistant text matches `^\s*⚠\s*agent executor error:\s*(.+)` (verify exact prefix from step 1).
     - Turn `outcome` into `['failed', ...]`:
       - If the error text indicates an invalid/rejected API key (e.g., `API_KEY_INVALID`, `API key not valid`, `401`, `403` auth error) and `r.processOptions.signIn === 'key'`, call `await signInNeeded(r)` so the card flips to `Sign-in needed` (`refused: 'key'`).
       - Otherwise fail the turn with the extracted error summary (instead of marking it `completed`).

### 3.3 Tests & manual acceptance run (Stages 1–10)
- Add unit/fixture tests in `apps/backend/test/agent-turns.test.js` (or `agent-test.test.js`) covering:
  - `antigravity` launch options include `--disable-telemetry` (when gated/always).
  - A turn that emits `⚠ agent executor error: ...` with `end_turn` and no edits fails cleanly (and marks key refused on invalid-key text).
- Run `docs/AGENT_ACCEPTANCE_TEST.md` Stages 1–10 on macOS with `GEMINI_API_KEY`, testing both `Any host` and `Listed hosts only`, plus Stage 10 with a wrong key.
- Once verified, add `antigravity: 'supported'` to `SUPPORT` in `agentProfiles.js` and update `docs/AGENT_ACCEPTANCE_TEST.md`.

---

## Phase 4 — Codex (`@agentclientprotocol/codex-acp` `2.7.0`)

### 4.1 Run real-world acceptance test (Stages 1–10) for both credentials
Because `c77bd0dc` (`com.apple.SecurityServer`) was just merged on `main`, test a fresh build with:
1. **Copied ChatGPT login** (`Sign in with: ChatGPT login`), Stages 1–10.
2. **OpenAI API key** (`Sign in with: API key`), Stages 1–10.

### 4.2 Test and resolve nested macOS `sandbox-exec` for shell commands
- **Risk:** `codex-acp` `2.7.0` defaults to mode `agent` (`sandboxMode: "workspace-write"`), where `codex` `0.166.0` wraps shell commands in macOS `sandbox-exec`. Inside Spectrum’s outer `sandbox-exec`, nested Seatbelt calls fail with `Operation not permitted`.
- **Check during acceptance:** Ask Codex to run a harmless shell command (e.g. `ls` or `typst --version`) in its default `agent` mode inside an Isolated session.
- **If nested `sandbox-exec` fails:**
  - Check whether `codex` `0.166.0` supports disabling its inner Seatbelt sandbox via `config.toml` or env (remember: Spectrum’s outer Seatbelt sandbox **already** confines Codex and all its descendants in Isolated mode, and protects `.git`/`.env`/`.spectrum`/live project).
  - Or test switching Codex’s ACP mode to `agent-full-access` (`danger-full-access`) — note: do **not** bypass Codex’s approval prompts unexpectedly if the user expects per-command approvals; check whether `codex-acp`’s `config.toml` supports `approval_policy = "on-request"` + `sandbox_mode = "danger-full-access"` (so approvals still prompt the user while Spectrum’s Seatbelt provides the OS sandbox!).
  - Do **not** weaken Spectrum’s outer Seatbelt policy.

### 4.3 Check unlisted hosts (`github.com`, `api.github.com`) on `Listed hosts only`
- **Observed in probe:** Even with `OPENAI_API_KEY` and `CODEX_HOME=.codex-key`, Codex asked the gate for `chatgpt.com`, `github.com`, `api.github.com`, and `api.openai.com`.
- **Action:** Inspect Codex’s log (`SPECTRUM_CODEX_LOG=1`) during a gated run to see what requests `github.com` and `api.github.com` (likely update check or plugin/skills registry). If a `config.toml` key or env var disables background update/GitHub checks when `listed` is true (analogous to `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`), set it in `agentProfiles.js` rather than blindly adding `github.com` to Codex’s default allowlist.

### 4.4 Polish & promote status
- Once Stages 1–10 pass with both ChatGPT login and API key:
  - Update `SUPPORT.codex` from `'progress'` to `'supported'` in `apps/backend/src/services/agentProfiles.js:19`.
  - Decide whether to keep `Network check for Codex` (`agentSessionService.js:380`) always on or gate it behind `process.env.SPECTRUM_CODEX_LOG` (so normal sessions aren’t cluttered with diagnostic notices).
  - Optionally evaluate bumping `@agentclientprotocol/codex-acp` lockfile if a newer release fixes issues found in 4.2/4.3.
  - Update `docs/AGENT_ACCEPTANCE_TEST.md` and `docs/handbook/chapters/03-assistant.typ`.

---

## Phase 5 — OpenCode 2 (`opencode` `2.3.2`)

> **Owner decision (confirmed):** Extending the default-on macOS `loopback` switch (same trade-off as Antigravity: `localhost:*` open except Spectrum’s fixed ports, unavailable on Windows) to OpenCode 2 is approved. Proceed without asking.

### 5.1 Re-enable OpenCode 2 on macOS with the `loopback` switch
- **File:** `apps/backend/src/services/agentProfiles.js:43`
- **Changes:**
  - Remove `unsupported: 'OpenCode 2 does not run inside Spectrum’s isolation…'`.
  - Add `loopback: 'local server'` (same switch mechanism as Antigravity: on by default on macOS, toggleable in Settings › Agents › Network, warns once per session, denies `spectrumPorts()`).
  - Add `windows: 'OpenCode 2 starts a local server on a port it chooses itself, which Windows isolation does not open. It works on a Mac.'` so Windows stays cleanly marked unavailable.
  - Add `'models.opencode.ai'` to `hosts` (verified in our probe: OpenCode 2.3.2 fetches `https://models.opencode.ai/experimental/v2.0/api.json` on startup).
  - Verify `login` files for OpenCode 2.3.2: keep `.local/share/opencode/auth.json` and `.config/opencode/opencode.json`, and check whether `.config/opencode/opencode.jsonc` should also be included.

### 5.2 Surface OpenCode 2 retry/failure state & check Stage 10
- **File:** `apps/backend/src/services/agentSessionService.js`
- **Observed in probe:** When requests fail, OpenCode 2 emits `session_info_update` with `_meta["opencode/retry"]` (`{ attempt, nextRetryAt, error: { type, message } }`).
- **Action:**
  1. Test OpenCode 2.3.2 with a bad `OPENAI_API_KEY` (and without any key/login) to see what `session/prompt` returns once retries stop (JSON-RPC error, `-32000`, or `end_turn`?).
  2. Extend `adapterError(u)` in `agentSessionService.js:42-45` to also read `u._meta?.['opencode/retry']?.error?.message` if OpenCode 2 ever finishes `end_turn` without changes after a failure, and map auth errors (`401`/unauthorized) through `signInNeeded(r)` when `r.processOptions.signIn` is set.

### 5.3 Clean up dead OpenCode 1 `internalPort` / `OPENCODE_SERVER_PASSWORD` code
- **Files:**
  - `apps/backend/src/services/agentSessionService.js:1152-1154` (`limitsOf` still strips `internalPort` and `OPENCODE_SERVER_PASSWORD` — simplify now that `loopback` is used).
  - `apps/backend/src/services/agentSandbox.js:43, 85, 112, 126` (verify whether anything else still uses `internalPort`; grep showed no other callers — remove if unused).

### 5.4 Update tests & docs for OpenCode 2
- `apps/backend/test/agent-profiles.test.js`:
  - Replace the `"OpenCode is listed as unsupported and never started"` test (`lines 262-266`) with tests verifying:
    - macOS: `opencode` is available with `loopback: { server: 'local server', on: true }` and `models.opencode.ai` in `provider` hosts.
    - Windows: `opencode` remains `unavailable` (still in the Windows unavailable list at `line 52`).
- `apps/backend/test/agent-opencode.test.js`:
  - Re-run this existing native smoke test — it currently skips because `profileFor('opencode').unavailable` is truthy! Once re-enabled with `loopback: true`, it should pass against the installed `opencode 2.3.2`.
- `apps/backend/test/agent-network.test.js`: verify `opencode` host list includes `models.opencode.ai`.
- `docs/AGENT_ACCEPTANCE_TEST.md`, `docs/handbook/chapters/03-assistant.typ` (update the sentence saying only Antigravity has a loopback switch, and update OpenCode’s row).
- Run `docs/AGENT_ACCEPTANCE_TEST.md` Stages 1–10 on macOS (both `Any host` and `Listed hosts only`, plus Stage 10). Once verified, add `opencode: 'supported'` to `SUPPORT`.

---

## Verification Commands

Run after each phase from `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum`:

```sh
# 1. All backend unit tests (no network)
npm test

# 2. Native macOS Seatbelt agent tests (must run outside any outer sandbox)
SPECTRUM_NATIVE_AGENT_TESTS=1 node scripts/check-agents.mjs
SPECTRUM_NATIVE_AGENT_TESTS=1 node --import ./apps/backend/test/no-network.mjs --test \
  apps/backend/test/agent-codex.test.js \
  apps/backend/test/agent-network.test.js \
  apps/backend/test/agent-tools.test.js \
  apps/backend/test/agent-turns.test.js

# 3. Frontend checks & typecheck
npx esbuild apps/frontend/src/app/agentCard.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --log-level=warning --outfile=/tmp/agentCard.check.mjs && node /tmp/agentCard.check.mjs
npx esbuild apps/frontend/src/editor/agent/agents.check.ts --bundle --platform=node --format=esm --loader:.svg=text --loader:.css=empty --log-level=warning --outfile=/tmp/agents.check.mjs && node /tmp/agents.check.mjs
npm run typecheck
```

Then run the packaged macOS build against `docs/AGENT_ACCEPTANCE_TEST.md` Stages 1–10 for each agent (Codex × 2 credentials, Claude Agent, Antigravity, OpenCode 2), recording for each:
- First failing stage (if any) and exact UI message
- Card status before & after Stage 10
- Both `Any host` and `Listed hosts only` results
- Whether shell commands succeed inside Isolated mode (especially Codex)

---

## Appendix — Captured Live Wire Payloads (27 Nov 2026, Seatbelt Sandbox, Invalid Keys)

All four captures below were run inside Spectrum’s real macOS `sandbox-exec` profile (`agentSandbox.js`) with throwaway invalid API keys (zero real credentials touched) and `openGate` enforcing the agent’s provider hosts.

### Capture 1 — Claude Agent `0.108.1` (Phase 2.2)
- **Setup:** `--hide-claude-auth`, `air: ['sessionFailure']`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `CLAUDE_CODE_TMPDIR=<home>/tmp`, `allowedHosts: ['api.anthropic.com']`, invalid `ANTHROPIC_API_KEY`.
- **Result:**
  - `session/new`: `ok: true` (`4884 ms`, `gateAsked: 20`, `refusedHosts: []`).
  - `session/prompt` (`2422 ms`): fails with standard ACP `-32000`:
    ```json
    { "code": -32000, "message": "Authentication required" }
    ```
- **Implication:** Phase 1’s `signInOf()` fix automatically gives Claude Agent full Stage 10 refused-key handling (`signInNeeded(r)` → *"Claude Agent refused the saved API key…"* and `test.refused = 'key'`). No custom error-text parsing needed for bad Anthropic keys.

### Capture 2 — Antigravity `1.5.18` (Phase 3.1 & 3.2)
- **Setup:** `agy acp --disable-telemetry`, `loopback: true`, `AGY_CLI_DISABLE_AUTO_UPDATE=true`, `authMethod: 'gemini-api-key'`, `allowedHosts: ['generativelanguage.googleapis.com']`, invalid `GEMINI_API_KEY`.
- **Result:**
  - `--disable-telemetry` **eliminated `play.googleapis.com` completely**: `gateAsked: 2`, `refusedHosts: []`, zero `play.googleapis.com` entries in `agy.log`.
  - `authenticate`: `ok: true` (`145 ms`); `session/new`: `ok: true` (`17 ms`).
  - `session/prompt` (`292 ms`): resolves with **`stopReason: "end_turn"`** (no JSON-RPC error, no `_meta`) after emitting a single `agent_message_chunk`:
    ```json
    {
      "sessionUpdate": "agent_message_chunk",
      "content": {
        "type": "text",
        "text": "\n⚠ agent executor error: generating and executing: Error 400, Message: API key not valid. Please pass a valid API key., Status: INVALID_ARGUMENT, Details: [map[@type:type.googleapis.com/google.rpc.ErrorInfo domain:googleapis.com metadata:map[service:generativelanguage.googleapis.com] reason:API_KEY_INVALID] map[@type:type.googleapis.com/google.rpc.LocalizedMessage locale:en-US message:API key not valid. Please pass a valid API key.]]\n"
      }
    }
    ```
  - Compare with earlier gated network-refusal capture (same prefix):
    ```
    \n⚠ agent executor error: generating and executing: doRequest: error sending request: Post "https://generativelanguage.googleapis.com/..."
    ```
- **Implication:** For `r.agentId === 'antigravity'`, when `outcome[0] === 'completed'`, `!changed`, and no `tool_call` occurred in the turn, check if the turn’s assistant message matches `/^\s*⚠\s*agent executor error:\s*([\s\S]+)/`:
  - If the error text contains `API_KEY_INVALID` or `API key not valid` (HTTP 400 `INVALID_ARGUMENT`) and `r.processOptions.signIn === 'key'`, set `outcome = ['failed', await signInNeeded(r)]`.
  - Otherwise set `outcome = ['failed', extractedError.trim().slice(0, 2000)]`.

### Capture 3 — Codex `2.7.0` / `codex 0.166.0` (Phase 4.3 & Stage 10)
- **Setup:** `CODEX_HOME=<home>/.codex-key` (`cli_auth_credentials_store = "ephemeral"`), `authMethod: 'api-key'`, `air: ['sessionFailure']`, `allowedHosts: ['api.openai.com']`, invalid `OPENAI_API_KEY`, `RUST_LOG=debug`.
- **Result — bad API key (Stage 10):**
  - `session/new`: `ok: true` (`9405 ms`).
  - `session/prompt` (`20587 ms`): emits AIR warning (`Falling back from WebSockets to HTTPS transport. unexpected status 401 Unauthorized: Incorrect API key provided... auth error code: invalid_api_key`), then fails with standard ACP `-32000`:
    ```json
    { "code": -32000, "message": "Authentication required" }
    ```
- **Result — what triggers `github.com`, `api.github.com`, and `chatgpt.com` on startup:**
  - `codex_core_plugins::manager` fetches `https://chatgpt.com/backend-api/plugins/featured?platform=codex` (warming featured plugin IDs cache).
  - `codex_core_plugins::startup_sync` runs `git ls-remote https://github.com/openai/plugins.git/` (`github.com`), then falls back to `GET https://api.github.com/repos/openai/plugins` (`api.github.com`), then falls back to `chatgpt.com` export archive.
  - Check whether `codex 0.166.0` supports disabling curated plugin sync in `config.toml` (e.g. a feature flag under `[features]`) when `listed` is true, rather than adding `github.com` / `api.github.com` to Codex’s default host allowlist.

### Capture 4 — OpenCode `2.3.2` (Phase 5.2)
- **Setup:** `opencode acp --print-logs`, `loopback: true`, `allowedHosts: ['api.openai.com', 'models.opencode.ai']`, invalid `OPENAI_API_KEY`.
- **Result:**
  - `initialize`: `ok: true` (`761 ms`); `session/new`: `ok: true` (`592 ms`).
  - `gateAsked: 4`, **`refusedHosts: []`** (confirming `models.opencode.ai` + provider host is the complete set on startup).
  - `session/prompt` (`602 ms`, no retry loop on 401): fails immediately with standard ACP `-32000`:
    ```json
    { "code": -32000, "message": "Authentication required: provider authentication required", "data": {} }
    ```
- **Implication:** With Phase 1’s `signInOf()` fix + `loopback: 'local server'` + `models.opencode.ai` in `hosts`, OpenCode 2 handles Stage 10 cleanly with no extra error-parsing hacks needed.

