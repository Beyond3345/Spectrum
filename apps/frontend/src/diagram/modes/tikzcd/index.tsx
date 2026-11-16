import type { ComponentProps, KeyboardEvent } from 'react';
import { BaseEdge, Handle, Position } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import Segmented from '../../../app/Segmented';
import Select from '../../../app/Select';
import { FlowCanvas } from '../../FlowCanvas';
import { nextId } from '../tikz/code';
import { Row, ToolRail, railIcon } from '../../controls';
import type { Tool } from '../../controls';
import type { DiagramMode } from '../../types';
import { cdCode, connectCd, copyCd, emptyCd, labelSides, pasteCd, removeCd } from './code';
import type { CdArrow, CdKind, CdLoop, CdModel, Cell } from './code';

// Commutative diagrams on a grid of cells

/** a cell's size in px, and the object box in its middle */
const CELL = 128;
const BOX_W = 96;
const BOX_H = 48;

const TOOLS: Tool[] = [
  { id: 'select', label: 'Select', icon: railIcon(<path d="M4 2.5v10l2.8-2.6 1.9 4.3 1.6-.7-1.9-4.2 3.8-.2z" strokeLinejoin="round" />) },
  { id: 'object', label: 'Object', icon: railIcon(<><rect x="2.5" y="2.5" width="11" height="11" strokeDasharray="2 2" /><path d="M5.5 11 8 5l2.5 6M6.4 9h3.2" /></>) }
];

type CellNode = Node<{ cell: Cell }, 'cell'>;

function CellView({ data: { cell } }: NodeProps<CellNode>) {
  return (
    <div className="cd-cell">
      <span className="tikz-box-text maths">{cell.text || ' '}</span>
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map((p) => (
        <Handle key={p} id={p} type="source" position={p} />
      ))}
    </div>
  );
}

type ArrowEdge = Edge<{ arrow: CdArrow; from: Cell; to: Cell }, 'cdArrow'>;

const LOOP_OUT: Record<CdLoop, number[]> = { above: [0, -1], right: [1, 0], below: [0, 1], left: [-1, 0] };

/**
 * tikz-cd's arrow, drawn between the two objects' boxes, or round one as a loop: its kind (⇒, ↦, =, ↣, ⇀), hook, two
 * heads, dashes, shift and the label on its side.
 */
