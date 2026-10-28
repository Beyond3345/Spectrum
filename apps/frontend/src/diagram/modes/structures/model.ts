// The structure drawing: nodes, and the parts that hang on them (members, supports, loads and notes), all in the
// drawing's length unit with y up. Parts refer to nodes and members by id, so everything follows when a node moves.
import type { Pt } from '../circuitikz/model';

export type { Pt };

export interface SNode {
  id: string;
  x: number;
  y: number;
  /** a letter shown beside it, and used in member names (F_AB) */
  name?: string;
  /** an internal hinge: every member end here turns freely */
  hinge?: boolean;
}

export type SupportType = 'pin' | 'roller' | 'fixed' | 'guided' | 'spring' | 'rotspring';

export interface Support {
  id: string;
  kind: 'support';
  node: string;
  type: SupportType;
  /** degrees the symbol is turned anticlockwise; 0 sits under the node, its reaction pushing up */
  angle?: number;
  /** a spring's stiffness, relative (force per length, or moment per radian) */
  k?: number;
}

export interface Member {
  id: string;
  kind: 'member';
  a: string;
  b: string;
  /** a truss bar: pinned at both ends, carrying force along its length only */
  bar?: boolean;
  /** an end that turns freely (a beam only): [at a, at b] */
  release?: [boolean, boolean];
  /** relative bending and axial stiffness, 1 when left out */
  EI?: number;
  EA?: number;
}

/** Where a point load or moment acts: a node, or a distance along a member from its a end. */
export type Place = { node: string } | { member: string; at: number };

export interface Force {
  id: string;
  kind: 'force';
  on: Place;
  value: number;
  /** the way it pushes, in degrees: −90 is down */
  angle: number;
  /** perpendicular to its member instead, towards the member's right-hand side going a to b */
  perp?: boolean;
  label?: string;
}

export interface Moment {
  id: string;
  kind: 'moment';
  on: Place;
  value: number;
  cw?: boolean;
  label?: string;
}

/** A distributed load from `from` to `to` along its member, w1 there rising or falling linearly to w2. */
export interface Dist {
  id: string;
  kind: 'dist';
  member: string;
  from: number;
  to: number;
  w1: number;
  w2: number;
  angle: number;
  perp?: boolean;
  label?: string;
}

export interface Dimension {
  id: string;
  kind: 'dim';
  a: string;
  b: string;
  /** horizontal, vertical or along the line between the nodes */
  dir: 'h' | 'v' | 'aligned';
  /** how far from the nodes, in the drawing's unit, to the left of a→b (below for h, right of for v when negative) */
  offset: number;
  label?: string;
}

export interface Note {
  id: string;
  kind: 'label';
  at: Pt;
  text: string;
}

/** An angle arc at a node, from one direction to another (degrees, anticlockwise). */
export interface AngleArc {
  id: string;
  kind: 'angle';
  node: string;
  from: number;
  to: number;
  label?: string;
}

export interface Axes {
  id: string;
  kind: 'axes';
  at: Pt;
}

/** A section cut from p to q; the part kept is on its left going p to q, or its right when flipped. */
export interface Cut {
  id: string;
  kind: 'cut';
  p: Pt;
  q: Pt;
  flip?: boolean;
}

export type Load = Force | Moment | Dist;
export type Part = Member | Support | Load | Dimension | Note | AngleArc | Axes | Cut;

export interface StructureModel {
  nodes: SNode[];
  parts: Part[];
}

export const emptyStructure = (): StructureModel => ({ nodes: [], parts: [] });

/** A model read back from a file, or an empty one when it isn't a structure. */
export function asStructure(model: unknown): StructureModel {
  const m = model as Partial<StructureModel> | null;
  return m && Array.isArray(m.nodes) && Array.isArray(m.parts) ? { nodes: m.nodes, parts: m.parts } : emptyStructure();
}

export const isLoad = (p: Part): p is Load => p.kind === 'force' || p.kind === 'moment' || p.kind === 'dist';
export const members = (m: StructureModel) => m.parts.filter((p): p is Member => p.kind === 'member');
export const supports = (m: StructureModel) => m.parts.filter((p): p is Support => p.kind === 'support');

