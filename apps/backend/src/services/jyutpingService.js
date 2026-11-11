// xjyutping in compiles: the package and fonts Spectrum puts on TeX's search paths, auto mode's copy of a document,
// and the preview the settings show.
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { existsSync, promises as fs, realpathSync } from 'fs';
import { CJK_FONTS_DIR, TEX_DIR } from '../config/constants.js';
import { BUNDLED_FONTS, DEFAULT_FONTS, autoAdditions, bodyInputs, cjkKind, hasChinese, jyutpingPreamble, jyutpingTransform, loadsXjyutping } from '../latex/jyutping.js';
import { escapeTexText } from '../latex/text.js';
import { ensureDir } from '../utils/fsUtils.js';
import { readProjectSettings } from './projectSettings.js';

export const XJYUTPING_FILES = ['xjyutping.sty', 'xjyutping.lua', 'xjyutping-chars.def', 'xjyutping-words.def', 'xjyutping-simp.def'];
const BUNDLED = () => path.join(TEX_DIR, 'xjyutping');
const slashed = (p) => p.split(path.sep).join('/');
const listed = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

/** The package's version, from its \ProvidesExplPackage (or an older \ProvidesPackage) line, or null. */
async function versionIn(dir) {
  const sty = await fs.readFile(path.join(dir, 'xjyutping.sty'), 'utf8').catch(() => '');
  const m = /\\Provides(?:Expl)?Package\s*\{xjyutping\}\s*(?:\{[^}]*\}\s*\{([^}]*)\}|\[\s*\S+\s+v?([\d.]+))/.exec(sty);
  return m?.[1] ?? m?.[2] ?? null;
}

/** What's wrong with a folder of the user's as xjyutping's, or null when it holds all five files. */
async function folderProblem(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder) || !(await fs.stat(folder).catch(() => null))?.isDirectory()) return 'This folder doesn’t exist.';
  const missing = XJYUTPING_FILES.filter((file) => !existsSync(path.join(folder, file)));
  return missing.length ? `This folder doesn’t have ${listed(missing)}.` : null;
}

/** The xjyutping a compile uses: the user's folder when it holds the package, else Spectrum's own. */
export async function xjyutpingSource(folder) {
  const problem = folder ? await folderProblem(folder) : null;
  if (folder && !problem) return { ok: true, version: await versionIn(folder), source: 'folder', folder, dir: folder };
  return { ok: true, version: await versionIn(BUNDLED()), source: 'bundled', dir: BUNDLED(), ...(problem && { folderProblem: problem }) };
}

/** The bundled fonts whose files are there, as the settings list them. */
export function bundledFonts() {
  return BUNDLED_FONTS.filter((font) => existsSync(path.join(CJK_FONTS_DIR, font.regular[0])))
    .map(({ id, name, nameZh, script, style, bold }) => ({ id, name, ...(nameZh && { nameZh }), script, style, bold: !!bold }));
}

/** GET /api/jyutping/info */
export async function jyutpingInfo(folder) {
  const { dir: _dir, ...source } = await xjyutpingSource(folder || undefined);
  return { ...source, fonts: bundledFonts(), defaultFont: DEFAULT_FONTS };
}

/**
 * Where a compile finds xjyutping and the bundled fonts, put before TeX's own on its search paths: tex (the user's
 * folder when it holds the package, then Spectrum's) and fonts.
 */
export async function jyutpingSearch(folder) {
  const { dir, source } = await xjyutpingSource(folder);
  return { tex: source === 'folder' ? [dir, BUNDLED()] : [dir], fonts: CJK_FONTS_DIR };
}

/**
 * How a document uses xjyutping, or null when it doesn't: { auto, lua }, with auto mode's settings and the files its
 * body includes. Auto mode is the project's (options.jyutping in its place) and applies to a document that holds
 * Chinese and doesn't load xjyutping itself.
 */
export async function jyutpingDocument(projectRoot, absMain, options = {}) {
  const tex = await fs.readFile(absMain, 'utf8').catch(() => '');
  const lua = ['luatexja', 'luatexja-fontspec'].includes(cjkKind(tex));
  if (loadsXjyutping(tex)) return { auto: false, lua };
  const setting = options.jyutping !== undefined ? options.jyutping : options.scratch ? null : (await readProjectSettings(projectRoot)).jyutping;
  if (setting?.mode !== 'auto') return null;
  const files = await bodyFiles(projectRoot, absMain, tex);
  if (![tex, ...files.values()].some(hasChinese)) return null;
  return { auto: true, lua, setting, tex, files };
}

// ponytail: a cap on the files a body includes, which a project with thousands of chapters would pass
const MAX_BODY_FILES = 500;

