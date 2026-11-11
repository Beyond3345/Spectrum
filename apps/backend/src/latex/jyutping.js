// xjyutping (Cantonese Jyutping above Chinese characters) in a LaTeX document: the project setting's checks, the
// preamble lines the editor writes into a document, and auto mode's copy of a document, with every line where it was.
import fonts from '../data/fonts.json' with { type: 'json' };

export const BUNDLED_FONTS = fonts.cjk;
export const DEFAULT_FONTS = { tc: 'bundled:noto-serif-tc', sc: 'bundled:noto-serif-sc' };

// the package's own defaults, which are never written
const DEFAULTS = { ratio: '0.45', vsep: '1.05em', hsep: '0.15em plus 0.4em', width: 'auto', font: '\\normalfont', format: '', multiple: '', fancy: false, lazy: false, script: 'auto', linebreak: false, align: 'justify', debug: false };
const NUMBER = '-?(?:\\d{1,4}(?:\\.\\d{1,4})?|\\.\\d{1,4})';
const UNIT = '(?:pt|em|ex|mm|cm|in|bp|pc|dd|cc|sp)';
const LENGTH = new RegExp(`^${NUMBER} ?${UNIT}$`);
const GLUE = new RegExp(`^${NUMBER} ?${UNIT}(?: plus ${NUMBER} ?(?:${UNIT}|fil{1,3}))?(?: minus ${NUMBER} ?${UNIT})?$`);
// what font, format and multiple may use: fonts, sizes and colours
const COMMANDS = new Set(['normalfont', 'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape', 'upshape', 'slshape', 'scshape', 'normalshape', 'em',
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge', 'fontsize', 'selectfont', 'fontfamily', 'fontseries', 'fontshape',
  'usefont', 'fontspec', 'addfontfeature', 'addfontfeatures', 'color', 'textcolor', 'relax']);

/** TeX the font, format and multiple options may hold: fonts, sizes and colours, braces one deep, none of % # $ & ^ _ ~ @. */
function safeTex(value) {
  if (typeof value !== 'string' || value.length > 120 || !/^[\p{L}\p{N} .,;:!=+\-/()[\]{}\\'*]*$/u.test(value)) return false;
  let depth = 0;
  for (const char of value) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0 || depth > 1) return false;
  }
  return depth === 0 && [...value.matchAll(/\\([A-Za-z]+|[^A-Za-z]?)/g)].every((m) => COMMANDS.has(m[1]));
}

const isBool = (v) => typeof v === 'boolean';
// in the order they're written
const OPTIONS = {
  ratio: (v) => typeof v === 'string' && /^\d{0,2}(?:\.\d{1,4})?$/.test(v) && Number(v) > 0,
  vsep: (v) => typeof v === 'string' && LENGTH.test(v),
  hsep: (v) => typeof v === 'string' && GLUE.test(v),
  width: (v) => v === 'auto' || v === 'natural' || (typeof v === 'string' && LENGTH.test(v)),
  font: safeTex,
  format: safeTex,
  multiple: safeTex,
  fancy: isBool,
  lazy: (v) => v === false || v === true || v === 'all',
  script: (v) => ['auto', 'simplified', 'traditional'].includes(v),
  linebreak: isBool,
  align: (v) => ['justify', 'left', 'centre', 'right'].includes(v),
  debug: isBool
};
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
// a font family as the system names it (Songti TC, 標楷體)
const SYSTEM_FONT = /^[\p{L}\p{N}][\p{L}\p{N} .\-']{0,79}$/u;

/** cjkFont is '' (the default), bundled:<a bundled font's id> or a system font's family name. */
export const isCjkFont = (v) => v === '' || (typeof v === 'string' && (v.startsWith('bundled:') ? BUNDLED_FONTS.some((f) => `bundled:${f.id}` === v) : SYSTEM_FONT.test(v)));

/** What's wrong with an options object, or null. */
export function optionsProblem(options) {
  if (options === undefined) return null;
  if (!isObject(options)) return 'options must be an object.';
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(OPTIONS, key)) return `There’s no option “${key}”.`;
    if (!OPTIONS[key](value)) return `The value of “${key}” can’t be used.`;
  }
  return null;
}

