import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { diffArrays, diffLines, diffWordsWithSpace } from 'diff';
import type { ChangeObject } from 'diff';

/** Part of a changed line; changed parts get the stronger tint. */
export type DiffSegment = { text: string; changed: boolean };

export type DiffRow = {
  /** the line numbers on each side, so it stays the same across renders */
  id: string;
  type: 'context' | 'changed' | 'removed' | 'added';
  left?: string;
  right?: string;
  leftNo?: number;
  rightNo?: number;
  /** word-level parts of a changed row; without them the whole line is tinted */
  words?: { left: DiffSegment[]; right: DiffSegment[] };
  /** this side's last line has no newline at the end and the other side's has one */
  noNewline?: 'left' | 'right';
};

/** Unchanged lines left out between hunks, shown when asked. */
export type DiffFold = { type: 'fold'; id: string; leftStart: number; rightStart: number; count: number; rows: DiffRow[] };

export type DiffItem = DiffRow | DiffFold;

/** ms a line diff may take before the whole old text counts as removed and the new as added */
const TIMEOUT = 1000;
/** longer lines are tinted whole: a word diff of them costs more than it shows */
const LONG_LINE = 4000;
/** ms all the word diffs of one file may take; changed lines after that are tinted whole */
const WORD_BUDGET = 100;

function splitLines(text: string) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// the line diffs used last, most recent first: the review sheet counts every file, then shows one
const recent: { original: string; proposed: string; parts: ChangeObject<string>[] }[] = [];

function lineDiff(original: string, proposed: string, timeout = TIMEOUT) {
  const at = recent.findIndex((r) => r.original === original && r.proposed === proposed);
  const parts = (at < 0 ? undefined : recent.splice(at, 1)[0].parts) ??
    diffLines(original, proposed, { timeout }) ?? [
      { value: original, added: false, removed: true, count: splitLines(original).length },
      { value: proposed, added: true, removed: false, count: splitLines(proposed).length }
    ].filter((p) => p.value);
  recent.unshift({ original, proposed, parts });
  recent.length = Math.min(recent.length, 32);
  return parts;
}

// a mark after the split (an accent, a vowel sign, a skin tone, a joined emoji) would draw detached
const CLUSTER_TAIL = /^[\p{M}\u200d\u{1F3FB}-\u{1F3FF}]/u;
const splitsCluster = (segs: DiffSegment[]) =>
  segs.some((s, i) => i > 0 && (CLUSTER_TAIL.test(s.text) || segs[i - 1].text.endsWith('\u200d')));

/** Word-level parts of a changed line, or none when most of it changed, it's very long or `until` passes. */
function wordDiff(left: string, right: string, until: number) {
  if (Math.max(left.length, right.length) > LONG_LINE) return undefined;
  // CJK and punctuation are a token per character, so LONG_LINE alone doesn't bound the time
  const parts = diffWordsWithSpace(left, right, { timeout: Math.max(1, until - Date.now()) });
  if (!parts) return undefined;
  // against the shorter side, so words added to a line still show; spaces alone don't make two lines alike
  const same = parts.reduce((n, p) => (p.added || p.removed || !p.value.trim() ? n : n + p.value.length), 0);
  if (same * 3 < Math.min(left.length, right.length)) return undefined;
  const words = {
    left: parts.filter((p) => !p.added).map((p) => ({ text: p.value, changed: p.removed })),
    right: parts.filter((p) => !p.removed).map((p) => ({ text: p.value, changed: p.added }))
  };
  return splitsCluster(words.left) || splitsCluster(words.right) ? undefined : words;
}

/**
 * Side-by-side rows: removed lines beside the added lines that replace them as 'changed' rows,
 * the rest 'removed' or 'added', and unchanged lines more than `context` away from a change
 * folded away. Identical texts give no rows.
 */
