// A floating body, a Form preset: a block (a box seen end on) or an upright cylinder of a given relative density in a
// liquid. It floats with a draught d = H·RD_body/RD_liquid (Archimedes), its centre of buoyancy B at d/2, its centre of
// gravity G at mid-height or where it's given, and its metacentre M at BM = I/V above B, so the metacentric height
// GM = KB + BM − KG says whether it's stable for a small heel. Drawn upright with G, B and M, W and F_B, the waterline
// with ▽ and the dimensions.
import { unitWriter } from '../../units';
import { at, fluidFields, fluidOf, fmt, LOOK_FIELD, nameField, nameOf, named, pictureOf, results, RESULTS_FIELD, scene } from './fluids';
import type { FormPreset, FormValues } from './presets';

export type FloatInput = { shape: 'box' | 'cylinder'; width: number; height: number; rdBody: number; rdFluid: number; kg?: number };

/** Draught, KB, BM, KG, KM and GM in m (heights above the base), and whether it floats. */
export function floating(input: FloatInput) {
  const { width: B, height: H } = input;
  const fraction = input.rdBody / input.rdFluid;
  const floats = fraction < 1;
  const d = floats ? H * fraction : H;
  const KB = d / 2;
  const KG = input.kg ?? H / 2;
  // I/V of the waterplane: B³L/12 over B·L·d for a box heeling about its length, πD⁴/64 over πD²d/4 for a cylinder
  const BM = floats ? (input.shape === 'cylinder' ? (B * B) / (16 * d) : (B * B) / (12 * d)) : 0;
  return { floats, fraction, d, KB, BM, KG, KM: KB + BM, GM: floats ? KB + BM - KG : null };
}

export function floatingDrawing(values: FormValues, style: Record<string, unknown>) {
  const si = unitWriter(style.siUnits === true, style.physics === true);
  const f = fluidOf(values, 'fluid');
  const look = String(values.look);
  const input: FloatInput = {
    shape: values.shape === 'cylinder' ? 'cylinder' : 'box',
    width: Number(values.width),
    height: Number(values.height),
    rdBody: Number(values.bodyRD),
    rdFluid: f.rd || 1e-9,
    ...(values.uniform !== true && { kg: Math.min(Number(values.kg), Number(values.height)) })
  };
  const r = floating(input);
  const metres = (m: number) => si.qty(fmt(m, 3), 'm');
  // the waterline at y 0, the base at −d; 4 cm for the largest of the body and M
  const k = 4 / Math.max(input.width, input.height, r.KM);
  const [w, h, d] = [(input.width * k) / 2, input.height * k, r.d * k];
  const top = h - d;
  const surface = r.floats ? 0 : top + 0.5;
  const [x0, x1] = [-w - 2.2, w + 3];
  const yBed = -d - (r.floats ? 0.9 : 0);
  const sc = scene(look);
  sc.add('% The liquid and its free surface');
  sc.fill([{ x: x0, y: yBed }, { x: x1, y: yBed }, { x: x1, y: surface }, { x: x0, y: surface }], f, look);
  sc.add(`\\draw[line width=0.5pt] ${at({ x: x0, y: surface })} -- ${at({ x: x1, y: surface })};`);
  sc.seg([{ x: x0, y: surface }, { x: x1, y: surface }]);
  sc.surface({ x: x0 + 0.4, y: surface });
  if (!r.floats) sc.hatched({ x: x0, y: yBed }, { x: x1, y: yBed }, -1);
  const body = [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: top }, { x: -w, y: top }];
  sc.add(`% The ${input.shape === 'cylinder' ? 'cylinder, upright' : 'block'}`, `\\filldraw[fill=${look === 'exam' ? 'white' : 'black!20'}, line width=0.8pt] ${body.map(at).join(' -- ')} -- cycle;`);
  sc.seg(body, true);

  // G, B and M on the centre line (their names the user's), W down from G and F_B up to the base
  const [gName, bName, mName] = ['gName', 'bName', 'mName'].map((key) => nameOf(values, key));
  const y = (above: number) => above * k - d;
  const G = { x: 0, y: y(r.KG) };
  const B = { x: 0, y: y(r.KB) };
  sc.add('% Weight and buoyancy', `\\draw[-{Stealth[length=2.4mm]}, line width=1pt] ${at(G)} -- ${at({ x: 0, y: G.y - 0.75 })};`);
  sc.seg([G, { x: 0, y: G.y - 0.75 }]);
  sc.label({ x: -0.05, y: G.y - 0.6 }, '$W$', { x: -1, y: 0 });
  // up to the base; up from B when it rests on the bed
  const fb = r.floats ? [{ x: 0, y: -d - 0.8 }, { x: 0, y: -d }] : [B, { x: 0, y: B.y + 0.75 }];
  sc.add(`\\draw[-{Stealth[length=2.4mm]}, line width=1pt] ${at(fb[0])} -- ${at(fb[1])};`);
  sc.seg(fb);
  sc.label({ x: 0.05, y: (fb[0].y + fb[1].y) / 2 }, '$F_B$', { x: 1, y: 0 });
  sc.add('% Centres of gravity and buoyancy, and the metacentre');
  sc.dot(G);
  if (gName) sc.label(G, named(gName), { x: 1, y: 0.3 });
  sc.dot(B);
  if (bName) sc.label(B, named(bName), { x: -1, y: -0.3 });
  if (r.floats) {
    const M = { x: 0, y: y(r.KM) };
    sc.dot(M);
    if (mName) sc.label(M, named(mName), { x: 1, y: 0.3 });
  }
  sc.add('% Dimensions');
  sc.dimension({ x: w, y: -d }, { x: w, y: Math.min(0, top) }, { x: 0.4, y: 0 }, si.equals('d', fmt(r.d, 3), 'm'));
  sc.dimension({ x: -w, y: -d }, { x: -w, y: top }, { x: -0.4, y: 0 }, metres(input.height));
  sc.dimension({ x: -w, y: top }, { x: w, y: top }, { x: 0, y: 0.35 }, metres(input.width));
  sc.label({ x: x1 - 0.1, y: yBed + 0.1 }, f.label, { x: -1, y: 1 });

  const verdict = r.GM === null ? '' : Math.abs(r.GM) < 1e-9 ? 'neutral' : r.GM > 0 ? 'stable' : 'unstable';
  const parts = r.floats
    ? [
        `${si.equals('d', fmt(r.d, 3), 'm')}, ${fmt(r.fraction * 100, 3)}\\,\\% submerged`,
        `$K${bName} = ${fmt(r.KB, 3)}$, $${bName}${mName} = ${fmt(r.BM, 3)}$, $K${gName} = ${fmt(r.KG, 3)}$`,
        `${si.equals(`${gName}${mName}`, fmt(r.GM!, 3), 'm')}: ${verdict}`
      ]
    : [`It sinks: RD ${fmt(input.rdBody)} is not less than the liquid’s ${fmt(f.rd)}`];
  if (values.results === true) results(sc, 0, parts);
  const comments = [
    `Floating ${input.shape}: ${fmt(input.width)} m ${input.shape === 'cylinder' ? 'across' : 'wide'}, ${fmt(input.height)} m high, RD ${fmt(input.rdBody)} in ${f.label}`,
    r.floats ? `Draught ${fmt(r.d)} m; KB ${fmt(r.KB)} m, BM ${fmt(r.BM)} m, KG ${fmt(r.KG)} m, GM ${fmt(r.GM!)} m (${verdict})` : 'It sinks'
  ];
  return pictureOf(sc, comments, si.used);
}

