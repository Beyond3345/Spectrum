// The force diagrams' switches, fills and opacities: in a structure's Style menu, and in Settings › Composer for a new
// drawing's.
import { ColourField, Row } from '../../controls';
import type { DiagramLooks } from '../../types';
import { DIAGRAM_LOOKS } from './looks';

const NAMES: [keyof DiagramLooks, string][] = [
  ['axial', 'Axial force'],
  ['shear', 'Shear force'],
  ['moment', 'Bending moment']
];

/** light fills that print well, the defaults among them */
const SWATCHES = ['blue!12', 'red!12', 'green!15', 'orange!20', 'yellow!30', 'violet!15', 'teal!15', 'black!10'];

export default function DiagramFields({ looks, onChange }: { looks: DiagramLooks; onChange(looks: DiagramLooks): void }) {
  return (
    <>
      {NAMES.map(([key, name]) => {
        const look = looks[key];
        const set = (patch: Partial<DiagramLooks[typeof key]>) => onChange({ ...looks, [key]: { ...look, ...patch } });
        return (
          <div key={key} className="diagram-fields">
            <label className="checkbox-row">
              <input type="checkbox" role="switch" checked={look.on} onChange={(e) => set({ on: e.target.checked })} />
              <span>{name} diagram</span>
            </label>
            {look.on && (
              <>
                <ColourField
                  label={`${name} fill`}
                  value={look.fill === DIAGRAM_LOOKS[key].fill ? undefined : look.fill}
                  fallback={`Default (${DIAGRAM_LOOKS[key].fill})`}
                  swatches={SWATCHES}
                  onChange={(fill) => set({ fill: fill ?? DIAGRAM_LOOKS[key].fill })}
                />
                <Row label={`Opacity: ${Math.round(look.opacity * 100)}%`}>
                  <input type="range" min={0} max={100} step={5} value={Math.round(look.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
                </Row>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
