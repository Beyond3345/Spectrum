import crypto from 'crypto';
import path from 'path';
import { promises as fs, constants as fsConstants } from 'fs';
import { spawn } from 'child_process';
import { ensureDir, listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { withoutComments } from '../utils/texUtils.js';
import { getProjectRoot, appPath } from './projectService.js';
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

// Each document's .aux from its last good compile, e.g. .spectrum/aux/chapters/thesis.tex/thesis.aux,
// for other documents' \externaldocument to read.
const auxStore = (root, doc) => appPath(root, 'aux', doc);
const docPath = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

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
      // documents' .aux in outDir when it's on the search path
      return { cmd: 'tectonic', args: ['-Z', `search-path=${outDir}`, '--synctex', '--keep-intermediates', '--outdir', outDir, mainFile] };
    default:
      return null;
  }
}

/** First match for `name` on PATH, or null. */
export async function findExecutable(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      await fs.access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
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

function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // nothing left in the group
  }
}

export function killAllChildren() {
  for (const child of children) killGroup(child);
}

/**
 * Run one command in its own process group, so the time limit also stops what it started
 * (latexmk's pdflatex would otherwise keep running and hold the output pipes open).
 * Resolves { code, timedOut }.
 */
export function runSpawn(cmd, args, cwd, pushLog, env, limit = PASS_TIMEOUT_MS[cmd] || DEFAULT_PASS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: env || process.env, detached: true });
    children.add(child);
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
      reject(err);
    });
    child.on('exit', () => {
      clearTimeout(timer);
      // leftovers would keep 'close' from ever firing; the pipes still drain into the log
      killGroup(child);
      children.delete(child);
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

export async function runCompile({ projectId, mainFile, engine = 'pdflatex' }) {
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

  // Documents it cross-references go first when their .aux is missing or old. One level only,
  // so two documents that reference each other don't loop.
  const linked = [];
  for (const target of await staleLinks(projectRoot, absMain)) {
    const file = docPath(projectRoot, target);
    linked.push({ file, ok: (await compileDocument(engine, projectRoot, target, file)).ok });
  }
  const result = await compileDocument(engine, projectRoot, absMain, mainFile);
  if (!linked.length) return result;
  const notes = linked.map(({ file, ok }) => (ok
    ? `[spectrum] Compiled ${file} first for its cross-references.`
    : `[spectrum] ${file} didn’t compile, so references to it may show as ??.`));
  return { ...result, linked, log: [...notes, result.log ?? ''].join('\n') };
}

async function compileDocument(engine, projectRoot, absMain, mainFile) {
  if (engine !== 'auto') return { ...(await compileWith(engine, projectRoot, absMain, mainFile)), engine };
  const candidates = await autoEngineCandidates(absMain);
  if (!candidates.length) {
    return { ok: false, error: 'No LaTeX engine found. Install MacTeX, TeX Live or Tectonic.', engine };
  }
  const result = await compileWith(candidates[0], projectRoot, absMain, mainFile);
  // fontspec & co. may sit in an \input'd preamble or a local .sty, which the guess can't see
  const fallback = candidates.find((e) => e === 'xelatex' || e === 'lualatex');
  if (!result.ok && candidates[0] === 'pdflatex' && fallback && NEEDS_UNICODE_ENGINE.test(result.log || '')) {
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
    // a leading '-' would be read as an engine option
    if (target === absMain || stale.includes(target) || path.basename(target).startsWith('-')) continue;
    const source = await fs.stat(target).catch(() => null);
    if (!source?.isFile()) continue;
    // ponytail: only the target's own .tex mtime counts, so edits only in its \input files don't
    // make it stale; compare its inputs too (inlineInputs walks them) if that bites
    const base = path.basename(target, path.extname(target));
    const aux = await fs.stat(path.join(auxStore(projectRoot, docPath(projectRoot, target)), `${base}.aux`)).catch(() => null);
    if (!aux || source.mtimeMs > aux.mtimeMs) stale.push(target);
  }
  return stale;
}

/**
 * Build in .spectrum/build/<runId> (removed afterwards) and put the PDF next to the
 * main file, e.g. chapters/thesis.tex -> chapters/thesis.pdf. Its .aux files are kept too.
 */
async function compileWith(engine, projectRoot, absMain, mainFile) {
  const buildRoot = appPath(projectRoot, 'build');
  const outDir = path.join(buildRoot, crypto.randomUUID());
  await ensureDir(outDir);
  // Like TeXShop, LaTeX Workshop and Tectonic, run from the main file's folder so
  // \input paths are relative to the main file. The project root stays on the search
  // paths, so paths written relative to the root keep working as well.
  const mainDir = path.dirname(absMain);
  const mainName = path.basename(absMain);
  const doc = docPath(projectRoot, absMain);
  const searchPath = (name) => [mainDir, projectRoot, process.env[name] ?? ''].join(path.delimiter);
  const texEnv = {
    ...process.env,
    TEXINPUTS: searchPath('TEXINPUTS'),
    BIBINPUTS: searchPath('BIBINPUTS'),
    BSTINPUTS: searchPath('BSTINPUTS')
  };
  // \include{chapters/x} writes chapters/x.aux into the output dir, so mirror the folders
  // as seen from the main file's folder and from the project root.
  // Other documents' kept .aux go in it too, where TeX looks first, for \externaldocument to find.
  const others = new Set();
  for (const item of await listFilesRecursive(projectRoot)) {
    if (item.type === 'dir') {
      await ensureDir(path.join(outDir, item.path));
      const fromMain = path.relative(mainDir, path.join(projectRoot, item.path));
      if (fromMain && !fromMain.startsWith('..')) await ensureDir(path.join(outDir, fromMain));
      continue;
    }
    // its own stay out, so every compile starts clean
    if (!item.path.endsWith('.tex') || item.path === doc) continue;
    // ponytail: a document in a parent folder (\externaldocument{../notes}) isn't reached; a per-run TEXINPUTS folder would reach it
    const at = path.relative(mainDir, path.join(projectRoot, path.dirname(item.path)));
    if (at.startsWith('..')) continue;
    const store = auxStore(projectRoot, item.path);
    for (const aux of await listFilesRecursive(store).catch(() => [])) {
      if (aux.type !== 'file') continue;
      const rel = path.join(at, aux.path);
      await ensureDir(path.dirname(path.join(outDir, rel)));
      await fs.copyFile(path.join(store, aux.path), path.join(outDir, rel));
      others.add(rel);
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

  const { cmd, args } = buildCommand(engine, outDir, `./${mainName}`);
  if (engine === 'tectonic' && mainDir !== projectRoot) {
    // Tectonic ignores TEXINPUTS; its unstable search-path option does the same job
    args.unshift('-Z', `search-path=${projectRoot}`);
  }
  const base = path.basename(mainFile, path.extname(mainFile));

  let pass;
  try {
    // Pass 1: generate .aux with \citation{} entries
    pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);

    if (MULTI_PASS_ENGINES.includes(engine) && !pass.timedOut) {
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
      try {
        await runSpawn(bibCmd, bibArgs, outDir, pushLog, texEnv);
      } catch {
        pushLog(Buffer.from(`[warn] ${bibCmd} not available, skipping bibliography pass.\n`));
      }

      // Pass 2 + 3: resolve citations and cross-references
      pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
      if (!pass.timedOut) pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
    }
  } catch (err) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: `${engine} isn’t available: ${err.message}` };
  }
  const { code } = pass;

  let log = logChunks.join('');
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
    await fs.writeFile(absPdf, pdf);
    await keepSynctex(projectRoot, doc, path.join(outDir, `${base}.synctex.gz`), mainDir);
    await keepAux(outDir, auxStore(projectRoot, doc), others);
  } finally {
    await cleanBuild(buildRoot, outDir);
  }
  const pdfPath = docPath(projectRoot, absPdf);
  return { ok: true, pdf: pdf.toString('base64'), pdfPath, log, status: code ?? 0 };
}

/** Replace the document's kept .aux with this build's, \include'd chapters' too, but not other documents'. */
async function keepAux(outDir, store, others) {
  await fs.rm(store, { recursive: true, force: true });
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type !== 'file' || !rel.endsWith('.aux') || others.has(rel)) continue;
    await ensureDir(path.dirname(path.join(store, rel)));
    await fs.rename(path.join(outDir, rel), path.join(store, rel));
  }
}

async function cleanBuild(buildRoot, outDir) {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.rmdir(buildRoot).catch(() => {}); // only succeeds once no other run is using it
}
