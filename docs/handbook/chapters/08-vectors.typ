#import "../template.typ": *

// Two screenshots side by side at part of the text's width, as #shots sets them at all of it.
#let pair(paths, caption, width: 66%) = figure(box(width: width, grid(columns: paths.len(), gutter: 10pt, ..paths.map(p => frame(p)))), caption: caption)

// A figure from the composer's PDF at the size it prints, narrowed only to fit the page (paths from docs/handbook, as frame takes them).
#let printed(path, caption) = figure(layout(size => frame(path, width: calc.min(measure(image("../" + path)).width, size.width))), caption: caption)

// Several figures from the composer's PDF in a row, each at its printed size times `scale`, each with a small caption under it.
#let gallery(items, caption, scale: 100%) = figure(
  grid(
    columns: items.len(),
    gutter: 10pt,
    align: bottom,
    ..items.map(((path, name)) => layout(size => {
      let w = measure(image("../" + path)).width * scale
      stack(spacing: 5pt, frame(path, width: calc.min(w, size.width)), align(center, text(size: 0.86em, name)))
    })),
  ),
  caption: caption,
)

= Vector diagrams <ch-vectors>

The Vector diagrams composer draws points, vectors and the lines between them on a centimetre grid. It is meant for mechanics and mathematics courses: a free-body diagram, the triangle and parallelogram laws of vector addition, the components of a force, position vectors on axes and, since Spectrum 2.5, the figures of a geometry or vectors course, such as the medians of a triangle, the angle between two vectors or a line from its equation. Its points can be free or constructed from others, such as a midpoint or the tip of $upright(bold(u)) + upright(bold(v))$, and a constructed point follows its parents when they move. The figure is written into the project as TikZ with a named coordinate for each point.

The chapter first shows how to start a drawing and how the canvas works. It then walks through the rail's three groups of tools: drawing, axes and marks, and constructions. The later sections cover panels, editing several items at once, how labels are placed, how vector names are written and the code the composer writes. What every composer shares is in @ch-composer.

#shot("images/08-vectors/composer.jpg", [The Vector diagrams composer with a block on an incline. The rail is on the left, the canvas and the compiled preview in the middle and the table of the points' coordinates on the right. The pointer's place on the grid shows beside the zoom.]) <fig-vectors-composer>

== Starting a vector diagram <sec-vectors-start>

Open #ui[Draw a diagram] in the top bar of a project and pick a card under #menu[Mathematics][Geometry and vectors], or search for vector (@fig-vectors-chooser). #ui[Vector diagram] opens an empty drawing, while the other fourteen starters open a figure already drawn (@tab-vectors-starters, @fig-vectors-starters).

#shot("images/08-vectors/chooser.png", [#ui[Draw a diagram] searched for vector. The vector diagram starters follow the plots and the model architecture that the word also finds.], width: 72%) <fig-vectors-chooser>

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    [Starter], [What it holds],
    [Vector diagram], [An empty drawing],
    [Line through two points], [A line through U and V with their position vectors $upright(bold(u))$ and $upright(bold(v))$ and the direction $upright(bold(d)) = upright(bold(v)) - upright(bold(u))$],
    [Dividing a segment in a ratio], [M on AB with AM : MB = 1 : 2, and the vectors $upright(bold(a))$, $upright(bold(b))$ and $upright(bold(m))$ from O],
    [Midpoints of a triangle], [PQ joining the midpoints of OA and OB, parallel to AB and half as long],
    [Projections], [The projection of $upright(bold(b))$ onto $upright(bold(a))$ in three panels: acute, right and obtuse],
    [Free-body diagram on a block], [A block with its weight, the normal reaction, a pull and friction],
    [Triangle law], [$upright(bold(b))$ drawn from the tip of $upright(bold(a))$, and the resultant $upright(bold(a)) + upright(bold(b))$],
    [Parallelogram law], [$upright(bold(a))$ and $upright(bold(b))$ from one point, the dashed sides and the diagonal $upright(bold(a)) + upright(bold(b))$],
    [Force polygon], [Four forces head to tail and the resultant closing the polygon],
    [Position vectors with i and j], [P(3, 2) with $upright(bold(r)) = 3 upright(bold(i)) + 2 upright(bold(j))$ and the unit vectors $upright(bold(i))$ and $upright(bold(j))$],
    [Medians of a triangle], [The medians meeting at the centroid G, each side's halves ticked alike],
    [Angle between two vectors], [$theta$ between $upright(bold(a))$ and $upright(bold(b))$, with $cos theta$ from their dot product],
    [Line from its equation], [$2x + 3y - 6 = 0$ with its intercepts and its normal $upright(bold(n))$],
    [Scalar multiples], [$upright(bold(v))$ with $2 upright(bold(v))$, $-upright(bold(v))$ and $1/2 upright(bold(v))$ beside it, following $upright(bold(v))$ as it moves],
  ),
  caption: [The vector diagram starters in #ui[Draw a diagram].],
) <tab-vectors-starters>

