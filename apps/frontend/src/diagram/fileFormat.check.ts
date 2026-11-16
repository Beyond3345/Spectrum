// Self-check for the diagram file format. Run:
// npx esbuild apps/frontend/src/diagram/fileFormat.check.ts --bundle --platform=node --log-level=warning | node
import { diagramFileText, forPhysics, hasDrawing, readDiagramFile, tikzDocument } from './fileFormat';
import type { DiagramFile } from './types';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const circuit: DiagramFile = { language: 'tikz', pkg: 'circuitikz', style: { preset: 'american' }, model: { label: 'R₁ → “Ω”' }, version: 1 };
const code = { body: '\\begin{circuitikz}\n\\draw (0,0) to[R] (2,0);\n\\end{circuitikz}\n', packages: ['circuitikz'], libraries: ['arrows.meta', 'positioning'] };

eq(
  tikzDocument(code),
  [
    '\\documentclass[border=2pt]{standalone}',
    '\\usepackage{circuitikz}',
    '\\usetikzlibrary{arrows.meta,positioning}',
    '\\begin{document}',
    '\\begin{circuitikz}',
    '\\draw (0,0) to[R] (2,0);',
    '\\end{circuitikz}',
    '\\end{document}',
    ''
  ].join('\n'),
  'standalone document'
);
eq(tikzDocument({ body: 'x', packages: [], libraries: [] }).split('\n').length, 5, 'no package or library lines when there are none');

