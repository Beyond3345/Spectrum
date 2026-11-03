// The LaTeX and Typst converter: siunitx's units, the LaTeX reading helpers and the pre-pass on their own, then, with
// pandoc and the built-in Typst, the house templates and the stress document converted and checked as
// docs/featureResearch/LATEX_TYPST_CONVERSION.md section 10 asks: each compiles and loses no label, reference,
// citation, numbered equation or float. pandoc is the one Settings downloads into the repo's data folder, or the one
// SPECTRUM_PANDOC names; without it those tests skip. Throwaway folders only.
// Run: SPECTRUM_PANDOC=<pandoc 3.12.1> node --test apps/backend/test/convert.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, promises as fs, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-convert-')));
const repo = path.join(import.meta.dirname, '..', '..', '..');
const pandoc = [process.env.SPECTRUM_PANDOC, path.join(repo, 'data', 'engines', 'pandoc', 'pandoc' + (process.platform === 'win32' ? '.exe' : ''))].find((file) => file && existsSync(file));
Object.assign(process.env, {
  SPECTRUM_DATA_DIR: path.join(tmp, 'data'),
  SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'),
  SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'),
  SPECTRUM_TEMPLATE_SEED_DIR: ''
});
if (pandoc) {
  mkdirSync(path.join(tmp, 'data', 'engines', 'pandoc'), { recursive: true });
  symlinkSync(pandoc, path.join(tmp, 'data', 'engines', 'pandoc', path.basename(pandoc)));
}
const { siAngle, siNumber, siQuantity, siUnit } = await import('../src/services/convert/units.js');
const { commandArgs, environments, mathSpans } = await import('../src/services/convert/latexRead.js');
const { latexFacts, prepareLatex, typstMaths } = await import('../src/services/convert/toTypst.js');
const { latexToTypst } = await import('../src/services/convertService.js');
const { builtInTypst } = await import('../src/services/engineService.js');
const { createProject } = await import('../src/services/projectService.js');
const { registerConvertRoutes } = await import('../src/routes/convert.js');
const { tableTypst } = await import('../src/latex/floats.js');

const templates = path.join(repo, 'templates');
const stress = path.join(import.meta.dirname, 'fixtures', 'convert');
const skip = !pandoc ? 'needs pandoc: download it in Settings › Engines › Markdown, or set SPECTRUM_PANDOC' : !builtInTypst() && 'needs the built-in Typst';

after(() => rmSync(tmp, { recursive: true, force: true }));

test('siunitx quantities become the typed units of TYPST_STYLE.md, in prose and in maths', () => {
  const q = (n, u) => siQuantity(n, u);
  assert.deepEqual(q('4.7', '\\kilo\\ohm'), { text: '4.7~kΩ', maths: '4.7 thin "kΩ"' });
  assert.equal(q('13', '\\volt\\per\\micro\\second').text, '13~V/µs');
  assert.equal(q('0.004', '\\per\\kelvin').text, '0.004~K⁻¹');
  assert.equal(q('\\pm 15', '\\volt').text, '±15~V');
  assert.deepEqual(q('1.2 \\pm 0.1', '\\metre'), { text: '(1.2~±~0.1)~m', maths: '(1.2 plus.minus 0.1) thin "m"' });
  assert.deepEqual(q('47e3', '\\ohm'), { text: '$47 times 10^3$~Ω', maths: '47 times 10^3 thin "Ω"' });
  assert.equal(q('3.3e-9', '\\farad').text, '$3.3 times 10^(-9)$~F');
  assert.equal(q('65', '\\degreeCelsius').text, '65~°C');
  assert.equal(q('19.0', '\\percent').text, '19.0~%');
  assert.equal(q('9.81', '\\metre\\per\\second\\squared').text, '9.81~m/s²');
  assert.equal(q('7790', '\\kilo\\watt\\hour').text, '7,790~kWh');
  assert.equal(q('1', '\\joule\\per\\kilogram\\per\\kelvin').text, '1~J/(kg·K)');
  assert.equal(q('22.5', '\\degree').text, '22.5°');
  assert.equal(q('1', '\\notaunit'), null, 'an unknown unit is left to pandoc');
  assert.deepEqual([siNumber('7790').text, siNumber('7790').maths, siNumber('12345.678').text, siNumber('-5.4').text], ['7,790', '#[7,790]', '12,345.678', '-5.4']);
  assert.deepEqual([siAngle('22.5'), siAngle('1;2;3'), siUnit('\\hertz'), siUnit('kg.m/s')], ['22.5°', '1°2′3″', 'Hz', 'kg·m/s']);
});

