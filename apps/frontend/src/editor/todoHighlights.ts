import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { LineLink, Todo, TodoGroups } from '../api/client';
import { MAX_RANGE_TEXT, findRange, hueCss, isRange, rangeLink, snippetOf, todoHues } from './todos';

// A to-do added on selected words highlights them in the source, in its colour, until it is ticked off. The range
// moves with every edit while the file is open and is written back to the to-do a moment after typing stops (as the
// file's autosave is) and when the file is left; a file changed elsewhere has the words found again by their text.
// Its own decoration layer, so the selection, search matches, spelling and the compile's marks all show as before.

/** A highlight: a to-do's words in the open file, and its colour and text. gone: the words went (see below). */
export type TodoMark = { id: string; file: string; from: number; to: number; hue: number; title: string; words: string; gone?: 'removed' | 'changed' };

/** The open file's highlights, from its open to-dos (useTodoHighlights); replaces the ones there. */
export const setTodoMarks = StateEffect.define<TodoMark[]>();

// an edit the user made, which may change the words inside a highlight; anything else (a pull, an agent's change, a
// reload) must leave them as they were or the highlight goes
const byUser = (tr: Transaction) => ['input', 'delete', 'undo', 'redo', 'move'].some((e) => tr.isUserEvent(e));

/** A gone highlight's words again, near where they were, when an edit brought them back (Undo). */
function again(m: TodoMark, state: EditorState, tr: Transaction) {
  let inserted = 0;
  tr.changes.iterChanges((_a, _b, _c, _d, text) => (inserted = Math.max(inserted, text.length)));
  if (inserted < m.words.length) return null;
  const at = tr.changes.mapPos(m.from);
  const line = state.doc.lineAt(at).number;
  return findRange(state.doc.toString(), { file: m.file, line, col: at - state.doc.line(line).from, endLine: line, endCol: 0, text: m.words });
}

/**
 * The highlights, mapped through each change: typing just before or after one leaves it as it is, typing inside it
 * widens it and its words follow. When the user deletes all its words the highlight goes (gone 'removed'); when
 * another change (not the user's typing) alters them it is looked for again by its words, and goes ('changed') if they
 * are nowhere, rather than marking other words. A gone one comes back if an edit (Undo) brings the words back.
 */
export const todoMarksField = StateField.define<TodoMark[]>({
  create: () => [],
  update(marks, tr) {
    for (const effect of tr.effects) if (effect.is(setTodoMarks)) return effect.value;
    if (!tr.docChanged || !marks.length) return marks;
    const user = byUser(tr);
    return marks.map((m) => {
      if (m.gone) {
        const back = again(m, tr.state, tr);
        return back ? { ...m, ...back, gone: undefined } : { ...m, from: tr.changes.mapPos(m.from), to: tr.changes.mapPos(m.from) };
      }
      const from = tr.changes.mapPos(m.from, 1);
      const to = Math.max(from, tr.changes.mapPos(m.to, -1));
      const words = tr.state.sliceDoc(from, to);
      if (words === m.words) return { ...m, from, to };
      if (user) return to > from ? { ...m, from, to, words } : { ...m, from, to: from, gone: 'removed' as const };
      const found = findRange(tr.state.doc.toString(), { file: m.file, ...lineCol(tr.state, from), endLine: 0, endCol: 0, text: m.words });
      return found ? { ...m, ...found } : { ...m, from, to: from, gone: 'changed' as const };
    });
  },
  provide: (field) =>
    EditorView.decorations.from(field, (marks) =>
      Decoration.set(
        marks.filter((m) => !m.gone && m.to > m.from).map((m) => Decoration.mark({ class: `cm-todo-mark todo-hue-${m.hue}`, attributes: { title: `To-do: ${m.title}` } }).range(m.from, m.to)),
        true
      )
    )
});

const lineCol = (state: EditorState, at: number) => {
  const line = state.doc.lineAt(at);
  return { line: line.number, col: at - line.from };
};

/** The link a highlight now stands for: its range and words as they are, or its line with removed when they went. */
export function linkOf(state: EditorState, m: TodoMark, old: LineLink): LineLink {
  if (!m.gone) return { ...old, ...rangeLink(state.doc.toString(), m.file, m.from, m.to), removed: undefined };
  const line = state.doc.lineAt(Math.min(m.from, state.doc.length));
  return { ...old, line: line.number, snippet: snippetOf(line.text), ...(m.gone === 'removed' && { removed: true }) };
}

/**
 * Add to-do here: the selection when there is one (its words, up to MAX_RANGE_TEXT, and where they run), else the
 * line at pos, as before; with what the dialog says it is.
 */
