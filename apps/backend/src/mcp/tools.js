import { promises as fs } from 'fs';
import path from 'path';
import vm from 'node:vm';
import { z } from 'zod';
import { compileFolder, unwrap } from '../services/compileService.js';
import { parseBibEntries, texIncludesBib } from '../services/referenceService.js';
import { fetchBibtex, literatureSearch } from '../services/researchTools.js';
import { SKILL_ID, readFrontMatter, skillBody } from '../services/skillService.js';
import { withoutComments } from '../latex/text.js';
import { DOC_LANGUAGES, docKind } from '../utils/docLanguage.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { agentHidden, safeJoin } from '../utils/pathUtils.js';

// What Spectrum's tools server does for an agent, inside the agent's isolation: root is its working copy, state its
// run's folder in its private home, where Spectrum leaves context.json ({ mainFile, engine, todos }) before the
// session and reads suggestions.jsonl after it. The Spectrum agent reads the project's map from here too, with the
// context itself in place of the folder.

const slashed = (p) => p.split(path.sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
async function context(state) {
  return typeof state === 'string' ? JSON.parse(await fs.readFile(path.join(state, 'context.json'), 'utf8').catch(() => '{}')) : state || {};
}

/**
 * The main document: the project's, else the first .tex with \documentclass at the top level, else the first .tex, else
 * a Typst or Markdown document (one named main first).
 */
async function mainFile(root, state) {
  const named = (await context(state)).mainFile;
  if (named && (await fs.stat(safeJoin(root, named)).catch(() => null))?.isFile()) return named;
  const tex = (await listFilesRecursive(root)).filter((f) => f.type === 'file' && /\.tex$/i.test(f.path)).map((f) => f.path).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  for (const file of tex) if (/\\documentclass\b/.test(withoutComments((await fs.readFile(path.join(root, file), 'utf8')).slice(0, 16384)))) return file;
  if (tex[0]) return tex[0];
  const others = (await listFilesRecursive(root)).filter((f) => f.type === 'file' && /\.(?:typ|md|markdown)$/i.test(f.path)).map((f) => f.path);
  const depth = (f) => f.split('/').length;
  const rank = (f) => (/^main\./i.test(path.posix.basename(f)) ? 0 : /\.typ$/i.test(f) ? 1 : /^readme\./i.test(path.posix.basename(f)) ? 3 : 2);
  return others.sort((a, b) => depth(a) - depth(b) || rank(a) - rank(b) || a.localeCompare(b))[0] || null;
}

// \input, \include and \subfile, looked up from the main file's folder, then the root, as the compile's TEXINPUTS does
const INPUT = /\\(?:input|include|subfile)\{([^}]+)\}/g;
const HEADING = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
const LABEL = /\\label\{([^}]+)\}/g;
const REF = /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|labelcref)\*?\{([^}]+)\}/g;
const CITE = /\\(?:no)?(?:cite|citep|citet|citealp|citealt|citeauthor|citeyear|parencite|textcite|autocite|footcite|smartcite|supercite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g;
const BIBLIOGRAPHY = /\\(?:bibliography|addbibresource|addglobalbib)\s*(?:\[[^\]]*\])?\{([^}]+)\}/g;

// Typst: = headings, <label> (not #cite(<key>)), #include "…" and #import "…" from the file's folder (or the project's
// with a leading /); an import of a package (@preview/…) is no file of the project's
const TYPST_HEADING = /^(=+)\s+(.*?)\s*$/gm;
const TYPST_LABEL = /(?<![(\w])<([A-Za-z_][\w:.-]*)>/g;
const TYPST_INCLUDE = /#(?:include|import)\s+"(?!@)([^"]+)"/g;
// Markdown: # headings, {#id} on a heading or figure. Both: @key, a label's or else a citation's, and Typst's #cite(<key>)
const MARKDOWN_HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/gm;
const MARKDOWN_LABEL = /\{[^}\n]*#([A-Za-z_][\w:.-]*)[^}\n]*\}/g;
const AT_KEY = /(?<![\w.@])@([A-Za-z_][\w:.\-/]*[\w])|#cite\(\s*<([^>]+)>/g;
const kindOf = (file) => docKind(file) || 'latex';
// what isn't the document's text, each line kept so line numbers hold: Typst's // comments, Markdown's code blocks
const blank = (s) => s.replace(/[^\n]/g, '');
const withoutTypstComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/.*$/gm, '$1');
const withoutCode = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank).replace(/<!--[\s\S]*?-->/g, blank);

