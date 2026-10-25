// The settings that follow the user, in a private repository of theirs on GitHub (spectrum-settings), cloned into
// DATA_DIR/settings-repo, which takes the place of 1.10's shared folder in a cloud location (syncService's sharedDir):
//   settings/<machine id>.json  each computer's own (presenceService.js), so two never write one file; the newer value
//                               wins per setting, as settings.ts follows them. Never a key, token or path
//   personas/<id>.json          { id, updatedAt, by, persona } or { id, updatedAt, by, deleted: true }, one each
//   skills/<id>/                the user's own skills: skill.json { id, updatedAt, by, files } (or deleted) and files/
//   templates/<id>/             the user's own templates, as templateService.js shares them
// A persona, skill or template changed on both computers is taken whole from the newer, never merged by line or given
// a conflicted copy. Pulled at start-up, when the window comes forward and every 5 minutes, pushed within 30 s of a
// change. DATA_DIR/settings-repo.json keeps what this computer and the repository last agreed on for each persona and
// skill, so a change here is told from one there; none yet (a first sign-in) takes the repository's first.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from '../config/constants.js';
import { readJson, renameOver, writeJsonAtomic } from '../utils/fsUtils.js';
import { serialiser } from './projectService.js';
import { readSyncConfig, useSharedDir } from './syncService.js';
import { SKILLS_DIR, SKILL_ID } from './skillService.js';
import { syncTemplates } from './templateService.js';
import { api, authStatus, authorOf, onAuthChange, repoUrl, tokenOf } from './githubService.js';
import * as git from './gitService.js';

export const SETTINGS_REPO_DIR = path.join(DATA_DIR, 'settings-repo');
const STATE_FILE = path.join(DATA_DIR, 'settings-repo.json');
const REPO = 'spectrum-settings';
const OWN_SKILLS = path.join(SKILLS_DIR, 'own');
const PERSONA_ID = /^[A-Za-z0-9_-]{1,100}$/;
const PULL_EVERY_MS = 5 * 60_000;
const PUSH_EVERY_MS = 30_000;

const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
const lock = serialiser();
const readState = () => readJson(STATE_FILE).catch(() => ({}));
const exists = (p) => fs.lstat(p).then(() => true, () => false);

/** The repository is on GitHub and here, and the user wants it. */
async function wanted() {
  const status = await authStatus();
  return status.signedIn && status.settingsRepo;
}

/**
 * The private repository found or made on GitHub, and cloned here (made from nothing when GitHub's is still empty);
 * then the shared folder's place goes to it.
 */
async function ensureRepo() {
  const { login } = await authStatus();
  const url = repoUrl(login, REPO);
  if (!(await git.isRepo(SETTINGS_REPO_DIR)) || (await git.remoteUrl(SETTINGS_REPO_DIR)) !== url) {
    await api(`/repos/${login}/${REPO}`).catch(async (err) => {
      if (err.github !== 404) throw err;
      // private must be said: GitHub makes a public one otherwise. 422: the other computer made it just now
      await api('/user/repos', { method: 'POST', body: { name: REPO, private: true, description: 'Spectrum’s settings, personas, skills and templates', auto_init: false } }).catch((made) => {
        if (made.github !== 422) throw made;
      });
    });
    // another account's copy, or one that never got going, starts again
    await fs.rm(SETTINGS_REPO_DIR, { recursive: true, force: true });
    await fs.rm(STATE_FILE, { force: true });
    await fs.mkdir(SETTINGS_REPO_DIR, { recursive: true });
    await git.initRepo(SETTINGS_REPO_DIR, 'main', { gitignore: false });
    await git.setRemote(SETTINGS_REPO_DIR, url);
  }
  useSharedDir(SETTINGS_REPO_DIR);
}

/** What a persona, skill or template file belongs to: its item's folder or file, which is taken whole. */
const itemOf = (rel) => /^(personas\/[^/]+\.json|(?:skills|templates)\/[^/]+)/.exec(rel)?.[1] ?? null;
const metaOf = (item) => (item.startsWith('personas/') ? item : `${item}/${item.startsWith('skills/') ? 'skill' : 'template'}.json`);

