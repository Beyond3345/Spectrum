// What the agents can look at: pictures the user sends with a message, a page of the document (view_pdf_page) and a
// figure on its own (preview_figure), drawn by the built-in Typst and sent only to a model that reads images; a model
// that does not is told so, and so is the user. In-process, against a scripted model on this computer, and throwaway
// projects. No network. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-agent-pictures-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_SKILLS_SEED_DIR: path.join(tmp, 'seed')
});
const write = async (file, text) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };

const { default: Fastify } = await import('fastify');
const { registerAgentRoutes } = await import('../src/routes/agent.js');
const { createProject } = await import('../src/services/projectService.js');
const { shutdownRuns } = await import('../src/services/agentRunService.js');
const { checkedImages, TOOL_PICTURES } = await import('../src/services/agentService.js');
const { readsImages } = await import('../src/services/llmService.js');
const { pdfPagePng } = await import('../src/services/typstService.js');
const { builtInTypst } = await import('../src/services/engineService.js');
const typst = !!builtInTypst();
const app = Fastify();
app.setErrorHandler(async (err, req, reply) => reply.code(err.statusCode || 500).send({ ok: false, error: err.message }));
registerAgentRoutes(app);

// The scripted model, as in agent-plan.test.js: its step is the number of assistant turns since the user's last word,
// where the message that brings the tools' pictures is not the user's word
const requests = [];
const scripts = {};
let mock;
let base;
let origin;
const pictures = (m) => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.text?.startsWith(TOOL_PICTURES);
before(async () => {
  mock = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      const lastUser = payload.messages.findLastIndex((m) => m.role === 'user' && !pictures(m));
      const step = payload.messages.slice(lastUser + 1).filter((m) => m.role === 'assistant').length;
      const script = scripts[payload.model] || [];
      const reply = script[Math.min(step, script.length - 1)] || { say: 'done' };
      const toolCalls = (reply.calls || []).map(([name, args], i) => ({ index: i, id: `c${requests.length}-${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (reply.say) send({ choices: [{ index: 0, delta: { content: reply.say } }] });
      if (toolCalls.length) send({ choices: [{ index: 0, delta: { tool_calls: toolCalls } }] });
      send({ choices: [{ index: 0, delta: {}, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }] });
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

/** A turn, heard to its end: its events and result. */
async function run(body) {
  const started = await app.inject({ url: '/api/agent/runs', method: 'POST', payload: body });
  assert.equal(started.statusCode, 200, started.body);
  const { id, lastEventId } = started.json().run;
  const stop = new AbortController();
  const res = await fetch(`${origin}/api/agent/runs/${id}/events?after=${lastEventId - 2}`, { signal: stop.signal });
  const events = [];
  let buffer = '';
  try {
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString();
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const line = buffer.slice(0, end).split('\n').find((l) => l.startsWith('data: '));
        buffer = buffer.slice(end + 2);
        if (!line) continue;
        events.push(JSON.parse(line.slice(6)));
        if (events.at(-1).type === 'state' && !['running', 'stopping'].includes(events.at(-1).data.status)) {
          stop.abort();
          break;
        }
      }
    }
  } catch (err) {
    if (!stop.signal.aborted) throw err;
  }
  return { events, result: events.find((e) => e.type === 'result').data };
}
let threads = 0;
const turn = (p, model, more = {}) => ({ projectId: p.id, threadId: `pictures-${(threads += 1)}`, prompt: 'look', llmConfig: { endpoint: base, apiKey: 'test', model }, ...more });
const imagesOf = (message) => (Array.isArray(message.content) ? message.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url) : []);
// a 1 by 1 PNG
const DOT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SEES = 'claude-sonnet-5-5';
const BLIND = 'some-text-model';

test('a model reads images as its preset says, a preset model’s name on another server too, and nothing else', async () => {
  assert.equal(await readsImages({ endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-opus-5-5' }), true);
  assert.equal(await readsImages({ endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-pro' }), false);
  assert.equal(await readsImages({ endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' }), true);
  assert.equal(await readsImages({ endpoint: 'https://api.z.ai/api/paas/v4/chat/completions', model: 'glm-5.3' }), false);
  // a server with no preset: a proxy serving a model Spectrum knows, and one it does not
  assert.equal(await readsImages({ endpoint: 'http://127.0.0.1:4000/v1', model: SEES }), true);
  assert.equal(await readsImages({ endpoint: 'http://127.0.0.1:4000/v1', model: BLIND }), false);
});

test('the pictures a message brings are checked', () => {
  assert.deepEqual(checkedImages(undefined), []);
  assert.deepEqual(checkedImages([{ type: 'image/png', data: DOT, name: 'dot.png', extra: 1 }]), [{ type: 'image/png', data: DOT, name: 'dot.png' }]);
  assert.throws(() => checkedImages([{ type: 'image/svg+xml', data: DOT }]), /PNG, JPEG, WebP or GIF/);
  assert.throws(() => checkedImages([{ type: 'image/png', data: 'not base64!' }]), /PNG, JPEG/);
  assert.throws(() => checkedImages(Array(5).fill({ type: 'image/png', data: DOT })), /Up to 4 pictures/);
  assert.throws(() => checkedImages({ type: 'image/png', data: DOT }), /Up to 4/);
});

test('the user’s pictures go with the request to a model that reads them; one that does not is told, and so is the user', async () => {
  const p = await createProject({ name: 'Attached' });
  await write(path.join(p.path, 'main.tex'), 'one\n');
  scripts[SEES] = [{ say: 'I see it.' }];
  scripts[BLIND] = [{ say: 'I cannot see it.' }];
  requests.length = 0;
  const seen = await run(turn(p, SEES, { images: [{ type: 'image/png', data: DOT }] }));
  assert.equal(seen.result.ok, true);
  const request = requests[0].messages.at(-1);
  assert.equal(request.content[0].type, 'text');
  assert.match(request.content[0].text, /User prompt: look/);
  assert.deepEqual(imagesOf(request), [`data:image/png;base64,${DOT}`]);
  assert.ok(!seen.events.some((e) => e.type === 'notice'));

  requests.length = 0;
  const blind = await run(turn(p, BLIND, { images: [{ type: 'image/png', data: DOT }, { type: 'image/png', data: DOT }] }));
  assert.equal(typeof requests[0].messages.at(-1).content, 'string', 'no picture goes to a model that does not read them');
  assert.match(requests[0].messages.at(-1).content, /The user attached 2 pictures, not sent: this model does not read images/);
  assert.deepEqual(blind.events.filter((e) => e.type === 'notice').map((e) => e.data.message), ['This model doesn’t read images, so the 2 pictures weren’t sent. Choose one that does in the model menu.']);

  const refused = await app.inject({ url: '/api/agent/runs', method: 'POST', payload: turn(p, SEES, { images: [{ type: 'text/html', data: DOT }] }) });
  assert.equal(refused.statusCode, 400);
});

test('a PDF page is drawn as a PNG by the built-in Typst, and a page that is not there says so', { skip: !typst && 'Needs the built-in Typst (src-tauri/binaries).' }, async () => {
  const dir = path.join(tmp, 'pages');
  await write(path.join(dir, 'doc.typ'), 'One\n#pagebreak()\nTwo\n');
  const { execFileSync } = await import('node:child_process');
  execFileSync(builtInTypst(), ['compile', path.join(dir, 'doc.typ'), path.join(dir, 'doc.pdf')]);
  const png = await pdfPagePng(path.join(dir, 'doc.pdf'), 2, 40);
  assert.equal(png.ok, true, png.error);
  assert.equal(png.data.subarray(1, 4).toString(), 'PNG');
  const missing = await pdfPagePng(path.join(dir, 'doc.pdf'), 9, 40);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /^There is no page 9 \(page 9 does not exist/);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['doc.pdf', 'doc.typ'], 'its working folder is gone');
});

test('view_pdf_page and preview_figure: the page and the figure go to a model that reads images, with a small one for the card; a blind model is told why not', { skip: !typst && 'Needs the built-in Typst (src-tauri/binaries).' }, async () => {
  const p = await createProject({ name: 'Looks' });
  await write(path.join(p.path, 'main.typ'), '= Title\nOne\n#pagebreak()\nTwo\n');
  await write(path.join(p.path, 'diagrams', 'box.typ'), '#set page(width: auto, height: auto, margin: 4pt)\n#rect[A box]\n');
  await write(path.join(p.path, 'diagrams', 'flow.mmd'), 'graph TD; A-->B\n');
  const script = [
    { calls: [['view_pdf_page', { page: 2 }], ['preview_figure', { file: 'diagrams/box.typ' }], ['preview_figure', { file: 'diagrams/flow.mmd' }], ['view_pdf_page', { page: 7 }]] },
    { say: 'Seen.' }
  ];
  scripts[SEES] = script;
  scripts[BLIND] = script;
  requests.length = 0;
  const seen = await run(turn(p, SEES, { activePath: 'main.typ' }));
  assert.equal(seen.result.ok, true, seen.result.reply);
  const [page, figure, mermaid, missing] = seen.result.steps;
  assert.deepEqual([page.ok, figure.ok, mermaid.ok, missing.ok], [true, true, false, false]);
  assert.equal(page.about, 'page 2');
  assert.equal(figure.about, 'diagrams/box.typ');
  assert.match(page.show.image, /^data:image\/png;base64,/);
  assert.match(figure.show.text, /^builds/);
  assert.match(mermaid.show.text, /Mermaid diagram \(\.mmd\) is drawn by the composer/);
  assert.match(missing.show.text, /There is no page 7/);
  const second = requests[1].messages;
  const tools = second.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.ok(!tools.some((t) => /base64|"image"/.test(t)), 'no picture goes as text');
  assert.equal(JSON.parse(tools[0].replace(/^<[^>]*>\n/, '').replace(/\n<\/untrusted>$/, '')).page, 2);
  // the two pictures after the tools' answers, in one message, each named
  const shown = second.at(-1);
  assert.ok(pictures(shown));
  assert.match(shown.content[0].text, /view_pdf_page: page 2 of main\.typ; preview_figure: diagrams\/box\.typ\. Look for labels that overlap/);
  assert.equal(imagesOf(shown).length, 2);
  assert.ok(imagesOf(shown).every((url) => url.startsWith('data:image/png;base64,iVBOR')));
  // a script that counts its steps from the user's last word took the pictures' message for none
  assert.equal(requests.length, 2);

  requests.length = 0;
  const blind = await run(turn(p, BLIND, { activePath: 'main.typ' }));
  assert.equal(blind.result.ok, true);
  const told = requests[1].messages.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(told[0], /This model does not read images, so the picture was not sent/);
  assert.ok(!requests[1].messages.some(pictures), 'no pictures for a model that does not read them');
  assert.match(blind.result.steps[0].show.image, /^data:image\/png/, 'the user still sees the page on the card');
});

test('the tools server sends a page as an image block after its words', { skip: !typst && 'Needs the built-in Typst (src-tauri/binaries).' }, async () => {
  const root = path.join(tmp, 'mcp-work');
  const state = path.join(tmp, 'home', 'spectrum-tools', 'pictures');
  await write(path.join(root, 'main.typ'), 'Hello\n');
  await write(path.join(state, 'context.json'), JSON.stringify({ mainFile: 'main.typ', engine: 'auto' }));
  const server = fileURLToPath(new URL('../src/mcp/server.js', import.meta.url));
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server, '--root', root, '--state', state], env: { HOME: path.join(tmp, 'home'), PATH: process.env.PATH }, stderr: 'pipe' }));
  try {
    const { content } = await client.callTool({ name: 'view_pdf_page', arguments: { page: 1 } });
    assert.deepEqual(content.map((c) => c.type), ['text', 'image']);
    assert.equal(content[1].mimeType, 'image/png');
    assert.doesNotMatch(content[0].text, /base64|thumb/);
    assert.match(content[0].text, /"page":1/);
  } finally { await client.close(); }
});

test('the conversation keeps the newest six pictures, the older ones a line saying they were there', { skip: !typst && 'Needs the built-in Typst (src-tauri/binaries).' }, async () => {
  const p = await createProject({ name: 'Many' });
  await write(path.join(p.path, 'main.typ'), 'One\n');
  scripts[SEES] = [{ calls: [['view_pdf_page', { page: 1 }], ['view_pdf_page', { page: 1 }], ['view_pdf_page', { page: 1 }]] }, { say: 'Seen.' }];
  requests.length = 0;
  await run(turn(p, SEES, { images: Array(4).fill({ type: 'image/png', data: DOT }) }));
  const all = requests[1].messages;
  assert.equal(all.flatMap(imagesOf).length, 6);
  const asked = all.findLast((m) => m.role === 'user' && !pictures(m));
  assert.deepEqual(asked.content.map((part) => part.type), ['text', 'text', 'image_url', 'image_url', 'image_url']);
  assert.equal(asked.content[1].text, '[A picture shown earlier, no longer sent.]');
});
