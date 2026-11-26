// Codex's sign-in, its failed turns and its network check: which credential a session signs in with (a saved key, a
// copied ChatGPT login, the user's choice of the two), that a key session cannot read the copied login, JetBrains' AIR
// sessionFailure read as Failed, a refused credential named with its way back, and the proxy line. With the draft
// fixture standing in for codex-acp, started as Codex; the native tests run it in isolation.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'spectrum-agent-codex-')));
// a stand-in for scutil --proxy: a proxy on this computer, and an automatic configuration behind a name and password
const scutil = path.join(dir, 'scutil');
await fs.writeFile(scutil, `#!/bin/sh
cat <<'END'
<dictionary> {
  ExceptionsList : <array> {
    0 : *.local
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : http://me:hunter2@pac.example.org:8080/proxy.pac?token=s3cret
  SOCKSEnable : 0
}
END
`, { mode: 0o755 });
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(dir, 'data'), SPECTRUM_PROJECTS_DIR: path.join(dir, 'projects'), SPECTRUM_SKILLS_SEED_DIR: path.join(dir, 'no-skills'), SPECTRUM_SCUTIL: scutil });
delete process.env.SPECTRUM_CODEX_LOG;
const { saveAgentConfig, agentEntry, agentHome, launchOptions, updateConfig } = await import('../src/services/agentProfiles.js');
const { proxyNote, systemProxies } = await import('../src/services/agentNetwork.js');
const fixture = fileURLToPath(new URL('./fixtures/acp-draft-agent.mjs', import.meta.url));
const native = process.platform === 'darwin' && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const skip = !native && 'Requires native macOS sandbox execution.';
const nodeAdapters = process.platform === 'win32' && 'Codex is unavailable on Windows';
let sessions;
after(async () => { await sessions?.shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); });

const KEY = 'sk-test-fixture-0123456789';
/** Codex as the fixture, with a key, a copied login, both, and the user's choice. */
async function setUp({ key = '', login = false, signInWith } = {}) {
  await saveAgentConfig('codex', { command: process.execPath, args: [fixture, '--auth-methods'], runtimePaths: [path.dirname(fixture)], apiKey: key, signInWith: signInWith || 'key' });
  const home = await agentHome('codex');
  await fs.rm(path.join(home, '.codex'), { recursive: true, force: true });
  if (login) {
    await fs.mkdir(path.join(home, '.codex'), { recursive: true });
    await fs.writeFile(path.join(home, '.codex', 'auth.json'), '{"tokens":{"access_token":"copied"}}');
  }
  await updateConfig('codex', ({ loginCopied, ...entry }) => ({ ...entry, ...(login && { loginCopied: new Date().toISOString() }) }));
  return home;
}

test('Codex signs in with a saved key through its api-key method, in a Codex home of its own that keeps the key in memory and cannot reach the copied login', { skip: nodeAdapters }, async () => {
  const home = await setUp({ key: KEY, login: true });
  const options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.equal(options.authMethod, 'api-key');
  assert.equal(options.signIn, 'key');
  assert.deepEqual(options.air, ['sessionFailure']);
  assert.equal(options.env.OPENAI_API_KEY, KEY);
  assert.equal(options.env.CODEX_HOME, path.join(home, '.codex-key'));
  assert.equal(options.env.CODEX_ACP_PROMPT_SUGGESTIONS, 'false', 'no extra model call for a suggestion Spectrum never shows');
  assert.equal(await fs.readFile(path.join(home, '.codex-key', 'config.toml'), 'utf8'), 'cli_auth_credentials_store = "ephemeral"\n');
  assert.ok(options.forbiddenRoots.includes(path.join(home, '.codex')), 'isolation keeps the copied login out of reach');
  assert.equal((await agentEntry('codex')).signInWith, 'key', 'with both, the key unless the user chose the login');
});

