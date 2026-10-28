// Circuit (circuitikz): parts from the catalogue drawn by the user's own circuitikz, wired on a grid,
// and written out as one circuitikz picture.
import type { DiagramMode } from '../../types';
import Canvas from './Canvas';
import { circuitCode } from './code';
import { PARTS, asCircuit, emptyCircuit } from './model';
import type { CircuitModel } from './model';
import { CircuitInspector, CircuitRail, CircuitStyleMenu } from './panels';
import './circuitikz.css';

const circuitikz: DiagramMode<CircuitModel> = {
  id: 'circuitikz',
  label: 'Circuit (circuitikz)',
  language: 'tikz',
  emptyModel: emptyCircuit,
  toCode: (model, style) => circuitCode(asCircuit(model), style),
  sets: ['circuitikz'],
  setsInUse: (model) => [...new Set(asCircuit(model).elements.flatMap((el) => (el.kind === 'node' && PARTS.get(el.type)?.set ? [PARTS.get(el.type)!.set!] : [])))],
  Canvas,
  Rail: CircuitRail,
  Inspector: CircuitInspector,
  StyleMenu: CircuitStyleMenu
};

export default circuitikz;
