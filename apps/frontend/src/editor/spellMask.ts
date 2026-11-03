import { maskLatex, maskMarkdown, maskTypst } from '../../../backend/src/latex/mask.js';
import { languageMarkup, prosePieces } from '../../../backend/src/language/markup.js';

export type SpellKind = 'latex' | 'typst' | 'markdown' | 'text';
export type SpellPiece = { from: number; to: number; lang?: string };
export type Masked = { text: string; pieces: SpellPiece[]; main: string | null };

/** A document reduced to its prose (the same stripper the grammar check uses), cut into paragraphs. */
export function maskForSpelling(source: string, kind: SpellKind): Masked {
  const text = kind === 'latex' ? maskLatex(source) : kind === 'typst' ? maskTypst(source) : kind === 'markdown' ? maskMarkdown(source) : source;
  const { main, ranges } = languageMarkup(source, kind);
  return { text, pieces: prosePieces(text, ranges), main };
}
