// Structures: beams, trusses and frames on a canvas, solved as they're drawn (reactions, shear force, bending moment
// and axial force diagrams, member forces, joints and sections), and written out as plain TikZ.
import type { DiagramMode } from '../../types';
import Canvas from './Canvas';
import { structureCode, structureStyle } from './code';
import { asStructure, copyIds, emptyStructure, pasteInto, removeIds } from './model';
import type { StructureModel } from './model';
import { StructureInspector, StructureRail, StructureStyleMenu } from './panels';
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
  paste: (model, clip) => pasteInto(asStructure(model), asStructure(clip), { x: 1, y: -1 }),
  remove: (model, ids) => removeIds(asStructure(model), ids)
};

export default structures;
