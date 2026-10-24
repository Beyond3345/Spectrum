import path from 'path';
import { lstatSync, realpathSync } from 'fs';

// root resolved too, so '/p' compares as C:\p on Windows
const inside = (root, p) => p === path.resolve(root) || p.startsWith(path.resolve(root) + path.sep);

function invalidPath(message = 'Invalid path.') {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

/**
 * Resolve a path inside root. Symlinks may point elsewhere inside root, but never out
 * of it (and never nowhere: a dangling link would let a write create its target).
 */
export function safeJoin(root, targetPath) {
  const resolved = path.resolve(root, targetPath);
  if (!inside(root, resolved)) throw invalidPath();
  let realRoot = root;
  try {
    realRoot = realpathSync(root);
  } catch {
    return resolved; // nothing on disk yet to follow
  }
  // The deepest part that exists decides where the path really goes.
  for (let probe = resolved; inside(root, probe); probe = path.dirname(probe)) {
    let real;
    try {
      real = realpathSync(probe);
    } catch {
      let link = false;
      try {
        link = lstatSync(probe).isSymbolicLink();
      } catch {
        // doesn't exist; check its folder
      }
      if (link) throw invalidPath('That file is a link to something that no longer exists.');
      continue;
    }
    if (!inside(realRoot, real)) throw invalidPath('That file is a link to somewhere outside the project.');
    break;
  }
  return resolved;
}

/**
 * Whether a file or folder name is one no agent may read or write: Spectrum's, git's or Claude's folders, an .env file
 * or a key, also as a file system that ignores case takes it (APFS folds 'ſ' to 's' and the Kelvin sign to 'k').
 * Self-contained, as the isolated workspace reader runs it too.
 */
export function agentHiddenName(p) {
  return [p.toLowerCase(), p.toUpperCase().toLowerCase()].some((n) => ['.spectrum', '.git', '.claude'].includes(n) || /^\.env(?:\.|$)|\.(pem|key)$/.test(n));
}
/** Whether a relative path is one no agent may read or write: any of its names agentHiddenName's. */
export const agentHidden = (rel) => String(rel).split(/[\\/]/).some(agentHiddenName);

/**
 * abs (inside root) as the disk has it, from root and '/'-separated: links followed, and each name as stored where the
 * file system ignores case (and on Windows a short name expanded); the parts that don't exist yet as given.
 */
export function onDiskRel(root, abs) {
  const missing = [];
  for (let probe = abs; ; probe = path.dirname(probe)) {
    let real;
    try {
      real = realpathSync.native(probe);
    } catch (err) {
      if (!['ENOENT', 'ENOTDIR'].includes(err.code) || probe === path.dirname(probe)) throw err;
      missing.unshift(path.basename(probe));
      continue;
    }
    return [...path.relative(realpathSync.native(root), real).split(path.sep), ...missing].filter(Boolean).join('/');
  }
}

/** Like safeJoin, but the last part may itself be a symlink: for moving or deleting the link. */
export function safeJoinLink(root, targetPath) {
  const resolved = path.resolve(root, targetPath);
  if (resolved === root) return safeJoin(root, targetPath);
  safeJoin(root, path.dirname(resolved));
  if (!inside(root, resolved)) throw invalidPath();
  return resolved;
}

export function sanitizeUploadPath(filename) {
  if (!filename) return '';
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  // NTFS can't hold <>:"|?* (a ':' would make a hidden stream) or a trailing dot or space
  const fit = (part) => (process.platform === 'win32' ? part.replace(/[<>:"|?*]/g, '_').replace(/[. ]+$/, '') : part);
  const parts = normalized.split('/').map(fit).filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/');
}
