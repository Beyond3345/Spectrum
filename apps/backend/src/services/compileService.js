import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { existsSync, promises as fs, constants as fsConstants, realpathSync } from 'fs';
import { spawn } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import { EventEmitter } from 'events';
import { DATA_DIR } from '../config/constants.js';
import { ensureDir, listFilesRecursive, renameOver } from '../utils/fsUtils.js';
import { biberCache, biberDownload, builtInTectonic, installBiber, tectonicBiber } from './engineService.js';
import { SANDBOX_EXEC, blockedNotes, compileSandbox, confinement } from './compileSandbox.js';
import { isTrusted } from './trustService.js';
import { documentRecipe } from './buildRecipe.js';
import { FORMAT_ENGINES, formatKey, preambleOf, prepareFormat, readyFormat, refuseFormat } from './preambleFormat.js';
import { safeJoin } from '../utils/pathUtils.js';
import { withoutComments } from '../utils/texUtils.js';
import { cachePath, getProjectRoot } from './projectService.js';
import { keepSynctex } from './synctex.js';
import { createCompileCheckpoint } from './versionService.js';
import { compileTypst } from './typstService.js';
import { compileMarkdown } from './markdownService.js';
import { closeLog, openLog, sendLog } from './compileLog.js';
import { jyutpingDocument, jyutpingSearch, projectPaths, writeAutoCopy } from './jyutpingService.js';

