// The diagram composer's shared shapes: the drawing kept in a diagram file, and what each mode supplies
import type * as React from 'react';

export type DiagramLanguage = 'tikz' | 'typst' | 'mermaid';
export type TikzPackage = 'tikz' | 'circuitikz' | 'pgfplots' | 'tikz-cd';
export interface DiagramFile { language: DiagramLanguage; pkg?: TikzPackage; style: Record<string, unknown>; model: unknown; version: 1 }
export interface DiagramMode<M = unknown> {
  id: TikzPackage | 'mermaid';
  label: string;                                  // "Circuit (circuitikz)" etc.
  language: DiagramLanguage;
  emptyModel(): M;
  toCode(model: M, style: Record<string, unknown>): { body: string; packages: string[]; libraries: string[] };  // body = the picture only
  Canvas: React.ComponentType<{ model: M; onChange(m: M): void; style: Record<string, unknown>; readOnly?: boolean }>;
  Rail?: React.ComponentType<{ onPick(tool: string): void; tool: string }>;
  Inspector?: React.ComponentType<{ model: M; onChange(m: M): void }>;
  StyleMenu?: React.ComponentType<{ style: Record<string, unknown>; onChange(s: Record<string, unknown>): void }>;
}
