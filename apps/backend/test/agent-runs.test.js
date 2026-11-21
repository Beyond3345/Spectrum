// The Spectrum agent's turns as jobs (/api/agent/runs): events as a turn happens, Stop, steering, Continue on the
// same conversation, a page that connects later, and the tools the agent gained (edit_file, delete_file, search_text,
// compile on a copy with its proposals). In-process, against a scripted model on this computer that streams its
// answers, and throwaway projects. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-agent-jobs-')));
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
await write(path.join(seed, 'alpha', 'SKILL.md'), `---\nname: alpha\ndescription: Finds papers first. ${'Use it whenever a task needs sources, a reading list or a citation check. '.repeat(6)}\n---\nSearch before you write.\n`);

const { default: Fastify } = await import('fastify');
const { registerAgentRoutes } = await import('../src/routes/agent.js');
const { createProject } = await import('../src/services/projectService.js');
const { getRun, shutdownRuns } = await import('../src/services/agentRunService.js');
const { replaceExact } = await import('../src/services/agentService.js');
const { builtInTypst } = await import('../src/services/engineService.js');
const { findExecutable } = await import('../src/services/compileService.js');
const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerAgentRoutes(app);
// a DOI resolver that never answers, for a tool that is still running when Stop comes
app.get('/hang/*', () => new Promise(() => {}));

// The scripted model. A script is a list of steps, each { say?, calls?: [[name, args]…], wait?, status? }, walked by
// the number of assistant turns since the last message of the user's; or a function of the request. It streams when
// asked to, a word at a time.
const requests = [];
const scripts = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let mock;
let base;
let origin;
before(async () => {
  mock = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const payload = JSON.parse(body);
      requests.push({ payload, bytes: body.length, at: Date.now() });
      const lastUser = payload.messages.map((m) => m.role).lastIndexOf('user');
      const step = payload.messages.slice(lastUser + 1).filter((m) => m.role === 'assistant').length;
      const script = scripts[payload.model];
      const reply = (typeof script === 'function' ? script(payload, step) : script?.[Math.min(step, script.length - 1)]) || { say: 'done' };
      if (reply.wait) await sleep(reply.wait);
      if (reply.status) {
        res.writeHead(reply.status, { 'content-type': 'application/json', 'retry-after': '0' });
        return res.end(JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } }));
      }
      const toolCalls = (reply.calls || []).map(([name, args], i) => ({ index: i, id: `c${requests.length}-${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }));
      const usage = { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: 7, prompt_tokens_details: { cached_tokens: step ? 1000 : 0 }, ...(reply.cost !== undefined && { cost: reply.cost }) };
      if (!payload.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply.say || null, ...(toolCalls.length && { tool_calls: toolCalls }) } }], usage }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      for (const word of (reply.say || '').match(/\S+\s*/g) || []) {
        send({ choices: [{ index: 0, delta: { content: word } }] });
        if (reply.pace) await sleep(reply.pace);
      }
      if (toolCalls.length) send({ choices: [{ index: 0, delta: { tool_calls: toolCalls } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }] });
      send({ choices: [], usage });
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${mock.address().port}/v1`;
  origin = await app.listen({ port: 0, host: '127.0.0.1' });
});
after(async () => {
  shutdownRuns();
  mock?.close();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const post = async (url, body) => {
  const res = await app.inject({ url, method: 'POST', payload: body });
  return { status: res.statusCode, json: res.json() };
};
const llmConfig = (model) => ({ endpoint: base, apiKey: 'test', model });
/** A run's events over its event stream, from `after` until a turn ends (or `until` says so). */
async function hear(id, { after = 0, until = (e) => e.type === 'state' && !['running', 'stopping'].includes(e.data.status), onEvent } = {}) {
  const stop = new AbortController();
  const res = await fetch(`${origin}/api/agent/runs/${id}/events?after=${after}`, { signal: stop.signal });
  assert.match(res.headers.get('content-type'), /event-stream/);
  const events = [];
  let buffer = '';
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const line = buffer.slice(0, end).split('\n').find((l) => l.startsWith('data: '));
        buffer = buffer.slice(end + 2);
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        events.push(event);
        await onEvent?.(event, events);
        if (until(event)) {
          stop.abort();
          return events;
        }
      }
    }
  } catch (err) {
    if (!stop.signal.aborted) throw err;
  }
  return events;
}
const inner = (text) => text.replace(/^<(?:untrusted|skill)[^>]*>\n/, '').replace(/\n<\/(?:untrusted|skill)>$/, '');
const toolResults = (payload) => payload.messages.filter((m) => m.role === 'tool').map((m) => inner(m.content));
const of = (events, type) => events.filter((e) => e.type === type).map((e) => e.data);
const turn = (p, model, more = {}) => ({ projectId: p.id, threadId: `thread-${p.id.slice(0, 8)}`, prompt: 'go', llmConfig: llmConfig(model), ...more });

