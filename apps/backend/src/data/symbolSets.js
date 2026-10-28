// The diagram composer's symbol sets: what each loads, and the TeX of Spectrum's own symbols. symbolService draws the
// palette's pictures from it and the frontend's circuit code writes the same definitions into a figure, so the TeX lives
// here once. The frontend adds each set's label, categories, clashes and symbol list (diagram/sets.ts).
//
// Spectrum's own sets (spx-…) are plain TikZ from the core libraries, as \pic definitions named spx/<set>/<symbol>, so
// they never replace a package's own key (an unprefixed ground or spring style would replace circuitikz's). A pic marks
// each point wires attach to with \coordinate (-<pin>), which a picture names <pic name>-<pin>. Bump a set's version
// whenever its TeX changes: it is part of the symbol cache's key.

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
  }
};

/** The line that defines a set's pic, for a figure's picture or the palette's preamble. */
export const picDefinition = (key, body) => `\\tikzset{${key}/.pic={${body}}}`;

/** The set a pic key belongs to, or undefined. */
export const setOfPic = (key) => Object.keys(SYMBOL_SETS).find((id) => key in SYMBOL_SETS[id].pics);
