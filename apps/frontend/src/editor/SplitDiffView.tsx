import { useMemo, useRef } from 'react';
import { diffLines } from 'diff';

export type SplitDiffRow = {
  left?: string;
  right?: string;
  leftNo?: number;
  rightNo?: number;
  type: 'context' | 'added' | 'removed';
};

export function buildSplitDiff(original: string, proposed: string) {
  let leftLine = 1;
  let rightLine = 1;
  const rows: SplitDiffRow[] = [];
  for (const part of diffLines(original, proposed)) {
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      if (part.added) rows.push({ right: line, rightNo: rightLine++, type: 'added' });
      else if (part.removed) rows.push({ left: line, leftNo: leftLine++, type: 'removed' });
      else rows.push({ left: line, right: line, leftNo: leftLine++, rightNo: rightLine++, type: 'context' });
    }
  }
  return rows;
}

/** Lines added/removed between two texts. */
export function countChanges(original: string, proposed: string) {
  let added = 0;
  let removed = 0;
  for (const part of diffLines(original, proposed)) {
    if (part.added) added += part.count ?? 0;
    else if (part.removed) removed += part.count ?? 0;
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

/** Side-by-side diff with both columns scrolling together. */
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
  const rows = useMemo(() => buildSplitDiff(original, proposed), [original, proposed]);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);

  const sync = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (!source || !target || lockRef.current) return;
    lockRef.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      lockRef.current = false;
    });
  };

  const column = (side: 'left' | 'right') => (
    <div
      className="split-column"
      ref={side === 'left' ? leftRef : rightRef}
      onScroll={() => (side === 'left' ? sync(leftRef.current, rightRef.current) : sync(rightRef.current, leftRef.current))}
    >
      <div className="split-header">{side === 'left' ? leftLabel : rightLabel}</div>
      {rows.map((row, idx) => (
        <div key={idx} className={`split-row ${row.type}`}>
          <div className="line-no">{(side === 'left' ? row.leftNo : row.rightNo) ?? ''}</div>
          <div className="line-text">{(side === 'left' ? row.left : row.right) ?? ''}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="split-diff">
      {column('left')}
      {column('right')}
    </div>
  );
}
