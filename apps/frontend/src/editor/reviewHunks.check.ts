// Self-check for reviewing a change one part at a time. Run:
// npx esbuild apps/frontend/src/editor/reviewHunks.check.ts --bundle --platform=node --log-level=warning | node
import { build, editText, editedLines, hunksOf, renames, review, sections, settle, target, toLines, where } from './reviewHunks';
import type { Hunk, Review } from './reviewHunks';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const doc = (n: number, edit: (i: number) => string | null | undefined = () => undefined, eol = '\n') =>
  Array.from({ length: n }, (_, k) => edit(k + 1))
    .map((line, k) => (line === null ? '' : `${line ?? `line ${k + 1}`}${eol}`))
    .join('');
/** the file after `picked` of the review's changes are applied, and what is then left to review */
const applied = (r: Review, picked: Hunk[]) => {
  const done = settle(r, { apply: picked });
  return { ...done, text: done.content ?? r.mine.join('') };
};

// ─── splitting, and a file built from the original plus the chosen changes ───
const tex = '\\section{Intro}\nWe show that the gain is large.\n\n\\section{Method}\nAs shown in \\citep{Lee2021}, the error is one that\ndecreases in a manner that is monotonic.\n\n\\section{Results}\nThe results are good.\n';
const texNew = '\\section{Intro}\nWe show that the gain is substantial.\n\n\\section{Method}\nAs shown in \\parencite{Lee2021}, the error $e_k$ decreases monotonically.\n\n\\section{Results}\nThe results are good.\nThey hold on all three sets.\n';
const r = review(tex, tex, texNew);
eq(r.hunks.map((h) => [h.start, h.end, h.lines.length]), [[1, 2, 1], [4, 6, 1], [9, 9, 1]], 'three separate changes');
eq(r.hunks.map(where), ['Line 2', 'Lines 5 to 6', 'After line 9'], 'where each is');
eq(where({ start: 0, end: 0, lines: ['x\n'] }), 'At the top', 'an insertion at the top');
eq(target(r), texNew, 'every change taken is the proposal');
eq(applied(r, []).text, tex, 'none taken is the original');
eq(settle(r, { apply: [] }).content, undefined, 'nothing to write when none is applied');
eq(applied(r, [r.hunks[1]]).text, tex.replace('\\citep{Lee2021}, the error is one that\ndecreases in a manner that is monotonic.', '\\parencite{Lee2021}, the error $e_k$ decreases monotonically.'), 'the middle change alone');

// what is left stays pending against the new original, each change still its own
const one = applied(r, [r.hunks[1]]);
eq([one.original, one.proposed], [one.text, texNew], 'the written file is the new original');
const rest = review(one.original, one.text, one.proposed);
eq(rest.hunks.map(where), ['Line 2', 'After line 8'], 'the other two, moved up a line');
eq(applied(rest, rest.hunks).text, texNew, 'and applying them completes the proposal');

// rejecting one takes it out of the proposal, the file untouched
const no = settle(r, { reject: [r.hunks[0]] });
eq([no.content, no.original], [undefined, tex], 'a rejection writes nothing');
eq(review(no.original, tex, no.proposed).hunks.map(where), ['Lines 5 to 6', 'After line 9'], 'the rejected change is gone from the review');
eq(settle(r, { reject: r.hunks }).proposed, tex, 'all rejected: nothing left');

// an edited change: the edited text is what apply writes, with the line end the agent's line had
eq(editText(r.hunks[1]), 'As shown in \\parencite{Lee2021}, the error $e_k$ decreases monotonically.', 'the editor shows the proposed lines');
const typed = editedLines(r, r.hunks[1], 'As \\textcite{Lee2021} show,\nthe error falls.');
eq(typed, ['As \\textcite{Lee2021} show,\n', 'the error falls.\n'], 'typed lines get their line ends');
const edited = settle(r, { apply: [r.hunks[1]], lines: new Map([[r.hunks[1], typed]]) });
eq(edited.content?.split('\n').slice(4, 6), ['As \\textcite{Lee2021} show,', 'the error falls.'], 'the edit is written');
eq(review(edited.original, edited.content!, edited.proposed).hunks.length, 2, 'and the edited change is not offered again');

// every subset of a long file's many changes gives the lines it should, and the rest stays reviewable
const long = doc(3000);
const longNew = doc(3000, (i) => (i % 60 === 0 ? `changed ${i}` : i % 250 === 0 ? null : i % 333 === 0 ? `line ${i}\nadded after ${i}` : undefined));
const big = review(long, long, longNew);
// 50 lines changed, 10 removed, 9 added after, and lines 999 and 1000 are one change
eq(big.hunks.length, 68, 'the changes of a long file');
let seed = 7;
const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
for (let round = 0; round < 20; round++) {
  const picked = big.hunks.filter(() => random() < 0.5);
  const done = applied(big, picked);
  const lines = toLines(done.text);
  eq(lines.length, 3000 + picked.reduce((n, h) => n + h.lines.length - (h.end - h.start), 0), `round ${round}: the line count`);
  const left = review(done.original, done.text, done.proposed);
  eq(left.hunks.length, big.hunks.length - picked.length, `round ${round}: the rest is still pending`);
  eq(applied(left, left.hunks).text, longNew, `round ${round}: the rest completes the proposal`);
}

