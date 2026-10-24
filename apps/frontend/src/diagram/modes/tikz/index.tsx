import type { ComponentProps, CSSProperties } from 'react';
import { BaseEdge, Handle, MarkerType, NodeResizer, Position } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import Select from '../../../app/Select';
import { FlowCanvas } from '../../FlowCanvas';
import { ColourField, Row, ToolRail, railIcon } from '../../controls';
import type { Tool } from '../../controls';
import type { DiagramMode } from '../../types';
import { anchorOf, copyTikz, curveControls, emptyTikz, middleOf, nextId, pasteTikz, pathPoints, removeTikz, tikzCode } from './code';
import type { Box, Dash, Heads, Line, Link, Route, Shape, Side, TikzModel } from './code';

// Plain TikZ: flowcharts and block diagrams on the canvas

/** px per grid unit (0.25 cm), so 1 cm is 64 px and 10 pt text about 22 px */
const UNIT = 16;
/** 1 pt in px at that scale */
const PT = 64 / 28.45;

const TOOLS: Tool[] = [
  { id: 'select', label: 'Select', icon: railIcon(<path d="M4 2.5v10l2.8-2.6 1.9 4.3 1.6-.7-1.9-4.2 3.8-.2z" strokeLinejoin="round" />) },
  { id: 'rectangle', label: 'Rectangle', icon: railIcon(<rect x="2" y="4" width="12" height="8" />) },
  { id: 'rounded', label: 'Rounded rectangle', icon: railIcon(<rect x="2" y="4" width="12" height="8" rx="3" />) },
  { id: 'circle', label: 'Circle', icon: railIcon(<circle cx="8" cy="8" r="5.5" />) },
  { id: 'ellipse', label: 'Ellipse', icon: railIcon(<ellipse cx="8" cy="8" rx="6.5" ry="4.5" />) },
  { id: 'diamond', label: 'Diamond', icon: railIcon(<path d="M8 2 14 8 8 14 2 8z" />) },
  { id: 'parallelogram', label: 'Parallelogram', icon: railIcon(<path d="M5 4h9l-3 8H2z" />) },
  { id: 'text', label: 'Text', icon: railIcon(<path d="M3.5 4h9M8 4v9" />) },
  { id: 'maths', label: 'Maths label', icon: railIcon(<path d="M12 3.5H4l4.5 4.5L4 12.5h8" strokeLinejoin="round" />) }
];

const SHAPES: [Shape, string][] = [
  ['rectangle', 'Rectangle'],
  ['rounded', 'Rounded rectangle'],
  ['circle', 'Circle'],
  ['ellipse', 'Ellipse'],
  ['diamond', 'Diamond'],
  ['parallelogram', 'Parallelogram'],
  ['text', 'Text'],
  ['maths', 'Maths label']
];

/** a new shape's size in grid units, and its text */
const NEW: Record<Shape, [number, number, string]> = {
  rectangle: [8, 4, 'Text'],
  rounded: [8, 4, 'Text'],
  circle: [5, 5, ''],
  ellipse: [8, 5, 'Text'],
  diamond: [8, 6, 'Text'],
  parallelogram: [8, 4, 'Text'],
  text: [6, 2, 'Text'],
  maths: [6, 2, 'x^2']
};

const DASHES: [Dash, string][] = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted']
];
const WIDTHS: [string, string][] = [
  ['', 'Thin'],
  ['0.8', 'Thick'],
  ['1.2', 'Very thick']
];
const ROUTES: [Route, string][] = [
  ['straight', 'Straight'],
  ['angled', 'Right-angled'],
  ['curved', 'Curved']
];
const HEADS: [Heads, string][] = [
  ['end', 'At the end'],
  ['start', 'At the start'],
  ['both', 'At both ends'],
  ['none', 'None']
];

const ink = (line: Line) => line.stroke ?? 'var(--diagram-ink)';
const strokeOf = (line: Line) => ({
  stroke: ink(line),
  strokeWidth: Math.max(1, (line.width ?? 0.4) * PT),
  strokeDasharray: line.dash === 'dashed' ? '6 4' : line.dash === 'dotted' ? '1.5 3' : undefined,
  strokeLinecap: line.dash === 'dotted' ? ('round' as const) : undefined
});

