// A manometer, a Form preset, written as the course solves one: a walk from one end to the other through up to four
// columns of fluid, each going down (adding ρgh) or up (taking it away). A U-tube, a differential manometer between two
// pipes, an inverted U-tube and a multi-fluid one are all such walks: the tube turns where the walk does, at the bottom
// of a U (filled with the denser fluid there) or the top of an inverted one (the lighter), with a dashed line across
// at the level where the pressures are equal. It draws the tube with each fluid's column, the heights, the ends (a
// pipe's point, or open with ▽) and the pressure difference.
import { unitWriter } from '../../units';
import { escapeTex } from '../shared';
import { at, fluidFields, fluidOf, fmt, G, LOOK_FIELD, pictureOf, pressure, results, RESULTS_FIELD, scene } from './fluids';
import type { FluidOf, Pt } from './fluids';
import type { FormField, FormPreset, FormValues } from './presets';

export type Column = { rho: number; h: number; down: boolean };

/** P at the end less P at the start, Pa: ρgh for each column going down, less it for each going up. */
export const pressureWalk = (columns: Column[], g = G) => columns.reduce((sum, c) => sum + (c.down ? 1 : -1) * c.rho * g * c.h, 0);

const UNITS: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001 };
const COLUMNS = [1, 2, 3, 4];
/** column i is shown: the first always, a later one when each column before it names a fluid */
const inWalk = (v: FormValues, i: number) => COLUMNS.slice(1, i - 1).every((j) => v[`fluid${j}`] !== 'none');

