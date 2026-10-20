import { promises as fs } from 'fs';
import path from 'path';
import { safeJoin } from '../../../utils/pathUtils.js';
import { ensureDir, listFilesRecursive, writeNewFile } from '../../../utils/fsUtils.js';
import { withBiblatexResources } from '../../../utils/texUtils.js';
import { writeFileWithSnapshot } from '../utils.js';

/**
 * Check if a file exists at the given absolute path.
 */
async function fileExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

const GRAPHICS_EXTS = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps'];

/**
 * The file a \includegraphics/\bibliography reference means, the way LaTeX finds it: as
 * written or with a usual extension, from the main file's folder, the project root, or a
 * \graphicspath folder. Returns { from, to }: where it is in the source, and where the
 * reference finds it in the new project (whose main file sits at its root, without the
 * source's \graphicspath), or null.
 */
async function findAsset(srcRoot, mainDir, ref, exts, extraDirs = []) {
  const dirs = [...new Set([mainDir, '', ...extraDirs.flatMap((d) => [path.join(mainDir, d), d])])];
  for (const dir of dirs) {
    for (const ext of exts) {
      const from = path.normalize(path.join(dir, ref + ext));
      try {
        if (!(await fs.stat(safeJoin(srcRoot, from))).isFile()) continue;
      } catch {
        continue;
      }
      const to = path.normalize(ref + ext);
      return { from, to: to.startsWith('..') || path.isAbsolute(to) ? from : to };
    }
  }
  return null;
}

/**
 * Copy a single asset file from source to target project.
 * If target already has a file with the same name, place it under assets/source/.
 */
async function copySingleAsset(srcRoot, destRoot, relPath, wanted = relPath) {
  const srcAbs = safeJoin(srcRoot, relPath);
  if (!(await fileExists(srcAbs))) return { path: relPath, status: 'missing' };

  let destRel = wanted;
  const destAbs = safeJoin(destRoot, wanted);

  if (await fileExists(destAbs)) {
    // Conflict: place under assets/source/
    destRel = path.join('assets', 'source', wanted);
  }

  const finalAbs = await writeNewFile(safeJoin(destRoot, destRel), await fs.readFile(srcAbs));
  destRel = path.relative(destRoot, finalAbs);
  return { path: relPath, destRel, status: destRel !== wanted ? 'conflict' : 'copied' };
}

async function connectBibliographies(state, files) {
  if (!files.length) return;
  const main = state.targetMainFile || 'main.tex';
  const abs = safeJoin(state.targetProjectRoot, main);
  let tex;
  try { tex = await fs.readFile(abs, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  const names = files.map((file) => path.relative(path.dirname(main), file).split(path.sep).join('/'));
  const updated = withBiblatexResources(tex, names);
  if (updated !== tex) await writeFileWithSnapshot(state.targetProjectRoot, main, updated, state.jobId);
}

/**
 * Legacy mode: copy bib files, images, and style files from source project.
 */
async function copyAssetsLegacy(state) {
  const assets = state.sourceAssets || {};
  const results = [];
  const mainDir = path.dirname(state.sourceMainFile || '');
  const copyRef = async (ref, exts, extraDirs) => {
    const found = await findAsset(state.sourceProjectRoot, mainDir, ref, exts, extraDirs);
    const result = found
      ? await copySingleAsset(state.sourceProjectRoot, state.targetProjectRoot, found.from, found.to)
      : { path: ref, status: 'missing' };
    results.push(result);
    return result;
  };

  const bibs = [];
  for (const bib of new Set(assets.bib || [])) {
    const result = await copyRef(bib, ['']);
    if (result.destRel) bibs.push(result.destRel);
  }
  await connectBibliographies(state, bibs);
  for (const img of (assets.images || [])) await copyRef(img, GRAPHICS_EXTS, assets.graphicsPaths || []);

  for (const sty of (assets.styles || [])) {
    const destAbs = safeJoin(state.targetProjectRoot, sty);
    if (!(await fileExists(destAbs))) {
      const r = await copySingleAsset(state.sourceProjectRoot, state.targetProjectRoot, sty);
      results.push(r);
    }
  }

  const copied = results.filter(r => r.status === 'copied').length;
  const conflicts = results.filter(r => r.status === 'conflict').length;
  const missing = results.filter(r => r.status === 'missing').length;

  return {
    progressLog: `Copied ${copied + conflicts} ${copied + conflicts === 1 ? 'file' : 'files'} from the source${missing ? `; ${missing} couldn’t be found` : ''}.`,
  };
}

/**
 * PDF mode: copy the parser's images to the target project's images/ dir,
 * and optionally copy bib files from source project if available.
 */
async function copyAssetsPdf(state) {
  const images = state.sourceImages || [];
  let copiedCount = 0;

  // Copy the parser's images to target project images/
  const imagesDir = path.join(state.targetProjectRoot, 'images');
  await ensureDir(imagesDir);

  for (const img of images) {
    const destPath = path.join(imagesDir, img.name);
    if (await fileExists(img.localPath)) {
      await fs.copyFile(img.localPath, destPath);
      copiedCount++;
    }
  }

  // Copy bib files from source project if available
  let bibCount = 0;
  const bibs = [];
  if (state.sourceProjectRoot) {
    let bibCandidates = state.sourceAssets?.bib || [];
    if (!bibCandidates.length) {
      const allFiles = await listFilesRecursive(state.sourceProjectRoot);
      bibCandidates = allFiles
        .filter(f => f.type === 'file' && path.extname(f.path).toLowerCase() === '.bib')
        .map(f => f.path);
    }

    for (const bib of [...new Set(bibCandidates)]) {
      const r = await copySingleAsset(
        state.sourceProjectRoot, state.targetProjectRoot, bib
      );
      if (r.destRel) { bibCount++; bibs.push(r.destRel); }
    }
  }
  await connectBibliographies(state, bibs);

  return {
    progressLog: `Copied ${copiedCount} ${copiedCount === 1 ? 'image' : 'images'} and ${bibCount} .bib ${bibCount === 1 ? 'file' : 'files'}.`,
  };
}

/**
 * copyAssets node — dispatches to legacy or PDF mode.
 */
export async function copyAssets(state) {
  if (state.transferMode === 'pdf') {
    return copyAssetsPdf(state);
  }
  return copyAssetsLegacy(state);
}
