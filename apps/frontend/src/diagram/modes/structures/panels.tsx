// The structures mode's panels: the parts rail, the inspector for what's selected, and the style menu (the view, the
// conventions, the units and the size).
import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../../../app/Icon';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { UnitsSwitch } from '../../controls';
import { VIEWS, formatValue, readStyle } from './draw';
import type { StructStyle } from './draw';
import { UNITS, asStructure, fitLoads, frameOf, memberName, removeIds } from './model';
import type { AngleArc, Cut, Dimension, Dist, Force, Member, Moment, Note, Part, SNode, StructureModel, Support, SupportType, Units } from './model';
import { solve } from './solve';
import { useShown } from './store';
import { symbolSvg } from './symbols';

// ─── rail ───

const GROUPS: [string, [string, string][]][] = [
  ['Members', [['beam', 'Beam or frame member'], ['bar', 'Truss bar']]],
  ['Joints', [['joint', 'Joint'], ['hinge', 'Internal hinge'], ['release', 'Released member end']]],
  ['Supports', [['support:pin', 'Pin'], ['support:roller', 'Roller'], ['support:fixed', 'Fixed'], ['support:guided', 'Guided (slider)'], ['support:spring', 'Spring'], ['support:rotspring', 'Rotational spring']]],
  ['Loads', [['force', 'Point force'], ['moment-ccw', 'Moment, anticlockwise'], ['moment-cw', 'Moment, clockwise'], ['udl', 'Uniform load'], ['linear', 'Linearly varying load']]],
  ['Annotations', [['dim-h', 'Dimension, horizontal'], ['dim-v', 'Dimension, vertical'], ['dim-aligned', 'Dimension, aligned'], ['label', 'Label'], ['angle', 'Angle arc'], ['axes', 'Axes'], ['cut', 'Section cut']]]
];

const HINTS: Record<string, string> = {
  beam: 'drag from one point to another, or click both; ending on a member splits it',
  bar: 'drag from one joint to another; truss bars carry force along their length only',
  joint: 'click a member to split it, or anywhere for a free joint',
  hinge: 'click a joint, or a member to add one there',
  release: 'click near the end of a member',
  force: 'click a joint or a point along a member',
  'moment-ccw': 'click a joint or a point along a member',
  'moment-cw': 'click a joint or a point along a member',
  udl: 'click a member; drag its ends to shorten it',
  linear: 'click a member; drag its ends to shorten it',
  'dim-h': 'click two joints',
  'dim-v': 'click two joints',
  'dim-aligned': 'click two joints',
  angle: 'click a joint',
  cut: 'drag across the members to cut'
};