/** The document's files from its main file, each with its text without comments. */
async function documentFiles(root, main) {
  const files = [];
  const seen = new Set();
  const visit = async (rel, from, depth) => {
    if (depth > 20 || seen.has(rel)) return;
    let text;
    try {
      text = await fs.readFile(safeJoin(root, rel), 'utf8');
    } catch {
      return false;
    }
    seen.add(rel);
    const kind = kindOf(rel);
    if (kind === 'markdown') {
      files.push({ file: rel, from, text: withoutCode(text) });
      return;
    }
    if (kind === 'typst') {
      const clean = withoutTypstComments(text);
      files.push({ file: rel, from, text: clean });
      for (const [, target] of clean.matchAll(TYPST_INCLUDE)) await visit(target.startsWith('/') ? slashed(path.normalize(target.slice(1))) : slashed(path.join(path.dirname(rel), target)), rel, depth + 1);
      return;
    }
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
  // Typst's #bibliography and a Markdown front matter's bibliography, as an add to the .bib finds them
  const others = files.filter(({ file }) => kindOf(file) !== 'latex').map(({ text }) => text);
  const loaded = (f) => named.some((n) => f === slashed(path.normalize(n)) || f.endsWith(`/${path.posix.basename(n)}`)) || texIncludesBib(others, f);
  const bibs = named.length || all.some(loaded) ? all.filter(loaded) : all;
  const entries = [];
  for (const file of bibs) {
    for (const entry of parseBibEntries(await fs.readFile(path.join(root, file), 'utf8').catch(() => ''))) entries.push({ ...entry, file });
  }
  return { bibs, entries };
}

/** The document's language, outline, labels, inputs, citations, unresolved references and citations, main file and engine. */
export async function projectMap(root, state) {
  const main = await mainFile(root, state);
  if (!main) return { mainFile: null, note: 'This project has no LaTeX, Typst or Markdown document.' };
  const files = await documentFiles(root, main);
  const { bibs, entries } = await bibEntries(root, files);
  const outline = [], labels = [], refs = [], cites = [], atKeys = [];
  // a Markdown document's front matter: what pandoc reads its title, authors, bibliography and style from
  const front = kindOf(main) === 'markdown' ? Object.fromEntries(Object.entries(readFrontMatter(await fs.readFile(safeJoin(root, main), 'utf8').catch(() => '')).data).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, v.slice(0, 200)])) : null;
  for (const { file, text } of files) {
    const at = (m) => ({ file, line: lineOf(text, m.index) });
    const kind = kindOf(file);
    if (kind === 'latex') {
      for (const m of text.matchAll(HEADING)) outline.push({ level: m[1], title: m[2].trim(), ...at(m) });
      for (const m of text.matchAll(LABEL)) labels.push({ label: m[1].trim(), ...at(m) });
      for (const m of text.matchAll(REF)) for (const key of m[1].split(',')) refs.push({ key: key.trim(), ...at(m) });
      for (const m of text.matchAll(CITE)) for (const key of m[1].split(',')) cites.push({ key: key.trim(), ...at(m) });
      continue;
    }
    // a heading's level as its depth: = or # is 1
    for (const m of text.matchAll(kind === 'typst' ? TYPST_HEADING : MARKDOWN_HEADING)) outline.push({ level: m[1].length, title: m[2].replace(/\s*(?:<[^>]*>|\{[^}]*\})\s*$/, '').trim(), ...at(m) });
    for (const m of text.matchAll(kind === 'typst' ? TYPST_LABEL : MARKDOWN_LABEL)) labels.push({ label: m[1], ...at(m) });
    for (const m of text.matchAll(AT_KEY)) atKeys.push({ key: m[1] ?? m[2].trim(), cite: !m[1], ...at(m) });
  }
  const known = new Set(labels.map((l) => l.label));
  const keys = new Set(entries.map((e) => e.key));
  // Typst's and pandoc's @key is a reference to a label it names, else a citation
  for (const { cite, ...ref } of atKeys) (!cite && known.has(ref.key) ? refs : cites).push(ref);
  return {
    mainFile: main,
    language: DOC_LANGUAGES[kindOf(main)].name,
    engine: (await context(state)).engine || 'auto',
    files: files.map(({ file, from }) => ({ file, ...(from && { includedFrom: from }) })),
    ...(front && Object.keys(front).length && { frontMatter: front }),
    outline,
    labels,
    bibFiles: bibs,
    citedKeys: [...new Set(cites.map((c) => c.key).filter((k) => k && k !== '*'))],
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

/** "file:line: message" for each error in a log (of its last pass, for a LaTeX log of several), and how many warnings it has. */
export function logErrors(log) {
  const all = unwrap(log).split('\n');
  // a LaTeX log holds every pass of the compile, and a citation or reference undefined in the first is often found by
  // the last: how the document stands is what the last pass says
  const last = all.findLastIndex((line) => /^This is [A-Za-z-]*TeX, Version /.test(line));
  const lines = last > 0 ? all.slice(last) : all;
  const errors = [];
  for (let i = 0; i < lines.length && errors.length < 50; i++) {
    const line = lines[i];
    if (/^(?:\.\/)?[^\s:]+\.(?:tex|sty|cls|bib|bbl):\d+: /.test(line)) errors.push(line.replace(/^\.\//, ''));
    // Typst's short-format diagnostics: main.typ:3:1: error: unknown variable: foo (or <stdin> for Markdown's)
    else if (/^(?:\S*\.typ|<stdin>):\d+:\d+: error: /.test(line)) errors.push(line.trim());
    else if (/^! /.test(line)) errors.push([line, lines[i + 1]?.startsWith('l.') ? lines[i + 1] : ''].filter(Boolean).join(' '));
    else if (/^error: /.test(line)) errors.push(line);
  }
  return { errors, warnings: lines.filter((l) => /Warning:/.test(l)).length, undefined: lines.filter((l) => /(?:Citation|Reference) .* undefined/.test(l)).map((l) => l.trim()).slice(0, 50) };
}

/**
 * Compiles the working copy into the run's folder, with the Typst version and Markdown PDF engine Spectrum chose; its
 * log is kept for get_log, and nothing is written into the copy.
 */
export async function compile(root, state, { main, engine } = {}, options = {}) {
  const file = main || await mainFile(root, state);
  if (!file) return { ok: false, error: 'This project has no LaTeX, Typst or Markdown document.' };
  const { typstVersion, markdownEngine, ...chosen } = await context(state);
  await fs.mkdir(state, { recursive: true });
  const result = await compileFolder({ root, mainFile: file, engine: engine || chosen.engine || 'auto', typstVersion, markdownEngine, buildDir: path.join(state, 'build'), ...options });
  const log = result.log || result.error || '';
  await fs.writeFile(path.join(state, 'last.log'), log);
  let pdf;
  if (result.pdf) {
    pdf = path.join(state, `${path.basename(file, path.extname(file))}.pdf`);
    await fs.writeFile(pdf, Buffer.from(result.pdf, 'base64'));
  }
  // a Markdown document's log names lines of the file pandoc generated, which the agent never wrote: the compile's own
  // diagnostics, traced to the .md as the Logs tab shows them, stand in for the log's
  const found = kindOf(file) === 'markdown' && Array.isArray(result.errors) ? markdownErrors(result.errors, logErrors(log)) : logErrors(log);
  await fs.writeFile(path.join(state, 'last.json'), JSON.stringify(found));
  const generated = kindOf(file) === 'markdown' && (await fs.stat(path.join(state, 'build', 'generated')).catch(() => null))?.isDirectory() ? path.join(state, 'build', 'generated') : null;
  return { ok: result.ok && result.status === 0, mainFile: file, engine: result.engine, ...(result.error && { error: result.error }), ...(pdf && { pdf }), ...(generated && { generated }), ...found };
}

/** A Markdown compile's diagnostics as "main.md:9: message" (the file alone where no line could be traced), with the log's own count of warnings added. */
export function markdownErrors(diagnostics, fromLog) {
  const at = (d) => `${d.file}${d.line ? `:${d.line}` : ''}: ${d.message}`;
  const warnings = diagnostics.filter((d) => d.severity !== 'error');
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').map(at).slice(0, 50),
    warnings: fromLog.warnings + warnings.length,
    undefined: [...warnings.filter((d) => /^No entry in the bibliography/.test(d.message)).map(at), ...fromLog.undefined].slice(0, 50)
  };
}

export async function getLog(state) {
  const log = await fs.readFile(path.join(state, 'last.log'), 'utf8').catch(() => null);
  if (log === null) return { note: 'Nothing has been compiled in this session yet. Call compile first.' };
  // as compile answered, which for a Markdown document is not what the log alone says
  const found = JSON.parse(await fs.readFile(path.join(state, 'last.json'), 'utf8').catch(() => 'null')) || logErrors(log);
  return { ...found, tail: log.slice(-4000) };
}

/** A suggested to-do: { text, link? }, with only the link fields a to-do keeps. */
export function suggestedTodo({ text, link } = {}) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('A to-do is text of up to 2,000 characters.');
  const kept = link && typeof link === 'object' && !Array.isArray(link)
    ? (typeof link.file === 'string' && Number.isInteger(link.line) && link.line > 0 ? { file: link.file, line: link.line }
      : typeof link.doc === 'string' && Number.isInteger(link.page) && link.page > 0 ? { doc: link.doc, page: link.page }
        : typeof link.key === 'string' && link.key ? { key: link.key } : null)
    : null;
  return { text: text.trim(), ...(kept && { link: kept }) };
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
    return { id, folder: dir, body: skillBody(readFrontMatter(text).body.trim()), files };
  }
  throw new Error(`No skill “${id}” is available in this project.`);
}

