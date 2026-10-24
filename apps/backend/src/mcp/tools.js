import { promises as fs } from 'fs';
import path from 'path';
import { compileFolder, unwrap } from '../services/compileService.js';
import { parseBibEntries } from '../services/referenceService.js';
import { fetchBibtex, literatureSearch } from '../services/researchTools.js';
import { SKILL_ID, readFrontMatter } from '../services/skillService.js';
import { suggestedTodo } from '../services/agentService.js';
import { withoutComments } from '../latex/text.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';

// What Spectrum's tools server does for an agent, inside the agent's isolation: root is its working copy, state its
// run's folder in its private home, where Spectrum leaves context.json ({ mainFile, engine, todos }) before the
// session and reads suggestions.jsonl after it.

const slashed = (p) => p.split(path.sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
async function context(state) {
  return JSON.parse(await fs.readFile(path.join(state, 'context.json'), 'utf8').catch(() => '{}'));
}

/** The main document: the project's, else the first .tex with \documentclass at the top level, else the first .tex. */
async function mainFile(root, state) {
  const named = (await context(state)).mainFile;
  if (named && (await fs.stat(safeJoin(root, named)).catch(() => null))?.isFile()) return named;
  const tex = (await listFilesRecursive(root)).filter((f) => f.type === 'file' && /\.tex$/i.test(f.path)).map((f) => f.path).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  for (const file of tex) if (/\\documentclass\b/.test(withoutComments((await fs.readFile(path.join(root, file), 'utf8')).slice(0, 16384)))) return file;
  return tex[0] || null;
}

// \input, \include and \subfile, looked up from the main file's folder, then the root, as the compile's TEXINPUTS does
const INPUT = /\\(?:input|include|subfile)\{([^}]+)\}/g;
const HEADING = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
const LABEL = /\\label\{([^}]+)\}/g;
const REF = /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|labelcref)\*?\{([^}]+)\}/g;
const CITE = /\\(?:no)?(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite|footcite|smartcite|supercite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g;
const BIBLIOGRAPHY = /\\(?:bibliography|addbibresource|addglobalbib)\s*(?:\[[^\]]*\])?\{([^}]+)\}/g;

/** The document's files from its main file, each with its text without comments. */
async function documentFiles(root, main) {
  const files = [];
  const seen = new Set();
  const visit = async (rel, from, depth) => {
    if (depth > 20 || seen.has(rel)) return;
    const text = await fs.readFile(safeJoin(root, rel), 'utf8').catch(() => null);
    if (text === null) return false;
    seen.add(rel);
    const clean = withoutComments(text);
    files.push({ file: rel, from, text: clean });
    for (const match of clean.matchAll(INPUT)) {
      const target = match[1].trim();
      const name = path.extname(target) ? target : `${target}.tex`;
      if ((await visit(slashed(path.join(path.dirname(main), name)), rel, depth + 1)) === false) await visit(slashed(path.normalize(name)), rel, depth + 1);
    }
  };
  await visit(main, null, 0);
  return files;
}

/** The project's .bib entries: the files the document names, else every .bib in the project. */
async function bibEntries(root, files) {
  const named = files.flatMap(({ text }) => [...text.matchAll(BIBLIOGRAPHY)].flatMap((m) => m[1].split(',').map((n) => n.trim()).filter(Boolean)).map((n) => (n.endsWith('.bib') ? n : `${n}.bib`)));
  const all = (await listFilesRecursive(root)).filter((f) => f.type === 'file' && /\.bib$/i.test(f.path)).map((f) => f.path);
  const bibs = named.length ? all.filter((f) => named.some((n) => f === slashed(path.normalize(n)) || f.endsWith(`/${path.posix.basename(n)}`))) : all;
  const entries = [];
  for (const file of bibs) {
    for (const entry of parseBibEntries(await fs.readFile(path.join(root, file), 'utf8').catch(() => ''))) entries.push({ ...entry, file });
  }
  return { bibs, entries };
}

/** The document's outline, labels, inputs, unresolved references and citations, main file and engine. */
export async function projectMap(root, state) {
  const main = await mainFile(root, state);
  if (!main) return { mainFile: null, note: 'This project has no .tex file.' };
  const files = await documentFiles(root, main);
  const { bibs, entries } = await bibEntries(root, files);
  const outline = [], labels = [], refs = [], cites = [];
  for (const { file, text } of files) {
    for (const m of text.matchAll(HEADING)) outline.push({ level: m[1], title: m[2].trim(), file, line: lineOf(text, m.index) });
    for (const m of text.matchAll(LABEL)) labels.push({ label: m[1].trim(), file, line: lineOf(text, m.index) });
    for (const m of text.matchAll(REF)) for (const key of m[1].split(',')) refs.push({ key: key.trim(), file, line: lineOf(text, m.index) });
    for (const m of text.matchAll(CITE)) for (const key of m[1].split(',')) cites.push({ key: key.trim(), file, line: lineOf(text, m.index) });
  }
  const known = new Set(labels.map((l) => l.label));
  const keys = new Set(entries.map((e) => e.key));
  return {
    mainFile: main,
    engine: (await context(state)).engine || 'auto',
    files: files.map(({ file, from }) => ({ file, ...(from && { includedFrom: from }) })),
    outline,
    labels,
    bibFiles: bibs,
    unresolvedRefs: refs.filter((r) => r.key && !known.has(r.key)),
    unresolvedCites: cites.filter((c) => c.key && c.key !== '*' && !keys.has(c.key))
  };
}

