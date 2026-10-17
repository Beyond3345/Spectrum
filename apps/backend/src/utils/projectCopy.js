// STUB, to be replaced by build/engine's projectCopy.js: the plan's section 8 exports, just enough for the model and
// routes' tests.
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

export async function preflight(from) {
  let files = 0;
  let bytes = 0;
  for (const entry of await fs.readdir(from, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`“${entry.name}” is a link, which sync apps don’t copy.`);
    if (entry.isFile()) {
      files += 1;
      bytes += (await fs.lstat(path.join(entry.parentPath, entry.name))).size;
    }
  }
  return { files, bytes };
}

export async function copyProject(from, to, { exclude = [] } = {}) {
  const meta = path.join(from, '.spectrum', 'project.json');
  const skipped = exclude.map((rel) => path.join(from, ...rel.split('/')));
  try {
    await fs.cp(from, to, {
      recursive: true,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
      filter: (src) => src !== meta && !skipped.some((s) => src === s || src.startsWith(s + path.sep))
    });
    await fs.mkdir(path.join(to, '.spectrum'), { recursive: true });
    await fs.copyFile(meta, path.join(to, '.spectrum', 'project.json'));
    const files = {};
    for (const entry of await fs.readdir(to, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const abs = path.join(entry.parentPath, entry.name);
      const rel = path.relative(to, abs).split(path.sep).join('/');
      const hash = await sha256(abs);
      if (hash !== (await sha256(path.join(from, rel)))) throw new Error(`“${rel}” didn’t copy whole.`);
      files[rel] = { hash, size: (await fs.stat(abs)).size };
    }
    return { files };
  } catch (err) {
    await fs.rm(to, { recursive: true, force: true });
    throw err;
  }
}