export function buildDiffRows(original: string, proposed: string, { context = 3, timeout = TIMEOUT } = {}): DiffItem[] {
  if (original === proposed) return [];
  const parts = lineDiff(original, proposed, timeout);
  const wordsUntil = Date.now() + WORD_BUDGET;
  const rows: DiffRow[] = [];
  let leftNo = 0;
  let rightNo = 0;
  // removed lines beside added ones by position, the leftovers on one side alone
  const pair = (old: string[], neu: string[]) => {
    for (let k = 0; k < old.length || k < neu.length; k++) {
      const row: DiffRow = { id: '', type: k >= neu.length ? 'removed' : k >= old.length ? 'added' : 'changed' };
      if (k < old.length) {
        row.left = old[k];
        row.leftNo = ++leftNo;
      }
      if (k < neu.length) {
        row.right = neu[k];
        row.rightNo = ++rightNo;
      }
      row.id = `${row.leftNo ?? ''}:${row.rightNo ?? ''}`;
      if (row.type === 'changed' && Date.now() < wordsUntil) row.words = wordDiff(old[k], neu[k], wordsUntil);
      rows.push(row);
    }
  };
  const alike = (a: string, b: string) => Date.now() < wordsUntil && wordDiff(a, b, wordsUntil) !== undefined;
  for (let i = 0; i < parts.length; ) {
    if (!parts[i].added && !parts[i].removed) {
      for (const line of splitLines(parts[i++].value)) {
        leftNo++;
        rightNo++;
        rows.push({ id: `${leftNo}:${rightNo}`, type: 'context', left: line, right: line, leftNo, rightNo });
      }
      continue;
    }
    let old: string[] = [];
    let neu: string[] = [];
    for (; i < parts.length && (parts[i].added || parts[i].removed); i++) {
      if (parts[i].added) neu = neu.concat(splitLines(parts[i].value));
      else old = old.concat(splitLines(parts[i].value));
    }
    // a line added above an edited one would pair with it, so in a small uneven hunk the alike
    // lines pair first and the rest by position between them
    // ponytail: alike pairs are word-diffed twice (to pair, then to show); memoize if the budget runs short
    const alikeParts =
      old.length !== neu.length && old.length * neu.length <= 400 && Date.now() < wordsUntil ? diffArrays(old, neu, { comparator: alike }) : [];
    let o = 0; // old and new lines up to here have rows
    let n = 0;
    let oi = 0; // where the current part starts
    let ni = 0;
    for (const p of alikeParts) {
      if (!p.added && !p.removed) {
        pair(old.slice(o, oi), neu.slice(n, ni));
        pair(old.slice(oi, oi + p.count), neu.slice(ni, ni + p.count));
        o = oi + p.count;
        n = ni + p.count;
      }
      if (!p.added) oi += p.count;
      if (!p.removed) ni += p.count;
    }
    pair(old.slice(o), neu.slice(n));
  }

  // "a" against "a\n" differs only in the newline, which nothing else would show
  if (original && proposed && original.endsWith('\n') !== proposed.endsWith('\n')) {
    const side = original.endsWith('\n') ? 'right' : 'left';
    const last = side === 'left' ? leftNo : rightNo;
    for (let i = rows.length - 1; i >= 0; i--) {
      if ((side === 'left' ? rows[i].leftNo : rows[i].rightNo) === last) {
        rows[i].noNewline = side;
        break;
      }
    }
  }

  const near = new Uint8Array(rows.length);
  rows.forEach((row, i) => {
    if (row.type !== 'context') near.fill(1, Math.max(0, i - context), i + context + 1);
  });
  const items: DiffItem[] = [];
  for (let i = 0; i < rows.length; ) {
    let end = i;
    while (end < rows.length && !near[end]) end++;
    // a single line stays: its fold row would take the same room
    if (end - i > 1) {
      const hidden = rows.slice(i, end);
      items.push({ type: 'fold', id: `fold-${hidden[0].id}`, leftStart: hidden[0].leftNo ?? 0, rightStart: hidden[0].rightNo ?? 0, count: hidden.length, rows: hidden });
      i = end;
    } else items.push(rows[i++]);
  }
  return items;
}

