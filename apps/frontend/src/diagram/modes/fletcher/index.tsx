import type { DiagramMode } from '../../types';
import { copyTikz, emptyTikz, pasteTikz, removeTikz } from '../tikz/code';
import type { TikzModel } from '../tikz/code';
import { Canvas, Inspector, Rail } from '../tikz';
import { fletcherCode } from './code';

// Fletcher: the TikZ mode's flowcharts and block diagrams, on the same canvas, written as Typst. Its import line
// follows the project's Typst version, so an older Typst gets the fletcher it can load.

const fletcher: DiagramMode<TikzModel> = {
  id: 'fletcher',
  label: 'Flowchart or block diagram (fletcher)',
  language: 'typst',
  emptyModel: emptyTikz,
  toCode: (model, _style, context) => fletcherCode(model, context?.typstVersion ?? ''),
  Canvas,
  Rail,
  Inspector: (props) => <Inspector {...props} typst />,
  copy: copyTikz,
  paste: pasteTikz,
  remove: removeTikz
};

export default fletcher;
