import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getFile, getProjectStats } from '../api/client';
import type { ProjectStats } from '../api/client';
import Icon from '../app/Icon';
import Tabs from '../app/Tabs';
import { useEditor } from './EditorContext';
import { metadataText, scanInsights } from './insights';
import type { InsightRow, Insights } from './insights';
import { scanProject } from './latexEnvs';
import { scanTodos } from './todos';
import { errorText } from './shared';

type Tab = 'overview' | 'headings' | 'figures' | 'tables' | 'equations' | 'labels' | 'citations' | 'todos';
type Scan = Insights & { todos: ReturnType<typeof scanTodos> };

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['headings', 'Headings'],
  ['figures', 'Figures'],
  ['tables', 'Tables'],
  ['equations', 'Equations'],
  ['labels', 'Labels'],
  ['citations', 'Citations'],
  ['todos', 'To-dos']
];

const EMPTY: Record<Exclude<Tab, 'overview'>, string> = {
  headings: 'No headings yet',
  figures: 'No figures yet',
  tables: 'No tables yet',
  equations: 'No numbered equations yet',
  labels: 'No labels yet',
  citations: 'Nothing cited yet',
  todos: 'No to-dos in the source'
};

const num = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-AU') : '—');

/**
 * Document insights, in the PDF's place: what the document and the files it pulls in hold, with the numbers and
 * pages its last compile gave each label. The source is read again a moment after each edit while the panel shows.
 */
