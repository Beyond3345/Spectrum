import { PARTS, asCircuit, usesNewerParts } from './modes/circuitikz/model';
import { plotIsNewer } from './modes/pgfplots/code';
import type { PlotModel } from './modes/pgfplots/code';
import { tikzIsNewer } from './modes/tikz/code';
import type { TikzModel } from './modes/tikz/code';
import type { DiagramFile } from './types';

// One file per diagram: figures/<name>.tex, a standalone TikZ document, figures/<name>.typ, a Typst file, or
// figures/<name>.mmd. Its last line keeps the drawing, after a comment mark TeX, Typst and Mermaid skip (%, // and %%),
// with a hash of the text the drawing writes:
//   % spectrum-diagram v1 <base64 of the DiagramFile as JSON> <sha256 of that text, its first 16 hex digits>
// The text above that line matching the hash means it's as the drawing left it; otherwise it was edited by hand.
// The line's own v1 never changes; the DiagramFile's version is 2 when the drawing has symbol sets, or parts its mode
// didn't have before them (circuit parts, and the flowchart and plot additions), which builds from before don't read (they open such a
// file as code). It is 3 when the drawing has what the 2.0 release candidate's builds would save without: siunitx,
// logic gate styles, the flowchart and point sets, or a structure's chosen force diagrams. Those builds read 1 and 2.

/** The drawing has parts a build from before sets would write without, rather than refuse. */
function newerParts(diagram: DiagramFile) {
  try {
    if (diagram.pkg === 'circuitikz') return usesNewerParts(diagram.model);
    if (diagram.language === 'typst' || diagram.pkg === 'tikz') return tikzIsNewer(diagram.model as TikzModel);
    if (diagram.pkg === 'pgfplots') return plotIsNewer(diagram.model as PlotModel);
  } catch {
    // a model of the wrong shape: its mode refuses it anyway
  }
  return false;
}

/** Sets added after the release candidate, whose parts its builds don't have. */
const NEWER_SETS = ['spx-flow', 'spx-geom'];

/** The drawing has something from phase E, which a release candidate build would save without, rather than refuse. */
function phaseE(diagram: DiagramFile) {
  const style = diagram.style;
  if (style.siUnits === true || style.physics === true || diagram.sets?.some((set) => NEWER_SETS.includes(set))) return true;
  try {
    if (diagram.pkg === 'circuitikz') return !!(style.logic || style.notSymbol) || asCircuit(diagram.model).elements.some((el) => el.kind !== 'wire' && NEWER_SETS.includes(PARTS.get(el.type)?.set ?? ''));
    if (diagram.pkg === 'structures') return style.diagrams !== undefined;
  } catch {
    // a model of the wrong shape: its mode refuses it anyway
  }
  return false;
}

/** What a mode's toCode gives: the picture, and what the document around it has to load. */
export type DiagramCode = { body: string; packages: string[]; libraries: string[] };

// found wherever it is, so text added below it (a merge, a hand edit) reads as an edit rather than losing the drawing
const MARK_LINE = /^(?:%%?|\/\/) spectrum-diagram v1 ([A-Za-z0-9+/=]+) ([0-9a-f]{16})[ \t]*\r?$/gm;

/** The file has a drawing to open (the file tree's Edit diagram). */
export const hasDrawing = (text: string) => new RegExp(MARK_LINE.source, 'm').test(text);

/** The standalone document a TikZ diagram compiles as, and \includestandalone takes the picture from. */
export function tikzDocument({ body, packages, libraries }: DiagramCode) {
  return [
    // Crop the whole picture; the tikz option only captures tikzpicture, missing wrapper environments such as circuitikz.
    '\\documentclass[border=2pt]{standalone}',
    ...packages.map((name) => `\\usepackage{${name}}`),
    ...(libraries.length ? [`\\usetikzlibrary{${libraries.join(',')}}`] : []),
    '\\begin{document}',
    body.trimEnd(),
    '\\end{document}',
    ''
  ].join('\n');
}

/** The text a drawing writes, above the last line. */
export const drawnText = (diagram: DiagramFile, code: DiagramCode) =>
  diagram.language === 'mermaid' || diagram.language === 'typst' ? `${code.body.trimEnd()}\n` : tikzDocument(code);

async function hashOf(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function toBase64(text: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/**
 * The whole file: the drawing's text, or `edited` (the Code tab's text, kept as code) in its place, then the last line.
 * The hash is always of the drawing's text, so an edited file reads back as edited.
 */
export async function diagramFileText(diagram: DiagramFile, code: DiagramCode, edited?: string) {
  const drawn = drawnText(diagram, code);
  return withLastLine(diagram, edited === undefined ? drawn : edited.endsWith('\n') ? edited : `${edited}\n`, drawn);
}

/** The text above, then the drawing's last line with the hash of the text it draws. */
async function withLastLine(diagram: DiagramFile, above: string, drawn: string) {
  const mark =diagram.language === 'mermaid' ? '%%' : diagram.language === 'typst' ? '//' : '%';
  // no sets: no sets key and version 1, as before sets, unless the drawing has parts a build from before doesn't know
  const { sets, ...rest } = diagram;
  const version = phaseE(diagram) ? 3 : sets?.length || newerParts(diagram) ? 2 : 1;
  const kept: DiagramFile = sets?.length ? { ...rest, sets, version } : { ...rest, version };
  return `${above}${mark} spectrum-diagram v1 ${toBase64(JSON.stringify(kept))} ${await hashOf(drawn)}\n`;
}

/**
 * A TikZ diagram file for a document that loads physics, whose \qty takes the place of siunitx's: its values as
 * siunitx's \SI, and its drawing told so (style.physics), so the composer goes on writing \SI. Null when it has no \qty.
 */
export async function forPhysics(text: string): Promise<string | null> {
  const qty = /\\qty(?=\{)/g;
  if (!text.match(qty)) return null;
  const { code, diagram, edited } = await readDiagramFile(text);
  // code, or edited by hand: only the text changes (the last line has no backslash)
  if (!diagram || edited) return text.replace(qty, '\\SI');
  const drawn = code.replace(qty, '\\SI');
  return withLastLine({ ...diagram, style: { ...diagram.style, physics: true } }, drawn, drawn);
}

/**
 * A diagram file read back: its text without the drawing's line (all of it when there's none), the drawing kept there
 * (null when there's none, or it can't be read), whether that text is no longer what the drawing wrote, and the
 * drawing's line itself.
 */
export async function readDiagramFile(text: string): Promise<{ code: string; diagram: DiagramFile | null; edited: boolean; mark?: string }> {
  const marks = [...text.matchAll(MARK_LINE)];
  const last = marks[marks.length - 1];
  if (!last) return { code: text, diagram: null, edited: false };
  const code = text.slice(0, last.index) + text.slice(last.index! + last[0].length).replace(/^\n/, '');
  let diagram: DiagramFile | null = null;
  try {
    const parsed = JSON.parse(fromBase64(last[1]));
    const object = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
    const sets = parsed?.sets === undefined || (Array.isArray(parsed.sets) && parsed.sets.every((s: unknown) => typeof s === 'string'));
    if (parsed && [1, 2, 3].includes(parsed.version) && sets && ['tikz', 'mermaid', 'typst'].includes(parsed.language) && object(parsed.style) && object(parsed.model)) diagram = parsed;
  } catch {
    // a damaged line: the file opens as code
  }
  return { code, diagram, edited: (await hashOf(code)) !== last[2], mark: last[0] };
}
