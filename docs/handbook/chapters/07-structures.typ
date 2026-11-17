#import "../template.typ": *

// Two screenshots side by side at part of the text's width, as #shots sets them at all of it.
#let pair(paths, caption, width: 66%) = figure(box(width: width, grid(columns: paths.len(), gutter: 10pt, ..paths.map(p => frame(p)))), caption: caption)

// A figure from the composer's PDF at the size it prints, narrowed only to fit the page (paths from docs/handbook, as frame takes them).
#let printed(path, caption) = figure(layout(size => frame(path, width: calc.min(measure(image("../" + path)).width, size.width))), caption: caption)

= Structures <ch-structures>

The Structures composer draws beams, trusses and frames with their supports and loads, and solves them as they are drawn. It is meant for statics and structural analysis courses: a loading diagram for an assignment, the free-body diagram with its reactions, the shear force and bending moment diagrams, the member forces of a truss or the free-body diagram of one joint or one side of a section cut. Every figure is drawn to scale in the drawing's units, metres and kilonewtons by default, and written into the project as plain TikZ.

The chapter first shows how to start a structure and how the canvas works (@sec-structures-canvas). It then walks through the tools on the rail in the order they appear: members and joints, supports, loads and annotations. The later sections explain what the composer works out and how to read it, the options under #ui[Style], editing several parts at once, how labels are placed and the code the composer writes. What every composer shares, such as opening the composer, the frame around the canvas, selecting, undo and file versions, is in @ch-composer.

#shot("figures/07-structures/composer.jpg", [The Structures composer with a simply supported beam and an overhang. The rail is on the left, the canvas and the compiled preview in the middle and the inspector on the right. The status line at the bottom left of the canvas says whether the structure is stable.]) <fig-structures-composer>

== Starting a structure <sec-structures-start>

Open #ui[Draw a diagram] in the top bar of a project and pick a card in the #ui[Engineering] category under #ui[Mechanical and structures], or search for it. A search for a word such as statics, truss, SFD or reactions finds every structure (@fig-structures-chooser). Two kinds of starter open the Structures composer.

- #ui[Structure (beams, trusses, frames)] opens a 6~m simply supported beam with a pin at A, a roller at B and a uniform load of 10~kN/m along it, ready to be changed.
- Twelve pre-drawn structures open already solved, each one a figure a statics course starts from. They are listed in @tab-structures-starters.

#shot("figures/07-structures/chooser.png", [#ui[Draw a diagram] searched for statics. The Structure starter and the twelve pre-drawn structures are among the cards, with the fluid statics form presets of @ch-forms after them.], width: 72%) <fig-structures-chooser>

#figure(
  table(
    columns: (auto, 1fr),
    align: (left, left),
    [Starter], [What it holds],
    [Cantilever], [A 4~m cantilever fixed at A, with 10~kN and 5~kN~m clockwise at its free end],
    [Overhanging beam], [A pin and a roller 6~m apart with 10~kN/m between them, and 15~kN at the end of a 2~m overhang],
    [Propped cantilever], [A 6~m beam fixed at A and on a roller at B under 10~kN/m, indeterminate to degree 1],
    [Two-span beam], [Two 5~m spans over three supports, 10~kN/m over both, indeterminate],
    [Beam with an internal hinge], [A Gerber beam: fixed at A, hinged at B and on a roller at C, with 5~kN/m on AB and 20~kN in the middle of BC],
    [Triangular load], [A 6~m simply supported beam under a load rising from nothing at A to 12~kN/m at B],
    [Pratt truss], [Four 3~m panels, 3~m deep, diagonals in tension, 10~kN at each bottom joint and a section cut placed],
    [Howe truss], [The same panels with the diagonals in compression],
    [Warren truss], [Three 4~m panels of triangles without verticals],
    [Portal frame], [Fixed feet, 4~m high and 6~m wide, 10~kN sideways at B and 5~kN/m along the beam],
    [Three-hinged frame], [Pinned feet and a hinged ridge, snow of 5~kN/m on plan over both rafters and 10~kN of wind at B],
    [Inclined member], [A member rising 3~m over 4~m, pinned at its foot and on a roller at its head, with 2~kN/m along its length and its angle marked],
  ),
  caption: [The pre-drawn structures in #ui[Draw a diagram].],
) <tab-structures-starters>

