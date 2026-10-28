// Circuit templates: drawings the chooser's starters open pre-drawn, every part editable, with the result each one
// computes from its values written beside it as Text (a gain, a 555's frequency, a converter's M(D)), which the user
// can change or delete. Coordinates are grid steps; wires reach a part's pins, so they follow its measured symbol.
import type { CircuitModel, Element, End, Mark, Pt, Route } from './model';

// ─── what the labels say ───

/** Inverting amplifier: −Rf/R1. */
export const invertingGain = (r1: number, rf: number) => -rf / r1;
/** Non-inverting amplifier: 1 + Rf/R1. */
export const nonInvertingGain = (r1: number, rf: number) => 1 + rf / r1;
/** Difference amplifier with matched pairs: vo = (R2/R1)(v2 − v1). */
export const differenceGain = (r1: number, r2: number) => r2 / r1;
/** 555 astable: f = 1.44/((RA + 2RB)C), and the time high over the period, (RA + RB)/(RA + 2RB). */
export const astable555 = (ra: number, rb: number, c: number) => ({ frequency: 1.44 / ((ra + 2 * rb) * c), duty: (ra + rb) / (ra + 2 * rb) });
/** 555 monostable: the pulse lasts 1.1RC. */
export const monostable555 = (r: number, c: number) => 1.1 * r * c;
/** A converter's ideal conversion ratio Vo/Vin in continuous conduction, at duty cycle D. */
export const conversionRatio = (kind: 'buck' | 'boost' | 'buck-boost', d: number) => (kind === 'buck' ? d : kind === 'boost' ? 1 / (1 - d) : -d / (1 - d));

/** A number as a label writes it: three significant figures, without trailing zeros. */
export const figure = (x: number) => String(Number(x.toPrecision(3)));

// ─── drawing ───

const pt = (x: number, y: number): Pt => ({ x, y });
const pin = (part: string, name: string): End => ({ part, pin: name });
const mark = (text: string, extra: Partial<Mark> = {}): Mark => ({ text, ...extra });

function drawing() {
  const elements: Element[] = [];
  const junctions: End[] = [];
  let n = 0;
  const id = () => `t${(n += 1)}`;
  return {
    /** a part between two ends, with its label, value and anything else */
    part(type: string, a: End, b: End, more: Record<string, unknown> = {}) {
      const el = { id: id(), kind: 'path' as const, type, a, b, ...more };
      elements.push(el);
      return el.id;
    },
    node(type: string, at: Pt, more: Record<string, unknown> = {}) {
      const el = { id: id(), kind: 'node' as const, type, at, ...more };
      elements.push(el);
      return el.id;
    },
    /** routes: one per segment, straight when left out */
    wire(points: End[], routes: Route[] = [], arrows?: '->' | '<-' | '<->') {
      elements.push({ id: id(), kind: 'wire', points, routes: points.slice(1).map((_, i) => routes[i] || '--'), ...(arrows && { arrows }) });
    },
    text(at: Pt, text: string, options?: string[]) {
      return this.node('text', at, { text, ...(options && { options }) });
    },
    /** a terminal with its name beside it, if it has one */
    terminal(at: Pt, name: string, side: 'left' | 'right' | 'below' = 'left') {
      this.node('terminal', at);
      if (!name) return;
      const off = side === 'left' ? pt(-2.4, 0) : side === 'right' ? pt(2.4, 0) : pt(0, -2);
      this.text(pt(at.x + off.x, at.y + off.y), `$${name}$`);
    },
    dots(...at: End[]) {
      junctions.push(...at);
    },
    done: (): CircuitModel => ({ elements, junctions })
  };
}

const R = (name: string, value: string) => ({ label: mark(name), value });

// ─── op amps ───

/** The inverting amplifier's frame, the feedback part and input part given: the op amp, ground and output. */
function invertingFrame(input: [string, Record<string, unknown>], feedback: [string, Record<string, unknown>], result: string, inputName = 'v_i', resultAt = pt(0, -8)) {
  const d = drawing();
  const u = d.node('op-amp', pt(0, 0), { name: 'U1' });
  d.terminal(pt(-16, 2), inputName);
  d.part(input[0], pt(-16, 2), pt(-8, 2), input[1]);
  d.wire([pt(-8, 2), pin(u, '-')], ['-|']);
  d.wire([pt(-8, 2), pt(-8, 8)]);
  d.part(feedback[0], pt(-8, 8), pt(8, 8), feedback[1]);
  d.wire([pt(8, 8), pt(8, 0)]);
  d.wire([pin(u, 'out'), pt(12, 0)]);
  d.terminal(pt(12, 0), 'v_o', 'right');
  d.wire([pin(u, '+'), pt(-6, -4)], ['-|']);
  d.node('ground', pt(-6, -4));
  d.text(resultAt, result);
  d.dots(pt(-8, 2), pt(8, 0));
  return d;
}

