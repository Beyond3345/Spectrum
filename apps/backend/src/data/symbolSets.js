// The diagram composer's symbol sets: what each loads, and the TeX of Spectrum's own symbols. symbolService draws the
// palette's pictures from it and the frontend's circuit code writes the same definitions into a figure, so the TeX lives
// here once. The frontend adds each set's label, categories, clashes and symbol list (diagram/sets.ts).
//
// Spectrum's own sets (spx-…) are plain TikZ from the core libraries, as \pic definitions named spx/<set>/<symbol>, so
// they never replace a package's own key (an unprefixed ground or spring style would replace circuitikz's). A pic marks
// each point wires attach to with \coordinate (-<pin>), which a picture names <pic name>-<pin>. Bump a set's version
// whenever its TeX changes: it is part of the symbol cache's key.

/** A flowchart shape's text: what \\pic[pic text=…] gave it (nothing when none). */
const text = '\\node[align=center] at (0,0) {\\tikzpictext};';
/** Pins in the middle of each side of a shape w across and h up from its centre. */
const sides = (w, h) => `\\coordinate (-north) at (0,${h});\\coordinate (-south) at (0,${-h});\\coordinate (-east) at (${w},0);\\coordinate (-west) at (${-w},0);`;

// ─── the fluid mechanics and construction materials sets ───
// Drawn as the lectures of two courses draw them, in circuitikz's weights: a solid boundary (a pipe's or tank's wall, a
// specimen's outline) as thick as circuitikz draws a part's body, 0.8pt, and the rest (arrows, levels, centre and cut
// lines, hatching) as thin as its wires, 0.4pt. Arrowheads are the wires' own latex. A pipe's bore is 1 cm (0.5 cm the
// narrow one), a tube's 0.25 cm, and pins sit on the canvas's 0.25 cm grid, so parts join end to end and wires meet them.

const body = String.raw`\draw[line width=0.8pt]`;
const num = (v) => String(Math.round(v * 1000) / 1000);
/** A pic's pins: { name: [x, y] }. */
const pins = (at) => Object.entries(at).map(([name, [x, y]]) => `\\coordinate (-${name}) at (${num(x)},${num(y)});`).join('');
/** The free surface mark: a triangle standing on the surface at (x, y), two shorter lines under it. */
const freeSurface = (x, y) => `\\draw (${num(x)},${num(y)}) -- ++(-0.15,0.26) -- ++(0.3,0) -- cycle (${num(x - 0.15)},${num(y - 0.07)}) -- ++(0.3,0) (${num(x - 0.08)},${num(y - 0.14)}) -- ++(0.16,0);`;
/** Hatching strokes from each (x, y), each (dx, dy) long. */
const hatching = (from, dx, dy) => `\\draw ${from.map(([x, y]) => `(${num(x)},${num(y)}) -- ++(${dx},${dy})`).join(' ')};`;
const steps = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
/** Arrows from x = 0 to u(y) at each y, of a velocity profile on a 1 cm bore. */
const profileArrows = (ys, u) => `\\foreach \\y/\\u in {${ys.map((y) => `${num(y)}/${num(u(y))}`).join(',')}} {\\draw[-latex] (0,\\y) -- (\\u,\\y);}`;
const profilePins = pins({ base: [0, 0], top: [0, 0.5], bottom: [0, -0.5] });
/** A U-tube: limbs 1 cm apart from y = 1 down to a half-circle bend, a 0.25 cm bore, and the liquid's level in each limb. */
const uTube = (left, right) => String.raw`${body} (-0.625,1) -- (-0.625,-0.5) arc[start angle=180, end angle=360, radius=0.625] -- (0.625,1) (-0.375,1) -- (-0.375,-0.5) arc[start angle=180, end angle=360, radius=0.375] -- (0.375,1);\draw (-0.625,${left}) -- (-0.375,${left}) (0.375,${right}) -- (0.625,${right});`;
/** Pressure arrows onto a surface along x = 0 from y = 1 down to y = -1, `top` cm long at the top and 1 cm at the bottom. */
const pressure = (top, ys) => String.raw`\draw (${num(-top)},1) -- (-1,-1);\foreach \y/\u in {${ys.map((y) => `${num(y)}/${num(top + ((1 - top) * (1 - y)) / 2)}`).join(',')}} {\draw[-latex] (-\u,\y) -- (0,\y);}` + pins({ top: [0, 1], bottom: [0, -1] });
/** A machine in a pipe: a circle with its letter, between two short lengths of pipe. */
const machine = (letter) => String.raw`${body} (0,0) circle (0.75) (-1,0.5) -- (-0.559,0.5) (-1,-0.5) -- (-0.559,-0.5) (0.559,0.5) -- (1,0.5) (0.559,-0.5) -- (1,-0.5);\node at (0,0) {${letter}};` + pins({ in: [-1, 0], out: [1, 0] });
/** A capillary tube standing in a liquid whose surface is y = 0, the meniscus in it at `level`, curved by `dip`. */
const capillary = (bottom, top, level, dip) => String.raw`${body} (-0.125,${bottom}) -- (-0.125,${top}) (0.125,${bottom}) -- (0.125,${top});\draw (-1,0) -- (-0.125,0) (0.125,0) -- (1,0) (-0.125,${level}) .. controls (-0.04,${num(level + dip)}) and (0.04,${num(level + dip)}) .. (0.125,${level});` + freeSurface(-0.6, 0) + pins({ top: [0, top], west: [-1, 0], east: [1, 0] });
/** Fresh concrete: a few specks of aggregate. */
const specks = (at) => `\\fill ${at.map(([x, y]) => `(${x},${y}) circle (0.35pt)`).join(' ')};`;
/** A flexural test: a 5 by 1 cm prism (750 by 150 mm) on two supporting rollers 3 cm apart, loading rollers at each x in `loads`. */
const flexure = (loads) => String.raw`${body} (-2.5,-0.5) rectangle (2.5,0.5);\draw (-1.5,-0.625) circle (0.125) (1.5,-0.625) circle (0.125)${loads.map((x) => ` (${x},0.625) circle (0.125)`).join('')};\draw[-latex] (-1.5,-1.5) -- (-1.5,-0.75);\draw[-latex] (1.5,-1.5) -- (1.5,-0.75);${loads.map((x) => `\\draw[-latex] (${x},1.5) -- (${x},0.75);`).join('')}`;
/** A 3 by 1.5 cm panel of brickwork, six courses of 0.75 cm bricks: `joints(course)` gives the x of a course's vertical joints. */
const brickwork = (joints) => String.raw`${body} (-1.5,-0.75) rectangle (1.5,0.75);\draw ${steps(-0.5, 0.5, 0.25).map((y) => `(-1.5,${num(y)}) -- (1.5,${num(y)})`).join(' ')} ${[0, 1, 2, 3, 4, 5].flatMap((course) => joints(course).filter((x) => x > -1.49 && x < 1.49).map((x) => `(${num(x)},${num(-0.75 + course * 0.25)}) -- ++(0,0.25)`)).join(' ')};` + pins({ left: [-1.5, 0], right: [1.5, 0], top: [0, 0.75], bottom: [0, -0.75] });

