import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { APP_VERSION, DATA_DIR } from '../config/constants.js';
import { ensureDir, listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { inlineInputs, withoutComments } from '../utils/texUtils.js';
import { maskLatex, maskTypst, proseWords } from '../latex/mask.js';
import { httpError } from './projectService.js';
import { PANDOC_DOWNLOADABLE, PANDOC_MINIMUM, builtInTypst, pandocPath, versionOf } from './engineService.js';
import { MAX_LOG_BYTES, compileFolder, runSpawn } from './compileService.js';
import { compileTypst } from './typstService.js';
import { environments, lineAt, mathSpans } from './convert/latexRead.js';
import { assembleTypst, astToTypst, latexFacts, pictureDocument, prepareLatex, typstDefinitions, typstLabel, typstPreamble } from './convert/toTypst.js';

// A LaTeX or Typst project converted into a new project of the other kind, as docs/featureResearch/
// LATEX_TYPST_CONVERSION.md designs it: pandoc reads the prose, Spectrum's own rules (convert/) write every construct the
// two style guides have, and code checks that each label, reference, citation, numbered equation and float came
// through. The source project is only read; the result is built in a folder of its own for the caller to keep.

const execFileAsync = promisify(execFile);
const PANDOC_MISSING = 'Converting needs pandoc. Download it from Settings › Engines › Markdown.';
// what the new project leaves out of the source's files: TeX sources and what a build writes
const BUILD_FILES = /\.(?:tex|ltx|sty|cls|bst|bbx|cbx|bbl|aux|log|out|toc|lof|lot|blg|bcf|fls|fdb_latexmk|synctex|idx|ind|ilg|nav|snm|vrb|xdv|run\.xml|synctex\.gz|bib)$/i;
const IMAGE_EXTENSIONS = ['', '.pdf', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];
const NOT_FOR_TYPST = /\.(?:eps|ps|tif|tiff|bmp)$/i;

const lines = (...l) => l.join('\n');
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

/** pandoc's version check: the downloaded pandoc, at least the version its Typst writer needs. */
async function pandocFor() {
  const executable = await pandocPath();
  const version = executable && (await versionOf(executable));
  if (!executable || !version) throw httpError(PANDOC_MISSING, 400);
  const at = (v) => v.split('.').map(Number);
  const [have, need] = [at(version), at(PANDOC_MINIMUM.typst)];
  for (let i = 0; i < 3; i += 1) {
    if ((have[i] || 0) > (need[i] || 0)) break;
    if ((have[i] || 0) < (need[i] || 0)) throw httpError('This pandoc (' + version + ') is too old for converting. Download pandoc ' + PANDOC_DOWNLOADABLE + ' from Settings › Engines › Markdown.', 400);
  }
  return executable;
}

/** pandoc run in its sandbox on input, from standard input, its output read back from a file. */
async function pandoc(executable, input, args, work) {
  const out = path.join(work, 'pandoc-' + Math.random().toString(36).slice(2) + '.out');
  const chunks = [];
  const run = await runSpawn(executable, [...args, '--sandbox', '-o', out], work, (chunk) => chunks.length < 200 && chunks.push(chunk.toString()), process.env, undefined, input);
  const text = await fs.readFile(out, 'utf8').catch(() => null);
  await fs.rm(out, { force: true });
  if (run.code !== 0 || text === null) {
    const log = chunks.join('').slice(0, MAX_LOG_BYTES);
    throw httpError('pandoc couldn’t read the document' + (log.trim() ? ': ' + log.trim().split('\n')[0] : '.'), 502);
  }
  return text;
}

// what pandoc keeps as raw TeX when asked to, but reads itself otherwise
const PANDOC_READS = new Set(['ref', 'cref', 'Cref', 'eqref', 'autoref', 'pageref', 'vref', 'Vref', 'nameref', 'labelcref', 'crefrange', 'Crefrange', 'cpageref', 'label', 'mbox', 'hbox', 'begin{spxpiece}']);

/** The commands pandoc's raw TeX reading shows it doesn't know, from its JSON: { name: [raw texts] }. */
function unknownCommands(doc) {
  const found = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.t === 'Cite') return;
    if ((value.t === 'RawInline' || value.t === 'RawBlock') && value.c[0] === 'latex') {
      const name = /^\\(?:begin\{([^}]+)\}|([A-Za-z@]+))/.exec(value.c[1]);
      const key = name && (name[1] ? 'begin{' + name[1].replace(/\d+$/, '') + '}' : name[2]);
      if (key && !PANDOC_READS.has(key)) found.set(key, [...(found.get(key) ?? []), value.c[1]]);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(doc.blocks);
  return found;
}

