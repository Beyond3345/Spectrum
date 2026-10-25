import { useCallback, useEffect, useState } from 'react';
import { getFromGitHub, getGitHub, listGitHubRepos, syncWithGitHub } from '../api/client';
import type { GitHubRepoProject } from '../api/client';
import Icon from './Icon';
import { MenuButton } from './Menu';
import type { MenuItems } from './Menu';
import { toast } from './Toast';
import { linkWithPreview, pullSummary, withDeletionCheck } from './github';
import { errorText, relativeTime } from '../editor/shared';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How a linked project stands against GitHub as of its last pull or check (the row doesn't ask GitHub), for its row. */
const standing = (r: GitHubRepoProject) =>
  r.ahead || r.behind ? [r.ahead && `${count(r.ahead, 'commit', 'commits')} to back up`, r.behind && `${count(r.behind, 'commit', 'commits')} to pull`].filter(Boolean).join(' · ') : 'Up to date when last checked';

/**
 * The projects page's GitHub view, where Cloud projects was: the user's repositories that are Spectrum projects (they
 * carry .spectrum/settings.json). One linked here shows how it stands, one whose project is here but not linked offers
 * Link, and one not on this computer Get from GitHub, which clones it into the projects folder with its own id.
 */
export default function GitHubView({ query, parentDir, onOpen, onChanged, onOpenSettings }: {
  query: string;
  parentDir?: string;
  onOpen: (projectId: string) => void;
  onChanged: () => unknown;
  onOpenSettings: () => void;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<GitHubRepoProject[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const auth = await getGitHub();
      setSignedIn(auth.signedIn);
      if (!auth.signedIn) return;
      setRepos((await listGitHubRepos()).repos);
      setError('');
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const run = async (key: string, work: () => Promise<string | undefined>) => {
    setBusy(key);
    try {
      const done = await work();
      if (done) toast(done, { tone: 'success' });
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setBusy('');
      await load();
      await onChanged();
    }
  };

  const get = (r: GitHubRepoProject) => run(`${r.owner}/${r.repo}`, async () => {
    const { project } = await getFromGitHub(r.owner, r.repo, parentDir);
    return `“${project.name}” is on this computer now.`;
  });

  const link = (r: GitHubRepoProject) => run(`${r.owner}/${r.repo}`, async () => {
    const result = await linkWithPreview(r.local!, r.name, { owner: r.owner, repo: r.repo });
    return result ? `Linked “${r.name}”. ${pullSummary(result)}` : undefined;
  });

  const sync = (r: GitHubRepoProject) => run(`${r.owner}/${r.repo}`, async () => {
    const result = await withDeletionCheck((allowDeletions) => syncWithGitHub(r.local!, allowDeletions));
    return result ? `Synced “${r.name}”. ${pullSummary(result)}` : undefined;
  });

  const menuFor = (r: GitHubRepoProject): MenuItems => [
    r.linked && { label: 'Open', icon: 'doc.text', onSelect: () => onOpen(r.local!) },
    r.linked && { label: 'Sync with GitHub', icon: 'arrow.triangle.2.circlepath', onSelect: () => sync(r) },
    !r.local && { label: 'Get from GitHub', icon: 'arrow.down.circle', onSelect: () => get(r) },
    !!r.local && !r.linked && { label: 'Link…', icon: 'link', onSelect: () => link(r) },
    { separator: true },
    { label: 'Open on GitHub', icon: 'globe', onSelect: () => window.open(r.url, '_blank', 'noreferrer') }
  ];

  if (signedIn === false) {
    return (
      <div className="empty-state">
        <Icon name="arrow.triangle.branch" size={36} />
        <div className="empty-title">Sign in to GitHub</div>
        <div className="empty-text">Your projects go between your computers through GitHub. Sign in, then back a project up from its ··· menu or its Tools › GitHub tab.</div>
        <button className="btn" onClick={onOpenSettings}>Settings › GitHub…</button>
      </div>
    );
  }
  if (error && !repos) {
    return (
      <div className="empty-state">
        <Icon name="exclamationmark.triangle" size={36} />
        <div className="empty-title">Couldn’t reach GitHub</div>
        <div className="empty-text">{error}</div>
        <button className="btn" onClick={load}><Icon name="arrow.clockwise" /> Try again</button>
      </div>
    );
  }
  if (!repos) return <div className="empty-state"><span className="spinner" /></div>;
  const q = query.trim().toLowerCase();
  const shown = repos.filter((r) => !q || r.name.toLowerCase().includes(q) || r.repo.toLowerCase().includes(q));
  if (!shown.length) {
    return (
      <div className="empty-state">
        <Icon name="arrow.triangle.branch" size={36} />
        <div className="empty-title">{q ? `No results for “${query.trim()}”` : 'No projects on GitHub yet'}</div>
        {!q && <div className="empty-text">Choose Sync with GitHub from a project’s ··· menu to back it up to a private repository, where your other computers find it.</div>}
      </div>
    );
  }

  return (
    <div className="project-list" role="table" aria-label="GitHub">
      {shown.map((r) => {
        const key = `${r.owner}/${r.repo}`;
        return (
          <div
            key={key}
            role="row"
            tabIndex={0}
            className={`project-row ${r.local ? '' : 'missing'}`}
            onDoubleClick={() => (r.linked ? onOpen(r.local!) : undefined)}
            onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && r.linked && onOpen(r.local!)}
          >
            <span className="col-thumb"><Icon name="arrow.triangle.branch" size={20} /></span>
            <span className="col-name">
              <span className="project-name-line">
                <span className="project-name">{r.name}</span>
                {!r.private && <span className="badge">Public</span>}
                {!r.local && <span className="badge"><Icon name="arrow.down.circle" />Not on this computer</span>}
              </span>
              <span className="project-path">{key}{r.linked ? ` · ${standing(r)}` : ''}</span>
            </span>
            <span className="col-tags">
              {busy === key ? (
                <span className="spinner" />
              ) : !r.local ? (
                <button className="btn small" onClick={() => get(r)}>Get from GitHub</button>
              ) : !r.linked ? (
                <button className="btn small" onClick={() => link(r)}>Link…</button>
              ) : null}
            </span>
            <span className="col-date" title={r.pushedAt}>{r.pushedAt ? relativeTime(r.pushedAt) : ''}</span>
            <span className="col-actions">
              <MenuButton icon="ellipsis" title="More" align="end" items={menuFor(r)} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
