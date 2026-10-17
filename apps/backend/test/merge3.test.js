// The three-way merge the mirror uses when a file changed on this computer and in the cloud copy since they last
// agreed. Each clean case is one git also merges cleanly, and where a repeated line makes the reading ambiguous it's a
// conflict. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from 'diff';
import { merge3, mergeText } from '../src/utils/merge3.js';

const doc = (...lines) => lines.join('\n') + '\n';
const paper = doc('\\section{One}', 'First paragraph.', '', '\\section{Two}', 'Second paragraph.', '', '\\section{Three}', 'Third paragraph.');

test('changes to separate paragraphs both go in', () => {
  assert.equal(
    merge3(paper, paper.replace('First paragraph.', 'First, edited here.'), paper.replace('Third paragraph.', 'Third, edited there.')),
    paper.replace('First paragraph.', 'First, edited here.').replace('Third paragraph.', 'Third, edited there.')
  );
});

test('changes to lines next to each other are a conflict, as in git', () => {
  assert.equal(merge3(doc('a', 'b', 'c', 'd'), doc('a', 'B', 'c', 'd'), doc('a', 'b', 'C', 'd')), null);
});

test('the same change on both sides goes in once', () => {
  const changed = paper.replace('Second', 'Changed');
  assert.equal(merge3(paper, changed, changed), changed);
});

test('a change partly the same on both sides merges only where the rest agrees', () => {
  // both changed b to X, and c to different text
  assert.equal(merge3(doc('a', 'b', 'c', 'd', 'e'), doc('a', 'X', 'Y', 'd', 'e'), doc('a', 'X', 'Z', 'd', 'e')), null);
  // both changed b to X, and only one changed f
  assert.equal(merge3(doc('a', 'b', 'c', 'd', 'e', 'f', 'g'), doc('a', 'X', 'c', 'd', 'e', 'F', 'g'), doc('a', 'X', 'c', 'd', 'e', 'f', 'g')), doc('a', 'X', 'c', 'd', 'e', 'F', 'g'));
});

test('lines the base repeats (\\end{itemize}, blank lines) keep each side’s change in its place', () => {
  const lists = doc('\\begin{itemize}', '\\item A', '\\end{itemize}', '', '\\begin{itemize}', '\\item B', '\\end{itemize}', '', 'End.');
  assert.equal(
    merge3(lists, lists.replace('\\item A\n', '\\item A\n\\item A2\n'), lists.replace('\\item B\n', '\\item B\n\\item B2\n')),
    lists.replace('\\item A\n', '\\item A\n\\item A2\n').replace('\\item B\n', '\\item B\n\\item B2\n')
  );
  const spaced = doc('One.', '', '', 'Two.', '', '', 'Three.');
  assert.equal(
    merge3(spaced, doc('One.', '', 'Inserted here.', '', 'Two.', '', '', 'Three.'), doc('One.', '', '', 'Two.', '', 'Inserted there.', '', 'Three.')),
    doc('One.', '', 'Inserted here.', '', 'Two.', '', 'Inserted there.', '', 'Three.')
  );
});

test('a repeated line one side deleted merges as in git: a conflict where the other changed it', () => {
  // here a double rule made single, there its first rule made \midrule
  assert.equal(merge3(doc('a & b \\\\', '\\hline', '\\hline', 'c & d \\\\'), doc('a & b \\\\', '\\hline', 'c & d \\\\'), doc('a & b \\\\', '\\midrule', '\\hline', 'c & d \\\\')), null);
  // a stray brace removed here, an argument edited there
  assert.equal(merge3(doc('\\foo{', '}', '}'), doc('\\foo{', '}'), doc('\\foo{x', '}', '}')), doc('\\foo{x', '}'));
});

test('the same change to a repeated line on both sides, next to another change on one, is a conflict, not made twice', () => {
  // both deleted one of three rules, and here the row above too: git keeps one rule, though both sides kept two
  assert.equal(merge3(doc('a & b \\\\', '\\hline', '\\hline', '\\hline', 'c & d \\\\'), doc('\\hline', '\\hline', 'c & d \\\\'), doc('a & b \\\\', '\\hline', '\\hline', 'c & d \\\\')), null);
  assert.equal(merge3(doc('\\caption{Results}', '}', '}', '}', '\\end{figure}'), doc('}', '}', '\\end{figure}'), doc('\\caption{Results}', '}', '}', '\\end{figure}')), null);
  // both added a third rule, and here the heading renamed: git gives four rules
  const table = (name, rules) => doc('\\toprule', `Name & ${name} \\\\`, ...Array(rules).fill('\\hline'), 'Ann & 3 \\\\');
  assert.equal(merge3(table('Score', 2), table('Mark', 3), table('Score', 3)), null);
});

