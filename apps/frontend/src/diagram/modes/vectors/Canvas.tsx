// The vector canvas: the drawing as the code draws it, its panels side by side, at the Style's scale with lines, tips,
// dots and labels at their printed sizes, on the counting grid (a larger mark every centimetre, x = 0 and y = 0
// darker). Points drag (snapped to the grid and to each other), a selection drags, nudges, turns and mirrors as one,
// and the rail's tools pick points one after another: a vector from one point to another, the foot of a projection
// from a point and two on a line. Clicking where there's no point makes one, bare (no dot or letter); the Point tool's
// points have both.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import Icon from '../../../app/Icon';
import { CanvasGrid } from '../../CanvasGrid';
import { useCanvasPrefs } from '../../FlowCanvas';
import { plain, scriptRuns, svgRuns } from '../../sketch';
import { useToolKeys } from '../../toolKeys';
import { colourCss, num } from '../shared';
import { eqLineEnds, notate, readStyle, styledVectors } from './code';
import type { Notation } from './code';
import { placeVectorLabels } from './labels';
import type { Spot } from './labels';
import {
  PICKS,
  WIDTH_PT,
  addPoint,
  applyTool,
  asVectors,
  clipLine,
  dist,
  dropUnused,
  frameOf,
  idsInside,
  isLink,
  mirrorIds,
  moveIds,
  moversOf,
  newAxes,
  newEqLine,
  newId,
  panelOf,
  placed,
  pointNear,
  pointsOf,
  resolve,
  rightCorners,
  sideOffset,
  turnIds
} from './model';
import type { Dash, FontSize, Item, Pt, Side, Stroke, Thickness, Tip, Tips, VPoint, VectorModel } from './model';

/** screen pixels a centimetre of paper at 100 % */
const PX_PER_CM = 36;
const PT_PER_CM = 28.45;
/** how near, in screen pixels, a point pulls what's dragged or picked */
const SNAP_PX = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
/** \normalsize, as the document sets a label: 10 pt */
const NORMAL_PT = 10;

interface View {
  x: number;
  y: number;
  zoom: number;
}

type Drag =
  | { kind: 'pan'; start: Pt; view: View }
  /** a selection dragged by one of its points or items: anchor is the place that snaps, start where the press was */
  | { kind: 'move'; ids: string[]; base: VectorModel; start: Pt; anchor: Pt; panel: string; moved: boolean }
  | { kind: 'marquee'; start: Pt; now: Pt; keep: string[] }
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
  polygon: ['Click the first corner', 'Click the next corner', 'Click the next corner', 'Click the next corner, or the first to close it'],
  dropBoth: ['Click the point'],
  ticks: ['Click one end', 'Click the other end: one more tick on the line between them'],
  circle: ['Click the centre', 'Click a point on the circle'],
  arc: ['Click the centre', 'Click where the arc starts', 'Click where it ends, anticlockwise'],
  angle: ['Click the corner', 'Click a point on one side', 'Click a point on the other side'],
  meet: ['Click a point on the first line', 'Click another', 'Click a point on the second line', 'Click another'],
  scale: ['Click the tail of the vector', 'Click its tip'],
  place: ['Click the tail of the vector', 'Click its tip', 'Click the point to draw it from'],
  reflect: ['Click the point to reflect', 'Click a point on the mirror line', 'Click another'],
  parallel: ['Click a point on the line', 'Click another', 'Click the point the parallel goes through'],
  perp: ['Click a point on the line', 'Click another', 'Click the point the perpendicular goes through']
};

/** the commands the canvas sets itself: bold, and an arrow (or hat) over the last letter */
const MARKED = /(\\(?:mathbf|boldsymbol|vec|overrightarrow|vv|hat)\s*\{[^{}]*\})/;

/**
 * TeX as it prints, sketched: vector names in the Style's notation, \mathbf in bold, \vec, \overrightarrow and \vv
 * with an arrow over the last letter, \hat with a hat, fractions as a/b, minus signs, and the shared sketch's scripts
 * and symbols (A_y with a real subscript, \parallel as ∥).
 * ponytail: the arrow of \overrightarrow{OA} sits over its last letter only; the preview sets it across
 */
