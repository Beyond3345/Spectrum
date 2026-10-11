// Types for the frontend, which imports mask.js directly (one LaTeX stripper for both checkers).
export function maskLatex(source: string): string;
export function proseWords(masked: string, from?: number, to?: number): [word: string, from: number][];
