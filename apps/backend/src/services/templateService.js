import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, TEMPLATE_DIR, TEMPLATE_MANIFEST, TEMPLATE_SEED_DIR } from '../config/constants.js';
import { copyDir, ensureDir, listFilesRecursive, readJson, renameOver, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { createProject, detectMainFile, getProjectRoot, httpError, listProjects, readMeta, serialiser, unregister, updateMeta } from './projectService.js';
import { sharedDir } from './syncService.js';

// the desktop app's read-only copy of the shipped templates (dev runs straight from the repo's)
const SEEDED = !!TEMPLATE_SEED_DIR && path.resolve(TEMPLATE_SEED_DIR) !== path.resolve(TEMPLATE_DIR);
// working copies of templates being edited: projects kept out of the list, one per template
const DRAFTS_DIR = path.join(DATA_DIR, 'template-drafts');
// what a compile or another editor leaves beside the sources
const BUILD_LEFTOVER = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex(\.gz)?|bbl|blg|bcf|run\.xml|xdv|nav|snm|vrb)$/i;

/** Resolve a template id to its folder, refusing anything that escapes TEMPLATE_DIR. */
export function templatePath(id) {
  if (!id || !/^[A-Za-z0-9_.-]+$/.test(id) || id.startsWith('.')) {
    throw Object.assign(new Error('Template names can only use letters, digits, “.”, “-” and “_”.'), { statusCode: 400 });
  }
  return safeJoin(TEMPLATE_DIR, id);
}

/**
 * Desktop builds ship templates read-only inside the app bundle, but users can upload
 * their own, so the live set lives in a writable dir. Copy in any bundled template the
 * user doesn't have yet, refresh the bundled ones' files (when an update changed them) and manifest entries and
 * the categories, and keep the user's uploads (author "User") and the bundled ones they edited (edited) as they are.
 */
export async function seedTemplates() {
  if (!SEEDED) return;
  await ensureDir(TEMPLATE_DIR);
  const entries = await fs.readdir(TEMPLATE_SEED_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dest = path.join(TEMPLATE_DIR, entry.name);
    try {
      await fs.access(dest);
    } catch {
      await copyDir(path.join(TEMPLATE_SEED_DIR, entry.name), dest);
    }
  }
  let seed = { templates: [], categories: [] };
  try {
    seed = await readJson(path.join(TEMPLATE_SEED_DIR, 'manifest.json'));
  } catch {
    return;
  }
  let current = null;
  try {
    current = await readJson(TEMPLATE_MANIFEST);
  } catch (err) {
    // an unreadable manifest is left for the user to see, never replaced: it holds their edited and own templates
    if (err.code === 'ENOENT') await writeJsonAtomic(TEMPLATE_MANIFEST, seed);
    else console.error(`Couldn’t read ${TEMPLATE_MANIFEST}: ${err.message}`);
    return;
  }
  // A shipped template the user hasn't edited follows the app: when an update changes its files, the user's copy
  // is replaced with them (an upload under the same name and an edited template keep theirs)
  const mine = new Map((current.templates || []).map((t) => [t.id, t]));
  const hashes = new Map();
  for (const t of seed.templates || []) {
    const was = mine.get(t.id);
    if (was && (was.author === 'User' || was.edited)) continue;
    const seedDir = path.join(TEMPLATE_SEED_DIR, t.id);
    const hash = await folderHash(seedDir).catch(() => '');
    if (!hash) continue;
    if (was && was.shippedHash !== hash) {
      // a file held open (Windows) or a full disk: the old files stay, and the next launch tries again
      const replaced = await replaceTemplateFolder(t.id, (staged) => copyDir(seedDir, staged)).then(() => true, () => false);
      if (!replaced) continue;
    }
    hashes.set(t.id, hash);
  }
  const shipped = new Map((seed.templates || []).map((t) => [t.id, hashes.has(t.id) ? { ...t, shippedHash: hashes.get(t.id) } : t]));
  const kept = (current.templates || []).map((t) => (shipped.has(t.id) && t.author !== 'User' && !t.edited ? shipped.get(t.id) : t));
  const known = new Set(kept.map((t) => t.id));
  const next = {
    templates: [...kept, ...[...shipped.values()].filter((t) => !known.has(t.id))],
    categories: seed.categories || current.categories || []
  };
  if (JSON.stringify(next) !== JSON.stringify(current)) await writeJsonAtomic(TEMPLATE_MANIFEST, next);
}

