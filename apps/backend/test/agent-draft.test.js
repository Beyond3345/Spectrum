import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const native = ['darwin', 'win32'].includes(process.platform) && process.env.SPECTRUM_NATIVE_AGENT_TESTS === '1';
const fixture = fileURLToPath(new URL('./fixtures/acp-draft-agent.mjs', import.meta.url));
const wait = async (until, what) => {
  const deadline = Date.now() + 10000;
  while (!until()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test('review sessions keep iterating on the draft; apply and reject rebase it; context, persona and chunks', { skip: !native && 'Requires native macOS or Windows sandbox execution.', timeout: 120000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-agent-draft-')));
  process.env.SPECTRUM_DATA_DIR = path.join(dir, 'data');
  process.env.SPECTRUM_PROJECTS_DIR = path.join(dir, 'projects');
  const { createProject } = await import('../src/services/projectService.js');
  const { saveAgentConfig } = await import('../src/services/agentProfiles.js');
  const { newAgentRun, getAgentRun, promptAgent, readContext, reviewAgentChanges, pendingChanges, shutdownAgents } = await import('../src/services/agentSessionService.js');
  const { APP_VERSION } = await import('../src/config/constants.js');
  const turn = async (run, prompt, options) => { await promptAgent(run, prompt, options); await run.task; assert.equal(run.status, 'completed', JSON.stringify(run.events.filter((e) => ['state', 'notice'].includes(e.type)))); };
  const requests = async (run) => (await fs.readFile(path.join(run.home, 'acp-log.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  const apply = (run, changes, action = 'apply') => reviewAgentChanges(run, { action, paths: changes.map((c) => c.path), expected: Object.fromEntries(changes.map((c) => [c.path, c.afterHash])) });
  try {
    const project = await createProject({ name: 'Draft fixture' });
    const root = project.path;
    await fs.writeFile(path.join(root, 'main.tex'), 'original\n');
    await fs.mkdir(path.join(root, '.spectrum', 'todos'), { recursive: true });
    await fs.writeFile(path.join(root, '.spectrum', 'todos', 't1.json'), JSON.stringify({ id: 't1', text: 'Cite the survey', done: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', link: { file: 'main.tex', line: 1 } }));
    await fs.writeFile(path.join(root, '.spectrum', 'todos', 't2.json'), JSON.stringify({ id: 't2', text: 'Done already', done: true, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }));
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture, '--embedded', '--system-prompt'], runtimePaths: [path.dirname(fixture)] });

    const run = await getAgentRun((await newAgentRun({ projectId: project.id, agentId: 'qoder', mode: 'review', persona: { name: 'Critic', prompt: 'Be blunt.' } })).id);
    await run.ready;
    await fs.rm(path.join(run.home, 'acp-log.jsonl'), { force: true });
    await assert.rejects(readContext(run, { activePath: '../outside.tex' }), /Invalid path/);
    await assert.rejects(readContext(run, { research: 'missing' }), /research session/);
    const context = await readContext(run, { activePath: 'main.tex', selection: 'original', log: 'main.tex:1: Undefined control sequence', todos: true });
    await turn(run, 'draft one', { context });
    const changes = await pendingChanges(run);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].proposed, 'original\nagent line 1\n');
    assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'original\n', 'review never writes the live project');

    // the client's version, the persona as a system prompt, and the context as resources
    const blocks = (await requests(run)).find((q) => q.method === 'session/prompt').params.prompt;
    assert.equal(blocks[0].type, 'text');
    assert.match(blocks[0].text, /You are working in Spectrum/);
    assert.doesNotMatch(blocks[0].text, /Be blunt/, 'the persona went in the system prompt instead');
    assert.deepEqual(blocks[1], { type: 'resource_link', uri: pathToFileURL(path.join(run.workspace, 'main.tex')).href, name: 'main.tex' });
    assert.deepEqual(blocks.slice(2).map((b) => [b.type, b.resource.uri.replace(/^file:.*#/, '#'), b.resource.text]), [
      ['resource', '#selection', 'original'],
      ['resource', 'spectrum:compile-log', 'main.tex:1: Undefined control sequence'],
      ['resource', 'spectrum:todos', '- [ ] Cite the survey (main.tex:1)']
    ]);
    // streamed pieces are stored as one event that names its first piece
    const message = run.events.filter((e) => e.type === 'update' && e.data.sessionUpdate === 'agent_message_chunk');
    assert.equal(message.length, 1);
    assert.equal(message[0].data.content.text, Array.from({ length: 30 }, (_, i) => `piece-${i} `).join(''));
    assert.equal(message[0].id - message[0].first, 29);

    // the next prompt goes on from the draft, with the pending change still unresolved
    await turn(run, 'draft two');
    assert.equal((await pendingChanges(run))[0].proposed, 'original\nagent line 1\nagent line 2\n');
    const log = await requests(run);
    const load = log.find((q) => q.method === 'session/load');
    assert.ok(load, 'a loadable session is loaded, not replaced');
    assert.equal(load.params.systemPrompt.mode, 'append');
    assert.match(load.params.systemPrompt.content[0].text, /Be blunt/);
    assert.ok(!run.events.some((e) => e.data?.sessionUpdate === 'user_message_chunk'), 'a load’s replay is not stored again');
    assert.equal(run.events.filter((e) => e.data?.sessionUpdate === 'available_commands_update').length, 2, 'but its commands are');
    assert.doesNotMatch(log.filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text, /You are working in Spectrum/);
    assert.equal(log.find((q) => q.method === 'initialize').params.clientInfo.version, APP_VERSION);

    // applying makes the applied text the file's baseline
    await apply(run, await pendingChanges(run));
    assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), 'original\nagent line 1\nagent line 2\n');
    assert.deepEqual(await pendingChanges(run), []);

    // the user's edits merge in on apply, and the draft takes the merged text
    await turn(run, 'draft three');
    await fs.writeFile(path.join(root, 'main.tex'), 'user top\noriginal\nagent line 1\nagent line 2\n');
    await apply(run, await pendingChanges(run));
    const merged = 'user top\noriginal\nagent line 1\nagent line 2\nagent line 3\n';
    assert.equal(await fs.readFile(path.join(root, 'main.tex'), 'utf8'), merged);
    assert.equal(await fs.readFile(path.join(run.workspace, 'main.tex'), 'utf8'), merged);
    assert.deepEqual(await pendingChanges(run), []);

    // rejecting puts the user's file back in the draft and tells the agent
    await turn(run, 'draft four');
    assert.match((await requests(run)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text, /“main\.tex” was applied with the user’s own edits/);
    await apply(run, await pendingChanges(run), 'reject');
    assert.equal(await fs.readFile(path.join(run.workspace, 'main.tex'), 'utf8'), merged);
    assert.deepEqual(await pendingChanges(run), []);
    assert.deepEqual(run.events.findLast((e) => e.type === 'reset').data, { paths: ['main.tex'] });
    await turn(run, 'draft five');
    const told = (await requests(run)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text;
    assert.match(told, /rejected your changes to “main\.tex”/);
    assert.doesNotMatch(told, /applied with/, 'each note goes once');
    assert.equal((await pendingChanges(run))[0].proposed, `${merged}agent line 4\n`, 'the rejected line went with the reset');
    await apply(run, await pendingChanges(run), 'reject');

    // another persona starts a new session that hears the conversation so far
    await turn(run, 'just answer', { persona: { name: 'Writer', prompt: 'Be kind.' } });
    const renewed = (await requests(run)).filter((q) => q.method === 'session/new').at(-1);
    assert.match(renewed.params.systemPrompt.content[0].text, /Be kind/);
    assert.match((await requests(run)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text, /Previous conversation/);

    // an agent without embedded resources or a system prompt option gets both as text, the persona on each new session
    await saveAgentConfig('qoder', { command: process.execPath, args: [fixture], runtimePaths: [path.dirname(fixture)] });
    await fs.rm(path.join(run.home, 'acp-log.jsonl'));
    const other = await createProject({ name: 'Plain fixture' });
    await fs.writeFile(path.join(other.path, 'main.tex'), 'plain\n');
    const plain = await getAgentRun((await newAgentRun({ projectId: other.id, agentId: 'qoder', persona: { name: 'Critic', prompt: 'Be blunt.' } })).id);
    await plain.ready;
    await turn(plain, 'answer', { context: await readContext(plain, { selection: 'plain' }) });
    const first = (await requests(plain)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt;
    assert.match(first[0].text, /persona “Critic”[\s\S]*Be blunt/);
    assert.deepEqual(first[1], { type: 'text', text: 'Selected text:\nplain' });
    assert.ok(!(await requests(plain)).find((q) => q.method === 'session/new').params.systemPrompt);
    await turn(plain, 'answer again');
    assert.doesNotMatch((await requests(plain)).filter((q) => q.method === 'session/prompt').at(-1).params.prompt[0].text, /Be blunt/, 'a loaded session keeps it');
  } finally { await shutdownAgents(); await fs.rm(dir, { recursive: true, force: true }); }
});
