#import "../template.typ": *

#set math.mat(delim: "[")                      // matrices in square brackets

= Form presets <ch-forms>

A Form preset is a figure that Spectrum works out from a form. Instead of drawing on a canvas, the user types the numbers of a problem and picks its choices, and Spectrum calculates the answers, draws the figure and writes the working under it. It is meant for the figures of a worked example: a Mohr's circle for a stress element, the hydrostatic force on a gate, the walk through a manometer or a conic given by its equation. This chapter first explains how a preset is found, how its form, its working and its preview relate and what its file holds. Then each preset has its own section, with every field of its form, the formulae it uses, its switches, a worked example and the limits of what it draws. What every composer shares (opening it, the chooser, the window, #ui[Compile] and the preview, settings and file versions) is in @ch-composer and is not repeated here.

== How a Form preset works <sec-forms-basics>

=== Finding a preset in the chooser

Every preset is a card of its own in the chooser of #ui[Draw a diagram], with the badge TikZ. The cards are listed by subject, as @tab-forms-presets shows, and search finds each one by its name and by other words for it (for example, #ui[buoyancy] finds Floating body and stability and #ui[eigenvector] finds Linear transformation).

#figure(
  table(
    columns: (auto, auto, auto),
    align: (left, left, left),
    table.header[Preset][Listed under][New file's name],
    [Mohr's circle], [Engineering › Mechanical and structures, Physics › Mechanics and fluids], [`mohr-1.tex`],
    [Venn diagram], [Mathematics › Statistics and probability, Others › Charts], [`venn-1.tex`],
    [Hydrostatic force on a gate], [Engineering › Mechanical and structures, Physics › Mechanics and fluids], [`gate-1.tex`],
    [Manometer], [the same], [`manometer-1.tex`],
    [Accelerating tank], [the same], [`tank-1.tex`],
    [Floating body and stability], [the same], [`floating-1.tex`],
    [Conic section], [Mathematics › Geometry and vectors], [`conic-1.tex`],
    [Linear transformation], [Mathematics › Geometry and vectors], [`transformation-1.tex`],
  ),
  caption: [The Form presets in the chooser, from `modes/form/presets.ts`.],
) <tab-forms-presets>

To start a drawing from a preset,

#howto[start a drawing from a preset][
+ Choose #menu[Draw a diagram] in the editor
+ Type the preset's name, or a word for it, in the search field
+ Click its card and check the name under #ui[Name]
+ Click #ui[Create]
]

Search ranks what it finds: cards whose name matches come first, then those that match in their description or other words, then the rest. For example, the four fluid statics presets answer to #ui[fluid statics] and come straight after General drawing (whose other words include fluid mechanics and hydrostatics), ahead of the beams and trusses, as @fig-forms-chooser shows.

#shot("figures/11-forms/chooser-fluid-statics.png", [The chooser's search for "fluid statics": General drawing, then the four fluid statics presets, then the beams. Hydrostatic force on a gate is chosen.], width: 82%) <fig-forms-chooser>

A development build of Spectrum lists one more card, Labelled circle (test), which is the frame's own test: a circle with a radius, a label, a line style and a shading switch. Released builds do not list it.

=== The form, the working and the preview

A Form preset's window has the same header and the same preview as every composer (@ch-composer). Specifically, where another composer has its canvas, a Form preset has its form: one column of fields under the preset's name, with a hint under each field that needs one. @fig-forms-window shows the window of a new gate drawing. The fields are of four kinds,

- a number, with its unit beside it,
- a line of text, which is LaTeX as the document has it (`$A$` for a maths letter),
- a choice from a list and
- a switch, which turns a part of the figure on or off.

#shot("figures/11-forms/gate-window.png", [A Form preset's window: the form of Hydrostatic force on a gate above, the compiled figure in the preview below.], width: 85%) <fig-forms-window>

A field appears only when it is needed. For example, the gate's #ui[Width] is hidden for a circular gate, and the manometer shows a column's height only once the column names a fluid. A number field takes a value only when it is a number inside the field's range. When a number outside it is typed, the drawing keeps its last value and a red hint under the field says what it takes (@fig-forms-range). The hint stays until the next number is typed, while the field goes back to the last value when you leave it. The ranges are also given in each section's table.

#shot("figures/11-forms/range-hint.png", [A width of 0 typed into the gate's #ui[Width], which takes 0.001 to 1000 m.], width: 55%) <fig-forms-range>

Each change to the form is saved, and 700 ms after the last change the preview compiles the new figure, as in every composer. The figure carries its own answers, while the working is written in two places,

- under the figure, as lines of text, when the preset's results switch is on (#ui[Write the results under the figure], or #ui[Write the working under the figure] for the maths presets) and
- at the top of the file, as TeX comments, whether the switch is on or off.

Hence the answers can be read in the #ui[Code] tab even when the figure leaves them out. Numbers are written to four significant figures (three in Mohr's circle), and a pressure is written in kPa from 10~kPa upwards and in Pa below that.

=== Look and Style

The four fluid statics presets share a #ui[Look] choice. #ui[Lecture slides (tinted)] fills each fluid with a light tint and draws the forces in colour, while #ui[Exam paper (black and white)] draws water and seawater as dashed lines, oil and glycerin as dots and mercury as hatching, with every label on white, as an exam paper prints them. The maths presets draw in the colours of the MATH2150 notes, with no choice.

The #ui[Style] button holds the conventions a preset writes with. Mohr's circle has its shear axis (@sec-forms-mohr) and #ui[Write units with siunitx], and the four fluid statics presets have #ui[Write units with siunitx]. With the switch on, a value such as 103 kN is written as `\qty{103}{\kilo\newton}` and the file loads siunitx; with it off, it is written as `$103$\,kN`. A new drawing copies these conventions from #menu[Settings][Diagram composer][New drawings], where #ui[Write units with siunitx] is on unless it has been turned off, so changing the setting later never redraws an existing figure. Venn diagram, Conic section and Linear transformation have no style, and their #ui[Style] says so.

=== What the file holds

A Form preset writes a standalone TikZ file in `diagrams/`, as every TikZ composer does. In order, it holds,

