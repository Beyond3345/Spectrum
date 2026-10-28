// Explicit language markup, which wins over detection: babel and polyglossia in LaTeX, text(lang:) in Typst and
// Pandoc's lang attribute in Markdown. Returns the document's main language and the stretches whose language the
// markup fixes, each as a catalogue tag (french is fr, british en-GB) or, for a language the catalogue lacks, the
// BCP 47 tag as written. The frontend imports this file too (see markup.d.ts).
import catalogue from '../data/languages.json' with { type: 'json' };

const BY_NAME = new Map(catalogue.languages.flatMap(({ tag, babel }) => babel.map((name) => [name.toLowerCase(), tag])));
const TAGS = new Set(catalogue.languages.map(({ tag }) => tag));
// regions where Chinese is written in Traditional characters, and where in Simplified
const TRADITIONAL = new Set(['TW', 'HK', 'MO']);
const SIMPLIFIED = new Set(['CN', 'SG']);

/** A babel or polyglossia name, or a BCP 47 tag (with Typst's separate region), as a catalogue tag; null if neither. */
export function languageTag(name, region = '') {
  const raw = String(name || '').trim();
  const named = BY_NAME.get(raw.toLowerCase());
  if (named) return named;
  const m = raw.match(/^([a-z]{2,3})(?:[-_]([a-z]{4}))?(?:[-_]([a-z]{2}|\d{3}))?$/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  const script = m[2] ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : '';
  const area = (region || m[3] || '').toUpperCase();
  if (lang === 'zh') {
    if (script === 'Hant' || TRADITIONAL.has(area)) return 'zh-TW';
    if (script === 'Hans' || SIMPLIFIED.has(area)) return 'zh-CN';
    return 'zh';
  }
  for (const tag of [script && `${lang}-${script}`, area && `${lang}-${area}`]) if (tag && TAGS.has(tag)) return tag;
  return TAGS.has(lang) || !area ? lang : `${lang}-${area}`;
}

/** The source with % comments blanked to spaces, so markup in a comment counts for nothing. */
function uncommented(s) {
  return s.replace(/(^|[^\\])((?:\\\\)*)%[^\n]*/g, (all, before, slashes) => before + slashes + ' '.repeat(all.length - before.length - slashes.length));
}

/** Index just past the group that opens at i ({…}, […] or (…)), braces nesting; -1 if it never closes. */
function close(s, i) {
  const open = s[i];
  const shut = { '{': '}', '[': ']', '(': ')' }[open];
  let depth = 0;
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (c === '\\') j += 1;
    else if (c === '"' && open === '(') {
      for (j += 1; j < s.length && s[j] !== '"'; j += 1) if (s[j] === '\\') j += 1;
    } else if (c === open) depth += 1;
    else if (c === shut && (depth -= 1) === 0) return j + 1;
  }
  return -1;
}

const skipBlank = (s, i) => {
  while (/\s/.test(s[i] || '')) i += 1;
  return i;
};

/** An optional […] at i: its text and where it ends. */
const optional = (s, i) => {
  const at = skipBlank(s, i);
  if (s[at] !== '[') return { text: '', end: i };
  const end = close(s, at);
  return end < 0 ? { text: '', end: i } : { text: s.slice(at + 1, end - 1), end };
};

/** A {…} at i: its text, where its content starts and ends, or null. */
const argument = (s, i) => {
  const at = skipBlank(s, i);
  if (s[at] !== '{') return null;
  const end = close(s, at);
  return end < 0 ? null : { text: s.slice(at + 1, end - 1).trim(), from: at + 1, to: end - 1, end };
};

/** polyglossia's variant=british picks the variant; otherwise the language's own name. */
const named = (name, options = '') => languageTag(options.match(/variant\s*=\s*([\w-]+)/)?.[1] || '') || languageTag(name);

