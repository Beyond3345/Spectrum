## 10d. Diagram composer: categories, new composers and mixing symbol sets

> **Decisions taken on 29 October 2026.** These were decided with the user after this section was written. Where the text below recommends or assumes something else, these decisions win. Every other open question in this section takes its recommended default.
>
> - **Five** top-level categories from the start: Engineering, Physics, Mathematics, Computing and Others.
> - This round includes everything in section 3.2 (v1) and the foundations in 3.1, **plus Structures**, which the user asked for (see [structures.md](structures.md)); it moves out of the backlog. Mohr's circle is the first Form preset.
> - “Symbols from other packages” is off by default.
> - A figure whose packages clash can be inserted as a PDF image.
> - The new flowchart shapes also write fletcher where fletcher has them; the others are hidden in Typst documents.
> - No chemfig editor. Chemistry stays with energy levels and lattices in the backlog.
> - After this round the Mechanics and physics sets come first.

This is research only. Nothing in the repository was changed. The section draws on three sources:

- seven surveys of tikz.net, each checked by a second pass;
- a review of how other diagram tools organise their symbols;
- a TeX package survey with compile tests in TeX Live 2026 (TL2026) and in Tectonic 0.17, whose default bundle is TeX Live 2022.

A critique then checked the first draft against the code. Its findings are applied here.

tikz.net code is CC BY-SA 4.0. This section therefore describes what the figures show and names only packages, libraries and short identifiers.

### Summary

- **What tikz.net holds.** It has 552 posts: Physics 339, Mathematics 169, Engineering 75, Computing 34, Music 10, Chemistry 8, Art 6, Optical illusions 5, Biology 3 and Social science 3. One post in five sits under two or more top-level categories, and Mathematics and Physics share 47.
- **What the figures are made of.** Most are plain TikZ built from a small set of shapes: blocks, hatched ground, arrows, angle arcs, charges and field markers. Few need a package beyond circuitikz and pgfplots. The common extras are tikz-3dplot (60 of 169 maths posts, 46 of them by one author) and packages used only in labels (physics, contour).
- **Where the value is.** It sits in three existing canvases and one new form frame.
  - The circuit canvas becomes the **symbol canvas**. It has pins, parts on wires, snapping and symbols drawn by TeX, so it takes every symbol-on-wires drawing: circuits, block diagrams, mass-spring-damper systems and, later, mechanics, Feynman diagrams, Structures and optics.
  - The plain TikZ canvas (React Flow), here called the **flowchart canvas**, takes box-and-link drawings: flowcharts, state machines, model architectures and, later, trees and graphs.
  - The pgfplots form takes plots and their presets.
  - One new **Form** mode holds every composer whose drawing Spectrum computes from inputs. Mohr's circle and Venn diagrams come first.

  That means one new mode, Form, plus the Structures mode already planned.
- **Categories.** Use your four: Engineering, Physics, Mathematics and Others. Computing is a group inside Others until it has two composers of its own.
- **The chooser.** A gallery of starters grouped by category, with search and a “Recently used” list. Each starter appears once in “All”, under its home group, and again in every category it is cross-listed in.
- **Mixing symbols.** Every symbol set declares its packages, libraries and known clashes. A starter's own sets are always on. The setting “Symbols from other packages” adds a button for adding more, and a drawing keeps its list of sets in its comment line. On export, Spectrum:
  - writes definitions inside the picture;
  - puts libraries in the main preamble, merged without duplicates;
  - checks the project's preamble against a short table of clashes where a package Spectrum writes meets one the user loads.

  A figure that clashes can go in as a PDF with `\includegraphics`, so its packages never reach the document.

### 1. Taxonomy

#### 1.1 Three terms

| Term | What it is | Cost to add |
|---|---|---|
| Mode | Code that edits one kind of model and writes it: today's `DiagramMode` (circuitikz, pgfplots, tikz, tikz-cd, mermaid, fletcher), plus the new Form mode. | High. Add few. |
| Symbol set | Data: a named palette of symbols, with the packages and libraries they need. Used on the symbol canvas. | Low to medium. |
| Starter | A card in the chooser. It names a mode, an optional Form preset, the sets to open, an optional template, a title, a blurb, search aliases and one or more categories. | Low. Add many. |

The categories classify starters, not modes. For example, a “Mass, spring and damper” starter sits under both Engineering and Physics. Both open the circuit canvas with the Mechanical group and the `spx/mech` supports showing.

#### 1.2 Top level

| Category | Evidence |
|---|---|
| Engineering | 75 posts. Electrical has 58 of them, and about half of those are circuitikz. Mechanical has 12. tikz.net has no control-engineering posts, but control is a staple of engineering courses, so the control examples came from texample.net. |
| Physics | 339 posts, the largest category. |
| Mathematics | 169 posts. |
| Others | Holds the groups Computing, Flowcharts and block diagrams, Planning, Charts, Images, and Chemistry and life sciences. |

Computing has 34 posts. Its most common figure is the neural network, with 13 posts tagged. In v1 its starters (State machine and Model architecture) are shapes on the flowchart canvas, so it has no composer of its own. It fails the rule from the tool review: add a top-level heading only once a domain has two composers. Question 1 asks whether to split it out later.

draw.io files Electrical under “Other”, where it is hard to find. Here, search, “Recently used” and the group headings inside Others keep flowcharts visible.

Art, optical illusions and music get no composer. Music on tikz.net is 9 acoustics posts plus one chart.

#### 1.3 Existing and planned modes

