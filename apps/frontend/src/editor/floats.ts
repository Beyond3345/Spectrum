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

export type FigureOptions = {
  path: string;
  width: number;
  caption: string;
  label: string;
  placement: string;
  /** figure* across both columns */
  span?: boolean;
  /** how the image is sized; without it, width as a share of the line */
  size?: FigureSize;
};

/**
 * How an image is sized: a share of the line (or of its panel), an exact width or height in mm, a box in mm it fits
 * inside without stretching, or a scale of its own size. trim crops mm off the left, bottom, right and top.
 */
export type FigureSize = {
  mode: 'line' | 'width' | 'height' | 'box' | 'scale';
  fraction: number;
  width: number;
  height: number;
  scale: number;
  trim?: [number, number, number, number] | null;
};

export type FigurePanel = { path: string; caption: string; label: string };

/**
 * Several images in one figure: in one row or a grid of columns, as sub-figures (a), (b) with subcaption, as separate
 * figures each with its own number, or under the one caption alone. align lines up panels of different heights.
 */
export type FigureSet = {
  panels: FigurePanel[];
  layout: 'row' | 'grid';
  columns: number;
  labels: 'sub' | 'separate' | 'none';
  align: 'top' | 'bottom' | 'centre';
  size: FigureSize;
  caption: string;
  label: string;
  placement: string;
  span?: boolean;
};

// mm as LaTeX writes them: 60mm, 12.5mm
const mm = (n: number) => `${+(+n || 0).toFixed(1)}mm`;

/** \includegraphics' options for a size; a share of the line is of \linewidth, which in a panel is the panel's width. */
export function graphicsOptions(size: FigureSize, single = false) {
  const options =
    size.mode === 'width'
      ? `width=${mm(size.width)}`
      : size.mode === 'height'
        ? `height=${mm(size.height)}`
        : size.mode === 'box'
          ? `width=${mm(size.width)},height=${mm(size.height)},keepaspectratio`
          : size.mode === 'scale'
            ? `scale=${+(+size.scale || 1).toFixed(2)}`
            : // a tall image (a phone screenshot) at the chosen width would run off the page, which [H] can't help
              `width=${widthArg(size.fraction)}${single ? ',height=0.8\\textheight,keepaspectratio' : ''}`;
  const t = size.trim;
  return t && t.some((n) => +n > 0) ? `${options},trim=${mm(t[0])} ${mm(t[1])} ${mm(t[2])} ${mm(t[3])},clip` : options;
}

/** A panel's width as a share of the line, for n side by side with a small gap between: 0.48 for two, 0.31 for three. */
export const panelWidth = (n: number) => Math.floor(((1 - 0.03 * (Math.max(1, n) - 1)) / Math.max(1, n)) * 100) / 100;

/** fig: and the caption's first words, or the first panel's file name. */
export const figureSetLabel = (caption: string, firstPath = '') => {
  const fromCaption = tableLabel(caption);
  return fromCaption ? `fig:${fromCaption.slice(4)}` : firstPath ? figureLabel(firstPath) + '-set' : '';
};

/**
 * Several images in one figure. Sub-figures use subcaption's subfigure; separate figures and an uncaptioned set use a
 * minipage each. A panel lines up on its first line, which for an image is its bottom edge, so top alignment starts the
 * image with a zero-height line (\vtop with \vskip0pt) and centre uses [c].
 */
