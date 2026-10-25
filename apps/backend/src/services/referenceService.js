// References chat: DOI / arXiv / link / title → BibTeX appended to the project's .bib.
import { promises as fs } from 'fs';
import { lookup as dnsLookup } from 'dns/promises';
import net from 'net';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { parseEntities } from 'parse-entities';
import { latexToText, unicodeToLatex } from '../latex/conversion.js';
import { escapeTexText, matchBrace, withoutComments } from '../latex/text.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { callOpenAICompatible, missingKey, resolveLLMConfig } from './llmService.js';
import { extractJSON } from './transferAgent/utils.js';

const TIMEOUT_MS = 20_000;
const LLM_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_ITEMS = 30;
const CSL_JSON = 'application/vnd.citationstyles.csl+json';

// Read at call time so tests can point them at a local mock server.
const baseUrl = (name, fallback) => (process.env[name] || fallback).replace(/\/+$/, '');
const doiBase = () => baseUrl('SPECTRUM_DOI_BASE', 'https://doi.org');
export const crossrefBase = () => baseUrl('SPECTRUM_CROSSREF_BASE', 'https://api.crossref.org');
const arxivBase = () => baseUrl('SPECTRUM_ARXIV_BASE', 'https://export.arxiv.org');

// ─── Input detection ───

// SICI DOIs may hold "<digits::…>"; any other "<" (an HTML tag) ends the DOI
const DOI_RE = /\b(10\.\d{4,9}\/(?:[^\s"<>]|<\d+::[^\s"<>]*>)+)/i;
const ARXIV_NEW = String.raw`\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}`;
const ARXIV_OLD = String.raw`[a-z-]+(?:\.[a-z]{2})?\/\d{7}`;
// abs, pdf and arXiv's own HTML view; also ar5iv(.labs.arxiv).org
const ARXIV_URL_RE = new RegExp(String.raw`(?:arxiv|ar5iv)\.org\/(?:abs|pdf|html)\/(${ARXIV_OLD}|${ARXIV_NEW})`, 'i');
const ARXIV_BARE_RE = new RegExp(String.raw`(?<![\w./-])(${ARXIV_NEW}|${ARXIV_OLD})(?:v\d+)?(?!\d)`, 'i');
const ARXIV_LABELLED_RE = new RegExp(String.raw`arxiv(?:\s*preprint)?(?:\s*arxiv)?\s*[:.]?\s*(${ARXIV_NEW}|${ARXIV_OLD})`, 'i');