/** id → { version, packages (bare names, never options), libraries (TikZ names), pics: { key: body } } */
export const SYMBOL_SETS = {
  circuitikz: { version: 2, packages: ['circuitikz'], libraries: [], pics: {} },
  'spx-mech': {
    version: 2,
    packages: [],
    libraries: [],
    pics: {
      // a hatched surface, 1.2 cm wide, its pin in the middle of the surface
      'spx/mech/ground':
        '\\draw[line width=0.8pt] (-0.6,0) -- (0.6,0);'
        + '\\draw (-0.4,0) -- ++(-0.2,-0.2) (-0.2,0) -- ++(-0.2,-0.2) (0,0) -- ++(-0.2,-0.2) (0.2,0) -- ++(-0.2,-0.2) (0.4,0) -- ++(-0.2,-0.2) (0.6,0) -- ++(-0.2,-0.2);'
        + '\\coordinate (-p) at (0,0);',
      // a pinned support: a triangle on hatched ground, its pin at the apex
      'spx/mech/pin':
        '\\draw (0,0) -- (-0.25,-0.4) -- (0.25,-0.4) -- cycle;'
        + '\\draw[line width=0.8pt] (-0.4,-0.4) -- (0.4,-0.4);'
        + '\\draw (-0.2,-0.4) -- ++(-0.15,-0.15) (0,-0.4) -- ++(-0.15,-0.15) (0.2,-0.4) -- ++(-0.15,-0.15) (0.4,-0.4) -- ++(-0.15,-0.15);'
        + '\\draw[fill=white] (0,0) circle (0.05);'
        + '\\coordinate (-p) at (0,0);',
      // a hatched wall, 1.2 cm high, the hatching on its left and its pin in the middle of its face
      'spx/mech/wall':
        '\\draw[line width=0.8pt] (0,-0.6) -- (0,0.6);'
        + '\\draw (0,-0.4) -- ++(-0.2,-0.2) (0,-0.2) -- ++(-0.2,-0.2) (0,0) -- ++(-0.2,-0.2) (0,0.2) -- ++(-0.2,-0.2) (0,0.4) -- ++(-0.2,-0.2) (0,0.6) -- ++(-0.2,-0.2);'
        + '\\coordinate (-p) at (0,0);',
      // a hatched ceiling, 1.2 cm wide, the hatching above and its pin in the middle of its face
      'spx/mech/ceiling':
        '\\draw[line width=0.8pt] (-0.6,0) -- (0.6,0);'
        + '\\draw (-0.6,0) -- ++(0.2,0.2) (-0.4,0) -- ++(0.2,0.2) (-0.2,0) -- ++(0.2,0.2) (0,0) -- ++(0.2,0.2) (0.2,0) -- ++(0.2,0.2) (0.4,0) -- ++(0.2,0.2);'
        + '\\coordinate (-p) at (0,0);',
      // a cart: a 1.2 by 0.6 cm body on two wheels, pins in the middle of each side and where the wheels stand
      'spx/mech/cart':
        '\\draw (-0.6,0.2) rectangle (0.6,0.8);'
        + '\\draw (-0.35,0.1) circle (0.1) (0.35,0.1) circle (0.1);'
        + '\\coordinate (-left) at (-0.6,0.5);\\coordinate (-right) at (0.6,0.5);\\coordinate (-top) at (0,0.8);\\coordinate (-bottom) at (0,0);'
    }
  },
  // flowchart shapes, each with its text inside (\\pic[pic text=…]) and a pin in the middle of each side
  'spx-flow': {
    version: 1,
    packages: [],
    libraries: [],
    pics: {
      'spx/flow/process': '\\draw (-1,-0.5) rectangle (1,0.5);' + text + sides(1, 0.5),
      'spx/flow/terminal': '\\draw[rounded corners=0.5cm] (-1,-0.5) rectangle (1,0.5);' + text + sides(1, 0.5),
      'spx/flow/decision': '\\draw (-1.25,0) -- (0,0.75) -- (1.25,0) -- (0,-0.75) -- cycle;' + text + sides(1.25, 0.75),
      'spx/flow/data': '\\draw (-1.25,-0.5) -- (0.75,-0.5) -- (1.25,0.5) -- (-0.75,0.5) -- cycle;' + text + sides(1, 0.5),
      'spx/flow/database':
        '\\draw (-0.75,0.5) -- (-0.75,-0.5) arc[start angle=180, end angle=360, x radius=0.75, y radius=0.25] -- (0.75,0.5);'
        + '\\draw (0,0.5) ellipse[x radius=0.75, y radius=0.25];' + text + sides(0.75, 0.75),
      'spx/flow/circle': '\\draw (0,0) circle (0.5);' + text + sides(0.5, 0.5),
      'spx/flow/ellipse': '\\draw (0,0) ellipse[x radius=1, y radius=0.5];' + text + sides(1, 0.5)
    }
  },
  // points and marks for vector and geometry sketches; the Vector diagram composer has the constructions
  'spx-geom': {
    version: 1,
    packages: [],
    libraries: [],
    pics: {
      'spx/geom/point': '\\fill (0,0) circle (2pt);\\coordinate (-p) at (0,0);',
      'spx/geom/open': '\\draw[fill=white] (0,0) circle (2pt);\\coordinate (-p) at (0,0);',
      'spx/geom/right': '\\draw (0.35,0) -- (0.35,0.35) -- (0,0.35);\\coordinate (-p) at (0,0);',
      'spx/geom/axes':
        '\\draw[->] (-2.5,0) -- (2.5,0) node[right] {$x$};\\draw[->] (0,-2.5) -- (0,2.5) node[above] {$y$};'
        + '\\foreach \\t in {-2,-1,1,2} {\\draw (\\t,0.08) -- (\\t,-0.08) node[below] {\\small $\\t$};\\draw (0.08,\\t) -- (-0.08,\\t) node[left] {\\small $\\t$};}'
        + '\\node[below left] at (0,0) {$O$};\\coordinate (-o) at (0,0);'
    }
  },
  // pipes, tanks, manometers and the marks of hydrostatics and flow, as a fluid mechanics course draws them
  'spx-fluid': {
    version: 1,
    packages: [],
    libraries: [],
    pics: {
      // pipes and fittings: a 1 cm bore, pins in the middle of each open end
      'spx/fluid/pipe': String.raw`${body} (-1,0.5) -- (1,0.5) (-1,-0.5) -- (1,-0.5);` + pins({ in: [-1, 0], out: [1, 0], top: [0, 0.5], bottom: [0, -0.5] }),
      'spx/fluid/pipe-narrow': String.raw`${body} (-1,0.25) -- (1,0.25) (-1,-0.25) -- (1,-0.25);` + pins({ in: [-1, 0], out: [1, 0], top: [0, 0.25], bottom: [0, -0.25] }),
      // from the 1 cm bore to the narrow one, the joints at its ends drawn
      'spx/fluid/reducer': String.raw`${body} (-0.75,0.5) -- (0.75,0.25) (-0.75,-0.5) -- (0.75,-0.25);\draw (-0.75,-0.5) -- (-0.75,0.5) (0.75,-0.25) -- (0.75,0.25);` + pins({ in: [-0.75, 0], out: [0.75, 0] }),
      // a pipe's end narrowing to a jet
      'spx/fluid/nozzle': String.raw`${body} (-0.5,0.5) -- (0.5,0.2) (-0.5,-0.5) -- (0.5,-0.2);\draw[-latex] (0.6,0) -- (1.25,0);` + pins({ in: [-0.5, 0], out: [0.5, 0] }),
      // a quarter turn about (0,1), from flowing right to flowing up
      'spx/fluid/bend': String.raw`${body} (0,-0.5) arc[start angle=-90, end angle=0, radius=1.5] (0,0.5) arc[start angle=-90, end angle=0, radius=0.5];` + pins({ in: [0, 0], out: [1, 1] }),
      // an eighth of a turn, with the short straights that put its far end on the grid, at (1,0.5)
      'spx/fluid/bend-45': String.raw`${body} (0,-0.5) -- (0.086,-0.5) arc[start angle=-90, end angle=-45, radius=1.5] -- ++(45:0.293) (0,0.5) -- (0.086,0.5) arc[start angle=-90, end angle=-45, radius=0.5] -- ++(45:0.293);` + pins({ in: [0, 0], out: [1, 0.5] }),
      'spx/fluid/tee': String.raw`${body} (-1,-0.5) -- (1,-0.5) (-1,0.5) -- (-0.5,0.5) -- (-0.5,1) (0.5,1) -- (0.5,0.5) -- (1,0.5);` + pins({ in: [-1, 0], out: [1, 0], branch: [0, 1] }),
      // two triangles tip to tip across the bore, a stem and its handle
      'spx/fluid/valve': String.raw`${body} (-0.5,0.5) -- (-0.5,-0.5) -- (0.5,0.5) -- (0.5,-0.5) -- cycle (-0.3,0.75) -- (0.3,0.75);\draw (0,0) -- (0,0.75);` + pins({ in: [-0.5, 0], out: [0.5, 0] }),
      'spx/fluid/pump': machine('P'),
      'spx/fluid/turbine': machine('T'),
      // a dial on a short tapping, its pin where it meets the wall
      'spx/fluid/gauge': String.raw`\draw (0,0) -- (0,0.25);${body} (0,0.5) circle (0.25);\draw[-latex] (-0.13,0.37) -- (0.14,0.64);` + pins({ p: [0, 0] }),

      // flow: one end of a section's cut line, its number in the circle (pic text); two of them, one flipped, their pins
      // meeting on the pipe's centre line, make the pair
      'spx/fluid/section': String.raw`\draw (0,0) circle (0.25);\draw[dashed] (0,-0.25) -- (0,-1.5);\node at (0,0) {\tikzpictext};` + pins({ end: [0, -1.5] }),
      'spx/fluid/centre-line': String.raw`\draw[dash dot] (-1,0) -- (1,0);` + pins({ west: [-1, 0], east: [1, 0] }),
      // a dashed boundary with an arrow in and an arrow out, its name inside (pic text)
      'spx/fluid/control-volume': String.raw`\draw[dashed] (-1.25,-0.75) rectangle (1.25,0.75);\draw[-latex] (-2,0) -- (-1.25,0);\draw[-latex] (1.25,0) -- (2,0);\node at (0,0) {\tikzpictext};` + pins({ in: [-2, 0], out: [2, 0], north: [0, 0.75], south: [0, -0.75] }),
      // velocity profiles across a 1 cm bore, the arrows from a base line through the pin
      'spx/fluid/profile-uniform': String.raw`\draw (0,-0.5) -- (0,0.5) (0.75,-0.5) -- (0.75,0.5);` + profileArrows(steps(-0.4, 0.4, 0.2), () => 0.75) + profilePins,
      'spx/fluid/profile-linear': String.raw`\draw (0,-0.5) -- (0,0.5) (0,-0.5) -- (1,0.5);` + profileArrows(steps(-0.25, 0.5, 0.25), (y) => y + 0.5) + profilePins,
      'spx/fluid/profile-parabolic': String.raw`\draw (0,-0.5) -- (0,0.5);\draw plot[smooth] coordinates {${[-0.5, -0.46, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.46, 0.5].map((y) => `(${num(1 - 4 * y * y)},${y})`).join(' ')}};` + profileArrows(steps(-0.375, 0.375, 0.125), (y) => 1 - 4 * y * y) + profilePins,
      'spx/fluid/streamline': String.raw`\draw[-latex] (-1,-0.25) .. controls (-0.6,-0.25) and (-0.3,-0.1) .. (0,0);\draw (0,0) .. controls (0.3,0.1) and (0.6,0.25) .. (1,0.25);` + pins({ in: [-1, -0.25], out: [1, 0.25] }),
      // a bundle of streamlines between two sections
      'spx/fluid/streamtube': String.raw`\draw (-1,0) ellipse[x radius=0.1, y radius=0.3] (1,0) ellipse[x radius=0.16, y radius=0.5] (-1,0.3) .. controls (-0.3,0.3) and (0.3,0.5) .. (1,0.5) (-1,-0.3) .. controls (-0.3,-0.3) and (0.3,-0.5) .. (1,-0.5) (0,0) -- (1,0);\draw[-latex] (-1,0) -- (0.1,0);` + pins({ in: [-1, 0], out: [1, 0] }),

      // tanks and pressure: the mark's pin is its foot on the surface
      'spx/fluid/surface': freeSurface(0, 0) + pins({ p: [0, 0] }),
      // 3 by 2 cm, the liquid's surface 0.5 cm below the rim
      'spx/fluid/tank': String.raw`${body} (-1.5,1) -- (-1.5,-1) -- (1.5,-1) -- (1.5,1);\draw (-1.5,0.5) -- (1.5,0.5);` + freeSurface(0.9, 0.5) + pins({ left: [-1.5, 0], right: [1.5, 0], bottom: [0, -1], surface: [0, 0.5] }),
      'spx/fluid/tank-closed': String.raw`${body} (-1.5,-1) rectangle (1.5,1);\draw (-1.5,0.25) -- (1.5,0.25);` + pins({ left: [-1.5, 0], right: [1.5, 0], top: [0, 1], bottom: [0, -1] }),
      // seen from the side and a little above: the rim and the liquid's surface as ellipses
      'spx/fluid/tank-cylinder': String.raw`${body} (-1,1) -- (-1,-1) arc[start angle=180, end angle=360, x radius=1, y radius=0.25] -- (1,1) (0,1) ellipse[x radius=1, y radius=0.25];\draw (-1,0.25) arc[start angle=180, end angle=360, x radius=1, y radius=0.25];\draw[dashed] (1,0.25) arc[start angle=0, end angle=180, x radius=1, y radius=0.25];` + pins({ left: [-1, 0], right: [1, 0], top: [0, 1], bottom: [0, -1.25] }),
      // manometers: pins in the mouth of each limb
      'spx/fluid/manometer': uTube(-0.25, 0.5) + pins({ left: [-0.5, 1], right: [0.5, 1] }),
      // its limbs turned outwards to two tapping points
      'spx/fluid/manometer-differential': String.raw`${body} (-1.25,0.875) -- (-0.625,0.875) -- (-0.625,-0.5) arc[start angle=180, end angle=360, radius=0.625] -- (0.625,0.875) -- (1.25,0.875) (-1.25,1.125) -- (-0.375,1.125) -- (-0.375,-0.5) arc[start angle=180, end angle=360, radius=0.375] -- (0.375,1.125) -- (1.25,1.125);\draw (-0.625,-0.25) -- (-0.375,-0.25) (0.375,0.5) -- (0.625,0.5);` + pins({ a: [-1.25, 1], b: [1.25, 1] }),
      // the U upside down, gas in its bend
      'spx/fluid/manometer-inverted': String.raw`\begin{scope}[yscale=-1]${uTube(-0.25, 0.5)}\end{scope}` + pins({ left: [-0.5, -1], right: [0.5, -1] }),
      // a reservoir and a tube rising 1 in 2
      'spx/fluid/manometer-inclined': String.raw`${body} (-1.5,0.5) -- (-1.5,-0.5) -- (-0.5,-0.5) -- (-0.5,-0.375) -- (1.5,0.625) (-0.5,0.5) -- (-0.5,-0.125) -- (1.5,0.875);\draw (-1.5,0.125) -- (-0.5,0.125) (0.75,0.5) -- (1.25,0.5);` + pins({ p: [-1, 0.5], open: [1.5, 0.75] }),
      // three liquids one on another in an open column
      'spx/fluid/column': String.raw`${body} (-0.5,1.25) -- (-0.5,-1.25) -- (0.5,-1.25) -- (0.5,1.25);\draw (-0.5,1) -- (0.5,1) (-0.5,0.25) -- (0.5,0.25) (-0.5,-0.5) -- (0.5,-0.5);` + freeSurface(0.2, 1) + pins({ top: [0, 1], bottom: [0, -1.25], left: [-0.5, 0], right: [0.5, 0] }),
      'spx/fluid/piezometer': String.raw`${body} (-0.125,0) -- (-0.125,1.5) (0.125,0) -- (0.125,1.5);\draw (-0.125,1) -- (0.125,1);` + pins({ p: [0, 0], top: [0, 1.5] }),
      // a closed tube standing in a dish, the liquid's level in each
      'spx/fluid/barometer': String.raw`${body} (-0.75,0.25) -- (-0.6,-0.25) -- (0.6,-0.25) -- (0.75,0.25) (-0.125,-0.05) -- (-0.125,1.625) arc[start angle=180, end angle=0, radius=0.125] -- (0.125,-0.05);\draw (-0.72,0.15) -- (-0.125,0.15) (0.125,0.15) -- (0.72,0.15) (-0.125,1.25) -- (0.125,1.25);` + pins({ top: [0, 1.75], base: [0, -0.25] }),
      // two pistons of 0.5 and 1 cm on one liquid, pins on top of their rods
      'spx/fluid/jack': String.raw`${body} (-1.25,0.75) -- (-1.25,-0.75) -- (1.25,-0.75) -- (1.25,0.75) (-0.75,0.75) -- (-0.75,-0.5) -- (0.25,-0.5) -- (0.25,0.75) (-1,0.25) -- (-1,1) (0.75,0.25) -- (0.75,1);\draw[line width=1.2pt] (-1.25,0.25) -- (-0.75,0.25) (0.25,0.25) -- (1.25,0.25);` + pins({ small: [-1, 1], large: [0.75, 1] }),

      // hydrostatics: a plate 2 cm long
      'spx/fluid/gate': String.raw`\draw[line width=1.2pt] (0,-1) -- (0,1);` + pins({ top: [0, 1], bottom: [0, -1], centre: [0, 0] }),
      // a pin held off a hatched wall
      'spx/fluid/hinge': String.raw`\draw[line width=0.8pt] (-0.4,-0.4) -- (-0.4,0.4);` + hatching(steps(-0.2, 0.4, 0.2).map((y) => [-0.4, y]), -0.15, -0.15) + String.raw`\draw (-0.4,0.25) -- (0,0) -- (-0.4,-0.25);\draw[fill=white] (0,0) circle (0.07);` + pins({ p: [0, 0] }),
      // a ridge on the floor that a gate closes against
      'spx/fluid/stop': String.raw`\draw (0,0) -- (0.4,0) -- (0,0.3) -- cycle;` + pins({ p: [0, 0] }),
      'spx/fluid/pressure': pressure(0, [0.6, 0.2, -0.2, -0.6, -1]),
      'spx/fluid/pressure-trapezoid': pressure(0.4, [1, 0.5, 0, -0.5, -1]),
      // its head at the pin, on the centre of pressure
      'spx/fluid/resultant': String.raw`\draw[-latex, line width=1.2pt] (-1,0) -- (0,0);` + pins({ tip: [0, 0], tail: [-1, 0] }),
      // a body with its weight and the buoyant force on it
      'spx/fluid/block': String.raw`${body} (-0.75,-0.5) rectangle (0.75,0.5);\draw[-latex] (0,0.25) -- (0,-0.3) node[midway, auto] {$W$};\draw[-latex] (0,-1.1) -- (0,-0.5) node[midway, auto, swap] {$F_B$};` + pins({ top: [0, 0.5], bottom: [0, -0.5], left: [-0.75, 0], right: [0.75, 0] }),
      // a graduated stem on a bulb, weighted at its foot
      'spx/fluid/hydrometer': String.raw`${body} (-0.08,1.5) -- (-0.08,0.25) -- (-0.2,0.1) -- (-0.2,-0.55) arc[start angle=180, end angle=360, radius=0.2] -- (0.2,0.1) -- (0.08,0.25) -- (0.08,1.5) -- cycle;\fill (-0.2,-0.5) -- (-0.2,-0.55) arc[start angle=180, end angle=360, radius=0.2] -- (0.2,-0.5) -- cycle;\draw (-0.08,1.2) -- (0.03,1.2) (-0.08,1) -- (0.03,1) (-0.08,0.8) -- (0.03,0.8) (-0.08,0.6) -- (0.03,0.6);` + pins({ top: [0, 1.5], bottom: [0, -0.75] }),
      // a hull's section upright in the water, with its metacentre, centre of gravity and centre of buoyancy
      'spx/fluid/hull': String.raw`${body} (1,0.5) -- (-1,0.5) .. controls (-1,-0.2) and (-0.4,-0.55) .. (0,-0.75) .. controls (0.4,-0.55) and (1,-0.2) .. (1,0.5);\draw[dash dot] (0,-1) -- (0,1.25);\draw (-1.5,0) -- (-0.88,0) (0.88,0) -- (1.5,0);\fill (0,1) circle (1pt) (0,0.25) circle (1pt) (0,-0.25) circle (1pt);\node[right] at (0,1) {$M$};\node[right] at (0,0.25) {$G$};\node[right] at (0,-0.25) {$B$};` + freeSurface(1.25, 0) + pins({ M: [0, 1], G: [0, 0.25], B: [0, -0.25], keel: [0, -0.75], west: [-1.5, 0], east: [1.5, 0] }),
      // a slope of 3 in 5
      'spx/fluid/incline': String.raw`${body} (-1.25,-0.75) -- (1.25,-0.75) -- (1.25,0.75) -- cycle;\draw (-0.5,-0.75) arc[start angle=0, end angle=30.96, radius=0.75];\node at (-0.27,-0.5) {$\theta$};` + pins({ toe: [-1.25, -0.75], top: [1.25, 0.75], base: [1.25, -0.75], mid: [0, 0] }),
      // viscosity and surface tension
      // a fixed plate, hatched, and a plate 1 cm above it pulled to the right
      'spx/fluid/plates': String.raw`${body} (-1.25,-0.5) -- (1.25,-0.5);\draw[line width=1.6pt] (-1.25,0.5) -- (1.25,0.5);\draw[-latex] (1.25,0.5) -- (2,0.5);` + hatching(steps(-1, 1.25, 0.25).map((x) => [x, -0.5]), -0.2, -0.2) + pins({ centre: [0, 0], force: [2, 0.5] }),
      'spx/fluid/capillary': capillary(-0.5, 1.25, 0.75, -0.09),
      'spx/fluid/capillary-depression': capillary(-0.75, 1, -0.3, 0.08),
      // a liquid's surface meeting a wall, the angle between the wall and its tangent there
      'spx/fluid/contact-angle': String.raw`${body} (0,-0.5) -- (0,1);\draw (-1.5,0) .. controls (-0.8,0) and (-0.3,0.25) .. (0,0.75) (0,0.25) arc[start angle=-90, end angle=-121, radius=0.5];\draw[dashed] (0,0.75) -- (-0.46,-0.02);\node at (-0.19,0.06) {$\phi$};` + pins({ p: [0, 0.75], west: [-1.5, 0] })
    }
  },
  // test specimens and sections of a construction materials course, 150 mm to the centimetre
  'spx-mat': {
    version: 1,
    packages: [],
    libraries: [],
    pics: {
      // a 150 mm cube between a testing machine's platens, the load spread over them
      'spx/mat/cube': String.raw`${body} (-0.5,-0.5) rectangle (0.5,0.5);\draw (-0.65,0.5) rectangle (0.65,0.65) (-0.65,-0.65) rectangle (0.65,-0.5) (-0.4,1) -- (0.4,1) (-0.4,-1) -- (0.4,-1);\foreach \x in {-0.4,-0.2,0,0.2,0.4} {\draw[-latex] (\x,1) -- (\x,0.65);\draw[-latex] (\x,-1) -- (\x,-0.65);}` + pins({ top: [0, 1], bottom: [0, -1], left: [-0.5, 0], right: [0.5, 0] }),
      // a 150 by 300 mm cylinder under its load
      'spx/mat/cylinder': String.raw`${body} (-0.5,1) -- (-0.5,-1) arc[start angle=180, end angle=360, x radius=0.5, y radius=0.15] -- (0.5,1) (0,1) ellipse[x radius=0.5, y radius=0.15];\draw[dashed] (0.5,-1) arc[start angle=0, end angle=180, x radius=0.5, y radius=0.15];\draw[-latex] (0,1.75) -- (0,1.15);\draw[-latex] (0,-1.75) -- (0,-1.15);` + pins({ top: [0, 1.75], bottom: [0, -1.75], left: [-0.5, 0], right: [0.5, 0] }),
      'spx/mat/flexure-3': flexure([0]) + pins({ load: [0, 1.5], left: [-1.5, -1.5], right: [1.5, -1.5] }),
      'spx/mat/flexure-4': flexure([-0.5, 0.5]) + pins({ 'load 1': [-0.5, 1.5], 'load 2': [0.5, 1.5], left: [-1.5, -1.5], right: [1.5, -1.5] }),
      // the slump test's mould: 100 mm at the top, 200 at the base, 300 high, with its foot pieces and handles
      'spx/mat/slump-cone': String.raw`${body} (-0.5,0) -- (-0.25,1.5) -- (0.25,1.5) -- (0.5,0) -- cycle;\draw (-0.5,0) -- (-0.7,0) (0.5,0) -- (0.7,0) (-0.375,0.75) -- (-0.55,0.75) -- (-0.55,0.6) (0.375,0.75) -- (0.55,0.75) -- (0.55,0.6);` + pins({ base: [0, 0], top: [0, 1.5] }),
      // the concrete once the mould is lifted: slumped evenly, sheared to one side, and collapsed
      'spx/mat/slump-true': String.raw`${body} (-0.55,0) -- (-0.42,0.95) .. controls (-0.3,1.05) and (-0.12,0.97) .. (0,1) .. controls (0.12,1.03) and (0.3,1.05) .. (0.42,0.95) -- (0.55,0) -- cycle;` + specks([[-0.3, 0.2], [0.1, 0.15], [0.35, 0.3], [-0.1, 0.45], [0.2, 0.55], [-0.28, 0.65], [0.05, 0.8], [0.3, 0.8]]) + pins({ base: [0, 0], top: [0, 1] }),
      'spx/mat/slump-shear': String.raw`${body} (-0.55,0) -- (-0.45,1.1) .. controls (-0.4,1.25) and (-0.15,1.3) .. (0,1.1) -- (0.45,0.55) .. controls (0.65,0.45) and (0.75,0.2) .. (0.75,0) -- cycle;` + specks([[-0.3, 0.2], [0.1, 0.15], [0.45, 0.25], [-0.1, 0.45], [0.25, 0.5], [-0.28, 0.7], [-0.05, 0.85], [-0.3, 1]]) + pins({ base: [0, 0], top: [-0.25, 1.25] }),
      'spx/mat/slump-collapse': String.raw`${body} (-1,0) .. controls (-0.9,0.3) and (-0.5,0.47) .. (0,0.5) .. controls (0.5,0.47) and (0.9,0.3) .. (1,0) -- cycle;` + specks([[-0.6, 0.12], [-0.25, 0.3], [0.05, 0.15], [0.3, 0.33], [0.65, 0.12], [-0.4, 0.1], [0.45, 0.1]]) + pins({ base: [0, 0], top: [0, 0.5] }),
      // a bar pulled at both ends
      'spx/mat/tension': String.raw`${body} (-1.25,-0.2) rectangle (1.25,0.2);\draw[-latex] (-1.25,0) -- (-2,0);\draw[-latex] (1.25,0) -- (2,0);` + pins({ left: [-2, 0], right: [2, 0] }),
      // a block sheared by forces along its top and bottom, its strained shape dashed
      'spx/mat/shear': String.raw`${body} (-0.5,-0.5) rectangle (0.5,0.5);\draw[dashed] (-0.5,-0.5) -- (-0.25,0.5) -- (0.75,0.5) -- (0.5,-0.5);\draw[-latex] (-0.4,0.75) -- (0.5,0.75);\draw[-latex] (0.4,-0.75) -- (-0.5,-0.75);` + pins({ top: [0, 0.75], bottom: [0, -0.75] }),
      // a loading or supporting roller, standing on its pin
      'spx/mat/roller': String.raw`\draw (0,0.125) circle (0.125);` + pins({ p: [0, 0] }),
      'spx/mat/platen': String.raw`\draw (-0.75,0) rectangle (0.75,0.15);` + pins({ p: [0, 0] }),

      // a reinforced concrete beam's section: a link, two hanger bars and three bars in the tension face
      'spx/mat/rc-section': String.raw`${body} (-0.75,-1) rectangle (0.75,1);\draw[rounded corners=0.08cm] (-0.6,-0.85) rectangle (0.6,0.85);\fill (-0.43,-0.68) circle (0.08) (0,-0.68) circle (0.08) (0.43,-0.68) circle (0.08) (-0.45,0.7) circle (0.06) (0.45,0.7) circle (0.06);` + pins({ top: [0, 1], bottom: [0, -1], left: [-0.75, 0], right: [0.75, 0] }),
      // rolled steel sections
      'spx/mat/steel-i': String.raw`${body} (-0.75,-1) -- (0.75,-1) -- (0.75,-0.8) -- (0.075,-0.8) -- (0.075,0.8) -- (0.75,0.8) -- (0.75,1) -- (-0.75,1) -- (-0.75,0.8) -- (-0.075,0.8) -- (-0.075,-0.8) -- (-0.75,-0.8) -- cycle;` + pins({ top: [0, 1], bottom: [0, -1], centre: [0, 0] }),
      'spx/mat/steel-channel': String.raw`${body} (-0.5,-1) -- (0.5,-1) -- (0.5,-0.8) -- (-0.35,-0.8) -- (-0.35,0.8) -- (0.5,0.8) -- (0.5,1) -- (-0.5,1) -- cycle;` + pins({ top: [0, 1], bottom: [0, -1], web: [-0.5, 0] }),
      'spx/mat/steel-angle': String.raw`${body} (-0.5,-0.5) -- (0.5,-0.5) -- (0.5,-0.35) -- (-0.35,-0.35) -- (-0.35,0.5) -- (-0.5,0.5) -- cycle;` + pins({ heel: [-0.5, -0.5], top: [-0.5, 0.5], toe: [0.5, -0.5] }),
      'spx/mat/steel-tee': String.raw`${body} (-0.75,0.5) -- (0.75,0.5) -- (0.75,0.3) -- (0.075,0.3) -- (0.075,-0.75) -- (-0.075,-0.75) -- (-0.075,0.3) -- (-0.75,0.3) -- cycle;` + pins({ top: [0, 0.5], bottom: [0, -0.75] }),
      'spx/mat/steel-rhs': String.raw`\draw[line width=0.8pt, rounded corners=0.12cm] (-0.5,-0.75) rectangle (0.5,0.75);\draw[line width=0.8pt, rounded corners=0.04cm] (-0.38,-0.63) rectangle (0.38,0.63);` + pins({ top: [0, 0.75], bottom: [0, -0.75], left: [-0.5, 0], right: [0.5, 0] }),
      'spx/mat/steel-chs': String.raw`${body} (0,0) circle (0.75) (0,0) circle (0.63);` + pins({ top: [0, 0.75], bottom: [0, -0.75], left: [-0.75, 0], right: [0.75, 0] }),
      // brickwork in stretcher bond (each course half a brick along from the last), English bond (courses of stretchers
      // and of headers in turn) and Flemish bond (stretchers and headers in turn along each course)
      'spx/mat/bond-stretcher': brickwork((course) => steps(-3, 3, 0.75).map((x) => x + (course % 2) * 0.375)),
      'spx/mat/bond-english': brickwork((course) => (course % 2 ? steps(-3, 3, 0.375).map((x) => x + 0.1875) : steps(-3, 3, 0.75))),
      'spx/mat/bond-flemish': brickwork((course) => steps(-3.375, 3.375, 1.125).flatMap((x) => [x, x + 0.75]).map((x) => x + (course % 2) * 0.5625))
    }
  }
};

