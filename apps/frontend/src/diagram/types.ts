// The diagram composer's shared shapes: the drawing kept in a diagram file, and what each mode supplies
import type * as React from 'react';

export type DiagramLanguage = 'tikz' | 'typst' | 'mermaid';
/** form: the Form mode, whose drawing is a preset's fields (modes/form); structures: beams, trusses and frames, solved */
export type TikzPackage = 'tikz' | 'circuitikz' | 'pgfplots' | 'tikz-cd' | 'form' | 'structures' | 'vectors';
/**
 * sets: the symbol sets the drawing has besides its mode's own (sets.ts), in the order they were added. A drawing
 * with sets is version 2, so a build from before sets opens it as code instead of saving it with its parts missing.
 */
export interface DiagramFile { language: DiagramLanguage; pkg?: TikzPackage; style: Record<string, unknown>; model: unknown; sets?: string[]; version: 1 | 2 }
/** The defaults in Settings › Composer that a new drawing copies into its style, so changing one never redraws a figure. */
export interface ComposerDefaults {
  /** bending moment diagrams on the tension side (sagging below) or positive up */
  moments: 'tension' | 'positive';
  /** Mohr's circle: τ positive downward, clockwise shear plotted above, or τ positive upward */
  mohrShear: 'down' | 'clockwise-above' | 'up';
  /** values as siunitx's \qty and units as \unit (units.ts), in the modes that write them */
  siUnits: boolean;
  /** structures: which of the axial force, shear force and bending moment diagrams are drawn, and their fills */
  diagrams?: DiagramLooks;
}
/** A structure's force diagram: drawn or not, its fill (an xcolor name or mix, or '#rrggbb') and the fill's opacity. */
export interface DiagramLook { on: boolean; fill: string; opacity: number }
export type DiagramLooks = Record<'axial' | 'shear' | 'moment', DiagramLook>;
export interface DiagramMode<M = unknown> {
  id: TikzPackage | 'mermaid' | 'fletcher';
  label: string;                                  // "Circuit (circuitikz)" etc.
  language: DiagramLanguage;
  emptyModel(): M;
  /** a new drawing's style, from the Settings › Composer defaults it uses; none: {} */
  newStyle?(defaults: ComposerDefaults, model: M): Record<string, unknown>;
  /** the symbol sets of its own, always on, when it draws symbols (the Symbol sets dialog adds others) */
  sets?: string[];
  /** the other sets the model has parts from, which the dialog can't take away */
  setsInUse?(model: M): string[];
  // body = the picture only. context.typstVersion: the project's Typst version, for a fletcher import line
  toCode(model: M, style: Record<string, unknown>, context?: { typstVersion?: string }): { body: string; packages: string[]; libraries: string[] };
  // the frame also passes what's selected (ids the mode chooses) and the rail's tool; onTool hands the tool back, as
  // after placing a shape
  Canvas: React.ComponentType<{ model: M; onChange(m: M): void; style: Record<string, unknown>; readOnly?: boolean; selection?: string[]; onSelect?(ids: string[]): void; tool?: string; onTool?(tool: string): void }>;
  /** sets: the drawing's other symbol sets, shown after the mode's own */
  Rail?: React.ComponentType<{ onPick(tool: string): void; tool: string; sets?: string[] }>;
  Inspector?: React.ComponentType<{ model: M; onChange(m: M): void; selection?: string[] }>;
  StyleMenu?: React.ComponentType<{ style: Record<string, unknown>; onChange(s: Record<string, unknown>): void; model?: M }>;
  // Copy, Paste, Duplicate and Delete of the selection, through the frame's keys and buttons; a mode without them
  // handles its own
  /** what Copy keeps of these items (JSON) */
  copy?(model: M, ids: string[]): unknown;
  /** copied items put back as new ones, and their ids, selected next */
  paste?(model: M, clip: unknown): { model: M; ids: string[] };
  /** the model without these items, and without anything left hanging on them */
  remove?(model: M, ids: string[]): M;
}