export function cleanDoi(raw) {
  let doi = String(raw || '').trim();
  try {
    doi = decodeURIComponent(doi);
  } catch {
    // keep as is
  }
  doi = trimTrailing(doi.replace(/[?#].*$/, '').replace(/\/(?:abstract|full|pdf|epdf|html|fulltext)$/i, ''));
  // bioRxiv/medRxiv URLs add a version (and .full, .full.pdf…) that no CSHL DOI has
  if (/^10\.1101\//.test(doi)) doi = doi.replace(/v\d+(?:\.full(?:\.pdf)?|\.abstract|\.full-text)?$/i, '');
  return doi;
}

/** Drop trailing punctuation, and a closing bracket only when it has no partner. */
function trimTrailing(text) {
  let s = text;
  for (;;) {
    if (/[.,;:'"]$/.test(s)) s = s.slice(0, -1);
    else if (/\)$/.test(s) && count(s, '(') < count(s, ')')) s = s.slice(0, -1);
    else if (/\]$/.test(s) && count(s, '[') < count(s, ']')) s = s.slice(0, -1);
    else return s;
  }
}

const count = (s, ch) => s.split(ch).length - 1;
const stripVersion = (id) => String(id).trim().replace(/v\d+$/i, '');

/** Classify one item: { kind: 'doi'|'arxiv'|'url'|'query', input, doi?, arxiv?, url?, query? } */
export function detectInput(text) {
  const input = String(text || '').trim();
  const doi = input.match(DOI_RE);
  if (doi) {
    const clean = cleanDoi(doi[1]);
    const arxiv = clean.match(/^10\.48550\/arxiv\.(.+)$/i);
    return { kind: 'doi', input, doi: clean, ...(arxiv && { arxiv: stripVersion(arxiv[1]) }) };
  }
  const arxivUrl = input.match(ARXIV_URL_RE);
  if (arxivUrl) return { kind: 'arxiv', input, arxiv: stripVersion(arxivUrl[1]) };
  const url = input.match(/(?:https?:\/\/|www\.)[^\s<>"]+/i);
  if (url) {
    const href = trimTrailing(url[0]);
    return { kind: 'url', input, url: /^www\./i.test(href) ? `https://${href}` : href };
  }
  const bare = input.match(ARXIV_BARE_RE);
  if (bare) return { kind: 'arxiv', input, arxiv: stripVersion(bare[1]) };
  return { kind: 'query', input, query: input };
}

const DOI_ALL_RE = new RegExp(DOI_RE.source, 'gi');
const ARXIV_ALL_RE = new RegExp(ARXIV_BARE_RE.source, 'gi');

/** One item per non-empty line, or one per id when a line lists several DOIs or arXiv ids. */
export function splitLines(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((line) => {
    const dois = [...line.matchAll(DOI_ALL_RE)].map((m) => m[1]);
    const ids = dois.length ? dois : [...line.matchAll(ARXIV_ALL_RE)].map((m) => m[1]);
    return ids.length > 1 ? ids.map(detectInput) : [detectInput(line)];
  });
}

async function splitWithLLM(text, llmConfig) {
  const config = resolveLLMConfig(llmConfig);
  const call = callOpenAICompatible({
    ...config,
    reasoningEffort: 'fast',
    messages: [
      {
        role: 'system',
        content: 'Split the text into separate bibliographic references. For each reference give its DOI if one appears, else its arXiv id, else a URL, else a short search query (the title, plus the first author surname if known). Return JSON only: {"items":[{"doi":"","arxiv":"","url":"","query":""}]}'
      },
      { role: 'user', content: text.slice(0, 20_000) }
    ]
  });
  const res = await Promise.race([call, new Promise((r) => setTimeout(r, LLM_TIMEOUT_MS, null).unref())]);
  if (!res?.ok) return null;
  const items = extractJSON(res.content)?.items;
  if (!Array.isArray(items)) return null;
  return items
    .map((it) => [it?.doi, it?.arxiv, it?.url, it?.query].find((v) => typeof v === 'string' && v.trim()))
    .filter(Boolean)
    .map(detectInput);
}

export async function splitInput(text, llmConfig) {
  let items = splitLines(text);
  // Only free text needs splitting; a lone short title or a list of ids does not.
  const freeText = items.some((it) => it.kind === 'query');
  if (freeText && (items.length > 1 || text.length > 200) && !missingKey(resolveLLMConfig(llmConfig))) {
    const llmItems = await splitWithLLM(text, llmConfig).catch(() => null);
    if (llmItems?.length) items = llmItems;
  }
  return items;
}

// ─── Text helpers ───

export const decodeEntities = (value) => parseEntities(String(value ?? ''), { attribute: true });

/** Provider strings may carry HTML/MathML tags and entities. */
const cleanText = (s) => decodeEntities(String(s ?? '').replace(/<\/?[a-z][^>]*>/gi, '')).replace(/\s+/g, ' ').trim();
const first = (v) => (Array.isArray(v) ? v[0] : v);

/** Keep publication precision; never infer dates from URLs or copyright years. */
export function issuedFromDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?(?:$|[T\s])/);
  if (!match) return undefined;
  const parts = match.slice(1).filter(Boolean).map(Number);
  const [y, m, d] = parts;
  if (m != null && (m < 1 || m > 12)) return undefined;
  if (d != null && (d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate())) return undefined;
  return { 'date-parts': [parts] };
}

// Opening quotes use TeX's backtick; apostrophes inside words stay apostrophes.
function texQuotes(s) {
  return s.replace(/[‘’“”]/g, (c) => ({ '‘': '`', '’': "'", '“': '``', '”': "''" })[c])
    .replace(/(^|[\s([{])"([^"\n]+)"/g, '$1``$2\'\'')
    .replace(/(^|[\s([{])'(?=\S)(.+?)'(?![\p{L}\p{N}'])/gu, '$1`$2\'');
}

const FOLD = { ß: 'ss', æ: 'ae', Æ: 'Ae', œ: 'oe', Œ: 'Oe', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', đ: 'd', Đ: 'D', þ: 'th', Þ: 'Th', ı: 'i' };

export function foldAscii(s) {
  return String(s ?? '').replace(/[ßæÆœŒøØłŁđĐþÞı]/g, (c) => FOLD[c]).normalize('NFD').replace(/\p{M}/gu, '');
}

export function normaliseTitle(s) {
  return foldAscii(latexToText(s)).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Words with their digits and hyphens: "3D", "R-CNN", "GPT-4", "Self-Supervised".
const COMPOUND_RE = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;

/** Sentence-case styles would lowercase it: a part with a capital after its first character (3D, CNN, GPT-4, iPhone), or a single capital before a hyphen (R-CNN, U-Net, X-ray). */
function keepsCase(word) {
  const parts = word.split('-');
  return parts.some((p) => /\p{Lu}/u.test(p.slice(1))) || (parts.length > 1 && /^\p{Lu}$/u.test(parts[0]));
}

// pdfLaTeX (what Auto picks for most documents) only knows characters up to Latin Extended-A.
const ACCENT_MACROS = {
  '\u0300': '`', '\u0301': "'", '\u0302': '^', '\u0303': '~', '\u0304': '=', '\u0306': 'u', '\u0307': '.',
  '\u0308': '"', '\u030a': 'r', '\u030b': 'H', '\u030c': 'v', '\u0323': 'd', '\u0327': 'c', '\u0328': 'k'
};

/** Encode Greek and compound Latin accents for pdfLaTeX, preserving other Unicode. */
export function pdfTexSafe(text) {
  return text.replace(/[^\u0000-\u017f]/gu, (ch) => {
    const encoded = /\p{Script=Greek}/u.test(ch) ? unicodeToLatex(ch) : ch;
    if (encoded !== ch) return encoded;
    // shortcut: pylatexenc leaves compound Vietnamese accents unchanged; keep this until its encoder covers them.
    const [letter, ...marks] = [...ch.normalize('NFD')];
    if (!marks.length || letter > '\u017f' || marks.some((m) => !ACCENT_MACROS[m])) return ch;
    // Biber can decode the inner accent; an extra group keeps its multibyte result a single TeX argument.
    return `{${marks.reduce((inner, m, i) => `\\${ACCENT_MACROS[m]}{${i ? `{${inner}}` : inner}}`, letter)}}`;
  });
}

/**
 * Plain text with every TeX special escaped, as a web page's title is never TeX (“What does \\def do?”,
 * “x^2 in text”); for titles, words with internal capitals braced as texEscape does.
 */
export function plainTex(text, { protect = false } = {}) {
  const s = texQuotes(String(text ?? ''));
  const escaped = escapeTexText(s);
  // the escapes are lower-case words, so they're never braced
  return pdfTexSafe(protect && /\p{Ll}/u.test(s) ? escaped.replace(COMPOUND_RE, (w) => (keepsCase(w) ? `{${w}}` : w)) : escaped);
}

/**
 * Escape `& % $ # _` outside existing TeX (commands, {groups}, $maths$) and, for
 * titles, brace words with internal capitals or all caps ({BERT}, {ImageNet}).
 */
export function texEscape(text, { protect = false } = {}) {
  const s = String(text ?? '');
  // An all-caps title would otherwise get every word braced.
  const shouldProtect = protect && /\p{Ll}/u.test(s);
  let out = '';
  let plain = '';
  const flush = () => {
    plain = texQuotes(plain);
    out += pdfTexSafe(shouldProtect ? plain.replace(COMPOUND_RE, (w) => (keepsCase(w) ? `{${w}}` : w)) : plain);
    plain = '';
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      // A lone trailing backslash would swallow the field's closing brace.
      const cmd = s.slice(i).match(/^\\(?:[A-Za-z]+|[^A-Za-z])/)?.[0] || '\\textbackslash{}';
      flush();
      out += cmd;
      i += Math.min(cmd.length, s.length - i) - 1;
    } else if (ch === '{') {
      const end = matchBrace(s, i);
      if (end < 0) plain += '\\{';
      else {
        flush();
        out += s.slice(i, end + 1);
        i = end;
      }
    } else if (ch === '}') {
      plain += '\\}';
    } else if (ch === '$') {
      const end = s.indexOf('$', i + 1);
      if (end > i + 1) {
        flush();
        out += s.slice(i, end + 1);
        i = end;
      } else plain += '\\$';
    } else if ('&%#_'.includes(ch)) {
      plain += `\\${ch}`;
    } else {
      plain += ch;
    }
  }
  flush();
  return out;
}

// ─── Names, keys ───

const GROUP_WORDS = /^(Team|Collaboration|Consortium|Group|Project|Collective|Committee|Initiative)$/i;
const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'da', 'di', 'du', 'la', 'le', 'del', 'della', 'dos', 'das', 'ter', 'ten']);

/** DataCite puts particles in the given name ("Aaron van den" + "Oord"); move them to the surname. */
export function normaliseAuthor(a) {
  if (!a || literalOf(a) || a['non-dropping-particle'] || !a.given) return a;
  const words = String(a.given).trim().split(/\s+/);
  let i = words.length;
  while (i > 1 && PARTICLES.has(words[i - 1])) i--;
  if (i === words.length) return a;
  return { ...a, given: words.slice(0, i).join(' '), 'non-dropping-particle': words.slice(i).join(' ') };
}

/** "Ashish Vaswani" / "Vaswani, Ashish" / "Johannes van der Waals" → CSL name. */
export function parseName(raw) {
  const s = cleanText(raw);
  if (!s) return null;
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    return { family: family.trim(), given: rest.join(',').trim() };
  }
  const parts = s.split(/\s+/);
  // "Gemini Team", "ATLAS Collaboration": a group, not a person called Team
  if (parts.length > 1 && GROUP_WORDS.test(parts.at(-1))) return { literal: s };
  if (parts.length === 1) return { family: parts[0] };
  let i = parts.length - 1;
  while (i > 1 && /^\p{Ll}/u.test(parts[i - 1])) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i).join(' ') };
}

const literalOf = (a) => cleanText(a?.literal || a?.name || '');
const lastOf = (a) => [a['dropping-particle'], a['non-dropping-particle'], a.family].filter(Boolean).map(cleanText).join(' ');

function displayName(author) {
  const a = normaliseAuthor(author);
  return literalOf(a) || [a.given, a['dropping-particle'], a['non-dropping-particle'], a.family].filter(Boolean).map(cleanText).join(' ');
}

function bibName(author) {
  // a list cut short (Google Scholar's …): BibTeX's own "and others"
  if (author?.literal === 'others') return 'others';
  const a = normaliseAuthor(author);
  const literal = literalOf(a);
  if (literal) return `{${texEscape(literal)}}`;
  const last = texEscape(lastOf(a));
  if (!a.given) return /\s/.test(last) ? `{${last}}` : last;
  return [last, a.suffix && texEscape(a.suffix), texEscape(cleanText(a.given))].filter(Boolean).join(', ');
}

const letters = (s) => foldAscii(s).replace(/[^A-Za-z]/g, '');
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TITLE_STOPWORDS = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'from', 'by', 'at', 'via', 'towards', 'toward']);

export function yearOf(rec) {
  for (const d of [rec?.issued, rec?.['published-print'], rec?.['published-online'], rec?.published]) {
    const y = d?.['date-parts']?.[0]?.[0] ?? String(d?.raw || d?.literal || '').match(/\d{4}/)?.[0];
    if (/^\d{4}$/.test(String(y ?? ''))) return String(y);
  }
  return '';
}

/** AuthorSurname + Year: `Vaswani2017`, `VanderWaals1873`, `OpenAI2023`. */
export function baseKey(rec) {
  const author = normaliseAuthor((rec.author || [])[0]);
  let stem = '';
  if (author) {
    const literal = literalOf(author);
    if (literal) {
      const words = foldAscii(literal).split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
      if (words.length > 1 && words[0].toLowerCase() === 'the') words.shift();
      stem = words.slice(0, 2).map(capitalise).join('');
    } else {
      stem = letters([author['non-dropping-particle'], author.family].filter(Boolean).join(' '));
    }
  }
  if (!stem) {
    const words = foldAscii(latexToText(cleanText(first(rec.title)))).split(/\s+/);
    stem = words.map((w) => w.replace(/[^A-Za-z]/g, '')).find((w) => w && !TITLE_STOPWORDS.has(w.toLowerCase())) || 'Ref';
  }
  return capitalise(stem) + yearOf(rec);
}

const suffix = (n) => (n < 26 ? '' : suffix(Math.floor(n / 26) - 1)) + String.fromCharCode(97 + (n % 26));

/** First free key: base, base+a, base+b, … (BibTeX keys compare case-insensitively). */
export function uniqueKey(base, taken) {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 0; ; n++) {
    const key = base + suffix(n);
    if (!taken.has(key.toLowerCase())) return key;
  }
}

// ─── CSL → BibTeX ───

const TYPE_MAP = {
  'journal-article': 'article', 'article-journal': 'article', 'article-magazine': 'article', 'article-newspaper': 'article',
  'proceedings-article': 'inproceedings', 'paper-conference': 'inproceedings',
  book: 'book', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book',
  chapter: 'incollection', 'book-chapter': 'incollection',
  report: 'techreport',
  thesis: 'phdthesis', dissertation: 'phdthesis'
};

function doiOf(rec) {
  const doi = rec.DOI ? cleanDoi(rec.DOI) : '';
  const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
  return arxiv ? `10.48550/arXiv.${arxiv[1]}` : doi;
}

function arxivOf(rec) {
  if (rec._arxiv) return rec._arxiv;
  const id = doiOf(rec).match(/^10\.48550\/arXiv\.(.+)$/)?.[1];
  if (!id) return null;
  // DataCite lists categories like "Computation and Language (cs.CL)", primary first.
  const primaryClass = (rec.categories || []).map((c) => String(c).match(/\(([a-z-]+(?:\.[A-Za-z-]+)?)\)$/)?.[1]).find(Boolean);
  return { id: stripVersion(id), primaryClass };
}

export function toBibtex(rec, key, legacyUrls = false) {
  const arxiv = arxivOf(rec);
  let type = TYPE_MAP[rec.type] || 'misc';
  const preprint = Boolean(arxiv) && type === 'misc';
  if (preprint) type = 'article';
  const webpage = rec.type === 'webpage';
  const container = texEscape(cleanText(first(rec['container-title'])));
  const doi = doiOf(rec);
  const url = arxiv ? `https://arxiv.org/abs/${arxiv.id}` : cleanText(rec.URL);
  const authors = (rec.author || []).map(bibName).filter(Boolean);
  const editors = authors.length ? [] : (rec.editor || []).map(bibName).filter(Boolean);
  const plain = (v) => texEscape(cleanText(v));

  const fields = [];
  const add = (name, value) => {
    if (value != null && String(value).trim()) fields.push([name, String(value).trim()]);
  };
  add('author', authors.join(' and '));
  add('editor', editors.join(' and '));
  // a page's title is plain text; a publisher's may carry TeX
  add('title', (webpage ? plainTex : texEscape)(cleanText(first(rec.title)), { protect: true }));
  if (type === 'article') add('journal', preprint ? `arXiv preprint arXiv:${arxiv.id}` : container);
  if (type === 'inproceedings' || type === 'incollection') add('booktitle', container);
  add('year', yearOf(rec));
  if (webpage) {
    const parts = rec.issued?.['date-parts']?.[0];
    if (parts?.length > 1) add('date', parts.map((n, i) => i ? String(n).padStart(2, '0') : n).join('-'));
    const site = cleanText(rec.publisher || container);
    if (rec.author?.length !== 1 || displayName(rec.author[0]).toLowerCase() !== site.toLowerCase()) add('organization', plain(site));
  }
  add('volume', plain(rec.volume));
  add('number', plain(rec.issue ?? (type === 'techreport' ? rec.number : '')));
  // article-numbered journals (APS, Nature Communications…) have no page range
  add('pages', plain(rec.page || rec['article-number']).replace(/\s*[-–—]+\s*/g, '--'));
  if (!preprint) add({ techreport: 'institution', phdthesis: 'school' }[type] || 'publisher', plain(rec.publisher));
  add('doi', doi);
  if (webpage && legacyUrls) {
    add('howpublished', url && `\\url{${url}}`);
  }
  if (!(webpage && legacyUrls) && (webpage || arxiv || !doi || type === 'misc')) add('url', url);
  // published versions keep their arXiv id too, so pasting the preprint later is a duplicate
  if (arxiv) {
    add('eprint', arxiv.id);
    add('archivePrefix', 'arXiv');
    add('primaryClass', arxiv.primaryClass);
  }

  const width = Math.max(...fields.map(([name]) => name.length));
  return `@${type}{${key},\n${fields.map(([name, value]) => `  ${name.padEnd(width)} = {${value}},`).join('\n')}\n}`;
}

/** Last word of a surname, folded: "van den Oord" → "oord", "{OpenAI}" → "openai". */
const surnameKey = (name) => normaliseTitle(name).split(' ').at(-1) || '';

function identityOf(rec) {
  const author = normaliseAuthor((rec.author || [])[0]);
  return {
    doi: doiOf(rec).toLowerCase(),
    arxiv: (arxivOf(rec)?.id || '').toLowerCase(),
    title: normaliseTitle(cleanText(first(rec.title))),
    year: yearOf(rec),
    firstAuthor: author ? surnameKey(literalOf(author) || lastOf(author)) : ''
  };
}

export function summaryOf(rec) {
  return {
    title: cleanText(first(rec.title)) || undefined,
    authors: (rec.author || []).map(displayName).filter(Boolean),
    year: yearOf(rec) || undefined,
    doi: doiOf(rec) || undefined
  };
}

// ─── Existing .bib files ───

function readValue(s, i) {
  if (s[i] === '{') {
    const end = matchBrace(s, i);
    return end < 0 ? { value: s.slice(i + 1), end: s.length } : { value: s.slice(i + 1, end), end: end + 1 };
  }
  if (s[i] === '"') {
    let depth = 0;
    let j = i + 1;
    for (; j < s.length; j++) {
      if (s[j] === '\\') j++;
      else if (s[j] === '{') depth++;
      else if (s[j] === '}') depth--;
      else if (s[j] === '"' && depth <= 0) break;
    }
    return { value: s.slice(i + 1, j), end: j + 1 };
  }
  const bare = s.slice(i).match(/^[^,}\s]*/)[0];
  return { value: bare, end: i + bare.length };
}

/** Lenient: [{ type, key, fields: { lowercased name: raw value }, at }]; skips @string/@comment/@preamble. at: where the entry starts. */
export function parseBibEntries(text) {
  const heads = [...String(text).matchAll(/@([A-Za-z]+)\s*[{(]\s*([^,\s{}()"=]+)\s*,/g)]
    .filter((m) => !/^(comment|string|preamble)$/i.test(m[1]));
  return heads.map((m, i) => {
    const body = text.slice(m.index + m[0].length, heads[i + 1]?.index ?? text.length);
    const fields = {};
    const re = /([A-Za-z][\w:-]*)\s*=\s*/g;
    let f;
    while ((f = re.exec(body))) {
      const { value, end } = readValue(body, re.lastIndex);
      fields[f[1].toLowerCase()] ??= value.replace(/\s+/g, ' ').trim();
      re.lastIndex = Math.max(end, re.lastIndex);
    }
    return { type: m[1].toLowerCase(), key: m[2], fields, at: m.index };
  });
}

export function bibIdentity(entry, file) {
  const f = entry.fields;
  const doiMatch = (f.doi || '').match(DOI_RE) || (f.url || '').match(DOI_RE);
  const doi = doiMatch ? cleanDoi(doiMatch[1]).toLowerCase() : '';
  let arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/)?.[1] || '';
  if (!arxiv && f.eprint && /arxiv/i.test(f.archiveprefix || f.eprinttype || 'arxiv')) {
    arxiv = f.eprint.replace(/^arxiv:\s*/i, '').match(ARXIV_BARE_RE)?.[1] || '';
  }
  if (!arxiv) {
    const text = [f.journal, f.url, f.note, f.howpublished, f.eprint].filter(Boolean).join(' ');
    arxiv = (text.match(ARXIV_URL_RE) || text.match(ARXIV_LABELLED_RE))?.[1] || '';
  }
  const author = String(f.author || '').split(/\s+and\s+/i)[0].trim();
  return {
    key: entry.key,
    file,
    doi,
    arxiv: stripVersion(arxiv).toLowerCase(),
    firstAuthor: surnameKey(author.includes(',') ? author.split(',')[0] : author),
    title: normaliseTitle(f.title || ''),
    year: String(f.year || f.date || '').match(/\d{4}/)?.[0] || '',
    displayTitle: latexToText(f.title || '').replace(/\s+/g, ' ').trim()
  };
}

/**
 * Same DOI, same arXiv id, or same normalised title + year. Generic titles ("Deep learning",
 * "Introduction") under two different DOIs also need the same first author.
 */
export function findDuplicate(index, id) {
  const sameWork = (e) => !(e.doi && id.doi && e.doi !== id.doi.toLowerCase())
    || Boolean(e.firstAuthor && id.firstAuthor && e.firstAuthor === id.firstAuthor);
  return index.find((e) =>
    (id.doi && e.doi === id.doi.toLowerCase())
    || (id.arxiv && e.arxiv === id.arxiv.toLowerCase())
    || (id.title && e.title === id.title && e.year === (id.year || '') && sameWork(e))
  ) || null;
}

export function buildBibIndex(files) {
  return files.flatMap(({ file, text }) => parseBibEntries(text).map((e) => bibIdentity(e, file)));
}

async function projectFiles(root) {
  return (await listFilesRecursive(root))
    .filter((it) => it.type === 'file')
    .map((it) => it.path.split(path.sep).join('/'));
}

async function loadBibIndex(root, files) {
  const bibs = [];
  for (const file of files.filter((f) => /\.bib$/i.test(f))) {
    const text = await fs.readFile(path.join(root, file), 'utf8').catch(() => null);
    if (text != null) bibs.push({ file, text });
  }
  return buildBibIndex(bibs);
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/**
 * bibFile param → a .bib the .tex sources load → references.bib → first .bib → new references.bib, each in the order
 * references.bib, then shallowest, then by name.
 */
export function pickBibTarget(root, files, requested, texSources = []) {
  if (requested) {
    const rel = String(requested).replace(/\\/g, '/').replace(/^(\.\/)+/, '');
    const parts = rel.split('/');
    if (!/\.bib$/i.test(rel) || parts.some((p) => !p || p === '..' || ['.spectrum', '.git'].includes(p.toLowerCase()))) {
      throw badRequest('That bibliography file isn’t valid.');
    }
    safeJoin(root, rel);
    return rel;
  }
  const depth = (f) => f.split('/').length;
  const bibs = files.filter((f) => /\.bib$/i.test(f)).sort((a, b) => (b === 'references.bib') - (a === 'references.bib') || depth(a) - depth(b) || a.localeCompare(b));
  // one the document loads, so a \cite of what's added there resolves
  return bibs.find((bib) => texIncludesBib(texSources, bib)) || bibs[0] || 'references.bib';
}

/** Whether any .tex loads the target via \bibliography{…} or \addbibresource{…}. */
export function texIncludesBib(texSources, bibFile) {
  const name = path.posix.basename(bibFile).replace(/\.bib$/i, '').toLowerCase();
  return texSources.some((source) => {
    const text = withoutComments(source);
    return [...text.matchAll(/\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].some((m) =>
      m[1].split(',').some((p) => path.posix.basename(p.trim()).replace(/\.bib$/i, '').toLowerCase() === name)
    );
  });
}

/** Append one entry, leaving every existing byte untouched; one blank line between entries. */
async function appendEntry(file, entry) {
  const existing = await fs.readFile(file, 'utf8').catch(() => '');
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const sep = !existing.trim() || /(\r?\n){2}$/.test(existing) ? '' : /\r?\n$/.test(existing) ? eol : eol + eol;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, sep + entry.replace(/\n/g, eol) + eol, 'utf8');
}

// ─── Remote lookups ───

function lookupError(message, code = 'ERROR') {
  const err = new Error(message);
  err.code = code;
  return err;
}
const notFound = (message) => lookupError(message, 'NOT_FOUND');

async function fetchOnce(url, accept, redirect = 'follow', timeoutMs = TIMEOUT_MS) {
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'Spectrum/1.0', Accept: accept },
      redirect,
      // the body's reading too
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    const host = new URL(url).host;
    throw lookupError(err.name === 'TimeoutError' ? `${host} took too long to respond.` : `Couldn’t reach ${host}.`);
  }
}

// Crossref's public pool allows one request at a time and about one search a second
// (doi.org hands Crossref DOIs on to it), so those requests go through one queue.
const SEARCH_GAP_MS = 1000;
let crossrefQueue = Promise.resolve();
let lastSearch = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function queued(fn) {
  const run = crossrefQueue.then(fn, fn);
  crossrefQueue = run.catch(() => {});
  return run;
}

export async function get(url, accept) {
  const viaQueue = url.startsWith(crossrefBase()) || url.startsWith(doiBase());
  const search = viaQueue && /\/works\?/.test(url);
  const once = async () => {
    if (search) {
      await sleep(lastSearch + SEARCH_GAP_MS - Date.now());
      lastSearch = Date.now();
    }
    const res = await fetchOnce(url, accept);
    if (!viaQueue) return res;
    // read the body inside the queue, so the next request waits for this one to finish
    const body = res.status === 204 || res.status === 304 ? null : await res.arrayBuffer();
    return new Response(body, { status: res.status, headers: res.headers });
  };
  for (let attempt = 0; ; attempt++) {
    const res = viaQueue ? await queued(once) : await once();
    if ((res.status !== 429 && res.status !== 503) || attempt >= 2) return res;
    const retryAfter = res.headers.has('retry-after') ? Number(res.headers.get('retry-after')) : NaN;
    await sleep(Math.min(10, Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
  }
}

// ─── Links the user pastes: never to this computer or the local network ───

function isPrivateAddress(address) {
  const ip = address.replace(/^::ffff:(?=\d+\.)/i, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

const blockedLink = () => lookupError('That link points to this computer or the local network, so it wasn’t opened.', 'BLOCKED_URL');

async function assertPublicUrl(url) {
  const { protocol, hostname, host } = new URL(url);
  if (protocol !== 'http:' && protocol !== 'https:') throw lookupError('Only http and https links can be looked up.', 'BLOCKED_URL');
  if (new URL(url).username || new URL(url).password) throw lookupError('Links containing a username or password aren’t sent to citation services.', 'BLOCKED_URL');
  // the lookup services themselves (local mocks in tests) are always fine
  if ([doiBase(), crossrefBase(), arxivBase()].some((b) => new URL(b).host === host)) return;
  const name = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (name === 'localhost' || name.endsWith('.localhost')) throw blockedLink();
  // ponytail: checks the address before fetching; a DNS answer that changes in between isn't caught
  const addresses = net.isIP(name) ? [name] : (await dnsLookup(name, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.some(isPrivateAddress)) throw blockedLink();
}

/** Fetch a pasted link, following at most 5 redirects, each checked like the link itself. */
/** timeoutMs: for the request and its body together, as a download can need longer than a lookup's 20 s. */
export async function getPage(url, accept, { timeoutMs } = {}) {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    await assertPublicUrl(current);
    const res = await fetchOnce(current, accept, 'manual', timeoutMs);
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return { res, finalUrl: current };
    res.body?.cancel().catch(() => {});
    current = new URL(location, current).href;
  }
  throw lookupError('That link redirects too many times.');
}

const encodeDoi = (doi) => doi.split('/').map(encodeURIComponent).join('/');

/** CSL-JSON from doi.org (Crossref and DataCite), falling back to the Crossref API. */
async function recordFromDoi(doi) {
  let status = 0;
  try {
    const res = await get(`${doiBase()}/${encodeDoi(doi)}`, CSL_JSON);
    status = res.status;
    if (res.ok) {
      const csl = await res.json().catch(() => null);
      if (csl?.title) return { DOI: doi, ...csl };
    }
  } catch {
    // try Crossref directly
  }
  const res = await get(`${crossrefBase()}/works/${encodeDoi(doi)}`, 'application/json');
  if (res.ok) {
    const message = (await res.json().catch(() => null))?.message;
    if (message?.title) return { DOI: doi, ...message };
  }
  if (status === 404 && res.status === 404) throw notFound(`No record found for DOI ${doi}.`);
  throw lookupError(`Couldn’t fetch the details for DOI ${doi} (HTTP ${res.ok ? status : res.status}).`);
}

const xmlText = (v) => String(v && typeof v === 'object' ? v['#text'] ?? '' : v ?? '').replace(/\s+/g, ' ').trim();

/** arXiv Atom → published version via its DOI when there is one, else an arXiv preprint record. */
export function arxivRecordFromAtom(xml, id) {
  const feed = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml)?.feed;
  const entry = [].concat(feed?.entry || [])[0];
  if (!entry || !xmlText(entry.title) || /\/api\/errors/.test(xmlText(entry.id))) return null;
  return {
    doi: xmlText(entry['arxiv:doi']),
    record: {
      type: 'article',
      title: xmlText(entry.title),
      author: [].concat(entry.author || []).map((a) => parseName(xmlText(a?.name))).filter(Boolean),
      issued: { 'date-parts': [[Number(xmlText(entry.published).slice(0, 4)) || null]] },
      URL: `https://arxiv.org/abs/${id}`,
      _arxiv: { id, primaryClass: entry['arxiv:primary_category']?.['@_term'] }
    }
  };
}

async function recordFromArxiv(id) {
  const res = await get(`${arxivBase()}/api/query?id_list=${id}`, 'application/atom+xml');
  if (!res.ok) throw lookupError(`arXiv lookup failed (HTTP ${res.status}).`);
  const parsed = arxivRecordFromAtom(await res.text(), id);
  if (!parsed) throw notFound(`No arXiv paper found with ID ${id}.`);
  if (parsed.doi) {
    try {
      return { ...(await recordFromDoi(cleanDoi(parsed.doi))), _arxiv: parsed.record._arxiv };
    } catch {
      // keep the preprint record
    }
  }
  return parsed.record;
}

/** The record for a DOI or arXiv item from detectInput; web search upgrades its results with it. */
export const recordFor = (item) => (item.kind === 'doi' ? recordFromDoi(item.doi) : recordFromArxiv(item.arxiv));

/** <meta name|property=… content=…> → { lowercased name: [decoded values] } */
export function parseHtmlMeta(html) {
  const meta = {};
  for (const [tag] of String(html).matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([^\s=<>"'/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    }
    const name = (attrs.name || attrs.property || '').toLowerCase().trim();
    const content = decodeEntities(attrs.content ?? '').trim();
    if (name && content) (meta[name] ||= []).push(content);
  }
  return meta;
}

function structuredPage(html, url) {
  const nodes = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      nodes.push(value);
      if (value['@graph']) collect(value['@graph']);
    }
  };
  for (const m of String(html).matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collect(JSON.parse(m[1])); } catch { /* malformed metadata is not a failed page */ }
  }
  const canonical = (u) => {
    try { const parsed = new URL(u, url); parsed.hash = ''; return parsed.href.replace(/\/$/, ''); } catch { return ''; }
  };
  const candidates = nodes.filter((n) => [].concat(n['@type'] || []).some((t) => /(?:^|[/#])(?:NewsArticle|Article|BlogPosting|ScholarlyArticle|WebPage)$/.test(t)))
    .sort((a, b) => Number([].concat(a['@type']).includes('WebPage')) - Number([].concat(b['@type']).includes('WebPage')));
  const address = (n) => n.url || n.mainEntityOfPage?.['@id'] || (typeof n.mainEntityOfPage === 'string' && n.mainEntityOfPage) || n['@id'];
  const page = candidates.find((n) => address(n) && canonical(address(n)) === canonical(url))
    || candidates.find((n) => !address(n));
  if (!page) return null;
  const deref = (v) => {
    const id = typeof v === 'string' ? v : v?.['@id'];
    return id ? nodes.find((n) => n['@id'] === id && n.name) || v : v;
  };
  const authors = [].concat(page.author || []).map(deref).map((a) => {
    if (typeof a === 'string') return /^https?:/i.test(a) ? null : parseName(a);
    if (a?.['@type'] === 'Organization') return a.name ? { literal: cleanText(a.name) } : null;
    return a?.familyName ? { family: cleanText(a.familyName), given: cleanText(a.givenName) } : parseName(a?.name);
  }).filter(Boolean);
  return {
    title: cleanText(page.headline || page.name), author: authors,
    issued: issuedFromDate(page.datePublished || page.dateCreated),
    publisher: cleanText(deref(page.publisher)?.name)
  };
}

/** Some paper pages omit authors from metadata but display a complete citation export. */
function exportedCitation(html, title) {
  if (!title) return null;
  const visible = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const block of visible.matchAll(/<(pre|code|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const entry = parseBibEntries(cleanText(block[2])).find((e) => normaliseTitle(e.fields.title) === normaliseTitle(title));
    if (!entry) continue;
    const names = (entry.fields.author || '').trim();
    const authors = [];
    let start = 0;
    for (let i = 0; i <= names.length; i++) {
      if (names[i] === '{') {
        const end = matchBrace(names, i);
        if (end < 0) return null;
        i = end;
      } else {
        const separator = names.slice(i).match(/^\s+and\s+/i);
        if (!separator && i < names.length) continue;
        const name = names.slice(start, i).trim();
        const author = name.startsWith('{') && matchBrace(name, 0) === name.length - 1
          ? { literal: latexToText(name.slice(1, -1)) } : parseName(latexToText(name));
        if (author) authors.push(author);
        if (separator) i += separator[0].length - 1;
        start = i + 1;
      }
    }
    return { author: authors, publisher: latexToText(entry.fields.publisher || ''), issued: issuedFromDate(entry.fields.date || entry.fields.year) };
  }
  return null;
}

/** A page → { doi } | { arxiv } | { record } | null, following §6's order. */
export function readHtmlCitation(html, url, now = new Date()) {
  const meta = parseHtmlMeta(html);
  const structured = structuredPage(html, url);
  const one = (...names) => names.map((n) => meta[n]?.[0]).find(Boolean) || '';
  const metaDoi = ['citation_doi', 'dc.identifier', 'prism.doi', 'bepress_citation_doi']
    .flatMap((n) => meta[n] || [])
    .map((v) => v.match(DOI_RE)?.[1])
    .find(Boolean);
  const title = one('citation_title');
  const pageTitle = title || structured?.title || one('og:title', 'twitter:title') || cleanText(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const exported = exportedCitation(html, pageTitle);
  const citationAuthors = (meta.citation_author || []).map(parseName).filter(Boolean);
  const author = one('author');
  const authors = citationAuthors.length ? citationAuthors : structured?.author.length ? structured.author : exported?.author.length ? exported.author
    : author && !/^https?:/i.test(author) ? [parseName(author)].filter(Boolean) : [];
  let record = null;
  if (title) {
    const journal = one('citation_journal_title');
    const conference = one('citation_conference_title');
    const book = one('citation_book_title');
    record = {
      type: journal ? 'article-journal' : conference ? 'paper-conference' : book ? 'chapter' : 'other',
      title,
      author: authors,
      issued: issuedFromDate(one('citation_publication_date', 'citation_date', 'citation_year')) || structured?.issued || exported?.issued,
      'container-title': journal || conference || book,
      volume: one('citation_volume'),
      issue: one('citation_issue'),
      page: [one('citation_firstpage'), one('citation_lastpage')].filter(Boolean).join('-'),
      publisher: one('citation_publisher') || exported?.publisher || structured?.publisher,
      URL: url
    };
  }
  // The meta record stays as a fallback in case the DOI can't be resolved.
  if (metaDoi) return { doi: cleanDoi(metaDoi), record };
  if (record) {
    const arxiv = one('citation_arxiv_id');
    return arxiv ? { arxiv: stripVersion(arxiv) } : { record };
  }

  const published = structured?.issued || issuedFromDate(one('article:published_time', 'og:published_time', 'datepublished', 'parsely-pub-date', 'sailthru.date', 'dc.date.issued', 'dcterms.issued', 'dc.date', 'pubdate', 'date'))
    || issuedFromDate(String(html).match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]) || exported?.issued;
  const webpage = pageTitle ? {
    type: 'webpage',
    title: pageTitle,
    author: authors,
    issued: published,
    publisher: exported?.publisher || structured?.publisher || one('og:site_name'),
    URL: url,
    accessed: now.toISOString()
  } : null;

  // A DOI in the text may be the page's own, or just one it cites (Wikipedia, blogs):
  // it only counts when its record's title matches the page title.
  const bodyDoi = decodeEntities(html).match(DOI_RE)?.[1];
  if (bodyDoi && pageTitle) return { doi: cleanDoi(bodyDoi), record: webpage, pageTitle };
  return webpage ? { record: webpage } : null;
}

/** Whether a record is what a page is about: its title is in the page title, or nearly all its words are. */
export function titleFitsPage(recordTitle, pageTitle) {
  const r = normaliseTitle(cleanText(first(recordTitle)));
  const p = normaliseTitle(pageTitle);
  if (!r || !p) return false;
  if (` ${p} `.includes(` ${r} `)) return true;
  const words = r.split(' ');
  const pageWords = new Set(p.split(' '));
  return words.filter((w) => pageWords.has(w)).length / words.length >= 0.8;
}

// "Verify you are human" and similar pages stand in for the real one
const CHALLENGE_TITLE = /verif(?:y|ying) (?:you are (?:a )?human|your browser)|just a moment|attention required|captcha|are you a robot|access denied|cookies must be enabled/i;

function isChallenge(record, finalUrl) {
  const { host, pathname } = new URL(finalUrl);
  const title = cleanText(record?.title);
  return /\/challenge/i.test(pathname) || title.toLowerCase() === host.toLowerCase() || CHALLENGE_TITLE.test(title);
}

async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}

const NO_PAGE = 'That site didn’t return the page. Open it in a browser and paste the DOI instead.';

async function recordFromPage(url) {
  const { res, finalUrl } = await getPage(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8');
  if (res.status === 404 || res.status === 410) throw notFound(`Couldn’t open that link (HTTP ${res.status}).`);
  // 202/203 and friends are bot checks and interstitials, not the page
  if (res.status !== 200) {
    res.body?.cancel().catch(() => {});
    throw lookupError(res.ok ? NO_PAGE : `Couldn’t open that link (HTTP ${res.status}).`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType && !/html|xml/i.test(contentType)) {
    res.body?.cancel().catch(() => {});
    throw notFound('That link isn’t a web page with citation details.');
  }
  const found = readHtmlCitation(await readLimited(res, MAX_HTML_BYTES), finalUrl);
  if (!found) throw notFound('Couldn’t find citation details on that page.');
  if (found.doi) {
    try {
      const record = await recordFromDoi(found.doi);
      if (!found.pageTitle || titleFitsPage(record.title, found.pageTitle)) return record;
    } catch (err) {
      if (!found.record) throw err;
    }
  }
  if (found.arxiv) return recordFromArxiv(found.arxiv);
  if (found.record?.type === 'webpage' && isChallenge(found.record, finalUrl)) throw lookupError(NO_PAGE);
  return found.record;
}

async function recordFromUrl(url, searchConfig) {
  await assertPublicUrl(url);
  let record, failure;
  try { record = await recordFromPage(url); } catch (err) {
    if (err.code === 'BLOCKED_URL') throw err;
    failure = err;
  }
  if (searchConfig && (!record || !yearOf(record) || !record.author?.length && !record.editor?.length)) {
    try {
      const { searchReferenceRecords } = await import('./searchService.js');
      const extra = (await searchReferenceRecords({ searchConfig, targetUrl: record?.URL || url }))[0];
      if (extra && !isChallenge(extra, extra.URL)) {
        record = record ? { ...extra, ...record, author: record.author?.length ? record.author : extra.author, issued: yearOf(record) ? record.issued : extra.issued } : extra;
      }
    } catch (err) { failure = err; }
  }
  if (record) return record;
  throw failure || notFound('Couldn’t find citation details for that page.');
}

/**
 * How a Crossref hit fits the query, word order included: 0 not the same title; 1 the same
 * title; 2 the same title once a year and/or the hit's first-author surname typed with it
 * are set aside, and those agree with the hit.
 */
export function titleMatch(query, item) {
  const title = normaliseTitle(cleanText(first(item.title)));
  const q = normaliseTitle(query);
  if (!title || !q) return 0;
  if (q === title) return 1;
  const author = normaliseAuthor(item.author?.[0]);
  const surname = new Set(normaliseTitle(author?.family || '').split(' ').filter(Boolean));
  let agrees = false;
  let disagrees = false;
  const rest = q.replace(/\bet al\b/g, ' ').split(' ').filter((w) => {
    if (/^\d{4}$/.test(w)) {
      if (w === yearOf(item)) agrees = true;
      else disagrees = true;
      return false;
    }
    if (surname.has(w)) {
      agrees = true;
      return false;
    }
    return Boolean(w);
  });
  return agrees && !disagrees && rest.join(' ') === title ? 2 : 0;
}

/**
 * A search result is added without asking only when exactly one hit has the query's title
 * and the year or author typed with it agree. A bare title can belong to several works
 * (a 2026 book chapter shares its title with a famous paper), so it's always a choice.
 */
export function pickCandidate(query, items) {
  const scores = items.map((it) => titleMatch(query, it));
  const i = scores.indexOf(2);
  return i !== -1 && scores.filter(Boolean).length === 1 ? items[i] : null;
}

function toCandidate(item) {
  return {
    id: item.DOI || item.URL,
    title: cleanText(first(item.title)),
    authors: (item.author || []).map(displayName).filter(Boolean),
    year: yearOf(item) || undefined,
    venue: cleanText(first(item['container-title'])) || undefined,
    doi: item.DOI
  };
}

// Figures, reviews, grants and recommendation records crowd out the papers themselves.
const NOT_A_WORK = new Set(['component', 'peer-review', 'grant', 'dataset']);
const NOT_A_WORK_TITLE = /^(?:Faculty Opinions recommendation of|(?:Figure|Table) \d+[:.])/i;

/** Up to 5 works, those with the query's exact title first. */
async function searchCrossref(query) {
  const url = `${crossrefBase()}/works?query.bibliographic=${encodeURIComponent(query)}&rows=20&select=DOI,title,author,issued,container-title,type`;
  const res = await get(url, 'application/json');
  if (!res.ok) throw lookupError(`Crossref search failed (HTTP ${res.status}).`);
  const items = (await res.json().catch(() => null))?.message?.items;
  return (Array.isArray(items) ? items : [])
    .filter((it) => it?.DOI && first(it.title) && !NOT_A_WORK.has(it.type) && !NOT_A_WORK_TITLE.test(cleanText(first(it.title))))
    .sort((a, b) => titleMatch(query, b) - titleMatch(query, a))
    .slice(0, 5);
}

// ─── Orchestration ───

function duplicateResult(input, existing, rec) {
  return {
    input,
    status: 'duplicate',
    key: existing.key,
    bibFile: existing.file,
    ...(rec ? summaryOf(rec) : { title: existing.displayTitle || undefined, year: existing.year || undefined, doi: existing.doi || undefined }),
    message: `Already in ${existing.file} as ${existing.key}.`
  };
}

/** → { input, record } or { result } (duplicate / choose / not_found / error). */
async function lookup(item, index, searchConfig) {
  const { input } = item;
  try {
    const known = findDuplicate(index, { doi: item.doi, arxiv: item.arxiv });
    if (known) return { result: duplicateResult(input, known) };
    if (item.kind === 'doi') return { input, record: await recordFromDoi(item.doi) };
    if (item.kind === 'arxiv') return { input, record: await recordFromArxiv(item.arxiv) };
    if (item.kind === 'url') return { input, record: await recordFromUrl(item.url, searchConfig) };
    let hits;
    try { hits = await searchCrossref(item.query); } catch (err) { if (!searchConfig) throw err; hits = []; }
    if (!hits.length && searchConfig) {
      const { searchReferenceRecords } = await import('./searchService.js');
      hits = await searchReferenceRecords({ searchConfig, query: item.query });
    }
    if (!hits.length) return { result: { input, status: 'not_found', message: 'No matching works found.' } };
    const pick = pickCandidate(item.query, hits);
    if (pick) return { input, record: pick.DOI ? await recordFromDoi(pick.DOI) : pick };
    return { result: { input, status: 'choose', candidates: hits.map(toCandidate), message: 'Several works match. Choose the right one to add it.' } };
  } catch (err) {
    const status = err.code === 'NOT_FOUND' ? 'not_found' : 'error';
    return { result: { input, status, message: err.code ? err.message : `Couldn’t resolve this reference: ${err.message}` } };
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ponytail: one global lock around lookup + write (network included) so concurrent
// requests can't double-add or reuse a key; per-project locks if that ever matters.
let bibLock = Promise.resolve();
function withBibLock(fn) {
  const run = bibLock.then(fn, fn);
  bibLock = run.catch(() => {});
  return run;
}

/**
 * What an add to the project's .bib starts from: the target file (pickBibTarget), whether the document it serves uses
 * biblatex, whether its style is a classic BibTeX one, and every .bib's entries with their keys.
 */
async function bibContext(projectRoot, bibFile) {
  const files = await projectFiles(projectRoot);
  const sources = await Promise.all(files.filter((f) => /\.tex$/i.test(f)).map((file) => fs.readFile(path.join(projectRoot, file), 'utf8').catch(() => '')));
  const target = pickBibTarget(projectRoot, files, bibFile, sources);
  const bibliographySources = withoutComments(sources.filter((source) => texIncludesBib([source], target)).join('\n'));
  const BIBLATEX = /\\addbibresource\b|\{biblatex\}/;
  // Classic BibTeX styles ignore url; modern styles print it, so never emit both fields.
  const legacyUrls = /\\bibliographystyle\s*\{(?:plain|abbrv|alpha|unsrt|acm|apalike|ieeetr)\}/.test(bibliographySources) && !BIBLATEX.test(bibliographySources);
  const index = await loadBibIndex(projectRoot, files);
  return {
    sources,
    target,
    // a .bib no document loads yet goes with what the documents use
    biblatex: BIBLATEX.test(bibliographySources || withoutComments(sources.join('\n'))),
    legacyUrls,
    index,
    taken: new Set(index.map((e) => e.key.toLowerCase()))
  };
}

// the project's Zotero collection follows what was added (zoteroService imports this module, so it's loaded by then)
function afterAdd(projectRoot, out) {
  if (out.results.some((r) => r.status === 'added')) import('./zoteroService.js').then((z) => z.syncSoon(projectRoot)).catch(() => {});
  return out;
}

/** items: detectInput's { kind, … }. Looks each up and appends the new ones to the target .bib, duplicates caught. */
export async function resolveItems(projectRoot, items, bibFile, searchConfig) {
  return afterAdd(projectRoot, await withBibLock(async () => {
    const { sources, target, legacyUrls, index, taken } = await bibContext(projectRoot, bibFile);
    const outcomes = await mapPool(items, 4, (item) => lookup(item, index, searchConfig));

    const results = [];
    for (const outcome of outcomes) {
      if (outcome.result) {
        results.push(outcome.result);
        continue;
      }
      const { input, record } = outcome;
      const id = identityOf(record);
      const existing = findDuplicate(index, id);
      if (existing) {
        results.push(duplicateResult(input, existing, record));
        continue;
      }
      const key = uniqueKey(baseKey(record), taken);
      const bibtex = toBibtex(record, key, legacyUrls);
      try {
        await appendEntry(safeJoin(projectRoot, target), bibtex);
      } catch (err) {
        results.push({ input, status: 'error', message: `Couldn’t write to ${target}: ${err.message}` });
        continue;
      }
      taken.add(key.toLowerCase());
      index.push({ ...id, key, file: target, displayTitle: cleanText(first(record.title)) });
      results.push({ input, status: 'added', key, bibtex, bibFile: target, ...summaryOf(record) });
    }
    return { results, bibFile: target, bibIncluded: texIncludesBib(sources, target) };
  }));
}

// what a key may hold: not what ends one in an entry's head (parseBibEntries), nor TeX's specials
const VALID_KEY = /^[^,\s{}()"=#%~\\]+$/;

/**
 * Ready-made entries (Zotero's) appended to the target .bib as resolveItems appends its own, under the same lock and
 * duplicate checks. make(context) gives [{ input, bibtex, key }] or [{ input, error }], key the one the entry should
 * go in under: it does, unless the .bib has that key for another work, when the first free one after it is used.
 */
export async function appendEntries(projectRoot, bibFile, make) {
  return afterAdd(projectRoot, await withBibLock(async () => {
    const context = await bibContext(projectRoot, bibFile);
    const { sources, target, index, taken } = context;
    const results = [];
    for (const { input, bibtex, key: wanted, error } of await make(context)) {
      const [entry] = error ? [] : parseBibEntries(bibtex);
      if (!entry) {
        results.push({ input, status: 'error', message: error || 'That entry couldn’t be read.' });
        continue;
      }
      const id = bibIdentity(entry, target);
      const existing = findDuplicate(index, id);
      if (existing) {
        results.push(duplicateResult(input, existing));
        continue;
      }
      const key = uniqueKey([wanted, entry.key].find((k) => VALID_KEY.test(k || '')) || 'Ref', taken);
      const text = bibtex.trim().replace(/^(@[A-Za-z]+\s*[{(]\s*)[^,\s{}()"=]+/, (_, head) => head + key);
      try {
        await appendEntry(safeJoin(projectRoot, target), text);
      } catch (err) {
        results.push({ input, status: 'error', message: `Couldn’t write to ${target}: ${err.message}` });
        continue;
      }
      taken.add(key.toLowerCase());
      index.push({ ...id, key });
      results.push({ input, status: 'added', key, bibtex: text, bibFile: target, title: id.displayTitle || undefined, year: id.year || undefined, doi: id.doi || undefined });
    }
    return { results, bibFile: target, bibIncluded: texIncludesBib(sources, target) };
  }));
}

export async function resolveReferences({ projectRoot, input, bibFile, llmConfig, searchConfig }) {
  const items = await splitInput(String(input || ''), llmConfig);
  if (!items.length) throw badRequest('Paste a DOI, link, arXiv ID or title.');
  const out = await resolveItems(projectRoot, items.slice(0, MAX_ITEMS), bibFile, searchConfig);
  if (items.length > MAX_ITEMS) {
    out.results.push({ input: '…', status: 'error', message: `Only the first ${MAX_ITEMS} references were processed. Paste the rest separately.` });
  }
  return out;
}

/** candidateId is a DOI, arXiv id or URL from a 'choose' result. */
export async function addReference({ projectRoot, candidateId, bibFile, searchConfig }) {
  const item = detectInput(candidateId);
  if (item.kind === 'query') throw badRequest('That isn’t a DOI, arXiv ID or link.');
  const { results, ...rest } = await resolveItems(projectRoot, [item], bibFile, searchConfig);
  return { result: results[0], ...rest };
}
