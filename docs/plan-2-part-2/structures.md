## Structural analysis in the diagram composer: Structures and Mohr's circle

### Goal

The user asked for structural analysis drawings in the composer's TikZ section: beams with forces and moments, shear force and bending moment diagrams, the method of joints, the method of sections and Mohr's circle, drawn from a list of components like the circuit composer. This section designs two composers: **Structures** (beams, trusses and frames on the symbol canvas, with a small solver) and **Mohr's circle** (the first preset of the new Form mode in [composer-categories.md](composer-categories.md)). Both sit under Engineering › Mechanical and structures, and Structures is also listed under Physics › Mechanics and fluids.

### Why Spectrum calculates and writes plain TikZ

The research compared the TikZ packages for structural drawings:

| Package | Version | Licence | In Tectonic's bundle (TeX Live 2022) | What it does |
| --- | --- | --- | --- | --- |
| stanli | 3.0, 2016 | GPL-2.0+ or LPPL 1.3c+ | Yes | Supports, hinges, beams, loads, line loads, dimensions and an outline of internal forces, all from values the user already knows (in drawing centimetres) |
| structmech | 1.2, 2023 | GPL-3.0+ | Only 1.1 (no `\Spring`) | Supports, loads, member end forces and linear or parabolic internal force plots labelled at the ends only |
| structuralanalysis | not a package | n/a | n/a | Survives only as stanli's TikZ key family; it was most likely stanli's earlier name |
| tikz-sections | 0.2.0, 2026 | LPPL 1.3c | No | Steel and concrete cross-sections (for later) |

Neither package calculates anything. They draw symbols from numbers the user supplies. stanli's internal force outline cannot draw the cubic moment curve under a triangular load or label values inside a span. Both define generic global names (`\point`, `\beam`, `\load`, `\support`, `\convention`, `\showvalue`) that clash with other packages. Because `\includestandalone` puts a figure's packages into the main document's preamble, those names would land in the user's thesis. stanli also fails beside tikz-3dplot ("\tdplotsinandcos already defined").

So Spectrum solves the structure itself and writes **plain TikZ**: numeric coordinates, with every symbol defined as a `pic` inside the picture's options. The document needs only `\usepackage{tikz}` and `\usetikzlibrary{arrows.meta,babel}`, which works with pdfLaTeX, XeLaTeX, LuaLaTeX and the built-in Tectonic (a hand-written sample of a beam, its loads, reactions, shear force diagram, bending moment diagram and Mohr's circle compiled with TeX Live 2026 and with Tectonic 0.17). The packages remain the reference for which symbols to offer.

### What the user will see

**Structures.** The chooser's "Structure (beams, trusses, frames)" card opens the symbol canvas with the structures palette:

| Group | Parts |
| --- | --- |
| Members | Beam or frame member; truss bar |
| Joints | Joint; internal hinge; released member end |
| Supports | Pin; roller (at any angle); fixed; guided (slider); spring; rotational spring |
| Loads | Point force; moment (clockwise or anticlockwise); uniform load; linearly varying load (triangular or trapezoidal) |
| Annotations | Dimension (horizontal, vertical or aligned); label; angle arc; axes; section cut |

