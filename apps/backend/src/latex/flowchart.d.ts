// Types for flowchart.js, which the frontend imports through apps/frontend/src/diagram/modes/tikz/code.ts.

export type Shape =
  | 'rectangle'
  | 'rounded'
  | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'parallelogram'
  | 'text'
  | 'maths'
  // automata
  | 'state'
  | 'accepting'
  // flowcharts
  | 'cylinder'
  | 'document'
  | 'trapezium'
  // model architectures: a circle round an operator, a vector of cells, and a titled box round a block repeated ×N
  | 'operator'
  | 'stack'
  | 'container';
/** the side of a box an arrow leaves or reaches: north, east, south or west */
export type Side = 't' | 'r' | 'b' | 'l';
export type Dash = 'solid' | 'dashed' | 'dotted';
/** stroke: '#rrggbb', none for black; width in pt, none for TikZ's own 0.4 pt */
export type Line = { stroke?: string; dash?: Dash; width?: number };
/**
 * x and y: the top-left corner, w and h: the size, all in grid units. text: a container's title, a stack's caption.
 * initial: the side a state's start arrow comes in from; wrap: text wrapped to the box's width; cells: a stack's (4 when
 * none); repeat: a container's ×N, maths without $.
 */
export type Box = Line & { id: string; shape: Shape; x: number; y: number; w: number; h: number; text: string; fill?: string; initial?: Side; wrap?: boolean; cells?: number; repeat?: string };
/** bend: curved to one side, as the two arrows between a pair of boxes are, so they don't lie on each other */
export type Route = 'straight' | 'angled' | 'curved' | 'bend';
export type Heads = 'none' | 'end' | 'start' | 'both';
/** from and to the same box: a loop on its fromSide */
export type Link = Line & { id: string; from: string; to: string; fromSide: Side; toSide: Side; route: Route; heads: Heads; label?: string };
export type TikzModel = { boxes: Box[]; links: Link[] };
/** What a mode's toCode gives: the picture, and what the document around it has to load. */
export type DiagramCode = { body: string; packages: string[]; libraries: string[] };

export function num(value: number): string;
export function mathsPackages(texts: string[]): string[];
export function latexColour(hex: string): string;
export function tikzDocument(code: DiagramCode): string;

export const MATHS_SHAPES: Shape[];
export function plainShape(shape: Shape): boolean;
export function stateShape(shape: Shape): boolean;
export const CM_PER_UNIT: number;
export function anchorOf(box: Box, side: Side): [number, number];
export function corners(link: Link, from: Box, to: Box): [number, number][];
export function pathPoints(link: Link, from: Box, to: Box): [number, number][];
export function curveControls(link: Link, from: Box, to: Box): [[number, number], [number, number]];
export function middleOf(points: [number, number][]): { leg: number; pos: number };
export const ROUND_SHAPES: Shape[];
export const LOOP: Record<Side, [out: number, back: number]>;
export const BEND: number;
export function dividersOf(box: Box): number[];
export function drawingOrder(boxes: Box[]): Box[];
export function tikzCode(model: TikzModel): DiagramCode;
export function fletcherFor(typstVersion: string): string;
export function fletcherCode(model: TikzModel, typstVersion?: string): DiagramCode;
