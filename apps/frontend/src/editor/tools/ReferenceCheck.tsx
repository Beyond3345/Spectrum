import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ReferenceCheckRow } from '../../api/client';
import Icon from '../../app/Icon';
import { SEVERITY, checkHead, dateWords } from './referenceWords';

const ICON = { error: 'xmark.octagon.fill', warning: 'exclamationmark.triangle.fill', info: 'info.circle' } as const;

/** A link out, to the record or the notice the check read. */
const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="log-location" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

/**
 * Review’s References exist: each entry the check could not find as it is, with the evidence: the record it read
 * and where, the fields that differ side by side, and the retraction notice. The found ones are a count to open.
 */
export default function ReferenceCheckRows({
  rows,
  onJump,
  actions,
  after
}: {
  rows: ReferenceCheckRow[];
  onJump(file: string, line: number): void;
  /** Fix with AI and Dismiss, for a row that has something to fix */
  actions(row: ReferenceCheckRow): ReactNode;
  /** what goes under a row: Fix with AI's answer */
  after(row: ReferenceCheckRow): ReactNode;
}) {
  const [showFound, setShowFound] = useState(false);
  const found = rows.filter((r) => r.status === 'found');
  const listed = [...rows.filter((r) => r.status !== 'found'), ...(showFound ? found : [])];
  return (
    <>
      {!rows.length && <div className="review-clear">The bibliography has no entries</div>}
      {listed.map((r) => (
        <div key={`${r.file}:${r.key}`} className={`log-card ${SEVERITY[r.status]}`}>
          <div className="log-card-row">
            <Icon name={r.status === 'found' ? 'checkmark.circle' : ICON[SEVERITY[r.status]]} className="log-icon" />
            <div className="log-card-body">
              <div className="log-message">{checkHead(r)}</div>
              {r.title && <div className="review-quote">{r.title}</div>}
              {r.differences && (
                <table className="refcheck-diff">
                  <thead>
                    <tr>
                      <th />
                      <th>In the .bib</th>
                      <th>In the record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.differences.map((d) => (
                      <tr key={d.field}>
                        <th>{d.field.charAt(0).toUpperCase() + d.field.slice(1)}</th>
                        <td>{d.bib || '—'}</td>
                        <td>{d.record || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {r.record && (
                <div className="review-suggestion">
                  Record: {r.record.title}
                  {r.record.authors.length > 0 && ` · ${r.record.authors.join(', ')}${r.record.authors.length >= 3 ? ' and others' : ''}`}
                  {r.record.year && ` · ${r.record.year}`}
                  {r.record.venue && ` · ${r.record.venue}`}
                </div>
              )}
              {r.retraction && (
                <div className="review-suggestion">
                  {r.retraction.label}
                  {r.retraction.date && ` of ${dateWords(r.retraction.date)}`}, from {r.retraction.from}
                </div>
              )}
              {r.notices?.map((n) => (
                <div key={n.url || n.label} className="review-suggestion">
                  {n.label}
                  {n.date && ` of ${dateWords(n.date)}`}
                  {n.url && (
                    <>
                      {' '}
                      <Out href={n.url}>Open the notice</Out>
                    </>
                  )}
                </div>
              ))}
              {r.note && <div className="review-suggestion">{r.note}</div>}
              <div className="review-links">
                <button className="log-location" onClick={() => onJump(r.file, r.line)}>
                  {r.file}:{r.line}
                </button>
                {r.read && <Out href={r.read.url}>{r.status === 'not-found' ? `Searched ${r.read.from}` : `Read at ${r.read.from}`}</Out>}
                {r.retraction?.url && r.retraction.url !== r.read?.url && <Out href={r.retraction.url}>Open the {r.retraction.label.toLowerCase()} notice</Out>}
              </div>
            </div>
            {r.status !== 'found' && actions(r)}
          </div>
          {after(r)}
        </div>
      ))}
      {found.length > 0 && (
        <button className="btn small review-restore" onClick={() => setShowFound((on) => !on)}>
          <Icon name={showFound ? 'chevron.up' : 'chevron.down'} /> {showFound ? 'Hide' : 'Show'} the {found.length === 1 ? 'entry' : `${found.length} entries`} found as {found.length === 1 ? 'it is' : 'they are'}
        </button>
      )}
    </>
  );
}
