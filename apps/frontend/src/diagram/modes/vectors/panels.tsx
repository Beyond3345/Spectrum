// The vector mode's panels: the tools rail, the inspector for what's selected (with the coordinate table and the
// drawing's panels when nothing is), with each item's colour, thickness, dashes, tips and label look; and the style
// menu: the scale, the grid and the drawing's defaults.
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../../../app/Icon';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { num } from '../shared';
import { colourCss } from './Canvas';
import { GRIDS, readStyle } from './code';
import type { VectorStyle } from './code';
import { COLOURS, FONT_SIZES, SIDES, TIPS, WIDTHS, WIDTH_PT, addPanel, asVectors, cleanName, isLink, resolve, removeIds } from './model';
import type { Axes, Construction, Dash, EdgeLabel, FontSize, Item, Label, Link, LinkKind, Panel, PointShape, Stroke, TextStyle, Thickness, Tip, Tips, VPoint, VectorModel, Width } from './model';

const POINT_SHAPES: [PointShape, string][] = [
  ['filled', 'Filled'],
  ['open', 'Open'],
  ['cross', 'Cross']
];

// ─── rail ───

const GROUPS: [string, [string, string][]][] = [
  ['Drawing', [['point', 'Point'], ['vector', 'Vector'], ['segment', 'Segment'], ['line', 'Line through two points'], ['polygon', 'Polygon'], ['text', 'Text']]],
  ['Axes and marks', [['axes', 'Axes'], ['right', 'Right-angle mark'], ['drop', 'Drop to an axis'], ['highlight', 'Highlighted segment']]],
  ['Constructions', [['mid', 'Midpoint'], ['ratio', 'Point dividing a segment'], ['foot', 'Foot of a projection'], ['sum', 'u + v'], ['diff', 'v − u']]]
];

const HINTS: Record<string, string> = {
  point: 'click to place; it snaps to the grid',
  vector: 'click where it starts and where it ends, or drag',
  segment: 'click both ends, or drag',
  line: 'click two points; it runs out to the axes or the panel’s edge',
  polygon: 'click each corner, then the first again (or Return) to close it',
  text: 'click to place',
  axes: 'click a panel to give it axes through its origin',
  right: 'click the corner, then a point along one side',
  drop: 'click a point; a dashed line drops to the x axis',
  highlight: 'click both ends: a thick light line, for a projection',
  mid: 'click both ends',
  ratio: 'click A then B; the point divides AB in a ratio you choose',
  foot: 'click the point, then two points on the line',
  sum: 'click the tips of u and v; drawn from O when there is one',
  diff: 'click the tips of u and v; drawn from O when there is one'
};

