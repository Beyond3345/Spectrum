import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { maskLatex, maskMarkdown, maskTypst, proseWords } from '../../../backend/src/latex/mask.js';
import { spellCheck } from '../api/client';

// Spell checking as you type, in Australian English. The text is reduced to its prose (the same
// stripper the grammar check uses), the words in and near the view are sent to the backend's
// Hunspell checker once each, and the misspelt ones get a red squiggle.

const CHECKABLE = /\.(tex|ltx|typ|md|markdown|txt)$/i;
// checked a little past the edges, so scrolling doesn't show words before they're marked
const MARGIN = 2000;

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

const mark = Decoration.mark({ class: 'cm-misspelt' });

/** The misspelt word at a position, if there is one. */
export function misspeltAt(state: EditorState, pos: number) {
  let hit: { from: number; to: number; word: string } | null = null;
  state.field(misspeltField, false)?.between(pos, pos, (from, to) => {
    hit = { from, to, word: state.sliceDoc(from, to) };
    return false;
  });
  return hit as { from: number; to: number; word: string } | null;
}

export function spellChecker(opts: { enabled(): boolean; path(): string; projectId(): string; onError(message: string): void }): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      // word → misspelt, so each word goes to the backend once
      answers = new Map<string, boolean>();
      ignored = new Set<string>();
      masked: { doc: unknown; kind: string; text: string } = { doc: null, kind: '', text: '' };
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
              if (effect.value) effect.value.forEach((word) => this.answers.delete(word));
              else this.answers.clear();
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
        const kind = /\.(tex|ltx)$/i.test(path) ? 'latex' : /\.typ$/i.test(path) ? 'typst' : /\.(md|markdown)$/i.test(path) ? 'markdown' : 'text';
        if (this.masked.doc !== doc || this.masked.kind !== kind) {
          const text = doc.toString();
          const prose = kind === 'latex' ? maskLatex(text) : kind === 'typst' ? maskTypst(text) : kind === 'markdown' ? maskMarkdown(text) : text;
          this.masked = { doc, kind, text: prose };
        }
        const prose = this.masked.text;
        const found = new Map<number, string>();
        for (const { from, to } of view.visibleRanges) {
          const end = Math.min(prose.length, to + MARGIN);
          for (const [word, at] of proseWords(prose, Math.max(0, from - MARGIN), end)) if (at + word.length <= end) found.set(at, word);
        }
        const unknown = [...new Set(found.values())].filter((word) => !this.answers.has(word));
        if (unknown.length) {
          try {
            const { misspelt } = await spellCheck(unknown, opts.projectId());
            const wrong = new Set(misspelt);
            unknown.forEach((word) => this.answers.set(word, wrong.has(word)));
          } catch (err) {
            opts.onError(err instanceof Error ? err.message : String(err));
            return;
          }
        }
        // typed on meanwhile: the newer check draws the marks
        if (run !== this.run || view.state.doc !== doc) return;
        const head = view.state.selection.main.head;
        const builder = new RangeSetBuilder<Decoration>();
        for (const [at, word] of [...found].sort((a, b) => a[0] - b[0])) {
          // the word being typed waits until the cursor leaves it
          if (this.typing && head >= at && head <= at + word.length) continue;
          if (this.answers.get(word) && !this.ignored.has(word)) builder.add(at, at + word.length, mark);
        }
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
