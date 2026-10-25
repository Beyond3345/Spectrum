// LaTeX for the Floats panel's Insert figure, Insert diagram and Insert table cards. Pure; checked in floats.check.ts.

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
export function uniqueName(name: string, paths: string[], dir = 'images') {
  const taken = new Set(paths.map((p) => p.toLowerCase()));
  const dot = name.lastIndexOf('.');
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? name : `${name.slice(0, dot)}-${n}${name.slice(dot)}`;
    if (!taken.has(`${dir}/${candidate}`.toLowerCase())) return candidate;
  }
}

/** fig:name for images/name.png */
export const figureLabel = (path: string) => `fig:${slug(path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')) || 'figure'}`;

/** tab: and the caption's first words, or none: every caption-less table sharing tab:table would clash */
export const tableLabel = (caption: string) => {
  const words = caption.replace(/\\[A-Za-z]+/g, ' ').toLowerCase().match(/[a-z0-9]+/g);
  return words ? `tab:${words.slice(0, 3).join('-')}` : '';
};

/** 1 → \linewidth, 0.75 → 0.75\linewidth */
export const widthArg = (fraction: number) => (fraction >= 1 ? '\\linewidth' : `${+fraction.toFixed(2)}\\linewidth`);

// a blank line inside \caption{} is a paragraph break, which LaTeX refuses there
const oneLine = (text: string) => text.trim().replace(/\s*\n\s*/g, ' ');
/** The placement letters, what each asks of LaTeX, for the toggles and their key. H stands alone. */
export const PLACEMENT_LETTERS: [letter: string, name: string, meaning: string][] = [
  ['H', 'Exactly here', 'exactly here, no longer floating (needs the float package, which is added)'],
  ['h', 'Here', 'roughly here in the text, if there is room on the page'],
  ['t', 'Top', 'at the top of a page'],
  ['b', 'Bottom', 'at the bottom of a page'],
  ['p', 'Page of floats', 'on a separate page that holds only floats'],
  ['!', 'Override', 'ignore LaTeX’s limits on how many floats a page holds and how much of it they fill']
];

/**
 * The chosen letters in LaTeX's usual order (!htbp), or H on its own. A float across both columns
 * (figure*, table*) only goes at the top of a page or on a page of floats, so it keeps just !, t and p.
 */
export function placementOf(letters: string, span = false) {
  if (letters.includes('H')) return span ? '' : 'H';
  return [...(span ? '!tp' : '!htbp')].filter((letter) => letters.includes(letter)).join('');
}

const placed = (placement: string) => (placement ? `[${placement}]` : '');
const labelLine = (label: string, indent: string) => (label.trim() ? [`${indent}\\label{${label.trim()}}`] : []);

export type FigureOptions = { path: string; width: number; caption: string; label: string; placement: string; /** figure* across both columns */ span?: boolean };

const figureFloat = (o: Omit<FigureOptions, 'width'>, body: string) =>
  [
    `\\begin{figure${o.span ? '*' : ''}}${placed(placementOf(o.placement, o.span))}`,
    '    \\centering',
    `    ${body}`,
    `    \\caption{${escapeCell(oneLine(o.caption))}}`,
    ...labelLine(o.label, '    '),
    `\\end{figure${o.span ? '*' : ''}}`
  ].join('\n');

// a tall image (a phone screenshot) at the chosen width would run off the page, which [H] can't help
export const figureLatex = (o: FigureOptions) =>
  figureFloat(o, `\\includegraphics[width=${widthArg(o.width)},height=0.8\\textheight,keepaspectratio]{${o.path}}`);

/**
 * A TikZ diagram (figures/name.tex, a standalone document) through \includestandalone, so its labels take the
 * document's fonts: at its own size when width is null (scaling a circuit scales its lines and text too).
 */
export const diagramLatex = (o: Omit<FigureOptions, 'width'> & { width: number | null }) =>
  figureFloat(o, `\\includestandalone${o.width === null ? '' : `[width=${widthArg(o.width)}]`}{${o.path.replace(/\.tex$/i, '')}}`);

