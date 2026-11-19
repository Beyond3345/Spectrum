// AI autocomplete (/api/agent/run, task autocomplete): given up in the editor, its request closes and the model call
// stops with it. In-process, against a scripted model on this computer. No network. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-autocomplete-')));
Object.assign(process.env, {
  HOME: path.join(tmp, 'home'),
  USERPROFILE: path.join(tmp, 'home'),
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_LLM_ENDPOINT: '',
  SPECTRUM_LLM_API_KEY: ''
});

const { default: Fastify } = await import('fastify');
const { registerAgentRoutes } = await import('../src/routes/agent.js');
const app = Fastify();
registerAgentRoutes(app);

// the model holds every request until it is closed
let asked = 0;
let closed;
const model = createServer((req, res) => {
  asked += 1;
  req.resume();
  res.on('close', () => closed?.());
});
after(async () => {
  model.closeAllConnections();
  model.close();
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

test('closing an autocomplete request stops its model call', async () => {
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const stopped = new Promise((resolve) => (closed = resolve));
  const cancel = new AbortController();
  const out = fetch(`http://127.0.0.1:${app.server.address().port}/api/agent/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task: 'autocomplete',
      prompt: 'Continue.',
      content: 'We train<CURSOR>',
      mode: 'direct',
      activePath: 'main.tex',
      llmConfig: { endpoint: `http://127.0.0.1:${model.address().port}/v1`, apiKey: 'test', model: 'm' }
    }),
    signal: cancel.signal
  });
  while (!asked) await new Promise((r) => setTimeout(r, 20));
  cancel.abort();
  await assert.rejects(out, { name: 'AbortError' });
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 5000)).then(() => assert.fail('the model call carried on'))]);
});
