import { useEffect, useMemo, useState } from 'react';
import Sheet from '../app/Sheet';
import Icon from '../app/Icon';
import type { PendingChange } from './EditorContext';
import SplitDiffView, { DiffCount, countChanges } from './SplitDiffView';
import { errorText } from './shared';
import { toast } from '../app/Toast';

/** Suggested AI edits: file list on the left, side-by-side diff on the right. */
export default function ReviewChangesSheet({
  changes,
  onAccept,
  onReject,
  onClose
}: {
  changes: PendingChange[];
  onAccept: (changes: PendingChange[]) => Promise<unknown>;
  onReject: (changes: PendingChange[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(changes[0]?.filePath || '');
  const [busy, setBusy] = useState(false);
  const counts = useMemo(() => new Map(changes.map((c) => [c.filePath, countChanges(c.original, c.proposed)])), [changes]);
  const current = changes.find((c) => c.filePath === selected) || changes[0];

  useEffect(() => {
    if (!changes.length) onClose();
  }, [changes.length, onClose]);

  const accept = async (list: PendingChange[]) => {
    setBusy(true);
    try {
      await onAccept(list);
    } catch (err) {
      toast(`Couldn’t apply the changes: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!current) return null;

  return (
    <Sheet
      title={`Review changes · ${changes.length} ${changes.length === 1 ? 'file' : 'files'}`}
      onClose={onClose}
      width={1080}
      className="review-sheet"
      actions={
        <>
          <button className="btn" disabled={busy} onClick={() => onReject(changes)}>Reject all</button>
          <button className="btn primary" disabled={busy} onClick={() => accept(changes)}>
            {busy && <span className="spinner" />} Accept all
          </button>
        </>
      }
    >
      <div className="review-layout">
        <div className="review-files">
          {changes.map((change) => {
            const n = counts.get(change.filePath);
            return (
              <button
                key={change.filePath}
                className={`review-file ${change.filePath === current.filePath ? 'active' : ''}`}
                onClick={() => setSelected(change.filePath)}
              >
                <Icon name="doc.text" />
                <span className="review-file-name" title={change.filePath}>{change.filePath}</span>
                {n && <DiffCount {...n} />}
              </button>
            );
          })}
        </div>
        <div className="review-diff">
          <div className="review-diff-bar">
            <span className="review-diff-path">{current.filePath}</span>
            {current.source && <span className="badge">{current.source}</span>}
            <span className="grow" />
            <button className="btn small" disabled={busy} onClick={() => onReject([current])}>Reject</button>
            <button className="btn small primary" disabled={busy} onClick={() => accept([current])}>Accept</button>
          </div>
          <SplitDiffView original={current.original} proposed={current.proposed} leftLabel="Current" rightLabel="Suggested" />
        </div>
      </div>
    </Sheet>
  );
}
