import { diffLines } from 'diff';

// A proposed change to a file, taken apart into its separate changes, so each can be applied, rejected or edited by
// itself. Everything here is text in, text out: the review views call it, and reviewHunks.check.ts runs it.

/** Lines [start, end) of a file (from 0) give way to `lines`, which keep their line ends. */
export type Hunk = {
  start: number;
  end: number;
  lines: string[];
  /** set where the user changed these lines too after the agent read the file: what they held then */
  base?: string[];
};

export type Eol = '\n' | '\r\n';

/** One file's change as its review shows it: against the file as it is now, the user's own edits since kept. */
export type Review = {
  /** the file as it is, in lines */
  mine: string[];
  /** the agent's changes to it, in order, none touching another */
  hunks: Hunk[];
  /** the agent also changed the file's line endings, which no hunk shows: applied or rejected as one more change */
  eol?: { from: Eol; to: Eol };
};

/** A text's lines, each with its line end, so joining them gives the text back whatever its endings. */
export const toLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) || [];

/** ms a line diff may take before the whole old text counts as removed and the new as added */
const TIMEOUT = 1000;

// the diffs used last, most recent first: a review counts every file, then shows one
const recent: { a: string; b: string; hunks: Hunk[] }[] = [];

/** The changes from a to b, by whole lines. A line whose ending alone differs counts as changed, so any of them taken gives a sound file. */
export function hunksOf(a: string, b: string, timeout = TIMEOUT): Hunk[] {
  const at = recent.findIndex((r) => r.a === a && r.b === b);
  let hunks = at < 0 ? undefined : recent.splice(at, 1)[0].hunks;
  if (!hunks) {
    hunks = [];
    const parts = a === b ? [] : diffLines(a, b, { timeout });
    if (!parts) hunks.push({ start: 0, end: toLines(a).length, lines: toLines(b) });
    let line = 0;
    let open: Hunk | null = null;
    for (const part of parts || []) {
      if (!part.added && !part.removed) {
        open = null;
        line += part.count;
        continue;
      }
      if (!open) hunks.push((open = { start: line, end: line, lines: [] }));
      if (part.removed) open.end = line += part.count;
      else open.lines = open.lines.concat(toLines(part.value));
    }
  }
  recent.unshift({ a, b, hunks });
  recent.length = Math.min(recent.length, 32);
  return hunks;
}

/** `lines` with each hunk that `put` gives lines for replaced by them. */
export function build(lines: string[], hunks: Hunk[], put: (hunk: Hunk) => string[] | undefined): string {
  const out: string[] = [];
  let at = 0;
  for (const h of hunks) {
    const taken = put(h);
    if (!taken) continue;
    out.push(lines.slice(at, h.start).join(''), taken.join(''));
    at = h.end;
  }
  out.push(lines.slice(at).join(''));
  return out.join('');
}

/** A text's line ending when every line break in it is the same kind. */
export function eolOf(text: string): Eol | null {
  const crlf = text.split('\r\n').length - 1;
  const all = text.split('\n').length - 1;
  return !all ? null : crlf === all ? '\r\n' : crlf ? null : '\n';
}
const withEol = (text: string, eol: Eol) => text.replace(/\r?\n/g, eol);

// two changes to the same base meet where their lines overlap, or one adds lines inside or at the edge of the other's
const meets = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  (a.start < b.end && b.start < a.end) || (a.start === a.end && a.start >= b.start && a.start <= b.end) || (b.start === b.end && b.start >= a.start && b.start <= a.end);

/**
 * The agent's change (base to theirs) as changes to the file as it is now (mine). Where the user has not touched the
 * lines, a change moves onto their file as it is; where both changed the same lines differently, the hunk replaces the
 * user's lines with the agent's and carries `base`; where both made the same change, nothing is left of it.
 * ponytail: where the base repeats a line the two diffs may place a change at different copies and call it an overlap;
 * the user then sees both versions and chooses, which is safe.
 */
