# Codex inside and outside Spectrum: the workspace lookup check

Written 26 November 2026 for Spectrum 2.6.4 with the Codex adapter 2.7.0, which runs Codex 0.166.0. In 2.6.4 a task with a copied ChatGPT login failed with "workspace routing discovery failed", first over WebSockets and then over HTTPS. These steps run the same Codex three ways on this Mac, so that the first run that fails shows where the difference lies:

- **(a)** Codex's own program, the one the adapter carries, with your normal Codex folder `~/.codex`;
- **(b)** Spectrum's adapter, started by hand outside Spectrum's isolation, with a temporary home holding a fresh copy of your login and the environment Spectrum gives it;
- **(c)** the same adapter in Spectrum, inside its isolation.

Each run sends one short prompt that asks only for a reply. Run them in this order, in Terminal, and send back the files that step 5 lists. Nothing here prints a key or a token, and nothing changes Spectrum's settings or your Codex settings.

## What the comparison found

The owner ran the comparison on 26 November 2026. Codex 0.166.0 with a clean environment failed the workspace lookup, and the same program with the shell's proxy variables answered normally, as did Codex 0.172.0. Spectrum's adapter behaved the same way: with a clean environment it opened a session and then failed the turn, and with the shell's proxy variables it answered. A signed-in request to the lookup's address through the proxy gave HTTP 200, and a name lookup without the proxy failed in that shell. On that network chatgpt.com is reached only through a proxy that the shell names in its environment, and Spectrum, started from the Finder, had neither those variables nor a proxy in the Mac's network settings.

Spectrum now finds such a proxy itself and goes through it: see Settings › System › Network, which says which proxy is in use and where it came from. An isolated agent such as Codex reaches it through Spectrum's own gate, and its session's first line, "Network check for Codex", names the proxy. If Codex still fails, run the steps below again with that proxy in use.

## What the failing step is

Read from Codex 0.166.0's source (`openai/codex`, tag `rust-v0.166.0`, `codex-rs/`):

- With a ChatGPT login, and never with an API key, Codex's app server looks up your ChatGPT workspace before each connection to the model. It is one HTTPS GET of `https://chatgpt.com/backend-api/wham/accounts/check` on port 443, with your ChatGPT access token and account id (`backend-client/src/client.rs`, `app-server/src/request_processors/account_processor/workspace_routing.rs`). It is made for every ChatGPT plan, not only for business workspaces.
- The first try is allowed 5 seconds. If it cannot connect, times out or fails, Codex tries once more through the Mac's system proxy settings, including an automatic configuration (PAC). The whole lookup is allowed 15 seconds (`client.rs` lines 372 to 399, `workspace_routing.rs` line 552).
- A 401 answer, after one refresh of the token, becomes "workspace routing discovery unauthorized (401)": the login itself was refused. Any other failure (a name that does not resolve, a connection refused or timed out, a TLS failure, another HTTP status) becomes "workspace routing discovery failed". A lookup over 15 seconds becomes "workspace routing discovery timed out".
- The lookup comes before the model connection, so it fails first over WebSockets, and then, when Codex falls back to HTTPS, again. The text you saw is the lookup's, not the model's.
- Ordinary HTTPS in Codex uses macOS's own TLS (Security framework and `trustd`), with proxies from `HTTPS_PROXY` and `ALL_PROXY` and then from the Mac's network settings. Its WebSockets use only the proxy variables. The lookup code writes no log lines of its own, so the logs below show the connection, not the lookup by name.
- Plain `codex exec` may not make the lookup at all: it is made only where Codex's app server is running (`login/src/auth/manager/workspace_routing.rs` lines 63 to 71). If (a) works and (b) fails, the lookup itself is the difference. If (b) works and (c) fails, Spectrum's isolation is.

What Spectrum's isolation allows Codex, on Any host: HTTPS on port 443 to any address except this computer's, DNS on port 53 and the system's resolver, the system's certificate checks (`trustd`) and network settings (`configd`). It refuses every connection to this computer, so a proxy app that listens on 127.0.0.1 (Clash and the like) cannot be reached, and a proxy variable in Terminal is not passed to Codex. A refused connection shows in a log as "Operation not permitted (os error 1)".

## 1. Set up the check

Quit Spectrum first. Then, in Terminal:

```sh
SPECTRUM_DATA="$HOME/Library/Application Support/com.beyond3345.spectrum"
ADAPTER_DIR="$SPECTRUM_DATA/agents/adapters/codex/2.7.0"
ADAPTER="$ADAPTER_DIR/node_modules/@agentclientprotocol/codex-acp/dist/index.js"
CODEX="$ADAPTER_DIR/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex"
NODE=/Applications/Spectrum.app/Contents/MacOS/node
CHECK="$HOME/Desktop/codex-check"
CODEX_LOG='codex_app_server=debug,codex_login=debug,codex_model_provider=debug,codex_backend_client=debug,codex_http_client=trace,codex_api=debug,codex_core=info,reqwest=debug,hyper_util=debug'
mkdir -p "$CHECK"
ls -l "$ADAPTER" "$CODEX" "$NODE"
"$CODEX" --version
```

