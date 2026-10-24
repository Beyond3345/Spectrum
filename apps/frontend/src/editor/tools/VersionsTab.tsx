import { useCallback, useEffect, useState } from 'react';
import {
  compareVersionWithCurrent,
  deleteOldCheckpoints,
  deleteVersion,
  getFile,
  getVersionChanges,
  getVersionFile,
  listVersions,
  renameVersion,
  restoreVersion
} from '../../api/client';
import type { VersionFileChange, VersionMeta, VersionReason } from '../../api/client';
import Icon from '../../app/Icon';
import Sheet from '../../app/Sheet';
import { MenuButton } from '../../app/Menu';
import { confirmDialog, promptDialog } from '../../app/Dialogs';
import { toast } from '../../app/Toast';
import { useEditor } from '../EditorContext';
import SplitDiffView, { DiffCount } from '../SplitDiffView';
import { VERSIONS_CHANGED, errorText, formatDate, relativeTime } from '../shared';

const REASONS: Partial<Record<VersionReason, string>> = {
  'before-ai': 'Before AI changes',
  'before-restore': 'Before restore',
  'before-transfer': 'Before template change',
  compile: 'After compile'
};

function summaryTitle(v: VersionMeta) {
  if (v.summary.kind === 'initial') return 'First checkpoint';
  if (v.summary.kind === 'edited' && v.summary.files[0]) return `Edited ${v.summary.files[0]}`;
  const n = v.summary.files.length;
  return `Updated ${n} ${n === 1 ? 'file' : 'files'}`;
}