export function review(base: string, mine: string, theirs: string): Review {
  // hunks are told in the user's line endings; the agent changing them is one change of its own
  const own = eolOf(mine);
  const to = eolOf(theirs);
  const eol = own && to && to !== own && eolOf(base) !== to ? { from: own, to } : undefined;
  const same = (text: string) => (own && eolOf(text) && eolOf(text) !== own ? withEol(text, own) : text);
  base = same(base);
  theirs = same(theirs);
  const lines = toLines(mine);
  if (base === mine || mine === theirs) return { mine: lines, hunks: hunksOf(mine, theirs), eol };

  const b = toLines(base);
  // the user's lines changed one for one are each a change of their own: an edit of theirs on the line after the
  // agent's is then not drawn into an overlap
  const A = hunksOf(base, mine).flatMap((h) => (h.lines.length > 1 && h.lines.length === h.end - h.start ? h.lines.map((line, i) => ({ start: h.start + i, end: h.start + i + 1, lines: [line] })) : [h]));
  const B = hunksOf(base, theirs);
  const hunks: Hunk[] = [];
  let ai = 0;
  // how far the user's changes above have moved the lines below
  let shift = 0;
  for (let k = 0; k < B.length; ) {
    for (; ai < A.length && !meets(A[ai], B[k]) && A[ai].start < B[k].start; ai++) shift += A[ai].lines.length - (A[ai].end - A[ai].start);
    const group = { start: B[k].start, end: B[k].end };
    const theirsIn = [B[k++]];
    const mineIn: Hunk[] = [];
    const take = (into: Hunk[], h: Hunk) => {
      into.push(h);
      group.start = Math.min(group.start, h.start);
      group.end = Math.max(group.end, h.end);
    };
    // the user's changes that meet it, then the agent's next ones that meet those, until none does
    for (let grew = true; grew; ) {
      grew = false;
      for (; ai < A.length && meets(A[ai], group); ai++, grew = true) take(mineIn, A[ai]);
      for (; mineIn.length && k < B.length && meets(B[k], group); k++, grew = true) take(theirsIn, B[k]);
    }
    if (!mineIn.length) {
      hunks.push({ start: theirsIn[0].start + shift, end: theirsIn[0].end + shift, lines: theirsIn[0].lines });
      continue;
    }
    // each side's lines for the base lines the group covers
    const side = (list: Hunk[]) => {
      let out: string[] = [];
      let at = group.start;
      for (const h of list) {
        out = out.concat(b.slice(at, h.start), h.lines);
        at = h.end;
      }
      return out.concat(b.slice(at, group.end));
    };
    const [my, their] = [side(mineIn), side(theirsIn)];
    if (my.join('') !== their.join('')) hunks.push({ start: group.start + shift, end: group.start + shift + my.length, lines: their, base: b.slice(group.start, group.end) });
    shift += my.length - (group.end - group.start);
  }
  return { mine: lines, hunks, eol };
}

/** The file with every change taken: what the review shows on the right of the file as it is. */
export const target = (r: Review) => build(r.mine, r.hunks, (h) => h.lines);

/** Text typed in a hunk's editor as the lines that hunk puts in: the file's line endings, and a line end after the last line where one belongs. */
export function editedLines(r: Review, hunk: Hunk, text: string): string[] {
  const eol: Eol = r.mine.some((l) => l.endsWith('\r\n')) ? '\r\n' : '\n';
  const lines = toLines(withEol(text, eol));
  const last = hunk.lines[hunk.lines.length - 1];
  // as the agent's last line had it; where the hunk only removed lines, wherever more lines follow
  const ends = last !== undefined ? last.endsWith('\n') : hunk.end < r.mine.length || (r.mine[r.mine.length - 1]?.endsWith('\n') ?? true);
  if (lines.length && ends && !lines[lines.length - 1].endsWith('\n')) lines[lines.length - 1] += eol;
  return lines;
}

/** A hunk's lines as its editor shows them: without the last line's end, which editedLines puts back. */
export const editText = (hunk: Hunk) => hunk.lines.join('').replace(/\r\n/g, '\n').replace(/\n$/, '');

