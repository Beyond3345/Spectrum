import { createContext, useContext, useRef, useState } from 'react';
import { Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, useReactFlow, useStore } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, EdgeTypes, Node, NodeChange, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Icon from '../app/Icon';

// The canvas the drawing modes share: React Flow with a dotted grid, and the frame's zoom, minimap and canvas colour

/** What the frame's canvas controls set; a mode's own React Flow canvas can follow it too. */
export type CanvasPrefs = { minimap: boolean; dark: boolean };
export const CanvasPrefsContext = createContext<CanvasPrefs>({ minimap: false, dark: false });
export const useCanvasPrefs = () => useContext(CanvasPrefsContext);

type Size = { width?: number; height?: number };

/**
 * A React Flow canvas for nodes and edges built from a model on each render. Moves and selection go back through
 * onMove and onSelect; deleting, copying and the like are the frame's. grid: the snap in px; dots: the grid's spacing.
 */
export function FlowCanvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  grid,
  dots = grid,
  readOnly,
  selection = [],
  onSelect,
  onMove,
  onResize,
  onConnect,
  onPlace,
  onNodeDoubleClick
}: {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes?: EdgeTypes;
  grid: number;
  dots?: number;
  readOnly?: boolean;
  selection?: string[];
  onSelect?(ids: string[]): void;
  /** nodes dragged to these top-left corners, in px */
  onMove?(moves: { id: string; x: number; y: number }[]): void;
  /** a node's NodeResizer dragged to this size, in px */
  onResize?(id: string, width: number, height: number): void;
  onConnect?(c: Connection): void;
  /** a click on the empty canvas, where it is in px: for placing the rail's tool */
  onPlace?(at: { x: number; y: number }): void;
  onNodeDoubleClick?(id: string): void;
}) {
  const prefs = useCanvasPrefs();
  const { screenToFlowPosition } = useReactFlow();
  // what React Flow measured of each node, given back with the rebuilt nodes so it never measures them from nothing
  const measured = useRef(new Map<string, Size>());
  const [, remeasured] = useState(0);
  // node and edge selection changes come in separate calls for one click; each builds on the last
  const picked = useRef(selection);
  picked.current = selection;

  const select = (changes: (NodeChange | EdgeChange)[]) => {
    const next = new Set(picked.current);
    let changed = false;
    for (const c of changes) {
      if (c.type !== 'select' || next.has(c.id) === c.selected) continue;
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
      changed = true;
    }
    if (!changed) return;
    picked.current = [...next];
    onSelect?.(picked.current);
  };

  const onNodesChange = (changes: NodeChange[]) => {
    const moves = changes.flatMap((c) => (c.type === 'position' && c.position ? [{ id: c.id, x: c.position.x, y: c.position.y }] : []));
    if (moves.length) onMove?.(moves);
    let sized = false;
    for (const c of changes) {
      if (c.type !== 'dimensions' || !c.dimensions) continue;
      // setAttributes: a resize asked for, rather than the size React Flow found
      if (c.setAttributes) onResize?.(c.id, c.dimensions.width, c.dimensions.height);
      measured.current.set(c.id, c.dimensions);
      sized = true;
    }
    if (sized) remeasured((n) => n + 1);
    select(changes);
  };

  return (
    <ReactFlow
      nodes={nodes.map((n) => ({ ...n, selected: selection.includes(n.id), measured: measured.current.get(n.id) }))}
      edges={edges.map((e) => ({ ...e, selected: selection.includes(e.id) }))}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={select}
      onConnect={onConnect}
      isValidConnection={(c) => c.source !== c.target}
      connectionMode={ConnectionMode.Loose}
      onPaneClick={(e) => onPlace?.(screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
      onNodeDoubleClick={(_, node) => onNodeDoubleClick?.(node.id)}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      snapToGrid
      snapGrid={[grid, grid]}
      // the frame deletes, through the mode, so Undo has it
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      panOnScroll
      minZoom={0.2}
      maxZoom={4}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
      colorMode={prefs.dark ? 'dark' : 'light'}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={dots} size={1.2} />
      {prefs.minimap && <MiniMap pannable zoomable />}
    </ReactFlow>
  );
}

/** Zoom, fit, minimap and canvas colour: shown while a React Flow canvas is in the ReactFlowProvider around them. */
export function CanvasControls({ prefs, onPrefs }: { prefs: CanvasPrefs; onPrefs(p: CanvasPrefs): void }) {
  const flow = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  if (!flow.viewportInitialized) return null;
  return (
    <div className="diagram-canvas-controls" role="toolbar" aria-label="Canvas">
      <button className="icon-btn small" title="Zoom out" aria-label="Zoom out" onClick={() => flow.zoomOut()}>
        <Icon name="minus.magnifyingglass" />
      </button>
      <span className="diagram-zoom">{Math.round(zoom * 100)}%</span>
      <button className="icon-btn small" title="Zoom in" aria-label="Zoom in" onClick={() => flow.zoomIn()}>
        <Icon name="plus.magnifyingglass" />
      </button>
      <button className="icon-btn small" title="Fit to the window" aria-label="Fit to the window" onClick={() => flow.fitView({ padding: 0.3, maxZoom: 1.5 })}>
        <Icon name="arrow.up.left.and.arrow.down.right" />
      </button>
      <button
        className={`icon-btn small${prefs.minimap ? ' active' : ''}`}
        title={prefs.minimap ? 'Hide the minimap' : 'Show the minimap'}
        aria-label="Minimap"
        aria-pressed={prefs.minimap}
        onClick={() => onPrefs({ ...prefs, minimap: !prefs.minimap })}
      >
        <Icon name="square.grid.2x2" />
      </button>
      <button
        className="icon-btn small"
        title={prefs.dark ? 'Light canvas' : 'Dark canvas'}
        aria-label={prefs.dark ? 'Light canvas' : 'Dark canvas'}
        onClick={() => onPrefs({ ...prefs, dark: !prefs.dark })}
      >
        <Icon name={prefs.dark ? 'sun.max' : 'moon'} />
      </button>
    </div>
  );
}
