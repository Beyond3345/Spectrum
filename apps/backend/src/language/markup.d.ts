// Types for the frontend, which imports markup.js directly (one reading of language markup for both checkers).
export type LanguageRange = { from: number; to: number; lang: string };
export function languageTag(name: string, region?: string): string | null;
export function languageMarkup(source: string, kind: 'latex' | 'typst' | 'markdown' | 'text'): { main: string | null; ranges: LanguageRange[] };
export function prosePieces(prose: string, ranges?: LanguageRange[], from?: number, to?: number): { from: number; to: number; lang?: string }[];