export function figureSetLatex(f: FigureSet) {
  const n = f.layout === 'row' ? f.panels.length : Math.max(1, Math.min(f.columns, f.panels.length));
  const env = f.labels === 'sub' ? 'subfigure' : 'minipage';
  const pos = f.align === 'centre' ? 'c' : 't';
  const graphic = (path: string) => {
    const image = `\\includegraphics[${graphicsOptions(f.size)}]{${path}}`;
    return f.align === 'top' ? `\\vtop{\\vskip0pt\\hbox{${image}}}` : image;
  };
  const lines: string[] = [];
  f.panels.forEach((panel, i) => {
    const captioned = f.labels !== 'none';
    lines.push(
      `\\begin{${env}}[${pos}]{${widthArg(panelWidth(n))}}`,
      '    \\centering',
      `    ${graphic(panel.path)}`,
      ...(captioned ? [`    \\caption{${escapeCell(oneLine(panel.caption))}}`, ...labelLine(panel.label, '    ')] : []),
      // between panels in a row a stretch of space, and at the end of a row a new line with a little space
      `\\end{${env}}${i === f.panels.length - 1 ? '' : (i + 1) % n === 0 ? '\n\\par\\medskip' : '\\hfill'}`
    );
  });
  const body = lines.join('\n').split('\n');
  const main = f.labels === 'separate' ? [] : [`\\caption{${escapeCell(oneLine(f.caption))}}`, ...labelLine(f.label, '')];
  return [
    `\\begin{figure${f.span ? '*' : ''}}${placed(placementOf(f.placement, f.span))}`,
    '    \\centering',
    ...[...body, ...main].map((line) => `    ${line}`),
    `\\end{figure${f.span ? '*' : ''}}`
  ].join('\n');
}

/** The packages a set of figures needs, apart from float for [H]. */
export const figureSetPackages = (f: Pick<FigureSet, 'labels'>) => ['graphicx', ...(f.labels === 'sub' ? ['subcaption'] : [])];

const figureFloat = (o: Omit<FigureOptions, 'width'>, body: string) =>
  [
    `\\begin{figure${o.span ? '*' : ''}}${placed(placementOf(o.placement, o.span))}`,
    '    \\centering',
    `    ${body}`,
    `    \\caption{${escapeCell(oneLine(o.caption))}}`,
    ...labelLine(o.label, '    '),
    `\\end{figure${o.span ? '*' : ''}}`
  ].join('\n');

export const figureLatex = (o: FigureOptions) =>
  figureFloat(o, `\\includegraphics[${graphicsOptions(o.size ?? { mode: 'line', fraction: o.width, width: 0, height: 0, scale: 1 }, true)}]{${o.path}}`);

/**
 * A TikZ diagram (diagrams/name.tex, a standalone document) through \includestandalone, so its labels take the
 * document's fonts: at its own size when width is null (scaling a circuit scales its lines and text too).
 */
export const diagramLatex = (o: Omit<FigureOptions, 'width'> & { width: number | null }) =>
  figureFloat(o, `\\includestandalone${o.width === null ? '' : `[width=${widthArg(o.width)}]`}{${o.path.replace(/\.tex$/i, '')}}`);

/**
 * A TikZ diagram as the PDF its preview compiled (diagrams/name.pdf), for one whose packages clash with the document's:
 * it compiled with its own preamble, so none of its packages reach the document. At its own size when width is null.
 */
export const diagramImageLatex = (o: Omit<FigureOptions, 'width'> & { width: number | null }) =>
  figureFloat(o, `\\includegraphics${o.width === null ? '' : `[width=${widthArg(o.width)}]`}{${o.path}}`);

export type TableLines = 'booktabs' | 'grid' | 'minimal' | 'none';

/** tabularx and xltabular stretch to the line with X columns; xltabular also breaks across pages */
export type TableEnv = 'tabular' | 'tabularx' | 'xltabular';

/** A merged block of cells: its top-left cell, and how many rows and columns it covers. */
export type TableMerge = { r: number; c: number; rows: number; cols: number };

/** A short rule under row `row` across columns from to `to` (both counted from 0): \cmidrule with booktabs, \cline otherwise. */
export type TablePartRule = { row: number; from: number; to: number };