/** The outline of a shape w × h px, as TikZ draws it. */
function outline(shape: Shape, w: number, h: number, style: CSSProperties) {
  switch (shape) {
    case 'rectangle':
      return <rect width={w} height={h} style={style} />;
    case 'rounded':
      // TikZ's rounded corners: 4 pt
      return <rect width={w} height={h} rx={4 * PT} style={style} />;
    case 'circle':
      return <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} style={style} />;
    case 'ellipse':
      return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} style={style} />;
    case 'diamond':
      return <path d={`M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`} style={style} />;
    case 'parallelogram': {
      // trapezium left angle=70
      const slant = h / Math.tan((70 * Math.PI) / 180);
      return <path d={`M${slant} 0H${w}L${w - slant} ${h}H0Z`} style={style} />;
    }
    default:
      return null;
  }
}

type BoxNode = Node<{ box: Box; readOnly: boolean }, 'box'>;

function BoxView({ data: { box, readOnly }, selected, width = 0, height = 0 }: NodeProps<BoxNode>) {
  const plain = box.shape === 'text' || box.shape === 'maths';
  return (
    <div className={`tikz-box${plain ? ' plain' : ''}`}>
      <NodeResizer isVisible={selected && !readOnly} minWidth={UNIT * 2} minHeight={UNIT * 2} />
      <svg className="tikz-box-shape" width={width} height={height} overflow="visible">
        {outline(box.shape, width, height, { fill: box.fill ?? 'none', ...strokeOf(box) })}
      </svg>
      {/* TikZ writes black on a fill, so a dark canvas keeps it black there */}
      <div className={`tikz-box-text${box.shape === 'maths' ? ' maths' : ''}`} style={{ color: plain ? box.stroke : box.fill && '#000000' }}>
        {box.text}
      </div>
      {(['t', 'r', 'b', 'l'] as Side[]).map((side) => (
        <Handle key={side} id={side} type="source" position={{ t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }[side]} />
      ))}
    </div>
  );
}

type LinkEdge = Edge<{ d: string; labelX: number; labelY: number; text?: string }, 'link'>;

function LinkView({ data, style, markerStart, markerEnd, interactionWidth }: EdgeProps<LinkEdge>) {
  if (!data) return null;
  return (
    <BaseEdge
      path={data.d}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
      label={data.text || undefined}
      labelX={data.labelX}
      labelY={data.labelY}
      labelShowBg
      labelBgPadding={[4, 2]}
      labelBgStyle={{ fill: 'var(--diagram-paper)' }}
      labelStyle={{ fill: 'var(--diagram-ink)', fontSize: 18, fontFamily: 'var(--font-serif)' }}
    />
  );
}

const nodeTypes = { box: BoxView };
const edgeTypes = { link: LinkView };

/** The SVG path of a link in px, and where its label goes, matching what tikzCode writes. */
function linkPath(link: Link, from: Box, to: Box) {
  const px = ([x, y]: [number, number]) => [x * UNIT, y * UNIT];
  if (link.route === 'curved') {
    const [a, b] = [anchorOf(from, link.fromSide), anchorOf(to, link.toSide)].map(px);
    const [c1, c2] = curveControls(link, from, to).map(px);
    // a cubic Bézier's middle
    const mid = [0, 1].map((i) => (a[i] + 3 * c1[i] + 3 * c2[i] + b[i]) / 8);
    return { d: `M${a}C${c1} ${c2} ${b}`, labelX: mid[0], labelY: mid[1] };
  }
  const points = pathPoints(link, from, to);
  const { leg, pos } = middleOf(points);
  const [p, q] = [points[leg], points[leg + 1]].map(px);
  return { d: `M${points.map(px).join('L')}`, labelX: p[0] + (q[0] - p[0]) * pos, labelY: p[1] + (q[1] - p[1]) * pos };
}