+ the preamble, with `tikz` and only what the figure needs (`siunitx`, the `patterns` library for an exam paper's hatching),
+ the working as `%` comments,
+ the `tikzpicture` and
+ the composer's last line, `% spectrum-diagram v1 …`, which keeps the preset's name, every value of its form and its style.

When the file is opened again, the composer reads that last line and opens the form with its values. A number missing from it, or out of its range, is replaced by the preset's own starting value. The Hydrostatic force on a gate, Manometer, Accelerating tank, Floating body and stability, Conic section and Linear transformation presets are new in 2.5, so their files are file version 5, which Spectrum 2.4 and earlier open as code. Mohr's circle and Venn diagram files keep version 1. A file whose preset this build does not have opens as code.

== Mohr's circle <sec-forms-mohr>

Mohr's circle shows the plane stress at a point: from the normal stresses $sigma_x$ and $sigma_y$ and the shear stress $tau_(x y)$, it draws the circle with the principal stresses, the maximum in-plane shear and the angle to the principal plane, and draws the stress element as it is and turned. Tension is positive, and a positive $tau_(x y)$ acts on the $x$ face in the $+y$ direction.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Unit and range],
    [σx], [The normal stress on the $x$ face, tension positive], [the stress unit],
    [σy], [The normal stress on the $y$ face], [the stress unit],
    [τxy], [The shear stress, positive on the $x$ face pointing in $+y$], [the stress unit],
    [Stress unit], [Written after every value, in LaTeX: MPa, ksi, `kN/m$^2$`. Empty writes bare numbers], [text],
    [Rotation θ], [An anticlockwise rotation of the element; 0 leaves the rotated state out], [°, −180 to 180],
    [Three-dimensional state], [Adds σz and the two other circles], [switch],
    [σz], [The third principal stress, shown with the switch on], [the stress unit],
    [Stress elements], [None; Original; Original and rotated by θ; Original, rotated, principal and maximum shear], [choice],
  ),
  caption: [The fields of Mohr's circle. The stresses take any value up to $10^9$ either way.],
) <tab-forms-mohr>

=== What it calculates

With $theta$ the rotation, Spectrum uses the transformation equations in their usual form,
$ C = (sigma_x + sigma_y) / 2, quad R = sqrt(((sigma_x - sigma_y) / 2)^2 + tau_(x y)^2), quad sigma_(1,2) = C plus.minus R, quad tau_"max" = R, $
$ tan 2 theta_p = (2 tau_(x y)) / (sigma_x - sigma_y), quad theta_s = theta_p - 45 degree, $
$ sigma_(x') = C + (sigma_x - sigma_y) / 2 cos 2 theta + tau_(x y) sin 2 theta, quad tau_(x' y') = -(sigma_x - sigma_y) / 2 sin 2 theta + tau_(x y) cos 2 theta, $
with $sigma_(y') = 2 C - sigma_(x')$. The angle $2 theta_p$ is taken with its quadrant (from $tau_(x y)$ and $sigma_x - sigma_y$ together), so $theta_p$ always names the plane of $sigma_1$. For a three-dimensional state, the in-plane principal stresses and $sigma_z$ are sorted into $sigma_1 >= sigma_2 >= sigma_3$, three circles are drawn and the absolute maximum shear is
$ tau_"abs" = (sigma_1 - sigma_3) / 2. $

The figure has the axes, the circle, the points $X(sigma_x, tau_(x y))$ and $Y(sigma_y, -tau_(x y))$ joined through the centre $C$, the principal stresses and $tau_"max"$ marked and named and the arc of $2 theta_p$ from $C X$ to $sigma_1$. A rotation adds $X'$ and $Y'$ on a dashed diameter. The stress elements are drawn in a row under the circle, each a square turned to its angle with its normal stresses pointing out of the faces in tension and into them in compression. Its shear acts along the faces.

=== Style

#grid(
  columns: (1fr, 0.62fr),
  gutter: 14pt,
  [
    #ui[Style] has the shear axis, set for new drawings in #menu[Settings][Diagram composer][New drawings] as #ui[Mohr's circle shear axis], and #ui[Write units with siunitx]. The three conventions are,

    - #ui[τ positive downward] (the default, as in Hibbeler and Gere), where $2 theta$ on the circle turns the same way as $theta$ on the element,
    - #ui[Clockwise shear plotted above] (as in Beer and Johnston), drawn the same way with the axis pointing up and named "τ (clockwise)" and
    - #ui[τ positive upward].
  ],
  figure(frame("figures/11-forms/mohr-style.png"), caption: [The Style of a Mohr's circle.]),
)

#worked[
A web element carries $sigma_x = 80$~MPa, $sigma_y = -40$~MPa and $tau_(x y) = 25$~MPa, and the stresses on a plane turned 30° are wanted. By hand, $C = 20$~MPa and $R = sqrt(60^2 + 25^2) = 65$~MPa, so $sigma_1 = 85$~MPa, $sigma_2 = -45$~MPa and $tau_"max" = 65$~MPa, with $2 theta_p = arctan(50 slash 120) = 22.6°$. Turned by 30°, $sigma_(x') = 20 + 60 cos 60° + 25 sin 60° = 71.7$~MPa and $tau_(x' y') = -60 sin 60° + 25 cos 60° = -39.5$~MPa. @fig-forms-mohr shows the form and the figure Spectrum drew, which give the same numbers.
]

#figure(
  grid(columns: (1fr, 1.25fr), gutter: 10pt, align: horizon,
    frame("figures/11-forms/mohr-form.png"), frame("figures/11-forms/mohr-preview.png")),
  caption: [Mohr's circle for $sigma_x = 80$, $sigma_y = -40$ and $tau_(x y) = 25$~MPa, rotated 30°, with all four stress elements.],
) <fig-forms-mohr>

=== Limits

The preset draws plane stress only, with $sigma_z$ as a third principal stress rather than a full three-dimensional state with its own shear. A hydrostatic state ($sigma_x = sigma_y$ and $tau_(x y) = 0$) is a circle of no size, so its labels gather at one point. The labels are moved clear of the circle, the axes and each other, but very long units can still crowd a small circle.

== Venn diagrams <sec-forms-venn>

Venn diagram draws two or three sets as circles inside an optional universal set, with any region shaded and a count or a short text in any region. Each region is filled by its own boundary, worked out from the arcs of the circles, so a shaded region never covers its neighbours.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Kind],
    [Sets], [Two (side by side) or Three (in a triangle, the third below)], [choice],
    [First, Second and Third set's name], [The names A, B and C, in LaTeX. The third is shown with three sets. An empty name leaves the circle unnamed], [text],
    [Draw the universal set], [A frame round the sets, and the region outside every set], [switch],
    [Its name], [The universal set's name in the frame's top left corner, `$U$` to start with], [text],
    [Shading], [Grey, Blue, Red or Green, for every shaded region], [choice],
    [The regions' table], [A row for each region, with #ui[Shade] and #ui[Count or text]], [table],
  ),
  caption: [The fields of Venn diagram.],
) <tab-forms-venn>

The table, new in 2.5, has a row for each region the drawing has: three rows for two sets and seven for three, and one more for #ui[Outside every set] when the universal set is drawn. Each row is named by the sets' names as they are typed, such as "Physics and Chemistry only", or by the letters when a name is empty. A new Venn diagram shades A and B only.

=== What it draws

The circles have a radius of 1.5~cm. Each set's name is written outside its circle, up and to the left, up and to the right or down and to the right, and is moved round its circle when it would cross another circle or name. The frame grows to hold long names. A region's count is placed at the point of the region farthest from every edge and every name, which Spectrum finds on a 0.5~mm grid. There is nothing to calculate, so the preset has no working and no results switch.

#worked[
A survey of 60 first-year students asks which of Physics, Chemistry and Mathematics they take. 12 take Physics only, 8 Chemistry only, 15 Mathematics only, 4 Physics and Chemistry only, 7 Physics and Mathematics only, 3 Chemistry and Mathematics only, 5 all three and 6 none. The regions add up to 60, and @fig-forms-venn-form shows the form, with the region of all three shaded in blue. @fig-forms-venn is its figure.
]

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/venn-form1.png"), frame("figures/11-forms/venn-form2.png")),
  caption: [The form of the survey: three named sets, and the regions' table with a count in every row.],
) <fig-forms-venn-form>