A new drawing takes its bending moment convention, the #ui[Write units with siunitx] switch and the force diagrams it draws from #menu[Settings][Diagram composer] (@ch-composer), and keeps them, so a later change in Settings never redraws it. A truss, whose members are all truss bars, opens on its member forces at a width of 14~cm. Every other structure opens on its free-body diagram with the shear force and bending moment diagrams.

== The canvas <sec-structures-canvas>

The canvas draws the structure in the drawing's length unit with y up. It uses the scale of the PDF: the larger side of the structure fills the #ui[Size] set under #ui[Style] (8~cm by default), and the text, arrows, line widths and support symbols are drawn at the size they will print. Hence a structure that grows makes its labels look smaller against it, as they will on the page.

=== The metre grid

Points snap to a grid in the drawing's length unit. #menu[Style][Grid] sets its step from the four each unit system offers (@tab-structures-grids). The background is the one chosen in #menu[Settings][Diagram composer], and its larger mark falls on every whole metre (every 1000~mm, every foot or every 12~inches), so lengths can be counted off the canvas. When the grid step is a whole unit or more, the larger mark falls on every fifth step instead.

#figure(
  table(
    columns: 3,
    align: left,
    [Units], [Grid steps], [Larger mark],
    [kN and m], [0.1, 0.25 (default), 0.5 or 1~m], [every metre],
    [N and mm], [100, 250, 500 or 1000~mm], [every 1000~mm],
    [kip and ft], [0.5, 1, 2 or 5~ft], [every foot],
    [lb and in], [6, 12, 24 or 60~in], [every 12~in],
  ),
  caption: [The grid steps of each unit system.],
) <tab-structures-grids>

A point placed near a joint, within about 10 screen pixels, lands on the joint. A point placed beside a member lands on the member, a whole grid step along it, so a joint, a support or a load put on an inclined member sits on its line rather than on a grid point beside it.

=== The status line

The line at the bottom left of the canvas says what the solve found, and the inspector repeats it when nothing is selected. It reads one of the following,

- #ui[Determinate and stable], when the reactions and member forces follow from equilibrium alone,
- #ui[Indeterminate to degree 2 (relative EI used)], with the degree, when the structure has more unknowns than equations and is solved from the members' stiffnesses (#ui[EI used] when a support settles, #ui[relative EA used] for a truss),
- #ui[Unstable: node D can move by turning], naming the joint that can move and the way it moves (sideways, up and down or by turning), with that joint ringed in red on the canvas (@fig-structures-unstable), or
- an error, such as a load placed along a truss bar, which a truss bar cannot carry.

A note may follow it, such as a moment applied at a joint where every member end is hinged, which has nothing to turn. While the structure is unstable or in error the diagrams are not drawn.

#shot("figures/07-structures/unstable.png", [The beam of @fig-structures-composer with its roller removed. Joint D is ringed in red and the status line says it can move by turning about A.], width: 75%) <fig-structures-unstable>

== The rail <sec-structures-rail>

The rail on the left holds every tool, in five groups (@fig-structures-rail). #ui[Find a part] at its top narrows the list as you type, and hovering a tool shows a tooltip that says how to use it. Pick a tool, then click or drag on the canvas. A tool that places one part goes back to #ui[Select] once it has placed it, while the two member tools stay on so that a whole frame can be drawn in one go. Click a picked tool again, or press #key("Esc"), to go back to #ui[Select].

