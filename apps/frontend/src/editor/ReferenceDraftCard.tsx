import { useEffect, useId, useState } from 'react';
import { ENTRY_TYPES, FIELD_HINTS, FIELD_LABELS, applyEdition, draftProblems, editionLabel, fieldsShown, formatEntry, hasProblems, suggestKey } from '../../../backend/src/services/bibEntry.js';
import type { Edition } from '../../../backend/src/services/bibEntry.js';
import { bookEditions } from '../api/client';
import type { ReferenceDraft, ReferenceResult } from '../api/client';
import Icon from '../app/Icon';
import Select from '../app/Select';
import { LOCATOR_KINDS } from './shared';
import type { Locator, LocatorKind } from './shared';

// fields given the card's whole width; the rest go two to a row
const WIDE = new Set(['title', 'author', 'editor', 'booktitle', 'journal', 'url', 'note', 'howpublished']);

/**
 * The boxes the card shows for a draft, in order: its key and its year (a web page's date) on the first row, then the
 * title and authors, then the rest of the type's fields and any other the entry holds (bibEntry.js fieldsShown).
 */
export function cardFields(draft: ReferenceDraft) {
  const shown = fieldsShown(draft.type, draft.fields);
  const when = shown.includes('date') && !shown.includes('year') ? 'date' : 'year';
  const order = [when, 'title', 'author', ...shown.filter((f) => ![when, 'title', 'author'].includes(f))];
  return order.filter((name, i) => order.indexOf(name) === i && (shown.includes(name) || name === when || name === 'title'))
    .map((name) => ({ name, label: name === 'author' ? 'Authors (separated by “and”)' : FIELD_LABELS[name] || name, wide: WIDE.has(name), hint: FIELD_HINTS[name] || '' }));
}

/** Where a draft came from, as the card's badge says it: tone 'success' when a source had it, 'warning' when none did */
export function sourceBadge(r: Pick<ReferenceResult, 'source' | 'verified'>) {
  if (r.source === 'manual') return { text: 'New entry', tone: 'accent' };
  if (r.verified === false) return { text: 'Not found online · kept as pasted', tone: 'warning' };
  if (!r.source) return null;
  return { text: /^the /.test(r.source) ? `From ${r.source}` : `Found on ${r.source}`, tone: 'success' };
}

/**
 * A reference to check before it goes in the .bib: its entry type, key and fields, a locator for the citation, and the
 * entry as it will be written. Add writes it; Add & Insert also cites it at the cursor.
 */
