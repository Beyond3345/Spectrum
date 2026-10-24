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
import { createCompileCheckpoint } from './versionService.js';

const ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
export const SUPPORTED_ENGINES = ['auto', ...ENGINES];
export const BIB_TOOLS = ['auto', 'bibtex', 'biber'];

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
export const auxStore = (cache, doc) => path.join(cache, 'aux-files', doc);
// What a compile keeps of the document's own build for its next one, per engine, as TeX reads them back: a document
// whose labels, headings, citations and index haven't changed is then done in one pass. Every file the build wrote
// but the PDF, SyncTeX and the logs, as packages keep lists of their own (listings' .lol, algorithm's .loa, the
// acronyms' .acn); Biber's log has the time in it, so every compile would look changed
const keptFile = (rel) => !/\.(?:pdf|log|blg|ilg|glg|synctex\.gz)$/i.test(rel);
// what filecontents wrote, as the last pass's log names it: kept, TeX would find it before the source's new text, and
// before a project file of the same name ("Writing file `./data.dat'", "File `data.dat' already exists on the system")
const FILECONTENTS = /(?:Writing(?: or overwriting)? file|File) `(?:\.\/)?([^']+)'(?:\.| already exists)/g;
const keptStore = (cache, doc, engine) => path.join(cache, 'build-files', doc, engine);
// written last, so a store a crash left half copied isn't read
const KEPT_MARKER = '.complete';
// a pass's log asking for another (LaTeX's labels, hyperref's outlines, longtable's widths, natbib's citations), but
// not rerunfilecheck's banner, which every hyperref document's log has
const RERUN = /\brerun\b(?! checks for auxiliary files)/i;
// a % !TEX root = ../thesis.tex comment on a line of its own
const TEX_ROOT = /^\s*%\s*!TEX\s+root\s*=\s*(.+?)\s*$/im;
// the index's and the glossaries' programs, each run when a pass changed its input or it made nothing yet.
// makeglossaries is Perl, which MiKTeX doesn't come with; makeglossaries-lite is Lua
const INDEXERS = [
  { input: 'idx', output: 'ind', cmd: 'makeindex', args: (base) => [`${base}.idx`] },
  { input: 'glo', output: 'gls', cmd: 'makeglossaries', fallback: 'makeglossaries-lite', args: (base) => [base] }
];
// each glossary's files, as the glossaries package names them in the .aux: \@newglossary{name}{log}{out}{in}
const NEW_GLOSSARY = /\\@newglossary\{[^}]*\}\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/g;
// draft mode's images, as boxes of their size (Overleaf's fast mode)
const DRAFT_IMAGES = '\\PassOptionsToPackage{draft}{graphicx}';
// TeX breaks its log's lines at 79 characters
const unwrap = (log) => log.replace(/^(.{79})\r?\n/gm, '$1');
// TeX reads '\' as a command, and every engine on Windows takes '/' as well
const slashed = (p) => p.split(path.sep).join('/');
const docPath = (root, abs) => slashed(path.relative(root, abs));
const WINDOWS = process.platform === 'win32';
// Windows spells it Path
const PATH_KEY = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const exists = (p) => fs.access(p).then(() => true, () => false);

// Every engine writes <main>.synctex.gz too, for jumping between the source and the PDF.
function buildCommand(engine, outDir, mainFile, { haltOnError = false, draft = false } = {}) {
  const halt = haltOnError ? ['-halt-on-error'] : [];
  switch (engine) {
    case 'pdflatex':
    case 'xelatex':
    case 'lualatex': {
      // draft: images drawn as boxes, which the first line passes to graphicx; the file it inputs still names the job.
      // ponytail: a name TeX would read as code (with %, # or braces) keeps its images
      const input = draft && !/[\\{}%#&~^$]/.test(mainFile) ? `${DRAFT_IMAGES}\\input{${mainFile}}` : mainFile;
      return { cmd: engine, args: ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', ...halt, `-output-directory=${outDir}`, input] };
    }
    case 'latexmk':
      // -norc: a project's own latexmkrc is Perl, which could run anything. ponytail: in draft mode latexmk draws
      // images as boxes but still runs as many passes as it wants
      return {
        cmd: 'latexmk',
        args: ['-norc', '-pdf', '-interaction=nonstopmode', '-file-line-error', '-synctex=1', ...(haltOnError ? halt : ['-f']), ...(draft ? [`-usepretex=${DRAFT_IMAGES}`] : []), `-outdir=${outDir}`, mainFile]
      };
    case 'tectonic':
      // Tectonic keeps its .aux in memory unless told otherwise, and only finds other
      // documents' .aux in outDir when it's on the search path. ponytail: it looks beside the source first, so
      // an old notes.aux another editor left there wins over the kept one; warn about such a file if that bites.
      // It stops at the first error unless told to carry on, as the other engines do; draft is one pass
      return {
        cmd: 'tectonic',
        args: [...(haltOnError ? [] : ['-Z', 'continue-on-errors']), ...(draft ? ['--reruns', '0'] : []), '-Z', `search-path=${outDir}`, '--synctex', '--keep-intermediates', '--outdir', outDir, mainFile]
      };
    default:
      return null;
  }
}

/** The PATH with a TeX folder first (Settings › Engines › LaTeX), or undefined when it isn't a folder: the PATH as it is. */
export async function texPath(texFolder) {
  const folder = typeof texFolder === 'string' && path.isAbsolute(texFolder) && (await fs.stat(texFolder).catch(() => null))?.isDirectory();
  return folder ? [texFolder, process.env.PATH].join(path.delimiter) : undefined;
}

/** First match for `name` on PATH (a compile's, with its TeX folder first), or null. */
export async function findExecutable(name, searchPath = jobs.getStore()?.searchPath ?? process.env.PATH) {
  // Windows tries each extension it can run, in cmd.exe's order; there X_OK only means the file exists
  const names = WINDOWS && !/\.(com|exe|bat|cmd)$/i.test(name) ? ['.com', '.exe', '.bat', '.cmd'].map((ext) => name + ext) : [name];
  for (const dir of (searchPath || '').split(path.delimiter)) {
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

/**
 * options: haltOnError (stop at the first error), bibTool ('auto', 'bibtex' or 'biber'), draft (one pass, images as
 * boxes) and fresh (none of the document's kept files). texFolder: a second TeX installation's programs, looked for
 * before the PATH's. checkpoint: save one after the compile succeeds, as createCompileCheckpoint does.
 */
export async function runCompile({ projectId, mainFile, engine = 'pdflatex', compileId, texFolder, checkpoint = false, ...options }) {
  if (!SUPPORTED_ENGINES.includes(engine)) {
    return { ok: false, error: `Unsupported engine: ${engine}` };
  }

  const projectRoot = await getProjectRoot(projectId);
  let absMain = safeJoin(projectRoot, mainFile);
  // a leading '-' would be read as an engine option (latexmk's can run any command)
  if (path.basename(absMain).startsWith('-')) {
    return { ok: false, error: 'The main file’s name can’t start with “-”.', engine };
  }
  let tex;
  try {
    tex = await fs.readFile(absMain, 'utf8');
  } catch {
    return { ok: false, error: `The main file “${mainFile}” doesn’t exist.`, engine };
  }
  // a chapter that names its document compiles that document (one step: the document's own comment isn't followed).
  // Read near the top and before any \documentclass, as the editor reads it, and with '\' as Windows writes a path
  const named = tex.slice(0, 4096).split('\\documentclass')[0].match(TEX_ROOT)?.[1]?.replace(/\\/g, '/');
  if (named) {
    const target = await projectFile(projectRoot, path.resolve(path.dirname(absMain), named));
    if (!target || path.basename(target).startsWith('-')) {
      return { ok: false, error: `The “% !TEX root” in “${mainFile}” names “${named}”, which isn’t a file in the project.`, engine };
    }
    absMain = target;
    mainFile = docPath(projectRoot, target);
  }
  // only the editor's compiles can be stopped, each by its own id (another of the project's may be running too); the
  // others (a transfer's) are listed too, so the project's folder isn't moved from under them
  const job = {
    projectId,
    stopped: stoppedEarly.delete(compileId),
    children: new Set(),
    searchPath: await texPath(texFolder)
  };
  const key = compileId || Symbol('compile');
  running.set(key, job);
  try {
    const result = await jobs.run(job, () => compileWithLinks(engine, projectRoot, absMain, mainFile, options));
    // inside the compile, so the project's folder isn't moved from under it either
    if (checkpoint && result.ok) result.checkpoint = await createCompileCheckpoint(projectRoot);
    // doc: the document compiled, which a % !TEX root comment may have changed
    return { ...result, doc: mainFile };
  } finally {
    running.delete(key);
  }
}

/** abs if it's a file in the project, by the name on disk (macOS finds Main.tex as main.tex), or null. */
async function projectFile(projectRoot, abs) {
  try {
    safeJoin(projectRoot, abs);
    if (!(await fs.stat(abs)).isFile()) return null;
    const onDisk = path.relative(await fs.realpath(projectRoot), await fs.realpath(abs));
    return onDisk.startsWith('..') || path.isAbsolute(onDisk) ? null : path.join(projectRoot, onDisk);
  } catch {
    return null; // outside the project, or not there
  }
}

/** A compile of the project is running. */
export const compiling = (projectId) => [...running.values()].some((job) => job.projectId === projectId);

async function compileWithLinks(engine, projectRoot, absMain, mainFile, options) {
  // Documents it cross-references go first when their .aux is missing or old. One level only,
  // so two documents that reference each other don't loop.
  const linked = [];
  for (const target of await staleLinks(projectRoot, absMain)) {
    if (stopped()) break;
    const file = docPath(projectRoot, target);
    // from scratch is for the document asked for; Recompile all asks for each
    linked.push({ file, ok: (await compileDocument(engine, projectRoot, target, file, { ...options, fresh: false })).ok });
  }
  const result = await compileDocument(engine, projectRoot, absMain, mainFile, options);
  if (!linked.length) return result;
  const notes = linked.map(({ file, ok }) => (ok
    ? `Compiled ${file} first for its cross-references.`
    : `[spectrum warning] ${file} didn’t compile, so references to it may show as ??.`));
  return { ...result, linked, log: [...notes, result.log ?? ''].join('\n') };
}

async function compileDocument(engine, projectRoot, absMain, mainFile, options) {
  if (engine !== 'auto') return { ...(await compileWith(engine, projectRoot, absMain, mainFile, options)), engine };
  const candidates = await autoEngineCandidates(absMain);
  if (!candidates.length) {
    return { ok: false, error: `No LaTeX engine found. Install ${WINDOWS ? 'MiKTeX' : 'MacTeX'}, TeX Live or Tectonic.`, engine };
  }
  const result = await compileWith(candidates[0], projectRoot, absMain, mainFile, options);
  // fontspec & co. may sit in an \input'd preamble or a local .sty, which the guess can't see
  const fallback = candidates.find((e) => e === 'xelatex' || e === 'lualatex');
  if (!result.ok && !result.stopped && candidates[0] === 'pdflatex' && fallback && NEEDS_UNICODE_ENGINE.test(result.log || '')) {
    return { ...(await compileWith(fallback, projectRoot, absMain, mainFile, options)), engine: fallback };
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
    // by the name on disk ({Notes} finds notes.tex on macOS), so it's the same document (and store) as the file
    const target = await projectFile(projectRoot, path.resolve(path.dirname(absMain), file));
    // a leading '-' would be read as an engine option
    if (!target || target === absMain || stale.includes(target) || path.basename(target).startsWith('-')) continue;
    const source = await fs.stat(target);
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
async function compileWith(engine, projectRoot, absMain, mainFile, options = {}) {
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
  const binPath = jobs.getStore()?.searchPath;
  const texEnv = {
    ...process.env,
    ...(binPath && { [PATH_KEY]: binPath }),
    TEXINPUTS: searchPath('TEXINPUTS'),
    BIBINPUTS: searchPath('BIBINPUTS'),
    BSTINPUTS: searchPath('BSTINPUTS')
  };
  // Recompile from scratch: nothing an earlier compile of the document kept, with any engine
  // (one a virus scanner still holds is left: none of it is copied in, and keepBuild clears it again)
  if (options.fresh) await fs.rm(path.join(cache, 'build-files', doc), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  // ponytail: only the engines run pass by pass here keep files; latexmk and Tectonic choose their own passes from nothing
  const multiPass = MULTI_PASS_ENGINES.includes(engine);
  const store = keptStore(cache, doc, engine);
  // first, so another document's .aux of the same name doesn't take the place of its own
  const kept = multiPass && !options.fresh && (await copyKept(store, outDir));
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
    // its own came from its kept files, if any
    if (!/\.tex$/i.test(item.path) || item.path === doc) continue;
    // ponytail: a document in a parent folder (\externaldocument{../notes}) isn't reached; a per-run TEXINPUTS folder would reach it
    const at = path.relative(mainDir, path.join(projectRoot, path.dirname(item.path)));
    if (at.startsWith('..')) continue;
    const auxes = auxStore(cache, item.path);
    for (const aux of await listFilesRecursive(auxes).catch(() => [])) {
      if (aux.type !== 'file') continue;
      const rel = slashed(path.join(at, aux.path)); // as keepAux lists it
      const dest = path.join(outDir, rel);
      await ensureDir(path.dirname(dest));
      // two documents can leave an .aux of the same name (one's \include'd chapter, another's own): its own wins
      const own = aux.path === `${path.basename(item.path, path.extname(item.path))}.aux`;
      try {
        await fs.copyFile(path.join(auxes, aux.path), dest, own ? 0 : fsConstants.COPYFILE_EXCL);
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

  const { cmd, args } = buildCommand(engine, slashed(outDir), `./${mainName}`, options);
  if (engine === 'tectonic' && mainDir !== projectRoot) {
    // Tectonic ignores TEXINPUTS; its unstable search-path option does the same job
    args.unshift('-Z', `search-path=${slashed(projectRoot)}`);
  }
  // MiKTeX asks before installing a missing package, in a window the hidden engine never shows, so the
  // compile would sit until its time limit; this installs it without asking. ponytail: latexmk's own
  // engine runs still ask; pass -pdflatex="pdflatex --enable-installer %O %S" if that bites
  if (WINDOWS && multiPass && /[\\/]miktex[\\/]/i.test((await findExecutable(cmd)) || '')) args.unshift('--enable-installer');
  const base = path.basename(mainFile, path.extname(mainFile));
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  // the whole log of the pass just run, which the log sent back may have cut short
  const passLog = async () => unwrap(await fs.readFile(path.join(outDir, `${base}.log`), 'utf8').catch(() => ''));

  let pass;
  let bibliographyStatus = 0;
  let retry = false;
  try {
    let before = await keptFiles(outDir);
    // Pass 1: generate .aux with \citation{} entries
    pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
    let log = await passLog();
    const carryOn = () => !pass.timedOut && !stopped() && !(options.haltOnError && pass.code !== 0);
    const keptFailed = () => kept && pass.code !== 0 && !pass.timedOut && !stopped() && keptFileFailed(log, kept);
    retry = keptFailed();

    if (multiPass && !options.draft && !retry && carryOn()) {
      // what BibTeX reads, so a citation only a kept list put there (a caption's, from the .lof) goes again
      const cites = async () => (await auxWithInputs(outDir, `${base}.aux`)).match(/^\\(?:citation|bibdata|bibstyle)\{.*$/gm)?.join('\n') ?? '';
      let cited = await cites();
      bibliographyStatus = await runBibliography(outDir, base, tex, options.bibTool, texEnv, pushLog);
      // Pass 2 + 3: resolve citations and cross-references, while the last pass asks for another or changed what
      // TeX reads back
      for (let n = 2; n <= 3 && carryOn(); n += 1) {
        if (n > 2 && cited !== (cited = await cites())) bibliographyStatus = await runBibliography(outDir, base, tex, options.bibTool, texEnv, pushLog);
        let now = await keptFiles(outDir);
        for (const { input, output, cmd: indexer, fallback, args: indexArgs } of INDEXERS) {
          // every glossary's files (the acronyms' too), or the main glossary's when the .aux names none
          const named = input === 'glo' ? [...(now.get(`${base}.aux`)?.toString() ?? '').matchAll(NEW_GLOSSARY)].map(([, out, from]) => [from, out]) : [];
          const changed = (ext) => !before.get(`${base}.${ext}`)?.equals(now.get(`${base}.${ext}`));
          // the glossaries' sort order and style, which change the .gls but not the .glo
          const setup = (files) => (input === 'glo' && files.get(`${base}.aux`)?.toString().match(/^\\@(?:newglossary|glsorder|istfilename|xdylanguage|gls@codepage)\{.*$/gm)?.join('\n')) || '';
          const redo = setup(before) !== setup(now) || (input === 'glo' && changed('ist'));
          // an empty one may make nothing (makeglossaries-lite's main glossary with no entries)
          const due = (named.length ? named : [[input, output]]).some(([from, out]) => now.get(`${base}.${from}`)
            && (changed(from) || redo || (!now.has(`${base}.${out}`) && now.get(`${base}.${from}`).length > 0)));
          if (!due) continue;
          let ran = null;
          for (const tool of [indexer, fallback].filter(Boolean)) {
            ran = await runSpawn(tool, indexArgs(base), outDir, pushLog, texEnv).catch(() => null); // not installed
            if (ran?.code === 0 || stopped()) break;
          }
          if (ran?.code !== 0 && !stopped()) {
            pushLog(Buffer.from(`\n[spectrum warning] ${indexer} didn’t run, so the ${input === 'idx' ? 'index wasn’t' : 'glossaries weren’t'} built.\n`));
          }
          now = await keptFiles(outDir);
        }
        if (!RERUN.test(log) && sameFiles(before, now)) break;
        before = now;
        pass = await runSpawn(cmd, args, mainDir, pushLog, texEnv);
        log = await passLog();
        // a kept file can break a later pass too: natbib's on the .aux pass 1 wrote from a kept plain .bbl
        retry = keptFailed();
        if (retry) break;
      }
    }
  } catch (err) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: `${engine} isn’t available: ${err.message}` };
  }
  if (retry) {
    // a kept file TeX choked on (one from an older package version, say) never locks the document out
    await cleanBuild(buildRoot, outDir);
    const again = await compileWith(engine, projectRoot, absMain, mainFile, { ...options, fresh: true });
    return { ...again, log: `[spectrum] A file kept from the last compile couldn’t be read, so this compiled again from scratch.\n\n${again.log ?? ''}` };
  }
  // A later TeX pass can create a PDF even when Biber failed.
  let code = pass.code !== 0 ? pass.code : bibliographyStatus;

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
  // carrying on past errors, Tectonic still exits with 0
  if (engine === 'tectonic' && code === 0 && /^error: /m.test(log)) code = 1;
  // Tectonic's own TeX bundle ships an old biblatex that only works with biber 2.17.
  if (engine === 'tectonic' && /biblatex control file version/i.test(log)) {
    log += '\n[spectrum] This document uses biblatex, and Tectonic’s bundled biblatex needs a different biber version than the one installed. Compile it with Auto, pdfLaTeX or XeLaTeX instead.\n';
  }
  let pdf;
  try {
    pdf = await fs.readFile(path.join(outDir, `${base}.pdf`));
  } catch {
    // a store Windows still holds is only reused, and a kept file TeX can't read compiles again from scratch
    if (multiPass) await fs.rm(store, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: 'No PDF was produced.', log, status: code ?? -1 };
  }
  const absPdf = path.join(path.dirname(absMain), `${base}.pdf`);
  // the copy on disk is older than this compile's, so the editor keeps showing the one it was sent
  let pdfStale = false;
  try {
    await fs.writeFile(absPdf, pdf).catch((err) => {
      // Windows locks a PDF open in another viewer (Acrobat); the preview, SyncTeX and .aux still update
      if (!WINDOWS || !['EBUSY', 'EPERM'].includes(err.code)) throw err;
      pdfStale = true;
      log += `\n[spectrum warning] ${path.basename(absPdf)} is open in another program, so the copy next to the source wasn’t updated.\n`;
    });
    await keepSynctex(projectRoot, doc, path.join(outDir, `${base}.synctex.gz`), mainDir);
    // only a build without errors is read back; after one with errors the next compile starts from nothing. A draft
    // leaves the last full compile's: its .idx kept beside the old .ind would keep makeindex from running again
    if (multiPass && !options.draft) await (code === 0 ? keepBuild(outDir, store, others, await passLog()) : fs.rm(store, { recursive: true, force: true })).catch(() => {});
    await keepAux(outDir, auxStore(cache, doc), others);
  } finally {
    await cleanBuild(buildRoot, outDir);
  }
  const pdfPath = docPath(projectRoot, absPdf);
  return { ok: true, pdf: pdf.toString('base64'), pdfPath, log, status: code ?? 0, ...(pdfStale && { pdfStale }) };
}

/**
 * BibTeX or Biber after the first pass, when the .aux cites anything or names a bibliography: the tool chosen, else
 * a `% !BIB program = biber` comment's, else Biber for biblatex. Resolves 1 or Biber's code when Biber failed.
 */
async function runBibliography(outDir, base, tex, bibTool, env, pushLog) {
  // with the \include'd chapters' .aux, where the citations and \bibliography may be
  const aux = await auxWithInputs(outDir, `${base}.aux`);
  // biblatex writes \abx@aux@... commands in .aux; traditional bibtex \citation and \bibdata
  if (!/\\(?:citation|bibdata)\{|\\abx@aux@/.test(aux)) return 0;
  const magic = tex.match(/%\s*!BIB\s+(?:TS-)?program\s*=\s*(\w+)/i)?.[1]?.toLowerCase();
  const chosen = bibTool && bibTool !== 'auto' ? bibTool : ['bibtex', 'biber'].includes(magic) ? magic : null;
  const useBiber = chosen ? chosen === 'biber' : aux.includes('\\abx@aux@') || /\\usepackage(\[.*?\])?\{biblatex\}/.test(tex);
  const bibCmd = useBiber ? 'biber' : 'bibtex';
  // Run bibtex/biber in outDir on the bare base name (openout_any=p blocks absolute
  // paths). Both find the project's .bib files through BIBINPUTS. biber must not get
  // --input-directory=<project>: it looks for the .bcf there and fails.
  const bibArgs = [base];
  // MiKTeX's bibtex asks before installing a missing .bst, as its engines do
  if (WINDOWS && bibCmd === 'bibtex' && /[\\/]miktex[\\/]/i.test((await findExecutable('bibtex')) || '')) bibArgs.unshift('--enable-installer');
  try {
    const bibliography = await runSpawn(bibCmd, bibArgs, outDir, pushLog, env);
    // Stop ended it, or came before it started: Biber didn't fail
    if (stopped()) return 0;
    if (useBiber && (bibliography.code !== 0 || bibliography.timedOut)) {
      pushLog(Buffer.from('[spectrum] Biber failed. Fix the bibliography errors above and compile again.\n'));
      return bibliography.code || 1;
    }
  } catch (err) {
    if (useBiber) {
      pushLog(Buffer.from(`[spectrum] Biber could not run: ${err.message}. Install Biber with your TeX distribution and compile again.\n`));
      return 1;
    }
    pushLog(Buffer.from(`[warn] ${bibCmd} not available, skipping bibliography pass.\n`));
  }
  return 0;
}

/** An .aux with the .aux files its \@input lines name (\include'd chapters'), as BibTeX reads them, as one text. */
async function auxWithInputs(outDir, rel, seen = new Set()) {
  if (seen.has(rel)) return '';
  seen.add(rel);
  let text = await fs.readFile(path.join(outDir, rel), 'utf8').catch(() => '');
  for (const [, name] of text.matchAll(/\\@input\{([^}]+)\}/g)) text += await auxWithInputs(outDir, name, seen);
  return text;
}

/** The files of the kind a compile keeps in outDir, with their bytes, to tell whether a pass changed any. */
async function keptFiles(outDir) {
  const files = new Map();
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type === 'file' && keptFile(rel)) files.set(rel, await fs.readFile(path.join(outDir, rel)));
  }
  return files;
}

const sameFiles = (a, b) => a.size === b.size && [...a].every(([rel, bytes]) => b.get(rel)?.equals(bytes));

/**
 * An error in one of the kept files `names`: one that names it (with -file-line-error, at its path in the output
 * folder, a drive letter's colon and all, or in quotes, as biblatex's "File 'main.bbl' not created by biblatex"), or a
 * file cut short ending in the middle of an argument just after TeX opened it, which TeX puts down to the main file
 * ("./main.tex:1: File ended while scanning use of \@newl@bel" after "(./main.aux)"). An ordinary error just after
 * hyperref opens main.out isn't one.
 */
export function keptFileFailed(log, names) {
  const lines = log.replace(/\\/g, '/').split('\n');
  const at = (l) => names.some((rel) => l.includes(`/${rel}:`) || l.includes(`'${rel}'`));
  return lines.some((line, i) => (/:\d+: /.test(line) && at(line))
    || (/File ended while scanning/.test(line) && lines.slice(Math.max(0, i - 3), i + 1).some((l) => names.some((rel) => l.includes(rel)))));
}

/** Copy the document's kept build files into outDir: their names, or null when there are none from a compile that succeeded. */
async function copyKept(store, outDir) {
  if (!(await exists(path.join(store, KEPT_MARKER)))) return null;
  const names = [];
  try {
    for (const { path: rel, type } of await listFilesRecursive(store)) {
      if (type !== 'file' || rel === KEPT_MARKER) continue;
      await ensureDir(path.dirname(path.join(outDir, rel)));
      await fs.copyFile(path.join(store, rel), path.join(outDir, rel));
      names.push(slashed(rel));
    }
  } catch {
    // the compile still goes ahead, from what was copied
  }
  return names;
}

/**
 * Replace the document's kept build files with this build's own (not other documents' copies), the marker last.
 * ponytail: two compiles of one document finishing at once can mix their files; the next compile's reruns, or its
 * second go from scratch, put that right. A lock per store if it ever shows
 */
async function keepBuild(outDir, store, others, log) {
  const written = new Set([...log.matchAll(FILECONTENTS)].map(([, name]) => name));
  await fs.rm(store, { recursive: true, force: true });
  await ensureDir(store);
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type !== 'file' || !keptFile(rel) || written.has(slashed(rel))) continue;
    if (others.has(rel) && others.get(rel) === (await fs.stat(path.join(outDir, rel))).mtimeMs) continue;
    await ensureDir(path.dirname(path.join(store, rel)));
    await fs.copyFile(path.join(outDir, rel), path.join(store, rel));
  }
  await fs.writeFile(path.join(store, KEPT_MARKER), '');
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