/** The project's files that the converted one keeps: images, data, fonts and the composer's diagrams, not TeX's own. */
const keeps = (rel, docs) => {
  if (rel.startsWith('diagrams/')) return !/\.(?:aux|log|synctex\.gz)$/i.test(rel);
  if (BUILD_FILES.test(rel)) return false;
  // a document's own PDF, beside its .tex
  return !(/\.pdf$/i.test(rel) && docs.has(rel.replace(/\.pdf$/i, '.tex')));
};

/** The preamble with the files its \input lines name put in their places, one level deep. */
async function preambleWithInputs(root, mainDir, preamble, files) {
  let out = '';
  let last = 0;
  for (const m of withoutComments(preamble).matchAll(/\\input\s*\{([^}]+)\}/g)) {
    const name = /\.\w+$/.test(m[1].trim()) ? m[1].trim() : m[1].trim() + '.tex';
    const rel = [path.posix.join(mainDir, name), path.posix.normalize(name)].find((f) => files.has(f));
    out += preamble.slice(last, m.index) + (rel ? await fs.readFile(safeJoin(root, rel), 'utf8').catch(() => '') : '');
    last = m.index + m[0].length;
  }
  return out + preamble.slice(last);
}

/** The keys of a .bib file's entries. */
const bibKeys = (text) => [...String(text).matchAll(/@\s*([A-Za-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g)].filter((m) => !/^(?:comment|string|preamble)$/i.test(m[1])).map((m) => m[2]);

// ─── LaTeX to Typst ───

/**
 * The LaTeX document doc of the project at root as a Typst project in staging (an empty folder): { mainFile, checks,
 * notes, record }. onStep(text) hears each step as it starts. engine: the LaTeX engine pictures compile with.
 */
export async function latexToTypst(root, doc, staging, { engine = 'auto', onStep = () => {} } = {}) {
  onStep('Reading');
  const executable = await pandocFor();
  if (!builtInTypst()) throw httpError('Typst isn’t available in this copy of Spectrum.', 400);
  const items = await listFilesRecursive(root);
  const files = new Set(items.filter((i) => i.type === 'file').map((i) => i.path));
  const mainDir = path.posix.dirname(doc) === '.' ? '' : path.posix.dirname(doc);
  const mainText = await fs.readFile(safeJoin(root, doc), 'utf8');
  const begin = mainText.indexOf('\\begin{document}');
  if (begin === -1) throw httpError('“' + doc + '” has no \\begin{document}, so it isn’t a LaTeX document Spectrum can convert.', 400);
  const facts = latexFacts(await preambleWithInputs(root, mainDir, mainText.slice(0, begin), files));
  if (facts.beamer) throw httpError('This is a Beamer presentation. Spectrum has no Typst slides template, so it converts documents only: keep the slides in LaTeX.', 400);

  // what the whole document has, \input and \include files too
  const whole = await inlineInputs(root, doc, { stripComments: true });
  const labels = new Set([...whole.matchAll(/\\label\s*\{([^}]+)\}/g)].map((m) => m[1].trim()));
  for (const env of environments(whole, ['lstlisting'])) {
    const label = /^\s*\[[^\]]*?\blabel\s*=\s*\{?([^,}\]\s]+)/.exec(env.body)?.[1];
    if (label) labels.add(label);
  }
  const findFile = (name, dirs = [mainDir, '']) => {
    for (const dir of dirs) {
      const rel = path.posix.normalize(path.posix.join(dir, name));
      if (!rel.startsWith('..') && files.has(rel)) return rel;
    }
    return null;
  };
  const bibFiles = facts.bibFiles.map((f) => findFile(/\.bib$/i.test(f) ? f : f + '.bib')).filter(Boolean);
  const bibText = (await Promise.all(bibFiles.map((f) => fs.readFile(safeJoin(root, f), 'utf8')))).join('\n\n');
  const notes = [];
  const queue = [{ src: doc, out: doc.replace(/\.(?:tex|ltx)$/i, '') + '.typ', main: true }];
  const ctx = {
    facts,
    labels,
    bibKeys: new Set(bibKeys(bibText)),
    used: new Set(),
    pictures: [],
    images: new Set(),
    refsOut: [],
    citesOut: [],
    note: (st, snippet, text) => notes.push({ file: st.file, line: lineOf(st.source, snippet), text }),
    image(st, src) {
      const name = String(src).trim().replace(/^\.\//, '');
      const dirs = [...new Set([mainDir, '', ...facts.graphicsPaths.flatMap((g) => [path.posix.join(mainDir, g), g])])];
      const found = IMAGE_EXTENSIONS.map((ext) => findFile(name + ext, dirs)).find((f) => f && !NOT_FOR_TYPST.test(f)) ?? null;
      if (!found) {
        const other = ['.eps', '.ps', '.tif', '.tiff', '.bmp'].map((ext) => findFile(name.replace(/\.\w+$/, '') + ext, dirs)).find(Boolean);
        ctx.note(st, name, other ? 'Typst cannot read ' + other + '; convert it to PDF or PNG and include that instead.' : 'The image ' + name + ' is not in the project, so the figure shows a box in its place.');
        return null;
      }
      ctx.images.add(found);
      return found;
    },
    standalone(st, src) {
      const base = String(src).trim().replace(/\.tex$/i, '');
      const pdf = findFile(base + '.pdf');
      if (pdf) return pdf;
      const tex = findFile(base + '.tex');
      if (!tex) return null;
      ctx.pictures.push({ standalone: tex, file: st.file, line: lineOf(st.source, src) });
      return ctx.pictures.length - 1;
    },
    include(st, target) {
      const name = /\.\w+$/.test(target) ? target : target + '.tex';
      const src = findFile(name, [path.posix.dirname(st.file) === '.' ? '' : path.posix.dirname(st.file), mainDir, '']);
      if (!src) {
        ctx.note(st, target, 'The file ' + name + ' that the document brings in is not in the project, so it was left out.');
        return null;
      }
      const out = src.replace(/\.(?:tex|ltx)$/i, '') + '.typ';
      if (!queue.some((q) => q.src === src)) queue.push({ src, out, main: false });
      return out;
    },
    bibliography(record) {
      if (!ctx.citesOut.length && !ctx.nociteAll) return '';
      if (record.title) ctx.bibliographyTitle = record.title;
      return '#bibliography("refs.bib", style: ' + JSON.stringify(bibStyle) + (ctx.nociteAll ? ', full: true' : '') + ')';
    }
  };
  const bibStyle = typstBibStyle(facts.bibStyle, (text) => notes.push({ file: doc, line: null, text }));

  onStep('Converting');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-convert-work-'));
  try {
    const prepared = [];
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      const text = item.main ? mainText : await fs.readFile(safeJoin(root, item.src), 'utf8');
      prepared.push({ ...item, ...prepareLatex(text, ctx, { file: item.src, main: item.main }) });
    }
    // the files the new project keeps, so a picture finds its data and the Typst its images
    const docs = new Set([...files].filter((f) => /\.(?:tex|ltx)$/i.test(f)));
    for (const rel of files) {
      if (!keeps(rel, docs)) continue;
      await ensureDir(path.dirname(path.join(staging, rel)));
      await fs.copyFile(safeJoin(root, rel), path.join(staging, rel));
    }
    if (bibText.trim()) await fs.writeFile(path.join(staging, 'refs.bib'), bibText.trim() + '\n');

    for (const [i, picture] of ctx.pictures.entries()) {
      onStep('Pictures (' + (i + 1) + ' of ' + ctx.pictures.length + ')');
      const tex = picture.standalone ?? 'diagrams/converted-' + (i + 1) + '.tex';
      if (!picture.standalone) {
        await ensureDir(path.join(staging, 'diagrams'));
        await fs.writeFile(path.join(staging, tex), pictureDocument(picture, facts));
      }
      picture.tex = tex;
      picture.pdf = tex.replace(/\.tex$/i, '.pdf');
      const result = await compileFolder({ root: staging, mainFile: tex, engine }).catch((err) => ({ ok: false, error: err.message }));
      picture.ok = !!(result.ok && result.pdf);
      if (picture.ok) await fs.writeFile(path.join(staging, picture.pdf), Buffer.from(result.pdf, 'base64'));
      else notes.push({ file: picture.file, line: picture.line, text: 'The ' + (picture.env ?? 'diagram') + ' did not compile to a picture (' + (result.error || 'see its log') + '), so the figure shows a box in its place. Its source is ' + tex + '.' });
    }

    for (const file of prepared) {
      // the commands pandoc doesn't know: one that holds prose keeps its words, the others are dropped and noted
      const detected = unknownCommands(JSON.parse(await pandoc(executable, file.input, ['--from=latex-auto_identifiers+raw_tex', '--to=json'], work)));
      let input = file.input;
      for (const [name, texts] of detected) {
        if (name.startsWith('begin{')) {
          notes.push({ file: file.src, line: null, text: 'The environment ' + name.slice(6, -1) + ' is not one Spectrum knows; its text was kept as plain paragraphs.' });
          continue;
        }
        const prose = texts.every((t) => /^\\[A-Za-z@]+\s*(?:\[[^\]]*\])?\s*\{[^{}]*[A-Za-z]{2,}\s+[A-Za-z][^{}]*\}$/.test(t));
        if (prose) input = input.replace(new RegExp('\\\\' + name + '(?![A-Za-z@])\\s*(?:\\[[^\\]]*\\])?(?=\\s*\\{)', 'g'), '');
        notes.push({ file: file.src, line: lineOf(file.state.source, '\\' + name), text: '\\' + name + ' is not a command Spectrum knows' + (prose ? ', so only its text was kept.' : ', so it was left out.') });
      }
      const json = JSON.parse(await pandoc(executable, input, ['--from=latex-auto_identifiers', '--to=json'], work));
      file.pandocTypst = await pandoc(executable, JSON.stringify(astToTypst(json, file.state, ctx)), ['--from=json', '--to=typst', '--wrap=preserve'], work);
    }
    for (const file of prepared) file.typst = assembleTypst(file.pandocTypst, file.state, ctx);

    // a document that cites without a \printbibliography still gets its list at the end, as Typst needs one
    const main = prepared[0];
    ctx.hasBibliography = (ctx.citesOut.length > 0 || ctx.nociteAll) && !!bibText.trim();
    if (ctx.hasBibliography && !ctx.bibliographyPlaced) {
      main.typst += '\n#bibliography("refs.bib", style: ' + JSON.stringify(bibStyle) + ')\n';
      notes.push({ file: doc, line: null, text: 'The LaTeX cites sources but has no \\printbibliography, so the Typst ends with its bibliography.' });
    }
    ctx.authorPlain = plainAuthor(facts);
    const definitions = typstDefinitions(ctx);
    const shared = definitions && prepared.length > 1;
    if (shared) await fs.writeFile(path.join(staging, 'style.typ'), '// The definitions the chapters share; main.typ and each chapter import them\n\n' + definitions + '\n');
    const head = [typstPreamble(ctx), shared ? '#import "/style.typ": *' : definitions].filter(Boolean).join('\n\n');
    for (const file of prepared) {
      const text = file.main ? head + '\n\n' + file.typst : (shared ? '#import "/style.typ": *\n\n' : '') + file.typst;
      await ensureDir(path.dirname(path.join(staging, file.out)));
      await fs.writeFile(path.join(staging, file.out), text);
    }

    onStep('Checking');
    const checks = await checkLatexToTypst({ root, doc, staging, out: main.out, whole, facts, prepared, ctx });
    const record = {
      version: 1,
      from: 'latex',
      to: 'typst',
      spectrum: APP_VERSION,
      convertedAt: new Date().toISOString(),
      source: { mainFile: doc, class: facts.klass, options: facts.options, bibliography: bibFiles, bibliographyStyle: facts.bibStyle },
      files: prepared.map((f) => ({ from: f.src, to: f.out })),
      pictures: ctx.pictures.map((p) => ({ pdf: p.ok ? p.pdf : null, source: p.tex, from: p.file + (p.line ? ':' + p.line : ''), kind: p.standalone ? 'standalone' : p.env })),
      checks
    };
    await writeNotes(staging, { from: 'LaTeX', to: 'Typst', source: doc, out: main.out, checks, notes, pictures: ctx.pictures, prepared });
    await ensureDir(path.join(staging, '.spectrum'));
    await fs.writeFile(path.join(staging, '.spectrum', 'conversion.json'), JSON.stringify(record, null, 2) + '\n');
    return { mainFile: main.out, checks, notes, record };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** The line of snippet's first characters in source, or null. */
function lineOf(source, snippet) {
  const at = String(source ?? '').indexOf(String(snippet ?? '').trim().slice(0, 60));
  return at === -1 ? null : lineAt(source, at);
}

/** The document's author as plain text for #set document: the PDF's author, else the first line of \author. */
function plainAuthor(facts) {
  const from = facts.pdfAuthor ?? facts.author;
  if (!from) return null;
  return from.split(/\\\\|\\and\b/)[0].replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}~]/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// biblatex's styles and the CSL styles Typst has for them
