import { installPandoc, installTypst, listEngines, removeTypst } from '../services/engineService.js';

export function registerEngineRoutes(fastify) {
  fastify.get('/api/engines', async () => listEngines());

  fastify.post('/api/engines/typst/install', async (req) => {
    const { version } = req.body || {};
    await installTypst(version);
    return { ok: true, engines: await listEngines() };
  });

  fastify.delete('/api/engines/typst/:version', async (req) => {
    await removeTypst(req.params.version);
    return { ok: true, engines: await listEngines() };
  });

  fastify.post('/api/engines/pandoc/install', async () => {
    await installPandoc();
    return { ok: true, engines: await listEngines() };
  });
}