/** The line that defines a set's pic, for a figure's picture or the palette's preamble. */
export const picDefinition = (key, body) => `\\tikzset{${key}/.pic={${body}}}`;

/** The set a pic key belongs to, or undefined. */
export const setOfPic = (key) => Object.keys(SYMBOL_SETS).find((id) => key in SYMBOL_SETS[id].pics);

// circuitikz shapes of Spectrum's own, declared where a drawing or the palette uses one: the MU Style symbols, as Hong
// Kong Metropolitan University's lecture slides draw them. Each is drawn from circuitikz's own parameters, line widths and
// currarrow, so it sizes, turns, flips, colours and labels as circuitikz's parts do. Bump circuitikz's version above
// whenever this TeX changes.
//
// The MOSFETs are circuitikz's nmos and pmos, their anchors and size taken from those: the channel in three segments as
// nigfete has it (#3 = 1) or solid (0), and the arrow on the source lead as arrowmos puts it, out of an N channel and
// into a P one (#4 = 0), or on a bulk lead to the bulk anchor, into an N channel and out of a P one (#4 = 1).
// ponytail: no body diode or transistor circle on them; draw those from circuitikz's own code if they're asked for
const MU_MOS = String.raw`% MU Style MOSFETs: circuitikz's nmos and pmos with the channel in three segments or solid, and the arrow on the source or bulk lead
% what circuitikz before 1.5 (the built-in Tectonic's) lacks
\ifcsname pgf@circ@draw@component\endcsname\else\long\def\pgf@circ@draw@component#1{\behindbackgroundpath{#1}}\fi
\ifcsname pgf@circ@setcolor\endcsname\else\def\pgf@circ@setcolor{\pgfsetcolor{\ctikzvalof{color}}}\fi
\ifcsname ifpgf@circuit@trans@roundedcap\endcsname\else\expandafter\let\csname ifpgf@circuit@trans@roundedcap\expandafter\endcsname\csname iffalse\endcsname\fi
\ifcsname pgfk@/tikz/circuitikz/transistors/gate thickness\endcsname\else\ctikzset{transistors/gate thickness/.initial=1}\fi
\def\spectrummumos#1#2#3#4{\pgfdeclareshape{#1}{\inheritsavedanchors[from=#2]\inheritanchorborder[from=#2]%
\foreach\a in {center,text,north,south,east,west,north east,north west,south east,south west,left,right,G,D,S,gate,drain,source,bulk}{\inheritanchor[from=#2]{\a}}%
\pgf@circ@draw@component{\pgftransformationadjustments\pgf@circ@setcolor
\northeast\pgf@circ@res@up=\pgf@y\left\pgf@circ@res@left=\pgf@x
\def\x####1{\ctikzvalof{tripoles/#2/####1 width}\pgf@circ@res@left}\def\y####1{\ctikzvalof{tripoles/#2/####1 height}\pgf@circ@res@up}%
% the drain and source leads, the gate's and the bulk's
\pgfpathmoveto{\pgfpoint{0pt}{\pgf@circ@res@up+\pgfverticaltransformationadjustment*.5\pgflinewidth}}\pgfpathlineto{\pgfpoint{0pt}{\y{gate}}}\pgfpathlineto{\pgfpoint{\x{base}}{\y{gate}}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{-\y{gate}}}\pgfpathlineto{\pgfpoint{0pt}{-\y{gate}}}\pgfpathlineto{\pgfpoint{0pt}{-\pgf@circ@res@up-\pgfverticaltransformationadjustment*.5\pgflinewidth}}%
\ifpgf@circuit@bpt@drawgate\pgfpathmoveto{\pgfpoint{\x{gate}}{0pt}}\pgfpathlineto{\pgfpoint{\pgf@circ@res@left-\pgfhorizontaltransformationadjustment*.5\pgflinewidth}{0pt}}\fi
\ifnum#4=1 \pgfpathmoveto{\pgfpoint{\x{base}}{0pt}}\pgfpathlineto{\pgfpoint{\pgfhorizontaltransformationadjustment*.5\pgflinewidth}{0pt}}\fi
\pgfusepath{draw}%
% the channel, and the gate
\pgfscope\pgf@circ@setlinewidth{tripoles}{\pgflinewidth}\ifpgf@circuit@trans@roundedcap\pgfsetroundcap\fi
\ifnum#3=1 \pgfpathmoveto{\pgfpoint{\x{base}}{\y{base}}}\pgfpathlineto{\pgfpoint{\x{base}}{\y{base}*.45}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{\y{base}*.25}}\pgfpathlineto{\pgfpoint{\x{base}}{-\y{base}*.25}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{-\y{base}*.45}}\pgfpathlineto{\pgfpoint{\x{base}}{-\y{base}}}%
\else\pgfpathmoveto{\pgfpoint{\x{base}}{\y{base}}}\pgfpathlineto{\pgfpoint{\x{base}}{-\y{base}}}\fi\pgfusepath{draw}%
\pgfsetlinewidth{\ctikzvalof{transistors/gate thickness}\pgflinewidth}%
\pgfpathmoveto{\pgfpoint{\x{gate}}{\y{gate}}}\pgfpathlineto{\pgfpoint{\x{gate}}{-\y{gate}}}\pgfusepath{draw}\endpgfscope
% the arrow on the source or bulk lead
\pgfscope\pgfslopedattimetrue\pgfallowupsidedownattimetrue\pgfresetnontranslationattimefalse
\ifnum#4=1 \ifnum\ctikzvalof{tripoles/#2/curr direction}>0
\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpointorigin}{\pgfpoint{\x{base}}{0pt}}%
\else\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpoint{\x{base}}{0pt}}{\pgfpointorigin}\fi
\else\ifnum\ctikzvalof{tripoles/#2/curr direction}>0
\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpoint{\x{gate}}{-\y{gate}}}{\pgfpoint{0pt}{-\y{gate}}}%
\else\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpoint{0pt}{\y{gate}}}{\pgfpoint{\x{gate}}{\y{gate}}}\fi\fi
\pgfnode{currarrow}{center}{}{}{\pgfusepath{stroke}}\endpgfscope}}}`;

