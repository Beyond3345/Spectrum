// Copying a whole project into or out of a cloud location (Sync to, Download, Move, Stop syncing): checked before
// anything is written and compared file by file after, so a copy is either whole or not there at all.
import { promises as fs, constants, createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { httpError } from '../services/projectService.js';
import { offlineMessage } from '../services/syncService.js';

// this computer's presence in the project, which only it writes
const EXCLUDE = ['.spectrum/open'];
const META = ['.spectrum', 'project.json'];
// Explorer, TeX and the Bin's PowerShell call stop at 260 characters, the last one the end of the string
const MAX_WINDOWS_PATH = 259;

export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const excluded = (rel, exclude) => exclude.some((e) => rel === e || rel.startsWith(`${e}/`));

/** Every file under root but the excluded, [{ rel, size }] with '/'-separated rels; a link anywhere stops it, as sync apps don't carry links. */
async function filesIn(root, exclude, rel = '', found = []) {
  for (const entry of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (excluded(itemRel, exclude)) continue;
    if (entry.isSymbolicLink()) throw httpError(`“${itemRel}” is a symbolic link, which sync apps don’t copy. Put what it points to in its place, then try again.`, 400);
    if (entry.isDirectory()) await filesIn(root, exclude, itemRel, found);
    else if (entry.isFile()) found.push({ rel: itemRel, size: (await fs.lstat(path.join(root, itemRel))).size });
  }
  return found;
}

/** Free bytes on the volume `to` will be on, or null when that can't be told. */
async function freeSpace(to) {
  for (let dir = to; ; dir = path.dirname(dir)) {
    try {
      const { bavail, bsize } = await fs.statfs(dir);
      return bavail * bsize;
    } catch (err) {
      if (err.code !== 'ENOENT' || dir === path.dirname(dir)) return null;
    }
  }
}

const megabytes = (bytes) => `${Math.max(1, Math.ceil(bytes / 1e6)).toLocaleString('en-AU')} MB`;

/**
 * Whether the project at `from` can be copied (to `to`, when given): no links in it, on Windows no path in the copy
 * over 259 characters, and room for it. Returns { files, bytes }, how many and how big; throws with what to do.
 */
export async function preflight(from, { windows = process.platform === 'win32', to, exclude = EXCLUDE } = {}) {
  const files = await filesIn(from, exclude);
  const bytes = files.reduce((sum, f) => sum + f.size, 0);
  if (to && windows) {
    const long = files.find((f) => path.join(to, f.rel).length > MAX_WINDOWS_PATH);
    if (long) throw httpError(`“${long.rel}” would have a path of ${path.join(to, long.rel).length} characters there, more than Windows allows (${MAX_WINDOWS_PATH}). Shorten its name or its folders’ names, then try again.`, 400);
  }
  const free = to ? await freeSpace(to) : null;
  if (free !== null && bytes > free) throw httpError(`There isn’t room for this project there: it needs ${megabytes(bytes)}, and ${megabytes(free)} is free.`, 400);
  return { files: files.length, bytes };
}

/**
 * Copy the project at `from` to the new folder `to` (or an empty one there), links as they are and project.json
 * last, then compare every file's size and SHA-256. Returns { files: { rel: { hash, size } } }. On any failure `to`
 * is removed again; an online-only file that can't download says so.
 */
export async function copyProject(from, to, { exclude = EXCLUDE } = {}) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.mkdir(to).catch(async (err) => {
    if (err.code !== 'EEXIST' || (await fs.readdir(to)).length) throw httpError(`There’s already a folder called “${path.basename(to)}” there.`, 409);
  });
  try {
    const meta = path.join(from, ...META);
    const filter = (src) => src !== meta && !excluded(path.relative(from, src).split(path.sep).join('/'), exclude);
    // into the folder made (or found empty) above, never over a file
    await fs.cp(from, to, { recursive: true, verbatimSymlinks: true, force: false, filter });
    // last, so a computer that finds the folder before the rest of it has arrived doesn't take it for the whole project
    await fs.mkdir(path.join(to, META[0]), { recursive: true });
    await fs.copyFile(meta, path.join(to, ...META), constants.COPYFILE_EXCL);
    const files = {};
    for (const { rel, size } of await filesIn(from, exclude)) {
      const [hash, copied, { size: copiedSize }] = await Promise.all([hashFile(path.join(from, rel)), hashFile(path.join(to, rel)), fs.lstat(path.join(to, rel))]);
      if (hash !== copied || size !== copiedSize) throw httpError(`“${rel}” didn’t copy correctly. Try again.`, 500);
      files[rel] = { hash, size };
    }
    return { files };
  } catch (err) {
    await fs.rm(to, { recursive: true, force: true });
    const offline = await offlineMessage(err).catch(() => null);
    throw offline ? httpError(offline, 503) : err;
  }
}
