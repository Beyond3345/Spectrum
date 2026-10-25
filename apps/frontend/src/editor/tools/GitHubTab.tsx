import { useCallback, useEffect, useState } from 'react';
import { backUpToGitHub, getProjectGitHub, initialiseGit, pullFromGitHub, setGitHubPersonal, syncWithGitHub } from '../../api/client';
import type { GitHubPull, GitHubStatus } from '../../api/client';
import Icon from '../../app/Icon';
import { promptDialog } from '../../app/Dialogs';
import { linkInstead, linkWithPreview, moveOutOfSyncFolder, offerMove, pullSummary, withDeletionCheck } from '../../app/github';
import type { Section as SettingsSection } from '../../app/SettingsSheet';
import { useEditor } from '../EditorContext';
import { PROJECT_DATA_CHANGED, errorText, relativeTime } from '../shared';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Tools › GitHub: how the project stands on GitHub, with Sync, Pull, Back up and Open on GitHub once it's linked,
 * Back up to GitHub (a private repository) or Link before, and the warning for a project in a sync app's folder.
 */
export default function GitHubTab({ active, onOpenSettings }: { active: boolean; onOpenSettings?: (section: SettingsSection) => void }) {
  const api = useEditor();
  const { projectId } = api;
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await getProjectGitHub(projectId));
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  }, [projectId]);

  // the backup a minute after typing stops happens without the tab, so it asks again now and then while showing
  useEffect(() => {
    if (!active) return;
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [active, load]);

  /** After a pull: the panels that read .spectrum reload, and the file tree follows. */
  const pulled = async (result: GitHubPull | null | undefined) => {
    if (!result) return;
    if (result.changedApp) window.dispatchEvent(new Event(PROJECT_DATA_CHANGED));
    if (result.fromTheirs || result.conflicts) await api.refreshTree();
    for (const problem of result.problems) api.notify(problem, 'error');
  };

  const run = async (what: string, work: () => Promise<string | undefined | void>) => {
    setBusy(what);
    try {
      const done = await work();
      if (done) api.notify(done, 'success');
    } catch (err) {
      if (await offerMove(err, projectId, api.settings.projectsDir || undefined).catch((moveErr) => (api.notify(`Couldn’t move the project: ${errorText(moveErr)}`, 'error'), false))) {
        api.notify('Moved to this computer. Spectrum opens it from there from now on.', 'success');
        await api.reloadProject();
      } else api.notify(errorText(err), 'error');
    } finally {
      setBusy('');
      await load();
    }
  };

  const sync = () =>
    run('sync', async () => {
      const result = await withDeletionCheck((allowDeletions) => syncWithGitHub(projectId, allowDeletions));
      await pulled(result);
      return result ? `Synced. ${pullSummary(result)}` : undefined;
    });

  const pull = () =>
    run('pull', async () => {
      const result = await withDeletionCheck((allowDeletions) => pullFromGitHub(projectId, allowDeletions));
      await pulled(result);
      return result ? pullSummary(result) : undefined;
    });

  const backUp = async () => {
    const label = await promptDialog({ title: 'Back up to GitHub', message: 'A label for this backup, if you like.', placeholder: 'e.g. Sent to my supervisor', confirmLabel: 'Back up' });
    if (label === null) return;
    await run('backup', async () => {
      const res = await backUpToGitHub(projectId, label.trim() || undefined);
      await pulled(res.pulled);
      if (res.left?.length) api.notify(`Left out: ${res.left.join('; ')}.`, 'error');
      return 'Backed up to GitHub.';
    });
  };

  const create = () =>
    run('backup', async () => {
      try {
        const res = await backUpToGitHub(projectId);
        if (res.left?.length) api.notify(`Left out: ${res.left.join('; ')}.`, 'error');
        return 'Backed up to a private repository on GitHub.';
      } catch (err) {
        // GitHub has it from the other computer: linked to that one instead
        const linked = await linkInstead(err, projectId, api.projectName);
        if (linked === undefined) throw err;
        await pulled(linked);
        return linked ? `Linked. ${pullSummary(linked)}` : undefined;
      }
    });

  const link = () =>
    run('link', async () => {
      const result = await linkWithPreview(projectId, api.projectName);
      await pulled(result);
      return result ? `Linked. ${pullSummary(result)}` : undefined;
    });

  const moveHere = () =>
    run('move', async () => {
      if (!status?.syncFolder || !(await moveOutOfSyncFolder(projectId, `This project is in ${status.syncFolder}.`, api.settings.projectsDir || undefined))) return undefined;
      await api.reloadProject();
      return 'Moved to this computer. Spectrum opens it from there from now on.';
    });

  const initialise = () => run('init', async () => (await initialiseGit(projectId), 'This project is a Git repository now.'));

  const personal = (on: boolean) =>
    run('personal', async () => {
      await setGitHubPersonal(projectId, on);
      if (on) await backUpToGitHub(projectId);
      return on ? 'Chats, to-dos, notes and research go to GitHub too.' : undefined;
    });

  const s = status;
  const repoName = s?.link && `${s.link.owner}/${s.link.repo}`;
  const working = !!busy;

  return (
    <div className="tool-page">
      <div className="tool-page-head">
        <h2>GitHub</h2>
        {s?.linked && (
          <button className="btn small ghost" onClick={load} disabled={working} title="Check again">
            <Icon name="arrow.clockwise" />
          </button>
        )}
      </div>
      {error && <div className="tool-note error">{error}</div>}
      {!s && !error && <div className="tool-empty"><span className="spinner" /></div>}

      {s?.refusal && <div className="tool-card"><div className="tool-card-desc">{s.refusal}</div></div>}

      {s?.syncFolder && !s.linked && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="exclamationmark.triangle" /> In {s.syncFolder}</div>
          <div className="tool-card-desc">
            Sync apps damage Git repositories, so Spectrum won’t back this project up to GitHub from {s.syncFolder}. Move it to this computer first: Spectrum copies it into your projects folder, and the copy in {s.syncFolder} stays as it is.
          </div>
          <div className="row wrap">
            <button className="btn small" disabled={working} onClick={moveHere}>
              Move to this computer…
            </button>
          </div>
        </div>
      )}

      {s?.problem && (
        <div className="tool-card" role="status">
          <div className="tool-card-title"><Icon name="exclamationmark.triangle" /> {s.lastBackup ? `Not backed up since ${relativeTime(s.lastBackup).toLowerCase()}` : 'Not backed up yet'}</div>
          <div className="tool-card-desc">{s.problem.message}</div>
          {/sign in/i.test(s.problem.message) && onOpenSettings && (
            <div className="row wrap"><button className="btn small" onClick={() => onOpenSettings('github')}>Settings › GitHub…</button></div>
          )}
        </div>
      )}

      {s && !s.signedIn && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="arrow.triangle.branch" /> Keep this project on GitHub</div>
          <div className="tool-card-desc">Projects go between your computers through GitHub. Sign in to GitHub first.</div>
          {onOpenSettings && (
            <div className="row wrap"><button className="btn small" onClick={() => onOpenSettings('github')}>Settings › GitHub…</button></div>
          )}
        </div>
      )}

      {s?.signedIn && s.linked && s.link && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="arrow.triangle.branch" /> {repoName}</div>
          <div className="tool-card-desc">
            {s.ahead || s.behind
              ? [s.ahead && `${plural(s.ahead, 'commit', 'commits')} to back up`, s.behind && `${plural(s.behind, 'commit', 'commits')} to pull`].filter(Boolean).join(' · ')
              : s.left.length
                ? `Not on GitHub: ${s.left.join('; ')}`
                : 'Up to date with GitHub'}
            {s.lastBackup && <> · Last change on GitHub {relativeTime(s.lastBackup).toLowerCase()}</>}
          </div>
          <div className="row wrap">
            <button className="btn small primary" disabled={working} onClick={sync}>
              {busy === 'sync' ? <span className="spinner" /> : <Icon name="arrow.triangle.2.circlepath" />} Sync
            </button>
            <button className="btn small" disabled={working} onClick={pull}>
              {busy === 'pull' ? <span className="spinner" /> : <Icon name="arrow.down.circle" />} Pull
            </button>
            <button className="btn small" disabled={working} onClick={backUp}>
              {busy === 'backup' ? <span className="spinner" /> : <Icon name="square.and.arrow.up" />} Back up…
            </button>
            <a className="btn small ghost" href={s.link.url} target="_blank" rel="noreferrer">
              <Icon name="globe" /> Open on GitHub
            </a>
          </div>
        </div>
      )}

      {s?.signedIn && s.linked && s.askPersonal && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="info.circle" /> Shared repository</div>
          <div className="tool-card-desc">
            {repoName} is public or has other collaborators, so this project’s chats, to-dos, PDF notes and research sessions stay on your computers. Back them up there too?
          </div>
          <div className="row wrap">
            <button className="btn small" disabled={working} onClick={() => personal(true)}>Back them up</button>
            <button className="btn small ghost" disabled={working} onClick={() => personal(false)}>Leave them out</button>
          </div>
        </div>
      )}

      {s?.signedIn && !s.linked && s.link && !s.refusal && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="link" /> {repoName}</div>
          <div className="tool-card-desc">
            This project is on GitHub as {repoName}, from your other computer. Link it to bring the two together: Spectrum shows what would come from GitHub before it writes anything.
          </div>
          <div className="row wrap">
            <button className="btn small primary" disabled={working} onClick={link}>
              {busy === 'link' ? <span className="spinner" /> : <Icon name="link" />} Link…
            </button>
          </div>
        </div>
      )}

      {s?.signedIn && !s.linked && !s.link && !s.refusal && !s.syncFolder && (
        <div className="tool-card">
          <div className="tool-card-title"><Icon name="square.and.arrow.up" /> Back up to GitHub</div>
          <div className="tool-card-desc">
            {s.copyOf ? `This is a copy of the project on GitHub as ${s.copyOf.owner}/${s.copyOf.repo}. ` : ''}
            Spectrum makes a private repository for this project on your GitHub and keeps it up to date: it pulls when you open the project and backs up a
            minute after you stop typing.
          </div>
          <div className="row wrap">
            <button className="btn small primary" disabled={working} onClick={create}>
              {busy === 'backup' ? <span className="spinner" /> : <Icon name="square.and.arrow.up" />} Back up to GitHub
            </button>
            {!s.repo && (
              <button className="btn small ghost" disabled={working} onClick={initialise}>
                Initialise only
              </button>
            )}
          </div>
        </div>
      )}

      {s && !s.signedIn && !s.repo && !s.syncFolder && (
        <div className="tool-footnote">
          Or make it a Git repository on this computer only:{' '}
          <button className="btn small ghost" disabled={working} onClick={initialise}>Initialise</button>
        </div>
      )}

      <div className="tool-footnote">
        GitHub gets the sources, figures and .bib, with the project’s settings, chats, to-dos, PDF notes and research. Checkpoints, compiled PDFs, TeX’s build
        files, files that look like keys and files over 100 MB stay on this computer.
      </div>
    </div>
  );
}
