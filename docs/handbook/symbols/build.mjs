// The handbook's symbol reference (chapters/12-symbols.typ), made from the app's own data: every symbol a diagram
// composer places, drawn by the code the composer writes and compiled as the printed document compiles it.
//
// Run from the repository root, after `npm ci`:
//
//   node docs/handbook/symbols/build.mjs
//
// It needs pdfLaTeX with circuitikz, pgfplots and tikz-cd (TeX Live), Ghostscript (gs), pdfcrop and typst on the PATH,
// and the fletcher package in Typst's cache. It writes symbols.json, which the chapter reads, and one PDF a symbol in
// pictures/, replacing what was there. Run it again after the catalogue, a symbol set or a composer's shapes change.
//
// Where each picture comes from:
// - the circuit catalogue and the symbol sets: the backend's own symbol drawing (symbolService.drawSymbols, the route
//   /api/diagram/symbols), as the parts list and the canvas show them, in a new drawing's style;
// - Annotate, Structures, Vector diagrams, flowcharts, commutative diagrams and plot marks: a small drawing made with
//   the composer's own placing functions, written by its own code function (circuitCode, structureCode, vectorCode,
//   tikzCode, cdCode, plotCode) and compiled with pdfLaTeX;
// - flowchart shapes in Typst: fletcherCode, compiled with typst.
// The names are the ones the parts lists and menus show, read from the composers' sources.
import { build } from 'esbuild';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const MODES = 'apps/frontend/src/diagram/modes';
const PICTURES = path.join(HERE, 'pictures');
const tmp = mkdtempSync(path.join(tmpdir(), 'spectrum-symbols-'));
// the backend's symbol drawing keeps its cache in the data folder: a throwaway one, never the user's
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects') });

// ─── the app's own modules ───

