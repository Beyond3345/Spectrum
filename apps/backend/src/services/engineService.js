import crypto from 'crypto';
import { promises as fs, createWriteStream, existsSync, copyFileSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DATA_DIR, REPO_ROOT } from '../config/constants.js';
import { ensureDir, listFilesRecursive, renameOver } from '../utils/fsUtils.js';
import { findExecutable } from './compileService.js';
import { httpError, serialiser } from './projectService.js';
import engineList from '../data/engines.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
const WINDOWS = process.platform === 'win32';
const EXE = WINDOWS ? '.exe' : '';
const ARCH = WINDOWS ? 'win-x64' : process.arch === 'arm64' ? 'arm64' : 'x64';
const TRIPLE = WINDOWS ? 'x86_64-pc-windows-msvc' : process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
const ENGINES_DIR = path.join(DATA_DIR, 'engines');
const TYPST_DIR = path.join(ENGINES_DIR, 'typst');
const PANDOC_PATH = path.join(ENGINES_DIR, 'pandoc', 'pandoc' + EXE);
const DOWNLOAD_FAILED = 'Check the internet connection and try again.';
const CHECKSUM_FAILED = 'The download didn’t match its checksum, so it wasn’t installed.';

// Tests point the list at an engine they build and serve themselves
let list = engineList;
/** Use another list of versions and checksums, as engines.json has, for this process (tests). */
export function useEngineList(next) {
  list = next;
}

/** The Typst release's own executable beside Spectrum, in the repo's binaries for development, or null. */
export function builtInTypst() {
  return builtIn('SPECTRUM_TYPST', 'typst');
}

/** The Tectonic release's own executable beside Spectrum, in the repo's binaries for development, or null. */
export function builtInTectonic() {
  return builtIn('SPECTRUM_TECTONIC', 'tectonic');
}

function builtIn(variable, name) {
  const beside = process.env[variable];
  if (beside && existsSync(beside)) return beside;
  const dev = path.join(REPO_ROOT, 'src-tauri', 'binaries', name + '-' + TRIPLE + EXE);
  return existsSync(dev) ? dev : null;
}

/** The executable of a Typst version: the built-in one for '' or its version, an installed one, or null. */
export function typstFor(version) {
  if (!version || version === list.typst.builtIn) return builtInTypst();
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  const installed = path.join(TYPST_DIR, version, 'typst' + EXE);
  return existsSync(installed) ? installed : null;
}

/** The pandoc Spectrum downloaded, else one on the PATH, else null. */
export async function pandocPath() {
  if (existsSync(PANDOC_PATH)) return PANDOC_PATH;
  return findExecutable('pandoc');
}

/** The version an executable prints for --version, such as 3.12.1, or null when it can't run. */
export async function versionOf(executable) {
  try {
    const { stdout } = await execFileAsync(executable, ['--version'], { timeout: 20_000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return stdout.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? null;
  } catch {
    return null;
  }
}

const compareVersions = (a, b) => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) - (right[i] || 0);
  }
  return 0;
};

/** The versions of Typst installed under the data folder, oldest first. */
async function installedTypst() {
  const entries = await fs.readdir(TYPST_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name) && existsSync(path.join(TYPST_DIR, entry.name, 'typst' + EXE)))
    .map((entry) => entry.name)
    .sort(compareVersions);
}

/** What GET /api/engines returns: the built-in and found engines, the Typst versions and pandoc's state. */
export async function listEngines() {
  const found = async (name) => {
    const executable = await findExecutable(name);
    return executable ? { path: executable, version: await versionOf(executable) } : null;
  };
  const pandoc = await pandocPath();
  return {
    tectonic: { builtIn: builtInTectonic() ? list.tectonic.version : null, system: await found('tectonic') },
    typst: {
      builtIn: builtInTypst() ? list.typst.builtIn : null,
      system: await found('typst'),
      installed: await installedTypst(),
      available: list.typst.versions
        .filter(({ version }) => version !== list.typst.builtIn)
        .map(({ version, released, assets }) => ({ version, released, size: assets[ARCH]?.[2] }))
    },
    pandoc: {
      found: pandoc ? { path: pandoc, version: await versionOf(pandoc), fromDownload: pandoc === PANDOC_PATH } : null,
      minimum: list.pandoc.minimum,
      downloadable: list.pandoc.version
    }
  };
}

const downloadBase = () => (process.env.SPECTRUM_ENGINE_DOWNLOAD_BASE || 'https://github.com').replace(/\/$/, '');

/** The archive for this computer's architecture from an engine's assets, or undefined. */
const assetFor = (assets) => assets?.[ARCH];

