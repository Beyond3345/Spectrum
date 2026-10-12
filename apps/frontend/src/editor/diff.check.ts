// Self-check for the review diff. Run:
// npx esbuild apps/frontend/src/editor/diff.check.ts --bundle --platform=node --log-level=warning | node
import { buildDiffRows, countChanges } from './SplitDiffView';
import type { DiffItem, DiffRow } from './SplitDiffView';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

/** "changed 2|2", "fold 1+11" (first left line + how many) */
const shape = (items: DiffItem[]) =>
  items.map((it) => (it.type === 'fold' ? `fold ${it.leftStart}+${it.count}` : `${it.type} ${it.leftNo ?? '-'}|${it.rightNo ?? '-'}`));
const rowsOf = (items: DiffItem[]) => items.filter((it): it is DiffRow => it.type !== 'fold');
const lines = (n: number, edit: (i: number) => string | undefined = () => undefined) =>
  Array.from({ length: n }, (_, k) => edit(k + 1) ?? `line ${k + 1}`).join('\n') + '\n';

// pairing: removed lines beside the added ones after them, leftovers on one side
eq(shape(buildDiffRows('one\ntwo\nthree\n', 'one\n2\n3\nextra\nthree\n')), ['context 1|1', 'changed 2|2', 'added -|3', 'added -|4', 'context 3|5'], 'more new lines than old');
eq(shape(buildDiffRows('a\nb\nc\nd\n', 'a\nX\nd\n')), ['context 1|1', 'changed 2|2', 'removed 3|-', 'context 4|3'], 'more old lines than new');
eq(shape(buildDiffRows('', 'new\n')), ['added -|1'], 'a new file');
eq(rowsOf(buildDiffRows('a\nb\n', 'a\nc\n'))[1], { id: '2:2', type: 'changed', left: 'b', leftNo: 2, right: 'c', rightNo: 2 }, 'a one-letter line rewritten is tinted whole');
// a line added above an edited one: the edit pairs with the line it came from
const above = buildDiffRows('Intro.\nThe results show a clear trend in the data.\nEnd.\n', 'Intro.\nWe ran three experiments.\nThe results show a clear upward trend in the data.\nEnd.\n');
eq(shape(above), ['context 1|1', 'added -|2', 'changed 2|3', 'context 3|4'], 'a line added above an edit');
eq(rowsOf(above)[2].words?.right.filter((s) => s.changed).map((s) => s.text), ['upward '], 'the edit beside its old line');
eq(shape(buildDiffRows('a\nold one\nb\n', 'a\nnew\nold one more\nc\nd\nb\n')), ['context 1|1', 'added -|2', 'changed 2|3', 'added -|4', 'added -|5', 'context 3|6'], 'lines after the alike pair');

// folds: three lines of context, longer unchanged runs folded at the start, middle and end
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 15 ? 'changed' : undefined)))), ['fold 1+11', 'context 12|12', 'context 13|13', 'context 14|14', 'changed 15|15', 'context 16|16', 'context 17|17', 'context 18|18', 'fold 19+12'], 'start and end folded');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 2 ? 'changed' : undefined)))).slice(0, 2), ['context 1|1', 'changed 2|2'], 'no fold before a change near the top');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 30 ? 'changed' : undefined)))), ['fold 1+26', 'context 27|27', 'context 28|28', 'context 29|29', 'changed 30|30'], 'a change on the last line');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 5 || i === 25 ? 'changed' : undefined)))).filter((s) => s.startsWith('fold')), ['fold 9+13', 'fold 29+2'], 'a fold between two hunks, a lone first line left open');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 5 || i === 13 ? 'changed' : undefined)))).filter((s) => s.startsWith('fold') || s === 'context 9|9'), ['context 9|9', 'fold 17+14'], 'a gap of 7 lines stays open');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 5 || i === 14 ? 'changed' : undefined)))).filter((s) => s.startsWith('fold')), ['fold 9+2', 'fold 18+13'], 'a gap of 8 folds 2');
const folded = buildDiffRows(lines(30), lines(30, (i) => (i === 15 ? 'changed' : undefined)))[0];
eq(folded.type === 'fold' && folded.rows.map((r) => r.left), Array.from({ length: 11 }, (_, k) => `line ${k + 1}`), 'a fold keeps its lines to show');
eq(shape(buildDiffRows(lines(30), lines(30, (i) => (i === 15 ? 'changed' : undefined)), { context: 1 })), ['fold 1+13', 'context 14|14', 'changed 15|15', 'context 16|16', 'fold 17+14'], 'context is adjustable');
// an added line shifts the right numbers, and the fold records both starts
const shifted = buildDiffRows(lines(20), lines(20, (i) => (i === 3 ? 'line 3\nnew' : undefined)));
eq({ ...shifted[shifted.length - 1], rows: undefined },{ type: 'fold', id: 'fold-7:8', leftStart: 7, rightStart: 8, count: 14 }, 'fold after an insertion');

