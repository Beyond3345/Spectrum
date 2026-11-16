// Mohr's circle, a Form preset: σx, σy and τxy (tension positive), an optional rotation θ and σz, drawn as plain TikZ
// with the centre, the principal stresses, the maximum shear points and the 2θp arc, three circles for a 3D state, and
// stress elements on request. The shear axis follows the drawing's convention: τ positive downward (Hibbeler and Gere,
// where 2θ on the circle turns the same way as θ on the element), clockwise shear plotted above (Beer and Johnston,
// drawn the same way with the axis pointing up), or τ positive upward.
import type { DiagramCode } from '../../fileFormat';
import type { ComposerDefaults } from '../../types';
import { unitWriter } from '../../units';
import { escapeTex, num } from '../shared';
import { anchorFor, formatValue } from '../structures/draw';
import { placeLabels, shapesOf } from '../structures/labels';
import type { Label, Shape, ShapeItem } from '../structures/labels';
import type { FormPreset, FormValues } from './presets';

type Pt = { x: number; y: number };

/** The labels' text as the spacing measures it: a Greek letter or a degree sign one letter wide, \max three. */
const measured = (tex: string) => tex.replace(/\\mathrm/g, '').replace(/\\max\b/g, 'max').replace(/\\(?:sigma|tau|theta|circ)\b/g, 'x');

/** A circle as the label spacing sees it: 72 sides. */
const circlePoints = (c: Pt, r: number): Pt[] => Array.from({ length: 72 }, (_, i) => ({ x: c.x + r * Math.cos((i * Math.PI) / 36), y: c.y + r * Math.sin((i * Math.PI) / 36) }));

/** The circle's numbers, angles in degrees. */
export function mohr(values: { sigmaX: number; sigmaY: number; tauXY: number; theta?: number; sigmaZ?: number }) {
  const { sigmaX: sx, sigmaY: sy, tauXY: t, theta = 0 } = values;
  const C = (sx + sy) / 2;
  const a = (sx - sy) / 2;
  const R = Math.hypot(a, t);
  const thetaP = (Math.atan2(2 * t, sx - sy) * 90) / Math.PI;
  const r = (theta * Math.PI) / 90;
  const rotated = { sigmaX: C + a * Math.cos(r) + t * Math.sin(r), sigmaY: C - a * Math.cos(r) - t * Math.sin(r), tauXY: -a * Math.sin(r) + t * Math.cos(r) };
  const principal = values.sigmaZ === undefined ? null : [C + R, C - R, values.sigmaZ].sort((p, q) => q - p);
  return {
    C,
    R,
    sigma1: C + R,
    sigma2: C - R,
    tauMax: R,
    thetaP,
    /** the plane of maximum in-plane shear (positive τ), 45° from the principal one */
    thetaS: thetaP - 45,
    rotated,
    /** σ1 ≥ σ2 ≥ σ3 and the absolute maximum shear, for a 3D state */
    threeD: principal && { sigma: principal, tauMax: (principal[0] - principal[2]) / 2 }
  };
}

const SHEAR_AXIS: Record<ComposerDefaults['mohrShear'], string> = {
  down: 'τ positive downward',
  'clockwise-above': 'clockwise shear plotted above',
  up: 'τ positive upward'
};

