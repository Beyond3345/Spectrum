// Edits to a circuit: adding, moving, attaching, turning, flipping, deleting, copying and pasting. Each
// takes a model and gives a new one; the canvas works out junctions after.
import { PARTS, isPart, isPoint, locator, newId, nextName, pinsOfElement } from './model';
import type { CircuitModel, Element, End, NodePart, PathPart, Pt, ShapeOf } from './model';

const same = (p: Pt, q: Pt) => Math.abs(p.x - q.x) < 1e-3 && Math.abs(p.y - q.y) < 1e-3;
const add = (p: Pt, d: Pt) => ({ x: p.x + d.x, y: p.y + d.y });

/** A new path part between two ends, labelled with the next number of its letter (R_1, R_2…), or for a part that
 * marks a voltage, with the next voltage (v_1, v_2…). */
export function newPathPart(model: CircuitModel, type: string, a: End, b: End): PathPart {
  const part = PARTS.get(type);
  const next = (letter: string, taken: (el: PathPart) => string | undefined) => {
    const used = new Set(model.elements.flatMap((el) => (el.kind === 'path' && taken(el) ? [taken(el)!.replace(/[{}$]/g, '')] : [])));
    let n = 1;
    while (used.has(`${letter}_${n}`)) n += 1;
    return n < 10 ? `${letter}_${n}` : `${letter}_{${n}}`;
  };
  const letter = part?.defaultLabel;
  const volts = part?.defaultVoltage;
  return {
    id: newId(model), kind: 'path', type, a, b,
    ...(letter ? { label: { text: next(letter, (el) => el.label?.text) } } : null),
    ...(volts ? { voltage: { text: next(volts, (el) => el.voltage?.text) } } : null)
  };
}

/** A new placed part, named with the next number of its letter (U1, U2…) when it has one. */
export function newNodePart(model: CircuitModel, type: string, at: Pt): NodePart {
  const letter = PARTS.get(type)?.defaultLabel;
  return { id: newId(model), kind: 'node', type, at, ...(letter ? { name: nextName(model, letter) } : null) };
}

/**
 * Where a part placed from the keyboard goes: the point of a 0.5 cm grid (two steps) nearest centre whose points,
 * given by ends(at), keep gap grid steps (1 cm) from every point taken (pins, wire points and points along parts).
 * ponytail: points, not outlines, so a wide symbol may still touch its neighbour; its outline if that matters
 */
/** Points every 2 grid steps from a to b, both ends included: a two-terminal part's line, for freeSpot. */
export function along(a: Pt, b: Pt): Pt[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

export function freeSpot(centre: Pt, ends: (at: Pt) => Pt[], taken: Pt[], gap = 4, reach = 40): Pt {
  const base = { x: Math.round(centre.x / 2) * 2, y: Math.round(centre.y / 2) * 2 };
  const spots: Pt[] = [];
  for (let dx = -reach; dx <= reach; dx += 2) for (let dy = -reach; dy <= reach; dy += 2) spots.push({ x: base.x + dx, y: base.y + dy });
  spots.sort((p, q) => Math.hypot(p.x - centre.x, p.y - centre.y) - Math.hypot(q.x - centre.x, q.y - centre.y));
  return spots.find((at) => ends(at).every((e) => taken.every((p) => Math.hypot(p.x - e.x, p.y - e.y) >= gap))) ?? base;
}

/** Ends of the elements in `ids` that sit on parts outside `ids` become plain points, where they are now. */
export function detach(model: CircuitModel, ids: Set<string>, shapeOf: ShapeOf): CircuitModel {
  const { pos } = locator(model, shapeOf);
  const free = (end: End): End => (isPoint(end) || ids.has(end.part) ? end : pos(end));
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id) || el.kind === 'node' || el.kind === 'annotation') return el;
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
      if (el.kind === 'annotation') return { ...el, points: el.points.map((p) => add(p, delta)) };
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
      // an annotation never takes hold of anything
      if (!ids.has(el.id) || el.kind === 'node' || el.kind === 'annotation') return el;
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

/**
 * Turns by `step` degrees: one part about itself (a placed part about its reference point, a path part about its middle),
 * several together about their middle, so a part keeps its place beside the others; back onto the grid. Text turned
 * with other things moves with them and stays upright.
 */