/** A small picture of each tool. */
function Thumb({ tool }: { tool: string }) {
  const line = (d: string, extra = '') => <path d={d} className={`st-thumb ${extra}`} />;
  const dot = (x: number, y: number, open = false) => <circle cx={x} cy={y} r={2.2} className={open ? 'st-thumb-joint' : 'st-thumb-dot'} />;
  const arrow = 'st-thumb-arrow';
  const body: Record<string, ReactNode> = {
    point: dot(16, 14),
    vector: <>{line('M5,23 L26,6', arrow)}{dot(5, 23)}</>,
    segment: <>{line('M5,23 L27,6')}{dot(5, 23)}{dot(27, 6)}</>,
    line: <>{line('M2,25 L30,3')}{dot(11, 18)}{dot(21, 10)}</>,
    polygon: line('M5,23 L16,5 L28,19 Z'),
    text: <text x={16} y={19} className="st-thumb-text" textAnchor="middle">Aa</text>,
    axes: <>{line('M3,22 L29,22', arrow)}{line('M9,26 L9,3', arrow)}</>,
    right: <>{line('M5,24 L28,24 M5,24 L5,4')}{line('M5,17 L12,17 L12,24')}</>,
    drop: <>{line('M3,24 L29,24')}{line('M20,6 L20,24', 'st-thumb-dash')}{dot(20, 6)}</>,
    highlight: <>{line('M3,20 L29,20')}{line('M6,20 L20,20', 'st-thumb-heavy')}</>,
    mid: <>{line('M4,22 L28,6')}{dot(4, 22)}{dot(28, 6)}{dot(16, 14, true)}</>,
    ratio: <>{line('M4,22 L28,6')}{dot(4, 22)}{dot(28, 6)}{dot(12, 16.7, true)}</>,
    foot: <>{line('M3,24 L29,24')}{line('M14,5 L14,24', 'st-thumb-dash')}{dot(14, 5)}{dot(14, 24, true)}</>,
    sum: <>{line('M4,24 L22,22', arrow)}{line('M4,24 L10,8', arrow)}{line('M4,24 L27,7', arrow)}</>,
    diff: <>{line('M4,24 L24,22', arrow)}{line('M4,24 L10,6', arrow)}{line('M24,22 L11,8', `${arrow} st-thumb-dash`)}</>
  };
  return (
    <svg viewBox="0 0 32 28" width="32" height="28" aria-hidden="true">
      <defs>
        <marker id="st-thumb-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,1 L10,5 L0,9 z" className="st-arrowhead" />
        </marker>
      </defs>
      {body[tool]}
    </svg>
  );
}

export function VectorRail({ onPick, tool }: { onPick(tool: string): void; tool: string }) {
  const [filter, setFilter] = useState('');
  const words = filter.trim().toLowerCase();
  return (
    <div className="ckt-rail st-rail">
      <Segmented label="Tool" className="ckt-rail-tools" value={tool} options={[['select', 'Select']]} onChange={onPick} />
      <input className="input ckt-rail-filter" type="search" placeholder="Find a tool" aria-label="Find a tool" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
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
                    title={`${label}: ${HINTS[value]}`}
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
function NumberInput({ id, value, onChange, positive, unit, label }: { id?: string; value: number; onChange(v: number): void; positive?: boolean; unit?: string; label?: string }) {
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
        aria-label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(next) && (!positive || next > 0)) onChange(next);
        }}
        onBlur={() => setText(String(value))}
      />
      {unit && <span className="muted">{unit}</span>}
    </span>
  );
}

const SIDE_OPTIONS: [string, string][] = SIDES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]);
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

function TexField({ label, value, onChange, hint }: { label: string; value: string; onChange(v: string): void; hint?: string }) {
  return <Field label={label} hint={hint}>{(id) => <input id={id} className="input mono" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}</Field>;
}

// ─── looks: colour, thickness, dashes, opacity, tips and text ───

/** "As in Style": what an item's look shows when it takes the drawing's default */
const STYLED = 'As in Style';

/** A colour: a swatch, any xcolor name or mix typed (blue!50, green!60!black), or one picked; empty is the fallback. */
function ColourInput({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange(colour?: string): void }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="vec-colour">
          <div className="vec-swatches">
            {COLOURS.map((c) => (
              <button key={c} type="button" className="vec-swatch" style={{ background: colourCss(c) }} title={c} aria-label={c} aria-pressed={value === c} onClick={() => onChange(c)} />
            ))}
            <input type="color" className="colour-well" aria-label={`${label}: pick a colour`} value={value?.startsWith('#') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
          </div>
          <input id={id} className="input mono" value={value ?? ''} placeholder={fallback} onChange={(e) => onChange(e.target.value.trim() || undefined)} spellCheck={false} />
        </div>
      )}
    </Field>
  );
}

