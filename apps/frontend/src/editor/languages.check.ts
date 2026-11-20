// Self-check for the @ completions of Typst and Markdown. Run:
// npx esbuild apps/frontend/src/editor/languages.check.ts --bundle --platform=node --log-level=warning | node
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { ensureSyntaxTree } from '@codemirror/language';
import { definitionCompletions, languageFor, referenceCompletions, typstDefinitions } from './languages.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
};

const labelsAt = (path: string, version: string, doc = 'See @') => {
  const source = referenceCompletions({ path: () => path, keys: () => ['knuth'], labels: () => ['<sec:one>'], version: () => version });
  return source(new CompletionContext(EditorState.create({ doc }), doc.length, false))?.options.map((o) => o.label) ?? [];
};

// Typst's own completions list the open file's labels with the built-in 0.15, so they aren't listed twice, but a
// label in another chapter is
eq(labelsAt('main.typ', '', '= One <sec:one>\nSee @'), ['knuth'], 'the built-in Typst lists the open file’s labels itself');
eq(labelsAt('main.typ', '0.15.1', '= One <sec:one>\nSee @'), ['knuth'], 'as does a project pinned to 0.15');
eq(labelsAt('chapters/two.typ', ''), ['knuth', 'sec:one'], 'a label in another file is listed with the built-in Typst');
eq(labelsAt('main.typ', '0.14.2'), ['knuth', 'sec:one'], 'an older Typst gets the project’s labels here');
eq(labelsAt('main.md', '', 'See [@'), ['knuth'], 'Markdown gets keys');
eq(labelsAt('main.md', '', 'See @'), [], 'and only inside brackets');

// the project's own #let functions and values, without Tinymist
eq(typstDefinitions('#let note(body) = body\n#let width = 3cm\n#{ let inner-x = 1 }\nlet go'), [{ name: 'note', fn: true }, { name: 'width', fn: false }, { name: 'inner-x', fn: false }], 'definitions');
const defsAt = (path: string, version: string, doc: string) => {
  const source = definitionCompletions({ path: () => path, defs: () => typstDefinitions('#let note(body) = body\n#let width = 3cm\n#let mine = 1'), version: () => version });
  return source(new CompletionContext(EditorState.create({ doc }), doc.length, false))?.options.map((o) => o.label) ?? [];
};
eq(defsAt('chapters/one.typ', '', '#let mine = 2\nA #no'), ['note', 'width'], 'after #, the other files’ (Typst lists the open file’s)');
eq(defsAt('chapters/one.typ', '0.14.2', '#let mine = 2\nA #no'), ['note', 'width', 'mine'], 'an older Typst gets them all');
eq(defsAt('chapters/one.typ', '', '#figure(image("a.png", width: wi'), ['note', 'width', 'mine'], 'in a call’s arguments');
eq(defsAt('chapters/one.typ', '', 'Plain no'), [], 'not in plain text');
eq(defsAt('main.tex', '', '#no'), [], 'not in LaTeX');

// Markdown: front matter, maths, GitHub tables and ```latex blocks are their own nodes
const md = ['---', 'title: A', '---', '', 'Cost $5 and $6, maths $x_1$ and', '$$', '\\frac{a}{b}', '$$', '', '| a | b |', '| - | - |', '| 1 | 2 |', '', '```latex', '\\ref{x}', '```', ''].join('\n');
const nodes: string[] = [];
const state = EditorState.create({ doc: md, extensions: languageFor('main.md') });
ensureSyntaxTree(state, md.length, 1e9)!.iterate({ enter: (n) => void nodes.push(n.name + ':' + state.sliceDoc(n.from, n.to)) });
eq(nodes.filter((n) => /^(FrontMatter|Maths|Table|SetextHeading2):/.test(n)), ['FrontMatter:---\ntitle: A\n---', 'Maths:$x_1$', 'Maths:$$\n\\frac{a}{b}\n$$', 'Table:| a | b |\n| - | - |\n| 1 | 2 |'], 'Markdown nodes (no setext heading, $5 and $6 is not maths)');
eq(nodes.some((n) => n.startsWith('keyword:') || n.includes('\\ref')), true, 'a ```latex block is parsed as LaTeX');

console.log('languages.check: ok');