export async function readTemplateManifest() {
  // Read manifest
  let manifestTemplates = [];
  let categories = [];
  try {
    const data = await readJson(TEMPLATE_MANIFEST);
    // manifests copied by older installs still carry Chinese text with an English twin
    manifestTemplates = (Array.isArray(data?.templates) ? data.templates : [])
      .map(({ descriptionEn, ...t }) => ({ ...t, description: descriptionEn || t.description }));
    categories = (Array.isArray(data?.categories) ? data.categories : [])
      .map(({ labelEn, ...c }) => ({ ...c, label: labelEn || c.label }));
  } catch { /* ignore */ }

  // Scan templates directory for dirs not in manifest
  const knownIds = new Set(manifestTemplates.map(t => t.id));
  try {
    await ensureDir(TEMPLATE_DIR);
    const entries = await fs.readdir(TEMPLATE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // .<id>-…: a template being replaced or deleted
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      if (knownIds.has(entry.name)) continue;
      // Check if dir contains a .tex file
      const dirPath = path.join(TEMPLATE_DIR, entry.name);
      const files = await fs.readdir(dirPath);
      const hasTex = files.some(f => f.endsWith('.tex'));
      if (!hasTex) continue;
      // Auto-generate entry
      manifestTemplates.push({
        id: entry.name,
        label: entry.name,
        mainFile: 'main.tex',
        category: 'academic',
        description: entry.name,
        tags: [],
        author: '',
        featured: false,
      });
    }
  } catch { /* ignore */ }

  // a category chip with no template behind it only ever shows an empty gallery
  const used = new Set(manifestTemplates.map((t) => t.category));
  categories = categories.filter((c) => c.id === 'all' || used.has(c.id));
  // featured first in the gallery and the new-project menu; otherwise manifest order (sort is stable)
  manifestTemplates.sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  return { templates: manifestTemplates, categories };
}

const manifestLock = serialiser();

/** fn receives the manifest's templates and returns the next list. */
function updateManifest(fn) {
  return manifestLock(async () => {
    // only a missing manifest starts empty: an unreadable one would be written over with this one change
    const data = await readJson(TEMPLATE_MANIFEST).catch((err) => {
      if (err.code === 'ENOENT') return { templates: [], categories: [] };
      throw httpError('The list of templates can’t be read, so nothing was changed.', 500);
    });
    data.templates = fn(Array.isArray(data.templates) ? data.templates : []);
    await writeJsonAtomic(TEMPLATE_MANIFEST, data);
  });
}

/** A saved template's entry (merged into the one it had); one that follows the user goes to the shared folder too. */
export async function addTemplateToManifest(entry) {
  let saved = entry;
  await updateManifest((templates) => {
    const i = templates.findIndex((t) => t.id === entry.id);
    saved = { ...templates[i], ...entry, updatedAt: new Date().toISOString() };
    return i >= 0 ? templates.with(i, saved) : [...templates, saved];
  });
  if (followsUser(saved)) await shareTemplate(saved.id, saved);
}

// ─── Templates that follow the user ───
// The user's own templates and the shipped ones they edited, mirrored in <shared>/templates/<id>/:
//   template.json   the manifest entry with updatedAt and each file's sha1, or { id, deleted: true, updatedAt }
//   files/          the template's files
// Copied each way, never moved, so TEMPLATE_DIR keeps every template whole for 1.7.0; the newest save wins.
// ponytail: a template deleted while the shared folder isn't there comes back from it; keep tombstones here too
// if that bites

const followsUser = (t) => t.author === 'User' || !!t.edited;
const validId = (id) => {
  try {
    return !!templatePath(id);
  } catch {
    return false;
  }
};
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

async function sharedTemplatesDir() {
  const dir = await sharedDir().catch(() => null);
  return dir && path.join(dir, 'templates');
}

