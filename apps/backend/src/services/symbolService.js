// The diagram composer's symbols, drawn by the user's own TeX in the diagram's style: one standalone page per part,
// compiled with pdfLaTeX (or the built-in Tectonic when there's none), with each part's pins read back from the log.
// A part comes from a symbol set (data/symbolSets.js): circuitikz's parts by their key, Spectrum's own as \pic
// definitions. No package's drawing ships with Spectrum, and the symbols on the canvas match the PDF the diagram
// compiles to.
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { SYMBOL_SETS, picDefinition, setOfPic } from '../data/symbolSets.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { PATH_KEY, findExecutable, runSpawn, texPath, unwrap } from './compileService.js';
import { builtInTectonic } from './engineService.js';

// a -file-line-error line (./main.tex:12: …, main.tex:12: …, C:/…/main.tex:12: …) or a plain TeX error (! …)
const FILE_LINE_ERROR = /^(?:(?:[A-Za-z]:)?[^:\n]*\.(?:tex|sty|cls|def|cfg):\d+: |! )/;

const TIME_LIMIT_MS = 60_000;
// Tectonic fetches the packages it hasn't used before
const TECTONIC_LIMIT_MS = 5 * 60_000;
const MAX_PARTS = 300;
// the TeX gets these as they are: key names and values, option lists and anchor names, never anything TeX would read
// as code or that could close the option list (no \ { } [ ] ( ) % # $ & ~ ; or quotes)
const SAFE = /^[\w .,=+\-/*<>^!|:]*$/;
const BORDER_PT = 1;
// TeX's points to the PDF's, in which pdf.js draws a page at scale 1
const TO_BP = 72 / 72.27;
const WINDOWS = process.platform === 'win32';
const cacheDir = () => path.join(DATA_DIR, 'cache', 'symbols');

const PREAMBLE = [
  `\\documentclass[multi=spectrumpage,border=${BORDER_PT}pt]{standalone}`,
  // one page each; \unskip, or the line's end before \end{spectrumpage} would widen the page by a space
  '\\newenvironment{spectrumpage}{}{\\unskip}',
  '\\makeatletter',
  // {node}{anchor}{when it has it}{when it doesn't}: pgf keeps a node's shape in \pgf@sh@ns@<node>, and the shape's
  // anchors as \pgf@anchor@<shape>@<anchor>
  '\\newcommand\\spectrumifanchor[4]{\\ifcsname pgf@sh@ns@#1\\endcsname\\ifcsname pgf@anchor@\\csname pgf@sh@ns@#1\\endcsname @#2\\endcsname#3\\else#4\\fi\\else#4\\fi}',
  // half the length of a path part's glyph, between its left and right anchors (which invert swaps), so it draws
  // between two points with no leads
  '\\newdimen\\spectrumhalf',
  '\\newcommand\\spectrummeasure[1]{\\global\\spectrumhalf=0.7cm\\spectrumifanchor{#1}{left}{\\spectrumifanchor{#1}{right}{\\pgfpointdiff{\\pgfpointanchor{#1}{left}}{\\pgfpointanchor{#1}{right}}\\global\\spectrumhalf=0.5\\pgf@x\\ifdim\\spectrumhalf<0pt\\global\\spectrumhalf=-\\spectrumhalf\\fi}{}}{}}',
  // {node}{anchor}{the pin's name}: a pic's pin is its coordinate <pic>-<pin>, read at its centre
  '\\newcommand\\spectrumpin[3]{\\spectrumifanchor{#1}{#2}{\\pgfpointanchor{#1}{#2}\\typeout{SPECTRUM pin \\the\\pgf@x\\space\\the\\pgf@y\\space#3}}{\\typeout{SPECTRUM nopin #3}}}',
  '\\newcommand\\spectrumbox{\\typeout{SPECTRUM box \\the\\pgf@picminx\\space\\the\\pgf@picminy\\space\\the\\pgf@picmaxx\\space\\the\\pgf@picmaxy}}',
  '\\makeatother'
];

const text = (value, max) => typeof value === 'string' && value.length <= max && SAFE.test(value) && !value.includes('^^');
const names = (value) => value === undefined || (Array.isArray(value) && value.length <= 50 && value.every((v) => text(v, 200) && v.trim()));

/** Why a symbols request can't be drawn, or '' when it can. */
export function symbolsRequestError(body) {
  const { parts, style, texFolder } = body || {};
  if (!Array.isArray(parts) || !parts.length || parts.length > MAX_PARTS) return `Send between 1 and ${MAX_PARTS} parts.`;
  const allowed = 'letters, digits, spaces and . , = + - / * < > ^ ! | :';
  for (const part of parts) {
    if (typeof part?.id !== 'string' || !part.id || part.id.length > 200) return 'Each part needs an id.';
    if (part.kind !== 'path' && part.kind !== 'node' && part.kind !== 'pic') return `${part.id}: the kind is path, node or pic.`;
    if (!text(part.tikz, 200) || !part.tikz.trim()) return `${part.id}: the circuitikz key can only have ${allowed}`;
    if (part.kind === 'pic' && !setOfPic(part.tikz)) return `${part.id}: ${part.tikz} is in no symbol set.`;
    if (!names(part.options) || !names(part.pins)) return `${part.id}: options and pins can only have ${allowed}`;
  }
  if (style != null && (typeof style !== 'object' || (style.ctikzOptions !== undefined && !text(style.ctikzOptions, 2000)))) {
    return `The style’s circuitikz options can only have ${allowed}`;
  }
  if (texFolder != null && typeof texFolder !== 'string') return 'The TeX folder must be a folder’s path.';
  return '';
}

/** The sets a request's parts come from: a pic's own, circuitikz's for the rest. */
const setsOf = (parts) => [...new Set(parts.map((part) => (part.kind === 'pic' ? setOfPic(part.tikz) : 'circuitikz')))];

/**
 * The pages' TeX: the sets' packages, libraries and pics, then a path part between two points its glyph's length
 * apart, a node or pic part at the origin. The picture is circuitikz's, in the style's options, when that's loaded.
 */
function symbolsTex(parts, options) {
  const sets = setsOf(parts).map((id) => SYMBOL_SETS[id]);
  const packages = [...new Set(['tikz', ...sets.flatMap((set) => set.packages)])];
  const libraries = [...new Set(sets.flatMap((set) => set.libraries))];
  const environment = packages.includes('circuitikz') ? 'circuitikz' : 'tikzpicture';
  const picture = environment === 'circuitikz' ? `\\begin{circuitikz}[${options}]` : '\\begin{tikzpicture}';
  const lines = parts.map((part, i) => {
    const n = i + 1;
    const keys = [part.tikz, ...(part.options || [])].join(', ');
    const node = `spectrum${n}`;
    const pins = (part.pins || []).map((pin) => (part.kind === 'pic' ? `\\spectrumpin{${node}-${pin}}{center}{${pin}}` : `\\spectrumpin{${node}}{${pin}}{${pin}}`)).join('');
    const drawn = part.kind === 'path'
      // drawn once into a box that's thrown away, to measure the glyph
      ? `\\sbox0{${picture}\\draw (0,0) to[${keys}, n=${node}m] (10,0);\\spectrummeasure{${node}m}\\end{circuitikz}}`
        + `${picture}\\draw (-\\the\\spectrumhalf,0) to[${keys}, n=${node}] (\\the\\spectrumhalf,0);\\typeout{SPECTRUM half \\the\\spectrumhalf}`
      : part.kind === 'pic'
        ? `${picture}\\pic${part.options?.length ? `[${part.options.join(', ')}]` : ''} (${node}) at (0,0) {${part.tikz}};`
        : `${picture}\\node[${keys}] (${node}) at (0,0) {};`;
    return `\\begin{spectrumpage}\\typeout{SPECTRUM page ${n}}${drawn}${pins}\\spectrumbox\\end{${environment}}\\end{spectrumpage}`;
  });
  return [
    PREAMBLE[0],
    ...packages.map((name) => `\\usepackage{${name}}`),
    ...(libraries.length ? [`\\usetikzlibrary{${libraries.join(',')}}`] : []),
    ...PREAMBLE.slice(1),
    ...sets.flatMap((set) => Object.entries(set.pics).map(([key, body]) => picDefinition(key, body))),
    '\\begin{document}',
    ...lines,
    '\\end{document}',
    ''
  ].join('\n');
}

/** circuitikz.sty's date on this TeX, for the cache's key: a TeX update draws the parts afresh. '' when unknown. */
const packageDates = new Map();
async function packageDate(name, searchPath) {
  const key = `${name}\n${searchPath ?? ''}`;
  if (!packageDates.has(key)) {
    packageDates.set(key, (async () => {
      const kpsewhich = await findExecutable('kpsewhich', searchPath ?? process.env.PATH);
      if (!kpsewhich) return '';
      const env = searchPath ? { ...process.env, [PATH_KEY]: searchPath } : process.env;
      const output = [];
      await runSpawn(kpsewhich, [name], os.tmpdir(), (chunk) => output.push(chunk), env, 10_000);
      const found = Buffer.concat(output).toString().trim().split(/\r?\n/)[0];
      return found ? String((await fs.stat(found)).mtimeMs) : '';
    })().catch(() => ''));
  }
  return packageDates.get(key);
}

const points = (pt) => Math.round(pt * TO_BP * 1000) / 1000;

/**
 * Each part's page from the log: its size and reference point (from the page's top-left corner, y down, as pdf.js
 * draws it), and its pins as offsets from the reference point (y up, as TikZ has them), all in PDF points. A path
 * part's ends are its start and end pins. A page with a TeX error carries the error's first line.
 */
function readPages(parts, log, engine) {
  const pages = parts.map((part, i) => ({ id: part.id, page: i + 1, width: 0, height: 0, origin: { x: 0, y: 0 }, pins: [], half: null, box: null, error: '' }));
  let page = null;
  for (const line of log.split(/\r?\n/)) {
    const [, kind, rest] = /^SPECTRUM (page|half|pin|box) (.*)$/.exec(line) || [];
    const dims = (rest || '').split(' ').map((d) => parseFloat(d));
    if (kind === 'page') page = pages[Number(rest) - 1] ?? null;
    else if (!page) continue;
    else if (kind === 'half') page.half = dims[0];
    else if (kind === 'pin') page.pins.push({ name: rest.split(' ').slice(2).join(' '), x: points(dims[0]), y: points(dims[1]) });
    else if (kind === 'box') page.box = dims;
    // MiKTeX names the file without TeX Live's ./, and may give a drive letter
    else if (!page.error && FILE_LINE_ERROR.test(line)) page.error = line.replace(FILE_LINE_ERROR, '').trim();
  }
  return pages.map(({ half, box, error, ...page }, i) => {
    if (!box || box.some((d) => !Number.isFinite(d))) return { ...page, error: error || `${engine} didn’t draw this part.` };
    const [minx, miny, maxx, maxy] = box;
    const ends = parts[i].kind === 'path' && Number.isFinite(half)
      ? [{ name: 'start', x: points(-half), y: 0 }, { name: 'end', x: points(half), y: 0 }]
      : [];
    return {
      ...page,
      width: points(maxx - minx + 2 * BORDER_PT),
      height: points(maxy - miny + 2 * BORDER_PT),
      origin: { x: points(BORDER_PT - minx), y: points(BORDER_PT + maxy) },
      pins: [...ends, ...page.pins.filter((pin) => !ends.some((end) => end.name === pin.name))],
      ...(error && { error })
    };
  });
}

/**
 * Draws the parts ({ id, tikz, kind: 'path' | 'node' | 'pic', options?, pins? }) in a circuitikz picture with the
 * style's options (`style.ctikzOptions`, picture options as the diagram's own picture has them; a \ctikzset key goes
 * in as /tikz/circuitikz/<key>), or a plain TikZ one when no part is circuitikz's, with pdfLaTeX from texFolder or the
 * PATH, else the built-in Tectonic, no shell escape, in a folder of its own. Resolves { ok, engine, pdf (base64, a page
 * a part), pages, log (when a part failed) }, kept in the data folder's cache by the request, the engine, the sets'
 * versions and circuitikz.sty's date, so a TeX update or a changed set draws them afresh.
 * ponytail: the cache never empties; prune by age if the folder grows.
 */
export async function drawSymbols({ parts, style, texFolder }) {
  const request = {
    parts: parts.map(({ id, tikz, kind, options = [], pins = [] }) => ({ id, tikz, kind, options, pins })),
    options: style?.ctikzOptions || '',
    texFolder: texFolder || ''
  };
  const sets = setsOf(request.parts);
  const searchPath = await texPath(texFolder);
  const pdflatex = await findExecutable('pdflatex', searchPath ?? process.env.PATH);
  const tectonic = pdflatex ? null : builtInTectonic();
  if (!pdflatex && !tectonic) {
    return { ok: false, error: `The symbols need pdfLaTeX, which isn’t installed. Install ${WINDOWS ? 'MiKTeX' : 'MacTeX'} or TeX Live, or choose its folder in Settings › Engines › LaTeX.` };
  }
  const engine = pdflatex ? 'pdfLaTeX' : 'Tectonic';
  const versions = Object.fromEntries(sets.map((id) => [id, SYMBOL_SETS[id].version]));
  const date = pdflatex && sets.includes('circuitikz') ? await packageDate('circuitikz.sty', searchPath) : '';
  const key = crypto.createHash('sha256').update(JSON.stringify({ request, engine: pdflatex || tectonic, versions, date })).digest('hex');
  const cached = path.join(cacheDir(), `${key}.json`);
  const hit = await readJson(cached).catch(() => null);
  if (hit?.ok) return hit;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-symbols-'));
  try {
    await fs.writeFile(path.join(dir, 'symbols.tex'), symbolsTex(request.parts, request.options));
    // MiKTeX asks before installing a missing package, in a window the hidden run never shows. Tectonic carries on
    // past a part's error, as pdfLaTeX's nonstopmode does, and keeps the log the pins are read from
    const args = pdflatex
      ? [...(WINDOWS && /[\\/]miktex[\\/]/i.test(pdflatex) ? ['--enable-installer'] : []), '-interaction=nonstopmode', '-no-shell-escape', '-file-line-error', 'symbols.tex']
      : ['-Z', 'continue-on-errors', '--keep-logs', '--outdir', '.', 'symbols.tex'];
    const output = [];
    const env = searchPath ? { ...process.env, [PATH_KEY]: searchPath } : process.env;
    const run = await runSpawn(pdflatex || tectonic, args, dir, (chunk) => output.push(chunk), env, pdflatex ? TIME_LIMIT_MS : TECTONIC_LIMIT_MS);
    const log = unwrap(await fs.readFile(path.join(dir, 'symbols.log'), 'utf8').catch(() => Buffer.concat(output).toString()));
    if (run.timedOut) return { ok: false, error: `Drawing the symbols took over ${pdflatex ? 'a minute' : 'five minutes'}, so it was stopped.`, log };
    const pdf = await fs.readFile(path.join(dir, 'symbols.pdf')).catch(() => null);
    if (!pdf) return { ok: false, error: `${engine} made no PDF of the symbols.`, log };
    const pages = readPages(request.parts, log, engine);
    const result = { ok: true, engine, pdf: pdf.toString('base64'), pages, ...(pages.some((page) => page.error) && { log }) };
    await writeJsonAtomic(cached, result).catch(() => {});
    return result;
  } catch (err) {
    return { ok: false, error: `${engine} couldn’t run: ${err.message}` };
  } finally {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
