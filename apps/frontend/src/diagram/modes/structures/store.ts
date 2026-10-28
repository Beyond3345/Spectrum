// What the structures canvas shares with its panels in this window: the style menu gets only the style and the
// inspector only the model, so the joints and cuts the style menu offers, and the units the inspector shows, come from
// what the canvas last drew.
import { useSyncExternalStore } from 'react';
import { readStyle } from './draw';
import type { StructStyle } from './draw';
import { emptyStructure } from './model';
import type { StructureModel } from './model';

let shown: { model: StructureModel; style: StructStyle } = { model: emptyStructure(), style: readStyle({}) };
const listeners = new Set<() => void>();

export function setShown(model: StructureModel, style: StructStyle) {
  if (model === shown.model && JSON.stringify(style) === JSON.stringify(shown.style)) return;
  shown = { model, style };
  listeners.forEach((fn) => fn());
}

export const useShown = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => shown
  );
