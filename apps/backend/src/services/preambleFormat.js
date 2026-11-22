// A precompiled preamble for pdfLaTeX. Every pass loads the preamble's packages again, which for notes with TikZ,
// pgfplots, siunitx and biblatex is most of the pass (measured: 1.7 s a pass against 0.77 s on the Electronics notes
// template). The mylatexformat package (LPPL, in TeX Live and MiKTeX) dumps TeX's state at \begin{document} into a
// format file, and a pass given that format starts from there.
//
// A format is the preamble as it was when it was made, so it is used only while nothing it was made from has changed:
// the preamble's text, every file TeX read while making it (packages, classes, the project's own \input files, the
// engine's own format), the engine, the shell escape the project is given (trusted or not), where TeX looks for files,
// and the names of the project's own packages and classes (a new one may take a system one's place). And a format
// cannot carry everything: a colour set in the preamble, a file opened there for writing, an image put in a box.
// So before its first use it is tried once, behind the compile that asked for nothing, on a copy of the project
// taken at that moment (so an edit saved meanwhile changes nothing): one pass without it and one with it, from the
// same kept files, and it is taken only when both wrote the same pages (PDF object for object, apart from how fonts
// are numbered) and the same .aux and other kept files. One that differs is never used for that
// preamble. A pass with a format that ends in an error of pdfTeX's own is run again without it (compileService.js).
//
// Made and tried inside the compile's confinement, in a build folder of its own; Spectrum itself then copies the
// format into the document's kept files in the cache, which no confined program can write.
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { promises as fs } from 'fs';
import { ensureDir, listFilesRecursive } from '../utils/fsUtils.js';
import { compileSandbox } from './compileSandbox.js';
import { PATH_KEY, cleanBuild, findExecutable, inBackground, keptFiles, runSpawn } from './compileService.js';

// LuaTeX and XeTeX can't dump the fonts fontspec loads, so their formats fail for nearly every document
export const FORMAT_ENGINES = ['pdflatex'];
// part of every key: raised when the rules here change, so formats made under older rules are made again
const RULES = 2;
const TRIES = 2;
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const stateFile = (dir) => path.join(dir, 'state.json');
const readState = (dir) => fs.readFile(stateFile(dir), 'utf8').then(JSON.parse).catch(() => null);
const writeState = async (dir, state) => {
  await ensureDir(dir);
  await fs.writeFile(stateFile(dir), JSON.stringify(state));
};
// the project's own packages, classes and their kin, by name: one added later may be found before TeX's own
const LOCAL_TEX = /\.(?:sty|cls|cfg|def|clo|fd|ldf|bbx|cbx|lbx|dbx)$/i;

/**
 * The preamble of a main file: its text before the first \begin{document} outside a comment, or null when it has none
 * (the document begins in a file it inputs), no \documentclass, or names a format of its own on its first line.
 */
export function preambleOf(tex) {
  if (/^%&/.test(tex)) return null;
  const begin = /^(?:[^%\n\\]|\\[^\n])*?\\begin\s*\{document\}/m.exec(tex);
  if (!begin) return null;
  const preamble = tex.slice(0, begin.index + begin[0].lastIndexOf('\\begin'));
  return /\\documentclass\b/.test(preamble) ? preamble : null;
}

/**
 * What a format for this compile is made from, as one hash. files: the project's listing; env: TeX's environment;
 * shell: the shell escape option the passes are given.
 */
export async function formatKey({ preamble, mainName, shell, env, files }) {
  const engine = await findExecutable('pdflatex', env[PATH_KEY]);
  const stat = engine ? await fs.stat(engine).catch(() => null) : null;
  const local = files.filter((item) => item.type === 'file' && LOCAL_TEX.test(item.path)).map((item) => item.path).sort();
  return sha(JSON.stringify([RULES, preamble, mainName, shell, engine, stat?.size, stat?.mtimeMs, env.TEXINPUTS, local]));
}

// TeX Live on Windows can print paths with a different drive-letter case from Node's.
function relativeWithin(root, file) {
  const relative = path.relative(root, file);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : relative;
}

