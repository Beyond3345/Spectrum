import path from 'path';
import { promises as fs, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as tar from 'tar';
import crypto from 'crypto';
import { gunzipSync } from 'zlib';
import { ensureDir, copyDir, extractZip, listFilesRecursive, skipInArchive, writeFileAtomic } from '../utils/fsUtils.js';
import { safeJoin, safeJoinLink, sanitizeUploadPath } from '../utils/pathUtils.js';
import { extractDocumentBody, mergeTemplateBody, withoutComments } from '../utils/texUtils.js';
import { readTemplateManifest, copyTemplateIntoProject, templatePath } from '../services/templateService.js';
import {
  APP_DIR,
  appPath,
  createProject,
  getProject,
  getProjectRoot,
  httpError,
  listProjects,
  openFolder,
  readMeta,
  relocateProject,
  renameProject,
  siblingParent,
  touchProject,
  unregister,
  updateMeta
} from '../services/projectService.js';
import { projectStats } from '../services/statsService.js';
import { downloadArxivSource, extractArxivId } from '../services/arxivService.js';

const execFileAsync = promisify(execFile);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/**
 * A path inside the project the user may change: not the folder itself, not app data
 * (in any letter case, since APFS ignores case). safeJoinLink allows the last part to be
 * a symlink, for moving or deleting the link itself.
 */
function editablePath(root, relPath, join = safeJoin) {
  const abs = join(root, String(relPath || ''));
  const first = path.relative(root, abs).split(path.sep)[0];
  if (abs === root || first.toLowerCase() === APP_DIR) throw httpError('Invalid path.', 400);
  return abs;
}

// arXiv e-prints are a gzipped tarball, or for single-file papers a gzipped .tex,
// or for PDF-only submissions just a PDF.
export async function extractArxivSource(file, projectRoot) {
  const raw = await fs.readFile(file);
  const data = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  if (data.subarray(0, 5).toString() === '%PDF-') {
    throw new Error('This arXiv entry has no LaTeX source (PDF only).');
  }
  if (data.length > 262 && data.subarray(257, 262).toString() === 'ustar') {
    await tar.x({
      file,
      cwd: projectRoot,
      // plain files and folders only: a link in the tarball could point anywhere on disk
      filter: (entryPath, entry) => {
        if (!entryPath || path.isAbsolute(entryPath)) return false;
        if (!['File', 'OldFile', 'ContiguousFile', 'Directory'].includes(entry?.type)) return false;
        return !entryPath.split('/').some((part) => part === '..') && !skipInArchive(entryPath);
      }
    });
    return;
  }
  await fs.writeFile(path.join(projectRoot, 'main.tex'), data);
}

// ponytail: reads the first 16 KB of every .tex per tree request, so a \documentclass after a longer
// header is missed; read further, or cache by mtime, if that ever shows
async function isDocument(root, relPath) {
  let file;
  try {
    file = await fs.open(safeJoin(root, relPath));
    const { buffer, bytesRead } = await file.read(Buffer.alloc(16384), 0, 16384, 0);
    return /\\documentclass\b/.test(withoutComments(buffer.toString('utf8', 0, bytesRead)));
  } catch {
    return false; // unreadable, or a link out of the project
  } finally {
    await file?.close();
  }
}

async function moveToBin(folder) {
  try {
    await execFileAsync('/usr/bin/trash', [folder]);
  } catch {
    const quoted = folder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await execFileAsync('osascript', ['-e', `tell application "Finder" to delete POSIX file "${quoted}"`]);
  }
}

export function registerProjectRoutes(fastify) {
  fastify.get('/api/projects', async () => ({ projects: await listProjects() }));

  fastify.post('/api/projects', async (req) => {
    const { name, template, parentDir } = req.body || {};
    let templateRoot = null;
    let mainFile;
    if (template) {
      try {
        templateRoot = templatePath(template);
        await fs.access(templateRoot);
      } catch {
        throw httpError('Unknown template.', 400);
      }
      const { templates } = await readTemplateManifest();
      mainFile = templates.find((t) => t.id === template)?.mainFile;
    }
    return createProject({
      name,
      parentDir,
      meta: mainFile ? { mainFile } : {},
      populate: templateRoot ? (root) => copyDir(templateRoot, root) : null
    });
  });

  fastify.post('/api/projects/open-folder', async (req) => openFolder(req.body?.path));

  // Fields (projectName, parentDir) must come before the zip file part.
  fastify.post('/api/projects/import-zip', async (req) => {
    let projectName = '';
    let parentDir = '';
    let project = null;
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'projectName') projectName = String(part.value || '').trim();
          if (part.fieldname === 'parentDir') parentDir = String(part.value || '').trim();
          continue;
        }
        if (project) {
          part.file.resume();
          continue;
        }
        const fromFile = path.basename(part.filename || '', path.extname(part.filename || ''));
        project = await createProject({
          name: projectName || fromFile || 'Imported project',
          parentDir,
          populate: (root) => extractZip(part.file, root)
        });
      }
    } catch (err) {
      return { ok: false, error: /signature|central directory|zip/i.test(err.message) ? 'That file isn’t a valid .zip archive.' : err.message };
    }
    if (!project) return { ok: false, error: 'Missing zip file.' };
    return { ok: true, project };
  });

  fastify.get('/api/projects/import-arxiv-sse', async (req, reply) => {
    const { arxivIdOrUrl, projectName, parentDir } = req.query;
    const arxivId = extractArxivId(arxivIdOrUrl);
    req.log.info({ arxivId, arxivIdOrUrl }, 'import-arxiv-sse: parsed id');

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    const send = (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (!arxivId) {
      send('error', { error: 'Invalid arXiv ID.' });
      reply.raw.end();
      return reply;
    }

    // Cancel in the app closes the stream: stop downloading and don’t add the project
    const cancel = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) cancel.abort();
    });
    try {
      const project = await createProject({
        name: projectName || `arXiv ${arxivId}`,
        parentDir,
        signal: cancel.signal,
        populate: async (root) => {
          const tmp = path.join(root, `.arxiv-source-${crypto.randomUUID()}`);
          try {
            send('progress', { phase: 'download', percent: 0 });
            await downloadArxivSource(arxivId, tmp, ({ received, total }) => {
              const percent = total > 0 ? Math.round((received / total) * 100) : -1;
              send('progress', { phase: 'download', percent, received, total });
            }, cancel.signal);
            cancel.signal.throwIfAborted();
            send('progress', { phase: 'extract', percent: -1 });
            await extractArxivSource(tmp, root);
            cancel.signal.throwIfAborted();
          } finally {
            await fs.rm(tmp, { force: true });
          }
        }
      });
      send('done', { ok: true, project });
    } catch (err) {
      send('error', { error: err.message });
    }
    reply.raw.end();
    return reply;
  });

  fastify.post('/api/projects/:id/rename-project', async (req) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return { ok: false, error: 'Missing name.' };
    return { ok: true, project: await renameProject(req.params.id, name) };
  });

  fastify.post('/api/projects/:id/copy', async (req) => {
    const srcRoot = await getProjectRoot(req.params.id);
    const src = await readMeta(srcRoot);
    const appDir = appPath(srcRoot);
    const project = await createProject({
      name: String(req.body?.name || '').trim() || `${src.name} copy`,
      parentDir: siblingParent(srcRoot),
      meta: { tags: src.tags, mainFile: src.mainFile, fileOrder: src.fileOrder },
      populate: (root) => fs.cp(srcRoot, root, {
        recursive: true,
        // keep relative links relative, so the copy's links don't point into the original
        verbatimSymlinks: true,
        filter: (p) => p !== appDir && !p.startsWith(appDir + path.sep)
      })
    });
    return { ok: true, project };
  });

  fastify.post('/api/projects/:id/remove', async (req) => {
    await unregister(req.params.id);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/trash', async (req) => {
    if (process.platform !== 'darwin') return { ok: false, error: 'Moving to the Bin is only supported on macOS.' };
    const root = await getProjectRoot(req.params.id);
    try {
      await moveToBin(root);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    await unregister(req.params.id);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/relocate', async (req) => ({
    ok: true,
    project: await relocateProject(req.params.id, req.body?.path)
  }));

  fastify.patch('/api/projects/:id/tags', async (req) => {
    const { tags } = req.body || {};
    if (!Array.isArray(tags)) return { ok: false, error: 'Tags must be a list.' };
    const clean = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
    const root = await getProjectRoot(req.params.id);
    await updateMeta(root, (meta) => ({ ...meta, tags: clean }));
    return { ok: true, project: await getProject(req.params.id) };
  });

  fastify.patch('/api/projects/:id/archive', async (req) => {
    const root = await getProjectRoot(req.params.id);
    await updateMeta(root, (meta) => ({ ...meta, archived: !!req.body?.archived }));
    return { ok: true, project: await getProject(req.params.id) };
  });

  fastify.patch('/api/projects/:id/main-file', async (req) => {
    const mainFile = String(req.body?.mainFile || '');
    const root = await getProjectRoot(req.params.id);
    if (mainFile) safeJoin(root, mainFile);
    // the TeX engine would read a leading '-' as an option
    if (path.basename(mainFile).startsWith('-')) throw httpError('The main file’s name can’t start with “-”.', 400);
    await updateMeta(root, (meta) => ({ ...meta, mainFile }));
    return { ok: true, project: await getProject(req.params.id) };
  });

  fastify.get('/api/projects/:id/thumbnail', async (req, reply) => {
    const root = await getProjectRoot(req.params.id);
    let png;
    try {
      png = await fs.readFile(appPath(root, 'thumbnail.png'));
    } catch {
      return reply.code(404).send({ ok: false, error: 'No thumbnail yet.' });
    }
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'no-cache').send(png);
  });

  fastify.put('/api/projects/:id/thumbnail', async (req, reply) => {
    const root = await getProjectRoot(req.params.id);
    const png = Buffer.from(String(req.body?.png || ''), 'base64');
    if (png.length > MAX_THUMBNAIL_BYTES || !png.subarray(0, 8).equals(PNG_MAGIC)) {
      return reply.code(400).send({ ok: false, error: 'The thumbnail must be a PNG image under 2 MB.' });
    }
    await writeFileAtomic(appPath(root, 'thumbnail.png'), png);
    return { ok: true };
  });

  fastify.get('/api/projects/:id/stats', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const mainFile = String(req.query?.mainFile || '') || (await readMeta(root)).mainFile || 'main.tex';
    return projectStats(root, mainFile);
  });

  fastify.get('/api/projects/:id/tree', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const items = await listFilesRecursive(root);
    const { fileOrder, mainFile } = await readMeta(root);
    // .tex files that compile on their own
    const documents = [];
    for (const item of items) {
      if (item.type === 'file' && item.path.endsWith('.tex') && await isDocument(root, item.path)) documents.push(item.path);
    }
    return { items, fileOrder, mainFile, documents };
  });

  fastify.post('/api/projects/:id/file-order', async (req) => {
    const { folder = '', order } = req.body || {};
    if (!Array.isArray(order)) {
      return { ok: false, error: 'Missing order.' };
    }
    const root = await getProjectRoot(req.params.id);
    await updateMeta(root, (meta) => ({ ...meta, fileOrder: { ...meta.fileOrder, [folder]: order } }));
    return { ok: true };
  });

  fastify.get('/api/projects/:id/file', async (req) => {
    const { path: filePath } = req.query;
    if (!filePath) return { content: '' };
    const root = await getProjectRoot(req.params.id);
    const content = await fs.readFile(safeJoin(root, filePath), 'utf8');
    return { content };
  });

  fastify.get('/api/projects/:id/blob', async (req, reply) => {
    const { path: filePath } = req.query;
    if (!filePath) return reply.code(400).send({ ok: false, error: 'Missing path.' });
    const root = await getProjectRoot(req.params.id);
    const buffer = await fs.readFile(safeJoin(root, filePath));
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.eps': 'application/postscript'
    };
    reply.header('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    return reply.send(buffer);
  });

  fastify.post('/api/projects/:id/upload', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const saved = [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const relPath = sanitizeUploadPath(part.filename);
      if (!relPath || relPath.split('/').some((p) => p.toLowerCase() === APP_DIR || p === '.DS_Store')) {
        part.file.resume();
        continue;
      }
      const abs = editablePath(root, relPath);
      await ensureDir(path.dirname(abs));
      // Stream into a temp file first, so a failed or cut-off upload leaves the existing file alone.
      const tmp = `${abs}.${crypto.randomUUID()}.upload`;
      try {
        await pipeline(part.file, createWriteStream(tmp));
        if (part.file.truncated) throw httpError(`${relPath} is larger than 200 MB.`, 413);
        await fs.rename(tmp, abs);
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      saved.push(relPath);
    }
    if (saved.length) await touchProject(root).catch(() => {});
    return { ok: true, files: saved };
  });

  fastify.put('/api/projects/:id/file', async (req) => {
    // create: true makes a new file only, never replacing one (APFS also matches other letter cases)
    const { path: filePath, content, create } = req.body || {};
    if (!filePath) return { ok: false };
    const root = await getProjectRoot(req.params.id);
    const abs = editablePath(root, filePath);
    await ensureDir(path.dirname(abs));
    try {
      if (create) await fs.writeFile(abs, content ?? '', { encoding: 'utf8', flag: 'wx' });
      // via a temp file, so a crash or a full disk never leaves half a file; a link (safeJoin
      // checked it stays in the project) keeps pointing at its target, which gets the new text
      else await writeFileAtomic(await fs.realpath(abs).catch(() => abs), content ?? '');
    } catch (err) {
      if (err.code === 'EEXIST') throw httpError('A file with that name already exists.', 409);
      throw err;
    }
    await touchProject(root).catch(() => {});
    return { ok: true };
  });

  fastify.post('/api/projects/:id/convert-template', async (req) => {
    const { targetTemplate, mainFile = 'main.tex' } = req.body || {};
    if (!targetTemplate) return { ok: false, error: 'Missing targetTemplate.' };
    const { templates } = await readTemplateManifest();
    const template = templates.find((item) => item.id === targetTemplate);
    if (!template) return { ok: false, error: 'Unknown template.' };

    const root = await getProjectRoot(req.params.id);
    try {
      const currentMainPath = safeJoin(root, mainFile);
      const templateRoot = templatePath(template.id);
      const templateMain = template.mainFile || 'main.tex';

      let currentTex = '';
      try {
        currentTex = await fs.readFile(currentMainPath, 'utf8');
      } catch {
        currentTex = '';
      }

      const templateTex = await fs.readFile(path.join(templateRoot, templateMain), 'utf8');
      const merged = mergeTemplateBody(templateTex, extractDocumentBody(currentTex));
      // The merged document goes back into the project's own main file, whatever the template calls its main file.
      const changedFiles = await copyTemplateIntoProject(templateRoot, root, templateMain);
      await fs.writeFile(currentMainPath, merged, 'utf8');
      await touchProject(root).catch(() => {});
      return { ok: true, mainFile, changedFiles: [...new Set([...changedFiles, mainFile])] };
    } catch (err) {
      return { ok: false, error: `Couldn’t switch the template: ${err.message}` };
    }
  });

  fastify.post('/api/projects/:id/template', async (req) => {
    const { template } = req.body || {};
    const root = await getProjectRoot(req.params.id);
    if (!template) return { ok: false };
    await copyDir(templatePath(template), root);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/folder', async (req) => {
    const { path: folderPath } = req.body || {};
    if (!folderPath) return { ok: false };
    const root = await getProjectRoot(req.params.id);
    await ensureDir(editablePath(root, folderPath));
    await touchProject(root).catch(() => {});
    return { ok: true };
  });

  fastify.post('/api/projects/:id/rename', async (req, reply) => {
    const { from, to } = req.body || {};
    if (!from || !to) return { ok: false };
    const root = await getProjectRoot(req.params.id);
    const absFrom = editablePath(root, from, safeJoinLink);
    const absTo = editablePath(root, to, safeJoinLink);
    // fs.rename would replace the destination. The same inode is a case-only rename on APFS.
    const target = await fs.lstat(absTo).catch(() => null);
    if (target) {
      const source = await fs.lstat(absFrom);
      if (target.dev !== source.dev || target.ino !== source.ino) {
        return reply.code(409).send({ ok: false, error: 'A file with that name already exists.' });
      }
    }
    await ensureDir(path.dirname(absTo));
    await fs.rename(absFrom, absTo);
    await touchProject(root).catch(() => {});
    return { ok: true };
  });

  fastify.delete('/api/projects/:id/file', async (req) => {
    const { path: filePath } = req.query || {};
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    const root = await getProjectRoot(req.params.id);
    const abs = editablePath(root, filePath, safeJoinLink);
    try {
      await fs.lstat(abs);
    } catch (err) {
      if (err.code === 'ENOENT') return { ok: false, error: 'File not found.' };
      throw err;
    }
    await fs.rm(abs, { recursive: true, force: true });
    await touchProject(root).catch(() => {});
    return { ok: true };
  });
}
