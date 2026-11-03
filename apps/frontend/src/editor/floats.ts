// LaTeX for the Floats panel's Insert figure, Insert diagram and Insert table cards. Pure; checked in floats.check.ts.
// The writers themselves live in the backend's latex/floats.js, which the converter uses too.
import { fitMerges, tableNotes } from '../../../backend/src/latex/floats.js';
import type { FigureSet, TableEnv, TableMerge, TableModel } from '../../../backend/src/latex/floats.js';

export * from '../../../backend/src/latex/floats.js';

const KEEP = ['png', 'jpg', 'jpeg', 'pdf', 'eps'];
const CONVERT = ['gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg'];

export const extOf = (name: string) => /\.([^./]+)$/.exec(name)?.[1].toLowerCase() || '';

/**
 * keep: pdfLaTeX, XeLaTeX and LuaLaTeX read it as it is (EPS through epstopdf). convert: drawn to PNG first.
 * null: not an image.
 */
export function figureKind(name: string, type: string): 'keep' | 'convert' | null {
  const ext = extOf(name);
  if (KEEP.includes(ext)) return 'keep';
  if (CONVERT.includes(ext) || type.startsWith('image/')) return 'convert';
  return null;
}

// letters, digits, - and _ only: spaces, dots, brackets and the like become '-', accents are dropped
const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

/** A file name LaTeX is happy with, ending in .ext (a typed .ext isn't doubled). */
export const safeFileName = (typed: string, ext: string) => `${slug(typed.trim().replace(new RegExp(`\\.${ext}$`, 'i'), '')) || 'image'}.${ext}`;

