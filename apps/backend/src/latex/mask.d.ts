// Types for the frontend, which imports mask.js directly (one LaTeX stripper for both checkers).
export function maskLatex(source: string): string;
export function maskTypst(source: string): string;
export function maskMarkdown(source: string): string;
export function proseWords(masked: string, from?: number, to?: number, options?: { wordChars?: string }): [word: string, from: number][];
