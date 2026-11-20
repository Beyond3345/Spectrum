import { useEffect, useState } from 'react';
import { confirmDialog } from './Dialogs';
import Icon from './Icon';
import { loadSettings, useSettings } from './settings';
import { DEFAULT_SNIPPETS, SNIPPET_BODY_MAX, SNIPPET_KINDS, SNIPPET_NAME_MAX, TRIGGER, snippetTemplate } from '../editor/userSnippets';
import type { UserSnippet } from '../editor/userSnippets';

const kindNames = (s: UserSnippet) => SNIPPET_KINDS.filter(([kind]) => s.kinds.includes(kind)).map(([, name]) => name).join(', ');

/** Why a snippet as edited can't be saved, or ''. Another snippet of a kind it shares with the same trigger counts. */
function problem(s: UserSnippet, all: UserSnippet[]) {
  if (!s.name.trim() || !s.body || !s.kinds.length) return '';
  if (s.trigger && !TRIGGER.test(s.trigger)) return 'A trigger is letters, digits and _ only, up to 32.';
  const clash = s.trigger && all.find((o) => o.id !== s.id && o.trigger === s.trigger && o.kinds.some((k) => s.kinds.includes(k)));
  if (clash) return `“${clash.name}” has this trigger already.`;
  const parsed = snippetTemplate(s.body);
  return 'error' in parsed ? parsed.error : '';
}

/** Settings › Snippets: the user's own, each with a trigger, the kinds of file it works in and a body with tab stops. */
export default function SnippetsPane({ onUnsaved }: { onUnsaved: (name: string) => void }) {
  const [settings, update] = useSettings();
  // a copy of the one being edited or created, kept only with Save
  const [editing, setEditing] = useState<UserSnippet | null>(null);
  const saved = editing && settings.snippets.find((s) => s.id === editing.id);
  const creating = !!editing && !saved;
  const changed = !!editing && (creating ? !!(editing.name || editing.trigger || editing.body) : JSON.stringify(saved) !== JSON.stringify(editing));
  const unsaved = changed ? editing!.name.trim() || 'New snippet' : '';
  useEffect(() => onUnsaved(unsaved), [unsaved]);
  useEffect(() => () => onUnsaved(''), []);
  const why = editing ? problem(editing, settings.snippets) : '';

  const save = () => {
    if (!editing) return;
    const next = { ...editing, name: editing.name.trim() };
    const all = loadSettings().snippets;
    update({ snippets: creating ? [...all, next] : all.map((s) => (s.id === next.id ? next : s)) });
    setEditing(null);
  };
  const remove = async (s: UserSnippet) => {
    if (await confirmDialog({ title: `Delete “${s.name}”?`, confirmLabel: 'Delete', destructive: true })) update({ snippets: loadSettings().snippets.filter((o) => o.id !== s.id) });
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: 'Put the starter snippets back?', message: 'Each starter you deleted or changed goes back to how Spectrum wrote it. Your own snippets stay as they are.', confirmLabel: 'Reset' });
    if (!ok) return;
    const starters = new Set(DEFAULT_SNIPPETS.map((s) => s.id));
    update({ snippets: [...DEFAULT_SNIPPETS, ...loadSettings().snippets.filter((s) => !starters.has(s.id))] });
  };

  const form = editing && (
    <div key="snippet-form" className="persona-form">
      <div className="row">
        <div className="field grow">
          <label htmlFor="snippet-name">Name</label>
          <input id="snippet-name" className="input" maxLength={SNIPPET_NAME_MAX} value={editing.name} autoFocus onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="snippet-trigger">Trigger</label>
          <input
            id="snippet-trigger"
            className="input mono"
            maxLength={32}
            spellCheck={false}
            autoCapitalize="off"
            placeholder="None"
            value={editing.trigger}
            onChange={(e) => setEditing({ ...editing, trigger: e.target.value.trim() })}
          />
        </div>
      </div>
      <div className="field">
        <label id="snippet-kinds">Works in</label>
        <div className="row" role="group" aria-labelledby="snippet-kinds">
          {SNIPPET_KINDS.map(([kind, name]) => (
            <label key={kind} className="checkbox-row">
              <input
                type="checkbox"
                checked={editing.kinds.includes(kind)}
                onChange={(e) => setEditing({ ...editing, kinds: SNIPPET_KINDS.map(([k]) => k).filter((k) => (k === kind ? e.target.checked : editing.kinds.includes(k))) })}
              />
              <span>{name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="snippet-body">Text</label>
        <textarea
          id="snippet-body"
          className="input mono"
          rows={8}
          spellCheck={false}
          maxLength={SNIPPET_BODY_MAX}
          value={editing.body}
          onChange={(e) => setEditing({ ...editing, body: e.target.value })}
        />
        <div className="field-hint">
          <code>{'${1:text}'}</code> is the first place Tab goes to, with text in it to type over; <code>{'${2}'}</code> the next, empty; <code>{'${0}'}</code> where the cursor ends. The same number
          twice is filled in twice.
        </div>
        {why && <div className="field-hint error" role="alert">{why}</div>}
      </div>
      <div className="row">
        <span className="grow" />
        <button className="btn small" onClick={() => setEditing(null)}>Cancel</button>
        <button className="btn small primary" disabled={!editing.name.trim() || !editing.body || !editing.kinds.length || !!why} onClick={save}>
          {creating ? 'Create' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="field-hint section-hint">
        Type a snippet’s trigger at the start of a word and press Tab, or pick it from Insert (+). Tab then goes from one place to fill in to the next. Snippets follow you to your other computers with your settings.
      </div>
      <div className="kv-list">
        {settings.snippets.map((s) =>
          editing?.id === s.id ? (
            form
          ) : (
            <div key={s.id} className="kv-row persona-row">
              <span className="persona-text">
                <span>
                  {s.name}
                  {s.trigger && <code className="snippet-trigger">{s.trigger}</code>}
                </span>
                <span className="field-hint">{kindNames(s)}</span>
              </span>
              <button className="icon-btn small" title="Edit" aria-label={`Edit ${s.name}`} disabled={!!editing} onClick={() => setEditing(s)}>
                <Icon name="pencil" />
              </button>
              <button className="icon-btn small" title="Delete" aria-label={`Delete ${s.name}`} disabled={!!editing} onClick={() => remove(s)}>
                <Icon name="trash" />
              </button>
            </div>
          )
        )}
        {creating && form}
        {!settings.snippets.length && !creating && (
          <div className="kv-row">
            <span>No snippets. Reset to defaults puts the starters back.</span>
          </div>
        )}
      </div>
      <div className="row">
        <button className="btn small" disabled={!!editing} onClick={() => setEditing({ id: crypto.randomUUID(), name: '', trigger: '', kinds: ['latex'], body: '' })}>
          <Icon name="plus" /> Create snippet
        </button>
        <button className="btn small" disabled={!!editing} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </>
  );
}
