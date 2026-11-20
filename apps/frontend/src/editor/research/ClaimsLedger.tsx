import { useEffect, useState } from 'react';
import { deleteClaim, listClaims } from '../../api/client';
import type { ClaimRow } from '../../api/client';
import Icon from '../../app/Icon';
import { useEditor } from '../EditorContext';
import type { TodosState } from '../TodosList';
import { PROJECT_DATA_CHANGED, errorText } from '../shared';
import { RATING, claimTodo, isLink, ledgerCounts, ledgerMarkdown, ordered, readLine } from './claims';

/**
 * Research’s claims ledger: what a claims check recorded, one row a claim, each with its rating and the evidence the
 * code found for it (the source’s words, the page or the abstract they were found in, a link to the source), a jump to
 * its line, and a to-do or a delete. The agent adds rows with record_claim; Refresh shows the ones it added since.
 */
export default function ClaimsLedger({ todos }: { todos?: TodosState }) {
  const api = useEditor();
  const { projectId } = api;
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [open, setOpen] = useState(false);
  const [worst, setWorst] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    listClaims(projectId).then(
      (res) => {
        setClaims(res.claims);
        setError('');
      },
      (err) => setError(`Couldn’t load the claims: ${errorText(err)}`)
    );
  useEffect(() => {
    void load();
    window.addEventListener(PROJECT_DATA_CHANGED, load);
    return () => window.removeEventListener(PROJECT_DATA_CHANGED, load);
  }, [projectId]);

  const remove = async (c: ClaimRow) => {
    setClaims((was) => was.filter((x) => x.id !== c.id));
    await deleteClaim(projectId, c.id).catch((err) => {
      api.notify(`Couldn’t delete the claim: ${errorText(err)}`, 'error');
      void load();
    });
  };
  const copy = () =>
    navigator.clipboard.writeText(ledgerMarkdown(claims)).then(
      () => api.notify('Copied the claims as a table', 'success'),
      (err) => api.notify(`Couldn’t copy the claims: ${errorText(err)}`, 'error')
    );

  if (!claims.length && !error) return null;
  return (
    <div className="todo-group claims-ledger">
      <div className="claims-head">
        <button className="disclosure-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="todo-group-title">Claims checked</span>
          <Icon name={open ? 'chevron.down' : 'chevron.right'} />
        </button>
        <span className="grow" />
        <button className="icon-btn small" title="Refresh" aria-label="Refresh the claims" onClick={() => void load()}>
          <Icon name="arrow.clockwise" />
        </button>
      </div>
      {error && <div className="field-hint error">{error}</div>}
      {claims.length > 0 && <div className="field-hint">{ledgerCounts(claims).join(' · ')}</div>}
      {open && claims.length > 0 && (
        <>
          <div className="claims-tools">
            <label className="checkbox-row">
              <input type="checkbox" checked={worst} onChange={(e) => setWorst(e.target.checked)} /> Problems first
            </label>
            <span className="grow" />
            <button className="btn small" onClick={() => void copy()}>
              <Icon name="doc.on.doc" /> Copy as table
            </button>
          </div>
          <div role="list" aria-label="Claims">
            {ordered(claims, worst).map((c) => (
              <div key={c.id} role="listitem" className="research-row claim-row">
                <div className="research-badges">
                  <span className={`badge ${RATING[c.rating].tone}`}>{RATING[c.rating].label}</span>
                  {c.keys.map((k) => (
                    <span key={k} className="badge">
                      {k}
                    </span>
                  ))}
                </div>
                <div className="claim-text">{c.text}</div>
                {c.quote && <blockquote className="claim-quote">“{c.quote}”</blockquote>}
                {c.note && <div className="research-meta">{c.note}</div>}
                <div className="research-actions">
                  <button className="log-location" title="Show the claim in the source" onClick={() => api.jumpTo(c.file, c.line)}>
                    {c.file}:{c.line}
                  </button>
                  {c.read &&
                    (isLink(c.read.where) ? (
                      <a className="log-location" href={c.read.where} target="_blank" rel="noreferrer" title={c.read.where}>
                        {readLine(c.read)}
                      </a>
                    ) : (
                      <button className="log-location" title={c.read.where} onClick={() => void api.openFile(c.read!.where)}>
                        {readLine(c.read)}
                      </button>
                    ))}
                  <span className="grow" />
                  {todos && (
                    <button className="icon-btn small" title="Add to-do" aria-label={`Add a to-do for ${c.file}:${c.line}`} onClick={() => void todos.add(claimTodo(c).text, claimTodo(c).link)}>
                      <Icon name="checklist" />
                    </button>
                  )}
                  <button className="icon-btn small" title="Delete" aria-label={`Delete the claim at ${c.file}:${c.line}`} onClick={() => void remove(c)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