#gallery(
  (
    ("images/08-vectors/starter-free-body.png", [Free-body diagram]),
    ("images/08-vectors/starter-triangle-law.png", [Triangle law]),
    ("images/08-vectors/starter-parallelogram-law.png", [Parallelogram law]),
    ("images/08-vectors/starter-force-polygon.png", [Force polygon]),
  ),
  [Four of the starters as the PDF draws them.],
  scale: 70%,
) <fig-vectors-starters>

A new drawing draws its vectors very thick, as mechanics figures usually do, and takes its vector names from #menu[Settings][Diagram composer] (@sec-vectors-names).

== The canvas <sec-vectors-canvas>

The canvas draws the figure at the scale set under #menu[Style][Scale], with its lines, arrow tips, dots and labels at the size they will print. Coordinates are in centimetres with y up, so a point at (3, 2) prints 3~cm right of and 2~cm above the origin when the scale is 1.

=== The centimetre grid and the origin

Points snap to a grid, every 0.5~cm by default, and #menu[Style][Grid] changes it to 0.25 or 1~cm. The background is the one chosen in #menu[Settings][Diagram composer], with a larger mark every centimetre so that lengths can be counted, and the lines x = 0 and y = 0 drawn darker so the origin is always in sight. While the pointer is over the canvas, its place on the grid shows beside the zoom as (x, y), which is where a click would put a point (@fig-vectors-composer).

A point placed at the origin is named O and labelled below and to its left, where it is usually written. Other points are named A, B, C and so on, skipping O, in the order they are made. Points also snap to each other, so a click near a point picks that point rather than making a new one.

=== The coordinates table and the panels

With nothing selected, the inspector shows the table of every point's coordinates and the drawing's panels (@fig-vectors-coordinates). A free point's x and y can be typed there exactly. A constructed point's place is worked out from its parents, so it is shown in grey and cannot be typed. The panels are described in @sec-vectors-panels.

#shot("images/08-vectors/coordinates.png", [The inspector with nothing selected. O, A and B are free points, while S is constructed as the tip of $upright(bold(a)) + upright(bold(b))$ and shows its place, (5.5, 4), in grey.], width: 34%) <fig-vectors-coordinates>

== The rail <sec-vectors-rail>

The rail holds the tools in three groups (@fig-vectors-rail). #ui[Find a tool] at its top narrows the list as you type, and each tool's tooltip says what to click. Most tools pick points one after another: click a point already there, or an empty spot, which makes a new point there. A point made this way by a tool other than #ui[Point] has no dot or letter, so it does not clutter the figure. Give it a label in the inspector if it needs one.

The line at the bottom left of the canvas says which point the tool wants next, such as “Click where the vector starts”. #key("Esc") part way through starts the tool again, keeps it picked and takes away the points it had made, while #key("Esc") with nothing picked goes back to #ui[Select].

