// The counting grid every canvas draws behind a drawing: Settings › Diagram composer's four backgrounds (dots with a
// larger dot every few, dots with a line every few, grid lines with a heavier line every few, dots only).
//
// An SVG canvas (the circuit's, Structures', Vector diagrams') puts <CanvasGrid> first inside its <svg>:
//
//   <CanvasGrid id="st" step={gridPx} x={v.x} y={v.y} />                                  marks every few dots (Settings › Every)
//   <CanvasGrid id="st" step={gridPx} x={v.x} y={v.y} major={pxPerMetre} />               marks every whole metre
//   <CanvasGrid id="vec" step={gridPx} x={v.x} y={v.y} major={pxPerCm} origin />          and x = 0 and y = 0 darker
//
// A React Flow canvas (FlowCanvas.tsx) puts <FlowGrid gap={dots} /> where its <Background> was.
//
// Colours: --ckt-grid for the marks and --ckt-muted for the origin lines, which .ckt-canvas (circuitikz.css) sets for
// the light and the dark canvas; the SVG canvases all carry that class. The rules are in composer.css (.canvas-grid-…).
import { Background, BackgroundVariant } from '@xyflow/react';
import { useSettings } from '../app/settings';
import type { AppSettings } from '../app/settings';

type Kind = AppSettings['composerGrid'];

/** the closest two dots are drawn, and two larger marks, in screen pixels: under these the grid thins out */
const MIN_MINOR = 8;
const MIN_MAJOR = 24;

/**
 * How far apart the grid's dots (minor) and its larger marks (major) are drawn, in screen pixels.
 *
 * Without `major`, the marks fall every `every` dots and nothing is thinned: the canvas passes the step it wants drawn
 * (the circuit's is its own, four times wider below 60 % zoom).
 *
 * With `major` (the screen size of the composer's own interval: a metre, a centimetre), the marks keep to that interval
 * whatever `every` says. Zoomed out, they go to every 2nd, 5th, 10th… interval so they stay MIN_MAJOR apart, and the
 * dots to the fewest steps that are MIN_MINOR apart and still land on every mark. When an interval isn't a whole
 * number of steps, the dots stay on the steps (or leave, once too close) and only the marks count intervals.
 */
export function gridSpacing(step: number, every: number, major?: number): { minor: number; major: number } {
  if (!(major && major > 0 && step > 0)) return { minor: step, major: step * every };
  let reach = 1;
  // 1, 2, 5, 10, 20, 50…
  for (let i = 0; major * reach < MIN_MAJOR; i += 1) reach = [1, 2, 5][i % 3] * 10 ** Math.floor(i / 3);
  const far = major * reach;
  const steps = Math.round(far / step);
  if (Math.abs(steps * step - far) > 1e-6 * far) return { minor: step >= MIN_MINOR ? step : far, major: far };
  for (let n = 1; n <= steps; n += 1) if (steps % n === 0 && n * step >= MIN_MINOR) return { minor: n * step, major: far };
  return { minor: far, major: far };
}

/** half a mark's width: a pattern's tile starts this far before its grid point, so the mark on the point isn't cut */
const HALF = 0.75;
/** and the larger marks' tile this much further, for the larger dot */
const PAD = 3;

/**
 * The grid as SVG, for a canvas that knows the background and interval (CanvasGrid reads them from Settings).
 * `minor` and `major` are gridSpacing's.
 */
export function GridMarks({ id, kind, minor, major, x, y, origin }: { id: string; kind: Kind; minor: number; major: number; x: number; y: number; origin?: boolean }) {
  return (
    <>
      <defs>
        <pattern id={`${id}-dots`} width={minor} height={minor} patternUnits="userSpaceOnUse" x={x} y={y}>
          {kind === 'lines' ? <path d={`M${HALF},0 V${minor} M0,${HALF} H${minor}`} className="canvas-grid-line" /> : <circle cx={HALF} cy={HALF} r={HALF} className="canvas-grid-dot" />}
        </pattern>
        {kind !== 'dots' && (
          <pattern id={`${id}-major`} width={major} height={major} patternUnits="userSpaceOnUse" x={x - PAD} y={y - PAD}>
            {kind === 'major-dots' ? (
              <circle cx={PAD + HALF} cy={PAD + HALF} r={1.6} className="canvas-grid-dot" />
            ) : (
              <path d={`M${PAD + HALF},0 V${major} M0,${PAD + HALF} H${major}`} className="canvas-grid-line canvas-grid-major" />
            )}
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-dots)`} />
      {kind !== 'dots' && <rect width="100%" height="100%" fill={`url(#${id}-major)`} />}
      {origin && (
        <g className="canvas-grid-origin">
          <line x1={x + HALF} y1="0" x2={x + HALF} y2="100%" />
          <line x1="0" y1={y + HALF} x2="100%" y2={y + HALF} />
        </g>
      )}
    </>
  );
}

/**
 * The background of an SVG canvas, as Settings › Diagram composer has it. Put it first inside the <svg>, which it fills.
 *
 * - `id`: a prefix for its two patterns' ids (`id-dots`, `id-major`), unlike any other canvas's.
 * - `step`: one grid step (the distance between two dots) in screen pixels at the current zoom.
 * - `x`, `y`: where the drawing's (0, 0), or any other grid point, is on screen: the pan offset. The marks repeat from
 *   there, so they stay on the same grid points when the view pans or zooms.
 * - `major`: the composer's own interval between the larger marks, in screen pixels (a whole metre, 1 cm), in place of
 *   Settings › Every. Zoomed out, the grid thins itself (gridSpacing).
 * - `origin`: darker lines through (x, y), for a canvas with axes: x = 0 and y = 0.
 */
export function CanvasGrid({ id, step, x, y, major, origin }: { id: string; step: number; x: number; y: number; major?: number; origin?: boolean }) {
  const [settings] = useSettings();
  return <GridMarks id={id} kind={settings.composerGrid} {...gridSpacing(step, settings.composerGridEvery, major)} x={x} y={y} origin={origin} />;
}

/**
 * The same backgrounds on a React Flow canvas: put it inside <ReactFlow> in place of its <Background>.
 * `gap`: the dots' spacing in flow pixels (FlowCanvas's `dots`); `major`: the composer's own interval between the
 * larger marks, in flow pixels, in place of Settings › Every. Every mark is on a multiple of `gap` from the flow's
 * (0, 0), where nodes snap (React Flow's own dots sit half a gap off, which the offsets here undo).
 */
export function FlowGrid({ gap, major }: { gap: number; major?: number }) {
  const [settings] = useSettings();
  const kind = settings.composerGrid;
  const far = major ?? gap * settings.composerGridEvery;
  // React Flow draws a dot in its tile's corner and starts the tiles half a gap before the grid point. Each
  // <Background> paints the canvas's colour under its marks, so the second one, over the first, is see-through
  const dots = (id: string, spacing: number, size: number) => (
    <Background id={id} variant={BackgroundVariant.Dots} gap={spacing} size={size} offset={(size - spacing) / 2} bgColor={id === 'major' ? 'transparent' : undefined} />
  );
  const lines = (id: string, spacing: number) => (
    <Background id={id} variant={BackgroundVariant.Lines} gap={spacing} patternClassName={`flow-grid-line flow-grid-${id}`} bgColor={id === 'major' ? 'transparent' : undefined} />
  );
  return (
    <>
      {kind === 'lines' ? lines('minor', gap) : dots('minor', gap, 1.2)}
      {kind === 'major-dots' && dots('major', far, 2.6)}
      {(kind === 'major-lines' || kind === 'lines') && lines('major', far)}
    </>
  );
}
