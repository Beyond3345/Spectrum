import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { promises as fs, constants as fsConstants } from 'fs';
import { spawn } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import { ensureDir, listFilesRecursive, renameOver } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { withoutComments } from '../utils/texUtils.js';
import { cachePath, getProjectRoot } from './projectService.js';
import { keepSynctex } from './synctex.js';

const ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
export const SUPPORTED_ENGINES = ['auto', ...ENGINES];

// Engines that need multiple passes + bibtex for citations
const MULTI_PASS_ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
// Tectonic downloads its TeX bundle on first use (over 3 minutes for the ACL template on a
// fresh machine) and latexmk runs every pass inside one process, so they get longer limits.
const PASS_TIMEOUT_MS = { tectonic: 15 * 60 * 1000, latexmk: 10 * 60 * 1000 };
const DEFAULT_PASS_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_LOG_BYTES = 200_000;
// pdfLaTeX can't load these; Auto then retries with XeLaTeX or LuaLaTeX.
const NEEDS_UNICODE_ENGINE = /fontspec Error|unicode-math Error|requires either XeTeX or|must use XeTeX/i;
// \externaldocument and \externalcitedocument (xr, xr-hyper), \zexternaldocument (zref-xr):
// optional *, [options], then {name}
const EXTERNAL_DOCUMENT = /\\(?:z?externaldocument|externalcitedocument)\*?\s*(?:\[[^\]]*\]\s*)*\{([^}]+)\}/g;

// Each document's .aux from its last good compile, e.g. <cache>/aux-files/chapters/thesis.tex/thesis.aux,
// for other documents' \externaldocument to read.
// not aux: AUX is a device name on Windows, which Explorer and OneDrive can't handle as a folder
// ponytail: 1.7.0 kept them in .spectrum/aux-files, which is left in place for it to go on reading if the user
// goes back to it (stale, so its first compile there redoes linked documents); remove it once that's moot
const auxStore = (cache, doc) => path.join(cache, 'aux-files', doc);
// TeX reads '\' as a command, and every engine on Windows takes '/' as well
const slashed = (p) => p.split(path.sep).join('/');
const docPath = (root, abs) => slashed(path.relative(root, abs));
const WINDOWS = process.platform === 'win32';

// Every engine writes <main>.synctex.gz too, for jumping between the source and the PDF.
function buildCommand(engine, outDir, mainFile) {
  switch (engine) {
    case 'pdflatex':
    case 'xelatex':
    case 'lualatex':
      return { cmd: engine, args: ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', `-output-directory=${outDir}`, mainFile] };
    case 'latexmk':
      return { cmd: 'latexmk', args: ['-pdf', '-interaction=nonstopmode', '-file-line-error', '-synctex=1', `-outdir=${outDir}`, mainFile] };
    case 'tectonic':
      // Tectonic keeps its .aux in memory unless told otherwise, and only finds other
      // documents' .aux in outDir when it's on the search path. ponytail: it looks beside the source first, so
      // an old notes.aux another editor left there wins over the kept one; warn about such a file if that bites
      return { cmd: 'tectonic', args: ['-Z', `search-path=${outDir}`, '--synctex', '--keep-intermediates', '--outdir', outDir, mainFile] };
    default:
      return null;
  }
}

/** First match for `name` on PATH, or null. */
export async function findExecutable(name) {
  // Windows tries each extension it can run, in cmd.exe's order; there X_OK only means the file exists
  const names = WINDOWS && !/\.(com|exe|bat|cmd)$/i.test(name) ? ['.com', '.exe', '.bat', '.cmd'].map((ext) => name + ext) : [name];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    // Windows allows an entry in quotes, as cmd.exe and libuv read it
    for (const candidate of names.map((n) => path.join(WINDOWS ? dir.replace(/^"(.*)"$/, '$1') : dir, n))) {
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

/**
 * "Auto": honour a `% !TEX program = xelatex` magic comment, otherwise use XeLaTeX for
 * documents that need Unicode fonts and pdfLaTeX for everything else, falling back to
 * whatever engine is actually installed.
 */
async function autoEngineCandidates(absMain) {
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  const magic = tex.match(/%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)/i)?.[1]?.toLowerCase();
  const needsUnicode = /\\usepackage(\[[^\]]*\])?\{(fontspec|xeCJK|ctex|unicode-math|polyglossia)\}|\\documentclass(\[[^\]]*\])?\{ctex/.test(tex);
  const preferred = [magic, needsUnicode ? 'xelatex' : 'pdflatex', needsUnicode ? 'lualatex' : 'xelatex', 'lualatex', 'tectonic', 'latexmk'];
  const ordered = [...new Set(preferred.filter((engine) => ENGINES.includes(engine)))];
  const installed = [];
  for (const engine of ordered) {
    if (await findExecutable(engine)) installed.push(engine);
  }
  return installed;
}

// Every running runSpawn child, so quitting can stop them rather than leave them orphaned.
const children = new Set();
// The compile each child belongs to (a project's), so Stop ends that compile and nothing else
const jobs = new AsyncLocalStorage();
const running = new Map();
const stopped = () => jobs.getStore()?.stopped === true;

// Stops asked for before their compile had started (the editor saves first), kept for a minute
const stoppedEarly = new Set();

/** Stops a compile, by the id the editor gave it: the TeX, BibTeX or biber run going now and what it started. */
export function stopCompile(compileId) {
  const job = running.get(compileId);
  if (!job) {
    stoppedEarly.add(compileId);
    setTimeout(() => stoppedEarly.delete(compileId), 60_000).unref();
    return false;
  }
  job.stopped = true;
  for (const child of job.children) killGroup(child);
  return true;
}

function killGroup(child) {
  if (WINDOWS) {
    // no process groups: taskkill walks the tree down from the child, so only while it still runs.
    // ponytail: what a child leaves running after exiting on its own carries on; a Job Object would catch it
    if (child.exitCode === null && child.signalCode === null) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
    }
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // nothing left in the group
  }
}

