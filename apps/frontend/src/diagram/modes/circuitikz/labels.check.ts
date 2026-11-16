// Self-check for the circuit canvas's labels: every catalogue symbol, labelled on each side, running each of eight
// ways, mirrored or not (a node turned each of eight ways and flipped), has its label clear of its drawn outline
// (how a label is sketched and measured is checked in ../../sketch.check.ts). Run:
// npx esbuild apps/frontend/src/diagram/modes/circuitikz/labels.check.ts --bundle --platform=node --log-level=warning | node
//
// outlines.fixture.json holds every symbol's page as the backend's drawSymbols measured it with TeX Live 2026's
// circuitikz 1.8.7, in American, European and IEEE logic styles, with a path part's ends and a transistor's pins.
// Measure it again when the catalogue changes.
import { labelSize, scriptRuns } from '../../sketch';
import { nodeNameAt, pathLabelAt, pinLabelSpots } from './labels';
import { CATALOGUE, PT_PER_GRID, pathFrame, placeNodeOffset } from './model';
import type { Pt } from './model';
import OUTLINES from './outlines.fixture.json';
import { symbolGeometry, symbolOutline } from './symbolGeometry';
import type { Box } from './symbolGeometry';

const eq = (actual: unknown, expected: unknown, what: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ─── clear of the outline ───

/** Convex polygons that don't overlap: some edge's normal separates them (by more than a hair). */
function apart(a: Pt[], b: Pt[]) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const n = { x: q.y - p.y, y: p.x - q.x };
      const project = (list: Pt[]) => list.map((r) => r.x * n.x + r.y * n.y);
      const [pa, pb] = [project(a), project(b)];
      const length = Math.hypot(n.x, n.y);
      if (Math.max(...pa) < Math.min(...pb) - 1e-3 * length || Math.max(...pb) < Math.min(...pa) - 1e-3 * length) return true;
    }
  }
  return false;
}
const rect = (c: Pt, w: number, h: number): Pt[] => [
  { x: c.x - w / 2, y: c.y - h / 2 },
  { x: c.x + w / 2, y: c.y - h / 2 },
  { x: c.x + w / 2, y: c.y + h / 2 },
  { x: c.x - w / 2, y: c.y + h / 2 }
];
const corners = (o: Box): Pt[] => [
  { x: o.minX, y: o.minY },
  { x: o.maxX, y: o.minY },
  { x: o.maxX, y: o.maxY },
  { x: o.minX, y: o.maxY }
];

const labels = ['C_1', 'R_{in}', 'V^2', '\\qty{4.7}{\\micro\\farad}'];
const pages = OUTLINES as Record<string, Record<string, { width: number; height: number; origin: Pt; pins: { name: string; x: number; y: number }[] }>>;
let checked = 0;
for (const [style, symbols] of Object.entries(pages)) {
  for (const part of CATALOGUE.filter((p) => p.tikz)) {
    const page = symbols[part.id];
    if (!page) throw new Error(`${part.id} has no measured outline in ${style}: measure the catalogue again`);
    const { middle } = symbolGeometry(page, part.id);
    const outline = symbolOutline({ ...page, middle });
    for (const tex of labels) {
      // the canvas's text at 100 %: 11 px on 10 px grid steps
      const size = labelSize(scriptRuns(tex), 1.1);
      for (let turn = 0; turn < 360; turn += 45) {
        const t = (turn * Math.PI) / 180;
        for (const flip of [false, true]) {
          if (part.kind === 'path') {
            const frame = pathFrame({ x: -Math.cos(t) * 8, y: -Math.sin(t) * 8 }, { x: Math.cos(t) * 8, y: Math.sin(t) * 8 });
            for (const size1 of [1, 1.5]) {
              const drawn = corners(outline).map((p) => {
                const along = p.x * size1;
                const across = (flip ? -p.y : p.y) * size1;
                return { x: frame.mid.x + along * frame.u.x - across * frame.u.y, y: frame.mid.y + along * frame.u.y + across * frame.u.x };
              });
              for (const side of [1, -1] as const) {
                const at = pathLabelAt({ mirror: flip, size: size1 }, frame, outline, side, size);
                if (!apart(drawn, rect(at, size.w, size.h))) throw new Error(`${style} ${part.id} at ${turn}°${flip ? ' mirrored' : ''}: the ${side > 0 ? '^' : '_'} label ${tex} touches the symbol`);
                checked += 1;
              }
            }
          } else {
            const node = { at: { x: 3, y: -2 }, rotate: turn, flipX: flip, flipY: false };
            const drawn = corners(outline).map((p) => {
              const q = placeNodeOffset(node, p);
              return { x: node.at.x + q.x, y: node.at.y + q.y };
            });
            const at = nodeNameAt(node, outline, size);
            if (!apart(drawn, rect(at, size.w, size.h))) throw new Error(`${style} ${part.id} at ${turn}°${flip ? ' flipped' : ''}: its name touches the symbol`);
            checked += 1;
          }
        }
      }
    }
  }
}
eq(checked > 3 * 90 * 4 * 8 * 2, true, 'every symbol, side and turn checked');