async function fileHashes(dir) {
  const files = {};
  for (const item of await listFilesRecursive(dir)) if (item.type === 'file') files[item.path] = sha1(await fs.readFile(path.join(dir, item.path)));
  return files;
}

const sameHashes = (a = {}, b = {}) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/** Write a template, or its deletion (entry null), to the shared folder. Only logs when it can't. */
async function shareTemplate(id, entry) {
  try {
    const dir = await sharedTemplatesDir();
    if (!dir) return;
    const shared = safeJoin(dir, id);
    await fs.rm(path.join(shared, 'files'), { recursive: true, force: true });
    if (!entry) {
      await writeJsonAtomic(path.join(shared, 'template.json'), { id, deleted: true, updatedAt: new Date().toISOString() });
      return;
    }
    await copyDir(templatePath(id), path.join(shared, 'files'));
    await writeJsonAtomic(path.join(shared, 'template.json'), { ...entry, files: await fileHashes(templatePath(id)) });
  } catch (err) {
    console.error(`Couldn’t share the “${id}” template with your other computers: ${err.message}`);
  }
}

/** Copy the files template.json lists into dest, refusing any that haven't fully synced yet. */
async function copySharedFiles(src, hashes, dest) {
  if (!Object.keys(hashes || {}).length) throw new Error('No files yet.');
  for (const [rel, sha] of Object.entries(hashes)) {
    const buf = await fs.readFile(safeJoin(src, rel));
    if (sha1(buf) !== sha) throw new Error(`${rel} is still syncing.`);
    await ensureDir(path.dirname(safeJoin(dest, rel)));
    await fs.writeFile(safeJoin(dest, rel), buf);
  }
}

const syncLock = serialiser();

/**
 * Bring in the templates the user saved or deleted on their other computers since, and share this computer's
 * newer ones. On start and whenever the gallery lists the templates.
 */
export function syncTemplates() {
  return syncLock(async () => {
    const dir = await sharedTemplatesDir();
    if (!dir) return;
    // an unreadable manifest is the user's to see, never synced over
    const data = await readJson(TEMPLATE_MANIFEST).catch((err) => (err.code === 'ENOENT' ? {} : null));
    if (!data) return;
    const local = new Map((Array.isArray(data.templates) ? data.templates : []).map((t) => [t.id, t]));
    const shared = new Map();
    for (const id of await fs.readdir(dir).catch(() => [])) {
      if (!validId(id)) continue;
      const s = await readJson(path.join(dir, id, 'template.json')).catch(() => null);
      if (s?.id === id && typeof s.updatedAt === 'string') shared.set(id, s);
    }
    const stamp = (id, updatedAt) => updateManifest((templates) => templates.map((t) => (t.id === id ? { ...t, updatedAt } : t)));

    for (const [id, s] of shared) {
      const t = local.get(id);
      if (t && followsUser(t) && !t.updatedAt) {
        // made here before templates followed the user: joined to the shared one only when they're the same
        if (!s.deleted && sameHashes(await fileHashes(templatePath(id)).catch(() => ({})), s.files)) await stamp(id, s.updatedAt);
        continue;
      }
      if (t && (t.updatedAt || '') >= s.updatedAt) continue;
      if (s.deleted) {
        if (t && followsUser(t)) await (t.author === 'User' ? deleteTemplate(id, { share: false }) : restoreTemplate(id, { share: false })).catch(() => {});
        continue;
      }
      try {
        await replaceTemplateFolder(id, (staged) => copySharedFiles(path.join(dir, id, 'files'), s.files, staged));
      } catch {
        continue; // still syncing: next time
      }
      const { files: _files, deleted: _deleted, ...entry } = s;
      await updateManifest((templates) => {
        const i = templates.findIndex((x) => x.id === id);
        return i >= 0 ? templates.with(i, entry) : [...templates, entry];
      });
    }

    for (const t of local.values()) {
      const s = shared.get(t.id);
      if (!followsUser(t) || (s && (t.updatedAt || '') <= s.updatedAt)) continue;
      const entry = t.updatedAt ? t : { ...t, updatedAt: new Date().toISOString() };
      if (!t.updatedAt) await stamp(t.id, entry.updatedAt);
      await shareTemplate(t.id, entry);
    }
  });
}

