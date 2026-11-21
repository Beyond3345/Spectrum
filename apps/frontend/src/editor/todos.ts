import { matchBrace } from '../../../backend/src/latex/text.js';
import type { TodoGroup, TodoGroups } from '../api/client';

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
    // Typst and Markdown have neither LaTeX's \todo nor its % comments, which a Typst width: 80% would start;
    // ponytail: Markdown's raw LaTeX goes unread
    const latex = !/\.(typ|md|markdown)$/i.test(path);
    // comments blanked out, so offsets and lines stay as they were
    const code = text.replace(COMMENT, (token) => (token[0] === '%' ? ' '.repeat(token.length) : token));
    const commandLine = lineCounter(text);
    for (const m of latex ? code.matchAll(COMMAND) : []) {
      const at = m.index ?? 0;
      if (DEFINED.test(code.slice(Math.max(0, at - 40), at))) continue;
      const arg = argument(code, at + m[0].length);
      // \todo{#1} is inside another command's definition
      if (!arg || /#\d/.test(arg.text)) continue;
      marks.push({ file: path, line: commandLine(at), text: arg.text || `\\${m[1]}`, kind: m[1], at });
    }
    const commentLine = lineCounter(text);
    for (const m of latex ? text.matchAll(COMMENT) : []) {
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

// ─── your own to-dos: the note, search, counts, order ───

/** A to-do's note is at most this long, as the backend checks (routes/todos.js). */
export const MAX_NOTE = 4000;

type Own = { text: string; done: boolean; createdAt: string; note?: string };

/** A to-do with the note as typed: trimmed, capped, and taken off when it's empty. */
export function withNote<T extends Own>(todo: T, note: string): T {
  const { note: _old, ...rest } = todo;
  const clean = note.trim().slice(0, MAX_NOTE);
  return (clean ? { ...rest, note: clean } : rest) as T;
}

/** Whether the search (lower case, trimmed) finds a to-do: in its text, its note or what else it shows (its link, its group's name). */
export const todoMatches = (needle: string, todo: { text: string; note?: string }, ...shown: string[]) =>
  !needle || [todo.text, todo.note ?? '', ...shown].some((t) => t.toLowerCase().includes(needle));

/** The filters' counts: open is yours not ticked and every mark in the source, done yours ticked. */
export function todoCounts(mine: { done: boolean }[], source: unknown[]) {
  const done = mine.filter((t) => t.done).length;
  return { open: mine.length - done + source.length, done, all: mine.length + source.length };
}

/** Open before done, then oldest first, so a list keeps the order it was written in. */
export const sortTodos = <T extends Own>(todos: T[]) => [...todos].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));

/** What the tab says when it shows nothing: a first hint, a search that found nothing, or the filter's own. */
export function emptyText({ total, show, search }: { total: number; show: 'open' | 'done' | 'all'; search: string }) {
  if (!total) return 'Nothing to do yet. Type one above, or right-click a line in the editor or a page of the PDF to add one that links to it.';
  if (search) return `No to-dos match “${search}”.`;
  // with to-dos and no search, only Open or Done can be empty
  return show === 'done' ? 'Nothing ticked off yet.' : 'All done. Ticked ones are under Done.';
}

// ─── groups: the user's own, by name (routes/todos.js keeps them in the project's settings) ───

/** Groups a writer often wants, offered until the project has its own. */
export const STARTER_GROUPS = ['Checking', 'Spelling', 'References', 'Still to write'];
/** A group's name is at most this long, as the backend checks. */
export const MAX_GROUP_NAME = 80;

export type GroupEntry = TodoGroup & { id: string };

/** The groups in their order (by name where two share a place, as a merge of two computers' orders can leave them). */
export const orderedGroups = (groups: TodoGroups): GroupEntry[] =>
  Object.entries(groups)
    .map(([id, g]) => ({ ...g, id }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

/** The group a to-do is in, '' for none: also when it names a group that is gone, deleted here or on another computer. */
export const groupOf = (todo: { group?: string }, groups: TodoGroups) => (todo.group && Object.prototype.hasOwnProperty.call(groups, todo.group) ? todo.group : '');

/** A name as a group keeps it: one line, trimmed, capped. */
export const groupName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME);

/** The id of the group with this name in any letter case, '' when there is none. */
export const groupNamed = (groups: TodoGroups, name: string) => {
  const want = groupName(name).toLocaleLowerCase();
  return orderedGroups(groups).find((g) => g.name.toLocaleLowerCase() === want)?.id ?? '';
};

/** A new group, after the others. */
export const newGroup = (groups: TodoGroups, name: string): TodoGroup => ({ name: groupName(name), order: Math.max(0, ...Object.values(groups).map((g) => g.order)) + 1 });

/** What moves a group one place up (-1) or down (1): the order numbered again from 1, only the groups whose place changed. */
export function moveGroup(groups: TodoGroups, id: string, by: -1 | 1): Record<string, TodoGroup> {
  const list = orderedGroups(groups);
  const at = list.findIndex((g) => g.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= list.length) return {};
  [list[at], list[to]] = [list[to], list[at]];
  const changes: Record<string, TodoGroup> = {};
  list.forEach(({ id: key, ...g }, i) => {
    if (g.order !== i + 1) changes[key] = { ...g, order: i + 1 };
  });
  return changes;
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
