// Edits to a circuit: adding, moving, attaching, turning, flipping, deleting, copying and pasting. Each
// takes a model and gives a new one; the canvas works out junctions after.
import { PARTS, isPoint, locator, newId, nextName, pinsOfElement } from './model';
import type { CircuitModel, Element, End, NodePart, PathPart, Pt, ShapeOf } from './model';

const same = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3;
const add = (p: Pt, d: Pt) => ({ x: p.x + d.x, y: p.y + d.y });

/** A new path part between two ends, labelled with the next number of its letter (R_1, R_2…). */
export function newPathPart(model: CircuitModel, type: string, a: End, b: End): PathPart {
  const letter = PARTS.get(type)?.defaultLabel;
  const n = model.elements.filter((el) => el.kind === 'path' && PARTS.get(el.type)?.defaultLabel === letter).length + 1;
  return { id: newId(model), kind: 'path', type, a, b, ...(letter ? { label: { text: n < 10 ? `${letter}_${n}` : `${letter}_{${n}}` } } : null) };
}

/** A new placed part, named with the next number of its letter (U1, U2…) when it has one. */
export function newNodePart(model: CircuitModel, type: string, at: Pt): NodePart {
  const letter = PARTS.get(type)?.defaultLabel;
  return { id: newId(model), kind: 'node', type, at, ...(letter ? { name: nextName(model, letter) } : null) };
}

/** Ends of the elements in `ids` that sit on parts outside `ids` become plain points, where they are now. */
export function detach(model: CircuitModel, ids: Set<string>, shapeOf: ShapeOf): CircuitModel {
  const { pos } = locator(model, shapeOf);
  const free = (end: End): End => (isPoint(end) || ids.has(end.part) ? end : pos(end));
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id) || el.kind === 'node') return el;
      if (el.kind === 'path') return { ...el, a: free(el.a), b: free(el.b) };
      return { ...el, points: el.points.map(free) };
    })
  };
}

/** Moves the elements in `ids`; ends on parts that move with them stay on them. Call detach first. */
export function moveBy(model: CircuitModel, ids: Set<string>, delta: Pt): CircuitModel {
  const shift = (end: End): End => (isPoint(end) ? add(end, delta) : end);
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      if (el.kind === 'node') return { ...el, at: add(el.at, delta) };
      if (el.kind === 'path') return { ...el, a: shift(el.a), b: shift(el.b) };
      return { ...el, points: el.points.map(shift) };
    })
  };
}

/**
 * Ends of the elements in `ids` that landed on a pin take hold of it, so they follow when that part moves:
 * a path part's ends hold placed parts' pins; a wire's two ends hold any other part's pin.
 */
export function attach(model: CircuitModel, ids: Set<string>, shapeOf: ShapeOf): CircuitModel {
  const { pos } = locator(model, shapeOf);
  const pins = model.elements.flatMap((el) => pinsOfElement(el, shapeOf, pos).map((p) => ({ ...p, el })));
  const hold = (end: End, owner: string, nodesOnly: boolean): End => {
    if (!isPoint(end)) return end;
    const hit = pins.find((p) => p.el.id !== owner && (!nodesOnly || p.el.kind === 'node') && same(p.at, end));
    return hit ? { part: hit.el.id, pin: hit.pin } : end;
  };
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id) || el.kind === 'node') return el;
      if (el.kind === 'path') return { ...el, a: hold(el.a, el.id, true), b: hold(el.b, el.id, true) };
      const last = el.points.length - 1;
      return { ...el, points: el.points.map((p, i) => (i === 0 || i === last ? hold(p, el.id, false) : p)) };
    })
  };
}

/** Deletes the elements in `ids`; whatever was attached to them stays where it was. */
export function remove(model: CircuitModel, ids: Set<string>, shapeOf: ShapeOf): CircuitModel {
  const { pos } = locator(model, shapeOf);
  const keep = (end: End): End => (isPoint(end) || !ids.has(end.part) ? end : pos(end));
  return {
    ...model,
    elements: model.elements
      .filter((el) => !ids.has(el.id))
      .map((el) => {
        if (el.kind === 'path') return { ...el, a: keep(el.a), b: keep(el.b) };
        if (el.kind === 'wire') return { ...el, points: el.points.map(keep) };
        return el;
      }),
    junctions: model.junctions.filter((j) => isPoint(j) || !ids.has(j.part))
  };
}

/** Turns placed parts by `step` degrees, and path parts about their middle, back onto the grid. */
export function rotate(model: CircuitModel, ids: Set<string>, step: number, shapeOf: ShapeOf): CircuitModel {
  const loose = detach(model, new Set([...ids].filter((id) => model.elements.find((el) => el.id === id)?.kind === 'path')), shapeOf);
  const t = (step * Math.PI) / 180;
  const turn = (p: Pt, c: Pt) => ({
    x: Math.round(c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t)),
    y: Math.round(c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t))
  });
  return {
    ...loose,
    elements: loose.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      if (el.kind === 'node') return { ...el, rotate: ((((el.rotate || 0) + step) % 360) + 360) % 360 };
      if (el.kind === 'path' && isPoint(el.a) && isPoint(el.b)) {
        const c = { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
        return { ...el, a: turn(el.a, c), b: turn(el.b, c) };
      }
      return el;
    })
  };
}

/** Flips placed parts across (x: left to right) or (y: top to bottom); a path part inverts (x) or mirrors (y). */
export function flip(model: CircuitModel, ids: Set<string>, axis: 'x' | 'y'): CircuitModel {
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      if (el.kind === 'node') return axis === 'x' ? { ...el, flipX: !el.flipX } : { ...el, flipY: !el.flipY };
      if (el.kind === 'path') return axis === 'x' ? { ...el, invert: !el.invert } : { ...el, mirror: !el.mirror };
      return el;
    })
  };
}

/** The elements in `ids`, cut loose from anything not copied with them. */
export function copy(model: CircuitModel, ids: Set<string>, shapeOf: ShapeOf): Element[] {
  return detach(model, ids, shapeOf).elements.filter((el) => ids.has(el.id));
}

/** Pastes copied elements moved by `offset`, with fresh ids and the next free names. */
export function paste(model: CircuitModel, items: Element[], offset: Pt): { model: CircuitModel; ids: string[] } {
  let next = model;
  const ids = new Map<string, string>();
  for (const el of items) {
    const id = newId(next);
    ids.set(el.id, id);
    // a placeholder so the next id and name skip this one
    next = { ...next, elements: [...next.elements, { ...el, id, ...(el.kind !== 'wire' && el.name ? { name: nextName(next, el.name.replace(/\d+$/, '')) } : null) } as Element] };
  }
  const map = (end: End): End => (isPoint(end) ? add(end, offset) : { part: ids.get(end.part) || end.part, pin: end.pin });
  const pasted = next.elements.slice(model.elements.length).map((el): Element => {
    if (el.kind === 'node') return { ...el, at: add(el.at, offset) };
    if (el.kind === 'path') return { ...el, a: map(el.a), b: map(el.b) };
    return { ...el, points: el.points.map(map) };
  });
  return { model: { ...model, elements: [...model.elements, ...pasted] }, ids: pasted.map((el) => el.id) };
}