/** A file TeX read, as it is now: its bytes' hash inside the project, its size and time elsewhere (TeX's own tree). */
async function about(file, projectRoot) {
  if (relativeWithin(projectRoot, file) !== null) return fs.readFile(file).then(sha, () => '');
  const stat = await fs.stat(file).catch(() => null);
  return stat ? `${stat.size}:${stat.mtimeMs}` : '';
}

// MiKTeX takes a format older than its own last maintenance (an update, a package installed on first use) to be stale
// and remakes it by its name, which for one of these fails and stops the pass. So it is dated now before each use: the
// checks here have just found it current (the engine, and every file it was made from)
const current = (base) => fs.utimes(`${base}.fmt`, new Date(), new Date()).catch(() => {});

/** The format to use for this key, { file (for -fmt), log (the preamble's own log) }, or null: none, or something it was made from changed. */
export async function readyFormat({ dir, key, projectRoot }) {
  const state = await readState(dir);
  if (state?.key !== key || state.status !== 'ready') return null;
  for (const [file, was] of state.deps) if ((await about(file, projectRoot)) !== was) return null;
  await current(path.join(dir, state.base));
  return { file: path.join(dir, state.base), log: state.log };
}

/** This key's format is never used: a pass with it failed where one without it didn't. */
export const refuseFormat = ({ dir, key }) => writeState(dir, { key, status: 'refused' }).catch(() => {});

const making = new Set();
/**
 * Makes and tries a format for this key behind the compile that just ended, unless one is there, was refused, or is
 * being made. Never throws; resolves when done (the compile doesn't wait for it).
 */
export function prepareFormat(ctx) {
  if (making.has(ctx.dir)) return Promise.resolve();
  making.add(ctx.dir);
  return inBackground(() => make(ctx), ctx.env[PATH_KEY]).catch(() => {}).finally(() => making.delete(ctx.dir));
}

/** Resolves once no format is being made, for the tests. */
export const formatsSettled = async () => {
  while (making.size) await new Promise((resolve) => setTimeout(resolve, 50));
};