test('a clean merge keeps, in order, each side’s added lines and the lines both kept, on random text of repeated lines', () => {
  let seed = 1; // mulberry32
  const rnd = () => {
    let t = (seed = (seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const words = ['\\item', '\\end{itemize}', '', '}', '\\hline', '\\midrule', 'x'];
  const text = (lines) => lines.map((line) => `${line}\n`).join('');
  const edit = (lines) => {
    const out = [...lines];
    for (let n = 1 + Math.floor(rnd() * 3); n--; ) {
      const at = Math.floor(rnd() * (out.length + 1));
      const r = rnd();
      if (r < 0.4) out.splice(at, 0, pick(words));
      else if (r < 0.7) out.splice(at, 1);
      else out.splice(at, 1, pick(words));
    }
    return text(out);
  };
  // a side's added lines, and the indexes of the base lines it kept, as the diff reads it
  const read = (base, side) => {
    const added = [];
    const kept = new Set();
    let at = 0;
    for (const part of diffLines(base, side)) {
      if (part.added) added.push(...part.value.match(/[^\n]*\n/g));
      else if (part.removed) at += part.count;
      else for (let k = 0; k < part.count; k++) kept.add(at++);
    }
    return { added, kept };
  };
  const within = (need, have) => need.reduce((from, line) => (from < 0 ? from : have.indexOf(line, from) + 1 || -1), 0) >= 0;
  for (let i = 0; i < 5000; i++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => pick(words));
    const base = text(lines);
    const [here, there] = [edit(lines), edit(lines)];
    const merged = merge3(base, here, there);
    if (merged === null) continue;
    const got = merged.match(/[^\n]*\n/g) || [];
    const [a, b] = [read(base, here), read(base, there)];
    const both = base.match(/[^\n]*\n/g).filter((_, k) => a.kept.has(k) && b.kept.has(k));
    assert.ok(within(a.added, got) && within(b.added, got) && within(both, got), JSON.stringify({ base, here, there, merged }));
  }
});

test('lines added at the start and at the end both go in', () => {
  assert.equal(merge3(doc('a', 'b', 'c'), doc('first', 'a', 'b', 'c'), doc('a', 'b', 'c', 'last')), doc('first', 'a', 'b', 'c', 'last'));
});

test('a file without a newline at its end keeps it that way', () => {
  assert.equal(merge3('a\nb\nc\nd\ne', 'A\nb\nc\nd\ne', 'a\nb\nc\nd\nE'), 'A\nb\nc\nd\nE');
});

test('Windows line ends on one side are no change, and the merge keeps this computer’s', () => {
  const base = Buffer.from(paper);
  const crlf = Buffer.from(paper.replace(/\n/g, '\r\n'));
  const cloud = Buffer.from(paper.replace('Second', 'Changed'));
  assert.equal(mergeText(base, crlf, cloud).toString(), paper.replace('Second', 'Changed').replace(/\n/g, '\r\n'));
  assert.equal(mergeText(base, cloud, crlf).toString(), paper.replace('Second', 'Changed'));
});

test('a Latin-1 file comes out byte for byte', () => {
  // \usepackage[latin1]{inputenc}: é is the byte 0xE9, which isn't UTF-8
  const lines = ['\\usepackage[latin1]{inputenc}', 'Caf\xe9.', '', ...Array.from({ length: 10 }, (_, i) => `Line ${i}.`), 'R\xe9sum\xe9.'];
  const bytes = (list) => Buffer.from(list.join('\n') + '\n', 'latin1');
  const here = lines.map((l) => (l === 'Line 2.' ? 'Line 2 \xe0 la maison.' : l));
  const there = lines.map((l) => (l === 'Line 8.' ? 'Line 8, na\xefve.' : l));
  const want = here.map((l) => (l === 'Line 8.' ? 'Line 8, na\xefve.' : l));
  assert.ok(mergeText(bytes(lines), bytes(here), bytes(there)).equals(bytes(want)));
});

test('a file with a NUL byte is binary, never merged', () => {
  const text = Buffer.from(paper);
  const binary = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(4), Buffer.from(paper)]);
  assert.equal(mergeText(text, binary, Buffer.from(paper.replace('Third', 'Changed'))), null);
  assert.equal(mergeText(binary, binary, binary), null);
});

test('a huge rewrite on both sides is a conflict, found quickly', () => {
  const lines = Array.from({ length: 20000 }, (_, i) => `@article{key${i}, title={Title ${i}}, year={20${i % 100}}},`);
  const base = lines.join('\n') + '\n';
  const local = lines.map((l, i) => (i % 2 ? l : `${l} %here`)).join('\n') + '\n';
  const cloud = lines.map((l, i) => (i % 3 === 1 ? `${l} %there` : l)).join('\n') + '\n';
  const started = Date.now();
  assert.equal(merge3(base, local, cloud), null);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
  // a big file with a few changes still merges
  const few = (tag, at) => lines.map((l, i) => (i === at ? `${l} ${tag}` : l)).join('\n') + '\n';
  assert.equal(merge3(base, few('%here', 100), few('%there', 15000)), lines.map((l, i) => (i === 100 ? `${l} %here` : i === 15000 ? `${l} %there` : l)).join('\n') + '\n');
});