type CanvasProps = ComponentProps<DiagramMode<TikzModel>['Canvas']>;

function Canvas({ model, onChange, readOnly, selection = [], onSelect, tool = 'select', onTool }: CanvasProps) {
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  const nodes: BoxNode[] = model.boxes.map((box) => ({
    id: box.id,
    type: 'box',
    position: { x: box.x * UNIT, y: box.y * UNIT },
    width: box.w * UNIT,
    height: box.h * UNIT,
    data: { box, readOnly: !!readOnly }
  }));
  const edges: LinkEdge[] = model.links.flatMap((link) => {
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    if (!from || !to) return [];
    const colour = link.stroke ?? 'var(--diagram-ink)';
    const head = { type: MarkerType.ArrowClosed, color: colour, width: 14, height: 14 };
    return [
      {
        id: link.id,
        type: 'link',
        source: link.from,
        target: link.to,
        sourceHandle: link.fromSide,
        targetHandle: link.toSide,
        data: { ...linkPath(link, from, to), text: link.label },
        style: strokeOf(link),
        markerEnd: link.heads === 'end' || link.heads === 'both' ? head : undefined,
        markerStart: link.heads === 'start' || link.heads === 'both' ? head : undefined
      }
    ];
  });

  const place = (at: { x: number; y: number }) => {
    const shape = SHAPES.find(([s]) => s === tool)?.[0];
    if (!shape || readOnly) return;
    const [w, h, text] = NEW[shape];
    const id = nextId('n', model.boxes.map((b) => b.id));
    onChange({ ...model, boxes: [...model.boxes, { id, shape, x: Math.round(at.x / UNIT - w / 2), y: Math.round(at.y / UNIT - h / 2), w, h, text }] });
    onSelect?.([id]);
    onTool?.('select');
  };

  return (
    <div className={`diagram-flow${tool !== 'select' ? ' placing' : ''}`}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        grid={UNIT}
        dots={UNIT * 2}
        readOnly={readOnly}
        selection={selection}
        onSelect={onSelect}
        onMove={(moves) =>
          onChange({
            ...model,
            boxes: model.boxes.map((b) => {
              const m = moves.find((move) => move.id === b.id);
              return m ? { ...b, x: Math.round(m.x / UNIT), y: Math.round(m.y / UNIT) } : b;
            })
          })
        }
        onResize={(id, width, height) =>
          onChange({ ...model, boxes: model.boxes.map((b) => (b.id === id ? { ...b, w: Math.max(2, Math.round(width / UNIT)), h: Math.max(2, Math.round(height / UNIT)) } : b)) })
        }
        onConnect={(c) => {
          const id = nextId('e', model.links.map((l) => l.id));
          const link: Link = { id, from: c.source, to: c.target, fromSide: (c.sourceHandle || 'r') as Side, toSide: (c.targetHandle || 'l') as Side, route: 'straight', heads: 'end' };
          onChange({ ...model, links: [...model.links, link] });
          onSelect?.([id]);
        }}
        onPlace={place}
        onNodeDoubleClick={(id) => {
          onSelect?.([id]);
          window.setTimeout(() => document.getElementById('diagram-text')?.focus());
        }}
      />
    </div>
  );
}

function Rail({ tool, onPick }: { tool: string; onPick(tool: string): void }) {
  return <ToolRail tools={TOOLS} tool={tool} onPick={onPick} />;
}

/** The value the selected items share, or undefined when they differ. */
const shared = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] : undefined);

