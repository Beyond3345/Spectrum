// The vector canvas: the drawing as the code draws it, its panels side by side, with points to drag (snapped to the
// grid and to each other) and the rail's tools, which pick points one after another: a vector from one point to
// another, the foot of a projection from a point and two on a line. Clicking where there's no point makes one.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import Icon from '../../../app/Icon';
import { useCanvasPrefs } from '../../FlowCanvas';
import { readStyle } from './code';
import { PICKS, WIDTH_PT, addPoint, applyTool, asVectors, clipLine, dist, frameOf, isLink, newAxes, newId, panelOf, pointNear, resolve, rightCorners, sideOffset } from './model';
import type { Dash, FontSize, Item, Pt, Side, Stroke, Thickness, Tip, Tips, VPoint, VectorModel } from './model';

/** screen pixels a centimetre at 100 % */
const PX_PER_CM = 36;
/** how near, in screen pixels, a point pulls what's dragged or picked */
const SNAP_PX = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

interface View {
  x: number;
  y: number;
  zoom: number;
}

type Drag =
  | { kind: 'pan'; start: Pt; view: View }
  | { kind: 'point' | 'note'; id: string; base: VectorModel; moved: boolean }
  /** a picking tool pressed at a point; let go elsewhere, it picks there too */
  | { kind: 'pick'; start: Pt };

/** What each picking tool asks for next, by how many points it has. */
const ASKS: Record<string, string[]> = {
  vector: ['Click where the vector starts', 'Click where it ends'],
  segment: ['Click where the segment starts', 'Click where it ends'],
  line: ['Click a point on the line', 'Click another'],
  highlight: ['Click where the highlight starts', 'Click where it ends'],
  right: ['Click the corner', 'Click a point along one side'],
  mid: ['Click the first end', 'Click the second end'],
  ratio: ['Click A', 'Click B: the new point divides AB 1 : 2'],
  sum: ['Click the tip of u', 'Click the tip of v'],
  diff: ['Click the tip of u', 'Click the tip of v'],
  foot: ['Click the point to project', 'Click a point on the line', 'Click another point on the line'],
  polygon: ['Click the first corner', 'Click the next corner', 'Click the next corner', 'Click the next corner, or the first to close it']
};

/** TeX as the canvas sketches it: the common maths read as text, the rest of the markup dropped. */
export const plain = (tex: string) =>
  tex
    .replace(/\\[td]?frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\frac12/g, '½')
    .replace(/\\(theta|lambda|mu|alpha|beta|phi)\b/g, (_, name: string) => ({ theta: 'θ', lambda: 'λ', mu: 'μ', alpha: 'α', beta: 'β', phi: 'φ' })[name] ?? name)
    .replace(/\\cdot/g, '·')
    .replace(/-/g, '−')
    .replace(/[$]/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '');