/** Every entry of the project's bibliography, briefly. */
export async function listBibEntries(root, state) {
  const main = await mainFile(root, state);
  const { entries } = await bibEntries(root, main ? await documentFiles(root, main) : []);
  return entries.map(({ key, type, fields, file }) => ({ key, type, title: fields.title, author: fields.author, year: fields.year || fields.date, ...(fields.doi && { doi: fields.doi }), file }));
}

/** Entries whose key, title, authors, DOI or year hold every word of the query. */
export async function searchBibEntries(root, state, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('Give words to search for.');
  return (await listBibEntries(root, state)).filter((e) => words.every((w) => [e.key, e.title, e.author, e.doi, e.year].some((v) => String(v || '').toLowerCase().includes(w))));
}

/** "file:line: message" for each error in a log, and how many warnings it has. */
export function logErrors(log) {
  const lines = unwrap(log).split('\n');
  const errors = [];
  for (let i = 0; i < lines.length && errors.length < 50; i++) {
    const line = lines[i];
    if (/^(?:\.\/)?[^\s:]+\.(?:tex|sty|cls|bib|bbl):\d+: /.test(line)) errors.push(line.replace(/^\.\//, ''));
    else if (/^! /.test(line)) errors.push([line, lines[i + 1]?.startsWith('l.') ? lines[i + 1] : ''].filter(Boolean).join(' '));
    else if (/^error: /.test(line)) errors.push(line);
  }
  return { errors, warnings: lines.filter((l) => /Warning:/.test(l)).length, undefined: lines.filter((l) => /(?:Citation|Reference) .* undefined/.test(l)).map((l) => l.trim()).slice(0, 50) };
}

/** Compiles the working copy into the run's folder; its log is kept for get_log, and nothing is written into the copy. */
export async function compile(root, state, { main, engine } = {}) {
  const file = main || await mainFile(root, state);
  if (!file) return { ok: false, error: 'This project has no .tex file.' };
  const result = await compileFolder({ root, mainFile: file, engine: engine || (await context(state)).engine || 'auto', buildDir: path.join(state, 'build') });
  const log = result.log || result.error || '';
  await fs.writeFile(path.join(state, 'last.log'), log);
  let pdf;
  if (result.pdf) {
    pdf = path.join(state, `${path.basename(file, path.extname(file))}.pdf`);
    await fs.writeFile(pdf, Buffer.from(result.pdf, 'base64'));
  }
  return { ok: result.ok && result.status === 0, mainFile: file, engine: result.engine, ...(result.error && { error: result.error }), ...(pdf && { pdf }), ...logErrors(log) };
}

export async function getLog(state) {
  const log = await fs.readFile(path.join(state, 'last.log'), 'utf8').catch(() => null);
  if (log === null) return { note: 'Nothing has been compiled in this session yet. Call compile first.' };
  return { ...logErrors(log), tail: log.slice(-4000) };
}

export async function listTodos(state) {
  return (await context(state)).todos || [];
}

/** Leaves a suggestion for Spectrum to show the user once the turn ends; nothing is added to their list by itself. */
export async function suggestTodo(state, input) {
  const todo = suggestedTodo(input);
  await fs.appendFile(path.join(state, 'suggestions.jsonl'), `${JSON.stringify(todo)}\n`);
  return 'Suggested. The user sees it as a card once your turn ends, and adds it if they want.';
}

/** A skill Spectrum copied into this home: its instructions and files. */
export async function loadHomeSkill(id) {
  if (!SKILL_ID.test(String(id || ''))) throw new Error('Invalid skill id.');
  for (const folder of ['.agents/skills', '.claude/skills']) {
    const dir = path.join(process.env.HOME || '', folder, id);
    const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8').catch(() => null);
    if (text === null) continue;
    const files = (await listFilesRecursive(dir)).filter((f) => f.type === 'file' && f.path !== '.spectrum-managed').map((f) => f.path).sort();
    return { id, folder: dir, body: readFrontMatter(text).body.trim(), files };
  }
  throw new Error(`No skill “${id}” is available in this project.`);
}

export { fetchBibtex, literatureSearch };
