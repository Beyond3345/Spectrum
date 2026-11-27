// Self-check for the References card's draft and the Assistant's suggestion card: the boxes a draft shows follow its
// type and keep any field it holds; what stops an Add; the preview is the entry as written, for Biber or BibTeX; the
// badge says where a draft came from; a suggestion's lines added and removed, and where. Run:
// npx esbuild apps/frontend/src/editor/referenceDraft.check.ts --bundle --platform=node --loader:.svg=text --loader:.css=empty --log-level=warning | node
import { applyEdition, draftProblems, editionLabel, formatEntry, hasProblems, suggestKey } from '../../../backend/src/services/bibEntry.js';
import { cardFields, sourceBadge } from './ReferenceDraftCard';
import { changeStat } from './shared';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const names = (type: string, fields: Record<string, string> = {}) => cardFields({ type, key: '', fields }).map((f) => f.name);

// ─── The boxes, by type ───

eq(names('book'), ['year', 'title', 'author', 'editor', 'edition', 'publisher', 'address', 'isbn', 'series', 'volume', 'doi', 'url'], 'a book: year first, then title and authors');
eq(names('inbook'), ['year', 'title', 'author', 'booktitle', 'chapter', 'pages', 'editor', 'edition', 'publisher', 'address', 'isbn'], 'part of a book: its chapter and pages');
eq(names('manual'), ['year', 'title', 'author', 'organization', 'version', 'edition', 'url', 'urldate'], 'a manual: organisation and version');
eq(names('online'), ['date', 'title', 'author', 'organization', 'url', 'urldate'], 'a web page: its date in the year’s place');
eq(names('software', { title: 'NumPy', isbn: '9780262046305', note: '' }), ['year', 'title', 'author', 'version', 'url', 'doi', 'isbn'], 'a field the type lacks but the entry holds stays shown');
eq(names('booklet', { title: 'T', howpublished: 'Print' }), ['year', 'title', 'author', 'howpublished', 'url', 'note'], 'a pasted type the card has no pills for: Other’s boxes');
eq(cardFields({ type: 'article', key: '', fields: {} }).filter((f) => f.wide).map((f) => f.name), ['title', 'author', 'journal', 'url'], 'the wide boxes');
eq(cardFields({ type: 'article', key: '', fields: {} })[2].label, 'Authors (separated by “and”)', 'the authors’ label says how to list them');

// ─── What stops an Add, and the key it goes in under ───

const keys = new Set(['cormen2022']);
const book = { type: 'book', key: '', fields: { title: 'Introduction to Algorithms', author: 'Cormen, Thomas H.', year: '2022' } };
eq(suggestKey(book.fields), 'Cormen2022', 'the suggested key');
eq(draftProblems(book, keys).key, 'Cormen2022 is already used in the project', 'a blank key stands for the suggested one, which is taken');
eq(hasProblems(draftProblems({ ...book, key: 'Cormen2022b' }, keys)), false, 'another key: nothing stops it');
eq(hasProblems(draftProblems({ ...book, key: 'Cormen2022b', fields: { ...book.fields, title: 'Open {brace' } }, keys)), true, 'an unbalanced brace stops it');
eq(hasProblems(draftProblems({ ...book, key: 'K', fields: { author: 'X' } }, keys)), true, 'no title stops it');

// ─── The preview, for Biber and for BibTeX ───

const draft = { type: 'online', key: 'Typst2024', fields: { title: 'Typst & docs', url: 'https://typst.app/docs', urldate: '2026-11-27', date: '2024-05-01' } };
eq(formatEntry(draft, { biblatex: true }), '@online{Typst2024,\n  title   = {Typst \\& docs},\n  date    = {2024-05-01},\n  url     = {https://typst.app/docs},\n  urldate = {2026-11-27},\n}', 'Biber: @online');
eq(formatEntry(draft, { biblatex: false }), '@misc{Typst2024,\n  title = {Typst \\& docs},\n  year  = {2024},\n  date  = {2024-05-01},\n  url   = {https://typst.app/docs},\n  note  = {Accessed 2026-11-27},\n}', 'BibTeX: @misc, the access date in note');

// ─── The badge ───

eq(sourceBadge({ source: 'Open Library' }), { text: 'Found on Open Library', tone: 'success' }, 'a source that had it');
eq(sourceBadge({ source: 'the BibTeX you pasted' }), { text: 'From the BibTeX you pasted', tone: 'success' }, 'pasted');
eq(sourceBadge({ source: 'the citation as pasted', verified: false }), { text: 'Not found online · kept as pasted', tone: 'warning' }, 'no source had it');
eq(sourceBadge({ source: 'manual' }), { text: 'New entry', tone: 'accent' }, 'a blank entry');

// ─── A book's edition, chosen in the card ───

const fourth = { isbn: '9780262046305', year: '2022', publisher: 'MIT Press', place: 'Cambridge, MA', edition: '4', format: 'Hardcover', source: 'Open Library' };
const third = { isbn: '9780262033848', year: '2009', publisher: 'MIT Press', place: '', edition: '3', format: '', source: 'Google Books' };
eq(editionLabel(fourth), '2022 · 4th ed. · MIT Press · Hardcover · 9780262046305', 'the menu’s row');
eq(editionLabel({ ...third, edition: 'Rev. ed' }), '2009 · Rev. ed · MIT Press · 9780262033848', 'an edition statement that is no number');
const picked = applyEdition({ ...book, key: 'Cormen2022', fields: { ...book.fields, edition: '4', address: 'Cambridge, MA', isbn: fourth.isbn } }, third);
eq([picked.key, picked.fields.year, picked.fields.edition, picked.fields.isbn, picked.fields.address], ['Cormen2009', '2009', '3', third.isbn, undefined], 'the edition’s details, and the suggested key follows its year');
eq(applyEdition({ ...book, key: 'Mine' }, third).key, 'Mine', 'a key typed by hand stays');
eq(applyEdition(book, third).key, '', 'a blank key stays blank: it is still the suggested one');

// ─── A suggestion's lines ───

eq(changeStat([{ original: 'a\nb\nc\nd\n', proposed: 'a\nB\nc\nd\nE\n' }]), { added: 2, removed: 1, from: 2, to: 5 }, 'lines 2 to 5 of the new text');
eq(changeStat([{ original: 'a\n', proposed: 'b\n' }, { original: 'x\ny\n', proposed: 'x\n' }]), { added: 1, removed: 2, from: 1, to: 1 }, 'two files: counted together, the first file’s place');

console.log('referenceDraft.check: ok');
