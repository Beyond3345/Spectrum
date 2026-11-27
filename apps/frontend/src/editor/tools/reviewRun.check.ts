// Self-check for Review's panels: each run sets only its own panels, the compile happens only for the panels that read
// the PDF, Verify citations and the AI review don't wait for it, and a PDF that can't be read says so. Bundle with
// esbuild and run with node.
import type { PdfFacts } from '../preflight/run';
import { runAllPanels, runPanels } from './reviewRun';
import type { GroupResult, Panel, Results, RunDeps } from './reviewRun';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, what: string) => {
  if (!value) throw new Error(what);
};

const MAIN = '\\documentclass{article}\n\\begin{document}\n\\section{A}\nAs \\cite{nobody} says.\n% TODO: thank the lab\n\\end{document}\n';
const FACTS: PdfFacts = { version: '1.5', encrypted: false, title: '', author: '', lang: 'en', outline: true, tagged: false, figuresWithoutAlt: 0, fonts: [], pages: [{ width: 595, height: 842, chars: 900, smallChars: 0, outside: false, text: 'A' }] };

/** A run's world: the results it writes to, what it called, and stubs to change per test. */
function world(over: Partial<RunDeps> & { results?: Results; pdfAt?: number | null; compiled?: string } = {}) {
  const results: Results = { ...over.results };
  const calls: string[] = [];
  const aborts = new Map<Panel, AbortController>();
  let compiledDoc = over.compiled ?? '';
  const deps: RunDeps = {
    doc: 'main.tex',
    anonymous: false,
    accessibilityTags: false,
    save: async () => void calls.push('save'),
    state: async () => ({ pdfAt: over.pdfAt ?? 100, sourceAt: 200, bib: [] }),
    editor: () => ({ compiledDoc, compileLog: compiledDoc ? 'This is pdfTeX\nOutput written on main.pdf' : '', compileFailed: false, keptAt: () => null, projectFiles: ['main.tex'], root: '/p' }),
    compile: async () => {
      calls.push('compile');
      compiledDoc = 'main.tex';
      return 'ok';
    },
    readTexts: async () => new Map([['main.tex', MAIN]]),
    diagnostics: async () => undefined,
    facts: async () => {
      calls.push('facts');
      return FACTS;
    },
    exist: async () => {
      calls.push('exist');
      return { rows: [] };
    },
    ai: async (_doc, findings) => {
      calls.push(`ai:${findings.length}`);
      return { error: 'stub' };
    },
    known: () => [],
    signal: (panel) => {
      if (!aborts.has(panel)) aborts.set(panel, new AbortController());
      return aborts.get(panel)!.signal;
    },
    step: () => undefined,
    update: (panel, result) => void ((results as Record<string, unknown>)[panel] = result),
    ...over
  };
  return { results, calls, deps, aborts };
}
const group = (results: Results, g: 'compile' | 'references' | 'privacy' | 'accessibility' | 'submission') => results[g] as GroupResult;
const messages = (result?: GroupResult) => result?.findings.map((f) => f.message) ?? [];

// References alone: no compile though the PDF is older than the source, and the other panels' results stay
{
  const earlier: GroupResult = { at: 'then', doc: 'main.tex', findings: [{ group: 'compile', severity: 'warning', message: 'Kept', id: 'kept' }] };
  const w = world({ results: { compile: earlier } });
  await runPanels(['references'], w.deps);
  eq(w.calls, ['save'], 'References alone neither compiles nor reads the PDF');
  ok(messages(group(w.results, 'references')).some((m) => /no bibliography/.test(m)), 'References found the citation with no entry');
  eq(w.results.compile, earlier, 'running one panel leaves another’s findings alone');
  eq(w.results.privacy, undefined, 'a panel not run gets no result');
}

