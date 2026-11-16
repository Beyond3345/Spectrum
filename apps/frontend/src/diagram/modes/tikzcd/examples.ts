import type { CdModel } from './code';

// The drawings the commutative diagram's starters open with.

/** A commutative square: f then h is g then k. */
export const square = (): CdModel => ({
  cells: [
    { id: 'c1', row: 0, col: 0, text: 'A' },
    { id: 'c2', row: 0, col: 1, text: 'B' },
    { id: 'c3', row: 1, col: 0, text: 'C' },
    { id: 'c4', row: 1, col: 1, text: 'D' }
  ],
  arrows: [
    { id: 'a1', from: 'c1', to: 'c2', label: 'f' },
    { id: 'a2', from: 'c1', to: 'c3', label: 'g', swap: true },
    { id: 'a3', from: 'c2', to: 'c4', label: 'h' },
    { id: 'a4', from: 'c3', to: 'c4', label: 'k', swap: true }
  ]
});

/** A pullback: P with its maps to A and B, and the one dashed arrow u from any X with x and y that agree. */
export const pullback = (): CdModel => ({
  cells: [
    { id: 'c1', row: 0, col: 0, text: 'X' },
    { id: 'c2', row: 1, col: 1, text: 'P' },
    { id: 'c3', row: 1, col: 2, text: 'B' },
    { id: 'c4', row: 2, col: 1, text: 'A' },
    { id: 'c5', row: 2, col: 2, text: 'C' }
  ],
  arrows: [
    { id: 'a1', from: 'c1', to: 'c2', label: 'u', dashed: true },
    { id: 'a2', from: 'c1', to: 'c3', label: 'y' },
    { id: 'a3', from: 'c1', to: 'c4', label: 'x', swap: true },
    { id: 'a4', from: 'c2', to: 'c3', label: 'p_2' },
    { id: 'a5', from: 'c2', to: 'c4', label: 'p_1', swap: true },
    { id: 'a6', from: 'c3', to: 'c5', label: 'g' },
    { id: 'a7', from: 'c4', to: 'c5', label: 'f', swap: true }
  ]
});

/** A short exact sequence: 0 → A → B → C → 0. */
export const exactSequence = (): CdModel => ({
  cells: ['0', 'A', 'B', 'C', '0'].map((text, col) => ({ id: `c${col + 1}`, row: 0, col, text })),
  arrows: [1, 2, 3, 4].map((n) => ({ id: `a${n}`, from: `c${n}`, to: `c${n + 1}`, ...(n === 2 ? { label: 'f' } : n === 3 ? { label: 'g' } : {}) }))
});
