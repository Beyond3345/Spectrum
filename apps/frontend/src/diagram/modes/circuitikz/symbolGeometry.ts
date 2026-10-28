// The symbol API's pin names and coordinates, shared by the requests and canvas geometry checks.
import type { SymbolPage } from '../../../api/client';
import { PARTS, PT_PER_GRID, placeholderShape, variantKey } from './model';
import type { Pt, Shape } from './model';

export function symbolRequest({ type, options }: { type: string; options: string[] }) {
  const part = PARTS.get(type)!;
  // Path glyph endpoints are always returned as start/end by the backend; only request additional anchors.
  return { id: variantKey(type, options), tikz: part.tikz, kind: part.set ? ('pic' as const) : part.kind, ...(options.length ? { options: [...options].sort() } : null), pins: part.pins || [] };
}

export function symbolGeometry(page: Pick<SymbolPage, 'pins' | 'width' | 'origin'>, type: string): { middle: Pt; shape: Shape } {
  const part = PARTS.get(type);
  const pins = Object.fromEntries(page.pins.map((pin) => [pin.name, { x: pin.x, y: pin.y }]));
  const grid = (p: Pt) => ({ x: p.x / PT_PER_GRID, y: p.y / PT_PER_GRID });
  if (part?.kind !== 'path') return { middle: { x: 0, y: 0 }, shape: { pins: { ...placeholderShape(type).pins, ...Object.fromEntries(Object.entries(pins).map(([name, p]) => [name, grid(p)])) } } };
  const { start, end } = pins;
  if (!start || !end) return { middle: { x: page.width / 2 - page.origin.x, y: 0 }, shape: placeholderShape(type) };
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const extras = (part.pins || []).filter((name) => pins[name]).map((name) => [name, grid({ x: pins[name].x - middle.x, y: pins[name].y - middle.y })]);
  return { middle, shape: { length: Math.abs(end.x - start.x) / PT_PER_GRID, pins: { ...placeholderShape(type).pins, ...Object.fromEntries(extras) } } };
}
