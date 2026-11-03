import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import type { CompileError } from './EditorContext';

// A Typst compile's errors and warnings underlined where they are in the open file, until the next compile.

// what a mark underlines from where Typst points: a string, or a name or number, else one character
const TOKEN = /^"(?:[^"\\\n]|\\.)*"|^[\p{L}\p{N}_.-]+/u;

/**
 * The errors and warnings a compile found in the file at path, as squiggles in its text: only Typst's, which give a
 * column. Typst counts lines from 1 and columns from 0 in characters, not UTF-16 units. A line past the end of the
 * text (it was cut since the compile) is left out.
 */
export function compileMarks(errors: CompileError[], path: string, doc: Text): Diagnostic[] {
  return errors.flatMap((e) => {
    if (e.file !== path || e.line == null || e.column == null || e.line < 1 || e.line > doc.lines) return [];
    const line = doc.line(e.line);
    const from = line.from + Math.min([...line.text].slice(0, e.column).join('').length, line.length);
    const rest = line.text.slice(from - line.from);
    const length = TOKEN.exec(rest)?.[0].length || Math.min(1, rest.length);
    return [{ from, to: from + length, severity: e.severity, message: e.message }];
  });
}

/** The open file's marks from the last compile. */
export const setCompileMarks = StateEffect.define<Diagnostic[]>();

// the last compile's marks, moved along as the text is edited, until the next compile replaces them; an edit in or
// beside a mark's text takes it away, since it may well be the fix
export const compileMarksField = StateField.define<Diagnostic[]>({
  create: () => [],
  update(marks, tr) {
    for (const effect of tr.effects) if (effect.is(setCompileMarks)) return effect.value;
    if (!tr.docChanged || !marks.length) return marks;
    return marks.filter((d) => !tr.changes.touchesRange(d.from, d.to)).map((d) => ({ ...d, from: tr.changes.mapPos(d.from), to: tr.changes.mapPos(d.to) }));
  }
});

/**
 * The marks as a lint source beside Typst's own syntax check, in a .typ file's language: @codemirror/lint shows every
 * source's results together, where marks set on their own would go at the syntax check's next run.
 */
export const compileLint: Extension = [
  compileMarksField,
  linter((view) => view.state.field(compileMarksField), { needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setCompileMarks))) })
];