// a failure here is an unhandled rejection, which ends node with an error too
(async () => {
  const text = await diagramFileText(circuit, code);
  const lines = text.trimEnd().split('\n');
  eq(lines[lines.length - 2], '\\end{document}', 'the drawing goes after \\end{document}');
  eq(/^% spectrum-diagram v1 [A-Za-z0-9+/=]+ [0-9a-f]{16}$/.test(lines[lines.length - 1]), true, 'last line');
  eq(hasDrawing(text), true, 'a drawing to open');
  eq(hasDrawing(tikzDocument(code)), false, 'a plain figure has none');

  const back = await readDiagramFile(text);
  eq(back.diagram, circuit, 'the drawing reads back, Unicode and all');
  eq(back.edited, false, 'as the drawing left it');
  eq(back.code, tikzDocument(code), 'the code is the text above the last line');

  const handEdited = text.replace('to[R]', 'to[R, l=$R_1$]');
  eq((await readDiagramFile(handEdited)).edited, true, 'a hand edit shows');
  eq((await readDiagramFile(handEdited)).diagram, circuit, 'and the drawing is still there');
  eq((await readDiagramFile(text.replace(/\n/g, '\r\n'))).edited, true, 'line endings changed count as edited');
  const below = await readDiagramFile(`${text}% added below\n`);
  eq([below.diagram, below.edited, below.code.endsWith('\\end{document}\n% added below\n')], [circuit, true, true], 'text added below the drawing’s line is an edit, kept');

  // kept as code: the hand-edited text goes above, the hash stays the drawing's, so it reopens as edited
  const kept = await diagramFileText(circuit, code, '\\documentclass{standalone}\n% mine');
  eq((await readDiagramFile(kept)).code, '\\documentclass{standalone}\n% mine\n', 'kept code');
  eq((await readDiagramFile(kept)).edited, true, 'kept code reopens as edited');

  const mermaid: DiagramFile = { language: 'mermaid', style: {}, model: { code: 'flowchart LR\n  a --> b' }, version: 1 };
  const mmd = await diagramFileText(mermaid, { body: 'flowchart LR\n  a --> b\n\n', packages: [], libraries: [] });
  eq(mmd.split('\n')[2].startsWith('%% spectrum-diagram v1 '), true, 'Mermaid’s own comment mark');
  eq((await readDiagramFile(mmd)).code, 'flowchart LR\n  a --> b\n', 'Mermaid code');
  eq((await readDiagramFile(mmd)).edited, false, 'Mermaid as drawn');

  eq(await readDiagramFile('flowchart LR\n  a --> b\n'), { code: 'flowchart LR\n  a --> b\n', diagram: null, edited: false }, 'no last line');
  const damaged = await readDiagramFile('x\n% spectrum-diagram v1 bm90IGpzb24= 0123456789abcdef\n');
  eq([damaged.code, damaged.diagram, damaged.mark], ['x\n', null, '% spectrum-diagram v1 bm90IGpzb24= 0123456789abcdef'], 'a damaged drawing opens as code, its line kept');
  for (const invalid of [{ ...circuit, model: null }, { ...circuit, style: [] }, { ...circuit, language: 'unknown' }]) {
    const file = await diagramFileText(invalid as DiagramFile, code);
    const opened = await readDiagramFile(file);
    eq(opened.diagram, null, 'invalid drawing data opens as code');
    eq(opened.code, tikzDocument(code), 'invalid drawing keeps its source');
    eq(!!opened.mark, true, 'invalid drawing keeps its marker');
  }
  const typst: DiagramFile = { language: 'typst', style: {}, model: { boxes: [], links: [] }, version: 1 };
  const typstCode = { body: '#import "@preview/fletcher:0.5.8" as fletcher: diagram\n#diagram()\n', packages: [], libraries: [] };
  const typstFile = await diagramFileText(typst, typstCode);
  const typstLines = typstFile.trimEnd().split('\n');
  eq(typstLines[typstLines.length - 1].startsWith('// spectrum-diagram v1 '), true, 'Typst’s own comment mark');
  const typstBack = await readDiagramFile(typstFile);
  eq(typstBack.diagram, typst, 'the Typst drawing reads back');
  eq(typstBack.code, typstCode.body, 'a Typst diagram keeps its plain code');
  eq(typstBack.edited, false, 'Typst as drawn');

  // a drawing with symbol sets is version 2, which a build from before sets opens as code; without, version 1 as ever
  const json = async (d: DiagramFile) => (await readDiagramFile(await diagramFileText(d, code))).diagram;
  eq(await json({ ...circuit, sets: ['spx-mech'] }), { ...circuit, sets: ['spx-mech'], version: 2 }, 'sets make version 2');
  eq(await json({ ...circuit, sets: [], version: 2 }), circuit, 'no sets: no sets key, version 1');
  eq(Object.keys((await json({ ...circuit, sets: ['spx-mech'] }))!), ['language', 'pkg', 'style', 'model', 'version', 'sets'], 'the keys keep their order');
  // so is a circuit with a part the first builds didn't know, which they would write without it
  const part = (type: string) => ({ ...circuit, model: { elements: [{ id: 'e1', kind: 'node', type, at: { x: 0, y: 0 } }], junctions: [] } });
  eq([(await json(part('adder')))?.version, (await json(part('op-amp')))?.version], [2, 1], 'a new part makes version 2, an old one keeps 1');
  const v2 = await readDiagramFile(await diagramFileText({ ...circuit, sets: ['spx-mech'] }, code));
  eq([v2.diagram?.version, v2.diagram?.sets, v2.edited], [2, ['spx-mech'], false], 'version 2 reads back');
  // so is a drawing with shapes or arrows a build from before them would write without
  const flow: DiagramFile = { language: 'tikz', pkg: 'tikz', style: {}, model: { boxes: [{ id: 'n1', shape: 'rectangle', x: 0, y: 0, w: 8, h: 4, text: 'a' }], links: [] }, version: 1 };
  eq((await json(flow))?.version, 1, 'a flowchart of the first shapes is version 1');
  const state = { ...flow, model: { boxes: [{ id: 'n1', shape: 'state', x: 0, y: 0, w: 5, h: 5, text: 'q_0' }], links: [] } };
  eq((await json(state))?.version, 2, 'a state makes version 2');
  eq((await json({ ...state, language: 'typst', pkg: undefined }))?.version, 2, 'in Typst too');
  eq((await json({ ...flow, model: { boxes: [], links: [{ id: 'e1', from: 'n1', to: 'n1' }] } }))?.version, 2, 'a loop makes version 2');
  eq((await json({ ...flow, model: 'damaged' as never }))?.version, undefined, 'a damaged model doesn’t throw here');
  const plot: DiagramFile = { language: 'tikz', pkg: 'pgfplots', style: {}, model: { series: [{ id: 's1', source: 'function' }] }, version: 1 };
  eq((await json(plot))?.version, 1, 'a plot of functions is version 1');
  eq((await json({ ...plot, model: { series: [], axes: 'sketch' } }))?.version, 2, 'sketch axes make version 2');
  // Spectrum 2.5's plot additions make version 5, which 2.4 and earlier open as code
  eq((await json({ ...plot, model: { series: [{ id: 's1', source: 'points', points: '1, 2' }] } }))?.version, 5, 'typed points make version 5');
  eq((await json({ ...plot, model: { series: [], axes: 'sketch', equal: true } }))?.version, 5, 'so do equal axes');
  // phase E's additions make version 3, which the release candidate's builds open as code rather than save without
  // them; drawings without them keep 1 or 2
  const structure: DiagramFile = { language: 'tikz', pkg: 'structures', style: { view: 'diagrams', moments: 'tension' }, model: {}, version: 1 };
  const hidden = { axial: { on: false, fill: 'green!15', opacity: 1 } };
  eq(
    [
      (await json({ ...circuit, style: { preset: 'american', siUnits: true } }))?.version,
      (await json({ ...circuit, style: { preset: 'american', siUnits: false } }))?.version,
      (await json({ ...circuit, style: { preset: 'american', logic: 'ieee' } }))?.version,
      (await json({ ...circuit, style: { preset: 'european', notSymbol: 'circle' } }))?.version,
      (await json(part('flow-process')))?.version,
      (await json({ ...circuit, sets: ['spx-geom'] }))?.version,
      (await json(structure))?.version,
      (await json({ ...structure, style: { ...structure.style, diagrams: hidden } }))?.version,
      (await json({ ...plot, style: { siUnits: true } }))?.version,
      (await json({ ...structure, style: { ...structure.style, physics: true } }))?.version
    ],
    [3, 1, 3, 3, 3, 3, 1, 3, 3, 3],
    'phase E makes version 3'
  );
  const v3 = await readDiagramFile(await diagramFileText({ ...circuit, style: { siUnits: true } }, code));
  eq([v3.diagram?.version, v3.edited], [3, false], 'version 3 reads back');
  // Annotate's additions make version 4, which 2.3's builds open as code rather than save without them
  const withEls = (elements: unknown[]) => ({ ...circuit, model: { elements, junctions: [] } });
  const wire = { id: 'w', kind: 'wire', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], routes: ['--'] };
  eq(
    [
      (await json(withEls([{ id: 'a', kind: 'annotation', shape: 'cross', points: [{ x: 0, y: 0 }] }])))?.version,
      (await json({ ...withEls([wire, { id: 'a', kind: 'annotation', shape: 'cross', points: [{ x: 0, y: 0 }] }]), style: { preset: 'american', siUnits: true } }))?.version,
      (await json(withEls([{ ...wire, currents: [{ text: 'i' }] }])))?.version,
      (await json(withEls([{ id: 't', kind: 'node', type: 'text', at: { x: 0, y: 0 }, text: 'x', colour: 'red' }])))?.version,
      (await json(withEls([wire, { id: 't', kind: 'node', type: 'text', at: { x: 0, y: 0 }, text: 'x' }])))?.version
    ],
    [4, 4, 4, 4, 2],
    'annotations, marks on wires and styled Text make version 4; plain Text stays a version 2 part'
  );
  // vector diagrams: 2.5's items, constructions and notation make version 5; a drawing of 2.4's kinds keeps version 1
  const vec = (items: unknown[], points: unknown[] = [], style: Record<string, unknown> = {}): DiagramFile => ({
    language: 'tikz',
    pkg: 'vectors',
    style,
    model: { panels: [{ id: 'g1', shift: 0 }], points: [{ id: 'A', name: 'A', x: 0, y: 0, panel: 'g1' }, { id: 'B', name: 'B', x: 1, y: 0, panel: 'g1' }, { id: 'C', name: 'C', x: 0, y: 1, panel: 'g1' }, ...points], items },
    version: 1
  });
  eq(
    await Promise.all(
      [
        vec([{ id: 'v', kind: 'vector', a: 'A', b: 'B' }, { id: 'd', kind: 'drop', from: 'B', axis: 'x' }], [{ id: 'P', name: 'P', x: 0, y: 0, panel: 'g1', of: { kind: 'diff', u: 'A', v: 'B', o: 'C' } }]),
        vec([{ id: 'v', kind: 'vector', a: 'A', b: 'B' }], [], { notation: 'bold' }),
        vec([{ id: 'n', kind: 'angle', at: 'A', from: 'B', to: 'C' }]),
        vec([{ id: 'c', kind: 'circle', centre: 'A', through: 'B' }]),
        vec([{ id: 'e', kind: 'eqline', panel: 'g1', a: 1, b: 1, c: -2 }]),
        vec([{ id: 'd', kind: 'drop', from: 'B', axis: 'both' }]),
        vec([{ id: 's', kind: 'segment', a: 'A', b: 'B', ticks: 2 }]),
        vec([], [{ id: 'X', name: 'X', x: 0, y: 0, panel: 'g1', of: { kind: 'meet', a: 'A', b: 'B', c: 'A', d: 'C' } }]),
        vec([], [{ id: 'X', name: 'X', x: 0, y: 0, panel: 'g1', of: { kind: 'scale', a: 'A', b: 'B', k: -2 } }]),
        vec([], [], { notation: 'vv' })
      ].map(async (d) => (await json(d))?.version)
    ),
    [1, 1, 5, 5, 5, 5, 5, 5, 5, 5],
    'a vector drawing is version 5 only with 2.5’s additions'
  );
  // for a document that loads physics: \qty becomes \SI, in the text and in the drawing, which still reads as drawn
  const si = { body: '\\begin{tikzpicture}\n\\node {\\qty{10}{\\kilo\\newton}};\n\\end{tikzpicture}\n', packages: ['tikz', 'siunitx'], libraries: [] };
  const siFile = await diagramFileText({ ...structure, style: { siUnits: true } }, si);
  const forDoc = await readDiagramFile((await forPhysics(siFile))!);
  eq([forDoc.code.includes('\\node {\\SI{10}{\\kilo\\newton}};'), forDoc.code.includes('\\qty'), forDoc.edited, forDoc.diagram?.style, forDoc.diagram?.version], [true, false, false, { siUnits: true, physics: true }, 3], 'physics: \\SI, as drawn');
  const byHand = await diagramFileText(structure, si, `${tikzDocument(si)}% mine\n`);
  eq([(await forPhysics(byHand))?.includes('\\qty'), (await readDiagramFile((await forPhysics(byHand))!)).edited], [false, true], 'edited by hand: the text only, still edited');
  eq(await forPhysics(await diagramFileText(circuit, code)), null, 'nothing to change');

  // flowcharts and commutative diagrams with 2.5's additions are version 5; without, as before
  const gain = { ...flow, model: { boxes: [{ id: 'n1', shape: 'gain', x: 0, y: 0, w: 6, h: 6, text: 'K' }], links: [] } };
  const signed = { ...flow, model: { boxes: [], links: [{ id: 'e1', from: 'n1', to: 'n2', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', sign: '-' }] } };
  const cd: DiagramFile = { language: 'tikz', pkg: 'tikz-cd', style: {}, model: { cells: [], arrows: [{ id: 'a1', from: 'c1', to: 'c2' }] }, version: 1 };
  eq(
    [
      (await json(gain))?.version,
      (await json({ ...gain, language: 'typst', pkg: undefined }))?.version,
      (await json(signed))?.version,
      (await json(state))?.version,
      (await json(cd))?.version,
      (await json({ ...cd, model: { cells: [], arrows: [{ id: 'a1', from: 'c1', to: 'c2', kind: 'mapsto' }] } }))?.version,
      (await json({ ...cd, model: { cells: [], arrows: [{ id: 'a1', from: 'c1', to: 'c1' }] } }))?.version
    ],
    [5, 5, 5, 2, 1, 5, 5],
    'a gain (TikZ and Typst) and a sign make version 5, a state stays 2; tikz-cd: a kind or loop makes 5, a plain arrow 1'
  );

  // a structure with what 2.5 added (a shear release, a settlement, a load on plan, the deflected shape, x marks) is
  // version 5; one without keeps its version
  const beam = { nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 6, y: 0 }], parts: [{ id: 'm', kind: 'member', a: 'A', b: 'B' }, { id: 's', kind: 'support', node: 'A', type: 'pin' }, { id: 'w', kind: 'dist', member: 'm', from: 0, to: 6, w1: 10, w2: 10, angle: -90 }] };
  const withPart = (patch: Record<string, unknown>, id: string) => ({ ...beam, parts: beam.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  eq(
    [
      (await json({ ...structure, model: beam }))?.version,
      (await json({ ...structure, model: { ...beam, nodes: [beam.nodes[0], { ...beam.nodes[1], shear: true }] } }))?.version,
      (await json({ ...structure, model: withPart({ settle: 0.01 }, 's') }))?.version,
      (await json({ ...structure, model: withPart({ projected: true }, 'w') }))?.version,
      (await json({ ...structure, model: beam, style: { ...structure.style, deflection: 'fit' } }))?.version,
      (await json({ ...structure, model: beam, style: { ...structure.style, positions: true } }))?.version,
      (await json({ ...structure, model: beam, style: { ...structure.style, siUnits: true } }))?.version
    ],
    [1, 5, 5, 5, 5, 5, 3],
    'structures: 2.5’s additions make version 5'
  );

  // version 5 (what 2.5 adds to a drawing) reads back; a version this build doesn't know opens as code
  const v5 = `${tikzDocument(code)}% spectrum-diagram v1 ${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ ...circuit, version: 5 }))))} 0123456789abcdef\n`;
  eq((await readDiagramFile(v5)).diagram?.version, 5, 'version 5 reads back');
  // a part from a set 2.5 added (fluid mechanics, construction materials) makes version 5: 2.4 would write it as a dot.
  // The sets being on, as in every new General drawing, changes nothing while no such part is used
  const everySet = ['spx-mech', 'spx-flow', 'spx-geom', 'spx-fluid', 'spx-mat'];
  eq(
    [(await json(part('fluid-pipe')))?.version, (await json(part('mat-cube')))?.version, (await json({ ...part('fluid-tank'), sets: everySet }))?.version, (await json({ ...part('resistor'), sets: everySet }))?.version, (await json({ ...circuit, sets: ['spx-fluid'] }))?.version],
    [5, 5, 5, 3, 2],
    'a fluid or materials part makes version 5; the sets alone keep the version they had'
  );
  // Annotate's 2.5 tools (a fill, a hatched boundary, a dimension, the ▽ mark, a point mark, a leader) make version 5;
  // the older annotations keep 4
  const annotation = (extra: object) => withEls([{ id: 'a', kind: 'annotation', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], ...extra }]);
  eq(
    await Promise.all([{ shape: 'polygon', material: 'water' }, { shape: 'rect', material: 'mercury', pattern: 'hatch' }, { shape: 'boundary' }, { shape: 'dimension' }, { shape: 'surface' }, { shape: 'mark' }, { shape: 'leader' }, { shape: 'rect', fill: 'blue' }, { shape: 'line', arrows: '->' }].map(async (extra) => (await json(annotation(extra)))?.version)),
    [5, 5, 5, 5, 5, 5, 5, 4, 4],
    'Annotate’s fills, boundaries, dimensions and marks make version 5; a frame or an arrow stays 4'
  );
  for (const bad of [{ ...circuit, sets: 'spx-mech' }, { ...circuit, sets: [1] }, { ...circuit, version: 6 }]) {
    const text = `${tikzDocument(code)}% spectrum-diagram v1 ${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(bad))))} 0123456789abcdef\n`;
    eq((await readDiagramFile(text)).diagram, null, `opens as code: ${JSON.stringify(bad).slice(-30)}`);
  }

  // a Form preset new in 2.5 (the fluid mechanics ones) makes version 5; Mohr's circle keeps its version
  const form = (preset: string, style: Record<string, unknown> = {}): DiagramFile => ({ language: 'tikz', pkg: 'form', style, model: { preset, values: {} }, version: 1 });
  eq([(await json(form('gate')))?.version, (await json(form('manometer', { siUnits: true })))?.version, (await json(form('mohr')))?.version, (await json(form('mohr', { siUnits: true })))?.version], [5, 5, 1, 3], 'new Form presets make version 5');

  console.log('fileFormat.check: ok');
})();
