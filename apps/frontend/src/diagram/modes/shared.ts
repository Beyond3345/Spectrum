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