export function killAllChildren() {
  for (const child of children) killGroup(child);
}

// cmd.exe reads its own command line: quote each argument, then caret-escape its specials, % too (cross-spawn's way)
const cmdEscape = (s) => s.replace(/[()\][%!^"`<>&|;, *?]/g, '^$&');

/**
 * Run one command in its own process group, so the time limit also stops what it started
 * (latexmk's pdflatex would otherwise keep running and hold the output pipes open).
 * Resolves { code, timedOut }.
 */
export async function runSpawn(cmd, args, cwd, pushLog, env, limit = PASS_TIMEOUT_MS[cmd] || DEFAULT_PASS_TIMEOUT_MS) {
  let file = cmd;
  let options = { cwd, env: env || process.env, detached: true };
  if (WINDOWS) {
    // Windows would look in cwd (the project) before PATH
    file = path.isAbsolute(cmd) ? cmd : await findExecutable(cmd);
    if (!file) throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' });
    // detached gives it no console, so every program it runs would open a console window of its own
    options = { ...options, detached: false, windowsHide: true };
    if (/\.(bat|cmd)$/i.test(file)) {
      // ponytail: a batch file that turns on delayed expansion still expands !name! in its arguments
      args = ['/d', '/s', '/c', `"${[cmdEscape(file), ...args.map((a) => cmdEscape(`"${a}"`))].join(' ')}"`];
      file = process.env.ComSpec || 'cmd.exe';
      options.windowsVerbatimArguments = true;
    }
  }
  // a stopped compile starts nothing more
  if (stopped()) return { code: null, timedOut: false };
  const job = jobs.getStore();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    children.add(child);
    job?.children.add(child);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, limit);
    child.stdout.on('data', pushLog);
    child.stderr.on('data', pushLog);
    child.on('error', (err) => {
      clearTimeout(timer);
      children.delete(child);
      job?.children.delete(child);
      reject(err);
    });
    child.on('exit', () => {
      clearTimeout(timer);
      // leftovers would keep 'close' from ever firing; the pipes still drain into the log
      killGroup(child);
      children.delete(child);
      job?.children.delete(child);
      setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
      }, 2000).unref();
    });
    child.on('close', (code) => {
      if (timedOut) pushLog(Buffer.from(`\n[spectrum] ${cmd} was stopped after ${Math.round(limit / 1000)}s.\n`));
      resolve({ code, timedOut });
    });
  });
}

