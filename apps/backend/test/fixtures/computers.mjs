// The user's computers for the GitHub tests: each a server process of its own, with its own data folder (and its name
// in sync.json) and projects folder, all with one fake home folder and the stand-in GitHub.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A computer called name under tmp: { name, data, projects, server, api, stop }. */
export async function startComputer(name, { tmp, home, gh, env = {} }) {
  const data = path.join(tmp, `data-${name}`);
  const projects = path.join(tmp, `projects-${name}`);
  mkdirSync(data, { recursive: true });
  mkdirSync(projects, { recursive: true });
  if (!existsSync(path.join(data, 'sync.json'))) writeFileSync(path.join(data, 'sync.json'), JSON.stringify({ machineId: crypto.randomUUID(), machineName: name, folders: [], hidden: [] }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [path.join(here, '..', '..', 'src', 'index.js')], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PORT: String(port),
      SPECTRUM_HOST: '127.0.0.1',
      SPECTRUM_DATA_DIR: data,
      SPECTRUM_PROJECTS_DIR: projects,
      SPECTRUM_TEMPLATE_DIR: path.join(tmp, `templates-${name}`),
      SPECTRUM_GITHUB_API: gh.api,
      SPECTRUM_GITHUB_WEB: gh.web,
      // a backup this long after the last change, rather than a minute
      SPECTRUM_GITHUB_IDLE_MS: '1500',
      ...env
    },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const api = async (url, { method = 'GET', body } = {}) => {
    const res = await fetch(`${base}${url}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const stop = () => {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    return exited;
  };
  return { name, data, projects, server, api, stop };
}
