// An accelerating tank, a Form preset: an open rectangular tank of liquid moving with a steady acceleration a at an
// angle above the horizontal (along a ramp, say). The free surface tilts at tan θ = a_x/(g + a_z), keeping the liquid's
// volume: both ends wet, or the front dry with a triangle of liquid, or spilling over the rear wall, whichever happens.
// It draws the tank, the original level dashed, the tilted surface with θ and ▽, a, the depths at both walls and the
// pressures at the bottom corners, with the largest acceleration that spills nothing.
import { unitWriter } from '../../units';
import { at, fluidFields, fluidOf, fmt, G, LOOK_FIELD, pictureOf, pressure, results, RESULTS_FIELD, scene } from './fluids';
import type { Pt } from './fluids';
import type { FormPreset, FormValues } from './presets';

export type TankInput = { length: number; height: number; depth: number; a: number; angle: number; rho: number; g?: number };

/**
 * The tank's numbers: the surface z = z0 − t·x (x from the rear wall, t = tan θ signed), the depths at the rear and the
 * front, whether it spills, the bottom pressures and the largest a along this direction that spills nothing.
 * Null when g + a_z ≤ 0, as the liquid then leaves the floor.
 */
export function tank(input: TankInput) {
  const { length: L, height: H, depth: d0 } = input;
  const g = input.g ?? G;
  const r = (input.angle * Math.PI) / 180;
  const [ax, az] = [input.a * Math.cos(r), input.a * Math.sin(r)];
  if (g + az <= 0) return null;
  const t = ax / (g + az);
  const m = Math.abs(t);
  // the depth at the high end and how far along from it the liquid reaches, keeping its volume (L·d0)
  let high = d0 + (m * L) / 2;
  let wet = L;
  if (m * L > 2 * d0) {
    wet = Math.sqrt((2 * L * d0) / m);
    high = m * wet;
  }
  const spills = high > H + 1e-12;
  if (spills) {
    high = H;
    wet = Math.min(L, H / m);
  }
  const low = Math.max(0, high - m * L);
  const [rear, front] = t >= 0 ? [high, low] : [low, high];
  // the largest a this way that spills nothing: the high end at the rim, the front wet or dry
  const tMax = d0 >= H / 2 ? (2 * (H - d0)) / L : (H * H) / (2 * L * d0);
  // |a_x|/(g + a_z) = tMax for a of magnitude A in a's own sense along the angle
  const den = Math.cos(r) - (input.a < 0 ? -1 : 1) * tMax * Math.sin(r);
  return {
    ax,
    az,
    t,
    theta: (Math.atan(m) * 180) / Math.PI,
    rear,
    front,
    wet,
    spills,
    pRear: input.rho * (g + az) * rear,
    pFront: input.rho * (g + az) * front,
    aMax: den > 1e-12 ? (g * tMax) / den : Infinity
  };
}

/** A polygon cut to the half-plane where f ≥ 0 (Sutherland–Hodgman, one edge). */
function clip(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const [fp, fq] = [f(p), f(q)];
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) out.push({ x: p.x + ((q.x - p.x) * fp) / (fp - fq), y: p.y + ((q.y - p.y) * fp) / (fp - fq) });
  });
  return out;
}