export function sketch(tex: string, notation?: Notation): ReactNode {
  const group = '((?:[^{}]|\\{[^{}]*\\})*)';
  const written = notate(tex, notation)
    // a/b, or (a·b)/(|a| |b|) when there is more to them
    .replace(new RegExp(`\\\\[td]?frac\\{${group}\\}\\{${group}\\}`, 'g'), (_, a: string, b: string) => (plain(a).length + plain(b).length > 3 ? `(${a})/(${b})` : `${a}/${b}`))
    .replace(/\\(cos|sin|tan|log|ln|exp|max|min)\b\s*/g, '$1 ')
    .replace(/\\frac(\d)(\d)/g, '$1/$2')
    .replace(/-/g, '−');
  return written.split(MARKED).map((part, i) => {
    const m = part.match(/^\\(\w+)\s*\{([^{}]*)\}$/);
    if (!m) return <Fragment key={i}>{svgRuns(part)}</Fragment>;
    if (m[1] === 'mathbf' || m[1] === 'boldsymbol') return <tspan key={i} fontWeight="bold">{svgRuns(m[2])}</tspan>;
    return <Fragment key={i}>{svgRuns(m[2])}{m[1] === 'hat' ? '̂' : '⃗'}</Fragment>;
  });
}

/** An xcolor colour as CSS on the canvas, as it prints (the shared xcolor maths); black is the canvas's ink, so it shows on the dark canvas too. */
const ink = (colour = 'black') => (colour === 'black' ? 'var(--ckt-ink)' : colourCss(colour));
/** a thickness in pt: TikZ's thin (0.4 pt) when it has none */
const widthPt = (width?: Thickness) => (typeof width === 'number' ? width : WIDTH_PT[width ?? 'thin']);
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
  /** the points those picks made where there was none, taken away again if the pick is given up */
  const [made, setMade] = useState<string[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  /** where the pointer is on the canvas, in cm, for the readout */
  const [pointer, setPointer] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);
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
  // the labels with no side of their own, where the code puts them
  const spots = useMemo(() => placeVectorLabels(shown, style, places), [shown, places, style.scale, style.pointSize, style.notation]);
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
    const unit = PX_PER_CM * style.scale;
    const zoom = Math.min(MAX_ZOOM / 2, Math.max(MIN_ZOOM, Math.min(size.width / (w * unit), size.height / (h * unit))));
    const k = unit * zoom;
    setView({ zoom, x: size.width / 2 - ((e.minX + e.maxX) / 2) * k, y: size.height / 2 + ((e.minY + e.maxY) / 2) * k });
  };

  useEffect(() => {
    if (!view && size.width) fit();
  }, [size.width, size.height]);

  const v = view || { x: 0, y: 0, zoom: 1 };
  /** screen pixels a centimetre of paper, and a pt of paper: line widths, tips, text and label distances */
  const paper = PX_PER_CM * v.zoom;
  const ptPx = paper / PT_PER_CM;
  /** screen pixels a centimetre of the drawing: the Style's scale on the paper */
  const k = paper * style.scale;
  /** a pt inside the picture (a dot's radius, a tick's length), which the Style's scale scales too */
  const ptIn = k / PT_PER_CM;
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
  }, [size.width, size.height]);

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
  /** in a panel: a point within reach, else the grid; skip: points that are moving */
  const snapIn = (panel: string, local: Pt, m: VectorModel, skip: Set<string> = new Set()) => {
    const near = m.points.filter((p) => p.panel === panel && !skip.has(p.id)).reduce<{ p: Pt; d: number } | null>((best, p) => {
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
      const added = addPoint(model, panel, snapToGrid(at), true);
      next = added.model;
      id = added.id;
      setMade((m) => [...m, added.id]);
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
    setMade([]);
    const done = applyTool(m, tool, all, styledVectors(rawStyle));
    if (!done) {
      if (m !== model) commit(m);
      return;
    }
    commit(done.model);
    onSelect?.([done.id]);
    // drawing tools stay picked, to draw the next; a construction or mark goes back to Select
    if (!['vector', 'segment', 'line', 'point', 'circle'].includes(tool)) onTool?.('select');
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
    } else if (tool === 'axes' || tool === 'eqline') {
      const made = (tool === 'axes' ? newAxes : newEqLine)(model, panel);
      commit(made.model);
      onSelect?.([made.id]);
      onTool?.('select');
    }
  };

  const ONE_CLICK = (t: string) => t === 'point' || t === 'text' || t === 'axes' || t === 'eqline';

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
    if (e.button === 1 || space || readOnly) {
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
      const ids = e.shiftKey ? (selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]) : selected.has(id) ? selection : [id];
      onSelect?.(ids);
      if (!ids.includes(id)) return;
      // the selection moves together, snapping by the point pressed (or the first of what moves)
      const { points, items } = moversOf(model, ids);
      const point = model.points.find((p) => p.id === id);
      const note = model.items.find((i) => i.id === id && i.kind === 'text') as Extract<Item, { kind: 'text' }> | undefined;
      const first = point && points.has(point.id) ? point : note ?? model.points.find((p) => points.has(p.id));
      if (!first && !items.size) return;
      const panel = first && 'panel' in first ? first.panel : panelOf(model, model.items.find((i) => items.has(i.id))!);
      setDrag({ kind: 'move', ids, base: model, start: w, anchor: first ? { x: first.x, y: first.y } : { x: 0, y: 0 }, panel, moved: false });
      return;
    }
    setDrag({ kind: 'marquee', start: at, now: at, keep: e.shiftKey ? selection : [] });
    if (!e.shiftKey) onSelect?.([]);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    const at = local(e);
    const w = toWorld(at);
    setPointer(w);
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
    if (drag.kind === 'marquee') {
      setDrag({ ...drag, now: at });
      return;
    }
    // the anchor lands on a point within reach or the grid, and everything else moves as far
    const raw = { x: drag.anchor.x + w.x - drag.start.x, y: drag.anchor.y + w.y - drag.start.y };
    const moving = moversOf(drag.base, drag.ids).points;
    // only lines from equations: moved a grid step at a time
    const p = moving.size || drag.base.items.some((i) => drag.ids.includes(i.id) && i.kind === 'text') ? snapIn(drag.panel, raw, drag.base, moving) : snapToGrid(raw);
    setDraft(moveIds(drag.base, drag.ids, { x: p.x - drag.anchor.x, y: p.y - drag.anchor.y }));
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
    if (d.kind === 'marquee') {
      if (dist(d.now, d.start) <= 3) return;
      const [a, b] = [toWorld(d.start), toWorld(d.now)];
      const hits = shown.panels.flatMap((p) => idsInside(shown, p.id, { minX: Math.min(a.x, b.x) - p.shift, maxX: Math.max(a.x, b.x) - p.shift, minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) }, places));
      onSelect?.([...new Set([...d.keep, ...hits])]);
      return;
    }
    if (d.kind === 'pan' || !draft) return setDraft(null);
    commit(d.moved ? draft : model);
  };

  /** A pick given up: it starts again, without the points it made that nothing uses. */
  const dropPicks = () => {
    if (made.length) {
      const next = dropUnused(model, made);
      if (next !== model) commit(next);
    }
    setPicks([]);
    setMade([]);
  };
  // a tool picked part way through another starts again
  useEffect(dropPicks, [tool]);

  // ─── keys ───

  // P and V (as Settings › Diagram composer has them) pick Point and Vector while the pointer is over the drawing
  useToolKeys(() => svgRef.current, { diagramPoint: () => onTool?.('point'), diagramVector: () => onTool?.('vector') }, readOnly);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, button, a')) return;
    if (e.key === ' ') {
      setSpace(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      // during a pick Esc starts it again and keeps the tool; the frame's Esc (back to Select) is for after
      if (picks.length) {
        dropPicks();
        e.stopPropagation();
      }
      return;
    }
    if (e.key === 'Enter' && tool === 'polygon' && picks.length >= 3) {
      finish(model, picks);
      e.preventDefault();
      return;
    }
    if (readOnly || e.altKey) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const handled = (next?: VectorModel) => {
      if (next) onChange(next);
      e.preventDefault();
      e.stopPropagation();
    };
    if (mod && key === 'a') {
      onSelect?.([...model.points.map((p) => p.id), ...model.items.map((i) => i.id)]);
      return handled();
    }
    if (mod || !selection.length) return;
    // R turns the selection a quarter (Shift: an eighth) anticlockwise; X and Y mirror it
    if (key === 'r') return handled(turnIds(model, selection, e.shiftKey ? 45 : 90));
    if (key === 'x' || key === 'y') return handled(mirrorIds(model, selection, key));
    // the arrow keys move the selection a grid step (a tenth with Shift)
    const step = e.shiftKey ? grid / 10 : grid;
    const delta = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }[e.key];
    if (delta) handled(moveIds(model, selection, delta));
  };

  // ─── drawing ───

  /** text's size on screen: the document's \normalsize at the paper's scale, as it prints */
  const fontPx = NORMAL_PT * ptPx;
  /**
   * A label set as TikZ sets a node on a side of a place: its anchor there, the text an inner sep (a third of an em)
   * beyond, and `dist` pt further along each axis (above right=2pt).
   */
  const label = (at: Pt, text: string, spot: { side?: Side; dist?: number } | undefined, key: string, look: { size?: FontSize; colour?: string } = {}) => {
    const o = spot?.side ? sideOffset(spot.side) : { x: 0, y: 0 };
    const font = fontPx * FONT_SCALE[look.size ?? 'normalsize'];
    // a subscript under the baseline (a superscript over the top) is inside the node, as TikZ counts the text's depth
    const runs = scriptRuns(text);
    const script = (o.y > 0 && runs.some((r) => r.shift === 'sub')) || (o.y < 0 && runs.some((r) => r.shift === 'super')) ? font * 0.25 : 0;
    const gap = font / 3 + (spot?.dist ?? 0) * ptPx;
    const s = S(at);
    const [anchor, baseline] = ANCHOR[`${o.x},${o.y}`];
    return (
      <text
        key={key}
        x={s.x + o.x * gap}
        y={s.y - o.y * (gap + script)}
        className="st-text"
        fontSize={font}
        textAnchor={anchor}
        dominantBaseline={baseline}
        style={look.colour ? { fill: ink(look.colour) } : undefined}
      >
        {sketch(text, style.notation)}
      </text>
    );
  };
  /** a label with a side of its own, or where the spacing put it */
  const spotOf = (id: string, own?: { side?: string; dist?: number }): Spot | { side: Side; dist?: number } | undefined =>
    own?.side && own.side !== 'beside' ? { side: own.side as Side, dist: own.dist } : spots.get(id);

  /** a label written on its line's path takes the line's colour unless it has its own, as TikZ sets it */
  const onPath = (s: Stroke, look: { size?: FontSize; colour?: string }) => ({ ...look, colour: look.colour ?? s.colour ?? style.colour });

  const line = (a: Pt, b: Pt, className: string, extra: Record<string, unknown> = {}) => {
    const [p, q] = [S(a), S(b)];
    return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={className} {...extra} />;
  };

  /** an arrow tip at a place on the canvas, pointing away from another, size px long, in a colour */
  const tipPath = (tip: Exclude<Tip, 'none'> | undefined, at: Pt, from: Pt, size: number, colour: string, key: string) => {
    if (!tip) return null;
    const [p, q] = [S(at), S(from)];
    const [d, className] = TIP_SHAPES[tip];
    const angle = (Math.atan2(p.y - q.y, p.x - q.x) * 180) / Math.PI;
    return <path key={key} d={d} className={className} transform={`translate(${p.x},${p.y}) rotate(${angle}) scale(${size / 10}) translate(-9,-5)`} style={className === 'st-arrowhead' ? { fill: colour } : { stroke: colour, strokeWidth: (10 * 0.4 * ptPx) / size }} />;
  };
  /** a line's look on screen at its printed width: its own, else the Style's (or the width, dash and colour it has when it has none) */
  const strokeLook = (s: Stroke & { dashed?: boolean }, width = style.width, dash?: Dash, colour = style.colour) => {
    const pt = widthPt(s.width ?? width);
    const w = Math.max(0.5, pt * ptPx);
    const stroke = ink(s.colour ?? colour);
    return { stroke, strokeWidth: w, strokeDasharray: dashArray(s.dash ?? (s.dashed ? 'dashed' : dash), w), opacity: s.opacity, color: stroke, pt };
  };
  /** a dash pattern on screen, the gaps widened by the round caps' reach */
  const dashArray = (dash: Dash | undefined, width: number) => {
    const pattern = dash === 'dashed' ? [3, 3] : dash === 'dotted' ? [0, 2] : dash === 'dash dot' ? [3, 2, 0, 2] : Array.isArray(dash) ? dash : null;
    return pattern?.map((n, i) => (i % 2 ? n * ptPx + width : Math.max(0.01, n * ptPx))).join(' ');
  };
  /**
   * A line's tips from a to b, as the code writes them (a vector's end is the Style's tip when it has none), as long as
   * they print: TikZ's own stealth is 8 × (0.28 pt + 0.3 × the line width), arrows.meta's 3 pt + 4.5 × the line width.
   */
  const tips = (t: Tips, styleEnd: boolean, look: { pt: number; stroke: string; opacity?: number }, a: Pt, b: Pt) => {
    const end = t.end ? (t.end === 'none' ? undefined : t.end) : styleEnd ? style.tips : undefined;
    const start = t.start && t.start !== 'none' ? t.start : undefined;
    const own = !start && t.end === undefined && t.tipSize === undefined && ['stealth', 'latex', 'to'].includes(style.tips) && style.tipSize === 1;
    const meta = (3 + 4.5 * look.pt) * (t.tipSize ?? style.tipSize) * ptPx;
    const size = own ? 8 * (0.28 + 0.3 * look.pt) * ptPx : meta;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return (
      <g style={{ opacity: look.opacity }}>
        {tipPath(start, a, b, size, look.stroke, 'start')}
        {tipPath(end, b, a, size, look.stroke, 'end')}
        {t.middle && tipPath(end ?? style.tips, mid, a, meta, look.stroke, 'middle')}
      </g>
    );
  };

  /** an arc about c, radius r cm, anticlockwise from one angle to another in degrees, as an SVG path */
  const arcPath = (c: Pt, r: number, from: number, to: number) => {
    const sweep = ((to - from) % 360 + 360) % 360 || 360;
    const point = (deg: number) => S({ x: c.x + r * Math.cos((deg * Math.PI) / 180), y: c.y + r * Math.sin((deg * Math.PI) / 180) });
    // a whole turn as two halves
    if (sweep >= 359.999) return `M${point(from).x},${point(from).y} A${r * k},${r * k} 0 1 0 ${point(from + 180).x},${point(from + 180).y} A${r * k},${r * k} 0 1 0 ${point(from).x},${point(from).y}`;
    const [p, q] = [point(from), point(from + sweep)];
    return `M${p.x},${p.y} A${r * k},${r * k} 0 ${sweep > 180 ? 1 : 0} 0 ${q.x},${q.y}`;
  };
  const degrees = (from: Pt, to: Pt) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

  const drawItem = (item: Item): ReactNode => {
    // left out with a point that isn't anywhere now, as the code leaves it out
    if (!pointsOf(item).every((id) => placed(places.get(id)))) return null;
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
      const pos = item.label?.pos ?? 0.5;
      const at = { x: a.x + (b.x - a.x) * pos, y: a.y + (b.y - a.y) * pos };
      const names = { vector: 'Vector', segment: 'Segment', line: 'Line', highlight: 'Highlight' };
      // equal-length ticks across the middle, 2 pt apart and 6 pt long
      const n = Math.min(3, Math.max(0, Math.round(item.ticks ?? 0)));
      const len = dist(a, b) || 1;
      const [u, across] = [{ x: (b.x - a.x) / len, y: (b.y - a.y) / len }, { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const tickAt = (i: number) => {
        const along = ((i - (n - 1) / 2) * 2 * ptIn) / k;
        const c = { x: mid.x + u.x * along, y: mid.y + u.y * along };
        const h = (3 * ptIn) / k;
        return <g key={i}>{line({ x: c.x - across.x * h, y: c.y - across.y * h }, { x: c.x + across.x * h, y: c.y + across.y * h }, 'vec-stroke', { style: look })}</g>;
      };
      return group(
        <>
          {on && line(a, b, 'st-halo')}
          {line(a, b, 'st-hit')}
          {line(a, b, 'vec-stroke', { style: look })}
          {!highlight && item.kind !== 'line' && Array.from({ length: n }, (_, i) => tickAt(i))}
          {!highlight && tips(item, item.kind === 'vector', look, a, b)}
          {!highlight && item.label?.text.trim() && label(at, item.label.text, spotOf(item.id, item.label) ?? { side: 'above' }, `${item.id}-label`, onPath(item, item.label))}
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
              style={{ ...strokeLook({ ...item, opacity: undefined }), strokeOpacity: item.opacity, fill: item.fill ? ink(item.fill) : 'none', fillOpacity: item.fillOpacity }}
            />
          </>,
          `Polygon ${item.points.map(nameOf).join('')}`
        );
      }
      case 'text': {
        const s = S(W(item));
        const font = fontPx * FONT_SCALE[item.size ?? 'normalsize'];
        return group(
          <>
            {on && <rect x={s.x - font * 2} y={s.y - font * 0.8} width={font * 4} height={font * 1.6} className="st-halo-pic" rx={3} />}
            <text x={s.x} y={s.y} className="st-text" fontSize={font} textAnchor="middle" dominantBaseline="middle" style={item.colour ? { fill: ink(item.colour) } : undefined}>
              {item.text.trim() ? sketch(item.text, style.notation) : 'Text'}
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
        const axisTips = { end: item.tip };
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
            {line(W({ x: item.x[0], y: 0 }), W({ x: item.x[1], y: 0 }), 'vec-stroke', { style: look })}
            {tips(axisTips, true, look, W({ x: item.x[0], y: 0 }), W({ x: item.x[1], y: 0 }))}
            {line(W({ x: 0, y: item.y[0] }), W({ x: 0, y: item.y[1] }), 'vec-stroke', { style: look })}
            {tips(axisTips, true, look, W({ x: 0, y: item.y[0] }), W({ x: 0, y: item.y[1] }))}
            {label(W({ x: item.x[1], y: 0 }), xName, { side: 'right' }, 'xn', { colour: item.colour })}
            {label(W({ x: 0, y: item.y[1] }), yName, { side: 'above' }, 'yn', { colour: item.colour })}
            {item.ticks &&
              ticks(item.x).map((t) => (
                <g key={`x${t}`}>
                  {line(W({ x: t, y: tick }), W({ x: t, y: -tick }), 'vec-stroke', { style: look })}
                  {label(W({ x: t, y: -tick }), String(t), { side: 'below' }, `xl${t}`, numbers)}
                </g>
              ))}
            {item.ticks &&
              ticks(item.y).map((t) => (
                <g key={`y${t}`}>
                  {line(W({ x: tick, y: t }), W({ x: -tick, y: t }), 'vec-stroke', { style: look })}
                  {label(W({ x: -tick, y: t }), String(t), { side: 'left' }, `yl${t}`, numbers)}
                </g>
              ))}
            {item.origin && label(W({ x: 0, y: 0 }), '$O$', { side: 'below left' }, 'o')}
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
        const ends = [...(item.axis !== 'y' ? [{ x: from.x, y: 0 }] : []), ...(item.axis !== 'x' ? [{ x: shift, y: from.y }] : [])];
        return group(
          <>
            {ends.map((to, i) => (
              <g key={i}>
                {on && line(from, to, 'st-halo')}
                {line(from, to, 'st-hit')}
                {line(from, to, 'vec-stroke', { style: strokeLook(item, style.width, 'dashed') })}
              </g>
            ))}
          </>,
          item.axis === 'both' ? `Drop from ${nameOf(item.from)} to both axes` : `Drop from ${nameOf(item.from)} to the ${item.axis} axis`
        );
      }
      case 'angle': {
        const [V, A, B] = [world(item.at), world(item.from), world(item.to)];
        if (dist(V, A) < 1e-9 || dist(V, B) < 1e-9) return null;
        const r = item.radius ?? 0.6;
        const [from, to] = [degrees(V, A), degrees(V, B)];
        const sweep = ((to - from) % 360 + 360) % 360;
        const look = strokeLook(item);
        const d = arcPath(V, r, from, to);
        const middle = ((from + sweep / 2) * Math.PI) / 180;
        const end = (deg: number) => ({ x: V.x + r * Math.cos((deg * Math.PI) / 180), y: V.y + r * Math.sin((deg * Math.PI) / 180) });
        return group(
          <>
            {on && <path d={d} className="st-halo" />}
            <path d={d} className="st-hit" />
            <path d={d} className="vec-stroke" style={look} />
            {item.double && <path d={arcPath(V, r + 0.07, from, to)} className="vec-stroke" style={look} />}
            {item.arrow && tips({ end: style.tips }, false, look, end(to - Math.min(10, sweep / 2)), end(to))}
            {item.label?.text.trim() && label({ x: V.x + (r + 0.25) * Math.cos(middle), y: V.y + (r + 0.25) * Math.sin(middle) }, item.label.text, undefined, `${item.id}-label`, item.label)}
          </>,
          `Angle ${nameOf(item.from)}${nameOf(item.at)}${nameOf(item.to)}${item.label?.text ? `, ${plain(item.label.text)}` : ''}`
        );
      }
      case 'circle': {
        const [C, P] = [world(item.centre), world(item.through)];
        const r = dist(C, P);
        if (r < 1e-9) return null;
        const d = item.to ? arcPath(C, r, degrees(C, P), degrees(C, world(item.to))) : arcPath(C, r, 0, 360);
        return group(
          <>
            {on && <path d={d} className="st-halo" />}
            <path d={d} className="st-hit" />
            <path d={d} className="vec-stroke" style={{ ...strokeLook({ ...item, opacity: undefined }), strokeOpacity: item.opacity, fill: item.fill ? ink(item.fill) : 'none', fillOpacity: item.fillOpacity }} />
          </>,
          `${item.to ? 'Arc' : 'Circle'} about ${nameOf(item.centre)}`
        );
      }
      case 'eqline': {
        const ends = eqLineEnds(item, frames.get(panel)!);
        if (!ends) return null;
        const [a, b] = ends.map(W);
        const look = strokeLook(item);
        const pos = item.label?.pos ?? 0.5;
        const at = { x: a.x + (b.x - a.x) * pos, y: a.y + (b.y - a.y) * pos };
        return group(
          <>
            {on && line(a, b, 'st-halo')}
            {line(a, b, 'st-hit')}
            {line(a, b, 'vec-stroke', { style: look })}
            {item.label?.text.trim() && label(at, item.label.text, spotOf(item.id, item.label) ?? { side: 'above' }, `${item.id}-label`, onPath(item, item.label))}
          </>,
          `Line ${plain(item.label?.text ?? '')}`
        );
      }
    }
  };

  /** a point's dot, filled, open or a cross, its radius in pt drawn to scale */
  const dot = (p: VPoint, s: Pt) => {
    const r = Math.max(1, (p.size ?? style.pointSize) * ptIn);
    const colour = ink(p.colour ?? style.colour);
    const w = Math.max(0.5, 0.4 * ptPx);
    if (p.shape === 'open') return <circle cx={s.x} cy={s.y} r={r} className="st-dot-open" style={{ stroke: colour, strokeWidth: w }} />;
    if (p.shape === 'cross') return <path d={`M${s.x - r},${s.y - r} L${s.x + r},${s.y + r} M${s.x - r},${s.y + r} L${s.x + r},${s.y - r}`} className="vec-stroke" style={{ stroke: colour, strokeWidth: w }} />;
    return <circle cx={s.x} cy={s.y} r={r} className="st-dot" style={{ fill: colour }} />;
  };

  /** the order things are drawn in, as the code writes them */
  const LAYERS: Item['kind'][] = ['axes', 'highlight', 'polygon', 'circle', 'line', 'eqline', 'segment', 'drop', 'right', 'angle', 'vector', 'text'];
  const items = LAYERS.flatMap((layer) => shown.items.filter((i) => i.kind === layer));

  const picking = tool !== 'select' && !!PICKS[tool] && !ONE_CLICK(tool);
  const ghost = picking && picks.length && hover ? [world(picks[picks.length - 1]), hover] : null;
  const message = picking ? (ASKS[tool]?.[Math.min(picks.length, (ASKS[tool]?.length ?? 1) - 1)] ?? '') + (picks.length ? '. Esc starts again.' : '') : '';
  const cursor = space || drag?.kind === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  // the pointer's place in its panel, on the grid, as a click there would put a point
  const readout = (() => {
    if (!pointer || !view) return null;
    const panel = panelAt(pointer);
    const p = snapToGrid({ x: pointer.x - (shiftOf.get(panel) ?? 0), y: pointer.y });
    return `(${num(p.x).replace('-', '−')}, ${num(p.y).replace('-', '−')})`;
  })();

  return (
    <div
      ref={boxRef}
      className="ckt-canvas st-canvas"
      tabIndex={0}
      aria-label="Vector canvas"
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && setSpace(false)}
      onBlur={() => setSpace(false)}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setPointer(null);
          if (!drag) setHover(null);
        }}
      >
        {/* a larger mark every centimetre of the drawing, and x = 0 and y = 0 darker */}
        <CanvasGrid id="vec" step={grid * k} x={v.x} y={v.y} major={k} origin />
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
              p.of?.kind === 'ratio' && p.of.marks && placed(places.get(p.id))
                ? [
                    label({ x: (world(p.of.a).x + world(p.id).x) / 2, y: (world(p.of.a).y + world(p.id).y) / 2 }, String(p.of.m), { side: p.of.marks }, `${p.id}-m`),
                    label({ x: (world(p.id).x + world(p.of.b).x) / 2, y: (world(p.id).y + world(p.of.b).y) / 2 }, String(p.of.n), { side: p.of.marks }, `${p.id}-n`)
                  ]
                : []
            )}
            {shown.points.map((p) => {
              if (!placed(places.get(p.id))) return null;
              const s = S(world(p.id));
              const on = selected.has(p.id);
              const picked = picks.includes(p.id);
              return (
                <g key={p.id} data-id={readOnly ? undefined : p.id} className={`vec-point ${p.of ? 'built' : ''} ${on || picked ? 'selected' : ''}`} role="img" aria-label={`Point ${p.name}${p.of ? ', constructed' : ''}`}>
                  <circle cx={s.x} cy={s.y} r={10} className="st-hit-box" />
                  {p.dot && dot(p, s)}
                  <circle cx={s.x} cy={s.y} r={on || picked ? 6 : 4} className="vec-handle" />
                  {p.label?.text.trim() && label(world(p.id), p.label.text, spotOf(p.id, p.label) ?? { side: 'above right' }, `${p.id}-label`, p.label)}
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
            {hover && tool !== 'select' && (() => {
              const p = S(hover);
              return <circle className="ckt-target" cx={p.x} cy={p.y} r={5} />;
            })()}
            {drag?.kind === 'marquee' && (
              <rect className="ckt-marquee" x={Math.min(drag.start.x, drag.now.x)} y={Math.min(drag.start.y, drag.now.y)} width={Math.abs(drag.now.x - drag.start.x)} height={Math.abs(drag.now.y - drag.start.y)} />
            )}
          </>
        )}
      </svg>
      <div className="ckt-zoom">
        {readout && (
          <span className="ckt-zoom-level vec-readout" aria-label="Pointer, x and y in cm">
            {readout}
          </span>
        )}
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
