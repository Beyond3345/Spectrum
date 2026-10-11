import { useCallback, useEffect, useState } from 'react';
import { getProjectStats } from '../../api/client';
import type { ProjectStats } from '../../api/client';
import Icon from '../../app/Icon';
import { useEditor } from '../EditorContext';
import { errorText } from '../shared';

const num = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-AU') : '—');

export default function ProjectInfoTab({ active }: { active: boolean }) {
  const { projectId, mainFile, pdfPages } = useEditor();
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!mainFile) return;
    setBusy(true);
    setError('');
    try {
      const res = await getProjectStats(projectId, mainFile);
      if (!res.ok) throw new Error(res.error || 'Counting failed.');
      setStats(res);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }, [projectId, mainFile]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const cards: [string, number | null | undefined][] = [
    ['Words', stats?.words],
    ['Words in text', stats?.wordsInText],
    ['Words in headings', stats?.wordsInHeaders],
    ['Words outside text', stats?.wordsOutsideText],
    ['Headings', stats?.headers],
    ['Figures & tables', stats?.floats],
    ['Inline maths', stats?.mathInline],
    ['Displayed maths', stats?.mathDisplay],
    ['Pages', pdfPages]
  ];

  return (
    <div className="tool-page">
      <div className="tool-page-head">
        <h2>Summary</h2>
        <button className="icon-btn" title="Count again" aria-label="Count again" onClick={load} disabled={busy || !mainFile}>
          {busy ? <span className="spinner" /> : <Icon name="arrow.clockwise" />}
        </button>
      </div>
      {!mainFile && <div className="tool-empty">Set a main .tex file to see word counts.</div>}
      {error && <div className="tool-note error">{error}</div>}
      <div className="stat-grid">
        {cards.map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{num(value)}</div>
          </div>
        ))}
      </div>
      {stats && (
        <div className="tool-footnote">
          {stats.source === 'texcount' ? `Counted with texcount from ${mainFile}.` : 'Estimated — install MacTeX for exact counts with texcount.'}
        </div>
      )}
    </div>
  );
}
