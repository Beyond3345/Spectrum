import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDir } from './utils/fsUtils.js';
import { DATA_DIR, FRONTEND_DIST, HOST, PAGE_POLICY, PORT, PROJECTS_DIR, setProjectsDir } from './config/constants.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerKeyRoutes } from './services/keyStore.js';
import { registerArxivRoutes } from './routes/arxiv.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerVersionRoutes } from './routes/versions.js';
import { registerChatRoutes } from './routes/chats.js';
import { registerTodoRoutes } from './routes/todos.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerCompileRoutes } from './routes/compile.js';
import { registerDiagramRoutes } from './routes/diagram.js';
import { registerLLMRoutes } from './routes/llm.js';
import { registerVisionRoutes } from './routes/vision.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerAgentSessionRoutes } from './routes/agentSessions.js';
import { registerSkillRoutes } from './routes/skills.js';
import { registerOutsideToolRoutes } from './routes/outsideTools.js';
import { registerMcpServerRoutes } from './routes/mcpServers.js';
import { stopServers } from './services/mcpServers.js';
import { shutdownAgents } from './services/agentSessionService.js';
import { clearStaleRuns, shutdownRuns } from './services/agentRunService.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerConvertRoutes } from './routes/convert.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerResearchRoutes } from './routes/research.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerReferenceRoutes } from './routes/references.js';
import { registerLanguageRoutes } from './routes/language.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerPresenceRoutes } from './routes/presence.js';
import { registerTexlabRoutes } from './routes/texlab.js';
import { registerStreamRoutes } from './routes/stream.js';
import { stopTexlab } from './services/texlabService.js';
import { registerTinymistRoutes } from './routes/tinymist.js';
import { stopTinymist } from './services/tinymistService.js';
import { stopLanguageTool } from './services/languageToolService.js';
import { registerReviewRoutes } from './routes/review.js';
import { registerGitHubRoutes } from './routes/github.js';
import { commitWaiting, resumeBackups, startRetries } from './services/githubService.js';
import { startSettingsRepo } from './services/settingsRepoService.js';
import { registerZoteroRoutes } from './routes/zotero.js';
import { registerEngineRoutes } from './routes/engines.js';
import { registerUniverseRoutes } from './routes/universe.js';
import { registerJyutpingRoutes } from './routes/jyutping.js';
import { registerMarkdownRoutes } from './routes/markdown.js';
import { seedTemplates, syncTemplates } from './services/templateService.js';
import { dropOldAuxFolders, migrateLegacyProjects } from './services/projectService.js';
import { migrateToV2 } from './services/mirrorService.js';
import { killAllChildren } from './services/compileService.js';
import { warmUpTectonic } from './services/tectonicWarmUp.js';
import { applyProxy } from './services/networkProxy.js';
import { offlineMessage, placeOf } from './services/syncService.js';
import { hasSession, isLocalRequest, openSession, readSessionSecret } from './utils/authUtils.js';

const fastify = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

