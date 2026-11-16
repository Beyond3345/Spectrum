// Hydrostatic force on a plane gate, a Form preset: a rectangular or circular gate at any angle, its top edge at a depth
// (or above the free surface), a fluid on one side and optionally another on the other, hinged at one edge and held
// by a stop at the other. It works out the resultant force F_R, its centre of pressure and the forces on the stop and
// the hinge, and draws them as the course's slides and exam papers do: the fluid with its ▽ mark, the hatched wall and
// bed, the gate, the pressure prism with its pressures, F_R in red at the centre of pressure, and the dimensions.
import { unitWriter } from '../../units';
import { at as pt, fluidFields, fluidOf, fmt, G, LOOK_FIELD, pictureOf, pressure, results, RESULTS_FIELD, scene } from './fluids';
import type { Pt } from './fluids';
import type { FormPreset, FormValues } from './presets';

export type GateInput = {
  shape: 'rectangle' | 'circle';
  /** along the gate (a circle's diameter), m */
  length: number;
  /** a rectangle's, m */
  width: number;
  /** to the horizontal, degrees */
  angle: number;
  /** depth of the top edge below the free surface, m; negative above it */
  top: number;
  rho: number;
  hinge: 'top' | 'bottom' | 'none';
  /** a fluid on the other side: its density and its depth at the gate's foot */
  other?: { rho: number; depth: number };
  g?: number;
};

/**
 * ρg∫h·w dξ over the wetted part of the gate from ξ = from to to (ξ along it from its top edge), and where it acts.
 * Simpson's rule, exact for a rectangle; a circle is taken through ξ = R(1 − cos t), which keeps the integrand smooth.
 */
function sideForce(input: GateInput, depth: (xi: number) => number, from: number, to: number, rhoG: number) {
  if (to - from <= 1e-12 || rhoG <= 0) return { F: 0, xi: NaN };
  const R = input.length / 2;
  const t = (xi: number) => Math.acos(Math.min(1, Math.max(-1, 1 - xi / R)));
  const [t0, t1] = input.shape === 'circle' ? [t(from), t(to)] : [from, to];
  const xiOf = (u: number) => (input.shape === 'circle' ? R * (1 - Math.cos(u)) : u);
  const wOf = (u: number) => (input.shape === 'circle' ? 2 * R * R * Math.sin(u) ** 2 : input.width);
  const n = 400;
  let [F, M] = [0, 0];
  for (let i = 0; i <= n; i += 1) {
    const u = t0 + ((t1 - t0) * i) / n;
    const c = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * ((t1 - t0) / n / 3);
    const xi = xiOf(u);
    const f = rhoG * Math.max(0, depth(xi)) * wOf(u) * c;
    F += f;
    M += f * xi;
  }
  return F > 0 ? { F, xi: M / F } : { F: 0, xi: NaN };
}

/** The gate's numbers, N and m: each side's force, where it acts (ξ from the top edge, y_p along the plane from the free surface, h_p its depth), and the stop's and hinge's forces. */
export function gate(input: GateInput) {
  const { length: L, top } = input;
  const g = input.g ?? G;
  const s = Math.sin((input.angle * Math.PI) / 180);
  const clamp = (x: number) => Math.min(L, Math.max(0, x));
  const one = sideForce(input, (xi) => top + xi * s, clamp(-top / s), L, input.rho * g);
  const o = input.other;
  const two = o ? sideForce(input, (xi) => o.depth - (L - xi) * s, clamp(L - o.depth / s), L, o.rho * g) : { F: 0, xi: NaN };
  // moments about the hinge, the stop at the other edge; positive: it pushes back towards the first fluid
  const arm = (xi: number) => (input.hinge === 'bottom' ? L - xi : xi);
  const moment = (one.F ? one.F * arm(one.xi) : 0) - (two.F ? two.F * arm(two.xi) : 0);
  const stop = input.hinge === 'none' ? null : moment / L;
  const net = one.F - two.F;
  return {
    F1: one.F,
    xi1: one.xi,
    yp1: one.xi + top / s,
    hp1: top + one.xi * s,
    F2: two.F,
    xi2: two.xi,
    yp2: o ? two.xi - (L - o.depth / s) : NaN,
    net,
    stop,
    hinge: stop === null ? null : net - stop,
    pressures: {
      top1: input.rho * g * Math.max(0, top),
      bottom1: input.rho * g * Math.max(0, top + L * s),
      top2: o ? o.rho * g * Math.max(0, o.depth - L * s) : 0,
      bottom2: o ? o.rho * g * Math.max(0, o.depth) : 0
    }
  };
}