#figure(
  grid(
    columns: (46%, 1fr),
    gutter: 14pt,
    frame("figures/07-structures/rail.png"),
    align(left + horizon)[
      #table(
        columns: (auto, 1fr),
        align: left,
        [Group], [Tools],
        [Members], [Beam or frame member (#key("M")), Truss bar (#key("T"))],
        [Joints], [Joint, Internal hinge, Internal shear release, Released member end],
        [Supports], [Pin, Roller, Fixed, Guided (slider), Spring, Rotational spring],
        [Loads], [Point force, Moment anticlockwise and clockwise, Uniform load, Linearly varying load],
        [Annotations], [Dimension horizontal, vertical and aligned, Label, Angle arc, Axes, Section cut],
      )
    ],
  ),
  caption: [The Structures rail and its groups. Each tool's picture is drawn with the canvas's own symbols.],
) <fig-structures-rail>

=== The M and T keys

#key("M") picks #ui[Beam or frame member] and #key("T") picks #ui[Truss bar] while the pointer is over the drawing. Elsewhere, such as in the inspector, the keys type as usual. Both are shown in their tools' tooltips and can be changed in #menu[Settings][Diagram composer], as @ch-composer describes for every tool key.

== Members and joints <sec-structures-members>

A member joins two joints. Spectrum has two kinds,

- a *beam or frame member*, which carries axial force, shear and bending moment and is drawn as a heavy line, and
- a *truss bar*, which is pinned at both ends and carries force along its length only. It is drawn as a lighter line, and a joint where only truss bars meet is drawn as a small open circle.

To draw members,

#howto[draw members][
+ Press #key("M") over the canvas, or pick #ui[Beam or frame member] on the rail
+ Drag from one point to another, or click the two points one after the other
+ Carry on from the end of the last member to draw the next one
+ Press #key("Esc") when the structure is drawn
]

Each end lands on a joint already there, or makes a new one. An end that lands on a member splits that member in two at a new joint, and the loads on it go to the piece they are on. A distributed load across the split becomes one load on each piece. Drawing a member between two joints that already have one selects the one already there.

Joints are named with capital letters as they are made, A to Z and then A1, B1 and so on. A member is named by its joints' letters, so the member from C to B is CB, and its force is written $F_"CB"$.

=== The joint tools

The four tools of the #ui[Joints] group change how members meet (@fig-structures-joints).

- *Joint* adds a joint: click a member to split it there, or anywhere for a free joint. A joint on a member is where a load or a support can then go.
- *Internal hinge* lets every member end at a joint turn freely, so the bending moment there is zero. Click a joint, or a member to add one there. It is drawn as an open circle. Clicking again takes it away.
- *Internal shear release* lets the members' ends at a joint slide across each other while the moment still passes. It is drawn as two strokes square to the member.
- *Released member end* releases the moment at one end of one beam member only, such as a beam pinned to a column that carries on. Click near the end to release. A small open circle beside the joint marks it.

#printed("figures/07-structures/joint-kinds.png", [A beam fixed at A with an internal hinge at B, an internal shear release at C and the end of member DE released at D, as the PDF draws them.]) <fig-structures-joints>

=== The member and joint inspectors

Click a member to select it. The inspector shows its name, its kind and its length (@fig-structures-member-joint).

- *Kind* switches it between #ui[Beam or frame member] and #ui[Truss bar].
- *Released at C* and *Released at B* release the moment at either end, as the #ui[Released member end] tool does.
- *Stiffness, EI and EA* folds the member's stiffness away, and opens by itself when either is set. *EI* is its bending stiffness in the drawing's units, kN~m² by default, and 1 when left alone. An indeterminate structure needs only the members' ratios of EI, but a settlement and the deflections use the value itself, so give each member its real EI before reading a deflection. *Relative EA* is its axial stiffness against the others: members are nearly rigid along their length, and a smaller EA lets this one stretch.

Click a joint to select it. Its inspector has its *Name* (letters, digits and a prime), its *Position* as x and y, which can be typed exactly, and the fold *Hinge and shear release* with a switch for each.

#pair(("figures/07-structures/inspector-member.png", "figures/07-structures/inspector-joint.png"), [The inspector of member CB with its stiffness fold open (left) and of joint A (right). A selected member also has the Mirror and Turn buttons of @sec-structures-groups.]) <fig-structures-member-joint>

