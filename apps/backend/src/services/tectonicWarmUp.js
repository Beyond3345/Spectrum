// The built-in Tectonic downloads each TeX file a document needs the first time one asks for it, one by one: a new
// install's first compile of a template took six minutes. When Tectonic is the LaTeX Spectrum would use, this compiles
// a copy of each built-in LaTeX template once in the background, in the temp folder, so the files they need (packages,
// fonts, biblatex's styles) are in Tectonic's cache before the user's first compile, and downloads Biber, which every
// one of them needs. It runs at low priority and stops whenever a compile of the user's runs Tectonic, then carries on.
import crypto from 'crypto';
import dns from 'dns';
import os from 'os';
import path from 'path';
import { once } from 'events';
import { promises as fs } from 'fs';
import { DATA_DIR, TEMPLATE_DIR, TEMPLATE_SEED_DIR } from '../config/constants.js';
import { readJson, writeJsonAtomic } from '../utils/fsUtils.js';
import { compileFolder, findExecutable, tectonicRuns } from './compileService.js';
import { builtInTectonic, installBiber, tectonicBiber, versionOf } from './engineService.js';

// what the last warm-up did, for this Tectonic and these templates
const MARKER = path.join(DATA_DIR, 'engines', 'tectonic-warm-up.json');
// any of these on the PATH is a TeX installation, which Auto prefers to the built-in Tectonic
const TEX = ['pdflatex', 'xelatex', 'lualatex', 'latexmk'];
// Tectonic's bundle server: no answer for its name, and there's no connection to prepare anything with
const RELAY = 'relay.fullyjustified.net';

// 'preparing' while it runs, 'ready' once Tectonic's cache has what the templates need, else null
let state = null;
/** What Settings › Engines › LaTeX shows of the warm-up. */
export const warmUpState = () => state;

/** The built-in LaTeX templates, { id, root, mainFile }, as the manifest of the app's own templates lists them. */
export async function latexTemplates(dir = TEMPLATE_SEED_DIR || TEMPLATE_DIR) {
  const manifest = await readJson(path.join(dir, 'manifest.json')).catch(() => null);
  return (manifest?.templates ?? [])
    .filter((t) => /^[\w-]+$/.test(t.id ?? '') && /^[\w-]+\.tex$/i.test(t.mainFile ?? ''))
    .map((t) => ({ id: t.id, root: path.join(dir, t.id), mainFile: t.mainFile }));
}

/**
 * Warms up the built-in Tectonic's cache, once for each Tectonic version and set of templates (a marker in the data
 * folder records it). Skips when there's no built-in Tectonic, a TeX installation is on the PATH or the bundle server
 * can't be reached; a warm-up that fails is tried again at the next start. Resolves the state it left.
 */
export async function warmUpTectonic({ online = () => dns.promises.lookup(RELAY).then(() => true, () => false) } = {}) {
  const tectonic = builtInTectonic();
  if (!tectonic) return state;
  for (const name of TEX) if (await findExecutable(name)) return state;
  const templates = await latexTemplates();
  const hash = crypto.createHash('sha256');
  for (const t of templates) hash.update(t.id + '\0' + (await fs.readFile(path.join(t.root, t.mainFile)).catch(() => '')) + '\0');
  const key = { tectonic: await versionOf(tectonic), templates: hash.digest('hex') };
  const done = await readJson(MARKER).catch(() => null);
  if (done?.tectonic === key.tectonic && done?.templates === key.templates) return (state = 'ready');
  if (!templates.length || !(await online())) return state;
  state = 'preparing';
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-warm-up-'));
  try {
    // every template's bibliography is biblatex's, which Tectonic runs Biber for
    if (!tectonicBiber()) await installBiber().catch(() => {});
    let failed = 0;
    for (const t of templates) {
      const folder = path.join(scratch, t.id);
      await fs.cp(t.root, folder, { recursive: true });
      // a PDF means TeX found every file it asked for
      if (!(await compileQuietly(folder, t.mainFile)).ok) failed += 1;
    }
    if (failed) return (state = null);
    await writeJsonAtomic(MARKER, { ...key, at: new Date().toISOString() });
    return (state = 'ready');
  } finally {
    if (state === 'preparing') state = null;
    await fs.rm(scratch, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

/** One template's compile, stopped whenever a compile of the user's starts Tectonic and run again once none is left. */
async function compileQuietly(folder, mainFile) {
  for (;;) {
    while (tectonicRuns.count) await once(tectonicRuns, 'idle');
    const controller = new AbortController();
    const giveWay = () => controller.abort();
    tectonicRuns.once('start', giveWay);
    try {
      const result = await compileFolder({ root: folder, mainFile, engine: 'tectonic', warmUp: true, signal: controller.signal });
      if (!result.stopped) return result;
    } finally {
      tectonicRuns.off('start', giveWay);
    }
  }
}
