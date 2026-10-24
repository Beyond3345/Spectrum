// The Spectrum agent (/api/agent/run): the user's instructions and skills in its prompts, its skill, to-do and research
// tools, and its proposals as a changes tray lists them. In-process, against a scripted model on this computer and
// throwaway data, projects and seed folders. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-agent-run-')));
const seed = path.join(tmp, 'seed');
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_SKILLS_SEED_DIR: seed
});
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
await write(path.join(seed, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Finds papers first\n---\nSearch before you write.\n');
await write(path.join(seed, 'alpha', 'references', 'apis.md'), 'Use OpenAlex.');
await write(path.join(seed, 'beta', 'SKILL.md'), '---\nname: beta\ndescription: Reviews manuscripts\n---\nReview carefully.\n');

const { default: Fastify } = await import('fastify');
const { registerAgentRoutes } = await import('../src/routes/agent.js');
const { registerChatRoutes } = await import('../src/routes/chats.js');
const { createProject } = await import('../src/services/projectService.js');
const { updateProjectSettings } = await import('../src/services/projectSettings.js');
const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerAgentRoutes(app);
registerChatRoutes(app);

const calls = [];
const call = (id, name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
// "tools" goes through the script below one step per answer; "loop" never stops calling a tool
const SCRIPT = [
  ['load_skill', { id: 'alpha' }],
  ['read_skill_file', { id: 'alpha', path: 'references/apis.md' }],
  ['read_skill_file', { id: 'alpha', path: '../../../state.json' }],
  ['list_todos', {}],
  ['suggest_todo', { text: 'Check the references', link: { file: 'main.tex', line: 2, extra: true } }],
  ['suggest_todo', { text: '' }],
  ['apply_patch', { path: 'main.tex', patch: '--- main.tex\n+++ main.tex\n@@ -1,2 +1,2 @@\n line one\n-line two\n+line 2\n' }],
  ['read_file', { path: './main.tex' }],
  ['apply_patch', { path: 'main.tex', patch: '--- main.tex\n+++ main.tex\n@@ -1,2 +1,3 @@\n line one\n line 2\n+line three\n' }],
  ['propose_patch', { path: 'sections/new.tex', content: 'New section\n' }],
  ['load_skill', { id: 'beta' }],
  ['read_skill_file', { id: 'beta', path: 'SKILL.md' }]
];
// "drafts" goes on from a proposal the thread still has open, and leaves another one alone
const DRAFTS = [
  ['read_file', { path: 'main.tex' }],
  ['apply_patch', { path: 'main.tex', patch: '--- main.tex\n+++ main.tex\n@@ -1,2 +1,3 @@\n line one\n line 2\n+line three\n' }]
];
let mock;
let base;
before(async () => {
  mock = createServer((req, res) => {
    if (req.url.startsWith('/doi/')) {
      res.writeHead(200, { 'content-type': 'application/vnd.citationstyles.csl+json' });
      return res.end(JSON.stringify({ type: 'article-journal', title: 'A study of drafts', author: [{ family: 'Smith', given: 'Ann' }], issued: { 'date-parts': [[2024]] }, 'container-title': 'Journal of Tests' }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body);
      calls.push(payload);
      const steps = payload.messages.filter((m) => m.role === 'tool').length;
      const script = payload.model === 'drafts' ? DRAFTS : SCRIPT;
      const message = payload.model === 'loop' ? call(`c${steps}`, 'list_todos', {})
        : ['tools', 'drafts'].includes(payload.model) && steps < script.length ? call(`c${steps}`, ...script[steps])
          : { role: 'assistant', content: payload.model === 'direct' ? '{"reply":"ok","suggestion":"x"}' : 'done' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${mock.address().port}/v1`;
  process.env.SPECTRUM_DOI_BASE = `http://127.0.0.1:${mock.address().port}/doi`;
});
after(async () => {
  mock?.close();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});
const run = async (body) => {
  const res = await app.inject({ url: '/api/agent/run', method: 'POST', payload: body });
  return { status: res.statusCode, json: res.json() };
};
const llmConfig = (model) => ({ endpoint: base, apiKey: 'test', model });
const system = (payload) => payload.messages[0].content;
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

test('the Spectrum agent loads skills, reads and suggests to-dos, and proposes changes that build on each other', async () => {
  const p = await createProject({ name: 'Spectrum agent', populate: async (root) => {
    await write(path.join(root, 'main.tex'), 'line one\nline two\n');
    await write(path.join(root, '.spectrum', 'todos', 'a.json'), JSON.stringify({ id: 'a', text: 'Open item', done: false, createdAt: '1', updatedAt: '1' }));
    await write(path.join(root, '.spectrum', 'todos', 'b.json'), JSON.stringify({ id: 'b', text: 'Finished', done: true, createdAt: '2', updatedAt: '2' }));
  } });
  await updateProjectSettings(p.path, () => ({ skills: { on: [], off: ['beta'] } }));
  calls.length = 0;
  const off = await run({ task: 'polish', prompt: 'improve', mode: 'tools', projectId: p.id, llmConfig: llmConfig('tools'), skill: 'beta' });
  assert.equal(off.status, 403, 'a skill off in the project isn’t sent');
  assert.equal((await run({ task: 'polish', prompt: 'improve', mode: 'tools', projectId: p.id, llmConfig: llmConfig('tools'), skill: 'gamma' })).status, 404);
  calls.length = 0;
  const { status, json } = await run({ task: 'polish', prompt: 'improve', mode: 'tools', projectId: p.id, activePath: 'main.tex', llmConfig: llmConfig('tools'), instructions: 'Write in Australian English.', skill: 'alpha' });
  assert.equal(status, 200, json.error);
  assert.equal(json.reply, 'done');
  const prompt = system(calls[0]);
  assert.match(prompt, /<user-instructions>\nWrite in Australian English\.\n<\/user-instructions>/);
  assert.match(prompt, /<skill id="alpha">\nSearch before you write\.\n<\/skill>/, 'a skill asked for goes in whole');
  assert.match(prompt, /<skills>\n- alpha: Finds papers first\n<\/skills>/);
  assert.match(prompt, /can't run here/);
  for (const name of ['load_skill', 'read_skill_file', 'list_todos', 'suggest_todo', 'literature_search', 'fetch_bibtex']) assert.ok(calls[0].tools.some((t) => t.function.name === name), name);

  const outputs = calls.at(-1).messages.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.deepEqual(JSON.parse(outputs[0]), { id: 'alpha', description: 'Finds papers first', body: 'Search before you write.', files: ['SKILL.md', 'references/apis.md'] });
  assert.equal(outputs[1], 'Use OpenAlex.');
  assert.match(outputs[2], /^Error: /);
  assert.deepEqual(JSON.parse(outputs[3]), { todos: [{ text: 'Open item' }] });
  assert.match(outputs[5], /^Error: /);
  assert.equal(outputs[7], 'line one\nline 2\n', 'reading a changed file sees the change');
  assert.deepEqual(outputs.slice(10), ['Error: That skill is off for this project.', 'Error: That skill is off for this project.'], 'nor can it be loaded');

  assert.deepEqual(json.todos, [{ text: 'Check the references', link: { file: 'main.tex', line: 2 } }]);
  assert.deepEqual(json.changes, [
    { path: 'main.tex', kind: 'modified', binary: false, beforeHash: sha('line one\nline two\n'), afterHash: sha('line one\nline 2\nline three\n'), size: 27, original: 'line one\nline two\n', proposed: 'line one\nline 2\nline three\n' },
    { path: 'sections/new.tex', kind: 'created', binary: false, beforeHash: null, afterHash: sha('New section\n'), size: 12, original: '', proposed: 'New section\n' }
  ]);
  assert.deepEqual(json.patches.map((patch) => [patch.path, patch.original, patch.content]), [['main.tex', 'line one\nline two\n', 'line one\nline 2\nline three\n'], ['sections/new.tex', '', 'New section\n']]);
  assert.equal(await fs.readFile(path.join(p.path, 'main.tex'), 'utf8'), 'line one\nline two\n', 'nothing is written');
  // each tool call, for the transcript's cards
  assert.deepEqual(json.steps.slice(0, 3), [{ tool: 'load_skill', about: 'alpha', ok: true }, { tool: 'read_skill_file', about: 'references/apis.md', ok: true }, { tool: 'read_skill_file', about: '../../../state.json', ok: false }]);
  assert.equal(json.steps.length, SCRIPT.length);

  // the next turn goes on from the proposals the thread has open, and proposes only what it changed
  calls.length = 0;
  const next = await run({ task: 'polish', prompt: 'more', mode: 'tools', projectId: p.id, llmConfig: llmConfig('drafts'), drafts: [
    { path: 'main.tex', original: 'line one\nline two\n', proposed: 'line one\nline 2\n' },
    { path: 'sections/new.tex', original: '', proposed: 'New section\n' },
    { path: '../outside.tex', original: '', proposed: 'x' }
  ] });
  assert.equal(next.status, 200, next.json.error);
  assert.equal(calls.at(-1).messages.filter((m) => m.role === 'tool')[0].content, 'line one\nline 2\n', 'it reads its earlier proposal');
  assert.deepEqual(next.json.patches.map((patch) => [patch.path, patch.original, patch.content]), [['main.tex', 'line one\nline two\n', 'line one\nline 2\nline three\n']]);
});

test('instructions reach Ask, Edit and rewrites but never autocomplete, and the loop stops after 25 steps', async () => {
  const p = await createProject({ name: 'Instructions' });
  const instructions = 'Be brief.';
  calls.length = 0;
  await run({ task: 'chat', prompt: 'hi', interaction: 'chat', mode: 'direct', llmConfig: llmConfig('chat'), instructions });
  assert.match(system(calls.at(-1)), /<user-instructions>\nBe brief\./);
  await run({ task: 'polish', prompt: 'tidy', selection: 'x', mode: 'direct', llmConfig: llmConfig('direct'), instructions });
  assert.match(system(calls.at(-1)), /<user-instructions>/);
  await run({ task: 'autocomplete', prompt: '', content: 'x', mode: 'direct', llmConfig: llmConfig('direct'), instructions, skill: 'alpha' });
  assert.doesNotMatch(system(calls.at(-1)), /user-instructions|<skill/);

  calls.length = 0;
  const looped = await run({ task: 'polish', prompt: 'go', mode: 'tools', projectId: p.id, llmConfig: llmConfig('loop') });
  assert.equal(looped.json.reply, 'Stopped after 25 tool steps without a final answer.');
  assert.equal(calls.length, 25);

  assert.equal((await run({ task: 'polish', prompt: 'x', mode: 'tools', projectId: p.id, llmConfig: llmConfig('chat'), skill: '../x' })).status, 400);
  assert.equal((await run({ task: 'polish', prompt: 'x', mode: 'tools', projectId: p.id, llmConfig: llmConfig('chat'), skill: 'missing' })).status, 404);
  assert.equal((await run({ task: 'polish', prompt: 'x', mode: 'tools', projectId: p.id, llmConfig: llmConfig('chat'), instructions: 5 })).status, 400);
});

test('fetch_bibtex makes BibTeX from a DOI as the references resolver does', async () => {
  const { fetchBibtex } = await import('../src/services/researchTools.js');
  const bibtex = await fetchBibtex('https://doi.org/10.1234/drafts');
  assert.match(bibtex, /^@article\{Smith2024/);
  assert.match(bibtex, /title\s+= \{A study of drafts\}/);
  assert.match(bibtex, /doi\s+= \{10\.1234\/drafts\}/);
  await assert.rejects(fetchBibtex(''), /Give a DOI/);
});

test('a Spectrum agent thread is a chat marked as one, listed with its mark, and keeps it through a merge', async () => {
  const p = await createProject({ name: 'Threads' });
  const chats = `/api/projects/${p.id}/chats`;
  const thread = { id: 'agent_1', title: 'Related work', mode: 'assistant', agent: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', messages: [{ role: 'user', content: 'Draft it', createdAt: '2026-01-01T00:00:00.000Z' }] };
  const put = (chat, base) => app.inject({ url: `${chats}/${chat.id}`, method: 'PUT', payload: { chat, base } });
  await put(thread);
  await put({ ...thread, id: 'ask_1', agent: undefined, title: 'Ask' });
  const list = (await app.inject({ url: chats })).json().chats;
  assert.deepEqual(list.map((c) => [c.id, c.agent]), [['agent_1', true], ['ask_1', undefined]]);
  // an older copy without the mark, saved over the thread, merges into it and stays a thread
  const { agent, ...unmarked } = thread;
  assert.equal(agent, true);
  const merged = (await put({ ...unmarked, messages: [...thread.messages, { role: 'assistant', content: 'Done', createdAt: '2026-01-02T00:00:00.000Z' }] }, 'older')).json().chat;
  assert.equal(merged.agent, true);
  assert.equal(merged.messages.length, 2);

  // an Apply or Reject marked on an older copy (or on another computer) isn't lost to disk's copy of the message
  const proposed = { role: 'assistant', content: 'Changed it', createdAt: '2026-01-03T00:00:00.000Z', meta: { changes: [{ filePath: 'a.tex', proposed: 'A' }, { filePath: 'b.tex', proposed: 'B', status: 'rejected' }] } };
  const withProposal = { ...merged, messages: [...merged.messages, proposed] };
  await put(withProposal, merged.updatedAt);
  const checkpoint = { id: 7, number: 3, label: 'Before applying agent changes', createdAt: '2026-01-03T00:01:00.000Z' };
  const marked = { ...proposed, meta: { changes: [{ ...proposed.meta.changes[0], status: 'applied' }, { ...proposed.meta.changes[1], status: 'applied' }], checkpoints: [checkpoint] } };
  const again = (await put({ ...withProposal, messages: [...merged.messages, marked], updatedAt: '2026-01-01T00:00:00.000Z' }, 'older')).json().chat;
  assert.deepEqual(again.messages.at(-1).meta, { changes: [{ filePath: 'a.tex', proposed: 'A', status: 'applied' }, { filePath: 'b.tex', proposed: 'B', status: 'rejected' }], checkpoints: [checkpoint] });
});