export function todoLinkAt(state: EditorState, file: string, pos: number): { link: LineLink; where: string } {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const { from, to } = state.selection.main;
  const words = state.sliceDoc(from, to);
  if (words.trim() && words.length <= MAX_RANGE_TEXT) {
    const link = rangeLink(state.doc.toString(), file, from, to);
    return { link, where: `${name}, ${link.endLine! > link.line ? `lines ${link.line} to ${link.endLine}` : `line ${link.line}`}` };
  }
  const line = state.doc.lineAt(Math.min(pos, state.doc.length));
  return { link: { file, line: line.number, snippet: snippetOf(line.text) }, where: `${name}, line ${line.number}` };
}

// the editor whose highlights the To-dos tab reads, and where the moved ranges go. ponytail: one editor per window,
// as Spectrum has; a second would need these passed round instead
let shown: { view(): EditorView | null; moved(view: EditorView, marks: TodoMark[]): void } | null = null;

/** Where a to-do's words are in the open editor now, before they are written back; null when it isn't highlighted there. */
export function liveRange(id: string, file: string) {
  const view = shown?.view();
  const m = view?.state.field(todoMarksField, false)?.find((x) => x.id === id && x.file === file);
  if (!view || !m) return null;
  return { ...linkOf(view.state, m, { file, line: 0 }), found: !m.gone };
}

// written back this long after the last edit, with the file's autosave (EditorPage's 1.5 s)
const WRITE_BACK_MS = 1500;

// the highlight's colours, and the ones on the rows' dots (tools.css), once per window
function addHueStyle() {
  if (document.getElementById('todo-hues')) return;
  const style = document.createElement('style');
  style.id = 'todo-hues';
  style.textContent = `${hueCss()}\n.cm-todo-mark { background-color: var(--todo-wash); border-radius: 2px; }`;
  document.head.append(style);
}

/** The highlights' field, and a plugin that writes moved ranges back a moment after typing stops and as the file is left. */
export const todoHighlights: Extension = [
  todoMarksField,
  ViewPlugin.fromClass(
    class {
      timer = 0;
      constructor(readonly view: EditorView) {}
      update(u: { docChanged: boolean; state: EditorState }) {
        if (!u.docChanged || !u.state.field(todoMarksField).length) return;
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.flush(), WRITE_BACK_MS);
      }
      flush() {
        window.clearTimeout(this.timer);
        this.timer = 0;
        shown?.moved(this.view, this.view.state.field(todoMarksField));
      }
      // the file is left (another state, or the editor closes): what moved is written now
      destroy() {
        if (this.timer) this.flush();
      }
    }
  )
];

/**
 * Keeps the open file's highlights to its open to-dos with a range: a new one found by its words, one already shown
 * kept where the edits moved it, a ticked or deleted one taken away. Moved ranges are saved back to their to-dos.
 */
export function useTodoHighlights(viewRef: RefObject<EditorView | null>, path: string, todos: { mine: Todo[] | null; groups: TodoGroups; save(todo: Todo): Promise<boolean> }) {
  const latest = useRef(todos);
  latest.current = todos;

  useEffect(() => {
    addHueStyle();
    const mine = {
      view: () => viewRef.current,
      moved(at: EditorView, marks: TodoMark[]) {
        // words changed elsewhere keep the to-do as it was: the list says so, and they may come back
        for (const m of marks.filter((x) => x.gone !== 'changed')) {
          const todo = latest.current.mine?.find((t) => t.id === m.id);
          if (!todo || !todo.link || !('file' in todo.link) || todo.link.file !== m.file) continue;
          const link = linkOf(at.state, m, todo.link);
          if (JSON.stringify(link) !== JSON.stringify(todo.link)) void latest.current.save({ ...todo, link, updatedAt: new Date().toISOString() });
        }
      }
    };
    // kept after the page closes, as the editor's own closing writes back what moved after this cleanup has run
    shown = mine;
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !path) return;
    const hues = todoHues(todos.mine ?? [], todos.groups);
    const had = new Map(view.state.field(todoMarksField).map((m) => [m.id, m]));
    const text = view.state.doc.toString();
    const marks: TodoMark[] = [];
    for (const t of todos.mine ?? []) {
      if (t.done || !isRange(t.link) || t.link.file !== path) continue;
      const hue = hues.get(t.id) ?? 0;
      const old = had.get(t.id);
      if (old && old.file === path) {
        marks.push({ ...old, hue, title: t.text });
        continue;
      }
      const at = findRange(text, t.link);
      marks.push(at ? { id: t.id, file: path, ...at, hue, title: t.text, words: t.link.text } : { id: t.id, file: path, from: 0, to: 0, hue, title: t.text, words: t.link.text, gone: 'changed' });
    }
    const same = marks.length === had.size && marks.every((m) => JSON.stringify(m) === JSON.stringify(had.get(m.id)));
    if (!same) view.dispatch({ effects: setTodoMarks.of(marks) });
  }, [path, todos.mine, todos.groups]);
}
