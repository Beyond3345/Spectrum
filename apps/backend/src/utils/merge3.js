import { diffLines } from 'diff';

// Three-way merge by lines, as git merge-file does it (diff3): each side's changes from the base become hunks in the
// base's lines, and hunks from the two sides that overlap or touch must give the same text, else it's a conflict.
// ponytail: where the base repeats a line (\hline, a brace, blank lines) the diff can still, rarely, place a change one
// copy away from where git does, so a merge git calls a conflict comes out clean or the other way round. Every line
// either side added is kept; what a clean one can undo is a deletion of a repeated line. Fuzzing against git
// merge-file on text made only of such lines finds about 1 case in 300. Diff with git's own heuristics if that shows

// past this many changed lines a diff takes long, and a merge of that much is better left to the user
const MAX_EDIT_LENGTH = 2000;

const lines = (text) => text.match(/[^\n]*\n|[^\n]+$/g) || [];

/** The changes from base to other, each { start, end, lines }: base lines [start, end) become lines. Null when there are too many. */
function hunks(base, other) {
  const parts = diffLines(base, other, { maxEditLength: MAX_EDIT_LENGTH });
  if (!parts) return null;
  const found = [];
  let at = 0;
  let hunk = null;
  for (const part of parts) {
    if (!part.added && !part.removed) {
      hunk = null;
      at += part.count;
      continue;
    }
    if (!hunk) found.push((hunk = { start: at, end: at, lines: [] }));
    if (part.removed) hunk.end = at += part.count;
    else hunk.lines.push(...lines(part.value));
  }
  return compact(found, lines(base));
}

/**
 * A deletion or an insertion the diff left a run of repeated lines away from the side's previous change is slid up to
 * it, as git's diff does, so one change (\hline made \midrule, say) is one hunk and meets the other side's.
 */
function compact(found, base) {
  const out = [];
  for (const h of found) {
    const a = out.at(-1);
    const g = a ? h.start - a.end : 0;
    let ok = g > 0;
    if (ok && h.end > h.start && !h.lines.length) {
      for (let k = 1; ok && k <= g; k++) ok = base[h.start - k] === base[h.end - k];
      if (ok) {
        a.end += h.end - h.start;
        continue;
      }
    } else if (ok && h.end === h.start) {
      const y = [...h.lines];
      for (let k = 1; ok && k <= g; k++) if ((ok = base[h.start - k] === y.at(-1))) y.unshift(y.pop());
      if (ok) {
        a.lines.push(...y);
        continue;
      }
    }
    out.push({ ...h, lines: [...h.lines] });
  }
  return out;
}

/** The merged text, or null where both sides changed the same or touching lines differently (or too much to tell). */
export function merge3(base, local, cloud) {
  const baseLines = lines(base);
  const mine = hunks(base, local);
  const theirs = mine && hunks(base, cloud);
  if (!theirs) return null;
  const all = [...mine.map((h) => ({ ...h, side: 0 })), ...theirs.map((h) => ({ ...h, side: 1 }))].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let done = 0;
  for (let k = 0; k < all.length; ) {
    // the hunks that overlap or touch go together
    const group = [all[k]];
    let end = all[k].end;
    for (k++; k < all.length && all[k].start <= end; k++) {
      group.push(all[k]);
      end = Math.max(end, all[k].end);
    }
    const start = group[0].start;
    // one side's text for base lines [start, end)
    const text = (side) => {
      const parts = [];
      let at = start;
      for (const h of group.filter((g) => g.side === side)) {
        parts.push(...baseLines.slice(at, h.start), ...h.lines);
        at = h.end;
      }
      return [...parts, ...baseLines.slice(at, end)].join('');
    };
    const sides = new Set(group.map((g) => g.side));
    if (sides.size === 2 && text(0) !== text(1)) return null;
    out.push(...baseLines.slice(done, start), text(sides.has(0) ? 0 : 1));
    done = end;
  }
  return [...out, ...baseLines.slice(done)].join('');
}

// a NUL in the first 8000 bytes, as git tells a binary file
const binary = (buf) => buf.subarray(0, 8000).includes(0);
// latin1 turns each byte into one character and back, so a file in any encoding comes out byte for byte
const decode = (buf) => buf.toString('latin1').replace(/\r\n/g, '\n');

/** merge3 on a file's bytes: null for a binary file or a conflict. The result has the line ends local has. */
export function mergeText(baseBuf, localBuf, cloudBuf) {
  if ([baseBuf, localBuf, cloudBuf].some(binary)) return null;
  const merged = merge3(decode(baseBuf), decode(localBuf), decode(cloudBuf));
  if (merged === null) return null;
  return Buffer.from(localBuf.includes('\r\n') ? merged.replace(/\n/g, '\r\n') : merged, 'latin1');
}