// ─── units ───

export type Units = 'kN-m' | 'N-mm' | 'kip-ft' | 'lb-in';

/** Each unit system's names (TeX) and the grid steps the canvas offers in its length unit. */
export const UNITS: Record<Units, { label: string; force: string; length: string; grids: number[]; canvasCm: number }> = {
  'kN-m': { label: 'kN and m', force: 'kN', length: 'm', grids: [0.1, 0.25, 0.5, 1], canvasCm: 1.5 },
  'N-mm': { label: 'N and mm', force: 'N', length: 'mm', grids: [100, 250, 500, 1000], canvasCm: 0.0015 },
  'kip-ft': { label: 'kip and ft', force: 'kip', length: 'ft', grids: [0.5, 1, 2, 5], canvasCm: 0.45 },
  'lb-in': { label: 'lb and in', force: 'lb', length: 'in', grids: [6, 12, 24, 60], canvasCm: 0.04 }
};

// ─── geometry ───

export const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

export function nodeMap(model: StructureModel) {
  return new Map(model.nodes.map((n) => [n.id, n]));
}

/** A member's ends, unit vector a→b, its left-hand normal and its length. */
export function frameOf(model: StructureModel, member: Member) {
  const nodes = nodeMap(model);
  const a = nodes.get(member.a) ?? { x: 0, y: 0 };
  const b = nodes.get(member.b) ?? { x: 0, y: 0 };
  const length = dist(a, b);
  const u = length ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, u, n: { x: -u.y, y: u.x }, length };
}

/** Where a place is. */
export function placeAt(model: StructureModel, place: Place): Pt {
  if ('node' in place) {
    const n = model.nodes.find((x) => x.id === place.node);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  }
  const member = model.parts.find((p): p is Member => p.kind === 'member' && p.id === place.member);
  if (!member) return { x: 0, y: 0 };
  const f = frameOf(model, member);
  return { x: f.a.x + f.u.x * place.at, y: f.a.y + f.u.y * place.at };
}

/** A load's direction as a unit vector (perpendicular loads need their member's frame). */
export function loadDirection(load: { angle: number; perp?: boolean }, memberU?: Pt): Pt {
  if (load.perp && memberU) return { x: memberU.y, y: -memberU.x };
  const t = (load.angle * Math.PI) / 180;
  return { x: Math.cos(t), y: Math.sin(t) };
}

/** The member a point lies on, strictly between its ends, and how far along. */
export function memberAt(model: StructureModel, at: Pt, tolerance: number): { member: Member; at: number } | null {
  for (const member of members(model)) {
    const f = frameOf(model, member);
    const s = (at.x - f.a.x) * f.u.x + (at.y - f.a.y) * f.u.y;
    const off = Math.abs((at.x - f.a.x) * f.n.x + (at.y - f.a.y) * f.n.y);
    if (off <= tolerance && s > tolerance && s < f.length - tolerance) return { member, at: s };
  }
  return null;
}

// ─── names and ids ───

let counter = 0;
/** A fresh id, unique in the model. */
export function newId(model: StructureModel, prefix = 's') {
  const ids = new Set([...model.nodes.map((n) => n.id), ...model.parts.map((p) => p.id)]);
  do counter += 1;
  while (ids.has(`${prefix}${counter}`));
  return `${prefix}${counter}`;
}

/** The next free node letter: A to Z, then A1, B1… */
export function nextLetter(model: StructureModel) {
  const taken = new Set(model.nodes.map((n) => n.name));
  for (let round = 0; ; round += 1) {
    for (let i = 0; i < 26; i += 1) {
      const name = String.fromCharCode(65 + i) + (round ? String(round) : '');
      if (!taken.has(name)) return name;
    }
  }
}

/** A member's name from its nodes' letters (AB), or its number. */
export function memberName(model: StructureModel, member: Member) {
  const nodes = nodeMap(model);
  const [a, b] = [nodes.get(member.a)?.name, nodes.get(member.b)?.name];
  return a && b ? `${a}${b}` : String(members(model).indexOf(member) + 1);
}

