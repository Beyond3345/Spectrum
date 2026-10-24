import type { DiagramMode } from '../types';
import mermaid from './mermaid';
import pgfplots from './pgfplots';
import tikz from './tikz';
import tikzcd from './tikzcd';
// ─── the circuit mode (modes/circuitikz) goes here: its import above this line, its name first in MODES ───

/** Every mode, in the order the TikZ package menu lists them (each has its own model, hence any). */
export const MODES: DiagramMode<any>[] = [pgfplots, tikz, tikzcd, mermaid];

export const modeFor = (id: string | undefined) => MODES.find((m) => m.id === id);
