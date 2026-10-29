import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChangeSet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { changeIgnoredGrammarRule, grammarCheck, installLanguageTool, listLanguages } from '../api/client';
import type { GrammarCoverage, GrammarIssue, GrammarSuggestion, LanguageInfo } from '../api/client';
import Icon from '../app/Icon';
import Select from '../app/Select';
import { languageName, updateSettings } from '../app/settings';
import type { AppSettings } from '../app/settings';
import { toast } from '../app/Toast';

// The grammar check over the open file, each paragraph in its listed language: English through Harper (or
// LanguageTool, if chosen), other languages through LanguageTool when it's on this computer. Its issues are listed
// here and underlined in the editor. The underlines move with edits, so the list stays right while you fix.

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

// the edits made since a check started, so a LanguageTool check's late results land on the text as it is now
const recordChanges = StateEffect.define<boolean>();
const changesField = StateField.define<ChangeSet | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(recordChanges)) value = effect.value ? ChangeSet.empty(tr.state.doc.length) : null;
    return value && tr.docChanged ? value.compose(tr.changes) : value;
  }
});

/** The editor half of the grammar check (the underlines). */
export const grammarMarks = [grammarField, changesField];

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
  Regionalism: 'Regional word',
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
const CHECKABLE = /\.(tex|ltx|typ|md|markdown|txt)$/i;

/** Australian English and Traditional Chinese; A, B and C. */
const names = (tags: string[]) => {
  const all = [...new Set(tags)].map(languageName);
  return all.length > 1 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all[0] || '';
};
// the catalogue, read once, to know which listed languages LanguageTool would check
let catalogue: Promise<LanguageInfo[]> | null = null;
const loadCatalogue = () => (catalogue ||= listLanguages().then((res) => res.languages, () => ((catalogue = null), [])));

// a file edited during a check is read again only up to this size (Harper takes about a second); a longer one keeps
// its results, mapped through the edits, and offers Check again
const RECHECK_CHARS = 200_000;

const paragraphs = (n: number) => `${n} ${n === 1 ? 'paragraph' : 'paragraphs'}`;

