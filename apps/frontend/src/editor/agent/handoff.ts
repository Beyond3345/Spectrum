// Handing work to the agent from elsewhere in the window: a page of the PDF, PDF notes, to-dos and review findings.
// Each comes as a task for the agent workspace's message box (EditorPage opens it): what it says, where it points, and
// the source lines there, so nothing has to be typed again. The user reads it, adds to it and sends it.
import { synctexEdit } from '../../api/client';
import type { PdfPoint } from '../../api/client';
import { docKind } from '../shared';
import { canvasPicture } from './pictures';
import type { Picture } from './pictures';

/** What goes in the message box: the words, and pictures to send with them (a page of the PDF). */
export type Handoff = { prompt: string; images?: Picture[] };

const EVENT = 'spectrum-agent-handoff';
/** Puts a task in the agent workspace's message box, opening the workspace. */
export const sendToAgent = (task: Handoff) => window.dispatchEvent(new CustomEvent<Handoff>(EVENT, { detail: task }));
/** Hears the tasks sent to the agent; returns the way to stop. */
export function onHandoff(fn: (task: Handoff) => void) {
  const heard = (e: Event) => fn((e as CustomEvent<Handoff>).detail);
  window.addEventListener(EVENT, heard);
  return () => window.removeEventListener(EVENT, heard);
}

/** One item for the agent: what kind it is ("Note", "To-do", "Review finding"), its words, and where it points. */
export type Located = { kind: string; text: string; file?: string; line?: number; doc?: string; page?: number };

// a dozen lines at most: two either side of the line, each cut short
const AROUND = 2;
const MAX_ITEMS = 20;
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const pdfName = (doc: string) => nameOf(doc).replace(/\.(?:tex|ltx|typ|md|markdown)$/i, '.pdf');

/** The lines around `line` of a file, numbered as the editor numbers them. */
export function excerpt(text: string, line: number) {
  const lines = text.split(/\r?\n/);
  if (line < 1 || line > lines.length) return '';
  const from = Math.max(1, line - AROUND);
  const to = Math.min(lines.length, line + AROUND);
  return ['```', ...lines.slice(from - 1, to).map((l, i) => `${from + i}| ${l.length > 200 ? `${l.slice(0, 199)}…` : l}`), '```'].join('\n');
}

/**
 * Items as one request: each numbered (one alone is not), with its file and line or its PDF page, and the source lines
 * there. sources: each file's text, for those it has.
 */
export function locatedPrompt(items: Located[], sources: Record<string, string>) {
  const shown = items.slice(0, MAX_ITEMS);
  const one = shown.length === 1;
  const parts = shown.map((item, i) => {
    const where = [item.doc && item.page && `page ${item.page} of ${pdfName(item.doc)}`, item.file && item.line && `${item.file}, line ${item.line}`].filter(Boolean).join(', from ');
    const lines = item.file && item.line && sources[item.file] !== undefined ? excerpt(sources[item.file], item.line) : '';
    return [`${one ? '' : `${i + 1}. `}${item.kind}${where ? ` on ${where}` : ''}: ${item.text.trim()}`, lines].filter(Boolean).join('\n');
  });
  const head = one ? 'Work on this item.' : `Work on these ${shown.length} items, in order. Start each part of your answer with the item’s number.`;
  const more = items.length > shown.length ? [`(${items.length - shown.length} more are left for another request.)`] : [];
  return [head, ...parts, ...more].join('\n\n');
}

/** The items with the source lines they point to, as a task for the agent. read: a file's text as the editor has it. */
export async function sendLocated(items: Located[], read: (file: string) => Promise<string>, images?: Picture[]) {
  const files = [...new Set(items.flatMap((i) => (i.file && i.line ? [i.file] : [])))];
  const sources: Record<string, string> = {};
  await Promise.all(files.map((f) => read(f).then((text) => void (sources[f] = text), () => undefined)));
  sendToAgent({ prompt: locatedPrompt(items, sources), ...(images?.length && { images }) });
}

/** Where a spot on a LaTeX document's PDF came from in the source, by SyncTeX; nothing for Typst and Markdown. */
export async function sourceOf(projectId: string, doc: string, at: PdfPoint) {
  if (docKind(doc) !== 'latex') return null;
  const res = await synctexEdit(projectId, at, doc).catch(() => null);
  return res?.ok ? { file: res.file, line: res.line } : null;
}

type Render = (page: number, width: number, height: number) => Promise<HTMLCanvasElement | null>;
type Read = (file: string) => Promise<string>;

/** Send page to agent (the PDF's right-click menu): the page as a picture, and the source line of the spot clicked. */
export async function sendPdfPage(projectId: string, doc: string, at: PdfPoint, render: Render, read: Read) {
  const [images, spot] = await Promise.all([pagePictures(render, doc, [at.page]), sourceOf(projectId, doc, at)]);
  const lines = spot ? excerpt(await read(spot.file).catch(() => ''), spot.line) : '';
  const prompt = [`Look at page ${at.page} of ${pdfName(doc)}, in the picture.${spot ? ` The spot I clicked comes from ${spot.file}, line ${spot.line}:` : ''}`, lines].filter(Boolean).join('\n');
  sendToAgent({ prompt: `${prompt}\n\n`, images });
}

/** Notes on a PDF, each at the source line its spot comes from (LaTeX) or its page, with the pages as pictures. */
export async function sendNotes(projectId: string, notes: { doc: string; page: number; x: number; y: number; text: string }[], render: Render, read: Read) {
  const items = await Promise.all(notes.slice(0, MAX_ITEMS).map(async (n): Promise<Located> => ({ kind: 'Note', text: n.text, doc: n.doc, page: n.page, ...((await sourceOf(projectId, n.doc, n)) ?? {}) })));
  await sendLocated(items, read, notes[0] ? await pagePictures(render, notes[0].doc, notes.map((n) => n.page)) : []);
}

/**
 * Pages of a PDF as pictures: drawn by the PDF pane (renderPage), about 1,500 pixels on the long side, at most four.
 */
export async function pagePictures(render: (page: number, width: number, height: number) => Promise<HTMLCanvasElement | null>, doc: string, pages: number[]) {
  const out: Picture[] = [];
  for (const page of [...new Set(pages)].slice(0, 4)) {
    const canvas = await render(page, 1100, 1100).catch(() => null);
    if (canvas) out.push(canvasPicture(canvas, `${pdfName(doc)}, page ${page}`));
  }
  return out;
}
