// The chooser's pre-drawn structures (starters.ts): the beams, trusses and frames a statics course starts from, each
// stable and solved as it opens. structures.check.ts checks each one's reactions against a hand calculation.
import type { Part, SNode, StructureModel, SupportType } from './model';

/** A drawing from joints written 'A 0 0', and its parts. */
function drawing(joints: string[], parts: Part[]): StructureModel {
  const nodes = joints.map((j): SNode => {
    const [name, x, y, flag] = j.split(' ');
    return { id: name, x: Number(x), y: Number(y), name, ...(flag === 'hinge' && { hinge: true }) };
  });
  return { nodes, parts };
}

let n = 0;
const id = () => `p${(n += 1)}`;
const member = (a: string, b: string): Part => ({ id: `m${a}${b}`, kind: 'member', a, b });
const bar = (a: string, b: string): Part => ({ id: `m${a}${b}`, kind: 'member', a, b, bar: true });
const support = (node: string, type: SupportType, angle?: number): Part => ({ id: id(), kind: 'support', node, type, ...(angle && { angle }) });
const force = (node: string, value: number, angle = -90): Part => ({ id: id(), kind: 'force', on: { node }, value, angle });
const along = (m: string, at: number, value: number): Part => ({ id: id(), kind: 'force', on: { member: m, at }, value, angle: -90 });
const moment = (node: string, value: number, cw?: boolean): Part => ({ id: id(), kind: 'moment', on: { node }, value, ...(cw && { cw }) });
const load = (m: string, from: number, to: number, w1: number, w2 = w1, projected?: boolean): Part => ({ id: id(), kind: 'dist', member: m, from, to, w1, w2, angle: -90, ...(projected && { projected }) });
const dim = (a: string, b: string, dir: 'h' | 'v', offset: number): Part => ({ id: id(), kind: 'dim', a, b, dir, offset });
const cut = (x: number, y0: number, y1: number): Part => ({ id: id(), kind: 'cut', p: { x, y: y1 }, q: { x, y: y0 } });

// ─── beams ───

/** 4 m, fixed at A, 10 kN and 5 kN m clockwise at its free end */
export const cantilever = () => drawing(['A 0 0', 'B 4 0'], [member('A', 'B'), support('A', 'fixed', -90), force('B', 10), moment('B', 5, true), dim('A', 'B', 'h', -1.2)]);

/** pin and roller 6 m apart, 10 kN/m between them, 15 kN at the end of a 2 m overhang */
export const overhangingBeam = () =>
  drawing(['A 0 0', 'B 6 0', 'C 8 0'], [member('A', 'B'), member('B', 'C'), support('A', 'pin'), support('B', 'roller'), load('mAB', 0, 6, 10), force('C', 15), dim('A', 'B', 'h', -1.6), dim('B', 'C', 'h', -1.6)]);

/** 6 m, fixed at A and on a roller at B, 10 kN/m */
export const proppedCantilever = () => drawing(['A 0 0', 'B 6 0'], [member('A', 'B'), support('A', 'fixed', -90), support('B', 'roller'), load('mAB', 0, 6, 10), dim('A', 'B', 'h', -1.6)]);

/** two 5 m spans, 10 kN/m over both */
export const twoSpanBeam = () =>
  drawing(['A 0 0', 'B 5 0', 'C 10 0'], [member('A', 'B'), member('B', 'C'), support('A', 'pin'), support('B', 'roller'), support('C', 'roller'), load('mAB', 0, 5, 10), load('mBC', 0, 5, 10), dim('A', 'B', 'h', -1.6), dim('B', 'C', 'h', -1.6)]);

/** a Gerber beam: fixed at A, a hinge at B, a roller at C; 5 kN/m on AB and 20 kN in the middle of BC */
export const hingedBeam = () =>
  drawing(['A 0 0', 'B 4 0 hinge', 'C 8 0'], [member('A', 'B'), member('B', 'C'), support('A', 'fixed', -90), support('C', 'roller'), load('mAB', 0, 4, 5), along('mBC', 2, 20), dim('A', 'B', 'h', -1.6), dim('B', 'C', 'h', -1.6)]);

