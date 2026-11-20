// The claims ledger in words. Run: bundle with esbuild (see .claude/stages/RULES.md) and run with node.
import type { ClaimRow } from '../../api/client';
import { claimTodo, ledgerCounts, ledgerMarkdown, ordered, readLine } from './claims';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const claim = (c: Partial<ClaimRow>): ClaimRow => ({ id: 'x', text: 'A claim', file: 'main.tex', line: 1, keys: [], rating: 'supported', createdAt: '2026-11-20T03:00:00.000Z', ...c });

const supported = claim({ id: 'a', line: 12, keys: ['Vaswani2017'], quote: 'a new state-of-the-art BLEU score of 28.4', read: { kind: 'full text', page: 8, where: 'https://arxiv.org/pdf/1706.03762' } });
const unsupported = claim({ id: 'b', line: 30, rating: 'unsupported', text: 'Most findings | are false', quote: 'We investigated a consecutive series of children', read: { kind: 'abstract', where: 'https://doi.org/10.1/x' }, note: 'About something else.' });
const needs = claim({ id: 'c', file: 'intro.tex', line: 2, rating: 'needs-source', text: 'Nobody has done this before' });

eq(readLine(supported.read!), 'Full text, page 8', 'a page');
eq(readLine(unsupported.read!), 'Abstract only', 'the abstract');
eq(ordered([unsupported, needs, supported]).map((c) => c.id), ['c', 'a', 'b'], 'by file and line');
eq(ordered([supported, needs, unsupported], true).map((c) => c.id), ['b', 'c', 'a'], 'problems first');
eq(ledgerCounts([supported, unsupported, needs, claim({})]), ['1 unsupported', '1 needs a source', '2 supported'], 'counts');
eq(ledgerMarkdown([unsupported, supported]).split('\n'), [
  '| Where | Claim | Keys | Rating | Quote | Read in | Note | Checked |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| main.tex:12 | A claim | Vaswani2017 | Supported | “a new state-of-the-art BLEU score of 28.4” | Full text, page 8, https://arxiv.org/pdf/1706.03762 |  | 2026-11-20 |',
  '| main.tex:30 | Most findings \\| are false |  | Unsupported | “We investigated a consecutive series of children” | Abstract only, https://doi.org/10.1/x | About something else. | 2026-11-20 |',
  ''
], 'the table, its evidence kept and a | escaped');
eq(claimTodo(unsupported), { text: 'Unsupported: “Most findings | are false” About something else.', link: { file: 'main.tex', line: 30 } }, 'a to-do at its line');
console.log('claims.check.ts: ok');