#figure(
  grid(
    columns: (46%, 1fr),
    gutter: 14pt,
    frame("images/08-vectors/rail.png"),
    align(left + horizon, table(
      columns: (auto, 1fr),
      align: left,
      [Group], [Tools],
      [Drawing], [Point (#key("P")), Vector (#key("V")), Segment, Line through two points, Line from its equation, Circle, Arc, Polygon, Text],
      [Axes and marks], [Axes, Angle, Right-angle mark, Equal-length ticks, Drop to an axis, Drop to both axes, Highlighted segment],
      [Constructions], [Midpoint, Point dividing a segment, Foot of a projection, Intersection of two lines, u + v, v − u, Scalar multiple, Vector placed at a point, Reflection in a line, Parallel through a point, Perpendicular through a point],
    )),
  ),
  caption: [The Vector diagrams rail and its groups.],
) <fig-vectors-rail>

=== The P and V keys

#key("P") picks #ui[Point] and #key("V") picks #ui[Vector] while the pointer is over the drawing, so a figure can be drawn without going back to the rail. Elsewhere the keys type as usual. Both are shown in their tools' tooltips and can be changed in #menu[Settings][Diagram composer] (@ch-composer).

== Points <sec-vectors-points>

#ui[Point] places a point with a dot and its letter where you click, and stays picked for the next one. A point is the basis of everything else in the drawing: a vector, a line or a circle is drawn between points, so it follows them when they move.

Click a point to select it (@fig-vectors-point). Its inspector has the following,

- *Name*, the point's coordinate name in the code, in letters and digits. A name another point in the same panel already has is not taken, and the hint says which point has it,
- *Label*, the text written beside it in LaTeX, such as `$A$` or `$U(2,5)$`. A label that is the point's name follows the name when it changes,
- *Side*, where the label goes: #ui[Where it's clear] (@sec-vectors-labels) or one of eight sides, such as #ui[Above right],
- *Dot*, whether the point is drawn as a dot,
- *Position*, its x and y in centimetres, for a free point, and
- the fold *Dot and label look*, which opens by itself when one of its fields is set: the dot's *Shape* (Filled, Open or Cross), *Size* (its radius in pt, the Style's until changed) and *Colour*, and the label's *Distance* from the point in pt (once it has a side), *Size* (`\tiny` to `\Large`) and *Text colour*.

A constructed point has no Position. Instead, its inspector says what it is built from, such as "The tip of u + v, with u and v from O to A and B", and where it is now.

#pair(("images/08-vectors/inspector-point.png", "images/08-vectors/inspector-constructed.png"), width: 52%, [The inspector of free point A with its fold open (left) and of the constructed point S (right). The #ui[Turn and mirror] fold is described in @sec-vectors-groups.]) <fig-vectors-point>

== Vectors and lines <sec-vectors-lines>

Four tools draw a line between two points: click where it starts and where it ends, or drag from one to the other.