== Supports <sec-structures-supports>

A support holds a joint. Pick its kind on the rail and click a joint, or a member to add a joint there. A joint takes one support, so a new one replaces the one already there. @tab-structures-supports lists the six kinds by what each one holds, and @fig-structures-supports shows them as the PDF draws them.

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: left,
    [Support], [Holds], [Reactions drawn],
    [Pin], [Both directions, but turns freely], [$A_x$ and $A_y$],
    [Roller], [Square to its surface only], [$A_y$ (or $A$ when turned)],
    [Fixed], [Both directions and turning], [$A_x$, $A_y$ and $M_A$],
    [Guided (slider)], [Square to its surface and turning, sliding freely along it], [$A_y$ and $M_A$],
    [Spring], [Square to its surface, through a spring of a given stiffness], [$A_y$],
    [Rotational spring], [Both directions, and turning through a spring], [$A_x$, $A_y$ and $M_A$],
  ),
  caption: [The six supports. The reactions are named after the joint, here A.],
) <tab-structures-supports>

#printed("figures/07-structures/supports.png", [The six supports, each under a short member, in the loading diagram.]) <fig-structures-supports>

A fixed or guided support placed on a joint is turned to face the members on it, so a wall goes behind the end of a cantilever without being turned by hand. The other supports sit under their joint until they are turned.

The support's inspector (@fig-structures-support-force) has the following,

- *Kind*, which changes it to another of the six,
- the fold *Angle and settlement*, which opens by itself when either is set,
  - *Angle* turns the support anticlockwise in degrees. A roller at an angle pushes square to its turned surface,
  - *Settlement* is how far the ground under it moves down, in the drawing's length unit. The structure follows it, and an indeterminate structure takes forces from it. A spring has no settlement,
- *Stiffness*, for a spring or a rotational spring, in kN/m or kN~m/rad. It is set against the members' EI, where an EI of 1 means 1~kN~m² in kN and m. Only the ratio matters, so the reactions depend on the stiffness against EI and not on the size of the structure.

== Loads <sec-structures-loads>

The #ui[Loads] group has five tools. A point force or a moment goes on a joint, or anywhere along a member, and a distributed load goes along a member. Each new load is 10 in the drawing's units, pointing down or turning as its tool says, and the inspector then sets its value. @fig-structures-loads shows them on one beam.

#printed("figures/07-structures/loads.png", [From the left: a point force of 20~kN, a force at an angle with the label $P$ in place of its value, a moment of 12~kN~m anticlockwise, a uniform load of 8~kN/m and a load rising linearly to 12~kN/m.]) <fig-structures-loads>

=== Point forces and moments

Pick #ui[Point force], #ui[Moment, anticlockwise] or #ui[Moment, clockwise] and click a joint or a point on a member. A load on a member can then be dragged along it, a grid step at a time. Its inspector has the following fields (@fig-structures-support-force).

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    [Field], [What it sets],
    [Value], [The force in kN, or the moment in kN~m. A negative value turns the load round.],
    [Direction], [Down, Up, Left, Right, Perpendicular to the member (on a member only: towards its right-hand side going from its first joint to its second) or At an angle],
    [Angle], [With #ui[At an angle]: degrees anticlockwise from the right, so −90° points down],
    [Turning], [For a moment: Anticlockwise or Clockwise],
    [Distance along the member], [For a load on a member: how far from its first joint, from 0 to its length],
    [Label], [Text shown instead of the value, in LaTeX as in the document, such as `$P$` or `$w_0$`],
  ),
  caption: [The fields of a point force and a moment.],
) <tab-structures-force>

#pair(("figures/07-structures/inspector-support.png", "figures/07-structures/inspector-force.png"), [The inspector of the pin at A with its fold open (left) and of the 20~kN force at D (right).]) <fig-structures-support-force>

=== Distributed loads

