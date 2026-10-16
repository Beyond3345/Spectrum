import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, TEMPLATE_DIR, TEMPLATE_MANIFEST, TEMPLATE_SEED_DIR } from '../config/constants.js';
import { HIDDEN_ENTRIES, copyDir, ensureDir, listFilesRecursive, readJson, renameOver, writeJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { isDocumentFile } from '../utils/texUtils.js';
import { createProject, detectMainFile, getProjectRoot, httpError, listProjects, readMeta, serialiser, unregister, updateMeta } from './projectService.js';

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
 * user doesn't have yet, refresh the bundled ones' manifest entries and the categories,
 * and keep the user's uploads (author "User") and the bundled ones they edited (edited) as they are.
 * ponytail: a bundled template's files are copied once, so later edits to them reach new
 * installs only; copy changed files over too (never into an edited one) if a fix ever has to reach everyone.
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
  } catch {
    await writeJson(TEMPLATE_MANIFEST, seed);
    return;
  }
  const shipped = new Map((seed.templates || []).map((t) => [t.id, t]));
  const kept = (current.templates || []).map((t) => (shipped.has(t.id) && t.author !== 'User' && !t.edited ? shipped.get(t.id) : t));
  const known = new Set(kept.map((t) => t.id));
  const next = {
    templates: [...kept, ...(seed.templates || []).filter((t) => !known.has(t.id))],
    categories: seed.categories || current.categories || []
  };
  if (JSON.stringify(next) !== JSON.stringify(current)) await writeJson(TEMPLATE_MANIFEST, next);
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
    const data = await readJson(TEMPLATE_MANIFEST).catch(() => ({ templates: [], categories: [] }));
    data.templates = fn(Array.isArray(data.templates) ? data.templates : []);
    await writeJsonAtomic(TEMPLATE_MANIFEST, data);
  });
}

export function addTemplateToManifest(entry) {
  return updateManifest((templates) => {
    const i = templates.findIndex((t) => t.id === entry.id);
    return i >= 0 ? templates.with(i, { ...templates[i], ...entry }) : [...templates, entry];
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
async function copyTemplateFiles(src, dest) {
  const compiled = new Set();
  for (const item of await listFilesRecursive(src)) {
    if (item.type === 'file' && /\.tex$/i.test(item.path) && (await isDocumentFile(path.join(src, item.path)))) {
      compiled.add(path.join(src, item.path.replace(/\.tex$/i, '.pdf')));
    }
  }
  await fs.cp(src, dest, {
    recursive: true,
    filter: async (p) =>
      p === src || (!HIDDEN_ENTRIES.has(path.basename(p)) && !BUILD_LEFTOVER.test(p) && !compiled.has(p) && !(await fs.lstat(p)).isSymbolicLink())
  });
}

/**
 * Replace a template's folder with one fill(folder) builds beside it, so the template is always the
 * old copy or the new one, never part of each.
 * ponytail: a crash between the two renames leaves the old copy as .<id>-…-old; put it back at startup if that bites
 */
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
  await fs.rm(old, { recursive: true, force: true, maxRetries: 5 });
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
    populate: (root) => copyTemplateFiles(templatePath(id), root)
  });
  return { project, existing: false };
}

/** Put a draft's files in its template's place. One Spectrum ships is marked edited, which seeding leaves alone. */
export async function saveTemplateDraft(projectId) {
  const { root, meta } = await draftOf(projectId);
  const template = await findTemplate(meta.templateDraft).catch(() => {
    throw httpError(`The “${meta.name}” template doesn’t exist any more. Save it as a new template instead.`, 404);
  });
  await replaceTemplateFolder(template.id, (dest) => copyTemplateFiles(root, dest));
  const edited = template.author !== 'User' && !!(await shippedEntry(template.id));
  const entry = { ...template, mainFile: await mainFileOf(root, meta), ...(edited && { edited: true }) };
  await addTemplateToManifest(entry);
  await updateMeta(root, (m) => ({ ...m, templateSavedAt: new Date().toISOString() }));
  return entry;
}

/** A folder for a new template, named after it (lab-report-2 when lab-report is taken); returns its id. */
async function newTemplateFolder(label) {
  // ASCII letters, digits and dashes make a folder name on macOS and Windows, except CON, AUX and the
  // like, which are devices on Windows
  let base = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'template';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(base)) base += '-template';
  const taken = new Set((await readTemplateManifest()).templates.map((t) => t.id.toLowerCase()));
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
  try {
    await copyTemplateFiles(root, templatePath(id));
  } catch (err) {
    await fs.rm(templatePath(id), { recursive: true, force: true });
    throw err;
  }
  const entry = {
    id,
    label: name,
    mainFile: await mainFileOf(root, meta),
    category,
    description: String(description || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    tags: [],
    author: 'User',
    featured: false
  };
  await addTemplateToManifest(entry);
  if (meta.templateDraft) await updateMeta(root, (m) => ({ ...m, name, templateDraft: id, templateSavedAt: new Date().toISOString() }));
  return entry;
}

/** Done with a draft: forget it and delete its folder. Changes not saved to the template need discard. */
export async function closeTemplateDraft(projectId, discard) {
  const { root, meta } = await draftOf(projectId);
  if (!discard && meta.updatedAt > (meta.templateSavedAt || meta.createdAt)) {
    throw httpError('This template has changes that aren’t saved yet.', 409, 'UNSAVED');
  }
  await unregister(projectId);
  // a folder Windows still holds open is only clutter in the app's data folder
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}

/** Put back the files and manifest entry Spectrum ships for a template the user edited. */
export async function restoreTemplate(id) {
  const template = await findTemplate(id);
  const shipped = template.author !== 'User' && (await shippedEntry(id));
  if (!shipped) throw httpError(`“${template.label}” doesn’t come with Spectrum, so there’s no original to restore.`, 400);
  await replaceTemplateFolder(id, (dest) => copyDir(safeJoin(TEMPLATE_SEED_DIR, id), dest));
  await updateManifest((templates) => templates.map((t) => (t.id === id ? shipped : t)));
  return shipped;
}

/** Delete one of the user's own templates; the ones Spectrum ships can only be restored. */
export async function deleteTemplate(id) {
  const template = await findTemplate(id);
  if (template.author !== 'User') throw httpError('Only templates you made or uploaded can be deleted.', 400);
  // out of the gallery in one step, then out of the manifest and off the disk
  const gone = safeJoin(TEMPLATE_DIR, `.${id}-${crypto.randomUUID()}`);
  await renameOver(templatePath(id), gone).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
  await updateManifest((templates) => templates.filter((t) => t.id !== id));
  await fs.rm(gone, { recursive: true, force: true, maxRetries: 5 });
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
