// The circuit canvas: parts drawn by the user's own circuitikz, wires that hold on to pins, junction dots,
// and snapping to the 0.25 cm grid and to nearby pins. Voltages, currents and labels are sketched here;
// the compiled preview shows them exactly.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import Icon from '../../../app/Icon';
import { loadSettings, useSettings } from '../../../app/settings';
import { matchesShortcut, shortcutKey } from '../../../app/shortcuts';
import { useCanvasPrefs } from '../../FlowCanvas';
import { colourCss } from '../shared';
import { FONT_SCALE, HEAD_CM, ROUNDED_CM, box, loopLine, presetElements } from './annotate';
import type { Preset } from './annotate';
import { readStyle, symbolOptions } from './code';
import { copy, detach, flip, moveBy, newNodePart, newPathPart, paste, remove, rotate } from './edit';
import { GRID_CM, PARTS, PT_PER_GRID, asCircuit, drawsSymbol,circuitBounds, isPart, isPoint, locator, newId, pathFrame, pinAxis, pinsOfElement, placeholderShape, snapDelta, variantKey, wirePath } from './model';
import type { Annotation, CircuitModel, Element, End, Mark, NodePart, PathPart, Pt, Route, ShapeOf, SnapPin, Wire } from './model';
import { labelSize, nodeNameAt, pathLabelAt, pinLabelSpots, plain, plusAtStart, scriptRuns } from './labels';
import { setCtikz, setSelection, setShapeOf, setTool, setVoltageDir, tidy, useCircuitUi } from './store';
import { symbolOutline } from './symbolGeometry';
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
  | { kind: 'move'; start: Pt; base: CircuitModel; ids: Set<string>; moving: SnapPin[]; fixed: Pt[] }
  /** one end of a path part (0 a, 1 b), or one point of a wire */
  | { kind: 'handle'; start: Pt; base: CircuitModel; id: string; index: number; from: Pt; fixed: Pt[] }
  | { kind: 'place'; base: CircuitModel; id: string; from: End; fixed: Pt[] }
  /** a rectangle or ellipse being drawn from one corner to the other */
  | { kind: 'box'; base: CircuitModel; id: string; fixed: Pt[] };

/** clipboard for copy and paste, shared by every circuit in this window */
let clipboard: Element[] = [];

/** circuitikz's open: nothing drawn between its ends but what's marked on it */
const isOpen = (type: string) => PARTS.get(type)?.tikz === 'open';
/** where a path part placed with a click, no drag, ends */
const clickEnd = (type: string, a: Pt): Pt => (isOpen(type) ? { x: a.x, y: a.y - 8 } : { x: a.x + 8, y: a.y });

const autoRoute = (from: Pt, to: Pt): Route => (Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6 ? '--' : '-|');

/** an annotation's line widths on screen at 100 %, as the wires' 1.4 px stands for circuitikz's thin */
const ANNOTATION_PX = { thin: 1.4, semithick: 1.9, thick: 2.4, 'very thick': 3.4 };
/** TikZ's line width, in PDF points, that circuitikz draws wires and the symbols' leads with */
const LINE_PT = 0.4;
/** TikZ's to path with a bend: its two control points, at 0.3915 of the length along the out and in angles */
function bendControls(p: Pt, q: Pt, bend: number): [Pt, Pt] {
  const d = Math.hypot(q.x - p.x, q.y - p.y) * 0.3915;
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  const out = a + (bend * Math.PI) / 180;
  const into = a + Math.PI - (bend * Math.PI) / 180;
  return [{ x: p.x + d * Math.cos(out), y: p.y + d * Math.sin(out) }, { x: q.x + d * Math.cos(into), y: q.y + d * Math.sin(into) }];
}