test('with only a copied login, or the login chosen over a saved key, Codex finds the login itself and gets no key', { skip: nodeAdapters }, async () => {
  for (const setup of [{ login: true }, { key: KEY, login: true, signInWith: 'login' }]) {
    const home = await setUp(setup);
    const options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
    assert.deepEqual([options.authMethod, options.signIn, options.env.OPENAI_API_KEY, options.env.CODEX_HOME], [undefined, 'login', undefined, undefined], JSON.stringify(setup));
    assert.ok(!options.forbiddenRoots.includes(path.join(home, '.codex')));
  }
  assert.equal((await agentEntry('codex')).signInWith, 'login');
  // the choice is offered only with both
  await setUp({ key: KEY });
  assert.equal((await agentEntry('codex')).signInWith, undefined);
  const home = await setUp({});
  const options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.deepEqual([options.authMethod, options.signIn], [undefined, undefined], 'neither: nothing to sign in with');
});

test('SPECTRUM_CODEX_LOG has Codex log its traffic into its private home, with the filter given or the default one', { skip: nodeAdapters }, async () => {
  const home = await setUp({ login: true });
  try {
    process.env.SPECTRUM_CODEX_LOG = '1';
    let options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
    assert.equal(options.env.APP_SERVER_LOGS, path.join(home, 'logs'));
    assert.match(options.env.RUST_LOG, /codex_backend_client=debug/);
    assert.ok((await fs.stat(path.join(home, 'logs'))).isDirectory());
    process.env.SPECTRUM_CODEX_LOG = 'reqwest=trace';
    options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
    assert.equal(options.env.RUST_LOG, 'reqwest=trace');
    delete process.env.SPECTRUM_CODEX_LOG;
    options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
    assert.deepEqual([options.env.APP_SERVER_LOGS, options.env.RUST_LOG], [undefined, undefined], 'off unless asked');
  } finally { delete process.env.SPECTRUM_CODEX_LOG; }
});

test('the sign-in choice is checked, kept with other changes, and a changed choice drops the last Test', { skip: nodeAdapters }, async () => {
  await setUp({ key: KEY, login: true });
  await assert.rejects(saveAgentConfig('codex', { signInWith: 'both' }), /Choose the API key or the copied login/);
  await updateConfig('codex', (entry) => ({ ...entry, test: { ok: true, code: 'ready', program: process.execPath, at: new Date().toISOString() } }));
  await saveAgentConfig('codex', { signInWith: 'login' });
  assert.equal((await agentEntry('codex')).test, undefined);
  await saveAgentConfig('codex', { runtimePaths: [path.dirname(fixture)] });
  assert.equal((await agentEntry('codex')).signInWith, 'login');
});

test('the network check names the proxy variables passed and the Mac’s proxies by host and port, never a name, password or path', () => {
  const text = `<dictionary> {\n  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://me:hunter2@pac.example.org/p.pac?token=s3cret\n  __SCOPED__ : <dictionary> {\n    en0 : <dictionary> {\n      HTTPEnable : 1\n    }\n  }\n}\n`;
  assert.deepEqual(systemProxies(text), [['HTTPS proxy', '127.0.0.1:7890 (this computer)'], ['automatic proxy configuration', 'pac.example.org']]);
  assert.deepEqual(systemProxies('<dictionary> {\n  HTTPEnable : 0\n  ExceptionsList : <array> {\n  }\n}\n'), []);
  const line = proxyNote('Codex', {}, text, { HTTPS_PROXY: 'http://user:pw@10.0.0.2:3128' });
  assert.equal(line, 'Network check for Codex: Spectrum passed no proxy variables; this Mac’s network settings name HTTPS proxy 127.0.0.1:7890 (this computer), automatic proxy configuration pac.example.org; Spectrum’s own environment has HTTPS_PROXY (10.0.0.2:3128), not passed on. Isolation does not let Codex reach a proxy on this computer.');
  assert.doesNotMatch(line, /hunter2|s3cret|user|pw@|p\.pac/);
  assert.equal(proxyNote('Codex', { HTTPS_PROXY: 'http://127.0.0.1:5555', https_proxy: 'http://127.0.0.1:5555' }, '<dictionary> {\n}\n', {}), 'Network check for Codex: Spectrum passed HTTPS_PROXY, https_proxy (its own gate for the list of hosts); this Mac’s network settings name no proxy.');
  assert.equal(proxyNote('Codex', {}, undefined, {}), 'Network check for Codex: Spectrum passed no proxy variables; this computer’s proxy settings were not read.');
});

