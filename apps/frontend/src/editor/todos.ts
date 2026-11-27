import { matchBrace } from '../../../backend/src/latex/text.js';
import type { LineLink, TodoGroup, TodoGroups } from '../api/client';
import PALETTE from '../app/palette.json';

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

type Own = { text: string; done: boolean; createdAt: string; note?: string; order?: number };

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

/**
 * A to-do's place in its list: its order (after 2.6.1, set when it is added or dragged), or for one from before orders the
 * time it was made, so an old list keeps the order it had, oldest first, and a new one goes after it.
 */
export const orderOf = (t: { order?: number; createdAt: string }) => (Number.isFinite(t.order) ? t.order! : Date.parse(t.createdAt) || 0);

/** Open before done, then each by its place; ticking one leaves it where it was among the done ones. */
export const sortTodos = <T extends Own>(todos: T[]) =>
  [...todos].sort((a, b) => Number(a.done) - Number(b.done) || orderOf(a) - orderOf(b) || a.createdAt.localeCompare(b.createdAt));

type Placed = { id: string; createdAt: string; order?: number; done?: boolean; link?: unknown };

/**
 * The orders that put a to-do at index among the others of a list (sorted, without it): one change, the order half way
 * between its new neighbours, so a move rewrites one file; every to-do of the list numbered again only when the two
 * are too close to split.
 */
export function placeAt(list: Placed[], index: number, id: string, now = Date.now()): Record<string, number> {
  const at = Math.max(0, Math.min(index, list.length));
  const [prev, next] = [list[at - 1], list[at]];
  const a = prev && orderOf(prev);
  const b = next && orderOf(next);
  const order = prev && next ? (a! + b!) / 2 : prev ? Math.max(a! + 1, now) : next ? b! - 1 : now;
  if (!prev || !next || (order > a! && order < b!)) return { [id]: order };
  const changes: Record<string, number> = {};
  [...list.slice(0, at), { id }, ...list.slice(at)].forEach((t, i) => {
    if (!('createdAt' in t) || orderOf(t) !== (i + 1) * 1024) changes[t.id] = (i + 1) * 1024;
  });
  return changes;
}

/**
 * The order a new to-do takes in its list (the others there): after them all, or with placement 'line' and a line link,
 * among those linking the same file by line and column (after the last one before it); one with no line link goes last.
 */
export function newOrder(list: Placed[], link: unknown, placement: 'added' | 'line', now = Date.now()) {
  const sorted = [...list].sort((a, b) => orderOf(a) - orderOf(b));
  // ponytail: two neighbours too close to split leave it level with the first, after it by when it was made
  const slot = (i: number) => {
    const c = placeAt(sorted, i, '', now);
    return Object.keys(c).length === 1 ? c[''] : orderOf(sorted[i - 1]);
  };
  const end = slot(sorted.length);
  const here = link as Partial<LineLink> | undefined;
  if (placement !== 'line' || typeof here?.file !== 'string' || !Number.isInteger(here.line)) return end;
  const key = (l: Partial<LineLink>) => (l.line ?? 0) * 1e6 + (l.col ?? 0);
  const same = (t: Placed) => (t.link as Partial<LineLink> | undefined)?.file === here.file;
  const after = sorted.findIndex((t) => same(t) && key(t.link as LineLink) > key(here));
  const last = sorted.reduce((found, t, i) => (same(t) ? i : found), -1);
  if (after < 0 && last < 0) return end;
  const index = after >= 0 ? after : last + 1;
  return slot(index);
}

/** Where a dragged to-do lands among the rows of its kind (open or done) in a list: before or after the row it is over. */
export function dropIndex(ids: string[], over: string | null, after: boolean) {
  const at = over ? ids.indexOf(over) : -1;
  return at < 0 ? ids.length : at + (after ? 1 : 0);
}