const entry = `
export { CATALOGUE } from './${MODES}/circuitikz/model';
export { symbolRequest } from './${MODES}/circuitikz/symbolGeometry';
export { circuitCode, readStyle as circuitStyle, symbolOptions } from './${MODES}/circuitikz/code';
export { PRESETS, presetElements, MATERIALS, PATTERNS } from './${MODES}/circuitikz/annotate';
export { placeTool, connect as connectStructure, emptyStructure } from './${MODES}/structures/model';
export { structureCode } from './${MODES}/structures/code';
export { emptyVectors, addPoint, applyTool, newAxes } from './${MODES}/vectors/model';
export { vectorCode } from './${MODES}/vectors/code';
export { NEW, FLETCHER_SHAPES, tikzCode } from './${MODES}/tikz/code';
export { fletcherCode } from './${MODES}/fletcher/code';
export { cdCode } from './${MODES}/tikzcd/code';
export { plotCode, newSeries, emptyPlot } from './${MODES}/pgfplots/code';
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.svg': 'text', '.css': 'empty' }, logLevel: 'error' });
writeFileSync(path.join(tmp, 'app.mjs'), bundle.outputFiles[0].text);
const app = await import(path.join(tmp, 'app.mjs'));
const { drawSymbols } = await import(path.join(ROOT, 'apps/backend/src/services/symbolService.js'));

// ─── names as the parts lists show them, from the composers' sources ───

const source = (file) => readFileSync(path.join(ROOT, MODES, file), 'utf8');
/** The array literal assigned to `const name` in a source file: strings and arrays only, so it reads as JSON-like JS. */
function literal(file, name) {
  const text = source(file);
  const start = text.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`${file} no longer has ${name}: update build.mjs`);
  const from = text.indexOf('= ', start) + 2;
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '[' || text[i] === '{') depth += 1;
    if (text[i] === ']' || text[i] === '}') depth -= 1;
    if (depth === 0) return Function(`return ${text.slice(from, i + 1)}`)();
  }
  throw new Error(`${name} in ${file} doesn’t close`);
}
/** Every match of a pattern's first two groups, as [value, label] pairs. */
const matches = (file, pattern) => [...source(file).matchAll(pattern)].map((m) => [m[1], m[2]]);

// ─── what to draw ───

/** Each section's groups: { section, title, set?, symbols: [{ id, name, key?, style?, draw }] } */
const groups = [];
const group = (section, title, symbols, extra = {}) => groups.push({ section, title, ...extra, symbols });

// The circuit catalogue and the symbol sets, in the parts list's order: its groups as they first appear
const SET_TITLES = Object.fromEntries(matches('../sets.ts', /'([\w-]+)': \{ label: '([^']+)'/g));
const styleName = (id) => (id ? app.CATALOGUE.find((p) => p.style === id)?.group : undefined);
for (const name of [...new Set(app.CATALOGUE.map((part) => part.group))]) {
  const parts = app.CATALOGUE.filter((part) => part.group === name && part.tikz);
  if (!parts.length) continue;
  const set = parts[0].set;
  group(set ? 'sets' : 'circuits', name, parts.map((part) => ({
    id: part.id,
    name: part.label,
    key: part.set ? part.tikz : part.tikz.split(',')[0],
    ...(part.style && { style: styleName(part.style) }),
    draw: { catalogue: part }
  })), set ? { set: SET_TITLES[set] ?? set } : {});
}

// Annotate: its tools and presets in the parts list's order, then the looks its Line, Point and Liquid or solid take
// (Point's dot is the tool's own picture, so only its cross is added)
const at = (x, y) => ({ x, y });
const annotation = (props) => ({ id: 'a1', kind: 'annotation', ...props });
const TOOL_LOOKS = {
  'annotate:line': annotation({ shape: 'line', points: [at(0, 0), at(0, 3), at(7, 3)], arrows: '->' }),
  'annotate:rect': annotation({ shape: 'rect', points: [at(0, 0), at(7, 4)] }),
  'annotate:ellipse': annotation({ shape: 'ellipse', points: [at(0, 0), at(7, 4)] }),
  'annotate:cross': annotation({ shape: 'cross', points: [at(0, 0)], width: 'thick' }),
  'annotate:polygon': annotation({ shape: 'polygon', points: [at(0, 0), at(7, 0), at(7, 4), at(0, 4)], material: 'water' }),
  'annotate:boundary': annotation({ shape: 'boundary', points: [at(0, 0), at(7, 0)] }),
  'annotate:dimension': annotation({ shape: 'dimension', points: [at(0, 0), at(7, 0), at(0, -2)], headSize: 'small', text: 'h' }),
  'annotate:surface': annotation({ shape: 'surface', points: [at(0, 0)] }),
  'annotate:mark': annotation({ shape: 'mark', points: [at(0, 0)], text: 'A' }),
  'annotate:leader': annotation({ shape: 'leader', points: [at(0, 3), at(5, 0)], arrows: '->', text: 'Text' })
};
const circuit = (elements) => ({ circuit: { elements, junctions: [] } });
const annotateTools = matches('circuitikz/panels.tsx', /\['(annotate:\w+)', '([^']+)'/g);
group('annotate', 'Tools', annotateTools.map(([tool, name]) => {
  if (!TOOL_LOOKS[tool]) throw new Error(`Annotate’s ${tool} is new: give it a look in build.mjs`);
  return { id: tool.slice(9), name, draw: circuit([TOOL_LOOKS[tool]]) };
}));
group('annotate', 'Presets', app.PRESETS.map(([id, name]) => ({ id, name, draw: circuit(app.presetElements({ elements: [], junctions: [] }, id, at(0, 0))) })));
const heads = literal('circuitikz/panels.tsx', 'HEADS');
group('annotate', 'Arrowheads and point marks', [
  ...heads.map(([head, name]) => ({ id: `head-${head || 'latex'}`, name, draw: circuit([annotation({ shape: 'line', points: [at(0, 0), at(5, 0)], arrows: '->', ...(head && { head }) })]) })),
  { id: 'mark-cross', name: 'Cross', draw: circuit([annotation({ shape: 'mark', points: [at(0, 0)], text: 'A', cross: true })]) }
]);
const square = [at(0, 0), at(5, 0), at(5, 4), at(0, 4)];
group('annotate', 'Liquids and solids', Object.entries(app.MATERIALS).map(([material, [name]]) => ({ id: `material-${material}`, name, draw: circuit([annotation({ shape: 'polygon', points: square, material })]) })));
group('annotate', 'Patterns', Object.entries(app.PATTERNS).map(([pattern, { label }]) => ({ id: `pattern-${pattern}`, name: label, draw: circuit([annotation({ shape: 'polygon', points: square, material: 'water', pattern })]) })));

// Structures: each tool of the parts list, used once on a short beam (or alone), with the canvas's placing functions
const TOLERANCE = 0.2;
const beam = (a = at(-1, 0), b = at(1, 0)) => app.connectStructure(app.emptyStructure(), 'beam', a, b, TOLERANCE).model;
const place = (model, tool, p) => app.placeTool(model, tool, p, TOLERANCE)?.model;
const STRUCTURE_LOOKS = {
  beam: () => app.connectStructure(app.emptyStructure(), 'beam', at(-1, 0), at(1, 0), TOLERANCE).model,
  bar: () => app.connectStructure(app.emptyStructure(), 'bar', at(-1, 0), at(1, 0), TOLERANCE).model,
  joint: () => place(beam(), 'joint', at(0, 0)),
  hinge: () => place(beam(), 'hinge', at(0, 0)),
  shear: () => place(beam(), 'shear', at(0, 0)),
  release: () => place(beam(), 'release', at(0.9, 0)),
  force: () => place(beam(), 'force', at(0, 0)),
  'moment-ccw': () => place(beam(), 'moment-ccw', at(0, 0)),
  'moment-cw': () => place(beam(), 'moment-cw', at(0, 0)),
  udl: () => place(beam(), 'udl', at(0, 0)),
  linear: () => place(beam(), 'linear', at(0, 0)),
  'dim-h': () => app.connectStructure(beam(at(-1, -0.5), at(1, 0.5)), 'dim-h', at(-1, -0.5), at(1, 0.5), TOLERANCE).model,
  'dim-v': () => app.connectStructure(beam(at(-1, -0.5), at(1, 0.5)), 'dim-v', at(-1, -0.5), at(1, 0.5), TOLERANCE).model,
  'dim-aligned': () => app.connectStructure(beam(at(-1, -0.5), at(1, 0.5)), 'dim-aligned', at(-1, -0.5), at(1, 0.5), TOLERANCE).model,
  label: () => place(app.emptyStructure(), 'label', at(0, 0)),
  angle: () => place(beam(), 'angle', at(-1, 0)),
  axes: () => place(app.emptyStructure(), 'axes', at(0, 0)),
  cut: () => app.connectStructure(beam(), 'cut', at(0, -0.5), at(0, 0.5), TOLERANCE).model
};
for (const [title, tools] of literal('structures/panels.tsx', 'GROUPS')) {
  group('structures', title, tools.map(([tool, name]) => {
    // a support at the beam's left end, where a fixed or guided one turns to face along it
    const look = tool.startsWith('support:') ? () => place(beam(), tool, at(-1, 0)) : STRUCTURE_LOOKS[tool];
    if (!look) throw new Error(`Structures’ ${tool} is new: give it a look in build.mjs`);
    return { id: tool.replace(':', '-'), name, draw: { structure: look() } };
  }));
}

// Vector diagrams: the marks of Axes and marks, then a point's shapes and the arrow tips, on bare points
function vectors(points, tools = []) {
  let model = app.emptyVectors();
  const ids = [];
  for (const [x, y, props] of points) {
    const added = app.addPoint(model, 'g1', at(x, y), !props);
    model = props ? { ...added.model, points: added.model.points.map((p) => (p.id === added.id ? { ...p, ...props } : p)) } : added.model;
    ids.push(added.id);
  }
  for (const [tool, picks] of tools) model = tool === 'axes' ? app.newAxes(model, 'g1').model : app.applyTool(model, tool, picks.map((i) => ids[i])).model;
  return { vectors: model };
}
const triangle = [[0, 0], [2, 0], [1.4, 1.2]];
const VECTOR_LOOKS = {
  axes: () => vectors([], [['axes', []]]),
  angle: () => vectors(triangle, [['segment', [0, 1]], ['segment', [0, 2]], ['angle', [0, 1, 2]]]),
  right: () => vectors([[0, 0], [2, 0], [0, 1.4]], [['segment', [0, 1]], ['segment', [0, 2]], ['right', [0, 1]]]),
  ticks: () => vectors([[0, 0], [2, 0]], [['ticks', [0, 1]]]),
  drop: () => vectors([[1.5, 1.2, { dot: true }]], [['drop', [0]]]),
  dropBoth: () => vectors([[1.5, 1.2, { dot: true }]], [['dropBoth', [0]]]),
  highlight: () => vectors([[0, 0], [2, 0]], [['highlight', [0, 1]]])
};
const vectorGroups = literal('vectors/panels.tsx', 'GROUPS');
const marks = vectorGroups.find(([title]) => title === 'Axes and marks');
if (!marks) throw new Error('Vector diagrams’ Axes and marks group has gone: update build.mjs');
group('vectors', marks[0], marks[1].map(([tool, name]) => {
  if (!VECTOR_LOOKS[tool]) throw new Error(`Vector diagrams’ ${tool} is new: give it a look in build.mjs`);
  return { id: tool, name, draw: VECTOR_LOOKS[tool]() };
}));
group('vectors', 'Point shapes', literal('vectors/panels.tsx', 'POINT_SHAPES').map(([shape, name]) => ({ id: `point-${shape}`, name, draw: vectors([[0, 0, { dot: true, label: undefined, ...(shape !== 'filled' && { shape }) }]]) })));
const tipNames = Object.entries(literal('vectors/panels.tsx', 'TIP_NAMES')).filter(([tip]) => tip !== 'none');
group('vectors', 'Arrow tips', tipNames.map(([tip, name]) => {
  const v = vectors([[0, 0], [1.5, 0]], [['vector', [0, 1]]]);
  v.vectors.items[0].end = tip;
  return { id: `tip-${tip.replace(' ', '-')}`, name, draw: v };
}));

// Flowcharts: each shape of the rail, at the size and with the text it is placed with, in TikZ and in Typst (fletcher)
const flowShapes = matches('tikz/index.tsx', /\{ id: '(\w+)', label: '([^']+)'/g).filter(([shape]) => shape in app.NEW);
const box = (shape) => {
  const [w, h, text] = app.NEW[shape];
  return { boxes: [{ id: 'n1', shape, x: 0, y: 0, w, h, text }], links: [] };
};
group('flow', 'Shapes in TikZ', flowShapes.map(([shape, name]) => ({ id: shape, name, draw: { tikz: box(shape) } })));
group('flow', 'Shapes in Typst', flowShapes.filter(([shape]) => app.FLETCHER_SHAPES.includes(shape)).map(([shape, name]) => ({ id: `typst-${shape}`, name, draw: { fletcher: box(shape) } })));

// Commutative diagrams: an arrow of each kind, then with each of its marks
const cd = (arrow) => ({ cd: { cells: [{ id: 'c1', row: 0, col: 0, text: 'A' }, { id: 'c2', row: 0, col: 1, text: 'B' }], arrows: [{ id: 'e1', from: 'c1', to: 'c2', ...arrow }] } });
const cdMarks = matches('tikzcd/index.tsx', /\['(hook|twoHeads|dashed)', '([^']+)'\]/g);
group('cd', 'Arrows', [
  ...literal('tikzcd/index.tsx', 'KINDS').map(([kind, name]) => ({ id: kind || 'plain', name, draw: cd(kind ? { kind } : {}) })),
  ...cdMarks.map(([mark, name]) => ({ id: mark, name, draw: cd({ [mark]: true }) }))
]);

// Plots: each mark a series can take, on one point (the axis hidden; see PLOT_PREAMBLE)
const plot = (mark) => ({ plot: { ...app.emptyPlot(), grid: 'none', xlabel: '', ylabel: '', xmin: '-1', xmax: '1', ymin: '-1', ymax: '1', width: '3', series: [{ ...app.newSeries('s1'), source: 'points', points: '0, 0', line: 'none', marks: true, mark }] } });
group('plots', 'Marks', literal('pgfplots/index.tsx', 'MARKS').filter(([mark]) => mark).map(([mark, name]) => ({ id: `mark-${mark.replace('*', '-filled')}`, name, key: mark, draw: plot(mark) })));

// ─── drawing them ───

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();
/** Ghostscript's ink box of each page, as %%HiResBoundingBox lines; 0 0 0 0 for an empty page. */
const pageBoxes = (pdf) => spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=bbox', pdf]).stderr.toString();
/** Splits a PDF into one file a page, in dir, named by `names`; returns each page's size in points. */
function split(pdf, dir, names) {
  const parts = path.join(tmp, `split-${path.basename(pdf, '.pdf')}`);
  mkdirSync(parts, { recursive: true });
  // no date, ID or XMP, so a run that changes nothing leaves the files as they were
  run('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dOmitInfoDate', '-dOmitID', '-dOmitXMP', '-o', path.join(parts, 'p-%03d.pdf'), pdf]);
  const pages = readdirSync(parts).filter((f) => f.endsWith('.pdf')).sort();
  if (pages.length !== names.length) throw new Error(`${path.basename(pdf)} has ${pages.length} pages for ${names.length} symbols`);
  mkdirSync(dir, { recursive: true });
  return pages.map((page, i) => {
    const bytes = readFileSync(path.join(parts, page));
    writeFileSync(path.join(dir, `${names[i]}.pdf`), bytes);
    const [, w, h] = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(bytes.toString('latin1')) ?? [];
    return { width: Number(w), height: Number(h) };
  });
}

const problems = [];
/** A page per symbol's picture in one pdfLaTeX run: each picture's packages and libraries loaded once, then each page. */
function latexPages(name, pictures, preamble = []) {
  const packages = [...new Set(pictures.flatMap((p) => p.packages))];
  const libraries = [...new Set(pictures.flatMap((p) => p.libraries))];
  const tex = [
    '\\documentclass[multi=spectrumpage,border=1pt]{standalone}',
    ...packages.map((p) => `\\usepackage{${p}}`),
    ...(libraries.length ? [`\\usetikzlibrary{${libraries.join(',')}}`] : []),
    ...preamble,
    '\\begin{document}',
    ...pictures.map((p, i) => `\\begin{spectrumpage}\\typeout{SPECTRUM page ${i + 1}}\n${p.body.trim()}\n\\end{spectrumpage}`),
    '\\end{document}',
    ''
  ].join('\n');
  writeFileSync(path.join(tmp, `${name}.tex`), tex);
  try {
    run('pdflatex', ['-interaction=nonstopmode', '-no-shell-escape', '-file-line-error', `${name}.tex`], tmp);
  } catch {
    // nonstopmode carries on past an error; the log says which page had it
  }
  const log = readFileSync(path.join(tmp, `${name}.log`), 'latin1');
  let page = 0;
  for (const line of log.split('\n')) {
    const m = /^SPECTRUM page (\d+)/.exec(line);
    if (m) page = Number(m[1]);
    else if (/^(\.\/)?[\w-]+\.tex:\d+: |^! /.test(line)) problems.push(`${name}, page ${page}: ${line.trim()}`);
  }
  // cropped to the ink, with a hair of margin: a hidden plot axis and the pictures' own empty room go
  run('pdfcrop', ['--margins', '1', `${name}.pdf`, `${name}-cropped.pdf`], tmp);
  return path.join(tmp, `${name}-cropped.pdf`);
}

/** A picture's code: the composer's code function on its drawing. */
function pictureOf(draw) {
  if (draw.circuit) return app.circuitCode(draw.circuit, {});
  if (draw.structure) return app.structureCode(draw.structure, { view: 'loading', names: false, width: 3 });
  if (draw.vectors) return app.vectorCode(draw.vectors, {});
  if (draw.tikz) return app.tikzCode(draw.tikz);
  if (draw.cd) return app.cdCode(draw.cd);
  if (draw.plot) return app.plotCode(draw.plot);
  throw new Error('nothing to draw');
}

rmSync(PICTURES, { recursive: true, force: true });
const fileOf = (g, s) => `${g.section}/${s.id}`;
const sizes = new Map();

// the catalogue: one request a set, as the parts list asks, in a new drawing's style
const ctikzOptions = app.symbolOptions(app.circuitStyle({}));
const catalogue = groups.filter((g) => g.section === 'circuits' || g.section === 'sets').flatMap((g) => g.symbols.map((s) => ({ g, s })));
for (const set of [...new Set(catalogue.map(({ s }) => s.draw.catalogue.set || 'circuitikz'))]) {
  const these = catalogue.filter(({ s }) => (s.draw.catalogue.set || 'circuitikz') === set);
  const drawn = await drawSymbols({ parts: these.map(({ s }) => app.symbolRequest({ type: s.id, options: [] })), style: { ctikzOptions } });
  if (!drawn.ok) throw new Error(`The ${set} symbols weren’t drawn: ${drawn.error}\n${drawn.log ?? ''}`);
  for (const page of drawn.pages) if (page.error) problems.push(`${set}, ${page.id}: ${page.error}`);
  const pdf = path.join(tmp, `${set}.pdf`);
  writeFileSync(pdf, Buffer.from(drawn.pdf, 'base64'));
  const boxes = [...pageBoxes(pdf).matchAll(/%%HiResBoundingBox: ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/g)].map((m) => m.slice(1).map(Number));
  // a part TeX draws as nothing (circuitikz's open, which only carries a voltage): drawn as a drawing writes it,
  // between two points with its voltage
  boxes.forEach((b, i) => {
    if (b[2] - b[0] < 0.5 && b[3] - b[1] < 0.5) these[i].s.blank = true;
  });
  const out = split(pdf, path.join(PICTURES, 'catalogue'), these.map(({ s }) => s.id));
  these.forEach(({ s }, i) => sizes.set(s, { file: `catalogue/${s.id}`, ...out[i] }));
}
for (const { s } of catalogue.filter(({ s }) => s.blank)) {
  const part = s.draw.catalogue;
  s.draw = circuit([{ id: 'p1', kind: 'path', type: part.id, a: at(0, 0), b: at(6, 0), ...(part.defaultVoltage && { voltage: { text: `${part.defaultVoltage}_1` } }) }]);
  delete s.blank;
  rmSync(path.join(PICTURES, 'catalogue', `${s.id}.pdf`));
}

// the rest: one pdfLaTeX run a section; fletcher's a typst run a shape
// pgfplots draws its axis: hidden here, so the mark alone shows, as it prints on a plot
const PLOT_PREAMBLE = ['\\pgfplotsset{every axis/.append style={hide axis}}'];
const drawnByLatex = groups.flatMap((g) => g.symbols.filter((s) => !s.draw.catalogue && !s.draw.fletcher).map((s) => ({ g, s })));
for (const section of [...new Set(drawnByLatex.map(({ g }) => g.section))]) {
  const these = drawnByLatex.filter(({ g }) => g.section === section);
  const pdf = latexPages(section, these.map(({ s }) => pictureOf(s.draw)), section === 'plots' ? PLOT_PREAMBLE : []);
  const out = split(pdf, path.join(PICTURES, section), these.map(({ s }) => s.id));
  these.forEach(({ g, s }, i) => sizes.set(s, { file: fileOf(g, s), ...out[i] }));
}
for (const { g, s } of groups.flatMap((g) => g.symbols.filter((s) => s.draw.fletcher).map((s) => ({ g, s })))) {
  const typ = path.join(tmp, `${s.id}.typ`);
  writeFileSync(typ, app.fletcherCode(s.draw.fletcher).body);
  try {
    run('typst', ['compile', '--input', 'spectrum-diagram=standalone', typ, path.join(tmp, `${s.id}.pdf`)], tmp);
  } catch (err) {
    problems.push(`${s.id}: ${err.stderr?.toString().trim()}`);
    continue;
  }
  const [size] = split(path.join(tmp, `${s.id}.pdf`), path.join(PICTURES, g.section), [s.id]);
  sizes.set(s, { file: fileOf(g, s), ...size });
}

// empty pictures are faults too
for (const dir of readdirSync(PICTURES)) {
  for (const file of readdirSync(path.join(PICTURES, dir))) {
    const box = /%%HiResBoundingBox: ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/.exec(pageBoxes(path.join(PICTURES, dir, file)));
    if (!box || (Number(box[3]) - Number(box[1]) < 0.5 && Number(box[4]) - Number(box[2]) < 0.5)) problems.push(`${dir}/${file}: the picture is empty`);
  }
}

// ─── the data the chapter reads ───

const data = {
  note: 'Made by build.mjs from the app’s own data. Do not edit by hand.',
  sections: [...new Set(groups.map((g) => g.section))].map((section) => ({
    id: section,
    groups: groups.filter((g) => g.section === section).map((g) => ({
      title: g.title,
      ...(g.set && { set: g.set }),
      symbols: g.symbols.flatMap((s) => {
        const size = sizes.get(s);
        if (!size) return [];
        return [{ id: s.id, name: s.name, ...(s.key && { key: s.key }), ...(s.style && { style: s.style }), picture: `pictures/${size.file}.pdf`, width: Math.round(size.width * 100) / 100, height: Math.round(size.height * 100) / 100 }];
      })
    }))
  }))
};
writeFileSync(path.join(HERE, 'symbols.json'), `${JSON.stringify(data, null, 1)}\n`);
rmSync(tmp, { recursive: true, force: true });

const count = (section) => data.sections.find((s) => s.id === section)?.groups.reduce((n, g) => n + g.symbols.length, 0) ?? 0;
console.log(data.sections.map((s) => `${s.id}: ${count(s.id)} symbols in ${s.groups.length} groups`).join('\n'));
if (problems.length) {
  console.log(`\n${problems.length} problems:\n${problems.join('\n')}`);
  process.exitCode = 1;
}