const num = (v: FormValues, key: string) => Number(v[key]);

export function gateDrawing(values: FormValues, style: Record<string, unknown>) {
  const f1 = fluidOf(values, 'fluid');
  const f2 = fluidOf(values, 'fluid2');
  const look = String(values.look);
  const input: GateInput = {
    shape: values.shape === 'circle' ? 'circle' : 'rectangle',
    length: num(values, 'length'),
    width: num(values, 'width'),
    angle: num(values, 'angle'),
    top: num(values, 'top'),
    rho: f1.rho,
    hinge: (['top', 'bottom', 'none'].includes(String(values.hinge)) ? values.hinge : 'top') as GateInput['hinge'],
    ...(values.other === true && { other: { rho: f2.rho, depth: num(values, 'depth2') } }),
    g: num(values, 'g')
  };
  const r = gate(input);
  const { length: L, top } = input;
  const theta = (input.angle * Math.PI) / 180;
  const [s, c] = [Math.sin(theta), Math.cos(theta)];
  const si = unitWriter(style.siUnits === true, style.physics === true);
  const kN = (n: number) => fmt(n / 1000);
  const metres = (m: number) => si.qty(fmt(m, 3), 'm');
  const two = !!input.other;

  // metres to cm: the gate's top edge at x 0, the free surface at y 0, the gate going down and back under the fluid
  const u = { x: -c, y: -s };
  const n1 = { x: -s, y: c };
  const along = (xi: number) => ({ x: xi * u.x, y: -top + xi * u.y });
  const yBed = -top - L * s;
  const high = Math.max(0, -top, two ? yBed + input.other!.depth : 0);
  const k = 5 / Math.max(high - yBed, L * c, 1e-6);
  const P = (p: Pt) => ({ x: p.x * k, y: p.y * k });
  const add = (p: Pt, d: Pt, t: number) => ({ x: p.x + d.x * t, y: p.y + d.y * t });
  const T = P(along(0));
  const B = P(along(L));
  const O = P(along(-top / s));
  const xL = Math.min(T.x, B.x) - 2.6;
  const xR = Math.max(T.x, B.x) + (two ? 4.6 : 1.4);
  const yB = B.y;
  const at = (xi: number) => P(along(xi));
  const sc = scene(look);

  // the fluids, their free surfaces and the bed
  if (r.F1 > 0 || top + L * s > 0) {
    const poly = top > 0 ? [{ x: xL, y: 0 }, { x: T.x, y: 0 }, T, B, { x: xL, y: yB }] : [{ x: xL, y: 0 }, O, B, { x: xL, y: yB }];
    sc.add('% The fluid');
    sc.fill(poly, f1, look);
    sc.add(`\\draw[line width=0.5pt] ${pt({ x: xL, y: 0 })} -- ${pt({ x: top > 0 ? T.x : O.x, y: 0 })};`);
    sc.seg([{ x: xL, y: 0 }, top > 0 ? { x: T.x, y: 0 } : O]);
    sc.surface({ x: xL + 0.45, y: 0 });
  }
  let y2 = yBed;
  if (input.other) {
    y2 = (yBed + input.other.depth) * k;
    const W = input.other.depth >= L * s ? T : P(along(L - input.other.depth / s));
    sc.add('% The fluid on the other side');
    sc.fill([{ x: xR, y: yB }, B, W, ...(input.other.depth > L * s ? [{ x: T.x, y: y2 }] : []), { x: xR, y: y2 }], f2, look);
    sc.add(`\\draw[line width=0.5pt] ${pt(input.other.depth > L * s ? { x: T.x, y: y2 } : W)} -- ${pt({ x: xR, y: y2 })};`);
    sc.seg([W, { x: xR, y: y2 }]);
    sc.surface({ x: Math.max(T.x, B.x) + 1.3, y: y2 });
  }
  sc.add('% The bed, and the wall the gate hangs from');
  sc.hatched({ x: xL, y: yB }, { x: xR, y: yB }, -1);
  if (top > 0) sc.hatched(T, { x: T.x, y: 0.6 }, -1);
  // a sloping gate under the surface: its plane carried up to the free surface, where y_p is measured from
  if (top > 0 && input.angle < 90 - 1e-9) sc.add(`\\draw[dashed, line width=0.3pt] ${pt(T)} -- ${pt(O)};`);

  // the gate: a plate on the dry side of its wetted face
  const back = (p: Pt) => add(p, n1, -0.1);
  sc.add('% The gate', `\\filldraw[fill=${look === 'exam' ? 'black!80' : 'orange!35'}, line width=0.5pt] ${pt(T)} -- ${pt(B)} -- ${pt(back(B))} -- ${pt(back(T))} -- cycle;`);
  sc.seg([T, B, back(B), back(T)], true);

  // the pressure prisms: arrows normal to the gate, as long as the pressure there
  const pMax = Math.max(r.pressures.bottom1, r.pressures.bottom2, 1e-9);
  const scale = 1.4 / pMax;
  const prism = (from: number, p: (xi: number) => number, side: 1 | -1, colour: string) => {
    const d = { x: n1.x * side, y: n1.y * side };
    const face = (xi: number) => (side === 1 ? at(xi) : back(at(xi)));
    const tip = (xi: number) => add(face(xi), d, p(xi) * scale);
    const arrows = Array.from({ length: 7 }, (_, i) => from + ((L - from) * i) / 6).filter((xi) => p(xi) * scale > 0.12);
    sc.add(`\\draw[line width=0.4pt, ${colour}] ${pt(face(from))} -- ${pt(tip(from))} -- ${pt(tip(L))} -- ${pt(face(L))};`);
    for (const xi of arrows) {
      sc.add(`\\draw[->, line width=0.4pt, ${colour}] ${pt(tip(xi))} -- ${pt(face(xi))};`);
      sc.seg([tip(xi), face(xi)]);
    }
    sc.seg([face(from), tip(from), tip(L), face(L)]);
    return tip;
  };
  const wet1 = Math.min(L, Math.max(0, -top / s));
  const pressureLabel = (p: Pt, pa: number, d: Pt) => {
    const [value, unit] = pressure(pa);
    sc.label(p, si.qty(value, unit), d);
  };
  const green = look === 'exam' ? 'black' : 'green!45!black';
  const blue = look === 'exam' ? 'black' : 'blue!70!black';
  const red = look === 'exam' ? 'black' : 'red!80!black';
  if (r.F1 > 0) {
    sc.add('% Pressure on the gate');
    const tip = prism(wet1, (xi) => f1.rho * (input.g ?? G) * (top + xi * s), 1, green);
    if (r.pressures.top1 > 0) pressureLabel(tip(0), r.pressures.top1, n1);
    pressureLabel(tip(L), r.pressures.bottom1, n1);
  }
  if (input.other && r.F2 > 0) {
    const o = input.other;
    sc.add('% Pressure from the other side');
    const from = Math.min(L, Math.max(0, L - o.depth / s));
    const tip2 = prism(from, (xi) => o.rho * (input.g ?? G) * (o.depth - (L - xi) * s), -1, blue);
    if (r.pressures.top2 > 0) pressureLabel(tip2(0), r.pressures.top2, { x: -n1.x, y: -n1.y });
    pressureLabel(tip2(L), r.pressures.bottom2, { x: -n1.x, y: -n1.y });
  }

  // the resultants at their centres of pressure
  const resultant = (xi: number, F: number, side: 1 | -1, name: string, colour: string) => {
    const face = side === 1 ? at(xi) : back(at(xi));
    const p = (side === 1 ? f1.rho * (input.g ?? G) * (top + xi * s) : input.other!.rho * (input.g ?? G) * (input.other!.depth - (L - xi) * s)) * scale;
    const tail = add(face, { x: n1.x * side, y: n1.y * side }, p + 0.7);
    sc.add(`\\draw[-{Stealth[length=2.6mm]}, line width=1.2pt, ${colour}] ${pt(tail)} -- ${pt(face)};`);
    sc.seg([tail, face]);
    sc.label(tail, si.equals(name, kN(F), 'kN'), { x: n1.x * side, y: n1.y * side + 0.4 });
  };
  sc.add('% The resultant force at the centre of pressure');
  if (r.F1 > 0) resultant(r.xi1, r.F1, 1, two ? 'F_{R1}' : 'F_R', red);
  if (input.other && r.F2 > 0) resultant(r.xi2, r.F2, -1, 'F_{R2}', blue);

  // the hinge A and the stop B, with the stop's force
  if (input.hinge !== 'none') {
    const hingeEnd = input.hinge === 'top' ? 0 : L;
    const stopEnd = L - hingeEnd;
    const inward = input.hinge === 'top' ? { x: -u.x, y: -u.y } : u;
    const H = add(at(hingeEnd), n1, -0.05);
    sc.add('% The hinge and the stop', `\\filldraw[fill=white, line width=0.5pt] ${pt(H)} circle (0.09);`);
    sc.items.push({ t: 'dot', at: H, r: 0.09 });
    const E = back(at(stopEnd));
    const wedge = [E, add(E, n1, -0.3), add(E, inward, 0.25)];
    sc.add(`\\filldraw[fill=black!45, line width=0.4pt] ${wedge.map(pt).join(' -- ')} -- cycle;`);
    sc.seg(wedge, true);
    sc.label(H, '$A$', { x: -n1.x + 0.3, y: -n1.y + 0.6 });
    sc.label(E, '$B$', { x: -n1.x, y: -n1.y - 0.6 });
    if (r.stop !== null && Math.abs(r.stop) > 1e-9) {
      // from the dry side, just past the wedge, when it holds the gate against the first fluid; else from that fluid's side
      const to = r.stop > 0 ? add(E, inward, 0.32) : add(at(stopEnd), inward, 0.32);
      const from = add(to, n1, r.stop > 0 ? -1.1 : 1.1);
      sc.add(`\\draw[-{Stealth[length=2.6mm]}, line width=1.2pt, ${red}] ${pt(from)} -- ${pt(to)};`);
      sc.seg([from, to]);
      // beyond its tail, towards the gate's middle (off the bed for a stop at the foot)
      const sign = r.stop > 0 ? -1 : 1;
      sc.label(from, si.equals('F_B', kN(Math.abs(r.stop)), 'kN'), { x: n1.x * sign + inward.x * 0.5, y: n1.y * sign + inward.y * 0.5 });
    }
  }

  // dimensions along the gate on its dry side: the free surface to the top edge, the gate, then y_p
  // with a fluid on the other side too, beyond its depth's dimension at the right
  const offset = input.other ? (xR + 0.55 - Math.max(T.x, B.x)) / s : 0.55;
  const off1 = { x: -n1.x * offset, y: -n1.y * offset };
  const off2 = { x: -n1.x * (offset + 1.1), y: -n1.y * (offset + 1.1) };
  const xiO = -top / s;
  const stops = [...new Set([0, L, ...(xiO < L ? [xiO] : [])])].sort((a, b) => a - b);
  sc.add('% Dimensions');
  for (let i = 1; i < stops.length; i += 1) sc.dimension(at(stops[i - 1]), at(stops[i]), off1, metres(stops[i] - stops[i - 1]));
  // ponytail: with fluid on both sides y_p's extension line would cross the other side, so its value is in the results only
  if (r.F1 > 0 && !input.other) sc.dimension(O, at(r.xi1), off2, si.equals('y_p', fmt(r.yp1, 3), 'm'));
  if (input.other) sc.dimension({ x: xR, y: yB }, { x: xR, y: y2 }, { x: -0.35, y: 0 }, metres(input.other.depth));
  if (input.angle < 90 - 1e-9) {
    sc.add(`\\draw[line width=0.4pt] ${pt(add(B, { x: 1, y: 0 }, 0.6))} arc[start angle=0, end angle=${fmt(input.angle, 6)}, radius=0.6];`);
    sc.items.push({ t: 'arc', c: B, r: 0.6, from: 0, to: input.angle });
    // past the arc's foot on the bed, clear of the stop's arrow, which crosses the arc
    sc.label({ x: B.x + 0.62, y: B.y + 0.06 }, `$\\theta = ${fmt(input.angle, 3)}^\\circ$`, { x: 1, y: 0.35 });
  }
  sc.label({ x: xL + 0.15, y: (yB + 0) / 2 - 0.25 }, f1.label, { x: 1, y: 0 });
  if (input.other) sc.label({ x: xR - 0.1, y: y2 - 0.1 }, f2.label, { x: -1, y: -1 });

  const area = input.shape === 'circle' ? (Math.PI * L * L) / 4 : L * input.width;
  const comments = [
    `Hydrostatic force on a ${input.shape} gate: ${fmt(L, 3)} m along it${input.shape === 'rectangle' ? `, ${fmt(input.width, 3)} m wide` : ''}, ${fmt(input.angle, 3)} degrees to the horizontal, top edge ${fmt(top, 3)} m deep; area ${fmt(area)} m2`,
    `F_R = ${kN(r.F1)} kN at y_p = ${fmt(r.yp1)} m along the plane from the free surface, ${fmt(r.hp1)} m deep`,
    ...(input.other ? [`Other side: F_R2 = ${kN(r.F2)} kN at y_p = ${fmt(r.yp2)} m from its free surface; net ${kN(r.net)} kN`] : []),
    ...(r.stop !== null ? [`Force on the stop B = ${kN(r.stop)} kN, on the hinge A = ${kN(r.hinge!)} kN (positive towards the first fluid)`] : [])
  ];
  if (values.results === true) {
    const parts = [
      r.F1 > 0 ? `${si.equals(two ? 'F_{R1}' : 'F_R', kN(r.F1), 'kN')} at ${si.equals('y_p', fmt(r.yp1, 3), 'm')}` : 'The gate is clear of the fluid',
      ...(input.other && r.F2 > 0 ? [`${si.equals('F_{R2}', kN(r.F2), 'kN')} at ${si.equals('y_p', fmt(r.yp2, 3), 'm')}`] : []),
      ...(r.stop !== null ? [`stop ${si.equals('F_B', kN(r.stop), 'kN')}, hinge ${si.equals('F_A', kN(r.hinge!), 'kN')}`] : [])
    ];
    results(sc, (xL + xR) / 2, parts);
  }
  return pictureOf(sc, comments, si.used);
}


