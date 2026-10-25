import { useState } from 'react';
import { binConflictCopy, deleteFile, getFile, keepConflictCopy } from '../api/client';
import Icon from '../app/Icon';
import Sheet from '../app/Sheet';
import { confirmDialog } from '../app/Dialogs';
import { BIN } from '../app/platform';
import { toast } from '../app/Toast';
import { useEditor } from './EditorContext';
import SplitDiffView from './SplitDiffView';
import { errorText } from './shared';

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
// the files a side-by-side diff can show
const TEXT_FILE = /\.(tex|bib|sty|cls|bst|bbx|cbx|lbx|cfg|def|clo|ltx|dtx|txt|md|mmd|json|ya?ml|csv|tsv)$/i;

/**
 * A banner for the conflicted copies a GitHub pull or a sync app made of files changed in two places at once, a copy
 * at a time, with Compare, Use this copy and Delete copy.
 */
export default function SyncBanners({ conflicts, onDeleted }: { conflicts: Record<string, string>; onDeleted(path: string): void }) {
  const api = useEditor();
  const { projectId } = api;
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = Object.keys(conflicts).sort()[0];
  const original = copy ? conflicts[copy] : '';
  const more = Object.keys(conflicts).length - 1;

  const run = async (work: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      api.notify(`${failure}: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openCompare = () =>
    run(async () => {
      const read = (path: string) => getFile(projectId, path).then((r) => r.content, () => '');
      setCompare({ left: await read(original), right: await read(copy) });
    }, 'Couldn’t compare the copy');

  const takeCopy = async () => {
    const ok = await confirmDialog({
      title: `Use “${nameOf(copy)}”?`,
      message: `It takes the place of ${original}, and the copy goes. A checkpoint is saved first, so this can be undone.`,
      confirmLabel: 'Use this copy'
    });
    if (!ok) return;
    await run(async () => {
      await api.createVersion('manual', `Before using ${nameOf(copy)}`.slice(0, 120));
      await keepConflictCopy(projectId, copy);
      setCompare(null);
      onDeleted(copy);
      if (TEXT_FILE.test(original)) await api.reloadFiles([original]);
      await api.refreshTree();
      api.notify(`${nameOf(original)} now has the copy’s contents`, 'success');
    }, 'Couldn’t use the copy');
  };

  // to the Bin, or when there's none, gone for good once the user says so
  const removeCopy = () =>
    run(async () => {
      const res = await binConflictCopy(projectId, copy);
      if (!res.ok) {
        const sure = await confirmDialog({
          title: `Delete “${nameOf(copy)}”?`,
          message: `It couldn’t be moved to the ${BIN} (${res.error || 'unknown error'}). Deleting it can’t be undone.`,
          confirmLabel: 'Delete',
          destructive: true
        });
        if (!sure) return;
        const del = await deleteFile(projectId, copy);
        if (!del.ok) throw new Error(del.error || 'Delete failed.');
      } else {
        toast(`Moved “${nameOf(copy)}” to the ${BIN}.`);
      }
      setCompare(null);
      onDeleted(copy);
      await api.refreshTree();
    }, 'Couldn’t delete the copy');

  const actions = (
    <>
      <button className="btn small ghost" disabled={busy} onClick={removeCopy}>
        Delete copy
      </button>
      <button className="btn small primary" disabled={busy} onClick={takeCopy}>
        Use this copy
      </button>
    </>
  );

  return (
    <>
      {copy && (
        <div className="review-banner template-banner" role="status">
          <Icon name="doc.on.doc" />
          <span className="grow truncate" title={`${copy}: kept when ${original} changed on two computers at once`}>
            Conflict copy of {original}
            {more > 0 && ` (and ${more} more)`}
          </span>
          {TEXT_FILE.test(copy) && (
            <button className="btn small ghost" disabled={busy} onClick={openCompare}>
              Compare
            </button>
          )}
          {actions}
        </div>
      )}

      {compare && copy && (
        <Sheet title={`${original} and its conflict copy`} onClose={() => setCompare(null)} width={1080} className="review-sheet" actions={actions}>
          <SplitDiffView original={compare.left} proposed={compare.right} leftLabel={original} rightLabel={nameOf(copy)} />
        </Sheet>
      )}
    </>
  );
}
