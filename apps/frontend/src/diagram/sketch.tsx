// Labels as they print: TeX sketched as text on a canvas, with real subscripts and superscripts and no markup, so
// A_y and q_0 read as they will in the PDF. The compiled preview still sets them exactly.
//
// On an SVG canvas:             <text x={x} y={y} fontSize={size}>{svgRuns(label)}</text>
// In HTML (a React Flow node):  <span>{htmlRuns(label)}</span>
// To place or measure a label:  labelSize(scriptRuns(label), fontHeight)
// As one string (an aria-label, a title, a tooltip): plain(label), which drops the _ and ^ too
import type { ReactNode } from 'react';

const SYMBOLS: Record<string, string> = {
  Omega: 'Ω', mu: 'µ', pi: 'π', int: '∫', approx: '≈', cdot: '·', times: '×', '%': '%',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', kappa: 'κ', lambda: 'λ', nu: 'ν',
  xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ',
  parallel: '∥', perp: '⊥', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', infty: '∞', degree: '°', circ: '°', angle: '∠', sum: '∑', to: '→', rightarrow: '→', ell: 'ℓ', partial: '∂', nabla: '∇'
};

/**
 * TeX as the canvas sketches it, as one string: the common maths, Greek letters and units read as text; dollars, font
 * sizes, braces and every other command dropped (\text{load} and \mathrm{d} leave their words). Scripts are not set:
 * `_` and `^` are dropped with their braces, so C_1 reads C1. Use scriptRuns to keep them.
 */
export const plain = (text: string) => runText(text).replace(/[_^]/g, '');

/** plain(), but a `_` or `^` is left for scriptRuns to read */
const runText = (text: string) =>
  text
    .replace(/\$/g, '')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\[,;!]/g, ' ')
    .replace(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large)\s*/g, '')
    .replace(/\\([A-Za-z]+|%)/g, (_, name: string) => SYMBOLS[name] ?? '')
    .replace(/[{}]/g, '');

export type Run = { text: string; shift?: 'sub' | 'super' };

/** TeX as runs of text, a subscript or superscript its own run as the preview sets it: C_1, R_{in}, V^2, v_\mu. */
export function scriptRuns(tex: string): Run[] {
  const runs: Run[] = [];
  const push = (text: string, shift?: Run['shift']) => {
    const shown = runText(text);
    if (shown) runs.push(shift ? { text: shown, shift } : { text: shown });
  };
  let last = 0;
  for (const m of tex.matchAll(/([_^])(?:\{((?:[^{}]|\{[^{}]*\})*)\}|(\\[A-Za-z]+|[^\s{}]))/g)) {
    push(tex.slice(last, m.index));
    push(m[2] ?? m[3], m[1] === '_' ? 'sub' : 'super');
    last = m.index! + m[0].length;
  }
  push(tex.slice(last));
  return runs;
}

/**
 * A sketched label's size, for text `font` high (in whatever unit the canvas measures in: grid steps, px): a script
 * run is set at 70 %, and a label with one is taller.
 * ponytail: an average character's width, not the font's metrics; close enough to keep labels off symbols.
 */
export function labelSize(runs: Run[], font: number) {
  const chars = runs.reduce((n, run) => n + run.text.length * (run.shift ? 0.7 : 1), 0);
  return { w: chars * 0.6 * font, h: font * (runs.some((run) => run.shift) ? 1.4 : 1.1) };
}

/** The children of an SVG <text>: a label with its subscripts and superscripts set, at 70 % of the text's size. */
export const svgRuns = (tex: string): ReactNode =>
  scriptRuns(tex).map((run, i) =>
    run.shift ? (
      <tspan key={i} baselineShift={run.shift} fontSize="70%">
        {run.text}
      </tspan>
    ) : (
      run.text
    )
  );

/** The same in HTML, for a label inside a React Flow node or any other element: <sub> and <sup>. */
export const htmlRuns = (tex: string): ReactNode =>
  scriptRuns(tex).map((run, i) => (run.shift === 'sub' ? <sub key={i}>{run.text}</sub> : run.shift === 'super' ? <sup key={i}>{run.text}</sup> : run.text));
