import type { DiagramFile } from './types';

// One file per diagram: figures/<name>.tex, a standalone TikZ document, or figures/<name>.mmd. Its last line keeps the
// drawing, after a comment mark TeX and Mermaid skip (% and %%), with a hash of the text the drawing writes:
//   % spectrum-diagram v1 <base64 of the DiagramFile as JSON> <sha256 of that text, its first 16 hex digits>
// The text above that line matching the hash means it's as the drawing left it; otherwise it was edited by hand.

/** What a mode's toCode gives: the picture, and what the document around it has to load. */
export type DiagramCode = { body: string; packages: string[]; libraries: string[] };

// found wherever it is, so text added below it (a merge, a hand edit) reads as an edit rather than losing the drawing
const MARK_LINE = /^%%? spectrum-diagram v1 ([A-Za-z0-9+/=]+) ([0-9a-f]{16})[ \t]*\r?$/gm;

/** The file has a drawing to open (the file tree's Edit diagram). */
export const hasDrawing = (text: string) => new RegExp(MARK_LINE.source, 'm').test(text);

/** The standalone document a TikZ diagram compiles as, and \includestandalone takes the picture from. */
export function tikzDocument({ body, packages, libraries }: DiagramCode) {
  return [
    '\\documentclass[tikz,border=2pt]{standalone}',
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
  diagram.language === 'mermaid' ? `${code.body.trimEnd()}\n` : tikzDocument(code);

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
  const above = edited === undefined ? drawn : edited.endsWith('\n') ? edited : `${edited}\n`;
  const mark = diagram.language === 'mermaid' ? '%%' : '%';
  return `${above}${mark} spectrum-diagram v1 ${toBase64(JSON.stringify(diagram))} ${await hashOf(drawn)}\n`;
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
    if (parsed && parsed.version === 1 && typeof parsed.language === 'string') diagram = parsed;
  } catch {
    // a damaged line: the file opens as code
  }
  return { code, diagram, edited: (await hashOf(code)) !== last[2], mark: last[0] };
}
