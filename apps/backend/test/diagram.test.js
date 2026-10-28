// The diagram composer's backend: circuit symbols drawn by the installed circuitikz, a diagram's preview through the
// usual compile, and the diagrams the file tree lists. With the TeX on this computer (those tests skip without
// pdfLaTeX and circuitikz). In-process, against throwaway data and projects folders. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-diagram-')));
const dataDir = path.join(tmp, 'data');
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: dataDir,
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
const { createProject, readMeta } = await import('../src/services/projectService.js');
const { findExecutable } = await import('../src/services/compileService.js');
const { listVersions } = await import('../src/services/versionService.js');
const { registerCompileRoutes } = await import('../src/routes/compile.js');
const { registerDiagramRoutes } = await import('../src/routes/diagram.js');
const { registerProjectRoutes } = await import('../src/routes/projects.js');
const { default: Fastify } = await import('fastify');

const app = Fastify();
registerCompileRoutes(app);
registerDiagramRoutes(app);
registerProjectRoutes(app);
after(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const pdflatex = await findExecutable('pdflatex');
const kpsewhich = await findExecutable('kpsewhich');
const has = (file) => {
  try {
    return !!execFileSync(kpsewhich, [file], { encoding: 'utf8' }).trim();
  } catch {
    return false;
  }
};
const needsTex = !pdflatex ? 'needs pdflatex' : !kpsewhich || !has('circuitikz.sty') || !has('standalone.cls') ? 'needs circuitikz and standalone' : false;

const post = async (url, payload) => {
  const res = await app.inject({ method: 'POST', url, payload });
  return { status: res.statusCode, body: res.json() };
};
const symbols = (parts, ctikzOptions = 'american') => post('/api/diagram/symbols', { parts, style: { ctikzOptions } });
const pin = (page, name) => page.pins.find((p) => p.name === name);

test('symbols: a page per part, a path part between its glyph’s ends, a node part with its pins, then from the cache', { skip: needsTex }, async () => {
  const parts = [
    { id: 'resistor', tikz: 'R', kind: 'path' },
    { id: 'amp', tikz: 'op amp', kind: 'node', pins: ['+', '-', 'out', 'no such anchor'] },
    { id: 'gate', tikz: 'and port', kind: 'node', pins: ['in 1', 'in 2', 'out'] }
  ];
  const { status, body } = await symbols(parts);
  assert.equal(status, 200);
  assert.ok(body.ok, body.error || body.log);
  assert.equal(Buffer.from(body.pdf, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(body.pages.map((p) => [p.id, p.page]), [['resistor', 1], ['amp', 2], ['gate', 3]]);
  assert.equal(body.log, undefined, 'no log when every part drew');
  const [resistor, amp, gate] = body.pages;
  // the glyph alone, centred on its reference point, its ends where the wires meet it
  assert.ok(pin(resistor, 'end').x > 10 && pin(resistor, 'start').x === -pin(resistor, 'end').x);
  assert.equal(pin(resistor, 'start').y, 0);
  assert.ok(Math.abs(resistor.origin.x - resistor.width / 2) < 0.01, 'the reference point is the middle of the page');
  assert.ok(resistor.width > 2 * pin(resistor, 'end').x && resistor.width < 2 * pin(resistor, 'end').x + 4);
  // the op amp's inputs on the left, - above +, its output on the right; an anchor it hasn't is left out
  assert.deepEqual(amp.pins.map((p) => p.name), ['+', '-', 'out']);
  assert.ok(pin(amp, '+').x < 0 && pin(amp, '-').y > pin(amp, '+').y && pin(amp, 'out').x > 0);
  assert.ok(amp.origin.x > 0 && amp.origin.x < amp.width && amp.origin.y > 0 && amp.origin.y < amp.height);
  assert.deepEqual(gate.pins.map((p) => p.name), ['in 1', 'in 2', 'out']);

  // the same request again comes from the data folder's cache, without pdfLaTeX
  const cache = path.join(dataDir, 'cache', 'symbols');
  assert.equal((await fs.readdir(cache)).length, 1);
  const since = Date.now();
  const again = await symbols(parts);
  assert.deepEqual(again.body, body);
  assert.ok(Date.now() - since < 200);
  // the style is part of the request: European symbols are drawn afresh
  const european = await symbols(parts.slice(0, 1), 'european');
  assert.ok(european.body.ok);
  assert.notEqual(european.body.pdf, body.pdf);
});

test('symbols: a part TeX can’t draw carries its error, and the others still draw', { skip: needsTex }, async () => {
  const { body } = await symbols([
    { id: 'typo', tikz: 'no such part', kind: 'path' },
    { id: 'capacitor', tikz: 'C', kind: 'path', options: ['invert'] }
  ]);
  assert.ok(body.ok, body.error);
  assert.match(body.pages[0].error, /no such part/);
  assert.equal(body.pages[1].error, undefined);
  assert.ok(pin(body.pages[1], 'end').x > 0);
  assert.match(body.log, /no such part/);
});

test('symbols: a set’s pictures draw beside circuitikz’s parts, their pins read from their coordinates', { skip: needsTex }, async () => {
  const { body } = await symbols([
    { id: 'ground', tikz: 'spx/mech/ground', kind: 'pic', pins: ['p', 'no such pin'] },
    { id: 'pin', tikz: 'spx/mech/pin', kind: 'pic', options: ['rotate=90'], pins: ['p'] },
    { id: 'resistor', tikz: 'R', kind: 'path' }
  ]);
  assert.ok(body.ok, body.error || body.log);
  assert.equal(body.engine, 'pdfLaTeX');
  assert.equal(body.log, undefined, 'every part drew');
  const [ground, pinned, resistor] = body.pages;
  assert.deepEqual(ground.pins, [{ name: 'p', x: 0, y: 0 }]);
  assert.deepEqual(pinned.pins, [{ name: 'p', x: 0, y: 0 }]);
  // 1.2 cm wide plus the border, 0.2 cm hatching below the surface
  assert.ok(Math.abs(ground.width - (1.2 / 2.54) * 72 - 2) < 1.5, `ground is ${ground.width} pt wide`);
  assert.ok(ground.origin.y < ground.height / 2, 'the surface is near the top of its picture');
  // turned a quarter anticlockwise, the support's base is to the right of its pin
  assert.ok(pinned.origin.x < pinned.width / 2 && pinned.height > pinned.width);
  assert.ok(pin(resistor, 'end').x > 0);

  // a set alone draws in plain TikZ, without circuitikz's options
  const alone = await symbols([{ id: 'ground', tikz: 'spx/mech/ground', kind: 'pic', pins: ['p'] }], 'not a circuitikz key');
  assert.ok(alone.body.ok && !alone.body.log, alone.body.error || alone.body.log);
});

test('symbols: the cache key holds the engine, the sets’ versions and circuitikz’s date, never just the request', { skip: needsTex }, async () => {
  const { SYMBOL_SETS } = await import('../src/data/symbolSets.js');
  const cache = path.join(dataDir, 'cache', 'symbols');
  const part = [{ id: 'ground', tikz: 'spx/mech/ground', kind: 'pic', pins: ['p'] }];
  await symbols(part);
  const before = new Set(await fs.readdir(cache));
  SYMBOL_SETS['spx-mech'].version += 1;
  try {
    assert.ok((await symbols(part)).body.ok);
    assert.equal((await fs.readdir(cache)).filter((name) => !before.has(name)).length, 1, 'a new version draws afresh');
  } finally {
    SYMBOL_SETS['spx-mech'].version -= 1;
  }
});

const tectonic = process.env.SPECTRUM_TECTONIC && existsSync(process.env.SPECTRUM_TECTONIC) ? process.env.SPECTRUM_TECTONIC : null;
test('symbols: without pdfLaTeX the built-in Tectonic draws them', { skip: !tectonic && 'needs SPECTRUM_TECTONIC' }, async () => {
  const PATH = process.env.PATH;
  // a PATH without TeX: only the built-in Tectonic is left
  process.env.PATH = '/usr/bin:/bin';
  try {
    const { body } = await symbols([
      { id: 'resistor', tikz: 'R', kind: 'path' },
      { id: 'ground', tikz: 'spx/mech/ground', kind: 'pic', pins: ['p'] },
      { id: 'typo', tikz: 'no such part', kind: 'path' }
    ], 'european');
    assert.ok(body.ok, body.error || body.log);
    assert.equal(body.engine, 'Tectonic');
    assert.ok(pin(body.pages[0], 'end').x > 10);
    assert.deepEqual(body.pages[1].pins, [{ name: 'p', x: 0, y: 0 }]);
    assert.ok(body.pages[2].error, 'a part it can’t draw carries an error, the others still draw');
  } finally {
    process.env.PATH = PATH;
  }
});

test('symbols: a request that would put TeX code in the document is refused', async () => {
  const part = { id: 'r', tikz: 'R', kind: 'path' };
  for (const parts of [
    [],
    [{ ...part, tikz: 'R] (0,0); \\input{/etc/hosts' }],
    [{ ...part, options: ['l={$R_1$}'] }],
    [{ ...part, pins: ['out\\relax'] }],
    [{ ...part, tikz: 'R, /utils/exec=^^5crelax' }],
    [{ ...part, options: ['^^5crelax'] }],
    [{ ...part, pins: ['out^^5crelax'] }],
    [{ ...part, kind: 'wire' }],
    // a picture only from a symbol set's own
    [{ ...part, kind: 'pic', tikz: 'spx/mech/nothing' }],
    [{ ...part, kind: 'pic', tikz: 'R' }],
    [{ ...part, id: '' }]
  ]) {
    const { status, body } = await post('/api/diagram/symbols', { parts, style: { ctikzOptions: 'american' } });
    assert.equal(status, 400, JSON.stringify(parts));
    assert.equal(body.ok, false);
  }
  assert.equal((await symbols([part], 'american, \\input{x}')).status, 400);
  assert.equal((await symbols([part], 'american, /utils/exec=^^5ctypeout^^7bencoded^^7d')).status, 400);
});

const AMP = [
  '\\documentclass[border=2pt]{standalone}',
  '\\usepackage{circuitikz}',
  '\\usetikzlibrary{arrows.meta}',
  '\\begin{document}',
  '\\begin{circuitikz}[american]',
  '\\draw (0,0) to[R, l=$R_1$] (2,0);',
  '\\node[op amp] (U1) at (4,0) {};',
  '\\draw (2,0) -- (U1.-);',
  '\\end{circuitikz}',
  '\\end{document}',
  '% spectrum-diagram v1 eyJsYW5ndWFnZSI6InRpa3oifQ== 0123456789abcdef',
  ''
].join('\n');
const MAIN = [
  '\\documentclass{article}',
  '\\usepackage{standalone}',
  '\\usepackage{float}',
  '\\usepackage{circuitikz}',
  '\\usetikzlibrary{arrows.meta}',
  '\\begin{document}',
  '\\begin{figure}[H]',
  '    \\centering',
  '    \\includestandalone[width=0.5\\linewidth]{figures/amp}',
  '    \\caption{An amplifier.}',
  '    \\label{fig:amp}',
  '\\end{figure}',
  '\\begin{figure}[H]',
  '    \\centering',
  '    \\includestandalone{figures/amp}',
  '    \\caption{At its own size.}',
  '\\end{figure}',
  '\\end{document}',
  ''
].join('\n');

const newProject = (files) => createProject({
  name: 'Diagrams',
  populate: async (root) => {
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text);
    }
  }
});

test('a diagram previews through /api/compile as a document of its own, leaving the main file and checkpoints alone', { skip: needsTex }, async () => {
  const p = await newProject({ 'main.tex': MAIN, 'figures/amp.tex': AMP });
  const meta = await fs.readFile(path.join(p.path, '.spectrum', 'project.json'), 'utf8').catch(() => null);
  const preview = await post('/api/compile', { projectId: p.id, mainFile: 'figures/amp.tex', engine: 'pdflatex', draft: false, fresh: false });
  assert.ok(preview.body.ok, preview.body.error || preview.body.log);
  assert.equal(preview.body.doc, 'figures/amp.tex');
  assert.equal(preview.body.pdfPath, 'figures/amp.pdf');
  assert.ok(existsSync(path.join(p.path, 'figures', 'amp.pdf')));
  assert.equal((await readMeta(p.path)).mainFile, 'main.tex');
  assert.equal(await fs.readFile(path.join(p.path, '.spectrum', 'project.json'), 'utf8').catch(() => null), meta);
  assert.ok(!existsSync(path.join(p.path, '.spectrum', 'settings.json')));
  assert.deepEqual(await listVersions(p.path), []);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(Buffer.from(preview.body.pdf, 'base64')) });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    assert.equal(pdf.numPages, 1);
    assert.ok(width < 200 && height < 200, `the circuit must be cropped, not a full sheet (${width} × ${height})`);
  } finally {
    await task.destroy();
  }

  // and the document takes it in with \includestandalone, at a width and at its own size
  const doc = await post('/api/compile', { projectId: p.id, mainFile: 'main.tex', engine: 'pdflatex' });
  assert.ok(doc.body.ok, doc.body.error || doc.body.log);
  assert.equal(doc.body.status, 0, doc.body.log);
});