All three files must be listed and the version must be `codex-cli 0.166.0`. If `node` is missing, run `ls /Applications/Spectrum.app/Contents/MacOS/` and use the Node program listed there.

Then note the network as this Mac has it, outside Codex. The last line asks the lookup's address with no sign-in, so a working connection answers 401 or 403:

```sh
scutil --proxy > "$CHECK/0-scutil-proxy.txt"
env | grep -i -E '^(https?|all|no)_proxy=' | sed -E 's#//[^/@]*@#//***@#' > "$CHECK/0-proxy-variables.txt"
scutil --dns | grep -E 'nameserver|if_index' | head -20 > "$CHECK/0-dns.txt"
curl -sS -o /dev/null -w 'status %{http_code}, address %{remote_ip}, TLS %{ssl_verify_result}\n' https://chatgpt.com/backend-api/wham/accounts/check > "$CHECK/0-curl.txt" 2>&1
cat "$CHECK/0-curl.txt"
```

## 2. Run (a): Codex's own program with your normal login

In a throwaway folder, with your normal `~/.codex`:

```sh
mkdir -p "$CHECK/project-a" && cd "$CHECK/project-a"
RUST_LOG="$CODEX_LOG" "$CODEX" exec --skip-git-repo-check -s read-only "Reply with the single word ready. Do not run commands or change files." > "$CHECK/a-reply.txt" 2> "$CHECK/a-log.txt"
echo "exit $?" >> "$CHECK/a-reply.txt"
cat "$CHECK/a-reply.txt"
```

## 3. Run (b): Spectrum's adapter outside isolation

Make a temporary home with a fresh copy of the login. `cp` copies it without showing it:

```sh
T="$(mktemp -d /tmp/codex-check.XXXXXX)"
mkdir -p "$T/tmp" "$T/.codex" "$T/.config" "$T/.cache" "$T/.local/share" "$T/logs" "$T/project"
cp ~/.codex/auth.json "$T/.codex/auth.json" && chmod 600 "$T/.codex/auth.json"
```

Save this small client, which talks to the adapter as Spectrum does (the same capabilities, no sign-in request for a copied login, one prompt), and prints what comes back:

```sh
cat > "$CHECK/acp-check.mjs" <<'EOF'
// node acp-check.mjs <adapter's index.js> <project folder>: one reply-only prompt, as Spectrum sends it
import { spawn } from 'node:child_process';
import readline from 'node:readline';
const [adapter, project] = process.argv.slice(2);
const child = spawn(process.execPath, [adapter], { stdio: ['pipe', 'pipe', 'inherit'] });
const waits = new Map();
let id = 0;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const send = (m) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
const ask = (method, params) => new Promise((resolve, reject) => { waits.set(++id, [resolve, reject]); send({ id, method, params }); });
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return console.log(at(), 'not JSON:', line.slice(0, 300)); }
  if (m.id !== undefined && !m.method && waits.has(m.id)) { const [resolve, reject] = waits.get(m.id); waits.delete(m.id); return m.error ? reject(m.error) : resolve(m.result); }
  if (m.method && m.id !== undefined) { console.log(at(), 'agent asked for', m.method, '(refused)'); return send({ id: m.id, error: { code: -32601, message: 'Not in this check' } }); }
  if (m.method === 'session/update') { const u = m.params.update; console.log(at(), u.sessionUpdate, JSON.stringify(u.content?.text ?? u._meta ?? u.title ?? '').slice(0, 600)); }
});
const clientCapabilities = { fs: { readTextFile: true, writeTextFile: true }, terminal: true, elicitation: { form: {}, url: {} }, _meta: { jetbrains: { air: { version: 1, capabilities: ['sessionFailure'] } } } };
try {
  const init = await ask('initialize', { protocolVersion: 1, clientCapabilities, clientInfo: { name: 'spectrum-check', version: '1' } });
  console.log(at(), 'initialized', init.agentInfo?.name, init.agentInfo?.version);
  const session = await ask('session/new', { cwd: project, mcpServers: [] });
  console.log(at(), 'session opened');
  const result = await ask('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: 'Reply with the single word ready. Do not run commands or change files.' }] });
  console.log(at(), 'ended', result.stopReason, JSON.stringify(result._meta?.jetbrains?.air?.sessionFailure ?? 'no failure'));
} catch (err) { console.log(at(), 'error', JSON.stringify(err).slice(0, 1500)); }
child.kill();
process.exit(0);
EOF
```

Run it with only the environment Spectrum gives Codex, plus the logging:

