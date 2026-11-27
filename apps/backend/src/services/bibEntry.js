// One .bib entry as the References card edits it, { type, key, fields }, and the text it is written as. No Node
// imports: the card in the frontend previews an entry with the same code that writes it.

/**
 * The entry types the card offers, each with the fields it shows, in order (Biber's own names where BibTeX has
 * another: written for classic BibTeX by formatEntry).
 */
export const ENTRY_TYPES = [
  ['article', 'Article', ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages', 'doi', 'eprint', 'url']],
  ['inproceedings', 'Conference paper', ['author', 'title', 'booktitle', 'year', 'pages', 'publisher', 'address', 'doi', 'url']],
  ['book', 'Book', ['author', 'editor', 'title', 'edition', 'publisher', 'address', 'year', 'isbn', 'series', 'volume', 'doi', 'url']],
  ['inbook', 'Part of a book', ['author', 'title', 'booktitle', 'chapter', 'pages', 'editor', 'edition', 'publisher', 'address', 'year', 'isbn']],
  ['incollection', 'Chapter in a collection', ['author', 'title', 'booktitle', 'editor', 'chapter', 'pages', 'edition', 'publisher', 'address', 'year', 'isbn']],
  ['manual', 'Manual or datasheet', ['title', 'organization', 'author', 'version', 'edition', 'year', 'url', 'urldate']],
  ['software', 'Software', ['author', 'title', 'version', 'year', 'url', 'doi']],
  ['online', 'Web page', ['author', 'title', 'organization', 'date', 'url', 'urldate']],
  ['report', 'Report or standard', ['author', 'title', 'type', 'institution', 'number', 'year', 'url', 'doi']],
  ['thesis', 'Thesis', ['author', 'title', 'type', 'institution', 'year', 'url', 'doi']],
  ['misc', 'Other', ['author', 'title', 'howpublished', 'year', 'url', 'note']]
].map(([id, label, fields]) => ({ id, label, fields }));

export const FIELD_LABELS = {
  author: 'Authors', editor: 'Editors', title: 'Title', journal: 'Journal', booktitle: 'Book or proceedings', chapter: 'Chapter',
  edition: 'Edition', version: 'Version', type: 'Kind', year: 'Year', date: 'Date', organization: 'Organisation', volume: 'Volume',
  number: 'Number', series: 'Series', pages: 'Pages', publisher: 'Publisher', institution: 'Institution', school: 'School',
  address: 'Place', isbn: 'ISBN', doi: 'DOI', eprint: 'arXiv ID', howpublished: 'How published', url: 'URL', urldate: 'Accessed',
  note: 'Note'
};

/** What a field holds, shown in an empty box */
export const FIELD_HINTS = {
  author: 'Surname, Given and Surname, Given', editor: 'Surname, Given and …', year: '2026', date: '2026-11-27', urldate: '2026-11-27',
  pages: '42--45', edition: '4', isbn: '978-0-262-04630-5', doi: '10.…', url: 'https://…', eprint: '1706.03762'
};

/** The fields shown for a type, then any other the entry holds, so nothing it writes is hidden */
export function fieldsShown(type, fields = {}) {
  const own = ENTRY_TYPES.find((t) => t.id === type)?.fields || ENTRY_TYPES.at(-1).fields;
  return [...own, ...Object.keys(fields).filter((name) => !own.includes(name) && String(fields[name] ?? '').trim())];
}

// what a key may hold: not what ends one in an entry's head, nor TeX's specials
export const VALID_KEY = /^[^,\s{}()"=#%~\\]+$/;
const FIELD_NAME = /^[A-Za-z][\w:-]*$/;
// written as they are: TeX's specials mean nothing there
const VERBATIM = new Set(['url', 'doi', 'eprint', 'urldate', 'isbn', 'issn', 'file', 'archiveprefix', 'primaryclass', 'howpublished']);

// the order fields are written in; others follow in the order they came
const ORDER = ['author', 'editor', 'title', 'journal', 'journaltitle', 'booktitle', 'chapter', 'edition', 'version', 'type', 'year', 'date', 'month',
  'organization', 'volume', 'number', 'series', 'pages', 'publisher', 'institution', 'school', 'location', 'address', 'isbn', 'issn', 'doi',
  'howpublished', 'url', 'urldate', 'eprint', 'archiveprefix', 'primaryclass', 'note'];

/** & % # _ typed bare are escaped (not inside $…$, nor one escaped already), so a hand-typed title compiles */
export const texValue = (name, value) => (VERBATIM.has(name.toLowerCase()) ? value
  : value.split(/(\$[^$]*\$)/).map((part, i) => (i % 2 ? part : part.replace(/(?<!\\)[&%#_]/g, '\\$&'))).join(''));

export function bracesBalanced(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') i++;
    else if (value[i] === '{') depth++;
    else if (value[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

const rename = (f, map) => {
  for (const [from, to] of Object.entries(map)) {
    if (f[from] != null && f[to] == null) f[to] = f[from];
    delete f[from];
  }
};

/**
 * The entry as text. biblatex: Biber's types and field names (@online, @software, @thesis with its type, journaltitle,
 * location, date); otherwise classic BibTeX's (@misc, @phdthesis, journal, address, year), an access date and a version
 * in note. legacyUrls: a classic style that ignores url, so a web page's address goes in howpublished.
 */
export function formatEntry({ type, key, fields }, { biblatex = false, legacyUrls = false } = {}) {
  const f = {};
  for (const [name, value] of Object.entries(fields || {})) {
    const v = String(value ?? '').trim();
    if (v) f[name] = texValue(name, v);
  }
  let head = type;
  if (biblatex) {
    rename(f, { journal: 'journaltitle', address: 'location', school: 'institution' });
    if (type === 'thesis' || type === 'report') f.type ??= type === 'thesis' ? 'phdthesis' : 'techreport';
    if (type === 'thesis' && /master/i.test(f.type)) f.type = 'mathesis';
    if (f.year && !f.date) f.date = f.year;
    if (f.date) delete f.year;
  } else {
    rename(f, { journaltitle: 'journal', location: 'address' });
    if (type === 'thesis') {
      head = /master|^ma/i.test(f.type || '') ? 'mastersthesis' : 'phdthesis';
      rename(f, { institution: 'school' });
      delete f.type;
    } else {
      head = { online: 'misc', software: 'misc', report: 'techreport' }[type] || type;
    }
    if (!f.year && /^\d{4}/.test(f.date || '')) f.year = f.date.slice(0, 4);
    const notes = [f.version && `Version ${f.version}`, f.urldate && `Accessed ${f.urldate}`].filter(Boolean);
    if (notes.length && !f.note) {
      f.note = notes.join('. ');
      delete f.urldate;
    }
    if (legacyUrls && (type === 'online' || type === 'software') && f.url) {
      f.howpublished ??= `\\url{${f.url}}`;
      delete f.url;
    }
  }
  const rank = (name) => (ORDER.includes(name.toLowerCase()) ? ORDER.indexOf(name.toLowerCase()) : ORDER.length);
  const entries = Object.entries(f).sort(([a], [b]) => rank(a) - rank(b));
  const width = Math.max(0, ...entries.map(([name]) => name.length));
  return `@${head}{${key},\n${entries.map(([name, value]) => `  ${name.padEnd(width)} = {${value}},`).join('\n')}\n}`;
}

/** First author's surname and the year, as the lookups key an entry: `Cormen2022` */
export function suggestKey(fields = {}) {
  // a manual or a web page with no author goes under its organisation
  const first = String(fields.author || fields.editor || fields.organization || '').split(/\s+and\s+/i)[0].trim().replace(/^\{(.*)\}$/, '$1');
  const surname = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).at(-1) || '';
  const stem = (surname || String(fields.title || '').split(/\s+/).find((w) => w.length > 3) || 'Ref')
    .normalize('NFD').replace(/[^A-Za-z]/g, '');
  const year = String(fields.year || fields.date || '').match(/\d{4}/)?.[0] || '';
  return (stem.charAt(0).toUpperCase() + stem.slice(1) || 'Ref') + year;
}

/**
 * What stops a draft being written: { key?, fields: { name: message } }, empty when nothing does. taken: the project's
 * keys, lower-cased. key '' stands for the suggested one.
 */
export function draftProblems({ type, key, fields } = {}, taken = new Set()) {
  const out = { fields: {} };
  const k = key || suggestKey(fields);
  if (!VALID_KEY.test(k)) out.key = 'A key can’t hold spaces or any of , { } ( ) " = # % ~ \\';
  else if (taken.has(k.toLowerCase())) out.key = `${k} is already used in the project`;
  if (!/^[A-Za-z]+$/.test(String(type || ''))) out.type = 'Choose an entry type';
  for (const [name, value] of Object.entries(fields || {})) {
    if (!FIELD_NAME.test(name)) out.fields[name] = 'Not a field name';
    else if (typeof value !== 'string') out.fields[name] = 'Not text';
    else if (value.length > 20_000) out.fields[name] = 'Too long';
    else if (!bracesBalanced(value)) out.fields[name] = 'Each { needs its }';
  }
  if (!String(fields?.title || '').trim()) out.fields.title ??= 'Give the entry a title';
  return out;
}

export const hasProblems = (p) => Boolean(p.key || p.type || Object.keys(p.fields).length);