test('LaTeX reading: arguments, nested environments and where the maths is', () => {
  assert.deepEqual(commandArgs('[t]{0.48\\linewidth} x', 0, 'om').args, ['t', '0.48\\linewidth']);
  assert.equal(commandArgs('[t] x', 0, 'om'), null, 'a missing {argument}');
  const text = 'a \\begin{figure}x \\begin{figure}y\\end{figure}\\end{figure} b \\begin{table}t\\end{table}';
  assert.deepEqual(environments(text, ['figure', 'table']).map((e) => [e.name, e.body]), [['figure', 'x \\begin{figure}y\\end{figure}'], ['table', 't']]);
  const maths = 'x $a$ and \\[b\\] then \\begin{align*}c\\end{align*} \\$5';
  assert.deepEqual(mathSpans(maths).map(([s, e]) => maths.slice(s, e)), ['$a$', '\\[b\\]', '\\begin{align*}c\\end{align*}']);
});

test('the maths rules Spectrum adds to tex2typst', () => {
  assert.equal(typstMaths('p(\\lambda) \\coloneqq \\det(A)'), 'p(lambda) := det(A)');
  assert.equal(typstMaths('R_\\mathrm{in} + v_\\mathrm{d} + A_{\\mathrm{v}}'), 'R_"in" + v_"d" + A_"v"');
  assert.equal(typstMaths('\\mathop{\\mathrm{tr}} A'), 'op("tr") A');
  assert.equal(typstMaths('A \\xrightarrow{f} B'), 'A limits(-->)^f B');
  assert.equal(typstMaths('\\left\\lVert x \\right\\rVert'), 'norm(x)');
  assert.equal(typstMaths('\\begin{gathered} a \\\\ b \\end{gathered}'), null, 'pandoc writes what tex2typst can’t');
});

test('the pre-pass holds each house construct for pandoc, with units in maths as text', () => {
  const source = [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[margin=25mm]{geometry}\\usepackage[australian]{babel}\\usepackage{tikz}',
    '\\newtheorem{theorem}{Theorem}[section]',
    '\\begin{document}',
    'A resistor of \\qty{4.7}{\\kilo\\ohm}, and $f = \\qty{1}{\\hertz}$.',
    '',
    '% a comment between paragraphs',
    '',
    '\\begin{figure}[ht]\\centering\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\\caption{A line.}\\label{fig:line}\\end{figure}',
    '\\begin{theorem}[Euclid]\\label{thm:e} Primes. \\end{theorem}',
    '\\end{document}'
  ].join('\n');
  const facts = latexFacts(source.slice(0, source.indexOf('\\begin{document}')));
  assert.deepEqual([facts.klass, facts.size, facts.paper, facts.margin, facts.language], ['article', 11, 'a4', '25mm', ['en', 'AU']]);
  const ctx = { facts, labels: new Set(['fig:line', 'thm:e']), bibKeys: new Set(), used: new Set(), pictures: [], refsOut: [], citesOut: [], note: () => {}, include: () => null, image: () => null, standalone: () => null };
  const { input, state } = prepareLatex(source, ctx, { file: 'main.tex', main: true });
  assert.match(input, /A resistor of SPXI\d+X, and \$f = \\text\{SPXI\d+X\}\$/);
  assert.deepEqual(state.inlines.slice(0, 2).map((i) => i.maths), ['4.7 thin "kΩ"', '1 thin "Hz"']);
  assert.deepEqual(state.blocks.map((b) => b.kind), ['raw', 'figure', 'theorem']);
  assert.equal(state.blocks[0].typst, '// a comment between paragraphs');
  assert.equal(ctx.pictures.length, 1, 'the drawing is held to compile on its own');
  assert.deepEqual([state.blocks[1].layout, state.blocks[1].label, state.blocks[2].label], ['single', 'fig:line', 'thm:e']);
  assert.doesNotMatch(input, /tikzpicture|\\begin\{figure\}/);
  assert.match(input, /\\begin\{spxpiece\d+\}\nEuclid\n\\end\{spxpiece\d+\}/, 'the theorem’s title is a piece for pandoc');
});

