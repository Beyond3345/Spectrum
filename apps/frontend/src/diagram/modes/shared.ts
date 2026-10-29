// Small pieces the TikZ modes' code writers share.

/** A length or coordinate for TikZ: at most three decimals, no trailing zeros, never "-0". */
export function num(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded === 0 ? 0 : rounded);
}

/** amssymb when the maths uses its letters (\mathbb, \mathfrak), which LaTeX alone doesn't have. */
export const mathsPackages = (texts: string[]) => (texts.some((t) => /\\math(?:bb|frak)\b/.test(t)) ? ['amssymb'] : []);

/** '#rrggbb' as an xcolor colour written in place, so the picture needs no \definecolor. */
export function latexColour(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  return `{rgb,255:red,${r};green,${g};blue,${b}}`;
}

// ─── colours as typed: an xcolor name or mix (blue!15, red!30!yellow), or '#rrggbb' from the colour well ───

/** xcolor's own colours (without dvipsnames), as RGB from 0 to 1. */
const XCOLORS: Record<string, [number, number, number]> = {
  red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], cyan: [0, 1, 1], magenta: [1, 0, 1], yellow: [1, 1, 0], black: [0, 0, 0], white: [1, 1, 1],
  gray: [0.5, 0.5, 0.5], darkgray: [0.25, 0.25, 0.25], lightgray: [0.75, 0.75, 0.75], brown: [0.75, 0.5, 0.25], lime: [0.75, 1, 0], olive: [0.5, 0.5, 0],
  orange: [1, 0.5, 0], pink: [1, 0.75, 0.75], purple: [0.75, 0, 0.25], teal: [0, 0.5, 0.5], violet: [0.5, 0, 0.5]
};

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** A colour the code can write as it is: '#rrggbb', or an xcolor name with its mixes (blue!15, red!30!yellow, RoyalBlue). */
export const isColour = (value: string) => HEX_COLOUR.test(value) || /^[a-z]+(?:![0-9]{1,3}(?:\.[0-9]+)?(?:![a-z]+)?)*$/i.test(value);

/** A colour for a TikZ option: an xcolor expression as typed, '#rrggbb' written in place. */
export const tikzColour = (value: string) => (HEX_COLOUR.test(value) ? latexColour(value) : value);

/**
 * A colour as CSS for the canvas. A mix with white (blue!15) is the colour at that strength over the paper, so it reads
 * in the dark theme too; a mix of two colours is worked out as xcolor does. A name xcolor alone doesn't know is grey.
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
  const [r, g, b] = rgb.map((c) => Math.round(c * 255));
  return strength >= 1 ? `rgb(${r}, ${g}, ${b})` : `color-mix(in srgb, rgb(${r}, ${g}, ${b}) ${num(strength * 100)}%, transparent)`;
}
