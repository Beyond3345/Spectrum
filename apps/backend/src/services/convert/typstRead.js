// Reading Typst source by position: where a bracket closes, a call and its arguments, and which parts are code,
// strings, raw text, maths or comments, as Typst's own modes have them. Pure; enough of Typst's syntax for the house
// style, not a parser of all of it.

const CLOSE = { '(': ')', '[': ']', '{': '}' };

/** The end (just past) of a raw text starting at i: `code`, or ```lang ... ```. */
function rawEnd(text, i) {
  let n = 0;
  while (text[i + n] === '`') n += 1;
  if (n === 2) return i + 2;
  const fence = '`'.repeat(n);
  const close = text.indexOf(fence, i + n);
  return close === -1 ? text.length : close + n;
}

/** The end (just past) of a "string" starting at i. */
function stringEnd(text, i) {
  for (let k = i + 1; k < text.length; k += 1) {
    if (text[k] === '\\') k += 1;
    else if (text[k] === '"') return k + 1;
  }
  return text.length;
}

/** The end of a comment starting at i (// or /*), or i when there is none. */
function commentEnd(text, i) {
  if (text[i] !== '/') return i;
  if (text[i + 1] === '/' && text[i - 1] !== ':') {
    const line = text.indexOf('\n', i);
    return line === -1 ? text.length : line;
  }
  if (text[i + 1] === '*') {
    const close = text.indexOf('*/', i + 2);
    return close === -1 ? text.length : close + 2;
  }
  return i;
}

const STATEMENTS = new Set(['let', 'set', 'show', 'import', 'include']);

/**
 * The end of a statement (#let, #set, #show, #import, #include) at i: the end of its line past any brackets, strings
 * and maths it opens, or the bracket around it closing.
 */
export function statementEnd(text, i) {
  for (let k = i; k < text.length; k += 1) {
    const ch = text[k];
    const comment = commentEnd(text, k);
    if (comment !== k) k = comment - 1;
    else if (ch === '(' || ch === '[' || ch === '{') k = groupEnd(text, k) - 1;
    else if (ch === '"') k = stringEnd(text, k) - 1;
    else if (ch === '$') k = mathsEnd(text, k) - 1;
    else if (ch === '\n' || ch === ')' || ch === ']' || ch === '}') return k;
  }
  return text.length;
}

/** The end (just past) of an embedded expression #name… at i in markup or maths: its calls, fields and blocks. */
export function expressionEnd(text, i) {
  let k = i + (text[i] === '#' ? 1 : 0);
  const ident = /^[A-Za-z_][\w-]*/.exec(text.slice(k, k + 200));
  if (!ident) return text[k] === '(' || text[k] === '[' || text[k] === '{' ? groupEnd(text, k) : k;
  if (STATEMENTS.has(ident[0])) return statementEnd(text, k);
  k += ident[0].length;
  for (;;) {
    if (text[k] === '(' || text[k] === '[') k = groupEnd(text, k);
    else if (text[k] === '.' && /[A-Za-z_]/.test(text[k + 1] ?? '')) k += 1 + /^[A-Za-z_][\w-]*/.exec(text.slice(k + 1))[0].length;
    else return text[k] === ';' ? k + 1 : k;
  }
}

/** The end (just past) of the maths starting with the $ at i. */
function mathsEnd(text, i) {
  for (let k = i + 1; k < text.length; k += 1) {
    const ch = text[k];
    if (ch === '\\') k += 1;
    else if (ch === '"') k = stringEnd(text, k) - 1;
    else if (ch === '#') k = expressionEnd(text, k) - 1;
    else if (ch === '$') return k + 1;
  }
  return text.length;
}

/**
 * The end (just past) of the bracketed group opening at i: ( and { hold code, [ holds markup, each with Typst's
 * strings, raw text, comments and maths skipped.
 */
export function groupEnd(text, i) {
  const close = CLOSE[text[i]];
  const markup = text[i] === '[';
  for (let k = i + 1; k < text.length; k += 1) {
    const ch = text[k];
    if (ch === close) return k + 1;
    const comment = commentEnd(text, k);
    if (comment !== k) {
      k = comment - 1;
    } else if (ch === '`') k = rawEnd(text, k) - 1;
    else if (ch === '$') k = mathsEnd(text, k) - 1;
    else if (markup) {
      if (ch === '\\') k += 1;
      else if (ch === '#') k = expressionEnd(text, k) - 1;
      else if (ch === '[') k = groupEnd(text, k) - 1;
    } else if (ch === '"') k = stringEnd(text, k) - 1;
    else if (CLOSE[ch]) k = groupEnd(text, k) - 1;
  }
  return text.length;
}

