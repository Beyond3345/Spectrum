// Types for floats.js, which the frontend imports through apps/frontend/src/editor/floats.ts.

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
  /** Typst: the captions are Typst markup already, written as they are */
  markup?: boolean;
};

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
  /** Typst: the cells and caption are Typst markup already, written as they are */
  markup?: boolean;
};

export type FigureTextOptions = { path: string; width: number; caption: string; label: string; size?: FigureSize; markup?: boolean };

export function widthArg(fraction: number): string;
export function placementOf(letters: string, span?: boolean): string;
export function graphicsOptions(size: FigureSize, single?: boolean): string;
export function panelWidth(n: number): number;
export function figureSetLatex(f: FigureSet): string;
export function figureLatex(o: FigureOptions): string;
export function diagramLatex(o: Omit<FigureOptions, 'width'> & { width: number | null }): string;
export function diagramImageLatex(o: Omit<FigureOptions, 'width'> & { width: number | null }): string;
export function mergeAt(merges: TableMerge[] | undefined, r: number, c: number): TableMerge | undefined;
export function fitMerges(merges: TableMerge[] | undefined, rows: number, cols: number): TableMerge[];
export function fitPartRules(rules: TablePartRule[] | undefined, rows: number, cols: number): TablePartRule[];
export function numberFormat(cells: string[][], column: number, skip: (r: number) => boolean): string;
export function headerRows(m: Pick<TableModel, 'header' | 'cells'>, merges: TableMerge[]): number;
export function tableNotes(notes?: string): { mark: string; text: string }[];
export function escapeCell(text: string): string;
export function tableEdges(rows: number, cols: number, header: boolean): { h: string[]; v: string[] };
export function tableRules(m: Pick<TableModel, 'cells' | 'header' | 'lines' | 'toggled'>, cols?: number): { h: number[]; v: number[] };
export function tableLatex(m: TableModel): string;
export function typstMarkup(text: string): string;
export function figureTypst(o: FigureTextOptions): string;
export function figureSetTypst(f: FigureSet): string;
export function figureTypstInclude(o: { path: string; caption: string; label: string; markup?: boolean }): string;
export function tableTypst(m: TableModel): string;
export function figureMarkdown(o: FigureTextOptions): string;
export function tableMarkdown(m: TableModel): string;
