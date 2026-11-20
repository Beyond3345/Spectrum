// Search's In text: the match found again in a line the way the backend's searchText finds it.
// Run: npx esbuild apps/frontend/src/editor/textMatches.check.ts --bundle --platform=node --format=esm --log-level=warning --outfile=<scratch>/textMatches.mjs && node <scratch>/textMatches.mjs
import { byFile, excerpt, matchRange, searchPattern } from './textMatches';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const off = { caseSensitive: false, wholeWord: false, regex: false };

eq(matchRange('The Quick brown fox', searchPattern('quick brown', off)!), [4, 15], 'plain text in any case');
eq(matchRange('The Quick brown fox', searchPattern('quick', { ...off, caseSensitive: true })!), null, 'match case');
eq(matchRange('a.b axb', searchPattern('x', off)!), [5, 6], 'plain text');
eq(matchRange('a.b axb', searchPattern('.', off)!), [1, 2], 'a dot is a dot, not any character');
eq(matchRange('\\labelx{a} \\label{b}', searchPattern('\\label', { ...off, wholeWord: true })!), [11, 17], 'a whole command, not the start of a longer one');
eq(matchRange('methods (method)', searchPattern('method', { ...off, wholeWord: true })!), [9, 15], 'whole words');
eq(matchRange('fig:one fig:two', searchPattern('fig:\\w+o$', { ...off, regex: true })!), [8, 15], 'a regular expression');
eq(searchPattern('(', { ...off, regex: true }), null, 'not an expression: the backend says why');
eq(searchPattern('', off), null, 'nothing to look for');

eq(excerpt('short line with fox', searchPattern('fox', off)), ['short line with ', 'fox', ''], 'a short line whole');
const long = `${'word '.repeat(20)}needle and the rest`;
const [before, match, after] = excerpt(long, searchPattern('needle', off));
eq([before.startsWith('…'), before.length < 20, match, after], [true, true, 'needle', ' and the rest'], 'a long line from shortly before its match');
eq(excerpt('no match', searchPattern('zzz', off)), ['no match', '', ''], 'a line changed since');

eq(byFile([{ file: 'a.tex', line: 2, text: '' }, { file: 'b.tex', line: 1, text: '' }, { file: 'a.tex', line: 9, text: '' }]).map(([f, l]) => [f, l.map((m) => m.line)]), [['a.tex', [2, 9]], ['b.tex', [1]]], 'by file, in order');

console.log('textMatches: all checks passed');
