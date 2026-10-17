import { useEffect, useState } from 'react';
import { binConflictCopy, deleteFile, getFile, keepConflictCopy, markClosed, markOpen } from '../api/client';
import Icon from '../app/Icon';
import Sheet from '../app/Sheet';
import { confirmDialog } from '../app/Dialogs';
import { BIN } from '../app/platform';
import { toast } from '../app/Toast';
import { useEditor } from './EditorContext';
import SplitDiffView from './SplitDiffView';
import { errorText, formatDate } from './shared';

const timeFormat = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' });
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
// the files a side-by-side diff can show
const TEXT_FILE = /\.(tex|bib|sty|cls|bst|bbx|cbx|lbx|cfg|def|clo|ltx|dtx|txt|md|json|ya?ml|csv|tsv)$/i;

/** 10:42 am today, else with the date */
function since(iso: string) {
  const time = timeFormat.format(new Date(iso));
  return new Date(iso).toDateString() === new Date().toDateString() ? time : `${formatDate(iso)}, ${time}`;
}

/**
 * For a project the user's computers share through a sync app: a banner while another computer has it open
 * (a warning, never a lock), and one for the conflict copies the sync app made, a copy at a time, with Compare,
 * Use this copy and Delete copy.
 */
export default function SyncBanners({ conflicts, onDeleted }: { conflicts: Record<string, string>; onDeleted(path: string): void }) {
  const api = useEditor();
  const { projectId } = api;
  const [others, setOthers] = useState<{ host: string; since: string }[]>([]);
  const [dismissed, setDismissed] = useState('');
  const [compare, setCompare] = useState<{ left: string; right: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // this computer has the project open, said every 2 minutes; the answer, and the one when the window comes back,
  // says which others do
  useEffect(() => {
    let live = true;
    const beat = () => markOpen(projectId).then((res) => live && setOthers(res.others || []), () => undefined);
    const leave = () => markClosed(projectId);
    beat();
    const timer = window.setInterval(beat, 2 * 60 * 1000);
    window.addEventListener('focus', beat);
    window.addEventListener('pagehide', leave);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', beat);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [projectId]);

  const othersKey = others.map((o) => `${o.host} ${o.since}`).join('\n');
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
      message: `It takes the place of ${original}, and the copy goes. A version is saved first, so this can be undone.`,
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
      {others.length > 0 && dismissed !== othersKey && (
        <div className="review-banner template-banner" role="status" title="Changes made on both at once can end up as conflict copies.">
          <Icon name="arrow.triangle.2.circlepath" />
          <span className="grow">Also open on {others.map((o) => `${o.host} since ${since(o.since)}`).join(' and ')}</span>
          <button className="btn small ghost" onClick={() => setDismissed(othersKey)}>
            OK
          </button>
        </div>
      )}

      {copy && (
        <div className="review-banner template-banner" role="status">
          <Icon name="doc.on.doc" />
          <span className="grow truncate" title={`${copy}: your sync app kept this copy when ${original} changed on two computers at once`}>
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
