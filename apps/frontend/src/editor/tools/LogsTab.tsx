import { useEffect, useState } from 'react';
import Icon from '../../app/Icon';
import { useEditor } from '../EditorContext';
import type { CompileError } from '../EditorContext';
import { Markdown, fixWithAI } from '../shared';

export default function LogsTab() {
  const api = useEditor();
  const { compileLog, compileErrors } = api;
  const [listOpen, setListOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  // replies belong to the log they were asked about
  useEffect(() => setNotes({}), [compileLog]);

  const errorCount = compileErrors.filter((e) => e.severity === 'error').length;
  const warningCount = compileErrors.length - errorCount;

  const fix = async (key: number | 'all', error?: CompileError) => {
    setBusy(key);
    const where = error ? [error.file, error.line && `line ${error.line}`].filter(Boolean).join(', ') : '';
    // "Fix all" goes after the errors; the warnings only when the build has none
    const prompt = error
      ? `Fix this LaTeX ${error.severity}: ${error.message}${where ? ` (${where})` : ''}. Propose a patch that can be applied.`
      : errorCount
        ? 'Diagnose the errors in the compile log and fix them. Ignore warnings. Propose patches that can be applied.'
        : 'Fix the warnings in the compile log (overfull/underfull boxes, undefined references and citations). Propose patches that can be applied.';
    const reply = await fixWithAI(api, { task: 'debug_compile', prompt, selection: error?.raw, file: error?.file, label: error ? 'Fix with AI' : 'Fix all with AI' });
    if (reply) setNotes((prev) => ({ ...prev, [key]: reply }));
    setBusy(null);
  };

  if (!compileLog) return <div className="tool-empty">Compile the project to see its log here.</div>;

  return (
    <div className="tool-page">
      <div className="tool-page-head">
        <button className="disclosure-head" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
          <h2>Warnings and errors</h2>
          <Icon name={listOpen ? 'chevron.down' : 'chevron.right'} />
        </button>
        {compileErrors.length > 0 && (
          <span className="log-counts">
            {errorCount} {errorCount === 1 ? 'error' : 'errors'} · {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
          </span>
        )}
        {compileErrors.length > 0 && (
          <button className="btn small" disabled={busy !== null} onClick={() => fix('all')}>
            {busy === 'all' ? <span className="spinner" /> : <Icon name="sparkles" />} Fix all with AI
          </button>
        )}
      </div>
      {notes.all && (
        <div className="log-card note">
          <Markdown>{notes.all}</Markdown>
        </div>
      )}
      {listOpen && !compileErrors.length && <div className="tool-empty">No warnings or errors</div>}
      {listOpen &&
        compileErrors.map((error, idx) => (
          <div key={`${idx}-${error.message}`} className={`log-card ${error.severity}`}>
            <div className="log-card-row">
              <Icon name={error.severity === 'error' ? 'xmark.octagon.fill' : 'exclamationmark.triangle.fill'} className="log-icon" />
              <div className="log-card-body">
                <div className="log-message">{error.message}</div>
                {error.line !== undefined &&
                  (error.file ? (
                    <button className="log-location" onClick={() => api.jumpTo(error.file!, error.line!)}>
                      {error.file}:{error.line}
                    </button>
                  ) : (
                    // the log doesn't say which file: a guess would jump to the wrong place
                    <span className="log-location">line {error.line}</span>
                  ))}
              </div>
              <button className="btn small" disabled={busy !== null} onClick={() => fix(idx, error)}>
                {busy === idx && <span className="spinner" />} Fix with AI
              </button>
            </div>
            {notes[idx] && <Markdown>{notes[idx]}</Markdown>}
          </div>
        ))}
      <button className="disclosure-head log-raw-head" aria-expanded={logOpen} onClick={() => setLogOpen((v) => !v)}>
        <h3>Full log</h3>
        <Icon name={logOpen ? 'chevron.down' : 'chevron.right'} />
      </button>
      {logOpen && <pre className="log-raw">{compileLog}</pre>}
    </div>
  );
}