test('a Typst table from the table tool, its cells Typst already', () => {
  const model = { cells: [['$x$', '*b*'], ['#super[a]', '2,740']], env: 'tabular', align: ['l', 'S'], lines: 'booktabs', header: true, float: false, placement: '', caption: '', label: '', escape: false, markup: true };
  assert.match(tableTypst(model), /table\.header\(\[\$x\$\], \[\*b\*\]\), \[#super\[a\]\], \[2,740\]\)$/);
});

/** Every file under root with its hash, to show a conversion leaves it as it was. */
async function snapshot(root) {
  const out = {};
  for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out[path.relative(root, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return out;
}

/** The checks of a conversion of folder's main file, made into a fresh staging folder. */
async function convert(folder, main = 'main.tex') {
  const staging = mkdtempSync(path.join(tmp, 'out-'));
  const result = await latexToTypst(folder, main, staging, { engine: 'auto' });
  return { ...result, staging };
}

const expectNothingLost = (checks, what) => {
  assert.equal(checks.compiles, true, what + ': ' + JSON.stringify(checks.diagnostics));
  assert.deepEqual(checks.labels.missing, [], what + ' labels');
  assert.equal(checks.references.kept, checks.references.source, what + ' references: ' + checks.references.lost);
  assert.equal(checks.citations.kept, checks.citations.source, what + ' citations: ' + checks.citations.lost);
  assert.deepEqual(checks.citations.invented, [], what + ' invented citations');
  assert.equal(checks.equations.output, checks.equations.source, what + ' numbered equations');
  for (const [kind, f] of Object.entries(checks.floats)) assert.equal(f.output, f.source, what + ' ' + kind);
  assert.ok(checks.words.coverage >= 0.95, what + ' words ' + checks.words.coverage);
  assert.equal(checks.ok, true, what);
};

for (const name of ['simple-document', 'report-thesis', 'maths-notes', 'electronics-notes', 'coding-report', 'cv', 'letter']) {
  test('the ' + name + ' template converts to Typst and loses nothing', { skip, timeout: 5 * 60 * 1000 }, async () => {
    const { checks, staging, mainFile } = await convert(path.join(templates, name));
    expectNothingLost(checks, name);
    assert.equal(mainFile, 'main.typ');
    const typst = await fs.readFile(path.join(staging, 'main.typ'), 'utf8');
    assert.match(typst, /#set page\(paper: "a4"/);
    assert.match(typst, /lang: "en", region: "AU"/);
    assert.doesNotMatch(typst, /SPX[IBPRH]\d+X|@preview/, 'no token or package left');
    assert.ok(existsSync(path.join(staging, 'conversion', 'notes.md')));
    const record = JSON.parse(await fs.readFile(path.join(staging, '.spectrum', 'conversion.json'), 'utf8'));
    assert.deepEqual([record.from, record.to, record.source.mainFile], ['latex', 'typst', 'main.tex']);
  });
}

test('the Beamer slides are refused, as there is no Typst slides template', { skip }, async () => {
  await assert.rejects(convert(path.join(templates, 'slides')), /Beamer presentation/);
});

test('the stress document converts with every label, reference, citation, equation and float', { skip, timeout: 5 * 60 * 1000 }, async () => {
  const { checks, staging } = await convert(path.join(stress, 'stress-latex'));
  expectNothingLost(checks, 'stress');
  assert.deepEqual([checks.labels.source, checks.references.source, checks.citations.source, checks.equations.source], [29, 28, 9, 4]);
  assert.deepEqual(Object.fromEntries(Object.entries(checks.floats).map(([k, f]) => [k, f.source])), { figure: 5, subfigure: 2, table: 4, listing: 2, algorithm: 1, theorem: 6 });
  assert.ok(checks.words.lowestSection >= 0.95, 'each section keeps its words');
  // one file out for each file in: the \input and the \include, with the definitions they share in style.typ
  const units = await fs.readFile(path.join(staging, 'sections', 'units.typ'), 'utf8');
  assert.match(units, /^#import "\/style\.typ": \*/);
  assert.match(units, /a resistor of 4\.7~kΩ, a slew rate of\n13~V\/µs/);
  assert.match(units, /\$f_c approx 1\.03 thin "kHz"\$/);
  const main = await fs.readFile(path.join(staging, 'main.typ'), 'utf8');
  assert.match(main, /#include "\/sections\/units\.typ"/);
  assert.match(main, /#include "\/chapters\/results\.typ"/);
  assert.match(main, /@sec:maths and @sec:floats hold/, 'two labels in one \\cref');
  assert.match(main, /@Lamport1994\[p\.~12\]/, 'a citation keeps its page');
  assert.match(main, /\$ x_1 \(t\) &= e\^\(3 t\) \+ e\^\(-t\) , \$ <eq:first>/, 'each numbered line of an align is an equation');
  assert.match(main, /#theorem\(title: \[Euclid\]\)\[There are infinitely many prime numbers\.\] <thm:euclid>/);
  assert.match(main, /\[#subfigure\(image\("\/figures\/measured\.png", width: 100%\), caption: \[Measured output\.\]\) <fig:measured>\]/);
  assert.match(main, /kind: "algorithm", supplement: \[Algorithm\]/);
  assert.match(main, /#smallcaps\[ExtractMin\];/);
  // pictures are compiled to PDF, or shown as a box saying they weren't, with their source kept beside them
  for (const n of [1, 2]) assert.ok(existsSync(path.join(staging, 'diagrams', 'converted-' + n + '.tex')));
  assert.match(main, /image\("\/diagrams\/converted-1\.pdf"\)|Picture not converted/);
  assert.match(await fs.readFile(path.join(staging, 'conversion', 'notes.md'), 'utf8'), /An align with 2 numbered lines became 2 equations/);
});

test('the route makes a new Typst project and leaves the LaTeX one as it was', { skip, timeout: 5 * 60 * 1000 }, async () => {
  const source = await createProject({ name: 'Stress', populate: (root) => fs.cp(path.join(stress, 'stress-latex'), root, { recursive: true }) });
  const before = await snapshot(source.path);
  const app = Fastify();
  registerConvertRoutes(app);
  const refused = await app.inject({ method: 'POST', url: '/api/projects/' + source.id + '/convert', payload: { to: 'typst', doc: 'references.bib' } });
  assert.equal(refused.statusCode, 400);
  const res = await app.inject({ method: 'POST', url: '/api/projects/' + source.id + '/convert', payload: { to: 'typst', doc: 'main.tex', engine: 'auto' } });
  assert.equal(res.statusCode, 200, res.body);
  const { project, checks } = res.json();
  assert.equal(checks.ok, true);
  assert.equal(project.name, 'Stress (Typst)');
  assert.equal(project.mainFile, 'main.typ');
  assert.ok(existsSync(path.join(project.path, 'main.typ')) && existsSync(path.join(project.path, 'refs.bib')));
  assert.deepEqual(await snapshot(source.path), before, 'the source project is never changed');
  await app.close();
});
