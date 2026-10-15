import { spawn, spawnSync } from 'child_process';
import { DATA_DIR, PROJECTS_DIR } from '../config/constants.js';
import { findExecutable } from '../services/compileService.js';
import { resolvePythonExecutable } from '../services/plotService.js';
import { getProjectRoot } from '../services/projectService.js';
import { safeJoin } from '../utils/pathUtils.js';

const TOOLS = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic', 'bibtex', 'biber', 'texcount'];

export function registerSystemRoutes(fastify) {
  // What's installed on this machine, so the UI can explain a failing compile or plot.
  fastify.get('/api/system/check', async () => {
    const tools = {};
    for (const name of TOOLS) tools[name] = await findExecutable(name);
    // Being on PATH isn't enough: TeX Live 2026's universal biber unpacks itself with an
    // lipo call that macOS 27 rejects, so actually run the tools that are known to break.
    const problems = {};
    for (const name of ['biber', 'tectonic']) {
      if (!tools[name]) continue;
      const run = spawnSync(tools[name], ['--version'], { timeout: 20_000, encoding: 'utf8', windowsHide: true });
      if (run.error || run.status !== 0) {
        const detail = `${run.stderr || run.stdout || run.error?.message || ''}`.trim().split(/\r?\n/)[0];
        problems[name] = `Installed but not working${detail ? `: ${detail.slice(0, 160)}` : ''}`;
      }
    }
    const python = resolvePythonExecutable();
    const probe = spawnSync(python, ['-c', 'import matplotlib'], { timeout: 20_000, windowsHide: true });
    return {
      ok: true,
      dataDir: DATA_DIR,
      projectsDir: PROJECTS_DIR,
      tools,
      problems,
      python: { path: python, found: !probe.error, matplotlib: probe.status === 0 },
      platform: process.platform
    };
  });

  // Show the project folder, or a file inside it, in Finder or File Explorer.
  fastify.post('/api/system/reveal', async (req) => {
    const root = await getProjectRoot(req.body?.projectId);
    const target = req.body?.path ? safeJoin(root, String(req.body.path)) : root;
    // explorer reads its own command line and wants /select,"path" as is (Windows paths can't hold a
    // double quote); it exits with 1 even when it worked, which nothing here waits for
    const opener = {
      darwin: ['open', ['-R', target]],
      win32: ['explorer.exe', [`/select,"${target}"`], { windowsVerbatimArguments: true }]
    }[process.platform] || ['xdg-open', [root]];
    spawn(opener[0], opener[1], { detached: true, stdio: 'ignore', ...opener[2] }).unref();
    return { ok: true, path: target };
  });
}
