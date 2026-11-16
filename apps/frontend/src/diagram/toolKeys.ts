// Tool keys: a plain key that picks a canvas's tool (W for a wire), answered only while the pointer is over the
// drawing and nothing is being typed, so the key still types in every field. The keys are the Diagram group of
// app/shortcuts.ts, listed and changed in Settings › Diagram composer; a key the canvases use themselves (R, X, Y,
// the arrows…) is refused there (shortcutProblem).
//
// A composer whose rail is the shared ToolRail (controls.tsx) only names the shortcut on its tool:
//   { id: 'connect', label: 'Connect', icon, shortcut: 'diagramWire' }
// and the rail shows the key in the tooltip and answers it over the drawing (.diagram-stage).
//
// A composer with a rail of its own (the circuit's) calls the two hooks itself:
//   useToolKeys(() => svgRef.current, { diagramWire: () => setTool('wire') }, readOnly);    in the canvas
//   const title = useToolTitle();  …  title={title('Wire', 'diagramWire')}                  on the tool's button
import { useEffect, useRef } from 'react';
import { loadSettings, useSettings } from '../app/settings';
import { SHORTCUTS, matchesShortcut, shortcutKey, withShortcut } from '../app/shortcuts';

/**
 * The tool shortcuts' ids (app/shortcuts.ts, group Diagram). A composer answers only its own:
 * diagramWire (W) a wire, and Connect in the flowcharts; diagramMember (M) and diagramTruss (T) in Structures;
 * diagramPoint (P) and diagramVector (V) in Vector diagrams. A new one is a line in SHORTCUTS and a name here.
 */
export type ToolKey = 'diagramWire' | 'diagramMember' | 'diagramTruss' | 'diagramPoint' | 'diagramVector';

/** Whether a key press is being typed into a field or an editor, where a tool key must stay a letter. */
export const isTyping = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor');

/** The one of `ids` whose key (as changed in Settings: `overrides`) a key press is, if any. A held key repeating isn't. */
export const toolKeyOf = (e: KeyboardEvent, ids: string[], overrides: Record<string, string>) =>
  e.repeat ? undefined : ids.find((id) => SHORTCUTS.some((s) => s.id === id && s.group === 'Diagram') && matchesShortcut(shortcutKey(overrides, id), e));

/**
 * Answers the tool keys while the pointer is over the drawing and nothing is being typed.
 *
 * - `over`: gives the element the pointer has to be over (the canvas's <svg>, the stage); asked at each key press.
 * - `keys`: what each shortcut does here, by its id; may be a new object on every render.
 * - `off`: a drawing that can't be edited answers none.
 */
export function useToolKeys(over: () => Element | null | undefined, keys: Partial<Record<ToolKey, () => void>>, off = false) {
  const latest = useRef({ over, keys });
  latest.current = { over, keys };
  useEffect(() => {
    if (off) return;
    const onKey = (e: KeyboardEvent) => {
      const { over, keys } = latest.current;
      if (isTyping(e.target) || !over()?.matches(':hover')) return;
      const id = toolKeyOf(e, Object.keys(keys), loadSettings().shortcuts);
      if (!id) return;
      e.preventDefault();
      keys[id as ToolKey]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [off]);
}

/** For a tool's tooltip: gives (label, shortcut) => "Wire (W)", or the label alone without a shortcut or once it's removed. */
export function useToolTitle() {
  const [settings] = useSettings();
  return (label: string, shortcut?: ToolKey) => (shortcut ? withShortcut(settings.shortcuts, label, shortcut) : label);
}
