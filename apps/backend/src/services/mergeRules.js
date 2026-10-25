// How two copies of a project that changed apart come back together, file by file, the way git merges: written for
// 1.10's cloud mirror and kept for the GitHub pull. Which side a file takes, project.json and settings.json key by key,
// chats by message, research sessions by search, the name of a conflicted copy, the rename rule for paths that differ
// only in letter case or Unicode form, the brake on deleting many files at once, a file written only while it still
// holds what was checked, and the checkpoint before any of that. Paths are '/'-separated from the project's folder;
// "ours" is this computer's copy, "theirs" the other one.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { renameOver } from '../utils/fsUtils.js';
import { mergeChat } from '../utils/chatMerge.js';
import { mergeResults } from './researchService.js';
import { appPath } from './projectService.js';
import { createVersion } from './versionService.js';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const same = (a, b) => a.normalize('NFC') === b.normalize('NFC');
const group = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const parse = (bytes) => {
  try {
    return JSON.parse(String(bytes));
  } catch {
    return null;
  }
};

/** A path folded as APFS and NTFS fold names: one key for every spelling of one file there. */
export const keyOf = (rel) => rel.normalize('NFC').toLowerCase();

/**
 * What a file needs, from the three copies' hashes (null where a copy hasn't it): 'drop' (in neither), 'equal',
 * 'ours' (keep this computer's, which may be its deletion), 'theirs' (take the other's, which may be a deletion) or
 * 'merge'. With no base (new on both sides, or nothing in common yet) everything on either side stays and nothing is
 * deleted; a deletion on one side and a change on the other keeps the changed one.
 */
export function decide(base, ours, theirs) {
  if (!ours && !theirs) return 'drop';
  if (ours === theirs) return 'equal';
  if (!base) return !theirs ? 'ours' : !ours ? 'theirs' : 'merge';
  const changedOurs = ours !== base;
  const changedTheirs = theirs !== base;
  if (!ours) return changedTheirs ? 'theirs' : 'ours';
  if (!theirs) return changedOurs ? 'ours' : 'theirs';
  return !changedTheirs ? 'ours' : !changedOurs ? 'theirs' : 'merge';
}

/**
 * project.json or settings.json changed on both sides, as parsed: each key from the side that changed it, ours where
 * both did, and one level deeper where both hold a group of settings there (a binding, the compile options); never the
 * id. ponytail: a list (tags) changed on both sides keeps ours, the other's change lost
 */
export function mergeMeta(base, ours, theirs, depth = 0) {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const merged = {};
  for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const was = base?.[key];
    const value =
      depth === 0 && group(ours[key]) && group(theirs[key]) && (was === undefined || group(was))
        ? mergeMeta(was, ours[key], theirs[key], 1)
        : equal(ours[key], was)
          ? theirs[key]
          : ours[key];
    if (value !== undefined) merged[key] = value;
  }
  return depth === 0 && ours.id !== undefined ? { ...merged, id: ours.id } : merged;
}

/**
 * A chat changed on both sides, from its two files' bytes: every message from both, theirs first. more: ours had
 * messages theirs lacks. Null unless both are the same chat.
 */
export function mergeChatFiles(ours, theirs) {
  const [mine, other] = [parse(ours), parse(theirs)];
  const chat = (x) => typeof x?.id === 'string' && Array.isArray(x.messages);
  if (!chat(mine) || !chat(other) || mine.id !== other.id) return null;
  const merged = mergeChat(other, mine);
  return { data: Buffer.from(JSON.stringify(merged)), more: merged.messages.length > other.messages.length };
}

/**
 * A research session changed on both sides, from its two files' bytes, merged as a search merges them: our choices
 * where we made one, theirs where we didn't, and the results only one side found. Null unless both are the session.
 * ponytail: a choice one side cleared comes back from the other's, which loses nothing
 */
export function mergeSessionFiles(ours, theirs) {
  const [mine, other] = [parse(ours), parse(theirs)];
  const session = (x) => typeof x?.id === 'string' && Array.isArray(x.results) && Array.isArray(x.runs);
  if (!session(mine) || !session(other) || mine.id !== other.id) return null;
  const runs = [...new Map([...other.runs, ...mine.runs].map((r) => [r?.at, r])).values()].sort((a, b) => String(a?.at).localeCompare(String(b?.at)));
  const updatedAt = [String(mine.updatedAt ?? ''), String(other.updatedAt ?? '')].sort().at(-1);
  return Buffer.from(JSON.stringify({ ...other, ...mine, runs, results: mergeResults(mine.results, other.results), updatedAt }));
}