// word-level parts for a small edit
eq(rowsOf(buildDiffRows('The quick brown fox\n', 'The quick red fox\n'))[0].words, {
  left: [{ text: 'The quick ', changed: false }, { text: 'brown', changed: true }, { text: ' fox', changed: false }],
  right: [{ text: 'The quick ', changed: false }, { text: 'red', changed: true }, { text: ' fox', changed: false }]
}, 'one word changed');
eq(rowsOf(buildDiffRows('\\section{Intro}\n', '\\section{Introduction}\n'))[0].words?.right.filter((s) => s.changed).map((s) => s.text), ['Introduction'], 'a LaTeX command argument');
// whole-line tint for a rewrite and for a very long line
eq(rowsOf(buildDiffRows('alpha beta gamma\n', 'one two three four\n'))[0].words, undefined, 'a rewritten line is tinted whole');
const long = 'word '.repeat(1000);
eq(rowsOf(buildDiffRows(long + 'a\n', long + 'b\n'))[0].words, undefined, 'a very long line is tinted whole');
// words added to a line show on the right; nothing on the left is marked
const appended = rowsOf(buildDiffRows('\\caption{Results}\n', '\\caption{Results of the proposed method on the test set.}\n'))[0].words;
eq([appended?.left.some((s) => s.changed), appended?.right.filter((s) => s.changed).map((s) => s.text)], [false, [' of the proposed method on the test set.']], 'words appended to a line');
eq(rowsOf(buildDiffRows('a b\n', 'x y z w\n'))[0].words, undefined, 'shared spaces alone are not alike');
// a split inside a character cluster would draw it broken, so the line is tinted whole
eq(rowsOf(buildDiffRows('यह किताब\n', 'यह कीताब\n'))[0].words, undefined, 'a vowel sign changed');
eq(rowsOf(buildDiffRows('cafe\u0301\n', 'cafe\u0300\n'))[0].words, undefined, 'a combining accent changed');
eq(rowsOf(buildDiffRows('👨‍👩‍👧 hi\n', '👨‍👩‍👦 hi\n'))[0].words, undefined, 'a joined emoji changed');
// CRLF to LF: the CR is the changed part (shown as a label)
eq(rowsOf(buildDiffRows('foo bar\r\n', 'foo bar\n'))[0].words?.left, [{ text: 'foo bar', changed: false }, { text: '\r', changed: true }], 'CRLF to LF');
// a long CJK line is a token per character: its word diff stops at the budget
let seed = 1;
const cjk = () => Array.from({ length: 3999 }, () => String.fromCharCode(0x4e00 + ((seed = (seed * 48271) % 2147483647) % 300))).join('');
const cjkStart = performance.now();
buildDiffRows(cjk() + '\n', cjk() + '\n');
if (performance.now() - cjkStart > 400) throw new Error(`a rewritten CJK line took ${Math.round(performance.now() - cjkStart)} ms`);

// identical texts
eq(buildDiffRows('same\ntext\n', 'same\ntext\n'), [], 'identical: no rows');
eq(buildDiffRows('', ''), [], 'both empty');
eq(countChanges('same\n', 'same\n'), { added: 0, removed: 0 }, 'identical: no counts');

// a newline missing at the end shows on the side without it
const noEol = rowsOf(buildDiffRows('a\nb\n', 'a\nb'));
eq([noEol.length, noEol[1].type, noEol[1].noNewline, noEol[1].words?.right], [2, 'changed', 'right', [{ text: 'b', changed: false }]], 'newline dropped');
eq(rowsOf(buildDiffRows('a\nb', 'a\nb\n'))[1].noNewline, 'left', 'newline added');
eq(rowsOf(buildDiffRows('a\nb', 'a\nc')).map((r) => r.noNewline), [undefined, undefined], 'neither side has one: nothing to say');
eq(countChanges('a\nb\n', 'a\nb'), { added: 1, removed: 1 }, 'newline counts as a changed line');

// a diff that takes too long: every old line removed beside every new one
// (in full it'd keep the even lines as context)
const before = lines(3000);
const after = lines(3000, (i) => (i % 2 ? `line ${i} edited` : undefined));
const gaveUp = rowsOf(buildDiffRows(before, after, { timeout: 1 }));
eq([gaveUp.length, gaveUp.every((r) => r.type === 'changed'), gaveUp[2999].leftNo, gaveUp[2999].rightNo], [3000, true, 3000, 3000], 'timeout: old beside new');
eq(gaveUp[0].words?.right, [{ text: 'line 1', changed: false }, { text: ' edited', changed: true }], 'timeout: lines that line up still get word parts');
eq(countChanges(before, after), { added: 3000, removed: 3000 }, 'timeout: counts from the same diff');
eq(shape(buildDiffRows(lines(3000), lines(2000, (i) => `x${i}`), { timeout: 1 })).slice(1999, 2001), ['changed 2000|2000', 'removed 2001|-'], 'timeout: uneven lengths');
// the cache keeps the diffs used last (the counts above came from it): a hit moves to the front
for (let k = 0; k < 20; k++) countChanges(`a${k}\n`, `b${k}\n`);
eq(countChanges(before, after), { added: 3000, removed: 3000 }, 'cache: still there after 20 other files');
for (let k = 20; k < 40; k++) countChanges(`a${k}\n`, `b${k}\n`);
eq(countChanges(before, after), { added: 3000, removed: 3000 }, 'cache: a hit moves to the front');

// speed: 30 scattered edits in 5,000 lines
const big = lines(5000, (i) => `Line ${i} with some \\textbf{words} and $x_${i}$.`);
const edited = lines(5000, (i) => (i % 166 === 83 ? `Line ${i} with some \\emph{terms} and $x_${i}$.` : `Line ${i} with some \\textbf{words} and $x_${i}$.`));
const start = performance.now();
const scattered = buildDiffRows(big, edited);
const ms = performance.now() - start;
eq([rowsOf(scattered).filter((r) => r.type === 'changed').length, scattered.filter((it) => it.type === 'fold').length], [30, 31], '30 edits, 31 folds');
if (ms > 200) throw new Error(`30 edits in 5,000 lines took ${Math.round(ms)} ms`);
console.log('diff.check: ok');
