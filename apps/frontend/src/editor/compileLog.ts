import type { CompileError } from './EditorContext';
import { IS_WINDOWS } from '../app/platform';

// Turns a pdfLaTeX / XeLaTeX / LuaLaTeX / Latexmk / Tectonic log into error and warning cards.

// a Windows path starts with its drive, C:/…
const LOCATED = /^(?:\.\/)?((?:[A-Za-z]:)?[^\s:()][^:()\n]*\.[A-Za-z]{2,4}):(\d+):\s*(.*)$/;
const TECTONIC = /^(error|warning):\s*(.*)$/;
// Tectonic names \input files as written, without ".tex": "warning: sections/intro:2: …"
const TECTONIC_LOCATED = /^(?:\.\/)?((?:[A-Za-z]:)?[^\s:()][^:()\n]*):(\d+):\s*(.*)$/;
// A TeX pass runs from its banner to "Transcript written on" (Tectonic: to its next "note:")
const PASS_START = /^(This is (pdf|Xe|LuaHB|Lua|e-)?TeX, Version|note: (Re)?running TeX)/i;
const PASS_END = /^(Transcript written on|note: )/;
const LATEX_WARNING = /^(?:LaTeX|Package (\S+)|Class (\S+))(?: \w+)? Warning: (.*)$/;
const BOX = /^(?:Over|Under)full \\[hv]box\b.*?(?:at lines? (\d+)(?:--\d+)?)?$/;
const INPUT_LINE = /on input line (\d+)/;
// TeX opens a file with "(path" and closes it with ")"; paths may contain spaces (the project folder's name)
const BRACKET = /\(((?:\.{0,2}\/|\/)?[^()]*?\.(?:tex|sty|cls|cfg|def|clo|fd|ltx|bbl|aux|toc))(?=[\s()]|$)|[()]/g;

/** TeX hard-wraps its log at 79 characters (paths, messages, even line numbers); glue the pieces back. */
function unwrap(log: string) {
  const out: string[] = [];
  let carry = '';
  for (const line of log.split(/\r?\n/)) {
    carry += line;
    if (line.length === 79 && !/^(?:\[spectrum|Compiled )/.test(line)) continue;
    out.push(carry);
    carry = '';
  }
  if (carry) out.push(carry);
  return out;
}

/** Lines of every TeX pass but the last: their warnings are repeats or stale ("Citation … undefined" before BibTeX ran). */
function earlierPasses(lines: string[]) {
  const passes: [number, number][] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!PASS_START.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !PASS_END.test(lines[end])) end += 1;
    passes.push([i, end]);
    i = end - 1;
  }
  const early = new Set<number>();
  for (const [from, to] of passes.slice(0, -1)) for (let i = from; i < to; i += 1) early.add(i);
  return early;
}

/** The log's lines with TeX's wrapping undone, without the passes before the last (Preflight reads what parseCompileLog leaves out). */
export function lastPass(log: string) {
  const lines = unwrap(log);
  const early = earlierPasses(lines);
  return lines.filter((_, i) => !early.has(i));
}