// ─── edits ───

const near = (p: Pt, q: Pt, tolerance: number) => dist(p, q) <= tolerance;

/** The node at a point, or a new one there (splitting a member it lands on), and the model with it. */
export function nodeAt(model: StructureModel, at: Pt, tolerance: number): { model: StructureModel; node: string } {
  const hit = model.nodes.find((n) => near(n, at, tolerance));
  if (hit) return { model, node: hit.id };
  const id = newId(model, 'n');
  const added = { ...model, nodes: [...model.nodes, { id, x: at.x, y: at.y, name: nextLetter(model) }] };
  const on = memberAt(added, at, tolerance);
  return { model: on ? splitMember(added, on.member.id, on.at, id) : added, node: id };
}

/**
 * Splits a member at a distance along it, at a node already there: the second piece keeps the far end and its release,
 * point loads go to the piece they're on, and a distributed load across the split becomes one on each piece.
 */
export function splitMember(model: StructureModel, memberId: string, at: number, node: string): StructureModel {
  const member = model.parts.find((p): p is Member => p.kind === 'member' && p.id === memberId);
  if (!member) return model;
  const second: Member = { ...member, id: newId(model, 'm'), a: node, release: member.release?.[1] ? [false, true] : undefined };
  const first: Member = { ...member, b: node, release: member.release?.[0] ? [true, false] : undefined };
  const parts: Part[] = [];
  for (const p of model.parts) {
    if (p.id === member.id) {
      parts.push(first, second);
    } else if ((p.kind === 'force' || p.kind === 'moment') && 'member' in p.on && p.on.member === member.id) {
      const s = p.on.at;
      parts.push({ ...p, on: Math.abs(s - at) < 1e-9 ? { node } : s < at ? p.on : { member: second.id, at: s - at } });
    } else if (p.kind === 'dist' && p.member === member.id) {
      if (p.to <= at) parts.push(p);
      else if (p.from >= at) parts.push({ ...p, member: second.id, from: p.from - at, to: p.to - at });
      else {
        const w = p.w1 + ((p.w2 - p.w1) * (at - p.from)) / (p.to - p.from);
        parts.push({ ...p, to: at, w2: w }, { ...p, id: newId({ ...model, parts: [...model.parts, ...parts, second] }, 'p'), member: second.id, from: 0, to: p.to - at, w1: w });
      }
    } else parts.push(p);
  }
  return { ...model, parts };
}

/** What hangs on these ids: the parts on removed nodes or members, and on those, until nothing more goes. */
function hanging(model: StructureModel, ids: Set<string>) {
  const gone = new Set(ids);
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of model.parts) {
      if (gone.has(p.id)) continue;
      const on =
        p.kind === 'member' ? [p.a, p.b]
        : p.kind === 'support' || p.kind === 'angle' ? [p.node]
        : p.kind === 'force' || p.kind === 'moment' ? ['node' in p.on ? p.on.node : p.on.member]
        : p.kind === 'dist' ? [p.member]
        : p.kind === 'dim' ? [p.a, p.b]
        : [];
      if (on.some((id) => gone.has(id))) {
        gone.add(p.id);
        changed = true;
      }
    }
  }
  return gone;
}

/** The model without these nodes and parts, and without what hangs on them; nodes left with nothing on them go too. */
export function removeIds(model: StructureModel, ids: string[]): StructureModel {
  const gone = hanging(model, new Set(ids));
  const parts = model.parts.filter((p) => !gone.has(p.id));
  const used = new Set(parts.flatMap((p) => (p.kind === 'member' || p.kind === 'dim' ? [p.a, p.b] : p.kind === 'support' || p.kind === 'angle' ? [p.node] : (p.kind === 'force' || p.kind === 'moment') && 'node' in p.on ? [p.on.node] : [])));
  // a removed member's free ends go with it; a node the user removed goes whatever
  const loose = new Set(model.parts.filter((p): p is Member => p.kind === 'member' && gone.has(p.id)).flatMap((m) => [m.a, m.b]));
  return { nodes: model.nodes.filter((n) => !gone.has(n.id) && !(loose.has(n.id) && !used.has(n.id))), parts };
}