export default function InsightsPanel({ doc, active, trailing }: { doc: string; active: boolean; trailing?: ReactNode }) {
  const api = useEditor();
  const [tab, setTab] = useState<Tab>('overview');
  const [scan, setScan] = useState<Scan | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Refresh asks again
  const [asked, setAsked] = useState(0);
  // the files that aren't open, from disk once per opening, Refresh, compile or file switch (the open one is live)
  const disk = useRef(new Map<string, string>());

  useEffect(() => disk.current.clear(), [active, asked, api.compileLog, api.activePath]);

  useEffect(() => {
    if (!active || !doc) return;
    let live = true;
    const read = async (path: string) => {
      if (path === api.activePath) return api.editorValue;
      const text = disk.current.get(path) ?? (await getFile(api.projectId, path)).content;
      disk.current.set(path, text);
      return text;
    };
    const timer = window.setTimeout(async () => {
      const { scans } = await scanProject(doc, new Set(api.texFiles), read, false);
      const files = await Promise.all(scans.map(async (s) => ({ path: s.file!, text: await read(s.file!).catch(() => '') })));
      if (live) setScan({ ...scanInsights(files), todos: scanTodos(files) });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [active, doc, asked, api.editorValue, api.texFiles]);

  // word counts, numbers and pages: again after each compile
  useEffect(() => {
    if (!active || !doc) return;
    let live = true;
    setBusy(true);
    getProjectStats(api.projectId, doc)
      .then((res) => {
        if (!res.ok) throw new Error(res.error || 'Counting failed.');
        if (live) {
          setStats(res);
          setError('');
        }
      })
      .catch((err) => live && setError(errorText(err)))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [active, doc, asked, api.compileLog]);

  const labels = stats?.labels ?? {};
  const count = (key: Exclude<Tab, 'overview'>) => scan?.[key].length ?? 0;

  const copyMetadata = async () => {
    if (!scan) return;
    try {
      await navigator.clipboard.writeText(metadataText(scan.metadata));
      api.notify('Copied the submission metadata.', 'success');
    } catch (err) {
      api.notify(`Couldn’t copy the metadata: ${errorText(err)}`, 'error');
    }
  };

  const minLevel = Math.min(...(scan?.headings.map((h) => h.level ?? 0) ?? []), 9);
  const rows = (list: InsightRow[]) =>
    list.map((row, i) => {
      const at = row.label ? labels[row.label] : undefined;
      return (
        <button
          key={`${row.file}:${row.line}:${i}`}
          className="insight-row"
          style={row.level !== undefined ? { paddingLeft: 10 + Math.max(0, row.level - minLevel) * 14 } : undefined}
          title={`${row.file}, line ${row.line}`}
          onClick={() => api.jumpTo(row.file, row.line)}
        >
          {at?.number && <span className="insight-number">{at.number}</span>}
          <span className="insight-text">{row.text || <em>No caption</em>}</span>
          {row.label && tab !== 'labels' && <span className="insight-label">{row.label}</span>}
          {at?.page && <span className="insight-page">p. {at.page}</span>}
        </button>
      );
    });

  const body = () => {
    if (!scan) return <div className="tool-empty">{doc ? <span className="spinner" /> : 'Set a main .tex file to see its insights.'}</div>;
    if (tab === 'overview') {
      const cards: [string, number | null | undefined][] = [
        ['Headings', count('headings')],
        ['Figures', count('figures')],
        ['Tables', count('tables')],
        ['Equations', count('equations')],
        ['Labels', count('labels')],
        ['Citations', count('citations')],
        ['To-dos', count('todos')],
        ['Pages', api.pdfPages]
      ];
      const words: [string, number | null | undefined][] = [
        ['Words', stats?.words],
        ['Words in text', stats?.wordsInText],
        ['Words in headings', stats?.wordsInHeaders],
        ['Words outside text', stats?.wordsOutsideText],
        ['Inline maths', stats?.mathInline],
        ['Displayed maths', stats?.mathDisplay]
      ];
      const meta = scan.metadata;
      const details: [string, string][] = [
        ['Title', meta.title],
        ['Authors', meta.authors.join('; ')],
        ['Keywords', meta.keywords.join('; ')],
        ['Date', meta.date]
      ];
      return (
        <>
          <div className="stat-grid">
            {cards.map(([label, value]) => (
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div className="stat-value">{num(value)}</div>
              </div>
            ))}
          </div>
          <h3 className="form-section-title">Words</h3>
          {error && <div className="tool-note error">{error}</div>}
          <div className="stat-grid">
            {words.map(([label, value]) => (
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div className="stat-value">{busy && !stats ? '…' : num(value)}</div>
              </div>
            ))}
          </div>
          {stats && (
            <div className="tool-footnote">
              {stats.source === 'texcount' ? `Counted with texcount from ${doc}.` : 'Estimated — install MacTeX for exact counts with texcount.'}
            </div>
          )}
          <div className="tool-page-head">
            <h3 className="form-section-title">Submission metadata</h3>
            <button className="btn small" onClick={copyMetadata}>
              <Icon name="doc.on.doc" /> Copy submission metadata
            </button>
          </div>
          <div className="kv-list">
            {details.map(([label, value]) => (
              <div key={label} className="kv-row">
                <span>{label}</span>
                <span className="insight-meta">{value || '—'}</span>
              </div>
            ))}
          </div>
          <div className="insight-abstract">{meta.abstract || 'No abstract yet'}</div>
        </>
      );
    }
    if (!count(tab)) return <div className="tool-empty">{EMPTY[tab]}</div>;
    if (tab === 'citations')
      return scan.citations.map((c) => (
        <button key={c.key} className="insight-row" title={`First cited in ${c.file}, line ${c.line}`} onClick={() => api.jumpTo(c.file, c.line)}>
          <span className="insight-text">{c.key}</span>
          <span className="insight-page">{c.count === 1 ? 'once' : `${c.count} times`}</span>
        </button>
      ));
    if (tab === 'todos')
      return scan.todos.map((t, i) => (
        <button key={`${t.file}:${t.line}:${i}`} className="insight-row" title={`${t.file}, line ${t.line}`} onClick={() => api.jumpTo(t.file, t.line)}>
          <span className="insight-label">{t.kind}</span>
          <span className="insight-text">{t.text}</span>
        </button>
      ));
    return rows(scan[tab]);
  };

  return (
    <div className="tools-panel">
      <div className="tools-head">
        <Tabs
          className="tools-tabs"
          value={tab}
          onChange={setTab}
          items={TABS.map(([value, label]) => ({ value, label, badge: value === 'overview' || !scan ? undefined : count(value) }))}
        />
        {trailing}
      </div>
      <div className="tools-body">
        <div className={`tool-page ${tab === 'overview' ? '' : 'insight-list'}`}>{body()}</div>
      </div>
      <div className="insights-foot" role="status">
        <span className="grow">
          {stats?.auxAt === null ? 'Compile to see numbers and pages.' : 'Numbers and pages are from the last compile.'}
          {stats?.stale && ' The source has changed since.'}
        </span>
        <button className="btn small" disabled={busy} onClick={() => setAsked((n) => n + 1)}>
          {busy ? <span className="spinner" /> : <Icon name="arrow.clockwise" />} Refresh
        </button>
      </div>
    </div>
  );
}
