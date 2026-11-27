import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { blobUrl, checkReferences, getFile, getReviewState, runAiReview } from '../../api/client';
import type { AiFinding, LLMConfig, ReferenceCheckRow, ReviewRun } from '../../api/client';
import Icon from '../../app/Icon';
import Sheet from '../../app/Sheet';
import { useEditor } from '../EditorContext';
import { pdfFacts } from '../preflight/pdfFacts';
import { GROUPS, isScanned } from '../preflight/run';
import type { PdfPage, PreflightGroup } from '../preflight/run';
import { Markdown, errorText, fixTitle, fixWithAI, isSource, relativeTime } from '../shared';
import ReferenceCheckRows from './ReferenceCheck';
import { checkCounts, checkReport, existRead } from './referenceWords';
import { mergePart, partLine, partsLimit } from './reviewParts';
import { PANELS, isGroup, panelsFor, runAllPanels, runPanels } from './reviewRun';
import type { AiRow, AiResult, GroupResult, Panel, Results, Row } from './reviewRun';
import { sendLocated } from '../agent/handoff';
import type { Located } from '../agent/handoff';
import { untrusted } from '../../../../backend/src/utils/outsideText.js';
import type { PartsReview } from './reviewParts';

// Tools › Review: a panel for each check, each with its own Run and its own result, and Run all for the ticked ones
// (reviewRun.ts runs them). The panels that read the PDF compile first when it is older than the source; the others
// don't wait for it. The AI review is one read-only model call, or one a part for a long document. The latest results
// are kept per project while Spectrum runs.

// for pdfFacts, which leaves the worker to its caller
GlobalWorkerOptions.workerSrc ||= pdfWorker;

/** the source as the last run read it: the newest source file's time and the text of each source file, to tell when they've changed */
type Last = { at: string; doc: string; sourceAt: number | null; texts: Record<string, string> };
type Kept = { results: Results; last: Last | null; ticks: Record<Panel, boolean>; anonymous: boolean; accessibilityTags: boolean; dismissed: string[] };

const kept = new Map<string, Kept>();

const LABEL = Object.fromEntries(PANELS.map(([panel, label]) => [panel, label])) as Record<Panel, string>;
const ICON = { error: 'xmark.octagon.fill', warning: 'exclamationmark.triangle.fill', info: 'info.circle' } as const;
const SEVERITY_WORD = { error: 'Error', warning: 'Warning', info: 'Note' } as const;
const AI_SEVERITY = { major: 'error', minor: 'warning', note: 'info' } as const;
const AI_PARTS: [AiFinding['severity'], string][] = [
  ['major', 'Major'],
  ['minor', 'Minor'],
  ['note', 'Notes']
];
// the files read for the privacy scan besides the document's own; ponytail: the first 400, sources first
const MAX_SCANNED = 400;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const counted = (n: number, word: string) => (n ? [plural(n, word)] : []);
/** A main model this computer has set up: a key, or a local server on plain http (the .env file may supply one too). */
const modelReady = (config: Partial<LLMConfig>) => Boolean(config.apiKey) || /^http:\/\//i.test(config.endpoint || '');
const where = (f: { file?: string; line?: number; page?: number }) => (f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : f.page ? `page ${f.page}` : '');
const severities = (rows: { severity: string }[], ...kinds: string[]) => kinds.map((k) => rows.filter((r) => r.severity === k).length);
const aiReviewOf = (ai?: AiResult) => (ai && 'review' in ai ? ai.review : null);

