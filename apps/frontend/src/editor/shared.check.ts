// Self-check for the shared helpers that pick a project's files. Run:
// npx esbuild apps/frontend/src/editor/shared.check.ts --bundle --platform=node --log-level=warning | node
import { keptMainFile } from './shared';

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

console.log('shared.check: ok');
