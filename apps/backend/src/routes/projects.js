import os from 'os';
import path from 'path';
import { promises as fs, createWriteStream, watch } from 'fs';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as tar from 'tar';
import crypto from 'crypto';
import { gunzipSync } from 'zlib';
import { ensureDir, copyDir, extractZip, listFilesRecursive, mirrorSkips, renameOver, skipInArchive, writeFileAtomic } from '../utils/fsUtils.js';
import { onDiskRel, safeJoin, safeJoinLink, sanitizeUploadPath } from '../utils/pathUtils.js';
import { bibliographyFiles, extractDocumentBody, isDocumentFile, mergeTemplateBody, preserveDocumentMetadata, withBiblatexResources, withoutComments } from '../utils/texUtils.js';
import { readTemplateManifest, copyTemplateIntoProject, templatePath } from '../services/templateService.js';
import { DIAGRAM_MARK } from '../services/foldersService.js';
import {
  APP_DIR,
  mutateProjectFiles,
  mutateProjectRoot,
  appPath,
  cachePath,
  createProject,
  getProject,
  getProjectRoot,
  httpError,
  openFile,
  listProjects,
  openFolder,
  readMeta,
  relocateProject,
  renameProject,
  siblingParent,
  thumbnailFile,
  touchProject,
  unregister,
  updateMeta
} from '../services/projectService.js';
import { followRename } from './todos.js';
import { documentLabels, projectStats, typstDocumentLabels } from '../services/statsService.js';
import { readProjectSettings, updateProjectSettings } from '../services/projectSettings.js';
import { BIB_TOOLS, SUPPORTED_ENGINES } from '../services/compileService.js';
import { SKILL_ID } from '../services/skillService.js';
import { knownMachineNames } from '../services/presenceService.js';
import { stopProjectTexlab } from '../services/texlabService.js';
import { rehomeAgentRuns } from '../services/agentSessionService.js';
import { refuseBusy } from './sync.js';
import { syncSoon } from '../services/zoteroService.js';
import { conflictCopies } from '../utils/conflictCopies.js';
import { downloadArxivSource, extractArxivId } from '../services/arxivService.js';
import { markdownToLatex, pandocDocx, projectImages, svgsAsPdf } from '../services/markdownService.js';
import { pandocPath } from '../services/engineService.js';

const execFileAsync = promisify(execFile);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
// what the editor knows a file's text by, to tell whether it changed on disk since it loaded or saved it
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
// a change to anything else (app data, VCS internals, Finder litter, the app's own save and upload temp files) is no news to the editor
const watched = (rel) => !mirrorSkips(rel) && rel.split('/')[0].toLowerCase() !== APP_DIR;

/**
 * A path inside the project the user may change: not the folder itself, not app data
 * (in any letter case, since APFS ignores case). safeJoinLink allows the last part to be
 * a symlink, for moving or deleting the link itself.
 */
function editablePath(root, relPath, join = safeJoin) {
  const abs = join(root, String(relPath || ''));
  const first = path.relative(root, abs).split(path.sep)[0];
  // and as the disk takes it: a name APFS folds to app data's ('.ſpectrum'), or a folder link to it (a link moved or
  // deleted is itself what changes)
  const disk = onDiskRel(root, join === safeJoinLink ? path.dirname(abs) : abs).split('/')[0] || first;
  if (abs === root || [first, disk].some((part) => part.toUpperCase().toLowerCase() === APP_DIR)) throw httpError('Invalid path.', 400);
  return abs;
}

/**
 * A name NTFS or a sync app can't hold: ':' makes a hidden stream on NTFS, Windows drops a trailing dot or space, and
 * CON and the like are devices. Refused on every system for a file or folder made here, as the project may be opened
 * on Windows; one already there (from a Mac) still opens, saves and renames.
 */
