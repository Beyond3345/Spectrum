import type { AiFinding, ReferenceCheckRow } from '../../api/client';
import { needsPdf, preflightGaps, runPreflight } from '../preflight/run';
import type { BibRecord, Diagnostic, Finding, PdfFacts, PdfPage, PreflightGroup } from '../preflight/run';
import type { PartsReview } from './reviewParts';

// Tools › Review's panels and how a run of some of them goes, apart from React so reviewRun.check.ts can drive it.
// Each panel keeps its own result: a run sets only the panels it runs. The source is read once a run; the compile is
// started only when a panel that reads the PDF runs and the PDF is older than the source, and the panels that read the
// source alone, Verify citations and the AI review don't wait for it.

export type Panel = PreflightGroup | 'exist' | 'ai';
export type Row = Finding & { id: string };
export type AiRow = AiFinding & { id: string };
/** waiting: what the PDF half of a group is waiting for while it runs; the source half's findings are in already */
export type GroupResult = { at: string; doc: string; findings: Row[]; gap?: string; waiting?: string; pages?: PdfPage[] | null };
export type ExistResult = { running: true } | { error: string } | { rows: ReferenceCheckRow[]; read?: string };
export type AiResult = { running: true } | { error: string } | { review: Omit<PartsReview, 'findings'> & { findings: AiRow[] } };
export type Results = { [G in PreflightGroup]?: GroupResult } & { exist?: ExistResult; ai?: AiResult };

/** The panels in their order on the page, with a line on what each checks. */
export const PANELS: [Panel, string, string][] = [
  ['compile', 'Compile and layout', 'The build log and the PDF: errors, lines past the margin, ?? in place of citations, missing glyphs, odd page sizes and text past the page’s edge.'],
  ['references', 'References and assets', 'Citations and labels with nothing behind them, the bibliography’s own problems, missing images and figures the text never mentions. Reads the source alone.'],
  ['exist', 'Verify citations', 'Looks each bibliography entry up in Crossref, doi.org, arXiv or OpenAlex, compares it with the record found and reads retractions. Goes online.'],
  ['privacy', 'Privacy and blind review', 'Keys and passwords left in the project, \\todo notes, TODO comments and highlighted text.'],
  ['accessibility', 'Accessibility', 'The PDF’s title and language, pages with no text a screen reader can read and vague link text.'],
  ['submission', 'Submission readiness', 'From the source: absolute paths, letter case, image formats, file names, heading levels, the abstract and keywords. From the PDF: its version, encryption, fonts, bookmarks and text under 6pt.'],
  ['ai', 'AI review', 'One read-only pass by your main model for logic, notation, data that disagrees and missing citations, each point tied to a line.']
];
export const isGroup = (panel: Panel): panel is PreflightGroup => panel !== 'exist' && panel !== 'ai';

/** The panels a document shows: a Typst or Markdown one has no Accessibility or Submission readiness. */
export const panelsFor = (doc: string) => PANELS.map(([panel]) => panel).filter((panel) => /\.(tex|ltx)$/i.test(doc) || (panel !== 'accessibility' && panel !== 'submission'));
/** What Run all runs: the ticked panels, and the AI review only with a model set up. */
export const runAllPanels = (doc: string, ticks: Record<Panel, boolean>, aiReady: boolean) => panelsFor(doc).filter((panel) => ticks[panel] && (panel !== 'ai' || aiReady));

const STOPPED = 'Stopped before the PDF checks ran.';
const rowId = (f: Finding) => [f.group, f.severity, f.message, f.file, f.line, f.page].join('|');

/** What the run asks of the editor and the backend. */
export type RunDeps = {
  doc: string;
  anonymous: boolean;
  accessibilityTags: boolean;
  save(): Promise<void>;
  /** the PDF's and the newest source's times, and the .bib entries */
  state(doc: string): Promise<{ pdfAt: number | null; sourceAt: number | null; bib?: BibRecord[] | null }>;
  /** the editor as it is now: its last compile and the project */
  editor(): { compiledDoc: string; compileLog: string; compileFailed: boolean; keptAt(doc: string): number | null; projectFiles: string[]; root: string };
  compile(doc: string): Promise<string>;
  /** the text of each file the checks read */
  readTexts(): Promise<Map<string, string>>;
  diagnostics(): Promise<Record<string, Diagnostic[]> | undefined>;
  /** reads the PDF of doc; throws when it can't */
  facts(doc: string, signal: AbortSignal): Promise<PdfFacts>;
  exist(doc: string, signal: AbortSignal): Promise<ExistResult>;
  /** the AI review, told what the checks found (findings) */
  ai(doc: string, findings: Finding[], signal: AbortSignal, step: (text: string) => void): Promise<AiResult>;
  /** what the panels other than those running found last, for the AI review */
  known(): Row[];
  signal(panel: Panel): AbortSignal;
  step(panel: Panel, text: string): void;
  update(panel: Panel, result: GroupResult | ExistResult | AiResult): void;
};