/** A small picture of each tool, in the canvas's own symbols where it has one. */
function Thumb({ tool }: { tool: string }) {
  const line = (d: string, extra = '') => <path d={d} className={`st-thumb ${extra}`} />;
  const arrow = 'st-thumb-arrow';
  let body: ReactNode;
  if (tool.startsWith('support:') || tool === 'hinge') {
    const name = tool === 'hinge' ? 'hinge' : tool.slice(8);
    body = (
      <g transform="translate(16,11) scale(22,-22)">
        {name !== 'hinge' && <path d="M-0.55,0 L0.55,0" className="st-sym st-sym-heavy" vectorEffect="non-scaling-stroke" />}
        {symbolSvg(name).map((s, i) => (s.circle ? <circle key={i} cx={s.circle.c.x} cy={s.circle.c.y} r={s.circle.r} className={`st-sym ${s.fill ? `st-sym-${s.fill}` : ''}`} vectorEffect="non-scaling-stroke" /> : <path key={i} d={s.d} className={`st-sym ${s.fill ? `st-sym-${s.fill}` : ''} ${s.heavy ? 'st-sym-heavy' : ''}`} vectorEffect="non-scaling-stroke" />))}
      </g>
    );
  } else if (tool === 'beam') body = line('M4,14 L28,14', 'st-thumb-heavy');
  else if (tool === 'bar') body = <>{line('M4,22 L16,6 L28,22 Z')}<circle cx={4} cy={22} r={1.8} className="st-thumb-joint" /><circle cx={16} cy={6} r={1.8} className="st-thumb-joint" /><circle cx={28} cy={22} r={1.8} className="st-thumb-joint" /></>;
  else if (tool === 'joint') body = <>{line('M4,14 L28,14', 'st-thumb-heavy')}<circle cx={16} cy={14} r={2.5} className="st-thumb-dot" /></>;
  else if (tool === 'release') body = <>{line('M4,14 L28,14', 'st-thumb-heavy')}<circle cx={24} cy={14} r={2.2} className="st-thumb-joint" /></>;
  else if (tool === 'force') body = <>{line('M4,22 L28,22', 'st-thumb-heavy')}{line('M16,3 L16,19', arrow)}</>;
  else if (tool.startsWith('moment')) body = <>{line('M4,18 L28,18', 'st-thumb-heavy')}{line(tool === 'moment-ccw' ? 'M22,15 A7,7 0 1 0 10,15' : 'M10,15 A7,7 0 1 1 22,15', arrow)}</>;
  else if (tool === 'udl' || tool === 'linear') body = <>{line('M4,24 L28,24', 'st-thumb-heavy')}{line(tool === 'udl' ? 'M4,8 L28,8' : 'M4,20 L28,6')}{[8, 16, 24].map((x) => <path key={x} d={`M${x},${tool === 'udl' ? 9 : 20 - ((x - 4) * 14) / 24 + 1} L${x},21`} className={`st-thumb ${arrow}`} />)}</>;
  else if (tool.startsWith('dim')) body = line(tool === 'dim-v' ? 'M16,4 L16,24 M12,4 L20,4 M12,24 L20,24' : tool === 'dim-aligned' ? 'M5,22 L27,6' : 'M4,14 L28,14 M4,10 L4,18 M28,10 L28,18');
  else if (tool === 'label') body = <text x={16} y={19} className="st-thumb-text" textAnchor="middle">Aa</text>;
  else if (tool === 'angle') body = <>{line('M4,22 L28,22 M4,22 L22,6')}{line('M16,22 A12,12 0 0 0 13,14')}</>;
  else if (tool === 'axes') body = <>{line('M6,24 L26,24', arrow)}{line('M6,24 L6,4', arrow)}</>;
  else if (tool === 'cut') body = <>{line('M4,16 L28,16', 'st-thumb-heavy')}{line('M12,4 L20,28', 'st-thumb-dash')}</>;
  return (
    <svg viewBox="0 0 32 28" width="32" height="28" aria-hidden="true">
      <defs>
        <marker id="st-thumb-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,1 L10,5 L0,9 z" className="st-arrowhead" />
        </marker>
      </defs>
      {body}
    </svg>
  );
}