export type TableLines = 'booktabs' | 'grid' | 'minimal';

export type TableModel = {
  cells: string[][];
  env: 'tabular' | 'tabularx';
  /** l, c or r per column, and X in tabularx */
  align: string[];
  lines: TableLines;
  header: boolean;
  /** wrap in a table environment with \centering, a caption and a label */
  float: boolean;
  placement: string;
  /** table* across both columns */
  span?: boolean;
  caption: string;
  label: string;
  escape: boolean;
};

export const defaultAlign = (env: TableModel['env'], column: number) => (env === 'tabularx' ? 'X' : column === 0 ? 'l' : 'c');

// < > | print as ¡ ¿ — in pdfLaTeX's default font encoding
const ESCAPES: Record<string, string> = {
  '&': '\\&',
  '%': '\\%',
  '#': '\\#',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}'
};

// a key, label, URL or path: a_b there is part of the name, not text to escape
const KEYED = /^\\(?:[A-Za-z]*ref|label|[cC]ite[A-Za-z]*|url|href|includegraphics)\*?(?:\s*\[[^\]]*\])*\s*\{[^}]*\}/;

/**
 * & % # _ ~ ^ < > | outside maths ($…$, $$…$$, \(…\)) become their escaped forms, and so does a $ that can't
 * open maths ($5). Commands (\textbf, \&), braces, the keys of \ref, \cite, \url and the like, and a ~ tie
 * before a command (Table~\ref) are left as they are.
 */
export function escapeCell(text: string) {
  let out = '';
  let math = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const keyed = ch === '\\' ? KEYED.exec(text.slice(i)) : null;
    if (keyed) {
      out += keyed[0];
      i += keyed[0].length - 1;
    } else if (ch === '\\') {
      if (text[i + 1] === '(' || text[i + 1] === ')') math = text[i + 1] === '(';
      out += ch + (text[i + 1] ?? '');
      i += 1;
    } else if (ch === '$') {
      // $$ opens or closes display maths as a pair
      const pair = text[i + 1] === '$';
      const len = pair ? 2 : 1;
      const close = text.indexOf(pair ? '$$' : '$', i + len);
      // pandoc's rule for money: no closing $, a space inside either $, or a digit straight after the closing one
      const money = !math && (close === -1 || /\s/.test(text[i + len]) || /\s/.test(text[close - 1]) || /\d/.test(text[close + len] ?? ''));
      out += money ? (pair ? '\\$\\$' : '\\$') : pair ? '$$' : '$';
      if (!money) math = !math;
      i += len - 1;
    } else if (ch === '~' && text[i + 1] === '\\') {
      out += ch;
    } else {
      out += !math && ESCAPES[ch] ? ESCAPES[ch] : ch;
    }
  }
  return out;
}

// grid has a rule under every row, so its header gets a double one
const RULES: Record<TableLines, [top: string, header: string, bottom: string]> = {
  booktabs: ['\\toprule', '\\midrule', '\\bottomrule'],
  grid: ['\\hline', '\\hline\\hline', '\\hline'],
  minimal: ['\\hline', '\\hline', '\\hline']
};

