// The LaTeX and Typst converter: siunitx's units, the LaTeX reading helpers and the pre-pass on their own, then, with
// pandoc and the built-in Typst, the house templates and the stress document converted and checked as
// docs/featureResearch/LATEX_TYPST_CONVERSION.md section 10 asks: each compiles and loses no label, reference,
// citation, numbered equation or float, and each goes there and back with the conversion record and ends as it began. pandoc is the one Settings downloads into the repo's data folder, or the one
// SPECTRUM_PANDOC names; without it those tests skip. Throwaway folders only.
// Run: SPECTRUM_PANDOC=<pandoc 3.12.1> node --test apps/backend/test/convert.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, promises as fs, realpathSync, rmSync, symlinkSync } from 'node:fs';
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
const { siAngle, siNumber, siQuantity, siUnit, typedNumber, typedUnit } = await import('../src/services/convert/units.js');
const { callOf, expressionEnd, findAll, parseTypst, typstUses } = await import('../src/services/convert/typstRead.js');
const { commandArgs, environments, mathSpans } = await import('../src/services/convert/latexRead.js');
const { chemistryTypst, latexFacts, prepareLatex, typstMaths } = await import('../src/services/convert/toTypst.js');
const { prepareTypst, typstFacts } = await import('../src/services/convert/toLatex.js');
const { flowchartFile, flowchartFor, flowchartOf } = await import('../src/services/convert/diagrams.js');
const { inlineInputs } = await import('../src/utils/texUtils.js');
const { latexToTypst, typstToLatex } = await import('../src/services/convertService.js');
const { builtInTypst, tectonicBiber } = await import('../src/services/engineService.js');
const { findExecutable } = await import('../src/services/compileService.js');
const { createProject } = await import('../src/services/projectService.js');
const { registerConvertRoutes } = await import('../src/routes/convert.js');
const { tableTypst } = await import('../src/latex/floats.js');

const templates = path.join(repo, 'templates');
const stress = path.join(import.meta.dirname, 'fixtures', 'convert');
const skip = !pandoc ? 'needs pandoc: download it in Settings › Engines › Markdown, or set SPECTRUM_PANDOC' : !builtInTypst() && 'needs the built-in Typst';
// the LaTeX made from Typst is checked by compiling it, with Biber for its references
const skipLatex = skip || (!(await findExecutable('biber')) && !tectonicBiber() && 'needs a LaTeX engine with Biber (TeX Live, or Tectonic with Spectrum’s Biber)');

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

test('typed units back to siunitx, by longest match of the symbols', () => {
  assert.deepEqual(['kΩ', 'V/µs', 'K⁻¹', 'm/s²', 'J/(kg·K)', 'kWh', 'dB', 'ms', 'min', 'kinds'].map(typedUnit), [
    '\\kilo\\ohm', '\\volt\\per\\micro\\second', '\\per\\kelvin', '\\metre\\per\\second\\squared', '\\joule\\per\\kilogram\\per\\kelvin', '\\kilo\\watt\\hour', '\\decibel', '\\milli\\second', '\\minute', null
  ]);
  assert.deepEqual(['4.7', '±15', '7,790', '(1.2~±~0.1)', '47 times 10^3', '3.3 times 10^(-9)', 'x'].map(typedNumber), ['4.7', '\\pm 15', '7790', '1.2 \\pm 0.1', '47e3', '3.3e-9', null]);
});

test('Typst reading: Typst’s own parser, a call’s arguments, and what a file names and uses', () => {
  const text = '#figure(image("/a.png", width: 50%), // a comment\n  caption: [See @fig:b, "quoted".]) <fig:a> 4.7~kΩ 🙂 #set text(red); after';
  const root = parseTypst(text);
  assert.equal(findAll(root, (n) => !n.children).map((n) => n.text).join(''), text, 'every character in one leaf, wide ones too');
  const call = callOf(root.children[1]);
  assert.equal(call.name, 'figure');
  assert.deepEqual(call.args.map((a) => [a.name, a.value.text]), [[null, 'image("/a.png", width: 50%)'], ['caption', '[See @fig:b, "quoted".]']]);
  assert.deepEqual(root.children.slice(-4).map((n) => n.kind), ['SetRule', 'Semicolon', 'Space', 'Text'], 'a statement ends at its semicolon');
  const uses = typstUses('#import "/style.typ": *\n= A <sec:a>\nSee @sec:a and @Knuth1984[p.~4], not `@sec:b` // or @sec:c\n#cite(<Lamport1994>, form: "prose") #ref(<sec:a>)\n#figure(include "/diagrams/x.typ") #include "chapters/b.typ"\n#bibliography("refs.bib", style: "apa")');
  assert.deepEqual([uses.labels, uses.at, uses.refs, uses.cites, uses.includes, uses.imports, uses.bibliography], [['sec:a'], ['sec:a', 'Knuth1984'], ['sec:a'], ['Lamport1994'], ['chapters/b.typ'], ['/style.typ'], { path: 'refs.bib', style: 'apa' }]);
});