/** Lines added/removed between two texts. */
export function countChanges(original: string, proposed: string) {
  let added = 0;
  let removed = 0;
  for (const part of lineDiff(original, proposed)) {
    if (part.added) added += part.count;
    else if (part.removed) removed += part.count;
  }
  return { added, removed };
}

/** "+12 −3", leaving out a zero side. */
export function DiffCount({ added, removed }: { added: number; removed: number }) {
  if (!added && !removed) return null;
  return (
    <span className="diff-count">
      {added > 0 && <span className="plus">+{added}</span>} {removed > 0 && <span className="minus">−{removed}</span>}
    </span>
  );
}

function sideText(text: string | undefined, segments: DiffSegment[] | undefined, Mark: 'del' | 'ins', noNewline: boolean) {
  return (
    <>
      {segments
        ? segments.map((s, i) => (s.changed ? <Mark key={i}>{s.text === '\r' ? <span className="diff-eof">CRLF</span> : s.text}</Mark> : s.text))
        : text}
      {noNewline && <span className="diff-eof">No newline at end of file</span>}
    </>
  );
}

const DiffLine = memo(function DiffLine({ row }: { row: DiffRow }) {
  const changed = row.type !== 'context';
  return (
    <div className={`split-row ${row.type}`}>
      <span className="line-no l">{row.leftNo}</span>
      <span className="diff-marker l">{changed && row.left !== undefined ? '−' : ''}</span>
      <span className="line-text l">{sideText(row.left, row.words?.left, 'del', row.noNewline === 'left')}</span>
      <span className="line-no r">{row.rightNo}</span>
      <span className="diff-marker r">{changed && row.right !== undefined ? '+' : ''}</span>
      <span className="line-text r">{sideText(row.right, row.words?.right, 'ins', row.noNewline === 'right')}</span>
    </div>
  );
});

const NONE = new Set<string>();

/** Side-by-side diff of the changed lines with a little context; unchanged runs fold away. */
export default function SplitDiffView({
  original,
  proposed,
  leftLabel = 'Before',
  rightLabel = 'After'
}: {
  original: string;
  proposed: string;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const items = useMemo(() => buildDiffRows(original, proposed), [original, proposed]);
  // folds the user opened, for these items only (another file starts folded again)
  const [shown, setShown] = useState({ items, all: false, ids: NONE });
  const { all, ids } = shown.items === items ? shown : { all: false, ids: NONE };
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [items]);

  const folded = items.some((item) => item.type === 'fold');
  // an opened fold keeps its button above its rows, so focus stays put and it can close again
  const visible = items.flatMap((item) => (item.type !== 'fold' ? [item] : all ? item.rows : ids.has(item.id) ? [item, ...item.rows] : [item]));

  return (
    <div
      className="split-diff"
      ref={scrollRef}
      onMouseDown={(e) => {
        // a drag selects only the side it starts on
        const side = (e.target as Element).closest('.l, .r');
        if (side) e.currentTarget.dataset.side = side.classList.contains('l') ? 'l' : 'r';
      }}
    >
      <div className="split-header">
        <span>{leftLabel}</span>
        <span>
          {rightLabel}
          {folded && (
            <button className="split-toggle" onClick={() => setShown({ items, all: !all, ids: NONE })}>
              {all ? 'Show changes only' : 'Show whole file'}
            </button>
          )}
        </span>
      </div>
      {!items.length && <div className="tool-empty">No changes — both sides are the same.</div>}
      {visible.map((item) =>
        item.type === 'fold' ? (
          <button
            key={item.id}
            className="split-fold"
            aria-label={`${ids.has(item.id) ? 'Hide' : 'Show'} ${item.count.toLocaleString()} unchanged lines`}
            onClick={() => {
              const next = new Set(ids);
              if (!next.delete(item.id)) next.add(item.id);
              setShown({ items, all, ids: next });
            }}
          >
            {ids.has(item.id) ? 'Hide' : '⋯'} {item.count.toLocaleString()} unchanged lines
          </button>
        ) : (
          <DiffLine key={item.id} row={item} />
        )
      )}
    </div>
  );
}