/**
 * After a node moved: one dropped on another merges into it (parts on it move across, a member between them goes),
 * and one dropped on a member splits it.
 */
export function settleNode(model: StructureModel, id: string, tolerance: number): StructureModel {
  const node = model.nodes.find((n) => n.id === id);
  if (!node) return model;
  const other = model.nodes.find((n) => n.id !== id && near(n, node, tolerance));
  if (other) {
    const swap = (n: string) => (n === id ? other.id : n);
    const parts = model.parts
      .map((p): Part => {
        if (p.kind === 'member' || p.kind === 'dim') return { ...p, a: swap(p.a), b: swap(p.b) };
        if (p.kind === 'support' || p.kind === 'angle') return { ...p, node: swap(p.node) };
        if ((p.kind === 'force' || p.kind === 'moment') && 'node' in p.on) return { ...p, on: { node: swap(p.on.node) } };
        return p;
      })
      .filter((p) => !(p.kind === 'member' && p.a === p.b));
    // two supports on one node: the moved node's goes
    const seen = new Set<string>();
    const kept = parts.filter((p) => p.kind !== 'support' || (!seen.has(p.node) && (seen.add(p.node), true)));
    const merged = { nodes: model.nodes.filter((n) => n.id !== id), parts: kept };
    return removeIds(merged, merged.parts.filter((p) => p.kind === 'member' && !merged.nodes.some((n) => n.id === p.a)).map((p) => p.id));
  }
  const on = memberAt(model, node, tolerance);
  if (on && on.member.a !== id && on.member.b !== id) return splitMember(model, on.member.id, on.at, id);
  return model;
}

/** Copies of these parts and the nodes they need, for the clipboard. */
export function copyIds(model: StructureModel, ids: string[]): StructureModel {
  const picked = new Set(ids);
  // members bring their nodes; nodes picked alone come too
  const parts = model.parts.filter((p) => picked.has(p.id));
  const memberIds = new Set(parts.filter((p) => p.kind === 'member').map((p) => p.id));
  const needed = new Set([...ids, ...parts.flatMap((p) => (p.kind === 'member' ? [p.a, p.b] : []))]);
  // loads and supports on what's copied come along
  const extras = model.parts.filter((p) => !picked.has(p.id) && ((p.kind === 'support' && needed.has(p.node)) || (p.kind === 'dist' && memberIds.has(p.member)) || ((p.kind === 'force' || p.kind === 'moment') && ('node' in p.on ? needed.has(p.on.node) : memberIds.has(p.on.member)))));
  const all = [...parts, ...extras].filter((p) => p.kind !== 'support' || needed.has(p.node));
  return { nodes: model.nodes.filter((n) => needed.has(n.id)), parts: all.filter((p) => p.kind !== 'member' || (needed.has(p.a) && needed.has(p.b))) };
}

/** Pastes copied nodes and parts, moved by an offset, with fresh ids and letters; returns their ids. */
export function pasteInto(model: StructureModel, clip: StructureModel, offset: Pt): { model: StructureModel; ids: string[] } {
  let next = model;
  const ids = new Map<string, string>();
  for (const n of clip.nodes) {
    const id = newId(next, 'n');
    ids.set(n.id, id);
    next = { ...next, nodes: [...next.nodes, { ...n, id, x: n.x + offset.x, y: n.y + offset.y, name: n.name ? nextLetter(next) : undefined }] };
  }
  // placeholders, so each new id skips the ones before it
  let taken = next;
  for (const p of clip.parts) {
    const id = newId(taken, p.kind === 'member' ? 'm' : 'p');
    ids.set(p.id, id);
    taken = { ...taken, parts: [...taken.parts, { ...p, id }] };
  }
  const map = (id: string) => ids.get(id) ?? id;
  const moved = (p: Pt) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const parts = clip.parts.map((p): Part => {
    const id = map(p.id);
    switch (p.kind) {
      case 'member':
      case 'dim':
        return { ...p, id, a: map(p.a), b: map(p.b) };
      case 'support':
      case 'angle':
        return { ...p, id, node: map(p.node) };
      case 'force':
      case 'moment':
        return { ...p, id, on: 'node' in p.on ? { node: map(p.on.node) } : { member: map(p.on.member), at: p.on.at } };
      case 'dist':
        return { ...p, id, member: map(p.member) };
      case 'label':
      case 'axes':
        return { ...p, id, at: moved(p.at) };
      case 'cut':
        return { ...p, id, p: moved(p.p), q: moved(p.q) };
    }
  });
  return { model: { ...next, parts: [...next.parts, ...parts] }, ids: [...clip.nodes.map((n) => map(n.id)), ...parts.map((p) => p.id)] };
}

