import { addServer, checkServer, listServers, refusedHosts, removeServer, setServerNetwork, setServerOn, setServerVariables } from '../services/mcpServers.js';

// Settings › Agents › MCP servers. Under /api, so only Spectrum's own windows add, check or switch on a server: never
// an agent or an MCP server, which never reach Spectrum's port, nor a project.
export function registerMcpServerRoutes(fastify) {
  fastify.get('/api/mcp-servers', async () => ({ servers: (await listServers()).map((s) => ({ name: s.name, command: s.command, args: s.args, on: s.on, checked: !!s.tools, hosts: s.hosts, anyHost: !!s.anyHost, refused: refusedHosts(s), env: s.env, envWhy: s.envWhy || '', ports: s.ports })) }));
  fastify.post('/api/mcp-servers', async (req) => {
    await addServer(req.body || {});
    return { ok: true };
  });
  fastify.delete('/api/mcp-servers/:name', async (req) => {
    await removeServer(req.params.name);
    return { ok: true };
  });
  fastify.post('/api/mcp-servers/:name/check', async (req) => ({ tools: await checkServer(req.params.name) }));
  // { on }, where it may connect: { hosts?, anyHost?, ports? }, or its variables: { env: { NAME: value or null } }. A
  // variable's value is never sent back.
  fastify.put('/api/mcp-servers/:name', async (req) => {
    const { on, hosts, anyHost, ports, env } = req.body || {};
    if (env !== undefined) await setServerVariables(req.params.name, env);
    if (hosts !== undefined || anyHost !== undefined || ports !== undefined) await setServerNetwork(req.params.name, { hosts, anyHost, ports });
    if (on !== undefined || [hosts, anyHost, ports, env].every((v) => v === undefined)) await setServerOn(req.params.name, on === true);
    return { ok: true };
  });
}