const unfit = (rel) => {
  const name = String(rel).split('/').pop();
  return /[<>:"|?*\\\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name);
};
const UNFIT = 'That name can’t be used on Windows or in a sync app. Choose another one.';

// What each of a project's compile settings may be; null takes it back to the app's default. autoCompile: seconds after
// the last edit, 0 for off
const COMPILE_SETTINGS = {
  engine: (v) => SUPPORTED_ENGINES.includes(v),
  autoCompile: (v) => Number.isInteger(v) && v >= 0 && v <= 10,
  haltOnError: (v) => typeof v === 'boolean',
  bibTool: (v) => BIB_TOOLS.includes(v),
  draft: (v) => typeof v === 'boolean',
  // TexLab's syntax check before compiling, which the editor runs
  syntaxCheck: (v) => typeof v === 'boolean',
  // the Typst version a Typst project pins
  typstVersion: (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v),
  // the PDF engine a Markdown project compiles through
  markdownEngine: (v) => v === 'latex' || v === 'typst'
};
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/** A project-relative Markdown document, as the export and generated routes take it. */
const markdownDoc = (doc) => {
  const rel = path.posix.normalize(String(doc || '').replace(/\\/g, '/'));
  if (!/\.(md|markdown)$/i.test(rel) || rel.startsWith('../') || path.posix.isAbsolute(rel)) throw httpError('Choose a Markdown document.', 400);
  return rel;
};

/** A file name nothing holds yet: paper.docx, then paper (2).docx, and so on. */
async function unusedFile(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, -ext.length);
  const free = (file) => fs.access(file).then(() => false, () => true);
  let file = path.join(dir, name);
  for (let n = 2; !(await free(file)); n += 1) file = path.join(dir, base + ' (' + n + ')' + ext);
  return file;
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
  try {
    return await isDocumentFile(safeJoin(root, relPath));
  } catch {
    return false; // a link out of the project
  }
}

/**
 * A file the diagram composer can open (Edit diagram): a .tex or .typ with its drawing in diagrams/, or in figures/,
 * where diagrams went before 2.1 and stay until the project's first compile moves them, or any .mmd.
 */
async function isDiagram(root, relPath) {
  if (/\.mmd$/i.test(relPath)) return true;
  if (!/^(?:diagrams|figures)\/.+\.(?:tex|typ)$/i.test(relPath)) return false;
  try {
    return DIAGRAM_MARK.test(await fs.readFile(safeJoin(root, relPath), 'utf8'));
  } catch {
    return false; // gone, or a link out of the project
  }
}

export async function moveToBin(folder) {
  // the tests' stand-in for the Bin, so they never fill the user's
  if (process.env.SPECTRUM_TEST_BIN_DIR) {
    await ensureDir(process.env.SPECTRUM_TEST_BIN_DIR);
    return renameOver(folder, path.join(process.env.SPECTRUM_TEST_BIN_DIR, `${crypto.randomUUID()} ${path.basename(folder)}`));
  }
  if (process.platform === 'win32') {
    // The path goes in through the environment, so nothing in it is read as PowerShell. A drive
    // without a Recycle Bin (network, USB) would delete the folder for good, so those are refused.
    // ponytail: a folder too big for the Bin is still deleted for good; compare its size with the Bin's if that bites
    // A network share (\\server\share, or a mapped drive realpath turned into one) has no Bin, and DriveInfo
    // throws on it, so the check fails closed: any error stops the script before the delete
    if (folder.startsWith('\\\\')) throw new Error('This folder isn’t on a drive with a Recycle Bin.');
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '$p = $env:SPECTRUM_BIN_PATH',
      "try { if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($p)).DriveType -ne 'Fixed') { exit 3 } } catch { exit 3 }",
      'Add-Type -AssemblyName Microsoft.VisualBasic',
      // a folder, or one file (a sync app's conflict copy)
      "if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }"
    ].join('; ');
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, SPECTRUM_BIN_PATH: folder },
      windowsHide: true,
      timeout: 60_000
    }).catch((err) => {
      // the first line of PowerShell's error says what went wrong; the rest is where in the script
      throw new Error(err.code === 3 ? 'This folder isn’t on a drive with a Recycle Bin.' : String(err.stderr ?? '').trim().split(/\r?\n/)[0] || 'Couldn’t move the folder to the Recycle Bin.');
    });
    return;
  }
  try {
    await execFileAsync('/usr/bin/trash', [folder]);
  } catch {
    const quoted = folder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await execFileAsync('osascript', ['-e', `tell application "Finder" to delete POSIX file "${quoted}"`]);
  }
}