async function make({ dir, key, preamble, projectRoot, mainDir, mainName, base, shell, env, trusted, store, passArgs, first = [] }) {
  const state = await readState(dir);
  // (one that is ready and wasn't used is out of date: a file it was made from changed)
  if (state?.key === key && (state.status === 'refused' || (state.status === 'differs' && state.tries >= TRIES))) return;
  const buildRoot = path.join(os.tmpdir(), 'spectrum-build');
  const work = path.join(buildRoot, crypto.randomUUID());
  const [made, plain, withFormat, tmp, copy] = ['format', 'plain', 'with-format', 'tmp', 'project'].map((name) => path.join(work, name));
  for (const folder of [made, plain, withFormat, tmp]) await ensureDir(folder);
  try {
    // the project as it is now, which the format is made from and tried on: the preamble this key is for, or nothing
    await copyOf(projectRoot, copy);
    const from = path.join(copy, path.relative(projectRoot, mainDir));
    if (preambleOf(await fs.readFile(path.join(from, mainName), 'utf8').catch(() => '')) !== preamble) return;
    const box = trusted ? null : await compileSandbox({ build: work, tmp, searchPath: env[PATH_KEY], root: projectRoot });
    // the copy's folders before the project's own, wherever TeX looks
    const before = (name) => ({ [name]: [from, copy, env[name] ?? ''].join(path.delimiter) });
    const runEnv = { ...env, ...before('TEXINPUTS'), ...before('BIBINPUTS'), ...before('BSTINPUTS'), ...box?.env };
    const lines = [];
    const run = (args, log = () => {}) => runSpawn('pdflatex', args, from, log, runEnv, undefined, null, box?.profile);
    // the preamble, dumped at \begin{document}, under the document's own job name (packages name files after it).
    // (first: MiKTeX's own option to install a missing package without asking, as the compile's passes are given)
    const dump = await run([...first, '-ini', '-interaction=nonstopmode', '-file-line-error', '-recorder', shell, `-jobname=${base}`, `-output-directory=${made}`, '&pdflatex', 'mylatexformat.ltx', `./${mainName}`], (chunk) => lines.push(chunk.toString()));
    const fls = await fs.readFile(path.join(made, `${base}.fls`), 'utf8').catch(() => '');
    const wrote = [...fls.matchAll(/^OUTPUT (.*)$/gm)].map(([, file]) => path.basename(file.trim()));
    // a file opened in the preamble (an index, an image's PDF object) is open no longer in a pass that starts after it
    if (dump.code !== 0 || !wrote.includes(`${base}.fmt`) || wrote.some((name) => ![`${base}.fmt`, `${base}.log`].includes(name))) {
      return await writeState(dir, { key, status: 'refused' });
    }
    // every file TeX read for it, each as it was then: the project's by where it is in the project
    const deps = [];
    for (const read of new Set([...fls.matchAll(/^INPUT (.*)$/gm)].map(([, file]) => path.resolve(from, file.trim())))) {
      if (!path.relative(path.join(from, mainName), read) || relativeWithin(made, read) !== null) continue;
      const relative = relativeWithin(copy, read);
      deps.push(relative === null
        ? [read, await about(read, projectRoot)]
        : [path.join(projectRoot, relative), await about(read, copy)]);
    }

    // the same pass twice from the document's kept files, without the format and with it
    await current(path.join(made, base));
    for (const folder of [plain, withFormat]) {
      if (store) await fs.cp(store, folder, { recursive: true }).catch(() => {});
      await run([...first, ...passArgs(folder, folder === withFormat ? path.join(made, base) : null).args]);
    }
    const [a, b] = [await keptFiles(plain), await keptFiles(withFormat)];
    const same = a.size === b.size && [...a].every(([rel, bytes]) => b.get(rel)?.equals(bytes))
      && samePages(await fs.readFile(path.join(plain, `${base}.pdf`)).catch(() => null), await fs.readFile(path.join(withFormat, `${base}.pdf`)).catch(() => null));
    // (twice, as a page that holds the time or a random number differs between any two passes)
    if (!same) return await writeState(dir, { key, status: 'differs', tries: (state?.key === key && state.status === 'differs' ? state.tries : 0) + 1 });
    await fs.rm(dir, { recursive: true, force: true });
    await ensureDir(dir);
    await fs.copyFile(path.join(made, `${base}.fmt`), path.join(dir, `${base}.fmt`));
    // the preamble's own log, for its warnings: without the pass's banner and the dump's own lines, so the editor
    // reads it with the pass that follows it
    const log = lines.join('').replace(/^This is .*\r?\n/m, '').split(/^Beginning to dump on file/m)[0].slice(0, 100_000);
    await writeState(dir, { key, status: 'ready', base, deps, log, at: new Date().toISOString() });
  } finally {
    await fs.rm(work, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
    await cleanBuild(buildRoot, work).catch(() => {});
  }
}

// a file this size or smaller is copied; a larger one (a figure, a data set) is linked to
const COPIED_UP_TO = 2 * 1024 * 1024;
/** root's folders and files in to: small files as copies, which an edit saved later doesn't reach, the rest as links. */
async function copyOf(root, to) {
  await ensureDir(to);
  for (const item of await listFilesRecursive(root)) {
    const [source, target] = [path.join(root, item.path), path.join(to, item.path)];
    if (item.type === 'dir') await ensureDir(target);
    else if (((await fs.stat(source).catch(() => null))?.size ?? 0) > COPIED_UP_TO) await fs.symlink(source, target).catch(() => fs.copyFile(source, target));
    else await fs.copyFile(source, target).catch(() => {});
  }
}

// ─── two PDFs of pdfTeX's, compared ───

// an operator that sets a colour: g G rg RG k K, and the colour spaces' own
const COLOUR = /(?:^|[\s\]>])((?:[\d.]+\s+)(?:g|G)|(?:[\d.]+\s+){3}(?:rg|RG)|(?:[\d.]+\s+){4}(?:k|K)|\/\S+\s+(?:cs|CS)|(?:[\d.]+\s+)*(?:sc|SC|scn|SCN))(?=[\s[/]|$)/;

/**
 * A PDF's objects by number, each as text that two builds of the same pages share: streams unpacked, objects kept in
 * object streams listed on their own, lengths, dates and the file's ID left out, and each font named by the object
 * that holds it (pdfTeX numbers fonts in the order they were loaded, which a format changes). In a page's own stream the
 * colour operators that set black before any other colour is set are left out: pdfTeX writes one at the top of every
 * page once a colour package has run in that pass, and black is what a page starts with. null when the file can't be read that way.
 */
export function pdfObjects(pdf) {
  const text = pdf.toString('latin1');
  const objects = new Map();
  // the streams that are drawing (a page's, a form's), and those that are an image's, a font's or the metadata's bytes
  const drawn = new Set();
  const bytes = new Set();
  const OBJECT = /(?:^|\n)(\d+) 0 obj\n([\s\S]*?)\nendobj/g;
  for (const [, number, body] of text.matchAll(OBJECT)) {
    const at = body.indexOf('stream\n');
    if (at < 0 || !/>>\s*$/.test(body.slice(0, at))) {
      objects.set(number, body);
      continue;
    }
    const dict = body.slice(0, at);
    if (/\/Type\s*\/XRef\b/.test(dict)) continue;
    // by its stated length: the bytes may end in a line break of their own
    const length = Number(dict.match(/\/Length\s+(\d+)/)?.[1]);
    if (!Number.isFinite(length)) return null;
    let content = Buffer.from(body.slice(at + 7, at + 7 + length), 'latin1');
    if (/\/Filter\s*\/FlateDecode\b/.test(dict)) {
      try {
        content = zlib.inflateSync(content);
      } catch {
        return null;
      }
    }
    if (/\/Type\s*\/ObjStm\b/.test(dict)) {
      const first = Number(dict.match(/\/First\s+(\d+)/)?.[1]);
      const inner = content.toString('latin1');
      const index = inner.slice(0, first).trim().split(/\s+/).map(Number);
      if (!Number.isFinite(first) || index.length % 2) return null;
      for (let i = 0; i < index.length; i += 2) objects.set(String(index[i]), inner.slice(first + index[i + 1], i + 3 < index.length ? first + index[i + 3] : undefined).trim());
      continue;
    }
    (/\/Subtype\s*\/Image\b|\/Length1\b|\/Type\s*\/Metadata\b/.test(dict) ? bytes : drawn).add(number);
    objects.set(number, `${dict.replace(/\/Length\s+\d+\s*/, '')}\n${content.toString('latin1')}`);
  }
  if (!objects.size) return null;
  // /F44 30 0 R in a page's or a form's font list
  const fonts = new Map();
  for (const body of objects.values()) {
    for (const [, list] of body.matchAll(/\/Font\s*<<([^>]*)>>/g)) for (const [, name, object] of list.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) fonts.set(name, object);
  }
  const named = (body) => body.replace(/\/(F\d+)(?![\w.])/g, (whole, name) => (fonts.has(name) ? `/F@${fonts.get(name)}` : whole));
  for (const [number, body] of objects) {
    // bytes are compared as they are (a font's may hold anything that looks like a name)
    if (bytes.has(number)) continue;
    let out = named(body).replace(/\/(?:CreationDate|ModDate)\s*\(D:[^)]*\)/g, '');
    // each black set before any other colour is, a page starting black as it does
    for (let colour; drawn.has(number) && (colour = COLOUR.exec(out)); ) {
      const start = colour.index + colour[0].indexOf(colour[1]);
      if (!/^0 g 0 G(?=\s)/.test(out.slice(start))) break;
      out = out.slice(0, start) + out.slice(start + '0 g 0 G'.length).replace(/^\n/, '');
    }
    objects.set(number, out);
  }
  return objects;
}

/** Two PDFs hold the same pages: every object the same once read as pdfObjects reads them. */
export function samePages(a, b) {
  if (!a || !b) return false;
  const [one, two] = [pdfObjects(a), pdfObjects(b)];
  return !!one && !!two && one.size === two.size && [...one].every(([number, body]) => two.get(number) === body);
}