export function tankDrawing(values: FormValues, style: Record<string, unknown>) {
  const si = unitWriter(style.siUnits === true, style.physics === true);
  const f = fluidOf(values, 'fluid');
  const look = String(values.look);
  const input: TankInput = { length: Number(values.length), height: Number(values.height), depth: Math.min(Number(values.depth), Number(values.height)), a: Number(values.a), angle: Number(values.angle), rho: f.rho, g: Number(values.g) };
  const r = tank(input);
  const k = 5 / Math.max(input.length, input.height);
  const [L, H] = [input.length * k, input.height * k];
  const d0 = input.depth * k;
  const sc = scene(look);
  const metres = (m: number) => si.qty(fmt(m, 3), 'm');

  // the liquid: under the surface line, inside the tank; the surface's ends where it's in the tank
  const z0 = r ? (r.t >= 0 ? r.rear : r.front + r.t * input.length) * k : d0;
  const surf = (x: number) => z0 - (r?.t ?? 0) * x;
  const water = clip([{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }], (p) => surf(p.x) - p.y);
  sc.add('% The liquid');
  if (water.length > 2) sc.fill(water, f, look);
  const onLine = water.filter((p) => Math.abs(surf(p.x) - p.y) < 1e-9);
  const [s0, s1] = [onLine.reduce((a, b) => (b.x < a.x ? b : a), onLine[0]), onLine.reduce((a, b) => (b.x > a.x ? b : a), onLine[0])];
  sc.add('% The original level, and the free surface');
  sc.add(`\\draw[dashed, line width=0.4pt] ${at({ x: 0, y: d0 })} -- ${at({ x: L, y: d0 })};`);
  sc.seg([{ x: 0, y: d0 }, { x: L, y: d0 }]);
  if (s0 && s1 && s1.x - s0.x > 1e-9) {
    sc.add(`\\draw[line width=0.7pt] ${at(s0)} -- ${at(s1)};`);
    sc.seg([s0, s1]);
    const mid = { x: (s0.x + s1.x) / 2, y: (s0.y + s1.y) / 2 };
    sc.surface({ x: mid.x + 0.25 * (r && r.t > 0 ? 1 : -1), y: surf(mid.x + 0.25 * (r && r.t > 0 ? 1 : -1)) });
  }
  sc.add('% The tank', `\\draw[very thick] ${at({ x: 0, y: H })} -- (0,0) -- ${at({ x: L, y: 0 })} -- ${at({ x: L, y: H })};`);
  sc.seg([{ x: 0, y: H }, { x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }]);

  // θ between the original level and the surface, where they cross
  if (r && r.theta > 0.05) {
    const xc = (z0 - d0) / r.t;
    if (xc > 0.3 && xc < L - 0.3) {
      const up = r.t > 0 ? 180 : 0;
      const to = r.t > 0 ? 180 - r.theta : r.theta;
      const c = { x: xc, y: d0 };
      sc.add(`\\draw[line width=0.4pt] ${at({ x: c.x + 0.7 * Math.cos((up * Math.PI) / 180), y: c.y })} arc[start angle=${up}, end angle=${fmt(to, 6)}, radius=0.7];`);
      sc.items.push({ t: 'arc', c, r: 0.7, from: up, to });
      const mid = (((up + to) / 2) * Math.PI) / 180;
      sc.label({ x: c.x + 0.7 * Math.cos(mid), y: c.y + 0.7 * Math.sin(mid) }, `$\\theta = ${fmt(r.theta, 4)}^\\circ$`, { x: Math.cos(mid), y: Math.sin(mid) });
    }
  }
  // the acceleration, above the tank
  if (input.a !== 0) {
    const dir = ((input.angle + (input.a < 0 ? 180 : 0)) * Math.PI) / 180;
    const from = { x: L / 2 - 0.6 * Math.cos(dir), y: H + 0.7 - 0.6 * Math.sin(dir) };
    const to = { x: L / 2 + 0.6 * Math.cos(dir), y: H + 0.7 + 0.6 * Math.sin(dir) };
    sc.add('% The acceleration', `\\draw[-{Stealth[length=2.4mm]}, line width=1pt] ${at(from)} -- ${at(to)};`);
    sc.seg([from, to]);
    const slope = input.angle ? ` at $${fmt(Math.abs(input.angle), 3)}^\\circ$` : '';
    sc.label(to, `${si.equals('a', fmt(Math.abs(input.a), 4), 'm/s$^2$')}${slope}`, { x: Math.cos(dir), y: Math.sin(dir) });
  }
  // depths at the walls, the tank's size, and the bottom pressures
  sc.add('% Dimensions');
  if (r) {
    sc.dimension({ x: 0, y: 0 }, { x: 0, y: r.rear * k }, { x: -0.35, y: 0 }, metres(r.rear));
    sc.dimension({ x: L, y: 0 }, { x: L, y: r.front * k }, { x: 0.35, y: 0 }, metres(r.front));
  }
  sc.dimension({ x: 0, y: 0 }, { x: 0, y: H }, { x: -1.6, y: 0 }, metres(input.height));
  sc.dimension({ x: 0, y: 0 }, { x: L, y: 0 }, { x: 0, y: -0.75 }, metres(input.length));
  if (r) {
    sc.label({ x: 0.05, y: 0.05 }, si.qty(...pressure(r.pRear)), { x: 1, y: 1 });
    sc.label({ x: L - 0.05, y: 0.05 }, si.qty(...pressure(r.pFront)), { x: -1, y: 1 });
  }
  sc.label({ x: 0, y: H + 0.1 }, f.label, { x: 1, y: 1 });

  const parts = !r
    ? ['$g + a_z \\le 0$: the liquid leaves the floor']
    : [
        `$\\tan\\theta = a_x/(g + a_z)$, $\\theta = ${fmt(r.theta, 4)}^\\circ$`,
        `rear ${metres(r.rear)} deep, front ${metres(r.front)}${r.spills ? '; it spills over the rear wall' : r.front <= 0 ? '; the front of the floor is dry' : ''}`,
        ...(Number.isFinite(r.aMax) ? [`spills from ${si.equals('a', fmt(r.aMax, 3), 'm/s$^2$')}`] : [])
      ];
  if (values.results === true) results(sc, L / 2, parts);
  const comments = [
    `Accelerating tank: ${fmt(input.length)} m long, ${fmt(input.height)} m high, ${fmt(input.depth)} m deep at rest; a = ${fmt(input.a)} m/s2 at ${fmt(input.angle)} degrees`,
    r
      ? `theta = ${fmt(r.theta)} degrees; depths rear ${fmt(r.rear)} m, front ${fmt(r.front)} m; bottom pressures ${fmt(r.pRear)} Pa and ${fmt(r.pFront)} Pa${r.spills ? '; spills' : ''}${Number.isFinite(r.aMax) ? `; largest a without spilling ${fmt(r.aMax)} m/s2` : ''}`
      : 'g + a_z <= 0: no free surface'
  ];
  return pictureOf(sc, comments, si.used);
}