test('a turn is a job: its steps and its answer are heard as they happen, read-only calls of one step run together, and the request asks for a stream and the cache', async () => {
  const p = await createProject({ name: 'Jobs' });
  await write(path.join(p.path, 'main.tex'), '\\section{One}\nline two\nline three\n');
  scripts.live = [
    { say: 'Looking around.', calls: [['read_file', { path: 'main.tex' }], ['search_text', { query: 'two' }], ['project_map', {}]] },
    { calls: [['edit_file', { path: 'main.tex', old: 'line two', new: 'line 2' }]] },
    { say: 'Changed line two. It was not compiled.', pace: 5 }
  ];
  requests.length = 0;
  const started = await post('/api/agent/runs', turn(p, 'live', { shown: 'go', instructions: 'Write in Australian English.', skill: 'alpha' }));
  assert.equal(started.status, 200, started.json.error);
  const { run } = started.json;
  assert.match(run.id, /^[a-f0-9-]{36}$/);
  assert.equal(run.status, 'running', 'the request returns before the turn has finished');
  const events = await hear(run.id);
  assert.deepEqual(events.map((e) => e.id), events.map((e, i) => events[0].id + i), 'ids rise by one');
  assert.deepEqual(events.slice(0, 2).map((e) => [e.type, e.data.status ?? e.data.text]), [['state', 'running'], ['user', 'go']]);
  const steps = of(events, 'step');
  // three read-only calls of one model turn: all started before any is done
  // (they end in whichever order they finish)
  assert.deepEqual(steps.slice(0, 3).map((s) => `${s.tool} ${s.status}`), ['read_file started', 'search_text started', 'project_map started']);
  assert.deepEqual(steps.slice(3, 6).map((s) => `${s.tool} ${s.status}`).sort(), ['project_map done', 'read_file done', 'search_text done']);
  assert.deepEqual(steps.slice(0, 3).map((s) => s.status), ['started', 'started', 'started']);
  const edit = steps.find((s) => s.tool === 'edit_file' && s.status === 'done');
  assert.deepEqual(edit.show, { diff: { path: 'main.tex', oldText: 'line two', newText: 'line 2' } });
  assert.equal(typeof edit.ms, 'number');
  assert.deepEqual(steps.find((s) => s.tool === 'search_text' && s.status === 'done').show, { text: 'main.tex:2: line two' });
  // the model's words before its tools, then its answer in pieces
  const texts = events.filter((e) => e.type === 'text');
  assert.equal(texts[0].data.text, 'Looking ');
  assert.ok(texts.length >= 8, 'piece by piece');
  assert.ok(texts[0].id < events.find((e) => e.type === 'step').id);
  const usage = of(events, 'usage');
  assert.equal(usage.length, 3);
  assert.equal(usage[2].cacheRead, 1000);
  assert.equal(usage[2].total.cacheRead, 2000);
  assert.equal(usage[2].model, 'live');
  const [result] = of(events, 'result');
  assert.equal(result.ok, true);
  assert.equal(result.turn, 1);
  assert.equal(result.reply, 'Changed line two. It was not compiled.');
  assert.deepEqual(result.patches.map((x) => [x.path, x.content]), [['main.tex', '\\section{One}\nline 2\nline three\n']]);
  assert.deepEqual(result.says, [{ before: 0, text: 'Looking around.' }]);
  assert.deepEqual(result.usage, { ...usage[2].total, model: 'live' });
  assert.deepEqual(events.at(-1).data, { status: 'done', turn: 1 });
  assert.equal(await fs.readFile(path.join(p.path, 'main.tex'), 'utf8'), '\\section{One}\nline two\nline three\n', 'nothing is written');

  // what the model was sent: a stream, the run as the cache's key, the same prefix at every step
  assert.equal(requests.length, 3);
  for (const { payload } of requests) {
    assert.equal(payload.stream, true);
    assert.equal(payload.prompt_cache_key, run.id);
  }
  const prefix = JSON.stringify(requests[0].payload.messages).slice(0, -1);
  assert.ok(JSON.stringify(requests[2].payload.messages).startsWith(prefix), 'each step adds to the last one’s messages');
  assert.deepEqual(requests[0].payload.tools, requests[2].payload.tools);
  // the persona is the agent's own instructions; a skill picked with / goes with the request
  const [system, user] = requests[0].payload.messages;
  assert.match(system.content, /<user-instructions>\nWrite in Australian English\./);
  assert.doesNotMatch(system.content, /Search before you write/);
  assert.match(user.content, /<skill id="alpha">\nSearch before you write\.\n<\/skill>/);
  // the skills list: a line each, the description's first sentence
  assert.match(system.content, /<skills>\n- alpha: Finds papers first\.\n<\/skills>/);
  assert.match(system.content, /After changing a source file, compile\. If it fails, fix the first error and compile again; stop after three tries/);
  const names = requests[0].payload.tools.map((t) => t.function.name);
  for (const name of ['compile', 'get_log', 'search_text', 'project_map', 'bib_entries', 'bib_search', 'read_file', 'edit_file', 'propose_patch', 'delete_file']) assert.ok(names.includes(name), name);
  assert.ok(!names.includes('web_search'), 'only with a search connection');

  // a page that connects later hears the turn from its store, the answer's pieces as one event
  const again = await hear(run.id, { until: (e) => e.type === 'state' && e.data.status === 'done' });
  const whole = again.filter((e) => e.type === 'text');
  assert.equal(whole.at(-1).data.text, 'Changed line two. It was not compiled.');
  assert.equal(whole.at(-1).first, texts.find((t) => t.data.text === 'Changed ').id, 'and names the first piece it stands for');
  assert.deepEqual(again.at(-1), events.at(-1));
  const found = await app.inject({ url: `/api/agent/runs?projectId=${p.id}&threadId=thread-${p.id.slice(0, 8)}` });
  assert.deepEqual(found.json().run, { id: run.id, projectId: p.id, threadId: `thread-${p.id.slice(0, 8)}`, status: 'done', turn: 1, lastEventId: events.at(-1).id });
  assert.equal((await app.inject({ url: `/api/agent/runs?projectId=${p.id}&threadId=other` })).json().run, null);
});

