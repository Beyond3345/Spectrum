import { EditorSelection, Prec } from '@codemirror/state';
import type { EditorState, Extension, TransactionSpec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { Command } from '@codemirror/view';
import { completionStatus } from '@codemirror/autocomplete';
import { loadSettings } from '../app/settings';
import { texContext } from './latexContext';

// Smarter typing in LaTeX and Typst (Settings › Editor › Typing): Return carries a list on, and maths delimiters come
// in pairs. Markdown's lists already carry on (CodeMirror's Markdown mode), and its $ is often money, so it has neither.

export type TypingKind = 'latex' | 'typst';

/** The prefs, as switches the caller reads (Settings by default) */
export type TypingPrefs = { continueLists: boolean; closeMaths: boolean };
const prefs = (): TypingPrefs => loadSettings();

const LIST_ENVS = /^(?:itemize|enumerate|description)\*?$/;
// the marker and the space after it: \item or \item[label] in LaTeX; -, +, 1. or / in Typst
const LATEX_ITEM = /^([ \t]*)\\item(?![A-Za-z@])(\[[^\]\n]*\])?[ \t]*/;
const TYPST_ITEM = /^([ \t]*)(-|\+|\d+\.|\/)[ \t]+/;

/** The single empty cursor, or null when there's a selection, more than one cursor or the completion list is open. */
function cursor(state: EditorState) {
  const sel = state.selection.main;
  return state.readOnly || state.selection.ranges.length > 1 || !sel.empty || completionStatus(state) === 'active' ? null : sel.head;
}

/**
 * Return on a list item: the next item at the same indent, with what was after the cursor in it. An item with nothing
 * in it ends the list: its marker goes and the cursor stays on the line. In LaTeX only in itemize, enumerate or
 * description (the innermost environment open); a description's next item is \item[] with the cursor in the brackets.
 */
export function continueListSpec(state: EditorState, kind: TypingKind): TransactionSpec | null {
  const pos = cursor(state);
  if (pos == null) return null;
  const line = state.doc.lineAt(pos);
  const m = (kind === 'latex' ? LATEX_ITEM : TYPST_ITEM).exec(line.text);
  if (!m || pos - line.from < m[0].length) return null;
  const indent = m[1];
  let env = '';
  if (kind === 'latex') {
    const ctx = texContext(state.doc.toString(), pos);
    env = ctx.openEnvs[ctx.openEnvs.length - 1] ?? '';
    if (!LIST_ENVS.test(env) || ctx.mode !== 'text') return null;
  }
  const empty = !line.text.slice(m[0].length).trim() && (kind === 'typst' || !m[2] || m[2] === '[]');
  if (empty) return { changes: { from: line.from + indent.length, to: line.to }, selection: { anchor: line.from + indent.length }, userEvent: 'delete', scrollIntoView: true };
  const marker = kind === 'typst' ? (/^\d+\.$/.test(m[2]) ? `${Number(m[2].slice(0, -1)) + 1}.` : m[2]) : env.startsWith('description') ? '\\item[]' : '\\item';
  // spaces before the cursor stay out of the new item
  const from = line.from + line.text.slice(0, pos - line.from).trimEnd().length;
  const insert = `\n${indent}${marker} `;
  const anchor = from + insert.length - (marker === '\\item[]' ? 2 : 0);
  return { changes: { from, to: pos, insert }, selection: { anchor }, userEvent: 'input', scrollIntoView: true };
}

// what sizes a delimiter on the left, and its partner on the right
const SIZED = [
  ['\\left', '\\right'],
  ['\\bigl', '\\bigr'],
  ['\\Bigl', '\\Bigr'],
  ['\\biggl', '\\biggr'],
  ['\\Biggl', '\\Biggr']
] as const;
const DELIMS: Record<string, string> = { '(': ')', '[': ']', '|': '|', '\\{': '\\}' };
// the openings typed after a run of backslashes: odd is a command (\( or \[), even is text or a line break (\\[2pt])
const oddSlashes = (before: string) => /\\*$/.exec(before)![0].length % 2 === 1;
const count = (text: string, token: string) => text.split(token).length - 1;
const countCommand = (text: string, name: string) => [...text.matchAll(new RegExp(`${name.replace(/\\/g, '\\\\')}(?![A-Za-z@])`, 'g'))].length;

/** Whether pos is in Typst maths: an odd number of unescaped $ before it. ponytail: a $ in a raw block or a string counts too */
export function typstInMaths(text: string) {
  let inside = false;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '$') inside = !inside;
  }
  return inside;
}

const insertAt = (pos: number, insert: string, cursorAt: number): TransactionSpec => ({
  changes: { from: pos, insert },
  selection: EditorSelection.cursor(pos + cursorAt),
  userEvent: 'input.type',
  scrollIntoView: true
});

/**
 * What typing `text` at the cursor does when maths delimiters pair: $ (outside maths and before a space or the end of
 * a phrase) gives $$, $ in $|$ makes it display maths $$|$$ (LaTeX), $ before a closing $ steps over it; \( and \[
 * bring \) and \]; ( [ | and \{ after \left or \bigl and the like bring \right or \bigr with the same; typing a closer
 * that's already there steps over it. A pair is only added while its line has fewer closers than openers, so retyping
 * an opener whose closer is there adds none. null: the editor types it as usual.
 */
