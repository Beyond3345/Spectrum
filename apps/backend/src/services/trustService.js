import path from 'path';
import { promises as fs } from 'fs';
import { DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { serialiser } from './projectService.js';

// The projects whose compiles run unconfined (Trust this project in the Compile menu), kept on this computer only and
// never in the project's own files, which could then arrive from someone else already trusted. Each by its id, the
// folder it was in and that folder's own identity on the disk (device, file number, time made): a copy has another
// id and folder, a folder moved or renamed another path, and one put in its place another file number, so none of
// them inherits the trust
const FILE = path.join(DATA_DIR, 'trusted-projects.json');
const lock = serialiser();

const read = async () => {
  const data = await readJson(FILE).catch(() => null);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
};

/** The folder as the disk knows it, or null when it isn't there. */
async function folderMark(root) {
  const stat = await fs.stat(root, { bigint: true }).catch(() => null);
  return stat?.isDirectory() ? `${stat.dev}:${stat.ino}:${stat.birthtimeNs}` : null;
}

/** Whether the project in this folder is the one the user trusted. */
export async function isTrusted(id, root) {
  const entry = (await read())[id];
  return !!entry && entry.path === root && entry.folder === (await folderMark(root));
}

/** Trusts the project in this folder, or stops trusting it. Resolves whether it is trusted now. */
export function setTrusted(id, root, trusted) {
  return lock(async () => {
    const data = await read();
    const folder = trusted ? await folderMark(root) : null;
    if (folder) data[id] = { path: root, folder };
    else delete data[id];
    await writeJsonAtomic(FILE, data);
    return !!folder;
  });
}
