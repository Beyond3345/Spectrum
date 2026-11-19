import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import Sheet from '../app/Sheet';
import Icon from '../app/Icon';
import { EditorContext } from './EditorContext';
import type { PendingChange } from './EditorContext';
import HunkList, { PdfCompare, reviewPdfs } from './HunkReview';
import type { ReviewKeys } from './HunkReview';
import SplitDiffView, { DiffCount, countChanges } from './SplitDiffView';
import { review, settle } from './reviewHunks';
import type { Choice } from './reviewHunks';
import { errorText } from './shared';
import { toast } from '../app/Toast';

/**
 * Suggested AI edits: file list on the left, side-by-side diff on the right. With onRevise (the editor's own review)
 * each file's change is its separate changes, each accepted, rejected or edited by itself (HunkList), what is left
 * staying in review, and the PDF before and after can be shown in the diff's place.
 */
export default function ReviewChangesSheet({
  changes,
  onAccept,
  onReject,
  onRevise,
  onClose
}: {
  changes: PendingChange[];
  /** a change with `rest` is accepted in part: the rest stays in review */
  onAccept: (changes: PendingChange[]) => Promise<unknown>;
  onReject: (changes: PendingChange[]) => void;
  /** a file's proposal with one of its changes rejected, in the place of the one in review */
  onRevise?: (change: PendingChange) => void;
  onClose: () => void;
}) {
  // none in another project's review (a conversion's tidying), which has no editor around it
  const api = useContext(EditorContext);
  const [selected, setSelected] = useState(changes[0]?.filePath || '');
  const [busy, setBusy] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const keys: ReviewKeys = useRef(null);
  const layout = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => new Map(changes.map((c) => [c.filePath, countChanges(c.original, c.proposed)])), [changes]);
  const current = changes.find((c) => c.filePath === selected) || changes[0];
  const shown = useMemo(() => current && onRevise && review(current.original, current.original, current.proposed), [current?.original, current?.proposed, !onRevise]);

  useEffect(() => {
    if (!changes.length) onClose();
  }, [changes.length, onClose]);
  // the keys work from the start, and go on working when a button went with its change and took the focus with it
  useEffect(() => {
    if (!layout.current?.contains(document.activeElement)) layout.current?.focus({ preventScroll: true });
  }, [changes, showPdf]);

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

  const choose = (choice: Choice) => {
    if (!shown || !onRevise) return;
    const part = settle(shown, choice);
    if (part.content !== undefined) void accept([{ ...current, proposed: part.content, ...(part.proposed !== part.content && { rest: part.proposed }) }]);
    else if (part.original === part.proposed) onReject([current]);
    else onRevise({ ...current, proposed: part.proposed });
  };
  const step = (direction: 1 | -1) => {
    const next = changes[changes.indexOf(current) + direction];
    if (next) setSelected(next.filePath);
  };
  const pdfs = api && onRevise && reviewPdfs(api, () => changes.map((c) => ({ path: c.filePath, content: c.proposed })));

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
      {pdfs && (
        <div className="review-switch">
          <div className="segmented small" role="tablist" aria-label="What the review shows">
            <button role="tab" aria-selected={!showPdf} className={`segment ${showPdf ? '' : 'active'}`} onClick={() => setShowPdf(false)}>Source</button>
            <button role="tab" aria-selected={showPdf} className={`segment ${showPdf ? 'active' : ''}`} onClick={() => setShowPdf(true)}>PDF before and after</button>
          </div>
        </div>
      )}
      {pdfs && showPdf ? (
        <div className="review-layout review-pdf">
          <PdfCompare version={changes.map((c) => `${c.filePath}\0${c.original.length}\0${c.proposed}`).join('\n')} before={pdfs.before} after={pdfs.after} />
        </div>
      ) : (
        <div className="review-layout" ref={layout} tabIndex={-1} onKeyDown={(e) => keys.current?.(e)}>
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
            {shown ? (
              <HunkList key={current.filePath} path={current.filePath} review={shown} leftLabel="Current" rightLabel="Suggested" busy={busy} keys={keys} applyLabel="Accept" onChoice={choose} onPast={step} />
            ) : (
              <SplitDiffView original={current.original} proposed={current.proposed} leftLabel="Current" rightLabel="Suggested" />
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