| Mode | Role after this plan | Home | Also listed under |
|---|---|---|---|
| circuitikz | The symbol canvas. The catalogue becomes its first set. | Engineering › Electrical and electronics | Engineering › Digital (Logic schematic), Signals and control (Block diagram), Mechanical and structures (Mass, spring and damper); Physics › Electromagnetism (Circuit), Mechanics and fluids (Mass, spring and damper) |
| pgfplots | Plots and presets | Mathematics › Plots and analysis | Mathematics › Statistics and probability; Engineering › Signals and control; the Physics groups |
| Plain TikZ | The flowchart canvas | Others › Flowcharts and block diagrams | Others › Computing (State machine, Model architecture); later Mathematics › Discrete maths (Tree, Graph) |
| tikz-cd | Unchanged | Mathematics › Algebra and category theory | none |
| Mermaid | Unchanged | Others › Flowcharts and block diagrams | Others › Computing (Sequence diagram), Planning (Gantt template) |
| fletcher (Typst) | Uses the flowchart canvas, showing only the tools fletcher can write | Others › Flowcharts and block diagrams | Others › Computing (State machine in Typst; self-loops verified in fletcher 0.5.8) |
| Form (new) | One frame and live preview. Each preset supplies its own fields and `toCode`. | Per preset | Per preset |
| Structures (planned) | Should reuse the symbol canvas engine, with an `spx/struct` set and the stiffness solver | Engineering › Mechanical and structures | Physics › Mechanics and fluids |

The planned Mohr's circle mode becomes the first Form preset.

#### 1.4 Second level

The chooser shows only starters that exist. “Later” items are in the backlog in section 3.

| Category | Group | v1 starters | Later starters |
|---|---|---|---|
| Engineering | Electrical and electronics | Circuit; Circuit templates | Phasor diagram (also Physics and Mathematics) |
| | Digital and computer architecture | Logic schematic; State machine (home: Others › Computing) | Timing diagram; Karnaugh map; Bit field |
| | Signals and control | Block diagram; Signal sketch | Frequency response |
| | Mechanical and structures | Mohr's circle; Mass, spring and damper | Structures; Free-body diagram (home: Physics) |
| Physics | Mechanics and fluids | Mass, spring and damper (home: Engineering) | Free-body diagram; Pulleys and ropes; Pendulum; Vectors and frames (also Mathematics); Projectile and circular motion; Fluids apparatus; Mechanisms |
| | Waves and acoustics | none | Wave plots; Standing waves; Wavefronts |
| | Thermodynamics | none | Thermodynamic cycle; Heat-engine schematic (template) |
| | Electromagnetism | Circuit (home: Engineering) | Field lines; Charges and fields |
| | Optics | none | Optical bench; Ray diagram |
| | Astronomy and relativity | none | Orbits; Spacetime diagram; Penrose diagram (template) |
| | Quantum, particle and solid state | none | Feynman diagram; Energy levels; Bloch sphere; Crystal lattice; Quantum circuit (home: Others › Computing) |
| Mathematics | Plots and analysis | Plot; Vector and slope field | 3D surface |
| | Statistics and probability | Venn diagram | Distribution; Probability tree |
| | Geometry | none | Vectors and Argand diagram; Geometry construction; Complex-plane contours; 3D figure |
| | Algebra and category theory | Commutative diagram | Weight diagrams (template) |
| | Discrete maths | none | Tree; Graph; Hasse diagram |
| Others | Computing | State machine; Model architecture; Sequence diagram (Mermaid) | Neural network; Tree and Graph (home: Mathematics); Bit field; Quantum circuit |
| | Flowcharts and block diagrams | Flowchart (TikZ); Flowchart (Typst); Mermaid diagram | Petri net; Entity-relationship diagram |
| | Planning | Gantt chart (Mermaid template) | Gantt chart (pgfgantt form); Timeline |
| | Charts | Venn diagram (home: Mathematics) | Mind map; Cycle and pie (template); Sankey |
| | Images | none | Annotated image |
| | Chemistry and life sciences | none | Energy levels (home: Physics); Cladogram; Crystal lattice and molecule; Pedigree |

Physics has no starter of its own in v1. Its large families (mechanics, fields, optics) need the full Mechanics set or computed modes, which sit in the backlog. Question 4 asks whether they should come first.

#### 1.5 How this fits the current code

| File | Change |
|---|---|
| `diagram/types.ts` | `DiagramFile` gains `sets?: string[]`. A new mode id, `form`. |
| `diagram/fileFormat.ts` | Write `version: 2` only when a drawing uses sets or a part kind that older builds do not know. `readDiagramFile` accepts only version 1 (line 74), so an older build opens such a file as code instead of regenerating and saving it with parts missing. Existing files stay version 1. |
| `diagram/starters.ts` (new) | The starter list as data: `{ id, mode, preset?, title, blurb, categories, aliases, sets?, template? }`. |
| `diagram/sets/` (new) | One file per symbol set: its metadata and its prefixed pic definitions. |
| `modes/circuitikz/catalogue.json` | Keep the 11 existing groups. Add Mechanical and Blocks, and the new parts in their existing groups. |
| `modes/circuitikz/code.ts` | Write every style key explicitly, defaults included. Add arrowheads on wires. Take packages and libraries from the sets in use. |
| `backend/src/services/symbolService.js` | Today it runs pdflatex only, with a fixed circuitikz preamble. Add a preamble per set, anchors read from `\pic` coordinates, and a run with the bundled Tectonic when no pdflatex exists, keeping the log so the `\typeout` pins can be read. Key the disk cache by engine, package file date and set version. |
| `modes/tikz`, `modes/fletcher` | A tool list per mode that the rail filters. `fletcher.check.ts` covers each new kind. |
| `diagram/ComposerApp.tsx` | `Chooser` becomes the gallery. Add a `tool` URL parameter, because the tool is local state in `Editor` today (line 321). On save, compare `loadsOf` of the old and new code (section 4.4, rule 7). |
| `editor/preamble.ts`, `editor/tools/FloatsTab.tsx` | Filter the never-write list at Insert. Check the project preamble against the clash table at Insert and on figure save. Add the image route for “Insert as image”. |
| `app/settings.ts` | `composerRecent` and `composerFavourites`. Settings live in `localStorage`, which persists in the Tauri webview. Add the keys to `SHARED_KEYS` only if they should follow the user to other computers through the settings repository on GitHub. |