export function invertingAmplifier(r1 = 10e3, rf = 100e3) {
  return invertingFrame(['resistor', R('R_1', '10\\,\\mathrm{k\\Omega}')], ['resistor', R('R_f', '100\\,\\mathrm{k\\Omega}')], `$A_v = -R_f/R_1 = ${figure(invertingGain(r1, rf))}$`).done();
}

export function integrator(r = 10e3, c = 100e-9) {
  return invertingFrame(['resistor', R('R', '10\\,\\mathrm{k\\Omega}')], ['capacitor', R('C', '100\\,\\mathrm{nF}')], `$v_o = -\\frac{1}{RC}\\int v_i\\,dt$, $RC = ${figure(r * c * 1e3)}\\,\\mathrm{ms}$`).done();
}

export function differentiator(r = 10e3, c = 100e-9) {
  return invertingFrame(['capacitor', R('C', '100\\,\\mathrm{nF}')], ['resistor', R('R', '10\\,\\mathrm{k\\Omega}')], `$v_o = -RC\\,\\frac{dv_i}{dt}$, $RC = ${figure(r * c * 1e3)}\\,\\mathrm{ms}$`).done();
}

/** Two inputs into the inverting node: vo = −Rf(v1/R1 + v2/R2). */
export function summingAmplifier(r = 10e3, rf = 10e3) {
  const g = invertingGain(r, rf);
  const d = invertingFrame(['resistor', R('R_1', '10\\,\\mathrm{k\\Omega}')], ['resistor', R('R_f', '10\\,\\mathrm{k\\Omega}')], `$v_o = -\\frac{R_f}{R}(v_1 + v_2) = ${g === -1 ? '-' : figure(g)}(v_1 + v_2)$`, 'v_1', pt(4, -13));
  d.terminal(pt(-16, -8), 'v_2');
  d.part('resistor', pt(-16, -8), pt(-8, -8), R('R_2', '10\\,\\mathrm{k\\Omega}'));
  d.wire([pt(-8, -8), pt(-8, 2)]);
  return d.done();
}

/** The input on +, with the inverting input fed back from the output: through Rf with R1 to ground, or straight. */
function nonInvertingFrame(feedback: 'divider' | 'follower', result: string) {
  const d = drawing();
  const u = d.node('op-amp', pt(0, 0), { name: 'U1', options: ['noinv input up'] });
  d.terminal(pt(-12, 2), 'v_i');
  d.wire([pt(-12, 2), pin(u, '+')], ['-|']);
  d.wire([pin(u, '-'), pt(-8, -2), pt(-8, -8)], ['-|']);
  if (feedback === 'divider') {
    d.part('resistor', pt(-8, -8), pt(8, -8), R('R_f', '100\\,\\mathrm{k\\Omega}'));
    d.part('resistor', pt(-8, -8), pt(-8, -16), R('R_1', '10\\,\\mathrm{k\\Omega}'));
    d.node('ground', pt(-8, -16));
    d.dots(pt(-8, -8));
  } else {
    d.wire([pt(-8, -8), pt(8, -8)]);
  }
  d.wire([pt(8, -8), pt(8, 0)]);
  d.wire([pin(u, 'out'), pt(12, 0)]);
  d.terminal(pt(12, 0), 'v_o', 'right');
  d.text(pt(0, feedback === 'divider' ? -20 : -12), result);
  d.dots(pt(8, 0));
  return d.done();
}

export const nonInvertingAmplifier = (r1 = 10e3, rf = 100e3) => nonInvertingFrame('divider', `$A_v = 1 + R_f/R_1 = ${figure(nonInvertingGain(r1, rf))}$`);
export const voltageFollower = () => nonInvertingFrame('follower', '$A_v = 1$');

