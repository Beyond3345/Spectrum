import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { blobUrl, getFile, getReviewState, runAiReview } from '../../api/client';
import type { AiFinding, AiReview, LLMConfig } from '../../api/client';
import Icon from '../../app/Icon';
import Sheet from '../../app/Sheet';
import { useEditor } from '../EditorContext';
import { pdfFacts } from '../preflight/pdfFacts';
import { GROUPS, preflightGaps, runPreflight } from '../preflight/run';
import type { Finding, PdfPage, PreflightGroup } from '../preflight/run';
import { Markdown, errorText, fixWithAI, relativeTime } from '../shared';

// Tools › Review: one press compiles when the PDF is older than the source, runs the Preflight checks that are ticked
// and, when ticked, the AI review (one read-only model call). The latest run is kept per project while Spectrum runs.

// for pdfFacts, which leaves the worker to its caller
GlobalWorkerOptions.workerSrc ||= pdfWorker;

type Tick = PreflightGroup | 'ai';
type Row = Finding & { id: string };
type AiRow = AiFinding & { id: string };
type Run = {
  at: string;
  doc: string;
  /** the newest source file when it ran, and the text it read of each source file, to tell when they've changed */
  sourceAt: number | null;
  texts: Record<string, string>;
  groups: PreflightGroup[];
  findings: Row[];
  gaps: Partial<Record<PreflightGroup, string>>;
  /** what pdf.js read from the PDF, for the screen reader view */
  pages: PdfPage[] | null;
  /** null: not asked for */
  ai: null | { running: true } | { error: string } | { review: Omit<AiReview, 'findings'> & { findings: AiRow[] } };
};
type Kept = { run: Run | null; ticks: Record<Tick, boolean>; anonymous: boolean; dismissed: string[] };

const kept = new Map<string, Kept>();

const AI_LABEL = 'AI review';
const LABEL = Object.fromEntries(GROUPS) as Record<PreflightGroup, string>;
const ICON = { error: 'xmark.octagon.fill', warning: 'exclamationmark.triangle.fill', info: 'info.circle' } as const;
const SEVERITY_WORD = { error: 'Error', warning: 'Warning', info: 'Note' } as const;
const AI_SEVERITY = { major: 'error', minor: 'warning', note: 'info' } as const;
const AI_PARTS: [AiFinding['severity'], string][] = [
  ['major', 'Major'],
  ['minor', 'Minor'],
  ['note', 'Notes']
];
// the files read for the privacy scan besides the document's own; ponytail: the first 400, sources first
const SCANNED = /\.(?:tex|ltx|sty|cls|bib|txt|md|json|ya?ml|toml|ini|cfg|conf|py|r|jl|m|sh|js|ts)$/i;
const SOURCE = /\.(?:tex|ltx|sty|cls|bib)$/i;
const MAX_SCANNED = 400;
// WebKit's switch look for a tick box; elsewhere it stays a tick box
const SWITCH = { switch: '' } as object;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const counted = (n: number, word: string) => (n ? [plural(n, word)] : []);
/** A main model this computer has set up: a key, or a local server on plain http (the .env file may supply one too). */
const modelReady = (config: Partial<LLMConfig>) => Boolean(config.apiKey) || /^http:\/\//i.test(config.endpoint || '');
const where = (f: { file?: string; line?: number; page?: number }) => (f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : f.page ? `page ${f.page}` : '');
const severities = (rows: { severity: string }[], ...kinds: string[]) => kinds.map((k) => rows.filter((r) => r.severity === k).length);