const ENGINES = ['pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
export const SUPPORTED_ENGINES = ['auto', ...ENGINES];
export const BIB_TOOLS = ['auto', 'bibtex', 'biber'];

// Engines that need multiple passes + bibtex for citations
const MULTI_PASS_ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
// Tectonic downloads its TeX bundle on first use (over 3 minutes for the ACL template on a
// fresh machine) and latexmk runs every pass inside one process, so they get longer limits.
const PASS_TIMEOUT_MS = { tectonic: 15 * 60 * 1000, latexmk: 10 * 60 * 1000 };
const DEFAULT_PASS_TIMEOUT_MS = 3 * 60 * 1000;
export const MAX_LOG_BYTES = 200_000;
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
// what Biber read to make the kept .bbl (biberReads), kept beside it as <main>.bibrun; never one of the files a
// pass is taken to have changed
const BIB_RECORD = '.bibrun';
// written last, so a store a crash left half copied isn't read
const KEPT_MARKER = '.complete';
// a pass's log asking for another (LaTeX's labels, hyperref's outlines, longtable's widths, natbib's citations), but
// not rerunfilecheck's banner, which every hyperref document's log has
const RERUN = /\brerun\b(?! checks for auxiliary files)/i;
// a % !TEX root = ../thesis.tex comment on a line of its own
const TEX_ROOT = /^\s*%\s*!TEX\s+root\s*=\s*(.+?)\s*$/im;
// biblatex's Biber, which for Tectonic's biblatex must be Biber 2.17 (Spectrum downloads it); backend=bibtex runs BibTeX instead
const BIBLATEX = /\\addbibresource\b|\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{biblatex\}/;
const BIBTEX_BACKEND = /backend\s*=\s*bibtex/;
const needsBiber = (tex) => BIBLATEX.test(withoutComments(tex)) && !BIBTEX_BACKEND.test(tex);
// Tectonic's bundle or a package couldn't be fetched (the bundle's own panic says it isn't cached)
const TECTONIC_DOWNLOAD = /failed to download|failure downloading|couldn't get it from the internet/i;
// what a format that doesn't suit the pass ends in: pdfTeX's own errors, never a document's
const FORMAT_FAULT = /pdfTeX error|\(pdf backend\)|Fatal format file error/i;
const ENGINE_NAMES = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX', tectonic: 'Tectonic', latexmk: 'Latexmk' };
// the built-in Tectonic's LaTeX (2021-11-15) can't load xjyutping 2, which needs 2023-11-01
const XJYUTPING_ENGINE_ERROR = 'Jyutping (xjyutping) needs XeLaTeX or LuaLaTeX from a TeX installation, and the built-in Tectonic’s LaTeX is too old for it. Install MacTeX, TeX Live or MiKTeX, or choose its folder in Settings › Engines › LaTeX.';
const TECTONIC_DOWNLOAD_ERROR = 'Tectonic couldn’t reach its server to download the TeX packages this document needs. Check the internet connection and compile again, or install TeX Live (MacTeX on a Mac, MiKTeX on Windows).';
const BIBLATEX_NOTE = '\n[spectrum] biblatex with Biber needs the Biber that matches the built-in Tectonic, which Spectrum couldn’t download just now. Choose Download Biber and compile over the PDF, download it from Logs or Settings › Engines › LaTeX, or install TeX Live or MiKTeX.\n';
// the index's and the glossaries' programs, each run when a pass changed its input or it made nothing yet.
// makeglossaries is Perl, which MiKTeX doesn't come with; makeglossaries-lite is Lua
const INDEXERS = [
  { input: 'idx', output: 'ind', cmd: 'makeindex', args: (base) => [`${base}.idx`] },
  { input: 'glo', output: 'gls', cmd: 'makeglossaries', fallback: 'makeglossaries-lite', args: (base) => [base] }
];
// each glossary's files, as the glossaries package names them in the .aux: \@newglossary{name}{log}{out}{in}
const NEW_GLOSSARY = /\\@newglossary\{[^}]*\}\{[^}]*\}\{([^}]*)\}\{([^}]*)\}/g;
// What makeglossaries (Perl) and makeglossaries-lite (Lua) take from the .aux and paste into a command line for the
// shell, or open as Perl opens a name ('|program' runs it): the style file, each glossary's extensions, the sort order,
// xindy's language and code page, makeindex's extra options, the indexer's own name and the chapters' .aux files. A
// document writes its own .aux, so one of them (or the document's name) that a shell would read as more than a name,
// options that aren't plain switches or an indexer that isn't one keep both from running
const GLOSSARY_SETTING = /\\@(istfilename|newglossary|glsorder|xdylanguage|gls@codepage|gls@extramakeindexopts|glsmakeindexappname|input)(?![A-Za-z@])(.*)$/gm;
const SHELL_READS = /[$`\\;&|<>^%\r\n]/;
const GLOSSARY_RULES = {
  'gls@extramakeindexopts': /^\s*(?:\[1\]\{\}|\{[\w\s-]*\})\s*$/,
  glsmakeindexappname: /^\s*(?:\[1\]\{\}|\{(?:makeindex|upmendex|mendex)\})\s*$/,
  input: /^\{[^{}]*\}\s*$/
};
export function glossariesUnsafe(aux, base) {
  if (SHELL_READS.test(base)) return true;
  return [...aux.matchAll(GLOSSARY_SETTING)].some(([, name, rest]) => SHELL_READS.test(rest) || GLOSSARY_RULES[name]?.test(rest) === false);
}
// draft mode's images, as boxes of their size (Overleaf's fast mode)
const DRAFT_IMAGES = '\\PassOptionsToPackage{draft}{graphicx}';
// TeX breaks its log's lines at 79 characters
export const unwrap = (log) => log.replace(/^(.{79})\r?\n/gm, '$1');
// TeX reads '\' as a command, and every engine on Windows takes '/' as well
const slashed = (p) => p.split(path.sep).join('/');
const docPath = (root, abs) => slashed(path.relative(root, abs));
const WINDOWS = process.platform === 'win32';
// Windows spells it Path
export const PATH_KEY = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const exists = (p) => fs.access(p).then(() => true, () => false);

/** The command an engine runs as: the built-in Tectonic when Spectrum carries one, else its name on the PATH. */
function engineCommand(engine) {
  return engine === 'tectonic' ? builtInTectonic() ?? 'tectonic' : engine;
}

// Every engine writes <main>.synctex.gz too, for jumping between the source and the PDF.
function buildCommand(engine, outDir, mainFile, { haltOnError = false, draft = false, untrusted = false, trusted = false, ...options } = {}) {
  const halt = haltOnError ? ['-halt-on-error'] : [];
  // Shell escape, always said on the command line, so a setting in the TeX installation doesn't decide it (MiKTeX takes
  // the three as TeX Live does): the restricted kind (TeX's short list of its own programs) for a compile, none for an
  // agent's draft, and all of it for a project the user trusts
  const shell = untrusted ? '-no-shell-escape' : trusted ? '-shell-escape' : '-shell-restricted';
  switch (engine) {
    case 'pdflatex':
    case 'xelatex':
    case 'lualatex': {
      // draft: images drawn as boxes, which the first line passes to graphicx; the file it inputs still names the job.
      // ponytail: a name TeX would read as code (with %, # or braces) keeps its images
      const input = draft && !/[\\{}%#&~^$]/.test(mainFile) ? `${DRAFT_IMAGES}\\input{${mainFile}}` : mainFile;
      // extra: the document's own options (buildRecipe.js), last before the file; format: the precompiled preamble's
      // (preambleFormat.js)
      return { cmd: engine, args: ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', ...halt, shell, `-output-directory=${outDir}`, ...(options.format ? [`-fmt=${options.format}`] : []), ...(options.extra ?? []), input] };
    }
    case 'latexmk':
      // -norc: a project's own latexmkrc is Perl, which could run anything. ponytail: in draft mode latexmk draws
      // images as boxes but still runs as many passes as it wants
      return {
        cmd: 'latexmk',
        args: ['-norc', options.latexmkEngine ? `-${options.latexmkEngine}` : '-pdf', '-interaction=nonstopmode', '-file-line-error', '-synctex=1', `-latexoption=${shell}`, ...(haltOnError ? halt : ['-f']), ...(draft ? [`-usepretex=${DRAFT_IMAGES}`] : []), `-outdir=${outDir}`, mainFile]
      };
    case 'tectonic':
      // Tectonic keeps its .aux in memory unless told otherwise, and only finds other
      // documents' .aux in outDir when it's on the search path. ponytail: it looks beside the source first, so
      // an old notes.aux another editor left there wins over the kept one; warn about such a file if that bites.
      // It stops at the first error unless told to carry on, as the other engines do; draft is one pass
      return {
        cmd: engineCommand('tectonic'),
        args: [...(haltOnError ? [] : ['-Z', 'continue-on-errors']), ...(trusted ? ['-Z', 'shell-escape'] : []), ...(draft ? ['--reruns', '0'] : []), '-Z', `search-path=${outDir}`, '--synctex', '--keep-intermediates', '--outdir', outDir, mainFile]
      };
    default:
      return null;
  }
}

// Tectonic 0.17 runs a tectonic-biber in the folder it runs from, then one on the PATH, before any biber
const TECTONIC_BIBER = ['tectonic-biber', ...(WINDOWS ? ['.exe', '.com', '.bat', '.cmd'].map((ext) => 'tectonic-biber' + ext) : [])];
const holdsTectonicBiber = (dir) => TECTONIC_BIBER.some((name) => existsSync(path.join(dir, name)));

/**
 * Tectonic's environment with Spectrum's Biber first on its PATH (Tectonic runs biber from there), or env as it is. A
 * folder holding a tectonic-biber is left off it, as Tectonic would run that one in place of Spectrum's.
 */
export function withBiber(env, biber) {
  if (!biber) return env;
  // Windows spells it Path
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const rest = String(env[key] ?? '').split(path.delimiter).filter((dir) => dir && !holdsTectonicBiber(dir));
  return { ...env, [key]: [path.dirname(biber), ...rest].join(path.delimiter), PAR_GLOBAL_TMPDIR: biberCache() };
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
async function autoEngineCandidates(absMain, without = []) {
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  const magic = tex.match(/%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)/i)?.[1]?.toLowerCase();
  const needsUnicode = /\\usepackage(\[[^\]]*\])?\{(fontspec|xeCJK|ctex|unicode-math|polyglossia)\}|\\documentclass(\[[^\]]*\])?\{ctex/.test(tex);
  const preferred = [magic, needsUnicode ? 'xelatex' : 'pdflatex', needsUnicode ? 'lualatex' : 'xelatex', 'lualatex', 'tectonic', 'latexmk'];
  const ordered = [...new Set(preferred.filter((engine) => ENGINES.includes(engine) && !without.includes(engine)))];
  const installed = [];
  for (const engine of ordered) {
    // the built-in Tectonic is installed even when nothing on the PATH is
    if (engine === 'tectonic' ? builtInTectonic() : false) installed.push(engine);
    else if (await findExecutable(engine)) installed.push(engine);
  }
  // biblatex with Biber can't run under the built-in Tectonic, which another engine can
  if (needsBiber(tex) && installed.some((engine) => engine !== 'tectonic')) {
    const at = installed.indexOf('tectonic');
    if (at !== -1) installed.splice(at, 1);
  }
  return installed;
}

// Every running runSpawn child, so quitting can stop them rather than leave them orphaned.
export const children = new Set();
// The compile each child belongs to (a project's), so Stop ends that compile and nothing else
const jobs = new AsyncLocalStorage();
/** The compile running here: { stopped, children }, or undefined outside one. */
export const currentJob = () => jobs.getStore();
const running = new Map();
const stopped = () => jobs.getStore()?.stopped === true;
/** fn() as work of Spectrum's own behind a compile, at low priority: no compile's Stop ends it, quitting does. */
export const inBackground = (fn, searchPath) => jobs.run({ stopped: false, children: new Set(), searchPath, lowPriority: true }, fn);

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

/** Stops a child started in its own process group (detached), and what it started; on Windows its process tree. */
export function killGroup(child) {
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
 * input, when given, is written to the command's standard input (Typst reads a document from stdin).
 * profile, when given, is the sandbox-exec profile the command and what it starts run under (compileSandbox's).
 * Resolves { code, timedOut }.
 */
export async function runSpawn(cmd, args, cwd, pushLog, env, limit = PASS_TIMEOUT_MS[cmd] || DEFAULT_PASS_TIMEOUT_MS, input = null, profile = null) {
  let file = cmd;
  // never a key or a token of Spectrum's own environment (the .env file's, the system's): a document reads it with
  // kpsewhich -var-value or Lua's os.getenv, and a plot's code or a filter as easily
  const safeEnv = Object.fromEntries(Object.entries(env || process.env).filter(([name]) => !/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name)));
  let options = { cwd, env: safeEnv, detached: true };
  if (WINDOWS) {
    // Windows would look in cwd (the project) before PATH
    file = path.isAbsolute(cmd) ? cmd : await findExecutable(cmd);
    if (!file) throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' });
    // detached gives it no console, so every program it runs would open a console window of its own
    options = { ...options, detached: false, windowsHide: true };
    // CreateProcess needs the extended-length form for a working directory beyond MAX_PATH.
    if (cwd.length >= 248) options.cwd = path.toNamespacedPath(path.resolve(cwd));
    if (/\.(bat|cmd)$/i.test(file)) {
      // ponytail: a batch file that turns on delayed expansion still expands !name! in its arguments
      args = ['/d', '/s', '/c', `"${[cmdEscape(file), ...args.map((a) => cmdEscape(`"${a}"`))].join(' ')}"`];
      file = process.env.ComSpec || 'cmd.exe';
      options.windowsVerbatimArguments = true;
    }
  }
  if (profile) {
    // found first, as a spawn would: a program that isn't installed is still ENOENT, not sandbox-exec's own error
    const found = path.isAbsolute(cmd) ? cmd : await findExecutable(cmd, safeEnv[PATH_KEY]);
    if (!found) throw Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' });
    args = ['-p', profile, found, ...args];
    file = SANDBOX_EXEC;
  }
  // a stopped compile starts nothing more
  if (stopped()) return { code: null, timedOut: false };
  const job = jobs.getStore();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    children.add(child);
    job?.children.add(child);
    if (job?.lowPriority && child.pid) {
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
      } catch {
        // it runs at the usual priority
      }
    }
    if (WINDOWS) child.stdin.on('error', () => {});
    if (input != null) {
      // a command that never reads it closes the pipe first
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, limit);
    child.stdout.on('data', pushLog);
    child.stderr.on('data', pushLog);
    const failed = (err) => {
      clearTimeout(timer);
      if (WINDOWS && child.pid) killGroup(child);
      children.delete(child);
      job?.children.delete(child);
      reject(err);
    };
    child.on('error', failed);
    if (WINDOWS) {
      child.stdout.on('error', failed);
      child.stderr.on('error', failed);
    }
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
    searchPath: await texPath(texFolder),
    // its output as it comes, for the editor's live view
    log: compileId ? openLog(compileId) : null
  };
  const key = compileId || Symbol('compile');
  running.set(key, job);
  try {
    // read here, never taken from the request: only the switch in the Compile menu trusts a project
    const trusted = await isTrusted(projectId, projectRoot);
    const result = await jobs.run(job, () => compileWithLinks(engine, projectRoot, absMain, mainFile, { ...options, trusted }));
    // inside the compile, so the project's folder isn't moved from under it either
    if (checkpoint && result.ok && result.status === 0) result.checkpoint = await createCompileCheckpoint(projectRoot);
    // doc: the document compiled, which a % !TEX root comment may have changed
    return { ...result, doc: mainFile };
  } finally {
    running.delete(key);
    if (compileId) closeLog(compileId);
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

/**
 * A compile of a folder that isn't a project (an agent's copy), as the agent's tools and the review's preview run one
 * inside isolation: built in buildDir (the temp folder's spectrum-build by default), nothing written into the folder,
 * and no kept files, SyncTeX or checkpoints. env: more for TeX's; without: engines Auto doesn't pick; untrusted: no
 * shell escape, for a draft compiled outside isolation (on Windows), which runs the same helpers as the user's own
 * compile there (Biber, BibTeX, the index and glossary tools, latexmk with no rc file). warmUp: the background
 * warm-up's, at low priority, stopped by its signal. Resolves as runCompile does, with the PDF in base64.
 */
export async function compileFolder({ root, mainFile, engine = 'auto', texFolder, signal, ...options }) {
  if (!SUPPORTED_ENGINES.includes(engine) || options.without?.includes(engine)) return { ok: false, error: `Unsupported engine: ${engine}`, engine };
  const absMain = safeJoin(root, String(mainFile || ''));
  if (path.basename(absMain).startsWith('-')) return { ok: false, error: 'The main file’s name can’t start with “-”.', engine };
  if (!(await fs.stat(absMain).catch(() => null))?.isFile()) return { ok: false, error: `The main file “${mainFile}” doesn’t exist.`, engine };
  const job = { stopped: false, children: new Set(), searchPath: await texPath(texFolder), lowPriority: options.warmUp === true };
  signal?.addEventListener('abort', () => {
    job.stopped = true;
    for (const child of job.children) killGroup(child);
  });
  const file = docPath(root, absMain);
  return jobs.run(job, () => {
    if (/\.typ$/i.test(absMain)) return compileTypst(root, absMain, file, { ...options, scratch: true });
    if (/\.(md|markdown)$/i.test(absMain)) return compileMarkdown(root, absMain, file, engine, { ...options, scratch: true });
    return compileDocument(engine, root, absMain, file, { ...options, scratch: true });
  });
}

async function compileWithLinks(engine, projectRoot, absMain, mainFile, options) {
  // Typst needs no cross-reference passes or secondary programs: one run writes the PDF
  if (/\.typ$/i.test(absMain)) return compileTypst(projectRoot, absMain, mainFile, options);
  // Markdown goes through pandoc first
  if (/\.(md|markdown)$/i.test(absMain)) return compileMarkdown(projectRoot, absMain, mainFile, engine, options);
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

export async function compileDocument(engine, projectRoot, absMain, mainFile, options) {
  // a .md's generated LaTeX never uses xjyutping; a document Spectrum can't read for it compiles as it would without
  const jyutping = options.markdownSource ? null : await jyutpingDocument(projectRoot, absMain, options).catch(() => null);
  // auto mode's copy takes the page colour's lines too; any other document is compiled from a copy of its own
  if (options.pageColour && !jyutping?.auto) return compileColoured(engine, projectRoot, absMain, mainFile, options);
  if (jyutping) return compileJyutping(engine, projectRoot, absMain, mainFile, options, jyutping);
  if (engine !== 'auto') return { ...(await compileWith(engine, projectRoot, absMain, mainFile, options)), engine };
  const candidates = await autoEngineCandidates(absMain, options.without);
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

/**
 * The engine for a document that uses xjyutping: XeLaTeX or LuaLaTeX as the project chose, latexmk running one of them,
 * otherwise (Auto, pdfLaTeX, Tectonic) XeLaTeX, or LuaLaTeX for a LuaTeX-ja document or when it's the one installed.
 * { engine, latexmk?, note? (when it isn't the engine the compile would have used) } or { error }.
 */
async function jyutpingEngine(engine, absMain, lua, without = []) {
  if (engine === 'xelatex' || engine === 'lualatex') return { engine };
  if (engine === 'latexmk') return { engine, latexmk: lua ? 'lualatex' : 'xelatex' };
  for (const choice of lua ? ['lualatex', 'xelatex'] : ['xelatex', 'lualatex']) {
    if (without.includes(choice) || !(await findExecutable(choice))) continue;
    const usual = engine === 'auto' ? (await autoEngineCandidates(absMain, without))[0] : engine;
    return { engine: choice, ...(usual !== choice && { note: `[spectrum note] This compile used ${ENGINE_NAMES[choice]}, as Jyutping (xjyutping) needs XeLaTeX or LuaLaTeX.` }) };
  }
  return { error: XJYUTPING_ENGINE_ERROR };
}

/**
 * A document that loads xjyutping, or one auto mode adds it to: compiled with an engine that can load it, auto mode's
 * from a copy with jyutpingscope in it (writeAutoCopy) whose paths the log and SyncTeX then give as the project's.
 */
async function compileJyutping(engine, projectRoot, absMain, mainFile, options, jyutping) {
  const picked = await jyutpingEngine(engine, absMain, jyutping.lua, options.without);
  if (picked.error) return { ok: false, error: picked.error, engine };
  const base = options.scratch ? options.buildDir || path.join(os.tmpdir(), 'spectrum-build') : await cachePath(projectRoot, 'jyutping');
  const coloured = jyutping.auto && options.pageColour ? { ...jyutping, tex: pageColourLines(jyutping.tex, options.pageColour) } : jyutping;
  const copy = jyutping.auto ? await writeAutoCopy(projectRoot, absMain, coloured, picked.engine, base) : null;
  try {
    // or the page colour's copy (compileColoured), which removes its own
    const result = await compileWith(picked.engine, projectRoot, absMain, mainFile, { ...options, latexmkEngine: picked.latexmk, sourceCopy: copy ?? options.sourceCopy });
    const log = copy ? projectPaths(result.log, copy.root, projectRoot) : result.log;
    return { ...result, log: picked.note ? `${picked.note}\n${log ?? ''}` : log, engine: picked.engine };
  } finally {
    if (copy) await fs.rm(copy.root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

/**
 * Compile with page colour's lines for a LaTeX document, before its first \documentclass and on that line, so every
 * line stays where it was: '#rrggbb' as the page, once xcolor or color loads (as the class or the document loads it,
 * so a \pagecolor of the document's own comes later and wins), and beamer's normal text background, which its themes
 * set after. A document that loads neither gets xcolor at the end of its preamble. tex as it was when there's no
 * \documentclass. ponytail: needs LaTeX's hooks (2020-10); an xcolor loaded before the \documentclass line goes uncoloured
 */
export function pageColourLines(tex, hex) {
  // ceiling to five places, as xcolor keeps them, so a renderer that rounds down still gets the byte
  const rgb = [1, 3, 5].map((i) => Math.ceil((parseInt(hex.slice(i, i + 2), 16) / 255) * 1e5) / 1e5).join(',');
  const lines = [
    `\\def\\spectrumpagecolour{\\definecolor{spectrumpage}{rgb}{${rgb}}\\pagecolor{spectrumpage}}`,
    '\\AddToHook{package/xcolor/after}{\\spectrumpagecolour}\\AddToHook{package/color/after}{\\spectrumpagecolour}',
    '\\AddToHook{class/beamer/after}{\\setbeamercolor{normal text}{bg=spectrumpage}}',
    '\\AddToHook{begindocument/before}{\\ifdefined\\pagecolor\\else\\usepackage{xcolor}\\fi}'
  ].join('');
  // the first \documentclass outside a comment (\% isn't one)
  return tex.replace(/^((?:[^%\\\n]|\\[^\n])*?)(?=\\documentclass\b)/m, (before) => before + lines);
}

/** A document compiled from a copy of its main file with the page colour's lines (pageColourLines), its log naming the project's files. */
async function compileColoured(engine, projectRoot, absMain, mainFile, options) {
  const rest = { ...options, pageColour: undefined };
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  const coloured = pageColourLines(tex, options.pageColour);
  if (coloured === tex) return compileDocument(engine, projectRoot, absMain, mainFile, rest);
  const base = await cachePath(projectRoot, 'page-colour');
  await ensureDir(base);
  // without 8.3 names (RUNNER~1), whose ~ TeX would read as a space
  const root = realpathSync.native(await fs.mkdtemp(path.join(base, 'copy-')));
  const main = path.join(root, path.relative(projectRoot, absMain));
  try {
    await ensureDir(path.dirname(main));
    await fs.writeFile(main, coloured);
    const result = await compileDocument(engine, projectRoot, absMain, mainFile, { ...rest, sourceCopy: { root, main } });
    return { ...result, log: projectPaths(result.log, root, projectRoot) };
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
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
 * Windows has no font system Tectonic knows, so it is pointed at the Windows and per-user font folders (and a cache of
 * Spectrum's) by one small fontconfig file, written once. ponytail: a font put in a folder later isn't seen until the
 * file is written again (delete it to).
 */
let fontconfigFile = null;
export async function tectonicFontconfig() {
  if (process.platform !== 'win32') return null;
  if (!fontconfigFile) {
    const file = path.join(DATA_DIR, 'engines', 'fonts.conf');
    const xml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (!(await exists(file))) {
      const local = process.env.LOCALAPPDATA;
      await ensureDir(path.dirname(file));
      await fs.writeFile(file, [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
        '<fontconfig>',
        '  <dir>' + xml(path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts')) + '</dir>',
        ...(local ? ['  <dir>' + xml(path.join(local, 'Microsoft', 'Windows', 'Fonts')) + '</dir>'] : []),
        '  <cachedir>' + xml(path.join(DATA_DIR, 'engines', 'fontconfig-cache')) + '</cachedir>',
        '</fontconfig>',
        ''
      ].join('\n')).catch(() => undefined);
    }
    fontconfigFile = file;
  }
  return fontconfigFile;
}

// The Tectonic compiles running now, which the background warm-up (tectonicWarmUp.js) gives way to: 'start' as each
// begins, 'idle' when none is left
export const tectonicRuns = Object.assign(new EventEmitter(), { count: 0 });

async function compileWith(engine, projectRoot, absMain, mainFile, options = {}) {
  if (engine !== 'tectonic' || options.warmUp) return buildWith(engine, projectRoot, absMain, mainFile, options);
  tectonicRuns.count += 1;
  tectonicRuns.emit('start');
  try {
    return await buildWith(engine, projectRoot, absMain, mainFile, options);
  } finally {
    tectonicRuns.count -= 1;
    if (!tectonicRuns.count) tectonicRuns.emit('idle');
  }
}

/**
 * Build in the temp folder's spectrum-build/<runId> (removed afterwards) and put the PDF next to the
 * main file, e.g. chapters/thesis.tex -> chapters/thesis.pdf, the only file a compile writes in the project:
 * a sync client would copy anything else to the other computer. Its .aux files and SyncTeX are kept in the cache.
 */
async function buildWith(engine, projectRoot, absMain, mainFile, options = {}) {
  // Tectonic would run it as its Biber, from the folder it runs in: a program a project brought with it
  if (engine === 'tectonic' && holdsTectonicBiber(path.dirname(absMain))) {
    return { ok: false, error: 'This document’s folder has a file called tectonic-biber, which Tectonic would run as a program. Rename or remove it, or compile with another engine.' };
  }
  const buildRoot = options.buildDir || path.join(os.tmpdir(), 'spectrum-build');
  const runDir = path.join(buildRoot, crypto.randomUUID());
  // a scratch build (compileFolder's) keeps nothing
  const cache = options.scratch ? null : await cachePath(projectRoot);
  // kept under the .md for a Markdown document, so its next compile reuses them
  const doc = options.markdownSource ? mainFile : docPath(projectRoot, absMain);
  // latexmk builds in a folder of the document's own that stays between compiles, so it runs only what a change
  // calls for, as it does on a command line. Not a draft, which draws the same files another way, nor while another
  // compile of the document is using the folder: those build from nothing in a folder of their own, as every engine does
  const own = engine === 'latexmk' && cache && !options.draft ? keptStore(cache, doc, engine) : null;
  const held = own && !latexmkFolders.has(own) ? own : null;
  if (held) latexmkFolders.add(held);
  const outDir = held ?? runDir;
  await ensureDir(outDir);
  // the programs' temp files, beside the build rather than in it, where they would be taken for the document's own
  const tmpDir = `${runDir}-tmp`;
  await ensureDir(tmpDir);
  // this build's folders removed. latexmk's own stays as this build left it (keep: one without errors that ran to its
  // end), or goes back to how the last such build left it, so a Stop, an error or a crash is never built on.
  // ponytail: an exception past this leaves the folder marked as in use until the backend restarts, and later compiles
  // of the document build from nothing meanwhile
  const clean = async (keep = false) => {
    if (held) {
      if (!keep) await fs.rm(held, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
      await (keep ? fs.rm(held + LATEXMK_LAST, { recursive: true, force: true, maxRetries: 5 }) : fs.rename(held + LATEXMK_LAST, held)).catch(() => {});
      latexmkFolders.delete(held);
    }
    await cleanBuild(buildRoot, runDir);
  };
  // Like TeXShop, LaTeX Workshop and Tectonic, run from the main file's folder so
  // \input paths are relative to the main file. The project root stays on the search
  // paths, so paths written relative to the root keep working as well.
  const mainDir = path.dirname(absMain);
  const mainName = path.basename(absMain);
  // a Markdown document's own folder, which pandoc's generated file may still read images from
  const mdDir = options.markdownSource ? path.dirname(options.markdownSource) : null;
  // a copy of the document (sourceCopy: Jyutping's auto mode's, or the page colour's), whose folders TeX looks in first:
  // the main file it runs, and auto mode's chapters, found there before the project's own
  const copy = options.sourceCopy;
  const copyDirs = copy ? [path.join(copy.root, path.relative(projectRoot, mainDir)), copy.root].map(slashed) : [];
  // xjyutping (the user's folder, then Spectrum's) before TeX's own, and the bundled CJK fonts by file name, in every compile
  const jyutping = await jyutpingSearch(options.xjyutpingFolder);
  const before = (dirs, name) => [...dirs.map(slashed), process.env[name] ?? ''].join(path.delimiter);
  const sourceDirs = [...copyDirs.slice(0, 1), mainDir, ...copyDirs.slice(1), ...(mdDir && mdDir !== mainDir ? [mdDir] : []), projectRoot];
  const searchPath = (name, more = []) => before([...sourceDirs, ...more], name);
  const binPath = jobs.getStore()?.searchPath;
  let texEnv = {
    ...process.env,
    ...(binPath && { [PATH_KEY]: binPath }),
    LUAINPUTS: before(jyutping.tex, 'LUAINPUTS'),
    OPENTYPEFONTS: before([jyutping.fonts], 'OPENTYPEFONTS'),
    TTFONTS: before([jyutping.fonts], 'TTFONTS'),
    TEXINPUTS: searchPath('TEXINPUTS', jyutping.tex),
    BIBINPUTS: searchPath('BIBINPUTS'),
    BSTINPUTS: searchPath('BSTINPUTS'),
    ...options.env
  };
  if (engine === 'tectonic') {
    const fontconfig = await tectonicFontconfig();
    if (fontconfig) texEnv.FONTCONFIG_FILE = fontconfig;
  }
  const logChunks = [];
  let logSize = 0;
  const live = jobs.getStore()?.log;
  sendLog(live, 'engine', engine);
  const pushLog = (chunk) => {
    if (chunk) sendLog(live, 'output', chunk.toString());
    if (!chunk || logSize >= MAX_LOG_BYTES) return;
    const next = chunk.toString().slice(0, MAX_LOG_BYTES - logSize);
    logSize += next.length;
    logChunks.push(next);
  };
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  // a mismatched Biber on the PATH would refuse Tectonic's biblatex. Tectonic runs Biber for any biblatex document, so
  // Spectrum's is downloaded first when it isn't there yet
  let biber = engine === 'tectonic' ? tectonicBiber() : null;
  if (engine === 'tectonic' && !options.warmUp && !biber && needsBiber(tex)) biber = await fetchBiber(live, pushLog);
  if (stopped()) {
    await clean(true);
    return { ok: false, stopped: true, error: 'The compile was stopped.', log: logChunks.join(''), status: -1 };
  }
  texEnv = withBiber(texEnv, biber);
  // On a Mac every program of the compile runs confined (compileSandbox.js), unless the user trusts the project
  const box = options.trusted ? null : await compileSandbox({ build: outDir, tmp: tmpDir, searchPath: texEnv[PATH_KEY], tectonic: engine === 'tectonic', root: projectRoot, runs: [engineCommand(engine), biber] });
  // a trusted project's TeX writes where the document says, as its shell escape could anyway
  if (options.trusted) texEnv.openout_any = 'a';
  else if (box) texEnv = { ...texEnv, ...box.env };
  else if ((await confinement()) === 'no') pushLog(Buffer.from('[spectrum warning] This Mac’s sandbox-exec didn’t run, so this compile wasn’t confined.\n'));
  const confined = (name, runArgs, cwd, limit) => runSpawn(name, runArgs, cwd, pushLog, texEnv, limit, null, box?.profile);
  // the document's own steps and engine options (buildRecipe.js), run through `confined` as every pass is; inside an
  // agent's isolation its own limits confine them
  const recipe = options.markdownSource ? { steps: null, options: [] } : documentRecipe(tex, { trusted: !!options.trusted, confined: !!box || (await confinement()) === 'inside' });
  if (recipe.warning) pushLog(Buffer.from(`[spectrum warning] ${recipe.warning}\n`));
  const steps = MULTI_PASS_ENGINES.includes(engine) && !options.draft ? recipe.steps : null;
  if (recipe.steps && !steps) pushLog(Buffer.from('[spectrum note] This compile ran without the document’s “% !TEX recipe”, which applies to full compiles with pdfLaTeX, XeLaTeX or LuaLaTeX.\n'));
  // Recompile from scratch: nothing an earlier compile of the document kept, with any engine
  // (one a virus scanner still holds is left: none of it is copied in, and keepBuild clears it again)
  if (options.fresh && cache) await fs.rm(path.join(cache, 'build-files', doc), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  // ponytail: Tectonic chooses its own passes from nothing; latexmk has its folder (held)
  const multiPass = MULTI_PASS_ENGINES.includes(engine) && !steps;
  const store = cache && keptStore(cache, doc, engine);
  // first, so another document's .aux of the same name doesn't take the place of its own
  // what latexmk can't see change: the engine it runs, the shell escape it is given, and which TeX (the PATH, the
  // latexmk found on it, the xjyutping folders); with another of any, its folder starts from nothing
  const latexmkStamp = held ? JSON.stringify([options.latexmkEngine ?? 'pdf', options.trusted ? 'trusted' : options.untrusted ? 'untrusted' : '', texEnv[PATH_KEY] ?? '', await aboutFile(await findExecutable('latexmk', texEnv[PATH_KEY])), jyutping.tex, jyutping.fonts]) : '';
  const kept = held ? await openLatexmkFolder(held, latexmkStamp) : multiPass && store && !options.fresh && (await copyKept(store, outDir));
  // \include{chapters/x} writes chapters/x.aux into the output dir, so mirror the folders
  // as seen from the main file's folder and from the project root.
  // Other documents' kept .aux go in it too, where TeX looks first, for \externaldocument to find.
  const others = new Map(); // where each copy went, and its mtime then
  const projectFiles = await listFilesRecursive(projectRoot);
  for (const item of projectFiles) {
    if (item.type === 'dir') {
      await ensureDir(path.join(outDir, item.path));
      const fromMain = path.relative(mainDir, path.join(projectRoot, item.path));
      if (fromMain && !fromMain.startsWith('..')) await ensureDir(path.join(outDir, fromMain));
      continue;
    }
    // its own came from its kept files, if any
    if (!cache || !/\.tex$/i.test(item.path) || item.path === doc) continue;
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
  // taken out again before the next compile puts in those documents' newer ones
  if (held) await fs.writeFile(path.join(held, LATEXMK_COPIES), JSON.stringify([...others]));

  const input = copy ? slashed(copy.main) : `./${mainName}`;
  // The precompiled preamble (preambleFormat.js), for a full pdfLaTeX compile of the document as it is, with Spectrum's
  // own passes: not a draft, a copy with the page colour's or Jyutping's lines, a Markdown document's LaTeX, nor one
  // with a recipe or engine options of its own. format: one made and tried for the preamble as it is now, or null
  const preamble = options.precompile && FORMAT_ENGINES.includes(engine) && multiPass && cache && !options.draft && !copy && !options.markdownSource && !recipe.options.length ? preambleOf(tex) : null;
  const shell = options.untrusted ? '-no-shell-escape' : options.trusted ? '-shell-escape' : '-shell-restricted';
  const formatOf = preamble && { preamble, dir: path.join(cache, 'build-files', doc, `${engine}.format`), key: await formatKey({ preamble, mainName, shell, env: texEnv, files: projectFiles }), projectRoot };
  const format = formatOf && !options.noFormat ? await readyFormat(formatOf) : null;
  if (format) pushLog(Buffer.from(`[spectrum] This compile starts from a format of the preamble, made when the preamble last changed. The preamble’s own log, from then:\n${format.log}\n`));
  const commandFor = (dir, fmt) => buildCommand(engine, slashed(dir), input, { ...options, extra: recipe.options, format: fmt && slashed(fmt) });
  const { cmd, args } = commandFor(outDir, format?.file);
  // by the engine, as cmd is the built-in Tectonic's path when Spectrum carries one
  const limit = PASS_TIMEOUT_MS[engine] || DEFAULT_PASS_TIMEOUT_MS;
  if (engine === 'tectonic') {
    // Tectonic ignores TEXINPUTS; its unstable search-path option does the same job. It looks in the folder of the file
    // it runs first, which for a copy isn't the main file's
    const paths = [...new Set([mainDir, ...(mdDir ? [mdDir] : []), projectRoot, ...jyutping.tex, jyutping.fonts].map(slashed))].filter((dir) => dir !== slashed(path.dirname(copy ? copy.main : absMain)));
    args.unshift(...paths.flatMap((dir) => ['-Z', `search-path=${dir}`]));
  }
  // MiKTeX asks before installing a missing package, in a window the hidden engine never shows, so the
  // compile would sit until its time limit; this installs it without asking. ponytail: latexmk's own
  // engine runs still ask; pass -pdflatex="pdflatex --enable-installer %O %S" if that bites
  const miktex = WINDOWS && multiPass && /[\\/]miktex[\\/]/i.test((await findExecutable(cmd)) || '');
  if (miktex) args.unshift('--enable-installer');
  // the generated file's base for a Markdown document (main.md.tex), so the engine's log and PDF keep its name
  const base = path.basename(absMain, path.extname(absMain));
  // the whole log of the pass just run, which the log sent back may have cut short
  const passLog = async () => unwrap(await fs.readFile(path.join(outDir, `${base}.log`), 'utf8').catch(() => ''));

  let pass;
  let bibliographyStatus = 0;
  let retry = false;
  try {
    let before = await keptFiles(outDir);
    // Pass 1: generate .aux with \citation{} entries
    pass = steps ? await runRecipe(steps, { outDir, input, mainDir, base, options: { ...options, extra: recipe.options }, confined, pushLog }) : await confined(cmd, args, mainDir, limit);
    let log = await passLog();
    // with nothing changed latexmk runs nothing and says only that; the editor's warnings come from a pass's log
    if (held && pass.code === 0 && !/^This is \S*TeX/m.test(logChunks.join(''))) {
      pushLog(Buffer.from(`[spectrum] Nothing this document reads has changed, so latexmk ran no pass. The last pass said:\n${await fs.readFile(path.join(outDir, `${base}.log`), 'utf8').catch(() => '')}`));
    }
    const carryOn = () => !pass.timedOut && !stopped() && !(options.haltOnError && pass.code !== 0);
    const keptFailed = () => kept && pass.code !== 0 && !pass.timedOut && !stopped() && keptFileFailed(log, kept);
    retry = keptFailed();

    if (multiPass && !options.draft && !retry && carryOn()) {
      // what BibTeX reads, so a citation only a kept list put there (a caption's, from the .lof) goes again
      const cites = async () => (await auxWithInputs(outDir, `${base}.aux`)).match(/^\\(?:citation|bibdata|bibstyle)\{.*$/gm)?.join('\n') ?? '';
      let cited = await cites();
      bibliographyStatus = await runBibliography(outDir, base, tex, options, confined, pushLog, { dirs: sourceDirs, searchPath: texEnv[PATH_KEY] });
      // Pass 2 + 3: resolve citations and cross-references, while the last pass asks for another or changed what
      // TeX reads back
      for (let n = 2; n <= 3 && carryOn(); n += 1) {
        if (n > 2 && cited !== (cited = await cites())) bibliographyStatus = await runBibliography(outDir, base, tex, options, confined, pushLog, { dirs: sourceDirs, searchPath: texEnv[PATH_KEY] });
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
          // a .aux that would have the glossaries' programs run something else: neither runs
          const unsafe = input === 'glo' && glossariesUnsafe(await auxWithInputs(outDir, `${base}.aux`), base);
          if (unsafe) pushLog(Buffer.from('\n[spectrum warning] The glossary settings in this document’s .aux file (or its name) hold characters a command line would run, so makeglossaries wasn’t run.\n'));
          for (const tool of unsafe ? [] : [indexer, fallback].filter(Boolean)) {
            ran = await confined(tool, indexArgs(base), outDir).catch(() => null); // not installed
            if (ran?.code === 0 || stopped()) break;
          }
          if (ran?.code !== 0 && !stopped()) {
            pushLog(Buffer.from(`\n[spectrum warning] ${indexer} didn’t run, so the ${input === 'idx' ? 'index wasn’t' : 'glossaries weren’t'} built.\n`));
          }
          now = await keptFiles(outDir);
        }
        if (!RERUN.test(log) && sameFiles(before, now)) break;
        before = now;
        pass = await confined(cmd, args, mainDir, limit);
        log = await passLog();
        // a kept file can break a later pass too: natbib's on the .aux pass 1 wrote from a kept plain .bbl
        retry = keptFailed();
        if (retry) break;
      }
    }
  } catch (err) {
    await clean();
    return { ok: false, error: `${engine} isn’t available: ${err.message}` };
  }
  // a pass that started from the format and ended in an error of pdfTeX's own, or made no PDF: once more without it,
  // and where that compiles, the format is never used again
  if (format && !retry && pass.code !== 0 && !pass.timedOut && !stopped() && (FORMAT_FAULT.test(logChunks.join('')) || !(await exists(path.join(outDir, `${base}.pdf`))))) {
    await clean();
    const again = await compileWith(engine, projectRoot, absMain, mainFile, { ...options, noFormat: true });
    if (again.status === 0) await refuseFormat(formatOf);
    return again;
  }
  if (retry) {
    // a kept file TeX choked on (one from an older package version, say) never locks the document out
    await clean();
    const again = await compileWith(engine, projectRoot, absMain, mainFile, { ...options, fresh: true });
    return { ...again, log: `[spectrum] A file kept from the last compile couldn’t be read, so this compiled again from scratch.\n\n${again.log ?? ''}` };
  }
  // A later TeX pass can create a PDF even when Biber failed.
  let code = pass.code !== 0 ? pass.code : bibliographyStatus;

  let log = logChunks.join('');
  // the last PDF, SyncTeX and .aux stay as they were
  if (stopped()) {
    await clean();
    return { ok: false, stopped: true, error: 'The compile was stopped.', log, status: -1 };
  }
  if (pass.timedOut) {
    await clean();
    return { ok: false, error: 'The compile took too long and was stopped.', log, status: -1 };
  }
  // carrying on past errors, Tectonic still exits with 0
  if (engine === 'tectonic' && code === 0 && /^error: /m.test(log)) code = 1;
  // Tectonic's own TeX bundle ships an old biblatex that only works with biber 2.17.
  if (engine === 'tectonic' && /biblatex control file version/i.test(log)) {
    log += '\n[spectrum] This document uses biblatex, and Tectonic’s bundled biblatex needs a different biber version than the one installed. Compile it with Auto, pdfLaTeX or XeLaTeX instead.\n';
  }
  // what the sandbox or TeX's own limits stopped, which Trust this project (a project's switch) would allow
  if (cache && !options.trusted && !options.untrusted) log += blockedNotes(unwrap(log), await passLog(), { confined: !!box, failed: code !== 0 });
  // biblatex with Biber needs Spectrum's Biber, or a real TeX installation, which Auto has already preferred when there is one
  const notice = engine === 'tectonic' && !biber && needsBiber(tex) ? { code: 'BIBER_MISSING' } : null;
  if (notice) log += BIBLATEX_NOTE;
  // the built-in Tectonic fetches its bundle and each package on first use: offline, say what to do about it
  if (engine === 'tectonic' && code !== 0 && TECTONIC_DOWNLOAD.test(log)) {
    await clean();
    return { ok: false, error: TECTONIC_DOWNLOAD_ERROR, log, status: code ?? -1, ...notice };
  }
  let pdf;
  try {
    pdf = await fs.readFile(path.join(outDir, `${base}.pdf`));
  } catch {
    // a store Windows still holds is only reused, and a kept file TeX can't read compiles again from scratch
    if (multiPass && store) await fs.rm(store, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    await clean();
    return { ok: false, error: 'No PDF was produced.', log, status: code ?? -1, ...notice };
  }
  if (!cache) {
    await clean();
    return { ok: true, pdf: pdf.toString('base64'), log, status: code ?? 0, ...notice };
  }
  // a Markdown document's PDF goes beside the .md (base there is main, not main.md)
  const absPdf = options.markdownSource
    ? path.join(path.dirname(options.markdownSource), `${path.basename(options.markdownSource, path.extname(options.markdownSource))}.pdf`)
    : path.join(path.dirname(absMain), `${base}.pdf`);
  // the copy on disk is older than this compile's, so the editor keeps showing the one it was sent
  let pdfStale = false;
  try {
    const written = await writePdf(projectRoot, absPdf, pdf, log);
    log = written.log;
    pdfStale = written.stale;
    // SyncTeX jumps do not point into the .md, so a Markdown compile keeps none
    // (keepSynctex moves the file, and latexmk's folder keeps its own)
    const synctex = path.join(outDir, `${base}.synctex.gz`);
    const moved = held ? path.join(tmpDir, `${base}.synctex.gz`) : synctex;
    if (held) await fs.copyFile(synctex, moved).catch(() => {});
    if (!options.markdownSource) await keepSynctex(projectRoot, doc, moved, mainDir, copy?.root);
    // only a build without errors is read back; after one with errors the next compile starts from nothing. A draft
    // leaves the last full compile's: its .idx kept beside the old .ind would keep makeindex from running again
    if (multiPass && !options.draft) await (code === 0 ? keepBuild(outDir, store, others, await passLog()) : fs.rm(store, { recursive: true, force: true })).catch(() => {});
    await keepAux(outDir, auxStore(cache, doc), others, !held);
    if (held && code === 0) {
      // what filecontents wrote would be found before the source's new text, as in the other engines' kept files
      for (const [, name] of (await passLog()).matchAll(FILECONTENTS)) if (!name.includes('..')) await fs.rm(path.join(held, name), { force: true }).catch(() => {});
      // with what the folder was built with
      await fs.writeFile(path.join(held, KEPT_MARKER), latexmkStamp);
    }
  } finally {
    // only a build without errors is built on, as for the other engines
    await clean(code === 0);
  }
  // a format for this preamble, made and tried behind this compile, for the next one
  if (formatOf && !format && !options.noFormat && code === 0) {
    prepareFormat({ ...formatOf, mainDir, mainName, base, shell, env: texEnv, trusted: !!options.trusted, store, passArgs: commandFor, first: miktex ? ['--enable-installer'] : [] });
  }
  const pdfPath = docPath(projectRoot, absPdf);
  return { ok: true, pdf: pdf.toString('base64'), pdfPath, log, status: code ?? 0, ...(pdfStale && { pdfStale }), ...notice };
}

/**
 * Spectrum's Biber, downloaded now for a Tectonic compile that needs it, or null when it couldn't be (offline, say),
 * which the compile then says. What the download is doing goes to the editor's status line, and a Stop doesn't wait
 * for it (the download carries on for the next compile).
 */
async function fetchBiber(live, pushLog) {
  const { version, size } = biberDownload() ?? {};
  if (!version) return null;
  const doing = `Downloading Biber (${Math.round(size / 1e6)} MB)…`;
  pushLog(Buffer.from(`[spectrum] This document’s bibliography uses biblatex, which the built-in Tectonic runs with Biber. Downloading Biber ${version} (${Math.round(size / 1e6)} MB) first, once.\n`));
  sendLog(live, 'status', doing);
  let shown = -1;
  const progress = (received, total) => {
    const percent = Math.floor((received / total) * 100);
    // then it unpacks itself, which takes a moment
    if (percent !== shown) sendLog(live, 'status', (shown = percent) < 100 ? `${doing} ${percent}%` : 'Setting up Biber…');
  };
  let poll;
  const stop = new Promise((resolve) => (poll = setInterval(() => stopped() && resolve(null), 250)));
  try {
    const biber = await Promise.race([installBiber(progress), stop]);
    if (biber) pushLog(Buffer.from(`[spectrum] Downloaded Biber ${version}.\n`));
    return biber;
  } catch (err) {
    pushLog(Buffer.from(`[spectrum] Couldn’t download Biber: ${err.message}\n`));
    return null;
  } finally {
    clearInterval(poll);
    sendLog(live, 'status', '');
  }
}

/**
 * BibTeX or Biber after the first pass, when the .aux cites anything or names a bibliography: the tool chosen, else
 * a `% !BIB program = biber` comment's, else Biber for biblatex. Resolves 1 or Biber's code when Biber failed.
 */
async function runBibliography(outDir, base, tex, { bibTool } = {}, run, pushLog, { dirs = [], searchPath } = {}) {
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
  // Biber takes a second or two, most of an edit's compile, and makes the same .bbl from the same control file,
  // .bib files and Biber: with all three as they were for the kept .bbl, it isn't run. ponytail: BibTeX always
  // runs (a twentieth of a second)
  const recordFile = path.join(outDir, base + BIB_RECORD);
  const reads = useBiber ? await biberReads(outDir, base, dirs, searchPath) : null;
  const made = reads && (await fs.readFile(recordFile, 'utf8').catch(() => ''));
  if (reads && made === `${reads}\n${await fileHash(path.join(outDir, `${base}.bbl`))}`) {
    pushLog(Buffer.from('[spectrum] The bibliography is unchanged, so Biber wasn’t run.\n'));
    return 0;
  }
  await fs.rm(recordFile, { force: true });
  // MiKTeX's bibtex asks before installing a missing .bst, as its engines do
  if (WINDOWS && bibCmd === 'bibtex' && /[\\/]miktex[\\/]/i.test((await findExecutable('bibtex')) || '')) bibArgs.unshift('--enable-installer');
  try {
    const bibliography = await run(bibCmd, bibArgs, outDir);
    // Stop ended it, or came before it started: Biber didn't fail
    if (stopped()) return 0;
    if (useBiber && (bibliography.code !== 0 || bibliography.timedOut)) {
      pushLog(Buffer.from('[spectrum] Biber failed. Fix the bibliography errors above and compile again.\n'));
      return bibliography.code || 1;
    }
    const bbl = reads && (await fileHash(path.join(outDir, `${base}.bbl`)));
    if (bbl) await fs.writeFile(recordFile, `${reads}\n${bbl}`);
  } catch (err) {
    if (useBiber) {
      pushLog(Buffer.from(`[spectrum] Biber could not run: ${err.message}. Install Biber with your TeX distribution and compile again.\n`));
      return 1;
    }
    pushLog(Buffer.from(`[warn] ${bibCmd} not available, skipping bibliography pass.\n`));
  }
  return 0;
}

const fileHash = async (file) => {
  const bytes = await fs.readFile(file).catch(() => null);
  return bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : '';
};
// each file Biber is told to read: <bcf:datasource type="file" datatype="bibtex" glob="false">refs.bib</bcf:datasource>
const BCF_SOURCE = /<bcf:datasource\b([^>]*)>([^<]*)<\/bcf:datasource>/g;

/**
 * Everything Biber reads for <base>.bcf, as one hash: the control file (the citations, the style's sorting and data
 * model, the options), each .bib file's bytes, found as Biber finds it (the build folder, then BIBINPUTS' folders, dirs), the
 * Biber it would run and the user's own biber.conf. null when it can't be told, and Biber then runs: no control file, a
 * source that isn't a plain file in those folders (a pattern, an address, one TeX's own tree holds), or no Biber.
 */
async function biberReads(outDir, base, dirs, searchPath) {
  const bcf = await fs.readFile(path.join(outDir, `${base}.bcf`), 'utf8').catch(() => null);
  const biber = bcf && (await findExecutable('biber', searchPath));
  if (!biber) return null;
  const hash = crypto.createHash('sha256').update(bcf);
  for (const [, attributes, name] of bcf.matchAll(BCF_SOURCE)) {
    if (!/type="file"/.test(attributes) || /glob="true"/.test(attributes) || /[&*?[\]{}]|^\w+:\/\//.test(name)) return null;
    let found = null;
    for (const dir of [outDir, ...dirs]) {
      const bytes = await fs.readFile(path.resolve(dir, name.trim())).catch(() => null);
      if (bytes) {
        found = bytes;
        break;
      }
    }
    if (!found) return null;
    hash.update(`\n${name}\n`).update(found);
  }
  const home = os.homedir();
  for (const file of [biber, path.join(home, '.biber.conf'), path.join(home, 'Library', 'biber', 'biber.conf'), path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'biber', 'biber.conf')]) hash.update(`\n${await aboutFile(file)}`);
  return hash.digest('hex');
}

/**
 * A document's own steps (buildRecipe.js), each through the compile's confinement (confined): an engine as the compile
 * runs it, with the step's options after the document's; any other program in the build folder, as Biber and makeindex
 * run, with %DOC%, %OUTDIR% and %DIR% filled in. Resolves as the last engine pass did.
 * ponytail: MiKTeX's --enable-installer isn't added to a recipe's engine steps, so one may wait on a missing package
 */
async function runRecipe(steps, { outDir, input, mainDir, base, options, confined, pushLog }) {
  let pass = { code: 0, timedOut: false };
  for (const { program, args: given } of steps) {
    if (stopped() || pass.timedOut || (options.haltOnError && pass.code !== 0)) break;
    const args = given.map((arg) => arg.replaceAll('%DOC%', base).replaceAll('%OUTDIR%', slashed(outDir)).replaceAll('%DIR%', slashed(mainDir)));
    pushLog(Buffer.from(`\n[spectrum] Recipe: ${[program, ...args].join(' ')}\n`));
    if (MULTI_PASS_ENGINES.includes(program)) {
      const command = buildCommand(program, slashed(outDir), input, { ...options, extra: [...(options.extra ?? []), ...args] });
      pass = await confined(command.cmd, command.args, mainDir, PASS_TIMEOUT_MS[program] || DEFAULT_PASS_TIMEOUT_MS);
      continue;
    }
    // the glossaries' programs read names from the .aux, as Spectrum's own run of them does
    if (/^makeglossaries/.test(program) && !options.trusted && glossariesUnsafe(await auxWithInputs(outDir, `${base}.aux`), base)) {
      pushLog(Buffer.from('[spectrum warning] The glossary settings in this document’s .aux file (or its name) hold characters a command line would run, so makeglossaries wasn’t run.\n'));
      continue;
    }
    const ran = await confined(program, args, outDir).catch((err) => (pushLog(Buffer.from(`[spectrum warning] ${program} couldn’t run: ${err.message}\n`)), null));
    if (ran && ran.code !== 0 && !stopped()) pushLog(Buffer.from(`[spectrum warning] ${program} ended with ${ran.timedOut ? 'its time limit' : `code ${ran.code}`}.\n`));
  }
  return pass;
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
export async function keptFiles(outDir) {
  const files = new Map();
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type === 'file' && keptFile(rel) && !rel.endsWith(BIB_RECORD)) files.set(rel, await fs.readFile(path.join(outDir, rel)));
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

// the latexmk folders compiles are building in now
const latexmkFolders = new Set();
// beside latexmk's folder while a build runs in it: the folder as the last build without errors left it
const LATEXMK_LAST = '.last';
// other documents' .aux files the last compile copied into latexmk's folder: [[name, its time then]]
const LATEXMK_COPIES = '.spectrum-copies';
const aboutFile = async (file) => {
  const stat = file ? await fs.stat(file).catch(() => null) : null;
  return `${file}:${stat ? `${stat.size}:${stat.mtimeMs}` : ''}`;
};

/**
 * latexmk's own folder for a document, made ready for a compile: as its last build without errors left it when that
 * one was built with the same things (stamp, which the marker holds), else empty. A copy of it is kept beside it until
 * this build ends (buildWith's clean puts it back unless this one ends well too); one still there now is from a build
 * that never ended (a crash), and is put back first. The other documents' .aux files the last build copied in go,
 * unless TeX wrote over them since. The names of the files in it, for telling an error in one of them
 * (keptFileFailed), or null when it is empty.
 */
async function openLatexmkFolder(dir, stamp) {
  const last = dir + LATEXMK_LAST;
  const gone = { recursive: true, force: true, maxRetries: 5 };
  if (await exists(last)) {
    await fs.rm(dir, gone);
    await fs.rename(last, dir);
  }
  const usable = (await fs.readFile(path.join(dir, KEPT_MARKER), 'utf8').catch(() => null)) === stamp;
  if (!usable) await fs.rm(dir, gone).catch(() => {});
  await ensureDir(dir);
  if (!usable) return null;
  // a clone where the disk makes them (APFS), so a large PDF costs nothing
  await fs.cp(dir, last, { recursive: true, mode: fsConstants.COPYFILE_FICLONE });
  const copies = await fs.readFile(path.join(dir, LATEXMK_COPIES), 'utf8').then(JSON.parse).catch(() => []);
  for (const [rel, time] of Array.isArray(copies) ? copies : []) {
    const file = path.join(dir, String(rel));
    if ((await fs.stat(file).catch(() => null))?.mtimeMs === time) await fs.rm(file, { force: true });
  }
  return (await listFilesRecursive(dir)).filter((item) => item.type === 'file').map((item) => slashed(item.path));
}

/**
 * Replace the document's kept .aux with this build's, \include'd chapters' too, but not other documents'
 * (a copy TeX wrote over is this document's own).
 */
async function keepAux(outDir, store, others, move = true) {
  await fs.rm(store, { recursive: true, force: true });
  for (const { path: rel, type } of await listFilesRecursive(outDir)) {
    if (type !== 'file' || !rel.endsWith('.aux')) continue;
    if (others.has(rel) && others.get(rel) === (await fs.stat(path.join(outDir, rel))).mtimeMs) continue;
    await ensureDir(path.dirname(path.join(store, rel)));
    // latexmk's folder keeps its own
    if (move) await renameOver(path.join(outDir, rel), path.join(store, rel));
    else await fs.copyFile(path.join(outDir, rel), path.join(store, rel));
  }
}

export async function cleanBuild(buildRoot, outDir) {
  // retried: on Windows a virus scanner can still hold a file the engine just wrote
  await fs.rm(outDir, { recursive: true, force: true, maxRetries: 5 });
  // a LaTeX build's temp folder, beside it
  await fs.rm(`${outDir}-tmp`, { recursive: true, force: true, maxRetries: 5 });
  await fs.rmdir(buildRoot).catch(() => {}); // only succeeds once no other run is using it
}

/**
 * Writes a compile's PDF beside the source. Windows locks a PDF open in another viewer (Acrobat), where the preview,
 * SyncTeX and .aux still update: the copy on disk then keeps the older one, and the log says so. So it does when the
 * PDF there is a link out of the project, or to nothing, which is never written through.
 */
export async function writePdf(projectRoot, absPdf, pdf, log) {
  try {
    safeJoin(projectRoot, absPdf);
  } catch (err) {
    return { stale: true, log: log + `\n[spectrum warning] ${path.basename(absPdf)} wasn’t updated. ${err.message}\n` };
  }
  try {
    await fs.writeFile(absPdf, pdf);
    return { stale: false, log };
  } catch (err) {
    if (!WINDOWS || !['EBUSY', 'EPERM'].includes(err.code)) throw err;
    return { stale: true, log: log + `\n[spectrum warning] ${path.basename(absPdf)} is open in another program, so the copy next to the source wasn’t updated.\n` };
  }
}
