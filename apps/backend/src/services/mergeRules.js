// STUB, to be replaced by build/p4-cloud's mergeRules.js: the cloud mirror's merge rules, which the GitHub pull
// (gitService.js) uses too. Written against the contract's names so the two branches meet; each follows what
// mirrorService.js does today.
import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { renameOver } from '../utils/fsUtils.js';
import { mergeChat } from '../utils/chatMerge.js';
import { createVersion } from './versionService.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** project.json's fields (and a settings file's keys): each from the side that changed it, local's where both did; never the id. */
export function mergeMeta(base, local, other) {
  const merged = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(other)])) {
    const value = same(local[key], base[key]) ? other[key] : local[key];
    if (value !== undefined) merged[key] = value;
  }
  return { ...merged, id: local.id };
}

/** Two copies of one chat (their JSON text): one with every message from both, other's first; null unless both are that chat. */
export function mergeChatFiles(localText, otherText) {
  const read = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const [mine, theirs] = [read(localText), read(otherText)];
  const chat = (x) => typeof x?.id === 'string' && Array.isArray(x.messages);
  if (!chat(mine) || !chat(theirs) || mine.id !== theirs.id) return null;
  return JSON.stringify(mergeChat(theirs, mine));
}

/**
 * bytes at abs (null: abs deleted), only when what is there now passes unchanged(current), current being its bytes or
 * null for none; through a temp file beside it, so no reader sees half a file. Resolves false when it didn't pass.
 * ponytail: a change in the moment between the check and the rename is still written over, as with the save route's
 */
export async function placeIfUnchanged(abs, bytes, unchanged) {
  const current = await fs.readFile(abs).catch((err) => (['ENOENT', 'ENOTDIR'].includes(err.code) ? null : Promise.reject(err)));
  if (!(await unchanged(current))) return false;
  if (bytes === null) {
    await fs.rm(abs, { force: true });
    return true;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, bytes);
    await renameOver(tmp, abs);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return true;
}

/**
 * The spelling to keep for a file whose name differs only in letter case or Unicode form on the two sides (which macOS
 * and Windows take for one file): the side that renamed it from the base's spelling; local's with no base.
 */
export function respellKeys(base, local, other) {
  const nfc = (rel) => rel.normalize('NFC');
  return base && nfc(base) === nfc(local) ? other : local;
}

/** Whether deleting count of total files at once is more likely a sync half done than the user: more than 5, and more than a quarter. */
export const deletionBrake = (count, total) => count > 5 && count > total / 4;

/** A checkpoint before files are replaced ("Before pull from GitHub"): createVersion's { version, unchanged }. */
export const keepBefore = (root, label) => createVersion(root, { label });
