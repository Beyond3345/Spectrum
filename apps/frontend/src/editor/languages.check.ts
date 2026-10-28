// Self-check for the @ completions of Typst and Markdown. Run:
// npx esbuild apps/frontend/src/editor/languages.check.ts --bundle --platform=node --log-level=warning | node
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { referenceCompletions } from './languages.ts';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(what + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
};

const labelsAt = (path: string, version: string, doc = 'See @') => {
  const source = referenceCompletions({ path: () => path, keys: () => ['knuth'], labels: () => ['<sec:one>'], version: () => version });
  return source(new CompletionContext(EditorState.create({ doc }), doc.length, false))?.options.map((o) => o.label) ?? [];
};

// Typst's own completions list a document's labels with the built-in 0.15, so they aren't listed twice
eq(labelsAt('main.typ', ''), ['knuth'], 'the built-in Typst lists its labels itself');
eq(labelsAt('main.typ', '0.15.1'), ['knuth'], 'as does a project pinned to 0.15');
eq(labelsAt('main.typ', '0.14.2'), ['knuth', 'sec:one'], 'an older Typst gets the project’s labels here');
eq(labelsAt('main.md', '', 'See [@'), ['knuth'], 'Markdown gets keys');
eq(labelsAt('main.md', '', 'See @'), [], 'and only inside brackets');

console.log('languages.check: ok');
