import { promises as fs } from 'fs';
import path from 'path';
import { TEMPLATE_DIR, TEMPLATE_MANIFEST, TEMPLATE_SEED_DIR } from '../config/constants.js';
import { copyDir, ensureDir, readJson, writeJson } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';

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
 * user doesn't have yet and merge the bundled manifest entries.
 */
export async function seedTemplates() {
  if (!TEMPLATE_SEED_DIR || path.resolve(TEMPLATE_SEED_DIR) === path.resolve(TEMPLATE_DIR)) return;
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
  const known = new Set((current.templates || []).map((t) => t.id));
  const missing = (seed.templates || []).filter((t) => !known.has(t.id));
  if (missing.length || !current.categories) {
    await writeJson(TEMPLATE_MANIFEST, {
      templates: [...(current.templates || []), ...missing],
      categories: current.categories || seed.categories || []
    });
  }
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
      if (entry.name === 'node_modules') continue;
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
  return { templates: manifestTemplates, categories };
}

export async function addTemplateToManifest(entry) {
  let data = { templates: [], categories: [] };
  try {
    data = await readJson(TEMPLATE_MANIFEST);
  } catch { /* ignore */ }
  const templates = Array.isArray(data.templates) ? data.templates : [];
  const exists = templates.findIndex(t => t.id === entry.id);
  if (exists >= 0) {
    templates[exists] = { ...templates[exists], ...entry };
  } else {
    templates.push(entry);
  }
  data.templates = templates;
  await writeJson(TEMPLATE_MANIFEST, data);
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
        changed.push(nextRel);
      }
    }
  };
  await walk('');
  return changed;
}
