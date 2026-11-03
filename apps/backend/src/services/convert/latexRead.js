// Reading LaTeX source: arguments, environments, comments and maths, by position, for the converter's passes. Pure.
import { matchBrace } from '../../latex/text.js';

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The line (from 1) of index in text. */
export const lineAt = (text, index) => text.slice(0, Math.max(0, index)).split('\n').length;

// where an argument can start: after spaces and one line break, never a blank line
const skipSpace = (text, i) => i + /^[ \t]*(?:\n[ \t]*)?/.exec(text.slice(i, i + 400))[0].length;

/** The {…} group at i (after spaces): { arg, end }, end just past its }, or null. */
export function braceArg(text, i) {
  const at = skipSpace(text, i);
  if (text[at] !== '{') return null;
  const close = matchBrace(text, at);
  return close === -1 ? null : { arg: text.slice(at + 1, close), end: close + 1 };
}

/** The […] argument at i (after spaces), braces inside it kept whole: { arg, end }, or null. */
export function optionalArg(text, i) {
  const at = skipSpace(text, i);
  if (text[at] !== '[') return null;
  let depth = 0;
  for (let k = at + 1; k < text.length; k += 1) {
    const ch = text[k];
    if (ch === '\\') k += 1;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === ']' && depth === 0) return { arg: text.slice(at + 1, k), end: k + 1 };
  }
  return null;
}

/** A command's arguments from i by spec, o for […] and m for {…}: { args, end }, or null when a {…} is missing. */
export function commandArgs(text, i, spec) {
  const args = [];
  let end = i;
  for (const kind of spec) {
    const found = kind === 'o' ? optionalArg(text, end) : braceArg(text, end);
    if (!found && kind === 'm') return null;
    args.push(found ? found.arg : null);
    if (found) end = found.end;
  }
  return { args, end };
}

/** The index and length of the \end{name} closing a \begin{name} whose body starts at from, or null. */
function matchEnd(text, name, from) {
  const tag = new RegExp('\\\\(begin|end)\\s*\\{' + escapeRe(name) + '\\}', 'g');
  tag.lastIndex = from;
  let depth = 1;
  for (let m; (m = tag.exec(text)); ) {
    depth += m[1] === 'begin' ? 1 : -1;
    if (depth === 0) return { index: m.index, length: m[0].length };
  }
  return null;
}

/** Each outermost \begin{name}…\end{name} of one of names: { name, start, body, end, bodyStart }, in order. */
export function environments(text, names) {
  const found = [];
  const begin = new RegExp('\\\\begin\\s*\\{(' + names.map(escapeRe).join('|') + ')\\}', 'g');
  for (let m; (m = begin.exec(text)); ) {
    const close = matchEnd(text, m[1], begin.lastIndex);
    if (!close) continue;
    found.push({ name: m[1], start: m.index, bodyStart: begin.lastIndex, body: text.slice(begin.lastIndex, close.index), end: close.index + close.length });
    begin.lastIndex = close.index + close.length;
  }
  return found;
}

/** text with each span [start, end) replaced by render(item); spans in order and apart. */
export function splice(text, items, render) {
  let out = '';
  let last = 0;
  for (const item of items) {
    out += text.slice(last, item.start) + render(item);
    last = item.end;
  }
  return out + text.slice(last);
}

/**
 * text with each match of pattern (global) replaced by fn(match, text) => { text, end } read from that point on, or
 * left as it is when fn gives null.
 */
export function rewrite(text, pattern, fn) {
  let out = '';
  let last = 0;
  pattern.lastIndex = 0;
  for (let m; (m = pattern.exec(text)); ) {
    if (m.index < last) continue;
    const r = fn(m, text);
    if (!r) {
      if (!m[0]) pattern.lastIndex += 1;
      continue;
    }
    out += text.slice(last, m.index) + r.text;
    last = r.end;
    pattern.lastIndex = Math.max(r.end, m.index + 1);
  }
  return out + text.slice(last);
}

/** text with each comment blanked to spaces, so constructs are found where TeX sees them and positions stay. */
export const maskComments = (text) => text.replace(/\\[\s\S]|%[^\n]*/g, (token) => (token[0] === '%' ? ' '.repeat(token.length) : token));

const MATH_ENVS = /\\begin\{(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath)(\*?)\}/y;

/** The maths in text (comments already gone) as sorted [start, end) spans: $…$, $$…$$, \(…\), \[…\] and the maths environments. */
export function mathSpans(text) {
  const spans = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === '(' || next === '[') {
        const close = text.indexOf(next === '(' ? '\\)' : '\\]', i + 2);
        if (close !== -1) {
          spans.push([i, close + 2]);
          i = close + 1;
          continue;
        }
      }
      MATH_ENVS.lastIndex = i;
      const env = MATH_ENVS.exec(text);
      if (env) {
        const tag = '\\end{' + env[1] + env[2] + '}';
        const close = text.indexOf(tag, i);
        if (close !== -1) {
          spans.push([i, close + tag.length]);
          i = close + tag.length - 1;
          continue;
        }
      }
      i += 1;
    } else if (ch === '$') {
      const len = text[i + 1] === '$' ? 2 : 1;
      let close = i + len;
      while (close < text.length && (text[close] !== '$' || text[close - 1] === '\\')) close += 1;
      if (close >= text.length) continue;
      spans.push([i, close + len]);
      i = close + len - 1;
    }
  }
  return spans;
}

/** Whether index is inside one of spans. */
export const inside = (spans, index) => spans.some(([start, end]) => index >= start && index < end);

/** The groups of a comma list at depth 0: a, {b, c} gives a and {b, c}. */
export function splitTop(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') i += 1;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** key = value options as a Map: margin=25mm,hidelinks gives margin → 25mm and hidelinks → ''. */
export function keyValues(text) {
  const map = new Map();
  for (const part of splitTop(String(text ?? ''))) {
    const at = part.indexOf('=');
    const key = (at === -1 ? part : part.slice(0, at)).trim();
    if (key) map.set(key, at === -1 ? '' : part.slice(at + 1).trim().replace(/^\{([\s\S]*)\}$/, '$1'));
  }
  return map;
}

/** A TeX length as Typst writes it: 25mm, 1.5cm, 12pt, 2em; \textwidth and \linewidth as a share; \fill as 1fr. */
export function typstLength(text) {
  const t = String(text ?? '').trim();
  if (/^\\(?:fill|stretch\{[^}]*\})$/.test(t)) return '1fr';
  const share = /^(\d*\.?\d*)\s*\\(?:linewidth|textwidth|columnwidth|hsize)$/.exec(t);
  if (share) return Math.round((share[1] === '' ? 1 : Number(share[1])) * 100) + '%';
  const m = /^(-?\d*\.?\d+)\s*(mm|cm|in|pt|bp|em|ex)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'ex' ? +(n / 2).toFixed(3) + 'em' : m[2] === 'bp' ? n + 'pt' : n + m[2];
}

/** A TeX length in millimetres, or null. */
export function lengthMm(text) {
  const m = /^(-?\d*\.?\d+)\s*(mm|cm|in|pt|bp)$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72.27, bp: 25.4 / 72 }[m[2]];
}
