// GitHub, the way projects go between the user's computers (and settings, settingsRepoService.js). The token stays in
// the backend, in DATA_DIR/github.json (0600), and never reaches the window. A project's link, { owner, repo,
// projectId, personal? }, is in its .spectrum/settings.json, which travels with it: projectId is the project's id when
// the link was made, so a Finder copy (which gets an id of its own) isn't linked, and personal is the answer to
// whether a shared repository gets the chats, to-dos, PDF notes and research sessions too.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, GITHUB_API, GITHUB_CLIENT_ID, GITHUB_WEB, PROJECTS_DIR } from '../config/constants.js';
import { readJson, renameOver } from '../utils/fsUtils.js';
import { getProject, getProjectRoot, httpError, listProjects, makeUniqueFolder, mutateProjectFiles, readMeta, register, sanitiseFolderName, serialiser } from './projectService.js';
import { readProjectSettings, updateProjectSettings } from './projectSettings.js';
import { placeOf, readSyncConfig } from './syncService.js';
import { readMirror, readMirrorBase } from './mirrorService.js';
import { keyOf } from './mergeRules.js';
import { compiling } from './compileService.js';
import { directTurn } from './agentSessionService.js';
import * as git from './gitService.js';

const AUTH_FILE = path.join(DATA_DIR, 'github.json');
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
// a backup this long after the last change (a test's computers wait less)
const IDLE_MS = Number(process.env.SPECTRUM_GITHUB_IDLE_MS) || 60_000;
const RETRY_MS = 2 * 60_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Sign-in ───

/** { token, user: { login, id, name }, settingsRepo } */
const readAuth = () => readJson(AUTH_FILE).catch(() => ({}));

/** github.json written whole, readable by this user only from the moment it exists. */
async function writeAuth(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${AUTH_FILE}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await renameOver(tmp, AUTH_FILE);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** The token, or why there's none. */
export async function tokenOf() {
  const { token } = await readAuth();
  if (!token) throw httpError('Sign in to GitHub in Settings › GitHub first.', 401, 'GITHUB_SIGN_IN');
  return token;
}

/** What the window may know: never the token. */
export async function authStatus() {
  const { token, user, settingsRepo } = await readAuth();
  return { signedIn: !!token, login: user?.login || '', name: user?.name || '', deviceSignIn: !!GITHUB_CLIENT_ID, settingsRepo: settingsRepo !== false };
}

/** The commit author GitHub links to the account without showing its email address. */
export async function authorOf() {
  const { user } = await readAuth();
  const { machineName } = await readSyncConfig();
  return user ? { name: user.name || user.login, email: `${user.id}+${user.login}@users.noreply.github.com` } : { name: machineName, email: 'spectrum@localhost' };
}

const offline = (err) =>
  err?.name === 'TimeoutError' || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(err?.code || err?.cause?.code);
const OFFLINE = 'Couldn’t reach GitHub. Spectrum tries again when the connection is back.';

/** A call to GitHub's REST API, with GitHub's own message when it refuses. */
export async function api(pathname, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}${pathname}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'Spectrum',
        authorization: `Bearer ${token ?? (await tokenOf())}`,
        ...(body && { 'content-type': 'application/json' })
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (err) {
    throw offline(err) ? httpError(OFFLINE, 503, 'GITHUB_OFFLINE') : err;
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw httpError('Sign in to GitHub again.', 401, 'GITHUB_SIGN_IN');
  if (!res.ok) throw Object.assign(httpError(data?.errors?.[0]?.message || data?.message || `GitHub answered ${res.status}.`, res.status >= 500 ? 502 : res.status), { github: res.status });
  return data;
}

/** Sign in with a fine-grained or classic personal access token, checked with GitHub first. */
export async function signInWithToken(input) {
  const token = String(input || '').trim();
  if (!/^[\x21-\x7e]{20,255}$/.test(token)) throw httpError('That doesn’t look like a GitHub token.', 400);
  const user = await api('/user', { token }).catch((err) => {
    throw err.code === 'GITHUB_SIGN_IN' ? httpError('GitHub didn’t accept that token.', 400) : err;
  });
  const auth = await readAuth();
  await writeAuth({ ...auth, token, user: { login: user.login, id: user.id, name: user.name || '' } });
  authHooks.forEach((fn) => fn());
  return authStatus();
}

export async function signOut() {
  const { settingsRepo } = await readAuth();
  await writeAuth(settingsRepo === false ? { settingsRepo } : {});
  authHooks.forEach((fn) => fn());
  return authStatus();
}

export async function setSettingsRepo(on) {
  await writeAuth({ ...(await readAuth()), settingsRepo: !!on });
  authHooks.forEach((fn) => fn());
  return authStatus();
}

// what runs when the sign-in or the settings repository's switch changes (the settings repository's first pull)
const authHooks = new Set();
export const onAuthChange = (fn) => authHooks.add(fn);

// the device sign-in: Spectrum shows GitHub's code, and polls here until the user has entered it at github.com
const flows = new Map();

async function postForm(url, fields) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Spectrum' }, body: JSON.stringify(fields), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw offline(err) ? httpError(OFFLINE, 503, 'GITHUB_OFFLINE') : err;
  }
  return res.json().catch(() => ({}));
}

