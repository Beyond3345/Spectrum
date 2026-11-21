import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { StateEffect, StateField } from '@codemirror/state';
import type { Extension, Text } from '@codemirror/state';
import type { CompileError } from './EditorContext';

// A compile's errors and warnings underlined where they are in the open file, until the next compile: Typst's where
// it points, TeX's at the command it stopped after, or else along the line.

// what a mark underlines from where Typst points: a string, or a name or number, else one character
const TOKEN = /^"(?:[^"\\\n]|\\.)*"|^[\p{L}\p{N}_.-]+/u;

// the command TeX's context ends with: what it stopped after
const LAST_COMMAND = /\\(?:[A-Za-z@]+|.)$/;

// TeX's Overfull and Underfull \hbox and \vbox warnings: many in a long document, so underlined only when asked
const BOX_WARNING = /^(?:Over|Under)full \\[hv]box\b/;

/**
 * The errors and warnings a compile found in the file at path, as squiggles in its text. Typst counts lines from 1 and
 * columns from 0 in characters, not UTF-16 units. TeX gives a line only, and for an error what it had read of it: the
 * command that ends that is marked, else the line's text. A line past the end of the text (it was cut since the
 * compile) is left out, and so are box warnings unless boxes is set (Settings › Engines).
 */
export function compileMarks(errors: CompileError[], path: string, doc: Text, boxes = false): Diagnostic[] {
  return errors.flatMap((e) => {
    if (e.file !== path || e.line == null || e.line < 1 || e.line > doc.lines) return [];
    if (!boxes && e.severity === 'warning' && BOX_WARNING.test(e.message)) return [];
    const line = doc.line(e.line);
    if (e.column == null) {
      // TeX shortens a long context to its end, after "..."
      const read = e.context?.replace(/^\.\.\./, '') ?? '';
      const at = read ? line.text.indexOf(read) : -1;
      const command = at >= 0 ? LAST_COMMAND.exec(read)?.[0] : undefined;
      if (command) {
        const to = line.from + at + read.length;
        return [{ from: to - command.length, to, severity: e.severity, message: e.message }];
      }
      return [{ from: line.from + (line.text.length - line.text.trimStart().length), to: line.to, severity: e.severity, message: e.message }];
    }
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
 * The marks as a lint source beside Typst's own syntax check, in a .typ or .tex file's language, and the language
 * server's (texlab.ts): @codemirror/lint shows every source's results together, where marks set on their own would go
 * at another source's next run.
 */
export const compileLint: Extension = [
  compileMarksField,
  linter((view) => view.state.field(compileMarksField), { needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setCompileMarks))) })
];