### 2. Chooser and palette

#### 2.1 The chooser (“Draw a diagram”)

- **Left rail.** “Recently used”, “Favourites” and “All”, then Engineering, Physics, Mathematics and Others. It opens on “Recently used” when that has entries, otherwise on “All”. In “All”, each starter appears once, under its home group. In a category view it also appears under every group it is cross-listed in.
- **Search.** A field above the grid, with the placeholder “Search diagrams and symbols”. It matches:
  - starter titles;
  - aliases such as FBD, Bode, truss, DFA, Gantt, Feynman, Argand and MOSFET;
  - group names;
  - package names (“circuitikz” finds every circuitikz starter);
  - symbol names in every set.

  Symbol matches are listed under “Symbols” as, for example, “Resistor, in Circuit”. Choosing one creates that starter with the symbol's tool selected, through the new `tool` URL parameter.
- **Cards.** Each card shows:
  - an icon;
  - the title and a one-line blurb;
  - a language badge: “TikZ”, “Typst” or “Mermaid”;
  - the packages it uses, in small text, such as “circuitikz” or “Spectrum symbols”;
  - a star button labelled “Add to favourites” or “Remove from favourites”.
- **Fit to the document.** Cards the open document can use come first. The rest are greyed, with the reason “Needs a LaTeX document” or “Needs a Typst document”. Nothing Spectrum writes needs LuaLaTeX or a package missing from Tectonic (section 4.4), so no other reason is needed.
- **What it replaces.** Today's three cards (TikZ, Typst and Mermaid) become the language badges. The TikZ package radio list is replaced by the grid. The name field and “Create” stay as they are.
- **Icons.** v1 uses the mode icons. Thumbnails come later, from a script run by hand that compiles each starter's template and commits the SVGs. No tikz.net image is used.
- **Storage.** “Recently used” keeps the last eight starters created, and favourites keep the starred ones, both in Spectrum's settings.
- **Keyboard.** Typing goes to search, the arrow keys move between cards and Return creates the diagram.

#### 2.2 Inside the composer

- **No mode switcher.** A drawing keeps its mode, because its file format depends on it. The window title shows the starter name and its category.
- **Palette.** The circuit catalogue keeps its 11 groups and adds Mechanical and Blocks. Each group can be collapsed. A “Filter symbols” field sits above the groups and filters the palette; it never opens a new drawing.
- **Pinned group.** “In this drawing” sits at the top. Symbol favourites come later.
- **Variants.** Variants live in the inspector, not as extra tiles. Examples are resistor style, support type and accepting state. CircuiTikZ-Designer works the same way.
- **Templates.** The rail gains a “Templates” item for modes that have templates. It drops editable parts onto the canvas.
- **Symbol sets.** When the setting is on, a “Symbol sets…” button at the foot of the palette opens the per-drawing dialog in section 4.2. Each added set appears as its own palette section, headed by the set's name and package.
- **Without an installed TeX.** Until the Tectonic route in `symbolService` lands, the palette shows “Symbol pictures need an installed TeX for now” in place of the images.

| Place | Proposed wording |
|---|---|
| Window title | “Draw a diagram” |
| Search placeholder | “Search diagrams and symbols” |
| Rail | “Recently used”, “Favourites”, “All” |
| Star button | “Add to favourites” / “Remove from favourites” |
| Greyed card reason | “Needs a LaTeX document”, “Needs a Typst document” |
| Palette | “Filter symbols”, “In this drawing”, “Templates”, “Symbol sets…” |
| Empty search | “No diagram or symbol matches ‘{text}’” |

### 3. New composers and symbol libraries

**Effort.** S is up to a week, M is one to three weeks and L is more than three weeks, for one developer, including the check files.

**Value.** Value is judged by use in teaching and papers, not by tikz.net post counts, which a few authors skew:

- three authors wrote 124 of the 169 Mathematics posts;
- one author wrote 46 of the 60 posts that use tikz-3dplot;
- one lecture course supplies most of the mechanics and electromagnetism posts.

#### 3.1 Foundations (v1)

| Item | What it is | Effort |
|---|---|---|
| F1 Starters and chooser | Section 2 | M |
| F2 Symbol sets | The catalogue becomes the first set. Sets as data, the setting and the per-drawing dialog, the generalised `symbolService` (per-set preamble, `\pic` anchors, Tectonic run, versioned cache key), the export rules, the clash checks and “Insert as image” (section 4). | M to L |
| F3 Flowchart canvas | Titled containers, self-loops and bend pairs, text that wraps to a set width, and a tool list per mode so fletcher shows only what `fletcher/code.ts` can write. | M |

#### 3.2 v1