/** The platform's tar: Windows' own reads zips as well as tarballs. */
const tar = () => (WINDOWS ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar');

/** The one executable called name in an extracted folder, or null. */
async function executableIn(folder, name) {
  const wanted = name + EXE;
  const found = (await listFilesRecursive(folder)).find((item) => item.type === 'file' && path.basename(item.path).toLowerCase() === wanted.toLowerCase());
  return found ? path.join(folder, found.path) : null;
}

/**
 * Downloads one engine's archive, checks it against its SHA-256, extracts its executable into destination and returns
 * its path. Nothing is left behind when any step fails.
 */
async function install(name, version, entry, destination, executable, repository, tag) {
  const asset = assetFor(entry.assets);
  if (!asset) throw httpError(name + ' ' + version + ' isn’t available for this computer.', 400);
  const [file, expected] = asset;
  const url = downloadBase() + '/' + repository + '/releases/download/' + tag + '/' + file;
  const tmpRoot = path.join(ENGINES_DIR, 'tmp');
  await ensureDir(tmpRoot);
  const id = crypto.randomUUID();
  const part = path.join(tmpRoot, id + '.part');
  const folder = path.join(tmpRoot, id);
  try {
    let res;
    try {
      res = await fetch(url);
    } catch {
      throw httpError('Couldn’t download ' + name + ' ' + version + '. ' + DOWNLOAD_FAILED, 502);
    }
    if (!res.ok || !res.body) throw httpError('Couldn’t download ' + name + ' ' + version + '. ' + DOWNLOAD_FAILED, 502);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    const digest = crypto.createHash('sha256').update(await fs.readFile(part)).digest('hex');
    if (digest !== expected) throw httpError(CHECKSUM_FAILED, 502);
    await ensureDir(folder);
    try {
      await execFileAsync(tar(), ['-xf', part, '-C', folder], { timeout: 5 * 60 * 1000, windowsHide: true });
    } catch {
      throw httpError('The ' + name + ' download couldn’t be read, so it wasn’t installed.', 502);
    }
    const found = await executableIn(folder, executable);
    if (!found) throw httpError('The ' + name + ' download didn’t hold ' + executable + EXE + ', so it wasn’t installed.', 502);
    // a link in the archive could point anywhere on disk
    const inside = await fs.realpath(folder);
    const real = await fs.realpath(found);
    if (!real.startsWith(inside + path.sep)) throw httpError('The ' + name + ' download didn’t hold ' + executable + EXE + ', so it wasn’t installed.', 502);
    await ensureDir(destination);
    const target = path.join(destination, executable + EXE);
    await renameOver(found, target);
    await fs.chmod(target, 0o755);
    if (name === 'Typst') copyRuntime(target);
    return target;
  } finally {
    await fs.rm(part, { force: true }).catch(() => {});
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    await fs.rmdir(tmpRoot).catch(() => {});
  }
}

/** Windows: Typst's builds load the Visual C++ runtime, which Spectrum carries and puts beside each typst.exe. */
function copyRuntime(executable) {
  const from = process.env.SPECTRUM_ENGINES_RESOURCE_DIR && path.join(process.env.SPECTRUM_ENGINES_RESOURCE_DIR, 'vcruntime140.dll');
  if (!WINDOWS || !from || !existsSync(from)) return;
  try {
    copyFileSync(from, path.join(path.dirname(executable), 'vcruntime140.dll'));
  } catch {
    // the install has already said what it could
  }
}

const typstLock = serialiser();
const pandocLock = serialiser();

/** Installs a Typst version from engines.json, one at a time. */
export function installTypst(version) {
  return typstLock(async () => {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw httpError('Choose a Typst version to install.', 400);
    const entry = list.typst.versions.find((release) => release.version === version);
    if (!entry) throw httpError('Typst ' + version + ' isn’t available for this computer.', 400);
    return install('Typst', version, entry, path.join(TYPST_DIR, version), 'typst', 'typst/typst', 'v' + version);
  });
}

/** Removes an installed Typst version; the built-in one stays. */
export function removeTypst(version) {
  return typstLock(async () => {
    if (version === list.typst.builtIn) throw httpError('The built-in Typst can’t be removed.', 400);
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw httpError('Choose a Typst version to remove.', 400);
    await fs.rm(path.join(TYPST_DIR, version), { recursive: true, force: true, maxRetries: 5 });
  });
}

/** Downloads pandoc, one download at a time. */
export function installPandoc() {
  return pandocLock(async () => {
    const { version, assets } = list.pandoc;
    return install('pandoc', version, { assets }, path.dirname(PANDOC_PATH), 'pandoc', 'jgm/pandoc', version);
  });
}