// Typst, Markdown and CJK text: lines are whole, whatever is in them
const typ = '= 引言\n本文提出一種新方法。\n\n== 方法\n我們使用 $x^2$ 來估計。\n結果見 @fig:a。\n';
const typNew = '= 引言\n本文提出一種新的方法。\n\n== 方法\n我們使用 $x^2 + 1$ 來估計。\n結果見 @fig:a。\n';
const t = review(typ, typ, typNew);
eq(t.hunks.length, 2, 'two changes in a Typst file with CJK text');
eq(applied(t, [t.hunks[1]]).text, typ.replace('$x^2$', '$x^2 + 1$'), 'the second alone');
eq(sections('main.typ', t), ['引言', '方法'], 'each under its Typst heading');
const md = '# Title\n\nSome *text* here.\n\n## 結果 ##\n\n- one\n- two\n';
const m = review(md, md, md.replace('*text*', '**text**').replace('- two\n', '- two\n- three\n'));
eq(sections('notes.md', m), ['Title', '結果'], 'each under its Markdown heading');
eq(sections('sections/method.tex', r), ['Intro', 'Method', 'Results'], 'each under its LaTeX section');
eq(sections('refs.bib', r), ['', '', ''], 'no sections in other files');
eq(sections('a.tex', review('\\section{A \\emph{b}}\\label{s}\nx\n', '\\section{A \\emph{b}}\\label{s}\nx\n', '\\section{A \\emph{b}}\\label{s}\ny\n')), ['A \\emph{b}'], 'a heading with braces and a label after it');

// a new file and a deleted file are one change each
const created = review('', '', 'a\nb\n');
eq(created.hunks, [{ start: 0, end: 0, lines: ['a\n', 'b\n'] }], 'a new file');
eq(applied(created, created.hunks).text, 'a\nb\n', 'a new file applied');
const deleted = review('a\nb\n', 'a\nb\n', '');
eq([deleted.hunks.length, applied(deleted, deleted.hunks).text], [1, ''], 'a deleted file');
eq([...renames([{ path: 'old.tex', kind: 'deleted', original: 'x\n', proposed: '' }, { path: 'new.tex', kind: 'created', original: '', proposed: 'x\n' }, { path: 'other.tex', kind: 'created', original: '', proposed: 'y\n' }])], [['new.tex', 'old.tex']], 'a renamed file is a new one with a deleted one’s text');

// the final newline: a change of its own line, and no subset joins two lines
const noEnd = review('a\nx\nb', 'a\nx\nb', 'A\nx\nb\nc\n');
eq(noEnd.hunks.map(where), ['Line 1', 'Line 3'], 'a line added after a last line with no newline');
eq(applied(noEnd, [noEnd.hunks[0]]).text, 'A\nx\nb', 'the first alone leaves the end as it was');
eq(applied(noEnd, [noEnd.hunks[1]]).text, 'a\nx\nb\nc\n', 'the second alone gives the last line its newline');
const cut = review('a\nb\n', 'a\nb\n', 'a\nb');
eq([cut.hunks.length, applied(cut, cut.hunks).text], [1, 'a\nb'], 'a final newline removed');
eq(editedLines(cut, cut.hunks[0], 'B'), ['B'], 'an edit of a last line with no newline gets none');
const gone = review('a\nb\nc\n', 'a\nb\nc\n', 'a\nc\n');
eq(editedLines(gone, gone.hunks[0], 'kept'), ['kept\n'], 'text typed where lines were removed gets a line end');

// line endings: the agent's change of them is one more change, and the others are told in the user's endings
const crlf = doc(6, undefined, '\r\n');
const lfNew = doc(6, (i) => (i === 2 ? 'two' : i === 5 ? 'five' : undefined));
const e = review(crlf, crlf, lfNew);
eq([e.hunks.length, e.eol], [2, { from: '\r\n', to: '\n' }], 'two changes and the line endings');
eq(applied(e, [e.hunks[0]]).text, doc(6, (i) => (i === 2 ? 'two' : undefined), '\r\n'), 'a change applied keeps the file’s endings');
const eolLeft = applied(e, [e.hunks[0]]);
eq([review(eolLeft.original, eolLeft.text, eolLeft.proposed).hunks.length, review(eolLeft.original, eolLeft.text, eolLeft.proposed).eol?.to], [1, '\n'], 'the other change and the endings stay pending');
eq(settle(e, { apply: e.hunks, eol: 'apply' }).content, lfNew, 'all of it applied is the proposal, byte for byte');
const kept = settle(e, { eol: 'reject' });
eq([kept.content, review(kept.original, crlf, kept.proposed).eol, review(kept.original, crlf, kept.proposed).hunks.length], [undefined, undefined, 2], 'the endings rejected, the changes stay');
eq(settle(e, { eol: 'apply' }).content, crlf.replace(/\r\n/g, '\n'), 'the endings alone');
// an editor that turned the file to LF while the agent kept CRLF: no change of endings to review
eq([review(crlf, crlf.replace(/\r\n/g, '\n'), crlf.replace('line 3', 'three')).eol, review(crlf, crlf.replace(/\r\n/g, '\n'), crlf.replace('line 3', 'three')).hunks.length], [undefined, 1], 'the user’s endings differ from the base’s');
// mixed endings are left alone: each line as it is
const mixed = review('a\r\nb\nc\n', 'a\r\nb\nc\n', 'a\nb\nC\n');
eq([mixed.eol, mixed.hunks.length, applied(mixed, [mixed.hunks[1]]).text], [undefined, 2, 'a\r\nb\nC\n'], 'mixed endings');