Pick #ui[Uniform load] or #ui[Linearly varying load] and click a member. The load covers the whole member: a uniform load at 10~kN/m and a linearly varying one rising from 0 to 10~kN/m. Drag the square handles at its ends to shorten it, a grid step at a time. Its inspector is titled #ui[Uniform load] while its two intensities are equal and #ui[Linearly varying load] otherwise (@fig-structures-load-dim).

- *Intensity* is the load per length at its start and at its end, in kN/m. Equal values make it uniform, a zero at one end makes it triangular and two different values make it trapezoidal.
- *From and to* set where it starts and ends along the member, measured from the member's first joint.
- *Label* is shown instead of the intensity.
- The fold *Direction, and per horizontal length* holds the rarer settings and opens by itself when one is set. *Direction* has the same choices as a point force, perpendicular to the member included. *Per horizontal length, as snow on a roof* makes the intensity a load per metre of plan rather than per metre of member.

A load per horizontal length on an inclined member is drawn on plan, as a level band just above the member with its arrows all the same length (@fig-structures-snow), so the low end of a steep rafter does not read as a larger load. A load whose intensity changes sign along its length draws each part on its own side of the member, with its arrows the way it acts.

#pair(("figures/07-structures/three-hinged.png", "figures/07-structures/inclined-member.png"), width: 100%, [Left: the Three-hinged frame starter, with 5~kN/m of snow on plan over both rafters. Right: the Inclined member starter, with 2~kN/m along its length, an angle arc and two dimensions.]) <fig-structures-snow>

== Annotations <sec-structures-annotations>

The #ui[Annotations] group adds what a figure needs beside the structure itself. None of them changes the solve.

- *Dimension, horizontal*, *vertical* and *aligned*: click two joints. The dimension measures the horizontal distance, the vertical distance or the distance along the line between them, and writes it in the length unit. Its inspector sets what it #ui[Measures], its #ui[Offset] from the joints (negative is below, or to the left) and a #ui[Label] to show instead of the length (@fig-structures-load-dim). A dimension below the structure is pushed down under the supports and reaction arrows, so they never cross.
- *Label*: click to place a piece of text, then type it in the inspector in LaTeX. Drag it to move it.
- *Angle arc*: click a joint. The arc runs anticlockwise from 0° to 45° with $theta$ beside it. Its inspector sets #ui[From and to] in degrees anticlockwise from the right, and the label.
- *Axes*: click to place a small pair of x and y axes, and drag them to move them.
- *Section cut*: drag across the members to cut. The part kept is on the left of the line as it was drawn, and the switch #ui[Keep the other side] in its inspector keeps the other part. Drag its ends to move it. The cut is shown by #menu[Style][View][Section free-body diagram] (@sec-structures-results).

#pair(("figures/07-structures/inspector-load.png", "figures/07-structures/inspector-dimension.png"), [The inspector of the uniform load on AC with its fold open (left) and of the 4~m dimension (right).]) <fig-structures-load-dim>

== What the composer works out <sec-structures-results>

The composer solves the structure on every change, with a two-dimensional stiffness solver: three freedoms at each joint (two at a joint of truss bars), frame members with their released ends, truss bars, and supports as held freedoms or springs. A determinate structure gets its exact equilibrium answer whatever its stiffnesses, while an indeterminate one uses the members' EI and EA. Members are cut at every load, so the forces along each piece are exact: the axial force and shear are polynomials up to the second power, the bending moment up to the third and the deflection up to the fifth.

#menu[Style][View] chooses which of the results the figure shows. It has six views,

- *Loading diagram*, the structure with its supports, loads and dimensions, as an assignment sets it,
- *Free-body diagram*, the supports taken away and their reactions drawn,
- *Free-body diagram with shear and bending moment diagrams*, the default,
- *Member forces*, the force in each member with tension and compression marked,
- *Joint free-body diagram*, the forces on one joint, and
- *Section free-body diagram*, one side of a section cut with the forces at the cut.

The canvas draws the first four as the PDF does. For the joint and section views the canvas keeps the free-body diagram of the whole structure, with the chosen joint ringed, while the preview shows the joint or the section.

=== Reactions