export function tableLatex(m: TableModel) {
  const align = m.align.slice();
  // tabularx needs a column that takes up the rest of the width
  if (m.env === 'tabularx' && !align.includes('X')) align[align.length - 1] = 'X';
  const spec = m.lines === 'grid' ? `|${align.join('|')}|` : align.join('');
  const [top, header, bottom] = RULES[m.lines];
  const rows: string[] = [top];
  m.cells.forEach((row, i) => {
    const line = row.map((cell) => (m.escape ? escapeCell(oneLine(cell)) : oneLine(cell))).join(' & ');
    // \\ (and \toprule, \midrule) would take a leading [1] as its optional argument, and a * as its star
    rows.push(`${/^[[*]/.test(line) ? '{}' : ''}${line} \\\\`);
    if (i === m.cells.length - 1) rows.push(bottom);
    else if (m.header && i === 0) rows.push(header);
    else if (m.lines === 'grid') rows.push(top);
  });
  const tabular = [
    m.env === 'tabularx' ? `\\begin{tabularx}{\\linewidth}{${spec}}` : `\\begin{tabular}{${spec}}`,
    ...rows.map((line) => `    ${line}`),
    `\\end{${m.env}}`
  ];
  // on its own, not inline in the paragraph around it, and without its indent pushing tabularx into the margin
  if (!m.float) return ['\\begin{center}', ...tabular.map((line) => `    ${line}`), '\\end{center}'].join('\n');
  return [
    `\\begin{table${m.span ? '*' : ''}}${placed(placementOf(m.placement, m.span))}`,
    '    \\centering',
    `    \\caption{${m.escape ? escapeCell(oneLine(m.caption)) : oneLine(m.caption)}}`,
    ...labelLine(m.label, '    '),
    ...tabular.map((line) => `    ${line}`),
    `\\end{table${m.span ? '*' : ''}}`
  ].join('\n');
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

// ─── Typst and Markdown figures and tables ───

/** Typst's content text, with ] and \ escaped so they stay text. */
const typstText = (text: string) => oneLine(text).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');

const typstFloat = (body: string, caption: string, label: string) =>
  '#figure(' + body + (caption.trim() ? ', caption: [' + typstText(caption) + ']' : '') + ')' + (label.trim() ? ' <' + label.trim() + '>' : '');

export type FigureTextOptions = { path: string; width: number; caption: string; label: string };

/** A Typst figure: #figure(image("path", width: 80%), caption: [caption]) <label>. */
export const figureTypst = (o: FigureTextOptions) =>
  typstFloat('image(' + JSON.stringify(o.path) + ', width: ' + Math.round(Math.max(0, Math.min(1, o.width)) * 100) + '%)', o.caption, o.label);

/** A Typst diagram file included as a figure: #figure(include "figures/x.typ", caption: [caption]) <label>. */
export const figureTypstInclude = (o: { path: string; caption: string; label: string }) => typstFloat('include ' + JSON.stringify(o.path), o.caption, o.label);

/** A Typst table, its header row as table.header when the model has one. */
export function tableTypst(m: TableModel) {
  const cols = Math.max(1, ...m.cells.map((row) => row.length));
  const row = (cells: string[]) => Array.from({ length: cols }, (_, i) => '[' + typstText(cells[i] ?? '') + ']').join(', ');
  const parts = ['columns: ' + cols];
  if (m.header && m.cells.length) parts.push('table.header(' + row(m.cells[0]) + ')');
  parts.push(...(m.header ? m.cells.slice(1) : m.cells).map(row));
  const table = 'table(' + parts.join(', ') + ')';
  return m.float ? typstFloat(table, m.caption, m.label) : table;
}

/** A Markdown image with its label and width: ![caption](path){#label width=80%}. */
export const figureMarkdown = (o: FigureTextOptions) => {
  const caption = oneLine(o.caption).replace(/[[\]]/g, '\\$&');
  return '![' + caption + '](' + o.path + '){' + (o.label.trim() ? '#' + o.label.trim() + ' ' : '') + 'width=' + Math.round(Math.max(0, Math.min(1, o.width)) * 100) + '%}';
};

/** A Markdown pipe table, with Table: caption {#label} under it. */
export function tableMarkdown(m: TableModel) {
  const cols = Math.max(1, ...m.cells.map((row) => row.length));
  const cell = (value?: string) => oneLine(value ?? '').replace(/\|/g, '\\|');
  const row = (cells: string[]) => '| ' + Array.from({ length: cols }, (_, i) => cell(cells[i])).join(' | ') + ' |';
  const header = m.header && m.cells.length ? m.cells[0] : Array.from({ length: cols }, () => '');
  const body = m.header ? m.cells.slice(1) : m.cells;
  const lines: string[] = [row(header), '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |', ...body.map(row)];
  if (m.float && (m.caption.trim() || m.label.trim())) lines.push('', 'Table: ' + m.caption.trim() + (m.label.trim() ? ' {#' + m.label.trim() + '}' : ''));
  return lines.join(String.fromCharCode(10));
}

