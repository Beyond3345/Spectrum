import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { maskLatex, maskMarkdown, maskTypst } from '../../../backend/src/latex/mask.js';
import { languageMarkup, prosePieces } from '../../../backend/src/language/markup.js';
import { spellCheck } from '../api/client';

// Spell checking as you type, in the languages the user listed. The text is reduced to its prose (the same stripper
// the grammar check uses) and cut into paragraphs; the ones in and near the view go to the backend, which works out
// each one's language and answers the misspelt words, which get a red squiggle.

const CHECKABLE = /\.(tex|ltx|typ|md|markdown|txt)$/i;
// checked a little past the edges, so scrolling doesn't show words before they're marked
const MARGIN = 2000;
// pieces before the view sent too, so one that can't be told on its own takes the language before it.
// ponytail: an undecided piece further than this after the last decided one takes the fallback; a longer lookback
// can follow if that shows up
const LOOKBACK = 20;
const MAX_PIECES = 200;
const MAX_CHARS = 200_000;

const setMisspelt = StateEffect.define<DecorationSet>();
/** Look again: forget these words' answers (null: all of them), e.g. after a word list changed. */
export const recheckSpelling = StateEffect.define<string[] | null>();
/** Leave a word alone until the editor closes. */
export const ignoreSpelling = StateEffect.define<string>();

const misspeltField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setMisspelt)) marks = effect.value;
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const marks = new Map<string, Decoration>();
/** The squiggle, carrying the language its word was checked in. */
const markFor = (lang: string) => marks.get(lang) || marks.set(lang, Decoration.mark({ class: 'cm-misspelt', lang })).get(lang)!;

/** The misspelt word at a position, with the language it was checked in, if there is one. */
export function misspeltAt(state: EditorState, pos: number) {
  let hit: { from: number; to: number; word: string; lang: string } | null = null;
  state.field(misspeltField, false)?.between(pos, pos, (from, to, value) => {
    hit = { from, to, word: state.sliceDoc(from, to), lang: value.spec.lang };
    return false;
  });
  return hit as { from: number; to: number; word: string; lang: string } | null;
}

type Kind = 'latex' | 'typst' | 'markdown' | 'text';
type Piece = { from: number; to: number; lang?: string };
type Answer = { lang: string; misspelt: [number, number][] };

/** The pieces near the view, and up to LOOKBACK before them, within what one request may carry. */
export function piecesNear(pieces: Piece[], ranges: readonly { from: number; to: number }[]) {
  const near = (p: Piece) => ranges.some(({ from, to }) => p.to >= from - MARGIN && p.from <= to + MARGIN);
  const first = pieces.findIndex(near);
  if (first < 0) return [];
  let last = first;
  while (last + 1 < pieces.length && near(pieces[last + 1])) last += 1;
  const out: Piece[] = [];
  let chars = 0;
  for (const piece of pieces.slice(Math.max(0, first - LOOKBACK), last + 1)) {
    if (out.length >= MAX_PIECES || chars + piece.to - piece.from > MAX_CHARS) break;
    out.push(piece);
    chars += piece.to - piece.from;
  }
  return out;
}

export function spellChecker(opts: {
  enabled(): boolean;
  path(): string;
  projectId(): string;
  /** the language list in effect: the project's own, else the user's */
  languages(): string[];
  onError(message: string): void;
  /** listed languages met in the text whose dictionary isn't on this computer yet */
  onPending?(tags: string[]): void;
}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      ignored = new Set<string>();
      masked: { doc: unknown; kind: string; text: string; pieces: Piece[]; main: string | null } = { doc: null, kind: '', text: '', pieces: [], main: null };
      // what was last sent and its answer, so an unchanged view isn't sent again
      last: { key: string; pieces: Piece[]; answers: Answer[] } = { key: '', pieces: [], answers: [] };
      timer = 0;
      run = 0;
      typing = false;

      constructor(readonly view: EditorView) {
        this.schedule(0);
      }

      update(update: ViewUpdate) {
        for (const tr of update.transactions) {
          for (const effect of tr.effects) {
            if (effect.is(recheckSpelling)) {
              this.last.key = '';
              this.schedule(0);
            } else if (effect.is(ignoreSpelling)) {
              this.ignored.add(effect.value);
              this.schedule(0);
            }
          }
        }
        if (update.docChanged) this.typing = update.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'));
        if (update.docChanged || update.viewportChanged) this.schedule();
      }

      schedule(delay = 350) {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => void this.check(), delay);
      }

      async check() {
        const view = this.view;
        const run = ++this.run;
        const path = opts.path();
        if (!opts.enabled() || !CHECKABLE.test(path)) {
          if (view.state.field(misspeltField).size) view.dispatch({ effects: setMisspelt.of(Decoration.none) });
          return;
        }
        const doc = view.state.doc;
        const kind: Kind = /\.(tex|ltx)$/i.test(path) ? 'latex' : /\.typ$/i.test(path) ? 'typst' : /\.(md|markdown)$/i.test(path) ? 'markdown' : 'text';
        if (this.masked.doc !== doc || this.masked.kind !== kind) {
          const source = doc.toString();
          const prose = kind === 'latex' ? maskLatex(source) : kind === 'typst' ? maskTypst(source) : kind === 'markdown' ? maskMarkdown(source) : source;
          const { main, ranges } = languageMarkup(source, kind);
          this.masked = { doc, kind, text: prose, pieces: prosePieces(prose, ranges), main };
        }
        const { text: prose, main } = this.masked;
        const pieces = piecesNear(this.masked.pieces, view.visibleRanges);
        const languages = opts.languages();
        const sent = pieces.map((p) => ({ text: prose.slice(p.from, p.to), ...(p.lang && { lang: p.lang }) }));
        const key = JSON.stringify([sent, main, languages, opts.projectId()]);
        if (key !== this.last.key) {
          try {
            const res = await spellCheck({ pieces: sent, languages, main, projectId: opts.projectId() });
            if (res.pending.length) opts.onPending?.(res.pending);
            this.last = { key, pieces, answers: res.pieces };
          } catch (err) {
            opts.onError(err instanceof Error ? err.message : String(err));
            return;
          }
        }
        // typed on meanwhile: the newer check draws the marks
        if (run !== this.run || view.state.doc !== doc) return;
        const head = view.state.selection.main.head;
        const builder = new RangeSetBuilder<Decoration>();
        this.last.pieces.forEach((piece, i) => {
          const answer = this.last.answers[i];
          for (const [from, to] of answer?.misspelt || []) {
            const [at, end] = [piece.from + from, piece.from + to];
            // the word being typed waits until the cursor leaves it
            if (this.typing && head >= at && head <= end) continue;
            if (!this.ignored.has(doc.sliceString(at, end))) builder.add(at, end, markFor(answer.lang));
          }
        });
        view.dispatch({ effects: setMisspelt.of(builder.finish()) });
      }

      destroy() {
        window.clearTimeout(this.timer);
        this.run += 1;
      }
    }
  );
  return [misspeltField, plugin];
}
