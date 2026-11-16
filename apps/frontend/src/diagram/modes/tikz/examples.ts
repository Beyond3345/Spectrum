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

/** Decision flowchart: start, an input, a yes-or-no question whose No asks again, a step and the end. */
export const decisionFlowchart = (): TikzModel => ({
  boxes: [
    { id: 'n1', shape: 'terminal', x: 0, y: 0, w: 8, h: 4, text: 'Start' },
    { id: 'n2', shape: 'parallelogram', x: 0, y: 8, w: 8, h: 4, text: 'Read $n$' },
    { id: 'n3', shape: 'diamond', x: -1, y: 16, w: 10, h: 6, text: '$n > 0$?' },
    { id: 'n4', shape: 'rectangle', x: 0, y: 26, w: 8, h: 4, text: 'Add $n$ to the sum', wrap: true },
    { id: 'n5', shape: 'rectangle', x: 14, y: 17, w: 8, h: 4, text: 'Ask again' },
    { id: 'n6', shape: 'terminal', x: 0, y: 34, w: 8, h: 4, text: 'End' }
  ],
  links: [
    { id: 'e1', from: 'n1', to: 'n2', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' },
    { id: 'e2', from: 'n2', to: 'n3', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' },
    { id: 'e3', from: 'n3', to: 'n4', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end', label: 'Yes', labelSide: 'left' },
    { id: 'e4', from: 'n3', to: 'n5', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', label: 'No', labelSide: 'left' },
    { id: 'e5', from: 'n5', to: 'n2', fromSide: 't', toSide: 'r', route: 'angled', heads: 'end' },
    { id: 'e6', from: 'n4', to: 'n6', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' }
  ]
});

/**
 * Feedback loop: R(s) into a summing junction (+ from the input, − from the feedback), a gain K and a plant G(s), a
 * takeoff point to the output Y(s) and back through H(s).
 */
export const feedbackLoop = (): TikzModel => ({
  boxes: [
    { id: 'n1', shape: 'maths', x: 0, y: 3, w: 4, h: 2, text: 'R(s)' },
    { id: 'n2', shape: 'operator', x: 8, y: 2, w: 4, h: 4, text: '' },
    { id: 'n3', shape: 'gain', x: 16, y: 1, w: 6, h: 6, text: 'K' },
    { id: 'n4', shape: 'rectangle', x: 26, y: 2, w: 8, h: 4, text: '$G(s)$' },
    { id: 'n5', shape: 'takeoff', x: 38, y: 3, w: 2, h: 2, text: '' },
    { id: 'n6', shape: 'maths', x: 44, y: 3, w: 4, h: 2, text: 'Y(s)' },
    { id: 'n7', shape: 'rectangle', x: 26, y: 10, w: 8, h: 4, text: '$H(s)$' }
  ],
  links: [
    { id: 'e1', from: 'n1', to: 'n2', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', sign: '+' },
    { id: 'e2', from: 'n2', to: 'n3', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end', label: '$E(s)$', labelSide: 'left' },
    { id: 'e3', from: 'n3', to: 'n4', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end' },
    { id: 'e4', from: 'n4', to: 'n5', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'none' },
    { id: 'e5', from: 'n5', to: 'n6', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end' },
    { id: 'e6', from: 'n5', to: 'n7', fromSide: 'b', toSide: 'r', route: 'angled', heads: 'end' },
    { id: 'e7', from: 'n7', to: 'n2', fromSide: 'l', toSide: 'b', route: 'angled', heads: 'end', sign: '-' }
  ]
});

/** Swimlane process: who does each step, a lane each, the order passing between them. */
export const swimlanes = (): TikzModel => ({
  boxes: [
    { id: 'n1', shape: 'swimlane', x: 0, y: 0, w: 16, h: 28, text: 'Customer' },
    { id: 'n2', shape: 'swimlane', x: 16, y: 0, w: 16, h: 28, text: 'Shop' },
    { id: 'n3', shape: 'terminal', x: 4, y: 6, w: 8, h: 4, text: 'Order' },
    { id: 'n4', shape: 'rectangle', x: 19, y: 6, w: 10, h: 4, text: 'Check stock' },
    { id: 'n5', shape: 'rectangle', x: 19, y: 14, w: 10, h: 4, text: 'Send invoice' },
    { id: 'n6', shape: 'rectangle', x: 4, y: 14, w: 8, h: 4, text: 'Pay' },
    { id: 'n7', shape: 'terminal', x: 4, y: 22, w: 8, h: 4, text: 'Done' }
  ],
  links: [
    { id: 'e1', from: 'n3', to: 'n4', fromSide: 'r', toSide: 'l', route: 'straight', heads: 'end' },
    { id: 'e2', from: 'n4', to: 'n5', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' },
    { id: 'e3', from: 'n5', to: 'n6', fromSide: 'l', toSide: 'r', route: 'straight', heads: 'end' },
    { id: 'e4', from: 'n6', to: 'n7', fromSide: 'b', toSide: 't', route: 'straight', heads: 'end' }
  ]
});

/** Model architecture for Typst: the TikZ one with its embedding as a box, as fletcher has no vector stack. */
export const modelArchitectureTypst = (): TikzModel => {
  const model = modelArchitecture();
  return { ...model, boxes: model.boxes.map((b) => (b.shape === 'stack' ? { id: b.id, shape: 'rounded', x: 0, y: 24, w: 10, h: 4, text: 'Embedding', fill: '#e2e2e2' } : b)) };
};
