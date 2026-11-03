import { useEffect, useRef, useState } from 'react';
import { convertProject, watchCompile } from '../api/client';
import type { CompileEngine, ConvertChecks, ProjectMeta } from '../api/client';
import { errorText } from '../editor/shared';
import Sheet from './Sheet';
import { toast } from './Toast';

/** The checks as lines: what came through of the original, each counted in both. */
export function checkLines(checks: ConvertChecks) {
  const kept = (c: { source: number; kept: number }, what: string) => (c.source ? `${c.kept} of ${c.source} ${what} kept` : `No ${what}`);
  const floats = Object.entries(checks.floats).filter(([, f]) => f.source || f.output);
  return [
    checks.compiles ? 'It compiles.' : `It doesn’t compile yet: ${checks.diagnostics.find((d) => d.severity === 'error')?.message ?? 'see Logs'}.`,
    kept(checks.labels, 'labels'),
    kept(checks.references, 'references'),
    kept(checks.citations, 'citations'),
    `${checks.equations.source} numbered equation${checks.equations.source === 1 ? '' : 's'}${checks.equations.output === checks.equations.source ? '' : `, ${checks.equations.output ?? 'unknown'} after converting`}`,
    floats.length ? floats.map(([kind, f]) => (f.output === f.source ? `${f.source} ${kind}${f.source === 1 ? '' : 's'}` : `${kind}s: ${f.source} before, ${f.output ?? 'unknown'} after`)).join(', ') : 'No floats',
    `${Math.round(checks.words.coverage * 100)} per cent of the words`
  ];
}

/**
 * "Convert to Typst project…" and "Convert to LaTeX project…": what happens, then each step as it starts, then the
 * checks and the new project to open. Closing it while it runs lets the conversion finish, and a toast says so.
 */
export default function ConvertSheet({
  projectId,
  doc,
  to,
  engine,
  onClose,
  onOpen
}: {
  projectId: string;
  doc: string;
  to: 'typst' | 'latex';
  engine: CompileEngine;
  onClose: () => void;
  onOpen: (projectId: string) => void;
}) {
  const [steps, setSteps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ project: ProjectMeta; checks: ConvertChecks } | null>(null);
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);
  const [target, source] = to === 'typst' ? ['Typst', 'LaTeX'] : ['LaTeX', 'Typst'];

  const start = async () => {
    setRunning(true);
    setError('');
    const convertId = crypto.randomUUID();
    // Pictures (2 of 3) takes the place of Pictures (1 of 3)
    const stop = watchCompile(convertId, {
      engine: () => undefined,
      output: (text) => setSteps((was) => text.split('\n').filter(Boolean).reduce((list, step) => (list[list.length - 1]?.split(' (')[0] === step.split(' (')[0] ? [...list.slice(0, -1), step] : [...list, step]), was))
    });
    try {
      const res = await convertProject(projectId, { to, doc, engine, convertId });
      if (shown.current) setResult(res);
      else toast(`Made ${res.project.name}.`, { tone: 'success', action: { label: 'Open', onClick: () => onOpen(res.project.id) } });
    } catch (err) {
      if (shown.current) setError(errorText(err));
      else toast(`Couldn’t make a ${target} project: ${errorText(err)}`, { tone: 'error' });
    } finally {
      stop();
      if (shown.current) setRunning(false);
    }
  };

  return (
    <Sheet
      title={result ? `Made ${result.project.name}` : `Convert to a ${target} project?`}
      width={500}
      onClose={onClose}
      actions={
        result ? (
          <>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn primary" onClick={() => onOpen(result.project.id)}>Open new project</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>{running ? 'Close' : 'Cancel'}</button>
            <button className="btn primary" disabled={running} onClick={start}>
              {running ? <><span className="spinner" /> Converting…</> : 'Convert'}
            </button>
          </>
        )
      }
    >
      {!result && (
        <p className="field-hint">
          Spectrum makes a new {target} project from this {source}. This project stays as it is. Pictures are compiled to PDF with
          their source kept beside them, and conversion/notes.md in the new project lists anything to check.
          {to === 'latex' && ' The LaTeX is checked by compiling it with your LaTeX engine.'}
        </p>
      )}
      {steps.length > 0 && !result && (
        <div className="log-box" aria-live="polite">
          {steps.map((step, i) => <div key={step + i}>{i < steps.length - 1 || !running ? '✓ ' : '… '}{step}</div>)}
        </div>
      )}
      {result && (
        <>
          <div className="log-box">
            {checkLines(result.checks).map((line) => <div key={line}>{line}</div>)}
          </div>
          <p className="field-hint">
            {result.checks.ok ? 'Everything the original had came through.' : 'Some of the original did not come through.'} See conversion/notes.md in the new project
            for the pictures kept as PDF and what was approximated.
          </p>
        </>
      )}
      {error && <div className="field-hint error">{error}</div>}
    </Sheet>
  );
}
