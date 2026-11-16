// Vector diagrams: points, vectors and constructions (midpoints, ratios, projections, intersections, reflections, u + v,
// v − u and scalar multiples), angles, circles and lines from their equations, kept exact as the points move, in panels
// side by side, written out as plain TikZ with named coordinates.
import type { DiagramMode } from '../../types';
import Canvas from './Canvas';
import { vectorCode } from './code';
import { asVectors, copyIds, emptyVectors, pasteInto, removeIds } from './model';
import type { VectorModel } from './model';
import { VectorInspector, VectorRail, VectorStyleMenu } from './panels';
import './vectors.css';

const vectors: DiagramMode<VectorModel> = {
  id: 'vectors',
  label: 'Vector diagram (TikZ)',
  language: 'tikz',
  emptyModel: emptyVectors,
  // a new drawing's vectors are very thick, as the user's figures draw them, until Style says otherwise; its vector
  // names as Settings › Diagram composer says
  newStyle: (defaults) => ({ vectorWidth: 'very thick', ...(defaults.vectorNotation && defaults.vectorNotation !== 'bold' && { notation: defaults.vectorNotation }) }),
  toCode: (model, style) => vectorCode(model, style),
  Canvas,
  Rail: VectorRail,
  Inspector: VectorInspector,
  StyleMenu: VectorStyleMenu,
  copy: (model, ids) => copyIds(asVectors(model), ids),
  paste: (model, clip) => {
    const m = asVectors(model);
    const c = asVectors(clip);
    return pasteInto(m, c, c.points[0]?.panel && m.panels.some((p) => p.id === c.points[0].panel) ? c.points[0].panel : m.panels[0].id, { x: 0.5, y: -0.5 });
  },
  remove: (model, ids) => removeIds(asVectors(model), ids)
};

export default vectors;
