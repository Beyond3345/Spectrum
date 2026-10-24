// Self-check for Research's display helpers (the backend merges the results; test/research.test.js checks that) and
// the shared reply and citation helpers it uses. Run:
// npx esbuild apps/frontend/src/editor/research/research.check.ts --bundle --platform=node --log-level=warning | node
import type { ResearchResult, ResearchRun } from '../../api/client';
import { citationCommand, parseJsonReply } from '../shared';
import { badges, counts, filtersLine, keptToAdd, metaLine, runLine, shown, yearOf } from './results';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

eq(parseJsonReply('Here: {"items":[{"title":"Braces } [ in text"}]} trailing {"ignored":true}'), { items: [{ title: 'Braces } [ in text' }] }, 'balanced extraction uses the first complete reply');
eq(parseJsonReply('```json\n{"text":"line\nbreak"}\n```'), { text: 'line\nbreak' }, 'literal newlines from a model are still repaired');
eq(parseJsonReply('{"files":[{"content":"truncated'), null, 'incomplete instructions stay rejected');

eq(citationCommand('\\usepackage[backend=biber,style=apa]{biblatex}'), '\\parencite', 'APA uses parenthetical citations');
eq(citationCommand('\\usepackage{acl}\n\\addbibresource{custom.bib}'), '\\parencite', 'APA styles loaded through another package');
eq(citationCommand('\\usepackage[round]{natbib}'), '\\citep', 'natbib keeps its compatible command');
eq(citationCommand('% \\usepackage{biblatex}\n\\bibliography{references}'), '\\cite', 'traditional projects keep their citation command');

const result = (id: string, extra: Partial<ResearchResult> = {}): ResearchResult => ({ id, title: id, sources: ['openalex'], ...extra });

eq(metaLine({ authors: ['A One', 'B Two', 'C Three', 'D Four'], year: '2017', venue: 'NeurIPS' }), 'A One, B Two, C Three et al. · 2017 · NeurIPS', 'three authors, then et al.');
eq(metaLine({ authors: [], venue: 'Nature' }), 'Nature', 'only what there is');

eq(
  badges(result('a', { sources: ['openalex', 'arxiv', 'bib'], citations: 1234, openAccess: 'https://arxiv.org/pdf/1', preprint: true, inBib: 'Vaswani2017' })).map((b) => b.label),
  ['In .bib as Vaswani2017', 'OpenAlex', 'arXiv', '1,234 citations', 'Open access', 'Preprint'],
  'the .bib key first, the .bib itself not repeated as a source'
);
eq(badges(result('b', { citations: 1 })).map((b) => b.label), ['OpenAlex', '1 citation'], 'one citation');
eq(badges(result('c', { citations: 0 })).map((b) => b.label), ['OpenAlex', '0 citations'], 'none counted is still a count');
eq(badges(result('d', { preprint: false })).map((b) => b.label), ['OpenAlex'], 'known as published: no preprint badge');

const run: ResearchRun = {
  at: '2026-10-25T00:00:00.000Z',
  queries: ['attention'],
  perSource: { pubmed: { count: 0, error: 'PubMed returned 500.' }, openalex: { count: 10 }, bib: { count: 2 } },
  filters: { yearFrom: 2017, yearTo: 2020, preprints: false },
  triage: { count: 12 }
};
eq(runLine(run), 'OpenAlex 10 · PubMed failed (PubMed returned 500.) · .bib 2 · AI sorted 12', 'sources in the chips’ order, failures said');
eq(filtersLine(run), '2017–2020, no preprints', 'both years and the preprints');
eq(filtersLine({ ...run, filters: { yearFrom: 2019 } }), 'from 2019', 'only a first year');
eq(filtersLine({ ...run, filters: undefined }), '', 'no filters');

const results = [
  result('dropped', { decision: 'drop', title: 'Graph networks' }),
  result('kept', { decision: 'keep', title: 'Attention', abstract: 'Self-attention for sequences' }),
  result('open', { title: 'Transformers', theme: 'Sequence models' }),
  result('cited', { decision: 'keep', inBib: 'Smith2020', title: 'Sorting' })
];
eq(counts(results), { all: 4, keep: 2, drop: 1, undecided: 1 }, 'counts per filter');
eq(shown(results, 'all', '').map((r) => r.id), ['kept', 'open', 'cited', 'dropped'], 'in All, the dropped ones go last');
eq(shown(results, 'keep', '').map((r) => r.id), ['kept', 'cited'], 'kept only');
eq(shown(results, 'undecided', '').map((r) => r.id), ['open'], 'not decided yet');
eq(shown(results, 'all', 'SEQUENCE').map((r) => r.id), ['kept', 'open'], 'the search looks in abstracts and themes, in any case');
eq(shown(results, 'all', 'smith2020').map((r) => r.id), ['cited'], 'and in the .bib key');
eq(keptToAdd(results).map((r) => r.id), ['kept'], 'Add kept to .bib leaves out what the .bib has');

eq([yearOf('2017'), yearOf(' 1999 '), yearOf('17'), yearOf('20177'), yearOf(''), yearOf('0999')], [2017, 1999, undefined, undefined, undefined, undefined], 'whole years only');

console.log('research.check: ok');