/** A thickness: a TikZ name, a width in pt, or the fallback. */
function ThicknessField({ label = 'Thickness', value, fallback, onChange }: { label?: string; value?: Thickness; fallback: string; onChange(width?: Thickness): void }) {
  const options: [string, string][] = [['', fallback], ...WIDTHS.map((w): [string, string] => [w, capital(w)]), ['pt', 'In pt']];
  return (
    <Field label={label}>
      {() => (
        <div className="ckt-row">
          <Select
            value={value === undefined ? '' : typeof value === 'number' ? 'pt' : value}
            options={options}
            onChange={(w) => onChange(w === '' ? undefined : w === 'pt' ? (typeof value === 'string' ? WIDTH_PT[value] : 1) : (w as Width))}
          />
          {typeof value === 'number' && <NumberInput label={`${label} in pt`} value={value} positive unit="pt" onChange={(w) => w <= 20 && onChange(w)} />}
        </div>
      )}
    </Field>
  );
}

const DASHES: [string, string][] = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
  ['dash dot', 'Dash dot'],
  ['custom', 'Custom']
];

/** A line's dashes: a TikZ name, or on and off lengths in pt. */
function DashField({ value, onChange }: { value: Dash; onChange(dash: Dash): void }) {
  return (
    <Field label="Dashes">
      {() => (
        <div className="ckt-row">
          <Select value={typeof value === 'string' ? value : 'custom'} options={DASHES} onChange={(d) => onChange(d === 'custom' ? [3, 2] : (d as Dash))} />
          {typeof value !== 'string' && (
            <>
              <NumberInput label="On" value={value[0]} positive unit="on" onChange={(on) => onChange([on, value[1]])} />
              <NumberInput label="Off" value={value[1]} positive unit="off" onChange={(off) => onChange([value[0], off])} />
            </>
          )}
        </div>
      )}
    </Field>
  );
}

function OpacityField({ label = 'Opacity', value, onChange }: { label?: string; value?: number; onChange(opacity?: number): void }) {
  return (
    <Field label={label} hint="1 is solid, 0 unseen.">
      {(id) => <NumberInput id={id} value={value ?? 1} onChange={(o) => o >= 0 && o <= 1 && onChange(o === 1 ? undefined : o)} />}
    </Field>
  );
}

type Lined = Stroke & { dashed?: boolean };

/** A line's colour, thickness, dashes and opacity; dash is the dashes it has when none are set (a drop's are dashed). */
function StrokeFields({ stroke, onChange, colour = STYLED, width = STYLED, dash = 'solid' }: { stroke: Lined; onChange(patch: Lined): void; colour?: string; width?: string; dash?: Dash }) {
  return (
    <>
      <ColourInput label="Colour" value={stroke.colour} fallback={colour} onChange={(c) => onChange({ colour: c })} />
      <ThicknessField value={stroke.width} fallback={width} onChange={(w) => onChange({ width: w })} />
      <DashField value={stroke.dash ?? (stroke.dashed ? 'dashed' : dash)} onChange={(d) => onChange({ dash: d === dash ? undefined : d, dashed: undefined })} />
      <OpacityField value={stroke.opacity} onChange={(opacity) => onChange({ opacity })} />
    </>
  );
}

const TIP_NAMES: Record<Tip, string> = { none: 'None', stealth: 'Stealth', latex: 'Latex', to: 'To', triangle: 'Triangle', 'open triangle': 'Open triangle', bar: 'Bar' };
const tipOptions = (tips: Tip[]): [string, string][] => tips.map((t) => [t, TIP_NAMES[t]]);

