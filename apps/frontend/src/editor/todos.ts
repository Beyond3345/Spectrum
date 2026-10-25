import { matchBrace } from '../../../backend/src/latex/text.js';

// To-dos: the marks a project's source leaves for later (\todo and its kin, TODO in comments), and finding what a
// to-do links to once lines have moved. No DOM here, so the check runs in Node.

export type SourceTodo = { file: string; line: number; text: string; kind: string };

// todonotes' \todo and \missingfigure, \fixme, and the fixme package's notes; not \todototoc or \listoftodos
const COMMAND = /\\(todo|missingfigure|fixme|fxnote|fxwarning|fxerror|fxfatal)(?![A-Za-z@])\*?/g;
// what comes just before a definition of one of them, which isn't a to-do: \newcommand{\todo}, \def\todo, \let\todo
const DEFINED = /\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand|[egx]?def|let)\*?\s*\{?\s*$/;
// \% isn't a comment; \\% is a line break before one
const COMMENT = /\\[^]|%[^\r\n]*/g;
// in a comment, in capitals as a word of its own: "% TODO: cite this", "% FIXME(dan) units", "% XXX"; not a command's
// name, as in a commented-out "% \renewcommand{\TODO}[1]{}"
const MARKER = /(?<![\w\\])(TODO|FIXME|XXX)(?!\w)(?:\([^)]*\))?[\s:.\-–—]*(.*)/;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Counts lines up to each offset asked for, which must not go backwards. */
function lineCounter(text: string) {
  let at = 0;
  let line = 1;
  return (offset: number) => {
    for (; at < offset; at += 1) if (text.charCodeAt(at) === 10) line += 1;
    return line;
  };
}

/** Skips spaces and [optional] arguments (which may hold braces) from `i`; returns where the next thing starts. */
function skipOptional(code: string, i: number) {
  for (;;) {
    while (/\s/.test(code[i] ?? '')) i += 1;
    if (code[i] !== '[') return i;
    let depth = 0;
    for (; i < code.length; i += 1) {
      if (code[i] === '\\') i += 1;
      else if (code[i] === '{') depth += 1;
      else if (code[i] === '}') depth -= 1;
      else if (code[i] === ']' && depth <= 0) break;
    }
    i += 1;
  }
}

/** The text of the {argument} at `i` (after any [options]) with its spaces collapsed, and where it ends; null when there's none. */
function argument(code: string, i: number) {
  const open = skipOptional(code, i);
  if (code[open] !== '{') return null;
  const close = matchBrace(code, open);
  if (close === -1) return null;
  return { text: code.slice(open + 1, close).replace(/\s+/g, ' ').trim(), end: close + 1 };
}

/**
 * The to-dos the source holds, file by file in the order given and then by place: \todo, \missingfigure, \fixme and
 * the fixme package's \fxnote, \fxwarning, \fxerror and \fxfatal (starred, their first argument is the note), and
 * TODO, FIXME or XXX in a comment. A mark that is commented out, or a command being defined, isn't one.
 */
export function scanTodos(files: { path: string; text: string }[]): SourceTodo[] {
  const found: SourceTodo[] = [];
  for (const { path, text } of files) {
    const marks: (SourceTodo & { at: number })[] = [];
    // comments blanked out, so offsets and lines stay as they were
    const code = text.replace(COMMENT, (token) => (token[0] === '%' ? ' '.repeat(token.length) : token));
    const commandLine = lineCounter(text);
    for (const m of code.matchAll(COMMAND)) {
      const at = m.index ?? 0;
      if (DEFINED.test(code.slice(Math.max(0, at - 40), at))) continue;
      const arg = argument(code, at + m[0].length);
      // \todo{#1} is inside another command's definition
      if (!arg || /#\d/.test(arg.text)) continue;
      marks.push({ file: path, line: commandLine(at), text: arg.text || `\\${m[1]}`, kind: m[1], at });
    }
    const commentLine = lineCounter(text);
    for (const m of text.matchAll(COMMENT)) {
      if (m[0][0] !== '%') continue;
      const marker = MARKER.exec(m[0]);
      if (!marker) continue;
      const at = (m.index ?? 0) + (marker.index ?? 0);
      marks.push({ file: path, line: commentLine(at), text: marker[2].trim() || marker[1], kind: marker[1], at });
    }
    // Typst's // TODO and Markdown's <!-- TODO -->, as the LaTeX source's comments hold them
    if (/\.typ$/i.test(path)) {
      for (const m of text.matchAll(/\/\/[ \t]*(TODO|FIXME|XXX)(?:\([^)]*\))?[\s:.\-–—]*(.*)/g)) {
        marks.push({ file: path, line: commandLine(m.index!), text: collapse(m[2]) || m[1], kind: m[1], at: m.index! });
      }
    }
    if (/\.(md|markdown)$/i.test(path)) {
      for (const m of text.matchAll(/<!--\s*(TODO|FIXME|XXX)(?:\([^)]*\))?[\s:.\-–—]*([\s\S]*?)-->/g)) {
        marks.push({ file: path, line: commandLine(m.index!), text: collapse(m[2]) || m[1], kind: m[1], at: m.index! });
      }
    }
    marks.sort((a, b) => a.at - b.at);
    for (const { at: _at, ...todo } of marks) found.push(todo);
  }
  return found;
}

/** What a to-do keeps of the line it links to, to find it again: the line's text, up to 120 characters. */
export const snippetOf = (line: string) => line.trim().slice(0, 120);

/**
 * The line a to-do links to, once lines may have moved: the line itself when it still starts with the snippet,
 * else the nearest line that does, else the line as it was.
 */
export function findLine(text: string, line: number, snippet?: string) {
  const want = snippet?.trim();
  if (!want) return line;
  const lines = text.split('\n');
  const same = (n: number) => lines[n - 1]?.trim().startsWith(want);
  if (same(line)) return line;
  let best = 0;
  for (let n = 1; n <= lines.length; n += 1) if (same(n) && (!best || Math.abs(n - line) < Math.abs(best - line))) best = n;
  return best || line;
}

/** Where a key is defined: its \label in a .tex file, else its entry in a .bib file. */
export function findKey(files: { path: string; text: string }[], key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const label = new RegExp(String.raw`\\label\s*\{\s*${escaped}\s*\}`);
  const entry = new RegExp(String.raw`@\s*\w+\s*[{(]\s*${escaped}\s*,`, 'i');
  for (const pattern of [label, entry]) {
    for (const { path, text } of files) {
      if (/\.bib$/i.test(path) !== (pattern === entry)) continue;
      const m = pattern.exec(text);
      if (m) return { file: path, line: text.slice(0, m.index).split('\n').length };
    }
  }
  return null;
}