/** The results as Markdown, without what was dismissed, for Copy report. */
function reportText(doc: string, at: string, results: Results, hidden: Set<string>) {
  const groups = GROUPS.map(([group]) => group).filter((group) => results[group]);
  const rows = groups.flatMap((group) => results[group]!.findings).filter((f) => !hidden.has(f.id));
  const review = aiReviewOf(results.ai);
  const ai = review?.findings.filter((f) => !hidden.has(f.id)) ?? [];
  const out = [`# Review of ${doc}`, '', `${new Date(at).toLocaleString('en-AU')} · ${countsLine(rows, review && ai)}`];
  for (const group of groups) {
    const { gap } = results[group]!;
    out.push('', `## ${LABEL[group]}`);
    if (gap) out.push('', `_${gap}_`);
    const list = rows.filter((f) => f.group === group);
    if (list.length) out.push('', ...list.map((f) => `- ${SEVERITY_WORD[f.severity]}: ${f.message}${where(f) ? ` (${where(f)})` : ''}`));
    else if (!gap) out.push('', 'No problems found.');
  }
  const { exist } = results;
  if (exist && !('running' in exist)) out.push('', `## ${LABEL.exist}`, '', ...('rows' in exist ? [...(exist.read ? [exist.read, ''] : []), ...checkReport(exist.rows)] : [exist.error]));
  if (results.ai && !('running' in results.ai)) out.push('', `## ${LABEL.ai}`);
  if (results.ai && 'error' in results.ai) out.push('', results.ai.error);
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
        results: {},
        last: null,
        // the AI review is ticked, and Run all takes it once a model is set up
        ticks: { compile: true, references: true, exist: false, privacy: true, accessibility: true, submission: true, ai: true },
        anonymous: false,
        accessibilityTags: false,
        dismissed: []
      }
  );
  const { results, last, ticks } = state;
  const panels = panelsFor(doc);
  const set = (patch: Partial<Kept> | ((was: Kept) => Partial<Kept>)) => setState((was) => ({ ...was, ...(typeof patch === 'function' ? patch(was) : patch) }));
  useEffect(() => void kept.set(projectId, state), [projectId, state]);
  const latestState = useRef(state);
  latestState.current = state;

  // what each running panel is doing, and its Stop
  const [steps, setSteps] = useState<Partial<Record<Panel, string>>>({});
  const aborts = useRef(new Map<Panel, AbortController>());
  const [fixing, setFixing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<Set<string>>(() => new Set(['report']));
  const [reader, setReader] = useState(false);
  // a file the last run read changed on disk since; checked while the tab shows, which also keeps "Last run" current
  const [diskChanged, setDiskChanged] = useState(false);
  const [now, setNow] = useState(Date.now());

  // after a compile, its log and outcome are in the api of the next render
  const latest = useRef(api);
  latest.current = api;
  const commits = useRef<(() => void)[]>([]);
  useEffect(() => commits.current.splice(0).forEach((resolve) => resolve()));
  const nextCommit = () => Promise.race([new Promise<void>((resolve) => commits.current.push(resolve)), new Promise((resolve) => window.setTimeout(resolve, 1000))]);

  const busy = Object.values(steps).some(Boolean);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!active || !last || busy || diskChanged) return;
    let live = true;
    getReviewState(projectId, last.doc)
      .then((s) => live && setDiskChanged(s.sourceAt !== null && last.sourceAt !== null && s.sourceAt > last.sourceAt))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [active, now, last, busy, diskChanged, projectId]);

  const hidden = new Set(state.dismissed);
  const typed = last?.texts[api.activePath] !== undefined && last.texts[api.activePath] !== api.editorValue;
  // read each render, so setting up a model in Settings shows here at once
  const aiReady = modelReady(api.llm.main);

  /** The AI review, a part at a time for a long document, each told the summary of the parts before; Stop keeps the parts done. */
  const aiReview = async (reviewed: string, findings: Parameters<typeof runAiReview>[0]['findings'], signal: AbortSignal, step: (text: string) => void): Promise<AiResult> => {
    let merged: PartsReview | null = null;
    let plan: ReviewRun[][] = [];
    let done = 0;
    let failed = '';
    while (done === 0 || done < plan.length) {
      if (done) step(`AI review, ${partLine(plan, done)}…`);
      const res = await runAiReview(
        { projectId, doc: reviewed, findings, llmConfig: latest.current.llm.main, reasoningEffort: latest.current.settings.reasoningEffort, part: done, summary: merged?.summary },
        signal
      ).catch((err) => ({ ok: false as const, error: signal.aborted ? 'Stopped.' : `The request failed: ${errorText(err)}` }));
      if (!res.ok) {
        if (!done) return { error: res.error };
        failed = signal.aborted ? '' : res.error;
        break;
      }
      plan = res.plan;
      merged = mergePart(merged, res);
      done += 1;
    }
    const review = { ...merged!, limits: [...partsLimit(plan, done, failed), ...merged!.limits] };
    return { review: { ...review, findings: review.findings.map((f) => ({ ...f, id: ['ai', f.severity, f.file, f.line, f.issue].join('|') })) } };
  };

  const run = async (wanted: Panel[]) => {
    const list = wanted.filter((panel) => !aborts.current.has(panel));
    if (!doc || !list.length) return;
    for (const panel of list) aborts.current.set(panel, new AbortController());
    const signal = (panel: Panel) => aborts.current.get(panel)?.signal ?? AbortSignal.abort();
    const { anonymous, accessibilityTags } = state;
    try {
      const read = await runPanels(list, {
        doc,
        anonymous,
        accessibilityTags,
        save: () => latest.current.save(),
        state: (d) => getReviewState(projectId, d, true),
        editor: () => {
          const cur = latest.current;
          return { compiledDoc: cur.compiledDoc, compileLog: cur.compileLog, compileFailed: cur.compileFailed, keptAt: (d) => cur.keptPdf(d)?.at ?? null, projectFiles: cur.projectFiles, root: cur.projectPath };
        },
        compile: async (d) => {
          const ended = await latest.current.compile(d);
          await nextCommit();
          return ended;
        },
        readTexts: async () => {
          const { activePath, editorValue, projectFiles } = latest.current;
          const texts = new Map<string, string>();
          const scanned = projectFiles.filter(isScanned).sort((a, b) => Number(isSource(b)) - Number(isSource(a)));
          await Promise.all(
            scanned.slice(0, MAX_SCANNED).map(async (path) => {
              const text = path === activePath ? editorValue : await getFile(projectId, path).then((f) => f.content, () => null);
              if (text !== null) texts.set(path, text);
            })
          );
          return texts;
        },
        diagnostics: () => latest.current.diagnostics().then((d) => (d.available ? d.files : undefined)),
        facts: async (reviewed, sig) => {
          // the build's PDF, the compile's own when the copy on disk is an older one
          const keptPdf = latest.current.keptPdf(reviewed);
          const url = keptPdf ? URL.createObjectURL(keptPdf.blob) : blobUrl(projectId, reviewed.replace(/\.(?:tex|ltx|typ|md|markdown)$/i, '.pdf'), Date.now());
          try {
            return await pdfFacts(url, sig);
          } finally {
            if (keptPdf) URL.revokeObjectURL(url);
          }
        },
        exist: (reviewed, sig) =>
          checkReferences(projectId, undefined, sig, reviewed).then(
            (res) => ({ rows: res.rows, read: existRead(res) }),
            (err) => ({ error: sig.aborted ? 'Stopped.' : `The references couldn’t be looked up: ${errorText(err)}` })
          ),
        ai: aiReview,
        known: () => GROUPS.flatMap(([group]) => latestState.current.results[group]?.findings ?? []),
        signal,
        step: (panel, text) => setSteps((was) => ({ ...was, [panel]: text })),
        update: (panel, result) => set((was) => ({ results: { ...was.results, [panel]: result } }))
      });
      if (list.some(isGroup)) {
        setDiskChanged(false);
        set({ last: { at: new Date().toISOString(), doc: read.doc, sourceAt: read.sourceAt, texts: Object.fromEntries([...read.texts].filter(([path]) => isSource(path))) } });
      }
    } catch (err) {
      if (!list.every((panel) => signal(panel).aborted)) api.notify(`The review stopped: ${errorText(err)}`, 'error');
    } finally {
      for (const panel of list) aborts.current.delete(panel);
      setSteps((was) => ({ ...was, ...Object.fromEntries(list.map((panel) => [panel, ''])) }));
    }
  };
  const stop = (list: Panel[]) => list.forEach((panel) => aborts.current.get(panel)?.abort());
  const runAll = runAllPanels(doc, ticks, aiReady);

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
  const fixReference = (r: ReferenceCheckRow) =>
    fix(
      `exist|${r.key}`,
      'Fix with AI',
      // the record's fields come from Crossref, arXiv or OpenAlex: material to read, marked so
      `Review’s Verify citations check looked up the .bib entry ${r.key} (${r.file}:${r.line}) at ${r.read?.from}: ${(r.differences || []).map((d) => d.field).join(', ')} ${(r.differences || []).length > 1 ? 'differ' : 'differs'} from the record. What was compared, and the record:\n${untrusted(`${r.read?.from} record`, JSON.stringify({ differences: r.differences, record: r.record, readAt: r.read?.url }))}\nCorrect the entry to match the record if it is the work cited; if it is not, say so and change nothing.`,
      r.file,
      false
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
    last &&
    navigator.clipboard.writeText(reportText(last.doc, last.at, results, hidden)).then(
      () => api.notify('Copied the report', 'success'),
      (err) => api.notify(`Couldn’t copy the report: ${errorText(err)}`, 'error')
    );

  const shownGroups = panels.filter(isGroup).filter((group) => results[group]);
  const rows = shownGroups.flatMap((group) => results[group]!.findings).filter((f) => !hidden.has(f.id));
  const aiResult = aiReviewOf(results.ai);
  const aiRows = aiResult?.findings.filter((f) => !hidden.has(f.id)) ?? [];
  const existRows = results.exist && 'rows' in results.exist ? results.exist.rows : [];
  const dismissedHere = [...shownGroups.flatMap((group) => results[group]!.findings), ...(aiResult?.findings ?? []), ...existRows.map((r) => ({ id: `exist|${r.key}` }))].filter((f) => hidden.has(f.id)).length;
  const anyResult = shownGroups.length > 0 || Boolean(results.exist || results.ai);

  const location = (f: { file?: string; line?: number; page?: number }, pdfDoc: string) =>
    f.file ? (
      <button className="log-location" onClick={() => api.jumpTo(f.file!, f.line || 1)}>
        {where(f)}
      </button>
    ) : f.page ? (
      <button className="log-location" onClick={() => api.showPdfPage(pdfDoc, f.page!)}>
        Page {f.page}
      </button>
    ) : null;

  // a finding for the agent workspace, where it can be followed up in a thread (agent/handoff.ts)
  const rowItem = (f: Row, pdfDoc: string): Located => ({ kind: `Review’s ${LABEL[f.group]} check found this ${f.severity}`, text: f.message, ...(f.file && f.line && { file: f.file, line: f.line }), ...(f.page && { doc: pdfDoc, page: f.page }) });
  const aiItem = (f: AiRow): Located => ({ kind: `Review point (${f.severity}, ${f.category})`, text: `${f.issue}${f.quote ? ` On “${f.quote}”.` : ''}${f.suggestion ? ` Suggested: ${f.suggestion}` : ''}`, ...(f.anchored && { file: f.file, line: f.line }) });
  const toAgent = (items: Located[]) => void sendLocated(items, api.ensureFileContent);

  const actions = (id: string, onFix: (() => void) | null, item?: Located) => (
    <div className="review-row-actions">
      {onFix && (
        <button className="btn small" disabled={fixing !== null} title={fixTitle(api)} onClick={onFix}>
          {fixing === id && <span className="spinner" />} Fix with AI
        </button>
      )}
      {item && (
        <button className="icon-btn" title="Send to agent: a thread to work on it in and follow up" aria-label="Send to agent" onClick={() => toAgent([item])}>
          <Icon name="paperplane" />
        </button>
      )}
      <button className="icon-btn" title="Dismiss" aria-label="Dismiss" onClick={() => dismiss(id)}>
        <Icon name="xmark" />
      </button>
    </div>
  );

  /** A panel: its tick for Run all, its name, what it checks, its state, its own Run, then its results. */
  const panelCard = (panel: Panel, desc: string, counts: string[] | null, body: ReactNode, opts: { extra?: ReactNode; options?: ReactNode; blocked?: string } = {}) => {
    const step = steps[panel];
    const running = aborts.current.has(panel) || Boolean(step);
    return (
      <section key={panel} className="tool-card review-panel" aria-label={LABEL[panel]}>
        <div className="review-panel-head">
          <label className="checkbox-row" title="Run all runs the ticked checks">
            <input type="checkbox" checked={ticks[panel]} onChange={(e) => set({ ticks: { ...ticks, [panel]: e.target.checked } })} />
            <span className="tool-card-title">{LABEL[panel]}</span>
          </label>
          {counts && body ? (
            <button className="disclosure-head log-counts" aria-expanded={!closed.has(panel)} onClick={() => toggle(panel)}>
              {counts.join(' · ') || 'No problems'}
              <Icon name={closed.has(panel) ? 'chevron.right' : 'chevron.down'} />
            </button>
          ) : (
            <span className="log-counts">{running ? '' : 'Not run'}</span>
          )}
          {running ? (
            <button className="btn small" onClick={() => stop([panel])}>
              <span className="spinner" /> Stop
            </button>
          ) : (
            <button className="btn small" disabled={!doc || Boolean(opts.blocked)} onClick={() => run([panel])}>
              <Icon name="play.fill" /> Run
            </button>
          )}
        </div>
        <div className="tool-card-desc">{desc}</div>
        {opts.blocked && <span className="field-hint">{opts.blocked}</span>}
        {opts.options}
        {step && (
          <div className="review-step" role="status">
            {step}
          </div>
        )}
        {opts.extra && <div className="review-panel-actions">{opts.extra}</div>}
        {body && !closed.has(panel) && body}
      </section>
    );
  };

  const groupCard = (group: PreflightGroup, desc: string) => {
    const result: GroupResult | undefined = results[group];
    const list = result?.findings.filter((f) => !hidden.has(f.id)) ?? [];
    const fixable = list.filter((f) => f.fixable);
    const [errors, warnings, infos] = severities(list, 'error', 'warning', 'info');
    const options =
      group === 'privacy' ? (
        <label className="checkbox-row review-option">
          <input type="checkbox" role="switch" checked={state.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} />
          <span>Anonymous review: the authors, \thanks, the acknowledgements and the PDF’s Author field count too</span>
        </label>
      ) : group === 'accessibility' ? (
        <label className="checkbox-row review-option">
          <input type="checkbox" role="switch" checked={state.accessibilityTags} onChange={(e) => set({ accessibilityTags: e.target.checked })} />
          <span>
            Tags and alt text: a tagged PDF and alt text on every image
            <span className="field-hint">Off by default, as standard LaTeX templates fail them for every figure.</span>
          </span>
        </label>
      ) : null;
    const extra = (
      <>
        {group === 'accessibility' && result?.pages && (
          <button className="btn small" onClick={() => setReader(true)}>
            <Icon name="text.viewfinder" /> Screen reader view
          </button>
        )}
        {fixable.length > 1 && (
          <button className="btn small" disabled={fixing !== null} title={fixTitle(api)} onClick={() => fixGroup(group, fixable)}>
            {fixing === group ? <span className="spinner" /> : <Icon name="sparkles" />} Fix all with AI
          </button>
        )}
      </>
    );
    const body = result && (
      <div className="review-group">
        {result.waiting && <div className="tool-footnote">{result.waiting}</div>}
        {result.gap && <div className="tool-footnote">{result.gap}</div>}
        {notes[group] && (
          <div className="log-card note">
            <Markdown>{notes[group]}</Markdown>
          </div>
        )}
        {!list.length && !result.gap && !result.waiting && <div className="review-clear">No problems found</div>}
        {list.map((f) => (
          <div key={f.id} className={`log-card ${f.severity}`}>
            <div className="log-card-row">
              <Icon name={ICON[f.severity]} className="log-icon" />
              <div className="log-card-body">
                <div className="log-message">{f.message}</div>
                {location(f, result.doc)}
              </div>
              {actions(f.id, f.fixable ? () => fixRow(f) : null, rowItem(f, result.doc))}
            </div>
            {notes[f.id] && <Markdown>{notes[f.id]}</Markdown>}
          </div>
        ))}
      </div>
    );
    // a group with nothing found and something it couldn't check isn't "No problems"
    const counts = result ? [...counted(errors, 'error'), ...counted(warnings, 'warning'), ...counted(infos, 'note')] : null;
    return panelCard(group, desc, counts && !counts.length && result?.gap ? ['Not checked'] : counts, body, { options, extra: (group === 'accessibility' && result?.pages) || fixable.length > 1 ? extra : undefined });
  };

  const existCard = (desc: string) => {
    const exist = results.exist;
    const shown = existRows.filter((r) => !hidden.has(`exist|${r.key}`));
    const body = exist && !('running' in exist) && (
      <div className="review-group">
        {'error' in exist && <div className="tool-note error">{exist.error}</div>}
        {'rows' in exist && (
          <ReferenceCheckRows
            rows={shown}
            onJump={(file, line) => api.jumpTo(file, line)}
            actions={(r) => actions(`exist|${r.key}`, r.status === 'differs' ? () => fixReference(r) : null)}
            after={(r) => notes[`exist|${r.key}`] && <Markdown>{notes[`exist|${r.key}`]}</Markdown>}
          />
        )}
        {'rows' in exist && exist.read && <div className="tool-footnote">{exist.read}</div>}
      </div>
    );
    return panelCard('exist', desc, exist && !('running' in exist) ? ('rows' in exist ? checkCounts(shown) : ['Failed']) : null, body);
  };

  const aiCard = (desc: string) => {
    const ai = results.ai;
    const counts = AI_PARTS.flatMap(([severity]) => {
      const n = aiRows.filter((f) => f.severity === severity).length;
      return !n ? [] : severity === 'note' ? [plural(n, 'note')] : [`${n} ${severity}`];
    });
    const extra = aiRows.length > 1 && (
      <>
        <button className="btn small" disabled={fixing !== null} title={fixTitle(api)} onClick={() => fixAllAi(aiRows)}>
          {fixing === 'ai' ? <span className="spinner" /> : <Icon name="sparkles" />} Fix all with AI
        </button>
        <button className="btn small" title="Send the points to the agent, each with its file and line, to work through in a thread" onClick={() => toAgent(aiRows.map(aiItem))}>
          <Icon name="paperplane" /> Send to agent
        </button>
      </>
    );
    const body = ai && !('running' in ai) && (
      <div className="review-group">
        {'error' in ai && <div className="tool-note error">{ai.error}</div>}
        {notes.ai && (
          <div className="log-card note">
            <Markdown>{notes.ai}</Markdown>
          </div>
        )}
        {aiResult && !aiRows.length && <div className="review-clear">No points raised</div>}
        {aiResult &&
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
                                  <button className="log-location" onClick={() => api.showLineInPdf(doc, f.file, f.line)}>
                                    Show in PDF
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="log-location">Location not found</span>
                            )}
                          </div>
                        </div>
                        {actions(f.id, () => fixAi(f), aiItem(f))}
                      </div>
                      {notes[f.id] && <Markdown>{notes[f.id]}</Markdown>}
                    </div>
                  ))}
                </div>
              )
            );
          })}
        {aiResult && (
          <div className="review-report">
            <button className="disclosure-head" aria-expanded={!closed.has('report')} onClick={() => toggle('report')}>
              <h4>Report</h4>
              <Icon name={closed.has('report') ? 'chevron.right' : 'chevron.down'} />
            </button>
            {!closed.has('report') && (
              <>
                {(aiResult.score !== null || aiResult.confidence !== null) && (
                  <div className="review-score">
                    {[aiResult.score !== null && `Score ${aiResult.score}/10`, aiResult.confidence !== null && `Confidence ${aiResult.confidence}/5`].filter(Boolean).join(' · ')}
                  </div>
                )}
                {aiResult.summary && <Markdown>{aiResult.summary}</Markdown>}
                {aiResult.strengths.length > 0 && (
                  <>
                    <h4>Strengths</h4>
                    <Markdown>{aiResult.strengths.map((s) => `- ${s}`).join('\n')}</Markdown>
                  </>
                )}
                {aiResult.limits.length > 0 && (
                  <>
                    <h4>Limits of this review</h4>
                    <Markdown>{aiResult.limits.map((s) => `- ${s}`).join('\n')}</Markdown>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
    return panelCard('ai', desc, ai && !('running' in ai) ? ('error' in ai ? ['Failed'] : counts) : null, body, {
      extra: extra || undefined,
      blocked: aiReady ? undefined : 'Set up a model in Settings › Models first.'
    });
  };

  return (
    <div className="tool-page review-page">
      <div className="tool-page-head">
        <h2>Review</h2>
        {busy ? (
          <button className="btn" onClick={() => stop([...aborts.current.keys()])}>
            <span className="spinner" /> Stop
          </button>
        ) : (
          <button className="btn primary" disabled={!doc || !runAll.length} onClick={() => run(runAll)}>
            <Icon name="checklist" /> Run all
          </button>
        )}
      </div>
      <div className="tool-card-desc">
        Checks {doc || 'the document'} before it goes anywhere. Run all runs the ticked checks at once, compiling first only for those that read the PDF when it is older than the source. The AI review reads the document without changing it.
      </div>

      {(last || anyResult) && (
        <div className="review-status">
          <span>
            {last ? `Last run ${relativeTime(last.at).replace(/^Just/, 'just')}` : 'Results'}
            {last && last.doc !== doc && ` · ${last.doc}`}
            {(diskChanged || typed) && ' · source changed'}
            {' · '}
            <span className="review-counts">{countsLine(rows, aiResult && aiRows)}</span>
          </span>
          {last && (
            <button className="btn small" onClick={copy}>
              <Icon name="doc.on.doc" /> Copy report
            </button>
          )}
        </div>
      )}

      {PANELS.filter(([panel]) => panels.includes(panel)).map(([panel, , desc]) => (panel === 'exist' ? existCard(desc) : panel === 'ai' ? aiCard(desc) : groupCard(panel, desc)))}

      {dismissedHere > 0 && (
        <button className="btn small review-restore" onClick={() => set({ dismissed: [] })}>
          <Icon name="arrow.uturn.backward" /> Show {plural(dismissedHere, 'dismissed row')} again
        </button>
      )}
      {reader && results.accessibility?.pages && <ReaderView pages={results.accessibility.pages} doc={results.accessibility.doc} onClose={() => setReader(false)} />}
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