const BIB_STYLES = { apa: 'apa', ieee: 'ieee', numeric: 'ieee', 'numeric-comp': 'ieee', nature: 'nature', authoryear: 'chicago-author-date', 'chicago-authordate': 'chicago-author-date', mla: 'mla', vancouver: 'vancouver', harvard: 'harvard-cite-them-right' };

/** The Typst bibliography style for biblatex's, APA when there is none or Typst has no match. */
function typstBibStyle(style, note) {
  if (!style) return 'apa';
  const found = BIB_STYLES[style] ?? BIB_STYLES[style.split('-')[0]];
  if (!found) note('The bibliography style ' + style + ' has no match in Typst, so the references are in APA style.');
  return found ?? 'apa';
}

// ─── Checks ───

/** Each value's count. */
const tally = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
/** How many of before's items after still has, counted with repeats. */
const kept = (before, after) => [...before].reduce((n, [x, k]) => n + Math.min(k, after.get(x) ?? 0), 0);
const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);

/** A display maths environment's numbered lines in LaTeX. */
function numberedEquations(text) {
  let count = 0;
  for (const env of environments(text, ['equation', 'align', 'alignat', 'gather', 'multline', 'flalign', 'eqnarray'])) {
    if (env.name === 'equation' || env.name === 'multline') {
      count += 1;
      continue;
    }
    const rows = env.body.split(/\\\\(?![^{]*\})/).filter((row) => row.trim());
    count += rows.filter((row) => !/\\(?:nonumber|notag)(?![A-Za-z])/.test(row)).length;
  }
  return count;
}

