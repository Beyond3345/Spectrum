// The vector mode's panels: the tools rail, the inspector for what's selected (with the coordinate table and the
// drawing's panels when nothing is), with each item's colour, thickness, dashes, tips and label look; and the style
// menu: the scale, the grid, the drawing's defaults and how vector names are written.
import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Icon from '../../../app/Icon';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { ColourField, More } from '../../controls';
import { useToolTitle } from '../../toolKeys';
import type { ToolKey } from '../../toolKeys';
import { num } from '../shared';
import { GRIDS, NOTATIONS, inReach, readStyle } from './code';
import type { Notation, VectorStyle } from './code';
import { COLOURS, FONT_SIZES, SIDES, TIPS, WIDTHS, WIDTH_PT, addPanel, asVectors, cleanName, dist, isLink, mirrorIds, moversOf, nameFree, placed, restyleIds, scaledName, setEquation, turnIds, vectorName, withText, resolve, removeIds } from './model';
import type { Axes, Construction, Dash, EdgeLabel, FontSize, Item, Label, Link, LinkKind, Panel, PointShape, Pt, Stroke, TextStyle, Thickness, Tip, Tips, VPoint, VectorModel, Width } from './model';

const POINT_SHAPES: [PointShape, string][] = [
  ['filled', 'Filled'],
  ['open', 'Open'],
  ['cross', 'Cross']
];

// ─── rail ───

