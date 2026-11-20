import os from 'os';
import path from 'path';
import { existsSync, promises as fs } from 'fs';
import { crc32 } from 'zlib';
import { fileURLToPath } from 'url';
import { CJK_FONTS_DIR } from '../config/constants.js';
import { chineseForms } from '../language/detect.js';
import { BUNDLED_FONTS } from '../latex/jyutping.js';
import { ensureDir, listFilesRecursive } from '../utils/fsUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { cachePath } from './projectService.js';
import { readProjectSettings } from './projectSettings.js';
import { PANDOC_DOWNLOADABLE, PANDOC_MINIMUM, pandocPath, versionOf } from './engineService.js';
import { MAX_LOG_BYTES, compileDocument, findExecutable, pageColourLines, runSpawn } from './compileService.js';
import { compileTypst, typstFill } from './typstService.js';

// Markdown compiles in two steps: pandoc writes LaTeX or Typst, then that is compiled like any document. An error in
// the generated text is traced back to the .md line by matching its words, as a PDF jump finds its line.

const PANDOC_MISSING = 'Markdown needs pandoc. Download it from Settings › Engines › Markdown.';
const PANDOC_UNREADABLE = 'pandoc couldn’t read this Markdown.';
const SVG_NOTE = '\n[spectrum] SVG images need rsvg-convert (brew install librsvg) to become PDFs LaTeX can include.\n';
// a TeX error naming the generated file and its line, as -file-line-error writes it
const LOCATED_TEX = /^(?:\.\/)?(.+?\.(?:tex|sty|cls|bbl)):(\d+):\s*(.*)$/;
const SVG = /(?:!\[[^\]]*\]\([^)]*?\.svg|src=["'][^"']+?\.svg)/i;
// the APA 7 style from the CSL styles repository (CC BY-SA 3.0, see THIRD_PARTY_NOTICES.md), as the LaTeX and Typst
// templates cite in APA 7: beside the bundled backend at ../data/csl too
const APA_CSL = fileURLToPath(new URL('../data/csl/apa.csl', import.meta.url));
// Spectrum's own Lua filter for @fig:x, @tbl:x, @eq:x and @sec:x (data/pandoc/crossref.lua), run before --citeproc
const CROSSREF = fileURLToPath(new URL('../data/pandoc/crossref.lua', import.meta.url));
const crossrefArgs = () => (existsSync(CROSSREF) ? ['--lua-filter=' + CROSSREF] : []);
// a ```mermaid block's picture, drawn by the editor with the composer's Mermaid, in the project's hidden folder (which
// Typst, rooted at the project, reads too): <sha1 of its code, whitespace collapsed>.png, which crossref.lua looks for
const MERMAID_DIR = ['.spectrum', 'mermaid'];
const mermaidEnv = (projectRoot) => ({ ...process.env, SPECTRUM_MERMAID_DIR: path.join(projectRoot, ...MERMAID_DIR) });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HANGUL = /\p{Script=Hangul}/u;
// a front matter field with a value (an empty one is read as [])
const named = (value) => [value].flat().some(Boolean);


/** The YAML front matter (between a first --- and the next --- or ...), scalar and list fields, and the text after it. */
export function parseFrontMatter(source) {
  const lines = String(source || '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { meta: {}, body: lines.join('\n') };
  const end = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end === -1) return { meta: {}, body: lines.join('\n') };
  const unquote = (value) => {
    const text = String(value).trim();
    return text.length > 1 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) ? text.slice(1, -1) : text;
  };
  const meta = {};
  let field = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && field) {
      if (!Array.isArray(meta[field])) meta[field] = meta[field] ? [meta[field]] : [];
      meta[field].push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    field = pair[1];
    // a quoted value keeps its '#'; otherwise ' # …' (or a value that is only that) is a comment
    const value = /^["']/.test(pair[2].trim()) ? pair[2].trim() : pair[2].replace(/(?:^|\s)#.*$/, '').trim();
    if (!value) meta[field] = [];
    else if (value.startsWith('[') && value.endsWith(']')) meta[field] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
    else meta[field] = unquote(value);
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

/**
 * pandoc's --bibliography arguments: none when the front matter names a bibliography, which pandoc reads itself (and
 * its csl) from the .md's folder, else every .bib in the project.
 */
export async function bibliographyArgs(projectRoot, meta) {
  if ([meta.bibliography].flat().some(Boolean)) return [];
  const files = (await listFilesRecursive(projectRoot)).filter((item) => item.type === 'file' && /\.bib$/i.test(item.path)).map((item) => path.join(projectRoot, item.path));
  return files.flatMap((file) => ['--bibliography', file]);
}

/** Whether the front matter asks for slides: slides: true, yes or beamer. */
export const isSlides = (meta) => /^(?:true|yes|beamer)$/i.test(String([meta.slides].flat()[0] ?? ''));

/** pandoc's --csl: APA 7, unless the front matter names a style of its own, which pandoc then reads. */
export const cslArgs = (meta) => (named(meta.csl) || named(meta['citation-style']) || !existsSync(APA_CSL) ? [] : ['--csl', APA_CSL]);

/**
 * The bundled font for the .md's Chinese, Japanese or Korean text, or null when it has none or its front matter names
 * a font (CJKmainfont, or mainfont for all of it): Noto Serif TC for Traditional Chinese with no Simplified-only
 * character or kana (or lang: zh-Hant, zh-TW or zh-HK), else Noto Serif SC, which has the Traditional characters and
 * kana too.
 * Neither has Korean letters, which missingGlyphs then names.
 */
export function cjkFont(source, meta) {
  if (named(meta.CJKmainfont) || named(meta.mainfont) || !CJK_TEXT.test(source)) return null;
  const { simplified, traditional } = chineseForms(source);
  // Japanese (any kana) takes SC, which has more of its kanji
  const tc = !simplified && !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(source) && (traditional > 0 || /^zh-(?:Hant|TW|HK|MO)\b/i.test(String(meta.lang || '')));
  const font = BUNDLED_FONTS.find((f) => f.id === (tc ? 'noto-serif-tc' : 'noto-serif-sc'));
  return font && existsSync(path.join(CJK_FONTS_DIR, font.regular[0])) ? font : null;
}

/**
 * pandoc's variables for the bundled CJK font (xeCJK under XeLaTeX, luatexja-fontspec under LuaLaTeX), by file name,
 * which every LaTeX compile in Spectrum finds (Tectonic too), so a LaTeX project made from the .md keeps it.
 */
function cjkLatexArgs(font) {
  return ['-V', 'CJKmainfont=' + font.regular[0], ...(font.bold ? ['-V', 'CJKoptions=BoldFont=' + font.bold[0]] : [])];
}

/**
 * The same font for pandoc's Typst (whose template has no CJKmainfont), as a first line of Spectrum's: Chinese and kana
 * runs set in the front matter's CJKmainfont, else the bundled font by its family name (Typst reads the bundled fonts
 * folder). Korean is left to Typst's fallback, which finds the system's Korean font. '' when none applies.
 */
export function typstCjkFont(source, meta) {
  if (!CJK_TEXT.test(source)) return '';
  const family = named(meta.CJKmainfont) ? [meta.CJKmainfont].flat()[0] : cjkFont(source, meta)?.name;
  return family ? `#show regex("[\\p{Han}\\p{Hiragana}\\p{Katakana}]+"): set text(font: ${JSON.stringify(String(family))})\n` : '';
}

/** pandoc's log, kept to MAX_LOG_BYTES as a compile's is. */
function collector() {
  const chunks = [];
  let size = 0;
  return {
    push: (chunk) => {
      if (!chunk || size >= MAX_LOG_BYTES) return;
      const next = chunk.toString().slice(0, MAX_LOG_BYTES - size);
      size += next.length;
      chunks.push(next);
    },
    text: () => chunks.join('')
  };
}

/**
 * pandoc's own errors at a line and column in the .md: at "file" (line N, column M), not the YAML parser's line that
 * may follow, which counts from the front matter.
 */
export function pandocErrors(log, mainFile) {
  const errors = [];
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = /at\s+"[^"]*"\s+\(line\s+(\d+),?\s+column\s+(\d+)\)/i.exec(line);
    if (match) errors.push({ severity: 'error', message: line.trim(), file: mainFile, line: Number(match[1]), column: Number(match[2]) });
  }
  return errors;
}