export const TANK: FormPreset = {
  id: 'tank',
  label: 'Accelerating tank',
  version5: true,
  fields: [
    { key: 'length', label: 'Length', kind: 'number', unit: 'm', min: 0.01, max: 1000, hint: 'Along the acceleration.' },
    { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.01, max: 1000 },
    { key: 'depth', label: 'Depth at rest', kind: 'number', unit: 'm', min: 0, max: 1000 },
    ...fluidFields('fluid', 'Liquid'),
    { key: 'a', label: 'Acceleration a', kind: 'number', unit: 'm/s²', min: -1000, max: 1000, hint: 'Forwards, to the right; negative when braking.' },
    { key: 'angle', label: 'Its angle above the horizontal', kind: 'number', unit: '°', min: -90, max: 90, hint: 'Up a ramp at 40°: 40. Down it: −40.' },
    { key: 'g', label: 'g', kind: 'number', unit: 'm/s²', min: 0.1, max: 100 },
    LOOK_FIELD,
    RESULTS_FIELD
  ],
  // Lecture 5, Example 7 (Final 2025): a 5 m tank 2 m high, 1 m of water, accelerating at 3 m/s² up a 40° ramp
  values: { length: 5, height: 2, depth: 1, fluid: 'water', fluidRD: 0, a: 3, angle: 40, g: G, look: 'colour', results: true },
  conventions: ['siUnits'],
  toCode: (values, style) => tankDrawing(values, style).code
};