/** What's wrong with a project's jyutping setting, or null: { mode, options, cjkFont } and nothing else. */
export function jyutpingProblem(setting) {
  if (!isObject(setting)) return 'The Jyutping setting must be an object.';
  const extra = Object.keys(setting).find((key) => !['mode', 'options', 'cjkFont'].includes(key));
  if (extra) return `The Jyutping setting has no “${extra}”.`;
  if (!['off', 'auto', 'manual'].includes(setting.mode)) return 'The Jyutping mode must be off, auto or manual.';
  if (setting.cjkFont !== undefined && !isCjkFont(setting.cjkFont)) return 'That Chinese font can’t be used.';
  return optionsProblem(setting.options);
}

/** The package options, without the defaults: fancy,lazy=all,format={\color{gray}}. */
export function packageOptions(options = {}) {
  const out = [];
  for (const [key, valid] of Object.entries(OPTIONS)) {
    const value = options?.[key];
    if (value === undefined || value === DEFAULTS[key] || !valid(value)) continue;
    if (value === true) out.push(key);
    // braced, so a comma or = in them stays theirs
    else if (['font', 'format', 'multiple', 'hsep'].includes(key)) out.push(`${key}={${value}}`);
    else out.push(`${key}=${value}`);
  }
  return out.join(',');
}

const packageLine = (options) => {
  const opts = packageOptions(options);
  return opts ? `\\usepackage[${opts}]{xjyutping}` : '\\usepackage{xjyutping}';
};

/**
 * The font's line for a CJK package: \setmainjfont for luatexja-fontspec, \setCJKmainfont otherwise. A bundled font by
 * its file names (found on the font search path a compile sets), with Path= when dir is given and TeX can read it.
 */