/** A line's tips: at each end (a vector's end is the Style's unless set), their size, both ends alike, and one halfway. */
function TipFields({ tips, vector, onChange }: { tips: Tips; vector: boolean; onChange(patch: Tips): void }) {
  const end = tips.end ?? (vector ? undefined : 'none');
  const both = !!tips.start && tips.start !== 'none';
  return (
    <>
      <div className="ckt-row">
        <Field label="Start">{() => <Select value={tips.start ?? 'none'} options={tipOptions(TIPS)} onChange={(t) => onChange({ start: t === 'none' ? undefined : (t as Tip) })} />}</Field>
        <Field label="End">
          {() => (
            <Select
              value={end ?? ''}
              options={[...(vector ? ([['', STYLED]] as [string, string][]) : []), ...tipOptions(TIPS)]}
              onChange={(t) => onChange({ end: t === '' || (!vector && t === 'none') ? undefined : (t as Tip) })}
            />
          )}
        </Field>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={both} onChange={(e) => onChange({ start: e.target.checked ? (end && end !== 'none' ? end : 'stealth') : undefined })} />
        <span>Double-headed</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={!!tips.middle} onChange={(e) => onChange({ middle: e.target.checked || undefined })} />
        <span>Arrow at the middle</span>
      </label>
      <Field label="Tip size" hint="1 is the usual size; left at the Style’s until changed.">
        {(id) => <NumberInput id={id} value={tips.tipSize ?? 1} positive onChange={(s) => s <= 5 && onChange({ tipSize: s })} />}
      </Field>
    </>
  );
}

const SIZE_OPTIONS: [string, string][] = FONT_SIZES.map((s) => [s, `\\${s}`]);

/** A label's size and colour. */
function TextFields({ text, onChange }: { text: TextStyle; onChange(patch: TextStyle): void }) {
  return (
    <>
      <Field label="Size">{() => <Select value={text.size ?? 'normalsize'} options={SIZE_OPTIONS} onChange={(size) => onChange({ size: size === 'normalsize' ? undefined : (size as FontSize) })} />}</Field>
      <ColourInput label="Text colour" value={text.colour} fallback="Black" onChange={(colour) => onChange({ colour })} />
    </>
  );
}

/** A point's label: its text, side and distance, size and colour. */
function LabelFields({ label, onChange }: { label?: Label; onChange(l: Label | undefined): void }) {
  const now = label ?? { text: '' };
  const set = (patch: Partial<Label>) => onChange({ ...now, ...patch });
  return (
    <>
      <TexField label="Label" value={now.text} hint="LaTeX, as in the document: $A$, $U(2,5)$." onChange={(text) => onChange(text ? { ...now, text } : undefined)} />
      {label && (
        <>
          <div className="ckt-row">
            <Field label="Side">{() => <Select value={now.side ?? 'above right'} options={SIDE_OPTIONS} onChange={(side) => set({ side: side as Label['side'] })} />}</Field>
            <Field label="Distance">{(id) => <NumberInput id={id} value={now.dist ?? 0} unit="pt" onChange={(d) => set({ dist: d || undefined })} />}</Field>
          </div>
          <TextFields text={now} onChange={set} />
        </>
      )}
    </>
  );
}

function EdgeLabelFields({ label, onChange }: { label?: EdgeLabel; onChange(l: EdgeLabel | undefined): void }) {
  const now = label ?? { text: '' };
  const set = (patch: Partial<EdgeLabel>) => onChange({ ...now, ...patch });
  return (
    <>
      <TexField label="Label" value={now.text} hint="LaTeX: $\mathbf{a}$, $\frac{1}{2}\mathbf{b}$." onChange={(text) => onChange(text ? { ...now, text } : undefined)} />
      {label && (
        <>
          <div className="ckt-row">
            <Field label="Along it">{(id) => <NumberInput id={id} value={now.pos ?? 0.5} onChange={(pos) => pos >= 0 && pos <= 1 && set({ pos: pos === 0.5 ? undefined : pos })} />}</Field>
            <Field label="Side">{() => <Select value={now.side ?? 'above'} options={SIDE_OPTIONS} onChange={(side) => set({ side: side as EdgeLabel['side'] })} />}</Field>
          </div>
          <TextFields text={now} onChange={set} />
        </>
      )}
    </>
  );
}