let ready;
const native$ = () => (ready ??= (async () => {
  sessions = await import('../src/services/agentSessionService.js');
  const { createProject } = await import('../src/services/projectService.js');
  const open = async (agentId = 'codex') => {
    const project = await createProject({ name: `Codex ${crypto.randomUUID().slice(0, 8)}` });
    await fs.writeFile(path.join(project.path, 'main.tex'), 'original\n');
    const run = await sessions.getAgentRun((await sessions.newAgentRun({ projectId: project.id, agentId, mode: 'review' })).id);
    await run.ready;
    return run;
  };
  const turn = async (run, prompt) => { await sessions.promptAgent(run, prompt); await run.task; return run.events.findLast((e) => e.type === 'state').data; };
  const log = async (run) => (await fs.readFile(path.join(run.home, 'acp-log.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { open, turn, log };
})());

test('a key session authenticates with api-key and sees the key, its own Codex home and no copied login; a login session the reverse', { skip, timeout: 120000 }, async () => {
  const { open, turn, log } = await native$();
  const home = await setUp({ key: KEY, login: true });
  await fs.rm(path.join(home, 'acp-log.jsonl'), { force: true });
  let run = await open();
  assert.deepEqual(await turn(run, 'hello'), { status: 'completed' });
  let entries = await log(run);
  assert.deepEqual(entries.filter((e) => e.method === 'authenticate').map((e) => e.params.methodId), ['api-key']);
  assert.deepEqual(entries.find((e) => e.started).started, { key: KEY, codexHome: path.join(home, '.codex-key'), suggestions: 'false', login: false });
  assert.deepEqual(entries.find((e) => e.method === 'initialize').params.clientCapabilities._meta, { jetbrains: { air: { version: 1, capabilities: ['sessionFailure'] } } });
  const check = run.events.find((e) => e.type === 'notice' && /^Network check for Codex/.test(e.data.message));
  assert.ok(check, 'the network check is in the session’s events');
  assert.doesNotMatch(check.data.message, new RegExp(`hunter2|s3cret|${KEY}`));
  assert.match(check.data.message, /HTTPS proxy 127\.0\.0\.1:7890 \(this computer\)/);
  sessions.closeAgentRun(run);

  await saveAgentConfig('codex', { signInWith: 'login' });
  await fs.rm(path.join(home, 'acp-log.jsonl'), { force: true });
  run = await open();
  assert.deepEqual(await turn(run, 'hello'), { status: 'completed' });
  entries = await log(run);
  assert.deepEqual(entries.filter((e) => e.method === 'authenticate'), [], 'a copied login Codex finds itself');
  assert.deepEqual(entries.find((e) => e.started).started, { key: null, codexHome: null, suggestions: 'false', login: true });
  sessions.closeAgentRun(run);
});

test('Codex starts without a sandbox of its own, which can’t start inside isolation; held to its list it syncs no plugins, with either credential', { skip: nodeAdapters }, async () => {
  let home = await setUp({ key: KEY });
  let options = await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.equal(options.env.INITIAL_AGENT_MODE, 'agent-full-access');
  await saveAgentConfig('codex', { network: { mode: 'hosts' } });
  await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.equal(await fs.readFile(path.join(home, '.codex-key', 'config.toml'), 'utf8'), 'cli_auth_credentials_store = "ephemeral"\n[features]\nplugins = false\n');
  home = await setUp({ login: true });
  await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.equal(await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8'), '[features]\nplugins = false\n');
  await saveAgentConfig('codex', { network: { mode: 'any' } });
  await launchOptions('codex', { workspace: path.join(home, 'tmp'), home });
  assert.equal(await fs.readFile(path.join(home, '.codex', 'config.toml'), 'utf8'), '\n', 'on any host, Codex’s own default');
});

test('an agent without a key sign-in method names the saved key it was given, so a refusal names it', { skip: nodeAdapters }, async () => {
  await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)], apiKey: KEY });
  const home = await agentHome('qoder');
  let options = await launchOptions('qoder', { workspace: path.join(home, 'tmp'), home });
  assert.deepEqual([options.signIn, options.authMethod], ['key', undefined]);
  await saveAgentConfig('qoder', { apiKey: '' });
  options = await launchOptions('qoder', { workspace: path.join(home, 'tmp'), home });
  assert.equal(options.signIn, undefined, 'nothing saved');
});