/**
 * Of the items changed on both sides since the common commit, which side's is newer by its own updatedAt: a function
 * of a path for mergeOrigin's side.
 */
async function newerItems() {
  const { base, ours, theirs } = await git.mergeSides(SETTINGS_REPO_DIR);
  const items = (files) => {
    const out = new Map();
    for (const [rel, { oid }] of files) {
      const item = itemOf(rel);
      if (item) out.set(item, `${out.get(item) || ''}${rel}:${oid};`);
    }
    return out;
  };
  const [b, o, t] = [items(base), items(ours), items(theirs)];
  const when = async (files, item) => {
    const meta = files.get(metaOf(item));
    const data = meta && (await git.readBlobAt(SETTINGS_REPO_DIR, meta.oid).then((buf) => JSON.parse(buf.toString()), () => null));
    return String(data?.updatedAt ?? '');
  };
  const winners = new Map();
  for (const item of new Set([...o.keys(), ...t.keys()])) {
    if (o.get(item) === t.get(item) || o.get(item) === b.get(item) || t.get(item) === b.get(item)) continue;
    winners.set(item, (await when(theirs, item)) > (await when(ours, item)) ? 'theirs' : 'ours');
  }
  return (rel) => winners.get(itemOf(rel)) ?? null;
}

/** Commit this computer's changes, take GitHub's in (the newer item where both changed one) and push. */
async function pullAndPush() {
  const token = await tokenOf();
  const author = await authorOf();
  const message = `Settings from ${(await readSyncConfig()).machineName}`;
  await git.commitAll(SETTINGS_REPO_DIR, { message, author, compiled: false });
  await git.fetchOrigin(SETTINGS_REPO_DIR, token);
  await git.mergeOrigin(SETTINGS_REPO_DIR, { author, allowDeletions: true, checkpoint: false, side: await newerItems(), message: `Settings merged on ${(await readSyncConfig()).machineName}` });
  if ((await git.headOid(SETTINGS_REPO_DIR)) && (!(await git.remoteHead(SETTINGS_REPO_DIR)) || (await git.aheadBehind(SETTINGS_REPO_DIR)).ahead)) await git.pushOrigin(SETTINGS_REPO_DIR, token);
}

let pulledAt = 0;
let lastError = '';

/**
 * The settings repository brought up to date both ways, then this computer's skills and templates followed; at most
 * every 30 s unless forced. Resolves { ready, first }: first, this computer hasn't shared settings in it yet, so the
 * window takes the repository's settings first. Failures are kept for Settings › GitHub, and the copy here stays.
 */
export function syncSettingsRepo({ force = false } = {}) {
  return lock(async () => {
    if (!(await wanted())) {
      useSharedDir(null);
      return { ready: false, first: false };
    }
    try {
      await ensureRepo();
      if (force || Date.now() - pulledAt > PUSH_EVERY_MS) {
        await pullAndPush();
        pulledAt = Date.now();
        await syncSkills();
        await syncTemplates().catch(() => {});
        // what the skills' sync wrote goes up now rather than in 30 s
        if ((await git.commitAll(SETTINGS_REPO_DIR, { message: `Settings from ${(await readSyncConfig()).machineName}`, author: await authorOf(), compiled: false })).committed) await pullAndPush();
      }
      lastError = '';
    } catch (err) {
      lastError = err.message;
    }
    const { machineId } = await readSyncConfig();
    return { ready: await git.isRepo(SETTINGS_REPO_DIR), first: !(await exists(path.join(SETTINGS_REPO_DIR, 'settings', `${machineId}.json`))), ...(lastError && { error: lastError }) };
  });
}