async function findTemplate(id) {
  templatePath(id);
  const template = (await readTemplateManifest()).templates.find((t) => t.id === id);
  if (!template) throw httpError('That template doesn’t exist any more.', 404);
  return template;
}

/** The manifest entry Spectrum ships for id, or null. */
async function shippedEntry(id) {
  if (!SEEDED) return null;
  const seed = await readJson(path.join(TEMPLATE_SEED_DIR, 'manifest.json')).catch(() => null);
  return (seed?.templates || []).find((t) => t.id === id) || null;
}

/**
 * Copy a project's files into dest (made if need be) for a template: not app data, links, the
 * compiled PDFs of its documents (x.pdf beside x.tex) or other build leftovers.
 */
/**
 * The files of src a template keeps: not the app's data, links, build leftovers or the main file's compiled PDF;
 * a .bbl stays when there's no .bib (arXiv sources ship one), and so does anything in keep (the template's own files).
 */
async function templateFiles(src, { mainFile = '', keep = new Set() } = {}) {
  const files = (await listFilesRecursive(src)).filter((i) => i.type === 'file').map((i) => i.path);
  const hasBib = files.some((f) => /\.bib$/i.test(f));
  const mainPdf = mainFile.replace(/\.tex$/i, '.pdf');
  const kept = [];
  for (const file of files) {
    const leftover = file === mainPdf || (BUILD_LEFTOVER.test(file) && (hasBib || !/\.bbl$/i.test(file)));
    if (leftover && !keep.has(file)) continue;
    if ((await fs.lstat(path.join(src, file))).isSymbolicLink()) continue;
    kept.push(file);
  }
  return kept.sort();
}

async function copyTemplateFiles(src, dest, options) {
  await ensureDir(dest);
  for (const file of await templateFiles(src, options)) {
    await ensureDir(path.dirname(path.join(dest, file)));
    await fs.copyFile(path.join(src, file), path.join(dest, file));
  }
}

/** A working copy's content as one hash, so Done can tell edits (in the app or not) from a compile. */
async function draftHash(root, mainFile, keep) {
  const hash = crypto.createHash('sha1').update(`${mainFile}\0`);
  for (const file of await templateFiles(root, { mainFile, keep })) hash.update(`${file}\0`).update(await fs.readFile(path.join(root, file))).update('\0');
  return hash.digest('hex');
}

/** The files a template has now, kept through a save whatever they are. */
const ownFiles = async (id) => new Set(((await listFilesRecursive(templatePath(id)).catch(() => [])).filter((i) => i.type === 'file')).map((i) => i.path));

/**
 * Replace a template's folder with one fill(folder) builds beside it, so the template is always the
 * old copy or the new one, never part of each.
 * ponytail: a crash between the two renames leaves the old copy as .<id>-…-old; put it back at startup if that bites
 */
/** A folder's files as one hash, so seeding can tell when an update changed a shipped template. */
async function folderHash(dir) {
  const hash = crypto.createHash('sha1');
  const files = (await listFilesRecursive(dir)).filter((i) => i.type === 'file').sort((a, b) => (a.path < b.path ? -1 : 1));
  for (const file of files) hash.update(`${file.path}\0`).update(await fs.readFile(path.join(dir, file.path))).update('\0');
  return hash.digest('hex');
}

