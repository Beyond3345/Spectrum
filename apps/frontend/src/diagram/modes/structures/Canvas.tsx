// The structures canvas: the drawing as the export draws it (the same display list, as SVG), live as the solve runs on
// every edit, with nodes to drag and the rail's tools to place members, supports, loads and notes. Nodes snap to the
// grid in the drawing's unit and to each other; members are drawn node to node, and one ending on a member splits it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, SVGProps } from 'react';
import Icon from '../../../app/Icon';
import { CanvasGrid } from '../../CanvasGrid';
import { useCanvasPrefs } from '../../FlowCanvas';
import { svgRuns } from '../../sketch';
import { useToolKeys } from '../../toolKeys';
import { unitsAsText } from '../../units';
import { colourCss } from '../shared';
import { buildScene, extentOf, fitScale, readStyle } from './draw';
import type { Anchor, Item } from './draw';
import { INNER_SEP } from './labels';
import { UNITS, asStructure, bendOf, bendPeak, bendSide, connect, dist, frameOf, inBox, mirror, moveBy, nodesOf, placeTool, pointAlong, settleNode, snapOnMember } from './model';
import type { Part, Pt, StructureModel, Units } from './model';
import { solve } from './solve';
import { setShown } from './store';
import { symbolSvg } from './symbols';
import { WIDTH_PT } from '../vectors/model';
import type { Thickness } from '../vectors/model';

/** screen pixels a centimetre at 100 % */
const PX_PER_CM = 36;
/** how near, in screen pixels, a node pulls what's dragged */
const SNAP_PX = 10;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
/** a point (TeX's) in cm, and the export's \footnotesize text in cm */
const PT_CM = 2.54 / 72.27;
const TEXT_CM = 8 * PT_CM;
/** the counting grid's larger mark: every whole metre, or a foot in inches */
const MAJOR: Record<Units, number> = { 'kN-m': 1, 'N-mm': 1000, 'kip-ft': 1, 'lb-in': 12 };

interface View {
  x: number;
  y: number;
  zoom: number;
}

type Drag =
  | { kind: 'pan'; start: Pt; view: View }
  | { kind: 'node'; id: string; base: StructureModel; moved: boolean }
  /** the picked group dragged from where the pointer went down (drawing units) */
  | { kind: 'group'; ids: string[]; start: Pt; base: StructureModel }
  | { kind: 'marquee'; start: Pt; now: Pt; keep: string[] }
  /** a load sliding along its member, or a distributed load's end */
  | { kind: 'slide'; id: string; end: 'at' | 'from' | 'to'; base: StructureModel }
  | { kind: 'point'; id: string; end: 'at' | 'p' | 'q'; base: StructureModel }
  /** a beam's bend, by the handle where its curve is furthest from its chord */
  | { kind: 'bend'; id: string; base: StructureModel }
  /** a two-point tool from a, the pointer at b */
  | { kind: 'connect'; a: Pt; b: Pt; moved: boolean };

const TWO_POINT = (tool: string) => tool === 'beam' || tool === 'bent' || tool === 'bar' || tool === 'cut' || tool.startsWith('dim-');

/** A label as it prints (sketch.tsx): units as siunitx sets them, A_y and δ_max with real subscripts. */
const sketched = (tex: string) => svgRuns(unitsAsText(tex).replace(/\\(max|min)(?![a-zA-Z])/g, '$1'));

const TEXT_ANCHOR: Record<Anchor, ['start' | 'middle' | 'end', 'auto' | 'middle' | 'hanging']> = {
  center: ['middle', 'middle'],
  north: ['middle', 'hanging'],
  south: ['middle', 'auto'],
  east: ['end', 'middle'],
  west: ['start', 'middle'],
  'north east': ['end', 'hanging'],
  'north west': ['start', 'hanging'],
  'south east': ['end', 'auto'],
  'south west': ['start', 'auto']
};