test('the Typst pre-pass reads semicolons, a #text over lines, short rules, the document’s own functions and packages', () => {
  const notes = [];
  const ctx = { facts: typstFacts(), main: 'main.typ', labels: new Set(['sec:a']), bibKeys: new Set(['Masters2013']), used: new Set(), pictures: [], images: new Set(), refsOut: [], citesOut: [], note: (st, snippet, text) => notes.push(text), include: () => null };
  const source = [
    '#import "@preview/spectrum-sketch:0.1.0": sketch',
    '#set text(size: 10pt); #set heading(numbering: none)',
    '#let rated(value) = [rated at #value]',
    '#let stars(n) = for i in range(n) [★]',
    '#let boxed(body) = { set text(weight: "bold"); box(body) }',
    '#let steps(..items) = enum(numbering: "Step 1.", ..items)',
    '#align(center)[',
    '  #title()',
    '  #text(size: 12pt)[Your Name \\',
    '    School of Engineering]',
    ']',
    '= One <sec:a>',
    '#let speed = [13~V/µs]; The slew rate is #speed, #rated[4.7~kΩ], as @sec:a and @Masters2013[p.~45] say. #stars(3) #boxed[Kept, @sec:a.]',
    '',
    '#sketch[A drawing]',
    '',
    '#steps[First][Second]',
    '',
    '#table(columns: 3, stroke: none, [a], [b], [c], table.hline(start: 1, end: 3), [d], [e], [f], table.hline(start: 2, end: none), [g], [h], [i])'
  ].join('\n');
  const { input, state } = prepareTypst(source, ctx, { file: 'main.typ' });
  assert.deepEqual([ctx.facts.size, ctx.facts.headingNumbers], [10, false], 'both rules of a line');
  assert.match(input, /The slew rate is SPXI\d+X, rated at SPXI\d+X, as SPXI\d+X say\. SPXB\d+X Kept, SPXI\d+X\./);
  assert.deepEqual(state.inlines, ['\\qty{13}{\\volt\\per\\micro\\second}', '\\qty{4.7}{\\kilo\\ohm}', '\\cref{sec:a} and \\parencite[p.~45]{Masters2013}', '\\cref{sec:a}']);
  assert.deepEqual(state.blocks.map((b) => b.kind + (b.inline ? ' inline' : '')), ['maketitle', 'heading', 'picture inline', 'picture', 'table']);
  assert.match(input, /#enum\(numbering: "Step 1\.", \[First\], \[Second\]\)/, 'a sink passes its arguments on');
  assert.match(state.pieces[state.blocks[0].lines[0]].markup, /^#text\(size: 12pt\)\[Your Name \\\s+School of Engineering\]$/, 'the #text over two lines is one line of the title block');
  assert.deepEqual(ctx.pictures.map((p) => [p.body, p.what]), [['stars(3)', 'the output of the document’s own function stars'], ['sketch[A drawing]', 'a drawing made with @preview/spectrum-sketch:0.1.0']]);
  assert.deepEqual(state.blocks[4].model.partRules, [{ row: 0, from: 1, to: 2 }, { row: 1, from: 2, to: 2 }]);
  assert.match(notes.join('\n'), /function boxed does more than Spectrum can write in LaTeX, so only the text given to it was kept/);
});

test('the Typst pre-pass keeps comments in their places, and reads the house \\Call in a sentence and in maths', () => {
  const ctx = { facts: typstFacts(), main: 'main.typ', labels: new Set(), bibKeys: new Set(), used: new Set(), pictures: [], images: new Set(), refsOut: [], citesOut: [], note: () => {}, include: () => null };
  const source = ['#set text(lang: "en")', '', '// before the body', '#set page(numbering: none)', '', '#figure(', '  // inside the figure', '  rect(width: 10mm),', '  caption: [A box.],', ')', '', 'One line', '// inside a paragraph', 'and #smallcaps[Relax]; ($u$, $v$) or $x <- #smallcaps[Min];(Q)$.'].join('\n');
  const { input, state } = prepareTypst(source, ctx, { file: 'main.typ' });
  assert.deepEqual(state.blocks.map((b) => [b.kind, b.latex ?? b.style]), [['raw', '% before the body'], ['numbering', null], ['raw', '% inside the figure'], ['figure', undefined]]);
  assert.match(input, /One line\nSPXC0X\nand SPXI0X\$u\$, \$v\$SPXI1X or \$x <- "SPXI2X"Q"SPXI3X"\$\./);
  assert.deepEqual([state.comments, state.inlines], [['% inside a paragraph'], ['\\Call{Relax}{', '}', '\\Call{Min}{', '}']]);
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

// each conversion once: the round trips below go back from the ones the tests above made
const converted = new Map();

/** The checks of a conversion of folder's main file, made into a fresh staging folder: LaTeX to Typst, or Typst to LaTeX. */
function convert(folder, main = 'main.tex') {
  const key = folder + '|' + main;
  if (!converted.has(key)) {
    const staging = mkdtempSync(path.join(tmp, 'out-'));
    const run = main.endsWith('.typ') ? typstToLatex : latexToTypst;
    converted.set(key, run(folder, main, staging, { engine: 'auto' }).then((result) => ({ ...result, staging })));
  }
  return converted.get(key);
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
  assert.deepEqual([checks.labels.source, checks.references.source, checks.citations.source, checks.equations.source], [32, 31, 9, 4]);
  assert.deepEqual(Object.fromEntries(Object.entries(checks.floats).map(([k, f]) => [k, f.source])), { figure: 7, subfigure: 2, table: 5, listing: 2, algorithm: 1, theorem: 6 });
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
  if (!skipLatex) {
    const back = await app.inject({ method: 'POST', url: '/api/projects/' + project.id + '/convert', payload: { to: 'latex', doc: 'main.typ', engine: 'auto' } });
    assert.equal(back.statusCode, 200, back.body);
    assert.equal(back.json().project.name, 'Stress (Typst) (LaTeX)');
    assert.equal(back.json().checks.ok, true);
  }
  await app.close();
});

for (const name of ['typst-document', 'typst-report', 'typst-maths-notes', 'typst-electronics-notes', 'typst-coding-report', 'typst-letter', 'typst-cv']) {
  test('the ' + name + ' template converts to LaTeX and loses nothing', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
    const { checks, mainFile, staging } = await convert(path.join(templates, name), 'main.typ');
    expectNothingLost(checks, name);
    assert.equal(checks.undefinedReferences, false, name + ' left a reference undefined');
    assert.equal(mainFile, 'main.tex');
    const latex = await fs.readFile(path.join(staging, 'main.tex'), 'utf8');
    assert.match(latex, /^\\documentclass\[\d+pt,a4paper\]\{(?:article|report)\}/);
    assert.match(latex, /\\usepackage\[australian\]\{babel\}/);
    assert.match(latex, /\\usepackage\[capitalise,noabbrev\]\{cleveref\}/);
    assert.doesNotMatch(latex, /SPX[IBPH]\d+X/, 'no token left');
    // the report's title page comes over as the LaTeX report's: sizes, space and the title itself
    if (name === 'typst-report') assert.match(latex, /\\begin\{titlepage\}\n {2}\\centering\n {2}\\vspace\*\{30mm\}\n {2}\{\\LARGE\\bfseries Rooftop solar output across a Melbourne year\\par\}\n {2}\\vspace\{12mm\}\n {2}\{\\Large Your Name\\par\}[\s\S]*\\vfill[\s\S]*\\end\{titlepage\}/);
  });
}

test('the Typst stress document converts to LaTeX with every label, reference, citation, equation and float', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { checks, staging } = await convert(path.join(stress, 'stress-typst'), 'main.typ');
  expectNothingLost(checks, 'stress-typst');
  assert.deepEqual([checks.labels.source, checks.references.source, checks.citations.source, checks.equations.source], [27, 26, 8, 2]);
  const latex = await fs.readFile(path.join(staging, 'main.tex'), 'utf8');
  assert.match(latex, /a resistor of \\qty\{4\.7\}\{\\kilo\\ohm\}, a slew rate of \\qty\{13\}\{\\volt\\per\\micro\\second\}/);
  assert.match(latex, /\\qty\{1\.2 \\pm 0\.1\}\{\\metre\}.*\\qty\{47e3\}\{\\ohm\}/s);
  assert.match(latex, /\\num\{7790\} hours of light at a\npitch of \\ang\{22\.5\}/);
  assert.match(latex, /\\parencite\[p\.~12\]\{Lamport1994\}/);
  assert.match(latex, /\\parencite\{Masters2013,Duffie2013\}/);
  assert.match(latex, /\\textcite\{Masters2013\}.*\\citeauthor\{Knuth1984\}.*\\citeyear\{Lamport1994\}/s);
  assert.match(latex, /\\begin\{theorem\}\[Euclid\]\\label\{thm:euclid\}/);
  assert.match(latex, /\\begin\{subfigure\}/);
  assert.match(latex, /S\[table-format=4\.0\]/);
  assert.match(latex, /\\multirow\{2\}\{\*\}\{Season\} & \\multicolumn\{2\}\{c\}\{Energy \(kWh\)\}/);
  assert.match(latex, /\\cmidrule\(lr\)\{2-3\}/);
  assert.match(latex, /\\begin\{threeparttable\}[\s\S]*Score\\tnote\{a\}[\s\S]*\\item\[a\] Averaged over five runs\./);
  assert.match(latex, /\\begin\{lstlisting\}\[language=Python, caption=\{Dijkstra's algorithm in Python\.\}, label=\{lst:python\}\]/);
  assert.match(latex, /\\While\{the queue \\\(Q\\\) is not empty\}[\s\S]*\\EndWhile/);
  assert.match(latex, /\\include\{chapters\/results\}/);
  assert.match(await fs.readFile(path.join(staging, 'chapters', 'results.tex'), 'utf8'), /\\section\{Results\}\\label\{sec:results\}/);
  // the Typst drawings become pictures with their source kept beside them
  assert.ok(existsSync(path.join(staging, 'diagrams', 'divider.typ')));
  assert.ok(existsSync(path.join(staging, 'diagrams', 'converted-2.typ')));
  assert.ok(existsSync(path.join(staging, 'references.bib')));
});

test('what only Typst’s own parser reads converts too: a package’s drawings, semicolons, a #text over lines, short rules and the document’s own functions', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  // the stand-in drawing package, where Typst keeps the packages it has downloaded, so this runs offline
  cpSync(path.join(stress, 'typst-packages'), path.join(tmp, 'data', 'typst', 'packages'), { recursive: true });
  const staging = mkdtempSync(path.join(tmp, 'out-'));
  const { checks, notes } = await typstToLatex(path.join(stress, 'typst-syntax'), 'main.typ', staging, { engine: 'auto' });
  expectNothingLost(checks, 'typst-syntax');
  assert.deepEqual([checks.labels.source, checks.references.source, checks.citations.source, checks.equations.source], [5, 5, 2, 1]);
  const latex = await fs.readFile(path.join(staging, 'main.tex'), 'utf8');
  // both rules of each line with two
  assert.match(latex, /\\usepackage\[australian\]\{babel\}/);
  assert.match(latex, /\\section\{Statements on one line\}\\label\{sec:statements\}/);
  assert.match(latex, /\\author\{Your Name\\\\\s*School of Engineering\}\n\\date\{3 November 2026\}/, 'the #text over two lines is one line of the title block');
  assert.match(latex, /The op-amp's slew rate is \\qty\{13\}\{\\volt\\per\\micro\\second\}, as \\cref\{sec:pictures\} shows\. Spectrum reads a resistor rated at \\qty\{4\.7\}\{\\kilo\\ohm\}/);
  assert.match(latex, /which cites \\parencite\[p\.~45\]\{Masters2013\}/);
  assert.match(latex, /\\cmidrule\(lr\)\{2-3\}[\s\S]*\\cmidrule\(lr\)\{3-4\}[\s\S]*\\cmidrule\(lr\)\{1-2\}[\s\S]*\\cmidrule\(lr\)\{2-4\}/);
  // a package's drawing in a line and on its own, a function with logic and the figure's, each a picture from its source
  assert.match(latex, /in a line, \\includegraphics\{diagrams\/converted-\d\.pdf\}, or on its own:/);
  assert.match(latex, /\\begin\{center\}\n {2}\\includegraphics\{diagrams\/converted-\d\.pdf\}\n\\end\{center\}/);
  for (const n of [1, 2, 3, 4]) {
    assert.ok(existsSync(path.join(staging, 'diagrams', 'converted-' + n + '.pdf')), 'picture ' + n + ' compiled');
    assert.match(await fs.readFile(path.join(staging, 'diagrams', 'converted-' + n + '.typ'), 'utf8'), /^#import "@preview\/spectrum-sketch:0\.1\.0": sketch/m);
  }
  assert.match(notes.map((n) => n.text).join('\n'), /function boxed does more than Spectrum can write in LaTeX, so only the text given to it was kept/);
});

test('mhchem formulas become Typst text, subscripts, charges and arrows upright', () => {
  assert.equal(chemistryTypst('NO3-'), 'NO#sub[3]#super[−]');
  assert.equal(chemistryTypst('PO4^3-'), 'PO#sub[4]#super[3−]');
  assert.equal(chemistryTypst('2H2 + O2 -> 2H2O'), '2H#sub[2] + O#sub[2] → 2H#sub[2]O');
  assert.equal(chemistryTypst('Ca(OH)2 <=> Ca^{2+}'), 'Ca(OH)#sub[2] ⇌ Ca#super[2+]');
  assert.equal(chemistryTypst('\\alpha'), null, 'a formula with a command keeps its text another way');
});

/** A project of one main file in a fresh folder, converted into another: { result, text, notes } of the converted main file. */
async function convertText(name, source) {
  const root = mkdtempSync(path.join(tmp, 'source-'));
  await fs.writeFile(path.join(root, name), source);
  const staging = mkdtempSync(path.join(tmp, 'out-'));
  const result = await (name.endsWith('.tex') ? latexToTypst : typstToLatex)(root, name, staging, { engine: 'auto' });
  return { result, staging, text: await fs.readFile(path.join(staging, result.mainFile), 'utf8'), notes: await fs.readFile(path.join(staging, 'conversion', 'notes.md'), 'utf8') };
}

test('LaTeX to Typst keeps the text of boxes, letter spacing, chemistry, sizes, spaces, own lists and columns', { skip, timeout: 5 * 60 * 1000 }, async () => {
  const { result, staging, text, notes } = await convertText('main.tex', [
    '\\documentclass[11pt]{article}',
    '\\usepackage{multicol}',
    '\\newenvironment{checklist}{\\begin{list}{$\\square$}{}}{\\end{list}}',
    '\\newcounter{step}',
    '\\newenvironment{steps}{\\begin{list}{\\arabic{step}.}{\\usecounter{step}}}{\\end{list}}',
    '\\begin{document}',
    '',
    '\\noindent\\begin{minipage}[t]{0.6\\linewidth}',
    '{\\Large\\bfseries Ada Lovelace}\\\\',
    '\\small Analyst',
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{0.38\\linewidth}',
    '\\raggedleft \\faPhone\\ 0400 111 222',
    '\\end{minipage}',
    '',
    'Press the \\fbox{Reset} button; the box reads \\so{FRAGILE}; the water holds \\ce{NO3-} and \\ce{2H2 + O2 -> 2H2O}; the arrow points \\raisebox{1pt}{upwards} and {\\small (about 9000 rows)} fit.',
    'Gap\\quad one\\qquad two \\textbar{} three. The logger failed on 12 June\\marginpar{replaced under warranty} and went back.',
    '',
    '\\begin{checklist}',
    '\\item Charge the logger',
    '\\end{checklist}',
    '',
    '\\begin{steps}',
    '\\item Dig a hole.',
    '\\end{steps}',
    '',
    '\\begin{multicols}{2}',
    'Twelve farms across the Wimmera.',
    '\\end{multicols}',
    '\\end{document}',
    ''
  ].join('\n'));
  assert.equal(result.checks.ok, true, JSON.stringify(result.checks.diagnostics));
  assert.match(text, /#text\(size: 14pt, weight: "bold"\)\[Ada Lovelace\] \\ #text\(size: 10pt\)\[Analyst\s*\]/, 'a size in a group, and one to the end of its minipage');
  assert.match(text, /Press the #box\(stroke: 0\.4pt, inset: \(x: 3pt\), outset: \(y: 3pt\)\)\[Reset\] button; the box reads #text\(tracking: 0\.25em\)\[FRAGILE\]/);
  assert.match(text, /holds NO#sub\[3\]#super\[−\] and 2H#sub\[2\] \+ O#sub\[2\] → 2H#sub\[2\]O; the arrow points upwards and #text\(size: 10pt\)\[\(about 9000 rows\)\] fit\./);
  assert.match(text, /Gap #h\(1em\) one #h\(2em\) two \| three\./);
  assert.match(text, /^- Charge the logger$/m, 'the list the document defines, without its marker as a paragraph');
  assert.match(text, /^\+ Dig a hole\.$/m, 'and numbered when its label counts');
  assert.doesNotMatch(text, /\$square\$|^\.$/m);
  assert.match(text, /#columns\(2\)\[\nTwelve farms across the Wimmera\.\n\]/, 'multicols, without its 2 as text');
  // the minipages side by side are a CV header, though a command in them is unknown
  assert.deepEqual(result.record.regions.map((r) => r.kind), ['cv-header', 'unknown-command', 'unknown-environment', 'unknown-environment']);
  assert.match(result.record.regions[0].original, /^\\begin\{minipage\}/);
  assert.match(notes, /\\raisebox is not a command Spectrum knows, so only its text was kept\./);
  // the safety net: the words still lost are named, \marginpar's text run into the word before it
  assert.deepEqual(result.checks.words.lost, ['june', 'replaced']);
  assert.match(notes, /\| Words \| \d+ per cent of the words, at least \d+ per cent in each section; missing: june, replaced \|/);
  assert.match(notes, /The Typst lacks words the LaTeX has: june, replaced\. Check that no text was left out\./);
  // and the original's words count, a command's one-word text too: the box's word gone is found
  const edited = mkdtempSync(path.join(tmp, 'edited-'));
  await fs.cp(staging, edited, { recursive: true });
  await fs.writeFile(path.join(edited, 'main.typ'), text.replace('[Reset]', '[]').replace('[FRAGILE]', '[]').replace('NO#sub[3]', '#sub[3]'));
  assert.deepEqual((await result.recheck(edited)).words.lost, ['reset', 'fragile', 'no', 'june', 'replaced']);
});

test('Typst to LaTeX keeps a title page’s alignment and a page of its own, and names the words it loses', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { result, text, notes } = await convertText('main.typ', [
    '#set document(title: [Field trip report])',
    '#set page(paper: "a4", margin: 25mm)',
    '#set text(size: 11pt, lang: "en", region: "AU")',
    '',
    '#page(numbering: none)[',
    '  #align(center + horizon)[',
    '    #text(size: 20pt, weight: "bold")[Bees on the Peninsula] \\',
    '    #v(8mm)',
    '    #grid(columns: (1fr, 1fr), align(left)[*Author* \\ Amelia Scott], align(right)[*Supervisor* \\ Dr Mei Lin])',
    '  ]',
    ']',
    '',
    '#align(right)[',
    '  #v(40mm)',
    '  #text(size: 24pt, weight: "bold", title())',
    '  #v(1fr)',
    '  Jack Wilson',
    ']',
    '',
    '= Hives',
    '',
    'We checked #underline[forty] hives and #move(dx: 1pt)[nudged] one.',
    ''
  ].join('\n'));
  assert.equal(result.checks.ok, true, JSON.stringify(result.checks.diagnostics));
  // a page of its own without title(), centred down the page, its grid's cells of two lines each a tabular
  assert.match(text, /\\begin\{titlepage\}\n {2}\\centering\n {2}\\vspace\*\{\\fill\}\n {2}\{\\huge\\bfseries Bees on the Peninsula\\par\}[\s\S]*\\begin\{tabular\}\{@\{\}lr@\{\}\}\n {2}\\begin\{tabular\}\[t\]\{@\{\}l@\{\}\}\\textbf\{Author\}\\\\\nAmelia Scott\\end\{tabular\} & \\begin\{tabular\}\[t\]\{@\{\}r@\{\}\}\\textbf\{Supervisor\}\\\\\nDr Mei Lin\\end\{tabular\} \\\\[\s\S]*\\vspace\*\{\\fill\}\n\\end\{titlepage\}/);
  assert.match(text, /\\begin\{titlepage\}\n {2}\\raggedleft\n {2}\\vspace\*\{40mm\}\n {2}\{\\Huge\\bfseries Field trip report\\par\}\n {2}\\vfill\n {2}Jack Wilson\\par\n\\end\{titlepage\}/, 'right aligned');
  assert.match(text, /We checked \\ul\{forty\} hives/);
  assert.match(text, /\\usepackage\{soul\}/);
  assert.deepEqual(result.checks.words.lost, ['nudged'], 'what pandoc drops is named');
  assert.match(notes, /The LaTeX lacks a word the Typst has: nudged\./);
});

// ─── Round trips: section 10's phase 4, there and back with the conversion record ───

/** source's items that items has, repeats counted: what is missing from it. */
const missingFrom = (source, items) => {
  const left = [...items];
  return source.filter((x) => {
    const at = left.indexOf(x);
    if (at !== -1) left.splice(at, 1);
    return at === -1;
  });
};

/** What a LaTeX project says of itself, from its main file with its \input and \include files in place. */
async function latexSummary(folder, main = 'main.tex') {
  const text = await inlineInputs(folder, main, { stripComments: true });
  const all = (pattern) => [...text.matchAll(pattern)];
  const list = (pattern) => all(pattern).flatMap((m) => m[1].split(',').map((x) => x.trim())).filter(Boolean).sort();
  return {
    class: /\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]+\}/.exec(text)[0],
    labels: [...new Set([...list(/\\label\{([^}]*)\}/g), ...list(/\blabel=\{?([^,}\]\s]+)/g)])].sort(),
    references: list(/\\(?:[cC]ref|ref|eqref|autoref|pageref)\*?\{([^}]*)\}/g),
    citations: list(/\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\])*\{([^}]*)\}/g),
    // \SI is written \qty, as LATEX_STYLE.md asks
    units: all(/\\(?:qty|SI)\{([^{}]*)\}\{([^{}]*)\}|\\(num|ang)\{([^{}]*)\}/g).map((m) => (m[1] !== undefined ? 'qty ' + m[1] + ' ' + m[2] : m[3] + ' ' + m[4])).sort(),
    tables: all(/\\begin\{(tabular\*?|tabularx|xltabular|threeparttable)\}/g).map((m) => m[1]).sort(),
    pictures: all(/\\begin\{(tikzpicture|circuitikz)\}|\\includestandalone(?:\[[^\]]*\])?\{([^}]*)\}/g).map((m) => m[0]).sort(),
    titlePage: /\\begin\{titlepage\}[\s\S]*?\\end\{titlepage\}/.exec(text)?.[0] ?? null,
    numbering: all(/\\pagenumbering\{\w+\}|\\pagestyle\{\w+\}/g).map((m) => m[0])
  };
}

