// Review’s References exist in words. Run: bundle with esbuild (see .claude/stages/RULES.md) and run with node.
import type { ReferenceCheckRow } from '../../api/client';
import { checkCounts, checkHead, checkReport, dateWords, existRead } from './referenceWords';

const assert = {
  equal: (actual: unknown, expected: unknown) => {
    if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  deepEqual: (actual: unknown, expected: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const row = (r: Partial<ReferenceCheckRow>): ReferenceCheckRow => ({ key: 'K', file: 'refs.bib', line: 1, title: '', status: 'found', ...r });

assert.equal(dateWords('2010-02-06'), '6 February 2010');
assert.equal(dateWords('2010-02'), 'February 2010');
assert.equal(dateWords(''), '');

const retracted = row({ key: 'Wakefield1998', status: 'retracted', retraction: { label: 'Retraction', date: '2010-02-06', url: 'https://doi.org/10.1016/x', from: 'Retraction Watch, through Crossref' }, read: { from: 'Crossref', url: 'https://doi.org/10.1016/y' } });
assert.equal(checkHead(retracted), 'Wakefield1998 was retracted on 6 February 2010');
assert.equal(checkHead(row({ status: 'retracted', retraction: { label: 'Withdrawal', url: '', from: 'OpenAlex' } })), 'K was withdrawn');
const differs = row({ key: 'Ioannidis2005', line: 9, status: 'differs', differences: [{ field: 'year', bib: '2015', record: '2005' }] });
assert.equal(checkHead(differs), 'Ioannidis2005: the year differs from the record');
assert.equal(checkHead(row({ status: 'differs', differences: [{ field: 'title', bib: 'a', record: 'b' }, { field: 'first author', bib: 'c', record: 'd' }, { field: 'year', bib: '1', record: '2' }] })), 'K: the title, first author and year differ from the record');
assert.equal(checkHead(row({ status: 'not-found' })), 'K was not found');

const rows = [retracted, differs, row({ status: 'found' }), row({ status: 'found' })];
assert.deepEqual(checkCounts(rows), ['1 retracted', '1 differs', '2 found']);
// the report keeps the evidence: both sides of a difference, the notice and where each record was read
assert.deepEqual(checkReport(rows), [
  '- Wakefield1998 was retracted on 6 February 2010 (refs.bib:1)',
  '  - Retraction, from Retraction Watch, through Crossref: https://doi.org/10.1016/x',
  '  - Read at Crossref: https://doi.org/10.1016/y',
  '- Ioannidis2005: the year differs from the record (refs.bib:9)',
  '  - year: “2015” in the .bib, “2005” in the record',
  '- 2 entries were found as they are.'
]);
// which .bib files were read is said, and why none were, so 0 entries is never left bare
assert.equal(existRead({ bibFiles: ['research-probe.bib'] }), 'Read research-probe.bib.');
assert.equal(existRead({ bibFiles: [], note: 'main.tex loads references.bib, which is not in the project.' }), 'main.tex loads references.bib, which is not in the project.');
assert.equal(existRead({ bibFiles: ['a.bib', 'b.bib'], note: 'x' }), 'Read a.bib, b.bib. x');
console.log('referenceWords.check.ts: ok');