/** name, or name-2, name-3… when dir already has it. Any letter case counts: macOS file names ignore it. */
export function uniqueName(name: string, paths: string[], dir = 'figures') {
  const taken = new Set(paths.map((p) => p.toLowerCase()));
  const dot = name.lastIndexOf('.');
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? name : `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
    if (!taken.has(`${dir}/${candidate}`.toLowerCase())) return candidate;
  }
}

/** fig:name for figures/name.png */
export const figureLabel = (path: string) => `fig:${slug(path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')) || 'figure'}`;

/** tab: and the caption's first words, or none: every caption-less table sharing tab:table would clash */
export const tableLabel = (caption: string) => {
  const words = caption.replace(/\\[A-Za-z]+/g, ' ').toLowerCase().match(/[a-z0-9]+/g);
  return words ? `tab:${words.slice(0, 3).join('-')}` : '';
};

/** The placement letters, what each asks of LaTeX, for the toggles and their key. H stands alone. */
export const PLACEMENT_LETTERS: [letter: string, name: string, meaning: string][] = [
  ['H', 'Exactly here', 'exactly here, no longer floating (needs the float package, which is added)'],
  ['h', 'Here', 'roughly here in the text, if there is room on the page'],
  ['t', 'Top', 'at the top of a page'],
  ['b', 'Bottom', 'at the bottom of a page'],
  ['p', 'Page of floats', 'on a separate page that holds only floats'],
  ['!', 'Override', 'ignore LaTeX’s limits on how many floats a page holds and how much of it they fill']
];

/** fig: and the caption's first words, or the first panel's file name. */
export const figureSetLabel = (caption: string, firstPath = '') => {
  const fromCaption = tableLabel(caption);
  return fromCaption ? `fig:${fromCaption.slice(4)}` : firstPath ? figureLabel(firstPath) + '-set' : '';
};

/** The packages a set of figures needs, apart from float for [H]. */
export const figureSetPackages = (f: Pick<FigureSet, 'labels'>) => ['graphicx', ...(f.labels === 'sub' ? ['subcaption'] : [])];

export const defaultAlign = (env: TableEnv, column: number) => (env !== 'tabular' ? 'X' : column === 0 ? 'l' : 'c');

/** merges with block added; any merge it overlaps is taken into it. */
export function withMerge(merges: TableMerge[] | undefined, block: TableMerge) {
  const overlaps = (g: TableMerge) => g.r < block.r + block.rows && block.r < g.r + g.rows && g.c < block.c + block.cols && block.c < g.c + g.cols;
  let grown = block;
  for (const g of merges ?? []) {
    if (!overlaps(g)) continue;
    const r = Math.min(grown.r, g.r);
    const c = Math.min(grown.c, g.c);
    grown = { r, c, rows: Math.max(grown.r + grown.rows, g.r + g.rows) - r, cols: Math.max(grown.c + grown.cols, g.c + g.cols) - c };
  }
  return [...(merges ?? []).filter((g) => !overlaps(g)), grown];
}

/** The packages a table's LaTeX needs, apart from float for [H]. */
export function tablePackages(m: TableModel) {
  const merges = fitMerges(m.merges, m.cells.length, m.align.length);
  return [
    ...(m.lines === 'booktabs' ? ['booktabs'] : []),
    ...(m.env !== 'tabular' ? [m.env] : []),
    ...(m.align.includes('S') ? ['siunitx'] : []),
    ...(merges.some((g) => g.rows > 1) ? ['multirow'] : []),
    ...(m.breaks && m.cells.some((row) => row.some((c) => c.includes('\\\\'))) ? ['makecell'] : []),
    ...(m.env !== 'xltabular' && tableNotes(m.notes).length ? ['threeparttable'] : [])
  ];
}

/** Rows of cells from text copied out of Numbers or Excel (tab-separated) or a CSV file (commas, "quoted" cells). */
export function parseDelimited(text: string) {
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const delim = src.includes('\t') ? '\t' : ',';
  const rows: string[][] = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim || ch === '\n') {
      rows[rows.length - 1].push(cell);
      cell = '';
      if (ch === '\n') rows.push([]);
    } else cell += ch;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

/** cells with block pasted in from row r, column c, growing the grid to fit. */
export function pasteCells(cells: string[][], r: number, c: number, block: string[][]) {
  const rows = Math.max(cells.length, r + block.length);
  const cols = Math.max(cells[0]?.length ?? 0, c + Math.max(...block.map((b) => b.length)));
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => block[i - r]?.[j - c] ?? cells[i]?.[j] ?? ''));
}

/**
 * The text that puts block on its own lines in place of doc[from, to]: every line at the indent of the
 * line the cursor is on, and what was before or after the cursor on that line kept on lines of its own.
 */
export function blockAt(doc: string, from: number, to: number, block: string) {
  const start = doc.lastIndexOf('\n', from - 1) + 1;
  const end = doc.indexOf('\n', to) === -1 ? doc.length : doc.indexOf('\n', to);
  const before = doc.slice(start, from);
  const indent = /^[ \t]*/.exec(doc.slice(start))![0];
  // the cursor sits in the line's indent: the block starts there, and the rest of the line follows it as it was
  const inIndent = !before.trim();
  const lead = inIndent ? indent.slice(before.length) : `\n${indent}`;
  const trail = doc.slice(to, end).trim() ? `\n${inIndent ? before : indent}` : '';
  return lead + block.split('\n').join(`\n${indent}`) + trail;
}

/**
 * The EXIF Orientation of a JPEG's first bytes: 1 is upright, 2–8 flipped or turned. Browsers show the photo
 * turned as the tag says; pdfLaTeX ignores the tag, so a portrait phone photo would come out sideways.
 */
export function jpegOrientation(bytes: ArrayBuffer) {
  try {
    const v = new DataView(bytes);
    if (v.getUint16(0) !== 0xffd8) return 1;
    // the segments before the image data, each a marker and a length; EXIF is an APP1 (ffe1) starting "Exif"
    for (let p = 2; p + 10 < v.byteLength; p += 2 + v.getUint16(p + 2)) {
      if (v.getUint16(p) !== 0xffe1 || v.getUint32(p + 4) !== 0x45786966) continue;
      const tiff = p + 10;
      const le = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, le);
      for (let i = 0, n = v.getUint16(ifd, le); i < n; i += 1) if (v.getUint16(ifd + 2 + i * 12, le) === 0x0112) return v.getUint16(ifd + 10 + i * 12, le);
      return 1;
    }
  } catch {
    // cut off or malformed: treat it as upright
  }
  return 1;
}