function ArrowView({ data, selected }: EdgeProps<ArrowEdge>) {
  if (!data) return null;
  const { arrow, from, to } = data;
  const centre = (c: Cell) => [c.col * CELL + CELL / 2, c.row * CELL + CELL / 2];
  const [ax, ay] = centre(from);
  let p: number[];
  let q: number[];
  let ux: number;
  let uy: number;
  let line: string;
  let mid: number[];
  if (from === to) {
    // out of the box's side and back, a little apart, as tikz-cd's loop above and the like
    const [dx, dy] = LOOP_OUT[arrow.loop ?? 'above'];
    const edge = [ax + (dx * BOX_W) / 2, ay + (dy * BOX_H) / 2];
    [p, q] = [1, -1].map((s) => [edge[0] - dy * 10 * s, edge[1] + dx * 10 * s]);
    const reach = 36;
    const [c1, c2] = [p, q].map((e, i) => [e[0] + dx * reach - dy * reach * 0.5 * (i ? -1 : 1), e[1] + dy * reach + dx * reach * 0.5 * (i ? -1 : 1)]);
    const l = Math.hypot(q[0] - c2[0], q[1] - c2[1]) || 1;
    [ux, uy] = [(q[0] - c2[0]) / l, (q[1] - c2[1]) / l];
    line = `M${p[0]} ${p[1]}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${q[0]} ${q[1]}`;
    mid = [edge[0] + dx * 46, edge[1] + dy * 40];
  } else {
    const [bx, by] = centre(to);
    const length = Math.hypot(bx - ax, by - ay) || 1;
    [ux, uy] = [(bx - ax) / length, (by - ay) / length];
    // where the line leaves one box and reaches the other, moved to its left or right when shifted
    const trim = Math.min(BOX_W / 2 / Math.abs(ux || 1e-9), BOX_H / 2 / Math.abs(uy || 1e-9)) + 4;
    const shift = arrow.shift === 'left' ? 5 : arrow.shift === 'right' ? -5 : 0;
    p = [ax + ux * trim + uy * shift, ay + uy * trim - ux * shift];
    q = [bx - ux * trim + uy * shift, by - uy * trim - ux * shift];
    line = `M${p[0]} ${p[1]}L${q[0]} ${q[1]}`;
    const s = arrow.swap ? -1 : 1;
    mid = [(p[0] + q[0]) / 2 + uy * 16 * s, (p[1] + q[1]) / 2 - ux * 16 * s];
  }
  // left of the arrow, as tikz-cd puts a label (above a rightward arrow)
  const [nx, ny] = arrow.swap ? [-uy, ux] : [uy, -ux];
  const [lx, ly] = [uy, -ux];
  const barb = (at: number[], side: number, size = 5) => `M${at[0] - ux * 8 + lx * size * side} ${at[1] - uy * 8 + ly * size * side}L${at[0]} ${at[1]}`;
  const head = (at: number[], size = 5) => barb(at, 1, size) + `L${at[0] - ux * 8 - lx * size} ${at[1] - uy * 8 - ly * size}`;
  const kind: CdKind | undefined = arrow.kind;
  // the double and equal kinds are two lines, 2 px either side of the one
  const twin = (k: number) => line.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${Number(x) + lx * k} ${Number(y) + ly * k}`);
  const parts = kind === 'double' || kind === 'equal' ? [twin(2.2), twin(-2.2)] : [line];
  if (kind === 'double') parts.push(head(q, 7));
  else if (kind === 'harpoon') parts.push(barb(q, 1));
  else if (kind !== 'equal') parts.push(head(q));
  if (kind === 'mapsto') parts.push(`M${p[0] + lx * 5} ${p[1] + ly * 5}L${p[0] - lx * 5} ${p[1] - ly * 5}`);
  if (kind === 'tail') parts.push(head([p[0] + ux * 7, p[1] + uy * 7]));
  if (arrow.twoHeads) parts.push(head([q[0] - ux * 6, q[1] - uy * 6]));
  // the hook curls back from the tail, on the side opposite the label as tikz-cd draws it
  if (arrow.hook) parts.push(`M${p[0]} ${p[1]}A4 4 0 0 ${arrow.swap ? 1 : 0} ${p[0] - nx * 8} ${p[1] - ny * 8}`);
  return (
    <>
      <BaseEdge
        path={parts.join('')}
        style={{ stroke: selected ? 'var(--accent)' : 'var(--diagram-ink)', strokeWidth: 1.3, fill: 'none', strokeDasharray: arrow.dashed ? '5 4' : undefined }}
      />
      {arrow.label?.trim() && (
        <text x={mid[0]} y={mid[1]} className="cd-label" textAnchor="middle" dominantBaseline="central">
          {arrow.label}
        </text>
      )}
    </>
  );
}

const nodeTypes = { cell: CellView };
const edgeTypes = { cdArrow: ArrowView };

const cellAt = (x: number, y: number) => ({ col: Math.round((x - (CELL - BOX_W) / 2) / CELL), row: Math.round((y - (CELL - BOX_H) / 2) / CELL) });

type CanvasProps = ComponentProps<DiagramMode<CdModel>['Canvas']>;

function Canvas({ model, onChange, readOnly, selection = [], onSelect, tool = 'select', onTool }: CanvasProps) {
  const cells = new Map(model.cells.map((c) => [c.id, c]));
  const nodes: CellNode[] = model.cells.map((cell) => ({
    id: cell.id,
    type: 'cell',
    position: { x: cell.col * CELL + (CELL - BOX_W) / 2, y: cell.row * CELL + (CELL - BOX_H) / 2 },
    width: BOX_W,
    height: BOX_H,
    data: { cell }
  }));
  const edges: ArrowEdge[] = model.arrows.flatMap((arrow) => {
    const from = cells.get(arrow.from);
    const to = cells.get(arrow.to);
    return from && to ? [{ id: arrow.id, type: 'cdArrow', source: arrow.from, target: arrow.to, data: { arrow, from, to } }] : [];
  });

  // objects jump from cell to cell, and stay put rather than land on another
  const moveTo = (next: Cell[]) => {
    const moved = next.some((c, i) => c.row !== model.cells[i].row || c.col !== model.cells[i].col);
    if (moved && new Set(next.map((c) => `${c.row},${c.col}`)).size === next.length) onChange({ ...model, cells: next });
  };
  // an arrow key moves the selected objects a cell: React Flow's own nudge, a pixel, rounds back to the cell they were in
  const nudge = (e: KeyboardEvent) => {
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (!step || readOnly || !(e.target as HTMLElement).closest('.react-flow__node')) return;
    e.preventDefault();
    e.stopPropagation();
    moveTo(model.cells.map((c) => (selection.includes(c.id) ? { ...c, col: c.col + step[0], row: c.row + step[1] } : c)));
  };

  return (
    <div className={`diagram-flow${tool !== 'select' ? ' placing' : ''}`} onKeyDownCapture={nudge}>
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        grid={1}
        dots={CELL / 2}
        readOnly={readOnly}
        selection={selection}
        onSelect={onSelect}
        onMove={(moves) =>
          moveTo(
            model.cells.map((c) => {
              const m = moves.find((move) => move.id === c.id);
              return m ? { ...c, ...cellAt(m.x, m.y) } : c;
            })
          )
        }
        loops
        onConnect={(c) => {
          const side = ({ top: 'above', right: 'right', bottom: 'below', left: 'left' } as Record<string, CdLoop>)[c.sourceHandle ?? ''];
          const next = connectCd(model, c.source, c.target, side);
          onChange(next);
          onSelect?.([next.arrows[next.arrows.length - 1].id]);
        }}
        onPlace={({ x, y }) => {
          if (tool !== 'object' || readOnly) return;
          const col = Math.floor(x / CELL);
          const row = Math.floor(y / CELL);
          onTool?.('select');
          if (model.cells.some((c) => c.row === row && c.col === col)) return;
          const id = nextId('c', model.cells.map((c) => c.id));
          // the next capital not used yet, as a start
          const used = new Set(model.cells.map((c) => c.text.trim()));
          const text = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((l) => !used.has(l)) ?? 'X';
          onChange({ ...model, cells: [...model.cells, { id, row, col, text }] });
          onSelect?.([id]);
        }}
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


const KINDS: [string, string][] = [
  ['', 'Plain (→)'],
  ['double', 'Double (⇒)'],
  ['mapsto', 'Maps to (↦)'],
  ['equal', 'Equals (=)'],
  ['tail', 'Tail (↣)'],
  ['harpoon', 'Harpoon (⇀)']
];
const LOOPS: [CdLoop, string][] = [
  ['above', 'Above'],
  ['right', 'On the right'],
  ['below', 'Below'],
  ['left', 'On the left']
];
/** The value the selected items share, or undefined when they differ. */
const shared = <T,>(values: T[]) => (values.every((v) => v === values[0]) ? values[0] : undefined);

/** One object's text; or one arrow's fields, or the fields several arrows share, changed for all of them at once. */
function Inspector({ model, onChange, selection = [] }: { model: CdModel; onChange(m: CdModel): void; selection?: string[] }) {
  const cells = model.cells.filter((c) => selection.includes(c.id));
  const arrows = model.arrows.filter((a) => selection.includes(a.id));
  const patchArrows = (patch: Partial<CdArrow>) => onChange({ ...model, arrows: model.arrows.map((a) => (selection.includes(a.id) ? { ...a, ...patch } : a)) });
  if (cells.length === 1 && !arrows.length) {
    const cell = cells[0];
    return (
      <div className="diagram-inspector-fields">
        <Row label="Object (maths, without $)">
          <input
            id="diagram-text"
            className="input"
            spellCheck={false}
            value={cell.text}
            onChange={(e) => onChange({ ...model, cells: model.cells.map((c) => (c.id === cell.id ? { ...c, text: e.target.value } : c)) })}
          />
        </Row>
      </div>
    );
  }
  if (arrows.length) {
    const one = arrows.length === 1 ? arrows[0] : null;
    const loops = arrows.filter((a) => a.from === a.to);
    const straight = arrows.filter((a) => a.from !== a.to);
    // named as one arrow runs (Above, Right, …); for several, as each goes
    const sides: [string, string][] = one && !loops.length ? labelSides(one, model) : [['above', 'Left, as it goes'], ['below', 'Right, as it goes']];
    const swap = shared(arrows.map((a) => !!a.swap));
    return (
      <div className="diagram-inspector-fields">
        {!one && (
          <div className="diagram-hint">
            {arrows.length} arrows: a change here goes to all of them.{cells.length ? ' The objects selected with them keep their text.' : ''}
          </div>
        )}
        {one && (
          <Row label="Label (maths, without $)">
            <input className="input" spellCheck={false} value={one.label ?? ''} onChange={(e) => patchArrows({ label: e.target.value })} />
          </Row>
        )}
        <div className="diagram-row">
          <span>Label side</span>
          <Segmented label="Label side" value={swap === undefined ? null : swap ? 'below' : 'above'} options={sides} onChange={(side) => patchArrows({ swap: side === 'below' || undefined })} />
        </div>
        <Row label="Arrow">
          <Select value={shared(arrows.map((a) => a.kind ?? '')) ?? 'mixed'} options={KINDS} onChange={(kind) => patchArrows({ kind: (kind || undefined) as CdKind | undefined })} />
        </Row>
        {straight.length > 0 && (
          <Row label={loops.length ? 'Shift (not the loops)' : 'Shift, for two arrows between the same objects'}>
            <Select
              value={shared(straight.map((a) => a.shift ?? '')) ?? 'mixed'}
              options={[['', 'None'], ['left', sides[0][1]], ['right', sides[1][1]]]}
              onChange={(shift) =>
                onChange({ ...model, arrows: model.arrows.map((a) => (selection.includes(a.id) && a.from !== a.to ? { ...a, shift: (shift || undefined) as CdArrow['shift'] } : a)) })
              }
            />
          </Row>
        )}
        {loops.length > 0 && !straight.length && (
          <Row label="Loop">
            <Select value={shared(loops.map((a) => a.loop ?? 'above')) ?? 'mixed'} options={LOOPS} onChange={(loop) => patchArrows({ loop: loop === 'above' ? undefined : (loop as CdLoop) })} />
          </Row>
        )}
        {(
          [
            ['hook', 'Hook at the tail (↪)'],
            ['twoHeads', 'Two heads (↠)'],
            ['dashed', 'Dashed']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="checkbox-row">
            <input type="checkbox" checked={arrows.every((a) => !!a[key])} onChange={(e) => patchArrows({ [key]: e.target.checked || undefined })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    );
  }
  if (cells.length > 1) {
    return <div className="diagram-hint">{cells.length} objects selected. Select one to change its text, or select arrows to change them together.</div>;
  }
  return (
    <div className="diagram-hint">
      Pick Object on the left, then click a cell to place one. Drag from a dot on an object’s edge to another object to draw an
      arrow, or to another dot on the same object for a loop. Select something to change it here.
    </div>
  );
}

const cdMode: DiagramMode<CdModel> = {
  id: 'tikz-cd',
  label: 'Commutative diagram (tikz-cd)',
  language: 'tikz',
  emptyModel: emptyCd,
  toCode: (model) => cdCode(model),
  Canvas,
  Rail,
  Inspector,
  copy: copyCd,
  paste: pasteCd,
  remove: removeCd
};

export default cdMode;