export async function runCompile({ projectId, mainFile, engine = 'pdflatex', compileId }) {
  if (!SUPPORTED_ENGINES.includes(engine)) {
    return { ok: false, error: `Unsupported engine: ${engine}` };
  }

  const projectRoot = await getProjectRoot(projectId);
  const absMain = safeJoin(projectRoot, mainFile);
  // a leading '-' would be read as an engine option (latexmk's can run any command)
  if (path.basename(absMain).startsWith('-')) {
    return { ok: false, error: 'The main file’s name can’t start with “-”.', engine };
  }
  try {
    await fs.access(absMain);
  } catch {
    return { ok: false, error: `The main file “${mainFile}” doesn’t exist.`, engine };
  }

  // only the editor's compiles can be stopped, each by its own id (another of the project's may be running too)
  const job = { stopped: stoppedEarly.delete(compileId), children: new Set() };
  if (compileId) running.set(compileId, job);
  try {
    return await jobs.run(job, () => compileWithLinks(engine, projectRoot, absMain, mainFile));
  } finally {
    if (compileId) running.delete(compileId);
  }
}

async function compileWithLinks(engine, projectRoot, absMain, mainFile) {
  // Documents it cross-references go first when their .aux is missing or old. One level only,
  // so two documents that reference each other don't loop.
  const linked = [];
  for (const target of await staleLinks(projectRoot, absMain)) {
    if (stopped()) break;
    const file = docPath(projectRoot, target);
    linked.push({ file, ok: (await compileDocument(engine, projectRoot, target, file)).ok });
  }
  const result = await compileDocument(engine, projectRoot, absMain, mainFile);
  if (!linked.length) return result;
  const notes = linked.map(({ file, ok }) => (ok
    ? `Compiled ${file} first for its cross-references.`
    : `[spectrum warning] ${file} didn’t compile, so references to it may show as ??.`));
  return { ...result, linked, log: [...notes, result.log ?? ''].join('\n') };
}

async function compileDocument(engine, projectRoot, absMain, mainFile) {
  if (engine !== 'auto') return { ...(await compileWith(engine, projectRoot, absMain, mainFile)), engine };
  const candidates = await autoEngineCandidates(absMain);
  if (!candidates.length) {
    return { ok: false, error: `No LaTeX engine found. Install ${WINDOWS ? 'MiKTeX' : 'MacTeX'}, TeX Live or Tectonic.`, engine };
  }
  const result = await compileWith(candidates[0], projectRoot, absMain, mainFile);
  // fontspec & co. may sit in an \input'd preamble or a local .sty, which the guess can't see
  const fallback = candidates.find((e) => e === 'xelatex' || e === 'lualatex');
  if (!result.ok && !result.stopped && candidates[0] === 'pdflatex' && fallback && NEEDS_UNICODE_ENGINE.test(result.log || '')) {
    return { ...(await compileWith(fallback, projectRoot, absMain, mainFile)), engine: fallback };
  }
  return { ...result, engine: candidates[0] };
}

/** The project's .tex files absMain \externaldocument's whose kept .aux is missing or older than the .tex. */
async function staleLinks(projectRoot, absMain) {
  const tex = withoutComments(await fs.readFile(absMain, 'utf8').catch(() => ''));
  const stale = [];
  for (const match of tex.matchAll(EXTERNAL_DOCUMENT)) {
    // xr adds .aux to the name, so the document is the name plus .tex
    const name = match[1].trim();
    const file = name.endsWith('.tex') ? name : `${name}.tex`;
    let target;
    try {
      target = safeJoin(projectRoot, path.resolve(path.dirname(absMain), file));
    } catch {
      continue; // outside the project
    }
    const source = await fs.stat(target).catch(() => null);
    if (!source?.isFile()) continue;
    // macOS finds {Notes} as notes.tex: go by the name on disk, so it's the same document (and store) as the file
    const onDisk = path.relative(await fs.realpath(projectRoot), await fs.realpath(target));
    if (onDisk.startsWith('..') || path.isAbsolute(onDisk)) continue; // a link out of the project
    target = path.join(projectRoot, onDisk);
    // a leading '-' would be read as an engine option
    if (target === absMain || stale.includes(target) || path.basename(target).startsWith('-')) continue;
    // ponytail: only the target's own .tex mtime counts, so edits only in its \input files don't
    // make it stale; compare its inputs too (inlineInputs walks them) if that bites
    const base = path.basename(target, path.extname(target));
    const aux = await fs.stat(path.join(auxStore(await cachePath(projectRoot), docPath(projectRoot, target)), `${base}.aux`)).catch(() => null);
    if (!aux || source.mtimeMs > aux.mtimeMs) stale.push(target);
  }
  return stale;
}