In the two free-body diagram views each support is replaced by its reactions (@fig-structures-fbd). A reaction is drawn as an arrow the way it acts on the structure, labelled with its size, so its sign is in the arrow and not in the number. It is named after its joint: $A_x$ and $A_y$ for the horizontal and vertical forces, $M_A$ for a moment and $A$ alone for the single force of a turned roller. A joint without a letter has its reaction labelled with the value only. On the canvas the supports stay faintly under the reactions, so that they can still be selected, while the PDF leaves them out.

#printed("figures/07-structures/beam-fbd.png", [The free-body diagram of the beam in @fig-structures-composer: $A_y = 27$~kN and $B_y = 41$~kN, both acting upward.]) <fig-structures-fbd>

=== Shear force and bending moment diagrams

For a beam, whose members all lie on one horizontal line, the diagrams are stacked under it on the same horizontal scale, each labelled with its quantity and unit, such as $V$ (kN) and $M$ (kN~m) (@fig-structures-diagrams). The axial force diagram $N$ comes first, and only when some member carries an axial force. The diagrams follow the usual beam convention,

- positive axial force is tension,
- positive shear pushes the part to the left of a section up, and is drawn above the axis, and
- a positive (sagging) moment bends the member concave up. With #menu[Style][Bending moment diagrams][Tension side (sagging below)] it is drawn below the axis, on the side in tension, while #ui[Positive up] draws it above.

Each diagram is labelled at the ends of its pieces, on both sides of a jump and at each largest or smallest value inside a piece, with the value in the style's significant figures. A value the one before it already gives, as along a constant stretch, is not repeated, zeros are not labelled and a value that would overlap another is left out. A member drawn from right to left, or downward, reads the same as one drawn the other way, so a sagging moment is always positive.

#printed("figures/07-structures/beam-diagrams.png", [The beam's shear force and bending moment diagrams. The shear falls from 27~kN at A to −21~kN at C and jumps by the 41~kN reaction at B. The moment is largest at 30.4~kN~m in the span and −30~kN~m (hogging) over B.]) <fig-structures-diagrams>

For a frame, or a truss, each diagram is drawn on a copy of the structure, two to a row with the free-body diagram first (@fig-structures-frame). A diagram is drawn square to each member on its plotting side, which is above a horizontal member and to the left of a vertical one. A frame's moments on the tension side are labelled by size only, since the side they are drawn on shows their sense. A truss has only the axial force diagram.

#printed("figures/07-structures/portal-frame.png", [The Portal frame starter with its axial force, shear force and bending moment diagrams, each on a copy of the frame.]) <fig-structures-frame>

=== The deflected shape and x of zero shear

The fold #ui[Deflected shape and x of zero shear] under #ui[Style] adds two things to the diagrams view (@fig-structures-deflection).

- *Deflected shape* draws the elastic curve: under a beam as a fourth diagram $delta$ in the length unit, and for a frame on a faint copy of the frame. *Exaggeration* scales it: #ui[Fitted to the drawing] makes the largest deflection a set size on the page, while #ui[× 1] to #ui[× 10000] draw the true deflection times that factor. Each member's largest deflection is labelled, up positive, and a frame's largest displacement is labelled $delta_max$. The values use each member's EI as typed, so with the default EI of 1~kN~m² they are far too large: type the members' real EI first. A truss's deflected shape is to scale only against itself, since EA is relative, and its values are not labelled.
- *Mark x where the shear is zero* writes $x$ on the shear and moment diagrams where the shear crosses zero inside a member, which is where the moment is largest. It is measured from the left end of the member, or from its lower end when it is vertical.

#printed("figures/07-structures/beam-deflection.png", [The same beam with each member's EI set to 20~000~kN~m², its deflected shape and x of zero shear. The shear is zero, and the sagging moment largest, at $x = 2.25$~m from A. The largest deflection is 4.38~mm down, in span AC.]) <fig-structures-deflection>

=== Member forces, joints and sections

