import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { changeIgnoredGrammarRule, grammarCheck } from '../api/client';
import type { GrammarIssue, GrammarSuggestion } from '../api/client';
import Icon from '../app/Icon';
import Select from '../app/Select';
import { updateSettings } from '../app/settings';
import type { AppSettings } from '../app/settings';

// The grammar check: Harper (Australian English) over the open file, its issues listed here and
// underlined in the editor. The underlines move with edits, so the list stays right while you fix.

type Mark = { id: string; from: number; to: number };
const setGrammarMarks = StateEffect.define<Mark[]>();
const dropGrammarMarks = StateEffect.define<string[]>();
const focusGrammarMark = StateEffect.define<string | null>();

const markFor = (id: string, active: boolean) => Decoration.mark({ class: active ? 'cm-grammar active' : 'cm-grammar', issue: id });

const grammarField = StateField.define<{ marks: DecorationSet; active: string | null }>({
  create: () => ({ marks: Decoration.none, active: null }),
  update(value, tr) {
    let { marks, active } = value;
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setGrammarMarks)) {
        active = null;
        marks = Decoration.set(
          effect.value.filter((m) => m.to > m.from).map((m) => markFor(m.id, false).range(m.from, m.to)),
          true
        );
      } else if (effect.is(dropGrammarMarks)) {
        const gone = new Set(effect.value);
        marks = marks.update({ filter: (_from, _to, deco) => !gone.has(deco.spec.issue) });
      } else if (effect.is(focusGrammarMark)) {
        const next = effect.value;
        const ranges: ReturnType<Decoration['range']>[] = [];
        marks.between(0, tr.state.doc.length, (from, to, deco) => {
          ranges.push(markFor(deco.spec.issue, deco.spec.issue === next).range(from, to));
        });
        marks = Decoration.set(ranges, true);
        active = next;
      }
    }
    return { marks, active };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks)
});

/** The editor half of the grammar check (the underlines). */
export const grammarMarks = grammarField;

/** Where each underlined issue is now, after any edits. */
function markedRanges(state: EditorState) {
  const ranges = new Map<string, { from: number; to: number }>();
  state.field(grammarField, false)?.marks.between(0, state.doc.length, (from, to, deco) => {
    ranges.set(deco.spec.issue, { from, to });
  });
  return ranges;
}

const KIND_LABELS: Record<string, string> = {
  Agreement: 'Agreement',
  BoundaryError: 'Word boundary',
  Capitalization: 'Capitalisation',
  Eggcorn: 'Word choice',
  Enhancement: 'Clarity',
  Formatting: 'Formatting',
  Grammar: 'Grammar',
  Malapropism: 'Word choice',
  Miscellaneous: 'Grammar',
  Nonstandard: 'Nonstandard',
  Punctuation: 'Punctuation',
  Readability: 'Readability',
  Redundancy: 'Redundancy',
  Regionalism: 'Australian English',
  Repetition: 'Repetition',
  Spelling: 'Spelling',
  Style: 'Style',
  Typo: 'Typo',
  Usage: 'Usage',
  WordChoice: 'Word choice',
  WordOrder: 'Word order'
};

/** Splits Harper's CamelCase rule names for display: NoOxfordComma → “No Oxford comma”. */
const ruleLabel = (rule: string) => {
  const words = rule.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').split(' ');
  return words.map((w, i) => (i === 0 || /^[A-Z]{2,}$/.test(w) || w === 'Oxford' ? w : w.toLowerCase())).join(' ');
};

const suggestionLabel = (s: GrammarSuggestion) =>
  s.kind === 'remove' ? 'Remove' : s.kind === 'insertAfter' ? `Add “${s.text}”` : s.text.trim() ? `“${s.text}”` : 'Remove';

type Issue = GrammarIssue & { id: string };
const CHECKABLE = /\.(tex|ltx|md|markdown|txt)$/i;

