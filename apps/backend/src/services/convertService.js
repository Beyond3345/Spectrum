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
import { environments, lineAt, maskComments, mathSpans } from './convert/latexRead.js';
import { assembleTypst, astToTypst, latexFacts, pictureDocument, prepareLatex, typstDefinitions, typstLabel, typstMaths, typstPreamble } from './convert/toTypst.js';
import { assembleLatex, latexPreamble, prepareTypst, typstFacts, typstProse } from './convert/toLatex.js';
import { callAt, markupSpans } from './convert/typstRead.js';
import { flowchartFile, flowchartFor, flowchartOf, sameFlowchart } from './convert/diagrams.js';
import { finishRegions, markLatexInput, markTypstInput, regionNote } from './convert/regions.js';

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

// ─── The conversion record ───

/**
 * The record a conversion from `from` (latex or typst) left in the project at root, which a conversion back reads to
 * restore what the other language has no words for. Null when there is none, or it came the other way.
 */
async function conversionRecord(root, from) {
  try {
    const record = JSON.parse(await fs.readFile(path.join(root, '.spectrum', 'conversion.json'), 'utf8'));
    return record?.version === 1 && record.from === from ? record : null;
  } catch {
    return null;
  }
}

/**
 * Each title page's text in the converted file paired with its source, for the record: the converted one found again
 * on the way back means it wasn't edited, so its source goes back as it was. found: the title pages in the output.
 */
const titlePages = (file, sources, found) => (sources.length === found.length ? found.map((written, i) => ({ kind: 'titlepage', file, written, source: sources[i] })) : []);

/**
 * The record's title pages that file's text still has, each swapped for a token pandoc keeps as a word: { text,
 * restore(output) } where restore puts each source back in the converted output.
 */
function keepRegions(text, file, record) {
  const regions = (record?.titlePages ?? []).filter((r) => r.file === file && typeof r.written === 'string' && r.written && typeof r.source === 'string' && text.includes(r.written));
  regions.forEach((r, i) => {
    text = text.replace(r.written, () => '\n\nSPXV' + i + 'X\n\n');
  });
  return { text, regions, restore: (output) => regions.reduce((out, r, i) => out.replace(new RegExp('^[ \\t]*SPXV' + i + 'X[ \\t]*$', 'm'), () => r.source), output) };
}

/** A LaTeX preamble's commands one to an element, a command over several lines joined up, comments gone. */
function preambleCommands(text) {
  const out = [];
  let open = '';
  for (const line of withoutComments(text).split('\n')) {
    open += (open ? '\n' : '') + line.trim();
    const depth = [...open.replace(/\\./g, '')].reduce((n, ch) => n + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
    if (depth > 0) continue;
    if (open.trim()) out.push(open.trim());
    open = '';
  }
  return out;
}

/**
 * What each PDF with a standalone LaTeX document beside it was drawn from, for a figure that shows the PDF: { picture }
 * the TikZ a figure held, which the record says the converter took out of it, or { standalone } the document to
 * include; each with the preamble lines it needs. The TikZ is the file's as it is now, edits and all.
 */
async function texSources(root, files, record) {
  const out = new Map();
  for (const tex of files) {
    const pdf = tex.replace(/\.tex$/i, '.pdf');
    if (!/\.tex$/i.test(tex) || !files.has(pdf)) continue;
    const text = await fs.readFile(safeJoin(root, tex), 'utf8').catch(() => '');
    const begin = text.indexOf('\\begin{document}');
    const end = text.lastIndexOf('\\end{document}');
    if (!/^\s*\\documentclass\s*(?:\[[^\]]*\])?\s*\{standalone\}/.test(text) || begin === -1 || end < begin) continue;
    const body = text.slice(begin + '\\begin{document}'.length, end).trim();
    const preamble = preambleCommands(text.slice(0, begin)).filter((c) => !/^\\documentclass|^\\setlength\s*\{\\(?:textwidth|linewidth)\}/.test(c));
    const env = /^\\begin\{([A-Za-z]+\*?)\}/.exec(body)?.[1];
    const whole = env && environments(body, [env]).length === 1 && body.endsWith('\\end{' + env + '}');
    const taken = record?.pictures?.some((p) => p.source === tex && p.kind && p.kind !== 'standalone');
    out.set(pdf, taken && whole ? { picture: body, preamble } : { standalone: tex.replace(/\.tex$/i, ''), preamble });
  }
  return out;
}