export default function StructureCanvas({
  model: raw,
  onChange,
  style: rawStyle,
  readOnly,
  selection = [],
  onSelect,
  tool = 'select',
  onTool
}: {
  model: StructureModel;
  onChange(m: StructureModel): void;
  style: Record<string, unknown>;
  readOnly?: boolean;
  selection?: string[];
  onSelect?(ids: string[]): void;
  tool?: string;
  onTool?(tool: string): void;
}) {
  // the same object while raw is, so a pointer move doesn't solve and lay out the drawing again
  const model = useMemo(() => asStructure(raw), [raw]);
  const style = readStyle(rawStyle);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<StructureModel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** a two-point tool's first point, waiting for its second click */
  const [pending, setPending] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  /** Space held: a drag pans */
  const [space, setSpace] = useState(false);
  const prefs = useCanvasPrefs();

  const shown = draft || model;
  /** the style menu converted the units: every length changed by one factor, so the zoom stays as it is */
  const converted = useRef(false);
  useEffect(
    () =>
      setShown(model, style, (next) => {
        converted.current = true;
        onChange(next);
      }),
    [model, rawStyle]
  );
  const units = UNITS[style.units];
  // the export's scale, as the drawing was last saved (not while a drag is under way), so the text, arrows and symbols
  // sit on the structure as they will in the PDF; a drawing with no length yet keeps the unit's own
  const fitted = fitScale(model, style.width);
  const scale = model.nodes.some((n) => n.x !== model.nodes[0].x || n.y !== model.nodes[0].y) ? fitted : units.canvasCm;
  const solution = useMemo(() => solve(shown), [shown]);
  const scene = useMemo(() => buildScene(shown, solution, style, true, scale), [shown, solution, rawStyle, scale]);
  const grid = units.grids[style.grid];
  const selected = new Set(selection);

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
    const items = scene.blocks.flatMap((b) => b.items.map((i) => shiftItem(i, b.shift)));
    const e = items.length ? extentOf(items) : { minX: -2, maxX: 8, minY: -2, maxY: 2 };
    const w = Math.max(e.maxX - e.minX, 2) + 2;
    const h = Math.max(e.maxY - e.minY, 2) + 2;
    const zoom = Math.min(MAX_ZOOM / 2, Math.max(MIN_ZOOM, Math.min(size.width / (w * PX_PER_CM), size.height / (h * PX_PER_CM))));
    const k = PX_PER_CM * zoom;
    setView({ zoom, x: size.width / 2 - ((e.minX + e.maxX) / 2) * k, y: size.height / 2 + ((e.minY + e.maxY) / 2) * k });
  };

  useEffect(() => {
    if (!view && size.width) fit();
  }, [size.width, size.height]);

  // a new scale (the structure grew or shrank, or the width changed) keeps the structure where it is on screen: the
  // zoom takes the change, and only the text, arrows and symbols change size against it, as in the PDF
  const lastScale = useRef(scale);
  useLayoutEffect(() => {
    const f = lastScale.current / scale;
    lastScale.current = scale;
    if (f !== 1 && !converted.current) setView((prev) => prev && { ...prev, zoom: prev.zoom * f });
  }, [scale]);
  // after the layout effect above has seen the converted drawing
  useEffect(() => {
    converted.current = false;
  }, [model]);

  const v = view || { x: 0, y: 0, zoom: 1 };
  const k = PX_PER_CM * v.zoom;
  /** centimetres to screen */
  const S = (p: Pt) => ({ x: v.x + p.x * k, y: v.y - p.y * k });
  /** screen to the drawing's unit */
  const toModel = (s: Pt) => ({ x: (s.x - v.x) / k / scale, y: (v.y - s.y) / k / scale });
  const tolerance = SNAP_PX / k / scale;

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

  // ─── snapping ───

  const snapToGrid = (p: Pt) => ({ x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid });
  /** a node within reach, else the grid */
  const snap = (p: Pt, m: StructureModel) => {
    const node = m.nodes.reduce<{ n: Pt; d: number } | null>((best, n) => {
      const d = dist(n, p);
      return d <= tolerance && (!best || d < best.d) ? { n, d } : best;
    }, null);
    return node ? { x: node.n.x, y: node.n.y } : snapToGrid(p);
  };
  // what lands on a member lands on its line, not on a grid point beside an inclined one: a member's ends too
  const snapFor = (p: Pt) => (tool === 'cut' || tool.startsWith('dim-') || tool === 'label' || tool === 'axes' || tool === 'angle' ? snap(p, model) : snapOnMember(model, p, grid, tolerance));

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const commit = (next: StructureModel) => {
    setDraft(null);
    onChange(next);
  };

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
    const point = toModel(at);
    const target = (e.target as globalThis.Element).closest('[data-id], [data-node], [data-handle]') as SVGElement | null;

    if (TWO_POINT(tool)) {
      const p = snapFor(point);
      if (pending) {
        finishConnect(pending, p);
        return;
      }
      setDrag({ kind: 'connect', a: p, b: p, moved: false });
      return;
    }
    if (tool !== 'select') {
      const placed = placeTool(model, tool, snapFor(point), tolerance);
      if (placed) {
        commit(placed.model);
        onSelect?.([placed.id]);
        onTool?.('select');
      }
      return;
    }

    const handle = target?.dataset.handle;
    if (handle) {
      const [id, end] = handle.split(':');
      const part = model.parts.find((p) => p.id === id);
      if (end === 'bend') setDrag({ kind: 'bend', id, base: model });
      else if (part?.kind === 'dist') setDrag({ kind: 'slide', id, end: end as 'from' | 'to', base: model });
      else if (part) setDrag({ kind: 'point', id, end: end as 'p' | 'q', base: model });
      return;
    }
    // what's pressed joins the selection (or leaves it, with Shift); pressed inside a selection, the selection stays
    const id = target?.dataset.node ?? target?.dataset.id;
    if (id) {
      const ids = e.shiftKey ? (selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]) : selected.has(id) ? selection : [id];
      onSelect?.(ids);
      if (!ids.includes(id)) return;
      const part = model.parts.find((p) => p.id === id);
      // a group drags as one; alone, a joint drags onto members and other joints, a load slides along its member
      if (ids.length > 1 && (nodesOf(model, ids).size || ids.some((x) => model.parts.some((p) => p.id === x && (p.kind === 'label' || p.kind === 'axes' || p.kind === 'cut'))))) setDrag({ kind: 'group', ids, start: point, base: model });
      else if (target?.dataset.node) setDrag({ kind: 'node', id, base: model, moved: false });
      else if ((part?.kind === 'force' || part?.kind === 'moment') && 'member' in part.on) setDrag({ kind: 'slide', id, end: 'at', base: model });
      else if (part?.kind === 'label' || part?.kind === 'axes') setDrag({ kind: 'point', id, end: 'at', base: model });
      else if (part && nodesOf(model, [id]).size) setDrag({ kind: 'group', ids, start: point, base: model });
      return;
    }
    // empty space: a box picks what's wholly inside it (adding to the selection with Shift)
    setDrag({ kind: 'marquee', start: at, now: at, keep: e.shiftKey ? selection : [] });
    if (!e.shiftKey) onSelect?.([]);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    const at = local(e);
    const point = toModel(at);
    if (!drag) {
      setHover(tool === 'select' ? null : snapFor(point));
      return;
    }
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + at.x - drag.start.x, y: drag.view.y + at.y - drag.start.y });
    } else if (drag.kind === 'marquee') {
      setDrag({ ...drag, now: at });
    } else if (drag.kind === 'group') {
      // whole grid steps, so what sat on the grid stays on it
      const d = { x: Math.round((point.x - drag.start.x) / grid) * grid, y: Math.round((point.y - drag.start.y) / grid) * grid };
      setDraft(d.x || d.y ? moveBy(drag.base, drag.ids, d) : null);
    } else if (drag.kind === 'connect') {
      const b = snapFor(point);
      setDrag({ ...drag, b, moved: drag.moved || dist(b, drag.a) > 1e-9 });
    } else if (drag.kind === 'node') {
      // onto another member's line, as a member's end drawn there would; never onto its own
      const others = { nodes: drag.base.nodes.filter((n) => n.id !== drag.id), parts: drag.base.parts.filter((x) => x.kind !== 'member' || (x.a !== drag.id && x.b !== drag.id)) };
      const p = snapOnMember(others, point, grid, tolerance);
      setDraft({ ...drag.base, nodes: drag.base.nodes.map((n) => (n.id === drag.id ? { ...n, x: p.x, y: p.y } : n)) });
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === 'slide') {
      setDraft({
        ...drag.base,
        parts: drag.base.parts.map((p): Part => {
          if (p.id !== drag.id) return p;
          const memberId = p.kind === 'dist' ? p.member : (p.kind === 'force' || p.kind === 'moment') && 'member' in p.on ? p.on.member : null;
          const member = drag.base.parts.find((m) => m.kind === 'member' && m.id === memberId);
          if (!member || member.kind !== 'member') return p;
          const f = frameOf(drag.base, member);
          const s = Math.max(0, Math.min(f.length, Math.round(((point.x - f.a.x) * f.u.x + (point.y - f.a.y) * f.u.y) / grid) * grid));
          if (p.kind === 'dist') return drag.end === 'from' ? { ...p, from: Math.min(s, p.to - grid) } : { ...p, to: Math.max(s, p.from + grid) };
          if ((p.kind === 'force' || p.kind === 'moment') && 'member' in p.on) return { ...p, on: { member: p.on.member, at: s } };
          return p;
        })
      });
    } else if (drag.kind === 'bend') {
      // the offset from the chord where the curve is furthest from it, in whole grid steps; 0 straightens it
      setDraft({
        ...drag.base,
        parts: drag.base.parts.map((p): Part => {
          if (p.id !== drag.id || p.kind !== 'member') return p;
          const f = frameOf(drag.base, p);
          const t = bendPeak(p.bend) * f.length;
          const side = bendSide(f);
          const sag = Math.round(((point.x - f.a.x - f.u.x * t) * side.x + (point.y - f.a.y - f.u.y * t) * side.y) / grid) * grid;
          const { bend: _, ...straight } = p;
          return sag ? { ...p, bend: { ...p.bend, sag: Number(sag.toPrecision(12)) } } : straight;
        })
      });
    } else if (drag.kind === 'point') {
      const p = snapToGrid(point);
      setDraft({
        ...drag.base,
        parts: drag.base.parts.map((x): Part => (x.id !== drag.id ? x : x.kind === 'cut' ? { ...x, [drag.end]: p } : x.kind === 'label' || x.kind === 'axes' ? { ...x, at: p } : x))
      });
    }
  };

  const finishConnect = (a: Pt, b: Pt) => {
    setPending(null);
    const made = connect(model, tool, a, b, tolerance);
    if (!made) return;
    commit(made.model);
    onSelect?.([made.id]);
    // members keep the tool, to draw the next; a dimension or cut goes back to Select
    if (tool !== 'beam' && tool !== 'bent' && tool !== 'bar') onTool?.('select');
  };

  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'connect') {
      if (d.moved) finishConnect(d.a, d.b);
      else setPending(d.a);
      return;
    }
    if (d.kind === 'marquee') {
      if (Math.hypot(d.now.x - d.start.x, d.now.y - d.start.y) <= 3) return;
      const [a, b] = [toModel(d.start), toModel(d.now)];
      const hits = inBox(model, { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
      onSelect?.([...new Set([...d.keep, ...hits])]);
      return;
    }
    if (d.kind === 'pan' || !draft) {
      setDraft(null);
      return;
    }
    if (d.kind === 'node') commit(d.moved ? settleNode(draft, d.id, tolerance) : model);
    else commit(draft);
  };

  // a tool picked part way through a two-point tool starts again
  useEffect(() => setPending(null), [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    const onUp = (e: KeyboardEvent) => e.key === ' ' && setSpace(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ─── keys ───

  // M and T (or as changed in Settings › Diagram composer) pick the member tools while the pointer is over the drawing
  useToolKeys(() => svgRef.current, { diagramMember: () => onTool?.('beam'), diagramTruss: () => onTool?.('bar') }, readOnly);

  // the frame has copy, paste, duplicate, delete, undo and Escape; the canvas, once clicked, the rest
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (readOnly || (e.target as HTMLElement).closest('input, textarea, select, button, a')) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === ' ') {
      setSpace(true);
      handled();
    } else if (mod && key === 'a') {
      onSelect?.([...model.nodes.map((n) => n.id), ...model.parts.map((p) => p.id)]);
      handled();
    } else if (!mod && (key === 'x' || key === 'y') && selection.length) {
      onChange(mirror(model, selection, key));
      handled();
    } else if (!mod && e.key.startsWith('Arrow') && selection.length) {
      const step = grid * (e.shiftKey ? 4 : 1);
      const d = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }[e.key];
      if (d) onChange(moveBy(model, selection, d));
      handled();
    }
  };

  // ─── drawing ───

  // the export's \footnotesize at this zoom, and a TeX point in screen pixels for the line widths (structures.css),
  // neither smaller than the canvas can show plainly
  const fontSize = Math.max(9, TEXT_CM * k);
  /** a part's own colour as it prints (black the canvas's ink, so it shows on the dark canvas too), and its thickness at its printed width */
  const inkOf = (colour: string) => (colour === 'black' ? 'var(--ckt-ink)' : colourCss(colour));
  const strokeOf = ({ colour, width }: { colour?: string; width?: Thickness }): CSSProperties => ({
    ...(colour && { stroke: inkOf(colour) }),
    ...(width !== undefined && { strokeWidth: `max(1px, calc(${typeof width === 'number' ? width : WIDTH_PT[width]} * var(--st-pt, 0px)))` })
  });
  /** a symbol's or a label's colour: the ink it's drawn in, so a selected label still shows as selected */
  const inkStyle = (colour?: string) => (colour ? ({ '--ckt-ink': inkOf(colour) } as CSSProperties) : undefined);
  const drawItem = (item: Item, key: string, shift: Pt = { x: 0, y: 0 }) => {
    const id = 'id' in item ? item.id : undefined;
    const on = id !== undefined && selected.has(id);
    const hit = id && !readOnly ? { 'data-id': id } : {};
    const T = (p: Pt) => S({ x: p.x + shift.x, y: p.y + shift.y });
    switch (item.t) {
      case 'line': {
        const pts = item.pts.map(T).map((p) => `${p.x},${p.y}`).join(' ');
        // a bent member as the cubic the export draws
        const curve = item.controls && [item.pts[0], ...item.controls, item.pts[1]].map(T);
        // called, not rendered as a component, so React keeps the same element from one render to the next
        const shape = (props: SVGProps<SVGPathElement & SVGPolylineElement>) => (curve ? <path d={`M${curve[0].x},${curve[0].y} C${curve.slice(1).map((p) => `${p.x},${p.y}`).join(' ')}`} {...props} /> : item.closed ? <polygon points={pts} {...props} /> : <polyline points={pts} {...props} />);
        return (
          <g key={key} {...hit} className={`st-item ${on ? 'selected' : ''}`}>
            {on && shape({ className: 'st-halo' })}
            {id && shape({ className: 'st-hit' })}
            {shape({ className: `st-ink st-${item.ink} ${item.fill === 'load' ? 'st-fill-load' : ''}`, style: { ...(item.fill && item.fill !== 'load' && { fill: colourCss(style.diagrams[item.fill].fill), fillOpacity: style.diagrams[item.fill].opacity }), ...strokeOf(item) }, markerEnd: item.arrow ? 'url(#st-arrow)' : undefined, markerStart: item.arrow === '<->' ? 'url(#st-arrow-start)' : undefined })}
          </g>
        );
      }
      case 'arc': {
        const r = item.r * k;
        const a0 = (item.from * Math.PI) / 180;
        const a1 = (item.to * Math.PI) / 180;
        const c = T(item.c);
        const p0 = { x: c.x + r * Math.cos(a0), y: c.y - r * Math.sin(a0) };
        const p1 = { x: c.x + r * Math.cos(a1), y: c.y - r * Math.sin(a1) };
        const large = Math.abs(item.to - item.from) > 180 ? 1 : 0;
        const sweep = item.to > item.from ? 0 : 1;
        const d = `M${p0.x},${p0.y} A${r},${r} 0 ${large} ${sweep} ${p1.x},${p1.y}`;
        return (
          <g key={key} {...hit} className={`st-item ${on ? 'selected' : ''}`}>
            {on && <path d={d} className="st-halo" />}
            {id && <path d={d} className="st-hit" />}
            <path d={d} className={`st-ink st-${item.ink}`} style={strokeOf(item)} markerEnd="url(#st-arrow)" />
          </g>
        );
      }
      case 'pic': {
        const p = T(item.at);
        return (
          <g key={key} {...hit} className={`st-item ${on ? 'selected' : ''} ${item.faint ? 'st-faint-pic' : ''}`} style={inkStyle(item.colour)} transform={`translate(${p.x},${p.y}) scale(${k},${-k}) rotate(${item.rotate})`}>
            {on && <circle r={0.45} className="st-halo-pic" />}
            {id && <rect x={-0.45} y={-0.7} width={0.9} height={0.8} className="st-hit-box" />}
            {symbolSvg(item.name).map((shape, i) =>
              shape.circle ? (
                <circle key={i} cx={shape.circle.c.x} cy={shape.circle.c.y} r={shape.circle.r} className={`st-sym ${shape.fill ? `st-sym-${shape.fill}` : ''}`} vectorEffect="non-scaling-stroke" />
              ) : (
                <path key={i} d={shape.d} className={`st-sym ${shape.fill ? `st-sym-${shape.fill}` : ''} ${shape.heavy ? 'st-sym-heavy' : ''} ${shape.bare ? 'st-sym-bare' : ''}`} vectorEffect="non-scaling-stroke" />
              )
            )}
          </g>
        );
      }
      case 'text': {
        // set inside TikZ's inner sep from its anchor, as the export's node is, so the canvas keeps the same clearance
        const at = T(item.at);
        const sep = INNER_SEP * k;
        const p = { x: at.x + (item.anchor.includes('west') ? sep : item.anchor.includes('east') ? -sep : 0), y: at.y + (item.anchor.includes('south') ? -sep - 0.2 * fontSize : item.anchor.includes('north') ? sep : 0) };
        const [anchor, baseline] = TEXT_ANCHOR[item.anchor];
        return (
          <text key={key} {...hit} x={p.x} y={p.y} className={`st-text ${on ? 'selected' : ''}`} style={inkStyle(item.colour)} fontSize={fontSize} textAnchor={anchor} dominantBaseline={baseline}>
            {sketched(item.tex)}
          </text>
        );
      }
      case 'dot': {
        const p = T(item.at);
        return <circle key={key} cx={p.x} cy={p.y} r={item.r * k} className={item.open ? 'st-dot-open' : 'st-dot'} />;
      }
    }
  };

  // handles: a selected distributed load's ends, a selected cut's ends
  const handles = readOnly
    ? []
    : shown.parts.flatMap((p) => {
        if (!selected.has(p.id)) return [];
        if (p.kind === 'cut') return [{ key: `${p.id}:p`, at: p.p }, { key: `${p.id}:q`, at: p.q }];
        if (p.kind === 'dist') {
          const member = shown.parts.find((m) => m.kind === 'member' && m.id === p.member);
          if (!member || member.kind !== 'member') return [];
          return (['from', 'to'] as const).map((end) => ({ key: `${p.id}:${end}`, at: pointAlong(shown, member, p[end]) }));
        }
        // one beam picked: its bend, where its curve is furthest from its chord (mid-span when straight)
        if (p.kind === 'member' && !p.bar && selection.length === 1) return [{ key: `${p.id}:bend`, at: pointAlong(shown, p, bendPeak(bendOf(p)) * frameOf(shown, p).length) }];
        return [];
      });

  const nodesShown = shown.nodes.map((n) => ({ n, at: S({ x: n.x * scale, y: n.y * scale }) }));
  const gridPx = grid * scale * k;
  // a coarse grid (a metre's step) counts in fives of its own
  const major = (grid < MAJOR[style.units] ? MAJOR[style.units] : 5 * grid) * scale * k;
  const ghost = drag?.kind === 'connect' ? [drag.a, drag.b] : pending && hover ? [pending, hover] : null;
  const status = solution.status;
  const message = [status.text, ...solution.notes, scene.message].filter(Boolean).join(' ');
  const cursor = drag?.kind === 'pan' ? 'grabbing' : space ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={boxRef} className="ckt-canvas st-canvas" tabIndex={0} aria-label="Structure canvas" onKeyDown={onKeyDown}>
      <svg ref={svgRef} width="100%" height="100%" style={{ cursor, '--st-pt': `${PT_CM * k}px` } as CSSProperties} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => !drag && setHover(null)}>
        <defs>
          <marker id="st-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,1 L10,5 L0,9 z" className="st-arrowhead" />
          </marker>
          <marker id="st-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M10,1 L0,5 L10,9 z" className="st-arrowhead" />
          </marker>
        </defs>
        <CanvasGrid id="st" step={gridPx} x={v.x} y={v.y} major={major} />
        {view && (
          <>
            {scene.blocks.flatMap((b, i) => b.items.map((item, j) => drawItem(item, `${i}-${j}`, b.shift)))}
            {nodesShown.map(({ n, at }) => {
              // the node the status line says can move
              const loose = status.kind === 'unstable' && status.node === n.id;
              return <circle key={n.id} data-node={readOnly ? undefined : n.id} cx={at.x} cy={at.y} r={loose ? 7 : selected.has(n.id) ? 6 : 4.5} className={`st-node ${selected.has(n.id) ? 'selected' : ''} ${style.view === 'joint' && style.joint === n.id ? 'joint' : ''} ${loose ? 'unstable' : ''}`} />;
            })}
            {handles.map((h) => {
              const p = S({ x: h.at.x * scale, y: h.at.y * scale });
              if (h.key.endsWith(':bend')) return <circle key={h.key} data-handle={h.key} className="ckt-handle" cx={p.x} cy={p.y} r={5}><title>Drag to bend the beam; back to the line straightens it</title></circle>;
              return <rect key={h.key} data-handle={h.key} className="ckt-handle" x={p.x - 4} y={p.y - 4} width={8} height={8} />;
            })}
            {ghost && (() => {
              const [a, b] = ghost.map((p) => S({ x: p.x * scale, y: p.y * scale }));
              return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`st-ghost ${tool === 'cut' ? 'cut' : ''}`} />;
            })()}
            {drag?.kind === 'marquee' && <rect className="ckt-marquee" x={Math.min(drag.start.x, drag.now.x)} y={Math.min(drag.start.y, drag.now.y)} width={Math.abs(drag.now.x - drag.start.x)} height={Math.abs(drag.now.y - drag.start.y)} />}
            {hover && tool !== 'select' && (() => {
              const p = S({ x: hover.x * scale, y: hover.y * scale });
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
        <div className={`ckt-status ${status.kind === 'unstable' || status.kind === 'error' ? 'error' : ''}`} role="status">
          {message}
        </div>
      )}
    </div>
  );
}

/** An item moved by its block's shift, for measuring. */
function shiftItem(item: Item, shift?: Pt): Item {
  if (!shift) return item;
  const move = (p: Pt) => ({ x: p.x + shift.x, y: p.y + shift.y });
  switch (item.t) {
    case 'line':
      return { ...item, pts: item.pts.map(move), ...(item.controls && { controls: [move(item.controls[0]), move(item.controls[1])] as [Pt, Pt] }) };
    case 'arc':
      return { ...item, c: move(item.c) };
    default:
      return { ...item, at: move(item.at) };
  }
}