export default function GrammarPanel({
  view,
  projectId,
  path,
  revision,
  settings,
  onClose,
  trailing
}: {
  view: () => EditorView | null;
  projectId: string;
  path: string;
  /** changes whenever the document does, so the list follows edits */
  revision: unknown;
  settings: AppSettings;
  onClose(): void;
  /** ends the header (the view switcher) */
  trailing?: ReactNode;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [state, setState] = useState<'checking' | 'done' | 'error' | 'unsupported'>('checking');
  const [error, setError] = useState('');
  const [checkedPath, setCheckedPath] = useState('');
  const runRef = useRef(0);

  const clearMarks = () => view()?.dispatch({ effects: setGrammarMarks.of([]) });

  const run = async () => {
    const v = view();
    const id = ++runRef.current;
    setIssues([]);
    clearMarks();
    setCheckedPath(path);
    if (!v || !CHECKABLE.test(path)) {
      setState('unsupported');
      return;
    }
    setState('checking');
    setError('');
    const doc = v.state.doc;
    try {
      const res = await grammarCheck({ text: doc.toString(), file: path, projectId, style: settings.grammarStyle, oxford: settings.oxfordComma });
      if (id !== runRef.current) return;
      // edited while Harper read it: the positions are for older text, so read it again
      if (view()?.state.doc !== doc) return void run();
      const list = res.issues.map((issue, i) => ({ ...issue, id: `${id}-${i}` }));
      v.dispatch({ effects: setGrammarMarks.of(list) });
      setIssues(list);
      setState('done');
    } catch (err) {
      if (id !== runRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  // a check when the panel opens, the file changes or the rule settings do
  useEffect(() => {
    void run();
  }, [path, settings.grammarStyle, settings.oxfordComma]);

  // the underlines go when the panel closes
  useEffect(
    () => () => {
      runRef.current += 1;
      clearMarks();
    },
    []
  );

  const v = view();
  const ranges = useMemo(() => (v ? markedRanges(v.state) : new Map<string, { from: number; to: number }>()), [v, revision, issues]);
  // issues whose text was deleted have no underline left, apart from point issues
  const shown = issues
    .map((issue) => ({ issue, at: ranges.get(issue.id) || (issue.to === issue.from ? { from: issue.from, to: issue.to } : null) }))
    .filter((x): x is { issue: Issue; at: { from: number; to: number } } => !!x.at)
    .sort((a, b) => a.at.from - b.at.from);

  const drop = (ids: string[]) => {
    view()?.dispatch({ effects: dropGrammarMarks.of(ids) });
    setIssues((prev) => prev.filter((i) => !ids.includes(i.id)));
  };

  const select = (issue: Issue, at: { from: number; to: number }) => {
    const editor = view();
    if (!editor) return;
    editor.dispatch({ selection: { anchor: at.from, head: at.to }, effects: [focusGrammarMark.of(issue.id), EditorView.scrollIntoView(at.from, { y: 'center' })] });
    editor.focus();
  };

  const apply = (issue: Issue, at: { from: number; to: number }, s: GrammarSuggestion) => {
    const editor = view();
    if (!editor) return;
    const changes = s.kind === 'insertAfter' ? { from: at.to, insert: s.text } : { from: at.from, to: at.to, insert: s.kind === 'remove' ? '' : s.text };
    editor.dispatch({ changes, userEvent: 'input.grammar' });
    drop([issue.id]);
  };

  const ignoreRule = async (rule: string) => {
    drop(issues.filter((i) => i.rule === rule).map((i) => i.id));
    await changeIgnoredGrammarRule(projectId, rule).catch(() => undefined);
  };

  const excerpt = (at: { from: number; to: number }) => {
    const editor = view();
    if (!editor) return null;
    const line = editor.state.doc.lineAt(at.from);
    const start = Math.max(line.from, at.from - 60);
    const end = Math.min(line.to, Math.max(at.to, at.from) + 60);
    const text = editor.state.sliceDoc(start, end);
    return (
      <>
        {start > line.from && '…'}
        {text.slice(0, at.from - start)}
        <mark>{text.slice(at.from - start, at.to - start) || ' '}</mark>
        {text.slice(at.to - start)}
        {end < line.to && '…'}
      </>
    );
  };

  const file = checkedPath.split('/').pop() || 'this file';
  const active = v?.state.field(grammarField, false)?.active;

  return (
    <div className="tools-panel grammar-panel">
      <div className="tools-head">
        <div className="grammar-title">
          <span>Grammar</span>
          <span className="grammar-sub">Australian English · {file}</span>
        </div>
        <button className="icon-btn" title="Check again" aria-label="Check again" onClick={() => void run()} disabled={state === 'checking'}>
          <Icon name="arrow.clockwise" />
        </button>
        <button className="icon-btn" title="Close and show the PDF" aria-label="Close grammar check" onClick={onClose}>
          <Icon name="xmark" />
        </button>
        {trailing}
      </div>
      <div className="tools-body">
        <div className="tool-page grammar-list" role="status">
          {state === 'checking' && (
            <div className="grammar-empty">
              <span className="spinner" /> Checking {file}…
            </div>
          )}
          {state === 'unsupported' && <div className="grammar-empty">Grammar checking works on .tex, .md and .txt files. Open one to check it.</div>}
          {state === 'error' && <div className="grammar-empty error">{error}</div>}
          {state === 'done' && !shown.length && (
            <div className="grammar-empty">
              <Icon name="checkmark.circle" /> No grammar issues found in {file}.
            </div>
          )}
          {state === 'done' && shown.length > 0 && (
            <div className="grammar-count">
              {shown.length} {shown.length === 1 ? 'issue' : 'issues'}
            </div>
          )}
          {state === 'done' &&
            shown.map(({ issue, at }) => (
              <div key={issue.id} className={`grammar-issue ${active === issue.id ? 'active' : ''}`}>
                <button className="grammar-issue-main" onClick={() => select(issue, at)} aria-label={`${issue.message} Show in the editor.`}>
                  <span className="grammar-kind">{KIND_LABELS[issue.kind] || issue.kind}</span>
                  <span className="grammar-message">{issue.message}</span>
                  <span className="grammar-excerpt">{excerpt(at)}</span>
                </button>
                <div className="grammar-actions">
                  {issue.fixable
                    ? issue.suggestions.slice(0, 3).map((s, i) => (
                        <button key={i} className="btn small primary" onClick={() => apply(issue, at, s)}>
                          {suggestionLabel(s)}
                        </button>
                      ))
                    : issue.suggestions.length > 0 && <span className="grammar-hint">Suggested: {suggestionLabel(issue.suggestions[0])}, edit by hand around the LaTeX.</span>}
                  <span className="grow" />
                  <button className="btn small ghost" onClick={() => drop([issue.id])}>
                    Ignore
                  </button>
                  <button className="btn small ghost" title={`Stop flagging “${ruleLabel(issue.rule)}” in this project`} onClick={() => void ignoreRule(issue.rule)}>
                    Ignore rule
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div className="grammar-foot">
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.grammarStyle} onChange={(e) => updateSettings({ grammarStyle: e.target.checked })} />
          <span>Style suggestions</span>
        </label>
        <span className="grammar-oxford">
          <span id="grammar-oxford-label">Serial comma</span>
          <Select
            labelId="grammar-oxford-label"
            value={settings.oxfordComma}
            options={[
              ['avoid', 'Flag it'],
              ['require', 'Require it'],
              ['off', 'Don’t check']
            ]}
            onChange={(value) => updateSettings({ oxfordComma: value as AppSettings['oxfordComma'] })}
          />
        </span>
      </div>
    </div>
  );
}