/** The code, with the labels as placed (their text as measured) and the shapes they keep clear of, for a check. */
export function mohrDrawing(values: FormValues, style: Record<string, unknown>): { code: DiagramCode; labels: Label[]; shapes: Shape[] } {
  const [sx, sy, txy, theta, sz] = ['sigmaX', 'sigmaY', 'tauXY', 'theta', 'sigmaZ'].map((key) => Number(values[key]));
  const threeD = values.threeD === true;
  const unitTex = escapeTex(String(values.unit).trim());
  const convention = (Object.keys(SHEAR_AXIS).includes(String(style.mohrShear)) ? style.mohrShear : 'down') as ComposerDefaults['mohrShear'];
  const m = mohr({ sigmaX: sx, sigmaY: sy, tauXY: txy, theta, ...(threeD && { sigmaZ: sz }) });
  const fmt = (v: number) => formatValue(v, 3);
  const si = unitWriter(style.siUnits === true, style.physics === true);
  const withUnit = (v: number) => (unitTex ? si.qty(fmt(v), unitTex) : `$${fmt(v)}$`);

  // drawn τ: down for τ positive downward and for clockwise shear above (X, whose positive τxy turns its element
  // anticlockwise, plotted below), up for τ positive upward
  const sign = convention === 'up' ? 1 : -1;
  const circles = threeD && m.threeD ? [[m.threeD.sigma[0], m.threeD.sigma[2]], [m.threeD.sigma[0], m.threeD.sigma[1]], [m.threeD.sigma[1], m.threeD.sigma[2]]] : [[m.sigma1, m.sigma2]];
  const lo = Math.min(0, ...circles.flat());
  const hi = Math.max(0, ...circles.flat());
  const span = Math.max(hi - lo, Math.max(...circles.map(([p, q]) => p - q)), 1e-9);
  const k = 7 / span;
  const P = (sigma: number, tau: number): Pt => ({ x: sigma * k, y: sign * tau * k });
  const at = (p: Pt) => `(${num(p.x)},${num(p.y)})`;
  // what the labels keep clear of, and the labels in the order they choose their places; each written where its marker is
  const shapes: ShapeItem[] = [];
  const labels: Label[] = [];
  /** a label on the side of p that d points to, moved round p when that side is taken */
  const node = (p: Pt, tex: string, d: Pt) => {
    const n = Math.hypot(d.x, d.y) || 1;
    // a hair from its point, so it knows which side it started on
    labels.push({ at: { x: p.x + (d.x / n) * 1e-4, y: p.y + (d.y / n) * 1e-4 }, tex, anchor: anchorFor(d), around: p });
    return `\u0000${labels.length - 1}`;
  };
  const dot = (p: Pt) => {
    shapes.push({ t: 'dot', at: p, r: 0.05 });
    return `\\fill ${at(p)} circle (0.05);`;
  };
  const line = (...pts: Pt[]) => shapes.push({ t: 'line', pts });
  // labels outside the circle; a point on the σ axis is labelled under it, the principal stresses being over it
  const away = (p: Pt) => ({ x: p.x - m.C * k, y: Math.abs(p.y) > 1e-9 ? p.y : -Math.abs(p.x - m.C * k) || -1 });

  const reach = Math.max(...circles.map(([p, q]) => (p - q) / 2)) * k + 0.6;
  const [x0, x1] = [lo * k - 0.6, hi * k + 0.6];
  const tauLabel = convention === 'clockwise-above' ? '$\\tau$ (clockwise)' : '$\\tau$';
  // the axes, and their names, which stay at the arrows' tips
  line({ x: x0, y: 0 }, { x: x1, y: 0 });
  line({ x: 0, y: -reach }, { x: 0, y: reach });
  labels.push({ at: { x: x1, y: 0 }, tex: '$\\sigma$', anchor: 'west' }, convention === 'down' ? { at: { x: 0, y: -reach }, tex: tauLabel, anchor: 'north' } : { at: { x: 0, y: reach }, tex: tauLabel, anchor: 'south' });
  circles.forEach(([p, q]) => shapes.push({ t: 'line', pts: circlePoints({ x: ((p + q) / 2) * k, y: 0 }, ((p - q) / 2) * k), closed: true }));
  const lines: string[] = [
    `% Mohr's circle: sigma x = ${fmt(sx)}, sigma y = ${fmt(sy)}, tau xy = ${fmt(txy)}${unitTex ? ` ${unitTex.replace(/\\,/g, ' ')}` : ''} (${SHEAR_AXIS[convention]})`,
    '\\begin{tikzpicture}[>={Stealth[length=1.8mm]}, font=\\footnotesize]',
    '% Axes',
    `\\draw[->] (${num(x0)},0) -- (${num(x1)},0) node[anchor=west] {$\\sigma$};`,
    convention === 'down' ? `\\draw[->] (0,${num(reach)}) -- (0,${num(-reach)}) node[anchor=north] {${tauLabel}};` : `\\draw[->] (0,${num(-reach)}) -- (0,${num(reach)}) node[anchor=south] {${tauLabel}};`,
    '% Circles',
    ...circles.map(([p, q], i) => `\\draw[line width=${i ? '0.5pt' : '0.8pt'}${i ? ', black!60' : ''}] (${num(((p + q) / 2) * k)},0) circle (${num(((p - q) / 2) * k)});`)
  ];

  // X, Y and the diameter between them
  const X = P(sx, txy);
  const Y = P(sy, -txy);
  const C = P(m.C, 0);
  line(X, Y);
  lines.push('% X, Y and the centre', `\\draw ${at(X)} -- ${at(Y)};`, dot(X), dot(Y), dot(C));
  lines.push(node(X, `$X(${fmt(sx)}, ${fmt(txy)})$`, away(X)), node(Y, `$Y(${fmt(sy)}, ${fmt(-txy)})$`, away(Y)));

  // principal stresses and the maximum shear points
  const s1 = P(m.sigma1, 0);
  const s2 = P(m.sigma2, 0);
  const top = P(m.C, m.R * sign);
  const bottom = P(m.C, -m.R * sign);
  lines.push('% Principal stresses and maximum shear', dot(s1), dot(s2), dot(top), dot(bottom));
  if (!m.threeD) lines.push(node(s1, `$\\sigma_1 = ${fmt(m.sigma1)}$`, { x: 1, y: 1 }), node(s2, `$\\sigma_2 = ${fmt(m.sigma2)}$`, { x: -1, y: 1 }));
  lines.push(node(C, `$C = ${fmt(m.C)}$`, { x: 0, y: X.y < -1e-9 ? 1 : -1 }));
  // σz between σ1 and σ2: the in-plane circle is the largest, its top the absolute maximum too
  const same = !!m.threeD && Math.abs(m.threeD.tauMax - m.tauMax) <= 1e-9 * Math.max(1, m.tauMax);
  // under its point when a larger circle runs just over it, so it isn't taken for that circle's
  lines.push(node(top, `$\\tau_{\\max} = ${same ? '\\tau_{\\mathrm{abs}} = ' : ''}${fmt(m.tauMax)}$`, { x: 0, y: m.threeD && !same ? -1 : 1 }));
  // 2θp from CX to σ1, the way the circle turns for this convention
  if (m.R > 0 && Math.abs(txy) > 1e-12 * m.R) {
    const fromAngle = (Math.atan2(X.y - C.y, X.x - C.x) * 180) / Math.PI;
    const r = Math.min(0.6, m.R * k * 0.4);
    const startPt = { x: C.x + r * Math.cos((fromAngle * Math.PI) / 180), y: C.y + r * Math.sin((fromAngle * Math.PI) / 180) };
    lines.push('% The angle to the principal plane', `\\draw[->] ${at(startPt)} arc[start angle=${num(fromAngle)}, end angle=0, radius=${num(r)}];`);
    shapes.push({ t: 'arc', c: C, r, from: fromAngle, to: 0 });
    const mid = ((fromAngle / 2) * Math.PI) / 180;
    lines.push(node({ x: C.x + r * Math.cos(mid), y: C.y + r * Math.sin(mid) }, `$2\\theta_p = ${fmt(2 * m.thetaP)}^\\circ$`, { x: Math.cos(mid), y: Math.sin(mid) }));
  }
  if (theta) {
    const Xr = P(m.rotated.sigmaX, m.rotated.tauXY);
    const Yr = P(m.rotated.sigmaY, -m.rotated.tauXY);
    line(Xr, Yr);
    lines.push(`% Rotated by ${fmt(theta)} degrees`, `\\draw[dashed] ${at(Xr)} -- ${at(Yr)};`, dot(Xr), dot(Yr));
    lines.push(node(Xr, `$X'(${fmt(m.rotated.sigmaX)}, ${fmt(m.rotated.tauXY)})$`, away(Xr)), node(Yr, `$Y'$`, away(Yr)));
  }
  if (m.threeD) {
    const [a, b, c] = m.threeD.sigma;
    const peak = P((a + c) / 2, ((a - c) / 2) * sign);
    lines.push('% Three-dimensional state', ...(same ? [] : [dot(peak), node(peak, `$\\tau_{\\mathrm{abs}} = ${fmt(m.threeD.tauMax)}$`, { x: 1, y: 1 })]));
    // the principal stresses named in order, σ1 ≥ σ2 ≥ σ3
    lines.push(...[a, b, c].flatMap((v, i) => [dot(P(v, 0)), node(P(v, 0), `$\\sigma_${i + 1} = ${fmt(v)}$`, { x: i === 2 ? -1 : 1, y: 1 })]));
  }
  if (unitTex) lines.push(node({ x: x1, y: -0.3 }, `(${si.unit(unitTex)})`, { x: -1, y: -1 }));
  // each label where it touches nothing drawn and no label before it
  const shapesClear = shapesOf(shapes.map((item) => ({ item, shift: { x: 0, y: 0 } })));
  const placed = placeLabels(labels.map((l) => ({ label: { ...l, tex: measured(l.tex) }, shift: { x: 0, y: 0 } })), shapesClear);
  const written = (i: number) => {
    const p = placed[i] ?? labels[i];
    return `\\node[anchor=${p.anchor}] at ${at(p.at)} {${labels[i].tex}};`;
  };
  for (let i = 0; i < lines.length; i += 1) if (lines[i].startsWith('\u0000')) lines[i] = written(Number(lines[i].slice(1)));

  // stress elements in a row under the circle
  const wanted = String(values.elements);
  const elements: { title: string; angle: number; sx: number; sy: number; txy: number }[] = [];
  if (wanted !== 'none') elements.push({ title: 'Original', angle: 0, sx, sy, txy });
  if ((wanted === 'rotated' || wanted === 'all') && theta) elements.push({ title: `Rotated by $${fmt(theta)}^\\circ$`, angle: theta, sx: m.rotated.sigmaX, sy: m.rotated.sigmaY, txy: m.rotated.tauXY });
  if (wanted === 'all') {
    elements.push({ title: `Principal, $\\theta_p = ${fmt(m.thetaP)}^\\circ$`, angle: m.thetaP, sx: m.sigma1, sy: m.sigma2, txy: 0 });
    elements.push({ title: `Maximum shear, $\\theta_s = ${fmt(m.thetaS)}^\\circ$`, angle: m.thetaS, sx: m.C, sy: m.C, txy: m.tauMax });
  }
  const rowY = -reach - 2.4;
  elements.forEach((e, i) => {
    lines.push(`% Stress element: ${e.title.replace(/\$|\\[a-z]+|[{}^_]/g, '')}`);
    lines.push(...stressElement({ x: lo * k + 1.4 + i * 4.2, y: rowY }, e, withUnit), `\\node[anchor=north] at ${at({ x: lo * k + 1.4 + i * 4.2, y: rowY - 1.45 })} {${e.title}};`);
  });
  lines.push('\\end{tikzpicture}', '');
  return {
    code: { body: lines.join('\n'), packages: ['tikz', ...(si.used ? ['siunitx'] : [])], libraries: ['arrows.meta', 'babel'] },
    labels: placed.map((l, i) => l ?? { ...labels[i], tex: measured(labels[i].tex) }),
    shapes: shapesClear
  };
}

