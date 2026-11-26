import { applyProxy, parseProxy, proxyText, saveTypedProxy, typedProxy } from '../services/networkProxy.js';
import { execFile, spawn } from 'child_process';
import path from 'path';
import { stat } from 'fs/promises';
import { realpath } from 'fs/promises';
import { DATA_DIR, PROJECTS_DIR } from '../config/constants.js';
import { findExecutable, texPath } from '../services/compileService.js';
import { resolvePythonExecutable } from '../services/plotService.js';
import { getProjectRoot } from '../services/projectService.js';
import { cloudRootOf, readMirror } from '../services/mirrorService.js';
import { safeJoin } from '../utils/pathUtils.js';
import { updateNotice } from '../services/updateService.js';

const TOOLS = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic', 'bibtex', 'biber', 'texcount'];

// The check's slow part is running programs to see that they work (Biber alone takes a second): each runs beside the
// others and never holds the server up, and one that worked isn't run again while its file is as it was. One that
// failed is tried each time, since the user may just have put it right.
const worked = new Map();
async function probed(file, args, again = false) {
  const about = await stat(file).catch(() => null);
  const key = JSON.stringify([file, args, about?.size, about?.mtimeMs]);
  if (!again && worked.has(key)) return worked.get(key);
  const result = await new Promise((resolve) => execFile(file, args, { timeout: 20_000, windowsHide: true }, (error, stdout, stderr) => resolve({
    ok: !error,
    // no such program (or one that never answered), as against one that ran and failed
    missing: error?.code === 'ENOENT' || !!error?.killed,
    stdout: String(stdout),
    stderr: String(stderr),
    message: error?.message
  })));
  if (result.ok) worked.set(key, result);
  else worked.delete(key);
  return result;
}

export function registerSystemRoutes(fastify) {
  // a newer Spectrum, asked of the release page at most once a day (updateService.js); the page asks only while the
  // user's setting is on
  fastify.get('/api/system/update', async () => ({ ok: true, ...(await updateNotice()) }));
  // the proxy Spectrum goes through: the one in use, where it came from, and the one typed here, masked
  const proxyView = async (found) => {
    const typed = parseProxy(await typedProxy());
    return { ok: true, supported: process.platform === 'darwin', proxy: found && { text: found.text, from: found.from, source: found.source }, typed: typed ? proxyText(typed) : '' };
  };
  fastify.get('/api/system/proxy', async () => proxyView(await applyProxy()));
  fastify.put('/api/system/proxy', async (req) => {
    await saveTypedProxy(req.body?.proxy);
    return proxyView(await applyProxy());
  });

  // What's installed on this machine, so the UI can explain a failing compile or plot.
  // texFolder: Settings › Engines › LaTeX's TeX folder, looked in first as a compile does
  // ?fresh=1 (Check again) runs every probe again
  fastify.get('/api/system/check', async (req) => {
    const searchPath = await texPath(req.query?.texFolder);
    const again = !!req.query?.fresh;
    const tools = {};
    for (const name of TOOLS) tools[name] = await findExecutable(name, searchPath);
    // where the TeX found really is (MacTeX's /Library/TeX/texbin links into /usr/local/texlive/2026), for Get started
    const tex = tools.pdflatex || tools.latexmk || tools.xelatex || tools.lualatex;
    const texReal = tex ? await realpath(tex).catch(() => tex) : null;
    const python = resolvePythonExecutable();
    const pythonFile = (path.isAbsolute(python) ? python : await findExecutable(python)) || python;
    // Being on PATH isn't enough: TeX Live 2026's universal biber unpacks itself with an
    // lipo call that macOS 27 rejects, so actually run the tools that are known to break.
    const problems = {};
    const [, , probe, ddgsProbe] = await Promise.all([
      ...['biber', 'tectonic'].map(async (name) => {
        if (!tools[name]) return;
        const run = await probed(tools[name], ['--version'], again);
        if (run.ok) return;
        const detail = `${run.stderr || run.stdout || run.message || ''}`.trim().split(/\r?\n/)[0];
        problems[name] = `Installed but not working${detail ? `: ${detail.slice(0, 160)}` : ''}`;
      }),
      probed(pythonFile, ['-c', 'import matplotlib'], again),
      // for the DDGS web search provider
      probed(pythonFile, ['-c', 'import ddgs'], again)
    ]);
    const ddgs = !probe.missing && ddgsProbe.ok;
    return {
      ok: true,
      dataDir: DATA_DIR,
      projectsDir: PROJECTS_DIR,
      tools,
      texReal,
      problems,
      python: { path: python, found: !probe.missing, matplotlib: probe.ok, ddgs },
      platform: process.platform
    };
  });

  // Show the project folder, or a file inside it, in Finder or File Explorer.
  fastify.post('/api/system/reveal', async (req) => {
    // cloud: the copy 1.10 mirrored the project into, for the move to 2.0's notice
    const mirror = req.body?.cloud ? await readMirror(req.body.projectId) : null;
    const root = mirror ? cloudRootOf(mirror) : await getProjectRoot(req.body?.projectId);
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