export default function CircuitCanvas({ model: raw, onChange, style, readOnly }: { model: CircuitModel; onChange(m: CircuitModel): void; style: Record<string, unknown>; readOnly?: boolean }) {
  const model = asCircuit(raw);
  const { tool, selection: rawSelection } = useCircuitUi();
  const [settings] = useSettings();
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<CircuitModel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** the wire, or an annotation's line, being drawn: its points so far */
  const [wire, setWire] = useState<End[] | null>(null);
  /** the points being drawn are an annotation's line, not a wire */
  const drawingLine = useRef(false);
  /** where the pointer would put something now, snapped */
  const [hover, setHover] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);

  // the frame's light or dark canvas, which it sets on the stage around this (data-canvas)
  const prefs = useCanvasPrefs();
  const shown = draft || model;
  const circuitStyle = readStyle(style);
  const ctikz = symbolOptions(circuitStyle);
  useEffect(() => setCtikz(ctikz), [ctikz]);
  useEffect(() => setVoltageDir(circuitStyle.voltageDir), [circuitStyle.voltageDir]);
  /** voltages drawn as + and −, not an arrow */
  const signs = (circuitStyle.voltages || circuitStyle.preset) === 'american' || circuitStyle.voltages === 'raised';
  const used = shown.elements.filter(isPart).map((el) => ({ type: el.type, options: el.options || [] }));
  const { symbol, image, loading, error } = useSymbols(ctikz, used);
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
  // wires as wide as the symbols' leads once those are wider than 1.4 px, so a zoomed-in symbol doesn't outweigh them
  const linePx = Math.max(ANNOTATION_PX.thin, LINE_PT * kpt);
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

    if (tool === 'wire' || tool === 'annotate:line') {
      const line = tool === 'annotate:line';
      const point = snapPoint(grid, allPins(model));
      // a line snaps to pins but never holds one
      const end = line ? point : pinAt(model, point, false);
      if (!wire) {
        drawingLine.current = line;
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

    if (tool === 'annotate:rect' || tool === 'annotate:ellipse' || tool === 'annotate:cross' || tool.startsWith('preset:')) {
      const fixed = allPins(model);
      const point = snapPoint(grid, fixed);
      if (tool === 'annotate:cross' || tool.startsWith('preset:')) {
        const added: Element[] = tool.startsWith('preset:') ? presetElements(model, tool.slice(7) as Preset, point) : [{ id: newId(model), kind: 'annotation', shape: 'cross', points: [point], width: 'thick' }];
        commit({ ...model, elements: [...model.elements, ...added] });
        setSelection(added.map((el) => el.id));
        return;
      }
      const added: Annotation = { id: newId(model), kind: 'annotation', shape: tool === 'annotate:rect' ? 'rect' : 'ellipse', points: [point, point] };
      const base = { ...model, elements: [...model.elements, added] };
      setDraft(base);
      setDrag({ kind: 'box', base, id: added.id, fixed });
      return;
    }

    if (tool.startsWith('part:')) {
      const type = tool.slice(5);
      const part = PARTS.get(type);
      if (!part) return;
      const fixed = allPins(model);
      if (part.kind === 'node') {
        const placed = newNodePart(model, type, grid);
        const offsets = Object.entries(shapeOf(type, []).pins);
        const moving = offsets.length ? offsets.map(([pin, o]) => ({ x: grid.x + o.x, y: grid.y + o.y, axis: pinAxis(placed, pin) })) : [grid];
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
      const point = looseEl.kind === 'path' ? (index === '0' ? looseEl.a : looseEl.b) : looseEl.kind === 'wire' || looseEl.kind === 'annotation' ? looseEl.points[Number(index)] : null;
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
        .flatMap((el) => (el.kind === 'wire' || el.kind === 'annotation' ? el.points.map((p) => at0(p)) : pinsOfElement(el, shapeOf, at0).map((p): SnapPin => ({ ...p.at, axis: p.axis })).concat(el.kind === 'node' && !PARTS.get(el.type)?.pins?.length ? [el.at] : [])));
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
      if (tool !== 'select') setHover(snapPoint(grid, allPins(model)));
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
          if (el.kind === 'annotation') return { ...el, points: el.points.map((p, i) => (i === drag.index ? point : p)) };
          return el;
        })
      });
    } else if (drag.kind === 'box') {
      const point = snapPoint(grid, drag.fixed);
      setDraft({ ...drag.base, elements: drag.base.elements.map((el) => (el.id === drag.id && el.kind === 'annotation' ? { ...el, points: [el.points[0], point] } : el)) });
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
    if (d.kind === 'box') {
      // a click without a drag draws one 2 cm across and 1.5 cm high
      const el = (draft || d.base).elements.find((x) => x.id === d.id) as Annotation;
      const [p, q] = el.points;
      const sized = Math.abs(q.x - p.x) < 1 || Math.abs(q.y - p.y) < 1 ? { ...el, points: [{ x: p.x - 4, y: p.y + 3 }, { x: p.x + 4, y: p.y - 3 }] } : el;
      commit({ ...d.base, elements: d.base.elements.map((x) => (x.id === d.id ? sized : x)) });
      setSelection([d.id]);
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
      // a click without a drag puts a 2 cm part across, or a voltage between two points down, + at the top
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1) next = { ...next, elements: next.elements.map((x) => (x.id === id && x.kind === 'path' ? { ...x, b: clickEnd(x.type, a) } : x)) };
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
    if (drawingLine.current) {
      const line: Annotation = { id: newId(model), kind: 'annotation', shape: 'line', points: resolved, arrows: '->' };
      commit({ ...model, elements: [...model.elements, line] });
      setSelection([line.id]);
      return;
    }
    const added: Wire = { id: newId(model), kind: 'wire', points, routes: resolved.slice(1).map((p, i) => autoRoute(resolved[i], p)) };
    commit({ ...model, elements: [...model.elements, added] });
  };

  // another tool picked mid-wire keeps the wire (or line) drawn so far
  useEffect(() => {
    if (tool !== (drawingLine.current ? 'annotate:line' : 'wire') && wire) finishWire(wire);
  }, [tool]);

  // ─── keys ───

  // the wire shortcut (W unless changed in Settings › Shortcuts), only while the pointer is over the drawing and
  // nothing is being typed, so the key still types everywhere else
  const hovered = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly || !hovered.current || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
      if (!matchesShortcut(shortcutKey(loadSettings().shortcuts, 'diagramWire'), e)) return;
      e.preventDefault();
      setTool('wire');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly]);

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
  /** a colour as the canvas shows it; black, or none, is the canvas's ink, so it reads on a dark canvas too */
  const ink = (colour?: string) => (colour && colour !== 'black' ? colourCss(colour) : undefined);

  /** TeX sketched as text, its subscripts and superscripts set as the preview sets them */
  const text = (at: Pt, tex: string, className = 'ckt-text', size = fontSize, style?: Record<string, string | number | undefined>) => {
    const s = toScreen(at);
    return (
      <text x={s.x} y={s.y} className={className} fontSize={size} textAnchor="middle" dominantBaseline="middle" style={style}>
        {scriptRuns(tex).map((run, i) =>
          run.shift ? (
            <tspan key={i} baselineShift={run.shift} fontSize="70%">
              {run.text}
            </tspan>
          ) : (
            run.text
          )
        )}
      </text>
    );
  };
  /** a label's size in grid steps, as text() draws it */
  const sizeOf = (tex: string) => labelSize(scriptRuns(tex), fontSize / k);

  /**
   * A voltage, current or flow sketched beside a path part. With + and − voltages, the signs go at the symbol's ends
   * and the name beside its middle (`besides`, clear of the symbol); between two points, at the ends and between them.
   */
  const markSketch = (m: Mark | undefined, kind: 'v' | 'i' | 'f', f: ReturnType<typeof pathFrame>, glyph: number, besides: (side: 1 | -1, tex: string) => Pt, open = false) => {
    if (!m?.text.trim()) return null;
    const n = { x: -f.u.y, y: f.u.x };
    const side = m.side === '^' ? 1 : m.side === '_' ? -1 : kind === 'v' ? -1 : 1;
    const way = m.dir === '<' ? -1 : 1;
    const off = (p: Pt, d: number) => ({ x: p.x + n.x * d * side, y: p.y + n.y * d * side });
    const along = (d: number) => ({ x: f.mid.x + f.u.x * d, y: f.mid.y + f.u.y * d });
    if (kind === 'v' && signs) {
      // ponytail: the signs' places are a sketch, near circuitikz's; the preview has them exactly
      const reach = open ? Math.max(f.length / 2 - 1, 0.6) : glyph / 2;
      const ends = [off(along(-reach), open ? 0 : 1.2), off(along(reach), open ? 0 : 1.2)];
      const [plus, minus] = plusAtStart(circuitStyle.voltageDir, m.dir) ? ends : [ends[1], ends[0]];
      return (
        <g className="ckt-sketch">
          {text(plus, '+', 'ckt-text ckt-sign')}
          {text(minus, '−', 'ckt-text ckt-sign')}
          {text(open ? f.mid : besides(side, m.text), m.text)}
        </g>
      );
    }
    if (kind !== 'i') {
      const half = Math.max(glyph / 2, 1.5);
      const gap = kind === 'v' ? 3 : 2.2;
      const from = off(along(-half * way), gap);
      const to = off(along(half * way), gap);
      return (
        <g className="ckt-sketch">
          {line(from, to, { markerEnd: 'url(#ckt-arrow)' })}
          {text(off(f.mid, gap + 0.9), m.text, 'ckt-text ckt-sketch-text')}
        </g>
      );
    }
    const at = along(Math.min(f.length / 2 - 0.5, glyph / 2 + 1.2));
    const tip = { x: at.x + f.u.x * 0.6 * way, y: at.y + f.u.y * 0.6 * way };
    const back = { x: at.x - f.u.x * 0.6 * way, y: at.y - f.u.y * 0.6 * way };
    return (
      <g className="ckt-sketch">
        <polygon points={poly([tip, { x: back.x + n.x * 0.45, y: back.y + n.y * 0.45 }, { x: back.x - n.x * 0.45, y: back.y - n.y * 0.45 }])} />
        {text(off(at, 1.5), m.text, 'ckt-text ckt-sketch-text')}
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
    const labelSide: 1 | -1 = el.label?.side === '_' ? -1 : 1;
    // the drawn symbol's outline, or the outline drawn in its place until it comes
    const outline = sym ? symbolOutline(sym) : { minX: -glyph / 2 / s, maxX: glyph / 2 / s, minY: -0.8 / s, maxY: 0.8 / s };
    const besides = (side: 1 | -1, tex: string) => pathLabelAt(el, f, outline, side, sizeOf(tex));
    const halfSpanPt = ((f.length / 2) * PT_PER_GRID) / s;
    const [start, end] = [
      { x: f.mid.x - (f.u.x * glyph) / 2, y: f.mid.y - (f.u.y * glyph) / 2 },
      { x: f.mid.x + (f.u.x * glyph) / 2, y: f.mid.y + (f.u.y * glyph) / 2 }
    ];
    const [poleA, poleB] = el.poles || ['', ''];
    const open = isOpen(el.type);
    return (
      <g key={el.id} data-id={ghost ? undefined : el.id} className={`ckt-part ${ghost ? 'ghost' : ''} ${selected.has(el.id) ? 'selected' : ''}`}>
        {selected.has(el.id) && line(a, b, { className: 'ckt-halo' })}
        {line(a, b, { className: 'ckt-hit' })}
        {open && line(a, b, { className: 'ckt-open' })}
        {!open && f.length > glyph && (
          <>
            {line(a, start, { className: 'ckt-wire' })}
            {line(end, b, { className: 'ckt-wire' })}
          </>
        )}
        {open ? null : sym ? (
          <g clipPath={`url(#ckt-clip-${el.id})`} transform={`translate(${m.x},${m.y}) scale(${kpt * s}) rotate(${-angle}) scale(${el.invert ? -1 : 1},${el.mirror ? -1 : 1})`}>
            <clipPath id={`ckt-clip-${el.id}`}>
              <rect x={-halfSpanPt} y={-1e4} width={2 * halfSpanPt} height={2e4} />
            </clipPath>
            <image className="ckt-glyph" href={image(variantKey(el.type, el.options), sym, kpt * s)} x={-(sym.origin.x + sym.middle.x)} y={-(sym.origin.y - sym.middle.y)} width={sym.width} height={sym.height} />
          </g>
        ) : (
          <polygon className="ckt-outline" points={poly([start, end].flatMap((p, i) => (i ? [{ x: p.x + n.x * 0.8, y: p.y + n.y * 0.8 }, { x: p.x - n.x * 0.8, y: p.y - n.y * 0.8 }] : [{ x: p.x - n.x * 0.8, y: p.y - n.y * 0.8 }, { x: p.x + n.x * 0.8, y: p.y + n.y * 0.8 }])))} />
        )}
        {el.label?.text.trim() && text(besides(labelSide, el.label.text), el.label.text)}
        {el.value?.trim() && text(besides(labelSide > 0 ? -1 : 1, el.value), el.value)}
        {markSketch(el.voltage, 'v', f, glyph, besides, open)}
        {markSketch(el.current, 'i', f, glyph, besides)}
        {markSketch(el.flow, 'f', f, glyph, besides)}
        {PARTS.get(el.type)?.text && el.text?.trim() && text(f.mid, el.text)}
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
          {text(el.at, content ? el.text! : 'Text', content ? 'ckt-text' : 'ckt-text ckt-sketch-text', fontSize * (el.font ? FONT_SCALE[el.font] : 1), {
            fill: content ? ink(el.colour) : undefined,
            fontWeight: el.bold ? 700 : undefined,
            fontStyle: el.italic ? 'italic' : undefined
          })}
        </g>
      );
    }
    const rotation = el.rotate || 0;
    const turn = `rotate(${-rotation}) scale(${el.flipX ? -1 : 1},${el.flipY ? -1 : 1})`;
    const pins = Object.values(placeholderShape(el.type).pins);
    const box = pins.length
      ? { minX: Math.min(...pins.map((q) => q.x)) + 0.5, maxX: Math.max(...pins.map((q) => q.x)) - 0.5, minY: Math.min(...pins.map((q) => q.y)) - 1.5, maxY: Math.max(...pins.map((q) => q.y)) + 1.5 }
      : { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 };
    const nameAt = el.name ? nodeNameAt(el, sym ? symbolOutline(sym) : box, sizeOf(el.name)) : el.at;
    return (
      <g key={el.id} data-id={ghost ? undefined : el.id} className={`ckt-part ${ghost ? 'ghost' : ''} ${selected.has(el.id) ? 'selected' : ''}`}>
        {sym ? (
          <g transform={`translate(${p.x},${p.y}) scale(${kpt}) ${turn}`}>
            <rect className={selected.has(el.id) ? 'ckt-halo-box' : 'ckt-hit-box'} x={-sym.origin.x} y={-sym.origin.y} width={sym.width} height={sym.height} />
            <image className="ckt-glyph" href={image(variantKey(el.type, el.options), sym, kpt)} x={-sym.origin.x} y={-sym.origin.y} width={sym.width} height={sym.height} />
          </g>
        ) : (
          <g transform={`translate(${p.x},${p.y}) scale(${k},${-k}) rotate(${rotation}) scale(${el.flipX ? -1 : 1},${el.flipY ? -1 : 1})`}>
            <rect className={`ckt-outline ${selected.has(el.id) ? 'ckt-halo-box' : ''}`} x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} vectorEffect="non-scaling-stroke" />
          </g>
        )}
        {content.trim() && text(el.at, el.text || '')}
        {el.name && !ghost && text(nameAt, el.name, 'ckt-text ckt-name')}
        {el.pinLabels && !ghost && pinLabelSpots(el).map(({ pin, letter, dir }) => {
          // as TikZ's anchor puts it: the letter's near corner a node's inner sep from the pin
          const at = pos({ part: el.id, pin });
          const size = labelSize([{ text: letter }], (fontSize * 0.7) / k);
          return <g key={pin}>{text({ x: at.x + dir.x * (size.w / 2 + 0.3), y: at.y + dir.y * (size.h / 2 + 0.3) }, letter, 'ckt-text ckt-pin-label', fontSize * 0.7)}</g>;
        })}
      </g>
    );
  };

  const drawWire = (el: Wire) => {
    const ends = el.points.map((p) => pos(p));
    const path = wirePath(ends, el.routes);
    const points = poly(path);
    // a segment's current or flow, sketched on its first leg as the code writes it
    const marks = ends.slice(1).map((to, i) => {
      const from = ends[i];
      const route = el.routes[i] || '--';
      const legEnd = route === '-|' ? { x: to.x, y: from.y } : route === '|-' ? { x: from.x, y: to.y } : to;
      const f = pathFrame(from, Math.hypot(legEnd.x - from.x, legEnd.y - from.y) < 1e-6 ? to : legEnd);
      return (
        <g key={i}>
          {markSketch(el.currents?.[i] ?? undefined, 'i', f, 0, () => f.mid)}
          {markSketch(el.flows?.[i] ?? undefined, 'f', f, 0, () => f.mid)}
        </g>
      );
    });
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
        {marks}
      </g>
    );
  };

  /** an arrowhead at `at`, pointing along `dir` (grid steps), as arrows.meta draws it */
  const head = (el: Annotation, at: Pt, dir: Pt, key: string, style: Record<string, unknown>) => {
    const len = Math.hypot(dir.x, dir.y) || 1;
    const u = { x: dir.x / len, y: dir.y / len };
    const n = { x: -u.y, y: u.x };
    const l = HEAD_CM[el.headSize || 'medium'] / GRID_CM;
    const half = l * (el.head === 'triangle' || el.head === 'to' ? 0.5 : 0.375);
    const back = { x: at.x - u.x * l, y: at.y - u.y * l };
    const side = (s: number) => ({ x: back.x + n.x * half * s, y: back.y + n.y * half * s });
    if (el.head === 'to') return <polyline key={key} className="ckt-annotation" points={poly([side(1), at, side(-1)])} style={{ ...style, strokeDasharray: undefined }} />;
    const points = el.head === 'stealth' ? [at, side(1), { x: at.x - u.x * l * 0.675, y: at.y - u.y * l * 0.675 }, side(-1)] : [at, side(1), side(-1)];
    return <polygon key={key} className={el.head === 'triangle' ? 'ckt-annotation ckt-annotation-open' : 'ckt-annotation-head'} points={poly(points)} style={el.head === 'triangle' ? { ...style, strokeDasharray: undefined } : { fill: style.stroke as string | undefined }} />;
  };

  /** an annotation, over the circuit: taken by its outline, never its inside, so the parts under a frame stay reachable */
  const drawAnnotation = (el: Annotation) => {
    const w = (ANNOTATION_PX[el.width || 'thin'] * linePx) / ANNOTATION_PX.thin;
    const dash = el.dash === 'dashed' ? `${3 * kpt} ${3 * kpt}` : el.dash === 'dotted' ? `${w} ${2 * kpt}` : el.dash === 'dash dot' ? `${3 * kpt} ${2 * kpt} ${w} ${2 * kpt}` : undefined;
    const style = { stroke: ink(el.colour), strokeWidth: w, strokeDasharray: dash };
    const S = (p: Pt) => {
      const q = toScreen(p);
      return `${q.x},${q.y}`;
    };
    const heads: [Pt, Pt][] = [];
    let outline: (className: string, extra?: object) => JSX.Element;
    if (el.shape === 'line' || el.shape === 'cross') {
      const p = el.points;
      let d = '';
      if (el.shape === 'cross') {
        const s = el.size ?? 0.5;
        const { x, y } = p[0];
        d = `M${S({ x: x - s, y: y - s })} L${S({ x: x + s, y: y + s })} M${S({ x: x - s, y: y + s })} L${S({ x: x + s, y: y - s })}`;
      } else {
        d = `M${S(p[0])}`;
        for (let i = 1; i < p.length; i += 1) {
          const [c1, c2] = el.bend ? bendControls(p[i - 1], p[i], el.bend) : [p[i], p[i - 1]];
          d += el.bend ? ` C${S(c1)} ${S(c2)} ${S(p[i])}` : ` L${S(p[i])}`;
          // the tips point along the path where it meets them
          if (i === 1 && el.arrows?.startsWith('<')) heads.push([p[0], { x: p[0].x - c1.x, y: p[0].y - c1.y }]);
          if (i === p.length - 1 && el.arrows?.endsWith('>')) heads.push([p[i], { x: p[i].x - c2.x, y: p[i].y - c2.y }]);
        }
      }
      outline = (className, extra) => <path className={className} d={d} {...extra} />;
    } else {
      const { c, rx, ry } = box(el);
      const corner = toScreen({ x: c.x - rx, y: c.y + ry });
      const round = el.shape === 'rect' && el.rounded ? Math.min((ROUNDED_CM / GRID_CM) * k, rx * k, ry * k) : 0;
      const centre = toScreen(c);
      outline = (className, extra) =>
        el.shape === 'rect' ? <rect className={className} x={corner.x} y={corner.y} width={2 * rx * k} height={2 * ry * k} rx={round} {...extra} /> : <ellipse className={className} cx={centre.x} cy={centre.y} rx={rx * k} ry={ry * k} {...extra} />;
      if (el.loop) {
        const [from, to] = loopLine(el);
        heads.push([to, { x: to.x - from.x, y: to.y - from.y }]);
      }
    }
    return (
      <g key={el.id} data-id={el.id} className={`ckt-part ${selected.has(el.id) ? 'selected' : ''}`}>
        {selected.has(el.id) && outline('ckt-halo')}
        {el.fill && outline('ckt-annotation-fill', { style: { fill: colourCss(el.fill) } })}
        {outline('ckt-hit')}
        {outline('ckt-annotation', { style })}
        {heads.map(([at, dir], i) => head(el, at, dir, String(i), style))}
      </g>
    );
  };

  // ghost of the part about to be placed
  const ghostPart = (() => {
    if (drag || !hover || !tool.startsWith('part:')) return null;
    const type = tool.slice(5);
    const part = PARTS.get(type);
    if (!part) return null;
    if (part.kind === 'path') return drawPath({ id: 'ghost', kind: 'path', type, a: hover, b: clickEnd(type, hover) }, true);
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
    if (el.kind === 'wire' || el.kind === 'annotation') return el.points.map((p, i) => ({ key: `${id}:${i}`, at: toScreen(pos(p)) }));
    return [];
  });

  const dot = Math.max(2.5, k * 0.22);
  const gridStep = k < 6 ? 4 : 1;
  // the background (Settings › Diagram composer): every Nth dot larger, or joined by lines, so squares can be counted
  const minor = k * gridStep;
  const major = minor * settings.composerGridEvery;
  const pad = 3;
  const wirePreview = wire && hover ? [...wire.map((p) => pos(p)), hover] : null;
  const previewRoutes = wirePreview?.slice(1).map((p, i): Route => (drawingLine.current ? '--' : autoRoute(wirePreview[i], p)));
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
        style={{ cursor, '--ckt-line': `${linePx}px` } as CSSProperties}
        onPointerEnter={() => (hovered.current = true)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          hovered.current = false;
          if (!drag) setHover(null);
        }}
        onDoubleClick={() => wire && finishWire(wire)}
      >
        <defs>
          <pattern id="ckt-dots" width={minor} height={minor} patternUnits="userSpaceOnUse" x={v.x} y={v.y}>
            {settings.composerGrid === 'lines' ? (
              <path d={`M0.75,0 V${minor} M0,0.75 H${minor}`} className="ckt-grid-line" />
            ) : (
              <circle cx={0.75} cy={0.75} r={0.75} className="ckt-dot" />
            )}
          </pattern>
          {settings.composerGrid !== 'dots' && (
            <pattern id="ckt-major" width={major} height={major} patternUnits="userSpaceOnUse" x={v.x - pad} y={v.y - pad}>
              {settings.composerGrid === 'major-dots' ? (
                <circle cx={pad + 0.75} cy={pad + 0.75} r={1.6} className="ckt-dot" />
              ) : (
                <path d={`M${pad + 0.75},0 V${major} M0,${pad + 0.75} H${major}`} className="ckt-grid-line ckt-grid-major" />
              )}
            </pattern>
          )}
          <marker id="ckt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="ckt-arrowhead" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#ckt-dots)" />
        {settings.composerGrid !== 'dots' && <rect width="100%" height="100%" fill="url(#ckt-major)" />}
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
            {shown.elements.filter((el): el is Annotation => el.kind === 'annotation' && el.points.length > 0).map(drawAnnotation)}
            {wirePreview && <polyline className="ckt-wire ckt-draft" points={poly(wirePath(wirePreview, previewRoutes!))} />}
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
              const path = el.kind === 'path' ? [pos(el.a), pos(el.b)] : el.kind === 'annotation' ? (el.shape === 'rect' || el.shape === 'ellipse' ? [0, 1, 2, 3, 0].map((i) => ({ x: el.points[i % 3 ? 1 : 0].x, y: el.points[i < 2 ? 0 : 1].y })) : el.points) : wirePath(el.points.map((p) => pos(p)), el.routes);
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