export type TableModel = {
  cells: string[][];
  env: TableEnv;
  /** l, c or r per column, X in tabularx and xltabular, and S for siunitx's numbers lined up on the decimal point */
  align: string[];
  lines: TableLines;
  /** edges (tableEdges' names) whose line was turned on or off by hand, against what the preset draws there */
  toggled?: string[];
  header: boolean;
  /** wrap in a table environment with \centering, a caption and a label */
  float: boolean;
  placement: string;
  /** table* across both columns */
  span?: boolean;
  caption: string;
  label: string;
  escape: boolean;
  merges?: TableMerge[];
  partRules?: TablePartRule[];
  /** a \\ typed in a cell is a line break inside it, through makecell */
  breaks?: boolean;
  /** notes under the table, one a line, through threeparttable; `a: text` is the note for \tnote{a} */
  notes?: string;
};

export const defaultAlign = (env: TableEnv, column: number) => (env !== 'tabular' ? 'X' : column === 0 ? 'l' : 'c');

/** The merge that covers cell (r, c), if any. */
export const mergeAt = (merges: TableMerge[] | undefined, r: number, c: number) =>
  merges?.find((g) => r >= g.r && r < g.r + g.rows && c >= g.c && c < g.c + g.cols);

/** The merges cut down to a grid of rows by cols; one shrunk to a single cell is no longer a merge. */
export const fitMerges = (merges: TableMerge[] | undefined, rows: number, cols: number) =>
  (merges ?? [])
    .filter((g) => g.r < rows && g.c < cols)
    .map((g) => ({ ...g, rows: Math.min(g.rows, rows - g.r), cols: Math.min(g.cols, cols - g.c) }))
    .filter((g) => g.rows > 1 || g.cols > 1);

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

/** The part rules that still fit a grid of rows by cols. */
export const fitPartRules = (rules: TablePartRule[] | undefined, rows: number, cols: number) =>
  (rules ?? []).filter((p) => p.row < rows && p.from < cols).map((p) => ({ ...p, to: Math.min(p.to, cols - 1) }));

// a plain number siunitx reads: a sign, digits with a decimal point, and an exponent. A comma is left as text, since
// siunitx would read 7,790 as 7.790.
const NUMBER = /^[-+\u2212]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** An S column's table-format from its numbers: -4.1 for -1234.5, or '' when it has none or one has an exponent. */
export function numberFormat(cells: string[][], column: number, skip: (r: number) => boolean) {
  let sign = false;
  let whole = 1;
  let decimals = 0;
  let any = false;
  for (let r = 0; r < cells.length; r += 1) {
    const text = (cells[r][column] ?? '').trim();
    if (skip(r) || !NUMBER.test(text)) continue;
    if (/[eE]/.test(text)) return '';
    any = true;
    sign ||= /^[-\u2212]/.test(text);
    const [int, dec = ''] = text.replace(/^[-+\u2212]/, '').split('.');
    whole = Math.max(whole, int.length);
    decimals = Math.max(decimals, dec.length);
  }
  return any ? `${sign ? '-' : ''}${whole}.${decimals}` : '';
}

/** The rows the header takes: the first, and as many more as a cell merged down from it reaches. 0 without a header. */
export function headerRows(m: Pick<TableModel, 'header' | 'cells'>, merges: TableMerge[]) {
  if (!m.header || !m.cells.length) return 0;
  let rows = 1;
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of merges) if (g.r < rows && g.r + g.rows > rows) [rows, grew] = [g.r + g.rows, true];
  }
  return Math.min(rows, m.cells.length);
}

/** Runs of columns [from, to] that a rule between row i - 1 and row i can cross without cutting a merged cell. */
function freeRuns(merges: TableMerge[], i: number, cols: number) {
  const blocked = new Set<number>();
  for (const g of merges) if (g.r < i && g.r + g.rows > i) for (let c = g.c; c < g.c + g.cols; c += 1) blocked.add(c);
  const runs: [number, number][] = [];
  for (let c = 0; c < cols; c += 1) {
    if (blocked.has(c)) continue;
    if (runs.length && runs[runs.length - 1][1] === c - 1) runs[runs.length - 1][1] = c;
    else runs.push([c, c]);
  }
  return { runs, full: !blocked.size };
}