/** Runs panels, each in parallel with the others once the source is read. Says what it read, for "source changed". */
export async function runPanels(panels: Panel[], deps: RunDeps) {
  const { doc, anonymous } = deps;
  const live = (panel: Panel) => !deps.signal(panel).aborted;
  const step = (list: Panel[], text: string) => list.filter(live).forEach((panel) => deps.step(panel, text));
  const groups = panels.filter(isGroup);
  step(panels, 'Saving…');
  await deps.save();
  const status = await deps.state(doc);
  const now = deps.editor();
  const freshFor = (editor: ReturnType<RunDeps['editor']>, st: { pdfAt: number | null; sourceAt: number | null }, d: string) => {
    // compiled since the last edit, with that compile's log at hand; a PDF the compile couldn't write over the copy on
    // disk (another program holds it, on Windows) counts from when that compile started
    const pdfAt = editor.keptAt(d) ?? st.pdfAt;
    return pdfAt !== null && (st.sourceAt === null || pdfAt >= st.sourceAt) && editor.compiledDoc === d && Boolean(editor.compileLog);
  };
  const fresh = freshFor(now, status, doc);
  step(groups, 'Reading the source…');
  const texts = groups.length ? await deps.readTexts() : new Map<string, string>();
  const diagnostics = groups.includes('references') ? await deps.diagnostics().catch(() => undefined) : undefined;
  const base = { doc, root: now.root, files: now.projectFiles.map((path) => ({ path, text: texts.get(path) })), bib: status.bib ?? null, diagnostics, anonymous, accessibilityTags: deps.accessibilityTags };
  // the log only while it is the source's own: an older one would hide a citation added since
  const source = runPreflight({ ...base, log: fresh ? now.compileLog : '', failed: fresh && now.compileFailed, pdfFacts: null });
  const at = new Date().toISOString();
  const pdfGroups = groups.filter((g) => needsPdf(g, anonymous));
  const result = (group: PreflightGroup, found: Finding[], extra: Partial<GroupResult> = {}): GroupResult => ({
    at,
    doc,
    findings: found.filter((f) => f.group === group).map((f) => ({ ...f, id: rowId(f) })),
    ...extra
  });
  for (const group of groups) {
    if (!live(group)) continue;
    // a group that reads the PDF shows what the source said while the compile runs
    if (pdfGroups.includes(group)) deps.update(group, result(group, source, { waiting: fresh ? 'Reading the PDF…' : 'Compiling for the PDF checks…' }));
    else {
      deps.update(group, result(group, source));
      deps.step(group, '');
    }
  }

  const pdfPhase = async () => {
    if (!pdfGroups.length) return;
    let reviewed = doc;
    let st = status;
    if (!fresh) {
      // ponytail: Stop stops the panels, not a compile they started; Stop on the Compile button does
      step(pdfGroups, 'Compiling…');
      const ended = await deps.compile(doc);
      if (ended === 'busy' || ended === 'stopped') {
        const gap = ended === 'busy' ? 'Another compile was running, so the PDF checks didn’t run. Run again when it ends.' : 'The compile was stopped, so the PDF checks didn’t run.';
        for (const group of pdfGroups) deps.update(group, result(group, source, { gap: live(group) ? gap : STOPPED }));
        return;
      }
      // a % !TEX root sent the compile to another document
      reviewed = deps.editor().compiledDoc || doc;
      if (reviewed !== doc) st = await deps.state(reviewed);
    }
    const editor = deps.editor();
    step(pdfGroups, 'Reading the PDF…');
    let facts: PdfFacts | null = null;
    let pdfError: string | undefined;
    if (!editor.compileFailed) {
      try {
        facts = await deps.facts(reviewed, AbortSignal.any(pdfGroups.map(deps.signal)));
      } catch (err) {
        pdfError = err instanceof Error ? err.message : String(err);
      }
    }
    const input = { ...base, doc: reviewed, bib: st.bib ?? null, log: editor.compileLog, failed: editor.compileFailed, pdfFacts: facts };
    const found = runPreflight(input);
    const gaps = preflightGaps({ ...input, pdfError });
    for (const group of pdfGroups)
      deps.update(group, live(group) ? { ...result(group, found, { gap: gaps[group], ...(group === 'accessibility' && { pages: facts?.pages ?? null }) }), doc: reviewed } : result(group, source, { gap: STOPPED }));
  };

  const existPhase = async () => {
    if (!panels.includes('exist') || !live('exist')) return;
    deps.update('exist', { running: true });
    deps.step('exist', 'Looking up the references…');
    deps.update('exist', await deps.exist(doc, deps.signal('exist')));
  };

  const aiPhase = async () => {
    if (!panels.includes('ai') || !live('ai')) return;
    deps.update('ai', { running: true });
    deps.step('ai', 'AI review…');
    // what the checks found so far, this run's source half in place of those groups' earlier results
    const findings = [...deps.known().filter((f) => !groups.includes(f.group)), ...source.filter((f) => groups.includes(f.group))].map(({ id: _id, ...f }: Finding & { id?: string }) => f);
    deps.update('ai', await deps.ai(doc, findings, deps.signal('ai'), (text) => live('ai') && deps.step('ai', text)));
  };

  // each panel's step ends when its part does
  const ended = (list: Panel[]) => () => list.forEach((panel) => deps.step(panel, ''));
  await Promise.all([pdfPhase().finally(ended(pdfGroups)), existPhase().finally(ended(['exist'])), aiPhase().finally(ended(['ai']))]);
  return { doc, sourceAt: status.sourceAt, texts };
}
