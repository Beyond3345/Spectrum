import { Facet, StateEffect, StateField } from '@codemirror/state';
import { EditorView, showPanel } from '@codemirror/view';
import type { Command, Panel, ViewUpdate } from '@codemirror/view';
import { iconFile } from '../app/Icon';
import { parseCompileLog } from './compileLog';
import { texContext } from './latexContext';

// Preview this figure (the Editing shortcut, Insert's list and the command palette): the tikzpicture, table, figure or
// display maths the cursor is in, or the selection, compiled alone with the document's preamble (the backend's
// figurePreview.js) and shown in a panel under the source. It compiles again a moment after the piece changes.

/** What a preview asks the backend: the piece, compiled with the open document's preamble. */
export type PreviewRequest = (piece: string, signal: AbortSignal) => Promise<{ ok: boolean; pdf?: string; error?: string; log?: string }>;
/** The page's way to compile a piece, or null when the open file isn't LaTeX. */
export const figurePreviewSource = Facet.define<() => PreviewRequest | null, () => PreviewRequest | null>({ combine: (all) => all[0] ?? (() => null) });

/** Draws page 1 of a PDF (diagram/Preview.tsx's pdfPageCanvas, given by the page, so pdf.js stays out of here). */
export type DrawPdf = (pdf: Uint8Array, scaleFor: (width: number, height: number) => number) => Promise<{ canvas: HTMLCanvasElement; width: number; height: number }>;
const figurePreviewDraw = Facet.define<DrawPdf, DrawPdf>({ combine: (all) => all[0] });

const PICTURES = /^(?:tikzpicture|circuitikz|pgfpicture|tikzcd|tabular\*?|tabularx|tabulary|tblr|longtblr|figure\*?|table\*?|equation\*?|align\*?|gather\*?|multline\*?|flalign\*?|alignat\*?)$/;
const FLOATS = /^(figure|table)\*?$/;
const DELAY_MS = 1000;

/**
 * The piece to preview: the selection, else the innermost picture, table, float or display maths open at the
 * cursor, from its \begin to its \end. A float is its body with \@captype set, so its \caption works outside it.
 * null when the cursor is in none.
 */
export function figureAt(text: string, from: number, to = from): { piece: string; name: string } | null {
  if (to > from) {
    const piece = text.slice(from, to);
    return piece.trim() ? { piece, name: 'selection' } : null;
  }
  const envs = texContext(text, from).openEnvs;
  for (let i = envs.length - 1; i >= 0; i -= 1) {
    const name = envs[i];
    if (!PICTURES.test(name)) continue;
    const begin = `\\begin{${name}}`;
    const end = `\\end{${name}}`;
    // the one still open at the cursor: a stack of its \begins before it, each \end taking one off
    const open: number[] = [];
    for (const m of text.slice(0, from).matchAll(new RegExp(`\\\\(begin|end)\\{${name.replace('*', '\\*')}\\}`, 'g'))) {
      if (m[1] === 'begin') open.push(m.index);
      else open.pop();
    }
    const start = open.pop();
    if (start === undefined) continue;
    // its \end, past any of the same name inside it
    let depth = 0;
    let at = start;
    for (;;) {
      const nextBegin = text.indexOf(begin, at + 1);
      const nextEnd = text.indexOf(end, at + 1);
      if (nextEnd === -1) return null;
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth += 1;
        at = nextBegin;
      } else if (depth) {
        depth -= 1;
        at = nextEnd;
      } else {
        at = nextEnd;
        break;
      }
    }
    const float = FLOATS.exec(name);
    if (!float) return { piece: text.slice(start, at + end.length), name };
    // the body without the placement ([htbp])
    const body = text.slice(start + begin.length, at).replace(/^\s*\[[^\]]*\]/, '');
    return { piece: `\\makeatletter\\def\\@captype{${float[1]}}\\makeatother\n${body}`, name };
  }
  return null;
}

const toggle = StateEffect.define<boolean>();
const openField = StateField.define<boolean>({
  create: () => false,
  update(open, tr) {
    for (const e of tr.effects) if (e.is(toggle)) open = e.value;
    return open;
  },
  provide: (f) => showPanel.from(f, (open) => (open ? createPanel : null))
});

/** Opens the preview, or compiles it again when it's open. */
export const previewFigure: Command = (view) => {
  const open = view.state.field(openField, false);
  if (open === undefined) return false;
  // a panel that opens compiles as it mounts
  if (open) view.dom.dispatchEvent(new CustomEvent('spectrum-figure-preview'));
  else view.dispatch({ effects: toggle.of(true) });
  return true;
};

const button = (icon: string, label: string) => {
  const b = document.createElement('button');
  b.className = 'icon-btn small';
  b.title = label;
  b.setAttribute('aria-label', label);
  const glyph = document.createElement('span');
  glyph.className = 'sf';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.style.maskImage = glyph.style.webkitMaskImage = `url(${iconFile(icon)})`;
  b.append(glyph);
  return b;
};

function createPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'cm-figure-preview';
  dom.setAttribute('aria-label', 'Figure preview');
  const head = document.createElement('div');
  head.className = 'cm-figure-preview-head';
  const title = document.createElement('span');
  title.className = 'cm-figure-preview-title';
  title.textContent = 'Preview';
  const status = document.createElement('span');
  status.className = 'cm-figure-preview-status';
  status.setAttribute('role', 'status');
  const again = button('arrow.clockwise', 'Compile the preview again');
  const close = button('xmark', 'Close the preview');
  head.append(title, status, again, close);
  const body = document.createElement('div');
  body.className = 'cm-figure-preview-body';
  const image = document.createElement('img');
  image.alt = 'The compiled figure';
  image.hidden = true;
  body.append(image);
  dom.append(head, body);

  let shown = '';
  let running: AbortController | null = null;
  let timer = 0;
  const say = (text: string, failed = false) => {
    status.textContent = text;
    status.classList.toggle('failed', failed);
  };
  const compile = async (force = false) => {
    window.clearTimeout(timer);
    const request = view.state.facet(figurePreviewSource)();
    if (!request) return say('Preview works in a LaTeX file.', true);
    const sel = view.state.selection.main;
    const found = figureAt(view.state.doc.toString(), sel.from, sel.to);
    if (!found) return say(shown ? 'The cursor isn’t in a figure. Showing the last one.' : 'Put the cursor in a tikzpicture, table, figure or equation, or select what to preview.');
    if (!force && found.piece === shown) return;
    shown = found.piece;
    // a newer piece stops the compile of the one before
    running?.abort();
    const controller = (running = new AbortController());
    say('Compiling…');
    try {
      const res = await request(found.piece, controller.signal);
      if (controller.signal.aborted) return;
      if (!res.pdf) {
        const first = parseCompileLog(res.log ?? '').find((e) => e.severity === 'error');
        return say(first ? `Didn’t compile: ${first.message}` : res.error || 'Didn’t compile.', true);
      }
      const bytes = Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0));
      // sharp on a Retina screen, at most twice its size
      const scale = 2 * window.devicePixelRatio;
      const { canvas, width, height } = await view.state.facet(figurePreviewDraw)(bytes, () => scale);
      if (controller.signal.aborted) return;
      image.src = canvas.toDataURL('image/png');
      image.style.width = `${width * 1.5}px`;
      image.style.aspectRatio = `${width} / ${height}`;
      image.hidden = false;
      // TeX carries on past most errors, so a picture can come with some
      const errors = parseCompileLog(res.log ?? '').filter((e) => e.severity === 'error');
      say(errors.length ? `With errors: ${errors[0].message}` : found.name === 'selection' ? 'The selection' : found.name, errors.length > 0);
    } catch (err) {
      if (!controller.signal.aborted) say(err instanceof Error ? err.message : 'Didn’t compile.', true);
    } finally {
      if (running === controller) running = null;
    }
  };
  const later = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void compile(), DELAY_MS);
  };
  again.addEventListener('click', () => void compile(true));
  close.addEventListener('click', () => {
    view.dispatch({ effects: toggle.of(false) });
    view.focus();
  });
  const onAsk = () => void compile(true);
  view.dom.addEventListener('spectrum-figure-preview', onAsk);
  return {
    dom,
    top: false,
    mount: () => void compile(true),
    update: (update: ViewUpdate) => {
      if (update.docChanged || update.selectionSet) later();
    },
    destroy: () => {
      window.clearTimeout(timer);
      running?.abort();
      view.dom.removeEventListener('spectrum-figure-preview', onAsk);
    }
  };
}

const theme = EditorView.baseTheme({
  '.cm-figure-preview': { display: 'flex', flexDirection: 'column', maxHeight: '40vh', fontFamily: 'var(--font-ui)', fontSize: '12px' },
  '.cm-figure-preview-head': { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px 4px 12px' },
  '.cm-figure-preview-title': { fontWeight: '600' },
  '.cm-figure-preview-status': { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' },
  '.cm-figure-preview-status.failed': { color: 'var(--red)' },
  '.cm-figure-preview-body': { flex: '1', minHeight: '0', overflow: 'auto', padding: '4px 12px 12px', textAlign: 'center' },
  // the page is white, as the PDF's is
  '.cm-figure-preview-body img': { maxWidth: '100%', background: '#fff', borderRadius: '4px', boxShadow: '0 0 0 1px var(--border)' }
});

/** The preview's panel; it opens with previewFigure. */
export const figurePreview = (source: () => PreviewRequest | null, draw: DrawPdf) => [openField, theme, figurePreviewSource.of(source), figurePreviewDraw.of(draw)];
