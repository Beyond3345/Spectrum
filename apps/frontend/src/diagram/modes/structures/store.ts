// What the structures canvas shares with its panels in this window: the style menu gets only the style and the
// inspector only the model, so the joints and cuts the style menu offers, and the units the inspector shows, come from
// what the canvas last drew, and the style menu converts the model's numbers through the canvas.
import { useSyncExternalStore } from 'react';
import { readStyle } from './draw';
import type { StructStyle } from './draw';
import { emptyStructure } from './model';
import type { StructureModel } from './model';

/** edit: the canvas's way to change the model, for the style menu's unit conversion */
let shown: { model: StructureModel; style: StructStyle; edit?: (model: StructureModel) => void } = { model: emptyStructure(), style: readStyle({}) };
const listeners = new Set<() => void>();

export function setShown(model: StructureModel, style: StructStyle, edit?: (model: StructureModel) => void) {
  if (model === shown.model && JSON.stringify(style) === JSON.stringify(shown.style)) {
    shown.edit = edit;
    return;
  }
  shown = { model, style, edit };
  listeners.forEach((fn) => fn());
}

/** What the canvas last drew, outside React (paste reads the grid from it). */
export const getShown = () => shown;

export const useShown = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => shown
  );
