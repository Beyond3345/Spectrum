import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import unzipper from 'unzipper';
import { safeJoin, sanitizeUploadPath } from './pathUtils.js';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** Write via a temp file + rename so readers never see a half-written file. Keeps the file's permissions. */
export async function writeFileAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const mode = (await fs.stat(filePath).catch(() => null))?.mode;
  try {
    await fs.writeFile(tmp, data);
    if (mode !== undefined) await fs.chmod(tmp, mode);
    // Windows won't rename over a read-only file (macOS ignores the target's mode); the copy keeps the mode
    if (process.platform === 'win32' && mode !== undefined && !(mode & 0o200)) await fs.chmod(filePath, mode | 0o200);
    await renameOver(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * fs.rename, retried for a few seconds on Windows: it refuses while anyone holds the file open,
 * which a virus scanner, the search indexer or a sync client does for a moment after each write.
 * Across drives (a build in the temp folder, the app's data on another disk) it copies beside the
 * target and renames that over it, so readers still never see half a file.
 */
export async function renameOver(from, to) {
  for (let wait = 50; ; wait *= 2) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      if (err.code === 'EXDEV') {
        const tmp = `${to}.${crypto.randomUUID()}.tmp`;
        try {
          await fs.cp(from, tmp, { recursive: true });
          await renameOver(tmp, to);
        } catch (copyErr) {
          await fs.rm(tmp, { recursive: true, force: true });
          throw copyErr;
        }
        return fs.rm(from, { recursive: true, force: true });
      }
      if (process.platform !== 'win32' || wait > 1600 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export async function writeJsonAtomic(filePath, data) {
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

export async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// App data, VCS internals, legacy bookkeeping, Finder/Explorer litter and sync apps' (and a Synology NAS's) own files
// never belong in the file tree, versions or AI context.
export const HIDDEN_ENTRIES = new Set([
  '.spectrum', '.git', '.DS_Store', 'Thumbs.db', 'desktop.ini', '.compile', '.snapshots',
  '.SynologyWorkingDirectory', '.dropbox', '.dropbox.cache', 'Icon\r', '@eaDir', '#recycle', '.spectrum-shared'
]);

/**
 * What a cloud project's mirror leaves out, and the editor's folder watch too: anything in HIDDEN_ENTRIES and the app's
 * own save and upload temp files. Of the app's data (.spectrum, in any letter case) only project.json, history and
 * chats go across; the rest is this computer's.
 */
export function mirrorSkips(rel) {
  if (/\.(tmp|upload)$/i.test(rel)) return true;
  const parts = rel.split('/');
  const app = parts[0].toLowerCase() === '.spectrum';
  if (app && parts.length > 1 && !(parts.length === 2 && parts[1] === 'project.json') && !['history', 'chats'].includes(parts[1])) return true;
  return parts.slice(app ? 1 : 0).some((part) => HIDDEN_ENTRIES.has(part) || part.toLowerCase() === '.spectrum');
}

/** Every file and folder under root, as '/'-separated paths from root on every system. */
export async function listFilesRecursive(root, rel = '') {
  const dirPath = path.join(root, rel);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (HIDDEN_ENTRIES.has(entry.name)) continue;
    const itemRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      items.push({ path: itemRel, type: 'dir' });
      items.push(...await listFilesRecursive(root, itemRel));
    } else {
      items.push({ path: itemRel, type: 'file' });
    }
  }
  return items;
}

/** abs, or abs with -2, -3… before the extension: the first name nothing uses yet. */
export async function freePath(abs) {
  const ext = path.extname(abs);
  const stem = abs.slice(0, abs.length - ext.length);
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? abs : `${stem}-${n}${ext}`;
    try {
      await fs.lstat(candidate);
    } catch (err) {
      if (err.code === 'ENOENT') return candidate;
      throw err;
    }
  }
}

/** Write a new file at abs or the next free name after it; never replaces anything. Returns the path used. */
export async function writeNewFile(abs, data) {
  await ensureDir(path.dirname(abs));
  for (;;) {
    const target = await freePath(abs);
    try {
      await fs.writeFile(target, data, { flag: 'wx' });
      return target;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// App data and Finder/Explorer litter never come out of an imported archive (any letter case: APFS and NTFS ignore it).
const ARCHIVE_SKIP = new Set(['.spectrum', '__macosx', '.ds_store', 'thumbs.db', 'desktop.ini', '.snapshots', '.compile']);
export const skipInArchive = (relPath) => relPath.split('/').some((part) => ARCHIVE_SKIP.has(part.toLowerCase()));

/** Extract a zip stream into root (path-traversal safe), then unwrap a single top-level folder. */
export async function extractZip(stream, root) {
  const entries = stream.pipe(unzipper.Parse({ forceStream: true }));
  for await (const entry of entries) {
    const relPath = sanitizeUploadPath(entry.path);
    if (!relPath || skipInArchive(relPath)) {
      entry.autodrain();
      continue;
    }
    const abs = safeJoin(root, relPath);
    if (entry.type === 'Directory') {
      await ensureDir(abs);
      entry.autodrain();
      continue;
    }
    await ensureDir(path.dirname(abs));
    await pipeline(entry, createWriteStream(abs));
  }
  await unwrapSingleFolder(root);
}

/** Zips made by compressing a folder hold just that folder; use its contents instead. */
export async function unwrapSingleFolder(root) {
  const entries = (await fs.readdir(root, { withFileTypes: true })).filter((e) => !HIDDEN_ENTRIES.has(e.name));
  if (entries.length !== 1 || !entries[0].isDirectory()) return;
  const temp = path.join(root, `.unwrap-${crypto.randomUUID()}`);
  await renameOver(path.join(root, entries[0].name), temp);
  for (const name of await fs.readdir(temp)) {
    await renameOver(path.join(temp, name), path.join(root, name));
  }
  await fs.rm(temp, { recursive: true, force: true });
}