test('an agent with a model menu refused for want of a sign-in says the model’s provider needs one, and its card stays set up', { skip, timeout: 120000 }, async () => {
  const { open, turn } = await native$();
  await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, '--models', '--auth-on-prompt'], runtimePaths: [path.dirname(fixture)], apiKey: KEY });
  const before = (await agentEntry('qoder')).test;
  const run = await open('qoder');
  assert.deepEqual(await turn(run, 'hello'), { status: 'failed', error: 'Qoder needs a sign-in for this model’s provider. Add its API key in Settings › Agents, or choose a model whose provider has one.' });
  assert.notEqual((await agentEntry('qoder')).test?.code, 'sign-in', 'the card is not sent back to setting up');
  assert.ok(before === undefined || before.code !== 'sign-in');
  sessions.closeAgentRun(run);
});

test('an agent’s menus are remembered from its Test and sessions, and a choice made before a session starts is set as it opens', { skip, timeout: 120000 }, async () => {
  const { log } = await native$();
  const { createProject } = await import('../src/services/projectService.js');
  await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, '--models'], runtimePaths: [path.dirname(fixture)], apiKey: '' });
  await sessions.testAgent('qoder');
  assert.deepEqual((await agentEntry('qoder')).options.configOptions.map((o) => [o.id, o.currentValue]), [['model', 'openai/gpt']]);
  const project = await createProject({ name: 'Menus' });
  const run = await sessions.getAgentRun((await sessions.newAgentRun({ projectId: project.id, agentId: 'qoder', mode: 'review', options: { model: 'deepseek/chat', missing: 'x' } })).id);
  await run.ready;
  assert.deepEqual(run.events.findLast((e) => e.type === 'session').data.configOptions[0].currentValue, 'deepseek/chat');
  assert.deepEqual((await log(run)).filter((e) => e.set).map((e) => e.set), [['model', 'deepseek/chat']], 'one the agent does not offer is left out');
  sessions.closeAgentRun(run);
});

test('Antigravity’s refused turn, which agy ends as end_turn, is Failed: a refused key names the key, another error is told', { skip, timeout: 120000 }, async () => {
  const { open, turn } = await native$();
  await saveAgentConfig('antigravity', { command: process.execPath, args: [fixture, '--auth-methods'], runtimePaths: [path.dirname(fixture)], apiKey: 'AIza-fixture-0123456789' });
  const run = await open('antigravity');
  assert.deepEqual(await turn(run, 'please-agy-key'), { status: 'failed', error: 'Antigravity refused the saved API key. Replace it in Settings › Agents.' });
  assert.equal((await agentEntry('antigravity')).test.refused, 'key');
  assert.deepEqual(await turn(run, 'please-agy-quota'), { status: 'failed', error: 'Antigravity’s model refused the task (429): You exceeded your current quota, please check your plan and billing details. A free Gemini API key has no quota for the Pro models: choose a Flash model, or turn on billing for the key’s project.' });
  assert.deepEqual(await turn(run, 'please-agy-error'), { status: 'failed', error: 'generating and executing: doRequest: error sending request: Post "https://generativelanguage.googleapis.com/v1beta/models"' });
  assert.deepEqual(await turn(run, 'hello'), { status: 'completed' });
  sessions.closeAgentRun(run);
});