| Item | Canvas or mode | Contents | Spectrum computes | Export | Effort, value | tikz.net coverage |
|---|---|---|---|---|---|---|
| Circuit catalogue | Symbol canvas | Verified under the bundle's circuitikz 1.4.6: rmeterwa, oscope, njfet, pjfet, nigbt, pigbt, thyristor, triac, pvsource, pvmodule, sdcdc; Mechanical group with spring, damper, mass, inerter and viscoe. To confirm under 1.4.6: cspst, ospst, rmeter, ocirc, crossings, centre-tapped transformer, curved capacitor, xnor port, sdcac, elmech and `f=` flow arrows. Also resistor-style and voltage-style picture keys. | Nothing | circuitikz. Style as picture keys and `\ctikzset`, every key written. | S, high | About half of the 58 Electric Engineering posts, the circuits tag and mechanical-systems |
| Blocks group | Symbol canvas | amp, lowpass, highpass, bandpass, adc, dsp and twoport (with text) as two-terminal parts on wires; adder, mixer, oscillator and antennas as nodes; arrowheads on wires. Take-off points are the existing junction dots, and the signs at an adder's inputs are labels. | Nothing | circuitikz. The shape forms are verified under 1.4.6; the `to[…]` forms are to confirm. | S to M, high | The RF front-end post and Signal processing. The control examples are from texample.net, because tikz.net has none. |
| `spx/mech` supports | Symbol canvas | Hatched wall, ground and ceiling, and a cart on wheels, as prefixed pics. This is the first Spectrum set and the v1 case of mixing packages. | Nothing | Plain TikZ with the core patterns library | S, high | mechanical-systems, dynamics_spring |
| Circuit templates | Symbol canvas | Op-amp: inverting, non-inverting, follower, summing, integrator, differentiator, difference. Rectifiers: half-wave, centre-tap and bridge, with optional smoothing. A transistor stage and its small-signal model. 555 astable and monostable. Buck, boost and buck-boost. An RC ladder with n stages. | Optional labels: gain, 555 frequency, M(D) | circuitikz | S, high | 13 analogue posts and 5 converter posts |
| Plot upgrade | pgfplots | Box or centred axes, symbolic ticks, log axes, and parametric, polar, piecewise and stem series. Annotations: point with drop lines, tangent, secant, reference line, shaded area, label on a curve. A quiver series. A “Signal sketch” preset: sine, square, triangle, sawtooth, pulse train, rectified sine and step on a sketch axis. | Nothing in JavaScript. TeX does it with `declare function`, a central difference written in pgfmath and the intersections library. | pgfplots. Its libraries are written as `pgfplots.<name>` TikZ libraries. | M, high | About 23 analysis plots, about 26 physics sketch graphs and the signal plots |
| Flowchart shapes | Flowchart canvas | Automata: state, accepting, initial, self-loops and bend pairs. Flowchart: cylinder, document, trapezium. Model architecture: operator circle, vector stack, ×N container. | Self-loop side, bends for opposite pairs, container bounds | tikz with the core automata, shapes.geometric and fit libraries | S, high | The state-machine posts, the ML architecture posts and the flowcharts tag |
| Form mode with Mohr's circle | Form | σx, σy, τxy, rotation φ and the sign convention | Centre, R, principal stresses, θp, τmax and the rotated state | Plain TikZ | M (frame and first preset), high | mohrs-circle |
| Venn diagram | Form preset | 2 or 3 sets, regions ticked to shade, counts per region | Each region's boundary as arcs, written as one `\fill` per region | Plain TikZ | S, high | sets, geometric-bayes and the region-grid posts |

v1 comes to about 14 to 18 weeks for one developer. If it has to be shorter, Venn and the circuit templates can move to the backlog without blocking anything else.

#### 3.3 Backlog

The backlog is unordered. Each item waits for a user to ask (question 4).

