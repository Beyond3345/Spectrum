// Small pieces the TikZ modes' code writers share.

// num, mathsPackages and latexColour live with the flowchart writers, which the converter uses too
import { latexColour } from '../../../../backend/src/latex/flowchart.js';

export { latexColour, mathsPackages, num } from '../../../../backend/src/latex/flowchart.js';

// ─── colours as typed: an xcolor name or mix (blue!15, red!30!yellow), or '#rrggbb' from the colour well ───

/** xcolor's own colours (without dvipsnames), as RGB from 0 to 1. */
const XCOLORS: Record<string, [number, number, number]> = {
  red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], cyan: [0, 1, 1], magenta: [1, 0, 1], yellow: [1, 1, 0], black: [0, 0, 0], white: [1, 1, 1],
  gray: [0.5, 0.5, 0.5], darkgray: [0.25, 0.25, 0.25], lightgray: [0.75, 0.75, 0.75], brown: [0.75, 0.5, 0.25], lime: [0.75, 1, 0], olive: [0.5, 0.5, 0],
  orange: [1, 0.5, 0], pink: [1, 0.75, 0.75], purple: [0.75, 0, 0.25], teal: [0, 0.5, 0.5], violet: [0.5, 0, 0.5]
};

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * A colour the code can write as it is: '#rrggbb', or xcolor's own names with their mixes (blue!15, red!30!yellow);
 * never a name xcolor alone doesn't have (RoyalBlue needs dvipsnames) or a word that's no colour (thick).
 */
export const isColour = (value: string) =>
  HEX_COLOUR.test(value) || (/^[a-z]+(?:![0-9]{1,3}(?:\.[0-9]+)?(?:![a-z]+)?)*$/.test(value) && value.split('!').every((part, i) => i % 2 === 1 || Object.keys(XCOLORS).includes(part)));

/** A colour for a TikZ option: an xcolor expression as typed, '#rrggbb' written in place. */
export const tikzColour = (value: string) => (HEX_COLOUR.test(value) ? latexColour(value) : value);

/**
 * A colour as CSS for the canvas and the swatches, worked out as xcolor does: a mix with white (blue!15) is that much
 * of the colour in white, so it shows as it prints in the dark theme too. A name xcolor alone doesn't know is grey.
 */
export function colourCss(value: string) {
  if (HEX_COLOUR.test(value)) return value;
  const [first, ...rest] = value.toLowerCase().split('!');
  // the colour so far, and how much of it there is over white
  let rgb = XCOLORS[first] ?? XCOLORS.gray;
  let strength = first === 'white' ? 0 : 1;
  for (let i = 0; i < rest.length; i += 2) {
    const p = Math.min(100, Number(rest[i]) || 0) / 100;
    const other = rest[i + 1] ?? 'white';
    if (other === 'white') strength *= p;
    else {
      const second = XCOLORS[other] ?? XCOLORS.gray;
      rgb = rgb.map((c, k) => p * (c * strength + 1 - strength) + (1 - p) * second[k]) as [number, number, number];
      strength = 1;
    }
  }
  const [r, g, b] = rgb.map((c) => Math.round((c * strength + 1 - strength) * 255));
  return `rgb(${r}, ${g}, ${b})`;
}