test('Codex’s AIR sessionFailure ends a turn Failed with its title; a retry that recovers, or a reply with no edits, is Completed', { skip, timeout: 120000 }, async () => {
  const { open, turn } = await native$();
  await setUp({ login: true });
  const run = await open();
  assert.deepEqual(await turn(run, 'please-air-fail'), { status: 'failed', error: 'Codex can’t reach chatgpt.com to look up your ChatGPT workspace. (workspace routing discovery failed)' });
  assert.deepEqual(await turn(run, 'please-air-retry'), { status: 'completed' }, 'warned, then answered');
  assert.deepEqual(await turn(run, 'hello'), { status: 'completed' }, 'a reply with no edits that did not fail');
  assert.deepEqual(await turn(run, 'draft one'), { status: 'completed' });
  sessions.closeAgentRun(run);
});

test('a refused credential is named, with its way back on the card: the copied login, or the saved key', { skip, timeout: 120000 }, async () => {
  const { open, turn } = await native$();
  await setUp({ login: true });
  let run = await open();
  assert.deepEqual(await turn(run, 'please-login-refused'), { status: 'failed', error: 'Codex refused the copied login: it may have expired or been signed out. Sign in again with codex login, then copy the login again in Settings › Agents.' });
  let card = await agentEntry('codex');
  assert.deepEqual([card.state, card.test.code, card.test.refused], ['sign-in', 'sign-in', 'login']);
  sessions.closeAgentRun(run);

  await setUp({ key: KEY });
  run = await open();
  assert.deepEqual(await turn(run, 'please-auth'), { status: 'failed', error: 'Codex refused the saved API key. Replace it in Settings › Agents.' });
  card = await agentEntry('codex');
  assert.deepEqual([card.state, card.test.refused], ['sign-in', 'key']);
  sessions.closeAgentRun(run);
});

test('an agent without AIR is told nothing of it, and its fatal error still ends without changes', { skip, timeout: 120000 }, async () => {
  const { open, turn, log } = await native$();
  await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, '--auth-methods'], runtimePaths: [path.dirname(fixture)] });
  const run = await open('qoder');
  assert.deepEqual(await turn(run, 'please-air-fail'), { status: 'completed', error: 'Ended without changes. Qoder reported a problem during this task: Reconnecting... 2/5 (workspace routing discovery failed)' });
  assert.equal((await log(run)).find((e) => e.method === 'initialize').params.clientCapabilities._meta, undefined);
  assert.ok(!run.events.some((e) => e.type === 'notice' && /^Network check/.test(e.data.message)), 'the check is Codex’s');
  sessions.closeAgentRun(run);
});

test('under AIR, the permission for a long command carries it whole, and a question is answered in the user’s own words with no choice picked', { skip, timeout: 120000 }, async () => {
  const { open, log } = await native$();
  // as the fixture sends it
  const LONG_COMMAND = `latexmk -pdf -interaction=nonstopmode ${'-e "$x" '.repeat(60)}main.tex`;
  await setUp({ login: true });
  const run = await open();
  const answer = async (prompt, reply) => {
    await sessions.promptAgent(run, prompt);
    for (const deadline = Date.now() + 20000; !run.pending.size;) {
      if (Date.now() > deadline) throw new Error('The agent never asked.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const [[requestId, pending]] = [...run.pending];
    const asked = pending.params;
    sessions.answerAgentRequest(run, requestId, reply);
    await run.task;
    return asked;
  };
  const permission = await answer('please-air-run', { optionId: 'approved' });
  assert.equal(permission.toolCall.title, 'Run command');
  assert.equal(permission.toolCall.rawInput.command, LONG_COMMAND, 'the card has the command whole to show');
  const question = await answer('please-air-question', { action: 'accept', content: { section_note: 'The discussion, please' } });
  assert.equal(question.requestedSchema.properties.section_note.type, 'string', 'the note is its own field, shown beside the choices');
  const answered = (await log(run)).filter((e) => e.answered);
  assert.deepEqual(answered.map((e) => e.result), [{ outcome: { outcome: 'selected', optionId: 'approved' } }, { action: 'accept', content: { section_note: 'The discussion, please' } }], 'Codex hears the user’s words, with no choice picked');
  assert.equal(run.status, 'completed');
  sessions.closeAgentRun(run);
});