#ui[Member forces] writes the axial force beside each member with (T) for tension or (C) for compression (@fig-structures-truss). A member whose force is zero is drawn dashed and labelled 0, which marks the zero-force members of a truss at a glance. The view works for a frame too, where it gives each member's axial force at its middle.

#printed("figures/07-structures/truss-forces.png", [The member forces of a pin-jointed roof truss with 8~kN at each top joint and 4~kN of wind at E. The section cut through the second panel is drawn dashed.]) <fig-structures-truss>

#ui[Joint free-body diagram] draws one joint with the forces its members put on it, as the method of joints takes them (@fig-structures-joint). Choose the joint in #menu[Style][Joint]. Each member's force is an arrow along it, named $F_"EB"$ after the member, pointing away from the joint for tension and into it for compression. A frame member also shows its shear and moment at the joint. The joint's own loads and reactions are drawn with it.

#printed("figures/07-structures/truss-joint.png", [The free-body diagram of joint B of the roof truss: two bars in tension along the bottom chord, EB in tension and BF in compression.]) <fig-structures-joint>

#ui[Section free-body diagram] draws the part kept on one side of a section cut, as the method of sections takes it (@fig-structures-section). Choose the cut in #menu[Style][Section cut]. The kept part keeps its loads and reactions, and each member the cut crosses gets its force at the cut: $F_"BC"$ along a truss bar, or $N$, $V$ and $M$ for a beam member. Where the lines of two cut members meet, the point is marked $O_1$, $O_2$ and so on: taking moments about it gives the third force directly. A cut through more than three members that do not meet at one point cannot be solved by hand alone, and the composer says so in a comment. The forces it shows then come from the whole structure.

#printed("figures/07-structures/truss-section.png", [The right-hand part of the roof truss at the cut, with the forces in EF, BF and BC. $O_2$ at F is where EF and BF meet, so moments about it give $F_"BC"$.]) <fig-structures-section>

== Style <sec-structures-style>

#ui[Style] in the composer's toolbar opens the drawing's own settings (@fig-structures-style). Each one is kept with the drawing.