/** { id, userCode, verificationUri, expiresAt }: the code to show, and where to enter it. */
export async function startDeviceSignIn() {
  if (!GITHUB_CLIENT_ID) throw httpError('This copy of Spectrum has no GitHub app to sign in with. Paste a token instead.', 400);
  const res = await postForm(`${GITHUB_WEB}/login/device/code`, { client_id: GITHUB_CLIENT_ID, scope: 'repo read:user' });
  if (!res.device_code) throw httpError(res.error_description || 'GitHub didn’t start the sign-in.', 502);
  const flow = { id: crypto.randomUUID(), deviceCode: res.device_code, interval: Math.max(5, Number(res.interval) || 5), expiresAt: Date.now() + (Number(res.expires_in) || 900) * 1000, state: 'waiting' };
  flows.set(flow.id, flow);
  pollDevice(flow);
  return { id: flow.id, userCode: res.user_code, verificationUri: res.verification_uri, expiresAt: new Date(flow.expiresAt).toISOString() };
}

/** GitHub asked at most every interval seconds (at least 5), more slowly when it says so, until the code is used or runs out. */
function pollDevice(flow) {
  setTimeout(async () => {
    if (flow.state !== 'waiting') return;
    if (Date.now() > flow.expiresAt) {
      flow.state = 'expired';
      return;
    }
    try {
      const res = await postForm(`${GITHUB_WEB}/login/oauth/access_token`, { client_id: GITHUB_CLIENT_ID, device_code: flow.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
      if (res.access_token) {
        await signInWithToken(res.access_token);
        flow.state = 'done';
        return;
      }
      if (res.error === 'slow_down') flow.interval = Math.max(flow.interval + 5, Number(res.interval) || 0);
      else if (res.error === 'expired_token') flow.state = 'expired';
      else if (res.error === 'access_denied') flow.state = 'denied';
      else if (res.error !== 'authorization_pending') Object.assign(flow, { state: 'failed', error: res.error_description || res.error || 'GitHub refused the sign-in.' });
    } catch {
      // offline for now: asked again next time
    }
    if (flow.state === 'waiting') pollDevice(flow);
  }, flow.interval * 1000).unref();
}

/** 'waiting', 'done', 'expired', 'denied' or 'failed' (with error). */
export function deviceSignInState(id) {
  const flow = flows.get(id);
  if (!flow) throw httpError('That sign-in has finished.', 404);
  return { state: flow.state, ...(flow.error && { error: flow.error }) };
}

export function cancelDeviceSignIn(id) {
  const flow = flows.get(id);
  if (flow) flow.state = 'cancelled';
  flows.delete(id);
}

// ─── A project's link ───

const isLink = (l) => !!l && typeof l === 'object' && NAME.test(String(l.owner)) && NAME.test(String(l.repo));
export const repoUrl = (owner, repo) => `${GITHUB_WEB}/${owner}/${repo}.git`;

/** The project's root, metadata and link (here: made for this project, not a copy's). */
async function projectOf(id) {
  const root = await getProjectRoot(id);
  const meta = await readMeta(root);
  const link = (await readProjectSettings(root)).github;
  return { root, meta, link: isLink(link) ? { ...link, here: link.projectId === meta.id } : null };
}

/** The project is linked here: its link is its own, and its repository's origin is the linked one. */
async function linkedHere(root, link) {
  return !!link?.here && (await git.isRepo(root)) && (await git.remoteUrl(root)) === repoUrl(link.owner, link.repo);
}

/**
 * The GitHub repository a project's own repository already sends to (origin), { owner, repo }, or null with none.
 * One Spectrum can't use is left alone rather than changed: another host, or GitHub over SSH, which isomorphic-git
 * doesn't speak. ponytail: an SSH origin could be fetched over HTTPS without changing it, if someone needs that
 */
async function originRepo(root) {
  const url = (await git.isRepo(root)) && (await git.remoteUrl(root));
  if (!url) return null;
  const web = GITHUB_WEB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^${web}/([^/]+)/([^/]+?)(?:\\.git)?/?$`, 'i').exec(url);
  if (!m || !NAME.test(m[1]) || !NAME.test(m[2])) throw httpError('This project’s repository already has an origin Spectrum can’t use (an SSH address or another server), so Spectrum leaves it alone.', 409, 'GIT_REFUSED');
  return { owner: m[1], repo: m[2] };
}

/** A folder in a sync app's folder (Synology Drive, Dropbox, Google Drive, OneDrive, iCloud), which corrupts repositories. */
async function refuseSyncFolder(folder) {
  const place = await placeOf(folder).catch(() => null);
  if (place) throw httpError(`This folder is in ${place.label}, and sync apps damage Git repositories. Move it out of ${place.label} first.`, 409, 'IN_SYNC_FOLDER');
}

async function refuseRepo(root) {
  const why = await git.refusal(root);
  if (why) throw httpError(why, 409, 'GIT_REFUSED');
}

// whether a repository is public or has other collaborators, kept for an hour
const sharedness = new Map();
async function repoShared(owner, repo) {
  const key = `${owner}/${repo}`;
  const known = sharedness.get(key);
  if (known && Date.now() - known.at < 3600_000) return known.shared;
  const info = await api(`/repos/${owner}/${repo}`);
  // only an admin may list collaborators; someone else's repository counts as shared
  const people = await api(`/repos/${owner}/${repo}/collaborators?per_page=2`).catch(() => [null, null]);
  const shared = !info.private || people.length > 1;
  sharedness.set(key, { shared, at: Date.now() });
  return shared;
}

/** The paths a commit leaves out for the project: in a shared repository the personal ones, until the user says yes. */
async function personalHold(link) {
  if (link?.personal === true) return () => false;
  if (link?.personal === false || (await repoShared(link.owner, link.repo).catch(() => true))) return (rel) => git.PERSONAL.test(rel);
  return () => false;
}

/** A failure as the user should see it, and whether it only waits for the connection. */
function problemOf(err, link) {
  const status = err?.data?.statusCode ?? err?.github;
  if (offline(err) || err?.code === 'GITHUB_OFFLINE') return { state: 'waiting', message: OFFLINE };
  if (status === 401 || err?.code === 'GITHUB_SIGN_IN') return { state: 'attention', message: 'Sign in to GitHub again.' };
  if ((status === 403 || status === 404) && link) return { state: 'attention', message: `No access to ${link.owner}/${link.repo}.` };
  if (err?.code === 'GitPushError') return { state: 'attention', message: `GitHub refused the push: ${err.data?.prettyDetails?.trim() || err.message}` };
  if (err?.code === 'CHANGED' || err?.code === 'BUSY') return { state: 'waiting', message: err.message };
  return { state: 'attention', message: err?.message || String(err) };
}

// ─── Back up, Pull and Sync ───

// one GitHub task at a time for each project, and what it last ran into: { state, message, at, retry }
const queues = new Map();
const queueOf = (id) => queues.get(id) || queues.set(id, serialiser()).get(id);
const statuses = new Map();

/**
 * fn, after any other GitHub task of the project's; a backup's, pull's or sync's failure is kept for the GitHub tab and
 * the card (one that waits, retried every 2 minutes), and thrown as the user should see it.
 */
function task(id, kind, fn) {
  return queueOf(id)(async () => {
    const kept = ['backup', 'pull', 'sync'].includes(kind);
    try {
      const result = await fn();
      if (kept) statuses.delete(id);
      return result;
    } catch (err) {
      const { link } = await projectOf(id).catch(() => ({}));
      const problem = problemOf(err, link);
      if (kept) statuses.set(id, { ...problem, at: new Date().toISOString(), retry: kind });
      if (problem.state === 'waiting') err.waiting = true;
      throw Object.assign(err, { statusCode: err.statusCode || (problem.state === 'waiting' ? 503 : 409), message: problem.message });
    }
  });
}

/** A pull waits while a compile or a direct agent turn is changing the project's files, for 2 minutes at most. */
async function waitIdle(id) {
  for (let i = 0; compiling(id) || directTurn(id); i++) {
    if (i >= 240) throw Object.assign(new Error('Waiting for a compile or an agent to finish before pulling from GitHub.'), { code: 'BUSY' });
    await sleep(500);
  }
}

/** The project's message for its commits. */
const backupMessage = async (label) => String(label || '').trim().slice(0, 200) || `Backup from ${(await readSyncConfig()).machineName}`;

/**
 * Commit, fetch outside the project lock, then commit again and merge under it, so a save waits only for the merge:
 * the pull's result (gitService's mergeOrigin), with base the files to merge against when the histories have none in
 * common (a mirrored project's last sync).
 */
async function pullNow(id, { allowDeletions = false, base } = {}) {
  const { root, link } = await projectOf(id);
  await refuseRepo(root);
  const token = await tokenOf();
  const author = await authorOf();
  const hold = await personalHold(link);
  await git.fetchOrigin(root, token);
  await waitIdle(id);
  const machine = (await readSyncConfig()).machineName;
  const result = await mutateProjectFiles(async () => {
    await git.commitAll(root, { message: await backupMessage(), author, hold });
    return git.mergeOrigin(root, { author, allowDeletions, keep: hold, base: base && (await base(root)), message: `Pull from GitHub on ${machine}` });
  });
  return result;
}

/** Push, and when GitHub has commits this computer hasn't (a refused push), pull them in and push again. */
async function pushNow(id) {
  const { root } = await projectOf(id);
  try {
    await git.pushOrigin(root, await tokenOf());
    return null;
  } catch (err) {
    if (!['PushRejectedError', 'NotFoundError'].includes(err.code)) throw err;
  }
  const pulled = await pullNow(id);
  if (pulled.state === 'confirm') return pulled;
  await git.pushOrigin(root, await tokenOf());
  return pulled;
}

/**
 * Back up: commit what changed and push. The first time, the project gets a private repository named after it and the
 * link in its settings.json. idle: the minute after editing stops, which leaves chats and research sessions for Sync
 * and leaving the project. quitting: commit only; the push waits for the next start.
 */
export function backUp(id, { label, idle = false, quitting = false } = {}) {
  return task(id, 'backup', async () => {
    const { root, meta, link } = await projectOf(id);
    const author = await authorOf();
    let here = await linkedHere(root, link);
    if (!here && link?.here) throw httpError(`This project is on GitHub as ${link.owner}/${link.repo}. Link it here first.`, 409, 'GITHUB_LINK_FIRST');
    if (!here) {
      await refuseSyncFolder(root);
      if (await git.isRepo(root)) await refuseRepo(root);
      else await git.initRepo(root);
      // a repository of the user's own that already has its GitHub repository keeps it
      const created = (await originRepo(root)) || (await createRepo(meta.name));
      await updateProjectSettings(root, (s) => ({ ...s, github: { owner: created.owner, repo: created.repo, projectId: meta.id } }));
      await git.setRemote(root, repoUrl(created.owner, created.repo));
      here = true;
    }
    await refuseRepo(root);
    const fresh = (await projectOf(id)).link;
    const personal = await personalHold(fresh);
    const hold = idle ? (rel) => personal(rel) || /^\.spectrum\/(?:chats|research)\//i.test(rel) : personal;
    const { left } = await git.commitAll(root, { message: await backupMessage(label), author, hold });
    if (quitting) return { left };
    const pulled = await pushNow(id);
    return { left, ...(pulled && { pulled }) };
  });
}

/** A private repository for the project, named after it (paper-2 when paper is taken): { owner, repo }. */
async function createRepo(name) {
  const base = sanitiseFolderName(name).normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'spectrum-project';
  for (let n = 1; n <= 20; n++) {
    const repo = n === 1 ? base : `${base}-${n}`;
    try {
      // private must be said: GitHub makes a public one otherwise
      const made = await api('/user/repos', { method: 'POST', body: { name: repo, private: true, description: 'A Spectrum project', auto_init: false } });
      return { owner: made.owner.login, repo: made.name };
    } catch (err) {
      if (err.github !== 422) throw err;
    }
  }
  throw httpError('Couldn’t find a free name for the repository on GitHub.', 409);
}

/** Pull: the changes from GitHub merged in. */
export function pull(id, options = {}) {
  return task(id, 'pull', async () => {
    const { root, link } = await projectOf(id);
    if (!(await linkedHere(root, link))) throw httpError('This project isn’t linked to GitHub.', 409);
    return pullNow(id, options);
  });
}

/** Sync: back up (chats and research sessions too), pull, push. */
export function sync(id, options = {}) {
  return task(id, 'sync', async () => {
    const { root, link } = await projectOf(id);
    if (!(await linkedHere(root, link))) throw httpError('This project isn’t linked to GitHub.', 409);
    const result = await pullNow(id, options);
    if (result.state !== 'confirm') await pushNow(id);
    return result;
  });
}

/**
 * Initialise: git init on main, the ignore rules and a first commit, without GitHub. Refused in a sync app's folder.
 */
export function initialise(id) {
  return task(id, 'init', async () => {
    const { root } = await projectOf(id);
    await refuseSyncFolder(root);
    if (await git.isRepo(root)) throw httpError('This project is already a Git repository.', 409);
    await git.initRepo(root);
    return git.commitAll(root, { message: 'First commit', author: await authorOf() });
  });
}

/**
 * The files a mirrored project's last sync agreed on, as the merge's base: from the mirror's record (read, never
 * written), each file as this computer's or GitHub's copy that still has it, or the base text the mirror kept.
 */
function mirrorBase(id) {
  return async (root) => {
    const record = await readMirror(id);
    if (!record) return undefined;
    // each side's files by key, as the record keeps them
    const byKey = async (commit) => new Map([...(await git.treeFiles(root, commit))].map(([rel, x]) => [keyOf(rel), x]));
    const sides = [await byKey(await git.headOid(root)), await byKey(await git.remoteHead(root))];
    const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
    const base = new Map();
    for (const [key, { rel, hash }] of Object.entries(record.files)) {
      if (typeof hash !== 'string' || typeof rel !== 'string') continue;
      let oid = null;
      for (const side of sides) {
        const x = side.get(key);
        if (!oid && x && sha(await git.readBlobAt(root, x.oid)) === hash) oid = x.oid;
      }
      if (!oid) {
        const text = await readMirrorBase(id, hash);
        if (text) oid = await git.writeBlobAt(root, text);
      }
      if (oid) base.set(rel, { oid, mode: '100644' });
    }
    return base;
  };
}

/**
 * Link the project to a repository on GitHub that holds it (named in its settings.json, or found by its id in the
 * GitHub view): git init when there's none, then the same merge as a pull from nothing in common, or from the files
 * a 1.10.4 mirror last agreed on. preview: { fromTheirs, conflicts } without writing anything to the project's files.
 */
export function link(id, { owner, repo, preview = false, allowDeletions = false } = {}) {
  return task(id, 'link', async () => {
    const { root, meta, link: current } = await projectOf(id);
    const target = owner && repo ? { owner, repo } : current;
    if (!isLink(target)) throw httpError('Choose a repository to link.', 400);
    await refuseSyncFolder(root);
    if (await git.isRepo(root)) await refuseRepo(root);
    else await git.initRepo(root, 'main', { gitignore: false });
    const origin = await originRepo(root);
    if (origin && (origin.owner.toLowerCase() !== target.owner.toLowerCase() || origin.repo.toLowerCase() !== target.repo.toLowerCase())) {
      throw httpError(`This project’s repository already sends its commits to ${origin.owner}/${origin.repo}.`, 409, 'GIT_REFUSED');
    }
    await git.setRemote(root, repoUrl(target.owner, target.repo));
    if (!current?.here || current.owner !== target.owner || current.repo !== target.repo) {
      await updateProjectSettings(root, (s) => ({ ...s, github: { ...(current?.here ? current : {}), owner: target.owner, repo: target.repo, projectId: meta.id } }));
    }
    const token = await tokenOf();
    const author = await authorOf();
    const hold = await personalHold((await projectOf(id)).link);
    await git.commitAll(root, { message: await backupMessage(), author, hold });
    await git.fetchOrigin(root, token);
    const base = await mirrorBase(id)(root);
    if (preview) return git.mergeOrigin(root, { author, dryRun: true, keep: hold, base });
    await waitIdle(id);
    const result = await mutateProjectFiles(async () => {
      await git.commitAll(root, { message: await backupMessage(), author, hold });
      return git.mergeOrigin(root, { author, allowDeletions, keep: hold, base: await mirrorBase(id)(root), message: 'Link with GitHub' });
    });
    if (result.state !== 'confirm') await pushNow(id);
    return result;
  });
}

/** The user's answer for a shared repository: whether chats, to-dos, PDF notes and research sessions go in it. */
export async function setPersonal(id, personal) {
  const { root, link } = await projectOf(id);
  if (!link?.here) throw httpError('This project isn’t linked to GitHub.', 409);
  await updateProjectSettings(root, (s) => ({ ...s, github: { ...s.github, personal: !!personal } }));
}

/** What the GitHub tab shows for the project. */
export async function projectStatus(id) {
  const { root, link } = await projectOf(id);
  const auth = await authStatus();
  const repo = await git.isRepo(root);
  const refusal = repo ? await git.refusal(root) : null;
  const linked = !refusal && (await linkedHere(root, link));
  const place = await placeOf(root).catch(() => null);
  const counts = linked ? await git.aheadBehind(root) : { ahead: 0, behind: 0 };
  const shared = linked && auth.signedIn && link.personal === undefined ? await repoShared(link.owner, link.repo).catch(() => false) : false;
  return {
    signedIn: auth.signedIn,
    repo,
    refusal,
    linked,
    link: link?.here ? { owner: link.owner, repo: link.repo, url: `${GITHUB_WEB}/${link.owner}/${link.repo}` } : null,
    // a copy's settings name the original's repository
    copyOf: link && !link.here ? { owner: link.owner, repo: link.repo } : null,
    ...counts,
    lastBackup: linked ? await git.commitTime(root, await git.remoteHead(root)) : null,
    syncFolder: place?.label || null,
    personal: link?.personal ?? null,
    askPersonal: shared,
    problem: statuses.get(id) || null
  };
}

/** Every linked project's problem, for the projects page: { [id]: { state, message, at, lastBackup } }. */
export async function problems() {
  const out = {};
  for (const [id, problem] of statuses) {
    const root = await getProjectRoot(id).catch(() => null);
    out[id] = { ...problem, lastBackup: root && (await git.commitTime(root, await git.remoteHead(root)).catch(() => null)) };
  }
  return out;
}

// ─── When it syncs ───

const idleTimers = new Map();

/** A file of the project changed: a backup a minute after the last change, when it's linked. */
export function backupSoon(id) {
  clearTimeout(idleTimers.get(id));
  idleTimers.set(
    id,
    setTimeout(async () => {
      idleTimers.delete(id);
      const linked = await projectOf(id).then(({ root, link }) => linkedHere(root, link), () => false);
      if (linked) await backUp(id, { idle: true }).catch(() => {});
    }, IDLE_MS).unref()
  );
}

/**
 * The project was opened: pull (offline, it says it couldn't check), then push what an earlier quit only committed.
 * Resolves { linked, result?, message? }.
 */
export async function opened(id) {
  const { root, link } = await projectOf(id);
  if (!(await linkedHere(root, link)) || !(await authStatus()).signedIn) return { linked: false };
  try {
    return { linked: true, result: await sync(id) };
  } catch (err) {
    return { linked: true, message: err.waiting && /reach GitHub/.test(err.message) ? 'Couldn’t check GitHub, so this may not be the latest.' : err.message };
  }
}

/** The project was left: its backup now, chats and research sessions too. */
export async function left(id) {
  clearTimeout(idleTimers.get(id));
  idleTimers.delete(id);
  const { root, link } = await projectOf(id);
  if (await linkedHere(root, link)) await backUp(id).catch(() => {});
}

/** Quitting: the backups still waiting are committed, and pushed at the next start. */
export async function commitWaiting() {
  const ids = [...idleTimers.keys()];
  for (const id of ids) clearTimeout(idleTimers.get(id));
  idleTimers.clear();
  const linked = async (id) => projectOf(id).then(({ root, link }) => linkedHere(root, link), () => false);
  await Promise.all(ids.map(async (id) => (await linked(id)) && backUp(id, { quitting: true }).catch(() => {})));
}

/** At start: each linked project with commits GitHub hasn't had (an earlier quit's) is pushed; then retries every 2 minutes. */
export async function resumeBackups() {
  if (!(await authStatus()).signedIn) return;
  for (const p of await listProjects().catch(() => [])) {
    if (p.missing) continue;
    const { root, link } = await projectOf(p.id).catch(() => ({}));
    if (root && (await linkedHere(root, link).catch(() => false)) && (await git.aheadBehind(root)).ahead) backUp(p.id).catch(() => {});
  }
}

let retrying = null;
/** Every 2 minutes, what waited for the connection (or a file changing, or a compile) is tried again. */
export function startRetries() {
  clearInterval(retrying);
  retrying = setInterval(() => {
    for (const [id, s] of statuses) {
      if (s.state !== 'waiting') continue;
      const again = s.retry === 'pull' ? pull(id) : s.retry === 'sync' ? sync(id) : backUp(id);
      again.catch(() => {});
    }
  }, RETRY_MS).unref();
}

// ─── The GitHub view ───

// a repository's Spectrum project as of its last push: owner/repo → { pushedAt, project }
const repoProjects = new Map();

/** A file of a repository's default branch, as text, or null. */
async function repoFile(owner, repo, rel) {
  const data = await api(`/repos/${owner}/${repo}/contents/${rel.split('/').map(encodeURIComponent).join('/')}`).catch((err) => (err.github === 404 ? null : Promise.reject(err)));
  return data?.content ? Buffer.from(data.content, 'base64').toString('utf8') : null;
}

/**
 * The user's repositories that are Spectrum projects (they carry .spectrum/settings.json), each with its project's id
 * and name, and the project here with that id: [{ owner, repo, private, pushedAt, id, name, local, linked, ahead, behind }].
 * ponytail: the 100 most recently pushed; page on if someone has more
 */
export async function listRepoProjects() {
  const repos = await api('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator');
  const local = new Map((await listProjects()).filter((p) => !p.missing).map((p) => [p.id, p]));
  const found = [];
  await Promise.all(
    repos.map(async (r) => {
      const key = r.full_name;
      let known = repoProjects.get(key);
      if (!known || known.pushedAt !== r.pushed_at) {
        const settings = await repoFile(r.owner.login, r.name, '.spectrum/settings.json').catch(() => null);
        const meta = settings && JSON.parse((await repoFile(r.owner.login, r.name, '.spectrum/project.json').catch(() => null)) || 'null');
        known = { pushedAt: r.pushed_at, project: meta?.id ? { id: String(meta.id), name: String(meta.name || r.name) } : null };
        repoProjects.set(key, known);
      }
      if (!known.project) return;
      const here = local.get(known.project.id);
      const entry = { owner: r.owner.login, repo: r.name, url: `${GITHUB_WEB}/${r.owner.login}/${r.name}`, private: !!r.private, pushedAt: r.pushed_at, ...known.project, local: here?.id || null, linked: false, ahead: 0, behind: 0 };
      if (here) {
        const { root, link } = await projectOf(here.id).catch(() => ({}));
        if (root && link?.owner === entry.owner && link?.repo === entry.repo && (await linkedHere(root, link))) Object.assign(entry, { linked: true }, await git.aheadBehind(root));
      }
      found.push(entry);
    })
  );
  return found.sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)));
}

/** Get from GitHub: the repository cloned into the projects folder, listed with the id its project.json has. */
export async function getFromGitHub({ owner, repo, parentDir }) {
  if (!NAME.test(String(owner)) || !NAME.test(String(repo))) throw httpError('Choose a repository.', 400);
  const token = await tokenOf();
  const meta = JSON.parse((await repoFile(owner, repo, '.spectrum/project.json')) || 'null');
  if (!meta?.id) throw httpError(`${owner}/${repo} isn’t a Spectrum project.`, 400);
  if (await getProjectRoot(meta.id).catch(() => null)) throw httpError(`“${meta.name || repo}” is already on this computer. Link it from its GitHub tab instead.`, 409);
  const parent = typeof parentDir === 'string' && path.isAbsolute(parentDir) ? parentDir : PROJECTS_DIR;
  await fs.mkdir(parent, { recursive: true });
  await refuseSyncFolder(parent);
  const target = await makeUniqueFolder(await fs.realpath(parent), sanitiseFolderName(meta.name || repo));
  try {
    await git.cloneInto(target, repoUrl(owner, repo), token);
    const cloned = await readMeta(target);
    await register(cloned.id, target, cloned);
  } catch (err) {
    await fs.rm(target, { recursive: true, force: true });
    const problem = problemOf(err, { owner, repo });
    throw httpError(problem.message, problem.state === 'waiting' ? 503 : 409);
  }
  return getProject(meta.id);
}
