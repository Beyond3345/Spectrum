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

/**
 * The order packages load in, from docs/LATEX_STYLE.md: references, page, maths, figures and tables, code, then links.
 * A package added to a document goes into its place in this order among the ones the document already loads.
 */
export const PACKAGE_ORDER = [
  // references
  'csquotes',
  'biblatex',
  'xurl',
  // page
  'geometry',
  'parskip',
  'setspace',
  'babel',
  'iftex',
  'fontenc',
  'lmodern',
  'microtype',
  // maths
  'amsmath',
  'amssymb',
  'mathtools',
  'amsthm',
  // figures and tables
  'graphicx',
  'subcaption',
  'float',
  'booktabs',
  'tabularx',
  'xltabular',
  'siunitx',
  'multirow',
  'makecell',
  'threeparttable',
  'tikz',
  'pgfplots',
  'pgfplotstable',
  'circuitikz',
  'tikz-cd',
  // code
  'xcolor',
  'listings',
  'algorithm',
  'algpseudocode',
  // links
  'hyperref',
  'cleveref'
];
const rankOf = (name: string) => PACKAGE_ORDER.indexOf(name);

export type PackageEdit = {
  source: string;
  added: string[];
  /** the change that made it (all the insertions, from the first to the last), for applying it to a live editor */
  change?: { from: number; to: number; insert: string };
  /** nothing was added because the source has no \begin{document} */
  noDocument?: boolean;
};

/**
 * Adds a \usepackage{…} line for each package the source doesn't load yet, in its place in PACKAGE_ORDER: before the
 * first package the document loads that comes after it (and above that package's comment heading and the blank line
 * over it, so it ends its own group). When none does, or the document's own order doesn't allow it, or the package
 * isn't in the order, it goes after the last \usepackage line; with none, just before \begin{document}.
 * first: on the line after \documentclass instead, for a package that wants to load before the others (standalone).
 */
export function addPackages(source: string, packages: string[], { first = false } = {}): PackageEdit {
  const have = loadedPackages(preambleOf(source));
  const wanted = [...new Set(packages)].filter((p) => !have.has(p));
  if (first || !wanted.length) return addLines(source, wanted, wanted.map((p) => `\\usepackage{${p}}`), first);
  // known packages first, in order, so each one placed is there for the next to line up against
  const ordered = [...wanted.filter((p) => rankOf(p) !== -1).sort((a, b) => rankOf(a) - rankOf(b)), ...wanted.filter((p) => rankOf(p) === -1)];
  let result = source;
  for (const name of ordered) {
    const placed = placePackage(result, name);
    if (placed.noDocument) return { source, added: [], noDocument: true };
    result = placed.source;
  }
  const { from, to, insert } = changeBetween(source, result);
  return { source: result, added: wanted, change: { from, to, insert } };
}

type PackageLine = { start: number; end: number; ranks: number[]; text: string };

/** The preamble's own \usepackage and \RequirePackage lines: where each starts and ends, and its packages' ranks. */
function packageLines(source: string) {
  const blank = blankComments(preambleOf(source));
  const found: PackageLine[] = [];
  for (let start = 0; start < blank.length; ) {
    const end = blank.indexOf('\n', start) === -1 ? blank.length : blank.indexOf('\n', start);
    const text = blank.slice(start, end);
    // a whole line that loads packages, not a one-line preamble with \documentclass and the rest on it
    if (/^\s*\\(?:usepackage|RequirePackage)\b/.test(text) && !DOCUMENT_CLASS.test(text)) {
      const ranks = [...loadedPackages(text)].map(rankOf).filter((r) => r !== -1);
      found.push({ start, end, ranks, text });
    }
    start = end + 1;
  }
  return found;
}

function placePackage(source: string, name: string): PackageEdit {
  const lines = packageLines(source);
  const line = `\\usepackage{${name}}`;
  if (!lines.length) return addLines(source, [name], [line], false);
  const rank = rankOf(name);
  const blank = blankComments(source);
  const insertAt = (at: number, ref: PackageLine) => {
    const insert = `${/^[ \t]*/.exec(ref.text)![0]}${line}\n`;
    return { source: source.slice(0, at) + insert + source.slice(at), added: [name] };
  };
  const after = (ref: PackageLine) => insertAt(ref.end + 1, ref);
  const last = lines[lines.length - 1];
  if (rank === -1) return after(last);
  const next = lines.findIndex((l) => l.ranks.some((r) => r > rank));
  // a package before the next one, but loaded after it, means the document's order isn't the guide's
  const earlier = lines.map((l, i) => (l.ranks.some((r) => r < rank) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  if (next === -1 || earlier > next) return after(last);
  // up over the next package's comment heading and the blank lines above it, but not past the package before it
  let at = lines[next].start;
  const floor = earlier === -1 ? (DOCUMENT_CLASS.exec(blank)?.index ?? 0) : lines[earlier].end + 1;
  for (const skip of [/^\s*%/, /^\s*$/]) {
    while (at > floor) {
      const prev = source.lastIndexOf('\n', at - 2) + 1;
      if (prev < floor || !skip.test(source.slice(prev, at - 1))) break;
      at = prev;
    }
  }
  return insertAt(at, lines[next]);
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
    return { source: source.slice(0, classEnd + 1) + insert + source.slice(classEnd + 1), added, change: { from: classEnd + 1, to: classEnd + 1, insert } };
  }
  let at = blank.lastIndexOf('\n', begin - 1) + 1;
  // a one-line preamble (\documentclass{article}\begin{document}): the start of that line would be above \documentclass
  if (blank.slice(at, begin).trim()) {
    const insert = `\n${lines.map((line) => `${line}\n`).join('')}`;
    return { source: source.slice(0, begin) + insert + source.slice(begin), added, change: { from: begin, to: begin, insert } };
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
  return { source: source.slice(0, at) + insert + source.slice(at), added, change: { from: at, to: at, insert } };
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