test('the next turn of a thread goes on in the same conversation: the earlier tool results are there, and the outline is not sent twice', async () => {
  const p = await createProject({ name: 'Two turns' });
  await write(path.join(p.path, 'main.tex'), '\\section{One}\nline two\n');
  scripts.turns = [{ calls: [['read_file', { path: 'main.tex' }]] }, { calls: [['edit_file', { path: 'main.tex', old: 'line two', new: 'line 2' }]] }, { say: 'Done.' }];
  requests.length = 0;
  const first = await post('/api/agent/runs', turn(p, 'turns'));
  const one = await hear(first.json.run.id);
  const { patches } = of(one, 'result')[0];
  const busy = post('/api/agent/runs', turn(p, 'turns'));
  const second = await busy;
  assert.equal(second.status, 200, second.json.error);
  assert.equal(second.json.run.id, first.json.run.id, 'one run for the thread');
  assert.equal(second.json.run.turn, 2);
  // the user rejected the proposal: it is not sent as open, and the agent is told
  const two = await hear(second.json.run.id, { after: one.at(-1).id });
  assert.equal(two[0].id, one.at(-1).id + 1, 'ids go on through the run');
  const last = requests.at(-1).payload.messages;
  const firstTurn = requests[2].payload.messages;
  assert.equal(JSON.stringify(last.slice(0, firstTurn.length)), JSON.stringify(firstTurn), 'the first turn, as it was sent');
  assert.equal(last[firstTurn.length].role, 'assistant');
  assert.equal(last[firstTurn.length].content, 'Done.');
  const users = last.filter((m) => m.role === 'user');
  assert.match(users[0].content, /Project:\n<untrusted source="project outline">/);
  assert.doesNotMatch(users[1].content, /project outline/);
  assert.match(users[1].content, /Your earlier proposals for main\.tex are no longer open/);
  assert.equal(patches.length, 1);
  // a third turn while one is going is refused, for the page to queue
  scripts.slowturn = [{ say: 'Thinking.', wait: 300 }];
  const third = await post('/api/agent/runs', turn(p, 'slowturn'));
  const refused = await post('/api/agent/runs', turn(p, 'slowturn'));
  assert.equal(refused.status, 409);
  assert.match(refused.json.error, /already working/);
  // another model: the conversation starts again from the thread's text, as its reply items are the other model's
  const other = await hear(third.json.run.id, { after: two.at(-1).id });
  assert.equal(of(other, 'result')[0].ok, true);
  assert.equal(requests.at(-1).payload.messages.filter((m) => m.role === 'tool').length, 0);
});