/** The project's .tex files the body includes, and those they include, by absolute path, with their text. */
async function bodyFiles(projectRoot, absMain, tex) {
  const files = new Map();
  const queue = bodyInputs(tex);
  const inProject = (abs) => {
    const rel = path.relative(projectRoot, abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  while (queue.length && files.size < MAX_BODY_FILES) {
    const { file } = queue.shift();
    // TeX finds it from the main file's folder (where it runs), then from the project's
    const names = /\.tex$/i.test(file) ? [file] : [`${file}.tex`, file];
    let found = null;
    for (const base of [path.dirname(absMain), projectRoot]) {
      for (const name of names) {
        const abs = path.resolve(base, name);
        if (!found && /\.tex$/i.test(abs) && inProject(abs) && abs !== absMain && (await fs.stat(abs).catch(() => null))?.isFile()) found = abs;
      }
    }
    if (!found || files.has(found)) continue;
    const text = await fs.readFile(found, 'utf8').catch(() => '');
    files.set(found, text);
    queue.push(...bodyInputs(text));
  }
  return files;
}

/**
 * Auto mode's copy: the main file and the files its body includes, each wrapped in jyutpingscope with its lines where
 * they were, at their paths in the project under a folder of its own in base. { root, main }; remove root afterwards.
 */
export async function writeAutoCopy(projectRoot, absMain, { tex, files, setting }, engine, base) {
  await ensureDir(base);
  // without 8.3 names (RUNNER~1), whose ~ TeX would read as a space
  const root = realpathSync.native(await fs.mkdtemp(path.join(base, 'jyutping-')));
  const write = async (abs, text) => {
    const dest = path.join(root, path.relative(projectRoot, abs));
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, text);
    return dest;
  };
  const cjkFont = setting.cjkFont || '';
  const additions = autoAdditions(tex, { options: setting.options, cjkFont, engine, fontDir: cjkFont.startsWith('bundled:') || !cjkFont ? slashed(CJK_FONTS_DIR) : null });
  const main = await write(absMain, jyutpingTransform(tex, { role: 'main', additions }));
  for (const [abs, text] of files) await write(abs, jyutpingTransform(text, { role: 'body' }));
  return { root, main };
}

/**
 * A compile's log with the auto-mode copy's paths (under from) as the project's (to). TeX breaks its lines at 79
 * characters, which a path can span: such a line is joined, changed and broken again; every other line is left as it is.
 */
export function projectPaths(log, from, to) {
  if (!log || !from) return log;
  if (log.includes('\r\n')) return projectPaths(log.replace(/\r\n/g, '\n'), from, to).replace(/\n/g, '\r\n');
  const [old, now] = [slashed(from), slashed(to)];
  // and where TeX cut its start off (<*> ...ab12/jyutping/jyutping-x1Y2z3/main.tex)
  const cut = new RegExp(`\\.\\.\\.\\S*?${path.basename(old).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'g');
  const out = [];
  let group = [];
  const flush = () => {
    const whole = group.join('');
    const changed = whole.split(old).join(now).replace(cut, `${now}/`);
    if (changed !== whole) {
      for (let i = 0; i < changed.length || i === 0; i += 79) out.push(changed.slice(i, i + 79));
    } else out.push(...group);
    group = [];
  };
  for (const line of log.split('\n')) {
    group.push(line);
    if (line.length !== 79) flush();
  }
  if (group.length) flush();
  return out.join('\n');
}

// ─── Preview ───

const MAX_PREVIEW_TEXT = 500;
const previews = new Map();
// ponytail: one preview compiles at a time, the last 20 kept in memory; a queue per user if previews ever pile up
let previewQueue = Promise.resolve();

/** The preview's document: text (escaped) in a jyutpingscope, with the preamble the editor would write. */
export function previewDocument({ text, options, cjkFont, engine }) {
  const body = String(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').split(/\r?\n/).map(escapeTexText).join('\n');
  const doc = ['\\documentclass[varwidth=14cm,border=6pt]{standalone}', '\\begin{document}', '\\begin{jyutpingscope}', body, '\\end{jyutpingscope}', '\\end{document}', ''].join('\n');
  return jyutpingPreamble(doc, { options, cjkFont, engine }).text;
}

/**
 * A preview of text with the options and font, compiled by compile (compileFolder) in a folder of its own: { ok, pdf
 * (a Buffer) } or { ok: false, error, log }. The same inputs give the PDF made last time.
 */
export async function jyutpingPreview({ text, options = {}, cjkFont = '', engine = 'auto', folder, texFolder }, compile) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Type some Chinese to preview.' };
  if (text.length > MAX_PREVIEW_TEXT) return { ok: false, error: `The preview takes up to ${MAX_PREVIEW_TEXT} characters.` };
  const source = await xjyutpingSource(folder);
  const key = crypto.createHash('sha256').update(JSON.stringify([text, options, cjkFont, engine, source.dir, source.version, texFolder ?? ''])).digest('hex');
  const run = previewQueue.then(async () => {
    if (previews.has(key)) return previews.get(key);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-jyutping-'));
    try {
      await fs.writeFile(path.join(dir, 'preview.tex'), previewDocument({ text, options, cjkFont, engine }));
      const result = await compile({ root: dir, mainFile: 'preview.tex', engine: engine === 'lualatex' || engine === 'xelatex' ? engine : 'auto', texFolder, xjyutpingFolder: folder });
      // a PDF made past an error (a font that wasn't found) isn't a preview
      const out = result.ok && result.pdf && !result.status ? { ok: true, pdf: Buffer.from(result.pdf, 'base64') } : { ok: false, error: result.error || 'The preview didn’t compile.', log: result.log ?? '' };
      if (out.ok) {
        previews.set(key, out);
        if (previews.size > 20) previews.delete(previews.keys().next().value);
      }
      return out;
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
  previewQueue = run.catch(() => {});
  return run;
}