/** vo = (R2/R1)(v2 − v1), with R1 and R2 matched on both inputs. */
export function differenceAmplifier(r1 = 10e3, r2 = 100e3) {
  const d = drawing();
  const u = d.node('op-amp', pt(0, 0), { name: 'U1' });
  d.terminal(pt(-16, 2), 'v_1');
  d.part('resistor', pt(-16, 2), pt(-8, 2), R('R_1', '10\\,\\mathrm{k\\Omega}'));
  d.wire([pt(-8, 2), pin(u, '-')], ['-|']);
  d.wire([pt(-8, 2), pt(-8, 8)]);
  d.part('resistor', pt(-8, 8), pt(8, 8), R('R_2', '100\\,\\mathrm{k\\Omega}'));
  d.wire([pt(8, 8), pt(8, 0)]);
  d.wire([pin(u, 'out'), pt(12, 0)]);
  d.terminal(pt(12, 0), 'v_o', 'right');
  d.terminal(pt(-16, -4), 'v_2');
  d.part('resistor', pt(-16, -4), pt(-6, -4), R('R_1', '10\\,\\mathrm{k\\Omega}'));
  d.wire([pt(-6, -4), pin(u, '+')], ['|-']);
  d.part('resistor', pt(-6, -4), pt(-6, -12), R('R_2', '100\\,\\mathrm{k\\Omega}'));
  d.node('ground', pt(-6, -12));
  d.text(pt(8, -15), `$v_o = \\frac{R_2}{R_1}(v_2 - v_1) = ${figure(differenceGain(r1, r2))}(v_2 - v_1)$`);
  d.dots(pt(-8, 2), pt(8, 0), pt(-6, -4));
  return d.done();
}

// ─── rectifiers ───

/** The load and its smoothing capacitor between a top rail at y = 8 and a bottom one at y = 0, from x. */
function load(d: ReturnType<typeof drawing>, x: number) {
  d.part('polarised-capacitor', pt(x, 8), pt(x, 0), R('C', '1000\\,\\mathrm{\\mu F}'));
  d.part('resistor', pt(x + 10, 8), pt(x + 10, 0), { label: mark('R_L'), voltage: mark('v_o') });
  d.wire([pt(x, 8), pt(x + 10, 8)]);
  d.wire([pt(x, 0), pt(x + 10, 0)]);
  d.dots(pt(x, 8), pt(x, 0));
}

export function halfWaveRectifier() {
  const d = drawing();
  d.part('ac-source', pt(0, 0), pt(0, 8), { label: mark('v_s') });
  d.part('diode', pt(0, 8), pt(10, 8), { label: mark('D') });
  d.wire([pt(10, 8), pt(14, 8)]);
  d.wire([pt(0, 0), pt(14, 0)]);
  load(d, 14);
  return d.done();
}

export function centreTapRectifier() {
  const d = drawing();
  d.part('ac-source', pt(-6, -6), pt(-6, 6), { label: mark('v_s') });
  d.wire([pt(-6, 6), pt(0, 6)]);
  d.wire([pt(-6, -6), pt(0, -6)]);
  d.part('inductor', pt(0, 6), pt(0, -6), { mirror: true });
  // the secondary in two halves: where they meet is the centre tap
  d.part('inductor', pt(4, 8), pt(4, 0));
  d.part('inductor', pt(4, 0), pt(4, -8));
  d.part('diode', pt(4, 8), pt(14, 8), { label: mark('D_1') });
  d.part('diode', pt(4, -8), pt(14, -8), { label: mark('D_2', { side: '_' }) });
  // the return to the centre tap jumps the diodes' join
  const jump = d.node('jump-crossing', pt(14, 0));
  d.wire([pt(14, -8), pin(jump, 'south')]);
  d.wire([pin(jump, 'north'), pt(14, 8)]);
  d.wire([pt(14, 8), pt(18, 8)]);
  d.wire([pt(4, 0), pin(jump, 'west')]);
  d.wire([pin(jump, 'east'), pt(18, 0)]);
  load(d, 18);
  d.dots(pt(14, 8), pt(4, 0));
  return d.done();
}