- Nodes snap to a grid in metres (0.1, 0.25, 0.5 or 1 m) and to other nodes. Members are drawn node to node like wires, and dropping a member's end on another member splits it at a new node. Supports attach to nodes and point loads to nodes or to grid steps along a member. A distributed load has two handles that slide along its member. Everything follows when a node moves.
- The inspector edits each part: a node's name and position; a support's type, angle and stiffness; a member's kind, released ends and relative EI and EA; a load's value, direction (an angle, or down, up, left, right or perpendicular), position and an optional label such as `$P$`.
- The solve runs on every edit. A status line reads “Determinate and stable”, “Indeterminate to degree 2 (relative EI used)” or “Unstable: node C can move”.
- **View** (in the style menu) picks what the figure shows: “Loading diagram”, “Free-body diagram” (supports replaced by labelled reactions), “Free-body diagram with shear and bending moment diagrams” (and the axial force diagram for frames), “Member forces” (trusses: each member labelled with its force and (T) or (C), zero-force members marked), “Joint free-body diagram” (the chosen joint with its member forces, loads and reactions) and “Section free-body diagram” (the part on the chosen side of a cut line, with the cut members' forces and the point to take moments about). A second view of the same model is a duplicate of the file.
- **Units and labels:** kN and m (default), N and mm, kip and ft, or lb and in, with three significant figures by default.
- **Sign conventions:** shear force plotted positive up. Bending moments are drawn on the **tension side** (sagging below) by default, or positive up. The user can change the default for every new drawing in Settings › Composer (decision 8), and each drawing can change its own in the style menu.

**Mohr's circle.** The card opens a form with a live preview: σx, σy and τxy (tension positive), an optional rotation θ, and an optional σz for the three circles of a 3D stress state. The preview draws the axes, the circle, points X and Y with the diameter between them, the centre, σ1, σ2, the maximum shear points and the 2θp arc, with optional stress elements (original, rotated by θ, principal and maximum shear). The convention defaults to **τ positive downward** (Hibbeler and Gere, where 2θ on the circle turns the same way as θ on the element). The other choices are “Clockwise shear plotted above” (Beer and Johnston) and “τ positive upward”. As with bending moments, the default is set in Settings › Composer and each drawing can change it (decision 9).

### How it works

**The solver** (TypeScript in `apps/frontend/src/diagram/modes/structures/solve.ts`, about 300 to 400 lines): a 2D direct-stiffness frame solver with three degrees of freedom per node, frame elements with released ends by static condensation, truss bars, fixed-end forces for point, uniform and linearly varying loads, supports as constrained degrees of freedom (inclined rollers by rotating the node's freedoms), springs on the diagonal and dense Gaussian elimination with partial pivoting. A determinate structure gets its exact equilibrium answer whatever EI is; an indeterminate one uses the relative EI and EA in the inspector (default 1), and the status line says so. A pivot below 10⁻⁹ of the largest diagonal entry reports the structure as unstable, with the node and direction that can move. After each solve an equilibrium residual check runs and results within rounding of zero are written as 0. A 50-node frame solves in well under a millisecond.

**Diagrams:** axial force, shear and moment are exact piecewise polynomials between events (loads and load ends). Extremes are found at piece ends, jumps and the roots of the shear, and each piece is sampled at about 24 points. The diagrams are filled polygons in scopes stacked under the beam on the same horizontal scale, labelled at supports, under point loads, at jumps and at extremes. On frames they are drawn perpendicular to each member, moments on the tension side.

**Method of sections:** the user draws a cut line. Spectrum finds the members it crosses, checks that the cut splits the structure in two, draws the chosen part and marks the intersection of two cut members' lines of action as the moment point. It warns when the cut crosses more than three members that are not concurrent. On a beam the same tool gives the section's N, V and M in the chosen convention.

**Mohr's circle:** C = (σx + σy)/2, R = √(((σx − σy)/2)² + τxy²), σ1,2 = C ± R, τmax = R, θp = ½·atan2(2τxy, σx − σy) and θs = θp ± 45°, with the rotated stresses for θ. The 3D option sorts σ1, σ2 and σ3, draws three circles and gives the absolute maximum shear.

**Symbols:** one symbol table (`modes/structures/symbols.ts`) produces both the canvas SVG and the exported TikZ `pic`s, so the canvas matches the PDF without a TeX round trip. The circuit mode's helpers are reused: `snapDelta`, `pathFrame`, `placePathOffset`, the store pattern, `Field`, `Select`, `nextName`, `newId`, and `num`, `latexColour` and `mathsPackages` from `modes/shared.ts`.

**Files:** `figures/<name>.tex` as today, with the drawing kept in its comment line. The export has comment headers per part (structure, loads, reactions, shear force, bending moment) so Code tab edits are easy, uses no `calc` syntax and needs nothing newer than PGF 3.0.

### Implementation steps for builders

1. **Mode registration.** Add `structures` and `mohr` (as a Form preset) per [composer-categories.md](composer-categories.md) sections 1.3 to 1.5: entries in `MODES`, ids in the `TikzPackage` union in `apps/frontend/src/diagram/types.ts`, chooser starters with categories and search aliases (“beam”, “truss”, “frame”, “SFD”, “BMD”, “shear”, “moment”, “Mohr”, “stress”). `fileFormat.ts` is unchanged. Check: the chooser lists both under Engineering › Mechanical and structures, and Structures under Physics › Mechanics and fluids.
2. **Model and store** (`modes/structures/model.ts`, `store.ts`): nodes, members, supports, loads, dimensions and cuts referring to ids; split-on-drop; delete removes what hangs on an item. Check: `structures.check.ts` round-trips a model through the file format.
3. **Solver** (`solve.ts`) and determinacy count (3m + r − 3j − c for beams and frames, m + r − 2j for trusses). Check: the textbook cases below in `structures.check.ts`.
4. **Canvas and rail**: the symbol canvas engine with the structures palette and inspector; live overlays of reactions, diagrams and member forces from the same polylines the export uses. Check: a live browser pass draws each case below.
5. **Views and cuts**: the six views, joint picking and the cut tool. Check: the joint and section cases below.
6. **Export** (`code.ts`): plain TikZ, pics in the picture options, `arrows.meta` and `babel` libraries, units and significant figures, both conventions. Check: every view compiles with pdfLaTeX, XeLaTeX, LuaLaTeX and Tectonic 0.17, and inside a main document using French babel through `\includestandalone`.
7. **Mohr's circle preset** in the Form mode (`modes/form/mohr.ts`): fields, preview, conventions, stress elements. Check: `mohr.check.ts`.
8. **Settings › Composer**: “Bending moment diagrams” (Tension side (sagging below) / Positive up) and “Mohr's circle shear axis” (τ positive downward / Clockwise shear plotted above / τ positive upward), stored with the app's settings and shared through the settings repository like the other composer keys. A new drawing copies the defaults into its own style, so changing a default never redraws existing figures.
9. **The `babel` library in every TikZ mode.** The research found that any TikZ figure inserted into a French or Turkish document needs `\usetikzlibrary{babel}`, and the circuit mode exports no libraries today. Add it to every TikZ mode's export (it is harmless elsewhere). Check: a circuit and a structure compile inside a French babel document.

### Tests and live checks

Expected values checked with SymPy 1.14 by the research:

| Case | Expected |
| --- | --- |
| Simply supported 6 m beam, uniform load 10 kN/m | 30 kN at each support; Mmax 45 kN·m at mid-span |
| Simply supported 6 m beam, 12 kN at 2 m | 8 kN and 4 kN; 16 kN·m under the load |
| Simply supported 6 m beam, triangular load 0 to 9 kN/m | 9 kN and 18 kN; Mmax 20.78 kN·m at 3.464 m |
| Propped cantilever 6 m, uniform load 10 kN/m | Fixed end 37.5 kN and 45 kN·m; prop 22.5 kN |
| Two 5 m spans, uniform load 10 kN/m | 18.75, 62.5 and 18.75 kN; −31.25 kN·m over the middle support |
| Truss A(0,0) pin, B(8,0) roller, C(4,3), 10 kN down at C | 5 kN at each support; AB 6.667 kN (T); AC and BC 8.333 kN (C) |
| Mohr σx 80, σy −40, τxy 25 MPa | C 20, R 65, σ1 85, σ2 −45, θp 11.31° |
| Mohr σx 50, σy 30, τxy 0 | In-plane τmax 10; absolute τmax 25 |
| Two rollers only, or a hinge that makes a mechanism | Reported unstable |

During development random beams and trusses are cross-checked against SymPy's beam and truss modules (not shipped). The live pass draws each case on the canvas, switches every view and convention, changes the Settings defaults and confirms an existing drawing keeps its own, inserts each into a LaTeX document and compiles it.

### Risks and limits

- Tectonic's first use of each TikZ file needs the internet, as for every TikZ figure.
- Indeterminate results depend on the relative stiffnesses entered; the status line always says so.
- Frames are the largest part. If time is short they follow beams and trusses inside this round rather than slipping to the backlog.
- Later (after this round, with the Mechanics and physics sets first per decision 33): deflected shape, influence lines, full 3D stress tensors, cables and arches, temperature and settlement loads, “show working” equations, a European symbol style, cross-sections with tikz-sections.

### Rough size

| Part | Size |
| --- | --- |
| Model, store, canvas and palette | M |
| Solver and diagrams | M |
| Views, joints and cuts | M |
| Export and compile tests | S |
| Mohr's circle preset | S (once the Form frame exists) |
| Settings defaults and the babel library | S |