// ─── placing from the rail ───

/** The member a point is on or beside (within tolerance of the line between its ends), and how far along. */
export function memberNear(model: StructureModel, at: Pt, tolerance: number): { member: Member; at: number } | null {
  let best: { member: Member; at: number; off: number } | null = null;
  for (const member of members(model)) {
    const f = frameOf(model, member);
    const s = Math.max(0, Math.min(f.length, (at.x - f.a.x) * f.u.x + (at.y - f.a.y) * f.u.y));
    const off = dist(at, { x: f.a.x + f.u.x * s, y: f.a.y + f.u.y * s });
    if (off <= tolerance && (!best || off < best.off)) best = { member, at: s, off };
  }
  return best && { member: best.member, at: best.at };
}

/** The angle that turns a support's symbol to face the members on its node (a wall behind a cantilever's end). */
function facing(model: StructureModel, node: string) {
  const on = members(model).filter((m) => m.a === node || m.b === node);
  if (!on.length) return 0;
  const u = on.reduce((sum, m) => {
    const f = frameOf(model, m);
    const out = m.a === node ? f.u : { x: -f.u.x, y: -f.u.y };
    return { x: sum.x + out.x, y: sum.y + out.y };
  }, { x: 0, y: 0 });
  return Math.round((Math.atan2(-u.x, u.y) * 180) / Math.PI);
}

const SUPPORT_TOOLS: SupportType[] = ['pin', 'roller', 'fixed', 'guided', 'spring', 'rotspring'];

/**
 * A rail tool used at one point: a joint, a hinge, a released end, a support, a load, a label, an angle or axes. Gives
 * the model and the id to select, or null when the tool needs something there (a load needs a node or a member).
 */
export function placeTool(model: StructureModel, tool: string, at: Pt, tolerance: number): { model: StructureModel; id: string } | null {
  const near = model.nodes.find((n) => dist(n, at) <= tolerance);
  const onMember = memberNear(model, at, tolerance);
  if (tool === 'joint' || tool === 'hinge') {
    const placed = nodeAt(model, at, tolerance);
    if (tool === 'joint') return { model: placed.model, id: placed.node };
    return { model: { ...placed.model, nodes: placed.model.nodes.map((n) => (n.id === placed.node ? { ...n, hinge: !n.hinge || undefined } : n)) }, id: placed.node };
  }
  if (tool === 'release') {
    if (!onMember || onMember.member.bar) return null;
    const end = onMember.at < frameOf(model, onMember.member).length / 2 ? 0 : 1;
    const release: [boolean, boolean] = [...(onMember.member.release ?? [false, false])] as [boolean, boolean];
    release[end] = !release[end];
    return { model: { ...model, parts: model.parts.map((p) => (p.id === onMember.member.id ? { ...onMember.member, release: release[0] || release[1] ? release : undefined } : p)) }, id: onMember.member.id };
  }
  if (tool.startsWith('support:')) {
    const type = tool.slice(8) as SupportType;
    if (!SUPPORT_TOOLS.includes(type)) return null;
    const placed = nodeAt(model, at, tolerance);
    const id = newId(placed.model, 'p');
    const angle = type === 'fixed' || type === 'guided' ? facing(placed.model, placed.node) : 0;
    const support: Support = { id, kind: 'support', node: placed.node, type, ...(angle && { angle }) };
    // one support a node: a new one replaces the old
    return { model: { ...placed.model, parts: [...placed.model.parts.filter((p) => !(p.kind === 'support' && p.node === placed.node)), support] }, id };
  }
  const id = newId(model, 'p');
  const add = (part: Part) => ({ model: { ...model, parts: [...model.parts, part] }, id });
  const on: Place | null = near ? { node: near.id } : onMember ? { member: onMember.member.id, at: onMember.at } : null;
  if (tool === 'force') return on && add({ id, kind: 'force', on, value: 10, angle: -90 });
  if (tool === 'moment-ccw' || tool === 'moment-cw') return on && add({ id, kind: 'moment', on, value: 10, ...(tool === 'moment-cw' && { cw: true }) });
  if (tool === 'udl' || tool === 'linear') {
    const hit = onMember ?? memberNear(model, at, tolerance * 2);
    if (!hit || hit.member.bar) return null;
    const length = frameOf(model, hit.member).length;
    return add({ id, kind: 'dist', member: hit.member.id, from: 0, to: length, w1: tool === 'udl' ? 10 : 0, w2: 10, angle: -90 });
  }
  if (tool === 'label') return add({ id, kind: 'label', at, text: 'Label' });
  if (tool === 'axes') return add({ id, kind: 'axes', at });
  if (tool === 'angle') return near ? add({ id, kind: 'angle', node: near.id, from: 0, to: 45, label: '$\\theta$' }) : null;
  return null;
}

