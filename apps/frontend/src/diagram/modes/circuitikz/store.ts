// What the circuit canvas, rail and inspector share in this window. The mode's components only get the
// model from the frame, so the tool, the selection and the symbol geometry the canvas last drew live here.
import { useSyncExternalStore } from 'react';
import { attach } from './edit';
import { findJunctions, placeholderShape } from './model';
import type { CircuitModel, ShapeOf } from './model';

/** 'select', 'wire', or 'part:<catalogue id>' */
export type Tool = string;

interface Ui {
  tool: Tool;
  selection: string[];
  /** the style's symbol options, so the rail shows the canvas's symbols */
  ctikz: string;
}

let ui: Ui = { tool: 'select', selection: [], ctikz: 'american' };
let shapeOf: ShapeOf = (type) => placeholderShape(type);
const listeners = new Set<() => void>();

const set = (patch: Partial<Ui>) => {
  ui = { ...ui, ...patch };
  listeners.forEach((fn) => fn());
};

export const setTool = (tool: Tool) => {
  if (tool !== ui.tool) set({ tool });
};
export const setSelection = (selection: string[]) => {
  if (selection.join() !== ui.selection.join()) set({ selection });
};
export const setCtikz = (ctikz: string) => {
  if (ctikz !== ui.ctikz) set({ ctikz });
};
export const getUi = () => ui;

export function useCircuitUi() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, getUi);
}

/** The canvas hands over the pin geometry it draws with, so the inspector's edits are tidied the same way. */
export const setShapeOf = (fn: ShapeOf) => {
  shapeOf = fn;
};
export const shapeOfNow = () => shapeOf;

/**
 * Every edit goes through this before onChange: ends that landed on a pin take hold of it, so wires and
 * parts follow when that part moves, and the junction dots are worked out again.
 */
export function tidy(model: CircuitModel): CircuitModel {
  const held = attach(model, new Set(model.elements.map((el) => el.id)), shapeOf);
  return { ...held, junctions: findJunctions(held, shapeOf) };
}
