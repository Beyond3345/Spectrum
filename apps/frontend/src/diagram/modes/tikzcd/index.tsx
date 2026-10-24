import type { ComponentProps } from 'react';
import { BaseEdge, Handle, Position } from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react';
import { FlowCanvas } from '../../FlowCanvas';
import { Row, ToolRail, railIcon } from '../../controls';
import type { Tool } from '../../controls';
import type { DiagramMode } from '../../types';
import { nextId } from '../tikz/code';
import { cdCode, copyCd, emptyCd, pasteCd, removeCd } from './code';
import type { CdArrow, CdModel, Cell } from './code';

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

/** tikz-cd's arrow, drawn between the two objects' boxes: hook, two heads, dashes and the label on its side. */
function ArrowView({ data, selected }: EdgeProps<ArrowEdge>) {
  if (!data) return null;
  const { arrow, from, to } = data;
  const centre = (c: Cell) => [c.col * CELL + CELL / 2, c.row * CELL + CELL / 2];
  const [ax, ay] = centre(from);
  const [bx, by] = centre(to);
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
  // where the line leaves one box and reaches the other
  const trim = Math.min(BOX_W / 2 / Math.abs(ux || 1e-9), BOX_H / 2 / Math.abs(uy || 1e-9)) + 4;
  const p = [ax + ux * trim, ay + uy * trim];
  const q = [bx - ux * trim, by - uy * trim];
  // left of the arrow, as tikz-cd puts a label (above a rightward arrow)
  const [nx, ny] = arrow.swap ? [-uy, ux] : [uy, -ux];
  const head = (at: number[]) => `M${at[0] - ux * 8 + nx * 5} ${at[1] - uy * 8 + ny * 5}L${at[0]} ${at[1]}L${at[0] - ux * 8 - nx * 5} ${at[1] - uy * 8 - ny * 5}`;
  const parts = [`M${p[0]} ${p[1]}L${q[0]} ${q[1]}`, head(q)];
  if (arrow.twoHeads) parts.push(head([q[0] - ux * 6, q[1] - uy * 6]));
  // the hook curls back from the tail, on the side opposite the label as tikz-cd draws it
  if (arrow.hook) parts.push(`M${p[0]} ${p[1]}A4 4 0 0 ${arrow.swap ? 1 : 0} ${p[0] - nx * 8} ${p[1] - ny * 8}`);
  const mid = [(p[0] + q[0]) / 2 + nx * 16, (p[1] + q[1]) / 2 + ny * 16];
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

  return (
    <div className={`diagram-flow${tool !== 'select' ? ' placing' : ''}`}>
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
        // objects jump from cell to cell, and stay put rather than land on another
        onMove={(moves) => {
          const next = model.cells.map((c) => {
            const m = moves.find((move) => move.id === c.id);
            return m ? { ...c, ...cellAt(m.x, m.y) } : c;
          });
          const moved = next.some((c, i) => c.row !== model.cells[i].row || c.col !== model.cells[i].col);
          if (moved && new Set(next.map((c) => `${c.row},${c.col}`)).size === next.length) onChange({ ...model, cells: next });
        }}
        onConnect={(c) => {
          const id = nextId('a', model.arrows.map((a) => a.id));
          onChange({ ...model, arrows: [...model.arrows, { id, from: c.source, to: c.target }] });
          onSelect?.([id]);
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

function Inspector({ model, onChange, selection = [] }: { model: CdModel; onChange(m: CdModel): void; selection?: string[] }) {
  const cell = selection.length === 1 ? model.cells.find((c) => c.id === selection[0]) : undefined;
  const arrow = selection.length === 1 ? model.arrows.find((a) => a.id === selection[0]) : undefined;
  const patchArrow = (patch: Partial<CdArrow>) => onChange({ ...model, arrows: model.arrows.map((a) => (a.id === arrow?.id ? { ...a, ...patch } : a)) });
  if (cell) {
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
  if (arrow) {
    return (
      <div className="diagram-inspector-fields">
        <Row label="Label (maths, without $)">
          <input className="input" spellCheck={false} value={arrow.label ?? ''} onChange={(e) => patchArrow({ label: e.target.value })} />
        </Row>
        <div className="diagram-row">
          <span>Label side</span>
          <div className="segmented small" role="radiogroup" aria-label="Label side">
            {([false, true] as const).map((swap) => (
              <button key={String(swap)} type="button" role="radio" aria-checked={!!arrow.swap === swap} className={`segment${!!arrow.swap === swap ? ' active' : ''}`} onClick={() => patchArrow({ swap: swap || undefined })}>
                {swap ? 'Below' : 'Above'}
              </button>
            ))}
          </div>
        </div>
        {(
          [
            ['hook', 'Hook at the tail (↪)'],
            ['twoHeads', 'Two heads (↠)'],
            ['dashed', 'Dashed']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="checkbox-row">
            <input type="checkbox" checked={!!arrow[key]} onChange={(e) => patchArrow({ [key]: e.target.checked || undefined })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="diagram-hint">
      Pick Object on the left, then click a cell to place one. Drag from a dot on an object’s edge to another object to draw an
      arrow. Select something to change it here.
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