/** 6 m, simply supported, a load rising from nothing at A to 12 kN/m at B */
export const triangularLoad = () => drawing(['A 0 0', 'B 6 0'], [member('A', 'B'), support('A', 'pin'), support('B', 'roller'), load('mAB', 0, 6, 0, 12), dim('A', 'B', 'h', -1.6)]);

// ─── trusses: four 3 m panels (Warren: three of 4 m), 3 m deep, a section cut through the second panel ───

const chords = ['A 0 0', 'B 3 0', 'C 6 0', 'D 9 0', 'E 12 0', 'F 3 3', 'G 6 3', 'H 9 3'];
/** the chords, end posts and verticals of a Pratt or Howe truss, pinned at A and on a roller at E, 10 kN at B, C and D */
const panelled = (diagonals: Part[]) =>
  drawing(chords, [
    ...['AB', 'BC', 'CD', 'DE', 'FG', 'GH', 'AF', 'HE', 'BF', 'CG', 'DH'].map(([a, b]) => bar(a, b)),
    ...diagonals,
    support('A', 'pin'),
    support('E', 'roller'),
    force('B', 10),
    force('C', 10),
    force('D', 10),
    cut(4.5, -0.6, 3.6),
    dim('A', 'E', 'h', -1.6),
    dim('E', 'H', 'v', 1)
  ]);

/** diagonals running down towards the middle, in tension under gravity */
export const prattTruss = () => panelled([bar('F', 'C'), bar('H', 'C')]);

/** diagonals running up towards the middle, in compression under gravity */
export const howeTruss = () => panelled([bar('B', 'G'), bar('D', 'G')]);

/** triangles without verticals, 10 kN at B and C */
export const warrenTruss = () =>
  drawing(['A 0 0', 'B 4 0', 'C 8 0', 'D 12 0', 'E 2 3', 'F 6 3', 'G 10 3'], [
    ...['AB', 'BC', 'CD', 'EF', 'FG', 'AE', 'EB', 'BF', 'FC', 'CG', 'GD'].map(([a, b]) => bar(a, b)),
    support('A', 'pin'),
    support('D', 'roller'),
    force('B', 10),
    force('C', 10),
    cut(5, -0.6, 3.6),
    dim('A', 'D', 'h', -1.6),
    dim('D', 'G', 'v', 1)
  ]);

// ─── frames ───

/** fixed at both feet, 4 m high and 6 m wide: 10 kN sideways at B, 5 kN/m along the beam */
export const portalFrame = () =>
  drawing(['A 0 0', 'B 0 4', 'C 6 4', 'D 6 0'], [member('A', 'B'), member('B', 'C'), member('C', 'D'), support('A', 'fixed'), support('D', 'fixed'), force('B', 10, 0), load('mBC', 0, 6, 5), dim('A', 'D', 'h', -1.6), dim('D', 'C', 'v', 1.2)]);

/** pinned at both feet and hinged at the ridge: snow on plan, 5 kN/m on both rafters, and 10 kN sideways at B */
export const threeHingedFrame = () =>
  drawing(['A 0 0', 'B 0 4', 'C 4 6 hinge', 'D 8 4', 'E 8 0'], [
    member('A', 'B'),
    member('B', 'C'),
    member('C', 'D'),
    member('D', 'E'),
    support('A', 'pin'),
    support('E', 'pin'),
    load('mBC', 0, Math.hypot(4, 2), 5, 5, true),
    load('mCD', 0, Math.hypot(4, 2), 5, 5, true),
    force('B', 10, 0),
    dim('A', 'E', 'h', -1.6),
    dim('E', 'C', 'v', 1.2)
  ]);

/** a member rising 3 m over 4 m, pinned at its foot and on a roller at its head, 2 kN/m along its length */
export const inclinedMember = () =>
  drawing(['A 0 0', 'B 4 3'], [
    member('A', 'B'),
    support('A', 'pin'),
    support('B', 'roller'),
    load('mAB', 0, 5, 2),
    { id: id(), kind: 'angle', node: 'A', from: 0, to: 36.87, label: '$\\theta$' },
    dim('A', 'B', 'h', -1.4),
    dim('A', 'B', 'v', 1.2)
  ]);
