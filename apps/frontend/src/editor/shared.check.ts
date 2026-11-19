// Self-check for the shared helpers that pick a project's files. Run:
// npx esbuild apps/frontend/src/editor/shared.check.ts --bundle --platform=node --log-level=warning | node
import { NO_ANSWER, bibIncludeLine, buildLine, fixWithAI, withRetries, inlineImage, keptMainFile, modelSetUp } from './shared';
import type { EditorApi } from './EditorContext';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── the main file as the tree changes ───

eq(keptMainFile('main.typ', ['main.typ', 'refs.bib']), 'main.typ', 'a Typst main file stays');
eq(keptMainFile('notes.md', ['notes.md', 'paper.tex']), 'notes.md', 'a Markdown main file stays beside a .tex');
eq(keptMainFile('', ['refs.bib', 'chapters/a.typ', 'main.typ']), 'main.typ', 'none yet: main.typ first');
eq(keptMainFile('gone.tex', ['draft.markdown', 'logo.png']), 'draft.markdown', 'gone: the first document');
eq(keptMainFile('', ['main (conflicted copy).tex', 'paper.tex'], { 'main (conflicted copy).tex': 'main.tex' }), 'paper.tex', 'never a conflict copy');
eq(keptMainFile('main.tex', ['refs.bib', 'figures/a.pdf']), '', 'no document left');

// ─── the line the References chat suggests when the .bib is not included yet ───

eq(bibIncludeLine('main.tex', 'refs.bib'), '\\bibliography{refs}', 'LaTeX');
eq(bibIncludeLine('main.typ', 'refs.bib'), '#bibliography("refs.bib")', 'Typst');

// ─── a reply's images: only ones the reply carries, never an address that would be fetched ───

eq(inlineImage('data:image/png;base64,iVBORw0KGgo='), true, 'a data: image');
eq(inlineImage('blob:http://127.0.0.1:38787/1b9d6bcd'), true, 'a blob: image');
eq(inlineImage('https://evil.example/leak.gif?d=text-from-the-document'), false, 'a remote image');
eq(inlineImage('/api/projects/import-arxiv-sse?arxivIdOrUrl=2401.00001'), false, 'the app’s own API');
eq(inlineImage('data:text/html,<script>1</script>'), false, 'a data: page');
eq(inlineImage(undefined), false, 'no address');

// ─── Fix with AI before a model is set up: Settings › Models, and no request ───

eq(modelSetUp({ endpoint: 'https://api.openai.com/v1/chat/completions' }), false, 'no key, a hosted model');
eq(modelSetUp({ endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: 'k' }), true, 'a key');
eq(modelSetUp({ endpoint: 'http://127.0.0.1:11434/v1/chat/completions' }), true, 'a local server takes no key');
const opened: unknown[] = [];
const noModel = { llm: { main: { endpoint: 'https://api.openai.com/v1' } }, openSettings: (s?: string) => opened.push(s), notify: () => opened.push('toast') } as unknown as EditorApi;
eq(await fixWithAI(noModel, { task: 'debug_compile', prompt: 'x', label: 'Fix with AI' }), '', 'nothing is asked');
eq(opened, ['models'], 'Settings opens at Models');

// ─── Fix with AI ends with a compile, and says how it went ───

eq(buildLine({ ok: true, errors: [] }), 'Builds.', 'the fix builds');
eq(buildLine({ ok: false, errors: ['main.typ:3:6: error: unknown variable: x', 'main.typ:9:1: error: y'] }), 'Still fails at main.typ:3:6: error: unknown variable: x', 'the first error left');
eq(buildLine({ ok: false, errors: [] }), 'Still fails at the compile', 'a failure the log did not place');
eq(buildLine(undefined), '', 'nothing changed, nothing compiled');

// ─── the editor's first load: a failed or silent request is tried again, then the error is thrown ───

let calls = 0;
eq(await withRetries(async () => (++calls < 3 ? Promise.reject(new Error('reset')) : 'ok'), { pause: 1 }), 'ok', 'the third try answers');
eq(calls, 3, 'tried three times');
calls = 0;
const silent = await withRetries(() => (++calls, new Promise(() => undefined)), { timeout: 5, pause: 1 }).then(() => 'answered', (err: Error) => err.message);
eq([silent, calls], [NO_ANSWER, 3], 'a request that never answers ends in an error, not a wait for ever');
calls = 0;
eq(await withRetries(async () => (++calls, Promise.reject(new Error('reset'))), { pause: 1, stop: () => true }), undefined, 'a page that has left stops quietly');
eq(calls, 1, 'and asks no more');

console.log('shared.check: ok');