| Item | Canvas or mode | Contents and computation | Export | Effort, value | tikz.net coverage |
|---|---|---|---|---|---|
| Structures (planned) | Symbol canvas engine | Nodes, members, supports at any angle, hinges, loads, EI and EA. A stiffness solver gives reactions, the N, V and M diagrams and the deflected shape. | Plain TikZ with `spx/struct` pics | L, high | frame-example and clebsh-example (both stanli), mechanics_stress |
| Mechanics set (`spx/mech`) | Symbol canvas | Block, ball, incline, pulley and mount, rope, pendulum, vectors with dashed components, angle arc, right-angle mark, rotated axes, into-page and out-of-page markers, rotation arrow, dimension line and a “Forces” layer toggle. Later, kinematic pairs: revolute, prismatic, frame pivot, link and slider. Needs free vectors anchored to points, rotation and parametric parts on the canvas. | Plain TikZ pics with the core libraries | L (incline snapping and rope tangents), high | Physics › Mechanics (81 posts), Kinematics, the fluids posts and Mechanical Engineering |
| Circuit annotation layer | Symbol canvas | Kirchhoff loop arrows, +/− marks, a voltage arrow between any two points, a shaded or dashed box round a sub-circuit | Nothing | Plain TikZ inside the circuitikz picture | M, high | About 25 teaching-circuit posts |
| Per-part colour | Symbol canvas | A colour per part and per current arrow | Nothing | Inline colours | S to M, medium | The PHY111 circuits |
| Logic upgrade | Symbol canvas | IEEE ports with n inputs, negated inputs, D, JK, SR and T flip-flops, muxdemux presets | Pin positions per variant, rendered through the cache | circuitikz | M, medium to high | Moore, Mealy, Vending machine, ARM CPU (55 muxdemux uses) |
| Plot presets | pgfplots | Distributions: normal first (S), then t, χ², F, binomial and Poisson (M, which need incomplete beta and gamma functions in JavaScript). Bode, pole-zero and Nyquist plots from H(s). Stacked x-t, v-t and a-t graphs. RC, RL and RLC responses, resonance, Planck, Fermi-Dirac and Maxwell curves, stress-strain curve, P-V and T-S cycles. S each: box plot, histogram, scatter with a regression line, HEP stacked histograms with a ratio panel, device curves with a load line, B–H hysteresis, constellation and eye diagrams, PWM carrier comparison, filter tolerance mask, cobweb plots, number lines, Smith and polar charts. | Quantiles, \|H(jω)\| and unwrapped phase, roots, process curves, work and efficiency | pgfplots with groupplots, polar and smithchart. Never bodeplot or bodegraph. | M overall, high | Statistics, Fourier, resonance, the P-V posts, black body |
| Phasor and vectors | Form preset | Phasors (magnitude and angle, or a + jb), an RLC preset, the power triangle, three-phase, Argand diagrams and 2D vectors | Z, φ, components, P, Q and S, line voltages | Plain TikZ. Shares geometry code with Mohr's circle. | M, high | The phasors tag, complex, vectors, vector_sum, polar_1 |
| Trees and graphs | Flowchart canvas | Layouts in JavaScript written as coordinates: tidy tree, radial (for mind maps), circle, layered and force-directed. Probability trees check that each node's branches sum to 1 and give the leaf products. Cladograms go here; pedigrees do not, because a child has two parents. | Layouts and leaf probabilities | Plain TikZ. No forest and no graphdrawing. | M, high | The trees tag (12 posts), graph-isomorphism, quadrilaterals |
| Timing diagram | Form preset | Rows (clock, bit, bus) against cycles: 0, 1, X, Z or a bus label | The clock waveform | tikz-timing 0.7f (in the bundle) | M, high | The FIR waveforms. No tikz.net post uses tikz-timing. |
| Neural network | Form preset | Layer sizes, label patterns, a connection pattern per gap, dropout and seed, MADE masks | Coordinates, edge lists, masks | Plain TikZ | M, high | The neural-networks tag (13 posts) |
| Gantt chart | Form preset | Its own model of tasks, groups, milestones and links. The Mermaid mode has only a template string to start from. | Date-to-slot conversion | pgfgantt 5.0 (in the bundle) | M, high | None (the tag is empty). Thesis and grant proposals need it. |
| Feynman diagram | Symbol set and templates | Vertices, blobs, regulator crosses, fermion, scalar, ghost, photon, gluon and graviton lines as parts on wires, momentum arrows, topology templates and sums of diagrams | Arcs and arrow placement | Plain TikZ styles inside the picture, with explicit coordinates | M, high | The Feynman tag (19 posts), QFT and particle physics |
| Energy levels | Form preset | A table of levels or a formula (hydrogen-like, oscillator, rotor, well), transitions, an optional potential curve. Presets for nuclear decay schemes, reaction energy profiles and MO diagrams. | Level energies, ΔE and λ labels, turning points | Plain TikZ | M, medium to high (most evidence is from outside tikz.net) | blackbody_oscillators, molecules_vibrations, spin |
| Field lines | Symbol canvas with charges | Point and line charges, lines traced by RK4 with mid-arrows. Then equipotentials and image charges. | Field lines and equipotentials | Plain TikZ coordinates. No portable TeX route exists: gnuplot and PSTricks need shell escape, and pgfplots' contour lua needs LuaLaTeX. | M for the first slice, high | 68 electrodynamics posts, 29 tagged field lines |
| Optical bench set | Symbol canvas | Laser, lamp, lens, mirror, beam splitter, slits, grating, polariser, wave plate, detector, screen and prism, with beams as wires | Nothing | Plain TikZ pics | M, high | 33 optics posts; setup figures in experimental papers |
| Petri net and ER shapes | Flowchart canvas | Places, tokens and transitions; entities, relationships and attributes | Nothing | The core petri and er libraries (both compiled in TL2026; both in the bundle) | S, medium | None on tikz.net. Mermaid has no ER template. |
| Mapping diagram | Venn preset | Domain and codomain ovals with arrows between elements | Positions | Plain TikZ | S, medium | sets |
| Expression evaluator | Shared | A JavaScript parser that follows pgfmath: `^` groups from the left (2^3^2 = 64), −2^2 = −4, `mod` is a function only, about five significant digits | Values that match the curve TeX draws | Not applicable | S | Needed only when a preset must compute such values |

#### 3.4 Later, templates only, and not worth it

**Later (each waits for a user to ask):**

- A ray tracer (L): one Snell, reflection and total-internal-reflection tracer over segments and arcs, plus an ideal thin lens.
- An electromagnetism sketch set (M).
- A 3D figure mode (L), using the perspective library's `3d view`. Bloch sphere and spin presets come first, as a form (M).
- A geometry construction canvas (L, a subset first) and complex-plane contours (M).
- A grid editor (M) for convolution, heatmaps, bit fields, Karnaugh maps and later quantum circuits through yquant.
- Annotated images (M).
- Timelines, spacetime diagrams, orbits, wave and acoustics pics, pgfplots 3D surfaces and a lattice generator (M each).
- A DSP structure generator (M).
- A PLC ladder (S; not tested alongside circuitikz).
- Sankey diagrams, proof trees, power-system single-line diagrams, pedigrees (genealogytree or a graph layout) and a circuit drawn above a plot.

**Templates only:** Standard Model particle chart, SU(3) weight diagrams, Penrose and Kruskal diagrams, heat-engine schematic, cycle and pie charts, parallel unit scales, rotary encoder, space-vector modulation hexagon, and atom and hadron models.

**Not worth it:**

