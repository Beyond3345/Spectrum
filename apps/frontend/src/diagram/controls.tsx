import { createContext } from 'react';
import type { ReactNode } from 'react';

// The pieces the drawing modes' rails and inspectors share.

/** The project the diagram is in, for a mode that reads its files (a plot's data). */
export const ProjectContext = createContext('');

export type Tool = { id: string; label: string; icon: ReactNode };

/** The left rail: one button per tool, the chosen one pressed. */
export function ToolRail({ tools, tool, onPick }: { tools: Tool[]; tool: string; onPick(tool: string): void }) {
  return (
    <div className="diagram-rail-tools" role="toolbar" aria-orientation="vertical" aria-label="Tools">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`diagram-tool${t.id === tool ? ' active' : ''}`}
          title={t.label}
          aria-label={t.label}
          aria-pressed={t.id === tool}
          onClick={() => onPick(t.id)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

/** A 16 × 16 outline icon for a rail button. */
export const railIcon = (shape: ReactNode) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    {shape}
  </svg>
);

/** A labelled row in an inspector. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="diagram-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A colour, or none (`fallback` says what none means: no fill, or black). */
export function ColourField({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange(value?: string): void }) {
  return (
    <div className="diagram-row">
      <span>{label}</span>
      <span className="diagram-colour">
        <input type="color" className="colour-well" aria-label={label} value={value ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className={`btn small${value ? '' : ' active'}`} aria-pressed={!value} onClick={() => onChange(undefined)}>
          {fallback}
        </button>
      </span>
    </div>
  );
}
