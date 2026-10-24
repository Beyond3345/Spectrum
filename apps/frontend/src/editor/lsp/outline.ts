import { HEADING_LEVEL } from '../latexEditor';
import type { OutlineItem } from '../latexEditor';

/** One of TexLab's workspace symbols: its project path, and its line and column from 0. */
export type TexlabSymbol = { path: string; line: number; character: number; name: string; kind: number };

// the LSP symbol kinds TexLab gives a section (Module) and a float with a caption (Method)
const SECTION = 2;
const FLOAT = 6;
const LEVELS = new Map(Object.entries({ part: -1, ...HEADING_LEVEL, paragraph: 4, subparagraph: 5 }));

/**
 * documentOutline's headingsOf from TexLab's symbols: its sections, numbered once the document has compiled, and its
 * floats with their captions, a level below the heading before them. documentOutline asks in reading order.
 */
export function symbolHeadings(symbols: TexlabSymbol[]) {
  const byLine = new Map<string, TexlabSymbol[]>();
  for (const symbol of [...symbols].sort((a, b) => a.character - b.character)) {
    if (symbol.kind !== SECTION && symbol.kind !== FLOAT) continue;
    const key = `${symbol.path}\n${symbol.line}`;
    byLine.set(key, [...(byLine.get(key) ?? []), symbol]);
  }
  let level = 0;
  return (path: string, code: string, line: number): OutlineItem[] =>
    (byLine.get(`${path}\n${line}`) ?? []).flatMap((symbol) => {
      if (symbol.kind === FLOAT) return [{ title: symbol.name, level: level + 1, pos: symbol.character, line: line + 1, float: true }];
      const found = LEVELS.get(/^\\([a-z]+)/.exec(code.slice(symbol.character))?.[1] ?? '');
      if (found === undefined) return [];
      level = found;
      return [{ title: symbol.name, level, pos: symbol.character, line: line + 1 }];
    });
}