/** The words of a generated line, without TeX commands, braces or Typst markup, to look for in the .md. */
function wordsOf(line) {
  return String(line)
    .replace(/\\(?:[a-zA-Z@]+\*?|.)/g, ' ')
    .replace(/#[A-Za-z][\w-]*(?:\([^)]*\))?/g, ' ')
    .replace(/[{}[\]$*_`<>]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

/**
 * Each diagnostic's line in the generated text, traced to the .md by its words: any run of six (then four) of the
 * generated line's words, read past commands and markup on both sides (so a line holding the faulty \command still
 * matches) and across the .md's line breaks, which pandoc rewraps. The .md line the run starts on, or no line when
 * no run is there. A diagnostic repeated by a later pass is listed once.
 */
export function traceToMarkdown(diagnostics, generated, source, mainFile) {
  const generatedLines = String(generated || '').split(/\r?\n/);
  const sourceWords = String(source || '').split(/\r?\n/).flatMap((text, index) => wordsOf(text).map((word) => ({ word, line: index + 1 })));
  const findRun = (run) => {
    for (let at = 0; at + run.length <= sourceWords.length; at += 1) {
      if (run.every((word, k) => sourceWords[at + k].word === word)) return sourceWords[at].line;
    }
    return null;
  };
  const traced = diagnostics.map((diagnostic) => {
    const withoutLine = { severity: diagnostic.severity, message: diagnostic.message, file: mainFile };
    const line = generatedLines[diagnostic.line - 1];
    if (!line) return withoutLine;
    const words = wordsOf(line);
    for (const count of [6, 4]) {
      for (let start = 0; start + count <= words.length; start += 1) {
        const found = findRun(words.slice(start, start + count));
        if (found) return { ...withoutLine, line: found, column: 1 };
      }
    }
    return withoutLine;
  });
  const seen = new Set();
  return traced.filter((d) => {
    const key = [d.severity, d.message, d.line].join('\n');
    return !seen.has(key) && seen.add(key);
  });
}

/** The TeX errors that name the generated file with a line. */
export function latexDiagnostics(log, generatedName) {
  const diagnostics = [];
  for (const line of String(log || '').split(/\r?\n/)) {
    const match = LOCATED_TEX.exec(line);
    if (!match || path.basename(match[1]) !== generatedName) continue;
    diagnostics.push({ severity: 'error', message: match[3].trim(), file: match[1], line: Number(match[2]) });
  }
  return diagnostics;
}

/** The log's lines with TeX's wrapping at 79 columns undone, which LuaTeX counts in bytes (a Korean letter is three). */
function unwrapped(log) {
  const out = [];
  let carry = '';
  for (const line of String(log || '').split(/\r?\n/)) {
    carry += line;
    if (line.length === 79 || Buffer.byteLength(line) === 79) continue;
    out.push(carry);
    carry = '';
  }
  if (carry) out.push(carry);
  return out;
}

/**
 * The log's lines, TeX's 79-column wrapping undone, from the last TeX pass: from its banner (Tectonic: its last
 * "note: Running TeX" or "Rerunning") on, as an earlier pass's warnings are repeats or stale. The editor reads a LaTeX
 * document's log the same way (compileLog.ts).
 */
function lastPass(log) {
  const lines = unwrapped(log);
  const start = lines.findLastIndex((line) => /^(?:This is (?:pdf|Xe|LuaHB|Lua|e-)?TeX, Version|note: (?:Re)?running TeX)/i.test(line));
  return start === -1 ? lines : lines.slice(start);
}

/**
 * LaTeX's warnings in the last pass, each at its line in the generated file where it gives one (" on input line N",
 * an over or underfull box's "at lines N--M", Tectonic's "warning: file:N:"), with that part of the message dropped as
 * the line is the .md's once traced; and the errors TeX writes without a file, at their "l.N" line.
 */
export function latexWarnings(log) {
  const lines = lastPass(log);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    let text = lines[i];
    let line;
    // Tectonic's located warnings only, as for a LaTeX document: its others are about Tectonic itself
    const tectonic = /^warning: (?:\.\/)?[^\s:]+:(\d+): (.*)$/.exec(text);
    if (/^warning: /.test(text) && (!tectonic || !tectonic[2].trim() || /^Missing character/.test(tectonic[2]))) continue;
    if (tectonic) [line, text] = [Number(tectonic[1]), tectonic[2]];
    const warning = /^(?:LaTeX|Package (\S+)|Class (\S+))(?: \w+)? Warning: (.*)$/.exec(text);
    const box = /^((?:Over|Under)full \\[hv]box .*?)(?: (?:in paragraph |in alignment |detected )?at lines? (\d+)(?:--\d+)?)?$/.exec(text);
    if (warning) {
      // a package's warning goes on over lines starting "(name)"
      const pkg = warning[1] || warning[2];
      let message = warning[3];
      while (pkg && lines[i + 1]?.startsWith(`(${pkg})`)) message += ' ' + lines[(i += 1)].slice(pkg.length + 2).trim();
      const at = / on input line (\d+)\.?/.exec(message);
      out.push({ severity: 'warning', message: message.replace(/ on input line \d+/, '').trim(), line: line ?? (at ? Number(at[1]) : undefined) });
    } else if (box) {
      out.push({ severity: 'warning', message: box[1], line: line ?? (box[2] ? Number(box[2]) : undefined) });
    } else if (tectonic) {
      out.push({ severity: 'warning', message: text, line });
    } else if (/^! /.test(text) && !/^! (?:Emergency stop|==> Fatal error)/.test(text)) {
      const at = lines.slice(i + 1, i + 8).map((next) => /^l\.(\d+)/.exec(next)).find(Boolean);
      out.push({ severity: 'error', message: text.slice(2).trim(), line: at ? Number(at[1]) : undefined });
    }
  }
  return out;
}

/**
 * pandoc's [WARNING] lines as warnings, each once: a citation with no entry at the .md line that first cites the key,
 * which the PDF otherwise shows only as (key?), and a reference to no label (crossref.lua's) at the line that makes it.
 */
export function pandocWarnings(log, source, mainFile) {
  const messages = [...new Set([...String(log || '').matchAll(/^\[WARNING\] (.+)$/gm)].map((m) => m[1].trim()))];
  return messages.map((message) => {
    const reference = /^Nothing is labelled \S+ for the reference @(\S+)\.$/.exec(message)?.[1];
    if (reference) return { severity: 'warning', message, file: mainFile, ...lineOf(source, '@' + reference) };
    const key = /^Citeproc: citation (\S+) not found/.exec(message)?.[1];
    const text = key ? `No entry in the bibliography for the citation @${key}.` : message;
    return { severity: 'warning', message: text, file: mainFile, ...(key && lineOf(source, '@' + key)) };
  });
}

/** { line, column: 1 } of the first @key in the source not followed by more of a key, or {} where there is none. */
function lineOf(source, at) {
  const found = String(source || '').search(new RegExp(at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w:.+-]*[\\w])'));
  return found === -1 ? {} : { line: String(source).slice(0, found).split('\n').length, column: 1 };
}

/** A font as TeX's "Missing character" line names it: [lmroman10-regular]:+tlig; or NotoSerifSC-Regular.otf/OT:…, or a path. */
export const fontName = (font) => path.posix.basename(String(font).replace(/^\[([^\]]*)\].*$/, '$1').replace(/\/(?:OT|AAT|GR|ICU)?:.*$/, '').replace(/^name:/, '').replace(/\\/g, '/'));

/**
 * One warning for each font that had no glyph for some characters, which TeX leaves out of the PDF without an error
 * (Chinese in pandoc's Latin Modern, Korean in the bundled Chinese font), naming the characters and the font, at the .md
 * line where the first of them is.
 */
export function missingGlyphs(log, source, mainFile) {
  const fonts = new Map();
  // XeTeX's and LuaTeX's "Missing character", Tectonic's "could not represent character" (its other line mangles the
  // character), each character read from its code
  const lines = unwrapped(log).join('\n');
  const found = [
    ...[...lines.matchAll(/^Missing character: There is no .+? \(U\+([0-9A-F]+)\)(?: in font (.+?)!)?\s*$/gm)],
    ...[...lines.matchAll(/^warning: could not represent character ".+?" \(0x([0-9a-f]+)\) in font "(.+?)"$/gm)]
  ];
  for (const [, code, inFont] of found) {
    const font = inFont ? fontName(inFont) : '';
    fonts.set(font, new Set(fonts.get(font)).add(String.fromCodePoint(parseInt(code, 16))));
  }
  return [...fonts].map(([font, set]) => {
    const chars = [...set];
    const at = String(source || '').indexOf(chars[0]);
    const shown = chars.slice(0, 12).join(' ') + (chars.length > 12 ? ` and ${chars.length - 12} more` : '');
    const korean = chars.some((ch) => HANGUL.test(ch));
    const advice = korean
      ? `Spectrum’s Chinese fonts have no Korean letters: name a Korean font in the front matter, such as CJKmainfont: ${process.platform === 'win32' ? 'Malgun Gothic' : 'Apple SD Gothic Neo'}.`
      : 'Name a font that has them in the front matter: mainfont, or CJKmainfont for Chinese, Japanese or Korean.';
    return {
      severity: 'warning',
      message: `${font ? `The font ${font}` : 'The font'} has no ${shown}, so the PDF leaves ${chars.length === 1 ? 'it' : 'them'} out. ${advice}`,
      file: mainFile,
      ...(at !== -1 && { line: String(source).slice(0, at).split('\n').length, column: 1 })
    };
  });
}

const atLeast = (version, minimum) => {
  const left = String(version).split('.').map(Number);
  const right = String(minimum).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return true;
};

/** What stops pandoc for a kind of output ('latex' or 'typst'), or null. */
async function pandocProblem(kind) {
  const executable = await pandocPath();
  const version = executable && (await versionOf(executable));
  if (!executable || !version) return { code: 'PANDOC_MISSING', error: PANDOC_MISSING };
  const minimum = kind === 'typst' ? PANDOC_MINIMUM.typst : PANDOC_MINIMUM.latex;
  // pandoc that can write LaTeX but not Typst 0.15's: say so, as LaTeX works with it
  if (kind === 'typst' && !atLeast(version, minimum) && atLeast(version, PANDOC_MINIMUM.latex)) {
    return { code: 'PANDOC_OLD', error: 'Typst as the PDF engine needs pandoc ' + minimum + ' or later, and this pandoc is ' + version + '. Download pandoc ' + PANDOC_DOWNLOADABLE + ' from Settings › Engines › Markdown, or choose LaTeX as the PDF engine in the Compile menu.' };
  }
  if (!atLeast(version, minimum)) {
    return { code: 'PANDOC_OLD', error: 'This pandoc (' + version + ') is too old for Spectrum. Download pandoc ' + PANDOC_DOWNLOADABLE + ' from Settings › Engines › Markdown.' };
  }
  return null;
}

/** Runs pandoc and collects its log; nothing about stopping is decided here. */
async function runPandoc(args, cwd, env = process.env) {
  const log = collector();
  let run;
  try {
    run = await runSpawn(await pandocPath(), args, cwd, log.push, env);
  } catch (err) {
    return { code: null, timedOut: false, log: log.text(), error: err };
  }
  return { ...run, log: log.text() };
}

const pandocFailure = (run, mainFile) => ({
  ok: false,
  ...(run.error && { error: PANDOC_MISSING }),
  ...(run.timedOut && { timedOut: true }),
  ...(run.code === null && !run.timedOut && !run.error && { stopped: true }),
  log: run.log,
  errors: pandocErrors(run.log, mainFile)
});

/**
 * pandoc's LaTeX for the .md, into generatedDir: for a compile, its images in the project (vettedMarkdown) copied into
 * generatedDir/media, each SVG there made a PDF where rsvg-convert is; sandboxed (a new project from it), no file read
 * but the .md and the .bib files, and each image named as the .md names it, for projectImages.
 */
export async function markdownToLatex({ projectRoot, absMain, mainFile, generatedDir, sandboxed = false }) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  await ensureDir(generatedDir);
  const generatedFile = path.join(generatedDir, mainFile + '.tex');
  await ensureDir(path.dirname(generatedFile));
  // a compile's images go through vettedMarkdown, so --extract-media copies none from outside the project
  const vetted = !sandboxed && (await vettedMarkdown(projectRoot, absMain, generatedFile + '.json'));
  if (vetted && !vetted.ok) return { ...pandocFailure(vetted, mainFile), ...(vetted.code === 0 && { error: PANDOC_UNREADABLE }) };
  const font = cjkFont(source, meta);
  const args = [
    ...(sandboxed ? [absMain, '--from=markdown'] : [generatedFile + '.json', '--from=json']),
    // slides: true (or beamer) in the front matter makes Beamer slides, a ## heading a slide
    isSlides(meta) ? '--to=beamer' : '--to=latex', '--standalone', ...crossrefArgs(), '--citeproc',
    ...(await bibliographyArgs(projectRoot, meta)),
    ...cslArgs(meta),
    ...(font ? cjkLatexArgs(font) : []),
    '--resource-path=' + [path.dirname(absMain), projectRoot].join(path.delimiter),
    sandboxed ? '--sandbox' : '--extract-media=' + path.join(generatedDir, 'media'),
    '-o', generatedFile
  ];
  // a new project from the .md keeps its Mermaid blocks as code (their pictures are this project's)
  const run = await runPandoc(args, path.dirname(absMain), sandboxed ? process.env : mermaidEnv(projectRoot));
  if (vetted) run.log = vetted.log + run.log;
  let text = await fs.readFile(generatedFile, 'utf8').catch(() => null);
  if (run.code !== 0 || text === null) return { ...pandocFailure(run, mainFile), ...(text === null && !run.error && !run.timedOut && { error: PANDOC_UNREADABLE }) };
  if (!sandboxed) {
    text = await svgsAsPdf(text, generatedDir);
    await fs.writeFile(generatedFile, text);
  }
  return { ok: true, text, log: run.log, file: generatedFile };
}

/**
 * Each \includesvg in pandoc's LaTeX an \includegraphics of the PDF rsvg-convert makes beside the SVG (a relative
 * path from dir), as the svg package would need Inkscape for; the text as it was without rsvg-convert.
 */
export async function svgsAsPdf(text, dir) {
  const rsvg = /\\includesvg/.test(text) && (await findExecutable('rsvg-convert'));
  if (!rsvg) return text;
  let out = text;
  for (const [whole, options = '', file] of text.matchAll(/\\includesvg(\[[^\]]*\])?\{([^}]+)\}/g)) {
    const pdf = file.replace(/\.svg$/i, '') + '.pdf';
    // one outside dir (an absolute path, another project's) keeps its \includesvg, so nothing is written beside it
    let svg;
    let target;
    try {
      svg = safeJoin(dir, /\.svg$/i.test(file) ? file : file + '.svg');
      target = safeJoin(dir, pdf);
    } catch {
      continue;
    }
    const run = await runSpawn(rsvg, ['-f', 'pdf', '-o', target, svg], dir, () => {}, process.env).catch(() => null);
    if (run?.code === 0) out = out.replace(whole, () => '\\includegraphics' + options + '{' + pdf + '}');
  }
  return /\\includesvg/.test(out) ? out : out.replace(/^\\usepackage\{svg\}\r?\n/m, '');
}

/**
 * The images pandoc's sandboxed LaTeX includes that are in the project, each found as pandoc looks (from the .md's
 * folder, then the project's) and named by its path in the project: { text, images (those paths) }. One elsewhere on
 * this computer, or a link out of the project, keeps its name and isn't listed, so nothing outside is copied.
 */
export function projectImages(text, projectRoot, mdDir) {
  const images = new Set();
  const named = text.replace(/(\\include(?:graphics|svg)(?:\[[^\]]*\])?\{)([^}]+)(\})/g, (whole, before, file, after) => {
    const name = projectImage(file, projectRoot, mdDir);
    if (!name) return whole;
    images.add(name);
    return before + name + after;
  });
  return { text: named, images: [...images] };
}

/** An image found as pandoc looks (from the .md's folder, then the project's): its '/'-separated path in the project, or null. */
function projectImage(file, projectRoot, mdDir) {
  for (const from of [mdDir, projectRoot]) {
    const rel = path.relative(projectRoot, path.resolve(from, file));
    if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) continue;
    try {
      if (!existsSync(safeJoin(projectRoot, rel))) continue;
    } catch {
      continue;
    }
    return rel.split(path.sep).join('/');
  }
  return null;
}

/**
 * The .md as pandoc's JSON in jsonFile, read in pandoc's sandbox, with each image in the project (projectImage) named by
 * its full path and every other one (a URL, a file elsewhere on this computer, a link out of the project) left as its
 * description: pandoc's writer then reads no file outside the project and fetches nothing. { ok, log }, or a failed run.
 */
async function vettedMarkdown(projectRoot, absMain, jsonFile) {
  const mdDir = path.dirname(absMain);
  const run = await runPandoc([absMain, '--from=markdown', '--to=json', '--sandbox', '-o', jsonFile], mdDir);
  const text = await fs.readFile(jsonFile, 'utf8').catch(() => null);
  let doc = null;
  try {
    doc = JSON.parse(text);
  } catch {
    // not pandoc's JSON
  }
  if (run.code !== 0 || !doc) return { ...run, ok: false };
  const decoded = (src) => {
    try {
      return decodeURIComponent(src);
    } catch {
      return src;
    }
  };
  const vet = (node) => {
    if (Array.isArray(node)) return node.map(vet);
    if (!node || typeof node !== 'object') return node;
    if (node.t === 'Image') {
      const [attr, alt, [src, title]] = node.c;
      // data: holds the image itself; any other scheme (or a Windows drive) isn't a file in the project
      if (/^data:/i.test(src)) return node;
      const name = !/^[a-z][a-z0-9+.-]*:/i.test(src) && (projectImage(src, projectRoot, mdDir) || projectImage(decoded(src), projectRoot, mdDir));
      return name ? { t: 'Image', c: [attr, vet(alt), [path.join(projectRoot, ...name.split('/')), title]] } : { t: 'Span', c: [attr, vet(alt)] };
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, vet(value)]));
  };
  await fs.writeFile(jsonFile, JSON.stringify(vet(doc)));
  return { ok: true, log: run.log };
}

/** Pandoc's Typst for the .md, its images made project-root relative, into generatedDir. */
export async function markdownToTypst({ projectRoot, absMain, mainFile, generatedDir }) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  await ensureDir(generatedDir);
  const generatedFile = path.join(generatedDir, mainFile + '.typ');
  await ensureDir(path.dirname(generatedFile));
  const args = [
    absMain, '--from=markdown', '--to=typst', '--standalone', ...crossrefArgs(), '--citeproc',
    ...(await bibliographyArgs(projectRoot, meta)),
    ...cslArgs(meta),
    '--resource-path=' + [path.dirname(absMain), projectRoot].join(path.delimiter),
    '-o', generatedFile
  ];
  const run = await runPandoc(args, path.dirname(absMain), mermaidEnv(projectRoot));
  let text = await fs.readFile(generatedFile, 'utf8').catch(() => null);
  if (run.code !== 0 || text === null) return { ...pandocFailure(run, mainFile), ...(text === null && !run.error && !run.timedOut && { error: PANDOC_UNREADABLE }) };
  text = typstCjkFont(source, meta) + rootRelativeImages(text, projectRoot, path.dirname(absMain));
  await fs.writeFile(generatedFile, text);
  return { ok: true, text, log: run.log, file: generatedFile };
}

/**
 * Every relative image("…") in a Typst document made root relative, which is how Typst reads it from stdin: from the
 * .md's folder, else (as pandoc's --resource-path finds it for LaTeX) from the project's.
 */
export function rootRelativeImages(text, projectRoot, mdDir) {
  const folder = path.relative(projectRoot, mdDir).split(path.sep).join('/');
  return text.replace(/(image\(\s*")([^"]+)(")/g, (whole, before, source, after) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith('/') || source.startsWith('#')) return whole;
    if (!existsSync(path.join(mdDir, source)) && existsSync(path.join(projectRoot, source))) return before + '/' + path.posix.normalize(source) + after;
    return before + '/' + path.posix.normalize(path.posix.join(folder || '.', source)) + after;
  });
}

/** Compiles a .md main file through pandoc and the project's PDF engine ('latex' or 'typst'), else options.markdownEngine, the app's. */
export async function compileMarkdown(projectRoot, absMain, mainFile, engine, options = {}) {
  const settings = await readProjectSettings(projectRoot);
  const source = await fs.readFile(absMain, 'utf8').catch(() => null);
  if (source === null) return { ok: false, error: 'The main file “' + mainFile + '” doesn’t exist.' };
  // slides are Beamer's, so they go through LaTeX whatever the PDF engine
  const kind = (settings.compile?.markdownEngine || options.markdownEngine) === 'typst' && !isSlides(parseFrontMatter(source).meta) ? 'typst' : 'latex';
  const problem = await pandocProblem(kind);
  if (problem) return { ok: false, ...problem, generated: kind };
  const cache = options.scratch ? options.buildDir || path.join(os.tmpdir(), 'spectrum-build') : await cachePath(projectRoot);
  const generatedDir = path.join(cache, 'generated');
  const made = kind === 'typst'
    ? await markdownToTypst({ projectRoot, absMain, mainFile, generatedDir })
    : await markdownToLatex({ projectRoot, absMain, mainFile, generatedDir });
  if (!made.ok) {
    if (made.stopped) return { ok: false, stopped: true, error: 'The compile was stopped.', log: made.log, status: -1 };
    if (made.timedOut) return { ok: false, error: 'The compile took too long and was stopped.', log: made.log, status: -1, errors: made.errors };
    return { ok: false, error: made.error || PANDOC_UNREADABLE, log: made.log, errors: made.errors, generated: kind };
  }
  // Compile with page colour goes into Spectrum's own generated file: for Typst a first line (which the errors are
  // traced through), for LaTeX on its \documentclass line
  if (kind === 'typst') {
    const typst = options.pageColour ? typstFill(options.pageColour) + made.text : made.text;
    const result = await compileTypst(projectRoot, absMain, mainFile, { ...options, source: typst });
    return { ...result, log: made.log + (result.log || ''), errors: [...traceToMarkdown(result.errors || [], typst, source, mainFile), ...pandocWarnings(made.log, source, mainFile)], generated: 'typst' };
  }
  if (options.pageColour) await fs.writeFile(made.file, pageColourLines(made.text, options.pageColour));
  // pandoc's LaTeX sets CJK text under XeLaTeX and LuaLaTeX only: pdfLaTeX (or latexmk's) gives way to XeLaTeX
  const unicode = CJK_TEXT.test(source) ? await unicodeEngine(engine) : null;
  // LaTeX: the generated file compiles like any document, with its PDF beside the .md
  const result = await compileDocument(unicode?.engine || engine, projectRoot, made.file, mainFile, { ...options, pageColour: undefined, markdownSource: absMain, ...(unicode?.latexmk && { latexmkEngine: unicode.latexmk }) });
  // pandoc's own warnings (a citation with no entry) first, as they come first
  let log = (unicode?.note ? unicode.note + '\n' : '') + made.log + (result.log || '');
  if (SVG.test(source) && !(await findExecutable('rsvg-convert'))) log += SVG_NOTE;
  // TeX's errors first, then its warnings, each traced to the .md and listed once
  const tex = traceToMarkdown([...latexDiagnostics(log, path.basename(made.file)), ...latexWarnings(log)], made.text, source, mainFile);
  return {
    ...result,
    log,
    errors: [
      ...tex.filter((d) => d.severity === 'error'),
      ...tex.filter((d) => d.severity !== 'error'),
      ...pandocWarnings(made.log, source, mainFile),
      ...missingGlyphs(log, source, mainFile)
    ],
    generated: 'latex'
  };
}

/**
 * For a .md with CJK text: XeLaTeX in place of pdfLaTeX (LuaLaTeX when XeLaTeX isn't there), or latexmk running XeLaTeX,
 * with a note for the log; null for an engine that sets it already (XeLaTeX, LuaLaTeX, Tectonic, Auto's choice).
 */
async function unicodeEngine(engine) {
  if (engine === 'latexmk') return { engine, latexmk: 'xelatex' };
  if (engine !== 'pdflatex') return null;
  for (const [choice, name] of [['xelatex', 'XeLaTeX'], ['lualatex', 'LuaLaTeX']]) {
    if (await findExecutable(choice)) return { engine: choice, note: `[spectrum note] This compile used ${name}, as Chinese, Japanese or Korean text needs XeLaTeX or LuaLaTeX.` };
  }
  return null;
}

/** The .md as a Word document, with only the project's images in it (vettedMarkdown). */
export async function pandocDocx(projectRoot, absMain, output) {
  const source = await fs.readFile(absMain, 'utf8');
  const { meta } = parseFrontMatter(source);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'spectrum-docx-'));
  try {
    const json = path.join(tmp, 'document.json');
    const vetted = await vettedMarkdown(projectRoot, absMain, json);
    if (!vetted.ok) return { ok: false, log: vetted.log };
    const resources = '--resource-path=' + [path.dirname(absMain), projectRoot].join(path.delimiter);
    const run = await runPandoc([json, '--from=json', ...crossrefArgs(), '--citeproc', ...(await bibliographyArgs(projectRoot, meta)), ...cslArgs(meta), resources, '-o', output], path.dirname(absMain), mermaidEnv(projectRoot));
    return { ok: run.code === 0 && !run.timedOut && !run.error, log: vetted.log + run.log };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Saves the editor's pictures of a document's ```mermaid blocks ({ sha1: PNG bytes }, each drawn at 3 × its size and
 * marked 288 dpi so it prints at that size) and answers which of `wanted` have none yet. ponytail: pictures of blocks
 * since changed stay in .spectrum/mermaid; a sweep by age if the folder ever grows large
 */
export async function saveMermaid(projectRoot, wanted, images) {
  const dir = path.join(projectRoot, ...MERMAID_DIR);
  await ensureDir(dir);
  for (const [hash, png] of Object.entries(images)) await fs.writeFile(path.join(dir, hash + '.png'), withDpi(png, 288));
  return wanted.filter((hash) => !existsSync(path.join(dir, hash + '.png')));
}

/** A PNG with a pHYs chunk (after IHDR) saying `dpi`, which pandoc, TeX, Typst and Word read as its print size. */
export function withDpi(png, dpi) {
  if (!png.subarray(0, 8).equals(PNG) || png.toString('latin1', 12, 16) !== 'IHDR') throw new Error('Not a PNG.');
  const end = 8 + 12 + png.readUInt32BE(8);
  const body = Buffer.alloc(13);
  body.write('pHYs', 0, 'latin1');
  const perMetre = Math.round(dpi / 0.0254);
  body.writeUInt32BE(perMetre, 4);
  body.writeUInt32BE(perMetre, 8);
  body[12] = 1;
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 17);
  return Buffer.concat([png.subarray(0, end), chunk, png.subarray(end)]);
}