/**
 * What each PDF with a Typst drawing beside it was drawn from: { body } the figure's own drawing, as the record has it,
 * when the file is still as the converter wrote it, or { include } a file a figure can include (one that sets its page
 * only when compiled on its own).
 */
async function typstSources(root, files, record) {
  const out = new Map();
  for (const typ of files) {
    const pdf = typ.replace(/\.typ$/i, '.pdf');
    if (!/\.typ$/i.test(typ) || !files.has(pdf)) continue;
    const text = await fs.readFile(safeJoin(root, typ), 'utf8').catch(() => '');
    const drawn = record?.pictures?.find((p) => p.source === typ && typeof p.body === 'string');
    if (drawn && text.trimEnd().endsWith(contentOfBody(drawn.body).trimEnd())) out.set(pdf, { body: drawn.body });
    else if (!/^\s*#set\s+page\((?![^\n]*\bif\s+sys\.inputs)/m.test(text) && !/^\s*#bibliography\(/m.test(text)) out.set(pdf, { include: typ });
  }
  return out;
}

/**
 * The LaTeX class and options the record has, with the size and paper the Typst sets now; null when the Typst no longer
 * agrees on chapters (an article made a report, or the other way), so the Typst decides.
 */
function sourceClass(source, facts) {
  if (!source?.class || ['report', 'book'].includes(source.class) !== facts.report) return null;
  const size = Math.round(facts.size) + 'pt';
  const paper = { a4: 'a4paper', 'us-letter': 'letterpaper', a5: 'a5paper' }[facts.paper] ?? 'a4paper';
  const options = (source.options ?? []).map((o) => (/^\d+pt$/.test(o) ? size : /^(?:a4|a5|letter)paper$/.test(o) ? paper : o));
  if (size !== '10pt' && !options.includes(size)) options.unshift(size);
  return { name: source.class, options };
}

/**
 * The composer's flowcharts among the project's diagrams/ files in from ('tikz' or 'typst'), each with its file in the
 * other language for the new project: { file: { to, text, write } }. The project's own file of the same drawing (a
 * conversion back) stays as it is (write false); otherwise one is written from the drawing. A flowchart whose texts
 * the other language can't take is left out, to compile to a PDF as any other drawing.
 */
async function composerFlowcharts(root, files, from) {
  const out = new Map();
  const to = from === 'tikz' ? 'typst' : 'tikz';
  const read = (rel) => fs.readFile(safeJoin(root, rel), 'utf8').catch(() => '');
  for (const rel of files) {
    if (!rel.startsWith('diagrams/') || !rel.endsWith(from === 'tikz' ? '.tex' : '.typ')) continue;
    const drawing = flowchartOf(await read(rel));
    if (!drawing || (drawing.language === 'typst') !== (from === 'typst')) continue;
    const other = rel.replace(/\.\w+$/, to === 'typst' ? '.typ' : '.tex');
    const existing = files.has(other) ? await read(other) : '';
    const before = flowchartOf(existing);
    if (before && sameFlowchart(flowchartFor(before, from, typstMaths), drawing)) {
      out.set(rel, { to: other, text: existing, write: false });
      continue;
    }
    const translated = flowchartFor(drawing, to, typstMaths);
    if (translated) out.set(rel, { to: other, text: flowchartFile(translated, to), write: true });
  }
  return out;
}

/** A flowchart's file in the other language, in the new project. */
async function writeFlowchart(staging, flowchart) {
  if (!flowchart.write) return;
  await ensureDir(path.dirname(path.join(staging, flowchart.to)));
  await fs.writeFile(path.join(staging, flowchart.to), flowchart.text);
}

// \verb and \lstinline in LaTeX, with their text: what a conversion back puts in place of `text`
const INLINE_CODE = /\\(?:verb\*?|lstinline(?:\[[^\]]*\])?)([^\sA-Za-z{])([^\n]*?)\1|\\lstinline(?:\[[^\]]*\])?\{([^{}\n]*)\}/g;

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
  // a project converted from Typst: its record says what to put back
  const previous = await conversionRecord(root, 'typst');
  const flowcharts = await composerFlowcharts(root, files, 'tikz');
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
    flowcharts: new Set(),
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
      // the composer's flowchart, written again in fletcher from its drawing
      const flowchart = findFile(base + '.tex');
      if (flowcharts.has(flowchart)) {
        ctx.flowcharts.add(flowchart);
        return { include: flowcharts.get(flowchart).to };
      }
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
    bibliography(block) {
      if (!ctx.citesOut.length && !ctx.nociteAll) return '';
      if (block.title) ctx.bibliographyTitle = block.title;
      return '#bibliography("refs.bib", style: ' + JSON.stringify(bibStyle) + (ctx.nociteAll ? ', full: true' : '') + ')';
    }
  };
  const bibStyle = typstBibStyle(facts.bibStyle, (text) => notes.push({ file: doc, line: null, text }));
  ctx.typstSources = await typstSources(root, files, previous);

  onStep('Converting');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-convert-work-'));
  try {
    const prepared = [];
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      const text = item.main ? mainText : await fs.readFile(safeJoin(root, item.src), 'utf8');
      const kept = keepRegions(text, item.src, previous);
      prepared.push({ ...item, text, kept, ...prepareLatex(kept.text, ctx, { file: item.src, main: item.main }) });
    }
    // the files the new project keeps, so a picture finds its data and the Typst its images
    const docs = new Set([...files].filter((f) => /\.(?:tex|ltx)$/i.test(f)));
    for (const rel of files) {
      if (!keeps(rel, docs)) continue;
      await ensureDir(path.dirname(path.join(staging, rel)));
      await fs.copyFile(safeJoin(root, rel), path.join(staging, rel));
    }
    if (bibText.trim()) await fs.writeFile(path.join(staging, 'refs.bib'), bibText.trim() + '\n');
    for (const tex of ctx.flowcharts) await writeFlowchart(staging, flowcharts.get(tex));

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
      let input = markLatexInput(file.input, detected, file.state, ctx);
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
    for (const file of prepared) file.typst = file.kept.restore(assembleTypst(file.pandocTypst, file.state, ctx));
    const regions = finishRegions(prepared, 'typst', ctx);
    notes.push(...regions.map(regionNote));

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
      // code in a sentence, which Typst writes as `text` for \verb and \lstinline alike
      inlineCode: [...whole.matchAll(INLINE_CODE)].map((m) => ({ text: m[2] ?? m[3], latex: m[0] })),
      titlePages: prepared.flatMap((f) => {
        if (f.kept.regions.length) return f.kept.regions.map((r) => ({ kind: r.kind, file: f.out, written: r.source, source: r.written }));
        const at = f.typst.indexOf('#page(numbering: none)[');
        const found = at === -1 ? [] : [f.typst.slice(at, callAt(f.typst, at).end)];
        return titlePages(f.out, environments(maskComments(f.text), ['titlepage']).map((e) => f.text.slice(e.start, e.end)), found);
      }),
      regions,
      checks
    };
    const pictures = ctx.pictures.map((p) => (p.ok ? p.pdf : 'Not compiled') + ', from ' + (p.standalone ? p.standalone : 'the ' + p.env + ' in ' + p.file + (p.line ? ' line ' + p.line : '')) + '. Its source is ' + p.tex + '.' + (p.standalone ? '' : ' Redraw it in Typst (CeTZ or Lilaq in diagrams/) to edit it here.'));
    await writeNotes(staging, { from: 'LaTeX', to: 'Typst', source: doc, out: main.out, checks, notes, pictures });
    await ensureDir(path.join(staging, '.spectrum'));
    await fs.writeFile(path.join(staging, '.spectrum', 'conversion.json'), JSON.stringify(record, null, 2) + '\n');
    // the checks again on a copy of the project whose files have changed since, as the AI tidying asks
    const recheck = async (dir) => checkLatexToTypst({ staging: dir, out: main.out, whole, facts, ctx, prepared: await Promise.all(prepared.map(async (f) => ({ ...f, typst: await fs.readFile(path.join(dir, f.out), 'utf8') }))) });
    return { mainFile: main.out, checks, notes, record, recheck };
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

