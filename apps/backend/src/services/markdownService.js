import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { ensureDir, listFilesRecursive } from '../utils/fsUtils.js';
import { cachePath } from './projectService.js';
import { readProjectSettings } from './projectSettings.js';
import { PANDOC_DOWNLOADABLE, PANDOC_MINIMUM, pandocPath, versionOf } from './engineService.js';
import { MAX_LOG_BYTES, compileDocument, findExecutable, runSpawn } from './compileService.js';
import { compileTypst } from './typstService.js';

// Markdown compiles in two steps: pandoc writes LaTeX or Typst, then that is compiled like any document. An error in
// the generated text is traced back to the .md line by matching its words, as a PDF jump finds its line.

const PANDOC_MISSING = 'Markdown needs pandoc. Download it from Settings › Engines › Markdown.';
const PANDOC_UNREADABLE = 'pandoc couldn’t read this Markdown.';
const SVG_NOTE = '\n[spectrum] SVG images need rsvg-convert (brew install librsvg), so they were left out.\n';
// a TeX error naming the generated file and its line, as -file-line-error writes it
const LOCATED_TEX = /^(?:\.\/)?([^\s:]+\.(?:tex|sty|cls|bbl)):(\d+):\s*(.*)$/;
const SVG = /(?:!\[[^\]]*\]\([^)]*?\.svg|src=["'][^"']+?\.svg)/i;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const escapeRegExp = (text) => text.replace(/[.*+?^`{}$()|[\]\\]/g, '\\$&');

/** The YAML front matter (between a first --- and the next --- or ...), scalar and list fields, and the text after it. */
export function parseFrontMatter(source) {
  const lines = String(source || '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: lines.join('\n') };
  const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end === -1) return { meta: {}, body: lines.join('\n') };
  const unquote = (value) => {
    const text = String(value).trim();
    return text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
  };
  const meta = {};
  let field = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && field) {
      if (!Array.isArray(meta[field])) meta[field] = meta[field] ? [meta[field]] : [];
      meta[field].push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    field = pair[1];
    const value = pair[2].trim();
    if (!value) meta[field] = [];
    else if (value.startsWith('[') && value.endsWith(']')) meta[field] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    else meta[field] = unquote(value);
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

/** pandoc's --bibliography and --csl arguments: what the front matter names, else every .bib in the project. */
export async function bibliographyArgs(projectRoot, absMain, meta) {
  const mdDir = path.dirname(absMain);
  const named = Array.isArray(meta.bibliography) ? meta.bibliography : meta.bibliography ? [meta.bibliography] : [];
  const files = named.length
    ? named.map((name) => (path.isAbsolute(name) ? name : path.resolve(mdDir, name)))
    : (await listFilesRecursive(projectRoot)).filter((item) => item.type === 'file' && /\.bib$/i.test(item.path)).map((item) => path.join(projectRoot, item.path));
  const args = files.flatMap((file) => ['--bibliography', file]);
  const csl = Array.isArray(meta.csl) ? meta.csl[0] : meta.csl;
  if (csl) args.push('--csl', path.isAbsolute(csl) ? csl : path.resolve(mdDir, csl));
  return args;
}

/** pandoc's log, kept to MAX_LOG_BYTES as a compile's is. */
function collector() {
  const chunks = [];
  let size = 0;
  return {
    push: (chunk) => {
      if (!chunk || size >= MAX_LOG_BYTES) return;
      const next = chunk.toString().slice(0, MAX_LOG_BYTES - size);
      size += next.length;
      chunks.push(next);
    },
    text: () => chunks.join('')
  };
}

/** pandoc's own errors at a line and column in the .md. */
export function pandocErrors(log, mainFile) {
  const errors = [];
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = /line\s+(\d+),?\s+column\s+(\d+)/i.exec(line);
    if (match) errors.push({ severity: 'error', message: line.trim(), file: mainFile, line: Number(match[1]), column: Number(match[2]) });
  }
  return errors;
}

/** The words of a generated line, without TeX commands, braces or Typst markup, to look for in the .md. */
function wordsOf(line) {
  return String(line)
    .replace(/\\(?:[a-zA-Z@]+\*?|.)/g, ' ')
    .replace(/#[A-Za-z][\w-]*(?:\([^)]*\))?/g, ' ')
    .replace(/[{}[\]$*_`<>]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Each diagnostic's line in the generated text, its first six (then four) words looked for in the .md, as
 * findInSource does: the found line, or no line when the words aren't there.
 */
export function traceToMarkdown(diagnostics, generated, source, mainFile) {
  const generatedLines = String(generated || '').split(/\r?\n/);
  return diagnostics.map((diagnostic) => {
    const withoutLine = { severity: diagnostic.severity, message: diagnostic.message, file: mainFile };
    const line = generatedLines[diagnostic.line - 1];
    if (!line) return withoutLine;
    const words = wordsOf(line);
    for (const count of [6, 4]) {
      const run = words.slice(0, count);
      if (run.length < count) continue;
      const pattern = new RegExp(run.map(escapeRegExp).join('\\s+'));
      const index = String(source || '').search(pattern);
      if (index !== -1) return { ...withoutLine, line: lineOf(source, index), column: 1 };
    }
    return withoutLine;
  });
}

/** The TeX errors that name the generated file with a line. */
function latexDiagnostics(log, generatedName) {
  const diagnostics = [];
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = LOCATED_TEX.exec(line);
    if (!match || path.basename(match[1]) !== generatedName) continue;
    diagnostics.push({ severity: 'error', message: match[3].trim(), file: match[1], line: Number(match[2]) });
  }
  return diagnostics;
}

const atLeast = (version, minimum) => {
  const left = String(version).split('.').map(Number);
  const right = String(minimum).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** What stops pandoc for a kind of output ('latex' or 'typst'), or null. */
async function pandocProblem(kind) {
  const executable = await pandocPath();
  const version = executable && (await versionOf(executable));
  if (!executable || !version) return { code: 'PANDOC_MISSING', error: PANDOC_MISSING };
  const minimum = kind === 'typst' ? PANDOC_MINIMUM.typst : PANDOC_MINIMUM.latex;
  if (!atLeast(version, minimum)) {
    return { code: 'PANDOC_OLD', error: 'This pandoc (' + version + ') is too old for Spectrum. Download pandoc ' + PANDOC_DOWNLOADABLE + ' from Settings › Engines › Markdown.' };
  }
  return null;
}

/** Runs pandoc and collects its log; nothing about stopping is decided here. */
async function runPandoc(args, cwd) {
  const log = collector();
  let run;
  try {
    run = await runSpawn(await pandocPath(), args, cwd, log.push, process.env);
  } catch (err) {
    return { code: null, timedOut: false, log: log.text(), error: err };
  }
  return { ...run, log: log.text() };
}

const pandocFailure = (run, mainFile) => ({
  ok: false,
  ...(run.error && { error: PANDOC_MISSING }),
  ...(run.timedOut && { timedOut: true }),
  ...(run.code === null && !run.timedOut && !run.error && { stopped: true }),
  log: run.log,
  errors: pandocErrors(run.log, mainFile)
});

/** pandoc's LaTeX for the .md, into generatedDir. media is the folder --extract-media filled. */
export async function markdownToLatex({ projectRoot, absMain, mainFile, generatedDir }) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  await ensureDir(generatedDir);
  const generatedFile = path.join(generatedDir, mainFile + '.tex');
  await ensureDir(path.dirname(generatedFile));
  const args = [
    absMain, '--from=markdown', '--to=latex', '--standalone', '--citeproc',
    ...(await bibliographyArgs(projectRoot, absMain, meta)),
    '--resource-path=' + [path.dirname(absMain), projectRoot].join(path.delimiter),
    '--extract-media=' + path.join(generatedDir, 'media'),
    '-o', generatedFile
  ];
  const run = await runPandoc(args, path.dirname(absMain));
  const text = await fs.readFile(generatedFile, 'utf8').catch(() => null);
  if (run.code !== 0 || text === null) return { ...pandocFailure(run, mainFile), ...(text === null && !run.error && !run.timedOut && { error: PANDOC_UNREADABLE }) };
  return { ok: true, text, log: run.log, file: generatedFile, media: path.join(generatedDir, 'media') };
}

/** Pandoc's Typst for the .md, its images made project-root relative, into generatedDir. */
export async function markdownToTypst({ projectRoot, absMain, mainFile, generatedDir }) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  await ensureDir(generatedDir);
  const generatedFile = path.join(generatedDir, mainFile + '.typ');
  await ensureDir(path.dirname(generatedFile));
  const args = [
    absMain, '--from=markdown', '--to=typst', '--standalone', '--citeproc',
    ...(await bibliographyArgs(projectRoot, absMain, meta)),
    '--resource-path=' + [path.dirname(absMain), projectRoot].join(path.delimiter),
    '-o', generatedFile
  ];
  const run = await runPandoc(args, path.dirname(absMain));
  let text = await fs.readFile(generatedFile, 'utf8').catch(() => null);
  if (run.code !== 0 || text === null) return { ...pandocFailure(run, mainFile), ...(text === null && !run.error && !run.timedOut && { error: PANDOC_UNREADABLE }) };
  text = rootRelativeImages(text, projectRoot, path.dirname(absMain));
  await fs.writeFile(generatedFile, text);
  return { ok: true, text, log: run.log, file: generatedFile };
}

/** Every relative image("…") in a Typst document made root relative, which is how Typst reads it from stdin. */
function rootRelativeImages(text, projectRoot, mdDir) {
  const folder = path.relative(projectRoot, mdDir).split(path.sep).join('/');
  return text.replace(/(image\(\s*")([^"]+)(")/g, (whole, before, source, after) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith('/') || source.startsWith('#')) return whole;
    return before + '/' + path.posix.normalize(path.posix.join(folder || '.', source)) + after;
  });
}

/** Compiles a .md main file through pandoc and the project's PDF engine ('latex' or 'typst'). */
export async function compileMarkdown(projectRoot, absMain, mainFile, engine, options = {}) {
  const settings = await readProjectSettings(projectRoot);
  const kind = settings.compile?.markdownEngine === 'typst' ? 'typst' : 'latex';
  const problem = await pandocProblem(kind);
  if (problem) return { ok: false, ...problem, generated: kind };
  const source = await fs.readFile(absMain, 'utf8').catch(() => null);
  if (source === null) return { ok: false, error: 'The main file “' + mainFile + '” doesn’t exist.' };
  const cache = options.scratch ? options.buildDir || path.join(os.tmpdir(), 'spectrum-build') : await cachePath(projectRoot);
  const generatedDir = path.join(cache, 'generated');
  const made = kind === 'typst'
    ? await markdownToTypst({ projectRoot, absMain, mainFile, generatedDir })
    : await markdownToLatex({ projectRoot, absMain, mainFile, generatedDir });
  if (!made.ok) {
    if (made.stopped) return { ok: false, stopped: true, error: 'The compile was stopped.', log: made.log, status: -1 };
    if (made.timedOut) return { ok: false, error: 'The compile took too long and was stopped.', log: made.log, status: -1, errors: made.errors };
    return { ok: false, error: made.error || PANDOC_UNREADABLE, log: made.log, errors: made.errors, generated: kind };
  }
  if (kind === 'typst') {
    const result = await compileTypst(projectRoot, absMain, mainFile, { ...options, source: made.text });
    return { ...result, errors: traceToMarkdown(result.errors || [], made.text, source, mainFile), generated: 'typst' };
  }
  // LaTeX: the generated file compiles like any document, with its PDF beside the .md
  const result = await compileDocument(engine, projectRoot, made.file, mainFile, { ...options, markdownSource: absMain });
  let log = result.log || '';
  if (SVG.test(source) && !(await findExecutable('rsvg-convert'))) log += SVG_NOTE;
  return {
    ...result,
    log,
    errors: traceToMarkdown(latexDiagnostics(log, path.basename(made.file)), made.text, source, mainFile),
    generated: 'latex'
  };
}

/** The .md as a Word document. */
export async function pandocDocx(projectRoot, absMain, output) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  const run = await runPandoc([absMain, '--citeproc', ...(await bibliographyArgs(projectRoot, absMain, meta)), '-o', output], path.dirname(absMain));
  return { ok: run.code === 0 && !run.timedOut && !run.error, log: run.log };
}
