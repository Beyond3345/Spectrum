import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DATA_DIR } from '../config/constants.js';
import { ensureDir } from '../utils/fsUtils.js';
import { readProjectSettings } from './projectSettings.js';
import { BUILT_IN_TYPST_VERSION, typstFor } from './engineService.js';
import { MAX_LOG_BYTES, cleanBuild, runSpawn, writePdf } from './compileService.js';

const execFileAsync = promisify(execFile);

// Typst's first import of an @preview package needs the internet; the package stays cached after that
const PACKAGE_FAILED = /failed to (?:download|load) package/i;
const PACKAGE_NOTE = '\n[spectrum] Typst downloads a package the first time a document imports it. Connect to the internet and compile again; after that it works offline.\n';
// with --diagnostic-format short: main.typ:3:1: error: unknown variable: foo, then any hint lines
const DIAGNOSTIC = /^(.*?):(\d+):(\d+): (error|warning): (.*)$/;
const HINT = /^\s*(?:hint|help):\s*(.*)$/;
const LABEL = /<\s*([A-Za-z0-9_:.-]+)\s*>/g;
// what Typst's eval asks the compiled document for: each heading, and every label's page and number
const ELEMENTS = [
  '{',
  '  let names = (NAMES)',
  '  let labelled = names.map(name => {',
  '    let found = query(selector(label(name)))',
  '    if found.len() == 0 { return none }',
  '    let e = found.first()',
  '    let kind = e.func()',
  '    (label: name, func: repr(kind), page: e.location().page(), number: if kind == heading {',
  '      if e.numbering == none { "" } else { counter(heading).at(e.location()).map(str).join(".") }',
  '    } else if kind == figure {',
  '      if e.numbering == none { "" } else { e.counter.at(e.location()).map(str).join(".") }',
  '    } else if kind == math.equation {',
  '      if e.numbering == none { "" } else { counter(math.equation).at(e.location()).map(str).join(".") }',
  '    } else { "" })',
  '  }).filter(item => item != none)',
  '  (',
  '    headings: query(heading).map(h => (level: h.level, number: if h.numbering == none { "" } else { counter(heading).at(h.location()).map(str).join(".") }, page: h.location().page())),',
  '    labelled: labelled',
  '  )',
  '}'
].join('\n');

/** A diagnostic's file as the project sees it, with forward slashes: Typst prints it from the folder it ran in. */
function projectPath(file, projectRoot, cwd) {
  const raw = String(file).trim();
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  const rel = path.relative(projectRoot, abs);
  return rel.startsWith('..') || path.isAbsolute(rel) ? raw.split(path.sep).join('/') : rel.split(path.sep).join('/');
}

/** Typst's errors and warnings from a short-format log, each hint added to the message of the diagnostic before it. */
export function parseTypstDiagnostics(log, projectRoot, cwd = projectRoot) {
  const diagnostics = [];
  let last = null;
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = line.match(DIAGNOSTIC);
    if (match) {
      last = {
        severity: match[4],
        message: match[5].trim(),
        file: projectPath(match[1], projectRoot, cwd),
        line: Number(match[2]),
        column: Number(match[3])
      };
      diagnostics.push(last);
      continue;
    }
    const hint = line.match(HINT);
    if (hint && last) last.message += '\nHint: ' + hint[1].trim();
  }
  return diagnostics;
}

