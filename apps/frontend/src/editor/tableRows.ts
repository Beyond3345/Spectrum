// Reading a table out of a document: a LaTeX tabular, a Typst #table or a Markdown pipe table, as rows of cells. Pure;
// checked in tableRows.check.ts. The diagram composer's Plot mode imports tables through it.
import { matchBrace, withoutComments } from '../../../backend/src/latex/text.js';
import { markdownTableRows } from './floats';
import { closing, readable, typstArgs, typstFigure } from './outlines';

export { markdownTableRows };

/**
 * A selected Typst #table's cells, row by row, as its text reads (markup gone, a colspan's cell followed by blanks);
 * null when the text holds no table(…) with its columns.
 */
export function typstTableRows(text: string): string[][] | null {
  const at = /(?:^|[^\w.-])table\s*\(/.exec(text);
  if (!at) return null;
  const args = typstArgs(text, at.index + at[0].length - 1);
  const columns = args?.find((a) => a.name === 'columns')?.value ?? '';
  // columns: 3, or (auto, 1fr, 2cm), one column a item
  const count = /^\d+$/.test(columns) ? Number(columns) : columns.startsWith('(') ? (typstArgs(columns, 0)?.length ?? 0) : 0;
  if (!args || count < 1) return null;
  const cells: string[] = [];
  const cell = (value: string): void => {
    // table.header[a][b]: its cells as content blocks only
    const blocks = /^table\.(?:header|footer)\s*(?=\[)/.exec(value);
    if (blocks) {
      for (let at = blocks[0].length, close = closing(value, at); value[at] === '[' && close !== -1; at = close + 1 + (/^\s*/.exec(value.slice(close + 1))?.[0].length ?? 0), close = closing(value, at)) cell(value.slice(at, close + 1));
      return;
    }
    const call = /^(table\.(?:header|footer|cell)|\w[\w.]*)\s*\(/.exec(value);
    if (!call) return void cells.push(readable(value.replace(/^"|"$/g, '')));
    if (/^table\.(?:hline|vline)$/.test(call[1])) return;
    const inner = typstArgs(value, call[0].length - 1) ?? [];
    if (call[1] === 'table.header' || call[1] === 'table.footer') return inner.filter((a) => !a.name).forEach((a) => cell(a.value));
    if (call[1] === 'table.cell') {
      const span = Number(inner.find((a) => a.name === 'colspan')?.value) || 1;
      cells.push(readable(inner.find((a) => !a.name)?.value ?? ''), ...Array<string>(span - 1).fill(''));
      return;
    }
    cells.push(readable(value));
  };
  for (const { name, value } of args) if (!name) cell(value);
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += count) rows.push(cells.slice(i, i + count));
  return rows.length ? rows : null;
}

// the environments that hold rows, and the arguments before their body: o […], m {…}
const TABULARS: Record<string, string> = { tabular: 'om', 'tabular*': 'mom', tabularx: 'mm', xltabular: 'omm', longtable: 'om', tabu: 'om', longtabu: 'om' };
const TABULAR = /\\begin\s*\{(tabular\*?|tabularx|xltabular|longtable|tabu|longtabu)\}/g;
const FIRST_TABULAR = new RegExp(TABULAR.source);
// rules and spacing before a row, and the head and foot markers of a long table
const RULE = /^\s*\\(?:toprule|midrule|bottomrule|hline|cline|cmidrule|addlinespace|specialrule|endfirsthead|endhead|endfoot|endlastfoot|rowcolor|noalign)(?![A-Za-z])\s*(?:\([lr]*\))?\s*(?:\[[^\]]*\])?\s*(?:\{[^{}]*\}\s*){0,3}/;

/** The index just past a command's arguments from i, by spec (o […], m {…}). */
function pastArgs(text: string, i: number, spec: string) {
  for (const kind of spec) {
    const at = i + (/^\s*/.exec(text.slice(i))?.[0].length ?? 0);
    if (kind === 'o' && text[at] === '[') i = text.indexOf(']', at) + 1 || at;
    else if (kind === 'm' && text[at] === '{') i = matchBrace(text, at) + 1 || at;
  }
  return i;
}

/** text split at sep where no brace is open and sep isn't escaped. */
function splitTop(text: string, sep: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\' && !text.startsWith(sep, i)) i += 1;
    else if (text[i] === '{') depth += 1;
    else if (text[i] === '}') depth -= 1;
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** The first argument of \name{…} at the start of cell, and what follows it; null when cell isn't one. */
function unwrap(cell: string, name: string, spec: string) {
  const m = new RegExp(`^\\\\${name}(?![A-Za-z])`).exec(cell);
  if (!m) return null;
  const parts: string[] = [];
  let i = m[0].length;
  for (const kind of spec) {
    const at = i + (/^\s*/.exec(cell.slice(i))?.[0].length ?? 0);
    const end = kind === 'o' ? (cell[at] === '[' ? cell.indexOf(']', at) : -1) : cell[at] === '{' ? matchBrace(cell, at) : -1;
    if (end === -1) {
      if (kind === 'm') return null;
      continue;
    }
    if (kind === 'm') parts.push(cell.slice(at + 1, end));
    i = end + 1;
  }
  return parts;
}

/** The rows of the first tabular (tabularx, longtable…) in text, its cells as LaTeX; null when there is none. */
export function latexTableRows(text: string): string[][] | null {
  const src = withoutComments(text);
  const begin = FIRST_TABULAR.exec(src);
  if (!begin) return null;
  const name = begin[1];
  const end = src.indexOf(`\\end{${name}}`, begin.index);
  const body = src.slice(pastArgs(src, begin.index + begin[0].length, TABULARS[name]), end === -1 ? undefined : end);
  const rows: string[][] = [];
  for (let row of splitTop(body.replace(/\\tabularnewline(?![A-Za-z])/g, '\\\\'), '\\\\')) {
    // a row's optional space, \\[2pt], belongs to the row break before it
    row = row.replace(/^\s*\[[^\]]*\]/, '');
    for (let m = RULE.exec(row); m && m[0]; m = RULE.exec(row)) row = row.slice(m[0].length);
    if (!row.trim() || /^\s*\\(?:caption|label)(?![A-Za-z])/.test(row)) continue;
    rows.push(
      splitTop(row, '&').flatMap((raw) => {
        const cell = raw.trim();
        const multi = unwrap(cell, 'multicolumn', 'mmm');
        if (multi) return [multi[2].trim(), ...Array<string>(Math.max(0, (Number(multi[0]) || 1) - 1)).fill('')];
        const down = unwrap(cell, 'multirow', 'omomm');
        return [down ? down[down.length - 1].trim() : cell];
      })
    );
  }
  return rows.length ? rows : null;
}

/** A cell as it reads: LaTeX's commands, braces and maths dollars gone (\textbf{A} is A, $0.19$ and \num{0.19} are 0.19). */
export function plainCell(cell: string) {
  let s = cell.replace(/\\times\s*10\s*\^\s*\{?\s*([-+]?\d+)\s*\}?/g, 'e$1');
  // \cmd[opt]{arg} keeps its first argument, inside out
  for (let k = 0; k < 4; k += 1) s = s.replace(/\\[A-Za-z]+\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g, '$1');
  return s
    .replace(/\\[,;:! ]|~/g, ' ')
    .replace(/\\([%&$#_{}])/g, '$1')
    .replace(/\\[A-Za-z]+\*?/g, '')
    .replace(/(?<!\\)[{}$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A cell's number: 0.42, −1.5, 1.2e3, 12 % (as 12); null when it holds words. */
export function cellNumber(cell: string): number | null {
  const s = plainCell(cell).replace(/[\s  ]/g, '').replace(/^[−–]/, '-').replace(/%$/, '');
  return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s) ? Number(s) : null;
}

export type DocKind = 'latex' | 'typst' | 'markdown';
export const tableKind = (path: string): DocKind | null => (/\.(tex|ltx)$/i.test(path) ? 'latex' : /\.typ$/i.test(path) ? 'typst' : /\.(md|markdown)$/i.test(path) ? 'markdown' : null);

/** A table found in a document: its rows (LaTeX cells as written, the others as they read) and its caption, if any. */
export type FoundTable = { rows: string[][]; caption: string };

/** Every table in a document, in order. */
export function tablesIn(text: string, kind: DocKind): FoundTable[] {
  const found: FoundTable[] = [];
  if (kind === 'latex') {
    const src = withoutComments(text);
    // the floats around them, for their captions
    const floats = [...src.matchAll(/\\begin\s*\{(table\*?|longtable|xltabular)\}([\s\S]*?)\\end\s*\{\1\}/g)].map((m) => {
      const at = m[0].search(/\\caption\s*(?:\[[^\]]*\])?\s*\{/);
      const open = at === -1 ? -1 : m[0].indexOf('{', at);
      return { start: m.index, end: m.index + m[0].length, caption: open === -1 ? '' : plainCell(m[0].slice(open + 1, matchBrace(m[0], open))) };
    });
    TABULAR.lastIndex = 0;
    for (let m = TABULAR.exec(src); m; m = TABULAR.exec(src)) {
      const end = src.indexOf(`\\end{${m[1]}}`, m.index);
      const rows = latexTableRows(src.slice(m.index, end === -1 ? undefined : end + m[1].length + 6));
      if (rows) found.push({ rows, caption: floats.find((f) => f.start <= m!.index && m!.index < f.end)?.caption ?? '' });
      if (end !== -1) TABULAR.lastIndex = end;
    }
  } else if (kind === 'typst') {
    const figures = [...text.matchAll(/(?:^|[^\w.-])figure\s*\(/g)].map((m) => ({ start: m.index + m[0].indexOf('figure'), end: closing(text, m.index + m[0].length - 1) }));
    const calls = /(?:^|[^\w.-])table\s*\(/g;
    for (let m = calls.exec(text); m; m = calls.exec(text)) {
      const open = m.index + m[0].length - 1;
      const rows = typstTableRows(text.slice(m.index));
      if (rows) {
        const figure = figures.filter((f) => f.start < m!.index && m!.index < f.end).pop();
        found.push({ rows, caption: (figure && typstFigure(text, figure.start)?.caption) || '' });
      }
      const end = closing(text, open);
      if (end !== -1) calls.lastIndex = end;
    }
  } else {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes('|')) continue;
      let last = i;
      while (lines[last + 1]?.includes('|')) last += 1;
      const rows = markdownTableRows(lines.slice(i, last + 1).join('\n'));
      if (rows) {
        // "Table: …" or ": …" after it, perhaps after a blank line
        const next = lines[last + 1]?.trim() === '' ? last + 2 : last + 1;
        const caption = /^(?:Table)?:\s+(.*)$/.exec(lines[next] ?? '')?.[1] ?? '';
        found.push({ rows: rows.map((row) => row.map((cell) => cell.replace(/[*_`]/g, ''))), caption: caption.replace(/[*_`]/g, '').trim() });
      }
      i = last;
    }
  }
  return found;
}
