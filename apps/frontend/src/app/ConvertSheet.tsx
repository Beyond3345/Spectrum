import { useEffect, useRef, useState } from 'react';
import { convertProject, installPandoc, watchCompile, writeFile } from '../api/client';
import type { CompileEngine, ConvertChecks, ConvertTidy, ProjectMeta } from '../api/client';
import ReviewChangesSheet from '../editor/ReviewChangesSheet';
import type { PendingChange } from '../editor/EditorContext';
import { errorText } from '../editor/shared';
import { llmConfigFor, useSettings } from './settings';
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

/** What the AI tidying did, in a line. */
export function tidyLine(tidy: ConvertTidy) {
  const done = tidy.regions.filter((r) => r.result === 'replaced').length;
  const asked = tidy.regions.length;
  return [
    `The AI model tidied ${done} of ${asked} flagged part${asked === 1 ? '' : 's'}`,
    asked - done ? `; ${asked - done} stay as converted, with a TODO comment` : '',
    tidy.left ? `, and ${tidy.left} more were left for another time` : '',
    '.',
    tidy.error ? ` It stopped: ${tidy.error}` : ''
  ].join('');
}

/**
 * "Convert to Typst project…" and "Convert to LaTeX project…": what happens, then each step as it starts, then the
 * checks and the new project to open. Closing it while it runs lets the conversion finish, and a toast says so. With a
 * model set up, the flagged parts can be tidied by it too (convertTidy.js), each edit checked before it is written, and
 * then reviewed here: Reject puts the converted text back.
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
  const [result, setResult] = useState<{ project: ProjectMeta; checks: ConvertChecks; regions: number; tidy?: ConvertTidy } | null>(null);
  const [settings] = useSettings();
  const model = llmConfigFor(settings, 'quick');
  // a local server on plain http, such as Ollama, takes no key
  const modelReady = !!model.apiKey || /^http:\/\//i.test(model.endpoint || '');
  const [tidy, setTidy] = useState(false);
  const [review, setReview] = useState<PendingChange[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  // the backend's message when there's no pandoc or it is too old; the sheet offers the download right here
  const needsPandoc = /needs pandoc|pandoc .* too old/i.test(error);
  const downloadPandoc = async () => {
    setDownloading(true);
    try {
      await installPandoc();
      setError('');
      toast('Downloaded pandoc. Convert again.', { tone: 'success' });
    } catch (err) {
      toast(`Couldn’t download pandoc: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setDownloading(false);
    }
  };
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
      const res = await convertProject(projectId, { to, doc, engine, convertId, ...(tidy && modelReady && { aiCleanup: true, llmConfig: model }) });
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

  const changes = result?.tidy?.changes ?? [];
  if (review && result) {
    // the edits are in the new project already: Accept keeps one, Reject writes the converted text back
    const done = (list: PendingChange[]) => {
      const left = (was: PendingChange[]) => was.filter((c) => !list.some((l) => l.filePath === c.filePath));
      setReview((was) => was && left(was));
      setResult((was) => (was?.tidy ? { ...was, tidy: { ...was.tidy, changes: left(was.tidy.changes) } } : was));
    };
    return (
      <ReviewChangesSheet
        changes={review.map((c) => ({ ...c, source: 'AI tidying' }))}
        onAccept={async (list) => done(list)}
        onReject={(list) => {
          Promise.all(list.map((c) => writeFile(result.project.id, c.filePath, c.original)))
            .then(() => {
              done(list);
              toast(list.length === 1 ? `Put back the converted ${list[0].filePath}` : `Put back ${list.length} converted files`, { tone: 'success' });
            })
            .catch((err) => toast(`Couldn’t put the converted text back: ${errorText(err)}`, { tone: 'error' }));
        }}
        onClose={() => setReview(null)}
      />
    );
  }

  return (
    <Sheet
      title={result ? `Made ${result.project.name}` : `Convert to a ${target} project?`}
      width={500}
      onClose={onClose}
      actions={
        result ? (
          <>
            <button className="btn" onClick={onClose}>Close</button>
            {changes.length > 0 && <button className="btn" onClick={() => setReview(changes)}>Review the AI’s edits…</button>}
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
      {!result && modelReady && (
        <label className="checkbox-row">
          <input type="checkbox" checked={tidy} disabled={running} onChange={(e) => setTidy(e.target.checked)} />
          <span>
            <span>Tidy flagged parts with the AI model <span className="badge">Experimental</span></span>
            <span className="field-hint">
              Your quick model (Settings › Models) rewrites each part the rules could only approximate (a title page, a CV header, a table), one at a time, and Spectrum
              checks every answer keeps the words, labels, references and maths and still compiles before using it. You review the edits afterwards.
            </span>
          </span>
        </label>
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
          {result.tidy && <p className="field-hint">{tidyLine(result.tidy)}{changes.length > 0 && ' Review the edits before you keep them.'}</p>}
        </>
      )}
      {error && <div className="field-hint error">{error}</div>}
      {needsPandoc && (
        <button className="btn" disabled={downloading} onClick={downloadPandoc}>
          {downloading ? <><span className="spinner" /> Downloading pandoc…</> : 'Download pandoc'}
        </button>
      )}
    </Sheet>
  );
}