export function pairedInput(state: EditorState, from: number, to: number, text: string, kind: TypingKind): TransactionSpec | null {
  const pos = cursor(state);
  if (pos == null || from !== pos || to !== pos) return null;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const after = line.text.slice(pos - line.from);
  if (text === '$') {
    const mode = oddSlashes(before) ? 'both' : mathsMode(state, pos, kind);
    // in a \newcommand's body it may be either
    if (mode === 'both') return null;
    const inMaths = mode === 'math';
    if (inMaths && after.startsWith('$')) {
      // an empty $|$ becomes display maths; otherwise this $ is the closer that's there
      const empty = kind === 'latex' && /(^|[^\\$])\$$/.test(before);
      return empty ? insertAt(pos, '$$', 1) : { selection: EditorSelection.cursor(pos + 1), userEvent: 'select', scrollIntoView: true };
    }
    if (!inMaths && (!after || /^[\s.,;:!?)\]}]/.test(after))) return insertAt(pos, '$$', 1);
    return null;
  }
  if (kind !== 'latex') return null;
  // a closer that's there already: typing it steps over (\ then ) over \), \right then ) over \right))
  if (/^[)\]|}]$/.test(text)) {
    for (const prefix of ['\\', ...SIZED.flatMap(([, right]) => [right, `${right}\\`])]) {
      const closer = prefix + text;
      if (!before.endsWith(prefix) || !after.startsWith(closer)) continue;
      if (prefix === '\\' && !oddSlashes(before)) continue;
      return { changes: { from: pos, to: pos + closer.length, insert: text }, selection: EditorSelection.cursor(pos + 1), userEvent: 'input.type', scrollIntoView: true };
    }
  }
  // \( and \[
  if ((text === '(' || text === '[') && oddSlashes(before)) {
    const closer = text === '(' ? '\\)' : '\\]';
    const open = count(line.text, `\\${text}`) + 1;
    return open > count(line.text, closer) ? insertAt(pos, text + closer, 1) : insertAt(pos, text, 1);
  }
  // \left( and the like; \left\{ is typed as \left\ then {
  for (const [left, right] of SIZED) {
    const brace = text === '{' && before.endsWith(`${left}\\`);
    if (!brace && !(before.endsWith(left) && /^[([|]$/.test(text))) continue;
    // \\left is a line break and the word "left"
    if (oddSlashes(before.slice(0, before.length - left.length - (brace ? 1 : 0)))) continue;
    const pair = countCommand(line.text, left) > countCommand(line.text, right);
    return insertAt(pos, pair ? `${text}${right}${brace ? '\\}' : DELIMS[text]}` : text, 1);
  }
  return null;
}

/** 'math' or 'text' at pos, or 'both' in a LaTeX definition's body. */
function mathsMode(state: EditorState, pos: number, kind: TypingKind) {
  if (kind === 'latex') return texContext(state.doc.toString(), pos).mode;
  return typstInMaths(state.sliceDoc(0, pos)) ? 'math' : 'text';
}

/** Backspace in an empty pair takes its closer too: $|$, \(|\), \[|\] and \left(|\right) and the like. */
export function deletePairSpec(state: EditorState, kind: TypingKind): TransactionSpec | null {
  const pos = cursor(state);
  if (pos == null || pos === 0) return null;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const after = line.text.slice(pos - line.from);
  let closer = '';
  // an opening $ (maths starts at the cursor), not the closer of $x$|$y$
  if (before.endsWith('$') && after.startsWith('$') && !oddSlashes(before.slice(0, -1)) && mathsMode(state, pos, kind) === 'math') closer = '$';
  else if (kind === 'latex') {
    if (/\\[([]$/.test(before) && oddSlashes(before.slice(0, -1))) closer = before.endsWith('(') ? '\\)' : '\\]';
    for (const [left, right] of SIZED) {
      for (const [open, close] of Object.entries(DELIMS)) if (before.endsWith(left + open) && after.startsWith(right + close)) closer = right + close;
    }
    if (closer && !after.startsWith(closer)) closer = '';
  }
  if (!closer) return null;
  // the opener's last character (\left\{ goes back to \left\), and the whole closer
  return { changes: { from: pos - 1, to: pos + closer.length }, selection: EditorSelection.cursor(pos - 1), userEvent: 'delete.backward', scrollIntoView: true };
}

const run = (spec: (state: EditorState) => TransactionSpec | null): Command => (view) => {
  const tr = spec(view.state);
  if (!tr) return false;
  view.dispatch(tr);
  return true;
};

/**
 * Smarter typing for a LaTeX or Typst file, each part behind its switch. Above CodeMirror's own bracket closing, so
 * \( isn't given a ) as well.
 */
export function smartTyping(kind: TypingKind, read: () => TypingPrefs = prefs): Extension {
  return Prec.high([
    keymap.of([
      { key: 'Enter', run: run((state) => (read().continueLists ? continueListSpec(state, kind) : null)) },
      { key: 'Backspace', run: run((state) => (read().closeMaths ? deletePairSpec(state, kind) : null)) }
    ]),
    EditorView.inputHandler.of((view, from, to, text) => {
      if (view.composing || !read().closeMaths) return false;
      const tr = pairedInput(view.state, from, to, text, kind);
      if (!tr) return false;
      view.dispatch(tr);
      return true;
    })
  ]);
}