function latex(source) {
  const s = uncommented(source);
  const ranges = [];
  let main = null;
  // babel's main= option, else its last language; polyglossia's \setmainlanguage
  for (const m of s.matchAll(/\\usepackage\s*\[([^\]]*)\]\s*\{[^}]*\bbabel\b[^}]*\}/g)) {
    const options = m[1].split(',').map((o) => o.trim()).filter(Boolean);
    const chosen = options.find((o) => /^main\s*=/.test(o))?.replace(/^main\s*=\s*/, '') || options.filter((o) => !o.includes('=')).at(-1);
    main = languageTag(chosen) || main;
  }
  for (const m of s.matchAll(/\\set(?:main|default)language\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) main = named(m[2], m[1]) || main;

  // \selectlanguage holds until the next one
  const selects = [...s.matchAll(/\\selectlanguage\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)];
  selects.forEach((m, k) => {
    const lang = named(m[2], m[1]);
    if (lang) ranges.push({ from: m.index + m[0].length, to: selects[k + 1]?.index ?? s.length, lang });
  });
  // \foreignlanguage[opts]{name}{text} and polyglossia's \text<name>[opts]{text}
  for (const m of s.matchAll(/\\foreignlanguage\b/g)) {
    const opts = optional(s, m.index + m[0].length);
    const name = argument(s, opts.end);
    const body = name && argument(s, name.end);
    const lang = body && named(name.text, opts.text);
    if (lang) ranges.push({ from: body.from, to: body.to, lang });
  }
  for (const m of s.matchAll(/\\text([a-zA-Z]+)\b/g)) {
    if (!BY_NAME.has(m[1].toLowerCase())) continue;
    const opts = optional(s, m.index + m[0].length);
    const body = argument(s, opts.end);
    if (body) ranges.push({ from: body.from, to: body.to, lang: named(m[1], opts.text) });
  }
  // \begin{otherlanguage}{name}, otherlanguage*, and polyglossia's \begin{name}; each to its matching \end
  for (const m of s.matchAll(/\\begin\s*\{(otherlanguage\*?|[a-zA-Z]+)\}/g)) {
    const env = m[1];
    let lang, from;
    if (env.startsWith('otherlanguage')) {
      const opts = optional(s, m.index + m[0].length);
      const name = argument(s, opts.end);
      if (!name) continue;
      lang = named(name.text, opts.text);
      from = name.end;
    } else {
      if (!BY_NAME.has(env.toLowerCase())) continue;
      const opts = optional(s, m.index + m[0].length);
      lang = named(env, opts.text);
      from = opts.end;
    }
    const pattern = new RegExp(String.raw`\\(begin|end)\s*\{${env.replace('*', '\\*')}\}`, 'g');
    pattern.lastIndex = from;
    let depth = 1, to = s.length;
    for (let e = pattern.exec(s); e; e = pattern.exec(s)) {
      depth += e[1] === 'begin' ? 1 : -1;
      if (!depth) {
        to = e.index;
        break;
      }
    }
    if (lang) ranges.push({ from, to, lang });
  }
  return { main, ranges };
}

/** lang: and region: from Typst arguments such as (lang: "fr", region: "ca", size: 10pt). */
function typstLang(args) {
  const lang = args.match(/\blang\s*:\s*"([^"]*)"/)?.[1];
  return lang ? languageTag(lang, args.match(/\bregion\s*:\s*"([^"]*)"/)?.[1]) : null;
}