export function registerProjectRoutes(fastify) {
  // the open editors' folder watches, ended first when the server closes, so quitting doesn't wait for them
  const watches = new Set();
  fastify.addHook('preClose', (done) => {
    for (const res of watches) res.end();
    done();
  });

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

  // a file double-clicked in Finder or Explorer (the desktop app's /open page)
  fastify.post('/api/projects/open-file', async (req) => openFile(req.body?.path));

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
    const gitDir = path.join(srcRoot, '.git');
    const project = await createProject({
      name: String(req.body?.name || '').trim() || `${src.name} copy`,
      parentDir: siblingParent(srcRoot),
      meta: { tags: src.tags, mainFile: src.mainFile, fileOrder: src.fileOrder },
      populate: (root) => fs.cp(srcRoot, root, {
        recursive: true,
        // keep relative links relative, so the copy's links don't point into the original
        verbatimSymlinks: true,
        // nor its repository, whose origin is the original's on GitHub
        filter: (p) => ![appDir, gitDir].some((dir) => p === dir || p.startsWith(dir + path.sep))
      })
    });
    return { ok: true, project };
  });

  fastify.post('/api/projects/:id/remove', async (req) => {
    await stopProjectTexlab(req.params.id);
    await unregister(req.params.id);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/trash', async (req) => {
    if (!['darwin', 'win32'].includes(process.platform)) return { ok: false, error: 'Moving to the Bin is only supported on macOS and Windows.' };
    const root = await getProjectRoot(req.params.id);
    // Windows can't bin a folder its TexLab is watching
    await stopProjectTexlab(req.params.id);
    try {
      await moveToBin(root);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    await unregister(req.params.id);
    return { ok: true };
  });

  fastify.post('/api/projects/:id/relocate', async (req) => {
    refuseBusy(req.params.id, (await getProject(req.params.id)).name);
    const project = await relocateProject(req.params.id, req.body?.path);
    rehomeAgentRuns(req.params.id, project.path);
    // a TexLab on the old folder has its old text
    await stopProjectTexlab(req.params.id);
    return { ok: true, project };
  });

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

  // the LaTeX or Typst pandoc wrote for a Markdown document, for the Logs tab
  fastify.get('/api/projects/:id/generated', async (req, reply) => {
    const root = await getProjectRoot(req.params.id);
    const doc = markdownDoc(req.query?.doc);
    const generated = await cachePath(root, 'generated');
    // a document compiled through both engines keeps both files: show the one the last compile wrote
    const found = [];
    for (const [extension, kind] of [['tex', 'latex'], ['typ', 'typst']]) {
      const file = path.join(generated, doc + '.' + extension);
      const text = await fs.readFile(file, 'utf8').catch(() => null);
      if (text !== null) found.push({ text, kind, at: (await fs.stat(file).catch(() => null))?.mtimeMs ?? 0 });
    }
    const latest = found.sort((a, b) => b.at - a.at)[0];
    if (latest) return { ok: true, text: latest.text, kind: latest.kind };
    return reply.code(404).send({ ok: false, error: 'Nothing has been generated for that document yet.' });
  });

  // Word, from pandoc: never over a file Spectrum did not write
  fastify.post('/api/projects/:id/export/docx', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const doc = markdownDoc(req.body?.doc);
    const abs = safeJoin(root, doc);
    if (!(await fs.stat(abs).catch(() => null))?.isFile()) throw httpError('That Markdown file doesn’t exist.', 404);
    if (!(await pandocPath())) throw httpError('Markdown needs pandoc. Download it from Settings › Engines › Markdown.', 400);
    const output = await unusedFile(root, path.basename(doc, path.extname(doc)) + '.docx');
    const made = await pandocDocx(root, abs, output);
    if (!made.ok) throw httpError('pandoc couldn’t make a Word document from this Markdown.', 502);
    return { ok: true, path: path.relative(root, output).split(path.sep).join('/') };
  });

  // a new LaTeX project from the .md: pandoc's LaTeX, its .bib files, the images it includes from this project, figures/ and diagrams/
  fastify.post('/api/projects/:id/export/latex', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const doc = markdownDoc(req.body?.doc);
    const abs = safeJoin(root, doc);
    const meta = await readMeta(root);
    if (!(await fs.stat(abs).catch(() => null))?.isFile()) throw httpError('That Markdown file doesn’t exist.', 404);
    if (!(await pandocPath())) throw httpError('Markdown needs pandoc. Download it from Settings › Engines › Markdown.', 400);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-markdown-latex-'));
    try {
      const generatedDir = path.join(tmp, 'generated');
      // sandboxed, so pandoc reads no image, and only those in this project are copied
      const made = await markdownToLatex({ projectRoot: root, absMain: abs, mainFile: doc, generatedDir, sandboxed: true });
      if (!made.ok) throw httpError(made.error || 'pandoc couldn’t read this Markdown.', 502);
      const items = await listFilesRecursive(root);
      const bibs = items.filter((item) => item.type === 'file' && /\.bib$/i.test(item.path)).map((item) => item.path);
      const { text, images } = projectImages(made.text, root, path.dirname(abs));
      const project = await createProject({
        name: meta.name + ' (LaTeX)',
        meta: { mainFile: 'main.tex' },
        populate: async (target) => {
          for (const file of [...bibs, ...images]) {
            await fs.mkdir(path.dirname(path.join(target, file)), { recursive: true });
            await fs.copyFile(path.join(root, file), path.join(target, file));
          }
          for (const dir of ['figures', 'diagrams']) {
            const from = path.join(root, dir);
            if ((await fs.stat(from).catch(() => null))?.isDirectory()) await copyDir(from, path.join(target, dir));
          }
          await fs.writeFile(path.join(target, 'main.tex'), await svgsAsPdf(text, target));
        }
      });
      return { ok: true, project };
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  fastify.get('/api/projects/:id/settings', async (req) => ({ ok: true, settings: await readProjectSettings(await getProjectRoot(req.params.id)) }));

  // compile: the settings given change (null takes one back to the default); skills: { on, off }, the skills the
  // project turns on or off whatever this computer has, replaced whole (null: none); language: { languages }, the
  // project's own language list in place of the user's (null: the user's)
  fastify.patch('/api/projects/:id/settings', async (req) => {
    const { compile = {}, skills, language, ...others } = req.body || {};
    if (Object.keys(others).length || !isObject(compile)) throw httpError('Only compile, skill and language settings can be changed here.', 400);
    const tags = (list) => Array.isArray(list) && list.length >= 1 && list.length <= 20 && list.every((tag) => typeof tag === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(tag));
    if (language !== undefined && (!isObject(language) || Object.keys(language).some((key) => key !== 'languages') || (language.languages !== null && !tags(language.languages)))) {
      throw httpError('Invalid language settings: a list of up to 20 language tags, or null for the user’s own.', 400);
    }
    for (const [key, value] of Object.entries(compile)) {
      if (!Object.hasOwn(COMPILE_SETTINGS, key) || (value !== null && !COMPILE_SETTINGS[key](value))) throw httpError(`Invalid compile setting: ${key}.`, 400);
    }
    const ids = (list) => Array.isArray(list) && list.length <= 1000 && list.every((id) => typeof id === 'string' && SKILL_ID.test(id));
    if (skills !== undefined && skills !== null && (!isObject(skills) || Object.keys(skills).some((key) => !['on', 'off'].includes(key)) || !ids(skills.on ?? []) || !ids(skills.off ?? []) || (skills.on ?? []).some((id) => (skills.off ?? []).includes(id)))) {
      throw httpError('Invalid skill settings: lists of skill ids to turn on and off, none in both.', 400);
    }
    const root = await getProjectRoot(req.params.id);
    const settings = await updateProjectSettings(root, ({ compile: old, skills: oldSkills, language: oldLanguage, ...rest }) => {
      const next = { ...(isObject(old) ? old : {}), ...compile };
      for (const key of Object.keys(next)) if (next[key] === null) delete next[key];
      const choices = skills === undefined ? oldSkills : skills && (skills.on?.length || skills.off?.length) ? { on: [...new Set(skills.on ?? [])], off: [...new Set(skills.off ?? [])] } : undefined;
      // keys a newer Spectrum keeps under language stay
      const { languages: _old, ...otherLanguage } = isObject(oldLanguage) ? oldLanguage : {};
      const lang = language === undefined ? oldLanguage : { ...otherLanguage, ...(language.languages && { languages: [...new Set(language.languages)] }) };
      const keepLanguage = lang !== undefined && (!isObject(lang) || Object.keys(lang).length);
      return { ...rest, ...(Object.keys(next).length && { compile: next }), ...(choices !== undefined && { skills: choices }), ...(keepLanguage && { language: lang }) };
    });
    return { ok: true, settings };
  });

  fastify.get('/api/projects/:id/thumbnail', async (req, reply) => {
    const root = await getProjectRoot(req.params.id);
    let png;
    try {
      png = await fs.readFile(await thumbnailFile(root));
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
    // ponytail: the one 1.7.0 kept in .spectrum stays there, stale, for it to show if the user goes back to it
    await writeFileAtomic(await cachePath(root, 'thumbnail.png'), png);
    return { ok: true };
  });

  // doc: the document (mainFile, as 1.10.4's editor called it); labels: its numbers and pages from the last compile
  fastify.get('/api/projects/:id/stats', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const doc = String(req.query?.doc || req.query?.mainFile || '') || (await readMeta(root)).mainFile || 'main.tex';
    // Typst has no .aux: its own eval gives the headings and labels with their pages
    // typstVersion: the app's default, which a project that pins none compiles with
    if (/\.typ$/i.test(doc)) {
      const typstVersion = COMPILE_SETTINGS.typstVersion(req.query?.typstVersion) ? req.query.typstVersion : '';
      return { ok: true, ...(await typstDocumentLabels(root, doc, typstVersion)) };
    }
    return { ...(await projectStats(root, doc, req.query?.texFolder)), ...(await documentLabels(root, doc)) };
  });

  // Tells the open editor when files appear, go or are renamed outside the app (Finder, another editor, a git
  // pull, a sync client bringing another computer's work), so its file list follows, and which files changed, so
  // it can load them again. After each burst of events it sends the paths that changed (all, when the system
  // didn't say which), and lists the folder again to send tree only when the list changed. The app's own saves
  // count as changes too: the editor tells them apart by the text's hash. Its data in .spectrum doesn't count.
  fastify.get('/api/projects/:id/events', async (req, reply) => {
    const root = await getProjectRoot(req.params.id);
    const listing = async () => (await listFilesRecursive(root).catch(() => [])).map((i) => `${i.type} ${i.path}`).join('\n');
    let last = await listing();
    reply.hijack();
    // the editor went away during the listing
    if (reply.raw.destroyed) return reply;
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    // sends the headers now rather than with the first event
    reply.raw.write(': watching\n\n');
    let timer = null;
    // '' when the system didn't say which file changed
    let changed = new Set();
    const check = async () => {
      timer = null;
      const paths = [...changed];
      changed = new Set();
      const now = await listing();
      if (reply.raw.writableEnded) return;
      reply.raw.write(`event: changed\ndata: ${JSON.stringify(paths.includes('') ? { all: true } : { paths })}\n\n`);
      if (now === last) return;
      last = now;
      reply.raw.write('event: tree\ndata: {}\n\n');
    };
    let watcher;
    try {
      // recursive: FSEvents on macOS, ReadDirectoryChangesW on Windows; names come relative to root
      watcher = watch(root, { recursive: true }, (type, name) => {
        const rel = name ? String(name).split(path.sep).join('/') : '';
        if (rel && !watched(rel)) return;
        changed.add(rel);
        timer ??= setTimeout(check, 300);
      });
    } catch {
      reply.raw.end();
      return reply;
    }
    // the folder went away, or the system ran out of watches: the list just stops following
    watcher.on('error', () => reply.raw.end());
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 30_000);
    watches.add(reply.raw);
    reply.raw.on('close', () => {
      watches.delete(reply.raw);
      watcher.close();
      clearInterval(ping);
      clearTimeout(timer);
    });
    return reply;
  });

  fastify.get('/api/projects/:id/tree', async (req) => {
    const root = await getProjectRoot(req.params.id);
    const items = await listFilesRecursive(root);
    const { fileOrder, mainFile } = await readMeta(root);
    // a sync app's conflict copies, each with its original's path; never documents
    const conflicts = conflictCopies(items.filter((i) => i.type === 'file').map((i) => i.path), await knownMachineNames(root));
    // .tex files that compile on their own, and the diagram composer's
    const documents = [];
    const diagrams = [];
    for (const item of items) {
      if (item.type !== 'file' || conflicts[item.path]) continue;
      if (/\.tex$/i.test(item.path) && await isDocument(root, item.path)) documents.push(item.path);
      if (await isDiagram(root, item.path)) diagrams.push(item.path);
    }
    return { items, fileOrder, mainFile, documents, diagrams, conflicts };
  });

  fastify.post('/api/projects/:id/file-order', async (req) => {
    const { folder = '', order } = req.body || {};
    if (!Array.isArray(order)) {
      return { ok: false, error: 'Missing order.' };
    }
    const root = await getProjectRoot(req.params.id);
    await mutateProjectRoot(root, () => updateMeta(root, (meta) => ({ ...meta, fileOrder: { ...meta.fileOrder, [folder]: order } })));
    return { ok: true };
  });

  // hash: what a save gives as its base. base: the hash of the text the editor has, which then isn't sent again when it's unchanged
  fastify.get('/api/projects/:id/file', async (req) => {
    const { path: filePath, base } = req.query;
    if (!filePath) return { content: '' };
    const root = await getProjectRoot(req.params.id);
    const data = await fs.readFile(safeJoin(root, filePath));
    const hash = sha256(data);
    return base === hash ? { hash } : { content: data.toString('utf8'), hash };
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
        // the folder may have moved while it streamed: then it isn't left in the one behind
        await mutateProjectRoot(root, () => renameOver(tmp, abs));
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      saved.push(relPath);
    }
    if (saved.length) await touchProject(root).catch(() => {});
    return { ok: true, files: saved };
  });

  fastify.put('/api/projects/:id/file', async (req, reply) => mutateProjectFiles(async () => {
    // create: true makes a new file only, never replacing one (APFS also matches other letter cases).
    // base: the hash of the text the editor last loaded or saved. A file changed since (on another computer, through a
    // sync client) isn't written over, and the answer carries its text; one deleted since isn't made again.
    // typed: a name the user typed, which must be one NTFS and the sync apps can hold; a name made from a file's own
    // (a conflicted copy, a restore) isn't checked, so the text it holds is never refused.
    const { path: filePath, content, create, base, typed } = req.body || {};
    if (!filePath) return { ok: false };
    if (create && typed && unfit(filePath)) throw httpError(UNFIT, 400);
    const root = await getProjectRoot(req.params.id);
    const abs = editablePath(root, filePath);
    if (base && !create) {
      // External sync clients can still write independently of this process's file lock.
      const disk = await fs.readFile(abs).catch((err) => {
        if (err.code === 'ENOENT') return null;
        throw err;
      });
      const name = path.basename(abs);
      if (!disk) return reply.code(409).send({ ok: false, code: 'DELETED_ON_DISK', error: `${name} was deleted on disk.` });
      const hash = sha256(disk);
      if (hash !== base) {
        return reply.code(409).send({ ok: false, code: 'CHANGED_ON_DISK', error: `${name} was changed on another computer.`, content: disk.toString('utf8'), hash });
      }
    }
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
    // the project's Zotero collection follows the .bib a little after the saves stop, entries taken out included
    if (/\.bib$/i.test(filePath)) syncSoon(root, { remove: true, delay: 5000 });
    return { ok: true, hash: sha256(content ?? '') };
  }));

  fastify.post('/api/projects/:id/convert-template', async (req) => {
    const { targetTemplate, mainFile = 'main.tex' } = req.body || {};
    if (!targetTemplate) return { ok: false, error: 'Missing targetTemplate.' };
    const { templates } = await readTemplateManifest();
    const template = templates.find((item) => item.id === targetTemplate);
    if (!template) return { ok: false, error: 'Unknown template.' };

    const root = await getProjectRoot(req.params.id);
    return mutateProjectRoot(root, async () => {
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
        const merged = preserveDocumentMetadata(withBiblatexResources(mergeTemplateBody(templateTex, extractDocumentBody(currentTex)), bibliographyFiles(currentTex)), currentTex);
        // The merged document goes back into the project's own main file, whatever the template calls its main file.
        const changedFiles = await copyTemplateIntoProject(templateRoot, root, templateMain);
        await fs.writeFile(currentMainPath, merged, 'utf8');
        await touchProject(root).catch(() => {});
        return { ok: true, mainFile, changedFiles: [...new Set([...changedFiles, mainFile])] };
      } catch (err) {
        return { ok: false, error: `Couldn’t switch the template: ${err.message}` };
      }
    });
  });

  fastify.post('/api/projects/:id/template', async (req) => {
    const { template } = req.body || {};
    const root = await getProjectRoot(req.params.id);
    if (!template) return { ok: false };
    await mutateProjectRoot(root, () => copyDir(templatePath(template), root));
    return { ok: true };
  });

  fastify.post('/api/projects/:id/folder', async (req) => {
    const { path: folderPath } = req.body || {};
    if (!folderPath) return { ok: false };
    if (unfit(folderPath)) throw httpError(UNFIT, 400);
    const root = await getProjectRoot(req.params.id);
    await mutateProjectRoot(root, () => ensureDir(editablePath(root, folderPath)));
    await touchProject(root).catch(() => {});
    return { ok: true };
  });

  fastify.post('/api/projects/:id/rename', async (req, reply) => {
    const { from, to } = req.body || {};
    if (!from || !to) return { ok: false };
    // a new name only: one already there can still move into another folder
    if (String(to).split('/').pop() !== String(from).split('/').pop() && unfit(to)) throw httpError(UNFIT, 400);
    const root = await getProjectRoot(req.params.id);
    return mutateProjectRoot(root, async () => {
      const absFrom = editablePath(root, from, safeJoinLink);
      const absTo = editablePath(root, to, safeJoinLink);
      // fs.rename would replace the destination. The same inode is a case-only rename on APFS and NTFS.
      // bigint: NTFS file ids are 64-bit, and two rounded to the same number would let a rename replace a file
      const target = await fs.lstat(absTo, { bigint: true }).catch(() => null);
      if (target) {
        const source = await fs.lstat(absFrom, { bigint: true });
        if (target.dev !== source.dev || target.ino !== source.ino) {
          return reply.code(409).send({ ok: false, error: 'A file with that name already exists.' });
        }
      }
      await ensureDir(path.dirname(absTo));
      await renameOver(absFrom, absTo);
      // the notes on its PDF and the to-dos linked to it go with it (the file moved whether or not they do); unmoved: how
      // many couldn't
      const unmoved = await followRename(root, String(from), String(to)).catch(() => 0);
      await touchProject(root).catch(() => {});
      return { ok: true, ...(unmoved && { unmoved }) };
    });
  });

  fastify.delete('/api/projects/:id/file', async (req) => {
    const { path: filePath } = req.query || {};
    if (!filePath) return { ok: false, error: 'Missing file path.' };
    const root = await getProjectRoot(req.params.id);
    return mutateProjectRoot(root, async () => {
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
  });
}