export function manometerDrawing(values: FormValues, style: Record<string, unknown>) {
  const si = unitWriter(style.siUnits === true, style.physics === true);
  const look = String(values.look);
  const unit = String(values.unit) in UNITS ? String(values.unit) : 'cm';
  const g = Number(values.g);
  const cols = COLUMNS.filter((i) => inWalk(values, i) && (i === 1 || values[`fluid${i}`] !== 'none')).map((i) => ({
    fluid: fluidOf(values, `fluid${i}`),
    h: Number(values[`h${i}`]),
    down: values[`dir${i}`] !== 'up'
  }));
  const dp = pressureWalk(cols.map((c) => ({ rho: c.fluid.rho, h: c.h * UNITS[unit], down: c.down })), g);

  // levels: the walk's, from the start at 0, drawn 4.5 cm from the lowest to the highest
  const z = [0];
  cols.forEach((c) => z.push(z[z.length - 1] + (c.down ? -c.h : c.h)));
  const k = 4.5 / Math.max(Math.max(...z) - Math.min(...z), 1e-9);
  const Z = z.map((v) => v * k);
  // legs: runs of columns going the same way, a tube each, 1.6 cm apart
  const leg: number[] = [];
  cols.forEach((c, i) => leg.push(i === 0 ? 0 : leg[i - 1] + (c.down !== cols[i - 1].down ? 1 : 0)));
  const X = (j: number) => j * 1.6;
  const R = 0.8;
  const e = 0.5;
  const sc = scene(look);
  const colour = (f: FluidOf) => (look === 'exam' ? f.grey : f.tube);
  // the tube's pieces in the walk's order, each with its fluid: [path, fluid, its points for the label spacing]
  const pieces: { path: string; fluid: FluidOf; mid: Pt; side: Pt }[] = [];
  cols.forEach((c, i) => {
    const x = X(leg[i]);
    if (Math.abs(Z[i + 1] - Z[i]) > 1e-9) {
      // named on the left, or right of its heights on the last of several tubes
      const last = leg[i] > 0 && leg[i] === leg[leg.length - 1];
      pieces.push({ path: `${at({ x, y: Z[i] })} -- ${at({ x, y: Z[i + 1] })}`, fluid: c.fluid, mid: { x: last ? x + 1.2 : x, y: (Z[i] + Z[i + 1]) / 2 }, side: { x: last ? 1 : -1, y: 0 } });
      sc.seg([{ x, y: Z[i] }, { x, y: Z[i + 1] }]);
    }
    const next = cols[i + 1];
    if (next && next.down !== c.down) {
      // a turn: at the bottom of a U the denser fluid fills it, at the top of an inverted U the lighter
      const bottom = c.down;
      const fluid = (bottom ? next.fluid.rho > c.fluid.rho : next.fluid.rho < c.fluid.rho) ? next.fluid : c.fluid;
      const y = Z[i + 1];
      const far = bottom ? y - e : y + e;
      pieces.push({
        path: `${at({ x, y })} -- ${at({ x, y: far })} arc[start angle=180, end angle=${bottom ? 360 : 0}, radius=${R}] -- ${at({ x: x + 2 * R, y })}`,
        fluid,
        mid: { x: x + R, y: bottom ? far - R : far + R },
        side: { x: 0, y: bottom ? -1 : 1 }
      });
      sc.seg([{ x, y }, { x, y: far }]);
      sc.items.push({ t: 'arc', c: { x: x + R, y: far }, r: R, from: 180, to: bottom ? 360 : 0 });
      sc.seg([{ x: x + 2 * R, y: far }, { x: x + 2 * R, y }]);
      sc.add(`% Equal pressures across the ${bottom ? 'U' : 'inverted U'} at this level`);
      sc.add(`\\draw[dashed, line width=0.3pt] ${at({ x: x - 0.35, y })} -- ${at({ x: x + 2 * R + 0.35, y })};`);
    }
  });
  // an open end: the tube carried on, with air in it, past the fluid's free surface
  const ends = [
    { name: escapeTex(String(values.startName).trim()), open: values.startEnd === 'open', x: X(0), y: Z[0], away: cols[0].down ? 1 : -1 },
    { name: escapeTex(String(values.endName).trim()), open: values.endEnd === 'open', x: X(leg[leg.length - 1]), y: Z[Z.length - 1], away: cols[cols.length - 1].down ? -1 : 1 }
  ];
  const air = fluidOf({ air: 'air' }, 'air');
  for (const end of ends.filter((end) => end.open)) {
    pieces.push({ path: `${at({ x: end.x, y: end.y })} -- ${at({ x: end.x, y: end.y + end.away * 0.6 })}`, fluid: air, mid: { x: end.x, y: end.y }, side: { x: 1, y: 0 } });
    sc.seg([{ x: end.x, y: end.y }, { x: end.x, y: end.y + end.away * 0.6 }]);
  }
  sc.add('% The tube, then each fluid in it', `\\draw[line width=6pt, line join=round] ${pieces.map((p) => p.path).join(' ')};`);
  sc.add(`\\draw[line width=4.8pt, white, line join=round] ${pieces.map((p) => p.path).join(' ')};`);
  for (const p of pieces) if (p.fluid.id !== 'air') sc.add(`\\draw[line width=4.8pt, ${colour(p.fluid)}, line join=round] ${p.path};`);

  // the ends: a pipe's point in a circle, or open with the free surface marked
  sc.add('% The ends');
  for (const end of ends) {
    if (end.open) {
      sc.surface({ x: end.x - 0.34, y: end.y });
      sc.label({ x: end.x, y: end.y + end.away * 0.6 }, 'Open', { x: 0, y: end.away });
    } else {
      sc.add(`\\node[draw, circle, fill=white, inner sep=1pt, minimum size=0.45cm] at ${at({ x: end.x, y: end.y })} {${end.name}};`);
      sc.items.push({ t: 'dot', at: { x: end.x, y: end.y }, r: 0.23 });
    }
  }
  // each column's height beside it
  sc.add('% Heights');
  cols.forEach((c, i) => {
    const x = X(leg[i]);
    sc.dimension({ x: x + 0.12, y: Z[i] }, { x: x + 0.12, y: Z[i + 1] }, { x: 0.28, y: 0 }, si.qty(fmt(c.h, 4), unit));
  });
  // each fluid named once, beside its first piece
  const named = new Set<string>();
  for (const p of pieces) {
    if (p.fluid.id === 'air' || named.has(p.fluid.label)) continue;
    named.add(p.fluid.label);
    sc.label({ x: p.mid.x + p.side.x * 0.15, y: p.mid.y + p.side.y * 0.15 }, p.fluid.label, p.side);
  }

  const bare = (name: string) => name.replace(/\$/g, '') || '?';
  const [start, end] = ends;
  const patm = Number(values.patm) * 1000;
  const write = (pa: number) => si.qty(...pressure(pa));
  const lines: string[] = [];
  const gauge = (name: string, pa: number) => [`$P_{${bare(name)}} = $ ${write(pa)} (gauge)`, ...(patm > 0 ? [`$P_{${bare(name)}} = $ ${write(pa + patm)} (absolute)`] : [])];
  if (start.open && !end.open) lines.push(...gauge(end.name, dp));
  else if (end.open && !start.open) lines.push(...gauge(start.name, -dp));
  else lines.push(`$P_{${bare(end.name)}} - P_{${bare(start.name)}} = $ ${write(dp)}`);
  const xs = cols.map((c, i) => X(leg[i]));
  if (values.results === true) results(sc, (Math.min(...xs) + Math.max(...xs)) / 2, lines);
  const comments = [
    `Manometer: from ${bare(start.name)} ${cols.map((c) => `${c.down ? 'down' : 'up'} ${fmt(c.h)} ${unit} of ${c.fluid.label}`).join(', ')} to ${bare(end.name)}`,
    `P_${bare(end.name)} - P_${bare(start.name)} = ${fmt(dp, 6)} Pa`
  ];
  return pictureOf(sc, comments, si.used);
}