/** A two-point tool from a to b: a beam or bar between nodes (made or split as needed), a dimension, or a section cut. */
export function connect(model: StructureModel, tool: string, a: Pt, b: Pt, tolerance: number): { model: StructureModel; id: string } | null {
  if (dist(a, b) <= tolerance) return null;
  if (tool === 'beam' || tool === 'bar') {
    const first = nodeAt(model, a, tolerance);
    const second = nodeAt(first.model, b, tolerance);
    if (first.node === second.node) return null;
    const next = second.model;
    const same = next.parts.find((p) => p.kind === 'member' && ((p.a === first.node && p.b === second.node) || (p.a === second.node && p.b === first.node)));
    if (same) return { model: next, id: same.id };
    const id = newId(next, 'm');
    return { model: { ...next, parts: [...next.parts, { id, kind: 'member', a: first.node, b: second.node, ...(tool === 'bar' && { bar: true }) }] }, id };
  }
  if (tool.startsWith('dim-')) {
    const [na, nb] = [a, b].map((p) => model.nodes.find((n) => dist(n, p) <= tolerance));
    if (!na || !nb || na.id === nb.id) return null;
    const id = newId(model, 'p');
    const dir = tool.slice(4) as Dimension['dir'];
    const span = Math.max(dist(na, nb), tolerance * 4);
    return { model: { ...model, parts: [...model.parts, { id, kind: 'dim', a: na.id, b: nb.id, dir, offset: -Math.round(span * 0.25 * 100) / 100 }] }, id };
  }
  if (tool === 'cut') {
    const id = newId(model, 'p');
    return { model: { ...model, parts: [...model.parts, { id, kind: 'cut', p: a, q: b }] }, id };
  }
  return null;
}

// ─── a starting drawing ───

/** The chooser's starting beam: 6 m, simply supported, 10 kN/m along it. */
export function sampleBeam(): StructureModel {
  return {
    nodes: [
      { id: 'n1', x: 0, y: 0, name: 'A' },
      { id: 'n2', x: 6, y: 0, name: 'B' }
    ],
    parts: [
      { id: 'm1', kind: 'member', a: 'n1', b: 'n2' },
      { id: 'p1', kind: 'support', node: 'n1', type: 'pin' },
      { id: 'p2', kind: 'support', node: 'n2', type: 'roller' },
      { id: 'p3', kind: 'dist', member: 'm1', from: 0, to: 6, w1: 10, w2: 10, angle: -90 },
      { id: 'p4', kind: 'dim', a: 'n1', b: 'n2', dir: 'h', offset: -1.6 }
    ]
  };
}
