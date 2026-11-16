// Structures: beams, trusses and frames on a canvas, solved as they're drawn (reactions, shear force, bending moment
// and axial force diagrams, member forces, joints and sections), and written out as plain TikZ.
import type { DiagramMode } from '../../types';
import Canvas from './Canvas';
import { structureCode, structureStyle } from './code';
import { UNITS, asStructure, copyIds, emptyStructure, pasteInto, removeIds } from './model';
import type { StructureModel } from './model';
import { StructureInspector, StructureRail, StructureStyleMenu } from './panels';
import { getShown } from './store';
import './structures.css';

const structures: DiagramMode<StructureModel> = {
  id: 'structures',
  label: 'Structure (beams, trusses, frames)',
  language: 'tikz',
  emptyModel: emptyStructure,
  newStyle: structureStyle,
  toCode: (model, style) => structureCode(model, style),
  Canvas,
  Rail: StructureRail,
  Inspector: StructureInspector,
  StyleMenu: StructureStyleMenu,
  copy: (model, ids) => copyIds(asStructure(model), ids),
  // two grid steps right and down, so the copy shows beside the original in any units
  paste: (model, clip) => {
    const { units, grid } = getShown().style;
    const step = 2 * UNITS[units].grids[grid];
    return pasteInto(asStructure(model), asStructure(clip), { x: step, y: -step });
  },
  remove: (model, ids) => removeIds(asStructure(model), ids)
};

export default structures;