/** The run as Markdown, without what was dismissed, for Copy report. */
function reportText(run: Run, hidden: Set<string>) {
  const rows = run.findings.filter((f) => !hidden.has(f.id));
  const review = run.ai && 'review' in run.ai ? run.ai.review : null;
  const ai = review?.findings.filter((f) => !hidden.has(f.id)) ?? [];
  const out = [`# Review of ${run.doc}`, '', `${new Date(run.at).toLocaleString('en-AU')} · ${countsLine(rows, review && ai)}`];
  for (const group of run.groups) {
    out.push('', `## ${LABEL[group]}`);
    if (run.gaps[group]) out.push('', `_${run.gaps[group]}_`);
    const list = rows.filter((f) => f.group === group);
    if (list.length) out.push('', ...list.map((f) => `- ${SEVERITY_WORD[f.severity]}: ${f.message}${where(f) ? ` (${where(f)})` : ''}`));
    else if (!run.gaps[group]) out.push('', 'No problems found.');
  }
  if (run.ai) out.push('', `## ${AI_LABEL}`);
  if (run.ai && 'error' in run.ai) out.push('', run.ai.error);
  if (review) {
    for (const [severity, label] of AI_PARTS) {
      const list = ai.filter((f) => f.severity === severity);
      if (!list.length) continue;
      out.push('', `### ${label}`, '');
      for (const f of list) {
        const at = f.anchored ? ` (${f.file}:${f.line})` : '';
        out.push(`- [${f.category}] ${f.issue}${at}${f.quote ? ` “${f.quote}”` : ''}${f.suggestion ? ` Suggestion: ${f.suggestion}` : ''}`);
      }
    }
    if (review.summary) out.push('', '### Summary', '', review.summary);
    if (review.strengths.length) out.push('', '### Strengths', '', ...review.strengths.map((s) => `- ${s}`));
    const score = [review.score !== null && `Score ${review.score}/10`, review.confidence !== null && `Confidence ${review.confidence}/5`].filter(Boolean).join(' · ');
    if (score) out.push('', score);
    if (review.limits.length) out.push('', '### Limits of this review', '', ...review.limits.map((s) => `- ${s}`));
  }
  return `${out.join('\n')}\n`;
}

/** "2 errors · 6 warnings · 3 major · 9 minor" */
function countsLine(rows: { severity: string }[], ai: { severity: string }[] | null) {
  const [errors, warnings] = severities(rows, 'error', 'warning');
  const [major, minor] = severities(ai ?? [], 'major', 'minor');
  return [plural(errors, 'error'), plural(warnings, 'warning'), ...(ai ? [`${major} major`, `${minor} minor`] : [])].join(' · ');
}

