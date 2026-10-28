// Self-check for the diagram file format. Run:
// npx esbuild apps/frontend/src/diagram/fileFormat.check.ts --bundle --platform=node --log-level=warning | node
import { diagramFileText, hasDrawing, readDiagramFile, tikzDocument } from './fileFormat';
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
  const v2 = await readDiagramFile(await diagramFileText({ ...circuit, sets: ['spx-mech'] }, code));
  eq([v2.diagram?.version, v2.diagram?.sets, v2.edited], [2, ['spx-mech'], false], 'version 2 reads back');
  for (const bad of [{ ...circuit, sets: 'spx-mech' }, { ...circuit, sets: [1] }, { ...circuit, version: 3 }]) {
    const text = `${tikzDocument(code)}% spectrum-diagram v1 ${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(bad))))} 0123456789abcdef\n`;
    eq((await readDiagramFile(text)).diagram, null, `opens as code: ${JSON.stringify(bad).slice(-30)}`);
  }

  console.log('fileFormat.check: ok');
})();