function typst(s) {
  const ranges = [];
  let main = null;
  // a #set text(lang: …) at the start of a line, outside any block, sets the document's language
  for (const m of s.matchAll(/^#set\s+text\s*\(/gm)) {
    const end = close(s, m.index + m[0].length - 1);
    const lang = end > 0 && typstLang(s.slice(m.index, end));
    if (lang && !main) main = lang;
  }
  // #text(lang: …)[content]
  for (const m of s.matchAll(/#text\s*\(/g)) {
    const end = close(s, m.index + m[0].length - 1);
    if (end < 0) continue;
    const lang = typstLang(s.slice(m.index, end));
    const at = skipBlank(s, end);
    const body = s[at] === '[' ? close(s, at) : -1;
    if (lang && body > 0) ranges.push({ from: at + 1, to: body - 1, lang });
  }
  return { main, ranges };
}

const pandocLang = (attrs) => {
  const lang = attrs.match(/(?:^|\s)lang\s*=\s*["']?([\w-]+)/)?.[1];
  return lang ? languageTag(lang) : null;
};

function markdown(s) {
  const ranges = [];
  const front = s.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n/);
  const main = front ? languageTag(front[1].match(/^lang\s*:\s*["']?([\w-]+)/m)?.[1]) : null;
  // [text]{lang=fr}
  for (const m of s.matchAll(/\[([^\]\n]*)\]\{([^}\n]*)\}/g)) {
    const lang = pandocLang(m[2]);
    if (lang) ranges.push({ from: m.index + 1, to: m.index + 1 + m[1].length, lang });
  }
  // ::: {lang=fr} … ::: (ponytail: ends at the next bare fence, so a div nested inside one ends it early)
  for (const m of s.matchAll(/^(:{3,})\s*\{([^}\n]*)\}[^\n]*\n/gm)) {
    const lang = pandocLang(m[2]);
    if (!lang) continue;
    const from = m.index + m[0].length;
    const fence = new RegExp(`^:{${m[1].length},}\\s*$`, 'm').exec(s.slice(from));
    ranges.push({ from, to: fence ? from + fence.index : s.length, lang });
  }
  return { main, ranges };
}

/**
 * The language markup in a file: { main, ranges: [{ from, to, lang }] }, ranges in order and not overlapping, the
 * innermost markup winning where they nest. kind is latex, typst, markdown or text.
 */
export function languageMarkup(source, kind) {
  const s = String(source);
  const found = kind === 'latex' ? latex(s) : kind === 'typst' ? typst(s) : kind === 'markdown' ? markdown(s) : { main: null, ranges: [] };
  return { main: found.main, ranges: flatten(found.ranges.filter((r) => r.lang && r.to > r.from)) };
}

/** Nested ranges as one flat list, the one starting last (the innermost) winning. ponytail: O(ranges²), fine for markup. */
function flatten(ranges) {
  const cuts = [...new Set(ranges.flatMap(({ from, to }) => [from, to]))].sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k + 1 < cuts.length; k += 1) {
    const [from, to] = [cuts[k], cuts[k + 1]];
    const inner = ranges.filter((r) => r.from <= from && r.to >= to).sort((a, b) => b.from - a.from || a.to - b.to)[0];
    if (!inner) continue;
    const last = out.at(-1);
    if (last && last.to === from && last.lang === inner.lang) last.to = to;
    else out.push({ from, to, lang: inner.lang });
  }
  return out;
}

/**
 * The masked prose cut into the pieces detection decides one at a time: paragraphs (at blank lines), cut again where
 * markup's ranges start and end. [{ from, to, lang? }] in order, leaving out pieces with no letters or digits.
 */
export function prosePieces(prose, ranges = [], from = 0, to = prose.length) {
  const cuts = new Set([from, to]);
  for (const r of ranges) for (const at of [r.from, r.to]) if (at > from && at < to) cuts.add(at);
  const blank = /\n[ \t\r]*\n/g;
  blank.lastIndex = from;
  for (let m = blank.exec(prose); m && m.index < to; m = blank.exec(prose)) cuts.add(m.index + 1);
  const edges = [...cuts].sort((a, b) => a - b);
  const pieces = [];
  let r = 0;
  for (let k = 0; k + 1 < edges.length; k += 1) {
    const [start, end] = [edges[k], edges[k + 1]];
    if (!/[\p{L}\p{N}]/u.test(prose.slice(start, end))) continue;
    while (r < ranges.length && ranges[r].to <= start) r += 1;
    const lang = ranges[r] && ranges[r].from <= start && ranges[r].to >= end ? ranges[r].lang : undefined;
    pieces.push(lang ? { from: start, to: end, lang } : { from: start, to: end });
  }
  return pieces;
}