export type Choice = {
  /** hunks to write to the file now */
  apply?: Hunk[];
  /** hunks to drop from the proposal */
  reject?: Hunk[];
  /** other lines for a hunk than the agent's (the user's edit, or their lines and the agent's in order) */
  lines?: Map<Hunk, string[]>;
  /** the change of line endings, when the review has one */
  eol?: 'apply' | 'reject';
};

/**
 * What a choice among a review's changes comes to. content: the file to write, when anything was applied. original and
 * proposed: what is left to review, the first being the file as written (or as it is) except where an overlap is still
 * open, which keeps the base's lines so it shows as an overlap again; the two are equal once nothing is left.
 */
export function settle(r: Review, { apply = [], reject = [], lines = new Map(), eol }: Choice): { content?: string; original: string; proposed: string } {
  const put = (h: Hunk) => lines.get(h) ?? h.lines;
  const mine = r.mine.join('');
  let content = apply.length ? build(r.mine, r.hunks, (h) => (apply.includes(h) ? put(h) : undefined)) : undefined;
  let original = build(r.mine, r.hunks, (h) => (apply.includes(h) ? put(h) : reject.includes(h) ? undefined : h.base));
  let proposed = build(r.mine, r.hunks, (h) => (reject.includes(h) ? undefined : put(h)));
  if (r.eol && eol === 'apply') [content, original, proposed] = [content ?? mine, original, proposed].map((text) => withEol(text, r.eol!.to));
  // still open: the proposal keeps the agent's endings
  else if (r.eol && !eol) proposed = withEol(proposed, r.eol.to);
  return { ...(content !== undefined && content !== mine && { content }), original, proposed };
}

/** Lines added and removed by a review's changes. */
export function countOf(hunks: Hunk[]) {
  let added = 0;
  let removed = 0;
  for (const h of hunks) {
    added += h.lines.length;
    removed += h.end - h.start;
  }
  return { added, removed };
}

/** "Lines 88 to 90", "Line 12", "After line 40", "At the top": where a hunk is in the file as it is. */
export function where(h: Hunk) {
  if (h.end === h.start) return h.start ? `After line ${h.start}` : 'At the top';
  return h.end - h.start === 1 ? `Line ${h.start + 1}` : `Lines ${h.start + 1} to ${h.end}`;
}

const HEADINGS: [RegExp, RegExp][] = [
  [/\.(tex|ltx|sty|cls)$/i, /^\s*\\(?:part|chapter|(?:sub){0,2}section)\*?\s*(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/],
  [/\.typ$/i, /^=+\s+(.+)/],
  [/\.(md|markdown|qmd|rmd)$/i, /^#{1,6}\s+(.+?)\s*#*\s*$/]
];

/**
 * The heading each hunk comes under (the nearest above it in a LaTeX, Typst or Markdown file; '' above the first, and
 * in any other file), for a long review's section rows.
 * ponytail: a "# comment" in a Markdown code block reads as a heading; a parser if that ever misleads.
 */
export function sections(path: string, r: Review): string[] {
  const heading = HEADINGS.find(([file]) => file.test(path))?.[1];
  if (!heading) return r.hunks.map(() => '');
  let at = 0;
  let title = '';
  return r.hunks.map((h) => {
    // a heading the hunk itself replaces counts: the lines under it are what changed
    for (; at < h.end; at++) title = heading.exec(r.mine[at])?.[1].trim() ?? title;
    return title;
  });
}

/** A new file whose text is a deleted file's: the pair is a file moved or renamed. Created path to deleted path. */
export function renames(changes: { path: string; kind: string; binary?: boolean; original: string; proposed: string }[]) {
  const gone = changes.filter((c) => c.kind === 'deleted' && !c.binary && c.original);
  const moved = new Map<string, string>();
  for (const c of changes) {
    const from = c.kind === 'created' && !c.binary && gone.find((g) => g.original === c.proposed && ![...moved.values()].includes(g.path));
    if (from) moved.set(c.path, from.path);
  }
  return moved;
}