test('a plot in figures reads project data in its own preview and when included in the document', { skip: needsTex || !has('pgfplots.sty') }, async () => {
  const p = await newProject({
    'data/results.csv': 'time,value\n0,1\n1,2\n2,3\n',
    'figures/plot.tex': '\\documentclass[tikz]{standalone}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n\\begin{document}\n\\begin{tikzpicture}\\begin{axis}\\addplot table[x=time,y=value,col sep=comma] {data/results.csv};\\end{axis}\\end{tikzpicture}\n\\end{document}\n',
    'main.tex': '\\documentclass{article}\n\\usepackage{standalone,pgfplots}\n\\begin{document}\\includestandalone{figures/plot}\\end{document}\n'
  });
  for (const mainFile of ['figures/plot.tex', 'main.tex']) {
    const result = await post('/api/compile', { projectId: p.id, mainFile, engine: 'pdflatex' });
    assert.ok(result.body.ok, result.body.error || result.body.log);
    assert.equal(result.body.status, 0, result.body.log);
  }
});

test('the tree lists the composer’s files: figures with their drawing, and Mermaid', async () => {
  const p = await newProject({
    'main.tex': MAIN,
    'figures/amp.tex': AMP,
    'figures/plain.tex': AMP.replace(/% spectrum-diagram.*\n/, ''),
    'figures/broken.tex': AMP.replace('0123456789abcdef', 'not a hash'),
    // text added below the drawing's line is a hand edit, still opened by the composer
    'figures/below.tex': `${AMP}% a note added by hand\n`,
    'chapters/amp.tex': AMP,
    'figures/flow.mmd': 'flowchart LR\n  A --> B\n%% spectrum-diagram v1 e30= fedcba9876543210\n',
    'figures/flow.typ': '#diagram(\n  node((0cm, 0cm), [Start], shape: fletcher.shapes.rect),\n)\n// spectrum-diagram v1 e30= fedcba9876543210\n',
    'figures/plain.typ': '#set document(title: "Hand written")\n'
  });
  const res = await app.inject({ method: 'GET', url: `/api/projects/${p.id}/tree` });
  assert.deepEqual(res.json().diagrams.sort(), ['figures/amp.tex', 'figures/below.tex', 'figures/flow.mmd', 'figures/flow.typ']);
});
