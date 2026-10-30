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
const BIBER_DIR = path.join(ENGINES_DIR, 'biber');
const DOWNLOAD_FAILED = 'Check the internet connection and try again.';
const CHECKSUM_FAILED = 'The download didn’t match its checksum, so it wasn’t installed.';
/** The Typst version inside Spectrum, for a compile's result or a diagram's import line. */
export const BUILT_IN_TYPST_VERSION = engineList.typst.builtIn;
/** What pandoc must be for each kind of output, and the version Settings offers. */
export const PANDOC_MINIMUM = engineList.pandoc.minimum;
export const PANDOC_DOWNLOADABLE = engineList.pandoc.version;

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

/** The Biber Spectrum downloaded for the built-in Tectonic (biber.exe on Windows), or null. */
export function tectonicBiber() {
  const file = path.join(BIBER_DIR, 'biber' + (process.platform === 'win32' ? '.exe' : ''));
  return existsSync(file) ? file : null;
}

/**
 * Where that Biber unpacks itself: it is a packed Perl program, which fills this folder the first time it runs (at
 * install). Where it can't write here (an agent's isolation, which only reads the engines) it unpacks into the temp
 * folder instead. ponytail: about 250 MB again in each agent's home that runs it
 */
export const biberCache = () => path.join(BIBER_DIR, 'cache');

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
    },
    // the release that matches the biblatex in Tectonic's bundle, and its download's size here (none: no build for it)
    biber: { installed: tectonicBiber() ? list.biber.version : null, downloadable: list.biber.version, size: assetFor(list.biber.assets)?.[2] ?? null }
  };
}

const downloadBase = (home = 'https://github.com') => (process.env.SPECTRUM_ENGINE_DOWNLOAD_BASE || home).replace(/\/$/, '');

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
 * Keeps only this Mac's slice of a universal executable (Biber's would thin itself with an option today's lipo no longer
 * has); any other file stays as it is.
 */
async function thinned(file) {
  const data = await fs.readFile(file);
  if (WINDOWS || data.length < 8 || data.readUInt32BE(0) !== 0xcafebabe) return;
  const wanted = process.arch === 'arm64' ? 0x0100000c : 0x01000007;
  for (let i = 0, at = 8; i < data.readUInt32BE(4) && at + 20 <= data.length; i += 1, at += 20) {
    if (data.readUInt32BE(at) !== wanted) continue;
    const offset = data.readUInt32BE(at + 8);
    const size = data.readUInt32BE(at + 12);
    if (offset + size > data.length) break;
    await fs.writeFile(file, data.subarray(offset, offset + size));
    return;
  }
  throw new Error('no slice for this Mac');
}

/**
 * Downloads one engine's archive from the release folder, checks it against its SHA-256, extracts its executable into
 * destination and returns its path. Nothing is left behind when any step fails.
 */
async function install(name, version, entry, destination, executable, release) {
  const asset = assetFor(entry.assets);
  if (!asset) throw httpError(name + ' ' + version + ' isn’t available for this computer.', 400);
  const [file, expected] = asset;
  const url = release + '/' + file;
  const tmpRoot = path.join(ENGINES_DIR, 'tmp');
  await ensureDir(tmpRoot);
  const id = crypto.randomUUID();
  const part = path.join(tmpRoot, id + '.part');
  const folder = path.join(tmpRoot, id);
  // a download that stalls (no data for a while) is stopped, and one that stops or drops is a failed download
  const controller = new AbortController();
  let idle;
  const stall = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), Number(process.env.SPECTRUM_DOWNLOAD_IDLE_MS) || 60_000);
  };
  try {
    try {
      stall();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const body = Readable.fromWeb(res.body);
      body.on('data', stall);
      await pipeline(body, createWriteStream(part));
    } catch {
      throw httpError('Couldn’t download ' + name + ' ' + version + '. ' + DOWNLOAD_FAILED, 502);
    } finally {
      clearTimeout(idle);
    }
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
    await thinned(real).catch(() => {
      throw httpError('The ' + name + ' download has no build for this Mac, so it wasn’t installed.', 502);
    });
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
const biberLock = serialiser();

/** Installs a Typst version from engines.json, one at a time. */
export function installTypst(version) {
  return typstLock(async () => {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw httpError('Choose a Typst version to install.', 400);
    const entry = list.typst.versions.find((release) => release.version === version);
    if (!entry) throw httpError('Typst ' + version + ' isn’t available for this computer.', 400);
    return install('Typst', version, entry, path.join(TYPST_DIR, version), 'typst', downloadBase() + '/typst/typst/releases/download/v' + version);
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
    return install('pandoc', version, { assets }, path.dirname(PANDOC_PATH), 'pandoc', downloadBase() + '/jgm/pandoc/releases/download/' + version);
  });
}

/** Downloads the Biber for the built-in Tectonic from the Biber project's own files, one download at a time. */
export function installBiber() {
  return biberLock(async () => {
    // one asked for while another ran finds it there
    const installed = tectonicBiber();
    if (installed) return installed;
    const { version, assets } = list.biber;
    const release = downloadBase('https://downloads.sourceforge.net') + '/project/biblatex-biber/biblatex-biber/' + version + '/binaries';
    const target = await install('Biber', version, { assets }, BIBER_DIR, 'biber', release);
    // it unpacks itself now rather than in the first compile (into the temp folder unless this one is there already);
    // one that can't run says so in the compile's log
    await ensureDir(biberCache());
    await execFileAsync(target, ['--version'], { env: { ...process.env, PAR_GLOBAL_TMPDIR: biberCache() }, timeout: 5 * 60 * 1000, windowsHide: true }).catch(() => {});
    return target;
  });
}

/** Removes the downloaded Biber and what it unpacked. */
export function removeBiber() {
  return biberLock(() => fs.rm(BIBER_DIR, { recursive: true, force: true, maxRetries: 5 }));
}