- Physics apparatus art, engines and the right-hand-rule hand.
- Pseudo-3D rotating solids beyond four basic shapes.
- Polyhedra beyond the cube, the cuboid and a plane cross-section.
- The HEP detector pack: one author and a narrow audience.
- String worldsheets.
- Art, illusions and music.
- Logos, which need font packages and are unofficial.

**Left elsewhere:**

- Sequence diagrams stay in Mermaid.
- Symbolic block reduction (Mason's rule) is dropped. Numeric frequency response replaces it.
- Spectrum computes coordinates itself instead of depending on tkz-euclide, tkz-elements, tikz-3dplot, graphdrawing or forest.

### 4. Combining symbols from different packages

#### 4.1 A symbol set as data

```ts
interface SymbolSet {
  id: string;                 // 'circuitikz', 'spx-mech', 'spx-feyn'
  version: number;            // part of the symbol cache key
  label: string;              // “Mechanics (Spectrum)”
  categories: string[];       // ['physics/mechanics', 'engineering/mechanical']
  packages: string[];         // bare names, never options
  libraries: string[];        // TikZ names; pgfplots ones as 'pgfplots.<name>'
  clashes?: string[];         // keys into the clash table
  symbols: { id: string; label: string; group: string; aliases?: string[]; code: string; anchors: string[]; def?: string; parametric?: boolean }[];
}
```

There are two kinds of set:

- **Spectrum's own sets** (`spx/`) are plain TikZ using core libraries only. They load no package. A package in the user's preamble can still break them by redefining a generic key; kinematikz's global `ground` style is one example. So pic code uses no generic style names, and the reference test runs with ngerman babel.
- **Package sets** (circuitikz today) are where most clashes happen.

Flowchart-canvas shapes are not sets. They are tools in that canvas's rail, filtered by the tool list for each mode.

#### 4.2 Where the user chooses

- **A starter's own sets are always on.** “Block diagram” opens circuitikz with its Blocks group. “Mass, spring and damper” opens circuitikz with `spx/mech`. The setting never blocks a starter.
- **Settings › “Diagram composer” › “Symbols from other packages”.** This is the setting you asked for. It is off by default, following draw.io's advice to enable only what a drawing needs. When it is on, the palette shows the “Symbol sets…” button for adding more sets.
- **The “Symbol sets…” dialog.** Rows are grouped by category. Each row shows the set's name, the packages and libraries it adds, and a status: “Ready”, or “Clashes with {package} in your preamble”. Tick sets and choose “Use these sets”. The list is saved in the drawing's comment line, so it travels with checkpoints and GitHub. Order does not matter, because names are prefixed and no set needs a library in a set order.
- **Which canvases take sets.** Only the symbol canvas. pgfplots, tikz-cd and the Form presets do not. An axis or a tikz-cd diagram can sit inside a node, but they are clearer as separate figures. Mermaid and Typst content cannot mix with TikZ.

#### 4.3 How symbols render on the canvas

- **Fixed symbols.** These use the existing render-once route, generalised. The backend compiles one page per symbol, with the set's preamble and the drawing's style. Each `spx/` pic defines named coordinates (`\coordinate (-p)`) and is placed as `\pic (id) {…}`, so `\spectrumifanchor` reads `id-p` the same way it reads circuitikz anchors. The engine is pdflatex, or the bundled Tectonic when no pdflatex exists. The result is cached in memory and on disk, keyed by engine, package file date and set version, so a TeX update or a changed pic redraws it.
- **Parametric symbols.** An incline at an angle, a spring between two points, a rope round pulleys or a pendulum cannot be cached per value. The canvas draws an approximation in TypeScript, as it already does for voltage arrows. The compiled preview is exact.
- **Palette icons.** Each icon is the cached image, with the label shown until the image arrives.

#### 4.4 Export rules

All of these were verified by compile tests unless marked otherwise.

1. **Packages are bare names, and every style key is written.** `loadsOf` already strips options when hoisting, so two figures cannot cause an option clash. The real risk is drift: the user's own `\usepackage[RPvoltages]{circuitikz}` or `\ctikzset` changes the figure in the PDF but not in the preview. So the writer puts every style key in the picture, defaults included (voltage direction, inductor style, resistor style).
2. **Definitions go inside the picture,** and only for the symbols the drawing uses. That covers `\tikzset`, `\ctikzset`, pic definitions, `\pgfplotsset` and colours. A `\tikzset` in the figure's own preamble is lost through `\includestandalone`. `\includestandalone` groups the figure, so nothing defined in the body leaks into the document.
3. **Libraries go in the main preamble.** A library loaded inside a picture works for the first figure in a document and fails for the second. pgfplots libraries are written as TikZ libraries, `\usetikzlibrary{pgfplots.fillbetween}`, so they travel through the existing `libraries` list (checked in the figure and in the main document with pdfLaTeX).
4. **Merge without duplicates.** Packages and libraries are merged by name. Repeated loads are harmless. The order stays packages first, then libraries, as `addLibraries` writes them today. Spectrum never writes a library that must come before a package, such as `circuits.ee.IEC`.
5. **babel.** Every TikZ mode adds the `babel` TikZ library unconditionally. Without it, tikz-cd, circuitikz and angle labels in the quotes syntax fail under french, ngerman, spanish and turkish. It is harmless when babel is not loaded and makes tikz-cd labels compile under ngerman (checked with pdfLaTeX). The file is in the Tectonic bundle.
6. **Prefix every Spectrum name** as `spx/<set>/<symbol>`. Unprefixed `spring` and `ground` styles silently replace circuitikz's own.
7. **Writers add a package or library only when a feature that needs it is used.** `openDiagram` regenerates code on open, but `ensurePackages` runs only at Insert. A writer that starts emitting a new load for an old drawing would break the main document at its next compile. So on save, Spectrum compares `loadsOf` of the old and new code. If a load is new and the figure is already in a document, it runs `ensurePackages` for that document, or warns.
8. **Never write these, and filter them at Insert** (with a warning), including lines added by hand in the Code tab:
   - physics, mathabx, bbold, sansmath, fontspec, and preview with the active option;
   - contour (use a white-filled label node instead);
   - the graphdrawing and tikz-ext libraries, hobby, xfp, listofitems and tikz-3dplot;
   - the deprecated snakes and arrows libraries;
   - stanli, structmech, kinematikz, bodegraph and bodeplot.
9. **File version 2 only when needed,** as described in section 1.5.

#### 4.5 Clash warnings

The table lists only pairs where a package Spectrum writes meets one the user loads. Spectrum writes circuitikz, siunitx, pgfplots, tikz-cd and amssymb today, and later tikz-timing, pgfgantt and yquant. Pairs the user loads on both sides are left out, because the user's own compile already reports them.

| Project preamble loads | Spectrum writes | Effect | Message | Offer |
|---|---|---|---|---|
| stanli | circuitikz | Springs draw as plain lines (silent) | “Springs draw wrongly when stanli is loaded.” | “Insert as image” |
| kinematikz | circuitikz | The ground symbol draws as hatching (silent) | “kinematikz changes circuitikz’s ground symbol.” | “Insert as image” |
| The circuits.ee.IEC library, loaded after circuitikz | circuitikz | Resistors and 12 other parts draw wrongly (silent) | “The circuits.ee.IEC library changes circuitikz’s parts.” | Load that library before circuitikz, or “Insert as image” |
| quantikz | tikz-cd | Every tikz-cd diagram is restyled (silent) | “quantikz restyles every tikz-cd diagram, this one included.” | “Insert as image” |
| chronology | siunitx (added when a circuit value has a unit) | Hard error on `\unit` | “chronology and siunitx cannot load together.” | Write the value without a unit, or “Insert as image” |
| mathabx or bbold | amssymb (added for `\mathbb` and `\mathfrak`) | Possible clash (unverified; check before shipping this row) | “{package} may clash with amssymb.” | “Insert as image” |

The checks run in four places:

- in the “Symbol sets…” dialog, against the project preamble;
- at Insert;
- on figure save, for figures already in a document;
- in the main document's compile errors, by matching known error text to a table row.

The figure preview cannot show these clashes, because it compiles without the project preamble.

#### 4.6 Fallback: insert as an image

When a clash cannot be avoided, the figure card offers “Insert as image”. This reuses the Mermaid route (`figureLatex` in `FloatsTab.tsx`):

- the composer writes `figures/<name>.pdf` from the preview compile on every save, so the PDF never goes stale;
- Insert writes `\includegraphics{figures/<name>.pdf}`, and no packages are added to the preamble.

The figure compiles with its own preamble, so its packages never meet the document's. A TL2026 test of the same idea with `\includestandalone[mode=image]` passed: a figure loading physics went into a document that uses siunitx's `\qty`, and the document compiled.

The cost is that the figure keeps its own fonts and macros, and the PDF must be committed with the project. The route has not been tested in Spectrum's own pipeline.

### 5. Risks, licences and testing

#### 5.1 Risks

| Risk | Mitigation |
|---|---|
| Scope: the list is long | Build v1. The backlog is unordered, and each item waits for a user to ask. |
| tikz.net counts reflect a few authors | Value is ranked by teaching and paper use. |
| Silent clashes produce no error | Prefixed names, the clash table checked against the project preamble, and a render comparison of the known silent pairs, run by hand |
| A writer change breaks figures already in a document | Rule 7: loads only when used, and a load comparison on save |
| An older build drops parts it does not know | File version 2 only when needed |
| New flowchart-canvas tools have no fletcher output | A tool list per mode; `fletcher.check.ts` covers each new kind |
| Tectonic's 2022 bundle is old | The reference compile runs under Tectonic. A symbol that fails there gets a hard-coded “Not in the built-in TeX” flag. |
| Users with only Tectonic get no palette images today | The Tectonic route in F2; a palette message until it lands |
| The user's package options change the PDF but not the preview | Every style key written in the picture |
| Slow previews: a 35 × 35 shaded surface took 4.9 s in Tectonic and 3.0 s in pdfLaTeX | Debounce, a cap on samples, no faded shading |
| A parametric canvas sketch differs from the PDF | The compiled preview is the reference |
| A stale symbol cache | Keyed by engine, package file date and set version |

#### 5.2 Licences

| Source | Licence | Use in Spectrum |
|---|---|---|
| tikz.net examples | CC BY-SA 4.0 | Ideas only: what figures show, with package and identifier names. No code and no images. Janosh Riebesell's ML diagrams are also MIT on GitHub, but Spectrum writes its own anyway. |
| circuitikz, tikz-cd, tikz-timing, pgfgantt, yquant | LPPL (circuitikz is LPPL or GPL) | Loaded by generated code. Symbol images are rendered at run time by the user's TeX and never shipped. |
| pgfplots | GPL 3 or later | Loaded by generated code. |
| stanli, structmech, kinematikz, tikz-network | GPL or LPPL | Not used. Their symbol lists informed scope only. |
| karnaugh-map | CC BY-SA 3.0 | Loading it would be fine; never copy its code. |
| quantikz | CC BY 4.0 | Not used, because it restyles every tikz-cd diagram. |
| tikzphysics | LPPL 1.3c | A reference for the Mechanics set's scope. It had seven releases in seven weeks and is not in the bundle. |

Spectrum's pics are drawn from geometry Spectrum writes itself and stay MIT. No code is ported from any LPPL, GPL or CC BY-SA source.

#### 5.3 Testing

The tests follow `backend/test/diagram.test.js`, which skips when TeX is missing.

- **One reference figure per set.** It contains every symbol and is compiled with pdflatex, and with Tectonic when present. The test checks that:
  - the compile exits cleanly;
  - the log has no error and no “I do not know the key” line;
  - every anchor reads back.
- **One document test.** Two figures that use the same set go into one document through `\includestandalone`, with ngerman babel loaded. This tests library scoping and the babel library.
- **Render comparison by hand.** Only for the known silent pairs (spring and ground).
- **Flowchart canvas.** `fletcher.check.ts` covers each new kind.
- **Computed composers.** Each Form preset and plot preset gets one check file, like the existing `*.check.ts`, with textbook cases:

| Composer | Case | Expected |
|---|---|---|
| Mohr's circle | σx = 50, σy = −10, τxy = 40 MPa | Centre 20, R = 50, σ1 = 70, σ2 = −30, τmax = 50, θp = 26.57° |
| Phasor | Series RLC: R = 10 Ω, XL = 20 Ω, XC = 10 Ω, V = 100 V | Z = 10 + j10 Ω, \|Z\| = 14.14 Ω, φ = 45°, I = 7.07 A, P = 500 W, Q = 500 var, S = 707 VA |
| Structures | Simply supported beam, central load P | Reactions P/2, Mmax = PL/4, midspan deflection PL³/(48EI) |
| Structures | Cantilever with uniform load w | Root moment wL²/2, tip deflection wL⁴/(8EI) |
| Structures | Equilateral truss, 10 kN load at the apex | Inclined members 5.77 kN compression, tie 2.89 kN tension |
| Converter labels | D = 0.5 | Buck 0.5, boost 2, buck-boost −1 |
| Bode | H(s) = 1/(1 + s/ωc) | −3.01 dB and −45° at ωc; −20.04 dB and −84.3° at 10ωc |
| Distribution | Two-sided α = 0.05 | z = 1.95996 |
| Thermodynamic cycle | Otto, r = 8, γ = 1.4 | η = 0.5647 |

#### 5.4 Not verified

- **circuitikz 1.4.6.** cspst, ospst, rmeter, ocirc, crossings, the centre-tapped transformer, the curved capacitor, the xnor port, sdcac, elmech, `f=` flow arrows and the `to[…]` forms of the block shapes. The reference compile under Tectonic settles these.
- **Image fallback.** `\includegraphics` of the figure PDF through Spectrum's own pipeline and under Tectonic.
- **babel library.** Compiled with pdfLaTeX only. The file is in the Tectonic bundle.
- **Typst.** fletcher equivalents for the new flowchart shapes, other than self-loops, and why fletcher 0.5.5 failed.
- **Package pairs.** Whether stanli and circuitikz clash beyond the spring. Whether tikz-ladder clashes with circuitikz. Whether mathabx or bbold clash with amssymb.
- **Other tools.** draw.io and Visio details beyond those cited.
- **Demand.** Demand for PlotNeuralNet-style 3D blocks.
- **Estimates.** Every effort and value rating, and the v1 total, is an estimate.

### 6. Open questions for you

1. **Categories.** This plan uses your four: Engineering, Physics, Mathematics and Others. Should Computing become a fifth category once it has two composers of its own? If so, should Others then be renamed General, so flowcharts are easier to find?
2. **Mixing setting default.** Should “Symbols from other packages” start off, as proposed, or on? A starter's own sets are on either way.
3. **Image fallback.** Is “Insert as image” acceptable for a figure that clashes? It keeps the figure's own fonts, and the PDF must be committed.
4. **Order after v1.** Which should come first: the Mechanics set and Structures (teaching and Physics), or trees, graphs and the Computing forms (papers)?
5. **Typst.** Should the new flowchart shapes also write fletcher where fletcher has them, or stay TikZ only and be hidden in Typst documents?
6. **Chemistry.** Is a chemfig structure editor worth an L effort, or are energy levels and lattices enough?
7. **Quantum circuits.** Use yquant, as proposed, because quantikz restyles every tikz-cd diagram in the document?

#### Notes on the critique

All other findings were applied as written. These were changed or left out:

- **Physics and siunitx row dropped.** Spectrum writes `\SI` (`circuitikz/code.ts` line 117), not `\qty`, and `\SI` still works with physics loaded. siunitx only omits its own `\qty`, so the user's `\qty` keeps the physics meaning. Nothing Spectrum writes breaks.
- **Block diagrams moved, not kept on the flowchart canvas.** circuitikz blocks are two-terminal parts on wires, and the circuit canvas already has junction dots for take-off points. This also keeps symbols drawn by TeX off the canvas that fletcher shares.
- **Feynman diagrams changed from a mode to a set.** This follows from making the circuit canvas the one symbol canvas.
- **Forms kept for some composers.** Trees now use a JavaScript layout on the canvas, as suggested. Neural networks, timing diagrams, Gantt charts, energy levels and Venn diagrams stay forms, because Spectrum computes their drawing from inputs rather than from free placement.
- **“No part is newer than 1.4.6” not taken as proven.** Part of the circuit list is untested under 1.4.6, so the reference compile decides. The availability machinery is still dropped.
- **Circuit annotation layer, field lines and optics bench** went into the unordered backlog rather than v1, to hold v1 near its estimate.
- **SHARED_KEYS** syncs settings to other computers through the settings repository on GitHub. Adding the composer keys is therefore optional.