export default function ReferenceDraftCard({
  result,
  bibFile,
  biblatex,
  legacyUrls,
  keys,
  busy,
  cite,
  onAdd
}: {
  result: ReferenceResult;
  bibFile: string;
  biblatex: boolean;
  legacyUrls: boolean;
  /** the project's keys, lower-cased; empty when not known (a draft reopened from the history) */
  keys: Set<string>;
  busy: boolean;
  /** the citation of key as the open document writes it */
  cite: (key: string, locator: Locator | null) => Promise<string>;
  /** insert: whether to cite it at the cursor too, with the locator */
  onAdd: (draft: ReferenceDraft, insert: { locator: Locator | null } | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ReferenceDraft>(() => result.draft || { type: 'article', key: '', fields: {} });
  const [kind, setKind] = useState<LocatorKind | ''>('');
  const [where, setWhere] = useState('');
  const [citation, setCitation] = useState('');
  const key = draft.key || suggestKey(draft.fields);
  const locator = kind ? { kind, value: where } : null;
  const problems = draftProblems(draft, keys);
  const known = ENTRY_TYPES.some((t) => t.id === draft.type);
  // a book found by its title: the work's editions, to choose the one cited
  const [editions, setEditions] = useState<Edition[]>([]);
  useEffect(() => {
    if (!result.work) return;
    let live = true;
    const author = String(draft.fields.author || '').split(/\s+and\s+/)[0].split(',')[0];
    bookEditions({ work: result.work, title: result.title || draft.fields.title, author }).then((res) => live && setEditions(res.editions || []), () => undefined);
    return () => {
      live = false;
    };
  }, [result.work]);

  useEffect(() => {
    let live = true;
    void cite(key, locator).then((text) => live && setCitation(text), () => undefined);
    return () => {
      live = false;
    };
  }, [key, kind, where]);

  const setField = (name: string, value: string) => setDraft((d) => ({ ...d, fields: { ...d.fields, [name]: value } }));
  const problem = (text?: string) => text && <span className="dc-problem">{text}</span>;

  return (
    <div className="draft-card">
      <div className="dc-bar">
        <span className="dc-label">Entry type{biblatex ? ' (Biber)' : ''}:</span>
        <div className="dc-type-pills" role="radiogroup" aria-label="Entry type">
          {[...(known ? [] : [{ id: draft.type, label: draft.type }]), ...ENTRY_TYPES].map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={draft.type === t.id}
              title={t.label}
              className={`dc-type ${draft.type === t.id ? 'active' : ''}`}
              onClick={() => setDraft((d) => ({ ...d, type: t.id }))}
            >
              @{t.id}
            </button>
          ))}
        </div>
      </div>

      <div className="dc-grid">
        {editions.length > 1 && (
          <div className="dc-field full">
            <span id={`${id}-ed`}>Edition ({editions.length} found)</span>
            <Select
              labelId={`${id}-ed`}
              className="dc-edition"
              value={draft.fields.isbn || ''}
              placeholder="Choose the edition you cite"
              options={editions.map((e): [string, string] => [e.isbn, editionLabel(e)])}
              onChange={(isbn) => setDraft((d) => applyEdition(d, editions.find((e) => e.isbn === isbn)!))}
            />
          </div>
        )}
        <label className="dc-field">
          <span>Cite key</span>
          <input value={draft.key} placeholder={suggestKey(draft.fields)} spellCheck={false} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.trim() }))} />
          {problem(problems.key)}
        </label>
        {cardFields(draft).map((f) => (
          <label key={f.name} className={`dc-field ${f.wide ? 'full' : ''}`}>
            <span>{f.label}</span>
            <input value={draft.fields[f.name] || ''} placeholder={f.hint} spellCheck={f.name === 'title' || f.name === 'note'} onChange={(e) => setField(f.name, e.target.value)} />
            {problem(problems.fields[f.name])}
          </label>
        ))}
      </div>

      <div className="loc-bar">
        <span className="dc-label" id={`${id}-loc`}>Cite locator:</span>
        <Select labelId={`${id}-loc`} className="loc-kind" value={kind} options={LOCATOR_KINDS} onChange={(v) => setKind(v as LocatorKind | '')} />
        {kind && <input className="loc-value" value={where} aria-label="Where in the work" placeholder={kind === 'pages' ? '42--45' : kind === 'section' ? '3.2' : '42'} onChange={(e) => setWhere(e.target.value)} />}
        {citation && <code className="loc-preview">{citation}</code>}
      </div>

      <pre className="bib-preview" aria-label="The entry as it will be written">{formatEntry({ ...draft, key }, { biblatex, legacyUrls })}</pre>

      <div className="dc-actions">
        <span className="dc-target">
          Target: <code>{bibFile}</code> · {biblatex ? 'Biber' : 'BibTeX'} mode
        </span>
        <div className="dc-buttons">
          <button className="btn small outline" disabled={busy || hasProblems(problems)} onClick={() => onAdd({ ...draft, key }, null)}>
            Add to .bib only
          </button>
          <button className="btn small primary" disabled={busy || hasProblems(problems)} onClick={() => onAdd({ ...draft, key }, { locator })}>
            <Icon name="checkmark" /> Add &amp; insert citation
          </button>
        </div>
      </div>
    </div>
  );
}