- *Vector* (#key("V")) draws an arrow from the first point to the second.
- *Segment* draws a plain line between them.
- *Line through two points* draws the whole line through them, running out to the panel's axes, or to a centimetre beyond its points when it has none.
- *Highlighted segment* draws a thick, light blue line, as a projection is marked on a slide.

Each one's inspector starts with its *Kind*, which changes it to another of the four, then its *Colour*, *Thickness*, *End tip* and *Label* with its *Side* (@fig-vectors-vector). The fold *Dashes, tips, ticks and label look* holds the rest and opens by itself when one of them is set. @tab-vectors-line lists them all. #ui[Reverse] swaps the two ends, so a vector points the other way.

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    [Field], [What it sets],
    [Colour], [A swatch, any xcolor name or mix typed in (such as `blue!50` or `green!60!black`), a colour picked, or #ui[As in Style]],
    [Thickness], [#ui[As in Style], one of TikZ's widths from Ultra thin to Ultra thick, or #ui[In pt] for a width in points],
    [End tip], [#ui[As in Style] for a vector, None, Stealth, Latex, To, Triangle, Open triangle or Bar],
    [Label], [The text along it, in LaTeX, such as `$\mathbf{a}$` or `$\frac{1}{2}\mathbf{b}$`],
    [Side], [#ui[Where it's clear], #ui[Beside the arrow, left or right], or one of eight sides],
    [Dashes], [Solid, Dashed, Dotted, Dash dot, or Custom with its on and off lengths in pt],
    [Opacity], [From 1, solid, to 0, unseen],
    [Start tip, Double-headed], [A tip at the start as well, or the end's tip at both ends],
    [Arrow at the middle], [An arrowhead halfway along, pointing the way the line runs],
    [Tip size], [The tips' size, where 1 is the usual one, and the Style's until changed],
    [Equal-length ticks], [None, one, two or three ticks across its middle],
    [Along it], [Where the label sits, from 0 at the start to 1 at the end],
    [Size, Text colour], [The label's size and colour],
  ),
  caption: [The fields of a vector, segment or line.],
) <tab-vectors-line>

#pair(("images/08-vectors/inspector-vector.png", "images/08-vectors/inspector-axes.png"), width: 46%, [The inspector of the vector $upright(bold(a)) + upright(bold(b))$ with its fold open (left) and of the axes (right).]) <fig-vectors-vector>

=== Other drawing tools

- *Line from its equation*: click a panel. It draws the line $x + 2y - 4 = 0$, out to the panel's axes or edge, with its intercepts marked by crosses and labelled with their coordinates. Type its coefficients a, b and c into the inspector's #ui[ax + by + c = 0]. The equation written as its label, and the intercepts' labels, follow the coefficients as long as they are still the ones the composer wrote.
- *Circle*: click the centre, then a point on the circle. Its inspector's *Radius* moves the point it goes through, unless that point is constructed. It also takes a *Fill* and a *Fill opacity*.
- *Arc*: click the centre, then where the arc starts and where it ends, going anticlockwise. #ui[Other part] draws the rest of the circle instead.
- *Polygon*: click each corner, then the first corner again, or press #key("Return"), to close it. It takes a fill as a circle does.
- *Text*: click to place a piece of text, then type it in the inspector in LaTeX. Its size and colour are under a fold.

== Axes and marks <sec-vectors-marks>

- *Axes*: click a panel to give it x and y axes through its origin, reaching a little past its points. Its inspector (@fig-vectors-vector) sets where each axis starts and ends, the axes' names (`$x$` and `$y$`), and switches for *Ticks and numbers* at each whole number but 0, *O at the origin* and a *Grid* behind. Its fold holds the tick *Step* and *Tick length*, the *Number size*, the axes' *Colour*, *Thickness* and *Arrow tips*, and the grid's colour and thickness.
- *Angle*: click the corner, then a point on each side. The arc marks the angle of less than a half turn between the sides, with $theta$ beside it. Its inspector sets the *Label*, the *Radius* (0.6~cm by default) and a *Double arc*, and under its fold an *Arrow, for a turn* and the arc's look. #ui[Other side] marks the rest of the turn instead.
- *Right-angle mark*: click the corner, then a point along one side. #ui[On the other side] turns the mark to the other side of that line.
- *Equal-length ticks*: click both ends of a segment or a vector. The first click on a line adds one tick, and clicking it again adds a second and a third, as the sides of a triangle are marked equal. Two points with no line between them get a segment with one tick.
- *Drop to an axis*: click a point to drop a dashed line straight down to the x axis. #ui[To the] in its inspector changes it to the y axis or both.
- *Drop to both axes*: click a point to drop dotted lines to both axes, in the point's colour, as slides read off a point's coordinates.

The starters show each of these in use: @fig-vectors-geometry has the medians' equal-length ticks, an angle, a line from its equation with its intercepts, and axes with ticks.

#gallery(
  (
    ("images/08-vectors/starter-medians.png", [Medians of a triangle]),
    ("images/08-vectors/starter-angle.png", [Angle between two vectors]),
    ("images/08-vectors/starter-line-equation.png", [Line from its equation]),
  ),
  [Three of the geometry starters added in Spectrum 2.5.],
  scale: 85%,
) <fig-vectors-geometry>

== Constructions <sec-vectors-constructions>

A construction makes a point from points already there, and keeps it exact: each time a parent moves, the constructed point is worked out again, in the composer and in the code. @tab-vectors-constructions lists the eleven constructions with the points each one asks for.

#figure(
  table(
    columns: (24%, 26%, 50%),
    align: left,
    [Construction], [Click], [What it makes],
    [Midpoint], [A, then B], [The midpoint of AB, with a dot and a letter],
    [Point dividing a segment], [A, then B], [The point M with AM : MB = 1 : 2. Its inspector sets the ratio m : n, and #ui[Ratio labels] writes m and n beside each part of the segment],
    [Foot of a projection], [P, then two points on the line], [The foot of the perpendicular from P to the line],
    [Intersection of two lines], [Two points on each line], [Where the two lines cross. It has no place while they are parallel],
    [u + v], [The tips of $upright(bold(u))$ and $upright(bold(v))$], [The tip of $upright(bold(u)) + upright(bold(v))$, drawn as a vector from O when the panel has an O],
    [v − u], [The tips of $upright(bold(u))$ and $upright(bold(v))$], [The tip of $upright(bold(v)) - upright(bold(u))$, drawn the same way],
    [Scalar multiple], [The tail and tip of a vector], [The vector times 2, drawn from the same tail and labelled $2 upright(bold(v))$. Its inspector's *k* takes any number: −1 turns it round and 0.5 halves it, and the label follows],
    [Vector placed at a point], [The tail and tip of a vector, then a point], [The same vector drawn again from the point, with the same name],
    [Reflection in a line], [P, then two points on the mirror line], [The reflection of P in the line],
    [Parallel through a point], [Two points on a line, then a point], [The line through the point parallel to the first],
    [Perpendicular through a point], [Two points on a line, then a point], [The line through the point square to the first],
  ),
  caption: [The constructions, in the order they appear on the rail.],
) <tab-vectors-constructions>

A vector's name in a construction's label, such as the $upright(bold(v))$ of $2 upright(bold(v))$, is the label of the vector already drawn between the two points when there is one. Otherwise it is the lower-case letter of a position vector from O, such as $upright(bold(a))$ for $arrow("OA")$, or both points' letters, such as $upright(bold("AB"))$.

=== Resultants and components

The constructions cover the usual figures of vector addition and resolution. For example, @fig-vectors-sum is drawn as follows,

#howto[draw the sum of two vectors][
+ Place O at the origin and the points A and B with #key("P")
+ Draw $upright(bold(a))$ from O to A and $upright(bold(b))$ from O to B with #key("V")
+ Pick #ui[u + v] and click A, then B. The resultant $upright(bold(a)) + upright(bold(b))$ is drawn from O to the new point
+ Draw dashed segments from A and B to the new point for the parallelogram
+ Pick #ui[Drop to both axes] and click the new point to read off its components on the axes
]

Moving A or B then moves the resultant and the parallelogram with it. For the components of a force along and across a slope, as in @fig-vectors-incline, draw each component as a dashed vector from the force's tail, or use #ui[Foot of a projection] to find the tip of a component on a line.

#grid(
  columns: (1fr, 1fr),
  gutter: 12pt,
  [#printed("images/08-vectors/vector-sum.png", [The parallelogram law with the resultant constructed as $upright(bold(a)) + upright(bold(b))$ and dropped to both axes.]) <fig-vectors-sum>],
  [#printed("images/08-vectors/incline.png", [A block on a 30° incline with its weight, the normal reaction, friction and the components $W sin theta$ and $W cos theta$ dashed.]) <fig-vectors-incline>],
)

== Panels <sec-vectors-panels>

A drawing can hold several diagrams side by side, each in a panel with a caption under it, as the Projections starter shows its acute, right and obtuse cases (@fig-vectors-panels). The panels are listed under the coordinates table when nothing is selected (@fig-vectors-coordinates).

- #ui[Add a panel] adds one to the right of the last, captioned (b), (c) and so on, and captions the first (a) if it has no caption.
- Each panel's *caption* can be changed, and each panel after the first has a *Shift*, how far right of the first it sits, in centimetres.
- The bin button beside a panel deletes it and everything in it.

Each panel has its own origin and its own point names, so every panel can have an O and an A. The code writes each panel as a scope shifted right, with its caption under it.

#printed("images/08-vectors/starter-projections.png", [The Projections starter: three panels with their captions, each with a right-angle mark, a drop and a highlighted segment for the projection.]) <fig-vectors-panels>

== Selecting and editing several items <sec-vectors-groups>

Selecting works as in every composer (@ch-composer). In Vector diagrams a selection can also be moved, turned and mirrored as a whole.

- Drag across empty space to select what is inside the box, hold #key("Shift") to add to the selection and press #key("⌘", "A") to select everything.
- Drag the selection to move it. The arrow keys move it one grid step, or a tenth of one with #key("Shift").
- #key("R") turns it a quarter turn anticlockwise, or an eighth with #key("Shift"). #key("X") mirrors it left to right and #key("Y") top to bottom.
- Hold #key("Space") and drag, or drag with the middle button, to pan.

The inspector's fold #ui[Turn and mirror] turns the selection by any angle typed in, anticlockwise about its middle, and mirrors it. With several items selected, the inspector also sets the *Colour* of everything that takes one and the *Thickness* of every line at once (@fig-vectors-group). #ui[As in Style] gives each item its own default again.

#shot("images/08-vectors/inspector-group.png", [The inspector with every item of @fig-vectors-sum selected.], width: 34%) <fig-vectors-group>

== How labels are placed <sec-vectors-labels>

A label's #ui[Side] says where it goes. Most labels can be left at #ui[Where it's clear], the default for a new label. The composer then places the label where it touches no line, dot, arc or other label, starting where Spectrum 2.4 put it (above and to the right of a point, above a line) and moving it round its point only when that place touches something. Specifically, it measures each label's text as LaTeX sets it at the Style's scale and tries the eight sides around the point, moving a little further out each time, as Structures does (@ch-structures). A label that has a side of its own, the tick numbers, the axis names, the angle labels, text and captions stay where they are, and the placed labels keep clear of them.

#ui[Beside the arrow, left or right] keeps a vector's or line's label beside it on whichever side is clear, which suits a steep vector. It is written as TikZ's `auto` or `auto, swap`, so the label stays beside the line in the code as well. The code writes each placed label on the side the composer chose, such as `above=2.8pt`, and the canvas draws it there, so the canvas and the PDF agree.

The canvas shows labels as they print, with real subscripts, bold vectors, an arrow over `\vec` and `\parallel` as ∥.

== Vector names <sec-vectors-names>

A vector's name is usually typed in bold, as `$\mathbf{a}$`. #menu[Style][Vector names] writes every `\mathbf{…}` in the drawing's labels, text and captions in the way a course prefers, without retyping any label (@fig-vectors-names).

#figure(
  table(
    columns: (auto, auto, auto),
    align: left,
    [Vector names], [Writes], [Package],
    [Bold, `\mathbf{a}`], [`\mathbf{a}`, as typed], [none],
    [Arrow, `\vec{a}`], [`\vec{a}`], [none],
    [Long arrow, `\overrightarrow{OA}`], [`\overrightarrow{a}`], [none],
    [esvect, `\vv{a}`], [`\vv{a}`], [esvect],
  ),
  caption: [The four ways of writing a vector's name.],
) <tab-vectors-names>

The choice rewrites every `\mathbf`, so a bold letter that is not a vector, such as a matrix, should be typed as `\boldsymbol{…}`, which the choice leaves alone. #ui[Insert as figure] adds esvect to the document when the drawing uses `\vv`. #menu[Settings][Diagram composer][Vector names] sets the choice for new drawings, and each drawing keeps its own (@fig-vectors-settings).

#gallery(
  (
    ("images/08-vectors/notation-bold.png", [Bold]),
    ("images/08-vectors/notation-vec.png", [Arrow]),
    ("images/08-vectors/notation-arrow.png", [Long arrow]),
    ("images/08-vectors/notation-vv.png", [esvect]),
  ),
  [Part of the drawing of @fig-vectors-sum with each of the four vector names. Only the Style changed.],
  scale: 100%,
) <fig-vectors-names>

#shot("images/08-vectors/settings-vector-names.png", [#menu[Settings][Diagram composer][Vector names], the choice for new vector diagrams.], width: 70%) <fig-vectors-settings>

== Style <sec-vectors-style>

#ui[Style] in the composer's toolbar opens the drawing's own settings (@fig-vectors-style). Under #ui[Drawing defaults] are the looks every item takes until it has its own, so an item changed by hand keeps its own look when the defaults change.

#figure(
  grid(
    columns: (32%, 1fr),
    gutter: 14pt,
    frame("images/08-vectors/style.png"),
    align(left + top, table(
      columns: (35%, 65%),
      align: left,
      [Option], [What it does],
      [Scale], [The whole picture, as TikZ's scale, from 0.2 to 5: 1.1 is a tenth larger],
      [Grid], [The canvas's grid step: 0.25, 0.5 or 1~cm],
      [Arrow tip], [The tip of every vector and axis without its own: Stealth, Latex, To, Triangle, Open triangle or Bar],
      [Tip size], [Their size, 1 the usual],
      [Vector thickness], [The thickness of vectors, Very thick in a new drawing],
      [Line thickness], [The thickness of segments, lines, polygons and marks],
      [Colour], [The colour of lines, polygons and points],
      [Point size], [A dot's radius in pt, 2 by default],
      [Vector names], [How each `\mathbf{…}` is written (@sec-vectors-names)],
    )),
  ),
  caption: [The Style menu of a vector diagram, and what each option does.],
) <fig-vectors-style>

== The code it writes <sec-vectors-code>

Vector diagrams writes the figure as TikZ in the way these figures are written by hand (@fig-vectors-code). The drawing is a standalone document in `diagrams/`, which the document brings in with `\includestandalone` (@ch-composer).

- Each point is a named `\coordinate`, such as `\coordinate (A) at (4,1);`. A constructed point is written with the calc library, so it stays exact in the code too: the tip of $upright(bold(a)) + upright(bold(b))$ is `($(A)+(B)-(O)$)` and a midpoint `($(A)!0.5!(B)$)`.
- A vector is `\draw[->, very thick] (O) -- (A)`, with its label as a node along it, and a dot is `\fill (A) circle (2pt)` with the point's label as its node.
- An angle is TikZ's `angle` pic on its three points, so it follows them as well. A circle, an arc and a line from its equation are written with the numbers they have now, as a line through two points is.
- Each panel after the first is a scope shifted right, with its caption under it.
- The libraries are loaded only when something needs them: `calc` for constructions, `arrows.meta` for tips other than the Style's, `decorations.markings` for middle arrows and ticks, and `angles` for angles.

#shot("images/08-vectors/code.png", [The Code tab of @fig-vectors-sum: the named coordinates, S constructed with calc, then the axes, the lines and the vectors.], width: 92%) <fig-vectors-code>

A drawing that uses something added in 2.5 (an angle, a circle or arc, a line from its equation, a drop to both axes, equal-length ticks, a label beside its arrow, a vector name other than bold, an intersection, a scalar multiple, a reflection or a perpendicular) is saved as file version 5, which Spectrum 2.4 and earlier open as code.