export function rotate(model: CircuitModel, ids: Set<string>, step: number, shapeOf: ShapeOf): CircuitModel {
  const group = ids.size > 1;
  const loose = detach(model, new Set([...ids].filter((id) => { const el = model.elements.find((x) => x.id === id); return el?.kind === 'path' || (group && el?.kind === 'wire'); })), shapeOf);
  const t = (step * Math.PI) / 180;
  const turn = (p: Pt, c: Pt) => ({
    x: Math.round(c.x + (p.x - c.x) * Math.cos(t) - (p.y - c.y) * Math.sin(t)),
    y: Math.round(c.y + (p.x - c.x) * Math.sin(t) + (p.y - c.y) * Math.cos(t))
  });
  const picked = loose.elements.filter((el) => ids.has(el.id));
  const spots = picked.flatMap((el): Pt[] => (el.kind === 'node' ? [el.at] : el.kind === 'path' ? [el.a, el.b] : el.points).filter(isPoint));
  const middle = (points: Pt[]) => ({ x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2, y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2 });
  const xs = spots.map((p) => p.x);
  const ys = spots.map((p) => p.y);
  const centre = group && spots.length ? { x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2) } : null;
  const quarter = ((step % 180) + 180) % 180 === 90;
  return {
    ...loose,
    elements: loose.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      // an annotation turns about its own middle, or with the rest; a box's corners stay a box's corners
      // ponytail: a rectangle or ellipse turned 45° stays upright, its corners turned; draw it again for a slanted frame
      // a dimension measured across or up turns to measure up or across; a mark's letter and the ▽ mark stay upright
      if (el.kind === 'annotation') return { ...el, points: el.points.map((p) => turn(p, centre || middle(el.points))), ...(el.along && quarter ? { along: el.along === 'x' ? 'y' : 'x' } : null) } as typeof el;
      if (el.kind === 'node') {
        const at = centre ? turn(el.at, centre) : el.at;
        return centre && !PARTS.get(el.type)?.tikz ? { ...el, at } : { ...el, at, rotate: ((((el.rotate || 0) + step) % 360) + 360) % 360 };
      }
      // ends held by a part turned with them follow it
      const turned = (end: End) => (centre && isPoint(end) ? turn(end, centre) : end);
      if (el.kind === 'path' && centre) return { ...el, a: turned(el.a), b: turned(el.b) };
      if (el.kind === 'path' && isPoint(el.a) && isPoint(el.b)) {
        const c = { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
        return { ...el, a: turn(el.a, c), b: turn(el.b, c) };
      }
      // a wire's bends turn with it: across-then-up becomes up-then-across after a quarter turn
      if (el.kind === 'wire' && centre) return { ...el, points: el.points.map(turned), routes: quarter ? el.routes.map((r) => (r === '-|' ? '|-' : r === '|-' ? '-|' : r)) : el.routes };
      return el;
    })
  };
}

/** a mark's letter across a mirror: left for right across a vertical one, below for above across a horizontal one */
const MIRRORED_PLACE = { x: { right: 'left', left: 'right' }, y: { above: 'below', below: 'above' } };

/**
 * Flips placed parts across (x: left to right) or (y: top to bottom); a path part inverts (x) or mirrors (y), each in its
 * place. An annotation mirrors about its own middle, so it stays on what it marks; a group of only annotations and Text
 * (a preset's) mirrors about its middle as one, the Text moved and still readable.
 */
export function flip(model: CircuitModel, ids: Set<string>, axis: 'x' | 'y'): CircuitModel {
  const isText = (el: Element) => el.kind === 'node' && !PARTS.get(el.type)?.tikz;
  const picked = model.elements.filter((el) => ids.has(el.id));
  const overlays = picked.length > 1 && picked.every((el) => el.kind === 'annotation' || isText(el));
  const middle = (spots: Pt[]) => ({ x: (Math.min(...spots.map((p) => p.x)) + Math.max(...spots.map((p) => p.x))) / 2, y: (Math.min(...spots.map((p) => p.y)) + Math.max(...spots.map((p) => p.y))) / 2 });
  const group = overlays ? middle(picked.flatMap((el) => (el.kind === 'annotation' ? el.points : el.kind === 'node' ? [el.at] : []))) : null;
  const across = (p: Pt, c: Pt) => (axis === 'x' ? { x: 2 * c.x - p.x, y: p.y } : { x: p.x, y: 2 * c.y - p.y });
  return {
    ...model,
    elements: model.elements.map((el) => {
      if (!ids.has(el.id)) return el;
      if (el.kind === 'annotation') {
        const c = group || middle(el.points);
        // a boundary's hatching stays on the side it was (mirrored, the way it was drawn turns round), and a mark's letter
        // goes to the other side across the mirror
        const place = el.shape === 'mark' ? (MIRRORED_PLACE[axis] as Record<string, string | undefined>)[el.place || 'right'] : undefined;
        return {
          ...el,
          points: el.points.map((p) => across(p, c)),
          ...(el.bend ? { bend: -el.bend } : null),
          ...(el.loop ? { loop: el.loop === 'cw' ? 'ccw' : 'cw' } : null),
          ...(el.shape === 'boundary' ? { hatch: el.hatch ? undefined : 'left' } : null),
          ...(place ? { place: place === 'right' ? undefined : place } : null)
        } as typeof el;
      }
      if (group && el.kind === 'node') return { ...el, at: across(el.at, group) };
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
    next = { ...next, elements: [...next.elements, { ...el, id, ...(isPart(el) && el.name ? { name: nextName(next, el.name.replace(/\d+$/, '')) } : null) } as Element] };
  }
  const map = (end: End): End => (isPoint(end) ? add(end, offset) : { part: ids.get(end.part) || end.part, pin: end.pin });
  const pasted = next.elements.slice(model.elements.length).map((el): Element => {
    if (el.kind === 'node') return { ...el, at: add(el.at, offset) };
    if (el.kind === 'path') return { ...el, a: map(el.a), b: map(el.b) };
    if (el.kind === 'annotation') return { ...el, points: el.points.map((p) => add(p, offset)) };
    return { ...el, points: el.points.map(map) };
  });
  return { model: { ...model, elements: [...model.elements, ...pasted] }, ids: pasted.map((el) => el.id) };
}
