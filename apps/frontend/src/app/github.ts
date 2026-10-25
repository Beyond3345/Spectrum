// What the GitHub tab, the GitHub view and the projects' menus share: the words for what a pull did, the question
// before one deletes many files, Link's preview, and the offer to move a project out of a sync app's folder.
import { ApiError, linkGitHub, moveProjectHere } from '../api/client';
import type { GitHubPull } from '../api/client';
import { confirmDialog } from './Dialogs';

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a pull, Sync or Link brought, for a notice. */
export function pullSummary(r: GitHubPull) {
  if (r.state === 'current' || (!r.fromTheirs && !r.conflicts)) return 'Up to date with GitHub.';
  const copies = r.conflicts ? `, with ${count(r.conflicts, 'conflicted copy', 'conflicted copies')} beside your own` : '';
  return `${count(r.fromTheirs, 'file', 'files')} from GitHub${copies}.`;
}

/**
 * run (a pull, Sync or Link), asked about first when it would delete many files at once and then run again with
 * allowDeletions. Resolves what it did, or null when the user said no.
 */
export async function withDeletionCheck(run: (allowDeletions: boolean) => Promise<{ result: GitHubPull }>) {
  const { result } = await run(false);
  if (result.state !== 'confirm') return result;
  const ok = await confirmDialog({
    title: `Delete ${count(result.deleting, 'file', 'files')}?`,
    message: 'They’re gone from the project on GitHub, which is more than usual at once. A checkpoint is saved first, so Tools › Checkpoints can bring them back.',
    confirmLabel: 'Delete',
    destructive: true
  });
  return ok ? (await run(true)).result : null;
}

/**
 * Link: what it would bring is shown first (“N files from GitHub, N conflicts”), and nothing is written until the
 * user says yes. target: the repository, when the project's settings don't name it.
 */
export async function linkWithPreview(projectId: string, name: string, target: { owner?: string; repo?: string } = {}) {
  const { result: preview } = await linkGitHub(projectId, { ...target, preview: true });
  const ok = await confirmDialog({
    title: `Link “${name}” with GitHub?`,
    message: `${count(preview.fromTheirs, 'file', 'files')} from GitHub, ${count(preview.conflicts, 'conflict', 'conflicts')}. A file changed on both computers keeps this computer’s copy, with GitHub’s beside it. A checkpoint is saved first.`,
    confirmLabel: 'Link'
  });
  if (!ok) return null;
  return withDeletionCheck((allowDeletions) => linkGitHub(projectId, { ...target, allowDeletions }));
}

/**
 * Move to this computer, asked first: the project copied into the projects folder (parentDir, when Settings names
 * one), the copy in the sync app's folder left as it is. why: what the dialog says first. Resolves whether it moved.
 */
export async function moveOutOfSyncFolder(projectId: string, why: string, parentDir?: string) {
  const ok = await confirmDialog({
    title: 'Move this project to this computer?',
    message: `${why} Spectrum copies it into your projects folder and works on it there. The copy in the sync app’s folder stays as it is.`,
    confirmLabel: 'Move to this computer'
  });
  if (!ok) return false;
  await moveProjectHere(projectId, parentDir);
  return true;
}

/** A refusal because the project is in a sync app's folder, answered with the offer to move it; false for any other error. */
export const offerMove = (err: unknown, projectId: string, parentDir?: string) =>
  err instanceof ApiError && err.data.code === 'IN_SYNC_FOLDER' ? moveOutOfSyncFolder(projectId, err.message, parentDir) : Promise.resolve(false);