export function bridgeRectifier() {
  const d = drawing();
  d.part('ac-source', pt(-8, -8), pt(-8, 8), { label: mark('v_s') });
  d.wire([pt(-8, 8), pt(8, 8)]);
  d.wire([pt(-8, -8), pt(8, -8)]);
  d.part('diode', pt(0, 0), pt(8, 8), { label: mark('D_1') });
  d.part('diode', pt(8, 8), pt(16, 0), { label: mark('D_2') });
  d.part('diode', pt(0, 0), pt(8, -8), { label: mark('D_3', { side: '_' }) });
  d.part('diode', pt(8, -8), pt(16, 0), { label: mark('D_4', { side: '_' }) });
  d.wire([pt(16, 0), pt(22, 0), pt(22, -4)]);
  d.wire([pt(0, 0), pt(0, -12), pt(22, -12)]);
  // the load between + at the right corner and − at the left
  d.part('polarised-capacitor', pt(22, -4), pt(22, -12), R('C', '1000\\,\\mathrm{\\mu F}'));
  d.part('resistor', pt(32, -4), pt(32, -12), { label: mark('R_L'), voltage: mark('v_o') });
  d.wire([pt(22, -4), pt(32, -4)]);
  d.wire([pt(22, -12), pt(32, -12)]);
  d.dots(pt(8, 8), pt(8, -8), pt(0, 0), pt(16, 0), pt(22, -4), pt(22, -12));
  return d.done();
}

// ─── transistors ───

/** A common-emitter stage biased by a divider, with coupling and bypass capacitors. */
export function commonEmitterStage() {
  const d = drawing();
  const q = d.node('npn', pt(0, 0), { name: 'Q1' });
  d.node('supply-up', pt(0, 20));
  d.node('supply-up', pt(-8, 20));
  d.part('resistor', pt(0, 20), pt(0, 8), R('R_C', '4.7\\,\\mathrm{k\\Omega}'));
  d.wire([pt(0, 8), pin(q, 'C')]);
  d.wire([pin(q, 'E'), pt(0, -8)]);
  d.part('resistor', pt(0, -8), pt(0, -16), R('R_E', '1\\,\\mathrm{k\\Omega}'));
  d.node('ground', pt(0, -16));
  d.wire([pt(0, -8), pt(6, -8)]);
  d.part('polarised-capacitor', pt(6, -8), pt(6, -16), { label: mark('C_E') });
  d.node('ground', pt(6, -16));
  d.part('resistor', pt(-8, 20), pt(-8, 0), R('R_1', '47\\,\\mathrm{k\\Omega}'));
  d.part('resistor', pt(-8, 0), pt(-8, -16), R('R_2', '10\\,\\mathrm{k\\Omega}'));
  d.node('ground', pt(-8, -16));
  d.wire([pt(-8, 0), pin(q, 'B')]);
  d.part('capacitor', pt(-16, 0), pt(-8, 0), { label: mark('C_{in}') });
  d.terminal(pt(-16, 0), 'v_i');
  d.part('capacitor', pt(0, 8), pt(10, 8), { label: mark('C_{out}') });
  d.terminal(pt(10, 8), 'v_o', 'right');
  d.dots(pt(0, 8), pt(-8, 0), pt(0, -8));
  return d.done();
}

/** The hybrid-π small-signal model: rπ between base and emitter, gm vπ and ro between collector and emitter. */
export function hybridPi() {
  const d = drawing();
  d.terminal(pt(0, 8), 'B');
  d.wire([pt(0, 8), pt(8, 8)]);
  d.part('resistor', pt(8, 8), pt(8, 0), { label: mark('r_\\pi'), voltage: mark('v_\\pi', { side: '_' }) });
  d.part('controlled-current-source', pt(18, 8), pt(18, 0), { label: mark('g_m v_\\pi') });
  d.part('resistor', pt(26, 8), pt(26, 0), { label: mark('r_o') });
  d.wire([pt(18, 8), pt(32, 8)]);
  d.terminal(pt(32, 8), 'C', 'right');
  d.wire([pt(0, 0), pt(26, 0)]);
  d.terminal(pt(0, 0), 'E');
  d.dots(pt(8, 0), pt(18, 0), pt(26, 8));
  return d.done();
}

// ─── 555 timers ───

/**
 * The 555 as an 8-pin block with its pins where the circuit wants them, named beside each (the package's pin number
 * after the name): RESET, DIS, THR and TRIG down the left, VCC, OUT, CTRL and GND down the right.
 */
