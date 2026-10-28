import type { DiagramMode } from '../types';
import circuitikz from './circuitikz';
import fletcher from './fletcher';
import form from './form';
import mermaid from './mermaid';
import pgfplots from './pgfplots';
import tikz from './tikz';
import tikzcd from './tikzcd';

/** Every mode, in the order the TikZ package menu lists them (each has its own model, hence any). */
export const MODES: DiagramMode<any>[] = [circuitikz, pgfplots, tikz, tikzcd, mermaid, fletcher, form];

export const modeFor = (id: string | undefined) => MODES.find((m) => m.id === id);