/** xcolor's names as the canvas shows them; black is the canvas's ink and white its paper */
const PALETTE: Record<string, string> = {
  blue: '#2a5bd7',
  red: '#d43c3c',
  teal: '#14857f',
  orange: '#e07b12',
  violet: '#7b3fc4',
  gray: '#888',
  green: '#2f9e55',
  cyan: '#1aa3c4',
  magenta: '#c4309a',
  yellow: '#d9b500',
  brown: '#8b5a2b',
  lime: '#7cc423',
  olive: '#808000',
  pink: '#e8789a',
  purple: '#7a2a8a',
  darkgray: '#555',
  lightgray: '#bbb',
  black: 'var(--ckt-ink)',
  white: 'var(--ckt-paper)'
};
/** An xcolor colour as CSS on the canvas: blue!50 is half blue on the paper, red!30!blue 30 % red in blue, #rrggbb itself. */
export function colourCss(name = 'black') {
  if (/^#[0-9a-f]{6}$/i.test(name)) return name;
  const [first, ...mixes] = name.split('!');
  let colour = PALETTE[first] ?? PALETTE.black;
  for (let i = 0; i < mixes.length; i += 2) {
    const percent = Number(mixes[i]);
    if (!mixes[i] || !Number.isFinite(percent)) break;
    colour = `color-mix(in srgb, ${colour} ${Math.min(100, Math.max(0, percent))}%, ${PALETTE[mixes[i + 1] ?? 'white'] ?? PALETTE.black})`;
  }
  return colour;
}
/** screen pixels a pt of line width or dash draws, kept the same at every zoom so thin lines stay seen */
const PX_PER_PT = 1.5;
/** a line's width on screen: TikZ's thin (0.4 pt) when it has none */
export const widthPx = (width?: Thickness) => 0.6 + (typeof width === 'number' ? width : WIDTH_PT[width ?? 'thin']) * PX_PER_PT;
/** a dash pattern on screen, the gaps widened by the round caps' reach */
export function dashArray(dash: Dash | undefined, width: number) {
  const pattern = dash === 'dashed' ? [3, 3] : dash === 'dotted' ? [0, 2] : dash === 'dash dot' ? [3, 2, 0, 2] : Array.isArray(dash) ? dash : null;
  return pattern?.map((n, i) => (i % 2 ? n * PX_PER_PT + width : Math.max(0.01, n * PX_PER_PT))).join(' ');
}
const FONT_SCALE: Record<FontSize, number> = { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.2, Large: 1.44 };

/** each tip drawn in a 10 × 10 box pointing right, its point at (9, 5) */
const TIP_SHAPES: Record<Exclude<Tip, 'none'>, [string, string]> = {
  stealth: ['M0,0.5 L10,5 L0,9.5 L2.5,5 z', 'st-arrowhead'],
  latex: ['M0,0.8 C3,3.5 7,4.5 10,5 C7,5.5 3,6.5 0,9.2 z', 'st-arrowhead'],
  to: ['M1.5,1 Q6,4.5 9.5,5 Q6,5.5 1.5,9', 'vec-tip-line'],
  triangle: ['M0,1 L10,5 L0,9 z', 'st-arrowhead'],
  'open triangle': ['M0.8,1.4 L9.2,5 L0.8,8.6 z', 'vec-tip-open'],
  bar: ['M9,0 L9,10', 'vec-tip-line']
};

const ANCHOR: Record<string, ['start' | 'middle' | 'end', 'auto' | 'middle' | 'hanging']> = {
  '0,1': ['middle', 'auto'],
  '0,-1': ['middle', 'hanging'],
  '1,0': ['start', 'middle'],
  '-1,0': ['end', 'middle'],
  '1,1': ['start', 'auto'],
  '-1,1': ['end', 'auto'],
  '1,-1': ['start', 'hanging'],
  '-1,-1': ['end', 'hanging'],
  '0,0': ['middle', 'middle']
};

export default function VectorCanvas({
  model: raw,
  onChange,
  style: rawStyle,
  readOnly,
  selection = [],
  onSelect,
  tool = 'select',
  onTool
}: {
  model: VectorModel;
  onChange(m: VectorModel): void;
  style: Record<string, unknown>;
  readOnly?: boolean;
  selection?: string[];
  onSelect?(ids: string[]): void;
  tool?: string;
  onTool?(tool: string): void;
}) {
  const model = asVectors(raw);
  const style = readStyle(rawStyle);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<VectorModel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** the points a tool has picked so far */
  const [picks, setPicks] = useState<string[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const prefs = useCanvasPrefs();

  const shown = draft || model;
  const places = useMemo(() => resolve(shown), [shown]);
  const shiftOf = useMemo(() => new Map(shown.panels.map((p) => [p.id, p.shift])), [shown]);
  /** a point's place on the canvas, its panel's shift added */
  const world = (id: string) => {
    const p = places.get(id) ?? { x: 0, y: 0 };
    return { x: p.x + (shiftOf.get(shown.points.find((q) => q.id === id)?.panel ?? '') ?? 0), y: p.y };
  };
  const frames = useMemo(() => new Map(shown.panels.map((p) => [p.id, frameOf(shown, p.id, places)])), [shown, places]);
  const selected = new Set(selection);
  const grid = style.grid;

  // ─── view ───

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const fit = () => {
    if (!size.width || !size.height) return;
    const boxes = shown.panels.map((p) => {
      const f = frames.get(p.id)!;
      return { minX: f.minX + p.shift, maxX: f.maxX + p.shift, minY: f.minY - (p.caption ? 1 : 0), maxY: f.maxY };
    });
    const e = { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
    const w = Math.max(e.maxX - e.minX, 2) + 1;
    const h = Math.max(e.maxY - e.minY, 2) + 1;
    const zoom = Math.min(MAX_ZOOM / 2, Math.max(MIN_ZOOM, Math.min(size.width / (w * PX_PER_CM), size.height / (h * PX_PER_CM))));
    const k = PX_PER_CM * zoom;
    setView({ zoom, x: size.width / 2 - ((e.minX + e.maxX) / 2) * k, y: size.height / 2 + ((e.minY + e.maxY) / 2) * k });
  };

  useEffect(() => {
    if (!view && size.width) fit();
  }, [size.width, size.height]);

  const v = view || { x: 0, y: 0, zoom: 1 };
  const k = PX_PER_CM * v.zoom;
  /** centimetres to screen */
  const S = (p: Pt) => ({ x: v.x + p.x * k, y: v.y - p.y * k });
  /** screen to centimetres */
  const toWorld = (s: Pt) => ({ x: (s.x - v.x) / k, y: (v.y - s.y) / k });
  const tolerance = SNAP_PX / k;

  const zoomAt = (factor: number, at: Pt = { x: size.width / 2, y: size.height / 2 }) =>
    setView((prev) => {
      const cur = prev || v;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * factor));
      const f = zoom / cur.zoom;
      return { zoom, x: at.x - (at.x - cur.x) * f, y: at.y - (at.y - cur.y) * f };
    });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      else setView((prev) => (prev ? { ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY } : prev));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  // ─── panels and snapping ───

  /** the panel a place on the canvas is in: the one whose frame it's in or nearest */
  const panelAt = (w: Pt) => {
    const gap = (id: string) => {
      const f = frames.get(id)!;
      const x = w.x - (shiftOf.get(id) ?? 0);
      return x < f.minX ? f.minX - x : x > f.maxX ? x - f.maxX : 0;
    };
    // a picking tool stays in the panel of its first point
    if (picks.length) return shown.points.find((p) => p.id === picks[0])?.panel ?? shown.panels[0].id;
    return shown.panels.reduce((best, p) => (gap(p.id) < gap(best.id) ? p : best), shown.panels[0]).id;
  };
  const snapToGrid = (p: Pt) => ({ x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid });
  /** in a panel: a point within reach, else the grid; skip: a point that's moving */
  const snapIn = (panel: string, local: Pt, m: VectorModel, skip?: string) => {
    const near = m.points.filter((p) => p.panel === panel && p.id !== skip).reduce<{ p: Pt; d: number } | null>((best, p) => {
      const at = places.get(p.id)!;
      const d = dist(at, local);
      return d <= tolerance && (!best || d < best.d) ? { p: at, d } : best;
    }, null);
    return near ? near.p : snapToGrid(local);
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commit = (next: VectorModel) => {
    setDraft(null);
    onChange(next);
  };

  // ─── tools ───

  /** A picking tool's next point, at a place on the canvas: the point there, or a new one. */
  const pickAt = (w: Pt) => {
    const panel = panelAt(w);
    const shift = shiftOf.get(panel) ?? 0;
    const at = { x: w.x - shift, y: w.y };
    let next = model;
    // the point within reach, or the one on the grid point the click snaps to (clicking where one was made)
    let id = pointNear(model, panel, at, tolerance, places) ?? pointNear(model, panel, snapToGrid(at), 1e-9, places);
    if (!id) {
      const added = addPoint(model, panel, snapToGrid(at));
      next = added.model;
      id = added.id;
    }
    // a polygon closes on its first corner
    if (tool === 'polygon' && picks.length >= 3 && id === picks[0]) return finish(next, picks);
    const all = [...picks, id];
    if (all.length >= PICKS[tool]) return finish(next, all);
    if (next !== model) commit(next);
    setPicks(all);
  };

  const finish = (m: VectorModel, all: string[]) => {
    setPicks([]);
    const made = applyTool(m, tool, all, style.vectorWidth !== undefined);
    if (!made) {
      if (m !== model) commit(m);
      return;
    }
    commit(made.model);
    onSelect?.([made.id]);
    // drawing tools stay picked, to draw the next; a construction or mark goes back to Select
    if (!['vector', 'segment', 'line', 'point'].includes(tool)) onTool?.('select');
  };

  /** A one-click tool: a point, a note or axes. */
  const placeAt = (w: Pt) => {
    const panel = panelAt(w);
    const at = snapToGrid({ x: w.x - (shiftOf.get(panel) ?? 0), y: w.y });
    if (tool === 'point') {
      const existing = pointNear(model, panel, at, tolerance, places);
      if (existing) return onSelect?.([existing]);
      const added = addPoint(model, panel, at);
      commit(added.model);
      onSelect?.([added.id]);
    } else if (tool === 'text') {
      const id = newId(model, 'i');
      commit({ ...model, items: [...model.items, { id, kind: 'text', panel, x: at.x, y: at.y, text: 'Text' }] });
      onSelect?.([id]);
      onTool?.('select');
    } else if (tool === 'axes') {
      const made = newAxes(model, panel);
      commit(made.model);
      onSelect?.([made.id]);
      onTool?.('select');
    }
  };

  const ONE_CLICK = (t: string) => t === 'point' || t === 'text' || t === 'axes';

  // ─── pointer ───

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    boxRef.current?.focus();
    const at = local(e);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer tracks
    }
    if (e.button === 1 || readOnly) {
      setDrag({ kind: 'pan', start: at, view: v });
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(at);
    if (ONE_CLICK(tool)) return placeAt(w);
    if (tool !== 'select' && PICKS[tool]) {
      setDrag({ kind: 'pick', start: at });
      return pickAt(w);
    }
    const target = (e.target as globalThis.Element).closest('[data-id]') as SVGElement | null;
    const id = target?.dataset.id;
    if (id) {
      onSelect?.(e.shiftKey ? (selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]) : selected.has(id) ? selection : [id]);
      const point = model.points.find((p) => p.id === id);
      if (point && !point.of) setDrag({ kind: 'point', id, base: model, moved: false });
      else if (model.items.find((i) => i.id === id)?.kind === 'text') setDrag({ kind: 'note', id, base: model, moved: false });
      return;
    }
    onSelect?.([]);
    setDrag({ kind: 'pan', start: at, view: v });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    const at = local(e);
    const w = toWorld(at);
    if (!drag || drag.kind === 'pick') {
      if (tool === 'select') return setHover(null);
      const panel = panelAt(w);
      const shift = shiftOf.get(panel) ?? 0;
      const p = snapIn(panel, { x: w.x - shift, y: w.y }, model);
      setHover({ x: p.x + shift, y: p.y });
      return;
    }
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + at.x - drag.start.x, y: drag.view.y + at.y - drag.start.y });
      return;
    }
    const base = drag.base;
    if (drag.kind === 'point') {
      const point = base.points.find((p) => p.id === drag.id)!;
      const p = snapIn(point.panel, { x: w.x - (shiftOf.get(point.panel) ?? 0), y: w.y }, base, drag.id);
      setDraft({ ...base, points: base.points.map((q) => (q.id === drag.id ? { ...q, x: p.x, y: p.y } : q)) });
    } else {
      const note = base.items.find((i) => i.id === drag.id);
      if (note?.kind !== 'text') return;
      const p = snapToGrid({ x: w.x - (shiftOf.get(note.panel) ?? 0), y: w.y });
      setDraft({ ...base, items: base.items.map((i) => (i.id === drag.id ? { ...note, x: p.x, y: p.y } : i)) });
    }
    if (!drag.moved) setDrag({ ...drag, moved: true });
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    // dragged from one point to another: the second is picked on letting go
    if (d.kind === 'pick') {
      const at = local(e);
      if (dist(at, d.start) > SNAP_PX && picks.length) pickAt(toWorld(at));
      return;
    }
    if (d.kind === 'pan' || !draft) return setDraft(null);
    commit(d.moved ? draft : model);
  };

  // a tool picked part way through another starts again
  useEffect(() => setPicks([]), [tool]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      setPicks([]);
      return;
    }
    if (e.key === 'Enter' && tool === 'polygon' && picks.length >= 3) {
      finish(model, picks);
      e.preventDefault();
      return;
    }
    if (readOnly || !e.key.startsWith('Arrow') || e.metaKey || e.ctrlKey || e.altKey) return;
    // the arrow keys move the selected free points and notes a grid step (a tenth with Shift)
    const step = e.shiftKey ? grid / 10 : grid;
    const delta = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }[e.key];
    if (!delta || !selection.length) return;
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    onChange({
      ...model,
      points: model.points.map((p) => (selected.has(p.id) && !p.of ? { ...p, x: round(p.x + delta.x), y: round(p.y + delta.y) } : p)),
      items: model.items.map((i) => (selected.has(i.id) && i.kind === 'text' ? { ...i, x: round(i.x + delta.x), y: round(i.y + delta.y) } : i))
    });
    e.preventDefault();
  };

  // ─── drawing ───

  const fontSize = Math.max(9, Math.min(16, k * 0.36));
  /** a label beside a place, on a side, as TikZ sets it, in its size and colour */
  const label = (at: Pt, text: string, side: Side | undefined, key: string, extra = 0, look: { size?: FontSize; colour?: string } = {}) => {
    const o = side ? sideOffset(side) : { x: 0, y: 0 };
    const gap = 4 + extra * (k / 28.45);
    const s = S(at);
    const [anchor, baseline] = ANCHOR[`${o.x},${o.y}`];
    const len = Math.hypot(o.x, o.y) || 1;
    return (
      <text
        key={key}
        x={s.x + (o.x / len) * gap}
        y={s.y - (o.y / len) * gap}
        className="st-text"
        fontSize={fontSize * FONT_SCALE[look.size ?? 'normalsize']}
        textAnchor={anchor}
        dominantBaseline={baseline}
        style={look.colour ? { fill: colourCss(look.colour) } : undefined}
      >
        {plain(text)}
      </text>
    );
  };

  const line = (a: Pt, b: Pt, className: string, extra: Record<string, unknown> = {}) => {
    const [p, q] = [S(a), S(b)];
    return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={className} {...extra} />;
  };

  /** the arrow tips drawn, one marker for each shape and size */
  const markers = new Map<string, ReactNode>();
  const marker = (tip: Exclude<Tip, 'none'> | undefined, size: number) => {
    if (!tip) return undefined;
    const px = Math.round(size * 2) / 2;
    const id = `vec-tip-${tip.replace(' ', '-')}-${px}`;
    if (!markers.has(id)) {
      const [d, className] = TIP_SHAPES[tip];
      markers.set(
        id,
        <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={px} markerHeight={px} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d={d} className={className} />
        </marker>
      );
    }
    return `url(#${id})`;
  };
  /** a line's look on screen: its own, else the Style's (or the width, dash and colour it has when it has none) */
  const strokeLook = (s: Stroke & { dashed?: boolean }, width = style.width, dash?: Dash, colour = style.colour) => {
    const w = widthPx(s.width ?? width);
    const stroke = colourCss(s.colour ?? colour);
    return { stroke, strokeWidth: w, strokeDasharray: dashArray(s.dash ?? (s.dashed ? 'dashed' : dash), w), opacity: s.opacity, color: stroke };
  };
  /** a line's tips as markers, as the code writes them: a vector's end is the Style's tip when it has none */
  const tipMarkers = (t: Tips, styleEnd: boolean, strokeWidth: number) => {
    const end = t.end ? (t.end === 'none' ? undefined : t.end) : styleEnd ? style.tips : undefined;
    const size = (5 + 1.2 * strokeWidth) * (t.tipSize ?? style.tipSize);
    return { markerStart: marker(t.start && t.start !== 'none' ? t.start : undefined, size), markerEnd: marker(end, size), markerMid: t.middle ? marker(end ?? style.tips, size) : undefined };
  };

  const drawItem = (item: Item): ReactNode => {
    const on = selected.has(item.id);
    const panel = panelOf(shown, item);
    const shift = shiftOf.get(panel) ?? 0;
    const W = (p: Pt) => ({ x: p.x + shift, y: p.y });
    const hit = readOnly ? {} : { 'data-id': item.id };
    const group = (children: ReactNode, name: string) => (
      <g key={item.id} {...hit} className={`st-item ${on ? 'selected' : ''}`} role="img" aria-label={name}>
        {children}
      </g>
    );
    const nameOf = (id: string) => shown.points.find((p) => p.id === id)?.name ?? '';
    if (isLink(item)) {
      let [a, b] = [world(item.a), world(item.b)];
      if (item.kind === 'line') {
        const ends = clipLine(places.get(item.a)!, places.get(item.b)!, frames.get(panel)!);
        if (ends) [a, b] = ends.map(W);
      }
      const highlight = item.kind === 'highlight';
      const look = highlight ? strokeLook(item, 2.5, undefined, 'blue!50') : strokeLook(item, item.kind === 'vector' ? style.vectorWidth : style.width);
      const tips = highlight ? {} : tipMarkers(item, item.kind === 'vector', look.strokeWidth);
      const pos = item.label?.pos ?? 0.5;
      const at = { x: a.x + (b.x - a.x) * pos, y: a.y + (b.y - a.y) * pos };
      // through its middle, for an arrow there
      const [p, m, q] = [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b].map(S);
      const names = { vector: 'Vector', segment: 'Segment', line: 'Line', highlight: 'Highlight' };
      return group(
        <>
          {on && line(a, b, 'st-halo')}
          {line(a, b, 'st-hit')}
          <polyline points={`${p.x},${p.y} ${m.x},${m.y} ${q.x},${q.y}`} className="vec-stroke" style={look} {...tips} />
          {item.label?.text.trim() && label(at, item.label.text, item.label.side ?? 'above', `${item.id}-label`, 0, item.label)}
        </>,
        `${names[item.kind]} ${nameOf(item.a)}${nameOf(item.b)}${item.label?.text ? `, ${plain(item.label.text)}` : ''}`
      );
    }
    switch (item.kind) {
      case 'polygon': {
        const pts = item.points.map((id) => S(world(id))).map((p) => `${p.x},${p.y}`).join(' ');
        return group(
          <>
            {on && <polygon points={pts} className="st-halo" />}
            <polygon points={pts} className="st-hit" />
            <polygon
              points={pts}
              className="vec-stroke"
              style={{ ...strokeLook({ ...item, opacity: undefined }), strokeOpacity: item.opacity, fill: item.fill ? colourCss(item.fill) : 'none', fillOpacity: item.fillOpacity }}
            />
          </>,
          `Polygon ${item.points.map(nameOf).join('')}`
        );
      }
      case 'text': {
        const s = S(W(item));
        return group(
          <>
            {on && <rect x={s.x - fontSize * 2} y={s.y - fontSize * 0.8} width={fontSize * 4} height={fontSize * 1.6} className="st-halo-pic" rx={3} />}
            <text x={s.x} y={s.y} className="st-text" fontSize={fontSize * FONT_SCALE[item.size ?? 'normalsize']} textAnchor="middle" dominantBaseline="middle" style={item.colour ? { fill: colourCss(item.colour) } : undefined}>
              {plain(item.text) || 'Text'}
            </text>
          </>,
          `Text ${plain(item.text)}`
        );
      }
      case 'axes': {
        const [xName, yName] = item.names ?? ['$x$', '$y$'];
        const step = item.step ?? 1;
        const ticks = (range: [number, number]) => {
          const out: number[] = [];
          for (let n = Math.floor(Math.min(...range) / step) + 1; n * step < Math.max(...range) && out.length < 60; n += 1) if (n) out.push(Math.round(n * step * 1000) / 1000);
          return out;
        };
        const tick = item.tick ?? 0.08;
        const look = strokeLook({ colour: item.colour ?? 'black', width: item.width ?? 'thin' });
        const tips = tipMarkers({ end: item.tip }, true, look.strokeWidth);
        const numbers = { colour: item.colour, size: item.numbers ?? ('small' as FontSize) };
        const gridLook = strokeLook({ colour: item.gridColour ?? 'gray!30', width: item.gridWidth ?? 'very thin' });
        const [x0, x1] = [Math.min(...item.x), Math.max(...item.x)];
        const [y0, y1] = [Math.min(...item.y), Math.max(...item.y)];
        // the grid's lines at each step, 0 too
        const across = (from: number, to: number) => {
          const out: number[] = [];
          for (let n = Math.ceil(from / step); n * step <= to && out.length < 200; n += 1) out.push(n * step);
          return out;
        };
        return group(
          <>
            {item.grid && (
              <g>
                {across(x0, x1).map((x) => <g key={`gx${x}`}>{line(W({ x, y: y0 }), W({ x, y: y1 }), 'vec-stroke', { style: gridLook })}</g>)}
                {across(y0, y1).map((y) => <g key={`gy${y}`}>{line(W({ x: x0, y }), W({ x: x1, y }), 'vec-stroke', { style: gridLook })}</g>)}
              </g>
            )}
            {on && line(W({ x: item.x[0], y: 0 }), W({ x: item.x[1], y: 0 }), 'st-halo')}
            {on && line(W({ x: 0, y: item.y[0] }), W({ x: 0, y: item.y[1] }), 'st-halo')}
            {line(W({ x: item.x[0], y: 0 }), W({ x: item.x[1], y: 0 }), 'st-hit')}
            {line(W({ x: 0, y: item.y[0] }), W({ x: 0, y: item.y[1] }), 'st-hit')}
            {line(W({ x: item.x[0], y: 0 }), W({ x: item.x[1], y: 0 }), 'vec-stroke', { style: look, ...tips })}
            {line(W({ x: 0, y: item.y[0] }), W({ x: 0, y: item.y[1] }), 'vec-stroke', { style: look, ...tips })}
            {label(W({ x: item.x[1], y: 0 }), xName, 'right', 'xn', 0, { colour: item.colour })}
            {label(W({ x: 0, y: item.y[1] }), yName, 'above', 'yn', 0, { colour: item.colour })}
            {item.ticks &&
              ticks(item.x).map((t) => (
                <g key={`x${t}`}>
                  {line(W({ x: t, y: tick }), W({ x: t, y: -tick }), 'vec-stroke', { style: look })}
                  {label(W({ x: t, y: -tick }), String(t), 'below', `xl${t}`, 0, numbers)}
                </g>
              ))}
            {item.ticks &&
              ticks(item.y).map((t) => (
                <g key={`y${t}`}>
                  {line(W({ x: tick, y: t }), W({ x: -tick, y: t }), 'vec-stroke', { style: look })}
                  {label(W({ x: -tick, y: t }), String(t), 'left', `yl${t}`, 0, numbers)}
                </g>
              ))}
            {item.origin && label(W({ x: 0, y: 0 }), '$O$', 'below left', 'o')}
          </>,
          'Axes'
        );
      }
      case 'right': {
        const corners = rightCorners(places.get(item.at)!, places.get(item.toward)!, !!item.flip).map((p) => S(W(p)));
        const pts = corners.map((p) => `${p.x},${p.y}`).join(' ');
        return group(
          <>
            {on && <polyline points={pts} className="st-halo" />}
            <polyline points={pts} className="st-hit" />
            <polyline points={pts} className="vec-stroke" style={strokeLook(item)} />
          </>,
          `Right-angle mark at ${nameOf(item.at)}`
        );
      }
      case 'drop': {
        const from = world(item.from);
        const to = item.axis === 'x' ? { x: from.x, y: 0 } : { x: shift, y: from.y };
        return group(
          <>
            {on && line(from, to, 'st-halo')}
            {line(from, to, 'st-hit')}
            {line(from, to, 'vec-stroke', { style: strokeLook(item, style.width, 'dashed') })}
          </>,
          `Drop from ${nameOf(item.from)} to the ${item.axis} axis`
        );
      }
    }
  };

  /** a point's dot, filled, open or a cross, its radius in pt drawn to scale */
  const dot = (p: VPoint, s: Pt) => {
    const r = Math.max(1.5, (p.size ?? style.pointSize) * (k / 28.45));
    const colour = colourCss(p.colour ?? style.colour);
    if (p.shape === 'open') return <circle cx={s.x} cy={s.y} r={r} className="st-dot-open" style={{ stroke: colour }} />;
    if (p.shape === 'cross') return <path d={`M${s.x - r},${s.y - r} L${s.x + r},${s.y + r} M${s.x - r},${s.y + r} L${s.x + r},${s.y - r}`} className="vec-stroke" style={{ stroke: colour }} />;
    return <circle cx={s.x} cy={s.y} r={r} className="st-dot" style={{ fill: colour }} />;
  };

  /** the order things are drawn in, as the code writes them */
  const LAYERS: Item['kind'][] = ['axes', 'highlight', 'polygon', 'line', 'segment', 'drop', 'right', 'vector', 'text'];
  const items = LAYERS.flatMap((layer) => shown.items.filter((i) => i.kind === layer));

  const gridPx = grid * k;
  const gridStep = gridPx < 8 ? Math.ceil(8 / gridPx) : 1;
  const picking = tool !== 'select' && !!PICKS[tool] && !ONE_CLICK(tool);
  const ghost = picking && picks.length && hover ? [world(picks[picks.length - 1]), hover] : null;
  const message = picking ? (ASKS[tool]?.[Math.min(picks.length, (ASKS[tool]?.length ?? 1) - 1)] ?? '') + (picks.length ? '. Esc starts again.' : '') : '';
  const cursor = drag?.kind === 'pan' ? 'grabbing' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={boxRef} className="ckt-canvas st-canvas" tabIndex={0} aria-label="Vector canvas" onKeyDown={onKeyDown}>
      <svg ref={svgRef} width="100%" height="100%" style={{ cursor }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => !drag && setHover(null)}>
        <defs>
          <pattern id="vec-dots" width={gridPx * gridStep} height={gridPx * gridStep} patternUnits="userSpaceOnUse" x={v.x} y={v.y}>
            <circle cx={0.75} cy={0.75} r={0.75} className="ckt-dot" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#vec-dots)" />
        {view && (
          <>
            {shown.panels.length > 1 &&
              shown.panels.map((p) => {
                const f = frames.get(p.id)!;
                const [a, b] = [S({ x: f.minX + p.shift, y: f.maxY }), S({ x: f.maxX + p.shift, y: f.minY })];
                return <rect key={p.id} x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} className="vec-panel" />;
              })}
            {items.map(drawItem)}
            {shown.points.flatMap((p) =>
              p.of?.kind === 'ratio' && p.of.marks
                ? [
                    label({ x: (world(p.of.a).x + world(p.id).x) / 2, y: (world(p.of.a).y + world(p.id).y) / 2 }, String(p.of.m), p.of.marks, `${p.id}-m`),
                    label({ x: (world(p.id).x + world(p.of.b).x) / 2, y: (world(p.id).y + world(p.of.b).y) / 2 }, String(p.of.n), p.of.marks, `${p.id}-n`)
                  ]
                : []
            )}
            {shown.points.map((p) => {
              const s = S(world(p.id));
              const on = selected.has(p.id);
              const picked = picks.includes(p.id);
              return (
                <g key={p.id} data-id={readOnly ? undefined : p.id} className={`vec-point ${p.of ? 'built' : ''} ${on || picked ? 'selected' : ''}`} role="img" aria-label={`Point ${p.name}${p.of ? ', constructed' : ''}`}>
                  <circle cx={s.x} cy={s.y} r={10} className="st-hit-box" />
                  {p.dot && dot(p, s)}
                  <circle cx={s.x} cy={s.y} r={on || picked ? 6 : 4} className="vec-handle" />
                  {p.label?.text.trim() && label(world(p.id), p.label.text, p.label.side ?? 'above right', `${p.id}-label`, p.label.dist ?? 0, p.label)}
                </g>
              );
            })}
            {shown.panels.map((p) => {
              if (!p.caption?.trim()) return null;
              const f = frames.get(p.id)!;
              const axes = shown.items.some((i) => i.kind === 'axes' && i.panel === p.id);
              return label({ x: (f.minX + f.maxX) / 2 + p.shift, y: f.minY - (axes ? 0.6 : 0) }, p.caption, undefined, `${p.id}-caption`);
            })}
            {ghost && line(ghost[0], ghost[1], 'st-ghost')}
            <defs>{[...markers.values()]}</defs>
            {hover && tool !== 'select' && (() => {
              const p = S(hover);
              return <circle className="ckt-target" cx={p.x} cy={p.y} r={5} />;
            })()}
          </>
        )}
      </svg>
      <div className="ckt-zoom">
        <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
          <Icon name="minus.magnifyingglass" />
        </button>
        <span className="ckt-zoom-level">{Math.round(v.zoom * 100)}%</span>
        <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(1.25)}>
          <Icon name="plus.magnifyingglass" />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit the drawing in view" title="Fit the drawing in view" onClick={fit}>
          <Icon name="arrow.up.left.and.arrow.down.right" />
        </button>
        {prefs.onPrefs && (
          <button type="button" className="icon-btn" aria-label={prefs.dark ? 'Light canvas' : 'Dark canvas'} title={prefs.dark ? 'Light canvas' : 'Dark canvas'} onClick={() => prefs.onPrefs?.({ minimap: prefs.minimap, dark: !prefs.dark })}>
            <Icon name={prefs.dark ? 'sun.max' : 'moon'} />
          </button>
        )}
      </div>
      {message && (
        <div className="ckt-status" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
