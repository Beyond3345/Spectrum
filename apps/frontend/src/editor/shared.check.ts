// Self-check for the shared helpers that pick a project's files. Run:
// npx esbuild apps/frontend/src/editor/shared.check.ts --bundle --platform=node --log-level=warning | node
import { bibIncludeLine, keptMainFile } from './shared';

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
eq(bibIncludeLine('notes.md', 'refs.bib'), 'bibliography: refs.bib', 'Markdown front matter');

console.log('shared.check: ok');