let timers = [];
/** At start and after each sign-in: a pull now, then pushes within 30 s of a change and a pull every 5 minutes. */
export function startSettingsRepo() {
  for (const t of timers) clearInterval(t);
  syncSettingsRepo({ force: true }).catch(() => {});
  const pushIfChanged = () =>
    lock(async () => {
      if (!(await wanted()) || !(await git.isRepo(SETTINGS_REPO_DIR))) return;
      const { committed } = await git.commitAll(SETTINGS_REPO_DIR, { message: `Settings from ${(await readSyncConfig()).machineName}`, author: await authorOf(), compiled: false });
      if (committed) await pullAndPush();
    }).catch(() => {});
  timers = [setInterval(pushIfChanged, PUSH_EVERY_MS).unref(), setInterval(() => syncSettingsRepo({ force: true }).catch(() => {}), PULL_EVERY_MS).unref()];
}
onAuthChange(() => startSettingsRepo());

// ─── Personas and skills, one each ───

/**
 * Which copy of a persona or skill wins, each side by its hash (null: none, or deleted): the side that changed it
 * since the two last agreed (base); both did, this computer's, just changed and so the newer; nothing agreed yet
 * (first, or an item new to both), the repository's when it has the item (inRepo, a deletion mark too), else this
 * computer's. 'ours', 'theirs' or 'same'.
 * ponytail: "just changed" holds while each change is synced within moments; one made offline long ago still wins
 */
function step(here, there, base, first, inRepo) {
  if (here === there) return 'same';
  if (first || base === undefined) return inRepo ? 'theirs' : 'ours';
  if (there === base) return 'ours';
  if (here === base) return 'theirs';
  return 'ours';
}

/**
 * This computer's personas joined with the repository's: [{ id, name, colour, prompt }] in this computer's order with
 * new ones after. Each goes to personas/<id>.json when it changed here, comes from it when it changed there, and a
 * deletion either way is a mark that stays. Resolves { personas, changed }.
 */
export function syncPersonas(input) {
  return lock(async () => {
    const local = Array.isArray(input) ? input.filter((p) => p && PERSONA_ID.test(String(p.id))) : [];
    if (!(await wanted()) || !(await git.isRepo(SETTINGS_REPO_DIR))) return { personas: local, changed: false };
    const dir = path.join(SETTINGS_REPO_DIR, 'personas');
    const state = await readState();
    const first = !state.personas;
    const base = state.personas || {};
    const { machineId } = await readSyncConfig();
    const repo = new Map();
    for (const name of await fs.readdir(dir).catch(() => [])) {
      const data = await readJson(path.join(dir, name)).catch(() => null);
      if (data && name === `${data.id}.json` && PERSONA_ID.test(data.id)) repo.set(data.id, data);
    }
    const hashOf = (p) => (p ? sha1(JSON.stringify([p.name, p.colour, p.prompt])) : null);
    const mine = new Map(local.map((p) => [p.id, p]));
    const out = new Map(local.map((p) => [p.id, p]));
    const agreed = {};
    for (const id of new Set([...mine.keys(), ...repo.keys(), ...Object.keys(base)])) {
      const there = repo.get(id);
      const theirs = there && !there.deleted ? there.persona : null;
      const [h, t] = [hashOf(mine.get(id)), hashOf(theirs)];
      // a persona this computer never had, deleted there before it joined, is nothing to either
      const side = step(h, t, base[id], first, !!there);
      if (side === 'ours') {
        const at = new Date().toISOString();
        await writeJsonAtomic(path.join(dir, `${id}.json`), mine.has(id) ? { id, updatedAt: at, by: machineId, persona: mine.get(id) } : { id, updatedAt: at, by: machineId, deleted: true });
      } else if (side === 'theirs') {
        if (theirs) out.set(id, { ...theirs, id });
        else out.delete(id);
      }
      const now = side === 'theirs' ? t : h;
      if (now !== null) agreed[id] = now;
    }
    await writeJsonAtomic(STATE_FILE, { ...(await readState()), personas: agreed });
    const personas = [...out.values()];
    return { personas, changed: JSON.stringify(personas) !== JSON.stringify(local) };
  });
}