/** The floats of a LaTeX document by kind, as Typst counts its figures. */
function latexFloats(text, theorems) {
  const count = (names) => environments(text, names).length;
  const nested = (outer, inner) => environments(text, outer).reduce((n, env) => n + environments(env.body, inner).length, 0);
  return {
    figure: count(['figure', 'figure*']),
    subfigure: nested(['figure', 'figure*'], ['subfigure']),
    table: count(['table', 'table*', 'xltabular']),
    listing: environments(text, ['lstlisting']).filter((env) => /^\s*\[[^\]]*caption\s*=/.test(env.body)).length,
    algorithm: count(['algorithm']),
    theorem: theorems.length ? count(theorems) : 0
  };
}

/** The words of masked prose, lower case, longer than one letter: a lone letter is a variable more often than a word. */
const wordsOf = (masked) => proseWords(masked).map(([word]) => word.toLowerCase()).filter((word) => word.length > 1);

/** LaTeX with its pictures, code and maths blanked too, which the word check leaves out on both sides. */
function latexProse(text) {
  const blank = (t, spans) => spans.reduceRight((out, [start, end]) => out.slice(0, start) + ' '.repeat(end - start) + out.slice(end), t);
  let out = blank(text, environments(text, ['tikzpicture', 'circuitikz', 'lstlisting', 'verbatim', 'algorithmic']).map((e) => [e.start, e.end]));
  out = out.replace(/\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)([^\sA-Za-z{])[^\n]*?\1|\\lstinline(?:\[[^\]]*\])?\{[^{}\n]*\}/g, (m) => ' '.repeat(m.length));
  return maskLatex(blank(out, mathSpans(out)));
}