/** What the tab says when it shows nothing: a first hint, a search that found nothing, or the filter's own. */
export function emptyText({ total, show, search }: { total: number; show: 'open' | 'done' | 'all'; search: string }) {
  if (!total) return 'Type a task above, or right-click any line in the editor or a PDF page to link a to-do.';
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

/**
 * A new group, after the others, in a colour from the menu's clear of the other groups' and of the to-dos in no group
 * (taken); a starter group in its own colour (STARTER_HUES) while no colour in use is near it.
 */
export const newGroup = (groups: TodoGroups, name: string, taken: number[] = []): TodoGroup => {
  const others = Object.values(groupHues(groups));
  const own = STARTER_HUES[groupName(name)];
  const free = own !== undefined && [...others, ...taken].every((h) => hueDistance(h, own) >= NEAR);
  return { name: groupName(name), order: Math.max(0, ...Object.values(groups).map((g) => g.order)) + 1, hue: free ? own : pickHue(PICKER_HUES, others, taken, [...others, ...taken]) };
};

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

// ─── a to-do on the words it was added on: the range, found again by its words (routes/todos.js checks the fields) ───

/** A range's words are at most this long, as the backend checks; a longer selection links its line. */
export const MAX_RANGE_TEXT = 2000;

export type Range = { from: number; to: number };
type RangeLink = LineLink & { col: number; endLine: number; endCol: number; text: string };

/** Whether a link holds a range: its words and where they run, with the end after the start. */
export const isRange = (link: unknown): link is RangeLink => {
  const l = link as Partial<RangeLink> | null;
  const n = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  return (
    !!l && typeof l.file === 'string' && n(l.line) && n(l.col) && n(l.endLine) && n(l.endCol) && typeof l.text === 'string' && !!l.text && l.text.length <= MAX_RANGE_TEXT &&
    (l.endLine! > l.line! || (l.endLine === l.line && l.endCol! > l.col!))
  );
};

/** The offset of a line (from 1) and column (from 0) in text; -1 when the text has no such place. */
function offsetOf(text: string, line: number, col: number) {
  let at = 0;
  for (let n = 1; n < line; n += 1) {
    at = text.indexOf('\n', at) + 1;
    if (!at) return -1;
  }
  const end = text.indexOf('\n', at);
  return col <= (end < 0 ? text.length : end) - at ? at + col : -1;
}

/** Where offsets from and to are as a link keeps them: lines from 1, columns from 0. */
export function placeOf(text: string, from: number, to: number) {
  const before = (at: number) => {
    const head = text.slice(0, at);
    return { line: head.split('\n').length, col: at - (head.lastIndexOf('\n') + 1) };
  };
  const [a, b] = [before(from), before(to)];
  return { line: a.line, col: a.col, endLine: b.line, endCol: b.col };
}

/**
 * The words a link holds, in text as it is now: where they were when they are still there, else the place they are
 * nearest to it (by offset), else null: they changed or went, and no other words are taken for them.
 * ponytail: a scan of the whole text for each to-do; fine for a thesis, an index if files grow to megabytes
 */
export function findRange(text: string, link: RangeLink): Range | null {
  const want = link.text;
  const was = offsetOf(text, link.line, link.col);
  if (was >= 0 && text.startsWith(want, was)) return { from: was, to: was + want.length };
  const near = was >= 0 ? was : text.length;
  let best = -1;
  for (let at = text.indexOf(want); at >= 0; at = text.indexOf(want, at + 1)) {
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
    if (at > near) break;
  }
  return best < 0 ? null : { from: best, to: best + want.length };
}

/** A link to the words from..to in text, in file: the range, its words and its first line's snippet. */
export function rangeLink(text: string, file: string, from: number, to: number): RangeLink {
  const place = placeOf(text, from, to);
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const end = text.indexOf('\n', from);
  return { file, ...place, snippet: snippetOf(text.slice(start, end < 0 ? text.length : end)), text: text.slice(from, to) };
}

/** The words as a row quotes them: one line, at most 40 characters. */
export const quoteOf = (words: string) => {
  const one = words.replace(/\s+/g, ' ').trim();
  return `“${one.length > 40 ? `${one.slice(0, 39).trimEnd()}…` : one}”`;
};

/**
 * What a row says a line link points at: main.tex:33 for a line, or for a range its line or lines and its words,
 * quoted, or that they were removed (here, while the file was open) or changed (elsewhere) since.
 */
export function rangeLabel(name: string, link: LineLink, at: { line: number; endLine?: number; found: boolean }) {
  if (!isRange(link)) return `${name}:${at.line}`;
  const end = at.endLine ?? at.line;
  const lines = end > at.line ? `lines ${at.line} to ${end}` : `line ${at.line}`;
  return `${name}, ${lines}: ${at.found ? quoteOf(link.text) : link.removed ? 'text removed' : 'text changed'}`;
}

// ─── colours: the Spectrum wheel's hues (palette.json, as the Compile button runs through them) ───

/** The hues a to-do or group can take: the palette's, round the wheel, each with a name for the group's menu. */
export const TODO_HUES = Object.values(PALETTE)
  .filter((c) => c.hue !== null)
  .map((c, i) => ({ ...c, label: ['Red', 'Orange', 'Amber', 'Yellow', 'Green', 'Mint', 'Teal', 'Cyan', 'Blue', 'Indigo', 'Purple'][i] ?? c.name }));

const BLUE = TODO_HUES.findIndex((c) => c.label === 'Blue');

/**
 * The hues a group can be given, in its menu and when it is made: every one but blue, whose highlight is the colour of
 * the editor's selection with the default accent (CIE ΔE 0 to 3 as drawn, todos.check.ts). Cyan and Indigo stay: they
 * sit 9 to 11 from the selection, as far as the palette's neighbours sit from each other.
 */
export const PICKER_HUES = TODO_HUES.map((_, i) => i).filter((i) => i !== BLUE);

/** The starter groups' colours, which their chips show: Still to write takes Cyan, the nearest hue to blue a group can have. */
export const STARTER_HUES: Record<string, number> = Object.fromEntries(STARTER_GROUPS.map((name, i) => [name, TODO_HUES.findIndex((c) => c.label === ['Red', 'Amber', 'Green', 'Cyan'][i])]));

/** Below this CIE ΔE (CIE76, as the highlights are drawn, the closer of light and dark) two highlights read as one colour. */
export const NEAR = 10;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** CIELAB of an sRGB colour given as channels. */
function lab([r, g, b]: number[]) {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = [f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), f(0.2126 * R + 0.7152 * G + 0.0722 * B), f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** A highlight as drawn: the colour a share of the way over the editor's background. */
export const washLab = (colour: string, share: number, background: string) => lab(channels(background).map((v, i) => v + (channels(colour)[i] - v) * share));
const deltaE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

let distances: number[][] | null = null;
/** How far apart two hues' highlights look: CIE ΔE as drawn on Spectrum's light and dark editor, the closer of the two. */
export function hueDistance(a: number, b: number) {
  distances ??= TODO_HUES.map((x) =>
    TODO_HUES.map((y) =>
      Math.min(deltaE(washLab(x.band, WASH.light, '#ffffff'), washLab(y.band, WASH.light, '#ffffff')), deltaE(washLab(x.dark, WASH.dark, '#0f0f0f'), washLab(y.dark, WASH.dark, '#0f0f0f')))
    )
  );
  return distances[a][b];
}

/**
 * The hues a to-do in no group is given: the most hues with every two at NEAR or more apart (Red, Amber, Green, Teal
 * and Indigo, at 13.8 or more), so red never sits beside orange; no blue. todos.check.ts checks none can be added.
 */
export const AUTO_HUES = ['Red', 'Amber', 'Green', 'Teal', 'Indigo'].map((name) => TODO_HUES.findIndex((c) => c.label === name));

/** A stored hue as a place on the wheel, or undefined when it is none (a later version's wider wheel wraps). */
export const hueOf = (hue: unknown) => (Number.isInteger(hue) && (hue as number) >= 0 ? (hue as number) % TODO_HUES.length : undefined);

const nearest = (to: number[], hue: number) => (to.length ? Math.min(...to.map((h) => hueDistance(h, hue))) : Infinity);

/**
 * The hue to give among candidates: one nobody uses (used), the farthest from the near ones first (a to-do's
 * neighbours in its file) and then from the rest in use; when all are used, the least used, farthest from the near
 * ones. Ties go to the first candidate, so the same list gives the same colours every time.
 */
export function pickHue(candidates: number[], near: number[], rest: number[], used: number[]) {
  const score = (h: number) => {
    const uses = used.filter((u) => u === h).length;
    return uses ? [0, -uses, nearest(near, h)] : [1, nearest(near, h), nearest([...near, ...rest], h)];
  };
  let best = candidates[0];
  let top = score(best);
  for (const h of candidates.slice(1)) {
    const s = score(h);
    const i = s.findIndex((v, k) => v !== top[k]);
    if (i >= 0 && s[i] > top[i]) [best, top] = [h, s];
  }
  return best;
}

/**
 * Each group's hue: its own, shown as the nearest hue in the menu when it is one the menu no longer has (blue), or for
 * one from before colours, one picked clear of the groups above it.
 */
export function groupHues(groups: TodoGroups) {
  const hues: Record<string, number> = {};
  const used: number[] = [];
  for (const g of orderedGroups(groups)) {
    const own = hueOf(g.hue);
    const h = own === undefined ? pickHue(PICKER_HUES, [], used, used) : PICKER_HUES.includes(own) ? own : PICKER_HUES.reduce((a, b) => (hueDistance(own, b) < hueDistance(own, a) ? b : a));
    used.push((hues[g.id] = h));
  }
  return hues;
}

type Coloured = { id: string; createdAt: string; group?: string; hue?: number; done?: boolean; link?: unknown };
const fileOf = (t: Coloured) => {
  const l = t.link as { file?: unknown } | undefined;
  return typeof l?.file === 'string' ? l.file : '';
};

/**
 * Each to-do's hue by its id: its group's, or in no group one worked out each time and never stored (a colour stored on one is passed over, as
 * none is picked by hand): the open ones oldest first, then the ticked ones, each picked from AUTO_HUES
 * as far as can be from the open ones in no group in its own file, then from all of them and the groups' colours.
 * ponytail: ticking or deleting an older one can recolour the ones after it; stored choices if that grates
 */
export function todoHues(todos: Coloured[], groups: TodoGroups) {
  const byGroup = groupHues(groups);
  const hues = new Map<string, number>();
  const given: { hue: number; file: string; open: boolean }[] = [];
  const loose = [...todos].filter((t) => !groupOf(t, groups)).sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.createdAt.localeCompare(b.createdAt));
  for (const t of todos) if (groupOf(t, groups)) hues.set(t.id, byGroup[groupOf(t, groups)]);
  for (const t of loose) {
    const file = fileOf(t);
    const open = given.filter((g) => g.open);
    const h = pickHue(
      AUTO_HUES,
      open.filter((g) => file && g.file === file).map((g) => g.hue),
      [...open.map((g) => g.hue), ...Object.values(byGroup)],
      [...given.map((g) => g.hue), ...Object.values(byGroup)]
    );
    given.push({ hue: h, file, open: !t.done });
    hues.set(t.id, h);
  }
  return hues;
}

/** The hues to-dos in no group show: what a new group's colour steers clear of. */
export const looseHues = (todos: Coloured[], groups: TodoGroups) => {
  const hues = todoHues(todos, groups);
  return todos.filter((t) => !groupOf(t, groups)).map((t) => hues.get(t.id)!);
};

// how strong a highlight is over the editor's own background: soft enough that every editor theme's text reads on it
// (todos.check.ts measures it), strong enough to tell the hues apart
export const WASH = { light: 0.22, dark: 0.2 };

/**
 * The colours as CSS: each .todo-hue-<n> sets --todo-dot (the row's dot, the palette's colour for marks) and --todo-wash
 * (the highlight: the band colour, see-through so the selection and search matches show under it), in light and dark.
 * The same in both colour styles: here colour is what ties a highlight to its row, not decoration.
 */
export function hueCss() {
  const alpha = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
  const rules = (dark: boolean, root: string) =>
    TODO_HUES.map((c, i) => `${root} .todo-hue-${i} { --todo-dot: ${dark ? c.dark : c.light}; --todo-wash: ${dark ? alpha(c.dark, WASH.dark) : alpha(c.band, WASH.light)}; }`).join('\n');
  return [rules(false, ':root'), rules(true, ":root[data-theme='dark']"), `@media (prefers-color-scheme: dark) {\n${rules(true, ":root:not([data-theme='light'])")}\n}`].join('\n');
}

// ─── dragging a to-do onto a group ───

/**
 * The group a to-do dropped on a zone goes in: '' for the top (no group), a group's id, or null when it stays where it
 * is (dropped outside any zone, on its own group, or on a group that has gone meanwhile).
 */
export function dropGroup(zone: string | null | undefined, current: string, groups: TodoGroups): string | null {
  if (zone == null) return null;
  const to = zone && Object.prototype.hasOwnProperty.call(groups, zone) ? zone : zone ? null : '';
  return to === null || to === current ? null : to;
}