export default function VersionsTab({ active }: { active: boolean }) {
  const api = useEditor();
  const { projectId } = api;
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<{ kind: 'compare' | 'changes'; version: VersionMeta } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listVersions(projectId);
      setVersions(res.versions || []);
      setError('');
      return res.versions || [];
    } catch (err) {
      setError(errorText(err));
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  // versions saved elsewhere (e.g. before AI changes), even while Tools is closed
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(VERSIONS_CHANGED, onChange);
    return () => window.removeEventListener(VERSIONS_CHANGED, onChange);
  }, [load]);

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

  const save = () =>
    run(async () => {
      const typed = label.trim();
      const res = await api.createVersion('manual', typed || undefined);
      if (!res.unchanged && res.version) {
        setLabel('');
        api.notify(`Saved checkpoint ${res.version.number}`, 'success');
        return;
      }
      // nothing new to save; a typed label can still go on the latest checkpoint
      const latest = res.version;
      if (!typed || !latest) {
        api.notify('Nothing has changed since the last checkpoint.');
        return;
      }
      const ok = await confirmDialog({
        title: 'Nothing has changed since the last checkpoint',
        message: `Label checkpoint ${latest.number} “${typed}” instead?`,
        confirmLabel: 'Add label'
      });
      if (!ok) return;
      await renameVersion(projectId, latest.id, typed);
      await load();
      setLabel('');
      api.notify(`Labelled checkpoint ${latest.number} “${typed}”`, 'success');
    }, 'Couldn’t save a checkpoint');

  const restore = async (v: VersionMeta) => {
    const ok = await confirmDialog({
      title: `Restore checkpoint ${v.number}?`,
      message: 'Every file goes back to how it was at this checkpoint. A checkpoint of the current state is saved first, so this can be undone.',
      confirmLabel: 'Restore'
    });
    if (!ok) return;
    await run(async () => {
      const res = await restoreVersion(projectId, v.id);
      if (!res.ok) throw new Error(res.error || 'Restore failed.');
      await api.reloadProject();
      await load();
      api.notify(`Restored checkpoint ${v.number}${keptAsideNote(res.keptAside)}`, 'success');
    }, 'Couldn’t restore');
  };

  const rename = async (v: VersionMeta) => {
    const next = await promptDialog({ title: 'Rename checkpoint', placeholder: summaryTitle(v), defaultValue: v.label, confirmLabel: 'Rename' });
    if (next === null) return;
    await run(async () => {
      await renameVersion(projectId, v.id, next.trim());
      await load();
    }, 'Couldn’t rename the checkpoint');
  };

  const remove = async (v: VersionMeta) => {
    const ok = await confirmDialog({
      title: `Delete checkpoint ${v.number}?`,
      message: 'This checkpoint is removed from the history. Your files are not changed.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    await run(async () => {
      await deleteVersion(projectId, v.id);
      await load();
    }, 'Couldn’t delete the checkpoint');
  };

  // newest first, grouped under "30 Aug 2026"
  const groups: [string, VersionMeta[]][] = [];
  for (const v of versions || []) {
    const day = formatDate(v.createdAt);
    if (groups[groups.length - 1]?.[0] === day) groups[groups.length - 1][1].push(v);
    else groups.push([day, [v]]);
  }
  const previousOf = (v: VersionMeta) => versions?.[versions.indexOf(v) + 1];

  return (
    <div className="tool-page">
      <div className="tool-page-head">
        <h2>Checkpoints</h2>
      </div>
      <div className="version-save">
        <input
          className="input"
          value={label}
          placeholder="Label (optional), e.g. Submitted draft"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
        />
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="clock.arrow.circlepath" />} Save checkpoint
        </button>
      </div>
      <div className="tool-footnote">
        Checkpoints are kept on this computer in the project’s hidden .spectrum folder. One is also saved automatically before AI changes, restores
        and template changes, and after each successful compile when Settings › Checkpoints says so.
      </div>
      {error && <div className="tool-note error">{error}</div>}
      {versions && !versions.length && <div className="tool-empty">No checkpoints yet</div>}
      {groups.map(([day, list]) => (
        <div key={day} className="version-group">
          <div className="version-day">{day}</div>
          {list.map((v) => (
            <div key={v.id} className="version-card">
              <div className="version-row">
                <span className="version-badge">#{v.number}</span>
                <span className="version-title" title={v.summary.files.join('\n')}>
                  {v.label || summaryTitle(v)}
                </span>
                <MenuButton
                  icon="ellipsis"
                  title="Checkpoint actions"
                  align="end"
                  disabled={busy}
                  items={[
                    { label: 'Compare with current', icon: 'arrow.left.and.right', onSelect: () => setSheet({ kind: 'compare', version: v }) },
                    { label: 'What changed', icon: 'plus.forwardslash.minus', onSelect: () => setSheet({ kind: 'changes', version: v }) },
                    { separator: true },
                    { label: 'Restore this checkpoint…', icon: 'arrow.uturn.backward', onSelect: () => restore(v) },
                    { label: 'Rename…', icon: 'pencil', onSelect: () => rename(v) },
                    { label: 'Delete…', icon: 'trash', destructive: true, onSelect: () => remove(v) }
                  ]}
                />
              </div>
              {v.label && <div className="version-sub">{summaryTitle(v)}</div>}
              <div className="version-meta">
                <span>{relativeTime(v.createdAt)}</span>
                <DiffCount added={v.summary.added} removed={v.summary.removed} />
                {REASONS[v.reason] && <span className="badge">{REASONS[v.reason]}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {versions && versions.length > 0 && (
        <>
          <div className="tool-footnote">
            {versions.length} {versions.length === 1 ? 'checkpoint' : 'checkpoints'}
          </div>
          <div>
            <CheckpointCleanup projects={async () => [projectId]} onDone={load} />
          </div>
        </>
      )}
      {sheet && (
        <VersionDiffSheet
          kind={sheet.kind}
          version={sheet.version}
          previous={previousOf(sheet.version)}
          onClose={() => setSheet(null)}
          onRestored={load}
        />
      )}
    </div>
  );
}

const AGES: [number, string][] = [
  [7, 'a week'],
  [30, 'a month'],
  [90, 'three months'],
  [365, 'a year']
];

/** Deletes the automatic checkpoints older than a chosen age, in this project (Tools) or every project (Settings). */
export function CheckpointCleanup({ projects, onDone }: { projects: () => Promise<string[]>; onDone?: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const run = async (days: number, age: string) => {
    const ok = await confirmDialog({
      title: `Delete automatic checkpoints older than ${age}?`,
      message: 'The checkpoints saved after compiling go. Ones you saved and the “Before …” ones stay, and your files are not changed.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      // a project that can't be reached (its folder moved) doesn't stop the others
      const results = await Promise.allSettled((await projects()).map((id) => deleteOldCheckpoints(id, days)));
      const removed = results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value.removed : 0), 0);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) toast(`Couldn’t delete some checkpoints: ${errorText(failed.reason)}`, { tone: 'error' });
      else toast(removed ? `Deleted ${removed} automatic ${removed === 1 ? 'checkpoint' : 'checkpoints'}` : `No automatic checkpoints are older than ${age}.`, { tone: removed ? 'success' : 'info' });
      await onDone?.();
    } catch (err) {
      toast(`Couldn’t delete the checkpoints: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <MenuButton
      className="btn small"
      label="Delete automatic checkpoints older than…"
      disabled={busy}
      items={AGES.map(([days, age]) => ({ label: `Older than ${age}`, onSelect: () => run(days, age) }))}
    />
  );
}

/** Restore leaves files checkpoints don't keep beside the restored copy, renamed “… (before restore)”. */
const keptAsideNote = (kept?: string[]) => (kept?.length ? `. Kept your current ${kept.join(', ')} beside it.` : '');

/** Changed files of a version (vs the one before it, or vs the files on disk) with a side-by-side diff. */
function VersionDiffSheet({
  kind,
  version,
  previous,
  onClose,
  onRestored
}: {
  kind: 'compare' | 'changes';
  version: VersionMeta;
  previous?: VersionMeta;
  onClose: () => void;
  onRestored: () => Promise<unknown>;
}) {
  const api = useEditor();
  const { projectId } = api;
  const [files, setFiles] = useState<VersionFileChange[] | null>(null);
  const [selected, setSelected] = useState('');
  const [texts, setTexts] = useState<{ path: string; left: string; right: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const res = kind === 'compare' ? await compareVersionWithCurrent(projectId, version.id) : await getVersionChanges(projectId, version.id);
      const list = res.files || [];
      setFiles(list);
      setSelected((cur) => (list.some((f) => f.path === cur) ? cur : list[0]?.path || ''));
    } catch (err) {
      setError(errorText(err));
    }
  }, [kind, projectId, version.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const file = files?.find((f) => f.path === selected);

  useEffect(() => {
    if (!file || file.binary || file.status === 'untracked') {
      setTexts(null);
      return;
    }
    let live = true;
    const fromVersion = async (id: number | undefined) => {
      if (id === undefined) return '';
      const res = await getVersionFile(projectId, id, file.path);
      return res.ok ? res.content || '' : '';
    };
    // compare: version → disk; changes: previous version → this version
    const left = kind === 'compare' ? (file.status === 'added' ? '' : fromVersion(version.id)) : file.status === 'added' ? '' : fromVersion(previous?.id);
    const right =
      kind === 'compare'
        ? file.status === 'removed'
          ? ''
          : getFile(projectId, file.path).then((r) => r.content)
        : file.status === 'removed'
          ? ''
          : fromVersion(version.id);
    Promise.all([left, right])
      .then(([l, r]) => live && setTexts({ path: file.path, left: l, right: r }))
      .catch((err) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
  }, [file, kind, previous?.id, projectId, version.id]);

  // the file must exist in this version to bring it back
  const canRestore = file && (kind === 'compare' ? file.status !== 'added' : file.status !== 'removed');

  const restoreFile = async () => {
    if (!file) return;
    const ok = await confirmDialog({
      title: `Restore ${file.path} from checkpoint ${version.number}?`,
      message: 'The file goes back to how it was at this checkpoint. A checkpoint of the current state is saved first.',
      confirmLabel: 'Restore'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await restoreVersion(projectId, version.id, file.path);
      if (!res.ok) throw new Error(res.error || 'Restore failed.');
      await api.refreshTree();
      await api.reloadFiles([file.path]);
      await onRestored();
      await loadFiles();
      api.notify(`Restored ${file.path}${keptAsideNote(res.keptAside)}`, 'success');
    } catch (err) {
      api.notify(`Couldn’t restore the file: ${errorText(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const title = kind === 'compare' ? `Checkpoint ${version.number} compared with the current files` : `What changed in checkpoint ${version.number}`;
  const leftLabel = kind === 'compare' ? `#${version.number}` : previous ? `#${previous.number}` : 'Before';
  const rightLabel = kind === 'compare' ? 'Current' : `#${version.number}`;

  return (
    <Sheet title={title} onClose={onClose} width={1080} className="review-sheet">
      {error && <div className="tool-note error">{error}</div>}
      {files && !files.length && <div className="tool-empty">{kind === 'compare' ? 'No differences — the files match this checkpoint.' : 'No file changes.'}</div>}
      {files && files.length > 0 && (
        <div className="review-layout">
          <div className="review-files">
            {files.map((f) => (
              <button key={f.path} className={`review-file ${f.path === selected ? 'active' : ''}`} onClick={() => setSelected(f.path)}>
                <Icon name="doc.text" />
                <span className="review-file-name" title={f.path}>{f.path}</span>
                <span className={`badge ${f.status === 'added' ? 'success' : f.status === 'removed' ? 'danger' : f.status === 'untracked' ? '' : 'warning'}`}>
                  {f.status === 'added' ? 'Added' : f.status === 'removed' ? 'Removed' : f.status === 'untracked' ? 'Not tracked' : 'Changed'}
                </span>
              </button>
            ))}
          </div>
          <div className="review-diff">
            {file && (
              <div className="review-diff-bar">
                <span className="review-diff-path">{file.path}</span>
                <DiffCount added={file.added} removed={file.removed} />
                <span className="grow" />
                <button
                  className="btn small"
                  disabled={busy || !canRestore}
                  title={canRestore ? undefined : kind === 'compare' ? `This file isn’t in checkpoint ${version.number}.` : 'This checkpoint removed the file.'}
                  onClick={restoreFile}
                >
                  {busy ? <span className="spinner" /> : <Icon name="arrow.uturn.backward" />} Restore this file
                </button>
              </div>
            )}
            {file?.status === 'untracked' ? (
              <div className="tool-empty">Checkpoints don’t keep this file (it’s too big or can’t be read), so there’s no preview. Restoring it keeps the current file as “(before restore)”.</div>
            ) : file?.binary ? (
              <div className="tool-empty">Binary file — no preview.</div>
            ) : texts && texts.path === file?.path ? (
              <SplitDiffView original={texts.left} proposed={texts.right} leftLabel={leftLabel} rightLabel={rightLabel} />
            ) : (
              <div className="tool-empty">
                <span className="spinner" />
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