export default function GrammarPanel({
  view,
  projectId,
  path,
  revision,
  settings,
  languages,
  onClose,
  onOpenSettings,
  trailing
}: {
  view: () => EditorView | null;
  projectId: string;
  path: string;
  /** changes whenever the document does, so the list follows edits */
  revision: unknown;
  settings: AppSettings;
  /** the language list in effect: the project's own, else the user's */
  languages: string[];
  onClose(): void;
  /** Settings › Spelling & grammar */
  onOpenSettings(): void;
  /** ends the header (the view switcher) */
  trailing?: ReactNode;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [state, setState] = useState<'checking' | 'done' | 'error' | 'unsupported' | 'cancelled'>('checking');
  const [error, setError] = useState('');
  const [checkedPath, setCheckedPath] = useState('');
  const [coverage, setCoverage] = useState<GrammarCoverage[]>([]);
  // edited during a long or LanguageTool check, whose results were mapped onto the text as it now is
  const [changed, setChanged] = useState(false);
  const [known, setKnown] = useState<LanguageInfo[]>([]);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const clearMarks = () => view()?.dispatch({ effects: setGrammarMarks.of([]) });
  useEffect(() => {
    void loadCatalogue().then(setKnown);
  }, []);
  // LanguageTool may check something: a listed language it checks that Harper doesn't, or English if chosen
  const usesLanguageTool = languages.some((tag) => {
    const entry = known.find((e) => e.tag === tag);
    return !!entry?.languageTool && (!entry.harper || settings.englishGrammar === 'languagetool');
  });

  const run = async () => {
    const v = view();
    const id = ++runRef.current;
    abortRef.current?.abort();
    setIssues([]);
    setCoverage([]);
    setChanged(false);
    clearMarks();
    setCheckedPath(path);
    if (!v || !CHECKABLE.test(path)) {
      setState('unsupported');
      return;
    }
    setState('checking');
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    v.dispatch({ effects: recordChanges.of(true) });
    const doc = v.state.doc;
    try {
      const res = await grammarCheck({ text: doc.toString(), file: path, projectId, style: settings.grammarStyle, oxford: settings.oxfordComma,
        languages, englishGrammar: settings.englishGrammar }, controller.signal);
      const editor = view();
      if (id !== runRef.current || !editor) return;
      let found: GrammarIssue[] = res.issues;
      if (editor.state.doc !== doc) {
        // edited while Harper read it: a short file is quick, so read it again; a long file or a LanguageTool check
        // isn't started again, its results are mapped through the edits made since
        if (doc.length <= RECHECK_CHARS && !res.coverage.some((c) => c.engine === 'languagetool' && c.done > 0)) return void run();
        const changes = editor.state.field(changesField, false);
        if (changes) found = found.map((issue) => ({ ...issue, from: changes.mapPos(issue.from, 1), to: changes.mapPos(issue.to, -1) })).filter((issue) => issue.to >= issue.from);
        setChanged(true);
      }
      const list = found.map((issue, i) => ({ ...issue, id: `${id}-${i}` }));
      editor.dispatch({ effects: [setGrammarMarks.of(list), recordChanges.of(false)] });
      setIssues(list);
      setCoverage(res.coverage);
      setState('done');
    } catch (err) {
      if (id !== runRef.current) return;
      view()?.dispatch({ effects: recordChanges.of(false) });
      if (controller.signal.aborted) return void setState('cancelled');
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  // a check when the panel opens, the file changes or the rule or language settings do
  useEffect(() => {
    void run();
  }, [path, settings.grammarStyle, settings.oxfordComma, settings.englishGrammar, languages.join()]);

  // the underlines go when the panel closes, and a check still running stops
  useEffect(
    () => () => {
      runRef.current += 1;
      abortRef.current?.abort();
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

  const ignoreRule = async (issue: Issue) => {
    const engine = issue.engine || 'harper';
    // LanguageTool's rules are ignored for their language only
    drop(issues.filter((i) => i.rule === issue.rule && (i.engine || 'harper') === engine && (engine === 'harper' || i.lang === issue.lang)).map((i) => i.id));
    await changeIgnoredGrammarRule(projectId, issue.rule, false, engine, issue.lang).catch(() => undefined);
  };

  const download = () => {
    installLanguageTool()
      .then(() => toast('Downloading LanguageTool. Settings › Spelling & grammar shows how far it has got.'))
      .catch((err) => toast(err instanceof Error ? err.message : String(err), { tone: 'error' }));
  };

  // what wasn't checked and why; a check that couldn't run never says no issues were found
  const notes: { key: string; text: string; action?: { label: string; onClick(): void }; details?: string }[] = [];
  for (const c of coverage) {
    const name = languageName(c.lang);
    if (c.state === 'none') notes.push({ key: c.lang, text: `Not checked: ${paragraphs(c.pieces)} of ${name}, which has no grammar checker.` });
    else if (c.state === 'off') notes.push({ key: c.lang, text: `${name} needs LanguageTool. Turn it on in Settings › Spelling & grammar.`, action: { label: 'Open Settings', onClick: onOpenSettings } });
    else if (c.state === 'not-downloaded' && !notes.some((n) => n.key === 'download')) notes.push({ key: 'download', text: 'LanguageTool is not downloaded yet.', action: { label: 'Download (about 300 MB)', onClick: download } });
    else if (c.state === 'failed' || c.state === 'cancelled') notes.push({ key: c.lang, text: `${name}: ${c.message || 'LanguageTool stopped before it finished.'}${c.parts > 1 && c.state === 'failed' ? ` ${c.done} of ${c.parts} parts checked.` : ''}` });
    if (c.fallback) notes.push({ key: `${c.lang}-harper`, text: `LanguageTool couldn’t check ${name}, so Harper did${c.fallback.state === 'off' ? ' (LanguageTool is off)' : c.fallback.state === 'not-downloaded' ? ' (LanguageTool is not downloaded yet)' : ''}.`, details: c.fallback.message });
  }
  const checked = coverage.filter((c) => c.state === 'checked');
  const manyLanguages = new Set(checked.map((c) => c.lang)).size > 1;

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
          <span className="grammar-sub">{names(coverage.length ? coverage.map((c) => c.lang) : languages)} · {file}</span>
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
              <span className="spinner" /> {usesLanguageTool ? 'Checking with LanguageTool… A long file can take a minute.' : `Checking ${file}…`}
              {usesLanguageTool && <button className="btn small ghost" onClick={cancel}>Cancel</button>}
            </div>
          )}
          {state === 'cancelled' && (
            <div className="grammar-empty">
              Cancelled. <button className="btn small ghost" onClick={() => void run()}>Check again</button>
            </div>
          )}
          {state === 'unsupported' && <div className="grammar-empty">Grammar checking works on LaTeX, Typst, Markdown and .txt files. Open one to check it.</div>}
          {state === 'error' && <div className="grammar-empty error">{error}</div>}
          {state === 'done' && changed && (
            <div className="grammar-empty">
              The file changed during the check. <button className="btn small ghost" onClick={() => void run()}>Check again</button>
            </div>
          )}
          {state === 'done' && !shown.length && checked.length > 0 && (
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
                  <span className="grammar-kind">
                    {KIND_LABELS[issue.kind] || issue.kind}
                    {manyLanguages && issue.lang && ` · ${languageName(issue.lang)}`}
                  </span>
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
                  <button className="btn small ghost" title={`Stop flagging “${ruleLabel(issue.rule)}” in this project`} onClick={() => void ignoreRule(issue)}>
                    Ignore rule
                  </button>
                </div>
              </div>
            ))}
          {state === 'done' &&
            notes.map((note) => (
              <div key={note.key} className="grammar-empty grammar-note">
                {note.text}
                {note.action && <button className="btn small ghost" onClick={note.action.onClick}>{note.action.label}</button>}
                {note.details && (
                  <details>
                    <summary>Diagnostic details</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.details}</pre>
                  </details>
                )}
              </div>
            ))}
        </div>
      </div>
      <div className="grammar-foot">
        <label className="checkbox-row">
          <input type="checkbox" role="switch" checked={settings.grammarStyle} onChange={(e) => updateSettings({ grammarStyle: e.target.checked })} />
          <span>Include style suggestions</span>
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
