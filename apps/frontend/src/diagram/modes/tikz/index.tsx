import type { ComponentProps, CSSProperties } from 'react';
import { BaseEdge, Handle, MarkerType, NodeResizer, Position } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import Icon from '../../../app/Icon';
import Select from '../../../app/Select';
import { FlowCanvas } from '../../FlowCanvas';
import { ColourField, Row, ToolRail, railIcon } from '../../controls';
import type { Tool } from '../../controls';
import type { DiagramMode } from '../../types';
import {
  BEND,
  FLETCHER_SHAPES,
  MATHS_SHAPES,
  ROUND_SHAPES,
  SIGN_AT,
  along,
  anchorOf,
  bandOf,
  holds,
  polygonOf,
  connect,
  copyTikz,
  curveControls,
  dividersOf,
  drawingOrder,
  emptyTikz,
  moveBoxes,
  NEW,
  nextId,
  pasteTikz,
  pathPoints,
  plainShape,
  removeTikz,
  resized,
  stateShape,
  tikzCode,
  turnTikz
} from './code';
import type { Box, Dash, Heads, LabelSide, Line, Link, Route, Shape, Side, TikzModel, Turn } from './code';

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
  { id: 'maths', label: 'Maths label', icon: railIcon(<path d="M12 3.5H4l4.5 4.5L4 12.5h8" strokeLinejoin="round" />) },
  { id: 'state', label: 'State', icon: railIcon(<><circle cx="9.5" cy="8" r="4.5" /><path d="M1 8h3.5M3 6.5 4.5 8 3 9.5" /></>) },
  { id: 'accepting', label: 'Accepting state', icon: railIcon(<><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="3.5" /></>) },
  { id: 'cylinder', label: 'Cylinder (data store)', icon: railIcon(<><ellipse cx="8" cy="4" rx="5" ry="1.8" /><path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" /></>) },
  { id: 'document', label: 'Document', icon: railIcon(<path d="M2.5 3h11v9c-2.5-1.8-3.5 1.5-5.5 1.2S5 11.6 2.5 12.5z" strokeLinejoin="round" />) },
  { id: 'trapezium', label: 'Trapezium (manual step)', icon: railIcon(<path d="M4.5 4h7l2.5 8H2z" />) },
  { id: 'operator', label: 'Operator circle', icon: railIcon(<><circle cx="8" cy="8" r="5.5" /><path d="M8 5v6M5 8h6" /></>) },
  { id: 'stack', label: 'Vector stack', icon: railIcon(<><rect x="5" y="2" width="6" height="12" /><path d="M5 5h6M5 8h6M5 11h6" /></>) },
  { id: 'container', label: 'Container', icon: railIcon(<><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M3.5 5h5" /></>) },
  { id: 'terminal', label: 'Terminal (start or end)', icon: railIcon(<rect x="1.5" y="4.5" width="13" height="7" rx="3.5" />) },
  { id: 'manualInput', label: 'Manual input', icon: railIcon(<path d="M2 6.5 14 3.5v9H2z" strokeLinejoin="round" />) },
  { id: 'offPage', label: 'Off-page connector', icon: railIcon(<path d="M3.5 2.5h9v7L8 13.5 3.5 9.5z" strokeLinejoin="round" />) },
  { id: 'gain', label: 'Gain (block diagram)', icon: railIcon(<path d="M3 2.5v11L13.5 8z" strokeLinejoin="round" />) },
  { id: 'takeoff', label: 'Takeoff point', icon: railIcon(<><path d="M1.5 8h13M8 8v6" /><circle cx="8" cy="8" r="1.8" fill="currentColor" /></>) },
  { id: 'swimlane', label: 'Swimlane', icon: railIcon(<><rect x="1.5" y="1.5" width="13" height="13" /><path d="M1.5 5h13M8 1.5v13" /></>) }
];

const SHAPES: [Shape, string][] = [
  ['rectangle', 'Rectangle'],
  ['rounded', 'Rounded rectangle'],
  ['circle', 'Circle'],
  ['ellipse', 'Ellipse'],
  ['diamond', 'Diamond'],
  ['parallelogram', 'Parallelogram'],
  ['text', 'Text'],
  ['maths', 'Maths label'],
  ['state', 'State'],
  ['accepting', 'Accepting state'],
  ['cylinder', 'Cylinder'],
  ['document', 'Document'],
  ['trapezium', 'Trapezium'],
  ['operator', 'Operator circle'],
  ['stack', 'Vector stack'],
  ['container', 'Container'],
  ['terminal', 'Terminal'],
  ['manualInput', 'Manual input'],
  ['offPage', 'Off-page connector'],
  ['gain', 'Gain'],
  ['takeoff', 'Takeoff point'],
  ['swimlane', 'Swimlane']
];
const TIPS: [Side, string][] = [
  ['r', 'Right'],
  ['l', 'Left'],
  ['t', 'Up'],
  ['b', 'Down']
];
const BANDS: [Side, string][] = [
  ['t', 'At the top'],
  ['l', 'On the left'],
  ['r', 'On the right'],
  ['b', 'At the bottom']
];
const SIGNS: [string, string][] = [
  ['', 'None'],
  ['+', '+'],
  ['-', '−']
];
const TURNS: [Turn, string, string, string][] = [
  ['left', 'Turn a quarter anticlockwise', 'arrow.counterclockwise', ''],
  ['right', 'Turn a quarter clockwise', 'arrow.clockwise', ''],
  ['across', 'Mirror left to right', 'arrow.left.and.right', ''],
  ['over', 'Mirror top to bottom', 'arrow.left.and.right', 'rotate(90deg)']
];


const LOOP_SIDES: [Side, string][] = [
  ['t', 'Above'],
  ['r', 'On the right'],
  ['b', 'Below'],
  ['l', 'On the left']
];
const STARTS: [string, string][] = [
  ['', 'None'],
  ['l', 'From the left'],
  ['t', 'From above'],
  ['r', 'From the right'],
  ['b', 'From below']
];

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
  ['curved', 'Curved'],
  ['bend', 'Bent to one side']
];
const HEADS: [Heads, string][] = [
  ['end', 'At the end'],
  ['start', 'At the start'],
  ['both', 'At both ends'],
  ['none', 'None']
];

/** a colour as the canvas shows it: black, or none, is the canvas's ink, so it reads on a dark canvas too */
const inkOf = (colour?: string) => (colour && colour.toLowerCase() !== '#000000' ? colour : 'var(--diagram-ink)');
const ink = (line: Line) => inkOf(line.stroke);
const strokeOf = (line: Line) => ({
  stroke: ink(line),
  strokeWidth: Math.max(1, (line.width ?? 0.4) * PT),
  strokeDasharray: line.dash === 'dashed' ? '6 4' : line.dash === 'dotted' ? '1.5 3' : undefined,
  strokeLinecap: line.dash === 'dotted' ? ('round' as const) : undefined
});

/** The outline of a box w × h px, as TikZ draws it. */
function outline(box: Box, w: number, h: number, style: CSSProperties) {
  const r = Math.min(w, h) / 2;
  const here = { ...box, x: 0, y: 0, w: w / UNIT, h: h / UNIT };
  const polygon = polygonOf(here);
  if (polygon) return <path d={`M${polygon.map(([x, y]) => [x * UNIT, y * UNIT]).join('L')}Z`} style={style} />;
  switch (box.shape) {
    case 'terminal':
      return <rect width={w} height={h} rx={r} style={style} />;
    case 'takeoff':
      // a dot 1.2 mm across, filled in its line colour
      return <circle cx={w / 2} cy={h / 2} r={0.06 * 64} style={{ ...style, fill: style.stroke }} />;
    case 'swimlane': {
      const [[x1, y1], [x2, y2]] = bandOf(here).line;
      return (
        <>
          <rect width={w} height={h} style={style} />
          <line x1={x1 * UNIT} y1={y1 * UNIT} x2={x2 * UNIT} y2={y2 * UNIT} style={style} />
        </>
      );
    }
    case 'rectangle':
      return <rect width={w} height={h} style={style} />;
    case 'rounded':
    case 'container':
      // TikZ's rounded corners: 4 pt
      return <rect width={w} height={h} rx={4 * PT} style={style} />;
    case 'circle':
    case 'state':
    case 'operator':
      return <circle cx={w / 2} cy={h / 2} r={r} style={style} />;
    case 'accepting':
      return (
        <>
          <circle cx={w / 2} cy={h / 2} r={r} style={style} />
          <circle cx={w / 2} cy={h / 2} r={Math.max(1, r - 3 * PT)} style={{ ...style, fill: 'none' }} />
        </>
      );
    case 'cylinder': {
      // aspect 0.25: the ends' height a quarter of the width, half of it each side of the top and bottom lines
      const ry = w / 8;
      return (
        <>
          <path d={`M0 ${ry}V${h - ry}A${w / 2} ${ry} 0 0 0 ${w} ${h - ry}V${ry}A${w / 2} ${ry} 0 0 0 0 ${ry}Z`} style={style} />
          <path d={`M0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`} style={{ ...style, fill: 'none' }} />
        </>
      );
    }
    case 'document': {
      // a straight top and a bottom that waves in and out
      const wave = h / 10;
      return <path d={`M0 0H${w}V${h - wave}C${w * 0.75} ${h - 3 * wave} ${w * 0.6} ${h - 2 * wave} ${w / 2} ${h - wave}S${w * 0.25} ${h + wave} 0 ${h - wave}Z`} style={style} />;
    }
    case 'trapezium': {
      // trapezium left and right angle=70: the top is the shorter side
      const slant = h / Math.tan((70 * Math.PI) / 180);
      return <path d={`M${slant} 0H${w - slant}L${w} ${h}H0Z`} style={style} />;
    }
    case 'stack':
      return (
        <>
          <rect width={w} height={h} style={style} />
          {dividersOf({ ...box, y: 0, h: h / UNIT }).map((y) => (
            <line key={y} x1={0} x2={w} y1={y * UNIT} y2={y * UNIT} style={style} />
          ))}
        </>
      );
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

const OUT: Record<Side, [number, number]> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

/** A state's start arrow, 0.75 cm long, into its circle on that side, with its head. */
function startArrow(side: Side, w: number, h: number) {
  const r = Math.min(w, h) / 2;
  const [dx, dy] = OUT[side];
  const [x, y] = [w / 2 + dx * r, h / 2 + dy * r];
  const [len, head] = [0.75 * 64, 6];
  return `M${x + dx * len} ${y + dy * len}L${x} ${y}M${x + dx * head - dy * head} ${y + dy * head - dx * head}L${x} ${y}L${x + dx * head + dy * head} ${y + dy * head + dx * head}`;
}

function BoxView({ data: { box, readOnly }, selected, width = 0, height = 0 }: NodeProps<BoxNode>) {
  const plain = plainShape(box.shape);
  const container = holds(box.shape);
  const band = box.shape === 'swimlane' && bandOf({ ...box, x: 0, y: 0, w: width / UNIT, h: height / UNIT });
  return (
    <div className={`tikz-box${plain ? ' plain' : ''}`}>
      <NodeResizer isVisible={selected && !readOnly} minWidth={UNIT * 2} minHeight={UNIT * 2} />
      <svg className="tikz-box-shape" width={width} height={height} overflow="visible">
        {outline(box, width, height, { fill: box.fill ?? 'none', ...strokeOf(box) })}
        {stateShape(box.shape) && box.initial && <path d={startArrow(box.initial, width, height)} style={{ ...strokeOf(box), fill: 'none' }} />}
        {/* a container is picked up by its edge, so clicks inside it reach the boxes in it and the canvas */}
        {container && <rect className="tikz-container-hit" width={width} height={height} rx={band ? 0 : 4 * PT} />}
      </svg>
      {/* TikZ writes black on a fill, so a dark canvas keeps it black there */}
      {band ? (
        <div
          className="tikz-box-caption"
          style={{ left: band.title[0] * UNIT, top: band.title[1] * UNIT, transform: `translate(-50%, -50%) rotate(${-band.rotate}deg)`, color: box.fill ? '#000000' : inkOf(box.stroke), textAlign: 'center' }}
        >
          {box.text}
        </div>
      ) : box.shape === 'takeoff' ? null : container || box.shape === 'stack' ? (
        <div className={`tikz-box-caption ${container ? 'title' : 'below'}`} style={{ color: inkOf(box.stroke) }}>
          {box.text}
        </div>
      ) : (
        <div className={`tikz-box-text${MATHS_SHAPES.includes(box.shape) ? ' maths' : ''}`} style={{ color: plain ? inkOf(box.stroke) : box.fill && '#000000' }}>
          {box.text}
        </div>
      )}
      {box.shape === 'container' && box.repeat?.trim() && <div className="tikz-box-caption repeat">× {box.repeat.trim()}</div>}
      {(['t', 'r', 'b', 'l'] as Side[]).map((side) => (
        <Handle key={side} id={side} type="source" position={{ t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }[side]} />
      ))}
    </div>
  );
}

type LinkEdge = Edge<{ d: string; labelX: number; labelY: number; text?: string; beside?: boolean; sign?: { x: number; y: number; text: string } }, 'link'>;

function LinkView({ data, style, markerStart, markerEnd, interactionWidth }: EdgeProps<LinkEdge>) {
  if (!data) return null;
  const font = { fill: 'var(--diagram-ink)', fontSize: 18, fontFamily: 'var(--font-serif)' };
  return (
    <>
      <BaseEdge
        path={data.d}
        style={style}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        label={data.text || undefined}
        labelX={data.labelX}
        labelY={data.labelY}
        // on the line, over the paper; beside it, as TikZ's auto writes it, with nothing under it
        labelShowBg={!data.beside}
        labelBgPadding={[4, 2]}
        labelBgStyle={{ fill: 'var(--diagram-paper)' }}
        labelStyle={font}
      />
      {data.sign && (
        <text x={data.sign.x} y={data.sign.y} textAnchor="middle" dominantBaseline="central" style={font}>
          {data.sign.text}
        </text>
      )}
    </>
  );
}

const nodeTypes = { box: BoxView };
const edgeTypes = { link: LinkView };

/** A point on a link and which way it goes there, in px. */
type OnPath = { p: number[]; u: number[] };

/**
 * The SVG path of a link in px, and where its label and sign go, matching what tikzCode writes: a label on the line,
 * or beside it on the left or right of the way it goes, at its place along it; a sign on the left near the end.
 */
function linkPath(link: Link, from: Box, to: Box) {
  const { d, at } = linkLine(link, from, to);
  const text = link.label?.trim() ?? '';
  const side = link.labelSide === 'left' ? 1 : link.labelSide === 'right' ? -1 : 0;
  // left of the way it goes, on a canvas whose y goes down
  const beside = ({ p, u }: OnPath, s: number, w: number, hh: number) => {
    const n = [u[1] * s, -u[0] * s];
    const gap = 6 + Math.abs(n[0]) * w + Math.abs(n[1]) * hh;
    return [p[0] + n[0] * gap, p[1] + n[1] * gap];
  };
  const label = at(link.labelPos ?? 0.5);
  // ponytail: the label's width guessed from its length, 9 px a character; measure it if labels land badly
  const [labelX, labelY] = side ? beside(label, side, text.length * 4.5, 10) : label.p;
  const signAt = link.sign && beside(at(SIGN_AT), 1, 6, 10);
  return { d, labelX, labelY, beside: !!side, sign: signAt ? { x: signAt[0], y: signAt[1], text: link.sign === '-' ? '−' : '+' } : undefined };
}

/** The SVG path of a link in px, and the point a fraction t of the way along it. */
function linkLine(link: Link, from: Box, to: Box): { d: string; at(t: number): OnPath } {
  const px = ([x, y]: [number, number]) => [x * UNIT, y * UNIT];
  const unit = (v: number[]) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };
  const cubic = (a: number[], c1: number[], c2: number[], b: number[]) => ({
    d: `M${a}C${c1} ${c2} ${b}`,
    at: (t: number) => {
      const s = 1 - t;
      const p = [0, 1].map((i) => s * s * s * a[i] + 3 * s * s * t * c1[i] + 3 * s * t * t * c2[i] + t * t * t * b[i]);
      const u = [0, 1].map((i) => 3 * s * s * (c1[i] - a[i]) + 6 * s * t * (c2[i] - c1[i]) + 3 * t * t * (b[i] - c2[i]));
      return { p, u: unit(u) };
    }
  });
  if (from === to) {
    // a loop out of its side and back, its ends a little apart
    const [dx, dy] = OUT[link.fromSide];
    const [x, y] = px(anchorOf(from, link.fromSide));
    const [gap, reach] = [0.6 * UNIT, 2.5 * UNIT];
    const [a, b] = [1, -1].map((s) => [x - dy * gap * s, y + dx * gap * s]);
    return cubic(a, [a[0] + dx * reach - dy * reach * 0.6, a[1] + dy * reach + dx * reach * 0.6], [b[0] + dx * reach + dy * reach * 0.6, b[1] + dy * reach - dx * reach * 0.6], b);
  }
  if (link.route === 'bend') {
    // TikZ's bend left from the centres: leaving turned 20° to the left of the straight line, and arriving the same
    const centre = (box: Box) => [(box.x + box.w / 2) * UNIT, (box.y + box.h / 2) * UNIT];
    const [p, q] = [centre(from), centre(to)];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const [ux, uy] = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    const [cos, sin] = [Math.cos((BEND * Math.PI) / 180), Math.sin((BEND * Math.PI) / 180)];
    // left of the way it goes, on a canvas whose y goes down
    const out = [cos * ux + sin * uy, cos * uy - sin * ux];
    const back = [-cos * ux + sin * uy, -cos * uy - sin * ux];
    const edge = (box: Box, [vx, vy]: number[]) => {
      const [hw, hh] = [(box.w * UNIT) / 2, (box.h * UNIT) / 2];
      return ROUND_SHAPES.includes(box.shape) ? Math.min(hw, hh) : Math.min(vx ? hw / Math.abs(vx) : Infinity, vy ? hh / Math.abs(vy) : Infinity);
    };
    const [ra, rb] = [edge(from, out), edge(to, back)];
    const a = [p[0] + out[0] * ra, p[1] + out[1] * ra];
    const b = [q[0] + back[0] * rb, q[1] + back[1] * rb];
    const reach = 0.3915 * Math.hypot(b[0] - a[0], b[1] - a[1]);
    return cubic(a, [a[0] + out[0] * reach, a[1] + out[1] * reach], [b[0] + back[0] * reach, b[1] + back[1] * reach], b);
  }
  if (link.route === 'curved') {
    const [a, b] = [anchorOf(from, link.fromSide), anchorOf(to, link.toSide)].map(px);
    const [c1, c2] = curveControls(link, from, to).map(px);
    return cubic(a, c1, c2, b);
  }
  const points = pathPoints(link, from, to);
  return {
    d: `M${points.map(px).join('L')}`,
    at: (t: number) => {
      const { leg, pos } = along(points, t);
      const [p, q] = [points[leg], points[leg + 1]].map(px);
      return { p: [p[0] + (q[0] - p[0]) * pos, p[1] + (q[1] - p[1]) * pos], u: unit([q[0] - p[0], q[1] - p[1]]) };
    }
  };
}


type CanvasProps = ComponentProps<DiagramMode<TikzModel>['Canvas']>;

function Canvas({ model, onChange, readOnly, selection = [], onSelect, tool = 'select', onTool }: CanvasProps) {
  const boxes = new Map(model.boxes.map((b) => [b.id, b]));
  // containers first, under the boxes in them
  const nodes: BoxNode[] = drawingOrder(model.boxes).map((box) => ({
    id: box.id,
    type: 'box',
    position: { x: box.x * UNIT, y: box.y * UNIT },
    width: box.w * UNIT,
    height: box.h * UNIT,
    className: holds(box.shape) ? 'tikz-container' : undefined,
    data: { box, readOnly: !!readOnly }
  }));
  const edges: LinkEdge[] = model.links.flatMap((link) => {
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    if (!from || !to) return [];
    const colour = ink(link);
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
        onMove={(moves) => onChange({ ...model, boxes: moveBoxes(model.boxes, moves.map((m) => ({ id: m.id, x: Math.round(m.x / UNIT), y: Math.round(m.y / UNIT) }))) })}
        onResize={(id, width, height, at) => onChange({ ...model, boxes: model.boxes.map((b) => (b.id === id ? resized(b, width / UNIT, height / UNIT, at && { x: at.x / UNIT, y: at.y / UNIT }) : b)) })}
        loops
        onConnect={(c) => {
          const next = connect(model, c.source, c.target, (c.sourceHandle || 'r') as Side, (c.targetHandle || 'l') as Side);
          onChange(next);
          onSelect?.([next.links[next.links.length - 1].id]);
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

/** shapes: the ones this mode can write (fletcher's fewer); Select always */
function Rail({ tool, onPick, shapes }: { tool: string; onPick(tool: string): void; shapes?: Shape[] }) {
  return <ToolRail tools={shapes ? TOOLS.filter((t) => t.id === 'select' || shapes.includes(t.id as Shape)) : TOOLS} tool={tool} onPick={onPick} />;
}

/** The value the selected items share, or undefined when they differ. */
const shared = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] : undefined);

/** typst: the fletcher mode's, whose text and maths go into Typst. */
function Inspector({ model, onChange, selection = [], typst = false }: { model: TikzModel; onChange(m: TikzModel): void; selection?: string[]; typst?: boolean }) {
  const language = typst ? 'Typst' : 'LaTeX';
  const boxes = model.boxes.filter((b) => selection.includes(b.id));
  const links = model.links.filter((l) => selection.includes(l.id));
  if (!boxes.length && !links.length) {
    return (
      <div className="diagram-hint">
        Pick a shape on the left, then click the canvas to place it. Drag from a dot on a shape’s edge to another shape to join
        them with an arrow, or to another dot on the same shape for a loop. Select something to change it here.
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
  const allPlain = boxes.length > 0 && !links.length && boxes.every((b) => plainShape(b.shape));
  const textLabel = (shape: Shape) =>
    MATHS_SHAPES.includes(shape) ? `Maths (${language}, without $)` : `${holds(shape) ? 'Title' : shape === 'stack' ? 'Caption' : 'Text'} ($…$ for ${language} maths)`;
  // a label beside the line or on it; in Typst, none is fletcher's own choice, which puts it beside
  const labelSides: [string, string][] = [
    ...(typst ? ([['', 'Fletcher’s choice'], ['on', 'On the line']] as [string, string][]) : ([['', 'On the line']] as [string, string][])),
    ['left', 'Left, as it goes'],
    ['right', 'Right, as it goes']
  ];

  return (
    <div className="diagram-inspector-fields">
      {box && (
        <>
          {box.shape !== 'takeoff' && (
            <Row label={textLabel(box.shape)}>
              <textarea id="diagram-text" className="input diagram-textarea" rows={3} spellCheck={false} value={box.text} onChange={(e) => patchBoxes({ text: e.target.value })} />
            </Row>
          )}
          <Row label="Shape">
            <Select value={box.shape} options={typst ? SHAPES.filter(([s]) => FLETCHER_SHAPES.includes(s)) : SHAPES} onChange={(shape) => patchBoxes({ shape: shape as Shape })} />
          </Row>
          {stateShape(box.shape) && (
            <Row label="Start arrow">
              <Select value={box.initial ?? ''} options={STARTS} onChange={(side) => patchBoxes({ initial: (side || undefined) as Side | undefined })} />
            </Row>
          )}
          {box.shape === 'container' && (
            <Row label={`Repeated × (${language} maths, without $)`}>
              <input className="input" placeholder="N" spellCheck={false} value={box.repeat ?? ''} onChange={(e) => patchBoxes({ repeat: e.target.value || undefined })} />
            </Row>
          )}
          {box.shape === 'gain' && (
            <Row label="Points">
              <Select value={box.dir ?? 'r'} options={TIPS} onChange={(dir) => patchBoxes({ dir: dir === 'r' ? undefined : (dir as Side) })} />
            </Row>
          )}
          {box.shape === 'swimlane' && (
            <Row label="Title band">
              <Select value={box.dir ?? 't'} options={BANDS} onChange={(dir) => patchBoxes({ dir: dir === 't' ? undefined : (dir as Side) })} />
            </Row>
          )}
          {box.shape === 'stack' && (
            <Row label="Cells">
              <input type="number" className="input" min={1} max={20} value={box.cells ?? 4} onChange={(e) => Number(e.target.value) >= 1 && Number(e.target.value) <= 20 && patchBoxes({ cells: Math.round(Number(e.target.value)) })} />
            </Row>
          )}
          {!plainShape(box.shape) && !MATHS_SHAPES.includes(box.shape) && !holds(box.shape) && box.shape !== 'stack' && box.shape !== 'takeoff' && (
            <label className="checkbox-row">
              <input type="checkbox" role="switch" checked={!!box.wrap} onChange={(e) => patchBoxes({ wrap: e.target.checked || undefined })} />
              <span>Wrap the text to the box’s width</span>
            </label>
          )}
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
          <Row label={`Label ($…$ for ${language} maths)`}>
            <input className="input" value={link.label ?? ''} spellCheck={false} onChange={(e) => patchLinks({ label: e.target.value })} />
          </Row>
          {link.from === link.to ? (
            <Row label="Loop">
              <Select value={link.fromSide} options={LOOP_SIDES} onChange={(side) => patchLinks({ fromSide: side as Side, toSide: side as Side })} />
            </Row>
          ) : (
            <Row label="Line">
              <Select value={link.route} options={ROUTES} onChange={(route) => patchLinks({ route: route as Route })} />
            </Row>
          )}
          {link.label?.trim() && (
            <>
              <Row label="Label">
                <Select
                  value={!typst && link.labelSide === 'on' ? '' : (link.labelSide ?? '')}
                  options={labelSides}
                  onChange={(side) => patchLinks({ labelSide: (side || undefined) as LabelSide | undefined })}
                />
              </Row>
              <Row label="Label along the arrow (%)">
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round((link.labelPos ?? 0.5) * 100)}
                  onChange={(e) => {
                    const pos = Number(e.target.value);
                    if (e.target.value !== '' && pos >= 0 && pos <= 100) patchLinks({ labelPos: pos === 50 ? undefined : pos / 100 });
                  }}
                />
              </Row>
            </>
          )}
          <Row label="Arrowheads">
            <Select value={link.heads} options={HEADS} onChange={(heads) => patchLinks({ heads: heads as Heads })} />
          </Row>
          <Row label="Sign at the end (summing junction)">
            <Select value={link.sign ?? ''} options={SIGNS} onChange={(sign) => patchLinks({ sign: (sign || undefined) as Link['sign'] })} />
          </Row>
        </>
      )}
      {boxes.length > 0 && (
        <div className="diagram-row">
          <span>{boxes.length > 1 ? 'Turn or mirror these' : 'Turn or mirror'}</span>
          <span className="diagram-pair">
            {TURNS.map(([how, title, icon, transform]) => (
              <button key={how} type="button" className="btn small" title={title} aria-label={title} onClick={() => onChange(turnTikz(model, boxes.map((b) => b.id), how))}>
                <Icon name={icon} style={transform ? { transform } : undefined} />
              </button>
            ))}
          </span>
        </div>
      )}
      {boxes.length > 0 && !links.length && !allPlain && !boxes.every((b) => b.shape === 'takeoff') && (
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

export { Canvas, Rail, Inspector };

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
