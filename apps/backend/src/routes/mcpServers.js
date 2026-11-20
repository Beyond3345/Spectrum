import { addServer, checkServer, listServers, removeServer, setServerOn } from '../services/mcpServers.js';

// Settings › Agents › MCP servers. Under /api, so only Spectrum's own windows add, check or switch on a server: never
// an agent, which reaches no local address, nor a project.
export function registerMcpServerRoutes(fastify) {
  fastify.get('/api/mcp-servers', async () => ({ servers: (await listServers()).map(({ name, command, args, on, tools }) => ({ name, command, args, on, checked: !!tools })) }));
  fastify.post('/api/mcp-servers', async (req) => {
    await addServer(req.body || {});
    return { ok: true };
  });
  fastify.delete('/api/mcp-servers/:name', async (req) => {
    await removeServer(req.params.name);
    return { ok: true };
  });
  fastify.post('/api/mcp-servers/:name/check', async (req) => ({ tools: await checkServer(req.params.name) }));
  fastify.put('/api/mcp-servers/:name', async (req) => {
    await setServerOn(req.params.name, req.body?.on === true);
    return { ok: true };
  });
}