test('Stop ends the model call at once and keeps what was done; Continue goes on from the same messages', async () => {
  const p = await createProject({ name: 'Stop' });
  await write(path.join(p.path, 'main.tex'), 'one\ntwo\n');
  let long = true;
  scripts.slow = (payload, step) => {
    if (!payload.messages.some((m) => m.role === 'tool')) return { calls: [['edit_file', { path: 'main.tex', old: 'one', new: '1' }]] };
    return long ? { say: 'A long answer that never ends '.repeat(200), pace: 20 } : { say: 'Finished after all.' };
  };
  requests.length = 0;
  const { json } = await post('/api/agent/runs', turn(p, 'slow'));
  let stoppedAt = 0;
  const events = await hear(json.run.id, {
    onEvent: async (e) => {
      // once the answer has started to come
      if (e.type === 'text' && !stoppedAt) {
        stoppedAt = Date.now();
        assert.equal((await post(`/api/agent/runs/${json.run.id}/stop`)).status, 200);
      }
    }
  });
  const ended = Date.now() - stoppedAt;
  assert.ok(ended < 1000, `stopped in ${ended} ms`);
  assert.deepEqual(of(events, 'state').map((s) => s.status), ['running', 'stopping', 'stopped']);
  const [result] = of(events, 'result');
  assert.equal(result.ok, false);
  assert.equal(result.incomplete, 'stopped');
  assert.deepEqual(result.patches.map((x) => x.content), ['1\ntwo\n'], 'the change it had prepared is kept');
  // the words it had streamed before Stop are its reply, as the page showed them
  const streamed = of(events, 'text').map((t) => t.text).join('');
  assert.match(result.reply, /^A /);
  assert.equal(result.reply, streamed);
  const sent = requests.length;
  await sleep(300);
  assert.equal(requests.length, sent, 'no model call after Stop');

  // Continue: no new request text, the conversation as it stood
  long = false;
  const go = await post(`/api/agent/runs/${json.run.id}/continue`, { llmConfig: llmConfig('slow'), drafts: [{ path: 'main.tex', original: 'one\ntwo\n', proposed: '1\ntwo\n' }] });
  assert.equal(go.status, 200, go.json.error);
  assert.equal(go.json.run.turn, 2);
  const more = await hear(json.run.id, { after: events.at(-1).id });
  assert.equal(of(more, 'user').length, 0, 'Continue is no message of the user’s');
  assert.equal(of(more, 'state')[0].resumed, true);
  assert.equal(of(more, 'result')[0].reply, 'Finished after all.');
  const messages = requests.at(-1).payload.messages;
  assert.equal(messages.filter((m) => m.role === 'tool').length, 1, 'the step it had finished is in the conversation, not retold');
  assert.equal(messages.at(-1).content, 'Continue from where you stopped.');
  // and so are the words it had said before Stop, so it knows what it had already said
  assert.deepEqual([messages.at(-2).role, messages.at(-2).content], ['assistant', result.reply]);
  assert.doesNotMatch(JSON.stringify(messages), /Earlier run/);
  // a run that is no longer kept says so, for the page to send the request again
  assert.equal((await post('/api/agent/runs/00000000-0000-4000-8000-000000000000/continue', {})).status, 404);
});

test('Stop part-way through an answer with no tool step keeps the words, for the thread and the next turn', async () => {
  const p = await createProject({ name: 'Stop prose' });
  await write(path.join(p.path, 'main.tex'), 'one\n');
  scripts.prose = (payload) => (payload.messages.at(-1).content.includes('And now?') ? { say: 'Going on.' } : { say: 'Here is the start of a long answer, word by word, '.repeat(100), pace: 15 });
  const { json } = await post('/api/agent/runs', turn(p, 'prose'));
  let pieces = 0;
  const events = await hear(json.run.id, {
    onEvent: async (e) => {
      if (e.type === 'text' && ++pieces === 12) await post(`/api/agent/runs/${json.run.id}/stop`);
    }
  });
  const [result] = of(events, 'result');
  assert.equal(result.incomplete, 'stopped');
  assert.deepEqual(result.steps, []);
  assert.match(result.reply, /^Here is the start of a long answer/);
  assert.equal(result.reply, of(events, 'text').map((t) => t.text).join(''));
  assert.ok(result.reply.length < 2000, 'cut short, not the whole answer');
  // a new request (not Continue) on the same run: the stopped words are the assistant's turn before it
  requests.length = 0;
  const next = await post('/api/agent/runs', turn(p, 'prose', { prompt: 'And now?' }));
  assert.equal(next.status, 200, next.json.error);
  const more = await hear(json.run.id, { after: events.at(-1).id });
  assert.equal(of(more, 'result')[0].reply, 'Going on.');
  const messages = requests.at(-1).payload.messages;
  assert.deepEqual(messages.slice(-2).map((m) => m.role), ['assistant', 'user']);
  assert.equal(messages.at(-2).content, result.reply);
  // stopped before a word: no empty message for the provider to refuse, and an empty reply
  scripts.mute = [{ say: 'never heard', wait: 2000 }];
  const quiet = await createProject({ name: 'Stop before words' });
  const started = await post('/api/agent/runs', turn(quiet, 'mute'));
  setTimeout(() => void post(`/api/agent/runs/${started.json.run.id}/stop`), 200);
  const silent = of(await hear(started.json.run.id), 'result')[0];
  assert.deepEqual([silent.incomplete, silent.reply], ['stopped', '']);
  assert.ok(getRun(started.json.run.id).conversation.messages.every((m) => m.content !== ''));
});