/**
 * Beside rel, the other side's copy of a file that didn't merge, named as Dropbox names a conflicted copy
 * (main (GitHub’s conflicted copy 2026-10-18 104233).tex), so the editor's conflicted-copy banner offers it. label:
 * where it came from. The editor's conflictCopyPath (heldFiles.ts) names its own the same way.
 */
export function conflictCopyPath(rel, label, at = new Date()) {
  const slash = rel.lastIndexOf('/') + 1;
  const name = rel.slice(slash);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  const who = label.replace(/[().<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  const two = (n) => String(n).padStart(2, '0');
  const when = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${rel.slice(0, slash)}${stem} (${who ? `${who}’s ` : ''}conflicted copy ${when})${ext}`;
}

/**
 * Every file once by its key, with the spelling to keep: where only one side spelt it differently from the base (in
 * letter case; another Unicode form is the same name on a Mac or Windows disk), that side made the change and its
 * spelling stays; else ours. A delete and an add that differ only so are then one file, renamed. base, ours and
 * theirs: each side's paths. Returns { files: Map(key → { rel, base?, ours?, theirs? }), clashes: [[a, b]] }, clashes
 * being two paths of one side that differ only in letter case, which a Mac or Windows disk can't keep apart.
 */
export function respellKeys(base, ours, theirs) {
  const files = new Map();
  const clashes = [];
  for (const [side, rels] of Object.entries({ base, ours, theirs })) {
    for (const rel of rels) {
      const entry = files.get(keyOf(rel)) || files.set(keyOf(rel), {}).get(keyOf(rel));
      if (entry[side] !== undefined && side !== 'base') clashes.push([entry[side], rel]);
      else entry[side] = rel;
    }
  }
  for (const entry of files.values()) {
    const { base: was, ours: mine, theirs: other } = entry;
    entry.rel = mine && other && !same(mine, other) && was && !same(was, other) && same(was, mine) ? other : mine ?? other ?? was;
  }
  return { files, clashes };
}

const inApp = (rel) => keyOf(rel).startsWith('.spectrum/');

/**
 * The brake on deleting many files at once: more than 5 and more than a quarter of a side's files, of all of them or
 * of the user's own alone (outside .spectrum, which a long history would otherwise hide), is more likely a sync gone
 * wrong than the user's doing. deleting: the paths about to go from a side; files: all that side's paths. Returns how
 * many go when that's too many to go without asking, else 0.
 */
export function deletionBrake(deleting, files) {
  const user = (rels) => rels.filter((rel) => !inApp(rel));
  const tripped = [
    [deleting.length, files.length],
    [user(deleting).length, user(files).length]
  ].find(([n, of]) => n > 5 && n > of / 4);
  return tripped ? tripped[0] : 0;
}

const hashAt = (abs) => fs.readFile(abs).then(sha256, (err) => {
  if (['ENOENT', 'ENOTDIR'].includes(err.code)) return null;
  throw err;
});

/**
 * bytes at rel in root through a temp file beside it, so no reader (nor a sync app) sees half a file, but only while
 * the file there still holds what was checked: expect, its SHA-256, or null for none there. When something else has
 * landed there meanwhile, nothing is written and null returned; else the stat of what was written, which the rename
 * keeps. Folders on the way are made as needed, but never root itself, so a project folder gone meanwhile isn't made
 * again. ponytail: a change in the moment between the check and the rename is still written over, as with the save
 * route's own check
 */
export async function placeIfUnchanged(root, rel, bytes, expect) {
  const dest = path.join(root, ...rel.split('/'));
  let at = root;
  for (const part of rel.split('/').slice(0, -1)) {
    at = path.join(at, part);
    await fs.mkdir(at).catch((err) => {
      if (err.code !== 'EEXIST') throw err;
    });
  }
  const tmp = `${dest}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, bytes);
    const written = await fs.lstat(tmp);
    if ((await hashAt(dest)) !== expect) {
      await fs.rm(tmp, { force: true });
      return null;
    }
    await renameOver(tmp, dest);
    return written;
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * A checkpoint before files here are replaced or deleted ("Before pull from GitHub"), or the latest when nothing
 * changed since it: { version, files }, files the checkpoint's (rel → its stored file's hash) to put back from.
 */
export async function keepBefore(root, label) {
  const { version } = await createVersion(root, { label });
  const manifest = await fs.readFile(appPath(root, 'history', 'manifests', `${version.id}.json`), 'utf8').then(JSON.parse, () => null);
  return { version, files: manifest?.files || {} };
}
