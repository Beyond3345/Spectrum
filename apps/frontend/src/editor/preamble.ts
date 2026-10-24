// Which packages and TikZ libraries a document loads, and adding the ones a new snippet needs. Pure; checked in
// floats.check.ts.

/** Comments become spaces of the same length, so positions still match the source. \% isn't a comment; a % after \\ is. */
const blankComments = (src: string) => src.replace(/(^|[^\\])((?:\\\\)*)(%.*)$/gm, (_, a: string, b: string, c: string) => a + b + ' '.repeat(c.length));

const LOAD_RE = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g;
const LIBRARY_RE = /\\usetikzlibrary\s*\{([^}]+)\}/g;
const INPUT_RE = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g;
const PACKAGE_LINE = /^\s*\\(?:usepackage|RequirePackage|usetikzlibrary)\b/;
const BEGIN_DOCUMENT = /\\begin\s*\{document\}/;
const DOCUMENT_CLASS = /\\documentclass\s*(?:\[[^\]]*\]\s*)?\{[^}]*\}/;

/** What comes before \begin{document}, the only place packages load (not a \usepackage shown in verbatim). All of it when there's none. */
const preambleOf = (src: string) => {
  const at = blankComments(src).search(BEGIN_DOCUMENT);
  return at === -1 ? src : src.slice(0, at);
};

const loaded = (source: string, re: RegExp) => {
  const names = new Set<string>();
  for (const m of blankComments(source).matchAll(re)) for (const name of m[1].split(',')) if (name.trim()) names.add(name.trim());
  return names;
};

/** Packages loaded with \usepackage or \RequirePackage: options and comma lists too, commented-out lines not. */
export const loadedPackages = (source: string) => loaded(source, LOAD_RE);

/** TikZ libraries loaded with \usetikzlibrary, comma lists too, commented-out lines not. */
export const loadedLibraries = (source: string) => loaded(source, LIBRARY_RE);

export type PackageEdit = {
  source: string;
  added: string[];
  /** the insertion, for applying it to a live editor */
  change?: { from: number; insert: string };
  /** nothing was added because the source has no \begin{document} */
  noDocument?: boolean;
};

/**
 * Adds \usepackage{…} lines for the packages the source doesn't load yet, one per line, just before
 * \begin{document}, or straight after the \usepackage lines when only blank lines separate them from it.
 * first: on the line after \documentclass instead, for a package that wants to load before the others (standalone).
 */
export function addPackages(source: string, packages: string[], { first = false } = {}): PackageEdit {
  const have = loadedPackages(preambleOf(source));
  const wanted = [...new Set(packages)].filter((p) => !have.has(p));
  return addLines(source, wanted, wanted.map((p) => `\\usepackage{${p}}`), first);
}

/** Adds a \usetikzlibrary{…} line for the libraries the source doesn't load yet, where addPackages puts packages. */
export function addLibraries(source: string, libraries: string[]): PackageEdit {
  const have = loadedLibraries(preambleOf(source));
  const wanted = [...new Set(libraries)].filter((l) => !have.has(l));
  return addLines(source, wanted, wanted.length ? [`\\usetikzlibrary{${wanted.join(',')}}`] : [], false);
}

function addLines(source: string, added: string[], lines: string[], first: boolean): PackageEdit {
  if (!lines.length) return { source, added: [] };
  const blank = blankComments(source);
  const begin = blank.search(BEGIN_DOCUMENT);
  if (begin === -1) return { source, added: [], noDocument: true };
  const docClass = first ? DOCUMENT_CLASS.exec(blank.slice(0, begin)) : null;
  const classEnd = docClass ? blank.indexOf('\n', docClass.index + docClass[0].length) : -1;
  if (classEnd !== -1 && classEnd < begin) {
    const insert = lines.map((line) => `${line}\n`).join('');
    return { source: source.slice(0, classEnd + 1) + insert + source.slice(classEnd + 1), added, change: { from: classEnd + 1, insert } };
  }
  let at = blank.lastIndexOf('\n', begin - 1) + 1;
  // a one-line preamble (\documentclass{article}\begin{document}): the start of that line would be above \documentclass
  if (blank.slice(at, begin).trim()) {
    const insert = `\n${lines.map((line) => `${line}\n`).join('')}`;
    return { source: source.slice(0, begin) + insert + source.slice(begin), added, change: { from: begin, insert } };
  }
  let ref = at;
  // walk back over blank lines; a \usepackage line there takes the new lines after it
  for (let end = at; end > 0; ) {
    const start = blank.lastIndexOf('\n', end - 2) + 1;
    const line = blank.slice(start, end - 1);
    if (!line.trim()) {
      end = start;
      continue;
    }
    if (PACKAGE_LINE.test(line)) {
      at = end;
      ref = start;
    }
    break;
  }
  const indent = /^[ \t]*/.exec(source.slice(ref))![0];
  const insert = lines.map((line) => `${indent}${line}\n`).join('');
  return { source: source.slice(0, at) + insert + source.slice(at), added, change: { from: at, insert } };
}

/** The one change that turns before into after (what lies between their common start and end), for a live editor. */
export function changeBetween(before: string, after: string) {
  let from = 0;
  while (from < before.length && before[from] === after[from]) from += 1;
  let same = 0;
  while (same < before.length - from && same < after.length - from && before[before.length - 1 - same] === after[after.length - 1 - same]) same += 1;
  return { from, to: before.length - same, insert: after.slice(from, after.length - same) };
}

/**
 * Packages the main file and the .tex files its preamble pulls in (\input) load: a file pulled in after
 * \begin{document} (\include, \subfile) can't load one. A name is looked up from the main file's folder
 * first, then the project root, as the compile does. find: loadedLibraries for the TikZ libraries instead.
 */
export async function projectPackages(mainFile: string, texFiles: Set<string>, read: (path: string) => Promise<string>, find = loadedPackages) {
  const dir = mainFile.slice(0, mainFile.lastIndexOf('/') + 1);
  const names = new Set<string>();
  const queue = [mainFile];
  for (const path of queue) {
    const whole = await read(path).catch(() => '');
    const src = path === mainFile ? preambleOf(whole) : whole;
    find(src).forEach((n) => names.add(n));
    for (const m of blankComments(src).matchAll(INPUT_RE)) {
      const name = `${m[1].trim().replace(/^\.\//, '').replace(/\.tex$/i, '')}.tex`;
      const hit = [dir + name, name].find((p) => texFiles.has(p));
      if (hit && !queue.includes(hit)) queue.push(hit);
    }
  }
  return names;
}