/** A square element turned by angle (degrees), its normal stresses out of tension faces and shear along the faces. */
function stressElement(c: Pt, e: { angle: number; sx: number; sy: number; txy: number }, label: (v: number) => string): string[] {
  const t = (e.angle * Math.PI) / 180;
  const ex = { x: Math.cos(t), y: Math.sin(t) };
  const ey = { x: -ex.y, y: ex.x };
  const h = 0.55;
  const p = (u: number, v: number) => ({ x: c.x + ex.x * u + ey.x * v, y: c.y + ex.y * u + ey.y * v });
  const at = (q: Pt) => `(${num(q.x)},${num(q.y)})`;
  const out = [`\\draw[fill=black!5] ${at(p(-h, -h))} -- ${at(p(h, -h))} -- ${at(p(h, h))} -- ${at(p(-h, h))} -- cycle;`];
  const tiny = 1e-9 * Math.max(1, Math.abs(e.sx), Math.abs(e.sy), Math.abs(e.txy));
  // normal stresses: on the x faces along ±ex, on the y faces along ±ey; labelled on the + faces
  for (const [n, s, labelled] of [[[1, 0], e.sx, true], [[-1, 0], e.sx, false], [[0, 1], e.sy, true], [[0, -1], e.sy, false]] as [[number, number], number, boolean][]) {
    if (Math.abs(s) < tiny) continue;
    const face = (d: number) => p(n[0] * (h + d), n[1] * (h + d));
    const [from, to] = s > 0 ? [face(0.08), face(0.6)] : [face(0.6), face(0.08)];
    out.push(`\\draw[->, line width=0.6pt] ${at(from)} -- ${at(to)};`);
    if (labelled) {
      const dir = { x: ex.x * n[0] + ey.x * n[1], y: ex.y * n[0] + ey.y * n[1] };
      out.push(`\\node[anchor=${anchorFor(dir)}] at ${at(face(0.65))} {${label(Math.abs(s))}};`);
    }
  }
  // shear: on the +x face along +ey for positive τ, and the matching pairs on the others
  if (Math.abs(e.txy) >= tiny) {
    const s = Math.sign(e.txy);
    for (const [u, v, du, dv] of [[1, 0, 0, s], [-1, 0, 0, -s], [0, 1, s, 0], [0, -1, -s, 0]]) {
      const mid = p(u * (h + 0.12), v * (h + 0.12));
      const d = { x: ex.x * du + ey.x * dv, y: ex.y * du + ey.y * dv };
      out.push(`\\draw[->, line width=0.6pt] ${at({ x: mid.x - d.x * 0.4, y: mid.y - d.y * 0.4 })} -- ${at({ x: mid.x + d.x * 0.4, y: mid.y + d.y * 0.4 })};`);
    }
    const tip = p(h + 0.15, s * 0.5);
    out.push(`\\node[anchor=${anchorFor({ x: ex.x + ey.x * s, y: ex.y + ey.y * s })}] at ${at(tip)} {${label(Math.abs(e.txy))}};`);
  }
  return out;
}