/** A code argument list (without its brackets) split at its top-level commas: [{ name, value }], name null for a positional one. */
export function splitArgs(code) {
  const args = [];
  let start = 0;
  // comments between the arguments, which aren't part of any
  const comments = [];
  const push = (end) => {
    let part = code.slice(start, end);
    for (const [s, e] of comments.filter(([s, e]) => s >= start && e <= end).reverse()) part = part.slice(0, s - start) + part.slice(e - start);
    part = part.trim();
    if (part) {
      const named = /^([A-Za-z_][\w-]*)\s*:(?!:)\s*([\s\S]*)$/.exec(part);
      args.push(named ? { name: named[1], value: named[2].trim() } : { name: null, value: part });
    }
  };
  for (let k = 0; k < code.length; k += 1) {
    const ch = code[k];
    const comment = commentEnd(code, k);
    if (comment !== k) {
      comments.push([k, comment]);
      k = comment - 1;
    } else if (ch === '"') k = stringEnd(code, k) - 1;
    else if (ch === '`') k = rawEnd(code, k) - 1;
    else if (ch === '$') k = mathsEnd(code, k) - 1;
    else if (CLOSE[ch]) k = groupEnd(code, k) - 1;
    else if (ch === ',') {
      push(k);
      start = k + 1;
    }
  }
  push(code.length);
  return args;
}

/**
 * The call #name(…)[…][…] (or name(…) in code) at i: { name, args (code arguments), bodies (trailing content
 * blocks' markup), end }, or null.
 */
export function callAt(text, i) {
  const at = text[i] === '#' ? i + 1 : i;
  const name = /^[A-Za-z_][\w.-]*/.exec(text.slice(at, at + 200))?.[0];
  if (!name) return null;
  let k = at + name.length;
  const args = [];
  const bodies = [];
  if (text[k] === '(') {
    const end = groupEnd(text, k);
    args.push(...splitArgs(text.slice(k + 1, end - 1)));
    k = end;
  }
  while (text[k] === '[') {
    const end = groupEnd(text, k);
    bodies.push(text.slice(k + 1, end - 1));
    k = end;
  }
  if (!args.length && !bodies.length && text[at + name.length] !== '(') return null;
  return { name, args, bodies, end: k };
}

/** A named argument's value, or the n-th positional one, from splitArgs' list. */
export const arg = (args, name, n = -1) => (name ? args.find((a) => a.name === name)?.value : args.filter((a) => a.name === null)[n]?.value) ?? null;

/** A Typst value that is a content block [...] or a string "..." as its markup, else null. */
export function contentOf(value) {
  const v = String(value ?? '').trim();
  if (v.startsWith('[') && groupEnd(v, 0) === v.length) return v.slice(1, -1);
  if (v.startsWith('"') && stringEnd(v, 0) === v.length) return JSON.parse(v.replace(/\n/g, '\\n')).replace(/[\\#*_$@<`[\]]/g, '\\$&');
  return null;
}

/** A Typst string literal's text, or null. */
export function stringOf(value) {
  const v = String(value ?? '').trim();
  if (!v.startsWith('"') || stringEnd(v, 0) !== v.length) return null;
  try {
    return JSON.parse(v.replace(/\n/g, '\\n'));
  } catch {
    return null;
  }
}

/**
 * The markup of a Typst file as sorted [start, end) spans: its text at the top and inside every content block, without
 * code (a call's arguments), strings, raw text, maths or comments. Where references, labels and typed units live.
 */
export function markupSpans(text) {
  const spans = [];
  const push = (start, end) => end > start && spans.push([start, end]);
  const markup = (from, to) => {
    let start = from;
    for (let k = from; k < to; k += 1) {
      const ch = text[k];
      if (ch === '\\') {
        k += 1;
        continue;
      }
      const comment = commentEnd(text, k);
      const end = comment !== k ? comment : ch === '`' ? rawEnd(text, k) : ch === '$' ? mathsEnd(text, k) : ch === '#' ? expressionEnd(text, k) : k;
      if (end === k) continue;
      push(start, k);
      if (ch === '#') code(k + 1, end);
      k = end - 1;
      start = end;
    }
    push(start, to);
  };
  const code = (from, to) => {
    for (let k = from; k < to; k += 1) {
      const ch = text[k];
      const comment = commentEnd(text, k);
      if (comment !== k) k = comment - 1;
      else if (ch === '"') k = stringEnd(text, k) - 1;
      else if (ch === '`') k = rawEnd(text, k) - 1;
      else if (ch === '$') k = mathsEnd(text, k) - 1;
      else if (ch === '[') {
        const end = groupEnd(text, k);
        markup(k + 1, end - 1);
        k = end - 1;
      }
    }
  };
  markup(0, text.length);
  return spans;
}
