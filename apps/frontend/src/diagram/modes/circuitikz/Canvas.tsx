// The circuit canvas: parts drawn by the user's own circuitikz, wires that hold on to pins, junction dots,
// and snapping to the 0.25 cm grid and to nearby pins. Voltages, currents and labels are sketched here;
// the compiled preview shows them exactly.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import Icon from '../../../app/Icon';
import { useCanvasPrefs } from '../../FlowCanvas';
import { readStyle, symbolOptions } from './code';
import { copy, detach, flip, moveBy, newNodePart, newPathPart, paste, remove, rotate } from './edit';
import { PARTS, PT_PER_GRID, asCircuit, drawsSymbol,circuitBounds, isPart, isPoint, locator, newId, pathFrame, pinsOfElement, placeNodeOffset, placeholderShape, snapDelta, variantKey, wirePath } from './model';
import type { CircuitModel, Element, End, Mark, NodePart, PathPart, Pt, Route, ShapeOf, Wire } from './model';
import { setCtikz, setSelection, setShapeOf, setTool, tidy, useCircuitUi } from './store';
import { useSymbols } from './symbols';
import type { CircuitSymbol } from './symbols';

/** screen pixels per grid step at 100 % */
const STEP_PX = 10;
/** how near, in screen pixels, a pin pulls what you drag */
const SNAP_PX = 12;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

interface View {
  x: number;
  y: number;
  zoom: number;
}

type Drag =
  | { kind: 'pan'; start: Pt; view: View }
  | { kind: 'marquee'; start: Pt; now: Pt; keep: string[] }
  | { kind: 'move'; start: Pt; base: CircuitModel; ids: Set<string>; moving: Pt[]; fixed: Pt[] }
  /** one end of a path part (0 a, 1 b), or one point of a wire */
  | { kind: 'handle'; start: Pt; base: CircuitModel; id: string; index: number; from: Pt; fixed: Pt[] }
  | { kind: 'place'; base: CircuitModel; id: string; from: End; fixed: Pt[] };

/** clipboard for copy and paste, shared by every circuit in this window */
let clipboard: Element[] = [];

const plain = (text: string) => text.replace(/\$/g, '');
const autoRoute = (from: Pt, to: Pt): Route => (Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6 ? '--' : '-|');

