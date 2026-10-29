// A structure's force diagrams as its style keeps them: which of the axial force, shear force and bending moment
// diagrams are drawn, and each one's fill and opacity. Settings › Composer keeps a new drawing's, and a drawing keeps
// only what differs from these defaults, so one made before the choice draws and writes as it did.
import { isColour } from '../shared';
import type { DiagramLook, DiagramLooks } from '../../types';

/** The force diagrams as they were before they could be chosen: all three, in these fills. */
export const DIAGRAM_LOOKS: DiagramLooks = {
  axial: { on: true, fill: 'green!15', opacity: 1 },
  shear: { on: true, fill: 'blue!12', opacity: 1 },
  moment: { on: true, fill: 'red!12', opacity: 1 }
};

/** The force diagrams' looks as kept (in a drawing's style or Settings), anything missing or unknown from `base`. */
export function readLooks(raw: unknown, base: DiagramLooks = DIAGRAM_LOOKS): DiagramLooks {
  const kept = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Partial<Record<keyof DiagramLook, unknown>> | undefined>;
  const look = (key: keyof DiagramLooks): DiagramLook => {
    const { on, fill, opacity } = kept[key] && typeof kept[key] === 'object' ? kept[key]! : {};
    return {
      on: typeof on === 'boolean' ? on : base[key].on,
      fill: typeof fill === 'string' && isColour(fill) ? fill : base[key].fill,
      opacity: typeof opacity === 'number' && opacity >= 0 && opacity <= 1 ? opacity : base[key].opacity
    };
  };
  return { axial: look('axial'), shear: look('shear'), moment: look('moment') };
}

/** Only what differs from the defaults, for keeping in a file: {} when nothing does. */
export function changedLooks(looks: DiagramLooks) {
  const out: Partial<Record<keyof DiagramLooks, Partial<DiagramLook>>> = {};
  for (const key of Object.keys(looks) as (keyof DiagramLooks)[]) {
    const changed = Object.fromEntries(Object.entries(looks[key]).filter(([k, v]) => DIAGRAM_LOOKS[key][k as keyof DiagramLook] !== v));
    if (Object.keys(changed).length) out[key] = changed;
  }
  return out;
}