async function replaceTemplateFolder(id, fill) {
  const root = templatePath(id);
  const staged = safeJoin(TEMPLATE_DIR, `.${id}-${crypto.randomUUID()}`);
  const old = `${staged}-old`;
  try {
    await fill(staged);
    await renameOver(root, old).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
    await renameOver(staged, root);
  } catch (err) {
    await renameOver(old, root).catch(() => {});
    await fs.rm(staged, { recursive: true, force: true });
    throw err;
  }
  // the new copy is in place: an old one Windows still holds is only clutter
  await fs.rm(old, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}

/** The project's main file as its metadata has it, while that file is there, else the one detected. */
async function mainFileOf(root, meta) {
  const kept = meta.mainFile && (await fs.access(safeJoin(root, meta.mainFile)).then(() => true, () => false));
  return (kept ? meta.mainFile : await detectMainFile(root)) || 'main.tex';
}

/** A template being edited: its folder and metadata. Only a folder in the drafts folder counts, as Done deletes it. */
async function draftOf(projectId) {
  const root = await getProjectRoot(projectId);
  const meta = await readMeta(root);
  const drafts = await fs.realpath(DRAFTS_DIR).catch(() => DRAFTS_DIR);
  if (!meta.templateDraft || path.dirname(root) !== drafts) throw httpError('This project isn’t a template being edited.', 400);
  return { root, meta };
}

/** Open a working copy of a template as a project, or the one already open for it. */
export async function editTemplate(id) {
  const template = await findTemplate(id);
  const draft = (await listProjects()).find((p) => p.templateDraft === id && !p.missing);
  if (draft) return { project: draft, existing: true };
  const project = await createProject({
    name: template.label,
    parentDir: DRAFTS_DIR,
    meta: { templateDraft: id, mainFile: template.mainFile },
    // the whole template, whatever its files are
    populate: (root) => copyDir(templatePath(id), root)
  });
  const keep = await ownFiles(id);
  const templateHash = await draftHash(project.path, template.mainFile, keep);
  await updateMeta(project.path, (m) => ({ ...m, templateHash }));
  return { project, existing: false };
}

/** Put a draft's files in its template's place. One Spectrum ships is marked edited, which seeding leaves alone. */
export async function saveTemplateDraft(projectId) {
  const { root, meta } = await draftOf(projectId);
  const template = await findTemplate(meta.templateDraft).catch(() => {
    throw httpError(`The “${meta.name}” template doesn’t exist any more. Save it as a new template instead.`, 404);
  });
  const mainFile = await mainFileOf(root, meta);
  const keep = await ownFiles(template.id);
  // taken first, so a change made while the files copy still counts as unsaved
  const savedAt = new Date().toISOString();
  const templateHash = await draftHash(root, mainFile, keep);
  await replaceTemplateFolder(template.id, (dest) => copyTemplateFiles(root, dest, { mainFile, keep }));
  const edited = template.author !== 'User' && !!(await shippedEntry(template.id));
  const entry = { ...template, mainFile, ...(edited && { edited: true }) };
  await addTemplateToManifest(entry);
  await updateMeta(root, (m) => ({ ...m, templateSavedAt: savedAt, templateHash }));
  return entry;
}

/** A folder for a new template, named after it (lab-report-2 when lab-report is taken); returns its id. */
async function newTemplateFolder(label) {
  // ASCII letters, digits and dashes make a folder name on macOS and Windows, except CON, AUX and the
  // like, which are devices on Windows
  let base = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'template';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(base)) base += '-template';
  // and the ones on the user's other computers, not all here yet
  const sharedTemplates = await sharedTemplatesDir();
  const shared = sharedTemplates ? await fs.readdir(sharedTemplates).catch(() => []) : [];
  const taken = new Set([...(await readTemplateManifest()).templates.map((t) => t.id), ...shared].map((id) => id.toLowerCase()));
  for (let n = 1; ; n += 1) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (taken.has(id)) continue;
    try {
      await fs.mkdir(templatePath(id));
      return id;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/** A new template of the user's own from a project's files. A draft carries on as the new template's. */
export async function saveAsTemplate(projectId, { label, category, description }) {
  const name = Array.from(String(label || '').trim()).slice(0, 100).join('');
  if (!name) throw httpError('Give the template a name.', 400);
  const { categories } = await readTemplateManifest();
  if (category === 'all' || !categories.some((c) => c.id === category)) throw httpError('Choose a section for the template.', 400);
  const root = await getProjectRoot(projectId);
  const meta = await readMeta(root);
  const id = await newTemplateFolder(name);
  const mainFile = await mainFileOf(root, meta);
  const savedAt = new Date().toISOString();
  const templateHash = await draftHash(root, mainFile, new Set());
  try {
    await copyTemplateFiles(root, templatePath(id), { mainFile });
  } catch (err) {
    await fs.rm(templatePath(id), { recursive: true, force: true });
    throw err;
  }
  const entry = {
    id,
    label: name,
    mainFile,
    category,
    description: String(description || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    tags: [],
    author: 'User',
    featured: false
  };
  await addTemplateToManifest(entry);
  if (meta.templateDraft) await updateMeta(root, (m) => ({ ...m, name, templateDraft: id, templateSavedAt: savedAt, templateHash }));
  return entry;
}

/** Done with a draft: forget it and delete its folder. Changes not saved to the template need discard. */
export async function closeTemplateDraft(projectId, discard) {
  const { root, meta } = await draftOf(projectId);
  // by content when the copy has a fingerprint (edits made outside the app count, a compile doesn't), else by time
  const changed = meta.templateHash
    ? (await draftHash(root, await mainFileOf(root, meta), await ownFiles(meta.templateDraft))) !== meta.templateHash
    : meta.updatedAt > (meta.templateSavedAt || meta.createdAt);
  if (!discard && changed) {
    throw httpError('This template has changes that aren’t saved yet.', 409, 'UNSAVED');
  }
  await unregister(projectId);
  // a folder Windows still holds open is only clutter in the app's data folder
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}

/** Put back the files and manifest entry Spectrum ships for a template the user edited (share: on the other computers too). */
export async function restoreTemplate(id, { share = true } = {}) {
  const template = await findTemplate(id);
  const shipped = template.author !== 'User' && (await shippedEntry(id));
  if (!shipped) throw httpError(`“${template.label}” doesn’t come with Spectrum, so there’s no original to restore.`, 400);
  await replaceTemplateFolder(id, (dest) => copyDir(safeJoin(TEMPLATE_SEED_DIR, id), dest));
  await updateManifest((templates) => templates.map((t) => (t.id === id ? shipped : t)));
  if (share) await shareTemplate(id, null);
  return shipped;
}

/**
 * Delete one of the user's own templates; the ones Spectrum ships can only be restored. share: deleted here,
 * so on the other computers too; otherwise deleted on one of those, and a working copy with changes stays.
 */
export async function deleteTemplate(id, { share = true } = {}) {
  const template = await findTemplate(id);
  if (template.author !== 'User') throw httpError('Only templates you made or uploaded can be deleted.', 400);
  // out of the gallery in one step, then out of the manifest and off the disk
  const gone = safeJoin(TEMPLATE_DIR, `.${id}-${crypto.randomUUID()}`);
  await renameOver(templatePath(id), gone).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
  await updateManifest((templates) => templates.filter((t) => t.id !== id));
  await fs.rm(gone, { recursive: true, force: true, maxRetries: 5 });
  // its working copy goes too, or a later template given the same name would open it and be saved over
  for (const p of await listProjects()) if (p.templateDraft === id) await closeTemplateDraft(p.id, share).catch(() => {});
  if (share) await shareTemplate(id, null);
}

/**
 * Add the template's files the project doesn't have yet, except its main file (templateMain);
 * the user's own files are never replaced.
 */
export async function copyTemplateIntoProject(templateRoot, projectRoot, templateMain) {
  const changed = [];
  const skip = path.normalize(templateMain);
  const walk = async (rel = '') => {
    const dirPath = path.join(templateRoot, rel);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const nextRel = path.join(rel, entry.name);
      if (nextRel === skip) continue;
      const srcPath = path.join(templateRoot, nextRel);
      const destPath = safeJoin(projectRoot, nextRel);
      if (entry.isDirectory()) {
        await ensureDir(destPath);
        await walk(nextRel);
      } else {
        // COPYFILE_EXCL: an existing file (in any letter case on APFS) or link stays as it is
        try {
          await fs.copyFile(srcPath, destPath, fs.constants.COPYFILE_EXCL);
        } catch (err) {
          if (err.code === 'EEXIST') continue;
          throw err;
        }
        changed.push(nextRel.split(path.sep).join('/'));
      }
    }
  };
  await walk('');
  return changed;
}
