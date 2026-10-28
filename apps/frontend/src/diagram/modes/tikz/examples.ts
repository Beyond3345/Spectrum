import type { TikzModel } from './code';

// The drawings the flowchart canvas's starters open with. The state machine opens in Typst too, so its shapes are
// ones fletcher writes; the model architecture has a vector stack, which is TikZ only.

/** State machine: a start state, an accepting state, a loop on each and a pair of arrows between them. */
export const stateMachine = (): TikzModel => ({
  boxes: [
    { id: 'n1', shape: 'state', x: 0, y: 0, w: 5, h: 5, text: 'q_0', initial: 'l' },
    { id: 'n2', shape: 'accepting', x: 16, y: 0, w: 5, h: 5, text: 'q_1' }
  ],
  links: [
    { id: 'e1', from: 'n1', to: 'n2', fromSide: 'r', toSide: 'l', route: 'bend', heads: 'end', label: 'a' },
    { id: 'e2', from: 'n2', to: 'n1', fromSide: 'l', toSide: 'r', route: 'bend', heads: 'end', label: 'b' },
    { id: 'e3', from: 'n1', to: 'n1', fromSide: 't', toSide: 't', route: 'straight', heads: 'end', label: 'b' },
    { id: 'e4', from: 'n2', to: 'n2', fromSide: 't', toSide: 't', route: 'straight', heads: 'end', label: 'a' }
  ]
});

/** Model architecture: an embedding vector into a block repeated ×N, its layers summed on the way up. */
export const modelArchitecture = (): TikzModel => ({
  boxes: [
    { id: 'n1', shape: 'container', x: -4, y: -2, w: 18, h: 22, text: 'Encoder layer', repeat: 'N' },
    { id: 'n2', shape: 'rounded', x: 0, y: 2, w: 10, h: 4, text: 'Feed forward', fill: '#c9e7f5' },
    { id: 'n3', shape: 'operator', x: 3, y: 8, w: 4, h: 4, text: '+' },
    { id: 'n4', shape: 'rounded', x: 0, y: 14, w: 10, h: 4, text: 'Attention', fill: '#fde6c4' },
    { id: 'n5', shape: 'stack', x: 3, y: 24, w: 4, h: 8, text: 'Embedding', cells: 4 }
  ],
  links: [
    { id: 'e1', from: 'n5', to: 'n4', fromSide: 't', toSide: 'b', route: 'straight', heads: 'end' },
    { id: 'e2', from: 'n4', to: 'n3', fromSide: 't', toSide: 'b', route: 'straight', heads: 'end' },
    { id: 'e3', from: 'n3', to: 'n2', fromSide: 't', toSide: 'b', route: 'straight', heads: 'end' }
  ]
});