test('Stop ends a compile that is running, and every call of the step still gets an answer', { skip: !(await findExecutable('pdflatex')) && 'Needs TeX.' }, async () => {
  const p = await createProject({ name: 'Stop a tool' });
  // a document TeX never finishes
  await write(path.join(p.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\n\\loop\\iftrue\\repeat\n\\end{document}\n');
  scripts.hang = [{ calls: [['read_file', { path: 'main.tex' }], ['compile', { engine: 'pdflatex' }], ['read_file', { path: 'main.tex' }]] }, { say: 'never reached' }];
  const { json } = await post('/api/agent/runs', turn(p, 'hang'));
  let at = 0;
  const events = await hear(json.run.id, {
    onEvent: async (e) => {
      if (e.type === 'step' && e.data.tool === 'compile' && e.data.status === 'started') {
        await sleep(400);
        at = Date.now();
        await post(`/api/agent/runs/${json.run.id}/stop`);
      }
    }
  });
  assert.ok(Date.now() - at < 1500, `ended ${Date.now() - at} ms after Stop`);
  const { steps, incomplete } = of(events, 'result')[0];
  assert.equal(incomplete, 'stopped');
  assert.deepEqual(steps.map((s) => [s.tool, s.ok]), [['read_file', true], ['compile', false], ['read_file', false]]);
  assert.match(steps[1].show.text, /Stopped by the user/);
  // the conversation is whole: an answer for each call, so Continue can go on from it
  assert.equal(getRun(json.run.id).conversation.messages.filter((m) => m.role === 'tool').length, 3);
});

test('a message steered into a turn is read between its steps, and one that comes too late is handed back', async () => {
  const p = await createProject({ name: 'Steer' });
  await write(path.join(p.path, 'main.tex'), 'text\n');
  scripts.steer = (payload) => {
    const said = payload.messages.filter((m) => m.role === 'user').map((m) => m.content);
    const results = payload.messages.filter((m) => m.role === 'tool').length;
    if (said.some((text) => text === 'Keep the passive voice')) return { say: 'Keeping the passive voice.' };
    return results < 3 ? { calls: [['read_file', { path: 'main.tex' }]], wait: 60 } : { say: 'Done without being told anything.' };
  };
  requests.length = 0;
  const { json } = await post('/api/agent/runs', turn(p, 'steer'));
  assert.equal((await post(`/api/agent/runs/${json.run.id}/steer`, { text: ' ' })).status, 400);
  let sent = false;
  const events = await hear(json.run.id, {
    onEvent: async (e) => {
      if (e.type === 'step' && e.data.status === 'done' && !sent) {
        sent = true;
        assert.equal((await post(`/api/agent/runs/${json.run.id}/steer`, { text: 'Keep the passive voice' })).status, 200);
      }
    }
  });
  assert.deepEqual(of(events, 'user').map((u) => [u.text, !!u.steered]), [['go', false], ['Keep the passive voice', true]]);
  const [result] = of(events, 'result');
  assert.equal(result.reply, 'Keeping the passive voice.');
  assert.ok(result.steps.length < 3, 'it did not go on as if nothing was said');
  assert.deepEqual(result.says.filter((s) => s.user), [{ before: result.steps.length, text: 'Keep the passive voice', user: true }]);
  // after the turn there is nothing to steer: the page sends it as the next request
  const late = await post(`/api/agent/runs/${json.run.id}/steer`, { text: 'Too late' });
  assert.equal(late.status, 409);
});

test('a busy provider’s waits are heard, and a turn that still fails keeps its steps and can be continued on the same messages', async () => {
  const p = await createProject({ name: 'Fails' });
  await write(path.join(p.path, 'main.tex'), 'as it was\n');
  let failing = true;
  scripts.failmid = (payload, step) => {
    if (step === 0) return { calls: [['read_file', { path: 'main.tex' }]] };
    if (step === 1) return { calls: [['propose_patch', { path: 'main.tex', content: 'work done before the failure\n' }]] };
    return failing ? { status: 529 } : { say: 'And now the answer.' };
  };
  requests.length = 0;
  const { json } = await post('/api/agent/runs', turn(p, 'failmid'));
  const events = await hear(json.run.id);
  assert.deepEqual(of(events, 'retry'), [{ attempt: 2, of: 3, waitMs: 0, streamed: false }, { attempt: 3, of: 3, waitMs: 0, streamed: false }]);
  const [result] = of(events, 'result');
  assert.equal(result.incomplete, 'failed');
  assert.match(result.reply, /HTTP 529\): Overloaded\. Spectrum tried 3 times\./);
  assert.deepEqual(result.steps.map((s) => s.tool), ['read_file', 'propose_patch']);
  assert.equal(events.at(-1).data.status, 'failed');
  failing = false;
  const before = requests.length;
  await post(`/api/agent/runs/${json.run.id}/continue`, { llmConfig: llmConfig('failmid'), drafts: result.patches.map((x) => ({ path: x.path, original: x.original, proposed: x.content })) });
  const more = await hear(json.run.id, { after: events.at(-1).id });
  assert.equal(of(more, 'result')[0].reply, 'And now the answer.');
  assert.equal(requests.length, before + 1, 'only the request that failed is sent again');
  assert.equal(JSON.stringify(requests.at(-1).payload.messages), JSON.stringify(requests.at(-2).payload.messages));
  assert.deepEqual(of(more, 'result')[0].patches, [], 'the open proposal is still the thread’s, not proposed twice');
});

test('edit_file replaces exact text, tolerant of spaces at line ends, and says where to look when it cannot', () => {
  const text = 'alpha  \nbeta\ngamma\nbeta\n';
  assert.deepEqual(replaceExact(text, 'gamma', 'GAMMA'), { text: 'alpha  \nbeta\nGAMMA\nbeta\n', line: 3, count: 1 });
  // the model left out the spaces at the end of a line, or added some
  assert.equal(replaceExact(text, 'alpha\nbeta', 'A\nB').text, 'A\nB\ngamma\nbeta\n');
  assert.equal(replaceExact('one\ntwo\n', 'one   \ntwo', '1\n2').text, '1\n2\n');
  assert.equal(replaceExact('one\r\ntwo\r\n', 'one\ntwo', '1\n2').text, '1\r\n2\r\n', 'Windows line endings are kept');
  assert.throws(() => replaceExact(text, 'beta', 'B', false, 'main.tex'), /is in main\.tex 2 times \(lines 2, 4\).*all: true/s);
  assert.equal(replaceExact(text, 'beta', 'B', true).text, 'alpha  \nB\ngamma\nB\n');
  assert.throws(() => replaceExact('The quick brown fox\njumps over the lazy dog\n', 'The quick red fox', 'x', false, 'main.tex'), /not found in main\.tex, so nothing was changed\. The nearest lines are:\n1: The quick brown fox\n2: jumps over/);
  assert.throws(() => replaceExact(text, '', 'x'), /propose_patch/);
  assert.throws(() => replaceExact(text, 'beta', 'beta'), /the same/);
  assert.equal(replaceExact('cost is $5 (a+b)\n', '$5 (a+b)', '$6').text, 'cost is $6\n', 'no character of old is a pattern');
});

test('delete_file proposes a deletion, read_file takes a line and a limit, and a tool’s long answer is cut with a note', async () => {
  const p = await createProject({ name: 'Delete' });
  await write(path.join(p.path, 'paper', 'main.tex'), Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n'));
  await write(path.join(p.path, 'paper', 'old.tex'), 'no longer used\n');
  for (let i = 0; i < 1300; i += 1) await write(path.join(p.path, 'notes', `${'n'.repeat(60)}${i}.txt`), '');
  scripts.delete = [
    { calls: [['delete_file', { path: 'paper/old.tex' }], ['propose_patch', { path: 'paper/new.tex', content: 'new\n' }], ['delete_file', { path: 'paper/missing.tex' }]] },
    { calls: [['read_file', { path: 'paper/old.tex' }], ['list_files', { dir: 'paper' }], ['read_file', { path: 'paper/main.tex', line: 10, limit: 15 }], ['read_file', { path: 'paper/main.tex', offset: '4' }], ['list_files', { dir: 'notes' }], ['delete_file', { path: 'paper/new.tex' }]] },
    { say: 'Deleted.' }
  ];
  requests.length = 0;
  const { json } = await post('/api/agent/run', { ...turn(p, 'delete'), mode: 'tools', task: 'custom' });
  assert.equal(json.ok, true, json.reply);
  const out = toolResults(requests.at(-1).payload);
  assert.match(out[0], /Deletion of paper\/old\.tex prepared/);
  assert.match(out[2], /^Error: There is no file paper\/missing\.tex/);
  assert.equal(out[3], 'Error: paper/old.tex is deleted in your proposals.');
  assert.deepEqual(JSON.parse(out[4]).files.sort(), ['main.tex', 'new.tex'], 'as proposed: without the deleted file, with the new one');
  assert.match(out[5], /^line 10\nline 11\n\[Characters 63 to 78 of 390\. Read on with read_file \{ path, offset: 78 \}/);
  assert.match(out[6], /^ 1\nline 2\n/, 'a number sent as text is taken');
  assert.match(out[7], /\[The answer was \d+ characters: the first 64000 are shown/);
  assert.ok(out[7].length < 64200);
  assert.deepEqual(json.changes.map((c) => [c.path, c.kind, c.afterHash, c.proposed]), [['paper/old.tex', 'deleted', null, '']], 'the file it proposed and took back is no change');
  assert.deepEqual(json.patches.map((x) => [x.path, x.deleted, x.original]), [['paper/old.tex', true, 'no longer used\n']]);
  assert.equal(await fs.readFile(path.join(p.path, 'paper', 'old.tex'), 'utf8'), 'no longer used\n', 'nothing is deleted');
  // without a job: no stream is asked for, and the run's own folder in the cache is gone when it ends
  assert.equal('stream' in requests[0].payload, false);
  assert.deepEqual(await fs.readdir(path.join(process.env.SPECTRUM_DATA_DIR, 'cache', p.id, 'agent-run')).catch(() => []), []);
});

test('compile builds the proposals on a copy of the project: a Typst error is at its line, the fix builds, and Fix with AI ends with a build', async (t) => {
  if (!builtInTypst() && !(await findExecutable('typst'))) return t.skip('no Typst here');
  const p = await createProject({ name: 'Compile Typst' });
  await write(path.join(p.path, 'main.typ'), '= One\n\nSome text.\n');
  await write(path.join(p.path, '.env'), 'KEY=secret\n');
  scripts.typst = [
    { calls: [['compile', {}]] },
    { calls: [['edit_file', { path: 'main.typ', old: 'Some text.', new: 'Some #nosuchfunction() text.' }]] },
    { calls: [['compile', {}], ['get_log', {}]] },
    { calls: [['edit_file', { path: 'main.typ', old: '#nosuchfunction() ', new: '' }], ['search_text', { query: 'secret' }], ['project_map', {}]] },
    { calls: [['compile', {}]] },
    { say: 'Builds.' }
  ];
  requests.length = 0;
  const { json } = await post('/api/agent/runs', turn(p, 'typst'));
  const events = await hear(json.run.id);
  const out = toolResults(requests.at(-1).payload).map((text) => { try { return JSON.parse(text); } catch { return text; } });
  assert.equal(out[0].ok, true, JSON.stringify(out[0]));
  assert.equal(out[0].mainFile, 'main.typ');
  assert.equal(out[2].ok, false);
  assert.match(out[2].errors[0], /^main\.typ:3:\d+: error: unknown variable: nosuchfunction/);
  assert.match(out[3].errors[0], /^main\.typ:3:/, 'get_log has the same');
  assert.deepEqual(out[5].matches, [], 'the copy holds nothing an agent may not read');
  assert.equal(out[6].mainFile, 'main.typ');
  assert.equal(out[7].ok, true);
  const compiles = of(events, 'step').filter((s) => s.tool === 'compile' && s.status !== 'started');
  assert.deepEqual(compiles.map((s) => s.status), ['done', 'done', 'done']);
  assert.match(compiles[1].show.text, /^1 error\nmain\.typ:3:/);
  assert.equal(compiles[2].show.text, 'builds');
  assert.equal(await fs.readFile(path.join(p.path, 'main.typ'), 'utf8'), '= One\n\nSome text.\n');
  const work = path.join(getRun(json.run.id).stateDir, 'work');
  assert.deepEqual((await fs.readdir(work)).sort(), ['main.typ']);
  assert.deepEqual((await fs.readdir(p.path)).filter((name) => !name.startsWith('.')).sort(), ['main.typ'], 'no build file in the project');

  // Fix with AI: one run that changes the file, then says whether it builds
  scripts.fix = [{ calls: [['edit_file', { path: 'main.typ', old: 'Some text.', new: 'Some #stillwrong() text.' }]] }, { say: 'Fixed, I think.' }];
  const broken = await post('/api/agent/run', { ...turn(p, 'fix'), mode: 'tools', task: 'debug_compile', verify: true });
  assert.equal(broken.json.build.ok, false);
  assert.match(broken.json.build.errors[0], /^main\.typ:3:\d+: error: unknown variable: stillwrong/);
  assert.equal(broken.json.steps.at(-1).tool, 'compile');
  scripts.fix[0] = { calls: [['edit_file', { path: 'main.typ', old: 'Some text.', new: 'Some better text.' }], ['compile', {}]] };
  const built = await post('/api/agent/run', { ...turn(p, 'fix'), mode: 'tools', task: 'debug_compile', verify: true });
  assert.deepEqual(built.json.build, { ok: true, errors: [] });
  assert.equal(built.json.steps.filter((s) => s.tool === 'compile').length, 1, 'the agent’s own compile of the same proposals is not run twice');
  scripts.fix = [{ say: 'Nothing to fix.' }];
  assert.equal('build' in (await post('/api/agent/run', { ...turn(p, 'fix'), mode: 'tools', task: 'debug_compile', verify: true })).json, false, 'nothing changed, nothing compiled');
});

test('compile builds a LaTeX proposal on the copy, with the error at its line', { skip: !(await findExecutable('pdflatex')) && 'Needs TeX.' }, async () => {
  const p = await createProject({ name: 'Compile LaTeX' });
  await write(path.join(p.path, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n');
  scripts.latex = [
    { calls: [['edit_file', { path: 'main.tex', old: 'Hello.', new: 'Hello \\nosuchcommand.' }]] },
    { calls: [['compile', { engine: 'pdflatex' }]] },
    { calls: [['edit_file', { path: 'main.tex', old: ' \\nosuchcommand', new: '' }]] },
    { calls: [['compile', { engine: 'pdflatex' }]] },
    { say: 'Builds.' }
  ];
  requests.length = 0;
  const { json } = await post('/api/agent/run', { ...turn(p, 'latex'), mode: 'tools', task: 'custom' });
  assert.equal(json.ok, true, json.reply);
  const out = toolResults(requests.at(-1).payload);
  assert.equal(JSON.parse(out[1]).ok, false);
  assert.match(JSON.parse(out[1]).errors[0], /main\.tex:3: Undefined control sequence/);
  assert.equal(JSON.parse(out[3]).ok, true, out[3]);
  assert.deepEqual((await fs.readdir(p.path)).filter((name) => !name.startsWith('.')), ['main.tex']);
});

test('OpenRouter’s reported cost of each step is summed over the turn, and a turn with a step that reported none has none', async () => {
  const p = await createProject({ name: 'Cost' });
  await write(path.join(p.path, 'main.tex'), 'text\n');
  // OpenRouter's address, answered by the scripted model: nothing leaves this computer
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => realFetch(String(url).replace('https://openrouter.ai/api/v1', base), init);
  try {
    const openrouter = (model, threadId) => ({ ...turn(p, model), threadId, llmConfig: { endpoint: 'https://openrouter.ai/api/v1/chat/completions', apiKey: 'test', model } });
    scripts['priced/model'] = [{ calls: [['read_file', { path: 'main.tex' }]], cost: 0.25 }, { say: 'Read it.', cost: 0.125 }];
    let { run } = (await post('/api/agent/runs', openrouter('priced/model', 'cost-1'))).json;
    let events = await hear(run.id);
    assert.deepEqual(of(events, 'usage').map((u) => [u.cost, u.total.cost]), [[0.25, 0.25], [0.125, 0.375]]);
    assert.equal(of(events, 'result')[0].usage.cost, 0.375);
    assert.equal(of(events, 'result')[0].usage.model, 'priced/model');
    scripts['half/model'] = [{ calls: [['read_file', { path: 'main.tex' }]], cost: 0.25 }, { say: 'Read it.' }];
    ({ run } = (await post('/api/agent/runs', openrouter('half/model', 'cost-2'))).json);
    events = await hear(run.id);
    assert.equal(of(events, 'usage')[1].total.cost, undefined, 'a part reported is no turn’s cost');
    assert.equal('cost' in of(events, 'result')[0].usage, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
