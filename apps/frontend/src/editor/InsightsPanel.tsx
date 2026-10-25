import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getFile, getProjectStats } from '../api/client';
import type { ProjectStats } from '../api/client';
import Icon from '../app/Icon';
import Tabs from '../app/Tabs';
import { useEditor } from './EditorContext';
import { headingNumbers, inReading, metadataText, scanInsights, texlabNotes, withNumbers } from './insights';
import type { InsightRow, Insights } from './insights';
import { scanProject } from './latexEnvs';
import { scanTodos } from './todos';
import { errorText } from './shared';

type Tab = 'overview' | 'headings' | 'figures' | 'tables' | 'equations' | 'labels' | 'citations' | 'todos';
type Scan = Insights & { todos: ReturnType<typeof scanTodos> };
type Notes = ReturnType<typeof texlabNotes>;

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);
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
  // TexLab's word on the labels and citations, when it runs
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Refresh asks again
  const [asked, setAsked] = useState(0);
  // the files that aren't open, from disk once per opening, Refresh, compile or file switch (the open one is live)
  const disk = useRef(new Map<string, string>());

  useEffect(() => disk.current.clear(), [active, asked, api.projectId, api.compileLog, api.activePath]);

  useEffect(() => {
    if (!active || !doc) return;
    let live = true;
    const read = async (path: string) => {
      if (path === api.activePath) return api.editorValue;
      const text = disk.current.get(path) ?? (await getFile(api.projectId, path)).content;
      disk.current.set(path, text);
      return text;
    };
    const typst = /\.typ$/i.test(doc);
    const markdown = /\.(md|markdown)$/i.test(doc);
    const timer = window.setTimeout(async () => {
      // Typst's #include chain and Markdown's one file: no LaTeX scan, and TexLab has nothing to say about either
      if (typst || markdown) {
        const paths = typst ? api.projectFiles.filter((path) => /\.typ$/i.test(path)) : [doc];
        const files = await Promise.all(paths.map(async (path) => ({ path, text: await read(path).catch(() => '') })));
        const todos = scanTodos(files);
        if (live) {
          setScan({ ...scanInsights(files, doc), todos });
          setNotes(null);
        }
        return;
      }
      const { scans } = await scanProject(doc, new Set(api.texFiles), read, false);
      const files = await Promise.all(scans.map(async (s) => ({ path: s.file!, text: await read(s.file!).catch(() => '') })));
      // in reading order, as the other lists are
      const todos = scanTodos(files);
      inReading(doc, files, todos);
      if (live) setScan({ ...scanInsights(files, doc), todos });
      const found = await api.diagnostics().catch(() => null);
      if (live) setNotes(found?.available ? texlabNotes(found.files, files) : null);
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [active, doc, asked, api.projectId, api.activePath, api.compileLog, api.editorValue, api.texFiles]);

  // word counts, numbers and pages: again after each compile
  useEffect(() => {
    if (!active || !doc) return;
    // ponytail: Markdown gets no word counts or page numbers, since pandoc's generated LaTeX is not the document
    if (/\.(md|markdown)$/i.test(doc)) {
      setStats(null);
      setBusy(false);
      return;
    }
    let live = true;
    setBusy(true);
    getProjectStats(api.projectId, doc, api.settings.texFolder || undefined)
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
  }, [active, doc, asked, api.projectId, api.compileLog, api.settings.texFolder]);

  const labels = stats?.labels ?? {};
  // a heading without a \label of its own gets its number and page from the contents' entries
  const tocAt = useMemo(() => headingNumbers(scan?.headings ?? [], stats?.headings ?? []), [scan, stats]);
  const count = (key: Exclude<Tab, 'overview'>) => scan?.[key].length ?? 0;
  const text = (tex: string) => withNumbers(tex, labels);

  // a strip too narrow for all eight scrolls; keep the chosen tab in view, as Tools does
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    headRef.current?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const copyMetadata = async () => {
    if (!scan) return;
    try {
      await navigator.clipboard.writeText(metadataText(scan.metadata, labels));
      api.notify('Copied the submission metadata.', 'success');
    } catch (err) {
      api.notify(`Couldn’t copy the metadata: ${errorText(err)}`, 'error');
    }
  };

  const unused = [...(notes?.labels.values() ?? [])].filter((flag) => flag === 'Unused').length;
  const problems = (
    [
      [notes?.unresolved ?? 0, 'reference', 'to no label'],
      [notes?.missing.size ?? 0, 'citation', 'not in the .bib'],
      [notes?.twice.size ?? 0, 'label', 'defined more than once'],
      [unused, 'label', 'never referred to']
    ] as [number, string, string][]
  )
    .filter(([n]) => n)
    .map(([n, word, what]) => `${plural(n, word)} ${what}`);

  const minLevel = Math.min(...(scan?.headings.map((h) => h.level ?? 0) ?? []), 9);
  const rows = (list: InsightRow[]) =>
    list.map((row, i) => {
      const at = (row.label ? labels[row.label] : undefined) ?? tocAt.get(row);
      const flag = tab === 'labels' && notes?.labels.get(`${row.file}:${row.line}`);
      return (
        <button
          key={`${row.file}:${row.line}:${i}`}
          className="insight-row"
          style={row.level !== undefined ? { paddingLeft: 10 + Math.max(0, row.level - minLevel) * 14 } : undefined}
          title={`${row.file}, line ${row.line}`}
          onClick={() => api.jumpTo(row.file, row.line)}
        >
          {at?.number && <span className="insight-number">{at.number}</span>}
          <span className="insight-text">{text(row.text) || <em>No caption</em>}</span>
          {row.label && tab !== 'labels' && <span className="insight-label">{row.label}</span>}
          {flag && <span className="badge warning">{flag}</span>}
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
        ['Title', text(meta.title)],
        ['Authors', text(meta.authors.join('; '))],
        ['Keywords', text(meta.keywords.join('; '))],
        ['Date', text(meta.date)]
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
          {problems.length > 0 && <div className="tool-footnote">TexLab finds {listed(problems)}.</div>}
          {/\.tex$/i.test(doc) ? (
            <>
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
            </>
          ) : (
            <div className="tool-footnote">Word counts come from texcount, so they are for LaTeX documents.</div>
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
          <div className="insight-abstract">{text(meta.abstract) || 'No abstract yet'}</div>
        </>
      );
    }
    if (!count(tab)) return <div className="tool-empty">{EMPTY[tab]}</div>;
    if (tab === 'citations')
      return scan.citations.map((c) => (
        <button key={c.key} className="insight-row" title={`First cited in ${c.file}, line ${c.line}`} onClick={() => api.jumpTo(c.file, c.line)}>
          <span className="insight-text">{c.key}</span>
          {notes?.missing.has(c.key) && <span className="badge warning">Not in the .bib</span>}
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
      <div className="tools-head" ref={headRef}>
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
          {stats?.auxAt === null ? 'Compile to see numbers and pages.' : 'Numbers and pages come from the last compile.'}
          {stats?.auxAt != null && stats.stale && ' The source has changed since.'}
        </span>
        <button className="btn small" disabled={busy} onClick={() => setAsked((n) => n + 1)}>
          {busy ? <span className="spinner" /> : <Icon name="arrow.clockwise" />} Refresh
        </button>
      </div>
    </div>
  );
}
