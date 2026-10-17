import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { ensureDir } from './utils/fsUtils.js';
import { DATA_DIR, FRONTEND_DIST, HOST, PORT } from './config/constants.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerArxivRoutes } from './routes/arxiv.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerVersionRoutes } from './routes/versions.js';
import { registerChatRoutes } from './routes/chats.js';
import { registerCompileRoutes } from './routes/compile.js';
import { registerLLMRoutes } from './routes/llm.js';
import { registerVisionRoutes } from './routes/vision.js';
import { registerPlotRoutes } from './routes/plot.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerReferenceRoutes } from './routes/references.js';
import { registerLanguageRoutes } from './routes/language.js';
import { registerSyncRoutes } from './routes/sync.js';
import { seedTemplates } from './services/templateService.js';
import { dropOldAuxFolders, migrateLegacyProjects } from './services/projectService.js';
import { killAllChildren } from './services/compileService.js';
import { offlineMessage } from './services/syncService.js';
import { isLocalRequest } from './utils/authUtils.js';

const fastify = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

await fastify.register(multipart, {
  // keep the folder in an upload's file name (images/cat.png); without it busboy cuts it down to cat.png
  preservePath: true,
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

// Single-user, local-only: nothing off this machine (or relayed through a proxy) may use the
// server. Every request is checked, however its path is spelt: the router decodes '/%61pi/…'
// to an /api route. Browsers mark requests another site makes (<img>, links, forms) as
// cross-site, which no API route accepts, since those carry no Origin header to check.
fastify.addHook('onRequest', async (req, reply) => {
  const crossSiteApi = req.routeOptions?.url?.startsWith('/api') && req.headers['sec-fetch-site'] === 'cross-site';
  if (crossSiteApi || !isLocalRequest(req)) {
    return reply.code(403).send({ ok: false, error: 'Spectrum only accepts requests from this computer.' });
  }
});

fastify.setErrorHandler(async (err, req, reply) => {
  let status = err.statusCode || 500;
  let message = err.message;
  // ponytail: only errors that reach here; a route that catches its own (compile, transfer) shows the raw one
  const offline = await offlineMessage(err).catch(() => null);
  if (offline) {
    status = 503;
    message = offline;
  } else if (err.code === 'ENOENT') {
    status = 404;
    message = 'File not found.';
  }
  if (status >= 500) req.log.error(err);
  return reply.code(status).send({ ok: false, error: message });
});

registerHealthRoutes(fastify);
registerArxivRoutes(fastify);
registerProjectRoutes(fastify);
registerVersionRoutes(fastify);
registerChatRoutes(fastify);
registerCompileRoutes(fastify);
registerLLMRoutes(fastify);
registerVisionRoutes(fastify);
registerPlotRoutes(fastify);
registerAgentRoutes(fastify);
registerTransferRoutes(fastify);
registerSearchRoutes(fastify);
registerSystemRoutes(fastify);
registerReferenceRoutes(fastify);
registerLanguageRoutes(fastify);
registerSyncRoutes(fastify);

// Serve the built frontend (production and desktop modes)
if (existsSync(FRONTEND_DIST)) {
  await fastify.register(fastifyStatic, {
    root: FRONTEND_DIST,
    prefix: '/',
    // look files up per request, so a rebuilt frontend's new asset names work without a restart
    wildcard: true
  });

  // SPA fallback: serve index.html for non-API routes
  fastify.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      reply.code(404).send({ ok: false, error: 'Not found.' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

await ensureDir(DATA_DIR);
await seedTemplates();
await migrateLegacyProjects();
await dropOldAuxFolders();

// Stop compiles and plots (they run in their own process groups, so nothing else would), let
// in-flight requests such as a file save finish for up to 2 s, then exit.
let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  killAllChildren();
  await Promise.race([fastify.close(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  killAllChildren(); // a compile's next pass may have started meanwhile
  process.exit(0);
}
process.on('SIGTERM', quit);
process.on('SIGINT', quit);

// The desktop shell keeps our stdin open; when it goes away (even on a crash) we follow.
if (process.env.SPECTRUM_EXIT_WITH_STDIN === '1') {
  process.stdin.on('end', quit);
  process.stdin.on('error', quit);
  process.stdin.resume();
}

await fastify.listen({ port: PORT, host: HOST });

console.log('');
console.log(`  Spectrum started at http://localhost:${PORT}`);
console.log('');