// Two-terminal parts: bipole shapes declared as circuitikz declares its own, so labels, values, voltages, currents, poles
// and fill work on them as on D, I and V.
const bipole = (name, cls, height, width, kind, options, drawing) => String.raw`\ctikzset{bipoles/${name}/height/.initial=${height},bipoles/${name}/width/.initial=${width}}%
\pgfcircdeclarebipolescaled{${cls}}{}{\ctikzvalof{bipoles/${name}/height}}{${name}}{\ctikzvalof{bipoles/${name}/height}}{\ctikzvalof{bipoles/${name}/width}}{\pgf@circ@setlinewidth{bipoles}{\pgfstartlinewidth}${drawing}}%
\pgfcirc@activate@bipole@opt{${kind}}{${name}}{${name}}{${name}}{${options}}`;
const box = String.raw`\pgfpathrectanglecorners{\pgfpoint{\pgf@circ@res@left}{\pgf@circ@res@down}}{\pgfpoint{\pgf@circ@res@right}{\pgf@circ@res@up}}`;
const circle = String.raw`\pgfscope\pgfpathellipse{\pgfpointorigin}{\pgfpoint{0pt}{\pgf@circ@res@up}}{\pgfpoint{\pgf@circ@res@left}{0pt}}\pgf@circ@draworfill\endpgfscope`;
// a voltage source's + and −, as circuitikz's american voltage source sets them but smaller and nearer the rim, as the
// slides have them, to leave room between them; circuitikz before 1.5 (Tectonic's) sets them in the default way only
const signs = String.raw`\pgfscope\ctikzset{bipoles/vsourceam/margin=.8,bipoles/vsourceam/inner plus={$\scriptstyle+$},bipoles/vsourceam/inner minus={$\vphantom{\scriptstyle+}\scriptstyle-$}}\csname pgf@circ@text@strokecolor\endcsname
\ifcsname pgf@circ@vsources@draw@signs\endcsname\pgf@circ@vsources@draw@signs\else\def\p{\ctikzvalof{bipoles/vsourceam/inner plus}}\def\m{\ctikzvalof{bipoles/vsourceam/inner minus}}%
\ifpgf@circ@oldvoltagedirection\else\def\p{\ctikzvalof{bipoles/vsourceam/inner minus}}\def\m{\ctikzvalof{bipoles/vsourceam/inner plus}}\fi
\pgftext[bottom,rotate=90,y=\ctikzvalof{bipoles/vsourceam/margin}\pgf@circ@res@down]{\p}\pgftext[top,rotate=90,y=\ctikzvalof{bipoles/vsourceam/margin}\pgf@circ@res@up]{\m}\fi\endpgfscope`;
const voltage = String.raw`\circuitikzbasekey/bipole/is voltage=true,\circuitikzbasekey/bipole/is voltageoutsideofsymbol=false`;

