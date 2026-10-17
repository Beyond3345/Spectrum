// STUB, to be replaced by build/engine's mirrorService.js: the plan's section 8 exports, just enough for the model and
// routes' tests. Records are DATA_DIR/mirror/<id>.json; a pass copies across what one side lacks and never deletes
// or overwrites anything.
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { getProjectRoot } from './projectService.js';
import { within } from './syncService.js';

const MIRROR_DIR = path.join(DATA_DIR, 'mirror');
const recordPath = (id) => path.join(MIRROR_DIR, `${id}.json`);

export const readMirror = (id) => readJson(recordPath(id)).catch(() => null);

export async function listMirrored() {
  const found = [];
  for (const name of await fs.readdir(MIRROR_DIR).catch(() => [])) {
    const id = /^([A-Za-z0-9_-]+)\.json$/.exec(name)?.[1];
    const record = id && (await readMirror(id));
    if (record) found.push({ id, location: record.location, rel: record.rel });
  }
  return found;
}

export const linkMirror = (id, { location, rel, files = {} }) => writeJsonAtomic(recordPath(id), { location, rel, files });
export const unlinkMirror = (id) => fs.rm(recordPath(id), { force: true });
export const cloudRootOf = (record) => path.join(record.location, record.rel);

export async function syncProject(id) {
  const record = await readMirror(id);
  if (record) {
    const local = await getProjectRoot(id);
    const cloud = cloudRootOf(record);
    for (const [from, to] of [[cloud, local], [local, cloud]]) {
      const open = path.join(from, '.spectrum', 'open');
      await fs.cp(from, to, { recursive: true, force: false, verbatimSymlinks: true, filter: (src) => !within(src, open) });
    }
  }
  return mirrorStatus(id);
}

export const mirrorStatus = () => ({ state: 'synced' });
export function afterSave() {}
export function startMirroring() {}
export function stopMirroring() {}

export async function cloudCopyOwner(p) {
  for (const record of await listMirrored()) {
    const root = cloudRootOf(record);
    if (within(p, root)) return { id: record.id, rel: p.slice(root.length).split(path.sep).filter(Boolean).join('/') };
  }
  return null;
}