export function fontLine(cjkFont, kind, dir) {
  const command = kind === 'luatexja-fontspec' || kind === 'luatexja' ? '\\setmainjfont' : '\\setCJKmainfont';
  const font = BUNDLED_FONTS.find((f) => `bundled:${f.id}` === (cjkFont || DEFAULT_FONTS.tc));
  if (!font) return `${command}{${cjkFont}}`;
  const features = [...(dir && !/[\\{}%#~^$&]/.test(dir) ? [`Path={${dir.replace(/\/?$/, '/')}}`] : []), ...(font.bold ? [`BoldFont=${font.bold[0]}`] : [])];
  return `${command}{${font.regular[0]}}${features.length ? `[${features.join(',')}]` : ''}`;
}

// ─── Reading a line ───

const OPTIONAL = String.raw`\[(?:[^\[\]{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\]`;
const PACKAGE = new RegExp(String.raw`\\(?:usepackage|RequirePackage)\s*(${OPTIONAL})?\s*\{([^{}]*)\}`, 'g');
const CTEX_CLASS = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{\s*ctex(?:art|rep|book|beamer)\s*\}/;
const FONT = new RegExp(String.raw`\\(?:setCJKmainfont|setmainjfont)\s*(?:${OPTIONAL})?\s*\{[^{}]*\}(?:\s*${OPTIONAL})?`, 'g');
const SETUP = /\\xjyutpingsetup\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
const CJK_KINDS = ['ctex', 'xeCJK', 'luatexja-fontspec', 'luatexja'];
// environments whose body TeX reads with other catcodes, which a scope (read whole, as an argument) can't hold
const VERBATIM = new Set(['verbatim', 'verbatim*', 'Verbatim', 'Verbatim*', 'BVerbatim', 'LVerbatim', 'SaveVerbatim', 'VerbatimOut', 'lstlisting', 'minted', 'comment', 'alltt',
  'tcblisting', 'filecontents', 'filecontents*', 'luacode', 'luacode*', 'pycode', 'sagesilent', 'sageblock']);
const INLINE_VERBATIM = new Set(['verb', 'Verb', 'lstinline', 'mintinline', 'spverb']);
const INCLUDES = new Set(['input', 'include', 'subfile', 'import', 'subimport', 'inputfrom', 'subinputfrom', 'includefrom', 'subincludefrom']);
// catcode changes, from the first to the second
const CATCODES = { makeatletter: 'makeatother', ExplSyntaxOn: 'ExplSyntaxOff' };
const CJK_CHAR = /[㐀-䶿一-鿿豈-﫿]/;

/** The end of a group's argument from its opening brace at i: the index after its closing brace (or the line's end). */
function braced(line, i) {
  let depth = 0;
  for (let j = i; j < line.length; j += 1) {
    if (line[j] === '\\') j += 1;
    else if (line[j] === '{') depth += 1;
    else if (line[j] === '}' && --depth === 0) return j + 1;
  }
  return line.length;
}

/**
 * One line as TeX reads it, from state (an environment of VERBATIM or a catcode region still open): where its comment
 * starts (end: its length otherwise, without a \r), its brace and environment depth change, what it holds that a
 * scope can't (unsafe), the files it \input's, \begin{document}, \end{document} and \endinput, and the state after it.
 */
function scanLine(line, state) {
  const out = { end: line.replace(/\r$/, '').length, delta: 0, unsafe: false, inputs: [], begin: -1, beginEnd: -1, close: -1, endinput: -1, state };
  let i = 0;
  if (state?.verbatim) {
    const end = line.indexOf(`\\end{${state.verbatim}}`);
    out.unsafe = true;
    if (end === -1) return out;
    i = end + `\\end{${state.verbatim}}`.length;
    out.state = null;
  }
  if (out.state?.catcode) out.unsafe = true;
  while (i < out.end) {
    const c = line[i];
    if (c === '%') {
      out.end = i;
      break;
    }
    if (c === '{' || c === '}') {
      out.delta += c === '{' ? 1 : -1;
      i += 1;
      continue;
    }
    if (c !== '\\') {
      i += 1;
      continue;
    }
    const name = /^\\([A-Za-z@]+)(\*?)/.exec(line.slice(i))?.[1];
    if (!name) {
      i += 2;
      continue;
    }
    const at = i;
    i += 1 + name.length;
    if (INLINE_VERBATIM.has(name)) {
      out.unsafe = true;
      if (line[i] === '*') i += 1;
      if (line[i] === '[') i = line.indexOf(']', i) + 1 || out.end;
      if (name === 'mintinline' && line[i] === '{') i = braced(line, i);
      const delim = line[i];
      i = delim === '{' ? braced(line, i) : line.indexOf(delim, i + 1) + 1 || line.length;
      continue;
    }
    if ((name === 'url' || name === 'href' || name === 'path') && line[i] === '{') {
      const after = braced(line, i);
      // url reads its argument verbatim, which a scope's argument can't
      if (/[%#]/.test(line.slice(i, after))) out.unsafe = true;
      i = after;
      continue;
    }
    if (name === 'begin' || name === 'end') {
      const env = /^\s*\{([^{}]*)\}/.exec(line.slice(i));
      if (!env) continue;
      i += env[0].length;
      if (env[1] === 'document') {
        if (name === 'begin') [out.begin, out.beginEnd] = [at, i];
        else out.close = at;
        continue;
      }
      if (env[1] === 'jyutpingscope') continue;
      out.delta += name === 'begin' ? 1 : -1;
      if (name === 'begin' && VERBATIM.has(env[1])) {
        out.unsafe = true;
        const end = line.indexOf(`\\end{${env[1]}}`, i);
        if (end === -1) {
          out.state = { verbatim: env[1] };
          out.delta -= 1;
          return out;
        }
        i = end;
      }
      continue;
    }
    if (CATCODES[name]) {
      out.unsafe = true;
      out.state = { catcode: CATCODES[name] };
    } else if (out.state?.catcode === name) {
      out.unsafe = true;
      out.state = null;
    } else if (name === 'catcode') out.unsafe = true;
    else if (name === 'endinput' && out.endinput === -1) out.endinput = at;
    else if (INCLUDES.has(name)) {
      out.unsafe = true;
      const args = /^\*?\s*(?:\{([^{}]*)\}\s*)?(?:\{([^{}]*)\})?/.exec(line.slice(i));
      const [dir, file] = /import|from$/.test(name) ? [args?.[1] ?? '', args?.[2]] : ['', args?.[1]];
      if (file) out.inputs.push({ command: name, file: (dir ? dir.replace(/\/?$/, '/') : '') + file.trim() });
      i += args?.[0].length ?? 0;
    }
  }
  return out;
}

/** Every line of text, read in turn. */
function scanText(text) {
  const lines = text.split('\n');
  let state = null;
  return {
    lines,
    scans: lines.map((line) => {
      const scan = scanLine(line, state);
      state = scan.state;
      return scan;
    })
  };
}

/** The code of each line: the line without its comment (the line itself when it has none). */
const codeOf = (lines) => scanText(lines.join('\n')).scans.map((scan, n) => lines[n].slice(0, scan.end));

/** The text holds a Chinese character outside its comments. */
export function hasChinese(text) {
  const { lines, scans } = scanText(String(text));
  return scans.some((scan, n) => CJK_CHAR.test(lines[n].slice(0, scan.end)));
}

/** The document loads xjyutping in its preamble (outside comments). */
export function loadsXjyutping(text) {
  const lines = String(text).split('\n');
  const begin = beginLine(lines);
  return codeOf(lines.slice(0, begin === -1 ? lines.length : begin + 1)).some((code) => [...code.matchAll(PACKAGE)].some((m) => names(m).includes('xjyutping')));
}

const names = (match) => match[2].split(',').map((name) => name.trim());

/** The line \begin{document} is on, or -1. */
function beginLine(lines) {
  const { scans } = scanText(lines.join('\n'));
  return scans.findIndex((scan) => scan.begin !== -1);
}

/** The CJK support the preamble's code lines load first: { kind, line, match } or null. */
function cjkSupport(codes) {
  for (let line = 0; line < codes.length; line += 1) {
    const cls = CTEX_CLASS.exec(codes[line]);
    if (cls) return { kind: 'ctex', line, match: null };
    for (const match of codes[line].matchAll(PACKAGE)) {
      const kind = CJK_KINDS.find((k) => names(match).includes(k));
      if (kind) return { kind, line, match };
    }
  }
  return null;
}

/** The CJK support a document loads: 'ctex', 'xeCJK', 'luatexja-fontspec', 'luatexja' or null. */
export function cjkKind(text) {
  const lines = String(text).split('\n');
  const begin = beginLine(lines);
  return cjkSupport(codeOf(lines.slice(0, begin === -1 ? lines.length : begin)))?.kind ?? null;
}

// ─── The preamble the editor writes ───

/** lines[n] with [from, to) replaced; a line left with only spaces (and no comment) is dropped (null). */
function splice(lines, n, from, to, text) {
  const line = lines[n].slice(0, from) + text + lines[n].slice(to);
  return !text && !line.trim() ? null : line;
}

/**
 * The document with xjyutping's lines in its preamble, each changed where it is or added once: the CJK package
 * (swapped for the engine: xeCJK for XeLaTeX, luatexja-fontspec for LuaLaTeX; ctex stays), one main CJK font line and
 * \usepackage[options]{xjyutping}. remove: without the xjyutping line and \xjyutpingsetup, the CJK lines kept.
 * Comments and everything from \begin{document} on stay as they are. { ok, text } or { ok: false, error }.
 */
export function jyutpingPreamble(text, { options = {}, cjkFont = '', engine = 'auto', remove = false } = {}) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n';
  let lines = String(text).split(/\r?\n/);
  if (beginLine(lines) === -1) return { ok: false, error: 'This document has no \\begin{document}, so its preamble can’t be changed.' };
  const lua = engine === 'lualatex';
  // the preamble's code lines, read again after each change
  const preamble = () => codeOf(lines.slice(0, beginLine(lines)));
  // every match of pattern in the preamble, last first, so removing one leaves the others' places as they were
  const found = (pattern, keep = () => true) => preamble().flatMap((code, line) => [...code.matchAll(pattern)].filter(keep).map((match) => ({ line, match }))).reverse();
  const drop = (hits) => {
    for (const { line, match } of hits) lines[line] = splice(lines, line, match.index, match.index + match[0].length, '');
    lines = lines.filter((line) => line !== null);
  };
  // xjyutping in a list with other packages leaves the list (and is written on a line of its own)
  const xjyutping = (match) => names(match).includes('xjyutping');
  for (const { line, match } of found(PACKAGE, (m) => xjyutping(m) && names(m).length > 1)) {
    const rest = names(match).filter((name) => name !== 'xjyutping').join(',');
    lines[line] = splice(lines, line, match.index, match.index + match[0].length, match[0].replace(/\{[^{}]*\}$/, `{${rest}}`));
  }
  if (remove) {
    drop(found(PACKAGE, xjyutping));
    drop(found(SETUP));
    return { ok: true, text: lines.join(eol) };
  }

  // the CJK package, swapped when the engine can't load it
  let support = cjkSupport(preamble());
  const swap = support && support.kind !== 'ctex' && (lua ? support.kind !== 'luatexja-fontspec' : support.kind !== 'xeCJK') ? (lua ? 'luatexja-fontspec' : 'xeCJK') : null;
  if (swap) {
    const { line, match } = support;
    const list = names(match);
    // its options were the old package's
    const next = list.length === 1 ? `\\usepackage{${swap}}` : match[0].replace(/\{[^{}]*\}$/, `{${list.map((name) => (name === support.kind ? swap : name)).join(',')}}`);
    lines[line] = splice(lines, line, match.index, match.index + match[0].length, next);
    support = cjkSupport(preamble());
  }
  if (!support) {
    lines.splice(beginLine(lines), 0, lua ? '\\usepackage{luatexja-fontspec}' : '\\usepackage{xeCJK}');
    support = cjkSupport(preamble());
  }

  // one font line: the first one changed in place, the others dropped
  const font = fontLine(cjkFont, support.kind);
  const fonts = found(FONT);
  if (fonts.length) {
    const { line, match } = fonts.at(-1);
    drop(fonts.slice(0, -1));
    lines[line] = splice(lines, line, match.index, match.index + match[0].length, font);
  } else lines.splice(cjkSupport(preamble()).line + 1, 0, font);

  // the package line, likewise
  const packages = found(PACKAGE, xjyutping);
  if (packages.length) {
    const { line, match } = packages.at(-1);
    drop(packages.slice(0, -1));
    lines[line] = splice(lines, line, match.index, match.index + match[0].length, packageLine(options));
  } else lines.splice(beginLine(lines), 0, packageLine(options));
  return { ok: true, text: lines.join(eol) };
}

// ─── Auto mode's copy of a document ───

/**
 * The files a document's body \input's, \include's, \subfile's or \import's ({ command, file }, file as written),
 * outside comments and verbatim: from \begin{document} on, or the whole file when it has none (an included one).
 */
export function bodyInputs(text) {
  const { scans } = scanText(String(text));
  return scans.slice(Math.max(0, scans.findIndex((scan) => scan.begin !== -1))).flatMap((scan) => scan.inputs);
}

/**
 * The document with its body in jyutpingscope, every line where it was (text is only added to lines): role 'main'
 * puts additions (preamble lines) just before \begin{document} and opens the scope after it; 'body' (a file the body
 * \input's) wraps the whole file, or a subfile's \begin{document}…\end{document}. The scope is closed before and
 * opened again on the line after what it can't hold (verbatim, \verb, a \url with %, catcode changes, \input and the like),
 * widened to the outermost group or environment around it, as a scope must close where it opened.
 */
export function jyutpingTransform(text, { role = 'main', additions = '' } = {}) {
  const { lines, scans } = scanText(String(text));
  let first = scans.findIndex((scan) => scan.begin !== -1);
  if (role === 'main' && first === -1) return String(text);
  let last;
  if (first === -1) {
    first = 0;
    last = scans.findIndex((scan) => scan.endinput !== -1);
    // its last line with anything on it, so an error at the scope's end is reported there
    if (last === -1) last = Math.max(0, lines.findLastIndex((line) => line.trim()));
  } else {
    last = scans.findIndex((scan, n) => n >= first && scan.close !== -1);
    if (last === -1) last = lines.length - 1;
  }
  // depth (groups and environments) at the start of each line of the body, from just after \begin{document}
  const depth = [];
  let level = 0;
  for (let n = first; n <= last; n += 1) {
    depth[n] = level;
    level = Math.max(0, level + scans[n].delta);
  }
  depth[last + 1] = level;
  const gaps = [];
  if (first !== last) {
    for (let n = first; n <= last; n += 1) {
      if (!scans[n].unsafe) continue;
      let from = n;
      let to = n;
      while (from > first && depth[from] > 0) from -= 1;
      while (to < last && depth[to + 1] > 0) to += 1;
      const prev = gaps.at(-1);
      if (prev && from <= prev.to + 1) prev.to = Math.max(prev.to, to);
      else gaps.push({ from, to });
    }
  }
  // what goes into each line, at its place
  const inserts = lines.map(() => []);
  const at = (n, index, insert) => inserts[n].push({ index, insert });
  const open = '\\begin{jyutpingscope}';
  const close = '\\end{jyutpingscope}';
  const startsOpen = !gaps.some((gap) => gap.from === first);
  const endsOpen = !gaps.some((gap) => gap.to === last);
  const opening = scans[first].begin !== -1 ? scans[first].beginEnd : 0;
  if (scans[first].begin !== -1 && additions) at(first, scans[first].begin, additions);
  if (startsOpen) at(first, opening, open);
  for (const gap of gaps) {
    if (gap.from !== first) at(gap.from, 0, close);
    // on the next line: a fragile frame's or comment's end must be alone on its line
    if (gap.to !== last) at(gap.to + 1, 0, open);
  }
  // a scope is typeset once read whole, so TeX (its errors and SyncTeX) puts everything in it on the line that closes
  // it: one per paragraph, closed on the blank line after it, which ends the paragraph as the blank line did
  const inGap = (n) => gaps.some((gap) => n >= gap.from - 1 && n <= gap.to);
  for (let n = first + 1; n < last; n += 1) {
    if (!lines[n].trim() && lines[n - 1].trim() && !depth[n] && !inGap(n)) at(n, 0, close + open);
  }
  if (endsOpen) {
    const end = scans[last];
    at(last, end.close !== -1 ? end.close : end.endinput !== -1 ? end.endinput : end.end, close);
  }
  return lines.map((line, n) => {
    // from the right, so earlier places stay put; at one place, in the order added
    let out = line;
    const byPlace = [...inserts[n]].reverse().sort((a, b) => b.index - a.index);
    for (const { index, insert } of byPlace) out = out.slice(0, index) + insert + out.slice(index);
    return out;
  }).join('\n');
}

/** What auto mode adds before \begin{document}: the CJK package and font when the document has none, and xjyutping. */
export function autoAdditions(text, { options, cjkFont, engine, fontDir }) {
  const lines = String(text).split('\n');
  const begin = beginLine(lines);
  const codes = codeOf(lines.slice(0, begin === -1 ? lines.length : begin));
  let kind = cjkSupport(codes)?.kind ?? null;
  const out = [];
  if (!kind) {
    kind = engine === 'lualatex' ? 'luatexja-fontspec' : 'xeCJK';
    out.push(`\\usepackage{${kind}}`);
  }
  if (!codes.some((code) => code.match(FONT))) {
    // \setmainjfont is luatexja-fontspec's
    if (kind === 'luatexja') out.push('\\usepackage{luatexja-fontspec}');
    out.push(fontLine(cjkFont, kind, fontDir));
  }
  out.push(packageLine(options));
  return out.join('');
}