/** Every label in a document and its one-level includes: Typst's eval finds a heading's label by querying it. */
async function labelNames(projectRoot, absMain) {
  const labels = new Set();
  const visit = async (file, depth) => {
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    for (const match of text.matchAll(LABEL)) labels.add(match[1]);
    if (depth > 0) return;
    for (const match of text.matchAll(/#include\s+"([^"]+)"/g)) {
      const next = path.resolve(path.dirname(file), match[1]);
      if (next === projectRoot || next.startsWith(projectRoot + path.sep)) await visit(next, depth + 1);
    }
  };
  await visit(absMain, 0);
  return [...labels];
}

/**
 * What Typst itself knows about a compiled document: every heading with its number and page, and every label with its
 * page and number. One eval run, in the document's context, with the Typst compileTypst picks (the project's pin, else
 * fallback, the app's default); null when that Typst isn't installed or is too old (before 0.13) to have it.
 */
export async function typstElements(projectRoot, doc, fallback = '') {
  const settings = await readProjectSettings(projectRoot);
  const executable = typstFor(settings.compile?.typstVersion || fallback);
  if (!executable) return null;
  const absMain = path.join(projectRoot, doc);
  // a lone name in (…) is a grouping, not an array: the trailing comma keeps it one
  const names = (await labelNames(projectRoot, absMain)).map((name) => JSON.stringify(name));
  const namesArg = names.length ? names.join(', ') + ',' : '';
  const fontFolder = path.join(projectRoot, 'fonts');
  const fonts = (await fs.stat(fontFolder).catch(() => null))?.isDirectory() ? ['--font-path', fontFolder] : [];
  try {
    const { stdout } = await execFileAsync(executable, ['eval', '--in', absMain, '--root', projectRoot, '--format', 'json', ...fonts, ELEMENTS.replace('NAMES', namesArg)], {
      cwd: projectRoot,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, TYPST_PACKAGE_CACHE_PATH: path.join(DATA_DIR, 'typst', 'packages') }
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Compiles a .typ main file in outDir and writes its PDF beside it (a scratch build only returns it). The project's
 * Typst version wins over options.typstVersion, the app's default; typstInputs become the document's sys.inputs;
 * scratch keeps the package cache in the agent's home.
 * source, when given, is compiled from standard input in place of absMain (a Markdown document's generated Typst).
 */
export async function compileTypst(projectRoot, absMain, mainFile, options = {}) {
  const settings = await readProjectSettings(projectRoot);
  const pinned = settings.compile?.typstVersion || options.typstVersion || '';
  const executable = typstFor(pinned);
  if (!executable) {
    if (pinned) {
      // from: the project's pin or the app's default, which Logs' card offers different ways out of
      if (settings.compile?.typstVersion) {
        return { ok: false, code: 'TYPST_VERSION_MISSING', version: pinned, from: 'project', error: 'Typst ' + pinned + ' isn’t installed on this computer. Download it, or use the default version.' };
      }
      return { ok: false, code: 'TYPST_VERSION_MISSING', version: pinned, from: 'default', builtIn: BUILT_IN_TYPST_VERSION, error: 'Typst ' + pinned + ' is the default version in Settings › Engines, and it isn’t installed on this computer. Download it, or use the built-in version.' };
    }
    return { ok: false, error: 'Typst isn’t available in this copy of Spectrum.' };
  }
  const buildRoot = options.buildDir || path.join(os.tmpdir(), 'spectrum-build');
  const outDir = path.join(buildRoot, crypto.randomUUID());
  await ensureDir(outDir);
  const base = path.basename(mainFile, path.extname(mainFile));
  const fontFolder = path.join(projectRoot, 'fonts');
  const fonts = (await fs.stat(fontFolder).catch(() => null))?.isDirectory() ? ['--font-path', fontFolder] : [];
  const inputs = Object.entries(options.typstInputs || {}).flatMap(([key, value]) => ['--input', key + '=' + value]);
  const env = {
    ...process.env,
    // Spectrum's own cache is never passed into an agent's sandbox: there the agent's home keeps it
    TYPST_PACKAGE_CACHE_PATH: options.scratch
      ? path.join(process.env.HOME || os.homedir(), 'typst-packages')
      : path.join(DATA_DIR, 'typst', 'packages')
  };
  const chunks = [];
  let size = 0;
  const pushLog = (chunk) => {
    if (!chunk || size >= MAX_LOG_BYTES) return;
    const next = chunk.toString().slice(0, MAX_LOG_BYTES - size);
    size += next.length;
    chunks.push(next);
  };
  let result;
  try {
    result = await runSpawn(
      executable,
      ['compile', '--root', projectRoot, '--diagnostic-format', 'short', ...fonts, ...inputs, options.source == null ? absMain : '-', path.join(outDir, base + '.pdf')],
      path.dirname(absMain),
      pushLog,
      env,
      undefined,
      options.source ?? null
    );
  } catch (err) {
    await cleanBuild(buildRoot, outDir);
    return { ok: false, error: 'Typst isn’t available: ' + err.message, engine: 'typst' };
  }
  let log = chunks.join('');
  if (PACKAGE_FAILED.test(log)) log += PACKAGE_NOTE;
  const errors = parseTypstDiagnostics(log, projectRoot, path.dirname(absMain));
  const typed = (extra) => ({ engine: 'typst', typstVersion: pinned || BUILT_IN_TYPST_VERSION, log, errors, ...extra });
  if (result.code === null && !result.timedOut) {
    await cleanBuild(buildRoot, outDir);
    return typed({ ok: false, stopped: true, error: 'The compile was stopped.', status: -1 });
  }
  if (result.timedOut) {
    await cleanBuild(buildRoot, outDir);
    return typed({ ok: false, error: 'The compile took too long and was stopped.', status: -1 });
  }
  let pdf;
  try {
    pdf = await fs.readFile(path.join(outDir, base + '.pdf'));
  } catch {
    await cleanBuild(buildRoot, outDir);
    return typed({ ok: false, error: 'No PDF was produced.', status: result.code ?? -1 });
  }
  // a scratch build (compileFolder's) writes nothing into the folder it compiled
  if (options.scratch) {
    await cleanBuild(buildRoot, outDir);
    return typed({ ok: true, pdf: pdf.toString('base64'), status: result.code ?? 0 });
  }
  const absPdf = path.join(path.dirname(absMain), base + '.pdf');
  let written;
  try {
    written = await writePdf(projectRoot, absPdf, pdf, log);
  } finally {
    await cleanBuild(buildRoot, outDir);
  }
  return typed({
    ok: true,
    pdf: pdf.toString('base64'),
    pdfPath: path.relative(projectRoot, absPdf).split(path.sep).join('/'),
    log: written.log,
    status: result.code ?? 0,
    ...(written.stale && { pdfStale: true })
  });
}
