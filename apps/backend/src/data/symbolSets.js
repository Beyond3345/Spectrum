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

/** id → { version, packages (bare names, never options), libraries (TikZ names), pics: { key: body } } */
export const SYMBOL_SETS = {
  circuitikz: { version: 1, packages: ['circuitikz'], libraries: [], pics: {} },
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
  }
};

/** The line that defines a set's pic, for a figure's picture or the palette's preamble. */
export const picDefinition = (key, body) => `\\tikzset{${key}/.pic={${body}}}`;

/** The set a pic key belongs to, or undefined. */
export const setOfPic = (key) => Object.keys(SYMBOL_SETS).find((id) => key in SYMBOL_SETS[id].pics);

// circuitikz shapes of Spectrum's own, declared where a drawing or the palette uses one. The MU Style MOSFETs (as Hong
// Kong Metropolitan University draws them) are circuitikz's nmos and pmos, their anchors and size taken from those, with
// the channel in three segments as nigfete has it and the arrow on the source lead as arrowmos puts it: out of an N
// channel, into a P one. Bump circuitikz's version above whenever this TeX changes.
// ponytail: no body diode or transistor circle on them; draw those from circuitikz's own code if they're asked for
const MU_MOS = String.raw`% MU Style MOSFETs: circuitikz's nmos and pmos with the channel in three segments and the arrow on the source lead
\def\spectrummumos#1#2{\pgfdeclareshape{#1}{\inheritsavedanchors[from=#2]\inheritanchorborder[from=#2]%
\foreach\a in {center,text,north,south,east,west,north east,north west,south east,south west,left,right,G,D,S,gate,drain,source}{\inheritanchor[from=#2]{\a}}%
\pgf@circ@draw@component{\pgftransformationadjustments\pgf@circ@setcolor
\northeast\pgf@circ@res@up=\pgf@y\left\pgf@circ@res@left=\pgf@x
\def\x####1{\ctikzvalof{tripoles/#2/####1 width}\pgf@circ@res@left}\def\y####1{\ctikzvalof{tripoles/#2/####1 height}\pgf@circ@res@up}%
% the drain and source leads, and the gate's
\pgfpathmoveto{\pgfpoint{0pt}{\pgf@circ@res@up+\pgfverticaltransformationadjustment*.5\pgflinewidth}}\pgfpathlineto{\pgfpoint{0pt}{\y{gate}}}\pgfpathlineto{\pgfpoint{\x{base}}{\y{gate}}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{-\y{gate}}}\pgfpathlineto{\pgfpoint{0pt}{-\y{gate}}}\pgfpathlineto{\pgfpoint{0pt}{-\pgf@circ@res@up-\pgfverticaltransformationadjustment*.5\pgflinewidth}}%
\ifpgf@circuit@bpt@drawgate\pgfpathmoveto{\pgfpoint{\x{gate}}{0pt}}\pgfpathlineto{\pgfpoint{\pgf@circ@res@left-\pgfhorizontaltransformationadjustment*.5\pgflinewidth}{0pt}}\fi
\pgfusepath{draw}%
% the channel in three segments, and the gate
\pgfscope\pgf@circ@setlinewidth{tripoles}{\pgflinewidth}\ifpgf@circuit@trans@roundedcap\pgfsetroundcap\fi
\pgfpathmoveto{\pgfpoint{\x{base}}{\y{base}}}\pgfpathlineto{\pgfpoint{\x{base}}{\y{base}*.45}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{\y{base}*.25}}\pgfpathlineto{\pgfpoint{\x{base}}{-\y{base}*.25}}%
\pgfpathmoveto{\pgfpoint{\x{base}}{-\y{base}*.45}}\pgfpathlineto{\pgfpoint{\x{base}}{-\y{base}}}\pgfusepath{draw}%
\pgfsetlinewidth{\ctikzvalof{transistors/gate thickness}\pgflinewidth}%
\pgfpathmoveto{\pgfpoint{\x{gate}}{\y{gate}}}\pgfpathlineto{\pgfpoint{\x{gate}}{-\y{gate}}}\pgfusepath{draw}\endpgfscope
% the arrow on the source lead
\pgfscope\pgfslopedattimetrue\pgfallowupsidedownattimetrue\pgfresetnontranslationattimefalse
\ifnum\ctikzvalof{tripoles/#2/curr direction}>0
\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpoint{\x{gate}}{-\y{gate}}}{\pgfpoint{0pt}{-\y{gate}}}%
\else\pgftransformlineattime{\ctikzvalof{tripoles/#2/arrow pos}}{\pgfpoint{0pt}{\y{gate}}}{\pgfpoint{\x{gate}}{\y{gate}}}\fi
\pgfnode{currarrow}{center}{}{}{\pgfusepath{stroke}}\endpgfscope}}}`;

/** Each shape's declaration, by the shape's name (its circuitikz key). */
const CIRCUIT_SHAPES = { munmos: '\\spectrummumos{munmos}{nmos}', mupmos: '\\spectrummumos{mupmos}{pmos}' };

/** The lines that declare the shapes these circuitikz keys (nmos, munmos, …) use, for a picture or a preamble; none when they use none. */
export function shapeDefinitions(keys) {
  const used = Object.keys(CIRCUIT_SHAPES).filter((shape) => keys.some((key) => key.split(',')[0].trim() === shape));
  return used.length ? ['\\makeatletter', MU_MOS, used.map((shape) => CIRCUIT_SHAPES[shape]).join(''), '\\makeatother'] : [];
}
