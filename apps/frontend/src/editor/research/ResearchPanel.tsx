import { useEffect, useRef, useState } from 'react';
import { addResearchResults, deleteResearch, getResearch, listResearch, researchNote, researchPdf, searchResearch, updateResearch } from '../../api/client';
import type { ResearchChange, ResearchResult, ResearchSession, ResearchSource, ResearchSummary } from '../../api/client';
import { confirmDialog } from '../../app/Dialogs';
import Icon from '../../app/Icon';
import { MenuButton } from '../../app/Menu';
import { researchKeysFor, searchConfigFor } from '../../app/settings';
import { useEditor } from '../EditorContext';
import type { TaskRequest } from '../agent/parts';
import { PROJECT_DATA_CHANGED, citationText, errorText, formatDate, isDocument, relativeTime } from '../shared';
import CitationAssistant, { bibWritten } from './CitationAssistant';
import { DEFAULT_SOURCES, SOURCES, badges, counts, filtersLine, keptToAdd, linkOf, metaLine, runLine, searched, shown, yearOf } from './results';
import type { Show } from './results';

export type ResearchTask = Omit<TaskRequest, 'n'>;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // only the remembered choice is lost
  }
};
const savedSources = (): ResearchSource[] => {
  try {
    const list = JSON.parse(read('spectrum-research-sources') || 'null');
    const known = Array.isArray(list) ? list.filter((s) => SOURCES.some(([id]) => id === s)) : [];
    return known.length ? known : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
};
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// the agent tasks: prompts for the workspace, each with a skill (and a persona for the review)
const deepResearch = (question: string): ResearchTask => ({
  skill: 'literature-review',
  prompt: `Carry on the research session sent with this message, on “${question}”. Search further with other phrasings, and follow the references and citations of the papers kept so far through Semantic Scholar. Read the open-access full text where there is some (arXiv or Unpaywall). Write research/notes/<key>.md for each paper you read, saying where each point came from, and research/reading-list.md grouped by theme. Propose .bib entries for the papers worth citing, checked against the project’s .bib so none is added twice.`
});
const relatedWork = (session: ResearchSession | null): ResearchTask => ({
  skill: 'spectrum-related-work',
  prompt: session
    ? `Draft or improve the related work section from the papers kept in the research session sent with this message, on “${session.question}”. Group them by theme, cite only keys in the project’s .bib (propose entries for kept papers that aren’t there yet) and show where this project’s contribution fits.`
    : 'Draft or improve the related work section from the project’s .bib. Group prior work by theme, cite only keys that are in the .bib (propose entries for anything missing) and show where this project’s contribution fits.'
});
const verifyClaims = (session: ResearchSession | null): ResearchTask => ({
  skill: 'spectrum-verify-claims',
  persona: 'critical-reviewer',
  prompt: `Check the claims in the open file (when it is the main document, in the files it brings in with \\input or \\include, in reading order) against the sources they cite${session ? ', using the research session sent with this message for what the papers say' : ''}. For each claim give its file and line, say whether its source supports it fully, partly or not at all, and add a short note on the evidence. Don’t rewrite the text.`
});

/**
 * Research in the sidebar: a question searched in the chosen sources at once into a session the project keeps,
 * each result kept or dropped with a reason, cited, added to the .bib, noted or fetched as a PDF; the citation
 * assistant; and the agent tasks, which open the workspace with the session. filter: the sidebar's search.
 */
export default function ResearchPanel({ filter, onAgentTask }: { filter: string; onAgentTask(task: ResearchTask): void }) {
  const api = useEditor();
  const latest = useRef(api);
  latest.current = api;
  const { projectId } = api;
  const [sessions, setSessions] = useState<ResearchSummary[] | null>(null);
  const [session, setSession] = useState<ResearchSession | null>(null);
  const [question, setQuestion] = useState('');
  const [sources, setSources] = useState<ResearchSource[]>(savedSources);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [preprints, setPreprints] = useState(true);
  const [triage, setTriage] = useState(() => read('spectrum-research-triage') === '1');
  const [show, setShow] = useState<Show>('all');
  // what's running: 'search', 'add', or a result's id and action
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  // a change's answer only shows while no later one was sent
  const changes = useRef(0);

  const refresh = () =>
    listResearch(projectId).then(
      (res) => setSessions(res.sessions),
      (err) => {
        setSessions((old) => old ?? []);
        latest.current.notify(`Couldn’t load the research sessions: ${errorText(err)}`, 'error');
      }
    );

  const openSession = async (id: string | null) => {
    setStatus('');
    setShow('all');
    write(`spectrum-research-open:${projectId}`, id);
    if (!id) {
      setSession(null);
      setQuestion('');
      return;
    }
    const res = await getResearch(projectId, id);
    setSession(res.session);
    setQuestion(res.session.question);
  };

  useEffect(() => {
    setSession(null);
    refresh();
    const id = read(`spectrum-research-open:${projectId}`);
    if (id) openSession(id).catch(() => write(`spectrum-research-open:${projectId}`, null));
  }, [projectId]);

  // a pull from GitHub brought sessions in, or changed the open one
  useEffect(() => {
    const onPull = () => {
      refresh();
      const id = read(`spectrum-research-open:${projectId}`);
      if (id) openSession(id).catch(() => undefined);
    };
    window.addEventListener(PROJECT_DATA_CHANGED, onPull);
    return () => window.removeEventListener(PROJECT_DATA_CHANGED, onPull);
  }, [projectId]);

  const toggleSource = (s: ResearchSource) => {
    const next = sources.includes(s) ? sources.filter((x) => x !== s) : SOURCES.map(([id]) => id).filter((id) => id === s || sources.includes(id));
    setSources(next);
    write('spectrum-research-sources', JSON.stringify(next));
  };

  const years = { yearFrom: yearOf(yearFrom), yearTo: yearOf(yearTo) };
  const badYears = (yearFrom.trim() && !years.yearFrom) || (yearTo.trim() && !years.yearTo) || (years.yearFrom && years.yearTo && years.yearFrom > years.yearTo);

  /** A search of the question, into the open session; the session it made or added to. */
  const search = async () => {
    const q = question.trim();
    if (!q || !sources.length || badYears || busy) return null;
    const a = latest.current;
    setBusy('search');
    setStatus('Searching…');
    try {
      const res = await searchResearch({
        projectId,
        question: q,
        sources,
        ...years,
        preprints,
        triage,
        sessionId: session?.id,
        keys: researchKeysFor(a.settings),
        searchConfig: searchConfigFor(a.settings, a.llm.search),
        llmConfig: a.llm.search
      });
      setSession(res.session);
      write(`spectrum-research-open:${projectId}`, res.session.id);
      const run = res.session.runs[res.session.runs.length - 1];
      const failed = Object.values(run.perSource).filter((s) => s?.error).length;
      setStatus(`${plural(res.session.results.length, 'result')} in this session.${failed ? ` ${plural(failed, 'source')} failed; see the search log.` : ''}`);
      refresh();
      return res.session;
    } catch (err) {
      setStatus(`Search failed: ${errorText(err)}`);
      return null;
    } finally {
      setBusy('');
    }
  };

  const change = async (results: ResearchChange[]) => {
    if (!session) return;
    const n = ++changes.current;
    // shown at once, saved field by field
    setSession((s) => s && { ...s, results: s.results.map((r) => ({ ...r, ...Object.fromEntries(Object.entries(results.find((c) => c.id === r.id) || {}).map(([k, v]) => [k, v ?? undefined])) })) });
    try {
      const res = await updateResearch(projectId, session.id, { results });
      if (n === changes.current) setSession(res.session);
      refresh();
    } catch (err) {
      latest.current.notify(`Couldn’t save the change: ${errorText(err)}`, 'error');
      if (n === changes.current) getResearch(projectId, session.id).then((res) => setSession(res.session), () => undefined);
    }
  };

  /** Adds results through the references resolver; the keys they're under, in order. */
  const add = async (resultIds?: string[]) => {
    if (!session) return [];
    const a = latest.current;
    const res = await addResearchResults(projectId, session.id, { resultIds, searchConfig: searchConfigFor(a.settings, a.llm.search) });
    setSession(res.session);
    if (res.results.some((r) => r.status === 'added')) await bibWritten(latest.current, res.bibFile);
    const added = res.results.filter((r) => r.status === 'added');
    const failed = res.results.filter((r) => !r.key);
    const title = (id: string) => `“${res.session.results.find((r) => r.id === id)?.title || id}”`;
    const notes = [
      added.length ? `Added ${added.map((r) => r.key).join(', ')} to ${res.bibFile}.` : '',
      failed.length ? `Couldn’t add ${failed.map((r) => `${title(r.id)}${r.message ? ` (${r.message})` : ''}`).join('; ')}.` : '',
      res.results.some((r) => r.key) && !res.bibIncluded ? `${res.bibFile} isn’t included in ${a.mainFile || 'the main file'} yet.` : ''
    ].filter(Boolean);
    if (notes.length) setStatus(notes.join(' '));
    return res.results.map((r) => r.key).filter((key): key is string => !!key);
  };

  const run = async (label: string, job: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await job();
    } catch (err) {
      setStatus(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const cite = (r: ResearchResult) =>
    run(`${r.id}:cite`, async () => {
      const a = latest.current;
      if (!isDocument(a.activePath)) throw new Error('Open a document and click where the citation goes, then try again.');
      // the key the .bib has it under now, which a rename or an edit elsewhere may have changed since the session came
      const fresh = session ? (await getResearch(projectId, session.id)).session : null;
      if (fresh) setSession(fresh);
      const known = (fresh?.results.find((x) => x.id === r.id) ?? r).inBib;
      const key = known || (await add([r.id]))[0];
      if (!key) return;
      // only where the user has put the cursor, in the document body: a file just opened has it before \documentclass
      const line = latest.current.insertAtCursor(await citationText(latest.current, [key]), { afterSelection: true, placedOnly: true });
      setStatus(line ? `Cited ${key} on line ${line}.` : `${known ? '' : `Added ${key} to the .bib. `}Click in the document body where the citation goes, then Cite again.`);
    });

  const note = (r: ResearchResult) =>
    run(`${r.id}:note`, async () => {
      if (!session) return;
      const res = await researchNote(projectId, session.id, r.id);
      if (res.created) await latest.current.refreshTree();
      await latest.current.openFile(res.path);
    });

  const pdf = (r: ResearchResult) =>
    run(`${r.id}:pdf`, async () => {
      if (!session) return;
      const res = await researchPdf(projectId, session.id, r.id, latest.current.settings.unpaywallEmail || undefined);
      if (!res.existing) await latest.current.refreshTree();
      setStatus(res.existing ? `${res.path} is already in the project.` : `Saved ${res.path}.`);
    });

  const remove = async (id: string, title: string) => {
    const ok = await confirmDialog({ title: `Delete “${title}”?`, message: 'The session’s searches and decisions are removed from this project. Notes, PDFs and .bib entries stay.', confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    try {
      await deleteResearch(projectId, id);
      if (session?.id === id) await openSession(null);
      refresh();
    } catch (err) {
      latest.current.notify(`Couldn’t delete the session: ${errorText(err)}`, 'error');
    }
  };

  // on the question asked, which a search into the open session doesn't make the session's own
  const deep = async () => {
    const q = question.trim();
    const s = session && searched(session, q) ? session : await search();
    if (s) onAgentTask({ ...deepResearch(q), research: s.id });
  };
  const task = (t: ResearchTask) => onAgentTask(session ? { ...t, research: session.id } : t);

  const needle = filter.trim().toLowerCase();
  const listed = (sessions || []).filter((s) => !needle || s.question.toLowerCase().includes(needle));
  const results = session ? shown(session.results, show, filter) : [];
  const tally = session ? counts(session.results) : null;
  const toAdd = session ? keptToAdd(session.results) : [];

  return (
    <div className="research">
      <form
        className="research-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <textarea
          className="input research-question"
          rows={2}
          maxLength={500}
          value={question}
          placeholder="What are you looking for?"
          aria-label="Research question"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void search();
            }
          }}
        />
        <div className="chip-row" role="group" aria-label="Sources">
          {SOURCES.map(([id, label]) => (
            <button key={id} type="button" className={`chip ${sources.includes(id) ? 'on' : ''}`} aria-pressed={sources.includes(id)} onClick={() => toggleSource(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="research-filters">
          <input className="input number" inputMode="numeric" maxLength={4} placeholder="From" aria-label="From year" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
          <span aria-hidden="true">–</span>
          <input className="input number" inputMode="numeric" maxLength={4} placeholder="To" aria-label="To year" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
          <label className="checkbox-row">
            <input type="checkbox" checked={preprints} onChange={(e) => setPreprints(e.target.checked)} /> Preprints
          </label>
        </div>
        <label className="checkbox-row" title="One AI call adds why each result matters, keep or drop and a theme">
          <input
            type="checkbox"
            checked={triage}
            onChange={(e) => {
              setTriage(e.target.checked);
              write('spectrum-research-triage', e.target.checked ? '1' : '0');
            }}
          />
          Sort the results with AI
        </label>
        {badYears && <div className="field-hint error">Type each year in full, the first no later than the second.</div>}
        <div className="research-buttons">
          <button type="submit" className="btn small primary" disabled={!!busy || !question.trim() || !sources.length || !!badYears}>
            {busy === 'search' ? <span className="spinner" /> : <Icon name="magnifyingglass" />} {session ? 'Search again' : 'Search'}
          </button>
          <button
            type="button"
            className="btn small"
            title="Opens the agent workspace with this session, to search wider, read the papers and write notes"
            disabled={!!busy || !question.trim() || !sources.length || !!badYears}
            onClick={() => void deep()}
          >
            <Icon name="sparkles" /> Deep research
          </button>
        </div>
        <div className="field-hint" role="status">
          {status}
        </div>
      </form>

      {session && tally ? (
        <div className="research-session">
          <div className="research-head">
            <button className="icon-btn small" title="All sessions" aria-label="All sessions" onClick={() => void openSession(null)}>
              <Icon name="chevron.left" />
            </button>
            <span className="research-head-title" title={session.question}>
              {session.question}
            </span>
            <MenuButton
              icon="ellipsis"
              className="icon-btn small"
              title="Session"
              align="end"
              items={[
                { label: 'Deep research', icon: 'sparkles', onSelect: () => onAgentTask({ ...deepResearch(session.question), research: session.id }) },
                { label: 'Draft related work', icon: 'text.book.closed', onSelect: () => task(relatedWork(session)) },
                { label: 'Verify claims', icon: 'checkmark.seal', onSelect: () => task(verifyClaims(session)) },
                { separator: true },
                { label: 'Delete session…', icon: 'trash', destructive: true, onSelect: () => void remove(session.id, session.question) }
              ]}
            />
          </div>
          <details className="research-log">
            <summary>
              {plural(session.runs.length, 'search', 'searches')}, last {relativeTime(session.updatedAt).toLowerCase()}
            </summary>
            {session.runs.map((r, i) => (
              <div key={i} className="research-log-run">
                <span>
                  {formatDate(r.at)}: “{r.queries.join('”, “')}”{filtersLine(r) && ` (${filtersLine(r)})`}
                </span>
                <span>{runLine(r)}</span>
              </div>
            ))}
          </details>
          <div className="segmented small" role="radiogroup" aria-label="Show">
            {(
              [
                ['all', 'All'],
                ['keep', 'Kept'],
                ['drop', 'Dropped'],
                ['undecided', 'To decide']
              ] as [Show, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={show === v} className={`segment ${show === v ? 'active' : ''}`} onClick={() => setShow(v)}>
                {label} {tally[v]}
              </button>
            ))}
          </div>
          {toAdd.length > 0 && (
            <button className="btn small full" disabled={!!busy} onClick={() => void run('add', () => add())}>
              {busy === 'add' ? <span className="spinner" /> : <Icon name="text.badge.plus" />} Add {plural(toAdd.length, 'kept paper')} to .bib
            </button>
          )}
          <div className="research-results" role="list" aria-label="Results">
            {results.map((r) => (
              <Result
                key={r.id}
                result={r}
                busy={busy}
                onDecide={(decision) => void change([{ id: r.id, decision: r.decision === decision ? null : decision }])}
                onReason={(reason) => reason !== (r.reason || '') && void change([{ id: r.id, reason: reason || null }])}
                onCite={() => void cite(r)}
                onNote={() => void note(r)}
                onPdf={() => void pdf(r)}
              />
            ))}
            {!results.length && <div className="sidebar-hint todo-empty">{session.results.length ? 'No matching results' : 'Nothing found. Try other words, or more sources.'}</div>}
          </div>
        </div>
      ) : (
        <>
          <CitationAssistant />
          {listed.length > 0 && (
            <div className="todo-group" role="list" aria-label="Sessions">
              <div className="todo-group-title">Sessions</div>
              {listed.map((s) => (
                <div
                  key={s.id}
                  role="listitem"
                  tabIndex={0}
                  className="chat-row"
                  title={s.question}
                  onClick={() => openSession(s.id).catch((err) => setStatus(errorText(err)))}
                  onKeyDown={(e) => e.key === 'Enter' && openSession(s.id).catch((err) => setStatus(errorText(err)))}
                >
                  <Icon name="books.vertical" className="chat-row-icon" />
                  <span className="chat-row-title">{s.question}</span>
                  <span className="chat-row-time">{s.kept ? `${s.kept} kept` : relativeTime(s.updatedAt)}</span>
                  <button
                    className="icon-btn chat-row-delete"
                    title="Delete session"
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(s.id, s.question);
                    }}
                  >
                    <Icon name="xmark" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {sessions && !listed.length && (
            <div className="sidebar-hint todo-empty">{needle ? 'No matching sessions' : 'Each question you search is kept here as a session, with its results and your decisions.'}</div>
          )}
          <div className="research-buttons">
            <button className="btn small" onClick={() => task(relatedWork(null))}>
              <Icon name="text.book.closed" /> Draft related work
            </button>
            <button className="btn small" onClick={() => task(verifyClaims(null))}>
              <Icon name="checkmark.seal" /> Verify claims
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Result({
  result: r,
  busy,
  onDecide,
  onReason,
  onCite,
  onNote,
  onPdf
}: {
  result: ResearchResult;
  busy: string;
  onDecide(decision: 'keep' | 'drop'): void;
  onReason(reason: string): void;
  onCite(): void;
  onNote(): void;
  onPdf(): void;
}) {
  const api = useEditor();
  const link = linkOf(r);
  const doing = (action: string) => busy === `${r.id}:${action}`;
  const action = (name: string, label: string, icon: string, onClick: () => void, disabled = false) => (
    <button className="icon-btn small" title={label} aria-label={`${label}: ${r.title}`} disabled={!!busy || disabled} onClick={onClick}>
      {doing(name) ? <span className="spinner" /> : <Icon name={icon} />}
    </button>
  );
  return (
    <div role="listitem" className={`research-row ${r.decision || ''}`}>
      {link ? (
        <a className="research-title" href={link} target="_blank" rel="noreferrer">
          {r.title}
        </a>
      ) : (
        <span className="research-title">{r.title}</span>
      )}
      {metaLine(r) && <div className="research-meta">{metaLine(r)}</div>}
      <div className="research-badges">
        {badges(r).map((b) => (
          <span key={b.label} className={`badge ${b.tone || ''}`} title={b.title}>
            {b.label}
          </span>
        ))}
      </div>
      {r.why && (
        <div className="research-why">
          {r.suggest && <strong>{r.suggest === 'keep' ? 'Keep' : 'Drop'}?</strong>} {r.why}
          {r.theme && <span className="research-theme"> · {r.theme}</span>}
        </div>
      )}
      {r.abstract && (
        <details className="research-abstract">
          <summary>Abstract</summary>
          <p>{r.abstract}</p>
        </details>
      )}
      {r.decision && (
        <input
          key={`${r.decision}:${r.reason || ''}`}
          className="input research-reason"
          maxLength={2000}
          defaultValue={r.reason}
          placeholder={r.decision === 'keep' ? 'Why keep it? (optional)' : 'Why drop it? (optional)'}
          aria-label={`Reason for ${r.decision === 'keep' ? 'keeping' : 'dropping'} ${r.title}`}
          onBlur={(e) => onReason(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}
      <div className="research-actions">
        <button className={`chip ${r.decision === 'keep' ? 'success' : ''}`} aria-pressed={r.decision === 'keep'} onClick={() => onDecide('keep')}>
          <Icon name="checkmark.circle" /> Keep
        </button>
        <button className={`chip ${r.decision === 'drop' ? 'active' : ''}`} aria-pressed={r.decision === 'drop'} onClick={() => onDecide('drop')}>
          <Icon name="minus.circle" /> Drop
        </button>
        <span className="grow" />
        {action('cite', r.inBib ? `Cite ${r.inBib} at the cursor` : 'Add to .bib and cite at the cursor', 'quote.opening', onCite, !isDocument(api.activePath))}
        {action('note', 'Open note', 'note.text', onNote)}
        {action('pdf', 'Get PDF', 'arrow.down.doc', onPdf)}
      </div>
    </div>
  );
}
