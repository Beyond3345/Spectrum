// A stand-in for GitHub for the GitHub tests, on 127.0.0.1: the REST calls Spectrum makes under /api (the signed-in
// user, creating and reading repositories, their collaborators and contents), the device sign-in under /login, and the
// repositories themselves over Git's smart HTTP, served from bare repositories in a scratch folder by git http-backend.
// One user, octo (id 7); the token is GOOD_TOKEN unless a test changes it.
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

/** Whether this computer has git http-backend, without which the tests that push and fetch are skipped. */
export const GOOD_TOKEN = 'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB';

export function hasGitHttpBackend() {
  try {
    execFileSync('git', ['--exec-path'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function startFakeGitHub(reposDir) {
  const state = {
    token: GOOD_TOKEN,
    user: { login: 'octo', id: 7, name: 'Octo Cat' },
    // owner/repo → { private, collaborators }
    repos: new Map(),
    requests: [],
    // the device sign-in: what the next access-token poll answers
    device: { pending: 1 },
    // offline: every connection dropped; hang: every request taken and never answered; gitError: the status
    // Git's requests get (GitHub having trouble)
    down: false,
    hang: false,
    gitError: 0,
    // a renamed repository's old name → its new one, which GitHub keeps answering for
    renamed: new Map()
  };
  let nextId = 100;
  const bare = (owner, repo) => path.join(reposDir, owner, `${repo}.git`);
  const create = (owner, repo, { private: priv = true, collaborators = 1 } = {}) => {
    const dir = bare(owner, repo);
    mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', dir]);
    execFileSync('git', ['config', 'http.receivepack', 'true'], { cwd: dir });
    state.repos.set(`${owner}/${repo}`, { private: priv, collaborators, id: nextId++ });
  };
  /** The repository renamed on GitHub: its bare repository moves, and the old name still answers. */
  const rename = (owner, from, to) => {
    renameSync(bare(owner, from), bare(owner, to));
    state.repos.set(`${owner}/${to}`, state.repos.get(`${owner}/${from}`));
    state.repos.delete(`${owner}/${from}`);
    state.renamed.set(`${owner}/${from}`, `${owner}/${to}`);
  };
  const named = (owner, repo) => (state.renamed.get(`${owner}/${repo}`) || `${owner}/${repo}`).split('/');
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const authorised = (req) => req.headers.authorization === `Bearer ${state.token}` || req.headers.authorization === `Basic ${Buffer.from(`x-access-token:${state.token}`).toString('base64')}`;

  const server = http.createServer(async (req, res) => {
    if (state.down) return req.socket.destroy();
    if (state.hang) return;
    const url = new URL(req.url, 'http://x');
    state.requests.push(`${req.method} ${url.pathname}`);
    const body = await readBody(req);
    // Git's smart HTTP for /<owner>/<repo>.git/…
    const gitPath = /^\/([^/]+)\/([^/]+)\.git(\/.*)$/.exec(url.pathname);
    if (gitPath) {
      const [owner, repo] = named(gitPath[1], gitPath[2]);
      const rest = gitPath[3];
      if (state.gitError) return send(res, state.gitError, { message: 'Server Error' });
      if (!state.repos.has(`${owner}/${repo}`)) return send(res, 404, { message: 'Not Found' });
      if (!authorised(req)) {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="GitHub"' });
        return res.end();
      }
      const child = spawn('git', ['http-backend'], {
        env: {
          ...process.env,
          GIT_PROJECT_ROOT: path.join(reposDir, owner),
          GIT_HTTP_EXPORT_ALL: '1',
          REQUEST_METHOD: req.method,
          PATH_INFO: `/${repo}.git${rest}`,
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: req.headers['content-type'] || '',
          CONTENT_LENGTH: String(body.length),
          REMOTE_USER: 'octo'
        }
      });
      child.stdin.end(body);
      const out = [];
      child.stdout.on('data', (c) => out.push(c));
      child.on('close', () => {
        const all = Buffer.concat(out);
        const split = all.indexOf('\r\n\r\n');
        const head = all.subarray(0, split).toString();
        const headers = {};
        let status = 200;
        for (const line of head.split('\r\n')) {
          const [k, ...v] = line.split(':');
          if (k.toLowerCase() === 'status') status = Number(v.join(':').trim().split(' ')[0]);
          else headers[k] = v.join(':').trim();
        }
        res.writeHead(status, headers);
        res.end(all.subarray(split + 4));
      });
      return;
    }
    if (url.pathname === '/login/device/code') return send(res, 200, { device_code: 'dev-1', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 });
    if (url.pathname === '/login/oauth/access_token') {
      if (state.device.pending > 0) {
        state.device.pending -= 1;
        return send(res, 200, { error: 'authorization_pending' });
      }
      return send(res, 200, { access_token: state.token, token_type: 'bearer', scope: 'repo,read:user' });
    }
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { message: 'Not Found' });
    if (!authorised(req)) return send(res, 401, { message: 'Bad credentials' });
    const route = url.pathname.slice(4);
    if (route === '/user') return send(res, 200, state.user);
    if (route === '/user/repos' && req.method === 'POST') {
      const { name, private: priv } = JSON.parse(body.toString() || '{}');
      if (state.repos.has(`octo/${name}`)) return send(res, 422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] });
      create('octo', name, { private: priv === true });
      return send(res, 201, { name, full_name: `octo/${name}`, owner: { login: 'octo' }, private: priv === true, default_branch: 'main' });
    }
    if (route === '/user/repos') {
      const repos = [...state.repos].map(([full, r]) => ({ id: r.id, name: full.split('/')[1], full_name: full, owner: { login: full.split('/')[0] }, private: r.private, pushed_at: '2026-10-25T00:00:00Z', default_branch: 'main' }));
      return send(res, 200, url.searchParams.get('page') > 1 ? [] : repos);
    }
    const repoRoute = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(route);
    if (repoRoute) {
      const [owner, repo] = named(repoRoute[1], repoRoute[2]);
      const rest = repoRoute[3] || '';
      const r = state.repos.get(`${owner}/${repo}`);
      if (!r) return send(res, 404, { message: 'Not Found' });
      if (!rest) return send(res, 200, { id: r.id, name: repo, full_name: `${owner}/${repo}`, owner: { login: owner }, private: r.private, default_branch: 'main', permissions: { admin: true, push: true } });
      if (rest === '/collaborators') return send(res, 200, Array.from({ length: r.collaborators }, (_, i) => ({ login: i ? `friend${i}` : 'octo' })));
      const contents = /^\/contents\/(.+)$/.exec(rest);
      if (contents) {
        try {
          const text = execFileSync('git', ['show', `main:${decodeURIComponent(contents[1])}`], { cwd: bare(owner, repo), stdio: ['ignore', 'pipe', 'ignore'] });
          return send(res, 200, { type: 'file', encoding: 'base64', content: text.toString('base64') });
        } catch {
          return send(res, 404, { message: 'Not Found' });
        }
      }
    }
    return send(res, 404, { message: 'Not Found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const web = `http://127.0.0.1:${port}`;
  return {
    state,
    web,
    api: `${web}/api`,
    create,
    rename,
    bare,
    /** the subject of main's newest commit */
    log: (owner, repo) => execFileSync('git', ['log', '-1', '--format=%s', 'main'], { cwd: bare(owner, repo) }).toString().trim(),
    /** a file on the repository's main branch, or null */
    show: (owner, repo, rel) => {
      try {
        return execFileSync('git', ['show', `main:${rel}`], { cwd: bare(owner, repo), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      } catch {
        return null;
      }
    },
    files: (owner, repo) => (existsSync(bare(owner, repo)) ? execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', 'main'], { cwd: bare(owner, repo), stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\0').filter(Boolean) : []),
    /** git fsck's complaints about the repository ('' when it's sound), and how many parents main's commit has */
    fsck: (owner, repo) => execFileSync('git', ['fsck', '--strict', '--no-progress'], { cwd: bare(owner, repo), stdio: ['ignore', 'pipe', 'pipe'] }).toString(),
    parents: (owner, repo) => execFileSync('git', ['log', '-1', '--format=%P', 'main'], { cwd: bare(owner, repo) }).toString().trim().split(' ').filter(Boolean).length,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