/** A LaTeX document's figures as Typst counts them: one each, or one for each captioned minipage side by side. */
const latexFigures = (text) => environments(text, ['figure', 'figure*']).reduce((n, env) => n + Math.max(1, environments(env.body, ['minipage']).filter((m) => /\\caption/.test(m.body)).length), 0);

/** The floats of a LaTeX document by kind, as Typst counts its figures. */
function latexFloats(text, theorems) {
  const count = (names) => environments(text, names).length;
  const nested = (outer, inner) => environments(text, outer).reduce((n, env) => n + environments(env.body, inner).length, 0);
  return {
    figure: latexFigures(text),
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
  // each picture kept as PDF: what it is, where it came from and its source, as each direction words it
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
    ...(pictures.length ? ['', '## Pictures kept as PDF', '', ...pictures.map((line) => '- ' + line)] : []),
    ...(notes.length ? ['', '## Approximations and things to check', '', ...notes.map((n) => '- ' + where(n) + ': ' + n.text)] : []),
    ''
  );
  await ensureDir(path.join(staging, 'conversion'));
  await fs.writeFile(path.join(staging, 'conversion', 'notes.md'), text);
}

// ─── Typst to LaTeX ───

/** The labels a Typst file has: <name> outside code, raw text and maths. */
const typstLabels = (text) => {
  const spans = markupSpans(text);
  return [...text.matchAll(/<([A-Za-z0-9_:.-]+)>/g)].filter((m) => spans.some(([s, e]) => m.index >= s && m.index < e)).map((m) => m[1]);
};