/** The share of before's words that after still has, repeats counted, order ignored; 1 for none. */
function coverage(before, after) {
  const a = tally(before);
  return before.length ? kept(a, tally(after)) / before.length : 1;
}

/** Typst's own view of the compiled output: each label found, the numbered equations and each figure's kind. */
async function typstQuery(staging, mainFile, names) {
  const query = [
    '(',
    '  labels: (' + names.map((n) => JSON.stringify(n)).join(', ') + (names.length === 1 ? ',' : '') + ').map(n => (n, query(label(n)).len())),',
    '  equations: query(math.equation.where(block: true)).filter(e => e.numbering != none).len(),',
    '  figures: query(figure).map(f => if type(f.kind) == str { f.kind } else { repr(f.kind) }),',
    ')'
  ].join('\n');
  try {
    const { stdout } = await execFileAsync(builtInTypst(), ['eval', '--in', path.join(staging, mainFile), '--root', staging, '--format', 'json', query], {
      cwd: staging,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, TYPST_PACKAGE_CACHE_PATH: path.join(DATA_DIR, 'typst', 'packages') }
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** A Typst text with each #include "/x.typ" of the converted files put in its place. */
function typstWhole(prepared) {
  const byPath = new Map(prepared.map((f) => [f.out, f.typst]));
  const expand = (text, depth = 0) => text.replace(/#include\s+"\/?([^"]+)"/g, (whole, rel) => (depth < 10 && byPath.has(rel) ? expand(byPath.get(rel), depth + 1) : whole));
  return expand(prepared[0].typst);
}

/** Typst source without its raw text, where an @ or a < is code, not a reference or a label. */
const withoutRaw = (text) => text.replace(/```[\s\S]*?```|`[^`\n]*`|"(?:[^"\\\n]|\\.)*"/g, (m) => ' '.repeat(m.length));

/**
 * The checks of section 6.2 for a LaTeX to Typst conversion: it compiles, and the labels, references, citations,
 * numbered equations, floats and words came through.
 */
async function checkLatexToTypst({ staging, out, whole, facts, prepared, ctx }) {
  const compiled = await compileTypst(staging, path.join(staging, out), out, { scratch: true });
  const diagnostics = (compiled.errors ?? []).map((d) => ({ severity: d.severity, message: d.message.split('\n')[0], file: d.file, line: d.line }));
  const typst = typstWhole(prepared);
  const code = withoutRaw(typst);
  const labelNames = [...new Set([...code.matchAll(/(?<![(\w])<([A-Za-z0-9_:.-]+)>/g)].map((m) => m[1]))];
  const found = compiled.ok ? await typstQuery(staging, out, labelNames) : null;
  const foundLabels = new Set((found?.labels ?? []).filter(([, n]) => n > 0).map(([name]) => name));
  const sourceLabels = [...ctx.labels].map(typstLabel);
  const missingLabels = sourceLabels.filter((l) => !(found ? foundLabels.has(l) : labelNames.includes(l)));

  // references and citations: each use in the source against each in the output
  const refsIn = [...whole.matchAll(/\\(?:[cC]ref|ref|eqref|autoref|pageref|vref|nameref|labelcref)\*?\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((t) => typstLabel(t.trim())).filter(Boolean));
  const refOut = [...code.matchAll(/(?<![\p{L}\p{N}\\])@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])|#ref\(<([^>]+)>/gu)].map((m) => m[1] ?? m[2]);
  const keys = ctx.bibKeys;
  const refs = { source: tally(refsIn), output: tally(refOut.filter((r) => !keys.has(r))) };
  const citesIn = [...whole.matchAll(/\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?((?:\s*\[[^\]]*\])*)\s*\{([^}]*)\}/g)].flatMap((m) => m[2].split(',').map((k) => k.trim()).filter((k) => k && k !== '*'));
  const citesOut = [...refOut.filter((r) => keys.has(r)), ...[...typst.matchAll(/#cite\((?:<([^>]+)>|label\("([^"]+)"\))/g)].map((m) => m[1] ?? m[2])];
  const cites = { source: tally(citesIn), output: tally(citesOut) };

  const theorems = [...facts.theorems.keys()];
  const floatsIn = latexFloats(whole, theorems);
  const kinds = tally(found?.figures ?? []);
  const floatsOut = { figure: kinds.get('image') ?? 0, subfigure: kinds.get('subfigure') ?? 0, table: kinds.get('table') ?? 0, listing: kinds.get('raw') ?? 0, algorithm: kinds.get('algorithm') ?? 0, theorem: kinds.get('theorem') ?? 0 };

  // words, by top-level section where the two have as many, else for the whole document
  const sourceMasked = latexProse(whole.slice(Math.max(0, whole.indexOf('\\begin{document}'))));
  const outputMasked = maskTypst(typst);
  const latexTop = facts.klass === 'report' || facts.klass === 'book' ? 'chapter' : 'section';
  const cut = (masked, original, pattern) => {
    const at = [0, ...[...original.matchAll(pattern)].map((m) => m.index)];
    return at.map((start, i) => masked.slice(start, at[i + 1] ?? masked.length));
  };
  const wholeBody = whole.slice(Math.max(0, whole.indexOf('\\begin{document}')));
  const sourceParts = cut(sourceMasked, wholeBody, new RegExp('\\\\' + latexTop + '\\*?\\s*[[{]', 'g'));
  const outputParts = cut(outputMasked, typst, /^(?:= |#heading\((?!level: [2-9]))/gm);
  const sections = sourceParts.length === outputParts.length ? sourceParts.map((part, i) => coverage(wordsOf(part), wordsOf(outputParts[i]))) : null;
  const words = { coverage: coverage(wordsOf(sourceMasked), wordsOf(outputMasked)), lowestSection: sections ? Math.min(...sections) : null };

  const equations = { source: numberedEquations(whole), output: found?.equations ?? null };
  const result = {
    compiles: !!compiled.ok && !diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
    labels: { source: sourceLabels.length, kept: sourceLabels.length - missingLabels.length, missing: missingLabels },
    references: { source: total(refs.source), kept: kept(refs.source, refs.output), lost: [...refs.source].filter(([t, n]) => (refs.output.get(t) ?? 0) < n).map(([t]) => t) },
    citations: { source: total(cites.source), kept: kept(cites.source, cites.output), lost: [...cites.source].filter(([k, n]) => (cites.output.get(k) ?? 0) < n).map(([k]) => k), invented: [...cites.output.keys()].filter((k) => !cites.source.has(k)) },
    equations,
    floats: Object.fromEntries(Object.keys(floatsIn).map((kind) => [kind, { source: floatsIn[kind], output: found ? floatsOut[kind] : null }])),
    words
  };
  result.ok = result.compiles && !missingLabels.length && result.references.kept === result.references.source && result.citations.kept === result.citations.source && !result.citations.invented.length
    && equations.output === equations.source && Object.values(result.floats).every((f) => f.output === f.source);
  return result;
}

// ─── The notes ───

/** conversion/notes.md: the checks, the pictures kept as PDF and every rule that was approximated, with its file and line. */
async function writeNotes(staging, { from, to, source, out, checks, notes, pictures }) {
  const of = (c) => (c.source === 0 ? 'none to keep' : c.kept + ' of ' + c.source + ' kept');
  const floats = Object.entries(checks.floats).filter(([, f]) => f.source || f.output).map(([kind, f]) => (f.output === f.source ? plural(f.source, kind) : kind + ': ' + f.source + ' in the ' + from + ', ' + (f.output ?? 'unknown') + ' in the ' + to)).join(', ') || 'none';
  const words = checks.words ? Math.round(checks.words.coverage * 100) + ' per cent of the words' + (checks.words.lowestSection !== null ? ', at least ' + Math.round(checks.words.lowestSection * 100) + ' per cent in each section' : '') : 'not measured';
  const where = (n) => n.file + (n.line ? ' line ' + n.line : '');
  const text = lines(
    '# Conversion notes',
    '',
    'Spectrum ' + APP_VERSION + ' converted this project from ' + from + ' (' + source + ') to ' + to + ' (' + out + ') on ' + new Date().toISOString().slice(0, 10) + '. The original project was not changed.',
    '',
    '## Checks',
    '',
    '| Check | Result |',
    '| --- | --- |',
    '| Compiles | ' + (checks.compiles ? 'yes' + (checks.diagnostics.length ? ', with ' + plural(checks.diagnostics.length, 'warning') : ', with no errors or warnings') : 'no: ' + (checks.diagnostics.find((d) => d.severity === 'error')?.message ?? 'see the compile log')) + ' |',
    '| Labels | ' + of(checks.labels) + (checks.labels.missing.length ? ' (missing: ' + checks.labels.missing.join(', ') + ')' : '') + ' |',
    '| References | ' + of(checks.references) + (checks.references.lost.length ? ' (lost: ' + checks.references.lost.join(', ') + ')' : '') + ' |',
    '| Citations | ' + of(checks.citations) + (checks.citations.lost.length ? ' (lost: ' + checks.citations.lost.join(', ') + ')' : '') + ' |',
    '| Numbered equations | ' + (checks.equations.output === checks.equations.source ? checks.equations.source : checks.equations.source + ' in the ' + from + ', ' + (checks.equations.output ?? 'unknown') + ' in the ' + to) + ' |',
    '| Floats | ' + floats + ' |',
    '| Words | ' + words + ' |',
    ...(checks.diagnostics.length ? ['', '### Compile messages', '', ...checks.diagnostics.map((d) => '- ' + d.file + (d.line ? ' line ' + d.line : '') + ': ' + d.message)] : []),
    ...(pictures.length ? ['', '## Pictures kept as PDF', '', ...pictures.map((p) => '- ' + (p.ok ? p.pdf : 'Not compiled') + ', from ' + (p.standalone ? p.standalone : 'the ' + p.env + ' in ' + p.file + (p.line ? ' line ' + p.line : '')) + '. Its source is ' + p.tex + '.' + (p.standalone ? '' : ' Redraw it in Typst (CeTZ or Lilaq in diagrams/) to edit it here.'))] : []),
    ...(notes.length ? ['', '## Approximations and things to check', '', ...notes.map((n) => '- ' + where(n) + ': ' + n.text)] : []),
    ''
  );
  await ensureDir(path.join(staging, 'conversion'));
  await fs.writeFile(path.join(staging, 'conversion', 'notes.md'), text);
}