function timer(d: ReturnType<typeof drawing>) {
  const u = d.node('chip-8', pt(0, 0), { name: 'U1', options: ['hide numbers', 'circuitikz/multipoles/dipchip/width=1.8'] });
  const names: [string, number, string][] = [['RESET 4', 3.36, 'west'], ['DIS 7', 1.12, 'west'], ['THR 6', -1.12, 'west'], ['TRIG 2', -3.36, 'west'], ['VCC 8', 3.36, 'east'], ['OUT 3', 1.12, 'east'], ['CTRL 5', -1.12, 'east'], ['GND 1', -3.36, 'east']];
  for (const [name, y, anchor] of names) d.text(pt(anchor === 'west' ? -4.9 : 4.9, y), `\\tiny ${name}`, [`anchor=${anchor}`]);
  d.text(pt(0, 6), '555');
  // the package's pins: 1 to 4 down the left, 5 to 8 up the right
  const at = { reset: pin(u, 'pin 1'), dis: pin(u, 'pin 2'), thr: pin(u, 'pin 3'), trig: pin(u, 'pin 4'), vcc: pin(u, 'pin 8'), out: pin(u, 'pin 7'), ctrl: pin(u, 'pin 6'), gnd: pin(u, 'pin 5') };
  // the supply rail along the top, RESET and VCC up to it; CTRL decoupled and GND grounded
  d.node('supply-up', pt(-16, 14));
  d.wire([pt(-16, 14), pt(10, 14)]);
  d.wire([at.reset, pt(-8, 14)], ['-|']);
  d.wire([at.vcc, pt(10, 14)], ['-|']);
  d.wire([at.ctrl, pt(10, -6)], ['-|']);
  d.part('capacitor', pt(10, -6), pt(10, -14), R('C_2', '10\\,\\mathrm{nF}'));
  d.node('ground', pt(10, -14));
  d.wire([at.gnd, pt(8, -6)], ['-|']);
  d.node('ground', pt(8, -6));
  d.wire([at.out, pt(18, 1.12)]);
  d.terminal(pt(18, 1.12), 'v_o', 'right');
  d.dots(pt(-8, 14));
  return at;
}

export function astable(ra = 1e3, rb = 10e3, c = 1e-6) {
  const d = drawing();
  const at = timer(d);
  d.part('resistor', pt(-16, 14), pt(-16, 1.12), R('R_A', '1\\,\\mathrm{k\\Omega}'));
  d.wire([at.dis, pt(-16, 1.12)]);
  d.part('resistor', pt(-16, 1.12), pt(-16, -8), R('R_B', '10\\,\\mathrm{k\\Omega}'));
  d.wire([at.thr, pt(-10, -8)], ['-|']);
  d.wire([at.trig, pt(-10, -3.36)]);
  d.wire([pt(-10, -8), pt(-16, -8)]);
  d.part('capacitor', pt(-16, -8), pt(-16, -16), R('C', '1\\,\\mathrm{\\mu F}'));
  d.node('ground', pt(-16, -16));
  const { frequency, duty } = astable555(ra, rb, c);
  d.text(pt(0, -20), `$f = \\frac{1.44}{(R_A + 2R_B)C} = ${figure(frequency)}\\,\\mathrm{Hz}$, high for ${figure(duty * 100)}\\,\\%`);
  d.dots(pt(-16, 14), pt(-16, 1.12), pt(-16, -8), pt(-10, -3.36));
  return d.done();
}

export function monostable(r = 100e3, c = 10e-6) {
  const d = drawing();
  const at = timer(d);
  d.part('resistor', pt(-16, 14), pt(-16, 1.12), R('R', '100\\,\\mathrm{k\\Omega}'));
  d.wire([at.dis, pt(-16, 1.12)]);
  d.wire([pt(-16, 1.12), pt(-16, -6)]);
  d.wire([at.thr, pt(-16, -1.12)]);
  d.part('capacitor', pt(-16, -6), pt(-16, -14), R('C', '10\\,\\mathrm{\\mu F}'));
  d.node('ground', pt(-16, -14));
  d.wire([at.trig, pt(-10, -3.36)]);
  d.terminal(pt(-10, -3.36), 'v_{trig}', 'below');
  d.text(pt(0, -18), `$T = 1.1RC = ${figure(monostable555(r, c))}\\,\\mathrm{s}$`);
  d.dots(pt(-16, 14), pt(-16, 1.12), pt(-16, -1.12));
  return d.done();
}

// ─── switching converters ───

