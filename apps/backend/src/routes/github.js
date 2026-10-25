// GitHub: signing in (a pasted token, or the device code when Spectrum has an OAuth app), the GitHub view's
// repositories and Get from GitHub, and each project's GitHub tab (Initialise, Link, Back up, Pull, Sync) with the
// editor's calls when a project is opened and left. The token never leaves the backend.
import * as github from '../services/githubService.js';
import { syncPersonas, syncSettingsRepo } from '../services/settingsRepoService.js';

/** The handler, with the error's code in the answer (IN_SYNC_FOLDER, GITHUB_SIGN_IN…) for the window to act on. */
const coded = (handler) => async (req, reply) => {
  try {
    return await handler(req);
  } catch (err) {
    if (!err.code || !/^[A-Z_]+$/.test(err.code) || ['ENOENT', 'EACCES', 'EPERM'].includes(err.code)) throw err;
    // repo: the repository GITHUB_LINK_FIRST names, which the window links to
    return reply.code(err.statusCode || 500).send({ ok: false, error: err.message, code: err.code, ...(err.repo && { repo: err.repo }) });
  }
};

export function registerGitHubRoutes(fastify) {
  fastify.get('/api/github', async () => ({ ok: true, ...(await github.authStatus()) }));

  fastify.post('/api/github/token', async (req) => ({ ok: true, ...(await github.signInWithToken(req.body?.token)) }));

  fastify.delete('/api/github', async () => ({ ok: true, ...(await github.signOut()) }));

  fastify.put('/api/github/settings-repo', async (req) => ({ ok: true, ...(await github.setSettingsRepo(req.body?.on !== false)) }));

  fastify.post('/api/github/device', async () => ({ ok: true, ...(await github.startDeviceSignIn()) }));

  fastify.get('/api/github/device/:id', async (req) => ({ ok: true, ...github.deviceSignInState(req.params.id) }));

  fastify.delete('/api/github/device/:id', async (req) => {
    github.cancelDeviceSignIn(req.params.id);
    return { ok: true };
  });

  // the settings repository brought up to date (the window does this as it comes forward): { ready, first, error? }
  fastify.post('/api/github/settings/sync', async (req) => ({ ok: true, ...(await syncSettingsRepo({ force: req.body?.force === true })) }));

  // this computer's personas joined with the settings repository's, one file each: { personas, changed }
  fastify.post('/api/github/personas', async (req) => ({ ok: true, ...(await syncPersonas(req.body?.personas)) }));

  fastify.get('/api/github/repos', coded(async () => ({ ok: true, repos: await github.listRepoProjects() })));

  fastify.get('/api/github/problems', async () => ({ ok: true, problems: await github.problems() }));

  fastify.post('/api/github/clone', coded(async (req) => ({ ok: true, project: await github.getFromGitHub(req.body || {}) })));

  fastify.get('/api/projects/:id/github', async (req) => ({ ok: true, ...(await github.projectStatus(req.params.id)) }));

  fastify.post('/api/projects/:id/github/init', coded(async (req) => {
    await github.initialise(req.params.id);
    return { ok: true, ...(await github.projectStatus(req.params.id)) };
  }));

  fastify.post('/api/projects/:id/github/backup', coded(async (req) => ({ ok: true, ...(await github.backUp(req.params.id, { label: req.body?.label })) })));

  fastify.post('/api/projects/:id/github/pull', coded(async (req) => ({ ok: true, result: await github.pull(req.params.id, { allowDeletions: req.body?.allowDeletions === true }) })));

  fastify.post('/api/projects/:id/github/sync', coded(async (req) => ({ ok: true, result: await github.sync(req.params.id, { allowDeletions: req.body?.allowDeletions === true }) })));

  fastify.post('/api/projects/:id/github/link', coded(async (req) => {
    const { owner, repo, preview, allowDeletions } = req.body || {};
    return { ok: true, result: await github.link(req.params.id, { owner, repo, preview: preview === true, allowDeletions: allowDeletions === true }) };
  }));

  fastify.put('/api/projects/:id/github/personal', async (req) => {
    await github.setPersonal(req.params.id, req.body?.personal === true);
    return { ok: true };
  });

  // the editor opened the project, and left it (sent as the window closes too)
  fastify.post('/api/projects/:id/github/opened', async (req) => ({ ok: true, ...(await github.opened(req.params.id)) }));

  fastify.post('/api/projects/:id/github/left', async (req) => {
    await github.left(req.params.id);
    return { ok: true };
  });
}