export default function CircuitCanvas({ model: raw, onChange, style, readOnly }: { model: CircuitModel; onChange(m: CircuitModel): void; style: Record<string, unknown>; readOnly?: boolean }) {
  const model = asCircuit(raw);
  const { tool, selection: rawSelection } = useCircuitUi();
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<CircuitModel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** the wire being drawn: its points so far */
  const [wire, setWire] = useState<End[] | null>(null);
  /** where the pointer would put something now, snapped */
  const [hover, setHover] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);

  // the frame's light or dark canvas, which it sets on the stage around this (data-canvas)
  const prefs = useCanvasPrefs();
  const shown = draft || model;
  const ctikz = symbolOptions(readStyle(style));
  useEffect(() => setCtikz(ctikz), [ctikz]);
  const used = shown.elements.filter(isPart).map((el) => ({ type: el.type, options: el.options || [] }));
  const { symbol, loading, error } = useSymbols(ctikz, used);
  const symbolOf = (type: string, options: string[] = []): CircuitSymbol | undefined => symbol(variantKey(type, options));
  const shapeOf: ShapeOf = (type, options) => symbolOf(type, options)?.shape || placeholderShape(type);
  setShapeOf(shapeOf);
  const { pos, byId } = locator(shown, shapeOf);
  const selection = rawSelection.filter((id) => byId.has(id));
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
    const bounds = circuitBounds(shown, shapeOf);
    if (!bounds) {
      setView({ x: size.width / 2, y: size.height / 2, zoom: 1 });
      return;
    }
    const { minX, maxX, minY, maxY } = bounds;
    const zoom = Math.min(MAX_ZOOM / 2, Math.max(MIN_ZOOM, Math.min(size.width / ((maxX - minX) * STEP_PX), size.height / ((maxY - minY) * STEP_PX))));
    const k = STEP_PX * zoom;
    setView({ zoom, x: size.width / 2 - ((minX + maxX) / 2) * k, y: size.height / 2 + ((minY + maxY) / 2) * k });
  };

  useEffect(() => {
    // the first view, once the box has a size
    if (!view && size.width) fit();
  }, [size.width, size.height]);

  const v = view || { x: 0, y: 0, zoom: 1 };
  const k = STEP_PX * v.zoom;
  const kpt = k / PT_PER_GRID;
  const toScreen = (p: Pt) => ({ x: v.x + p.x * k, y: v.y - p.y * k });
  const toGrid = (s: Pt) => ({ x: (s.x - v.x) / k, y: (v.y - s.y) / k });

  const zoomAt = (factor: number, at: Pt = { x: size.width / 2, y: size.height / 2 }) =>
    setView((prev) => {
      const cur = prev || v;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.zoom * factor));
      const f = zoom / cur.zoom;
      return { zoom, x: at.x - (at.x - cur.x) * f, y: at.y - (at.y - cur.y) * f };
    });

  // trackpad scrolling pans and pinching (or ⌘/Ctrl + wheel) zooms; React's wheel listener can't preventDefault
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

  // ─── geometry helpers ───

  const commit = (next: CircuitModel) => {
    setDraft(null);
    onChange(tidy(next));
  };

  /** every pin with its owner, for snapping and attaching */
  const allPins = (m: CircuitModel, skip: (el: Element) => boolean = () => false) => {
    const { pos: at } = locator(m, shapeOf);
    return m.elements.flatMap((el) => (skip(el) ? [] : el.kind === 'wire' ? el.points.map((p) => at(p)) : pinsOfElement(el, shapeOf, at).map((p) => p.at)));
  };

  /** the pin of another part at a point, if there is one */
  const pinAt = (m: CircuitModel, at: Pt, nodesOnly: boolean, skip = ''): End => {
    const { pos: where } = locator(m, shapeOf);
    for (const el of m.elements) {
      if (el.id === skip || el.kind === 'wire' || (nodesOnly && el.kind !== 'node')) continue;
      const hit = pinsOfElement(el, shapeOf, where).find((p) => Math.abs(p.at.x - at.x) < 1e-3 && Math.abs(p.at.y - at.y) < 1e-3);
      if (hit) return { part: el.id, pin: hit.pin };
    }
    return at;
  };

  const snapPoint = (raw: Pt, fixed: Pt[]) => {
    const d = snapDelta([raw], { x: 0, y: 0 }, fixed, SNAP_PX / k);
    return { x: raw.x + d.x, y: raw.y + d.y };
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ─── pointer ───

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    boxRef.current?.focus();
    const at = local(e);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer tracks: the drag still works while it stays over the canvas
    }
    if (e.button === 1 || space || readOnly) {
      setDrag({ kind: 'pan', start: at, view: v });
      return;
    }
    if (e.button !== 0) return;
    const grid = toGrid(at);
    const target = (e.target as globalThis.Element).closest('[data-id], [data-handle]') as HTMLElement | SVGElement | null;

    if (tool === 'wire') {
      const point = snapPoint(grid, allPins(model));
      const end = pinAt(model, point, false);
      if (!wire) {
        setWire([end]);
        return;
      }
      const last = pos(wire[wire.length - 1]);
      const done = Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6;
      const points = done ? wire : [...wire, end];
      if (done || (!isPoint(end) && points.length > 1)) finishWire(points);
      else setWire(points);
      return;
    }

    if (tool.startsWith('part:')) {
      const type = tool.slice(5);
      const part = PARTS.get(type);
      if (!part) return;
      const fixed = allPins(model);
      if (part.kind === 'node') {
        const placed = newNodePart(model, type, grid);
        const offsets = Object.values(shapeOf(type, []).pins);
        const moving = (offsets.length ? offsets : [{ x: 0, y: 0 }]).map((o) => ({ x: grid.x + o.x, y: grid.y + o.y }));
        const d = snapDelta(moving, { x: 0, y: 0 }, fixed, SNAP_PX / k);
        const next = { ...model, elements: [...model.elements, { ...placed, at: { x: grid.x + d.x, y: grid.y + d.y } }] };
        commit(next);
        setSelection([placed.id]);
        return;
      }
      const from = pinAt(model, snapPoint(grid, fixed), true);
      const placed = newPathPart(model, type, from, pos(from));
      const base = { ...model, elements: [...model.elements, placed] };
      setDraft(base);
      setDrag({ kind: 'place', base, id: placed.id, from, fixed });
      return;
    }

    const handle = target?.dataset.handle;
    if (handle) {
      const [id, index] = handle.split(':');
      const el = byId.get(id);
      if (!el) return;
      const loose = detach(model, new Set([id]), shapeOf);
      const looseEl = loose.elements.find((x) => x.id === id)!;
      const point = looseEl.kind === 'path' ? (index === '0' ? looseEl.a : looseEl.b) : looseEl.kind === 'wire' ? looseEl.points[Number(index)] : null;
      if (!point || !isPoint(point)) return;
      setDrag({ kind: 'handle', start: at, base: loose, id, index: Number(index), from: point, fixed: allPins(model, (x) => x.id === id) });
      return;
    }

    const id = target?.dataset.id;
    if (id) {
      const ids = e.shiftKey ? (selected.has(id) ? selection.filter((s) => s !== id) : [...selection, id]) : selected.has(id) ? selection : [id];
      setSelection(ids);
      if (!ids.includes(id)) return;
      const moved = new Set(ids);
      const loose = detach(model, moved, shapeOf);
      const { pos: at0 } = locator(loose, shapeOf);
      const moving = loose.elements
        .filter((el) => moved.has(el.id))
        .flatMap((el) => (el.kind === 'wire' ? el.points.map((p) => at0(p)) : pinsOfElement(el, shapeOf, at0).map((p) => p.at).concat(el.kind === 'node' && !PARTS.get(el.type)?.pins?.length ? [el.at] : [])));
      setDrag({ kind: 'move', start: at, base: loose, ids: moved, moving, fixed: allPins(loose, (el) => moved.has(el.id)) });
      return;
    }

    setDrag({ kind: 'marquee', start: at, now: at, keep: e.shiftKey ? selection : [] });
    if (!e.shiftKey) setSelection([]);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!view) return;
    const at = local(e);
    const grid = toGrid(at);
    if (!drag) {
      if (tool === 'wire' || tool.startsWith('part:')) setHover(snapPoint(grid, allPins(model)));
      else if (hover) setHover(null);
      return;
    }
    if (drag.kind === 'pan') {
      setView({ ...drag.view, x: drag.view.x + at.x - drag.start.x, y: drag.view.y + at.y - drag.start.y });
    } else if (drag.kind === 'marquee') {
      setDrag({ ...drag, now: at });
    } else if (drag.kind === 'move') {
      const raw = { x: (at.x - drag.start.x) / k, y: -(at.y - drag.start.y) / k };
      setDraft(moveBy(drag.base, drag.ids, snapDelta(drag.moving, raw, drag.fixed, SNAP_PX / k)));
    } else if (drag.kind === 'handle') {
      const raw = { x: drag.from.x + (at.x - drag.start.x) / k, y: drag.from.y - (at.y - drag.start.y) / k };
      const point = snapPoint(raw, drag.fixed);
      setDraft({
        ...drag.base,
        elements: drag.base.elements.map((el) => {
          if (el.id !== drag.id) return el;
          if (el.kind === 'path') return drag.index === 0 ? { ...el, a: point } : { ...el, b: point };
          if (el.kind === 'wire') return { ...el, points: el.points.map((p, i) => (i === drag.index ? point : p)) };
          return el;
        })
      });
    } else if (drag.kind === 'place') {
      const point = snapPoint(grid, drag.fixed);
      setDraft({ ...drag.base, elements: drag.base.elements.map((el) => (el.id === drag.id && el.kind === 'path' ? { ...el, b: point } : el)) });
    }
  };

  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === 'marquee') {
      const [a, b] = [toGrid(d.start), toGrid(d.now)];
      const [minX, maxX, minY, maxY] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
      const inside = (p: Pt) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      const hits = model.elements.filter((el) => (el.kind === 'node' ? inside(el.at) : el.kind === 'path' ? inside(pos(el.a)) && inside(pos(el.b)) : el.points.every((p) => inside(pos(p)))));
      if (Math.hypot(d.now.x - d.start.x, d.now.y - d.start.y) > 3) setSelection([...new Set([...d.keep, ...hits.map((el) => el.id)])]);
      return;
    }
    if (d.kind === 'pan' || !draft) {
      setDraft(null);
      return;
    }
    if (d.kind === 'move') {
      const unmoved = JSON.stringify(draft.elements) === JSON.stringify(d.base.elements);
      if (unmoved) setDraft(null);
      else commit(draft);
      return;
    }
    const id = d.id;
    let next = draft;
    const el = next.elements.find((x) => x.id === id);
    if (d.kind === 'place' && el?.kind === 'path') {
      const a = pos(el.a);
      const b = pos(el.b);
      // a click without a drag puts a 2 cm part across
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1) next = { ...next, elements: next.elements.map((x) => (x.id === id && x.kind === 'path' ? { ...x, b: { x: a.x + 8, y: a.y } } : x)) };
      setSelection([id]);
    }
    const placed = next.elements.find((x) => x.id === id);
    if (placed?.kind === 'path' && Math.hypot(pos(placed.a).x - pos(placed.b).x, pos(placed.a).y - pos(placed.b).y) < 1e-6) {
      setDraft(null);
      return;
    }
    commit(next);
  };

  const finishWire = (points: End[]) => {
    setWire(null);
    const resolved = points.map((p) => pos(p));
    if (points.length < 2) return;
    const added: Wire = { id: newId(model), kind: 'wire', points, routes: resolved.slice(1).map((p, i) => autoRoute(resolved[i], p)) };
    commit({ ...model, elements: [...model.elements, added] });
  };

  // another tool picked mid-wire keeps the wire drawn so far
  useEffect(() => {
    if (tool !== 'wire' && wire) finishWire(wire);
  }, [tool]);

  // ─── keys ───

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (readOnly || (e.target as HTMLElement).closest('input, textarea, select, button, a')) return;
    const mod = e.metaKey || e.ctrlKey;
    const ids = new Set(selection);
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === ' ') {
      setSpace(true);
      handled();
    } else if (e.key === 'Escape') {
      if (wire) finishWire(wire);
      else if (tool !== 'select') setTool('select');
      else setSelection([]);
      handled();
    } else if (e.key === 'Enter' && wire) {
      finishWire(wire);
      handled();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && ids.size) {
      commit(remove(model, ids, shapeOf));
      setSelection([]);
      handled();
    } else if (mod && e.key.toLowerCase() === 'a') {
      setSelection(model.elements.map((el) => el.id));
      handled();
    } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && ids.size) {
      clipboard = copy(model, ids, shapeOf);
      if (e.key.toLowerCase() === 'x') {
        commit(remove(model, ids, shapeOf));
        setSelection([]);
      }
      handled();
    } else if (mod && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'd')) {
      const items = e.key.toLowerCase() === 'd' ? copy(model, ids, shapeOf) : clipboard;
      if (!items.length) return;
      const pasted = paste(model, items, { x: 2, y: -2 });
      commit(pasted.model);
      setSelection(pasted.ids);
      handled();
    } else if (!mod && e.key.toLowerCase() === 'r' && ids.size) {
      commit(rotate(model, ids, e.shiftKey ? 45 : 90, shapeOf));
      handled();
    } else if (!mod && (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'y') && ids.size) {
      commit(flip(model, ids, e.key.toLowerCase() as 'x' | 'y'));
      handled();
    } else if (!mod && e.key.startsWith('Arrow') && ids.size) {
      const step = e.shiftKey ? 4 : 1;
      const delta = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }[e.key];
      if (delta) commit(moveBy(detach(model, ids, shapeOf), ids, delta));
      handled();
    }
  };

  // ─── drawing ───

  const line = (p: Pt, q: Pt, extra: Record<string, unknown> = {}) => {
    const [s, t] = [toScreen(p), toScreen(q)];
    return <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} {...extra} />;
  };
  const poly = (points: Pt[]) => points.map((p) => toScreen(p)).map((p) => `${p.x},${p.y}`).join(' ');
  const fontSize = Math.max(9, k * 1.1);

  const text = (at: Pt, content: string, className = 'ckt-text') => {
    const s = toScreen(at);
    return (
      <text x={s.x} y={s.y} className={className} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle">
        {content}
      </text>
    );
  };

  /** a voltage, current or flow sketched beside a path part */
  const markSketch = (m: Mark | undefined, kind: 'v' | 'i' | 'f', f: ReturnType<typeof pathFrame>, glyph: number) => {
    if (!m?.text.trim()) return null;
    const n = { x: -f.u.y, y: f.u.x };
    const side = m.side === '^' ? 1 : m.side === '_' ? -1 : kind === 'v' ? -1 : 1;
    const way = m.dir === '<' ? -1 : 1;
    const off = (p: Pt, d: number) => ({ x: p.x + n.x * d * side, y: p.y + n.y * d * side });
    const along = (d: number) => ({ x: f.mid.x + f.u.x * d, y: f.mid.y + f.u.y * d });
    if (kind !== 'i') {
      const half = Math.max(glyph / 2, 1.5);
      const gap = kind === 'v' ? 3 : 2.2;
      const from = off(along(-half * way), gap);
      const to = off(along(half * way), gap);
      return (
        <g className="ckt-sketch">
          {line(from, to, { markerEnd: 'url(#ckt-arrow)' })}
          {text(off(f.mid, gap + 0.9), plain(m.text), 'ckt-text ckt-sketch-text')}
        </g>
      );
    }
    const at = along(Math.min(f.length / 2 - 0.5, glyph / 2 + 1.2));
    const tip = { x: at.x + f.u.x * 0.6 * way, y: at.y + f.u.y * 0.6 * way };
    const back = { x: at.x - f.u.x * 0.6 * way, y: at.y - f.u.y * 0.6 * way };
    return (
      <g className="ckt-sketch">
        <polygon points={poly([tip, { x: back.x + n.x * 0.45, y: back.y + n.y * 0.45 }, { x: back.x - n.x * 0.45, y: back.y - n.y * 0.45 }])} />
        {text(off(at, 1.5), plain(m.text), 'ckt-text ckt-sketch-text')}
      </g>
    );
  };

  const drawPath = (el: PathPart, ghost = false) => {
    const a = pos(el.a);
    const b = pos(el.b);
    const f = pathFrame(a, b);
    const sym = symbolOf(el.type, el.options);
    const s = el.size || 1;
    const glyph = (sym?.shape.length ?? placeholderShape(el.type).length ?? 4) * s;
    const angle = (Math.atan2(f.u.y, f.u.x) * 180) / Math.PI;
    const m = toScreen(f.mid);
    const n = { x: -f.u.y, y: f.u.x };
    const labelSide = el.label?.side === '_' ? -1 : 1;
    const besides = (side: number) => ({ x: f.mid.x + n.x * 1.9 * side, y: f.mid.y + n.y * 1.9 * side });
    const halfSpanPt = ((f.length / 2) * PT_PER_GRID) / s;
    const [start, end] = [
      { x: f.mid.x - (f.u.x * glyph) / 2, y: f.mid.y - (f.u.y * glyph) / 2 },
      { x: f.mid.x + (f.u.x * glyph) / 2, y: f.mid.y + (f.u.y * glyph) / 2 }
    ];
    const [poleA, poleB] = el.poles || ['', ''];
    return (
      <g key={el.id} data-id={ghost ? undefined : el.id} className={`ckt-part ${ghost ? 'ghost' : ''} ${selected.has(el.id) ? 'selected' : ''}`}>
        {selected.has(el.id) && line(a, b, { className: 'ckt-halo' })}
        {line(a, b, { className: 'ckt-hit' })}
        {f.length > glyph && (
          <>
            {line(a, start, { className: 'ckt-wire' })}
            {line(end, b, { className: 'ckt-wire' })}
          </>
        )}
        {sym ? (
          <g clipPath={`url(#ckt-clip-${el.id})`} transform={`translate(${m.x},${m.y}) scale(${kpt * s}) rotate(${-angle}) scale(${el.invert ? -1 : 1},${el.mirror ? -1 : 1})`}>
            <clipPath id={`ckt-clip-${el.id}`}>
              <rect x={-halfSpanPt} y={-1e4} width={2 * halfSpanPt} height={2e4} />
            </clipPath>
            <image className="ckt-glyph" href={sym.image} x={-(sym.origin.x + sym.middle.x)} y={-(sym.origin.y - sym.middle.y)} width={sym.width} height={sym.height} />
          </g>
        ) : (
          <polygon className="ckt-outline" points={poly([start, end].flatMap((p, i) => (i ? [{ x: p.x + n.x * 0.8, y: p.y + n.y * 0.8 }, { x: p.x - n.x * 0.8, y: p.y - n.y * 0.8 }] : [{ x: p.x - n.x * 0.8, y: p.y - n.y * 0.8 }, { x: p.x + n.x * 0.8, y: p.y + n.y * 0.8 }])))} />
        )}
        {el.label?.text.trim() && text(besides(labelSide), plain(el.label.text))}
        {el.value?.trim() && text(besides(-labelSide), plain(el.value))}
        {markSketch(el.voltage, 'v', f, glyph)}
        {markSketch(el.current, 'i', f, glyph)}
        {markSketch(el.flow, 'f', f, glyph)}
        {PARTS.get(el.type)?.text && el.text?.trim() && text(f.mid, plain(el.text))}
        {[poleA, poleB].map((pole, i) =>
          pole ? <circle key={i} className={`ckt-pole ${pole === 'o' ? 'open' : ''}`} cx={toScreen(i ? b : a).x} cy={toScreen(i ? b : a).y} r={Math.max(2.5, k * 0.22)} /> : null
        )}
      </g>
    );
  };

  const drawNode = (el: NodePart, ghost = false) => {
    const sym = symbolOf(el.type, el.options);
    const p = toScreen(el.at);
    const content = PARTS.get(el.type)?.text ? plain(el.text || '') : '';
    if (!drawsSymbol(el.type)) {
      // Text: its words, or a box to find it by while it has none
      const half = Math.max(1.5, content.length * 0.45);
      return (
        <g key={el.id} data-id={ghost ? undefined : el.id} className={`ckt-part ${ghost ? 'ghost' : ''} ${selected.has(el.id) ? 'selected' : ''}`}>
          <rect className={selected.has(el.id) ? 'ckt-halo-box' : content ? 'ckt-hit-box' : 'ckt-outline'} x={p.x - half * k} y={p.y - 1.2 * k} width={2 * half * k} height={2.4 * k} />
          {text(el.at, content || 'Text', content ? 'ckt-text' : 'ckt-text ckt-sketch-text')}
        </g>
      );
    }
    const rotation = el.rotate || 0;
    const turn = `rotate(${-rotation}) scale(${el.flipX ? -1 : 1},${el.flipY ? -1 : 1})`;
    const pins = Object.values(placeholderShape(el.type).pins);
    const box = pins.length
      ? { minX: Math.min(...pins.map((q) => q.x)) + 0.5, maxX: Math.max(...pins.map((q) => q.x)) - 0.5, minY: Math.min(...pins.map((q) => q.y)) - 1.5, maxY: Math.max(...pins.map((q) => q.y)) + 1.5 }
      : { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 };
    const top = sym ? { x: 0, y: (sym.origin.y / PT_PER_GRID) + 0.8 } : { x: 0, y: box.maxY + 0.8 };
    const nameAt = placeNodeOffset(el, top);
    return (
      <g key={el.id} data-id={ghost ? undefined : el.id} className={`ckt-part ${ghost ? 'ghost' : ''} ${selected.has(el.id) ? 'selected' : ''}`}>
        {sym ? (
          <g transform={`translate(${p.x},${p.y}) scale(${kpt}) ${turn}`}>
            <rect className={selected.has(el.id) ? 'ckt-halo-box' : 'ckt-hit-box'} x={-sym.origin.x} y={-sym.origin.y} width={sym.width} height={sym.height} />
            <image className="ckt-glyph" href={sym.image} x={-sym.origin.x} y={-sym.origin.y} width={sym.width} height={sym.height} />
          </g>
        ) : (
          <g transform={`translate(${p.x},${p.y}) scale(${k},${-k}) rotate(${rotation}) scale(${el.flipX ? -1 : 1},${el.flipY ? -1 : 1})`}>
            <rect className={`ckt-outline ${selected.has(el.id) ? 'ckt-halo-box' : ''}`} x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {content.trim() && text(el.at, content)}
        {el.name && !ghost && text({ x: el.at.x + nameAt.x, y: el.at.y + nameAt.y }, el.name, 'ckt-text ckt-name')}
      </g>
    );
  };

  const drawWire = (el: Wire) => {
    const path = wirePath(el.points.map((p) => pos(p)), el.routes);
    const points = poly(path);
    return (
      <g key={el.id} data-id={el.id} className={`ckt-part ${selected.has(el.id) ? 'selected' : ''}`}>
        {selected.has(el.id) && <polyline className="ckt-halo" points={points} />}
        <polyline className="ckt-hit" points={points} />
        <polyline
          className="ckt-wire"
          points={points}
          markerEnd={el.arrows === '->' || el.arrows === '<->' ? 'url(#ckt-arrow)' : undefined}
          markerStart={el.arrows === '<-' || el.arrows === '<->' ? 'url(#ckt-arrow)' : undefined}
        />
      </g>
    );
  };

  // ghost of the part about to be placed
  const ghostPart = (() => {
    if (drag || !hover || !tool.startsWith('part:')) return null;
    const type = tool.slice(5);
    const part = PARTS.get(type);
    if (!part) return null;
    if (part.kind === 'path') return drawPath({ id: 'ghost', kind: 'path', type, a: hover, b: { x: hover.x + 8, y: hover.y } }, true);
    return drawNode({ id: 'ghost', kind: 'node', type, at: hover }, true);
  })();

  const showPins = tool !== 'select' || drag?.kind === 'move' || drag?.kind === 'handle';
  const pinDots = shown.elements
    .filter((el) => isPart(el) && (showPins || selected.has(el.id)))
    .flatMap((el) => pinsOfElement(el, shapeOf, pos).map((p) => ({ key: `${el.id}:${p.pin}`, at: toScreen(p.at) })));

  const handles = selection.flatMap((id) => {
    const el = byId.get(id);
    if (!el || readOnly) return [];
    if (el.kind === 'path') return [el.a, el.b].map((end, i) => ({ key: `${id}:${i}`, at: toScreen(pos(end)) }));
    if (el.kind === 'wire') return el.points.map((p, i) => ({ key: `${id}:${i}`, at: toScreen(pos(p)) }));
    return [];
  });

  const dot = Math.max(2.5, k * 0.22);
  const gridStep = k < 6 ? 4 : 1;
  const wirePreview = wire && hover ? [...wire.map((p) => pos(p)), hover] : null;
  const cursor = space || drag?.kind === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const bounds = circuitBounds(shown, shapeOf);
  const viewport = { x: -v.x / k, y: -v.y / k, width: size.width / k, height: size.height / k };
  const overview = {
    minX: Math.min(bounds?.minX ?? viewport.x, viewport.x),
    maxX: Math.max(bounds?.maxX ?? viewport.x + viewport.width, viewport.x + viewport.width),
    minY: Math.min(bounds ? -bounds.maxY : viewport.y, viewport.y),
    maxY: Math.max(bounds ? -bounds.minY : viewport.y + viewport.height, viewport.y + viewport.height)
  };

  return (
    <div
      ref={boxRef}
      className="ckt-canvas"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && setSpace(false)}
      onBlur={() => setSpace(false)}
      aria-label="Circuit canvas"
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !drag && setHover(null)}
        onDoubleClick={() => wire && finishWire(wire)}
      >
        <defs>
          <pattern id="ckt-dots" width={k * gridStep} height={k * gridStep} patternUnits="userSpaceOnUse" x={v.x} y={v.y}>
            <circle cx={0.75} cy={0.75} r={0.75} className="ckt-dot" />
          </pattern>
          <marker id="ckt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ckt-arrowhead" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#ckt-dots)" />
        {view && (
          <>
            {shown.elements.filter((el): el is Wire => el.kind === 'wire').map(drawWire)}
            {shown.elements.filter((el): el is PathPart => el.kind === 'path').map((el) => drawPath(el))}
            {shown.elements.filter((el): el is NodePart => el.kind === 'node').map((el) => drawNode(el))}
            {(draft ? [] : shown.junctions).map((j, i) => {
              const s = toScreen(pos(j));
              return <circle key={i} className="ckt-junction" cx={s.x} cy={s.y} r={dot} />;
            })}
            {ghostPart}
            {wirePreview && <polyline className="ckt-wire ckt-draft" points={poly(wirePath(wirePreview, wirePreview.slice(1).map((p, i) => autoRoute(wirePreview[i], p))))} />}
            {pinDots.map((p) => <circle key={p.key} className="ckt-pin" cx={p.at.x} cy={p.at.y} r={3} />)}
            {handles.map((h) => <rect key={h.key} data-handle={h.key} className="ckt-handle" x={h.at.x - 4} y={h.at.y - 4} width={8} height={8} />)}
            {hover && tool !== 'select' && <circle className="ckt-target" cx={toScreen(hover).x} cy={toScreen(hover).y} r={5} />}
            {drag?.kind === 'marquee' && (
              <rect className="ckt-marquee" x={Math.min(drag.start.x, drag.now.x)} y={Math.min(drag.start.y, drag.now.y)} width={Math.abs(drag.now.x - drag.start.x)} height={Math.abs(drag.now.y - drag.start.y)} />
            )}
          </>
        )}
      </svg>
      {prefs.minimap && view && size.width > 0 && size.height > 0 && (
        <button
          type="button"
          className="ckt-minimap"
          aria-label="Circuit overview; click to move the view"
          title="Click to centre the view here"
          onClick={(e) => {
            const svg = e.currentTarget.querySelector('svg');
            const matrix = svg?.getScreenCTM();
            if (!svg || !matrix || !e.detail) { fit(); return; }
            const point = svg.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const at = point.matrixTransform(matrix.inverse());
            setView({ ...v, x: size.width / 2 - at.x * k, y: size.height / 2 - at.y * k });
          }}
        >
          <svg viewBox={`${overview.minX} ${overview.minY} ${overview.maxX - overview.minX} ${overview.maxY - overview.minY}`} aria-hidden="true">
            {shown.elements.map((el) => {
              if (el.kind === 'node') return <rect key={el.id} x={el.at.x - 2} y={-el.at.y - 2} width={4} height={4} className="ckt-minimap-part" />;
              const path = el.kind === 'path' ? [pos(el.a), pos(el.b)] : wirePath(el.points.map((p) => pos(p)), el.routes);
              return <polyline key={el.id} points={path.map((p) => `${p.x},${-p.y}`).join(' ')} className="ckt-minimap-wire" />;
            })}
            <rect {...viewport} className="ckt-minimap-view" />
          </svg>
        </button>
      )}
      <div className="ckt-zoom">
        <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
          <Icon name="minus.magnifyingglass" />
        </button>
        <span className="ckt-zoom-level">{Math.round(v.zoom * 100)}%</span>
        <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(1.25)}>
          <Icon name="plus.magnifyingglass" />
        </button>
        <button type="button" className="icon-btn" aria-label="Fit the circuit in view" title="Fit the circuit in view" onClick={fit}>
          <Icon name="arrow.up.left.and.arrow.down.right" />
        </button>
        {prefs.onPrefs && (
          <button
            type="button"
            className={`icon-btn${prefs.minimap ? ' active' : ''}`}
            aria-label="Minimap"
            aria-pressed={prefs.minimap}
            title={prefs.minimap ? 'Hide the minimap' : 'Show the minimap'}
            onClick={() => prefs.onPrefs?.({ minimap: !prefs.minimap, dark: prefs.dark })}
          >
            <Icon name="square.grid.2x2" />
          </button>
        )}
        {prefs.onPrefs && (
          <button
            type="button"
            className="icon-btn"
            aria-label={prefs.dark ? 'Light canvas' : 'Dark canvas'}
            title={prefs.dark ? 'Light canvas' : 'Dark canvas'}
            onClick={() => prefs.onPrefs?.({ minimap: prefs.minimap, dark: !prefs.dark })}
          >
            <Icon name={prefs.dark ? 'sun.max' : 'moon'} />
          </button>
        )}
      </div>
      {(loading || error) && (
        <div className={`ckt-status ${error ? 'error' : ''}`} role="status">
          {error ? `Symbols couldn’t be drawn (${error}), so parts show as outlines. The preview still compiles them.` : 'Drawing the symbols with your circuitikz…'}
        </div>
      )}
    </div>
  );
}