await fastify.register(multipart, {
  // keep the folder in an upload's file name (images/cat.png); without it busboy cuts it down to cat.png
  preservePath: true,
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

// The desktop app's secret for this launch ('' in dev, npm start and the tests): see the request hook below
const SESSION_SECRET = await readSessionSecret().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

// Single-user, local-only: nothing off this machine (or relayed through a proxy) may use the
// server. Every request is checked, however its path is spelt: the router decodes '/%61pi/…'
// to an /api route. Browsers mark requests another site makes (<img>, links, forms) as
// cross-site, and those of a page on another port of this computer as same-site, which no API
// route accepts, since those carry no Origin header to check. In the desktop app the API also answers only its own
// windows, which carry the launch's secret in a cookie: not another program or another account on this computer.
fastify.addHook('onRequest', async (req, reply) => {
  const api = req.routeOptions?.url?.startsWith('/api');
  const crossSiteApi = api && ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
  if (crossSiteApi || !isLocalRequest(req)) {
    return reply.code(403).send({ ok: false, error: 'Spectrum only accepts requests from this computer.' });
  }
  if (SESSION_SECRET && api && !hasSession(req, SESSION_SECRET)) {
    return reply.code(403).send({ ok: false, code: 'session', error: 'Spectrum only answers its own windows. If this is Spectrum’s window, quit Spectrum and open it again.' });
  }
});
// where the shell points a window first; never logged, since the address holds the secret
if (SESSION_SECRET) fastify.get('/session', { logLevel: 'silent' }, (req, reply) => openSession(req, reply, SESSION_SECRET));

fastify.addHook('onSend', async (req, reply) => {
  if (String(reply.getHeader('content-type')).startsWith('text/html') && !reply.hasHeader('content-security-policy')) {
    reply.header(process.env.SPECTRUM_CSP_REPORT_ONLY === '1' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', PAGE_POLICY);
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

// first, so its hook hands every route the keys its request names
registerKeyRoutes(fastify);
registerHealthRoutes(fastify);
registerArxivRoutes(fastify);
registerProjectRoutes(fastify);
registerVersionRoutes(fastify);
registerChatRoutes(fastify);
registerTodoRoutes(fastify);
registerNoteRoutes(fastify);
registerCompileRoutes(fastify);
registerDiagramRoutes(fastify);
registerLLMRoutes(fastify);
registerVisionRoutes(fastify);
registerAgentRoutes(fastify);
registerAgentSessionRoutes(fastify);
registerSkillRoutes(fastify);
registerOutsideToolRoutes(fastify);
registerMcpServerRoutes(fastify);
registerTransferRoutes(fastify);
registerConvertRoutes(fastify);
registerSearchRoutes(fastify);
registerResearchRoutes(fastify);
registerSystemRoutes(fastify);
registerReferenceRoutes(fastify);
registerLanguageRoutes(fastify);
registerSyncRoutes(fastify);
registerPresenceRoutes(fastify);
registerTexlabRoutes(fastify);
registerStreamRoutes(fastify);
registerTinymistRoutes(fastify);
registerReviewRoutes(fastify);
registerGitHubRoutes(fastify);
registerZoteroRoutes(fastify);
registerEngineRoutes(fastify);
registerUniverseRoutes(fastify);
registerJyutpingRoutes(fastify);
registerMarkdownRoutes(fastify);

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
// Documents may be in OneDrive (its folder backup) or iCloud Drive, where GitHub can't keep projects: new ones go in
// the home folder's Spectrum then, and those already in the old one are offered Move to this computer
if (await placeOf(PROJECTS_DIR).catch(() => null)) setProjectsDir(path.join(os.homedir(), 'Spectrum'));
await seedTemplates();
// the shared folder may be slow to answer, so the server doesn't wait for it
syncTemplates().catch((err) => fastify.log.error(err));
await migrateLegacyProjects();
await dropOldAuxFolders();
// once: what became of the cloud projects 1.10 synced, for the projects page; their copies may be slow to look through
migrateToV2().catch((err) => fastify.log.error(err));
// linked projects: what an earlier quit only committed goes to GitHub, and what waits for the connection is retried
resumeBackups().catch((err) => fastify.log.error(err));
startRetries();
// the settings repository, pulled now, then pushed after each change
startSettingsRepo();

// Stop compiles, TexLab, Tinymist and LanguageTool (they run in their own process groups, so nothing else would), let
// in-flight requests such as a file save finish for up to 2 s, then exit.
let quitting = false;
async function quit() {
  if (quitting) return;
  quitting = true;
  // the backups still waiting are committed, and pushed at the next start
  await Promise.race([commitWaiting(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  shutdownRuns();
  stopServers();
  await shutdownAgents();
  await stopTexlab();
  await stopTinymist();
  await stopLanguageTool();
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

// the Spectrum agent's run folders a crash left in the cache, gone before a new run can make one
await clearStaleRuns().catch((err) => fastify.log.error(err));

await fastify.listen({ port: PORT, host: HOST });
// the built-in Tectonic's packages for the templates, in the background (not in the tests' servers)
// the proxy first (networkProxy.js), so the warm-up's downloads and every later request go through it
const proxyReady = applyProxy().catch((err) => fastify.log.error(err));
if (!process.env.NODE_TEST_CONTEXT) proxyReady.then(() => warmUpTectonic()).catch((err) => fastify.log.error(err));

console.log('');
console.log(`  Spectrum started at http://localhost:${PORT}`);
console.log('');