export const GATE: FormPreset = {
  id: 'gate',
  label: 'Hydrostatic force on a gate',
  version5: true,
  fields: [
    { key: 'shape', label: 'Gate', kind: 'choice', options: [['rectangle', 'Rectangle'], ['circle', 'Circle']] },
    { key: 'length', label: 'Length along the gate', kind: 'number', unit: 'm', min: 0.01, max: 1000, hint: 'Its height when it’s vertical; its diameter for a circle.' },
    { key: 'width', label: 'Width', kind: 'number', unit: 'm', min: 0.001, max: 1000, shown: (v) => v.shape !== 'circle' },
    { key: 'angle', label: 'Angle to the horizontal', kind: 'number', unit: '°', min: 10, max: 90, hint: '90 for a vertical gate. A sloping gate leans back under the fluid.' },
    { key: 'top', label: 'Depth of the top edge', kind: 'number', unit: 'm', min: -1000, max: 1000, hint: 'Below the free surface; negative when the top edge is above it.' },
    ...fluidFields('fluid', 'Fluid'),
    {
      key: 'hinge',
      label: 'Hinge',
      kind: 'choice',
      options: [['top', 'Top edge (A), stop at the bottom (B)'], ['bottom', 'Bottom edge (A), stop at the top (B)'], ['none', 'None']]
    },
    { key: 'other', label: 'Fluid on the other side too', kind: 'switch' },
    ...fluidFields('fluid2', 'Other side’s fluid', (v) => v.other === true),
    { key: 'depth2', label: 'Its depth at the gate’s foot', kind: 'number', unit: 'm', min: 0, max: 1000, shown: (v) => v.other === true },
    { key: 'g', label: 'g', kind: 'number', unit: 'm/s²', min: 0.1, max: 100 },
    LOOK_FIELD,
    RESULTS_FIELD
  ],
  // Tutorial 3, question 21(a): a 3 m gate hinged at its top edge 2 m under the water, held by a ridge at its foot
  values: { shape: 'rectangle', length: 3, width: 1, angle: 90, top: 2, fluid: 'water', fluidRD: 0, hinge: 'top', other: false, fluid2: 'seawater', fluid2RD: 0, depth2: 1, g: G, look: 'colour', results: true },
  conventions: ['siUnits'],
  toCode: (values, style) => gateDrawing(values, style).code
};