#figure(
  grid(
    columns: (32%, 1fr),
    gutter: 14pt,
    frame("figures/07-structures/style.png"),
    align(left + top, table(
      columns: (38%, 62%),
      align: left,
      [Option], [What it does],
      [View], [The six views of @sec-structures-results],
      [Joint, Section cut], [The joint or the cut that the joint and section views show],
      [Axial force, Shear force, Bending moment diagram], [Whether each diagram is drawn, its fill (a swatch or any xcolor name or mix, such as `blue!15`) and its opacity. A diagram switched off leaves no gap.],
      [Deflected shape and x of zero shear], [The fold of @fig-structures-deflection],
      [Bending moment diagrams], [Tension side (sagging below) or Positive up],
      [Units], [kN and m, N and mm, kip and ft or lb and in],
      [Grid], [The canvas's grid step (@tab-structures-grids)],
      [Significant figures], [2 to 5, 3 by default, for every value written],
      [Joint letters], [Shows or hides the joints' names],
      [Write units with siunitx], [Writes 10~kN as `\qty{10}{\kilo\newton}`, and the document then loads siunitx],
      [Size], [The structure's larger side in the PDF, 4 to 16~cm],
    )),
  ),
  caption: [The Style menu of a structure, with the diagram fold open, and what each option does.],
) <fig-structures-style>

The fills, the switches and the bending moment convention set under #ui[Style] apply to this drawing only. #menu[Settings][Diagram composer] holds the defaults for new drawings under #ui[Bending moment diagrams] and #ui[Structure diagrams].

=== Changing the units

Choosing other units for a drawing that already has something in it asks what to do with its numbers (@fig-structures-units).

- *Convert to N and mm* (or the units chosen) keeps the same structure in the new units: lengths, forces, distributed loads, moments, EI, spring stiffnesses and settlements are all converted, so a 6~m beam becomes 6000~mm. EI is written out in the new units, since an EI of 1 in one system is not 1 in another.
- *Keep the numbers* only renames the units, so 6~m becomes 6~mm.

#shot("figures/07-structures/units.png", [Choosing N and mm for a drawing in kN and m.], width: 40%) <fig-structures-units>

== Selecting and editing several parts <sec-structures-groups>

Selecting works as in every composer (@ch-composer). In Structures a selection can also be moved, mirrored and turned as a whole.

- Drag across empty space to select everything wholly inside the box: joints, and the members, supports, loads and notes whose joints are all inside it. Hold #key("Shift") to add to the selection. #key("⌘", "A") selects everything.
- Drag the selection to move it, in whole grid steps. The arrow keys move it one grid step, four with #key("Shift").
- #key("X") mirrors it left to right and #key("Y") top to bottom, about its middle. The inspector has the same two #ui[Mirror] buttons, and #ui[Turn by] turns it anticlockwise by any angle about its middle (@fig-structures-group).
- Hold #key("Space") and drag, or drag with the middle button, to pan.

Supports, loads and angle arcs turn with the joints they are on. A mirror also swaps a moment's sense and the side a section cut keeps, and a load square to a mirrored member stays on the side it was mirrored to. A horizontal dimension becomes vertical after a quarter turn.

#shot("figures/07-structures/group.png", [Joints A and C, member AC, the pin, the load and the 4~m dimension selected by a box. The inspector offers Mirror and Turn by for the six items.]) <fig-structures-group>

Some edits act on what a part hangs on.

- Dragging a single joint moves it with its members. Dropped on another joint it merges into it, and dropped on a member it splits that member.
- Dragging a support, a dimension or a load on a joint moves the joints it hangs on.
- Deleting a joint or a member also deletes what hangs on it, and a deleted member's free ends go with it.
- Paste puts the copy two grid steps right of and below the original, with new joint letters.

== How labels are placed <sec-structures-labels>

Every label in a structure, from a joint's letter to a value on a diagram, is placed so that it keeps clear of the drawing, and the canvas and the PDF place it in the same spot. Specifically, each label's text is measured as TikZ sets it at `\footnotesize`, and checked against the members, arrows, supports, dimension lines, diagram outlines and the labels placed before it. A label that is clear stays where it was put. A label that touches something moves to the nearest place around the point it labels that touches nothing, trying eight directions and moving a little further out each time. The values on a diagram are placed first, and the joint letters last.

Two kinds of label are treated more strictly. A value on a diagram that finds no clear place nearby is left out, since another value close to it already says enough. The labels of the forces in a joint or section diagram all matter, so one that would overlap another is moved down until it does not.

Joint letters go on the side away from their members, and up and to one side beside a horizontal member, where they read best. The canvas shows labels as they print, with real subscripts such as $A_y$ and $q_0$.

== The code it writes <sec-structures-code>

Structures writes its drawing as a standalone TikZ document in `diagrams/`, which the document brings in with `\includestandalone` (@ch-composer). The picture is plain TikZ, with numeric coordinates in centimetres, and uses nothing newer than PGF 3.0 (@fig-structures-code).

- The document loads only `tikz`, with the `arrows.meta` and `babel` libraries, and `siunitx` when units are written with it.
- The picture's options define a style for each kind of line, such as `struct member` at 1.2~pt and `struct load` at 0.6~pt, the fills of the force diagrams and each support symbol as a pic, such as `spx/struct/pin`. Nothing reaches the document's preamble.
- A comment first names the view and the status, such as `% Structure, free-body diagram with shear and bending moment diagrams: Determinate and stable`. Then each part of the picture is headed by its own comment: `% Structure`, `% Supports`, `% Loads`, `% Reactions`, `% Dimensions and labels` and one for each diagram, which sits in a scope shifted below or beside the structure.

#shot("figures/07-structures/code.png", [The Code tab of the beam, with the styles in the picture's options and the comment that heads each part.], width: 92%) <fig-structures-code>

A drawing that uses something added in 2.5 (a settlement, a load per horizontal length, an internal shear release, the deflected shape or x of zero shear) is saved as file version 5, which Spectrum 2.4 and earlier open as code.