export const FLOATING: FormPreset = {
  id: 'floating',
  label: 'Floating body and stability',
  version5: true,
  fields: [
    { key: 'shape', label: 'Body', kind: 'choice', options: [['box', 'Block (a box, end on)'], ['cylinder', 'Upright cylinder']] },
    { key: 'width', label: 'Width', kind: 'number', unit: 'm', min: 0.001, max: 1000, hint: 'Across the heel; a cylinder’s diameter.' },
    { key: 'height', label: 'Height', kind: 'number', unit: 'm', min: 0.001, max: 1000 },
    { key: 'bodyRD', label: 'Body’s relative density', kind: 'number', min: 0.001, max: 30, step: 0.01 },
    ...fluidFields('fluid', 'Liquid'),
    { key: 'uniform', label: 'Uniform body (G at mid-height)', kind: 'switch' },
    { key: 'kg', label: 'G above the base (KG)', kind: 'number', unit: 'm', min: 0, max: 1000, shown: (v) => v.uniform !== true },
    LOOK_FIELD,
    RESULTS_FIELD,
    nameField('gName', 'Centre of gravity', { hint: 'Each name is maths, without the dollar signs: G, B, M. The results use them, as GM. An empty name hides its label.' }),
    nameField('bName', 'Centre of buoyancy'),
    nameField('mName', 'Metacentre')
  ],
  // Lecture 5, Example 5: a cube of ice (RD 0.92) in seawater (RD 1.025), 25 cm of it above the surface
  values: { shape: 'box', width: 2.44, height: 2.44, bodyRD: 0.92, fluid: 'seawater', fluidRD: 0, uniform: true, kg: 1, look: 'colour', results: true, gName: 'G', bName: 'B', mName: 'M' },
  conventions: ['siUnits'],
  toCode: (values, style) => floatingDrawing(values, style).code
};
