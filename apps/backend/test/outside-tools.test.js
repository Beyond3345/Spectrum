// Spectrum's tools for an agent it did not start: /mcp answers only while the user has the project's switch on, only
// with that switch's secret, never a browser, and the secret opens nothing under /api. A real server process with a
// launch secret, the MCP SDK's own HTTP client, throwaway folders.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const hasTeX = (() => { try { execFileSync('kpsewhich', ['article.cls'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-outside-')));
let child;
after(() => {
  child?.kill();
  rmSync(tmp, { recursive: true, force: true });
});

const secret = crypto.randomBytes(32).toString('hex');
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
const cookie = `spectrum_session_${port}=${secret}`;
const call = (url, { method = 'GET', headers = {}, body } = {}) => fetch(base + url, { method, headers: { ...(body && { 'content-type': 'application/json' }), ...headers }, body: body && JSON.stringify(body) });
const api = async (url, opts = {}) => (await call(url, { ...opts, headers: { cookie, ...opts.headers } })).json();

async function start() {
  for (const sub of ['home', 'data', 'projects', 'templates', 'dist']) mkdirSync(path.join(tmp, sub), { recursive: true });
  writeFileSync(path.join(tmp, 'dist', 'index.html'), '<!doctype html><title>Spectrum</title>');
  const { SPECTRUM_SESSION_STDIN: _stdin, ...env } = process.env;
  child = spawn(process.execPath, [path.join(here, '..', 'src', 'index.js')], {
    env: { ...env, HOME: path.join(tmp, 'home'), USERPROFILE: path.join(tmp, 'home'), PORT: String(port), SPECTRUM_HOST: '127.0.0.1', SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'), SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'), SPECTRUM_TEMPLATE_SEED_DIR: '', SPECTRUM_FRONTEND_DIST: path.join(tmp, 'dist'), SPECTRUM_SESSION_SECRET: secret },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  for (let i = 0; i < 150; i += 1) {
    if ((await call('/').catch(() => null))?.status === 200) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('The server did not start.');
}

/** An MCP client with this secret, connected; or the error connecting threw. */
async function connect(token) {
  const client = new Client({ name: 'outside-agent', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const mcpStatus = async (headers) => (await call('/mcp', { method: 'POST', headers: { accept: 'application/json, text/event-stream', ...headers }, body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } })).status;

test('an outside agent reaches one project’s tools only while its switch is on, with its secret', async () => {
  await start();
  const project = await api('/api/projects', { method: 'POST', body: { name: 'Outside' } });
  const put = (file, content) => api(`/api/projects/${project.id}/file`, { method: 'PUT', body: { path: file, content } });
  await put('main.tex', '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\\label{sec:intro}\n\\input{.claude/notes}\n\\end{document}\n');
  await put('.claude/notes.tex', '\\section{KEY-CANARY-1}\n');
  await put('.env', 'KEY=KEY-CANARY-2\n');

  // off at launch: no secret works, and the switch is read only by Spectrum's own windows
  assert.equal(await mcpStatus({ authorization: `Bearer ${crypto.randomBytes(32).toString('base64url')}` }), 401);
  assert.equal((await call(`/api/projects/${project.id}/outside-tools`)).status, 403);
  assert.deepEqual(await api(`/api/projects/${project.id}/outside-tools`), { ok: true, on: false });

  const on = await api(`/api/projects/${project.id}/outside-tools`, { method: 'POST', body: { on: true } });
  assert.equal(on.on, true);
  assert.equal(on.url, `${base}/mcp`);
  assert.ok(on.token.length >= 43);

  const client = await connect(on.token);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['bib_entries', 'bib_search', 'check_references', 'compile', 'fetch_bibtex', 'get_log', 'list_todos', 'literature_search', 'preview_figure', 'project_map', 'search_text', 'view_pdf_page']);
  assert.equal(tools.find((t) => t.name === 'project_map').annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === 'compile').annotations.readOnlyHint, false);
  // the answers are marked as material, and come from the project
  const map = (await client.callTool({ name: 'project_map', arguments: {} })).content[0].text;
  assert.match(map, /^<untrusted source="project_map">/);
  assert.match(map, /"title":"Intro"/);
  // the same path rules as the tools server's: no hidden or secret file, whether named or reached through the document
  assert.doesNotMatch(map, /CANARY/);
  assert.match((await client.callTool({ name: 'search_text', arguments: { query: 'CANARY' } })).content[0].text, /"matches":\[\]/);
  assert.match((await client.callTool({ name: 'compile', arguments: { main: '.env' } })).content[0].text, /not available to the agent/);
  assert.match((await client.callTool({ name: 'compile', arguments: { main: '../../outside.tex' } })).content[0].text, /Invalid path/);
  // a compile builds where a confined compile may read its own .aux back (the project's cache), and says where the PDF is
  if (hasTeX) assert.match((await client.callTool({ name: 'compile', arguments: {} })).content[0].text, /"ok":true.*"pdf":"[^"]*cache[^"]*main\.pdf"/);
  await client.close();

  // the secret opens /mcp alone: /api still needs the launch's cookie
  assert.equal((await call('/api/projects', { headers: { authorization: `Bearer ${on.token}` } })).status, 403);
  // never a web page's request, the app's own included, nor a near miss of the secret
  assert.equal(await mcpStatus({ authorization: `Bearer ${on.token}`, origin: base }), 403);
  assert.equal(await mcpStatus({ authorization: `Bearer ${on.token}`, 'sec-fetch-site': 'same-origin' }), 403);
  assert.equal(await mcpStatus({ authorization: `Bearer ${on.token.slice(0, -1)}` }), 401);
  assert.equal(await mcpStatus({ cookie }), 401);
  assert.equal((await call('/mcp', { headers: { authorization: `Bearer ${on.token}` } })).status, 405);

  // turned on again, the secret is new and the old one is done; turned off, none works
  const again = await api(`/api/projects/${project.id}/outside-tools`, { method: 'POST', body: { on: true } });
  assert.notEqual(again.token, on.token);
  assert.equal(await mcpStatus({ authorization: `Bearer ${on.token}` }), 401);
  assert.equal(await mcpStatus({ authorization: `Bearer ${again.token}` }), 200);
  assert.deepEqual(await api(`/api/projects/${project.id}/outside-tools`, { method: 'POST', body: { on: false } }), { ok: true, on: false });
  assert.equal(await mcpStatus({ authorization: `Bearer ${again.token}` }), 401);
});