function Inspector({ model, onChange, selection = [] }: { model: TikzModel; onChange(m: TikzModel): void; selection?: string[] }) {
  const boxes = model.boxes.filter((b) => selection.includes(b.id));
  const links = model.links.filter((l) => selection.includes(l.id));
  if (!boxes.length && !links.length) {
    return (
      <div className="diagram-hint">
        Pick a shape on the left, then click the canvas to place it. Drag from a dot on a shape’s edge to another shape to join
        them with an arrow. Select something to change it here.
      </div>
    );
  }
  const items: Line[] = [...boxes, ...links];
  const patchBoxes = (patch: Partial<Box>) => onChange({ ...model, boxes: model.boxes.map((b) => (selection.includes(b.id) ? { ...b, ...patch } : b)) });
  const patchLinks = (patch: Partial<Link>) => onChange({ ...model, links: model.links.map((l) => (selection.includes(l.id) ? { ...l, ...patch } : l)) });
  const patchAll = (patch: Line) =>
    onChange({
      boxes: model.boxes.map((b) => (selection.includes(b.id) ? { ...b, ...patch } : b)),
      links: model.links.map((l) => (selection.includes(l.id) ? { ...l, ...patch } : l))
    });
  const box = boxes.length === 1 && !links.length ? boxes[0] : null;
  const link = links.length === 1 && !boxes.length ? links[0] : null;
  const allPlain = boxes.length > 0 && !links.length && boxes.every((b) => b.shape === 'text' || b.shape === 'maths');

  return (
    <div className="diagram-inspector-fields">
      {box && (
        <>
          <Row label={box.shape === 'maths' ? 'Maths (LaTeX, without $)' : 'Text (LaTeX)'}>
            <textarea id="diagram-text" className="input diagram-textarea" rows={3} spellCheck={false} value={box.text} onChange={(e) => patchBoxes({ text: e.target.value })} />
          </Row>
          <Row label="Shape">
            <Select value={box.shape} options={SHAPES} onChange={(shape) => patchBoxes({ shape: shape as Shape })} />
          </Row>
          <div className="diagram-row">
            <span>Size (cm)</span>
            <span className="diagram-pair">
              {(['w', 'h'] as const).map((key) => (
                <input
                  key={key}
                  type="number"
                  className="input"
                  aria-label={key === 'w' ? 'Width in cm' : 'Height in cm'}
                  min={0.5}
                  step={0.25}
                  value={box[key] / 4}
                  onChange={(e) => Number(e.target.value) >= 0.5 && patchBoxes({ [key]: Math.round(Number(e.target.value) * 4) })}
                />
              ))}
            </span>
          </div>
        </>
      )}
      {link && (
        <>
          <Row label="Label">
            <input className="input" value={link.label ?? ''} spellCheck={false} onChange={(e) => patchLinks({ label: e.target.value })} />
          </Row>
          <Row label="Line">
            <Select value={link.route} options={ROUTES} onChange={(route) => patchLinks({ route: route as Route })} />
          </Row>
          <Row label="Arrowheads">
            <Select value={link.heads} options={HEADS} onChange={(heads) => patchLinks({ heads: heads as Heads })} />
          </Row>
        </>
      )}
      {boxes.length > 0 && !links.length && !allPlain && (
        <ColourField label="Fill" value={shared(boxes.map((b) => b.fill))} fallback="None" onChange={(fill) => patchBoxes({ fill })} />
      )}
      <ColourField label={allPlain ? 'Text colour' : 'Line colour'} value={shared(items.map((i) => i.stroke))} fallback="Black" onChange={(stroke) => patchAll({ stroke })} />
      {!allPlain && (
        <>
          <Row label="Dashes">
            <Select value={shared(items.map((i) => i.dash ?? 'solid')) ?? ''} options={DASHES} onChange={(dash) => patchAll({ dash: dash === 'solid' ? undefined : (dash as Dash) })} />
          </Row>
          <Row label="Thickness">
            <Select
              value={shared(items.map((i) => (i.width ? String(i.width) : ''))) ?? 'mixed'}
              options={WIDTHS}
              onChange={(width) => patchAll({ width: width ? Number(width) : undefined })}
            />
          </Row>
        </>
      )}
    </div>
  );
}

const tikzMode: DiagramMode<TikzModel> = {
  id: 'tikz',
  label: 'Diagram (TikZ)',
  language: 'tikz',
  emptyModel: emptyTikz,
  toCode: (model) => tikzCode(model),
  Canvas,
  Rail,
  Inspector,
  copy: copyTikz,
  paste: pasteTikz,
  remove: removeTikz
};

export default tikzMode;
