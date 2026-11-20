import { addServer, checkServer, listServers, refusedHosts, removeServer, setServerNetwork, setServerOn } from '../services/mcpServers.js';

// Settings › Agents › MCP servers. Under /api, so only Spectrum's own windows add, check or switch on a server: never
// an agent, which reaches no local address, nor a project.
export function registerMcpServerRoutes(fastify) {
  fastify.get('/api/mcp-servers', async () => ({ servers: (await listServers()).map((s) => ({ name: s.name, command: s.command, args: s.args, on: s.on, checked: !!s.tools, hosts: s.hosts, anyHost: !!s.anyHost, refused: refusedHosts(s) })) }));
  fastify.post('/api/mcp-servers', async (req) => {
    await addServer(req.body || {});
    return { ok: true };
  });
  fastify.delete('/api/mcp-servers/:name', async (req) => {
    await removeServer(req.params.name);
    return { ok: true };
  });
  fastify.post('/api/mcp-servers/:name/check', async (req) => ({ tools: await checkServer(req.params.name) }));
  // { on }, or where it may connect: { hosts?, anyHost? }
  fastify.put('/api/mcp-servers/:name', async (req) => {
    const { on, hosts, anyHost } = req.body || {};
    if (hosts !== undefined || anyHost !== undefined) await setServerNetwork(req.params.name, { hosts, anyHost });
    if (on !== undefined || (hosts === undefined && anyHost === undefined)) await setServerOn(req.params.name, on === true);
    return { ok: true };
  });
}