/**
 * Build in the temp folder's spectrum-build/<runId> (removed afterwards) and put the PDF next to the
 * main file, e.g. chapters/thesis.tex -> chapters/thesis.pdf, the only file a compile writes in the project:
 * a sync client would copy anything else to the other computer. Its .aux files and SyncTeX are kept in the cache.
 */
async function compileWith(engine, projectRoot, absMain, mainFile) {
  const buildRoot = path.join(os.tmpdir(), 'spectrum-build');
  const outDir = path.join(buildRoot, crypto.randomUUID());
  const cache = await cachePath(projectRoot);
  await ensureDir(outDir);
  // Like TeXShop, LaTeX Workshop and Tectonic, run from the main file's folder so
  // \input paths are relative to the main file. The project root stays on the search
  // paths, so paths written relative to the root keep working as well.
  const mainDir = path.dirname(absMain);
  const mainName = path.basename(absMain);
  const doc = docPath(projectRoot, absMain);
  const searchPath = (name) => [slashed(mainDir), slashed(projectRoot), process.env[name] ?? ''].join(path.delimiter);
  const texEnv = {
    ...process.env,
    TEXINPUTS: searchPath('TEXINPUTS'),
    BIBINPUTS: searchPath('BIBINPUTS'),
    BSTINPUTS: searchPath('BSTINPUTS')
  };
  // \include{chapters/x} writes chapters/x.aux into the output dir, so mirror the folders
  // as seen from the main file's folder and from the project root.
  // Other documents' kept .aux go in it too, where TeX looks first, for \externaldocument to find.
  const others = new Map(); // where each copy went, and its mtime then
  for (const item of await listFilesRecursive(projectRoot)) {
    if (item.type === 'dir') {
      await ensureDir(path.join(outDir, item.path));
      const fromMain = path.relative(mainDir, path.join(projectRoot, item.path));
      if (fromMain && !fromMain.startsWith('..')) await ensureDir(path.join(outDir, fromMain));
      continue;
    }
    // its own stay out, so every compile starts clean
    if (!/\.tex$/i.test(item.path) || item.path === doc) continue;
    // ponytail: a document in a parent folder (\externaldocument{../notes}) isn't reached; a per-run TEXINPUTS folder would reach it
    const at = path.relative(mainDir, path.join(projectRoot, path.dirname(item.path)));
    if (at.startsWith('..')) continue;
    const store = auxStore(cache, item.path);
    for (const aux of await listFilesRecursive(store).catch(() => [])) {
      if (aux.type !== 'file') continue;
      const rel = slashed(path.join(at, aux.path)); // as keepAux lists it
      const dest = path.join(outDir, rel);
      await ensureDir(path.dirname(dest));
      // two documents can leave an .aux of the same name (one's \include'd chapter, another's own): its own wins
      const own = aux.path === `${path.basename(item.path, path.extname(item.path))}.aux`;
      try {
        await fs.copyFile(path.join(store, aux.path), dest, own ? 0 : fsConstants.COPYFILE_EXCL);
      } catch {
        continue;
      }
      others.set(rel, (await fs.stat(dest)).mtimeMs);
    }
  }

  const logChunks = [];
  let logSize = 0;
  const pushLog = (chunk) => {
    if (!chunk || logSize >= MAX_LOG_BYTES) return;
    const next = chunk.toString().slice(0, MAX_LOG_BYTES - logSize);
    logSize += next.length;
    logChunks.push(next);
  };

  const { cmd, args } = buildCommand(engine, slashed(outDir), `./${mainName}`);
  if (engine === 'tectonic' && mainDir !== projectRoot) {
    // Tectonic ignores TEXINPUTS; its unstable search-path option does the same job
    args.unshift('-Z', `search-path=${slashed(projectRoot)}`);
  }
  // MiKTeX asks before installing a missing package, in a window the hidden engine never shows, so the
  // compile would sit until its time limit; this installs it without asking. ponytail: latexmk's own
  // engine runs still ask; pass -pdflatex="pdflatex --enable-installer %O %S" if that bites
  if (WINDOWS && MULTI_PASS_ENGINES.includes(engine) && /[\\/]miktex[\\/]/i.test((await findExecutable(cmd)) || '')) args.unshift('--enable-installer');
  const base = path.basename(mainFile, path.extname(mainFile));

  let pass;
  try {
    // Pass 1: generate .aux with \citation{} entries
    pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);

    if (MULTI_PASS_ENGINES.includes(engine) && !pass.timedOut && !stopped()) {
      const auxPath = path.join(outDir, `${base}.aux`);

      // biblatex writes \abx@aux@... commands in .aux; traditional bibtex does not
      let useBiber = false;
      try {
        useBiber = (await fs.readFile(auxPath, 'utf8')).includes('\\abx@aux@');
      } catch { /* .aux missing — skip bib pass */ }
      if (!useBiber) {
        try {
          useBiber = /\\usepackage(\[.*?\])?\{biblatex\}/.test(await fs.readFile(absMain, 'utf8'));
        } catch { /* ignore */ }
      }

      const bibCmd = useBiber ? 'biber' : 'bibtex';
      // Run bibtex/biber in outDir on the bare base name (openout_any=p blocks absolute
      // paths). Both find the project's .bib files through BIBINPUTS. biber must not get
      // --input-directory=<project>: it looks for the .bcf there and fails.
      const bibArgs = [base];
      // MiKTeX's bibtex asks before installing a missing .bst, as its engines do
      if (WINDOWS && bibCmd === 'bibtex' && /[\\/]miktex[\\/]/i.test((await findExecutable('bibtex')) || '')) bibArgs.unshift('--enable-installer');
      try {
        await runSpawn(bibCmd, bibArgs, outDir, pushLog, texEnv);
      } catch {
        pushLog(Buffer.from(`[warn] ${bibCmd} not available, skipping bibliography pass.\n`));
      }

      // Pass 2 + 3: resolve citations and cross-references
      pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
      if (!pass.timedOut && !stopped()) pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
    }
  } catch (err) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: `${engine} isn’t available: ${err.message}` };
  }
  const { code } = pass;

  let log = logChunks.join('');
  // the last PDF, SyncTeX and .aux stay as they were
  if (stopped()) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, stopped: true, error: 'The compile was stopped.', log, status: -1 };
  }
  if (pass.timedOut) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: 'The compile took too long and was stopped.', log, status: -1 };
  }
  // Tectonic's own TeX bundle ships an old biblatex that only works with biber 2.17.
  if (engine === 'tectonic' && /biblatex control file version/i.test(log)) {
    log += '\n[spectrum] This document uses biblatex, and Tectonic’s bundled biblatex needs a different biber version than the one installed. Compile it with Auto, pdfLaTeX or XeLaTeX instead.\n';
  }
  let pdf;
  try {
    pdf = await fs.readFile(path.join(outDir, `${base}.pdf`));
  } catch {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: 'No PDF was produced.', log, status: code ?? -1 };
  }
  const absPdf = path.join(path.dirname(absMain), `${base}.pdf`);
  try {
    await fs.writeFile(absPdf, pdf).catch((err) => {
      // Windows locks a PDF open in another viewer (Acrobat); the preview, SyncTeX and .aux still update
      if (!WINDOWS || !['EBUSY', 'EPERM'].includes(err.code)) throw err;
      log += `\n[spectrum warning] ${path.basename(absPdf)} is open in another program, so the copy next to the source wasn’t updated.\n`;
    });
    await keepSynctex(projectRoot, doc, path.join(outDir, `${base}.synctex.gz`), mainDir);
    await keepAux(outDir, auxStore(cache, doc), others);
  } finally {
    await cleanBuild(buildRoot, outDir);
  }
  const pdfPath = docPath(projectRoot, absPdf);
  return { ok: true, pdf: pdf.toString('base64'), pdfPath, log, status: code ?? 0 };
}

/**
 * Replace the document's kept .aux with this build's, \include'd chapters' too, but not other documents'
 * (a copy TeX wrote over is this document's own).
 */
async function keepAux(outDir, store, others) {
  await fs.rm(store, { recursive: true, force: true });
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type !== 'file' || !rel.endsWith('.aux')) continue;
    if (others.has(rel) && others.get(rel) === (await fs.stat(path.join(outDir, rel))).mtimeMs) continue;
    await ensureDir(path.dirname(path.join(store, rel)));
    await renameOver(path.join(outDir, rel), path.join(store, rel));
  }
}

async function cleanBuild(buildRoot, outDir) {
  // retried: on Windows a virus scanner can still hold a file the engine just wrote
  await fs.rm(outDir, { recursive: true, force: true, maxRetries: 5 });
  await fs.rmdir(buildRoot).catch(() => {}); // only succeeds once no other run is using it
}
