import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DATA_DIR } from '../config/constants.js';
import { copyDir, ensureDir, writeFileAtomic } from '../utils/fsUtils.js';
import { BUILT_IN_TYPST_VERSION, builtInTypst } from './engineService.js';
import { createProject, httpError } from './projectService.js';

const execFileAsync = promisify(execFile);

// Typst Universe: the package index, kept in the data folder (with the date it was fetched) for working offline
const INDEX_URL = process.env.SPECTRUM_UNIVERSE_INDEX || 'https://packages.typst.org/preview/index.json';
const INDEX_FILE = path.join(DATA_DIR, 'typst', 'universe-index.json');
const DAY = 24 * 60 * 60 * 1000;
// where compileTypst keeps @preview packages, so a template's own package is there for its first compile
const PACKAGE_CACHE = path.join(DATA_DIR, 'typst', 'packages');
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
// licences that ask no more of a project than MIT does
const PERMISSIVE = new Set(['MIT', 'MIT-0', '0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0', 'Zlib', 'BSL-1.0']);

const newer = (a, b) => a.localeCompare(b, undefined, { numeric: true }) > 0;

/**
 * Whether an SPDX licence expression lets a project made from it stay MIT: one of its OR choices made of permissive
 * licences only. ponytail: brackets are dropped, not parsed; fine for the index's expressions, which nest none.
 */
export function mitCompatible(expression) {
  return String(expression || '')
    .replace(/[()]/g, ' ')
    .split(/\s+OR\s+/)
    .some((choice) => choice.split(/\s+AND\s+/).every((id) => PERMISSIVE.has(id.trim())));
}

/** The templates in an index: the newest version of each that Typst typstVersion can compile, by name. */
export function universeTemplates(index, typstVersion = BUILT_IN_TYPST_VERSION) {
  const latest = new Map();
  for (const p of Array.isArray(index) ? index : []) {
    if (!p?.template || !NAME.test(p.name || '') || !VERSION.test(p.version || '')) continue;
    if (p.compiler && newer(p.compiler, typstVersion)) continue;
    const had = latest.get(p.name);
    if (!had || newer(p.version, had.version)) latest.set(p.name, p);
  }
  return [...latest.values()]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((p) => ({
      name: p.name,
      version: p.version,
      description: p.description || '',
      license: p.license || '',
      mitCompatible: mitCompatible(p.license),
      authors: (p.authors || []).map((a) => String(a).replace(/\s*<[^>]*>/, '')),
      keywords: [...(p.keywords || []), ...(p.categories || [])],
      repository: p.repository || p.homepage || '',
      entrypoint: p.template.entrypoint || ''
    }));
}

let fetching = null;

/**
 * The package index: the copy in the data folder while it is less than a day old, else a fresh one, else (offline)
 * the old copy. offline: what came back is the old copy; fetchedAt: when it was fetched.
 */
export async function universeIndex() {
  const cached = await fs.readFile(INDEX_FILE, 'utf8').then(JSON.parse).catch(() => null);
  if (cached && Date.now() - cached.fetchedAt < DAY) return { ...cached, offline: false };
  fetching ||= (async () => {
    const res = await fetch(INDEX_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Typst Universe answered ${res.status}.`);
    const packages = await res.json();
    if (!Array.isArray(packages)) throw new Error('Typst Universe sent something that isn’t its package index.');
    const fresh = { fetchedAt: Date.now(), packages };
    await ensureDir(path.dirname(INDEX_FILE));
    await writeFileAtomic(INDEX_FILE, JSON.stringify(fresh));
    return fresh;
  })().finally(() => (fetching = null));
  try {
    return { ...(await fetching), offline: false };
  } catch (err) {
    if (cached) return { ...cached, offline: true };
    throw httpError(`Couldn’t reach Typst Universe (${err.message}). Connect to the internet and try again.`, 503);
  }
}

/**
 * A new project from a Universe template, as `typst init @preview/name:version` makes one: Typst downloads only
 * that package into Spectrum's cache and copies its template folder; the template's entrypoint is the main file.
 * The packages the document imports download when it first compiles.
 */
export async function createUniverseProject({ name: projectName, template, version, parentDir }) {
  if (!NAME.test(String(template || '')) || !VERSION.test(String(version || ''))) throw httpError('That isn’t a Typst Universe template.', 400);
  const typst = builtInTypst();
  if (!typst) throw httpError('Typst isn’t available in this copy of Spectrum.', 500);
  const { packages } = await universeIndex();
  const entry = packages.find((p) => p.name === template && p.version === version && p.template);
  if (!entry) throw httpError(`${template} ${version} isn’t a template in Typst Universe.`, 404);
  // typst init wants a folder that isn't there yet, and createProject makes the project's
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-universe-'));
  try {
    const out = path.join(scratch, 'project');
    try {
      await execFileAsync(typst, ['init', `@preview/${template}:${version}`, out], {
        timeout: 120_000,
        windowsHide: true,
        env: { ...process.env, TYPST_PACKAGE_CACHE_PATH: PACKAGE_CACHE }
      });
    } catch (err) {
      const said = String(err.stderr || '').match(/^error: (.*)$/m)?.[1] || err.message;
      throw httpError(/download/i.test(said) ? `Couldn’t download ${template} ${version}. Connect to the internet and try again.` : `Typst couldn’t make the project: ${said}`, 502);
    }
    const main = entry.template.entrypoint;
    const hasMain = !!main && (await fs.access(path.join(out, main)).then(() => true, () => false));
    return await createProject({
      name: projectName || template,
      parentDir,
      meta: hasMain ? { mainFile: main } : {},
      populate: (root) => copyDir(out, root)
    });
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}
