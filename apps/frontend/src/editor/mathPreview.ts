import { Facet, Prec, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Text } from '@codemirror/state';
import { EditorView, keymap, showTooltip } from '@codemirror/view';
import type { Tooltip, TooltipView } from '@codemirror/view';
import { withoutComments } from '../../../backend/src/latex/text.js';
import { loadSettings } from '../app/settings';
import { mathOpening } from './latexContext';
import { texMacros } from './texMacros';

// The maths the cursor is in, rendered by KaTeX in a small panel under it (Settings › Editor › Maths preview): in a
// LaTeX file and in a Markdown file's maths. KaTeX builds the rendering as DOM with trust off, so nothing in the
// document becomes HTML or a link, and what it can't render (a package's command, an optional argument) shows a
// short note in place of a rendering that might be wrong.

export type MathsKind = 'latex' | 'markdown';
export type MathsSpan = { from: number; to: number; tex: string; display: boolean };

/** The macros the project's other files define (\newcommand and the like, as texMacros reads them), in order. */
export const projectMacros = Facet.define<() => Record<string, string>[]>();

const CLOSERS: Record<string, string> = { $: '$', $$: '$$', '\\(': '\\)', '\\[': '\\]' };
// what KaTeX can't take, or reads otherwise, and leaves the picture the same without
const DROP = /\\label\s*\{[^{}]*\}|\\(?:nonumber|notag)(?![A-Za-z])/g;
// how far a closer is looked for, and back for a Markdown paragraph's start
const REACH = 20_000;

/** Where `closer` next comes from `from` on, not escaped by a \, and not past a blank line for $; -1 when it doesn't. */
function closerAt(text: string, closer: string, from: number) {
  const end = Math.min(text.length, from + REACH);
  for (let i = text.indexOf(closer, from); i !== -1 && i < end; i = text.indexOf(closer, i + 1)) {
    if (closer === '$' && /\n[ \t]*\n/.test(text.slice(from, i))) return -1;
    if (/\\*$/.exec(text.slice(Math.max(0, i - 32), i))![0].length % 2 === 0) return i;
  }
  return -1;
}

/**
 * The maths at pos in LaTeX source (or a Markdown paragraph's, from `start`): its span with the delimiters and the TeX
 * to render, an environment as \begin…\end (equation and displaymath as their body), without labels and comments;
 * null outside maths, in maths with no closer yet, or with nothing in it.
 */
export function mathsAt(text: string, pos: number, start = 0): MathsSpan | null {
  const open = mathOpening(text.slice(start, pos), pos - start);
  if (!open) return null;
  const from = start + open.from;
  const env = !(open.open in CLOSERS);
  const closer = env ? `\\end{${open.open}}` : CLOSERS[open.open];
  const end = closerAt(text, closer, pos);
  if (end === -1) return null;
  const body = withoutComments(text.slice(from, end)).replace(DROP, '');
  if (!body.trim()) return null;
  const plain = /^(?:equation\*?|displaymath|math)$/.test(open.open);
  // numbered ones as their starred forms: a number means nothing here, and KaTeX sets it over a narrow panel's maths
  const name = /^(?:align|alignat|gather|multline|flalign)$/.test(open.open) ? `${open.open}*` : open.open;
  const tex = env && !plain ? `\\begin{${name}}${body}\\end{${name}}` : body;
  const opener = env ? `\\begin{${open.open}}`.length : open.open.length;
  return { from: from - opener, to: end + closer.length, tex, display: env ? open.open !== 'math' : open.open === '$$' || open.open === '\\[' };
}

/** Where a Markdown paragraph starts before pos (pandoc's maths never crosses a blank line). */
function paragraphStart(doc: Text, pos: number) {
  const from = Math.max(0, pos - REACH);
  let start = from;
  for (const m of doc.sliceString(from, pos).matchAll(/\n[ \t]*\n/g)) start = from + m.index + m[0].length;
  return start;
}

const hide = StateEffect.define<number>();
type Shown = { span: MathsSpan | null; hidden: number | null };

let katexLoad: Promise<typeof import('katex')['default'] | null> | null = null;
const loadKatex = () => (katexLoad ??= import('katex').then(async (m) => (await import('katex/dist/katex.min.css'), m.default)).catch(() => null));

/**
 * How KaTeX renders: an error rather than red text for what it can't, no \href, \url or \includegraphics (trust off),
 * limits on size and on macros that expand for ever, and a copy of the macros, which a \gdef in the maths would add to.
 */
export const katexOptions = (span: MathsSpan, macros: Record<string, string>) =>
  ({ displayMode: span.display, throwOnError: true, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 500, errorColor: UNTRUSTED, macros: { ...macros } }) as const;

