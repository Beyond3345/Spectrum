import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { ensureDir } from '../utils/fsUtils.js';
import { readProjectSettings } from './projectSettings.js';
import { BUILT_IN_TYPST_VERSION, typstFor } from './engineService.js';
import { MAX_LOG_BYTES, cleanBuild, runSpawn, writePdf } from './compileService.js';

// Typst's first import of an @preview package needs the internet; the package stays cached after that
const PACKAGE_FAILED = /failed to (?:download|load) package/i;
const PACKAGE_NOTE = '\n[spectrum] Typst downloads a package the first time a document imports it. Connect to the internet and compile again; after that it works offline.\n';
// with --diagnostic-format short: main.typ:3:1: error: unknown variable: foo, then any hint lines
const DIAGNOSTIC = /^(.*?):(\d+):(\d+): (error|warning): (.*)$/;
const HINT = /^\s*(?:hint|help):\s*(.*)$/;

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

/**
 * Compiles a .typ main file in outDir and writes its PDF beside it. options.typstVersion wins over the project's
 * setting; typstInputs become the document's sys.inputs; scratch keeps the package cache in the agent's home.
 * source, when given, is compiled from standard input in place of absMain (a Markdown document's generated Typst).
 */
export async function compileTypst(projectRoot, absMain, mainFile, options = {}) {
  const settings = await readProjectSettings(projectRoot);
  const pinned = options.typstVersion !== undefined ? options.typstVersion : settings.compile?.typstVersion || '';
  const executable = typstFor(pinned);
  if (!executable) {
    if (pinned) {
      return { ok: false, code: 'TYPST_VERSION_MISSING', version: pinned, error: 'Typst ' + pinned + ' isn’t installed on this computer. Download it, or use the default version.' };
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
  const absPdf = path.join(path.dirname(absMain), base + '.pdf');
  let written;
  try {
    written = await writePdf(absPdf, pdf, log);
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