/** A file the settings repository never takes (the plan keeps keys out of it), so a skill goes across without it. */
const stays = async (abs) => git.secretLooking(path.basename(abs)) || (await fs.stat(abs)).size > git.MAX_FILE_BYTES;

/** A folder's files, '/'-separated, with their SHA-1s: those the repository takes. */
async function filesOf(dir, rel = '', out = {}) {
  for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => [])) {
    const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await filesOf(dir, itemRel, out);
    else if (entry.isFile() && !(await stays(path.join(dir, itemRel)))) out[itemRel] = sha1(await fs.readFile(path.join(dir, itemRel)));
  }
  return out;
}
const hashOfFiles = (files) => (files ? sha1(JSON.stringify(Object.entries(files).sort())) : null);

/** dir's files replaced by src's, through a folder beside it, so the skill is the old copy or the new one, never part of each. */
async function replaceFolder(src, dir) {
  const staged = `${dir}.${crypto.randomUUID()}`;
  await fs.cp(src, staged, { recursive: true });
  const old = `${staged}-old`;
  if (await exists(dir)) await renameOver(dir, old);
  await renameOver(staged, dir);
  await fs.rm(old, { recursive: true, force: true });
}

/** The user's own skills (SKILLS_DIR/own) and skills/<id>/ in the repository brought into step, as personas are. */
async function syncSkills() {
  const dir = path.join(SETTINGS_REPO_DIR, 'skills');
  const state = await readState();
  const first = !state.skills;
  const base = state.skills || {};
  const { machineId } = await readSyncConfig();
  const local = new Map();
  for (const id of await fs.readdir(OWN_SKILLS).catch(() => [])) if (SKILL_ID.test(id) && (await exists(path.join(OWN_SKILLS, id, 'SKILL.md')))) local.set(id, await filesOf(path.join(OWN_SKILLS, id)));
  const repo = new Map();
  for (const id of await fs.readdir(dir).catch(() => [])) {
    const data = await readJson(path.join(dir, id, 'skill.json')).catch(() => null);
    if (data?.id === id && SKILL_ID.test(id)) repo.set(id, data);
  }
  const agreed = {};
  for (const id of new Set([...local.keys(), ...repo.keys(), ...Object.keys(base)])) {
    const there = repo.get(id);
    const files = there && !there.deleted ? there.files : null;
    const [h, t] = [hashOfFiles(local.get(id)), hashOfFiles(files)];
    const side = step(h, t, base[id], first, !!there);
    let now = side === 'theirs' ? t : h;
    if (side === 'ours') {
      const at = new Date().toISOString();
      await fs.rm(path.join(dir, id, 'files'), { recursive: true, force: true });
      if (local.has(id)) {
        await fs.cp(path.join(OWN_SKILLS, id), path.join(dir, id, 'files'), { recursive: true, filter: async (src) => (await fs.stat(src)).isDirectory() || !(await stays(src)) });
        await writeJsonAtomic(path.join(dir, id, 'skill.json'), { id, updatedAt: at, by: machineId, files: local.get(id) });
      } else await writeJsonAtomic(path.join(dir, id, 'skill.json'), { id, updatedAt: at, by: machineId, deleted: true });
    } else if (side === 'theirs') {
      if (files) {
        // only once every file is there as skill.json lists it
        const copied = await filesOf(path.join(dir, id, 'files'));
        if (hashOfFiles(copied) !== t) now = h;
        else {
          await fs.mkdir(OWN_SKILLS, { recursive: true });
          await replaceFolder(path.join(dir, id, 'files'), path.join(OWN_SKILLS, id));
        }
      } else await fs.rm(path.join(OWN_SKILLS, id), { recursive: true, force: true });
    }
    if (now !== null) agreed[id] = now;
  }
  await writeJsonAtomic(STATE_FILE, { ...(await readState()), skills: agreed });
}