// ─── pin letters ───

// each transistor's lead leaves its body the way the catalogue says, measured from the middle of its drawn outline (a
// bulk pin sits on the drain and source's line, so from the reference point it would read as no way at all); and each
// letter, the part turned each quarter and flipped, is clear of the outline (bulk's sits between the drain and source)
const OUT = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: 1 }, down: { x: 0, y: -1 } };
let letters = 0;
for (const [style, symbols] of Object.entries(pages)) {
  for (const part of CATALOGUE.filter((p) => p.pinLabels)) {
    const page = symbols[part.id];
    const outline = symbolOutline({ ...page, middle: { x: 0, y: 0 } });
    const centre = { x: (outline.minX + outline.maxX) / 2, y: (outline.minY + outline.maxY) / 2 };
    const pins = Object.fromEntries(page.pins.map((pin) => [pin.name, { x: pin.x / PT_PER_GRID, y: pin.y / PT_PER_GRID }]));
    for (const [pin, side] of Object.entries(part.pinLabels!)) {
      const d = { x: pins[pin].x - centre.x, y: pins[pin].y - centre.y };
      const way = Math.abs(d.x) > Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };
      eq(way, OUT[side], `${style} ${part.id}: ${pin}’s lead goes ${side}`);
    }
    for (let turn = 0; turn < 360; turn += 90) {
      for (const flipX of [false, true]) {
        const node = { type: part.id, at: { x: 0, y: 0 }, rotate: turn, flipX };
        const drawn = corners(outline).map((p) => placeNodeOffset(node, p));
        const spots = pinLabelSpots(node).map(({ pin, letter, dir }) => {
          const at = placeNodeOffset(node, pins[pin]);
          const size = labelSize([{ text: letter }], 0.77);
          return { pin, letter, size, at: { x: at.x + dir.x * (size.w / 2 + 0.3), y: at.y + dir.y * (size.h / 2 + 0.3) } };
        });
        // the part's name goes above them all, as the canvas puts it
        const name = labelSize(scriptRuns('M_1'), 1.1);
        const nameBox = rect(nodeNameAt(node, outline, name, spots.map((s) => s.at.y + s.size.h / 2)), name.w, name.h);
        for (const { pin, letter, size, at } of spots) {
          const box = rect(at, size.w, size.h);
          if (!apart(box, nameBox)) throw new Error(`${style} ${part.id} at ${turn}°${flipX ? ' flipped' : ''}: ${letter} touches its name`);
          if (pin === 'bulk') continue;
          if (!apart(drawn, box)) throw new Error(`${style} ${part.id} at ${turn}°${flipX ? ' flipped' : ''}: ${letter} touches the symbol`);
          letters += 1;
        }
      }
    }
  }
}
eq(letters > 3 * 22 * 8 * 2, true, 'every transistor’s letters checked');

console.log('labels.check: ok');