export function StructureRail({ onPick, tool }: { onPick(tool: string): void; tool: string }) {
  const [filter, setFilter] = useState('');
  const words = filter.trim().toLowerCase();
  return (
    <div className="ckt-rail st-rail">
      <Segmented label="Tool" className="ckt-rail-tools" value={tool} options={[['select', 'Select']]} onChange={onPick} />
      <input className="input ckt-rail-filter" type="search" placeholder="Find a part" aria-label="Find a part" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
      <div className="ckt-rail-groups">
        {GROUPS.map(([group, tools]) => {
          const shown = tools.filter(([, label]) => label.toLowerCase().includes(words));
          if (!shown.length) return null;
          return (
            <section key={group} className="ckt-rail-group">
              <h3>{group}</h3>
              <div className="ckt-rail-parts">
                {shown.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`ckt-rail-part ${tool === value ? 'active' : ''}`}
                    aria-pressed={tool === value}
                    title={HINTS[value] ? `${label}: ${HINTS[value]}` : `${label}: click to place`}
                    onClick={() => onPick(tool === value ? 'select' : value)}
                  >
                    <span className="ckt-rail-thumb">
                      <Thumb tool={value} />
                    </span>
                    <span className="ckt-rail-label">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── inspector ───

function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** A number typed freely, kept once it's a number (and positive, when it must be). */
function NumberInput({ id, value, onChange, onDone, positive, unit }: { id?: string; value: number; onChange(v: number): void; onDone?(): void; positive?: boolean; unit?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // only when the value changes from elsewhere (undo, a drag)
  }, [value]);
  return (
    <span className="diagram-pair form-number">
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(next) && (!positive || next > 0)) onChange(next);
        }}
        onBlur={() => {
          setText(String(value));
          onDone?.();
        }}
      />
      {unit && <span className="muted">{unit}</span>}
    </span>
  );
}

const SUPPORT_TYPES: [SupportType, string][] = [
  ['pin', 'Pin'],
  ['roller', 'Roller'],
  ['fixed', 'Fixed'],
  ['guided', 'Guided (slider)'],
  ['spring', 'Spring'],
  ['rotspring', 'Rotational spring']
];

const DIRECTIONS: [string, string][] = [
  ['down', 'Down'],
  ['up', 'Up'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['perp', 'Perpendicular to the member'],
  ['angle', 'At an angle']
];
const ANGLES: Record<string, number> = { down: -90, up: 90, left: 180, right: 0 };
const directionOf = (load: { angle: number; perp?: boolean }) => (load.perp ? 'perp' : (Object.entries(ANGLES).find(([, a]) => a === load.angle)?.[0] ?? 'angle'));

function DirectionFields({ load, onMember, update }: { load: Force | Dist; onMember: boolean; update(patch: { angle?: number; perp?: boolean }): void }) {
  // the load chosen to be "At an angle": it stays so while its angle passes through −90°, 0°, 90° or 180°
  const [angled, setAngled] = useState<string>();
  const direction = angled === load.id && !load.perp ? 'angle' : directionOf(load);
  return (
    <>
      <Field label="Direction">
        {() => (
          <Select
            value={direction}
            options={DIRECTIONS.filter(([value]) => onMember || value !== 'perp')}
            onChange={(value) => {
              setAngled(value === 'angle' ? load.id : undefined);
              update(value === 'perp' ? { perp: true } : value === 'angle' ? { perp: undefined, angle: load.perp ? -90 : load.angle } : { perp: undefined, angle: ANGLES[value] });
            }}
          />
        )}
      </Field>
      {direction === 'angle' && (
        <Field label="Angle" hint="Anticlockwise from the right: −90° points down.">
          {(id) => <NumberInput id={id} value={load.angle} unit="°" onChange={(angle) => update({ angle })} />}
        </Field>
      )}
    </>
  );
}

function LabelField({ value, onChange }: { value?: string; onChange(v: string | undefined): void }) {
  return (
    <Field label="Label" hint="Shown instead of the value: LaTeX, as in the document, such as $P$ or $w_0$.">
      {(id) => <input id={id} className="input mono" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} spellCheck={false} />}
    </Field>
  );
}

export function StructureInspector({ model: raw, onChange, selection = [] }: { model: StructureModel; onChange(m: StructureModel): void; selection?: string[] }) {
  const model = asStructure(raw);
  const solution = useMemo(() => solve(model), [model]);
  const units = UNITS[useShown().style.units];
  const picked = [...model.nodes.filter((n) => selection.includes(n.id)), ...model.parts.filter((p) => selection.includes(p.id))];
  const remove = (
    <div className="ckt-row">
      <button type="button" className="btn small destructive" title="Delete (⌫)" onClick={() => onChange(removeIds(model, picked.map((x) => x.id)))}>
        <Icon name="trash" /> Delete
      </button>
    </div>
  );
  if (!picked.length) {
    return (
      <div className="ckt-inspector">
        <p className="field-hint">Pick a part on the left, then click the canvas: draw members from joint to joint, then add supports and loads. The reactions and diagrams follow every change.</p>
        <p className="field-hint">Choose what the figure shows (the free-body diagram, the shear force and bending moment diagrams, member forces, a joint or a section) under Style.</p>
        <p className="field-hint">{solution.status.text}</p>
      </div>
    );
  }
  if (picked.length > 1) {
    return (
      <div className="ckt-inspector">
        <div className="ckt-inspector-title">{picked.length} items selected</div>
        {remove}
      </div>
    );
  }
  const item = picked[0];
  const updatePart = (next: Part) => onChange({ ...model, parts: model.parts.map((p) => (p.id === next.id ? next : p)) });
  const memberOf = (id: string) => model.parts.find((p): p is Member => p.kind === 'member' && p.id === id);
  const lengthOf = (id: string) => {
    const m = memberOf(id);
    return m ? frameOf(model, m).length : 0;
  };
  const along = (on: Force['on'], update: (on: Force['on']) => void) =>
    'member' in on ? (
      <Field label="Distance along the member" hint={`From joint ${model.nodes.find((n) => n.id === memberOf(on.member)?.a)?.name ?? 'at its start'}, 0 to ${formatValue(lengthOf(on.member), 4)}.`}>
        {(id) => <NumberInput id={id} value={on.at} onChange={(at) => update({ member: on.member, at: Math.max(0, Math.min(lengthOf(on.member), at)) })} />}
      </Field>
    ) : null;

  let title = '';
  let fields: ReactNode = null;
  if (!('kind' in item)) {
    const node = item as SNode;
    const updateNode = (next: SNode) => onChange({ ...model, nodes: model.nodes.map((n) => (n.id === next.id ? next : n)) });
    // once the position is typed, not at each keystroke on the way: loads along its members stay within them
    const fit = () => {
      const fitted = fitLoads(model);
      if (fitted !== model) onChange(fitted);
    };
    title = `Joint ${node.name ?? ''}`.trim();
    fields = (
      <>
        <Field label="Name">{(id) => <input id={id} className="input mono" value={node.name ?? ''} onChange={(e) => updateNode({ ...node, name: e.target.value.replace(/[^A-Za-z0-9']/g, '') || undefined })} spellCheck={false} />}</Field>
        <Field label="Position">
          {() => (
            <div className="ckt-row">
              <NumberInput value={node.x} onChange={(x) => updateNode({ ...node, x })} onDone={fit} unit="x" />
              <NumberInput value={node.y} onChange={(y) => updateNode({ ...node, y })} onDone={fit} unit="y" />
            </div>
          )}
        </Field>
        <label className="checkbox-row">
          <input type="checkbox" role="switch" checked={!!node.hinge} onChange={(e) => updateNode({ ...node, hinge: e.target.checked || undefined })} />
          <span>Internal hinge</span>
        </label>
      </>
    );
  } else {
    const part = item as Part;
    switch (part.kind) {
      case 'member': {
        title = `Member ${memberName(model, part)}`;
        const set = (patch: Partial<Member>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="Kind">
              {() => (
                <Select
                  value={part.bar ? 'bar' : 'beam'}
                  options={[
                    ['beam', 'Beam or frame member'],
                    ['bar', 'Truss bar']
                  ]}
                  onChange={(value) => set({ bar: value === 'bar' || undefined, release: undefined })}
                />
              )}
            </Field>
            {!part.bar &&
              [0, 1].map((end) => (
                <label className="checkbox-row" key={end}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={!!part.release?.[end]}
                    onChange={(e) => {
                      const release: [boolean, boolean] = [...(part.release ?? [false, false])] as [boolean, boolean];
                      release[end] = e.target.checked;
                      set({ release: release[0] || release[1] ? release : undefined });
                    }}
                  />
                  <span>Released at {model.nodes.find((n) => n.id === (end ? part.b : part.a))?.name ?? (end ? 'its end' : 'its start')}</span>
                </label>
              ))}
            {!part.bar && (
              <Field label="Relative EI" hint="Matters only when the structure is indeterminate.">
                {(id) => <NumberInput id={id} value={part.EI ?? 1} positive onChange={(EI) => set({ EI: EI === 1 ? undefined : EI })} />}
              </Field>
            )}
            <Field label="Relative EA" hint="Members are nearly rigid along their length; a smaller EA lets this one stretch.">
              {(id) => <NumberInput id={id} value={part.EA ?? 1} positive onChange={(EA) => set({ EA: EA === 1 ? undefined : EA })} />}
            </Field>
            <div className="field-hint">Length {formatValue(lengthOf(part.id), 4)}</div>
          </>
        );
        break;
      }
      case 'support': {
        title = 'Support';
        const set = (patch: Partial<Support>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="Kind">{() => <Select value={part.type} options={SUPPORT_TYPES} onChange={(type) => set({ type: type as SupportType })} />}</Field>
            <Field label="Angle" hint="Turns the support anticlockwise; a roller at an angle pushes square to its surface.">
              {(id) => <NumberInput id={id} value={part.angle ?? 0} unit="°" onChange={(angle) => set({ angle: angle || undefined })} />}
            </Field>
            {(part.type === 'spring' || part.type === 'rotspring') && (
              <Field label="Relative stiffness" hint="Relative to the members’ EI.">
                {(id) => <NumberInput id={id} value={part.k ?? 1} positive onChange={(k) => set({ k: k === 1 ? undefined : k })} />}
              </Field>
            )}
          </>
        );
        break;
      }
      case 'force': {
        title = 'Point force';
        const set = (patch: Partial<Force>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="Value">{(id) => <NumberInput id={id} value={part.value} unit={units.force} onChange={(value) => set({ value })} />}</Field>
            <DirectionFields load={part} onMember={'member' in part.on} update={set} />
            {along(part.on, (on) => set({ on }))}
            <LabelField value={part.label} onChange={(label) => set({ label })} />
          </>
        );
        break;
      }
      case 'moment': {
        title = 'Moment';
        const set = (patch: Partial<Moment>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="Value">{(id) => <NumberInput id={id} value={part.value} unit={`${units.force} ${units.length}`} onChange={(value) => set({ value })} />}</Field>
            <Field label="Turning">
              {() => (
                <Select
                  value={part.cw ? 'cw' : 'ccw'}
                  options={[
                    ['ccw', 'Anticlockwise'],
                    ['cw', 'Clockwise']
                  ]}
                  onChange={(value) => set({ cw: value === 'cw' || undefined })}
                />
              )}
            </Field>
            {along(part.on, (on) => set({ on }))}
            <LabelField value={part.label} onChange={(label) => set({ label })} />
          </>
        );
        break;
      }
      case 'dist': {
        title = part.w1 === part.w2 ? 'Uniform load' : 'Linearly varying load';
        const set = (patch: Partial<Dist>) => updatePart({ ...part, ...patch });
        const L = lengthOf(part.member);
        fields = (
          <>
            <Field label="Intensity" hint="At its start and at its end; equal for a uniform load.">
              {() => (
                <div className="ckt-row">
                  <NumberInput value={part.w1} onChange={(w1) => set({ w1 })} />
                  <NumberInput value={part.w2} unit={`${units.force}/${units.length}`} onChange={(w2) => set({ w2 })} />
                </div>
              )}
            </Field>
            <Field label="From and to" hint={`Along the member, 0 to ${formatValue(L, 4)}.`}>
              {() => (
                <div className="ckt-row">
                  <NumberInput value={part.from} onChange={(from) => from < part.to && from >= 0 && set({ from })} />
                  <NumberInput value={part.to} onChange={(to) => to > part.from && to <= L + 1e-9 && set({ to })} />
                </div>
              )}
            </Field>
            <DirectionFields load={part} onMember update={set} />
            <LabelField value={part.label} onChange={(label) => set({ label })} />
          </>
        );
        break;
      }
      case 'dim': {
        title = 'Dimension';
        const set = (patch: Partial<Dimension>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="Measures">
              {() => (
                <Select
                  value={part.dir}
                  options={[
                    ['h', 'Horizontal'],
                    ['v', 'Vertical'],
                    ['aligned', 'Along the line between the joints']
                  ]}
                  onChange={(dir) => set({ dir: dir as Dimension['dir'] })}
                />
              )}
            </Field>
            <Field label="Offset" hint="How far from the joints; negative is below, or to the left.">
              {(id) => <NumberInput id={id} value={part.offset} onChange={(offset) => set({ offset })} />}
            </Field>
            <LabelField value={part.label} onChange={(label) => set({ label })} />
          </>
        );
        break;
      }
      case 'label': {
        title = 'Label';
        const set = (patch: Partial<Note>) => updatePart({ ...part, ...patch });
        fields = <Field label="Text" hint="LaTeX, as in the document.">{(id) => <input id={id} className="input mono" value={part.text} onChange={(e) => set({ text: e.target.value })} spellCheck={false} />}</Field>;
        break;
      }
      case 'angle': {
        title = 'Angle arc';
        const set = (patch: Partial<AngleArc>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <Field label="From and to" hint="Anticlockwise from the right.">
              {() => (
                <div className="ckt-row">
                  <NumberInput value={part.from} unit="°" onChange={(from) => set({ from })} />
                  <NumberInput value={part.to} unit="°" onChange={(to) => set({ to })} />
                </div>
              )}
            </Field>
            <LabelField value={part.label} onChange={(label) => set({ label })} />
          </>
        );
        break;
      }
      case 'axes': {
        title = 'Axes';
        fields = <div className="field-hint">Drag the axes to move them.</div>;
        break;
      }
      case 'cut': {
        title = 'Section cut';
        const set = (patch: Partial<Cut>) => updatePart({ ...part, ...patch });
        fields = (
          <>
            <label className="checkbox-row">
              <input type="checkbox" role="switch" checked={!!part.flip} onChange={(e) => set({ flip: e.target.checked || undefined })} />
              <span>Keep the other side</span>
            </label>
            <div className="field-hint">Drag its ends to move it. Show it under Style › View › Section free-body diagram.</div>
          </>
        );
        break;
      }
    }
  }
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">{title}</div>
      {fields}
      {remove}
    </div>
  );
}

// ─── style ───

export function StructureStyleMenu({ style: raw, onChange }: { style: Record<string, unknown>; onChange(s: Record<string, unknown>): void }) {
  const style = readStyle(raw);
  const { model } = useShown();
  const set = (patch: Partial<StructStyle>) => onChange({ ...raw, ...patch });
  const joints = model.nodes.filter((n) => model.parts.some((p) => p.kind === 'member' && (p.a === n.id || p.b === n.id)));
  const cuts = model.parts.filter((p): p is Cut => p.kind === 'cut');
  return (
    <div className="ckt-style">
      <Field label="View">{() => <Select value={style.view} options={VIEWS} onChange={(view) => set({ view: view as StructStyle['view'] })} />}</Field>
      {style.view === 'joint' && (
        <Field label="Joint">
          {() => <Select value={style.joint && joints.some((n) => n.id === style.joint) ? style.joint : joints[0]?.id ?? ''} options={joints.map((n, i) => [n.id, n.name ? `Joint ${n.name}` : `Joint ${i + 1}`])} onChange={(joint) => set({ joint })} />}
        </Field>
      )}
      {style.view === 'section' && (
        <Field label="Section cut" hint={cuts.length ? undefined : 'Draw one with Section cut on the left.'}>
          {() => <Select value={style.cut && cuts.some((c) => c.id === style.cut) ? style.cut : cuts[0]?.id ?? ''} options={cuts.map((c, i): [string, string] => [c.id, `Cut ${i + 1}`])} onChange={(cut) => set({ cut })} />}
        </Field>
      )}
      <Field label="Bending moment diagrams" hint="The default for new drawings is in Settings › Composer.">
        {() => (
          <Select
            value={style.moments}
            options={[
              ['tension', 'Tension side (sagging below)'],
              ['positive', 'Positive up']
            ]}
            onChange={(moments) => set({ moments: moments as StructStyle['moments'] })}
          />
        )}
      </Field>
      <Field label="Units" hint="Values are kept as typed; only the units’ names change.">
        {() => <Select value={style.units} options={Object.entries(UNITS).map(([id, u]): [string, string] => [id, u.label])} onChange={(units) => set({ units: units as Units, grid: 1 })} />}
      </Field>
      <Field label="Grid">
        {() => <Select value={String(style.grid)} options={UNITS[style.units].grids.map((g, i): [string, string] => [String(i), `${g} ${UNITS[style.units].length}`])} onChange={(grid) => set({ grid: Number(grid) })} />}
      </Field>
      <Field label="Significant figures">
        {() => <Select value={String(style.figures)} options={[2, 3, 4, 5].map((n): [string, string] => [String(n), String(n)])} onChange={(figures) => set({ figures: Number(figures) })} />}
      </Field>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={style.names} onChange={(e) => set({ names: e.target.checked })} />
        <span>Joint letters</span>
      </label>
      <UnitsSwitch checked={style.siUnits} onChange={(siUnits) => set({ siUnits })} />
      <Field label={`Size: ${style.width} cm across`}>
        {(id) => <input id={id} type="range" min={4} max={16} step={0.5} value={style.width} onChange={(e) => set({ width: Number(e.target.value) })} />}
      </Field>
    </div>
  );
}
