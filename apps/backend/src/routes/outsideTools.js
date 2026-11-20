// Spectrum's tools for an agent Spectrum did not start (Claude Code or Codex in a terminal, Cursor, another editor's
// agent): the tools server's tools on one project, over MCP's HTTP transport at /mcp. Off at every launch. The user
// turns it on for a project in the agent workspace, which makes a new secret for them to copy into that agent's
// configuration; turning it off, or quitting Spectrum, ends the secret. The secret opens /mcp alone, for that project
// alone: /api still answers only Spectrum's own windows (the launch's cookie, index.js), and the request hook keeps
// both to this computer.
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { APP_VERSION, PORT } from '../config/constants.js';
import { serveTools } from '../mcp/tools.js';
import { openTodos } from '../services/agentService.js';
import { PREVIEW_TEX_ENV, appCompile, compileChoices } from '../services/agentSessionService.js';
import { cachePath, getProjectRoot, readMeta } from '../services/projectService.js';
import { sameSecret } from '../utils/authUtils.js';
import { DATA_RULE } from '../utils/outsideText.js';

/**
 * What such an agent gets: the project's own tools. suggest_todo and load_skill are left out, as they need a session
 * Spectrum started (it shows the one's cards and copies the other's skills into the agent's home).
 */
export const OUTSIDE_TOOLS = ['compile', 'get_log', 'project_map', 'bib_entries', 'bib_search', 'search_text', 'literature_search', 'fetch_bibtex', 'list_todos'];

// project id → { token, compile }: in memory only, so a launch starts with none
const grants = new Map();

const status = (projectId) => {
  const grant = grants.get(projectId);
  return grant ? { on: true, url: `http://127.0.0.1:${PORT}/mcp`, token: grant.token } : { on: false };
};
const refuse = (reply, code, message) => reply.code(code).send({ jsonrpc: '2.0', error: { code: -32001, message }, id: null });

export function registerOutsideToolRoutes(fastify) {
  fastify.get('/api/projects/:id/outside-tools', async (req) => {
    await getProjectRoot(req.params.id);
    return { ok: true, ...status(req.params.id) };
  });

  // { on, compile? }: on makes a new secret, the old one stops working; compile is the app's Typst version and
  // Markdown engine, for a project that chose none
  fastify.post('/api/projects/:id/outside-tools', async (req) => {
    const { id } = req.params;
    await getProjectRoot(id);
    if (req.body?.on === true) grants.set(id, { token: crypto.randomBytes(32).toString('base64url'), compile: appCompile(req.body.compile) });
    else grants.delete(id);
    return { ok: true, ...status(id) };
  });

  // stateless: every request is a whole exchange, so there is no session to keep or stream to hold open
  fastify.post('/mcp', async (req, reply) => {
    // a browser's request is never an agent's, the app's own pages included
    if (req.headers.origin || req.headers['sec-fetch-site']) return refuse(reply, 403, 'Spectrum’s tools answer agents on this computer, not web pages.');
    const bearer = /^Bearer\s+(\S+)\s*$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
    const [projectId, grant] = (bearer && [...grants].find(([, g]) => sameSecret(bearer, g.token))) || [];
    if (!grant) return refuse(reply.header('WWW-Authenticate', 'Bearer'), 401, 'Turn on “Use from another agent” in Spectrum’s agent workspace and copy the configuration again: the secret changes each time, and ends when Spectrum quits.');
    const root = await getProjectRoot(projectId);
    // the build and the last log, in the project's cache, which a confined compile may read (compileSandbox.js)
    const state = await cachePath(root, 'outside-tools');
    await fs.mkdir(state, { recursive: true });
    await fs.writeFile(path.join(state, 'context.json'), JSON.stringify({ mainFile: (await readMeta(root).catch(() => ({}))).mainFile || null, ...(await compileChoices({ root, compile: grant.compile })) }));
    const ctx = {
      root: async () => root,
      state,
      opensFiles: true,
      todos: () => openTodos(root),
      // as the Spectrum agent's draft is compiled on Windows, which has no sandbox for a compile; on a Mac every
      // compile is confined unless the user trusts the project, and this one is never trusted
      ...(process.platform === 'win32' && { compileOptions: { untrusted: true, env: PREVIEW_TEX_ENV } })
    };
    const server = new McpServer({ name: 'spectrum', version: APP_VERSION }, { instructions: `Spectrum’s tools for the project in ${root}. A compile builds into Spectrum’s own folder and writes nothing into the project. ${DATA_RULE}` });
    serveTools(server, ctx, OUTSIDE_TOOLS);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  // nothing to stream or close in a stateless server
  for (const method of ['GET', 'DELETE']) fastify.route({ method, url: '/mcp', handler: async (req, reply) => reply.code(405).header('Allow', 'POST').send() });
}
