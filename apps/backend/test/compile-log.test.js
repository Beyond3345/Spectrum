// A compile's output as it comes, over GET /api/compile/:compileId/log, with a shell script standing in for a slow
// Tectonic. In-process, against throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-compile-log-')));
const fake = path.join(tmp, 'tectonic');
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: '',
  SPECTRUM_TECTONIC: fake
});
const { createProject } = await import('../src/services/projectService.js');
const { keptLogs } = await import('../src/services/compileLog.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { default: Fastify } = await import('fastify');

// fetch keeps its sockets open, which would hold close() for a minute
const app = Fastify({ forceCloseConnections: true });
registerCompileRoutes(app);
const base = await app.listen({ port: 0, host: '127.0.0.1' });
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

// The events of one stream as they come: events (so far) and ended (resolves with them all)
function listen(compileId) {
  const events = [];
  const controller = new AbortController();
  const ended = (async () => {
    const res = await fetch(`${base}/api/compile/${compileId}/log`, { signal: controller.signal });
    const decoder = new TextDecoder();
    let text = '';
    for await (const bytes of res.body) {
      text += decoder.decode(bytes, { stream: true });
      let at;
      while ((at = text.indexOf('\n\n')) >= 0) {
        const block = text.slice(0, at);
        text = text.slice(at + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        if (event) events.push({ event, data: JSON.parse(/^data: (.*)$/m.exec(block)[1]) });
      }
    }
    return events;
  })();
  return { events, ended };
}

const until = async (check) => {
  while (!check()) await new Promise((resolve) => setTimeout(resolve, 20));
};
const output = (events) => events.filter((e) => e.event === 'output').map((e) => e.data).join('');

test('a compile’s output streams as it comes, to a late listener too, and nothing is kept after', { skip: process.platform === 'win32' && 'a shell script stands in for Tectonic' }, async () => {
  await fs.writeFile(fake, [
    '#!/bin/sh',
    'echo "note: downloading a.tex" >&2',
    'sleep 0.3',
    'echo "note: downloading b.tex" >&2',
    'sleep 1',
    'echo "note: Running TeX ..." >&2',
    'exit 1',
    ''
  ].join('\n'), { mode: 0o755 });
  const p = await createProject({ name: 'Live log', populate: (root) => fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}Hi\\end{document}\n') });

  // opened before the compile starts, as the editor does
  const early = listen('live');
  await until(() => keptLogs().includes('live'));
  let done = false;
  const compile = fetch(`${base}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: p.id, engine: 'tectonic', compileId: 'live' })
  }).then((res) => res.json()).finally(() => { done = true; });

  await until(() => output(early.events).includes('downloading b.tex'));
  assert.equal(done, false, 'output came before the compile ended');
  assert.deepEqual(early.events[0], { event: 'engine', data: 'tectonic' });

  const late = listen('live');
  await until(() => late.events.length >= 2);
  assert.deepEqual(late.events[0], { event: 'engine', data: 'tectonic' });
  assert.match(late.events[1].data, /downloading a\.tex[\s\S]*downloading b\.tex/);

  const [res, earlyEvents, lateEvents] = await Promise.all([compile, early.ended, late.ended]);
  assert.equal(res.engine, 'tectonic');
  for (const events of [earlyEvents, lateEvents]) {
    assert.equal(events.at(-1).event, 'end');
    assert.match(output(events), /Running TeX/);
  }
  assert.deepEqual(keptLogs(), []);
});

test('a listener for a compile that never comes leaves nothing behind when it goes', async () => {
  const stream = listen('never');
  await until(() => keptLogs().includes('never'));
  stream.ended.catch(() => {});
  // the editor closes it when its compile request returns
  await fetch(`${base}/api/compile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(keptLogs().includes('never'));
  stream.ended.catch(() => {});
});