/** Each shape's TeX, by the key a drawing uses it with; `needs` is shared TeX it calls, declared once before it. */
const CIRCUIT_SHAPES = {
  munmos: { needs: MU_MOS, tex: '\\spectrummumos{munmos}{nmos}{1}{0}' },
  mupmos: { needs: MU_MOS, tex: '\\spectrummumos{mupmos}{pmos}{1}{0}' },
  munmosb: { needs: MU_MOS, tex: '\\spectrummumos{munmosb}{nmos}{1}{1}' },
  mupmosb: { needs: MU_MOS, tex: '\\spectrummumos{mupmosb}{pmos}{1}{1}' },
  munmosdb: { needs: MU_MOS, tex: '\\spectrummumos{munmosdb}{nmos}{0}{1}' },
  mupmosdb: { needs: MU_MOS, tex: '\\spectrummumos{mupmosdb}{pmos}{0}{1}' },
  // the ideal diode: circuitikz's empty diode at about two thirds of its size, in a square
  muidealdiode: { tex: `% MU Style ideal diode\n${bipole('muidealdiode', 'diodes', '.6', '.6', 'l', '', String.raw`${box}\pgfusepath{draw}\pgf@circ@res@up=.6\pgf@circ@res@up\pgf@circ@res@down=.6\pgf@circ@res@down\pgf@circ@res@left=.5\pgf@circ@res@left\pgf@circ@res@right=.5\pgf@circ@res@right\pgfscope\pgf@circ@basicdiodeshape\endpgfscope\pgfpathmoveto{\pgfpoint{\pgf@circ@res@right}{\pgf@circ@res@down}}\pgfpathlineto{\pgfpoint{\pgf@circ@res@right}{\pgf@circ@res@up}}\pgfusepath{draw}`)}` },
  // the electronic current source: a box along the wire with the american current source's arrow in it
  murectisource: { tex: `% MU Style current source (box)\n${bipole('murectisource', 'sources', '.4', '.7', 'i', '\\circuitikzbasekey/bipole/is current=true', String.raw`${box}\pgf@circ@draworfill\pgfpathmoveto{\pgfpoint{.75\pgf@circ@res@left}{0pt}}\pgfpathlineto{\pgfpoint{.75\pgf@circ@res@right}{0pt}}\pgfusepath{draw}\pgfscope\pgftransformshift{\pgfpoint{.5\pgf@circ@res@right}{0pt}}\pgfnode{currarrow}{center}{}{}{\pgfusepath{stroke}}\endpgfscope`)}` },
  // AC sources: the american voltage source with ~ between its + and −, or with a smaller sine than sV's between them;
  // the ~ and the sine turn with the part as sV's sine does
  mutildesource: { tex: `% MU Style AC source (+ ~ −)\n${bipole('mutildesource', 'sources', '.6', '.6', 'v', voltage, String.raw`${circle}${signs}\pgfscope\pgf@circ@sources@symbol@setup\csname pgf@circ@text@strokecolor\endcsname\pgftext{$\sim$}\endpgfscope`)}` },
  musinesource: { tex: `% MU Style AC source (sine, + and −)\n${bipole('musinesource', 'sources', '.6', '.6', 'v', voltage, String.raw`${circle}${signs}\pgf@circ@res@up=.4\pgf@circ@res@up\pgfscope\pgf@circ@sources@symbol@setup\pgfpathmoveto{\pgfpoint{-\pgf@circ@res@up}{0pt}}\pgfpathsine{\pgfpoint{.5\pgf@circ@res@up}{.5\pgf@circ@res@up}}\pgfpathcosine{\pgfpoint{.5\pgf@circ@res@up}{-.5\pgf@circ@res@up}}\pgfpathsine{\pgfpoint{.5\pgf@circ@res@up}{-.5\pgf@circ@res@up}}\pgfpathcosine{\pgfpoint{.5\pgf@circ@res@up}{.5\pgf@circ@res@up}}\pgfusepath{draw}\endpgfscope`)}` },
  // a supply drawn as a bar, not an arrow: vcc with arrows.meta's Bar, as wide as three of its arrows and as thick as its arrow's lines
  'mu rail': { tex: '\\tikzset{mu rail/.style={circuitikz/monopoles/vcc/arrow={Bar[width=.6*\\the\\pgf@circ@scaled@Rlen, line width=0pt 2]}}}' },
  // a transformer's polarity dots, circuitikz's junction dots at its own dot anchors
  'mu dots outside': { tex: '\\tikzset{mu dots outside/.style={append after command={\\pgfextra{\\edef\\spectrumtr{\\tikzlastnode}} node[circ] at (\\spectrumtr.outer dot A1) {} node[circ] at (\\spectrumtr.outer dot B1) {}}}}' },
  'mu dots inside': { tex: '\\tikzset{mu dots inside/.style={append after command={\\pgfextra{\\edef\\spectrumtr{\\tikzlastnode}} node[circ] at (\\spectrumtr.inner dot A1) {} node[circ] at (\\spectrumtr.inner dot B1) {}}}}' }
};

/** The lines that declare the shapes and styles these circuitikz keys (`nmos`, `munmos, mu rail`, …) use, for a picture or a preamble; none when they use none. */
export function shapeDefinitions(keys) {
  const words = new Set(keys.flatMap((key) => key.split(',').map((word) => word.trim())));
  const used = Object.keys(CIRCUIT_SHAPES).filter((shape) => words.has(shape)).map((shape) => CIRCUIT_SHAPES[shape]);
  if (!used.length) return [];
  const needs = [...new Set(used.flatMap((shape) => (shape.needs ? [shape.needs] : [])))];
  return ['\\makeatletter', ...needs, ...used.map((shape) => shape.tex), '\\makeatother'];
}