// ─── the user edited the file while the agent worked ───
const base = doc(20);
const theirs = doc(20, (i) => (i === 3 ? 'agent 3' : i === 10 ? 'agent 10' : i === 18 ? 'agent 18' : undefined));
// elsewhere: the agent's changes move onto the user's file, and their edits are kept
const elsewhere = doc(20, (i) => (i === 1 ? 'line 1\nmine, added' : i === 14 ? null : undefined));
const moved = review(base, elsewhere, theirs);
eq(moved.hunks.map((h) => [where(h), !!h.base]), [['Line 4', false], ['Line 11', false], ['Line 18', false]], 'the changes follow the user’s lines');
eq(applied(moved, [moved.hunks[1]]).text, elsewhere.replace('line 10\n', 'agent 10\n'), 'one applied, the user’s edits kept');
// the line next to the agent's change is not an overlap
const next = review(base, doc(20, (i) => (i === 4 ? 'mine 4' : undefined)), theirs);
eq(next.hunks.map((h) => !!h.base), [false, false, false], 'a user’s edit on the next line');
// the same lines: both versions, and four ways on
const mineText = doc(20, (i) => (i === 10 ? 'mine 10' : undefined));
const both = review(base, mineText, theirs);
const clash = both.hunks[1];
eq(both.hunks.map((h) => !!h.base), [false, true, false], 'the overlapping change is marked');
eq([both.mine.slice(clash.start, clash.end), clash.lines, clash.base], [['mine 10\n'], ['agent 10\n'], ['line 10\n']], 'the user’s lines, the agent’s and the base’s');
eq(applied(both, [clash]).text, mineText.replace('mine 10', 'agent 10'), 'take the agent’s');
const keepMine = settle(both, { reject: [clash] });
eq([keepMine.content, review(keepMine.original, mineText, keepMine.proposed).hunks.map((h) => !!h.base)], [undefined, [false, false]], 'keep mine: the file stays and the overlap is closed');
const inOrder = settle(both, { apply: [clash], lines: new Map([[clash, [...both.mine.slice(clash.start, clash.end), ...clash.lines]]]) });
eq(toLines(inOrder.content!).slice(9, 11), ['mine 10\n', 'agent 10\n'], 'take both, the user’s first');
eq(review(inOrder.original, inOrder.content!, inOrder.proposed).hunks.length, 2, 'and the overlap is closed');
// another change applied first: the overlap is still an overlap, with the user's lines untouched
const first = applied(both, [both.hunks[0]]);
const still = review(first.original, first.text, first.proposed);
eq([still.hunks.map((h) => !!h.base), toLines(first.text)[9]], [[true, false], 'mine 10\n'], 'the overlap stays marked after another change is applied');
// both made the same change: nothing left of it
eq(review(base, doc(20, (i) => (i === 10 ? 'agent 10' : undefined)), theirs).hunks.map(where), ['Line 3', 'Line 18'], 'the same change on both sides');
// both added lines at the same place, and the user deleted lines the agent changed
const added = review('a\nb\n', 'a\nmine\nb\n', 'a\ntheirs\nb\n');
eq([added.hunks.length, !!added.hunks[0].base, applied(added, added.hunks).text], [1, true, 'a\ntheirs\nb\n'], 'lines added at the same place');
const cutOut = review(base, doc(20, (i) => (i === 10 ? null : undefined)), theirs);
eq([cutOut.hunks[1].start === cutOut.hunks[1].end, cutOut.hunks[1].base], [true, ['line 10\n']], 'the user deleted the line the agent changed');
// the user's file gone, or made while the agent made one too
eq(review('a\n', '', 'A\n').hunks.map((h) => [!!h.base, h.lines]), [[true, ['A\n']]], 'the user deleted the file');
eq(review('', 'mine\n', 'theirs\n').hunks.map((h) => !!h.base), [true], 'both made the file');
eq(review('', 'same\n', 'same\n').hunks, [], 'both made the same file');

// build is what every result comes from: hunks left out keep the file's lines
eq(build(['a\n', 'b\n', 'c\n'], hunksOf('a\nb\nc\n', 'A\nb\nC\n'), (h) => (h.start ? h.lines : undefined)), 'a\nb\nC\n', 'build');

console.log('reviewHunks checks passed');