/** Project-relative path: drops the project folder, the build folder and "./". */
function relative(file: string, root: string) {
  let path = file.replace(/^\.\//, '');
  // TeX is given the project folder with forward slashes on Windows too
  if (IS_WINDOWS) root = root.replace(/\\/g, '/');
  if (root && path.startsWith(`${root}/`)) path = path.slice(root.length + 1);
  return path.replace(/^.*?(^|\/)\.spectrum\/build\/[^/]+\//, '');
}

/** root: the project folder, so absolute paths in the log become project paths. */
export function parseCompileLog(log: string, root = ''): CompileError[] {
  if (!log) return [];
  const lines = unwrap(log);
  const early = earlierPasses(lines);
  let earlyLine = false;
  const found: CompileError[] = [];
  const loose: CompileError[] = [];
  // files TeX is reading, innermost last (null: a bracket that isn't a file)
  const files: (string | null)[] = [];
  // box warnings echo document text until a blank line, errors on "l.N …" and the line after: its brackets don't nest files
  let echo: 'box' | number = 0;
  /** The .tex file being read, for messages that only give a line ("on input line 3"). */
  const texFile = () => {
    const file = files.filter(Boolean).pop();
    return file && /\.tex$/i.test(file) ? file : undefined;
  };

  const push = (severity: CompileError['severity'], message: string, raw: string, line?: number, file?: string) => {
    if (severity === 'warning' && earlyLine) return;
    message = message.trim();
    if (message) found.push({ severity, message, raw, ...(line ? { line } : null), ...(file ? { file: relative(file, root) } : null) });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      if (echo === 'box') echo = 0;
      continue;
    }
    earlyLine = early.has(i);
    if (PASS_START.test(line)) files.length = 0;
    if (/^l\.\d+/.test(line)) echo = 2;
    if (typeof echo === 'number' && echo > 0) echo -= 1;
    else if (echo === 0) {
      for (const m of line.matchAll(BRACKET)) {
        if (m[0] === ')') files.pop();
        else files.push(m[1] ?? null);
      }
    }

    // the backend's own explanations (biber mismatch, timeouts, a linked document that failed)
    // [spectrum note]: only for the log, such as the engine Jyutping switched to
    if (line.startsWith('[spectrum note] ')) continue;
    const note = line.match(/^\[spectrum( warning)?\] (.*)/);
    if (note) {
      push(note[1] ? 'warning' : 'error', note[2], line);
      continue;
    }

    const tect = line.match(TECTONIC);
    if (tect) {
      const severity = tect[1] as CompileError['severity'];
      const at = tect[2].match(TECTONIC_LOCATED);
      if (at) {
        const box = at[3].match(BOX);
        push(severity, at[3], line, Number(box?.[1] || at[2]), at[1]);
      } else if (severity === 'error' && !/its output follows|^caused by/.test(tect[2])) {
        // "error: the XeTeX engine had an unrecoverable error": only useful when nothing better was found
        loose.push({ severity, message: tect[2].trim(), raw: line });
      }
      continue;
    }

    const at = line.match(LOCATED);
    if (at) {
      push('error', at[3], line, Number(at[2]), at[1]);
      continue;
    }

    if (line.startsWith('!')) {
      const message = line.replace(/^!+\s*/, '');
      if (/^==> Fatal error occurred/.test(message)) continue;
      let lineNo: number | undefined;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) {
          lineNo = Number(m[1]);
          break;
        }
      }
      push('error', message, line, lineNo, texFile());
      continue;
    }

    const warn = line.match(LATEX_WARNING);
    if (warn) {
      let text = line;
      let end = i;
      // package warnings continue on lines that start with "(pkgname)"
      const pkg = warn[1] || warn[2];
      while (pkg && end + 1 < lines.length && lines[end + 1].startsWith(`(${pkg})`)) {
        end += 1;
        text += ` ${lines[end].slice(pkg.length + 2).trim()}`;
      }
      const message = text.replace(/^.*? Warning: /, '');
      push('warning', message, text, Number(message.match(INPUT_LINE)?.[1]) || undefined, texFile());
      i = end;
      continue;
    }

    const box = line.match(BOX);
    if (box) {
      push('warning', line, line, box[1] ? Number(box[1]) : undefined, texFile());
      echo = 'box';
      continue;
    }

    // BibTeX / Biber
    if (/^I couldn't open (database|style|auxiliary) file /.test(line)) {
      push('error', line, line);
      continue;
    }
    const bib = line.match(/^(?:Warning--|WARN - )(.*)$/) || line.match(/^(ERROR) - (.*)$/);
    if (bib) push(bib[1] === 'ERROR' ? 'error' : 'warning', bib[2] ?? bib[1], line);
  }

  if (!found.some((e) => e.severity === 'error')) found.push(...loose);

  // Tectonic repeats every warning once per pass, and TeX's own "! …" block repeats Tectonic's located error
  const seen = new Set<string>();
  const unique = found.filter((e) => {
    const key = `${e.severity}|${e.line ?? ''}|${e.message.toLowerCase().replace(/\.$/, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...unique.filter((e) => e.severity === 'error'), ...unique.filter((e) => e.severity === 'warning')];
}

/**
 * The project file a log location means. TeX runs in the main file's folder, so "./main.tex" or
 * Tectonic's "sections/intro" are relative to it; files found through the project root are already
 * project paths.
 */
export function projectFile(file: string, mainFile: string, files: string[]) {
  const dir = mainFile.includes('/') ? mainFile.slice(0, mainFile.lastIndexOf('/') + 1) : '';
  const normalise = (p: string) =>
    p.split('/').reduce<string[]>((acc, part) => (part === '..' ? acc.slice(0, -1) : part && part !== '.' ? [...acc, part] : acc), []).join('/');
  const known = new Set(files);
  const candidates = [dir + file, `${dir}${file}.tex`, file, `${file}.tex`].map(normalise);
  return candidates.find((c) => known.has(c)) ?? file;
}