const describe = (c: Construction, name: (id: string) => string) => {
  switch (c.kind) {
    case 'mid':
      return `The midpoint of ${name(c.a)}${name(c.b)}.`;
    case 'ratio':
      return `Divides ${name(c.a)}${name(c.b)} in the ratio ${num(c.m)} : ${num(c.n)}.`;
    case 'foot':
      return `The foot of the perpendicular from ${name(c.p)} to the line ${name(c.a)}${name(c.b)}.`;
    case 'sum':
      return `The tip of u + v, with u and v from ${c.o ? name(c.o) : 'the origin'} to ${name(c.u)} and ${name(c.v)}.`;
    case 'diff':
      return `The tip of v − u from ${c.o ? name(c.o) : 'the origin'}, with u and v to ${name(c.u)} and ${name(c.v)}.`;
  }
};

/** Every point's coordinates, a free point's to type exactly; and the drawing's panels. */
function Overview({ model, onChange }: { model: VectorModel; onChange(m: VectorModel): void }) {
  const places = resolve(model);
  const setPoint = (id: string, patch: Partial<VPoint>) => onChange({ ...model, points: model.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const setPanel = (id: string, patch: Partial<Panel>) => onChange({ ...model, panels: model.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const caption = (panel: string) => (model.panels.length > 1 ? `${model.panels.find((p) => p.id === panel)?.caption ?? ''} ` : '');
  return (
    <>
      <p className="field-hint">Pick a tool on the left, then click the canvas. Points snap to the grid; constructed points follow the points they’re made from.</p>
      {model.points.length > 0 && (
        <section>
          <div className="ckt-inspector-title">Coordinates</div>
          <table className="vec-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>x</th>
                <th>y</th>
              </tr>
            </thead>
            <tbody>
              {model.points.map((p) => (
                <tr key={p.id}>
                  <td>
                    {caption(p.panel)}
                    {p.name}
                  </td>
                  {p.of ? (
                    <td colSpan={2} className="muted" title="Constructed: worked out from its points">
                      ({num(places.get(p.id)!.x)}, {num(places.get(p.id)!.y)})
                    </td>
                  ) : (
                    <>
                      <td>
                        <NumberInput label={`${p.name}, x`} value={p.x} onChange={(x) => setPoint(p.id, { x })} />
                      </td>
                      <td>
                        <NumberInput label={`${p.name}, y`} value={p.y} onChange={(y) => setPoint(p.id, { y })} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section>
        <div className="ckt-inspector-title">Panels</div>
        {model.panels.map((p, i) => (
          <div key={p.id} className="ckt-row">
            <Field label={`Panel ${i + 1} caption`}>{(id) => <input id={id} className="input" value={p.caption ?? ''} onChange={(e) => setPanel(p.id, { caption: e.target.value || undefined })} spellCheck={false} />}</Field>
            {i > 0 && <Field label="Shift">{(id) => <NumberInput id={id} value={p.shift} unit="cm" onChange={(shift) => setPanel(p.id, { shift })} />}</Field>}
            {i > 0 && (
              <button type="button" className="icon-btn" aria-label={`Delete panel ${i + 1} and what’s in it`} title="Delete the panel and what’s in it" onClick={() => onChange(removeIds(model, [p.id]))}>
                <Icon name="trash" />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => onChange(addPanel(model))}>
          <Icon name="plus" /> Add a panel
        </button>
        <div className="field-hint">Panels sit side by side, each written as a scope shifted right, with its caption under it.</div>
      </section>
    </>
  );
}

const LINK_KINDS: [LinkKind, string][] = [
  ['vector', 'Vector'],
  ['segment', 'Segment'],
  ['line', 'Line through the points'],
  ['highlight', 'Highlighted segment']
];

export function VectorInspector({ model: raw, onChange, selection = [] }: { model: VectorModel; onChange(m: VectorModel): void; selection?: string[] }) {
  const model = asVectors(raw);
  const picked: (VPoint | Item)[] = [...model.points.filter((p) => selection.includes(p.id)), ...model.items.filter((i) => selection.includes(i.id))];
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
        <Overview model={model} onChange={onChange} />
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
  const name = (id: string) => model.points.find((p) => p.id === id)?.name ?? '?';
  const item = picked[0];
  let title = '';
  let fields: ReactNode = null;
  if (!('kind' in item)) {
    const point = item;
    const set = (patch: Partial<VPoint>) => onChange({ ...model, points: model.points.map((p) => (p.id === point.id ? { ...p, ...patch } : p)) });
    const setOf = (patch: Partial<Construction>) => set({ of: { ...point.of!, ...patch } as Construction });
    const at = resolve(model).get(point.id)!;
    title = `Point ${point.name}`;
    fields = (
      <>
        <Field label="Name" hint="The coordinate’s name in the code.">
          {(id) => (
            <input
              id={id}
              className="input mono"
              value={point.name}
              onChange={(e) => {
                const typed = cleanName(e.target.value);
                if (!typed) return;
                // a label that was the name follows it
                const follows = point.label?.text === `$${point.name}$`;
                set({ name: typed, ...(follows && { label: { ...point.label!, text: `$${typed}$` } }) });
              }}
              spellCheck={false}
            />
          )}
        </Field>
        <LabelFields label={point.label} onChange={(label) => set({ label })} />
        <label className="checkbox-row">
          <input type="checkbox" role="switch" checked={!!point.dot} onChange={(e) => set({ dot: e.target.checked || undefined })} />
          <span>Dot</span>
        </label>
        {point.dot && (
          <>
            <div className="ckt-row">
              <Field label="Shape">{() => <Select value={point.shape ?? 'filled'} options={POINT_SHAPES} onChange={(shape) => set({ shape: shape === 'filled' ? undefined : (shape as PointShape) })} />}</Field>
              <Field label="Size" hint="Its radius; the Style’s until changed.">
                {(id) => <NumberInput id={id} value={point.size ?? 2} positive unit="pt" onChange={(size) => size <= 20 && set({ size })} />}
              </Field>
            </div>
            <ColourInput label="Colour" value={point.colour} fallback={STYLED} onChange={(colour) => set({ colour })} />
          </>
        )}
        {point.of ? (
          <>
            <div className="field-hint">{describe(point.of, name)}</div>
            {point.of.kind === 'ratio' && (
              <>
                <Field label="Ratio m : n">
                  {() => (
                    <div className="ckt-row">
                      <NumberInput label="m" value={point.of!.kind === 'ratio' ? point.of!.m : 1} positive onChange={(m) => setOf({ m })} />
                      <NumberInput label="n" value={point.of!.kind === 'ratio' ? point.of!.n : 1} positive onChange={(n) => setOf({ n })} />
                    </div>
                  )}
                </Field>
                <Field label="Ratio labels" hint="m and n written beside each part of the segment.">
                  {() => (
                    <Select
                      value={point.of!.kind === 'ratio' ? point.of!.marks ?? 'none' : 'none'}
                      options={[['none', 'None'], ...SIDE_OPTIONS]}
                      onChange={(marks) => setOf({ marks: marks === 'none' ? undefined : (marks as Label['side']) })}
                    />
                  )}
                </Field>
              </>
            )}
            <div className="field-hint">
              At ({num(at.x)}, {num(at.y)})
            </div>
          </>
        ) : (
          <Field label="Position">
            {() => (
              <div className="ckt-row">
                <NumberInput label="x" value={point.x} unit="x" onChange={(x) => set({ x })} />
                <NumberInput label="y" value={point.y} unit="y" onChange={(y) => set({ y })} />
              </div>
            )}
          </Field>
        )}
      </>
    );
  } else {
    const set = (patch: Partial<Item>) => onChange({ ...model, items: model.items.map((i) => (i.id === item.id ? ({ ...i, ...patch } as Item) : i)) });
    if (isLink(item)) {
      const link: Link = item;
      title = `${LINK_KINDS.find(([k]) => k === link.kind)![1]} ${name(link.a)}${name(link.b)}`;
      fields = (
        <>
          <Field label="Kind">{() => <Select value={link.kind} options={LINK_KINDS} onChange={(kind) => set({ kind: kind as LinkKind })} />}</Field>
          {link.kind === 'highlight' ? (
            <StrokeFields stroke={link} colour="blue!50" width="2.5 pt" onChange={set} />
          ) : (
            <>
              <StrokeFields stroke={link} onChange={set} />
              <div className="ckt-inspector-title">Arrow tips</div>
              <TipFields tips={link} vector={link.kind === 'vector'} onChange={set} />
              <EdgeLabelFields label={link.label} onChange={(label) => set({ label })} />
            </>
          )}
          <button type="button" className="btn small" onClick={() => set({ a: link.b, b: link.a })}>
            Reverse
          </button>
        </>
      );
    } else {
      switch (item.kind) {
        case 'polygon':
          title = `Polygon ${item.points.map(name).join('')}`;
          fields = (
            <>
              <StrokeFields stroke={item} onChange={set} />
              <ColourInput label="Fill" value={item.fill} fallback="None" onChange={(fill) => set({ fill })} />
              {item.fill && <OpacityField label="Fill opacity" value={item.fillOpacity} onChange={(fillOpacity) => set({ fillOpacity })} />}
            </>
          );
          break;
        case 'text':
          title = 'Text';
          fields = (
            <>
              <TexField label="Text" value={item.text} hint="LaTeX, as in the document." onChange={(text) => set({ text })} />
              <TextFields text={item} onChange={set} />
            </>
          );
          break;
        case 'axes': {
          title = 'Axes';
          const axes: Axes = item;
          const [xName, yName] = axes.names ?? ['$x$', '$y$'];
          fields = (
            <>
              <Field label="x from and to">
                {() => (
                  <div className="ckt-row">
                    <NumberInput label="x from" value={axes.x[0]} onChange={(v) => v < axes.x[1] && set({ x: [v, axes.x[1]] })} />
                    <NumberInput label="x to" value={axes.x[1]} onChange={(v) => v > axes.x[0] && set({ x: [axes.x[0], v] })} />
                  </div>
                )}
              </Field>
              <Field label="y from and to">
                {() => (
                  <div className="ckt-row">
                    <NumberInput label="y from" value={axes.y[0]} onChange={(v) => v < axes.y[1] && set({ y: [v, axes.y[1]] })} />
                    <NumberInput label="y to" value={axes.y[1]} onChange={(v) => v > axes.y[0] && set({ y: [axes.y[0], v] })} />
                  </div>
                )}
              </Field>
              <div className="ckt-row">
                <TexField label="x axis" value={xName} onChange={(v) => set({ names: [v, yName] })} />
                <TexField label="y axis" value={yName} onChange={(v) => set({ names: [xName, v] })} />
              </div>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!axes.ticks} onChange={(e) => set({ ticks: e.target.checked || undefined })} />
                <span>Ticks and numbers</span>
              </label>
              {axes.ticks && (
                <>
                  <div className="ckt-row">
                    <Field label="Step">{(id) => <NumberInput id={id} value={axes.step ?? 1} positive onChange={(step) => set({ step: step === 1 ? undefined : step })} />}</Field>
                    <Field label="Tick length">{(id) => <NumberInput id={id} value={axes.tick ?? 0.08} positive unit="cm" onChange={(tick) => set({ tick: tick === 0.08 ? undefined : tick })} />}</Field>
                  </div>
                  <Field label="Number size">{() => <Select value={axes.numbers ?? 'small'} options={SIZE_OPTIONS} onChange={(numbers) => set({ numbers: numbers === 'small' ? undefined : (numbers as FontSize) })} />}</Field>
                </>
              )}
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!axes.origin} onChange={(e) => set({ origin: e.target.checked || undefined })} />
                <span>O at the origin</span>
              </label>
              <ColourInput label="Colour" value={axes.colour} fallback="Black" onChange={(colour) => set({ colour })} />
              <ThicknessField value={axes.width} fallback="Normal" onChange={(width) => set({ width })} />
              <Field label="Arrow tips">{() => <Select value={axes.tip ?? ''} options={[['', STYLED], ...tipOptions(TIPS)]} onChange={(tip) => set({ tip: (tip || undefined) as Tip | undefined })} />}</Field>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!axes.grid} onChange={(e) => set({ grid: e.target.checked || undefined })} />
                <span>Grid</span>
              </label>
              {axes.grid && (
                <>
                  <ColourInput label="Grid colour" value={axes.gridColour} fallback="gray!30" onChange={(gridColour) => set({ gridColour })} />
                  <ThicknessField label="Grid thickness" value={axes.gridWidth} fallback="Very thin" onChange={(gridWidth) => set({ gridWidth })} />
                </>
              )}
            </>
          );
          break;
        }
        case 'right':
          title = `Right-angle mark at ${name(item.at)}`;
          fields = (
            <>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!item.flip} onChange={(e) => set({ flip: e.target.checked || undefined })} />
                <span>On the other side</span>
              </label>
              <StrokeFields stroke={item} onChange={set} />
            </>
          );
          break;
        case 'drop':
          title = `Drop from ${name(item.from)}`;
          fields = (
            <>
              <Field label="To the">
                {() => (
                  <Select
                    value={item.axis}
                    options={[
                      ['x', 'x axis'],
                      ['y', 'y axis']
                    ]}
                    onChange={(axis) => set({ axis: axis as 'x' | 'y' })}
                  />
                )}
              </Field>
              <StrokeFields stroke={item} dash="dashed" onChange={set} />
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

export function VectorStyleMenu({ style: raw, onChange }: { style: Record<string, unknown>; onChange(s: Record<string, unknown>): void }) {
  const style = readStyle(raw);
  const set = (patch: Partial<VectorStyle>) => onChange({ ...raw, ...patch });
  return (
    <div className="ckt-style">
      <Field label="Scale" hint="The whole picture, as TikZ’s scale: 1.1 is a tenth larger.">
        {(id) => <NumberInput id={id} value={style.scale} positive onChange={(scale) => scale >= 0.2 && scale <= 5 && set({ scale })} />}
      </Field>
      <Field label="Grid">{() => <Select value={String(style.grid)} options={GRIDS.map((g): [string, string] => [String(g), `${g} cm`])} onChange={(grid) => set({ grid: Number(grid) })} />}</Field>
      <div className="ckt-inspector-title">Drawing defaults</div>
      <div className="field-hint">What every item takes until it has its own: one changed by hand keeps its own.</div>
      <div className="ckt-row">
        <Field label="Arrow tip">{() => <Select value={style.tips} options={tipOptions(TIPS.filter((t) => t !== 'none'))} onChange={(tips) => set({ tips: tips as VectorStyle['tips'] })} />}</Field>
        <Field label="Tip size">{(id) => <NumberInput id={id} value={style.tipSize} positive onChange={(tipSize) => tipSize <= 5 && set({ tipSize: tipSize === 1 ? undefined : tipSize })} />}</Field>
      </div>
      <ThicknessField label="Vector thickness" value={style.vectorWidth} fallback="Normal" onChange={(vectorWidth) => set({ vectorWidth })} />
      <ThicknessField label="Line thickness" value={style.width} fallback="Normal" onChange={(width) => set({ width })} />
      <ColourInput label="Colour" value={style.colour} fallback="Black" onChange={(colour) => set({ colour })} />
      <Field label="Point size" hint="A dot’s radius.">
        {(id) => <NumberInput id={id} value={style.pointSize} positive unit="pt" onChange={(pointSize) => pointSize <= 20 && set({ pointSize: pointSize === 2 ? undefined : pointSize })} />}
      </Field>
    </div>
  );
}
