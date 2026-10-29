// Self-check that diagram files written before symbol sets, the chooser and the Form mode still open and export exactly
// as they did: each reads back as drawn, its mode writes the same text again (so opening it never saves it again), and
// Insert hands the document the same packages and libraries, plus TikZ's babel library. Run:
// npx esbuild apps/frontend/src/diagram/compat.check.ts --bundle --platform=node --log-level=warning | node
import { FIXTURES } from './compat.fixtures';
import { diagramFileText, drawnText, readDiagramFile } from './fileFormat';
import type { DiagramCode } from './fileFormat';
import { circuitCode } from './modes/circuitikz/code';
import { asCircuit } from './modes/circuitikz/model';
import { fletcherCode } from './modes/fletcher/code';
import { plotCode } from './modes/pgfplots/code';
import { tikzCode } from './modes/tikz/code';
import { cdCode } from './modes/tikzcd/code';
import { structureCode } from './modes/structures/code';
import { vectorCode } from './modes/vectors/code';
import { documentLoads } from './sets';
import type { DiagramFile } from './types';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/** The code each mode writes for a drawing, as its toCode in modes/<mode>/index does (those load React, so not here). */
function codeOf(diagram: DiagramFile, typstVersion: string): DiagramCode {
  const model = diagram.model as never;
  if (diagram.language === 'mermaid') return { body: (diagram.model as { code: string }).code, packages: [], libraries: [] };
  if (diagram.language === 'typst') return fletcherCode(model, typstVersion);
  switch (diagram.pkg) {
    case 'circuitikz':
      return circuitCode(asCircuit(model), diagram.style);
    case 'pgfplots':
      return plotCode(model);
    case 'tikz-cd':
      return cdCode(model);
    case 'tikz':
      return tikzCode(model);
    case 'vectors':
      return vectorCode(model, diagram.style);
    case 'structures':
      return structureCode(model, diagram.style);
    default:
      throw new Error(`no mode for ${diagram.pkg}`);
  }
}

/** What Insert as figure read from a file's text before (ComposerApp's loadsOf). */
function loadsOf(text: string) {
  const names = (re: RegExp) => [...text.matchAll(re)].flatMap((m) => m[1].split(',').map((n) => n.trim())).filter(Boolean);
  return { packages: names(/^[^%\n]*\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/gm), libraries: names(/^[^%\n]*\\usetikzlibrary\{([^}]+)\}/gm) };
}

(async () => {
  eq(Object.keys(FIXTURES).length, 10, 'a file for each mode');
  for (const [path, text] of Object.entries(FIXTURES)) {
    const { code, diagram, edited } = await readDiagramFile(text);
    if (!diagram) throw new Error(`${path}: no drawing`);
    eq([diagram.version, 'sets' in diagram, edited], [1, false, false], `${path} reads as drawn, version 1`);
    const generated = codeOf(diagram, path.endsWith('-old.typ') ? '0.12.0' : '');
    // the composer saves a file again on opening when this differs (openDiagram's needsSave)
    // fletcher drawings written before review 2's fix dropped dashes, thicknesses and colours, so one with any of those is
    // saved once more on opening, with the styles it was drawn with; the rest come back word for word
    const restyled = diagram.language === 'typst' && /"(?:dash|width|stroke)"/.test(JSON.stringify(diagram.model));
    // circuits now write every style key, defaults too, so one is saved once more on opening: only its picture's
    // options and \ctikzset line change, and the preset stays first
    if (diagram.pkg === 'circuitikz') {
      const styleOut = (t: string) => t.replace(/\\begin\{circuitikz\}\[[^\]\n]*\]\n(?:\\ctikzset\{[^\n]*\}\n)?/, '');
      eq(styleOut(drawnText(diagram, generated)), styleOut(code), `${path}: its mode writes the same circuit, every style key written`);
      const preset = (t: string) => /\\begin\{circuitikz\}\[(\w+)/.exec(t)?.[1];
      eq(preset(generated.body), preset(code), `${path}: the same preset first`);
    } else if (!restyled) {
      eq(drawnText(diagram, generated), code, `${path}: its mode writes the same text`);
      eq(await diagramFileText(diagram, generated), text, `${path}: and the same file, last line and all`);
    }
    if (diagram.language === 'tikz') {
      const before = loadsOf(code);
      const now = documentLoads('tikz', before);
      eq([now.packages, now.libraries.filter((l) => l !== 'babel'), now.refused], [before.packages, before.libraries.filter((l) => l !== 'babel'), []], `${path}: Insert adds the same loads`);
      eq(now.libraries.includes('babel'), true, `${path}: with the babel library`);
    }
  }
  console.log('compat.check: ok');
})();