/** The files a Typst file includes, project-relative. */
const typstIncludes = (text, from) => [...withoutComments(text.replace(/\/\/[^\n]*/g, '')).matchAll(/#include\s+"([^"]+)"/g)].map((m) => path.posix.normalize(m[1].startsWith('/') ? m[1].slice(1) : path.posix.join(path.posix.dirname(from), m[1])));

/**
 * The Typst document doc of the project at root as a LaTeX project in staging (an empty folder): { mainFile, checks,
 * notes, record }. onStep(text) hears each step as it starts. engine: the LaTeX engine that checks the result.
 */
export async function typstToLatex(root, doc, staging, { engine = 'auto', onStep = () => {} } = {}) {
  onStep('Reading');
  const executable = await pandocFor();
  if (!builtInTypst()) throw httpError('Typst isn’t available in this copy of Spectrum.', 400);
  const items = await listFilesRecursive(root);
  const files = new Set(items.filter((i) => i.type === 'file').map((i) => i.path));
  const read = (rel) => fs.readFile(safeJoin(root, rel), 'utf8');
  const mainText = await read(doc);
  // a project converted from LaTeX: its record says what to put back
  const previous = await conversionRecord(root, 'latex');
  const flowcharts = await composerFlowcharts(root, files, 'typst');
  // every file the document is made of, the main file first
  const order = [doc];
  for (let i = 0; i < order.length; i += 1) {
    for (const inc of typstIncludes(i === 0 ? mainText : await read(order[i]).catch(() => ''), order[i])) if (files.has(inc) && !order.includes(inc)) order.push(inc);
  }
  const texts = new Map([[doc, mainText]]);
  for (const rel of order.slice(1)) texts.set(rel, await read(rel));
  const labels = new Set([...texts.values()].flatMap(typstLabels));
  const bibPath = (/#bibliography\(\s*"([^"]+)"/.exec(mainText)?.[1] ?? 'refs.bib').replace(/^\/+/, '');
  const bibText = files.has(bibPath) ? await read(bibPath) : '';
  const notes = [];
  const facts = typstFacts();
  const out = (rel) => rel.replace(/\.typ$/i, '') + '.tex';
  const ctx = {
    facts,
    main: doc,
    labels,
    bibKeys: new Set(bibKeys(bibText)),
    used: new Set(),
    pictures: [],
    images: new Set(),
    refsOut: [],
    citesOut: [],
    equations: 0,
    note: (st, snippet, text) => notes.push({ file: st.file, line: lineOf(st.source, snippet), text }),
    include: (st, target) => {
      const rel = path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(st.file), target));
      return files.has(rel) ? out(rel) : null;
    },
    texSources: await texSources(root, files, previous),
    inlineCode: new Map((previous?.inlineCode ?? []).filter((c) => typeof c.text === 'string' && typeof c.latex === 'string').reverse().map((c) => [c.text, c.latex]))
  };

  onStep('Converting');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-convert-work-'));
  try {
    // the definitions a local #import brings in come first
    for (const m of mainText.matchAll(/#import\s+"(\/?[^"@][^"]*)"/g)) {
      const rel = m[1].replace(/^\/+/, '');
      if (files.has(rel)) prepareTypst(await read(rel), ctx, { file: rel });
    }
    const prepared = order.map((rel) => {
      const kept = keepRegions(texts.get(rel), rel, previous);
      return { src: rel, out: out(rel), kept, ...prepareTypst(kept.text, ctx, { file: rel }) };
    });
    ctx.sourceClass = sourceClass(previous?.source, facts);
    const packages = facts.packages.map((p) => p.from);
    if (packages.length) notes.push({ file: doc, line: null, text: 'The document imports ' + packages.join(', ') + '. pandoc cannot read a package, so anything drawn with it outside a figure is missing; each figure drawn with it became a picture.' });

    // the files the new project keeps: images and data, the Typst drawings as the source of their pictures
    for (const rel of files) {
      if (/\.typ$/i.test(rel) && !rel.startsWith('diagrams/')) continue;
      if (rel === bibPath || /\.pdf$/i.test(rel) && files.has(rel.replace(/\.pdf$/i, '.typ')) && !rel.startsWith('diagrams/')) continue;
      await ensureDir(path.dirname(path.join(staging, rel)));
      await fs.copyFile(safeJoin(root, rel), path.join(staging, rel));
    }
    if (bibText.trim()) await fs.writeFile(path.join(staging, 'references.bib'), bibText.trim() + '\n');

    for (const [i, picture] of ctx.pictures.entries()) {
      onStep('Pictures (' + (i + 1) + ' of ' + ctx.pictures.length + ')');
      // a composer's or the template's drawing, or a figure's own Typst, compiled on a page its own size
      const name = picture.include ? picture.include.replace(/\.typ$/i, '') : 'diagrams/converted-' + (i + 1);
      picture.pdf = name + '.pdf';
      picture.typ = picture.include ?? name + '.typ';
      // the composer's flowchart, written again in TikZ from its drawing and included as the composer's are
      const flowchart = flowcharts.get(picture.include);
      if (flowchart) {
        await writeFlowchart(staging, flowchart);
        picture.ok = true;
        picture.standalone = flowchart.to.replace(/\.tex$/i, '');
        ctx.texSources.set(picture.pdf, { standalone: picture.standalone, preamble: preambleCommands(flowchart.text.split('\\begin{document}')[0]).filter((c) => !/^\\documentclass/.test(c)) });
        continue;
      }
      if (picture.include && files.has(picture.pdf)) {
        picture.ok = true;
        continue;
      }
      // a figure's own drawing sets its page only on its own, as the composer's do, so a document can include it too
      const alone = ' if sys.inputs.at("spectrum-diagram", default: "") == "standalone"';
      const page = ['#set page(width: auto, height: auto, margin: 2pt)', '#set text(size: ' + facts.size + 'pt)'].map((l) => (picture.include ? l : l + alone));
      const wrapper = picture.include ? name + '.page.typ' : picture.typ;
      const body = picture.include ? ['#include "/' + picture.include + '"'] : [...facts.packages.map((p) => p.text), ...facts.definitions, contentOfBody(picture.body)];
      const head = picture.include ? [] : ['// A drawing from the figure in ' + picture.file + ', compiled to ' + picture.pdf + ' for the LaTeX version'];
      await ensureDir(path.join(staging, path.dirname(wrapper)));
      await fs.writeFile(path.join(staging, wrapper), [...head, ...page, ...body, ''].join('\n'));
      const result = await compileTypst(staging, path.join(staging, wrapper), wrapper, { scratch: true, typstInputs: { 'spectrum-diagram': 'standalone' } }).catch((err) => ({ ok: false, error: err.message }));
      if (picture.include) await fs.rm(path.join(staging, wrapper), { force: true });
      picture.ok = !!(result.ok && result.pdf);
      if (picture.ok) await fs.writeFile(path.join(staging, picture.pdf), Buffer.from(result.pdf, 'base64'));
      else notes.push({ file: picture.file, line: null, text: 'The Typst drawing ' + picture.typ + ' did not compile (' + (result.errors?.[0]?.message ?? result.error ?? 'see its log') + '), so the figure shows a box in its place.' });
    }

    for (const file of prepared) file.pandocLatex = await pandoc(executable, markTypstInput(file.input, file.state, ctx), ['--from=typst', '--to=latex', '--wrap=preserve'], work);
    for (const file of prepared) file.latex = file.kept.restore(assembleLatex(file.pandocLatex, file.state, ctx));
    const regions = finishRegions(prepared, 'latex', ctx);
    notes.push(...regions.map(regionNote));

    const main = prepared[0];
    ctx.hasBibliography = ctx.citesOut.length > 0 && !!bibText.trim();
    if (ctx.hasBibliography && !ctx.bibliographyPlaced) {
      main.latex += '\n\\printbibliography\n';
      notes.push({ file: doc, line: null, text: 'The Typst cites sources but has no #bibliography, so the LaTeX ends with its bibliography.' });
    }
    ctx.bibStyle = { apa: 'apa', ieee: 'ieee', 'chicago-author-date': 'authoryear', mla: 'mla', nature: 'nature', vancouver: 'vancouver' }[/style:\s*"([^"]+)"/.exec(/#bibliography\([^)]*\)/.exec(mainText)?.[0] ?? '')?.[1] ?? 'apa'] ?? 'apa';
    ctx.bibFile = 'references.bib';
    if (prepared.some((f) => /\\coloneqq|\\eqqcolon/.test(f.latex))) ctx.used.add('mathtools');
    ctx.titleLatex ??= facts.title ?? '';
    ctx.pdfTitle = String(ctx.titleLatex ?? '').replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?/g, '').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
    const preamble = latexPreamble(ctx);
    for (const file of prepared) {
      const text = file === main ? preamble + '\n\n\\begin{document}\n\n' + file.latex + '\n\\end{document}\n' : file.latex;
      await ensureDir(path.dirname(path.join(staging, file.out)));
      await fs.writeFile(path.join(staging, file.out), text);
    }
    // a picture back in its figure as TikZ no longer needs the PDF and the document it was compiled from
    const latexText = prepared.map((f) => f.latex).join('\n');
    for (const [pdf, source] of ctx.texSources) {
      if (!source.picture || !ctx.used.has('picture:' + pdf) || latexText.includes(pdf.replace(/\.pdf$/i, ''))) continue;
      for (const rel of [pdf, pdf.replace(/\.pdf$/i, '.tex')]) await fs.rm(path.join(staging, rel), { force: true });
    }

    onStep('Checking');
    const checks = await checkTypstToLatex({ root, doc, staging, out: main.out, texts, order, prepared, facts, ctx, engine });
    const record = {
      version: 1,
      from: 'typst',
      to: 'latex',
      spectrum: APP_VERSION,
      convertedAt: new Date().toISOString(),
      source: { mainFile: doc, report: facts.report, bibliography: bibPath, packages },
      files: prepared.map((f) => ({ from: f.src, to: f.out })),
      pictures: ctx.pictures.map((p) => ({ pdf: p.ok ? p.pdf : null, source: p.typ, from: p.file, kind: p.include ? 'include' : 'drawing', ...(p.include ? {} : { body: p.body }) })),
      titlePages: prepared.flatMap((f) => {
        if (f.kept.regions.length) return f.kept.regions.map((r) => ({ kind: r.kind, file: f.out, written: r.source, source: r.written }));
        const text = texts.get(f.src);
        const sources = f.state.blocks.filter((b) => b.kind === 'titlepage' && b.line).map((b) => {
          const start = text.split('\n').slice(0, b.line - 1).join('\n').length + (b.line > 1 ? 1 : 0);
          const call = callAt(text, text.indexOf('#', start));
          return call ? text.slice(text.indexOf('#', start), call.end) : null;
        });
        return sources.every(Boolean) ? titlePages(f.out, sources, environments(f.latex, ['titlepage']).map((e) => f.latex.slice(e.start, e.end))) : [];
      }),
      regions,
      checks
    };
    const pictures = ctx.pictures.map((p) => (p.ok ? p.pdf : 'Not compiled') + ', from ' + (p.include ? p.include : 'the drawing in a figure of ' + p.file) + '. Its source is ' + p.typ + '.');
    await writeNotes(staging, { from: 'Typst', to: 'LaTeX', source: doc, out: main.out, checks, notes, pictures });
    await ensureDir(path.join(staging, '.spectrum'));
    await fs.writeFile(path.join(staging, '.spectrum', 'conversion.json'), JSON.stringify(record, null, 2) + '\n');
    const recheck = async (dir) => checkTypstToLatex({ root, doc, staging: dir, out: main.out, texts, order, facts, ctx, engine, prepared: await Promise.all(prepared.map(async (f) => ({ ...f, latex: await fs.readFile(path.join(dir, f.out), 'utf8') }))) });
    return { mainFile: main.out, checks, notes, record, recheck };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** A figure's body as markup for a page of its own: content as it is, code (rect(…), a call) as #code. */
function contentOfBody(body) {
  const v = String(body).trim();
  return v.startsWith('[') ? v.slice(1, -1) : '#' + v;
}

/** The LaTeX log's last pass: the warnings that are still there once every pass has run. */
const lastPass = (log) => {
  const parts = String(log).split(/^This is (?:pdfTeX|XeTeX|LuaHBTeX|LuaTeX|e-TeX)/m);
  return parts[parts.length - 1];
};

/** The floats of a LaTeX document by kind, and its theorems by the names it gives them. */
function latexOutputFloats(text, theorems) {
  const count = (names) => environments(text, names).length;
  return {
    figure: latexFigures(text),
    subfigure: environments(text, ['figure', 'figure*']).reduce((n, env) => n + environments(env.body, ['subfigure']).length, 0),
    table: count(['table', 'table*', 'xltabular']),
    listing: environments(text, ['lstlisting']).filter((env) => /^\s*\[[^\]]*caption\s*=/.test(env.body)).length,
    algorithm: count(['algorithm']),
    theorem: theorems.length ? count(theorems) : 0
  };
}

/**
 * The checks of section 6.2 for a Typst to LaTeX conversion: the LaTeX compiles with the user's engine, and the labels,
 * references, citations, numbered equations, floats and words of the Typst (as Typst itself counts them) came through.
 */
async function checkTypstToLatex({ root, doc, staging, out, texts, order, prepared, facts, ctx, engine }) {
  const compiled = await compileFolder({ root: staging, mainFile: out, engine }).catch((err) => ({ ok: false, error: err.message, log: '' }));
  const log = lastPass(compiled.log ?? '');
  const diagnostics = [
    ...[...(compiled.log ?? '').matchAll(/^(?:\.\/)?[^\s:]+\.tex:(\d+): (.*)$|^! (.*)$/gm)].map((m) => ({ severity: 'error', message: (m[2] ?? m[3]).trim(), line: m[1] ? Number(m[1]) : undefined })),
    ...(compiled.ok ? [] : [{ severity: 'error', message: compiled.error ?? 'No PDF was produced.' }]),
    ...[...log.matchAll(/(?:LaTeX|Package \w+) Warning: ((?:Reference|Citation|Label)[^\n]*)/g)].map((m) => ({ severity: 'warning', message: m[1].trim() }))
  ];
  const latex = prepared.map((f) => f.latex).join('\n');
  // the Typst without its raw text, where an @ or #cite is an example, not a citation
  const typst = order.map((rel) => texts.get(rel)).join('\n').replace(/```[\s\S]*?```|`[^`\n]*`/g, (raw) => ' '.repeat(raw.length));
  const sourceLabels = [...ctx.labels];
  const outputLabels = new Set([...latex.matchAll(/\\label\{([^}]+)\}|\blabel=\{([^}]+)\}/g)].map((m) => m[1] ?? m[2]));
  const missingLabels = sourceLabels.filter((l) => !outputLabels.has(l));
  const spans = markupSpans(typst);
  const atRefs = [...typst.matchAll(/(?<![\p{L}\p{N}\\])@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])/gu)].filter((m) => spans.some(([s, e]) => m.index >= s && m.index < e)).map((m) => m[1]);
  const refsIn = [...atRefs.filter((r) => ctx.labels.has(r)), ...[...typst.matchAll(/#ref\(<([^>]+)>/g)].map((m) => m[1])];
  const citesIn = [...atRefs.filter((r) => !ctx.labels.has(r)), ...[...typst.matchAll(/#cite\((?:<([^>]+)>|label\("([^"]+)"\))/g)].map((m) => m[1] ?? m[2])];
  const refsOut = [...latex.matchAll(/\\(?:[cC]ref|ref|eqref|autoref|pageref)\*?\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((t) => t.trim()));
  const citesOut = [...latex.matchAll(/\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((k) => k.trim()).filter(Boolean));
  const refs = { source: tally(refsIn), output: tally(refsOut) };
  const cites = { source: tally(citesIn), output: tally(citesOut) };
  // what Typst itself counts in the original: numbered equations and figures by kind
  const found = await typstQuery(root, doc, []);
  const kinds = tally(found?.figures ?? []);
  const theorems = [...facts.theorems.keys()];
  const floatsIn = { figure: kinds.get('image') ?? 0, subfigure: kinds.get('subfigure') ?? 0, table: kinds.get('table') ?? 0, listing: kinds.get('raw') ?? 0, algorithm: kinds.get('algorithm') ?? 0, theorem: kinds.get('theorem') ?? 0 };
  const floatsOut = latexOutputFloats(latex, theorems);
  const equations = { source: found?.equations ?? null, output: numberedEquations(latex) };
  // what each side prints of itself, or keeps in an argument the masks leave out, is set level first: the and of
  // \cref{a,b}, a theorem's title, a listing's caption, a link's text; the Typst's units and its outline's titles
  const latexWords = latex
    .replace(/\\[cC]ref\{([^}]*)\}/g, (_, list) => ' ' + list.split(',').slice(1).map(() => 'and').join(' ') + ' ')
    .replace(/\\begin\{(?!figure|table|algorithm|subfigure|minipage|lstlisting|tabular|threeparttable)\w+\}\[([^\]]*)\]/g, ' $1 ')
    .replace(/caption=\{((?:[^{}]|\{[^{}]*\})*)\}/g, ' $1 ')
    .replace(/\\nolinkurl\{([^}]*)\}/g, ' $1 ');
  const typstWords = typstProse(typst).replace(/#outline\([^)]*\)/g, ' ').replace(/(\d)~[^\s,;:!?)\]]+/g, '$1');
  const words = { coverage: coverage(wordsOf(maskTypst(typstWords)), wordsOf(latexProse(latexWords))), lowestSection: null };
  const undefinedRefs = /There were undefined references|Reference `[^']+' on page \d+ undefined/.test(log);
  const result = {
    compiles: !!compiled.ok && !diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
    labels: { source: sourceLabels.length, kept: sourceLabels.length - missingLabels.length, missing: missingLabels },
    references: { source: total(refs.source), kept: kept(refs.source, refs.output), lost: [...refs.source].filter(([t, n]) => (refs.output.get(t) ?? 0) < n).map(([t]) => t) },
    citations: { source: total(cites.source), kept: kept(cites.source, cites.output), lost: [...cites.source].filter(([k, n]) => (cites.output.get(k) ?? 0) < n).map(([k]) => k), invented: [...cites.output.keys()].filter((k) => !cites.source.has(k)) },
    equations,
    floats: Object.fromEntries(Object.keys(floatsIn).map((kind) => [kind, { source: found ? floatsIn[kind] : null, output: floatsOut[kind] }])),
    words,
    undefinedReferences: undefinedRefs
  };
  result.ok = result.compiles && !undefinedRefs && !missingLabels.length && result.references.kept === result.references.source && result.citations.kept === result.citations.source && !result.citations.invented.length
    && equations.output === equations.source && Object.values(result.floats).every((f) => f.output === f.source);
  return result;
}
