import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ConnectionMode, MiniMap, ReactFlow, useReactFlow, useStore, useStoreApi } from '@xyflow/react';
import type { Connection, Edge, EdgeChange, EdgeTypes, Node, NodeChange, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Icon from '../app/Icon';
import { matchesShortcut } from '../app/shortcuts';
import { FlowGrid } from './CanvasGrid';
import { isTyping } from './toolKeys';

// The canvas the drawing modes share: React Flow with Settings' counting grid, the frame's zoom, minimap and canvas
// colour, and the circuit canvas's mouse: drag to select, Shift to add, Space or the middle button to pan

/** Settings › Diagram composer's dark canvas and minimap, which the canvas controls change there; every canvas follows them. */
export type CanvasPrefs = { minimap: boolean; dark: boolean };
/** onPrefs: for a canvas of a mode's own that isn't React Flow (the circuit's), whose own controls change them in Settings */
export const CanvasPrefsContext = createContext<CanvasPrefs & { onPrefs?(p: CanvasPrefs): void }>({ minimap: false, dark: false });
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
  onNodeClick,
  onNodeDoubleClick,
  loops
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
  /** a node's NodeResizer dragged to this size, in px; at: its new top-left corner, when dragged from the left or top */
  onResize?(id: string, width: number, height: number, at?: { x: number; y: number }): void;
  onConnect?(c: Connection): void;
  /** a click on the empty canvas, where it is in px: for placing the rail's tool */
  onPlace?(at: { x: number; y: number }): void;
  /** a click on a node: for a Connect tool */
  onNodeClick?(id: string): void;
  onNodeDoubleClick?(id: string): void;
  /** an edge may go from a node back to itself (a state's loop) */
  loops?: boolean;
}) {
  const prefs = useCanvasPrefs();
  const { screenToFlowPosition } = useReactFlow();
  // what React Flow measured of each node, given back with the rebuilt nodes so it never measures them from nothing
  const measured = useRef(new Map<string, Size>());
  const [, remeasured] = useState(0);
  const [fitAtStart] = useState(nodes.length > 0);
  const store = useStoreApi();
  const wrapper = useRef<HTMLDivElement>(null);
  // node and edge selection changes come in separate calls for one click; each builds on the last
  const picked = useRef(selection);
  picked.current = selection;
  // what a drag on the canvas started with Shift keeps selected, besides what it goes round
  const kept = useRef(new Set<string>());
  const ends = new Map(edges.map((e) => [e.id, [e.source, e.target]]));

  const select = (changes: (NodeChange | EdgeChange)[]) => {
    const next = new Set(picked.current);
    // a drag on the canvas selects the boxes it goes round, and only the arrows between two of them
    const marquee = !!store.getState().userSelectionRect;
    let changed = false;
    for (const c of changes) {
      if (c.type !== 'select' || next.has(c.id) === c.selected) continue;
      if (marquee && (c.selected ? ends.get(c.id)?.some((end) => !next.has(end)) : kept.current.has(c.id))) continue;
      if (c.selected) next.add(c.id);
      else next.delete(c.id);
      changed = true;
    }
    if (!changed) return;
    picked.current = [...next];
    onSelect?.(picked.current);
  };

  const onNodesChange = (changes: NodeChange[]) => {
    // setAttributes: a resize asked for, rather than the size React Flow found. A resize from the left or top edge comes
    // with the node's new position in the same call: both go to onResize, so the mode makes one change of them
    const resized = new Set(changes.flatMap((c) => (c.type === 'dimensions' && c.setAttributes ? [c.id] : [])));
    const at = new Map(changes.flatMap((c) => (c.type === 'position' && c.position ? [[c.id, c.position] as const] : [])));
    const moves = [...at].flatMap(([id, p]) => (resized.has(id) ? [] : [{ id, x: p.x, y: p.y }]));
    if (moves.length) onMove?.(moves);
    let sized = false;
    for (const c of changes) {
      if (c.type !== 'dimensions' || !c.dimensions) continue;
      if (c.setAttributes) onResize?.(c.id, c.dimensions.width, c.dimensions.height, at.get(c.id));
      measured.current.set(c.id, c.dimensions);
      sized = true;
    }
    if (sized) remeasured((n) => n + 1);
    select(changes);
  };

  // ⌘A selects everything, while the pointer is over the drawing or it has the focus, and nothing is being typed
  const selectAll = useRef(() => {});
  selectAll.current = () => onSelect?.([...nodes, ...edges].map((n) => n.id));
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      const here = wrapper.current;
      if (!matchesShortcut('Mod-a', e) || isTyping(e.target) || !here || !(here.matches(':hover') || here.contains(document.activeElement))) return;
      e.preventDefault();
      selectAll.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly]);

  return (
    <div ref={wrapper} className="diagram-flow-canvas" onPointerDownCapture={(e) => (kept.current = new Set(e.shiftKey ? picked.current : []))}>
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: selection.includes(n.id), measured: measured.current.get(n.id) }))}
        edges={edges.map((e) => ({ ...e, selected: selection.includes(e.id) }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={select}
        onConnect={onConnect}
        isValidConnection={(c) => loops || c.source !== c.target}
        connectionMode={ConnectionMode.Loose}
        onPaneClick={(e) => {
          const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          // after React Flow has cleared the selection for the click, so what's placed stays selected
          queueMicrotask(() => onPlace?.(at));
        }}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onNodeDoubleClick={(_, node) => onNodeDoubleClick?.(node.id)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        snapToGrid
        snapGrid={[grid, grid]}
        // the frame deletes, through the mode, so Undo has it
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        // the circuit canvas's mouse: a drag on the canvas selects, Shift adds, Space (React Flow's own) or the middle
        // button pans; a drawing that can't be changed pans with any drag
        selectionOnDrag={!readOnly}
        panOnDrag={readOnly ? true : [1]}
        selectionKeyCode={null}
        multiSelectionKeyCode="Shift"
        panOnScroll
        minZoom={0.2}
        maxZoom={4}
        // a drawing opened is fitted to the window; a new one starts at 100% and stays put as it grows
        fitView={fitAtStart}
        fitViewOptions={{ padding: 0.3, maxZoom: 1.5 }}
        colorMode={prefs.dark ? 'dark' : 'light'}
        proOptions={{ hideAttribution: true }}
      >
        <FlowGrid gap={dots} />
        {prefs.minimap && <MiniMap pannable zoomable />}
      </ReactFlow>
    </div>
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
