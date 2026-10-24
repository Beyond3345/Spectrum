import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { editorBasics } from '../app/shortcuts';
import { latex } from '../latex/lang';
import { editorTheme, latexHighlight, programmatic } from '../editor/latexEditor';

/**
 * A CodeMirror editor for a diagram's code, in the editor's theme. Text set from outside (the drawing changed) replaces
 * what's shown without counting as an edit; onChange hears only typing.
 */
export default function CodePane({
  value,
  onChange,
  tex = false,
  readOnly = false,
  viewRef
}: {
  value: string;
  onChange(text: string): void;
  /** LaTeX highlighting */
  tex?: boolean;
  readOnly?: boolean;
  /** the editor, for a jump to a line */
  viewRef?: MutableRefObject<EditorView | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    const editor = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          editorBasics,
          ...(tex ? [latex(), syntaxHighlighting(latexHighlight)] : []),
          EditorView.lineWrapping,
          editorTheme,
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(programmatic))) changed.current(update.state.doc.toString());
          })
        ]
      }),
      parent: hostRef.current!
    });
    view.current = editor;
    if (viewRef) viewRef.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
      if (viewRef) viewRef.current = null;
    };
  }, [tex, readOnly]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: programmatic.of(true) });
  }, [value]);

  return <div className="diagram-code" ref={hostRef} />;
}