#shot("figures/11-forms/venn-preview.png", [The survey's Venn diagram, with the students who take all three subjects shaded.], width: 58%) <fig-forms-venn>

=== Limits

The preset draws two or three sets only, as equal circles; it does not size the circles by their counts. Each region's text is one line. Several Venn diagrams side by side are separate drawings.

== Hydrostatic force on a gate <sec-forms-gate>

Hydrostatic force on a gate works out the resultant force of a fluid on a plane gate, where it acts and the forces on the gate's hinge and stop. The gate is rectangular or circular, at any angle from 10° to 90°, with its top edge below the free surface or above it, and it can have a second fluid on its other side. Its starting values are Tutorial 3, question 21(a) of the ENGG 2002 fluid mechanics course.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Unit and range],
    [Gate], [Rectangle or Circle], [choice],
    [Length along the gate], [Its height when it is vertical; a circle's diameter], [m, 0.01 to 1000],
    [Width], [A rectangle's width, hidden for a circle], [m, 0.001 to 1000],
    [Angle to the horizontal], [90 for a vertical gate. A sloping gate leans back under the fluid], [°, 10 to 90],
    [Depth of the top edge], [Below the free surface; negative when the top edge is above it], [m, −1000 to 1000],
    [Fluid], [Water, Seawater, Oil, Glycerin, Mercury or Air], [choice],
    [Relative density], [The fluid's relative density; 0 takes its usual one], [0 to 30],
    [Hinge], [Top edge (A) with the stop at the bottom (B); Bottom edge (A) with the stop at the top (B); None], [choice],
    [Fluid on the other side too], [Adds a second fluid behind the gate], [switch],
    [Other side's fluid, Relative density], [The second fluid, as for the first], [choice, 0 to 30],
    [Its depth at the gate's foot], [The depth of the second fluid at the bottom edge. 0 is no second fluid], [m, 0 to 1000],
    [g], [The acceleration of gravity, 9.81 to start with], [m/s², 0.1 to 100],
    [Look], [Lecture slides (tinted) or Exam paper (black and white)], [choice],
    [Write the results under the figure], [The forces and $y_p$ as lines under the figure], [switch],
  ),
  caption: [The fields of Hydrostatic force on a gate.],
) <tab-forms-gate>

The usual relative densities, used when #ui[Relative density] is 0, are water 1, seawater 1.025, oil 0.85, glycerin 1.26, mercury 13.6 and air 0. The density is then $rho = 1000 dot "RD"$~kg/m³. The same fluids and fields are used by the manometer, the tank and the floating body.

=== What it calculates

Let $xi$ run along the gate from its top edge, $theta$ be the gate's angle to the horizontal and $h(xi)$ the depth of a point of the gate below the free surface. The resultant force and its centre of pressure are
$ F_R = rho g integral h(xi) w(xi) dif xi, quad xi_p = (integral xi dif F) / F_R, $
taken over the wetted part of the gate only, where $w$ is the gate's width at $xi$ (constant for a rectangle, a chord for a circle). Spectrum evaluates both integrals with Simpson's rule on 400 strips, which is exact for a rectangle, and so gives the familiar results for a gate that is wholly under the surface,
$ F_R = rho g h_c A, quad y_p = y_c + I_(x c) / (y_c A), $
where $y_c$ and $y_p$ are measured along the gate's plane from the free surface. The figure's $y_p$ is this distance, and $h_p = y_p sin theta$ is its depth. A fluid on the other side, of depth $d_2$ at the gate's foot, is found the same way with $h_2(xi) = d_2 - (L - xi) sin theta$.

With the hinge at one edge and the stop at the other, the stop's force comes from moments about the hinge,
$ F_B = (F_(R 1) ell_1 - F_(R 2) ell_2) / L, quad F_A = F_(R 1) - F_(R 2) - F_B, $
where $ell$ is the distance from the hinge to each centre of pressure along the gate and $L$ is the gate's length. A positive force pushes back towards the first fluid. The pressures at the gate's edges, $p = rho g h$, are written at the ends of the pressure prism.

The figure has the fluid with its free surface mark ▽, the hatched wall and bed, the gate, the pressure prism drawn as arrows normal to the gate, $F_R$ in red at the centre of pressure, the hinge $A$, the stop $B$ with its force and the dimensions: the depth of the top edge, the gate's length, $y_p$ and the angle θ. A sloping gate's plane is carried up to the free surface as a dashed line, which is where $y_p$ is measured from.

=== Worked example

Tutorial 3, question 21(a): a vertical gate 3~m high and 1~m wide is hinged at its top edge, 2~m below the surface of water, and held by a ridge at its foot. By hand, $h_c = 3.5$~m, so $F_R = 9810 times 3.5 times 3 = 103.0$~kN, and $y_p = 3.5 + (1 times 3^3 slash 12) slash (3.5 times 3) = 3.714$~m. Taking moments about the hinge, $F_B = 103.0 times (3.714 - 2) slash 3 = 58.86$~kN, and the hinge carries $103.0 - 58.86 = 44.14$~kN. These are the starting values of a new gate (@fig-forms-gate-form), and @fig-forms-gate shows the same answers. The course's answer of 58.71~kN rounds $y_p$ to 3.71~m before taking moments.

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/gate-form1.png"), frame("figures/11-forms/gate-form2.png")),
  caption: [The form of the gate of Tutorial 3, question 21(a), in two parts: a new gate drawing's starting values.],
) <fig-forms-gate-form>

#shot("figures/11-forms/gate-preview.png", [The gate of Tutorial 3, question 21(a), with its pressure prism, $F_R$, $y_p$ and the stop's force, and the results under it.], width: 58%) <fig-forms-gate>

With water on one side and seawater on the other, the sluice gate of Lecture 5, Example 3 is a 5~m gate hinged 1.5~m above 3.5~m of water, with 2.5~m of seawater (RD 1.035) behind it. Spectrum gives $F_(R 1) = 60.09$~kN at $y_p = 2.33$~m and $F_(R 2) = 31.73$~kN at $y_p = 1.67$~m. Taking moments about $A$, $F_B = (60.09 times 3.83 - 31.73 times 4.17) slash 5 = 19.63$~kN, which @fig-forms-gate-exam shows in the exam paper's look.

#shot("figures/11-forms/gate-sluice-preview.png", [The sluice gate of Lecture 5, Example 3, with fluid on both sides, in the Exam paper look.], width: 80%) <fig-forms-gate-exam>

=== Limits

The gate is a plane rectangle or circle; a curved gate, a gate of another shape or a gate of several plates is not drawn. A circle is drawn side on, like a rectangle, so its shape shows only in its area. With fluid on both sides, $y_p$ is given in the results only, since its dimension line would cross the second fluid. A gate wholly above the free surface is drawn with no fluid and the results say "The gate is clear of the fluid". In the exam look, the stop's arrow at a gate's foot can sit close to the second fluid's bottom pressure.

== Manometer <sec-forms-manometer>

Manometer works out a pressure difference the way it is solved by hand: as a walk from one end of the tube to the other through up to four columns of fluid, each going down (adding $rho g h$) or up (taking it away). A U-tube, a differential manometer between two pipes, an inverted U-tube and a multi-fluid manometer are all such walks, and the tube is drawn from the walk itself. Its starting values are Lecture 4, Example 7.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Unit and range],
    [Heights in], [The unit of every column's height: m, cm or mm], [choice],
    [Start, End], [The two ends' names, in LaTeX: `$A$`, `$B$`], [text],
    [Start is, End is], [A point in a pipe or tank, or Open to the atmosphere], [choice],
    [Column 1 to Column 4], [Each column's fluid. Columns 2 to 4 also offer None, which ends the walk there and hides the columns after it], [choice],
    [Relative density], [The column's fluid's relative density; 0 takes its usual one], [0 to 30],
    [Height], [The column's height, in the unit chosen], [0 to $10^6$],
    [Going], [Down (adds ρgh) or Up (takes ρgh away)], [choice],
    [Atmospheric pressure], [For an absolute pressure when an end is open; 0 gives the gauge pressure alone], [kPa, 0 to 1000],
    [g], [The acceleration of gravity], [m/s², 0.1 to 100],
    [Look], [Lecture slides (tinted) or Exam paper (black and white)], [choice],
    [Write the results under the figure], [The pressure difference, or the pressures, under the figure], [switch],
  ),
  caption: [The fields of Manometer.],
) <tab-forms-manometer>

=== What it calculates

From the start to the end, each column adds or takes away its hydrostatic pressure,
$ P_"end" - P_"start" = sum_i plus.minus rho_i g h_i, $
with the plus sign for a column going down and the minus sign for one going up. When one end is open, its pressure is atmospheric, so the walk gives the other end's gauge pressure directly ($P_"end" = Delta P$ when the start is open, $P_"start" = -Delta P$ when the end is open), and a non-zero #ui[Atmospheric pressure] adds the absolute pressure as a second line.

The tube is drawn from the same walk. Columns going the same way share a leg of the tube, and the tube turns wherever the walk changes direction: at the bottom of a U when it was going down, filled with the denser of the two fluids there, or at the top of an inverted U when it was going up, filled with the lighter. A dashed line crosses each turn at the level where the pressures are equal. Each column is drawn in its fluid's colour with its height beside it, each fluid is named once, an end at a point is a circle with its name and an open end is carried up with the ▽ mark and the word Open.

=== Worked example

Lecture 4, Example 7 walks from $B$ in oil of RD 0.8 down 13~cm, down 8~cm of mercury, then up 31~cm of oil of RD 0.7 to $A$. By hand,
$ P_A - P_B = 9.81 (800 times 0.13 + 13600 times 0.08 - 700 times 0.31) = 9564.75 "Pa", $
and the form of @fig-forms-manometer-form gives 9565~Pa, drawn as a U-tube filled with mercury at its bottom (@fig-forms-manometer).

#figure(
  grid(columns: (1fr, 1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/manometer-form1.png"), frame("figures/11-forms/manometer-form2.png"), frame("figures/11-forms/manometer-form3.png")),
  caption: [The walk of Lecture 4, Example 7 in the form, in three parts: from B down 13 cm of oil and 8 cm of mercury, then up 31 cm of oil to A.],
) <fig-forms-manometer-form>

#shot("figures/11-forms/manometer-preview.png", [The U-tube the walk draws, with the mercury in its bend and $P_A - P_B$ under it.], width: 55%) <fig-forms-manometer>

The same form draws an inverted U-tube. Lecture 4, Example 8 walks from $M$ up 9.5~cm of water, down 3.5~cm of oil of RD 0.83, then down 18~cm of water to $N$. The walk turns at its top, so Spectrum draws an inverted U with the lighter oil in its bend (@fig-forms-manometer-inverted), and gives $P_N - P_M = 1119$~Pa: the sum of the slide's terms, $284.98 + 1765.80 - 931.95 = 1118.83$~Pa.

#shot("figures/11-forms/manometer-inverted-preview.png", [An inverted U-tube from M to N, the walk of Lecture 4, Example 8.], width: 42%) <fig-forms-manometer-inverted>

=== Limits

The walk has at most four columns. Every column is vertical, so an inclined manometer, a piezometer reading along a slope or a reservoir manometer with its two areas is not drawn; General drawing has these as symbols (@ch-circuits). When both ends are open, the walk still gives $P_"end" - P_"start"$, even though both ends are then at atmospheric pressure, so one end at most should be open.

== Accelerating tank <sec-forms-tank>

Accelerating tank draws an open rectangular tank of liquid moving with a steady acceleration $a$ at an angle above the horizontal, such as a truck braking or a tank pulled up a ramp. The free surface tilts and the liquid keeps its volume: both ends stay wet, the front of the floor dries, or the liquid spills over the rear wall, whichever happens. Its starting values are Lecture 5, Example 7 (Final 2025).

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Unit and range],
    [Length], [The tank's length along the acceleration], [m, 0.01 to 1000],
    [Height], [The tank's height], [m, 0.01 to 1000],
    [Depth at rest], [The liquid's depth before it moves; more than the height is taken as full], [m, 0 to 1000],
    [Liquid, Relative density], [The liquid, as for the gate], [choice, 0 to 30],
    [Acceleration a], [Forwards, to the right; negative when braking], [m/s², −1000 to 1000],
    [Its angle above the horizontal], [Up a ramp at 40°: 40. Down it: −40], [°, −90 to 90],
    [g], [The acceleration of gravity], [m/s², 0.1 to 100],
    [Look], [Lecture slides (tinted) or Exam paper (black and white)], [choice],
    [Write the results under the figure], [θ, the depths and the acceleration that spills], [switch],
  ),
  caption: [The fields of Accelerating tank.],
) <tab-forms-tank>

=== What it calculates

With $alpha$ the angle of the acceleration, its components and the slope of the free surface are
$ a_x = a cos alpha, quad a_z = a sin alpha, quad tan theta = a_x / (g + a_z). $
The volume is kept, so for a tank of length $L$ and depth $d_0$ at rest the depths at the high and low walls are
$ h = d_0 plus.minus L / 2 tan theta. $
When $L tan theta > 2 d_0$ the front of the floor is dry, and the liquid is a triangle wet for a length $ell = sqrt(2 L d_0 slash tan theta)$, with a depth of $ell tan theta$ at the high wall. When the high wall's depth would pass the height $H$, the liquid spills and stands at the rim. The pressure at each bottom corner is
$ p = rho (g + a_z) h. $
Lastly, the largest acceleration along the same direction that spills nothing has
$ tan theta_"max" = cases(2 (H - d_0) / L & "if" d_0 >= H / 2, H^2 / (2 L d_0) & "otherwise"), quad a_"max" = (g tan theta_"max") / (cos alpha - tan theta_"max" sin alpha), $
with the sign of the second term turned for braking. When $g + a_z <= 0$, the liquid leaves the floor and the results say so.

The figure has the tank, the level at rest dashed, the tilted surface with its ▽ mark and the angle θ where the two cross, the acceleration as an arrow above the tank, the depths at both walls, the tank's height and length and the pressures in the bottom corners.

=== Worked example

Lecture 5, Example 7: a tank 5~m long and 2~m high holds 1~m of water and accelerates at 3~m/s² up a 40° ramp. By hand, $a_x = 2.298$~m/s² and $a_z = 1.928$~m/s², so $tan theta = 2.298 slash 11.738 = 0.1958$ and $theta = 11.08°$. The surface rises $2.5 times 0.1958 = 0.489$~m at the rear, to 1.489~m, and falls to 0.511~m at the front, so the bottom pressures are $1000 times 11.738 times 1.489 = 17.48$~kPa and 5993~Pa. Since $d_0 = H slash 2$, $tan theta_"max" = 0.4$ and $a_"max" = 9.81 times 0.4 slash (cos 40° - 0.4 sin 40°) = 7.71$~m/s². @fig-forms-tank-form and @fig-forms-tank show the same. The course gives 17.49 and 5.986~kPa, as it rounds the rise to 0.49~m first.

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/tank-form1.png"), frame("figures/11-forms/tank-form2.png")),
  caption: [The form of the tank of Lecture 5, Example 7: a new tank drawing's starting values.],
) <fig-forms-tank-form>

#shot("figures/11-forms/tank-preview.png", [The tank accelerating at 3 m/s² up a 40° ramp, with θ, the depths and the corner pressures.], width: 75%) <fig-forms-tank>

=== Limits

The tank is rectangular and open, and the acceleration is in the plane of the drawing; a closed tank, a rotating tank or a tank of another shape is not drawn. The acceleration's label gives its size and the size of its angle, while the arrow shows its direction, so a tank going down a ramp reads "at 40°" with the arrow pointing down.

== Floating body and stability <sec-forms-floating>

Floating body and stability works out how deep a body floats in a liquid and whether it is stable for a small heel. The body is a block (a box seen end on) or an upright cylinder of a given relative density. Its starting values are Lecture 5, Example 5: a cube of ice of RD 0.92 in seawater.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Unit and range],
    [Body], [Block (a box, end on) or Upright cylinder], [choice],
    [Width], [Across the heel; a cylinder's diameter], [m, 0.001 to 1000],
    [Height], [The body's height], [m, 0.001 to 1000],
    [Body's relative density], [The body's relative density], [0.001 to 30],
    [Liquid, Relative density], [The liquid, as for the gate], [choice, 0 to 30],
    [Uniform body (G at mid-height)], [On: $G$ at half the height. Off: $G$ where #ui[KG] says], [switch],
    [G above the base (KG)], [The height of $G$ above the base, at most the body's height], [m, 0 to 1000],
    [Look], [Lecture slides (tinted) or Exam paper (black and white)], [choice],
    [Write the results under the figure], [The draught, $K B$, $B M$, $K G$ and $G M$ with the verdict], [switch],
  ),
  caption: [The fields of Floating body and stability.],
) <tab-forms-floating>

=== What it calculates

By Archimedes' principle, a body of height $H$ floats when its relative density is less than the liquid's, with a draught of
$ d = H "RD"_"body" / "RD"_"liquid". $
Its centre of buoyancy $B$ is at the middle of the draught, and its metacentre $M$ is $I slash V$ above $B$, where $I$ is the second moment of the waterplane about the axis of heel and $V$ is the displaced volume. For a block of width $b$ and for a cylinder of diameter $D$,
$ K B = d / 2, quad B M = I / V = cases(b^2 / (12 d) & "block", D^2 / (16 d) & "cylinder"), quad G M = K B + B M - K G, $
where $K$ is the base. The body is stable when $G M > 0$, neutral when it is 0 and unstable when it is negative. A body whose relative density is not less than the liquid's sinks, and is drawn resting on the bed with "It sinks" in its results.

The figure has the liquid with its surface mark, the body upright with $G$, $B$ and $M$ on its centre line, the weight $W$ down from $G$ and the buoyancy $F_B$ up to the base, and the draught, height and width as dimensions.

=== Worked example

A barge 6~m wide and 1.5~m high, of RD 0.4, floats in water with its centre of gravity 1.2~m above its base. By hand, $d = 1.5 times 0.4 = 0.6$~m (40~% submerged), $K B = 0.3$~m and $B M = 6^2 slash (12 times 0.6) = 5$~m, so $G M = 0.3 + 5 - 1.2 = 4.1$~m and the barge is stable. @fig-forms-floating-form shows the form with #ui[Uniform body] off and $K G = 1.2$~m, and @fig-forms-floating the same answers. The metacentre is drawn far above the barge, since its $B M$ is large for so wide a body.

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/floating-form1.png"), frame("figures/11-forms/floating-form2.png")),
  caption: [The form of the barge, with Uniform body off and its KG.],
) <fig-forms-floating-form>

#shot("figures/11-forms/floating-preview.png", [A barge 6 m wide of RD 0.4 with its centre of gravity 1.2 m above its base: $G M = 4.1$ m, stable.], width: 75%) <fig-forms-floating>

The ice cube of Lecture 5, Example 5, 2.44~m on a side in seawater, floats with $d = 2.44 times 0.92 slash 1.025 = 2.19$~m, so 0.25~m of it stands above the surface, as the lecture gives.

=== Limits

The body is drawn upright only, not heeled, and its waterplane is the body's own cross-section, so a body of another shape (a hull, a sphere, a cylinder floating on its side) is not worked out. With a small $B M$, the points $G$, $B$ and $M$ are close together and their names crowd. General drawing's fluid mechanics set has a ship's hull with $G$, $B$ and $M$ for such figures (@ch-circuits).

== Conic section <sec-forms-conic>

Conic section draws a conic from its equation and says what it is, as the MATH2150 notes do it: from the general equation
$ A x^2 + B x y + C y^2 + D x + E y + F = 0, $
or from an ellipse's, a hyperbola's or a parabola's own numbers. It classifies the conic, including the degenerate cases, turns the axes when there is an $x y$ term, completes the squares and writes the working under the figure. Its starting values are the notes' rotated ellipse, $5 x^2 + 4 x y + 5 y^2 + 20 x + 8 y - 1 = 0$. The Conics plot starter of @ch-plots, which search also finds for "conic", draws three conics as functions instead.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Range],
    [Given as], [The general equation, or An ellipse, hyperbola or parabola], [choice],
    [A, B, C, D, E, F], [The six coefficients, shown for the general equation], [−$10^6$ to $10^6$],
    [Conic], [Ellipse, Hyperbola or Parabola, for its own numbers], [choice],
    [Centre or vertex, x and y], [The centre $(h, k)$ of an ellipse or hyperbola, or a parabola's vertex], [−$10^6$ to $10^6$],
    [a], [An ellipse's semi-axis along $x$; a hyperbola's centre to a vertex; a parabola's vertex to its focus, as in $y^2 = 4 a x$], [$10^(-6)$ to $10^6$],
    [b], [An ellipse's semi-axis along $y$; a hyperbola's other semi-axis. Hidden for a parabola], [$10^(-6)$ to $10^6$],
    [Opens], [A hyperbola: Left and right, or Up and down. A parabola: To the right, To the left, Upwards or Downwards], [choice],
    [Turned by], [Anticlockwise about the centre or vertex], [°, −360 to 360],
    [Title], [A line over the figure, in LaTeX], [text],
  ),
  caption: [The fields of Conic section.],
) <tab-forms-conic>

The switches each show or hide a part of the figure,

#figure(
  table(
    columns: (auto, 1fr),
    align: (left, left),
    table.header[Switch][What it shows],
    [Foci], [The foci as red crosses, $F_1$ and $F_2$, or a parabola's $F$],
    [Vertices], [The vertices $A$ and $B$, or a parabola's vertex, as dots],
    [Directrix], [A parabola's directrix, dashed grey],
    [Asymptotes], [A hyperbola's asymptotes, dashed grey],
    [Turned axes U and V], [The turned axes, dashed through the centre or vertex, when there is an $x y$ term],
    [Coordinates beside the names], [Each named point's coordinates, as $C(-2, 0)$],
    [Numbers on the axes], [Tick numbers on the $x$ and $y$ axes, in steps of 1, 2 or 5 times a power of ten],
    [Write the working under the figure], [The classification and the working, as lines under the figure],
  ),
  caption: [The switches of Conic section. All but Coordinates beside the names are on in a new drawing.],
) <tab-forms-conic-switches>

=== What it calculates

First, the axes are turned to remove the $x y$ term. The angle $theta$, with $0 <= theta < 90 degree$, is
$ cot 2 theta = (A - C) / B, $
which turns the axes to the eigenvectors of the matrix $mat(A, B slash 2; B slash 2, C)$. Along the turned axes $u$ and $v$ the equation becomes $lambda_1 u^2 + lambda_2 v^2 + g_1 u + g_2 v + F = 0$, with
$ lambda_1 = A cos^2 theta + B sin theta cos theta + C sin^2 theta, quad lambda_2 = A sin^2 theta - B sin theta cos theta + C cos^2 theta, $
$ g_1 = D cos theta + E sin theta, quad g_2 = -D sin theta + E cos theta. $
When $B = 0$, $theta = 0$ and $u$, $v$ are simply $x$, $y$.

Then the squares are completed. When both $lambda_1$ and $lambda_2$ are non-zero,
$ lambda_1 (u - u_0)^2 + lambda_2 (v - v_0)^2 = K, quad u_0 = -g_1 / (2 lambda_1), quad v_0 = -g_2 / (2 lambda_2), quad K = g_1^2 / (4 lambda_1) + g_2^2 / (4 lambda_2) - F. $
The signs of $lambda_1 lambda_2$, which match the sign of $-(B^2 - 4 A C)$, and of $K$ then decide the conic, as @tab-forms-conic-kinds shows. For an ellipse, $a$ is the larger of $sqrt(K slash lambda_1)$ and $sqrt(K slash lambda_2)$, $c = sqrt(a^2 - b^2)$ and $e = c slash a$; for a hyperbola, $c = sqrt(a^2 + b^2)$, and its asymptotes run from the centre along $a$ times the transverse axis plus or minus $b$ times the other. When one of $lambda_1$, $lambda_2$ is zero, there is one square, $(s - s_0)^2 = -(g_l slash lambda_s)(l - l_0)$ along the squared axis $s$ and the other axis $l$, which is a parabola with $4 a = abs(g_l slash lambda_s)$, its focus $a$ from the vertex and its directrix $a$ behind it.

#figure(
  table(
    columns: (auto, auto, 1fr),
    align: (left, left, left),
    table.header[$B^2 - 4 A C$][Constant][What Spectrum says],
    [$< 0$], [$K slash lambda > 0$], [Circle (when $lambda_1 = lambda_2$) or Ellipse],
    [$< 0$], [$K = 0$], [A single point, not a curve (a degenerate ellipse)],
    [$< 0$], [$K slash lambda < 0$], [No real points, so nothing to draw],
    [$> 0$], [$K != 0$], [Hyperbola],
    [$> 0$], [$K = 0$], [Two lines that cross (a degenerate hyperbola)],
    [$= 0$], [a linear term in the other axis], [Parabola],
    [$= 0$], [no linear term, $(s - s_0)^2 > 0$], [Two parallel lines (a degenerate parabola)],
    [$= 0$], [no linear term, $(s - s_0)^2 = 0$], [One line, counted twice (a degenerate parabola)],
    [$= 0$], [no linear term, $(s - s_0)^2 < 0$], [No real points, so nothing to draw],
    [no $x^2$, $x y$ or $y^2$], [], [Not a conic: the straight line it is, or no $x$ or $y$ at all],
  ),
  caption: [How Conic section names what an equation is.],
) <tab-forms-conic-kinds>

Given by its own numbers, the conic is first written as an equation and then goes through the same steps. About its centre or vertex it is $x^2 slash a^2 + y^2 slash b^2 = 1$ for an ellipse, $x^2 slash a^2 - y^2 slash b^2 = 1$ or $y^2 slash a^2 - x^2 slash b^2 = 1$ for a hyperbola, and $y^2 = plus.minus 4 a x$ or $x^2 = plus.minus 4 a y$ for a parabola, which is then turned by #ui[Turned by] and moved to $(h, k)$. Since there is no discriminant to read and no square to complete, its working starts with its name and its standard form.

The working under the figure has a line each for the name and the discriminant, the turn, the completed squares, the standard form, and the centre, $a$, $b$, $c$ and $e$ (or the vertex, $4 a$, the focus and the directrix), with a hyperbola's asymptotes as lines $y = m x + c$. The figure draws the curve thick and teal on axes through the origin (or along the view's edge when the conic is far from it), the centre or vertex as a dot and the foci as red crosses, as the notes draw them. When there is nothing to draw, the figure says "No real points" or "Not a conic".

=== Worked example

The notes' rotated ellipse, $5 x^2 + 4 x y + 5 y^2 + 20 x + 8 y - 1 = 0$, has $B^2 - 4 A C = 16 - 100 = -84 < 0$. Since $A = C$, $cot 2 theta = 0$ and $theta = 45°$, which gives $lambda_1 = 7$, $lambda_2 = 3$, $g_1 = 14 sqrt(2)$ and $g_2 = -6 sqrt(2)$. Completing the squares,
$ 7 (u + sqrt(2))^2 + 3 (v - sqrt(2))^2 = 21, quad "that is" quad (u + sqrt(2))^2 / 3 + (v - sqrt(2))^2 / 7 = 1, $
an ellipse with $a = sqrt(7) = 2.646$, $b = sqrt(3) = 1.732$, $c = 2$ and $e = 0.7559$, centred at $(-2, 0)$ in the original axes with its major axis along $V$. These are a new Conic section drawing's starting values (@fig-forms-conic-form), and @fig-forms-conic shows the same working under the figure.

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/conic-form1.png"), frame("figures/11-forms/conic-form2.png")),
  caption: [The form of a new Conic section drawing: the notes' rotated ellipse, with its switches.],
) <fig-forms-conic-form>

#shot("figures/11-forms/conic-preview.png", [The notes' rotated ellipse, with the turned axes U and V and the working under it.], width: 46%) <fig-forms-conic>

Given by its own numbers instead, a hyperbola centred at $(1, -1)$ with $a = 2$ and $b = 1.5$, opening left and right, has $c = sqrt(4 + 2.25) = 2.5$ and $e = 1.25$, foci at $(-1.5, -1)$ and $(3.5, -1)$ and asymptotes $y + 1 = plus.minus 0.75 (x - 1)$. With #ui[Given as] set to #ui[An ellipse, hyperbola or parabola], #ui[Conic] to #ui[Hyperbola], the centre to $(1, -1)$, #ui[a] to 2 and #ui[b] to 1.5, @fig-forms-conic-standard shows the same with #ui[Coordinates beside the names] on.

#shot("figures/11-forms/conic-standard-preview.png", [A hyperbola given by its centre, $a$ and $b$, with each point's coordinates.], width: 50%) <fig-forms-conic-standard>

=== Limits

A hyperbola's branches are drawn for $abs(t) <= 1.5$ in $(a cosh t, b sinh t)$ and a parabola for four focal lengths each side of its axis, so a very flat or very open curve may look short. The view always fits the curve, so a very large or very small conic is drawn the same size with different numbers on the axes. The switches for a part the conic does not have (the directrix of an ellipse, say) do nothing.

== Linear transformation <sec-forms-transformation>

Linear transformation draws what a 2×2 matrix does to the plane: the unit square, or the unit square on a grid, before and after, the images of the basis vectors $bold(e)_1$ and $bold(e)_2$, the determinant and the real eigenvectors. Its figures follow the MATH2150 notes: the original as a blue dashed outline, its image red and thick over a light red fill, and the eigenvectors' lines grey. Its starting matrix is the notes' shear then stretch, $mat(1, 1; 0, 2)$.

=== The form

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: (left, left, left),
    table.header[Field][Meaning][Range],
    [a₁₁, a₁₂, a₂₁, a₂₂], [The matrix $mat(a_(11), a_(12); a_(21), a_(22))$. Its columns are where $bold(e)_1$ and $bold(e)_2$ go], [−1000 to 1000],
    [Its name], [The matrix's name in the labels and the working, as maths without the dollar signs: A, R, `H_x`], [text],
    [Before and after], [The unit square, or The unit square on a grid (from −2 to 2)], [choice],
    [Images of e₁ and e₂], [$bold(e)_1$ and $bold(e)_2$ in blue and their images in red], [switch],
    [Eigenvectors], [Each real eigenvector's line through the origin, with $bold(v)$ and $A bold(v)$ along it], [switch],
    [Numbers on the axes], [Tick numbers on the axes], [switch],
    [Write the working under the figure], [The columns, the determinant and the eigenvalues], [switch],
  ),
  caption: [The fields of Linear transformation.],
) <tab-forms-transformation>

=== What it calculates

For $A = mat(a, b; c, d)$, the images of the basis vectors are the columns, $A bold(e)_1 = (a, c)$ and $A bold(e)_2 = (b, d)$, and the determinant is $det A = a d - b c$. The working says what it means for areas: they are kept when $abs(det A) = 1$ and otherwise multiplied by $abs(det A)$, the plane is turned over when $det A < 0$, and a singular matrix squashes the plane onto a line, or onto the origin for the zero matrix.

The eigenvalues are the roots of the characteristic polynomial,
$ lambda^2 - (op("tr") A) lambda + det A = 0, quad lambda = (op("tr") A plus.minus sqrt((a - d)^2 + 4 b c)) / 2. $
When the discriminant $(a - d)^2 + 4 b c$ is negative there are no real eigenvectors, and the working gives $lambda$ as a complex pair. When it is zero, $lambda$ is repeated, with one line of eigenvectors, or every vector when $A = lambda I$. Each eigenvector is found at right angles to the longer row of $A - lambda I$ and written as the course writes one, with its smaller part $plus.minus 1$ and its first part positive, as $(1, -2)$. A vector that the matrix leaves where it is gets one arrow with both names, as $A bold(e)_1 = bold(e)_1$.

=== Worked example

The notes' matrix $A = mat(4, 1; 2, 3)$ sends $bold(e)_1$ to $(4, 2)$ and $bold(e)_2$ to $(1, 3)$, and $det A = 12 - 2 = 10$, so areas are multiplied by 10. Its characteristic polynomial is $lambda^2 - 7 lambda + 10 = (lambda - 5)(lambda - 2)$, so $lambda_1 = 5$ with $bold(v)_1 = (1, 1)$ and $lambda_2 = 2$ with $bold(v)_2 = (1, -2)$. @fig-forms-transformation-form shows the form with the grid, and @fig-forms-transformation the figure with the same working.

#figure(
  grid(columns: (1fr, 1fr), gutter: 10pt, align: top,
    frame("figures/11-forms/transformation-form1.png"), frame("figures/11-forms/transformation-form2.png")),
  caption: [The form of $mat(4, 1; 2, 3)$ on a grid.],
) <fig-forms-transformation-form>

#shot("figures/11-forms/transformation-preview.png", [$mat(4, 1; 2, 3)$ on the unit square and grid, with the images of $bold(e)_1$ and $bold(e)_2$ and the eigenvectors $(1, 1)$ and $(1, -2)$.], width: 48%) <fig-forms-transformation>

When #ui[Images of e₁ and e₂] is on, the eigenvectors are teal and orange so that they stand apart from the basis vectors; with it off, they are red and blue, as in the notes.

=== Limits

The preset is for 2×2 matrices only. The grid runs from −2 to 2, and the view fits everything drawn, so a matrix with one large entry (such as $mat(1000, 0; 0, 0.001)$) is drawn with the square too thin to see. Complex eigenvalues are given in the working but have no line to draw.

== Summary <sec-forms-summary>

In summary, Spectrum 2.5 has eight Form presets: Mohr's circle, Venn diagram, Hydrostatic force on a gate, Manometer, Accelerating tank, Floating body and stability, Conic section and Linear transformation. Each takes a problem's numbers in a form, works out its answers with the formulae in this chapter and draws them, with the working under the figure and in the file's comments. Their numbers were checked against the worked examples of the courses they come from, and the check files `fluids.check.ts`, `maths.check.ts`, `mohr.check.ts` and `venn.check.ts` in `apps/frontend/src/diagram/modes/form` keep them so.