const GROUPS: [string, [string, string][]][] = [
  [
    'Drawing',
    [
      ['point', 'Point'],
      ['vector', 'Vector'],
      ['segment', 'Segment'],
      ['line', 'Line through two points'],
      ['eqline', 'Line from its equation'],
      ['circle', 'Circle'],
      ['arc', 'Arc'],
      ['polygon', 'Polygon'],
      ['text', 'Text']
    ]
  ],
  [
    'Axes and marks',
    [
      ['axes', 'Axes'],
      ['angle', 'Angle'],
      ['right', 'Right-angle mark'],
      ['ticks', 'Equal-length ticks'],
      ['drop', 'Drop to an axis'],
      ['dropBoth', 'Drop to both axes'],
      ['highlight', 'Highlighted segment']
    ]
  ],
  [
    'Constructions',
    [
      ['mid', 'Midpoint'],
      ['ratio', 'Point dividing a segment'],
      ['foot', 'Foot of a projection'],
      ['meet', 'Intersection of two lines'],
      ['sum', 'u + v'],
      ['diff', 'v − u'],
      ['scale', 'Scalar multiple'],
      ['place', 'Vector placed at a point'],
      ['reflect', 'Reflection in a line'],
      ['parallel', 'Parallel through a point'],
      ['perp', 'Perpendicular through a point']
    ]
  ]
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
  diff: 'click the tips of u and v; drawn from O when there is one',
  eqline: 'click a panel for ax + by + c = 0 with its intercepts; type a, b and c',
  circle: 'click the centre, then a point on the circle',
  arc: 'click the centre, then where the arc starts and ends, anticlockwise',
  angle: 'click the corner, then a point on each side; θ by the arc',
  ticks: 'click both ends of a segment or vector; again for two or three ticks',
  dropBoth: 'click a point; dotted lines drop to both axes',
  meet: 'click two points on each line; the point where they cross',
  scale: 'click the tail and tip of a vector; 2 times it, any number after',
  place: 'click the tail and tip of a vector, then where to draw it from',
  reflect: 'click the point, then two points on the mirror line',
  parallel: 'click two points on a line, then the point to draw it through',
  perp: 'click two points on a line, then the point to draw it through'
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
    diff: <>{line('M4,24 L24,22', arrow)}{line('M4,24 L10,6', arrow)}{line('M24,22 L11,8', `${arrow} st-thumb-dash`)}</>,
    eqline: <>{line('M3,22 L29,22')}{line('M7,26 L7,3')}{line('M4,6 L28,25')}{line('M5,9 L9,13 M9,9 L5,13 M22,18 L26,22 M26,18 L22,22')}</>,
    circle: <>{line('M26,14 A10,10 0 1 0 6,14 A10,10 0 1 0 26,14')}{dot(16, 14)}</>,
    arc: <>{line('M26,20 A11,11 0 0 0 7,8')}{dot(16, 20)}</>,
    angle: <>{line('M4,24 L29,24 M4,24 L22,6')}{line('M14,24 A10,10 0 0 0 11,17')}</>,
    ticks: <>{line('M3,16 L29,16')}{line('M14,11 L14,21 M18,11 L18,21')}</>,
    dropBoth: <>{line('M3,24 L29,24 M6,27 L6,3')}{line('M6,8 L22,8 L22,24', 'st-thumb-dash')}{dot(22, 8)}</>,
    meet: <>{line('M3,24 L29,6 M3,8 L29,22')}{dot(16, 15.3, true)}</>,
    scale: <>{line('M4,24 L28,6', arrow)}{line('M4,24 L14,16.5', 'st-thumb-heavy')}</>,
    place: <>{line('M4,24 L14,10', arrow)}{line('M16,24 L26,10', `${arrow} st-thumb-dash`)}</>,
    reflect: <>{line('M3,26 L29,2', 'st-thumb-dash')}{dot(9, 8)}{dot(23, 20, true)}</>,
    parallel: <>{line('M3,24 L29,12')}{line('M3,14 L29,2')}{dot(14, 9)}</>,
    perp: <>{line('M3,22 L29,22')}{line('M16,4 L16,26')}{dot(16, 10)}</>
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

/** the tools with a key of their own (Settings › Diagram composer), answered over the drawing (Canvas.tsx) */
const TOOL_KEYS: Record<string, ToolKey> = { point: 'diagramPoint', vector: 'diagramVector' };

export function VectorRail({ onPick, tool }: { onPick(tool: string): void; tool: string }) {
  const [filter, setFilter] = useState('');
  const toolTitle = useToolTitle();
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
                    title={`${toolTitle(label, TOOL_KEYS[value])}: ${HINTS[value]}`}
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

/** A labelled field: children(id) for an input, and labelId for a Select (which names itself by aria-labelledby). */
function Field({ label, children, hint }: { label: string; children: (id: string, labelId: string) => ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id} id={`${id}-label`}>
        {label}
      </label>
      {children(id, `${id}-label`)}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** A number typed freely, kept once it's a number (and positive, when it must be); a length or coordinate (reach) kept where TeX can draw it. */
function NumberInput({ id, value, onChange, positive, unit, label, reach }: { id?: string; value: number; onChange(v: number): void; positive?: boolean; unit?: string; label?: string; reach?: 'cm' | 'pt' }) {
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
          if (e.target.value.trim() && Number.isFinite(next) && (!positive || next > 0)) onChange(reach ? inReach(next, reach) : next);
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

/** A colour: a swatch, any xcolor name or mix typed (blue!50, green!60!black), or one picked; none is the fallback. */
const ColourInput = (props: { label: string; value?: string; fallback: string; onChange(colour?: string): void }) => <ColourField {...props} swatches={COLOURS} />;

/** A thickness: a TikZ name, a width in pt, or the fallback. */
function ThicknessField({ label = 'Thickness', value, fallback, onChange }: { label?: string; value?: Thickness; fallback: string; onChange(width?: Thickness): void }) {
  const options: [string, string][] = [['', fallback], ...WIDTHS.map((w): [string, string] => [w, capital(w)]), ['pt', 'In pt']];
  return (
    <Field label={label}>
      {(_, labelId) => (
        <div className="ckt-row">
          <Select
            labelId={labelId}
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
      {(_, labelId) => (
        <div className="ckt-row">
          <Select labelId={labelId} value={typeof value === 'string' ? value : 'custom'} options={DASHES} onChange={(d) => onChange(d === 'custom' ? [3, 2] : (d as Dash))} />
          {typeof value !== 'string' && (
            <>
              <NumberInput label="On" value={value[0]} positive reach="pt" unit="on" onChange={(on) => onChange([on, value[1]])} />
              <NumberInput label="Off" value={value[1]} positive reach="pt" unit="off" onChange={(off) => onChange([value[0], off])} />
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

/** A line's colour and thickness. */
function StrokeFields({ stroke, onChange, colour = STYLED, width = STYLED }: { stroke: Lined; onChange(patch: Lined): void; colour?: string; width?: string }) {
  return (
    <>
      <ColourInput label="Colour" value={stroke.colour} fallback={colour} onChange={(c) => onChange({ colour: c })} />
      <ThicknessField value={stroke.width} fallback={width} onChange={(w) => onChange({ width: w })} />
    </>
  );
}

/** A line's dashes and opacity, the rarer half of its look; dash is the dashes it has when none are set (a drop's are dashed). */
function LineLook({ stroke, onChange, dash = 'solid' }: { stroke: Lined; onChange(patch: Lined): void; dash?: Dash }) {
  return (
    <>
      <DashField value={stroke.dash ?? (stroke.dashed ? 'dashed' : dash)} onChange={(d) => onChange({ dash: d === dash ? undefined : d, dashed: undefined })} />
      <OpacityField value={stroke.opacity} onChange={(opacity) => onChange({ opacity })} />
    </>
  );
}
/** whether a line's dashes or opacity are its own, so its fold opens */
const lookSet = (s: Lined) => s.dash !== undefined || !!s.dashed || s.opacity !== undefined;

const TIP_NAMES: Record<Tip, string> = { none: 'None', stealth: 'Stealth', latex: 'Latex', to: 'To', triangle: 'Triangle', 'open triangle': 'Open triangle', bar: 'Bar' };
const tipOptions = (tips: Tip[]): [string, string][] => tips.map((t) => [t, TIP_NAMES[t]]);
const endOf = (tips: Tips, vector: boolean) => tips.end ?? (vector ? undefined : 'none');

/** A line's end tip: a vector's is the Style's unless set. */
function EndTip({ tips, vector, onChange }: { tips: Tips; vector: boolean; onChange(patch: Tips): void }) {
  return (
    <Field label="End tip">
      {(_, labelId) => (
        <Select
          labelId={labelId}
          value={endOf(tips, vector) ?? ''}
          options={[...(vector ? ([['', STYLED]] as [string, string][]) : []), ...tipOptions(TIPS)]}
          onChange={(t) => onChange({ end: t === '' || (!vector && t === 'none') ? undefined : (t as Tip) })}
        />
      )}
    </Field>
  );
}

/** A line's other tips: at the start, both ends alike, one halfway, and their size. */
function TipFields({ tips, vector, tipSize, onChange }: { tips: Tips; vector: boolean; tipSize: number; onChange(patch: Tips): void }) {
  const end = endOf(tips, vector);
  const both = !!tips.start && tips.start !== 'none';
  return (
    <>
      <Field label="Start tip">{(_, labelId) => <Select labelId={labelId} value={tips.start ?? 'none'} options={tipOptions(TIPS)} onChange={(t) => onChange({ start: t === 'none' ? undefined : (t as Tip) })} />}</Field>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={both} onChange={(e) => onChange({ start: e.target.checked ? (end && end !== 'none' ? end : 'stealth') : undefined })} />
        <span>Double-headed</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" role="switch" checked={!!tips.middle} onChange={(e) => onChange({ middle: e.target.checked || undefined })} />
        <span>Arrow at the middle</span>
      </label>
      <Field label="Tip size" hint="1 is the usual size; left at the Style’s until changed.">
        {(id) => <NumberInput id={id} value={tips.tipSize ?? tipSize} positive onChange={(s) => s <= 5 && onChange({ tipSize: s === tipSize ? undefined : s })} />}
      </Field>
    </>
  );
}
const tipsSet = (t: Tips) => (!!t.start && t.start !== 'none') || !!t.middle || t.tipSize !== undefined;

const SIZE_OPTIONS: [string, string][] = FONT_SIZES.map((s) => [s, `\\${s}`]);

/** A label's size and colour. */
function TextFields({ text, onChange }: { text: TextStyle; onChange(patch: TextStyle): void }) {
  return (
    <>
      <Field label="Size">{(_, labelId) => <Select labelId={labelId} value={text.size ?? 'normalsize'} options={SIZE_OPTIONS} onChange={(size) => onChange({ size: size === 'normalsize' ? undefined : (size as FontSize) })} />}</Field>
      <ColourInput label="Text colour" value={text.colour} fallback="Black" onChange={(colour) => onChange({ colour })} />
    </>
  );
}
const textSet = (t?: TextStyle) => !!t && (t.size !== undefined || t.colour !== undefined);
/** whether a label's rarer settings are set, so its fold opens */
const labelSet = (l?: Label | EdgeLabel) => textSet(l) || !!(l && 'dist' in l && l.dist) || (!!l && 'pos' in l && l.pos !== undefined);

/** no side: the label goes where it touches nothing (labels.ts) */
const CLEAR = 'Where it’s clear';
const POINT_SIDES: [string, string][] = [['', CLEAR], ...SIDE_OPTIONS];
const EDGE_SIDES: [string, string][] = [['', CLEAR], ['beside', 'Beside the arrow, left or right'], ...SIDE_OPTIONS];

/** A label's text and side: a point's, or a line's (edge), which can also sit beside the arrow. */
function LabelMain<L extends Label | EdgeLabel>({ label, onChange, edge, hint }: { label?: L; onChange(l: L | undefined): void; edge?: boolean; hint: string }) {
  const now = (label ?? { text: '' }) as L;
  return (
    <>
      <TexField label="Label" value={now.text} hint={hint} onChange={(text) => onChange(withText(now, text))} />
      {label && (
        <Field label="Side">
          {(_, labelId) => <Select labelId={labelId} value={now.side ?? ''} options={edge ? EDGE_SIDES : POINT_SIDES} onChange={(side) => onChange({ ...now, side: side || undefined })} />}
        </Field>
      )}
    </>
  );
}

/** A label's rarer settings: a point's distance (once it has a side) or a line's place along it, its size and colour. */
function LabelLook<L extends Label | EdgeLabel>({ label, onChange, edge }: { label?: L; onChange(l: L): void; edge?: boolean }) {
  if (!label) return null;
  const set = (patch: Partial<Label & EdgeLabel>) => onChange({ ...label, ...patch });
  return (
    <>
      {!edge ? (
        label.side && <Field label="Distance">{(id) => <NumberInput id={id} value={(label as Label).dist ?? 0} reach="pt" unit="pt" onChange={(d) => set({ dist: d || undefined })} />}</Field>
      ) : (
        <Field label="Along it" hint="0 at the start, 1 at the end.">{(id) => <NumberInput id={id} value={(label as EdgeLabel).pos ?? 0.5} onChange={(pos) => pos >= 0 && pos <= 1 && set({ pos: pos === 0.5 ? undefined : pos })} />}</Field>
      )}
      <TextFields text={label} onChange={set} />
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
    case 'meet':
      return `Where the lines ${name(c.a)}${name(c.b)} and ${name(c.c)}${name(c.d)} cross.`;
    case 'scale':
      return `The tip of k times ${name(c.a)}${name(c.b)}, drawn from ${name(c.a)}.`;
    case 'reflect':
      return `The reflection of ${name(c.p)} in the line ${name(c.a)}${name(c.b)}.`;
    case 'perp':
      return `With ${name(c.p)}, on the line through ${name(c.p)} square to ${name(c.a)}${name(c.b)}.`;
    case 'intercept':
      return `Where the line from its equation crosses the ${c.axis} axis.`;
  }
};

/** A place as the inspector shows it: (2, 1), or nowhere for a construction with none now. */
const where = (p: Pt | undefined) => (placed(p) ? `(${num(p.x)}, ${num(p.y)})` : 'Nowhere now: the lines are parallel or it has no place');

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
                      {placed(places.get(p.id)) ? where(places.get(p.id)) : 'Nowhere'}
                    </td>
                  ) : (
                    <>
                      <td>
                        <NumberInput label={`${p.name}, x`} value={p.x} reach="cm" onChange={(x) => setPoint(p.id, { x })} />
                      </td>
                      <td>
                        <NumberInput label={`${p.name}, y`} value={p.y} reach="cm" onChange={(y) => setPoint(p.id, { y })} />
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
            {i > 0 && <Field label="Shift">{(id) => <NumberInput id={id} value={p.shift} reach="cm" unit="cm" onChange={(shift) => setPanel(p.id, { shift })} />}</Field>}
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

/** A point's name, taken once it's one no other point in its panel has (the code would write a second A as A2). */
function NameField({ name, free, onChange }: { name: string; free(name: string): boolean; onChange(name: string): void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const clash = !!draft && draft !== name && !free(draft);
  return (
    <Field label="Name" hint={clash ? `Another point in this panel is ${draft}.` : 'The coordinate’s name in the code.'}>
      {(id) => (
        <input
          id={id}
          className="input mono"
          value={draft}
          aria-invalid={clash}
          onChange={(e) => {
            const typed = cleanName(e.target.value);
            setDraft(typed);
            if (typed && free(typed)) onChange(typed);
          }}
          onBlur={() => setDraft(name)}
          spellCheck={false}
        />
      )}
    </Field>
  );
}

const TICKS: [string, string][] = [
  ['0', 'None'],
  ['1', 'One'],
  ['2', 'Two'],
  ['3', 'Three']
];

const LINK_KINDS: [LinkKind, string][] = [
  ['vector', 'Vector'],
  ['segment', 'Segment'],
  ['line', 'Line through the points'],
  ['highlight', 'Highlighted segment']
];

/** Turns a selection by an angle typed in, or mirrors it; over the canvas R, X and Y do the same. */
function Arrange({ model, ids, onChange }: { model: VectorModel; ids: string[]; onChange(m: VectorModel): void }) {
  const [angle, setAngle] = useState(15);
  return (
    <>
      <Field label="Turn by" hint="Anticlockwise about the middle of what’s selected. Over the canvas, R turns it 90° and X and Y mirror it.">
        {(id) => (
          <div className="ckt-row">
            <NumberInput id={id} value={angle} unit="°" onChange={setAngle} />
            <button type="button" className="btn small" onClick={() => onChange(turnIds(model, ids, angle))}>
              Turn
            </button>
          </div>
        )}
      </Field>
      <div className="ckt-row">
        <button type="button" className="btn small" onClick={() => onChange(mirrorIds(model, ids, 'x'))}>
          Mirror left to right
        </button>
        <button type="button" className="btn small" onClick={() => onChange(mirrorIds(model, ids, 'y'))}>
          Mirror top to bottom
        </button>
      </div>
    </>
  );
}

/** The value every one of these has (undefined, the Style's, when they differ). */
const common = <T,>(values: T[]) => (values.length && values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : undefined);

export function VectorInspector({ model: raw, onChange, selection = [], style: rawStyle = {} }: { model: VectorModel; onChange(m: VectorModel): void; selection?: string[]; style?: Record<string, unknown> }) {
  const model = asVectors(raw);
  const style = readStyle(rawStyle);
  const picked: (VPoint | Item)[] = [...model.points.filter((p) => selection.includes(p.id)), ...model.items.filter((i) => selection.includes(i.id))];
  const ids = picked.map((x) => x.id);
  const movers = moversOf(model, ids);
  const arrangeable = movers.points.size > 0 || movers.items.size > 0;
  const remove = (
    <div className="ckt-row">
      <button type="button" className="btn small destructive" title="Delete (⌫)" onClick={() => onChange(removeIds(model, ids))}>
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
    // colour for all that take one, thickness for all lines
    const lines = picked.filter((x) => 'kind' in x && x.kind !== 'text') as Item[];
    return (
      <div className="ckt-inspector">
        <div className="ckt-inspector-title">{picked.length} items selected</div>
        <ColourInput label="Colour" value={common(picked.map((x) => ('colour' in x ? x.colour : undefined)))} fallback={STYLED} onChange={(colour) => onChange(restyleIds(model, ids, { colour }))} />
        {lines.length > 0 && <ThicknessField value={common(lines.map((x) => ('width' in x ? x.width : undefined)))} fallback={STYLED} onChange={(width) => onChange(restyleIds(model, ids, { width }))} />}
        <div className="field-hint">Each selected item takes it; ‘As in Style’ gives each its default again.</div>
        {arrangeable && <Arrange model={model} ids={ids} onChange={onChange} />}
        {remove}
      </div>
    );
  }
  const name = (id: string) => model.points.find((p) => p.id === id)?.name ?? '?';
  const item = picked[0];
  /** the item's rarer fields, folded until one is set */
  const more = (summary: string, open: boolean, children: ReactNode) => (
    <More key={item.id} summary={summary} open={open}>
      {children}
    </More>
  );
  const arrange = arrangeable && more('Turn and mirror', false, <Arrange model={model} ids={ids} onChange={onChange} />);
  let title = '';
  let fields: ReactNode = null;
  if (!('kind' in item)) {
    const point = item;
    const set = (patch: Partial<VPoint>) => onChange({ ...model, points: model.points.map((p) => (p.id === point.id ? { ...p, ...patch } : p)) });
    const setOf = (patch: Partial<Construction>) => set({ of: { ...point.of!, ...patch } as Construction });
    const at = resolve(model).get(point.id);
    title = `Point ${point.name}`;
    fields = (
      <>
        <NameField
          name={point.name}
          free={(typed) => nameFree(model, point, typed)}
          onChange={(typed) => {
            // a label that was the name follows it
            const follows = point.label?.text === `$${point.name}$`;
            set({ name: typed, ...(follows && { label: { ...point.label!, text: `$${typed}$` } }) });
          }}
        />
        <LabelMain label={point.label} hint="LaTeX, as in the document: $A$, $U(2,5)$." onChange={(label) => set({ label })} />
        <label className="checkbox-row">
          <input type="checkbox" role="switch" checked={!!point.dot} onChange={(e) => set({ dot: e.target.checked || undefined })} />
          <span>Dot</span>
        </label>
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
                  {(_, labelId) => (
                    <Select
                      labelId={labelId}
                      value={point.of!.kind === 'ratio' ? point.of!.marks ?? 'none' : 'none'}
                      options={[['none', 'None'], ...SIDE_OPTIONS]}
                      onChange={(marks) => setOf({ marks: marks === 'none' ? undefined : (marks as Label['side']) })}
                    />
                  )}
                </Field>
              </>
            )}
            {point.of.kind === 'scale' && (
              <Field label="k" hint="Any number: −1 turns it round, 0.5 halves it.">
                {(id) => (
                  <NumberInput
                    id={id}
                    value={point.of!.kind === 'scale' ? point.of!.k : 2}
                    onChange={(k) => {
                      const of = point.of as Extract<Construction, { kind: 'scale' }>;
                      // the vector drawn to it keeps its label in step while it's the one written for k
                      const auto = scaledName(of.k, vectorName(model, of.a, of.b));
                      onChange({
                        ...model,
                        points: model.points.map((p) => (p.id === point.id ? { ...p, of: { ...of, k } } : p)),
                        items: model.items.map((i) => (isLink(i) && i.b === point.id && i.label?.text === auto ? { ...i, label: { ...i.label, text: scaledName(k, vectorName(model, of.a, of.b)) } } : i))
                      });
                    }}
                  />
                )}
              </Field>
            )}
            <div className="field-hint">At {where(at)}</div>
          </>
        ) : (
          <Field label="Position">
            {() => (
              <div className="ckt-row">
                <NumberInput label="x" value={point.x} reach="cm" unit="x" onChange={(x) => set({ x })} />
                <NumberInput label="y" value={point.y} reach="cm" unit="y" onChange={(y) => set({ y })} />
              </div>
            )}
          </Field>
        )}
        {more(
          'Dot and label look',
          labelSet(point.label) || point.shape !== undefined || point.size !== undefined || point.colour !== undefined,
          <>
            {point.dot && (
              <>
                <div className="ckt-row">
                  <Field label="Shape">{(_, labelId) => <Select labelId={labelId} value={point.shape ?? 'filled'} options={POINT_SHAPES} onChange={(shape) => set({ shape: shape === 'filled' ? undefined : (shape as PointShape) })} />}</Field>
                  <Field label="Size" hint="Its radius; the Style’s until changed.">
                    {(id) => <NumberInput id={id} value={point.size ?? style.pointSize} positive unit="pt" onChange={(size) => size <= 20 && set({ size: size === style.pointSize ? undefined : size })} />}
                  </Field>
                </div>
                <ColourInput label="Colour" value={point.colour} fallback={STYLED} onChange={(colour) => set({ colour })} />
              </>
            )}
            <LabelLook label={point.label} onChange={(label) => set({ label })} />
          </>
        )}
      </>
    );
  } else {
    const set = (patch: Partial<Item>) => onChange({ ...model, items: model.items.map((i) => (i.id === item.id ? ({ ...i, ...patch } as Item) : i)) });
    if (isLink(item)) {
      const link: Link = item;
      title = `${LINK_KINDS.find(([k]) => k === link.kind)![1]} ${name(link.a)}${name(link.b)}`;
      const highlight = link.kind === 'highlight';
      fields = (
        <>
          <Field label="Kind">{(_, labelId) => <Select labelId={labelId} value={link.kind} options={LINK_KINDS} onChange={(kind) => set({ kind: kind as LinkKind })} />}</Field>
          {highlight ? <StrokeFields stroke={link} colour="blue!50" width="2.5 pt" onChange={set} /> : <StrokeFields stroke={link} onChange={set} />}
          {!highlight && <EndTip tips={link} vector={link.kind === 'vector'} onChange={set} />}
          {!highlight && <LabelMain label={link.label} edge hint="LaTeX: $\mathbf{a}$, $\frac{1}{2}\mathbf{b}$." onChange={(label) => set({ label })} />}
          {more(
            highlight ? 'Dashes and opacity' : 'Dashes, tips, ticks and label look',
            lookSet(link) || (!highlight && (tipsSet(link) || !!link.ticks || labelSet(link.label))),
            <>
              <LineLook stroke={link} onChange={set} />
              {!highlight && (
                <>
                  <TipFields tips={link} vector={link.kind === 'vector'} tipSize={style.tipSize} onChange={set} />
                  {link.kind !== 'line' && (
                    <Field label="Equal-length ticks">
                      {(_, labelId) => <Select labelId={labelId} value={String(link.ticks ?? 0)} options={TICKS} onChange={(n) => set({ ticks: Number(n) || undefined })} />}
                    </Field>
                  )}
                  <LabelLook label={link.label} edge onChange={(label) => set({ label })} />
                </>
              )}
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
              {more(
                'Dashes and opacity',
                lookSet(item) || item.fillOpacity !== undefined,
                <>
                  <LineLook stroke={item} onChange={set} />
                  {item.fill && <OpacityField label="Fill opacity" value={item.fillOpacity} onChange={(fillOpacity) => set({ fillOpacity })} />}
                </>
              )}
            </>
          );
          break;
        case 'text':
          title = 'Text';
          fields = (
            <>
              <TexField label="Text" value={item.text} hint="LaTeX, as in the document." onChange={(text) => set({ text })} />
              {more('Size and colour', textSet(item), <TextFields text={item} onChange={set} />)}
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
                    <NumberInput label="x from" value={axes.x[0]} reach="cm" onChange={(v) => v < axes.x[1] && set({ x: [v, axes.x[1]] })} />
                    <NumberInput label="x to" value={axes.x[1]} reach="cm" onChange={(v) => v > axes.x[0] && set({ x: [axes.x[0], v] })} />
                  </div>
                )}
              </Field>
              <Field label="y from and to">
                {() => (
                  <div className="ckt-row">
                    <NumberInput label="y from" value={axes.y[0]} reach="cm" onChange={(v) => v < axes.y[1] && set({ y: [v, axes.y[1]] })} />
                    <NumberInput label="y to" value={axes.y[1]} reach="cm" onChange={(v) => v > axes.y[0] && set({ y: [axes.y[0], v] })} />
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
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!axes.origin} onChange={(e) => set({ origin: e.target.checked || undefined })} />
                <span>O at the origin</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!axes.grid} onChange={(e) => set({ grid: e.target.checked || undefined })} />
                <span>Grid</span>
              </label>
              {more(
                'Ticks, colour, tips and grid look',
                [axes.step, axes.tick, axes.numbers, axes.colour, axes.width, axes.tip, axes.gridColour, axes.gridWidth].some((v) => v !== undefined),
                <>
                  {axes.ticks && (
                    <>
                      <div className="ckt-row">
                        <Field label="Step">{(id) => <NumberInput id={id} value={axes.step ?? 1} positive reach="cm" onChange={(step) => set({ step: step === 1 ? undefined : step })} />}</Field>
                        <Field label="Tick length">{(id) => <NumberInput id={id} value={axes.tick ?? 0.08} positive reach="cm" unit="cm" onChange={(tick) => set({ tick: tick === 0.08 ? undefined : tick })} />}</Field>
                      </div>
                      <Field label="Number size">{(_, labelId) => <Select labelId={labelId} value={axes.numbers ?? 'small'} options={SIZE_OPTIONS} onChange={(numbers) => set({ numbers: numbers === 'small' ? undefined : (numbers as FontSize) })} />}</Field>
                    </>
                  )}
                  <ColourInput label="Colour" value={axes.colour} fallback="Black" onChange={(colour) => set({ colour })} />
                  <ThicknessField value={axes.width} fallback="Normal" onChange={(width) => set({ width })} />
                  <Field label="Arrow tips">{(_, labelId) => <Select labelId={labelId} value={axes.tip ?? ''} options={[['', STYLED], ...tipOptions(TIPS)]} onChange={(tip) => set({ tip: (tip || undefined) as Tip | undefined })} />}</Field>
                  {axes.grid && (
                    <>
                      <ColourInput label="Grid colour" value={axes.gridColour} fallback="gray!30" onChange={(gridColour) => set({ gridColour })} />
                      <ThicknessField label="Grid thickness" value={axes.gridWidth} fallback="Very thin" onChange={(gridWidth) => set({ gridWidth })} />
                    </>
                  )}
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
              {more('Dashes and opacity', lookSet(item), <LineLook stroke={item} onChange={set} />)}
            </>
          );
          break;
        case 'drop':
          title = `Drop from ${name(item.from)}`;
          fields = (
            <>
              <Field label="To the">
                {(_, labelId) => (
                  <Select
                    labelId={labelId}
                    value={item.axis}
                    options={[
                      ['x', 'x axis'],
                      ['y', 'y axis'],
                      ['both', 'Both axes']
                    ]}
                    onChange={(axis) => set({ axis: axis as 'x' | 'y' | 'both' })}
                  />
                )}
              </Field>
              <StrokeFields stroke={item} onChange={set} />
              {more('Dashes and opacity', lookSet(item), <LineLook stroke={item} dash="dashed" onChange={set} />)}
            </>
          );
          break;
        case 'angle': {
          title = `Angle ${name(item.from)}${name(item.at)}${name(item.to)}`;
          const angle = item;
          const text = angle.label ?? { text: '' };
          fields = (
            <>
              <TexField label="Label" value={text.text} hint="LaTeX: $\theta$, $45^\circ$." onChange={(t) => set({ label: withText(text, t) })} />
              <Field label="Radius">{(id) => <NumberInput id={id} value={angle.radius ?? 0.6} positive unit="cm" onChange={(radius) => radius <= 10 && set({ radius: radius === 0.6 ? undefined : radius })} />}</Field>
              <label className="checkbox-row">
                <input type="checkbox" role="switch" checked={!!angle.double} onChange={(e) => set({ double: e.target.checked || undefined })} />
                <span>Double arc</span>
              </label>
              {more(
                'Arrow, line and label look',
                !!angle.arrow || angle.colour !== undefined || angle.width !== undefined || lookSet(angle) || textSet(angle.label),
                <>
                  <label className="checkbox-row">
                    <input type="checkbox" role="switch" checked={!!angle.arrow} onChange={(e) => set({ arrow: e.target.checked || undefined })} />
                    <span>Arrow, for a turn</span>
                  </label>
                  <StrokeFields stroke={angle} onChange={set} />
                  <LineLook stroke={angle} onChange={set} />
                  {angle.label && <TextFields text={text} onChange={(patch) => set({ label: { ...text, ...patch } })} />}
                </>
              )}
              <button type="button" className="btn small" title="The angle the other way round, the rest of the turn" onClick={() => set({ from: angle.to, to: angle.from })}>
                Other side
              </button>
            </>
          );
          break;
        }
        case 'circle': {
          const circle = item;
          title = `${circle.to ? 'Arc' : 'Circle'} about ${name(circle.centre)}`;
          const places = resolve(model);
          const [C, P] = [places.get(circle.centre)!, places.get(circle.through)!];
          const through = model.points.find((p) => p.id === circle.through);
          const r = dist(C, P);
          fields = (
            <>
              <Field label="Radius" hint={through?.of ? 'Set by the point it goes through, which is constructed.' : 'Moves the point it goes through.'}>
                {(id) =>
                  through?.of || r < 1e-9 ? (
                    <input id={id} className="input" value={num(r)} readOnly />
                  ) : (
                    <NumberInput
                      id={id}
                      value={Math.round(r * 1000) / 1000}
                      positive
                      reach="cm"
                      unit="cm"
                      onChange={(radius) =>
                        onChange({ ...model, points: model.points.map((p) => (p.id === circle.through ? { ...p, x: C.x + ((P.x - C.x) * radius) / r, y: C.y + ((P.y - C.y) * radius) / r } : p)) })
                      }
                    />
                  )
                }
              </Field>
              <StrokeFields stroke={circle} onChange={set} />
              <ColourInput label="Fill" value={circle.fill} fallback="None" onChange={(fill) => set({ fill })} />
              {more(
                'Dashes and opacity',
                lookSet(circle) || circle.fillOpacity !== undefined,
                <>
                  <LineLook stroke={circle} onChange={set} />
                  {circle.fill && <OpacityField label="Fill opacity" value={circle.fillOpacity} onChange={(fillOpacity) => set({ fillOpacity })} />}
                </>
              )}
              {circle.to && (
                <button type="button" className="btn small" title="The rest of the circle" onClick={() => set({ through: circle.to!, to: circle.through })}>
                  Other part
                </button>
              )}
            </>
          );
          break;
        }
        case 'eqline': {
          const line = item;
          title = 'Line from its equation';
          const coefficient = (key: 'a' | 'b' | 'c') => (
            <NumberInput label={key} value={line[key]} unit={key === 'a' ? 'x +' : key === 'b' ? 'y +' : '= 0'} onChange={(v) => onChange(setEquation(model, line.id, { [key]: v }))} />
          );
          fields = (
            <>
              <Field label="ax + by + c = 0" hint="Its intercepts and label follow while they’re as written for it.">
                {() => (
                  <div className="ckt-row">
                    {coefficient('a')}
                    {coefficient('b')}
                    {coefficient('c')}
                  </div>
                )}
              </Field>
              <StrokeFields stroke={line} onChange={set} />
              <LabelMain label={line.label} edge hint="LaTeX: $x+2y-4=0$." onChange={(label) => set({ label })} />
              {more(
                'Dashes, opacity and label look',
                lookSet(line) || labelSet(line.label),
                <>
                  <LineLook stroke={line} onChange={set} />
                  <LabelLook label={line.label} edge onChange={(label) => set({ label })} />
                </>
              )}
            </>
          );
          break;
        }
      }
    }
  }
  return (
    <div className="ckt-inspector">
      <div className="ckt-inspector-title">{title}</div>
      {fields}
      {arrange}
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
      <Field label="Grid">{(_, labelId) => <Select labelId={labelId} value={String(style.grid)} options={GRIDS.map((g): [string, string] => [String(g), `${g} cm`])} onChange={(grid) => set({ grid: Number(grid) })} />}</Field>
      <div className="ckt-inspector-title">Drawing defaults</div>
      <div className="field-hint">What every item takes until it has its own: one changed by hand keeps its own.</div>
      <div className="ckt-row">
        <Field label="Arrow tip">{(_, labelId) => <Select labelId={labelId} value={style.tips} options={tipOptions(TIPS.filter((t) => t !== 'none'))} onChange={(tips) => set({ tips: tips as VectorStyle['tips'] })} />}</Field>
        <Field label="Tip size">{(id) => <NumberInput id={id} value={style.tipSize} positive onChange={(tipSize) => tipSize <= 5 && set({ tipSize: tipSize === 1 ? undefined : tipSize })} />}</Field>
      </div>
      {/* Normal is null, not left out: a Style with no vector thickness is a pre-2.0 drawing's, whose new vectors are very thick */}
      <ThicknessField label="Vector thickness" value={style.vectorWidth} fallback="Normal" onChange={(vectorWidth) => onChange({ ...raw, vectorWidth: vectorWidth ?? null })} />
      <ThicknessField label="Line thickness" value={style.width} fallback="Normal" onChange={(width) => set({ width })} />
      <ColourInput label="Colour" value={style.colour} fallback="Black" onChange={(colour) => set({ colour })} />
      <Field label="Point size" hint="A dot’s radius.">
        {(id) => <NumberInput id={id} value={style.pointSize} positive unit="pt" onChange={(pointSize) => pointSize <= 20 && set({ pointSize: pointSize === 2 ? undefined : pointSize })} />}
      </Field>
      <Field label="Vector names" hint="How each \mathbf{…} in the labels is written. esvect’s \vv is added to the document when it’s used.">
        {(_, labelId) => (
          <Select
            labelId={labelId}
            value={style.notation ?? 'bold'}
            options={(Object.keys(NOTATIONS) as Notation[]).map((n): [string, string] => [n, NOTATIONS[n].label])}
            onChange={(notation) => onChange({ ...raw, notation: notation === 'bold' ? undefined : notation })}
          />
        )}
      </Field>
    </div>
  );
}