export { fetchBibtex, literatureSearch };

// what a text search reads: files of at most this size that hold no NUL byte, and at most this many matches
const MAX_SEARCH_FILE = 2 * 1024 * 1024;
const MAX_MATCHES = 100;
const MATCHER = new vm.Script('lines.flatMap((line, i) => (test(line) ? [i] : []))');

/**
 * The lines of the project's text files that hold the query: plain text (any case unless caseSensitive), or with
 * regex a regular expression. Returns { matches: [{ file, line, text }], more? }, the first 100. path: a file or a
 * folder to look in. Hidden and secret files are never read, nor is anything through a link. A regular expression that
 * takes over a second on one file is stopped, as one written to never finish would hold the app.
 */
export async function searchText(root, { query, regex = false, caseSensitive = false, path: within = '' } = {}) {
  if (typeof query !== 'string' || !query) throw new Error('Give text to search for.');
  let test;
  if (regex) {
    let re;
    try { re = new RegExp(query, caseSensitive ? 'u' : 'iu'); } catch (err) { throw new Error(`Not a regular expression: ${err.message}`); }
    test = (line) => re.test(line);
  } else {
    const needle = caseSensitive ? query : query.toLowerCase();
    test = (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
  }
  const base = within ? safeJoin(root, within) : root;
  const prefix = within ? slashed(path.relative(root, base)) : '';
  const stat = await fs.lstat(base).catch(() => null);
  if (!stat) throw new Error(`No file or folder “${within}”.`);
  const files = stat.isDirectory() ? (await listFilesRecursive(base)).filter((f) => f.type === 'file').map((f) => (prefix ? `${prefix}/${f.path}` : f.path)).sort() : [prefix];
  const matches = [];
  let more = false;
  for (const file of files) {
    if (agentHidden(file)) continue;
    const abs = path.join(root, file);
    const info = await fs.lstat(abs).catch(() => null);
    if (!info?.isFile() || info.size > MAX_SEARCH_FILE) continue;
    const text = await fs.readFile(abs, 'utf8').catch(() => null);
    if (text === null || text.includes('\0')) continue;
    const lines = text.split(/\r?\n/);
    let hits;
    try {
      hits = regex ? MATCHER.runInNewContext({ lines, test }, { timeout: 1000 }) : lines.flatMap((line, i) => (test(line) ? [i] : []));
    } catch {
      throw new Error(`The expression took too long on ${file}. Write a simpler one.`);
    }
    for (const i of hits) {
      if (matches.length >= MAX_MATCHES) { more = true; break; }
      matches.push({ file, line: i + 1, text: lines[i].trim().slice(0, 300) });
    }
    if (more) break;
  }
  return { matches, ...(more && { more: `Only the first ${MAX_MATCHES} matches are listed. Narrow the search, or give a path.` }) };
}

// ─── One registry for both agents ───
//
// Each tool is { name, description, schema, readOnly, run(ctx, input), show? }:
//   schema    a zod shape of the input's fields ({} for none), which the input is checked against before run
//   readOnly  it changes nothing the run keeps, so it can run beside the other read-only calls of the same turn
//   run       answers with text, or an object sent as JSON; an Error it throws is read by the model as the answer
//   show      optional, (result, input) => { text } or { diff: { path, oldText, newText } }: what the transcript's
//             card for the call opens to
// ctx is where the hosts differ. The tools server gives a local agent's working copy; the Spectrum agent its project,
// or a copy of it with the run's proposals written over it:
//   root()            → the folder holding the project as the agent has it
//   state             a folder of this run's own: the build, the last log, and context.json
//                     ({ mainFile, engine, typstVersion, markdownEngine, todos })
//   todos()           → the project's open to-dos
//   suggestTodo(todo) puts a checked to-do forward, → the answer
//   loadSkill(id)     → a skill's instructions and files
//   compileOptions    optional, more for compileFolder (the signal Stop aborts; the limits of a Windows compile)
//   opensFiles        optional, true for an agent that reads files by path itself: compile then says where the PDF is
// A tool added here reaches both agents: mcp/server.js registers every one, and so does agentService.js, beside the
// tools that are the Spectrum agent's alone (its files and proposals, which a local agent does with its own tools).

const ENGINES = ['auto', 'pdflatex', 'xelatex', 'lualatex', 'latexmk', 'tectonic'];
const todoLink = z.object({ file: z.string().optional(), line: z.number().int().optional(), doc: z.string().optional(), page: z.number().int().optional(), key: z.string().optional() });
// what a compile found, its own errors first: the compile's one-line failure only when the log named none
export const buildErrors = (r) => (r.errors?.length ? r.errors : r.error ? [r.error] : []);
/** How a compile went, for its card: a first line that says it (“builds”, “2 errors”), then what it found. */
function buildShown(r) {
  const errors = buildErrors(r);
  const missing = r.undefined || [];
  const few = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const head = !r.ok ? (errors.length ? few(errors.length, 'error', 'errors') : 'it did not build') : missing.length ? `builds, with ${few(missing.length, 'undefined citation or reference', 'undefined citations or references')}` : 'builds';
  return { text: [head, ...errors, ...missing].slice(0, 21).join('\n') };
}

export const TOOLS = [
  {
    name: 'compile',
    description: 'Compile the project as you have changed it (LaTeX, Typst, or Markdown through pandoc). Returns whether it built, each error as file:line, the undefined citations and references, and the warning count. Writes nothing into the project. engine is for LaTeX only.',
    schema: { main: z.string().optional(), engine: z.enum(ENGINES).optional() },
    // it writes this run's build folder and log, so two never run at once
    readOnly: false,
    run: async (ctx, input) => {
      const { pdf, generated, ...result } = await compile(await ctx.root(), ctx.state, input, ctx.compileOptions);
      // where the PDF is, for an agent that can open a file by its path
      return ctx.opensFiles ? { ...result, ...(pdf && { pdf }), ...(generated && { generated }) } : result;
    },
    show: buildShown
  },
  {
    name: 'get_log',
    description: 'The last compile’s errors as file:line, its undefined citations and references, and the end of its log.',
    schema: {},
    readOnly: true,
    run: (ctx) => getLog(ctx.state)
  },
  {
    name: 'project_map',
    description: 'The main file and engine, the files it includes, the outline and labels with file and line, the bibliography files, the keys cited, and the references and citations that do not resolve. A Typst or Markdown heading’s level is its depth.',
    schema: {},
    readOnly: true,
    run: async (ctx) => projectMap(await ctx.root(), ctx.state)
  },
  {
    name: 'bib_entries',
    description: 'Every bibliography entry: key, type, title, authors, year, DOI and file.',
    schema: {},
    readOnly: true,
    run: async (ctx) => listBibEntries(await ctx.root(), ctx.state)
  },
  {
    name: 'bib_search',
    description: 'Bibliography entries whose key, title, authors, DOI or year hold every word of the query. Search before adding an entry, so a work never gets a second key.',
    schema: { query: z.string() },
    readOnly: true,
    run: async (ctx, { query }) => searchBibEntries(await ctx.root(), ctx.state, query)
  },
  {
    name: 'search_text',
    description: 'Find text in the project’s files: file, line and the line for each match. Plain text in any case, or a regular expression with regex. path: a file or folder to look in.',
    schema: { query: z.string(), regex: z.boolean().optional(), caseSensitive: z.boolean().optional(), path: z.string().optional() },
    readOnly: true,
    run: async (ctx, input) => searchText(await ctx.root(), input),
    show: (r) => ({ text: r.matches.length ? r.matches.slice(0, 20).map((m) => `${m.file}:${m.line}: ${m.text}`).join('\n') : 'No match.' })
  },
  {
    name: 'literature_search',
    description: 'Search scholarly databases (OpenAlex, then Semantic Scholar, then arXiv): titles, authors, years, venues, DOIs and summaries. limit: up to 10.',
    schema: { query: z.string(), limit: z.number().int().min(1).max(10).optional() },
    readOnly: true,
    run: async (ctx, { query, limit }) => ({ papers: await literatureSearch(query, limit) })
  },
  {
    name: 'fetch_bibtex',
    description: 'BibTeX for a DOI, an arXiv id or link, or else for a title (the title alone in id, with the first author’s surname and the year when you know them). Returns the BibTeX, how well the work found matches (exact or close) and what was found; a title with no close match is refused with the nearest works listed.',
    schema: { id: z.string(), author: z.string().optional(), year: z.union([z.string(), z.number()]).optional() },
    readOnly: true,
    run: (ctx, { id, author, year }) => fetchBibtex(id, { author, year })
  },
  {
    name: 'list_todos',
    description: 'The project’s open to-dos, with where each points.',
    schema: {},
    readOnly: true,
    run: async (ctx) => ({ todos: await ctx.todos() })
  },
  {
    name: 'suggest_todo',
    description: 'Suggest a to-do. It is not added: the user sees it as a card and adds it if they want. link: { file, line } for a source line, { doc, page } for a PDF page or { key } for a reference.',
    schema: { text: z.string(), link: todoLink.optional() },
    readOnly: false,
    run: (ctx, input) => ctx.suggestTodo(suggestedTodo(input))
  },
  {
    name: 'load_skill',
    description: 'Load one of the project’s skills: its full instructions and the files it has.',
    schema: { id: z.string() },
    readOnly: true,
    run: (ctx, { id }) => ctx.loadSkill(id)
  }
];

/** A tool as a model's request lists it: an OpenAI-style function with the schema as JSON Schema. */
export function toolSpec({ name, description, schema }) {
  const { properties = {}, required = [] } = z.toJSONSchema(z.object(schema));
  // as written by hand before: no bounds a model never needs, and nothing some providers' checkers refuse
  const plain = (node) => (Array.isArray(node) ? node.map(plain) : node && typeof node === 'object'
    ? Object.fromEntries(Object.entries(node).filter(([key, value]) => !['$schema', 'additionalProperties'].includes(key) && !(['minimum', 'maximum'].includes(key) && Math.abs(value) > 1e9)).map(([key, value]) => [key, plain(value)]))
    : node);
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties: plain(properties), required } } };
}

/** A tool's input checked against its schema; throws with what is wrong, in words a model can act on. */
export function checkedInput(tool, input) {
  const parsed = z.object(tool.schema).safeParse(input ?? {});
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid input for ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`);
}
