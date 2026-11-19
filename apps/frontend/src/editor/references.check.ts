// Self-check for the references a rename or move rewrites. Run:
// npx esbuild apps/frontend/src/editor/references.check.ts --bundle --platform=node --log-level=warning | node
import { referenceEdits } from './references';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
/** each file's new text after moving from to to, for the files that change */
const after = (files: Record<string, string>, from: string, to: string, others: string[] = []) =>
  Object.fromEntries(referenceEdits(new Map(Object.entries(files)), from, to, new Set([...Object.keys(files), ...others])).map((e) => [e.path, e.after]));

// ─── LaTeX: from the project folder, with or without the extension it adds ───

const main = '\\include{chapters/intro}\n\\input{chapters/intro.tex}\n\\include{chapters/intro-old}\n\\input{intro}\n';
eq(after({ 'main.tex': main }, 'chapters/intro.tex', 'chapters/introduction.tex'), {
  'main.tex': '\\include{chapters/introduction}\n\\input{chapters/introduction.tex}\n\\include{chapters/intro-old}\n\\input{intro}\n'
}, 'a renamed chapter, as written; a longer name and the same name elsewhere stay');
eq(after({ 'main.tex': '\\includegraphics[width=\\linewidth]{figures/plot}\n\\includegraphics{figures/plot.png}' }, 'figures/plot.png', 'img/plot.png'), {
  'main.tex': '\\includegraphics[width=\\linewidth]{img/plot}\n\\includegraphics{img/plot.png}'
}, 'a moved image, with its options kept');
eq(after({ 'main.tex': '\\includegraphics{figures/plot}' }, 'figures/plot.png', 'img/plot.png', ['figures/plot.pdf']), {}, 'plot could be plot.pdf, which stayed: left alone');
eq(after({ 'main.tex': '\\includegraphics{figures/plot}\n\\input{figures/tab}' }, 'figures', 'img'), { 'main.tex': '\\includegraphics{img/plot}\n\\input{img/tab}' }, 'a renamed folder');
eq(after({ 'main.tex': '\\bibliography{refs,other}\n\\addbibresource{refs.bib}' }, 'refs.bib', 'bib/main.bib'), {
  'main.tex': '\\bibliography{bib/main,other}\n\\addbibresource{bib/main.bib}'
}, 'a bibliography in a list');
eq(after({ 'main.tex': '\\input{chapters/intro}' }, 'chapters/intro.tex', 'chapters/intro.txt'), { 'main.tex': '\\input{chapters/intro.txt}' }, 'a new extension is written out');
eq(after({ 'main.tex': '\\input{\\chapterdir/intro}' }, 'chapters/intro.tex', 'x.tex'), {}, 'a path built from a macro is not a match');

// ─── Typst: from the file that writes it, or "/" from the project folder ───

eq(after({ 'main.typ': '#include "chapters/intro.typ"\n#image("/figures/a.png")\n#import "@preview/cetz:0.3.0": canvas', 'figures/a.png': '' }, 'chapters/intro.typ', 'parts/intro.typ'), {
  'main.typ': '#include "parts/intro.typ"\n#image("/figures/a.png")\n#import "@preview/cetz:0.3.0": canvas'
}, 'an included chapter');
eq(after({ 'chapters/intro.typ': '#figure(image("../figures/a.png"))\n#image("/figures/a.png")' }, 'figures/a.png', 'figures/b.png'), {
  'chapters/intro.typ': '#figure(image("../figures/b.png"))\n#image("/figures/b.png")'
}, 'relative and absolute paths to a renamed image');
eq(after({ 'parts/intro.typ': '#import "../lib.typ": note\n#image("pic.png")' }, 'chapters', 'parts', ['parts/pic.png']), {}, 'a moved folder whose paths still reach: nothing');
eq(after({ 'sub/intro.typ': '#import "lib.typ": note' }, 'intro.typ', 'sub/intro.typ'), { 'sub/intro.typ': '#import "../lib.typ": note' }, 'a moved file’s own paths follow it');

// ─── Markdown: links and images from the file that writes them ───

eq(after({ 'notes.md': '![Plot](figures/plot.png "Gain")\n[See](chapters/a.md#top)\n[Web](https://x.org/figures/plot.png)\n![](<figures/plot.png>)' }, 'figures/plot.png', 'figures/gain.png'), {
  'notes.md': '![Plot](figures/gain.png "Gain")\n[See](chapters/a.md#top)\n[Web](https://x.org/figures/plot.png)\n![](<figures/gain.png>)'
}, 'images, a link with a part, and a web address left alone');
eq(after({ 'notes.md': '[See](chapters/a.md#top)' }, 'chapters/a.md', 'chapters/b.md'), { 'notes.md': '[See](chapters/b.md#top)' }, 'a link keeps its #part');

eq(referenceEdits(new Map([['main.tex', '\\input{a}']]), 'b.tex', 'c.tex', new Set())[0], undefined, 'nothing names it: no edits');
eq(referenceEdits(new Map([['main.tex', '\\input{a}\\input{a.tex}']]), 'a.tex', 'b.tex', new Set())[0].changes, ['a → b', 'a.tex → b.tex'], 'what would change, listed');

console.log('references.check: ok');