/** threeparttable's notes: `a: text`, `a) text` or `[a] text` is the note for \tnote{a}; any other line is a plain note. */
export const tableNotes = (notes = '') =>
  notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(?:\[([^\]\s]{1,3})\]|([A-Za-z0-9*]{1,3})[:)])\s+(.*)$/.exec(line);
      return m ? { mark: m[1] ?? m[2], text: m[3] } : { mark: '', text: line };
    });

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

/**
 * Where a line can go, by name: the horizontal edges top to bottom ('top', 'head' under a header row, 'under-2' under
 * the second row, 'bottom') and the vertical ones left to right ('left', 'after-1' after the first column, 'right').
 */
export function tableEdges(rows: number, cols: number, header: boolean) {
  return {
    h: Array.from({ length: rows + 1 }, (_, i) => (i === 0 ? 'top' : i === rows ? 'bottom' : header && i === 1 ? 'head' : `under-${i}`)),
    v: Array.from({ length: cols + 1 }, (_, j) => (j === 0 ? 'left' : j === cols ? 'right' : `after-${j}`))
  };
}

const OUTSIDE_AND_HEAD = ['top', 'head', 'bottom'];
/** The line each preset draws at an edge: 0 none, 1 single, 2 double. */
const PRESETS: Record<TableLines, (edge: string) => number> = {
  booktabs: (edge) => +OUTSIDE_AND_HEAD.includes(edge),
  minimal: (edge) => +OUTSIDE_AND_HEAD.includes(edge),
  // a line under every row, so the header's is double
  grid: (edge) => (edge === 'head' ? 2 : 1),
  none: () => 0
};

/** Each edge's line, 0 none, 1 single or 2 double: the preset's, unless turned on or off by hand. Booktabs rules take no vertical lines. */
export function tableRules(m: Pick<TableModel, 'cells' | 'header' | 'lines' | 'toggled'>, cols = Math.max(1, ...m.cells.map((row) => row.length))) {
  const edges = tableEdges(m.cells.length, cols, m.header);
  const line = (edge: string) => {
    const preset = PRESETS[m.lines](edge);
    return m.toggled?.includes(edge) ? +!preset : preset;
  };
  return { h: edges.h.map(line), v: edges.v.map((edge) => (m.lines === 'booktabs' ? 0 : line(edge))) };
}