/** Buck, boost or buck-boost: source, switch, diode, inductor, then the output capacitor and load from x = 20. */
export function converter(kind: 'buck' | 'boost' | 'buck-boost', d0 = 0.5) {
  const d = drawing();
  d.part('voltage-source', pt(0, 8), pt(0, 0), { label: mark('V_{in}') });
  const out = 20;
  if (kind === 'buck') {
    d.part('switch-open', pt(0, 8), pt(8, 8), { label: mark('S') });
    d.part('diode', pt(8, 0), pt(8, 8), { label: mark('D') });
    d.part('inductor', pt(8, 8), pt(out, 8), { label: mark('L') });
    d.dots(pt(8, 8), pt(8, 0));
  } else if (kind === 'boost') {
    d.part('inductor', pt(0, 8), pt(8, 8), { label: mark('L') });
    d.part('switch-open', pt(8, 8), pt(8, 0), { label: mark('S') });
    d.part('diode', pt(8, 8), pt(out, 8), { label: mark('D') });
    d.dots(pt(8, 8), pt(8, 0));
  } else {
    d.part('switch-open', pt(0, 8), pt(8, 8), { label: mark('S') });
    d.part('inductor', pt(8, 8), pt(8, 0), { label: mark('L') });
    // the diode turned back towards the switch, so the output is negative
    d.part('diode', pt(out, 8), pt(8, 8), { label: mark('D') });
    d.dots(pt(8, 8), pt(8, 0));
  }
  d.wire([pt(0, 0), pt(out, 0)]);
  d.part('capacitor', pt(out, 8), pt(out, 0), { label: mark('C') });
  d.part('resistor', pt(out + 10, 8), pt(out + 10, 0), { label: mark('R'), voltage: mark('V_o') });
  d.wire([pt(out, 8), pt(out + 10, 8)]);
  d.wire([pt(out, 0), pt(out + 10, 0)]);
  d.dots(pt(out, 8), pt(out, 0));
  const formula = kind === 'buck' ? 'D' : kind === 'boost' ? '\\frac{1}{1 - D}' : '-\\frac{D}{1 - D}';
  d.text(pt(12, -4), `$M(D) = V_o/V_{in} = ${formula} = ${figure(conversionRatio(kind, d0))}$ at $D = ${figure(d0)}$`);
  return d.done();
}

// ─── filters ───

/** An RC ladder of n low-pass stages. */
export function rcLadder(n = 3) {
  const d = drawing();
  d.terminal(pt(0, 8), 'v_i');
  d.terminal(pt(0, 0), '');
  for (let k = 1; k <= n; k += 1) {
    d.part('resistor', pt(8 * (k - 1), 8), pt(8 * k, 8), { label: mark(`R_${k}`) });
    d.part('capacitor', pt(8 * k, 8), pt(8 * k, 0), { label: mark(`C_${k}`) });
    d.dots(pt(8 * k, 8), pt(8 * k, 0));
  }
  d.wire([pt(8 * n, 8), pt(8 * n + 6, 8)]);
  d.wire([pt(0, 0), pt(8 * n + 6, 0)]);
  d.terminal(pt(8 * n + 6, 8), 'v_o', 'right');
  d.terminal(pt(8 * n + 6, 0), '', 'right');
  return d.done();
}

// ─── signals and mechanics ───

/** A feedback loop: R(s) into an adder, G(s) forward, H(s) back, with the signs at the adder's inputs. */
export function feedbackLoop() {
  const d = drawing();
  const sum = d.node('adder', pt(8, 0));
  d.text(pt(-2.5, 0), '$R(s)$');
  d.wire([pt(0, 0), pin(sum, 'west')], [], '->');
  d.text(pt(5, 1.5), '$+$');
  d.text(pt(9.6, -3), '$-$');
  d.wire([pin(sum, 'east'), pt(16, 0)], [], '->');
  d.part('block', pt(16, 0), pt(20, 0), { text: '$G(s)$' });
  d.wire([pt(20, 0), pt(32, 0)], [], '->');
  d.text(pt(34.5, 0), '$Y(s)$');
  d.wire([pt(28, 0), pt(28, -8), pt(20, -8)], [], '->');
  d.part('block', pt(16, -8), pt(20, -8), { text: '$H(s)$' });
  d.wire([pt(16, -8), pt(8, -8), pin(sum, 'south')], [], '->');
  d.dots(pt(28, 0));
  return d.done();
}

/** A mass on a spring and damper from a wall, a force on it. */
export function massSpringDamper() {
  const d = drawing();
  d.node('mech-wall', pt(0, 0));
  d.part('spring', pt(0, 2), pt(10, 2), { label: mark('k') });
  d.part('damper', pt(0, -2), pt(10, -2), { label: mark('c', { side: '_' }) });
  d.wire([pt(10, 2), pt(10, -2)]);
  d.part('mass', pt(10, 0), pt(20, 0), { label: mark('m') });
  d.wire([pt(20, 0), pt(25, 0)], [], '->');
  d.text(pt(27.5, 0), '$F(t)$');
  d.dots(pt(10, 0));
  return d.done();
}
