// Circuit (circuitikz): parts from the catalogue drawn by the user's own circuitikz, wired on a grid,
// and written out as one circuitikz picture.
import type { DiagramMode } from '../../types';
import Canvas from './Canvas';
import { circuitCode } from './code';
import { asCircuit, emptyCircuit } from './model';
import type { CircuitModel } from './model';
import { CircuitInspector, CircuitRail, CircuitStyleMenu } from './panels';
import './circuitikz.css';

const circuitikz: DiagramMode<CircuitModel> = {
  id: 'circuitikz',
  label: 'Circuit (circuitikz)',
  language: 'tikz',
  emptyModel: emptyCircuit,
  toCode: (model, style) => circuitCode(asCircuit(model), style),
  Canvas,
  Rail: CircuitRail,
  Inspector: CircuitInspector,
  StyleMenu: CircuitStyleMenu
};

export default circuitikz;