export default function ReviewTab({ doc, active }: { doc: string; active: boolean }) {
  const api = useEditor();
  const { projectId } = api;
  const [state, setState] = useState<Kept>(
    () =>
      kept.get(projectId) ?? {
        run: null,
        ticks: { compile: true, references: true, privacy: true, accessibility: true, submission: true, ai: modelReady(api.llm.main) },
        anonymous: false,
        dismissed: []
      }
  );
  const { run, ticks } = state;
  const set = (patch: Partial<Kept> | ((was: Kept) => Partial<Kept>)) => setState((was) => ({ ...was, ...(typeof patch === 'function' ? patch(was) : patch) }));
  const setRun = (next: (was: Run) => Run) => set((was) => (was.run ? { run: next(was.run) } : {}));
  useEffect(() => void kept.set(projectId, state), [projectId, state]);

  // what the run is doing ('' when it isn't), and Cancel's
  const [step, setStep] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<Set<string>>(() => new Set(['report']));
  const [reader, setReader] = useState(false);
  // a file the run read changed on disk since; checked while the tab shows, which also keeps "Last run" current
  const [diskChanged, setDiskChanged] = useState(false);
  const [now, setNow] = useState(Date.now());

  // after a compile, its log and outcome are in the api of the next render
  const latest = useRef(api);
  latest.current = api;
  const commits = useRef<(() => void)[]>([]);
  useEffect(() => commits.current.splice(0).forEach((resolve) => resolve()));
  const nextCommit = () => Promise.race([new Promise<void>((resolve) => commits.current.push(resolve)), new Promise((resolve) => window.setTimeout(resolve, 1000))]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!active || !run || step || diskChanged) return;
    let live = true;
    getReviewState(projectId, run.doc)
      .then((s) => live && setDiskChanged(s.sourceAt !== null && run.sourceAt !== null && s.sourceAt > run.sourceAt))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [active, now, run, step, diskChanged, projectId]);

  const hidden = new Set(state.dismissed);
  const typed = run?.texts[api.activePath] !== undefined && run.texts[api.activePath] !== api.editorValue;
  const aiReady = modelReady(api.llm.main);

  const review = async () => {
    if (abortRef.current || !doc) return;
    const abort = new AbortController();
    abortRef.current = abort;
    const { anonymous } = state;
    try {
      setStep('Saving…');
      await api.save();
      let reviewed = doc;
      let status = await getReviewState(projectId, doc, true);
      // compiled since the last edit, with that compile's log at hand; a PDF the compile couldn't write over the copy
      // on disk (another program holds it, on Windows) counts from when that compile started
      const pdfAt = latest.current.keptPdf(doc)?.at ?? status.pdfAt;
      const fresh = pdfAt !== null && (status.sourceAt === null || pdfAt >= status.sourceAt) && latest.current.compiledDoc === doc && Boolean(latest.current.compileLog);
      if (!fresh) {
        // ponytail: Cancel stops the review, not a compile it started; Stop on the Compile button does
        setStep('Compiling…');
        const ended = await api.compile(doc);
        await nextCommit();
        if (ended === 'busy') throw new Error('Another compile is running. Review again when it ends.');
        if (ended === 'stopped') throw new Error('The compile was stopped.');
        reviewed = latest.current.compiledDoc || doc;
        // a % !TEX root sent the compile to another document
        if (reviewed !== doc) status = await getReviewState(projectId, reviewed, true);
      }
      abort.signal.throwIfAborted();

      setStep('Checking…');
      const { compileLog, compileFailed, activePath, editorValue, projectFiles } = latest.current;
      const texts = new Map<string, string>();
      const scanned = projectFiles.filter((p) => SCANNED.test(p)).sort((a, b) => Number(SOURCE.test(b)) - Number(SOURCE.test(a)));
      await Promise.all(
        scanned.slice(0, MAX_SCANNED).map(async (path) => {
          const text = path === activePath ? editorValue : await getFile(projectId, path).then((f) => f.content, () => null);
          if (text !== null) texts.set(path, text);
        })
      );
      // the build's PDF, the compile's own when the copy on disk is an older one; a failed build's would be older too
      const kept = latest.current.keptPdf(reviewed);
      const pdf = kept ? URL.createObjectURL(kept.blob) : blobUrl(projectId, reviewed.replace(/\.tex$/i, '.pdf'), Date.now());
      const [facts, diagnostics] = await Promise.all([
        compileFailed ? null : pdfFacts(pdf, abort.signal).catch(() => null),
        latest.current.diagnostics().then((d) => (d.available ? d.files : undefined), () => undefined)
      ]).finally(() => kept && URL.revokeObjectURL(pdf));
      abort.signal.throwIfAborted();
      const input = {
        doc: reviewed,
        root: latest.current.projectPath,
        files: projectFiles.map((path) => ({ path, text: texts.get(path) })),
        log: compileLog,
        failed: compileFailed,
        bib: status.bib ?? null,
        pdfFacts: facts,
        diagnostics,
        anonymous
      };
      const groups = GROUPS.map(([g]) => g).filter((g) => ticks[g]);
      const findings = runPreflight(input)
        .filter((f) => ticks[f.group])
        .map((f) => ({ ...f, id: [f.group, f.severity, f.message, f.file, f.line, f.page].join('|') }));
      setDiskChanged(false);
      set({
        run: {
          at: new Date().toISOString(),
          doc: reviewed,
          sourceAt: status.sourceAt,
          texts: Object.fromEntries([...texts].filter(([path]) => SOURCE.test(path))),
          groups,
          findings,
          gaps: preflightGaps(input),
          pages: facts?.pages ?? null,
          ai: ticks.ai ? { running: true } : null
        }
      });
      if (!ticks.ai) return;

      setStep('AI review…');
      const res = await runAiReview(
        { projectId, doc: reviewed, activePath, findings: findings.map(({ id: _id, ...f }) => f), llmConfig: api.llm.main, reasoningEffort: api.settings.reasoningEffort },
        abort.signal
      ).catch((err) => ({ ok: false as const, error: abort.signal.aborted ? 'Stopped.' : `The request failed: ${errorText(err)}` }));
      setRun((was) => ({
        ...was,
        ai: res.ok ? { review: { ...res, findings: res.findings.map((f) => ({ ...f, id: ['ai', f.severity, f.file, f.line, f.issue].join('|') })) } } : { error: res.error }
      }));
    } catch (err) {
      if (!abort.signal.aborted) api.notify(`The review stopped: ${errorText(err)}`, 'error');
    } finally {
      abortRef.current = null;
      setStep('');
    }
  };

  const cancel = () => abortRef.current?.abort();

  const fix = async (id: string, label: string, prompt: string, file: string | undefined, withLog: boolean) => {
    setFixing(id);
    const reply = await fixWithAI(api, { task: 'fix_review_finding', prompt, file, label, withLog });
    if (reply) setNotes((was) => ({ ...was, [id]: reply }));
    setFixing(null);
  };
  const fixRow = (f: Row) =>
    fix(f.id, 'Fix with AI', `Review’s ${LABEL[f.group]} check found this ${f.severity}: ${f.message}${where(f) ? ` (${where(f)})` : ''}. Fix it in the source and propose a patch that can be applied.`, f.file, f.group === 'compile');
  const fixGroup = (group: PreflightGroup, rows: Row[]) =>
    fix(
      group,
      'Fix all with AI',
      `Review’s ${LABEL[group]} checks found these problems:\n${rows.map((f) => `- ${f.severity}: ${f.message}${where(f) ? ` (${where(f)})` : ''}`).join('\n')}\nFix them in the source and propose patches that can be applied.`,
      rows.find((f) => f.file)?.file,
      group === 'compile'
    );
  const aiPoint = (f: AiFinding) =>
    `- ${f.severity} (${f.category})${f.anchored ? ` at ${f.file}, line ${f.line}` : ''}${f.quote ? `, on “${f.quote}”` : ''}: ${f.issue}${f.suggestion ? ` Suggested: ${f.suggestion}` : ''}`;
  const fixAi = (f: AiRow) =>
    fix(f.id, 'Fix with AI', `A review of the paper raised this point:\n${aiPoint(f)}\nRevise the text to address it and propose a patch that can be applied.`, f.anchored ? f.file : undefined, false);
  // ponytail: the first 20 points, as one run's patches stay reviewable
  const fixAllAi = (rows: AiRow[]) =>
    fix('ai', 'Fix all with AI', `A review of the paper raised these points:\n${rows.slice(0, 20).map(aiPoint).join('\n')}\nRevise the text to address them and propose patches that can be applied.`, undefined, false);

  const dismiss = (id: string) => set((was) => ({ dismissed: [...was.dismissed, id] }));
  const toggle = (key: string) =>
    setClosed((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const copy = () =>
    run &&
    navigator.clipboard.writeText(reportText(run, hidden)).then(
      () => api.notify('Copied the report', 'success'),
      (err) => api.notify(`Couldn’t copy the report: ${errorText(err)}`, 'error')
    );

  const rows = run?.findings.filter((f) => !hidden.has(f.id)) ?? [];
  const aiReview = run?.ai && 'review' in run.ai ? run.ai.review : null;
  const aiRows = aiReview?.findings.filter((f) => !hidden.has(f.id)) ?? [];
  const dismissedHere = run ? [...run.findings, ...(aiReview?.findings ?? [])].filter((f) => hidden.has(f.id)).length : 0;
  const busy = Boolean(step);

  const head = (key: string, label: string, counts: string[], extra?: ReactNode) => (
    <div className="review-group-head">
      <button className="disclosure-head" aria-expanded={!closed.has(key)} onClick={() => toggle(key)}>
        <h3>{label}</h3>
        <Icon name={closed.has(key) ? 'chevron.right' : 'chevron.down'} />
      </button>
      <span className="log-counts">{counts.join(' · ')}</span>
      {extra}
    </div>
  );

  const location = (f: { file?: string; line?: number; page?: number }) =>
    f.file ? (
      <button className="log-location" onClick={() => api.jumpTo(f.file!, f.line || 1)}>
        {where(f)}
      </button>
    ) : f.page && run ? (
      <button className="log-location" onClick={() => api.showPdfPage(run.doc, f.page!)}>
        Page {f.page}
      </button>
    ) : null;

  const actions = (id: string, onFix: (() => void) | null) => (
    <div className="review-row-actions">
      {onFix && (
        <button className="btn small" disabled={fixing !== null} onClick={onFix}>
          {fixing === id && <span className="spinner" />} Fix with AI
        </button>
      )}
      <button className="icon-btn" title="Dismiss" aria-label="Dismiss" onClick={() => dismiss(id)}>
        <Icon name="xmark" />
      </button>
    </div>
  );

  return (
    <div className="tool-page review-page">
      <div className="tool-page-head">
        <h2>Review</h2>
        {busy ? (
          <button className="btn" onClick={cancel}>
            <span className="spinner" /> Cancel
          </button>
        ) : (
          <button className="btn primary" disabled={!doc || !Object.values(ticks).some(Boolean)} onClick={review}>
            <Icon name="checklist" /> Review
          </button>
        )}
      </div>
      <div className="tool-card-desc">
        Checks {doc || 'the document'} before it goes anywhere, compiling it first when the PDF is older than the source. The AI review reads it without changing it.
      </div>
      <div className="review-ticks">
        {GROUPS.map(([group, label]) => (
          <div key={group} className="review-tick">
            <label className="checkbox-row">
              <input type="checkbox" checked={ticks[group]} disabled={busy} onChange={(e) => set({ ticks: { ...ticks, [group]: e.target.checked } })} />
              <span>{label}</span>
            </label>
            {group === 'privacy' && (
              <label className="checkbox-row review-switch">
                <input type="checkbox" role="switch" {...SWITCH} checked={state.anonymous} disabled={busy || !ticks.privacy} onChange={(e) => set({ anonymous: e.target.checked })} />
                <span>Anonymous review</span>
              </label>
            )}
          </div>
        ))}
        <div className="review-tick">
          <label className="checkbox-row">
            <input type="checkbox" checked={ticks.ai} disabled={busy} onChange={(e) => set({ ticks: { ...ticks, ai: e.target.checked } })} />
            <span>
              {AI_LABEL}
              {!aiReady && <span className="field-hint">Set up a model in Settings › Models first.</span>}
            </span>
          </label>
        </div>
      </div>

      {(busy || run) && (
        <div className="review-status" role="status">
          {busy ? (
            step
          ) : (
            <>
              <span>
                Last run {relativeTime(run!.at).replace(/^Just/, 'just')}
                {run!.doc !== doc && ` · ${run!.doc}`}
                {(diskChanged || typed) && ' · source changed'}
              </span>
              <button className="btn small" onClick={copy}>
                <Icon name="doc.on.doc" /> Copy report
              </button>
            </>
          )}
        </div>
      )}

      {run && (
        <>
          <div className="review-counts">{countsLine(rows, aiReview && aiRows)}</div>
          {run.groups.map((group) => {
            const list = rows.filter((f) => f.group === group);
            const fixable = list.filter((f) => f.fixable);
            const [errors, warnings, infos] = severities(list, 'error', 'warning', 'info');
            const gap = run.gaps[group];
            return (
              <section key={group} className="review-group">
                {head(
                  group,
                  LABEL[group],
                  [...counted(errors, 'error'), ...counted(warnings, 'warning'), ...counted(infos, 'note')],
                  <>
                    {group === 'accessibility' && run.pages && (
                      <button className="btn small" onClick={() => setReader(true)}>
                        <Icon name="text.viewfinder" /> Screen reader view
                      </button>
                    )}
                    {fixable.length > 1 && (
                      <button className="btn small" disabled={fixing !== null} onClick={() => fixGroup(group, fixable)}>
                        {fixing === group ? <span className="spinner" /> : <Icon name="sparkles" />} Fix all with AI
                      </button>
                    )}
                  </>
                )}
                {!closed.has(group) && (
                  <>
                    {gap && <div className="tool-footnote">{gap}</div>}
                    {notes[group] && (
                      <div className="log-card note">
                        <Markdown>{notes[group]}</Markdown>
                      </div>
                    )}
                    {!list.length && !gap && <div className="review-clear">No problems found</div>}
                    {list.map((f) => (
                      <div key={f.id} className={`log-card ${f.severity}`}>
                        <div className="log-card-row">
                          <Icon name={ICON[f.severity]} className="log-icon" />
                          <div className="log-card-body">
                            <div className="log-message">{f.message}</div>
                            {location(f)}
                          </div>
                          {actions(f.id, f.fixable ? () => fixRow(f) : null)}
                        </div>
                        {notes[f.id] && <Markdown>{notes[f.id]}</Markdown>}
                      </div>
                    ))}
                  </>
                )}
              </section>
            );
          })}

          {run.ai && (
            <section className="review-group">
              {head(
                'ai',
                AI_LABEL,
                AI_PARTS.flatMap(([severity]) => {
                  const n = aiRows.filter((f) => f.severity === severity).length;
                  return !n ? [] : severity === 'note' ? [plural(n, 'note')] : [`${n} ${severity}`];
                }),
                aiRows.length > 1 && (
                  <button className="btn small" disabled={fixing !== null} onClick={() => fixAllAi(aiRows)}>
                    {fixing === 'ai' ? <span className="spinner" /> : <Icon name="sparkles" />} Fix all with AI
                  </button>
                )
              )}
              {!closed.has('ai') && (
                <>
                  {'running' in run.ai && <div className="tool-footnote">Reading the document…</div>}
                  {'error' in run.ai && <div className="tool-note error">{run.ai.error}</div>}
                  {notes.ai && (
                    <div className="log-card note">
                      <Markdown>{notes.ai}</Markdown>
                    </div>
                  )}
                  {aiReview && !aiRows.length && <div className="review-clear">No points raised</div>}
                  {aiReview &&
                    AI_PARTS.map(([severity, label]) => {
                      const list = aiRows.filter((f) => f.severity === severity);
                      return (
                        list.length > 0 && (
                          <div key={severity} className="review-part">
                            <h4>{label}</h4>
                            {list.map((f) => (
                              <div key={f.id} className={`log-card ${AI_SEVERITY[f.severity]}`}>
                                <div className="log-card-row">
                                  <Icon name={ICON[AI_SEVERITY[f.severity]]} className="log-icon" />
                                  <div className="log-card-body">
                                    <span className="review-category">{f.category}</span>
                                    <div className="log-message">{f.issue}</div>
                                    {f.quote && <div className="review-quote">“{f.quote}”</div>}
                                    {f.suggestion && <div className="review-suggestion">{f.suggestion}</div>}
                                    <div className="review-links">
                                      {f.anchored ? (
                                        <>
                                          <button className="log-location" onClick={() => api.jumpTo(f.file, f.line)}>
                                            {f.file}:{f.line}
                                          </button>
                                          {/\.tex$/i.test(f.file) && (
                                            <button className="log-location" onClick={() => api.showLineInPdf(run.doc, f.file, f.line)}>
                                              Show in PDF
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        <span className="log-location">Location not found</span>
                                      )}
                                    </div>
                                  </div>
                                  {actions(f.id, () => fixAi(f))}
                                </div>
                                {notes[f.id] && <Markdown>{notes[f.id]}</Markdown>}
                              </div>
                            ))}
                          </div>
                        )
                      );
                    })}
                  {aiReview && (
                    <div className="review-report">
                      <button className="disclosure-head" aria-expanded={!closed.has('report')} onClick={() => toggle('report')}>
                        <h4>Report</h4>
                        <Icon name={closed.has('report') ? 'chevron.right' : 'chevron.down'} />
                      </button>
                      {!closed.has('report') && (
                        <>
                          {(aiReview.score !== null || aiReview.confidence !== null) && (
                            <div className="review-score">
                              {[aiReview.score !== null && `Score ${aiReview.score}/10`, aiReview.confidence !== null && `Confidence ${aiReview.confidence}/5`].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {aiReview.summary && <Markdown>{aiReview.summary}</Markdown>}
                          {aiReview.strengths.length > 0 && (
                            <>
                              <h4>Strengths</h4>
                              <Markdown>{aiReview.strengths.map((s) => `- ${s}`).join('\n')}</Markdown>
                            </>
                          )}
                          {aiReview.limits.length > 0 && (
                            <>
                              <h4>Limits of this review</h4>
                              <Markdown>{aiReview.limits.map((s) => `- ${s}`).join('\n')}</Markdown>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {dismissedHere > 0 && (
            <button className="btn small review-restore" onClick={() => set({ dismissed: [] })}>
              <Icon name="arrow.uturn.backward" /> Show {plural(dismissedHere, 'dismissed row')} again
            </button>
          )}
        </>
      )}
      {reader && run?.pages && <ReaderView pages={run.pages} doc={run.doc} onClose={() => setReader(false)} />}
    </div>
  );
}

/** The screen reader view: the text pdf.js extracts from each page, in the order it comes. */
function ReaderView({ pages, doc, onClose }: { pages: PdfPage[]; doc: string; onClose: () => void }) {
  const [at, setAt] = useState(0);
  const page = pages[at];
  return (
    <Sheet title="Screen reader view" onClose={onClose} width={680} className="reader-sheet">
      <div className="tool-card-desc">
        The text a screen reader gets from {doc.replace(/\.tex$/i, '.pdf')}, in the order it comes. Text missing here, or out of order, is missing or out of order for screen readers too.
      </div>
      <div className="reader-nav">
        <button className="btn small" disabled={at === 0} onClick={() => setAt(at - 1)}>
          <Icon name="chevron.left" /> Previous
        </button>
        <span role="status">
          Page {at + 1} of {pages.length}
        </span>
        <button className="btn small" disabled={at === pages.length - 1} onClick={() => setAt(at + 1)}>
          Next <Icon name="chevron.right" />
        </button>
      </div>
      {page?.text ? (
        <div className="reader-text" tabIndex={0}>
          {page.text}
        </div>
      ) : (
        <div className="tool-empty">No text a screen reader can read on this page</div>
      )}
    </Sheet>
  );
}