// Run all with the compile busy: the source panels, Verify citations and the AI review all finish, and the PDF panels
// keep their source half and say why the rest didn't run
{
  let release = () => undefined as void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const w = world({
    // the compile ends only after Verify citations and the AI review have: they must not wait for it
    compile: async () => {
      await Promise.race([gate, new Promise((_, reject) => setTimeout(() => reject(new Error('Verify citations or the AI review waited for the compile')), 2000))]);
      return 'busy';
    },
    ai: async (_doc, findings) => {
      w.calls.push(`ai:${findings.length}`);
      release();
      return { error: 'stub' };
    }
  });
  const all = runAllPanels('main.tex', { compile: true, references: true, exist: true, privacy: true, accessibility: true, submission: true, ai: true }, true);
  eq(all, ['compile', 'references', 'exist', 'privacy', 'accessibility', 'submission', 'ai'], 'Run all takes every ticked panel');
  await runPanels(all, w.deps);
  ok(messages(group(w.results, 'privacy')).some((m) => /^TODO comment/.test(m)), 'Privacy ran from the source');
  ok(/Another compile was running/.test(group(w.results, 'compile').gap ?? ''), 'Compile and layout says the compile was busy');
  ok(/Another compile was running/.test(group(w.results, 'submission').gap ?? ''), 'Submission readiness says the compile was busy');
  ok(messages(group(w.results, 'submission')).length === 0 || group(w.results, 'submission').findings.every((f) => !f.page), 'the busy Submission readiness has its source half only');
  eq(w.results.exist, { rows: [] }, 'Verify citations finished');
  ok(w.calls.some((c) => /^ai:[1-9]/.test(c)), 'the AI review was told what the source checks found');
  ok(!w.calls.includes('facts'), 'no PDF read after a busy compile');
}

// a PDF that can't be read says so in the panels that need it, rather than "Compile first"
{
  const w = world({
    facts: async () => {
      throw new Error('Invalid PDF structure.');
    }
  });
  await runPanels(['accessibility', 'submission'], w.deps);
  ok(w.calls.includes('compile'), 'the stale PDF was compiled for the PDF panels');
  eq(group(w.results, 'accessibility').gap, 'The PDF couldn’t be read (Invalid PDF structure): most of these checks read the PDF.', 'the PDF’s error is shown');
  ok(!/Compile first/.test(group(w.results, 'submission').gap ?? ''), 'not taken for a missing PDF');
}

// a fresh PDF is read without compiling; the PDF half's findings come in with it
{
  const w = world({ pdfAt: 300, compiled: 'main.tex' });
  await runPanels(['accessibility'], w.deps);
  eq(w.calls, ['save', 'facts'], 'a fresh PDF is read, not compiled again');
  ok(messages(group(w.results, 'accessibility')).some((m) => /no title/.test(m)), 'the PDF checks ran');
  ok(group(w.results, 'accessibility').pages?.length === 1, 'the screen reader view has the pages');
}

// Privacy compiles only with Anonymous review on, for the PDF's Author field
{
  const w = world();
  await runPanels(['privacy'], w.deps);
  ok(!w.calls.includes('compile'), 'Privacy alone doesn’t compile');
  const anonymous = world({ anonymous: true });
  await runPanels(['privacy'], anonymous.deps);
  ok(anonymous.calls.includes('compile'), 'Anonymous review reads the PDF’s Author field');
}

// Stop on a PDF panel keeps its source half and says it stopped; the others carry on
{
  const w = world();
  const compile = w.deps.compile;
  w.deps.compile = async (doc) => {
    w.aborts.get('compile')!.abort();
    return compile(doc);
  };
  await runPanels(['compile', 'submission'], w.deps);
  eq(group(w.results, 'compile').gap, 'Stopped before the PDF checks ran.', 'the stopped panel says so');
  ok(group(w.results, 'submission').gap === undefined && !group(w.results, 'submission').waiting, 'the panel not stopped finished');
}

// Run all: the AI review only with a model set up, and no Accessibility or Submission readiness for Typst
const ticks = { compile: true, references: true, exist: false, privacy: true, accessibility: true, submission: true, ai: true };
eq(runAllPanels('main.tex', ticks, false), ['compile', 'references', 'privacy', 'accessibility', 'submission'], 'no AI review without a model, nor unticked panels');
eq(runAllPanels('main.typ', ticks, true), ['compile', 'references', 'privacy', 'ai'], 'a Typst document’s panels');

console.log('reviewRun.check: ok');