export const MOHR: FormPreset = {
  id: 'mohr',
  label: 'Mohr’s circle',
  fields: [
    { key: 'sigmaX', label: 'σx', kind: 'number', min: -1e9, max: 1e9, hint: 'Tension positive.' },
    { key: 'sigmaY', label: 'σy', kind: 'number', min: -1e9, max: 1e9 },
    { key: 'tauXY', label: 'τxy', kind: 'number', min: -1e9, max: 1e9, hint: 'Positive on the x face pointing in +y.' },
    { key: 'unit', label: 'Stress unit', kind: 'text', hint: 'LaTeX, as in the document: MPa, ksi, kN/m$^2$.' },
    { key: 'theta', label: 'Rotation θ', kind: 'number', unit: '°', min: -180, max: 180, hint: 'Anticlockwise. The rotated state is drawn as X′ and Y′; 0 leaves it out.' },
    { key: 'threeD', label: 'Three-dimensional state', kind: 'switch', hint: 'Adds σz and draws three circles with the absolute maximum shear.' },
    { key: 'sigmaZ', label: 'σz', kind: 'number', min: -1e9, max: 1e9 },
    {
      key: 'elements',
      label: 'Stress elements',
      kind: 'choice',
      options: [
        ['none', 'None'],
        ['original', 'Original'],
        ['rotated', 'Original and rotated by θ'],
        ['all', 'Original, rotated, principal and maximum shear']
      ]
    }
  ],
  values: { sigmaX: 80, sigmaY: -40, tauXY: 25, unit: 'MPa', theta: 0, threeD: false, sigmaZ: 0, elements: 'original' },
  conventions: ['mohrShear', 'siUnits'],
  toCode: (values, style) => mohrDrawing(values, style).code
};
