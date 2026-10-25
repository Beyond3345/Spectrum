// The diagram composer's shared shapes: the drawing kept in a diagram file, and what each mode supplies
import type * as React from 'react';

export type DiagramLanguage = 'tikz' | 'typst' | 'mermaid';
export type TikzPackage = 'tikz' | 'circuitikz' | 'pgfplots' | 'tikz-cd';
export interface DiagramFile { language: DiagramLanguage; pkg?: TikzPackage; style: Record<string, unknown>; model: unknown; version: 1 }
export interface DiagramMode<M = unknown> {
  id: TikzPackage | 'mermaid' | 'fletcher';
  label: string;                                  // "Circuit (circuitikz)" etc.
  language: DiagramLanguage;
  emptyModel(): M;
  // body = the picture only. context.typstVersion: the project's Typst version, for a fletcher import line
  toCode(model: M, style: Record<string, unknown>, context?: { typstVersion?: string }): { body: string; packages: string[]; libraries: string[] };
  // the frame also passes what's selected (ids the mode chooses) and the rail's tool; onTool hands the tool back, as
  // after placing a shape
  Canvas: React.ComponentType<{ model: M; onChange(m: M): void; style: Record<string, unknown>; readOnly?: boolean; selection?: string[]; onSelect?(ids: string[]): void; tool?: string; onTool?(tool: string): void }>;
  Rail?: React.ComponentType<{ onPick(tool: string): void; tool: string }>;
  Inspector?: React.ComponentType<{ model: M; onChange(m: M): void; selection?: string[] }>;
  StyleMenu?: React.ComponentType<{ style: Record<string, unknown>; onChange(s: Record<string, unknown>): void }>;
  // Copy, Paste, Duplicate and Delete of the selection, through the frame's keys and buttons; a mode without them
  // handles its own
  /** what Copy keeps of these items (JSON) */
  copy?(model: M, ids: string[]): unknown;
  /** copied items put back as new ones, and their ids, selected next */
  paste?(model: M, clip: unknown): { model: M; ids: string[] };
  /** the model without these items, and without anything left hanging on them */
  remove?(model: M, ids: string[]): M;
}