const columnFields = (i: number): FormField[] => {
  const shown = (v: FormValues) => inWalk(v, i);
  const named = (v: FormValues) => shown(v) && (i === 1 || v[`fluid${i}`] !== 'none');
  return [
    ...fluidFields(`fluid${i}`, `Column ${i}`, shown, i > 1),
    { key: `h${i}`, label: 'Height', kind: 'number', min: 0, max: 1e6, shown: named },
    { key: `dir${i}`, label: 'Going', kind: 'choice', options: [['down', 'Down (adds ρgh)'], ['up', 'Up (takes ρgh away)']], shown: named }
  ];
};

const END: [string, string][] = [['point', 'A point in a pipe or tank'], ['open', 'Open to the atmosphere']];

export const MANOMETER: FormPreset = {
  id: 'manometer',
  label: 'Manometer',
  version5: true,
  fields: [
    { key: 'unit', label: 'Heights in', kind: 'choice', options: [['m', 'm'], ['cm', 'cm'], ['mm', 'mm']] },
    { key: 'startName', label: 'Start', kind: 'text', hint: 'LaTeX, as in the document: $A$ for maths.' },
    { key: 'startEnd', label: 'Start is', kind: 'choice', options: END },
    ...COLUMNS.flatMap(columnFields),
    { key: 'endName', label: 'End', kind: 'text' },
    { key: 'endEnd', label: 'End is', kind: 'choice', options: END },
    { key: 'patm', label: 'Atmospheric pressure', kind: 'number', unit: 'kPa', min: 0, max: 1000, hint: 'For an absolute pressure at a point when an end is open; 0 gives the gauge pressure alone.' },
    { key: 'g', label: 'g', kind: 'number', unit: 'm/s²', min: 0.1, max: 100 },
    LOOK_FIELD,
    RESULTS_FIELD
  ],
  // Lecture 4, Example 7: from B in oil (RD 0.8) down 13 cm, mercury down 8 cm, then up 31 cm of oil (RD 0.7) to A
  values: {
    unit: 'cm',
    startName: '$B$',
    startEnd: 'point',
    fluid1: 'oil', fluid1RD: 0.8, h1: 13, dir1: 'down',
    fluid2: 'mercury', fluid2RD: 0, h2: 8, dir2: 'down',
    fluid3: 'oil', fluid3RD: 0.7, h3: 31, dir3: 'up',
    fluid4: 'none', fluid4RD: 0, h4: 10, dir4: 'up',
    endName: '$A$',
    endEnd: 'point',
    patm: 0,
    g: G,
    look: 'colour',
    results: true
  },
  conventions: ['siUnits'],
  toCode: (values, style) => manometerDrawing(values, style).code
};