```sh
env -i HOME="$T" TMPDIR="$T/tmp" PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=en_US.UTF-8 TERM=dumb \
  XDG_CONFIG_HOME="$T/.config" XDG_DATA_HOME="$T/.local/share" XDG_CACHE_HOME="$T/.cache" \
  CODEX_ACP_PROMPT_SUGGESTIONS=false APP_SERVER_LOGS="$T/logs" RUST_LOG="$CODEX_LOG" \
  "$NODE" "$CHECK/acp-check.mjs" "$ADAPTER" "$T/project" > "$CHECK/b-reply.txt" 2>&1
cat "$CHECK/b-reply.txt"
```

The last line says `ended end_turn "no failure"` when it worked, or gives Codex's failure. The adapter's full log is `$T/logs/app-server.log`.

## 4. Run (c): the same inside Spectrum

1. Start Spectrum from Terminal with Codex's logging turned on. Spectrum passes it to Codex only while it was started this way:

   ```sh
   ls /Applications/Spectrum.app/Contents/MacOS/
   SPECTRUM_CODEX_LOG=1 /Applications/Spectrum.app/Contents/MacOS/spectrum
   ```

   Use the program name `ls` lists if it is not `spectrum`. Leave the Terminal window open.
2. In Settings › Agents › Codex, press Copy existing login, so that Spectrum has the same fresh login as (b). If an API key is saved too, set Sign in with to ChatGPT login.
3. Make a new project, open Local agents, choose Codex in an Isolated session and send: Reply with the single word ready. Do not run commands or change files.
4. Copy the session's line that begins "Network check for Codex" and the task's last line (Failed, with Codex's words, or the reply) into `$CHECK/c-spectrum.txt`.
5. Quit Spectrum and start it again from the Dock, so that Codex no longer logs.

Codex's log from this run is `$SPECTRUM_DATA/agents/homes/codex/logs/app-server.log`.

## 5. Find the first failing step and send it back

Take the lines that matter from each log, leaving out any that could carry a token, a key, a cookie or your email address:

```sh
for f in "$CHECK/a-log.txt" "$T/logs/app-server.log" "$SPECTRUM_DATA/agents/homes/codex/logs/app-server.log"; do
  echo "== $f"
  grep -n -i -E 'routing|accounts/check|dns|lookup address|nodename|connect|refused|not permitted|timed out|deadline|tls|ssl|certificate|handshake|osstatus|proxy|status|401|403|404|429|5[0-9][0-9] |error' "$f" \
    | grep -v -i -E 'bearer|token|authorization|api.?key|cookie|email|@' | cut -c1-400 | head -150
done > "$CHECK/5-errors.txt"
```

In each run, the first of these that appears is the step that failed:

| Step | What the log says |
| --- | --- |
| Name lookup (DNS) | "dns error", "failed to lookup address information", "nodename nor servname provided" |
| Connection (TCP) | "tcp connect error", "Connection refused (os error 61)", "Operation not permitted (os error 1)" (refused by isolation), "Network is unreachable", "timed out" or "deadline has elapsed" |
| Encryption (TLS) | "invalid peer certificate", "certificate", "handshake", "OSStatus", "SSL" |
| The answer (HTTP) | a status such as 401, 403 (often a Cloudflare check, with "cf-ray"), 404 or 5xx, or "unexpected status" |
| A proxy | "proxy", "CONNECT", or an address on 127.0.0.1 |

Send back the folder `~/Desktop/codex-check`: the `0-` files, `a-reply.txt`, `b-reply.txt`, `c-spectrum.txt` and `5-errors.txt`. Look through `5-errors.txt` before you send it. Do not send `a-log.txt` or the `app-server.log` files whole: they hold the whole conversation with Codex.

## 6. Clean up

```sh
rm -rf "$T" "$SPECTRUM_DATA/agents/homes/codex/logs"
```

The temporary home in (b) may have renewed your ChatGPT token. If `codex` in Terminal later says that you are signed out, run `codex login` again, then press Copy existing login in Spectrum.

## What the answers would mean

- **(a) and (b) work, (c) fails:** Spectrum's isolation blocks something the lookup needs. The step in `5-errors.txt` says what. A refused connection to 127.0.0.1 or a proxy means a proxy app on this computer: Spectrum would then pass Codex's HTTPS through its own network gate, which already forwards an agent's connections for a list of hosts, onwards through your proxy, and never open this computer to Codex.
- **(a) works, (b) and (c) fail the same way:** the lookup fails here whatever Spectrum does. The status or error it gives is what OpenAI's side answers; the copied login or the account is the likely cause, and an API key (Sign in with: API key) avoids the lookup.
- **All three fail:** the network or the account, outside Spectrum. `0-curl.txt` shows whether chatgpt.com can be reached at all.
- **(b) fails only for the WebSockets and then works over HTTPS:** a proxy that only the HTTPS side uses, from the Mac's settings.
