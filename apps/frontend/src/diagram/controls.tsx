import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { colourCss, isColour } from './modes/shared';

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

/**
 * A colour, or none (`fallback` says what none means: no fill, black, the default). With `swatches` (xcolor names) it
 * also takes any xcolor name or mix typed in, such as blue!15, so its value is xcolor's as well as '#rrggbb'.
 */
export function ColourField({ label, value, fallback, onChange, swatches }: { label: string; value?: string; fallback: string; onChange(value?: string): void; swatches?: string[] }) {
  return (
    <div className="diagram-row">
      <span>{label}</span>
      {swatches && (
        <span className="diagram-swatches">
          {swatches.map((s) => (
            <button key={s} type="button" className={`diagram-swatch${s === value ? ' active' : ''}`} style={{ background: colourCss(s) }} title={s} aria-label={`${label}: ${s}`} aria-pressed={s === value} onClick={() => onChange(s)} />
          ))}
        </span>
      )}
      <span className="diagram-colour">
        <input type="color" className="colour-well" aria-label={label} value={value && /^#/.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        {swatches && <XcolorInput label={label} value={value} onChange={onChange} />}
        <button type="button" className={`btn small${value ? '' : ' active'}`} aria-pressed={!value} onClick={() => onChange(undefined)}>
          {fallback}
        </button>
      </span>
    </div>
  );
}

/** An xcolor name or mix typed in, taken when it's one the code can write. */
function XcolorInput({ label, value, onChange }: { label: string; value?: string; onChange(value?: string): void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const take = () => {
    const text = draft.trim();
    if (!text) onChange(undefined);
    else if (isColour(text)) onChange(text);
  };
  return (
    <input
      className="input mono diagram-xcolor"
      aria-label={`${label} (an xcolor name or mix, such as blue!15)`}
      placeholder="blue!15"
      value={draft}
      spellCheck={false}
      aria-invalid={!!draft.trim() && !isColour(draft.trim())}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={take}
      onKeyDown={(e) => e.key === 'Enter' && take()}
    />
  );
}

/**
 * Style › Write units with siunitx, in the modes that write values and units (never Typst or Mermaid). A drawing
 * starts with Settings › Composer's choice; one made before the switch has it off, so it exports as it did.
 */
export function UnitsSwitch({ checked, onChange, hint }: { checked: boolean; onChange(on: boolean): void; hint?: string }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Write units with siunitx
        <span className="field-hint">{hint ?? 'A value such as 10 kN is written as \\qty{10}{\\kilo\\newton}, and the document loads siunitx.'}</span>
      </span>
    </label>
  );
}