// KaTeX writes a command that trust keeps out (\href, \url, \includegraphics, \htmlClass…) as its name in errorColor
// even when it throws on errors: this colour marks it, so it fails like any other
const UNTRUSTED = '#c00001';

/** Throws when KaTeX can't render tex as asked, with a command trust keeps out as the reason. */
export function checkMaths(katex: typeof import('katex')['default'], span: MathsSpan, macros: Record<string, string>) {
  const html = katex.renderToString(span.tex, katexOptions(span, macros));
  if (html.includes(UNTRUSTED)) throw new Error(`${/(\\[A-Za-z]+)<\/span>/.exec(html)?.[1] ?? 'A command'} isn’t shown in a preview`);
}

/** The rendering of span in dom, or KaTeX's reason it can't: shortened, and never a guess at the picture. */
export function renderMaths(katex: typeof import('katex')['default'], dom: HTMLElement, span: MathsSpan, macros: Record<string, string>) {
  dom.textContent = '';
  dom.classList.remove('cm-math-failed');
  try {
    checkMaths(katex, span, macros);
    katex.render(span.tex, dom, katexOptions(span, macros));
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/^KaTeX parse error:\s*/, '').replace(/ at position \d+:[\s\S]*$/, '') : '';
    dom.textContent = `No preview: ${message || 'KaTeX can’t show this'}.`.replace(/\.\.$/, '.');
    dom.classList.add('cm-math-failed');
  }
}

/** The project's macros, then the open file's own (which win). */
const macrosOf = (state: EditorState) => Object.assign({}, ...state.facet(projectMacros).flatMap((get) => get()), docMacros(state.doc));
const docTexMacros = new WeakMap<Text, Record<string, string>>();
const docMacros = (doc: Text) => docTexMacros.get(doc) ?? docTexMacros.set(doc, texMacros(withoutComments(doc.toString()))).get(doc)!;

function mathsTooltip(kind: MathsKind): Extension {
  const create = (view: EditorView): TooltipView => {
    const dom = document.createElement('div');
    dom.className = 'cm-math-preview';
    dom.setAttribute('role', 'status');
    dom.setAttribute('aria-label', 'Maths preview');
    let shown = '';
    const draw = (state: EditorState) => {
      const span = state.field(field).span;
      const key = span && JSON.stringify([span.tex, span.display]);
      if (!span || key === shown) return;
      shown = key!;
      loadKatex().then((katex) => {
        if (!katex) dom.textContent = 'No preview: KaTeX didn’t load.';
        // the newest maths only, if another came while KaTeX loaded
        else if (shown === key) renderMaths(katex, dom, span, macrosOf(view.state));
      });
    };
    draw(view.state);
    return { dom, update: (update) => draw(update.state) };
  };
  const field: StateField<Shown> = StateField.define<Shown>({
    create: () => ({ span: null, hidden: null }),
    update(value, tr) {
      let hidden = value.hidden == null ? null : tr.changes.mapPos(value.hidden);
      for (const e of tr.effects) if (e.is(hide)) hidden = e.value;
      if (!tr.docChanged && !tr.selection && hidden === value.hidden) return value;
      if (!loadSettings().mathPreview) return { span: null, hidden: null };
      const { doc } = tr.state;
      const head = tr.state.selection.main.head;
      const text = doc.toString();
      const span = mathsAt(text, head, kind === 'markdown' ? paragraphStart(doc, head) : 0);
      // Esc hides it until the cursor leaves that maths
      if (hidden != null && span?.from !== hidden) hidden = null;
      return { span: hidden == null ? span : null, hidden };
    },
    provide: (f) => showTooltip.compute([f], (state): Tooltip | null => {
      const { span } = state.field(f);
      return span ? { pos: span.to, above: false, strictSide: false, arrow: false, create } : null;
    })
  });
  return [
    field,
    theme,
    Prec.high(
      keymap.of([
        {
          key: 'Escape',
          run: (view) => {
            const span = view.state.field(field).span;
            if (!span) return false;
            view.dispatch({ effects: hide.of(span.from) });
            return true;
          }
        }
      ])
    )
  ];
}

const theme = EditorView.baseTheme({
  '.cm-tooltip.cm-math-preview': { padding: '8px 12px', maxWidth: 'min(640px, 90vw)', maxHeight: '40vh', overflow: 'auto', fontSize: '15px' },
  '.cm-math-preview .katex-display': { margin: '0' },
  '.cm-tooltip.cm-math-preview.cm-math-failed': { padding: '6px 10px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-secondary)' }
});

/** The maths preview for a LaTeX file and for a Markdown file, each made once. */
export const mathPreview: Record<MathsKind, Extension> = { latex: mathsTooltip('latex'), markdown: mathsTooltip('markdown') };