export function tableLatex(m: TableModel) {
  const cols = m.align.length;
  const rows = m.cells.length;
  const align = m.align.slice();
  // tabularx and xltabular need a column that takes up the rest of the width: the last one that isn't numbers
  if (m.env !== 'tabular' && !align.includes('X')) {
    const text = align.map((a) => a !== 'S').lastIndexOf(true);
    align[text === -1 ? cols - 1 : text] = 'X';
  }
  const merges = fitMerges(m.merges, rows, cols);
  const { h, v } = tableRules(m, cols);
  const booktabs = m.lines === 'booktabs';
  // the header row and merged cells are text, not numbers to line up
  const formats = align.map((a, j) => (a === 'S' ? numberFormat(m.cells, j, (r) => (m.header && r === 0) || !!mergeAt(merges, r, j)) : ''));
  const spec = align.map((a, j) => (v[j] ? '|' : '') + (a === 'S' && formats[j] ? `S[table-format=${formats[j]}]` : a)).join('') + (v[cols] ? '|' : '');
  const text = (value: string) => {
    const t = m.escape ? escapeCell(oneLine(value)) : oneLine(value);
    return m.breaks && t.includes('\\\\') ? `\\makecell{${t}}` : t;
  };

  // a cell's LaTeX, or null where a \multicolumn to its left takes it in
  const cell = (r: number, j: number) => {
    const merge = mergeAt(merges, r, j);
    if (merge && j !== merge.c) return null;
    const top = !merge || r === merge.r;
    let body = top ? text(m.cells[r][j] ?? '') : '';
    if (merge && merge.rows > 1 && top) body = `\\multirow{${merge.rows}}{*}{${body}}`;
    if (merge && merge.cols > 1) return `\\multicolumn{${merge.cols}}{${j === 0 && v[0] ? '|' : ''}c${v[j + merge.cols] ? '|' : ''}}{${body}}`;
    // text in an S column goes in braces, or siunitx tries to read it as a number
    if (align[j] === 'S' && body && !NUMBER.test(body.trim())) body = `{${body}}`;
    return body;
  };
  const rowLine = (r: number) => {
    const line = m.cells[r]
      .map((_, j) => cell(r, j))
      .filter((c): c is string => c !== null)
      .join(' & ');
    // \\ (and \toprule, \midrule) would take a leading [1] as its optional argument, and a * as its star
    return `${/^[[*]/.test(line) ? '{}' : ''}${line} \\\\`;
  };
  const part = (a: number, b: number, trim = '') => (booktabs ? `\\cmidrule${trim}{${a + 1}-${b + 1}}` : `\\cline{${a + 1}-${b + 1}}`);
  // the rules between row i - 1 and row i: booktabs' are heavier at the top and bottom, a double line is \hline twice,
  // and a rule that would cut through a cell merged down the rows stops either side of it
  const rule = (i: number) => {
    const out: string[] = [];
    const { runs, full } = freeRuns(merges, i, cols);
    if (h[i]) {
      if (i === 0) out.push(booktabs ? '\\toprule' : '\\hline'.repeat(h[i]));
      else if (i === rows) out.push(booktabs ? '\\bottomrule' : '\\hline'.repeat(h[i]));
      else if (full) out.push(booktabs ? '\\midrule' : '\\hline'.repeat(h[i]));
      else if (runs.length) out.push(runs.map(([a, b]) => part(a, b)).join(' '));
    }
    // a short rule where there is no rule across already
    if (!h[i] && i > 0) {
      const short = fitPartRules(m.partRules, rows, cols).filter((p) => p.row === i - 1);
      if (short.length) out.push(short.map((p) => part(p.from, p.to, '(lr)')).join(' '));
    }
    return out;
  };

  if (m.env === 'xltabular') {
    // a long table: the caption and header open it, the header repeats on each page, and each page but the last says it goes on
    const first = headerRows(m, merges);
    const head = [...rule(0), ...m.cells.slice(0, first).flatMap((_, r) => [rowLine(r), ...rule(r + 1)])];
    const body = m.cells.slice(first).flatMap((_, k) => [rowLine(first + k), ...(first + k + 1 < rows ? rule(first + k + 1) : [])]);
    const caption = m.float ? [`\\caption{${m.escape ? escapeCell(oneLine(m.caption)) : oneLine(m.caption)}}${m.label.trim() ? `\\label{${m.label.trim()}}` : ''} \\\\`] : [];
    return [
      `\\begin{xltabular}{\\linewidth}{${spec}}`,
      ...[
        ...caption,
        ...head,
        '\\endfirsthead',
        ...head,
        '\\endhead',
        `\\multicolumn{${cols}}{r}{\\emph{Continued on the next page}} \\\\`,
        '\\endfoot',
        ...rule(rows),
        '\\endlastfoot',
        ...body
      ].map((line) => `    ${line}`),
      '\\end{xltabular}'
    ].join('\n');
  }

  const lines = [...rule(0), ...m.cells.flatMap((_, r) => [rowLine(r), ...rule(r + 1)])];
  const tabular = [
    m.env === 'tabularx' ? `\\begin{tabularx}{\\linewidth}{${spec}}` : `\\begin{tabular}{${spec}}`,
    ...lines.map((line) => `    ${line}`),
    `\\end{${m.env}}`
  ];
  const notes = tableNotes(m.notes);
  const noted = notes.length
    ? [
        '\\begin{tablenotes}',
        '    \\small',
        ...notes.map((n) => `    \\item${n.mark ? `[${n.mark}]` : ''} ${m.escape ? escapeCell(n.text) : n.text}`),
        '\\end{tablenotes}'
      ]
    : [];
  // threeparttable keeps the notes, and the caption, to the table's own width
  const inner = (captioned: string[]) =>
    notes.length ? ['\\begin{threeparttable}', ...[...captioned, ...tabular, ...noted].map((line) => `    ${line}`), '\\end{threeparttable}'] : [...captioned, ...tabular];
  // on its own, not inline in the paragraph around it, and without its indent pushing tabularx into the margin
  if (!m.float) return ['\\begin{center}', ...inner([]).map((line) => `    ${line}`), '\\end{center}'].join('\n');
  return [
    `\\begin{table${m.span ? '*' : ''}}${placed(placementOf(m.placement, m.span))}`,
    '    \\centering',
    ...inner([`\\caption{${m.escape ? escapeCell(oneLine(m.caption)) : oneLine(m.caption)}}`, ...labelLine(m.label, '')]).map((line) => `    ${line}`),
    `\\end{table${m.span ? '*' : ''}}`
  ].join('\n');
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

// ─── Typst and Markdown figures and tables ───

const TYPST_MARKUP = /[\\[\]#$@<`/]|(?<![A-Za-z0-9])[*_]|[*_](?![A-Za-z0-9])/g;
// a list or heading marker at the start: - + = or 1.
const TYPST_MARKER = /^([-+=]|\d+\.)(?=\s|$)/;
const escapeMarker = (text: string) => text.replace(TYPST_MARKER, (m) => m.slice(0, -1) + '\\' + m.slice(-1));

/**
 * Typst's content text on one line, each character that would start markup escaped so it stays text: \ [ ] # $ @ <
 * ` and / (// starts a comment), * and _ unless inside a word (snake_case is text, *Total bold), and a list or
 * heading marker at the start.
 */
export const typstMarkup = (text: string) => escapeMarker(oneLine(text).replace(TYPST_MARKUP, '\\$&'));

// $…$ or $$…$$ maths, by pandoc's rule as escapeCell's: no space just inside either $ and no digit after ($5 and $6)
const MATHS = /(\$\$\S(?:[^$]*?\S)?\$\$(?!\d)|\$[^\s$](?:[^$]*?[^\s$])?\$(?!\d))/;

/** A caption's or cell's Typst text: typstMarkup, but its maths kept as maths, with only \ [ and ] escaped there. */
const typstText = (text: string) =>
  escapeMarker(
    oneLine(text)
      .split(MATHS)
      .map((part, i) => (i % 2 ? part.replace(/[\\[\]]/g, '\\$&') : part.replace(TYPST_MARKUP, '\\$&')))
      .join('')
  );

const typstFloat = (body: string, caption: string, label: string) =>
  '#figure(' + body + (caption.trim() ? ', caption: [' + typstText(caption) + ']' : '') + ')' + (label.trim() ? ' <' + label.trim() + '>' : '');

// a project file's path from Typst's root, the project's folder, so a chapter in a subfolder finds it too
const typstPath = (path: string) => JSON.stringify('/' + path.replace(/^\/+/, ''));

export type FigureTextOptions = { path: string; width: number; caption: string; label: string; size?: FigureSize };

const percent = (fraction: number) => Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';

/** A Typst image at a size: Typst can't crop, so a trim is left out; a scale reflows, so the text makes room. */
function typstImage(path: string, size?: FigureSize, fraction = 1) {
  const s = size ?? { mode: 'line', fraction, width: 0, height: 0, scale: 1 };
  const args =
    s.mode === 'width'
      ? 'width: ' + mm(s.width)
      : s.mode === 'height'
        ? 'height: ' + mm(s.height)
        : s.mode === 'box'
          ? 'width: ' + mm(s.width) + ', height: ' + mm(s.height) + ', fit: "contain"'
          : s.mode === 'scale'
            ? ''
            : 'width: ' + percent(s.fraction);
  const image = 'image(' + typstPath(path) + (args ? ', ' + args : '') + ')';
  return s.mode === 'scale' ? 'scale(' + Math.round((+s.scale || 1) * 100) + '%, reflow: true, ' + image + ')' : image;
}

/** A Typst figure: #figure(image("/path", width: 80%), caption: [caption]) <label>. */
export const figureTypst = (o: FigureTextOptions) => typstFloat(typstImage(o.path, o.size, o.width), o.caption, o.label);

/**
 * Several images in a Typst grid. Sub-figures are the house #subfigure from docs/TYPST_STYLE.md, each with its own label,
 * so @fig:measured prints Figure 1a (addTypstSubfigure puts its definition in the preamble); separate figures are a
 * figure each in the grid, each with its own label.
 */
export function figureSetTypst(f: FigureSet) {
  const n = f.layout === 'row' ? f.panels.length : Math.max(1, Math.min(f.columns, f.panels.length));
  const grid = (cells: string[]) => 'grid(columns: ' + n + ', gutter: 1em, align: ' + (f.align === 'top' ? 'top' : f.align === 'centre' ? 'horizon' : 'bottom') + ', ' + cells.join(', ') + ')';
  // a label attaches to the figure before it in markup, so each cell is markup holding its labelled figure
  const labelled = (func: string) =>
    f.panels.map((panel) => '[#' + func + '(' + typstImage(panel.path, f.size) + ', caption: [' + typstText(panel.caption) + '])' + (panel.label.trim() ? ' <' + panel.label.trim() + '>' : '') + ']');
  if (f.labels === 'separate') return '#' + grid(labelled('figure'));
  return typstFloat(grid(f.labels === 'sub' ? labelled('subfigure') : f.panels.map((panel) => typstImage(panel.path, f.size))), f.caption, f.label);
}

/** A Typst diagram file included as a figure: #figure(include "/diagrams/x.typ", caption: [caption]) <label>. */
export const figureTypstInclude = (o: { path: string; caption: string; label: string }) => typstFloat('include ' + typstPath(o.path), o.caption, o.label);

const TYPST_ALIGN: Record<string, string> = { l: 'left', c: 'center', r: 'right', S: 'right' };

/**
 * A Typst table, its header row as table.header when the model has one. Typst draws every line unless told otherwise,
 * so any other set is stroke: none and a table.hline or table.vline per line, booktabs' heavier at the top and bottom.
 * Merged cells are table.cell with a colspan and rowspan, and a line stops either side of a cell merged across it.
 */
export function tableTypst(m: TableModel) {
  const cols = Math.max(1, ...m.cells.map((row) => row.length));
  const rows = m.cells.length;
  const merges = fitMerges(m.merges, rows, cols);
  const cell = (r: number, c: number) => {
    const merge = mergeAt(merges, r, c);
    if (merge && (r !== merge.r || c !== merge.c)) return null;
    const content = '[' + typstText(m.cells[r][c] ?? '') + ']';
    if (!merge) return content;
    const spans = [...(merge.cols > 1 ? ['colspan: ' + merge.cols] : []), ...(merge.rows > 1 ? ['rowspan: ' + merge.rows] : [])];
    return 'table.cell(' + spans.join(', ') + ')' + content;
  };
  const row = (r: number) =>
    Array.from({ length: cols }, (_, c) => cell(r, c))
      .filter((c): c is string => c !== null)
      .join(', ');
  const parts = ['columns: ' + cols];
  const align = Array.from({ length: cols }, (_, i) => TYPST_ALIGN[m.align[i]] ?? 'left');
  if (align.some((a) => a !== 'left')) parts.push('align: (' + align.join(', ') + ')');
  const { h, v } = tableRules(m, cols);
  const short = fitPartRules(m.partRules, rows, cols);
  if (m.lines === 'booktabs' || !h.every(Boolean) || !v.every(Boolean) || merges.length || short.length) {
    const weight = (y: number) => (m.lines !== 'booktabs' ? '' : ', stroke: ' + (y === 0 || y === rows ? '0.08em' : '0.05em'));
    const hline = (y: number, from: number, to: number, stroke: string) =>
      'table.hline(y: ' + y + (from > 0 || to < cols - 1 ? ', start: ' + from + ', end: ' + (to + 1) : '') + stroke + ')';
    parts.push('stroke: none');
    h.forEach((n, y) => {
      if (!n) return;
      const { runs } = y === 0 || y === rows ? { runs: [[0, cols - 1]] } : freeRuns(merges, y, cols);
      parts.push(...runs.map(([a, b]) => hline(y, a, b, weight(y))));
    });
    parts.push(...short.filter((p) => !h[p.row + 1]).map((p) => hline(p.row + 1, p.from, p.to, m.lines === 'booktabs' ? ', stroke: 0.03em' : '')));
    parts.push(...v.flatMap((n, x) => (n ? ['table.vline(x: ' + x + ')'] : [])));
  }
  // the header holds every row a cell merged down from its first row reaches
  const header = headerRows(m, merges);
  if (header)
    parts.push(
      'table.header(' +
        Array.from({ length: header }, (_, r) => row(r))
          .filter(Boolean)
          .join(', ') +
        ')'
    );
  for (let r = header; r < rows; r += 1) if (row(r)) parts.push(row(r));
  const table = 'table(' + parts.join(', ') + ')';
  return m.float ? typstFloat(table, m.caption, m.label) : '#' + table;
}

/** A Markdown image with its label and width: ![caption](path){#label width=80%}. */
export const figureMarkdown = (o: FigureTextOptions) => {
  const caption = oneLine(o.caption).replace(/[[\]]/g, '\\$&');
  // pandoc takes a width and a height; a scale or crop has no attribute, so they stay at the line share
  const s = o.size;
  const size =
    s?.mode === 'width' ? 'width=' + mm(s.width) : s?.mode === 'height' ? 'height=' + mm(s.height) : s?.mode === 'box' ? 'width=' + mm(s.width) + ' height=' + mm(s.height) : 'width=' + percent(s?.mode === 'line' ? s.fraction : o.width);
  return '![' + caption + '](' + o.path + '){' + (o.label.trim() ? '#' + o.label.trim() + ' ' : '') + size + '}';
};

/** A Markdown pipe table, with Table: caption {#label} under it. */
export function tableMarkdown(m: TableModel) {
  const cols = Math.max(1, ...m.cells.map((row) => row.length));
  const cell = (value?: string) => oneLine(value ?? '').replace(/\|/g, '\\|');
  const row = (cells: string[]) => '| ' + Array.from({ length: cols }, (_, i) => cell(cells[i])).join(' | ') + ' |';
  // pipe tables can't merge cells: the merged text stays in its first cell and the cells it covers are left empty
  const merges = fitMerges(m.merges, m.cells.length, cols);
  const cells = m.cells.map((r, i) => r.map((value, j) => (mergeAt(merges, i, j) && !(mergeAt(merges, i, j)!.r === i && mergeAt(merges, i, j)!.c === j) ? '' : value)));
  const header = m.header && cells.length ? cells[0] : Array.from({ length: cols }, () => '');
  const body = m.header ? cells.slice(1) : cells;
  const rule = (i: number) => ({ l: ':---', c: ':---:', r: '---:', S: '---:' })[m.align[i]] ?? '---';
  const lines: string[] = [row(header), '| ' + Array.from({ length: cols }, (_, i) => rule(i)).join(' | ') + ' |', ...body.map(row)];
  if (m.float && (m.caption.trim() || m.label.trim())) lines.push('', 'Table: ' + m.caption.trim() + (m.label.trim() ? ' {#' + m.label.trim() + '}' : ''));
  return lines.join(String.fromCharCode(10));
}