/** What a Typst project says of itself, from its main file with its #include files in place. */
async function typstSummary(folder, main = 'main.typ') {
  const expand = async (rel, depth = 0) => {
    let text = await fs.readFile(path.join(folder, rel), 'utf8');
    for (const m of [...text.matchAll(/^#include\s+"\/?([^"]+)"/gm)].reverse()) if (depth < 5) text = text.slice(0, m.index) + (await expand(m[1], depth + 1)) + text.slice(m.index + m[0].length);
    return text;
  };
  const text = (await expand(main)).replace(/```[\s\S]*?```|`[^`\n]*`/g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const labels = [...new Set([...text.matchAll(/(?<![\w(<])<([A-Za-z0-9_:.-]+)>/g)].map((m) => m[1]))].sort();
  const ats = [...text.matchAll(/(?<![\p{L}\p{N}\\/])@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])/gu)].map((m) => m[1]);
  const call = (at) => text.slice(at, expressionEnd(text, at));
  const titled = [...text.matchAll(/^#(?:align|page)\(/gm)].map((m) => call(m.index)).find((c) => /title\(\)|#v\(1fr\)/.test(c));
  return {
    labels,
    references: [...ats.filter((a) => labels.includes(a)), ...[...text.matchAll(/#ref\(<([^>]+)>/g)].map((m) => m[1])].sort(),
    citations: [...ats.filter((a) => !labels.includes(a)), ...[...text.matchAll(/#cite\(<([^>]+)>/g)].map((m) => m[1])].sort(),
    units: [...text.matchAll(/(?<![\w.,])(\d[\d,]*(?:\.\d+)?)~([^\s,;:!?\])}"'<]*[^\s,;:!?\])}"'<.])/g)].map((m) => m[1] + ' ' + m[2]).sort(),
    tables: [...text.matchAll(/(?<![\w.])table\(/g)].length,
    pictures: [...text.matchAll(/include\s+"\/?(diagrams\/[^"]+)"|image\("\/?(diagrams\/[^"]+)"/g)].map((m) => m[0]).sort(),
    titlePage: titled?.replace(/\s+/g, ' ') ?? null,
    numbering: [...text.matchAll(/#set page\(([^\n]*)\)/g)].map((m) => /numbering:\s*("[^"]*"|none)/.exec(m[1])?.[1] ?? '').filter(Boolean)
  };
}

const trips = new Map();

/** The project in folder there and back again, once: the first and second conversions, and the project they ended in. */
function roundTrip(folder, main) {
  const key = folder + '|' + main;
  if (!trips.has(key)) {
    trips.set(key, (async () => {
      const first = await convert(folder, main);
      const back = mkdtempSync(path.join(tmp, 'back-'));
      const second = await (main.endsWith('.typ') ? latexToTypst : typstToLatex)(first.staging, first.mainFile, back, { engine: 'auto' });
      return { first, second, back };
    })());
  }
  return trips.get(key);
}

/** A round trip lost nothing on either way, and ended where it started. */
function expectSame(before, after, { first, second }, what) {
  expectNothingLost(first.checks, what + ' there');
  expectNothingLost(second.checks, what + ' back');
  const { units, ...rest } = before;
  assert.deepEqual(missingFrom(units, after.units), [], what + ': units');
  for (const [key, value] of Object.entries(rest)) assert.deepEqual(after[key], value, what + ': ' + key);
  assert.equal(second.checks.equations.output, first.checks.equations.source, what + ': numbered equations');
  for (const [kind, f] of Object.entries(first.checks.floats)) assert.equal(second.checks.floats[kind].output, f.source, what + ': ' + kind);
}

const latexDocuments = [...['simple-document', 'report-thesis', 'maths-notes', 'electronics-notes', 'coding-report', 'cv', 'letter'].map((name) => [name, path.join(templates, name)]), ['stress document', path.join(stress, 'stress-latex')]];
for (const [name, folder] of latexDocuments) {
  test('the ' + name + ' goes LaTeX to Typst to LaTeX and comes back as it was', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
    const trip = await roundTrip(folder, 'main.tex');
    expectSame(await latexSummary(folder), await latexSummary(trip.back), trip, name);
  });
}

const typstDocuments = [...['typst-document', 'typst-report', 'typst-maths-notes', 'typst-electronics-notes', 'typst-coding-report', 'typst-letter', 'typst-cv'].map((name) => [name, path.join(templates, name)]), ['Typst stress document', path.join(stress, 'stress-typst')]];
for (const [name, folder] of typstDocuments) {
  test('the ' + name + ' goes Typst to LaTeX to Typst and comes back as it was', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
    const trip = await roundTrip(folder, 'main.typ');
    expectSame(await typstSummary(folder), await typstSummary(trip.back), trip, name);
  });
}

test('the stress document comes back with its pictures’ TikZ, code in a sentence, minipages, xltabular and comments', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { back } = await roundTrip(path.join(stress, 'stress-latex'), 'main.tex');
  const latex = await fs.readFile(path.join(back, 'main.tex'), 'utf8');
  assert.match(latex, /^\\usepackage\{standalone\}/m);
  assert.match(latex, /\\begin\{figure\}\[ht\]\n  \\centering\n  \\begin\{tikzpicture\}\n    \\begin\{semilogxaxis\}/, 'the plot’s TikZ back in its figure');
  assert.match(latex, /% sampled in powers of ten so the points spread evenly along the log axis/);
  assert.match(latex, /\\includestandalone\[width=0\.6\\linewidth\]\{diagrams\/amp\}/);
  assert.ok(!existsSync(path.join(back, 'diagrams', 'converted-1.pdf')) && existsSync(path.join(back, 'diagrams', 'amp.tex')), 'the PDFs made on the way are gone');
  assert.match(latex, /\\lstinline\[language=Python\]\|heapq\.heappop\(queue\)\|,\nand a command is written \\verb\|\\cref\|\./);
  assert.match(latex, /\\begin\{minipage\}\[t\]\{0\.48\\linewidth\}[\s\S]*\\label\{fig:left\}\n {4}\\end\{minipage\}\\hfill/);
  assert.match(latex, /\\begin\{xltabular\}\{\\linewidth\}\{lX\}\n {4}\\caption\{Readings, in a table that may break across pages\.\}\\label\{tab:long\} \\\\/);
  assert.match(latex, /\\begin\{threeparttable\}[\s\S]*Score\\tnote\{a\}[\s\S]*\\item\[a\] Averaged over five runs\./);
  assert.match(latex, /\\cref\{tab:long\} may run across pages\.\n% a comment inside a paragraph stays in it\nIts heading rows/);
  assert.match(latex, /% A comment on a line of its own comes over as a comment\./);
});

test('the report comes back with its class, title page and front matter numbered i, ii, iii', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { back } = await roundTrip(path.join(templates, 'report-thesis'), 'main.tex');
  const latex = await fs.readFile(path.join(back, 'main.tex'), 'utf8');
  assert.match(latex, /^\\documentclass\[11pt,a4paper\]\{report\}/);
  assert.match(latex, /% The title page is numbered a, so its link target can’t clash with page 1 or page i\n\n\\pagenumbering\{alph\}\n\n\\begin\{titlepage\}/);
  assert.match(latex, /\\end\{titlepage\}\n\n% Front matter is numbered i, ii, iii; chapter 1 starts again at 1\n\n\\pagenumbering\{roman\}/);
  assert.match(latex, /\\listoffigures\n\n\\listoftables\n\n\\clearpage\n\\pagenumbering\{arabic\}/);
});

test('the Typst report comes back with its title page and the drawings it includes', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { first, back } = await roundTrip(path.join(templates, 'typst-report'), 'main.typ');
  // there: the deterministic rules, without a record
  const latex = await fs.readFile(path.join(first.staging, 'main.tex'), 'utf8');
  assert.match(latex, /\\pagenumbering\{alph\}\n\n\\begin\{titlepage\}[\s\S]*\\end\{titlepage\}\n\n\\pagenumbering\{roman\}/);
  const typst = await fs.readFile(path.join(back, 'main.typ'), 'utf8');
  const source = await fs.readFile(path.join(templates, 'typst-report', 'main.typ'), 'utf8');
  const titlePage = source.slice(source.indexOf('#align(center)['), source.indexOf('#set page(numbering: "i")')).trim();
  assert.ok(typst.includes(titlePage), 'the title page as it was');
  assert.match(typst, /#figure\(include "\/diagrams\/monthly\.typ", caption: \[Energy produced in each month of 2025\.\]\) <fig:monthly>/);
});

test('the Typst stress document’s drawings come back as the figure drew them', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  const { back } = await roundTrip(path.join(stress, 'stress-typst'), 'main.typ');
  const typst = await fs.readFile(path.join(back, 'main.typ'), 'utf8');
  assert.match(typst, /#figure\(include "\/diagrams\/divider\.typ", caption: \[A divider, drawn in plain Typst\.\]\) <fig:divider>/);
  assert.match(typst, /#figure\(rect\(width: 40mm, height: 15mm, stroke: 0\.5pt, fill: luma\(240\)\), caption: \[A box drawn by the figure itself\.\]\) <fig:box>/);
  assert.match(typst, /code in\na sentence reads `heapq\.heappop\(queue\)`/);
});

test('a project edited since it was converted comes back with its edits, the record matched where it still can be', { skip: skipLatex, timeout: 5 * 60 * 1000 }, async () => {
  // the Typst report: its title page reworded, so the record's no longer matches and the rules write it
  const report = mkdtempSync(path.join(tmp, 'edited-'));
  await fs.cp((await convert(path.join(templates, 'report-thesis'))).staging, report, { recursive: true });
  const typst = await fs.readFile(path.join(report, 'main.typ'), 'utf8');
  await fs.writeFile(path.join(report, 'main.typ'), typst.replace('A thesis submitted in partial fulfilment', 'A report submitted in partial fulfilment'));
  const back = mkdtempSync(path.join(tmp, 'back-'));
  const { checks } = await typstToLatex(report, 'main.typ', back, { engine: 'auto' });
  expectNothingLost(checks, 'edited report');
  const latex = await fs.readFile(path.join(back, 'main.tex'), 'utf8');
  assert.match(latex, /^\\documentclass\[11pt,a4paper\]\{report\}/);
  assert.match(latex, /\\begin\{titlepage\}\n {2}\\centering\n {2}\\vspace\*\{30mm\}[\s\S]*A report submitted in partial fulfilment[\s\S]*\\end\{titlepage\}/);

  // the stress document: one picture's TikZ edited, another's deleted, and a record from a Spectrum that wrote it oddly
  const stressed = mkdtempSync(path.join(tmp, 'edited-'));
  await fs.cp((await convert(path.join(stress, 'stress-latex'))).staging, stressed, { recursive: true });
  const plot = path.join(stressed, 'diagrams', 'converted-1.tex');
  await fs.writeFile(plot, (await fs.readFile(plot, 'utf8')).replace('samples=100', 'samples=50'));
  await fs.rm(path.join(stressed, 'diagrams', 'converted-2.tex'));
  const recordFile = path.join(stressed, '.spectrum', 'conversion.json');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  await fs.writeFile(recordFile, JSON.stringify({ ...record, regions: [{ kind: 'titlepage', file: 'main.typ', written: 'not in the file', source: '\\fail' }, { file: 'main.typ' }], inlineCode: [{ text: 5 }, null].filter(Boolean) }));
  const stressBack = mkdtempSync(path.join(tmp, 'back-'));
  const result = await typstToLatex(stressed, 'main.typ', stressBack, { engine: 'auto' });
  expectNothingLost(result.checks, 'edited stress document');
  const stressLatex = await fs.readFile(path.join(stressBack, 'main.tex'), 'utf8');
  assert.match(stressLatex, /samples=50/, 'the edited TikZ');
  assert.match(stressLatex, /\\includegraphics[^\n]*\{diagrams\/converted-2\.pdf\}/, 'a picture whose source is gone stays its PDF');
  assert.doesNotMatch(stressLatex, /\\fail/);
  assert.match(stressLatex, /\\lstinline\|heapq\.heappop\(queue\)\|/, 'code in a sentence by the rule, the record’s unreadable');
});

test('a composer flowchart is written again in the other language from its drawing, and back as it was', () => {
  const tikz = { language: 'tikz', pkg: 'tikz', style: {}, version: 1, model: {
    boxes: [{ id: 'n1', shape: 'rounded', x: 0, y: 0, w: 8, h: 4, text: 'Start' }, { id: 'n2', shape: 'maths', x: 16, y: 0, w: 6, h: 2, text: '\\mathbb{R}^2' }],
    links: [{ id: 'e1', from: 'n1', to: 'n2', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', label: 'maps' }]
  } };
  const file = flowchartFile(tikz, 'tikz');
  assert.deepEqual(flowchartOf(file), tikz, 'a composer file reads back');
  assert.equal(flowchartOf(file.replace('Start', 'Begin')), null, 'one edited by hand is no longer its drawing');
  const typst = flowchartFor(tikz, 'typst', typstMaths);
  assert.deepEqual([typst.language, typst.pkg, typst.model.boxes[1].text], ['typst', undefined, 'RR^2']);
  const typ = flowchartFile(typst, 'typst');
  assert.match(typ, /^#import "@preview\/fletcher:[\d.]+" as fletcher[\s\S]*node\(\(4\.75cm, -0\.25cm\), \[\$RR\^2\$\][\s\S]*\n\/\/ spectrum-diagram v1 \S+ [0-9a-f]{16}\n$/);
  assert.equal(flowchartFor(typst, 'tikz'), null, 'Typst maths TeX can’t read keeps the picture a PDF');
  const plain = { ...typst, model: { ...typst.model, boxes: [typst.model.boxes[0]] } };
  assert.match(flowchartFile(flowchartFor(plain, 'tikz'), 'tikz'), /^\\documentclass\[border=2pt\]\{standalone\}\n\\usepackage\{tikz\}[\s\S]*\\node\[draw, rectangle, rounded corners/);
});
