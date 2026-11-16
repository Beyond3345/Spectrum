#import "../template.typ": *

= Flowcharts, commutative diagrams and Mermaid <ch-flow>

This chapter covers the composers for diagrams made of boxes, objects and the arrows between them. It is for anyone who draws an algorithm, a process, a control loop, a state machine or a diagram from category theory, and for anyone who would rather write a diagram as text and let it lay itself out. The chapter is divided into five parts. First it helps you choose a composer (@sec-flow-choose). Then it walks through the flowchart composer, which draws on one canvas for both LaTeX and Typst (@sec-flow-flowchart), and what is particular to its Typst drawings, written with the fletcher package (@sec-flow-fletcher). Then it covers commutative diagrams in tikz-cd (@sec-flow-cd). Lastly it covers Mermaid, whose diagrams are written as code and drawn as you type (@sec-flow-mermaid).

What every composer shares, such as opening the composer, the frame around the canvas, the background grid, the tool keys, the Code tab, the preview and saving, is described in @ch-composer and not repeated here.

== Choosing a composer <sec-flow-choose>

Each composer is opened from its starters in #ui[Draw a diagram]. A starter is a drawing to begin from, either empty or already drawn. @tab-flow-composers lists the four composers this chapter covers, what each writes and the starters that open it.

#figure(
  table(
    columns: (auto, auto, 1fr),
    align: left,
    table.header[Composer][Writes][Starters],
    [Flowchart], [TikZ, as `diagrams/<name>.tex`], [Flowchart, Decision flowchart, Feedback loop, Swimlane process, State machine, Model architecture],
    [Flowchart in Typst], [fletcher, as `diagrams/<name>.typ`], [Flowchart in Typst, State machine in Typst, Model architecture in Typst],
    [Commutative diagram], [tikz-cd, as `diagrams/<name>.tex`], [Commutative diagram, Commutative square, Pullback, Short exact sequence],
    [Mermaid diagram], [Mermaid, as `diagrams/<name>.mmd`], [Mermaid diagram, Sequence diagram, Gantt chart, Entity–relationship diagram, Pie chart, Bar and line chart, Mind map, Timeline, Git graph],
  ),
  caption: [The composers in this chapter and their starters.],
) <tab-flow-composers>

The two flowchart composers share one canvas and one kind of drawing, so the choice between them follows the document. Choose #ui[Flowchart] for a LaTeX document: it goes in with `\includestandalone`, so its text takes the document's fonts and maths. Choose #ui[Flowchart in Typst] for a Typst document, which takes the drawing in with `#include`. The Typst one is offered only when Spectrum's built-in Typst is there, and its card in the chooser says so when it is not. A search in the chooser also finds the flowchart shapes by name, so typing "decision" offers #ui[Diamond, in Flowchart], which opens a new flowchart with the Diamond tool picked.

Choose #ui[Commutative diagram] for objects on a grid joined by labelled arrows, as in algebra and category theory. Choose #ui[Mermaid diagram] when the layout should be worked out for you, for the kinds of diagram the other composers do not draw (sequence diagrams, Gantt charts, entity–relationship diagrams, mind maps and the like), or when the document is in Markdown.

== The flowchart composer <sec-flow-flowchart>

The flowchart composer places shapes on a grid and joins them with arrows. Every shape and arrow is a TikZ node and path in the code, or a fletcher node and edge, at the place it has on the canvas. The canvas snaps to a grid of 0.25 cm, and its text is set at the size the PDF prints it: 10 pt for LaTeX and 11 pt for Typst. Hence a line of text that fits a box on the canvas fits it in the preview too.

#shots(
  ("images/09-flow/binary-search-canvas.png", "images/09-flow/binary-search-preview.png"),
  [A binary search drawn in the flowchart composer (left) and its compiled preview (right). The decisions are diamonds, the input a parallelogram and the ends are terminals with a light fill.],
) <fig-flow-binary-search>

=== Shapes <sec-flow-shapes>

The rail on the left holds #ui[Select], #ui[Connect] and one tool for each shape. Pick a shape, then click the canvas to place it there, centred on the point clicked. The tool goes back to #ui[Select] once the shape is down. A new shape has a sensible size and text, such as Start for a terminal or $q_0$ for a state, and every size is an even number of grid steps, so the centres of boxes in line fall on one grid line and the arrows between them are straight. @tab-flow-shapes lists the shapes.

#figure(
  table(
    columns: (auto, 1fr, auto),
    align: left,
    table.header[Shape][Used for][Typst],
    [Rectangle], [A process step, a block in a block diagram], [Yes],
    [Rounded rectangle], [A step or a layer, with corners rounded by 4 pt], [Yes],
    [Circle], [A connector or a node], [Yes],
    [Ellipse], [An oval], [Yes],
    [Diamond], [A decision, a yes or no question], [Yes],
    [Parallelogram], [Input and output, such as reading or printing a value], [Yes],
    [Text], [Words with no outline], [Yes],
    [Maths label], [Maths with no outline, such as $R(s)$ in a block diagram], [Yes],
    [State], [A state of an automaton, which can have a start arrow], [Yes],
    [Accepting state], [A final state, drawn as a double circle], [Yes],
    [Cylinder (data store)], [A database or other store of data], [Yes],
    [Document], [A report or a file, with a wavy bottom edge], [No],
    [Trapezium (manual step)], [A manual operation], [Yes],
    [Operator circle], [A summing junction or another operator, such as $+$], [Yes],
    [Vector stack], [A vector of cells, such as an embedding, with a caption below], [No],
    [Container], [A rounded frame round a group of shapes, with a title and a repeat count], [Yes],
    [Terminal (start or end)], [The start or the end of a flowchart, a pill shape], [Yes],
    [Manual input], [Input typed by hand, with a sloped top], [Yes],
    [Off-page connector], [A link to the rest of the chart on another page], [Yes],
    [Gain (block diagram)], [A gain $K$ as a triangle pointing the way the signal goes], [Yes],
    [Takeoff point], [A dot where a signal branches], [Yes],
    [Swimlane], [A lane for the steps one person or system does], [Yes],
  ),
  caption: [The flowchart shapes. The last column says whether the Typst flowchart has the shape.],
) <tab-flow-shapes>

The Typst flowchart has every shape but the document and the vector stack, as fletcher has nothing to draw them with. Its rail and its #ui[Shape] menu leave those two out.

Select a shape to change it in the inspector on the right, shown in @fig-flow-inspector-box. Its fields are the following.

- #ui[Text] is what the shape says. Write `$…$` round maths, in LaTeX for a TikZ drawing and in Typst for a Typst one, and press Return for a new line. The State, Accepting state, Operator circle, Gain and Maths label shapes hold maths alone, so their field is #ui[Maths] and takes the maths without dollars. A container's field is its #ui[Title] and a vector stack's its #ui[Caption].
- #ui[Shape] changes the shape and keeps the text, the size and the arrows.
- #ui[Wrap the text to the box's width] breaks the text into lines as wide as the box. Without it, a line is as long as it is typed, and TikZ widens the box to hold it.
- #ui[Size (cm)] is the width and the height. Dragging a selected shape's edges or corners resizes it too, in steps of 0.5 cm, and a drag from the left or top edge grows the shape that way.
- #ui[Turn or mirror] turns the selection a quarter turn either way or mirrors it, as described under Selecting and arranging below.
- #ui[Fill], #ui[Line colour], #ui[Dashes] and #ui[Thickness] set the look, as described under Colours and line styles below.

Some shapes have a field of their own. A state or an accepting state has #ui[Start arrow], which draws the arrow into it from the left, above, the right or below. A container has #ui[Repeated ×], maths such as $N$ written as $times N$ beside it. A gain has #ui[Points], the way its tip points, and a swimlane has #ui[Title band], the side its title is on. A vector stack has #ui[Cells], from 1 to 20.

#figure(
  box(width: 70%, grid(columns: 2, gutter: 10pt, frame("images/09-flow/inspector-box.png"), frame("images/09-flow/inspector-arrow.png"))),
  caption: [The inspector with a diamond selected (left) and with an arrow selected (right). The arrow's label sits on its right as it goes, 30 % of the way along it.],
) <fig-flow-inspector-box>

=== Adding and connecting shapes <sec-flow-connect>

There are two ways to join two shapes with an arrow. The first uses the Connect tool.

+ Pick #ui[Connect] on the rail, or press #key("W") while the pointer is over the drawing
+ Click the shape the arrow starts from
+ Click the shape it goes to

The arrow joins the sides of the two shapes that face each other: the bottom of one and the top of the other when they are further apart up and down than across, otherwise the right of one and the left of the other. #ui[Connect] stays picked after each arrow, so a whole chain can be joined with a click on each shape in turn, and the new arrow is selected each time so its label can be typed at once. Clicking the same shape twice gives a loop above it. The key #key("W") is the default and can be changed in Settings, as described in @ch-composer.

#shot("images/09-flow/connect.png", [Shapes joined with the Connect tool. The diamond's right side was joined to the rectangle's left side because the rectangle is further away across than down.], width: 48%) <fig-flow-connect>

The second way is to drag. Each shape has a dot in the middle of each side when the pointer is over it. Drag from one of these dots to another shape to join the two, the arrow leaving by that side and arriving by the side dropped on. Drag from a dot to another dot on the same shape for a loop, which goes round the side it was dragged from.

A second arrow between the same two shapes, going the other way, bends both of them to one side, so the pair reads as two arrows rather than one with a head at each end. This is how the State machine starter draws its transitions between $q_0$ and $q_1$ (@fig-flow-automaton).

=== Arrows and their labels <sec-flow-arrows>

Select an arrow to change it. Its fields are listed in @tab-flow-arrow.

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Field][What it does],
    [#ui[Label]], [The arrow's text, with `$…$` for maths, such as Yes, No or $E(s)$.],
    [#ui[Line]], [#ui[Straight], or #ui[Right-angled], which turns at right angles between the sides it leaves and reaches, or #ui[Curved], which leaves and arrives square to those sides, or #ui[Bent to one side], which bows 20° to the left of the straight line, as each of a pair of arrows does.],
    [#ui[Loop]], [For an arrow from a shape to itself, in place of #ui[Line]: the side the loop goes round, above, on the right, below or on the left.],
    [#ui[Label] (side)], [#ui[On the line], over a white patch, or #ui[Left, as it goes] or #ui[Right, as it goes]. The sides are named as the arrow runs, so a label on the left of an arrow going down sits to its east. In a Typst drawing the first choice is #ui[Fletcher's choice], which puts the label beside the line, and #ui[On the line] is offered after it.],
    [#ui[Label along the arrow (%)]], [How far along the arrow the label sits, from 0 at its start to 100 at its end, in steps of 5. The default is 50, the middle of the whole route.],
    [#ui[Arrowheads]], [#ui[At the end], #ui[At the start], #ui[At both ends] or #ui[None].],
    [#ui[Sign at the end (summing junction)]], [None, $+$ or $-$, written near the end of the arrow on its left, for an arrow into a summing junction.],
  ),
  caption: [The fields of a selected arrow. The two label fields appear once the arrow has a label.],
) <tab-flow-arrow>

Arrows in TikZ have Stealth heads. A label on the line has a white patch under it so the line does not run through the text, while a label beside the line has none.

=== Colours and line styles <sec-flow-style>

The last fields of the inspector set the look of whatever is selected, shapes and arrows alike. When the selected items differ, a field shows no value until one is chosen, and the choice then goes to all of them.

- #ui[Fill] fills a shape, from the palette or a colour of your own, or #ui[None]. Text on a filled shape is black, on a dark canvas too, as it prints.
- #ui[Line colour] colours a shape's outline and an arrow's line. For text and maths labels, which have no outline, the field is #ui[Text colour]. #ui[Black] is the default, and shows in the canvas's ink colour on a dark canvas.
- #ui[Dashes] is solid, dashed or dotted.
- #ui[Thickness] is thin (0.4 pt, TikZ's own), thick (0.8 pt) or very thick (1.2 pt).

A colour is written into the code in place, as `{rgb,255:red,216;green,236;blue,217}` in TikZ and `rgb("#d8ecd9")` in Typst, so the document needs no colour of its own defined.

=== Selecting and arranging <sec-flow-arrange>

The flowchart canvas uses the same mouse as the other canvases in @ch-composer.

- Click a shape or an arrow to select it, and hold #key("Shift") while clicking to add to the selection or take an item out of it.
- Drag across empty canvas to select every shape and arrow that lies wholly inside the box drawn.
- Press #key("⌘", "A") with the pointer over the drawing to select everything.
- Drag a selected shape to move the whole selection. Shapes snap to the grid as they move.
- Hold #key("Space") and drag, or drag with the middle button, to move around the canvas.
- Double-click a shape to select it and put the cursor in its text.

#ui[Turn or mirror] in the inspector turns the selected shapes a quarter turn anticlockwise or clockwise, or mirrors them left to right or top to bottom, about the middle of the space they take. The arrows between them leave and reach the sides they turned to, so a flowchart drawn top to bottom becomes one that reads left to right with two clicks. Boxes of text keep their width and height, so they read as before, while containers, swimlanes and gains turn with the drawing. Since the boxes do not turn, leave as much room between them down the page as their width before turning a column into a row, or they will overlap.

=== Block diagrams <sec-flow-blocks>

A block diagram, as used in control and signals, is drawn with four of the shapes. The Operator circle is the summing junction, the Gain is a triangle with its gain inside, the Takeoff point is the dot where a signal branches, and Maths labels name the input and output. Each arrow into the summing junction takes its sign from #ui[Sign at the end (summing junction)]. The Feedback loop starter in @fig-flow-feedback is a closed loop drawn this way, with $+$ on the input and $-$ on the feedback path from $H(s)$.

#shots(
  ("images/09-flow/feedback-sign.png", "images/09-flow/feedback-sign-inspector.png"),
  [The Feedback loop starter with the feedback arrow selected (left). Its sign, $-$, is set in the inspector (right) and drawn near the end of the arrow.],
  columns: (2.3fr, 1fr),
) <fig-flow-feedback>

#shot("images/09-flow/feedback-preview.png", [The compiled preview of the same block diagram, as LaTeX sets it.], width: 80%)

=== Swimlanes and containers <sec-flow-lanes>

A swimlane is a tall box with a title band, used to show which person or system does each step. A container is a rounded frame with its title in its top-left corner, used to group a few shapes, such as a layer repeated $N$ times in a model architecture. Both hold the shapes whose centres lie inside them: moving a swimlane or container takes those shapes with it. Both are drawn under the shapes in them, so a click inside a container reaches the shape there, or the canvas. To select a container, click its outline. A swimlane can also be picked up by its title band.

#shots(
  ("images/09-flow/swimlane-selected.png", "images/09-flow/swimlane-inspector.png"),
  [The Swimlane process starter with the Shop lane selected by its title band (left), and the lane in the inspector (right). #ui[Title band] moves the title to any side of the lane.],
  columns: (1.6fr, 1fr),
) <fig-flow-swimlane>

=== State machines and model architectures <sec-flow-automata>

The State and Accepting state shapes draw automata. A state's text is maths, so `q_0` prints as $q_0$, and #ui[Start arrow] draws the arrow into the start state. The State machine starter in @fig-flow-automaton has a start state, an accepting state, a loop on each and a bent pair of arrows between them. The same starter opens in Typst as #ui[State machine in Typst].

#shots(
  ("images/09-flow/automaton-canvas.png", "images/09-flow/automaton-preview.png"),
  [The State machine starter on the canvas (left) and in the preview (right).],
) <fig-flow-automaton>

The Model architecture starter draws a neural network block: an embedding as a vector stack, an attention layer and a feed-forward layer as rounded rectangles with a fill, an Operator circle where they are summed, and a container round them repeated $times N$. Its Typst version draws the embedding as a grey rounded box, as fletcher has no vector stack.

=== The code it writes <sec-flow-tikz-code>

A TikZ flowchart is saved as a standalone document, which `\includestandalone` takes the picture from. It loads TikZ with the libraries `shapes.geometric`, `arrows.meta` and `positioning`, with `automata` added for states and `shapes.symbols` for documents, and `amssymb` when the text uses `\mathbb` or `\mathfrak`. Each shape is a `\node` named `n1`, `n2` and so on at its centre in centimetres, with a minimum width and height of its size on the canvas. Each arrow is a `\draw` from the side anchor of one node to the other's. The start of the binary search in @fig-flow-binary-search is written as follows,

#block(breakable: false)[
```latex
\begin{tikzpicture}
\node[draw, rectangle, rounded corners=0.5cm, minimum width=2cm,
  minimum height=1cm, align=center] (n1) at (1,-0.5) {Start};
\node[draw, diamond, aspect=1.667, minimum width=2.5cm,
  minimum height=1.5cm, align=center] (n4) at (1,-6.75) {$l \le h$?};
\draw[-{Stealth}] (n1.south) -- (n2.north);
\draw[-{Stealth}] (n4.south) -- node[midway, auto] {Yes} (n5.north);
```
]

Text outside maths is escaped as LaTeX needs it, so 50% done or R&D compiles as typed. The node names, such as `n4`, are what to use when adding to the picture by hand in the Code tab, for example `\node[right=of n4] {…};` with the `positioning` library that is already loaded.

== Flowcharts in Typst with fletcher <sec-flow-fletcher>

The Typst flowchart is the same canvas, rail and inspector as the TikZ one, with three differences. Its maths is Typst maths, so a decision reads `$l <= h$?` rather than `$l \le h$?`. Its text is set at 11 pt, Typst's size, so a box holds a little less text on one line. Its rail has neither the Document nor the Vector stack. @fig-flow-euclid shows Euclid's algorithm drawn in it.

#shots(
  ("images/09-flow/euclid-canvas.png", "images/09-flow/euclid-preview.png"),
  [Euclid's algorithm in the Typst flowchart (left) and its preview, compiled by the built-in Typst (right). The arrow back to the decision is right-angled.],
) <fig-flow-euclid>

The drawing is saved as a Typst file that imports fletcher and draws a `diagram` with a `node` for each shape and an `edge` for each arrow, its positions in centimetres with $y$ going up,

#block(breakable: false)[
```typst
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#diagram(
  node-stroke: 0.4pt,
  node((1cm, -0.5cm), [Start], shape: fletcher.shapes.pill,
    width: 2cm, height: 1cm, name: <n1>),
  node((1cm, -4.75cm), [$b = 0$?], shape: fletcher.shapes.diamond,
    width: 2.5cm, height: 1.5cm, name: <n3>),
  edge(<n3>, <n4>, "->", label: [Yes], label-side: left),
)
```
]

The import line follows the Typst version the project compiles with. Typst 0.13 and later get fletcher 0.5.8, and Typst 0.12 gets fletcher 0.5.5, which has no cylinder, so a cylinder is drawn as a plain box there. Typst downloads fletcher the first time the drawing compiles, so that first compile needs the internet. Leave the import line as the composer wrote it.

The file also has a line that sets the page to the size of the drawing when the composer compiles it on its own. A document that takes the drawing in with `#include "/diagrams/euclid.typ"` keeps its own page.

#note(title: [Where fletcher differs from the canvas])[
  fletcher draws some things its own way, so check the preview of a Typst flowchart before inserting it. A diamond, a parallelogram and a trapezium come out larger than on the canvas, as fletcher draws their outline round a box of the size given. A right-angled arrow turns at the corner fletcher chooses, which is the one the canvas shows when the arrow leaves one shape across and reaches the other up or down, as in @fig-flow-euclid, but not always otherwise. A curved arrow is drawn with a fixed bend of 30°.
]

When a project is converted between LaTeX and Typst, as described in @ch-writing, each flowchart drawn in the composer is written again in the other language from its drawing, rather than kept as a picture. One whose text the other language cannot read the same way, or which has a document or a vector stack, stays a picture.

== Commutative diagrams <sec-flow-cd>

The commutative diagram composer places maths objects in the cells of a grid and joins them with labelled arrows, as tikz-cd draws them. The grid has one object at most in each cell, and the code it writes is a `tikzcd` environment with one row of the grid on each line.

#shots(
  ("images/09-flow/pullback-canvas.png", "images/09-flow/pullback-preview.png"),
  [A pullback on the canvas (left) and in the preview (right). The arrow $u$ is dashed and the labels $x$, $p_1$ and $f$ are on the other side of their arrows.],
) <fig-flow-pullback>

=== Objects and arrows

The rail has three tools, #ui[Select], #ui[Connect] and #ui[Object].

+ Pick #ui[Object], then click a cell to place an object there. It is named with the next capital letter not yet used, A first
+ Type the object's maths, without dollars, in the inspector's #ui[Object] field, such as `A \times_C B`
+ Join two objects as in a flowchart: drag from a dot on one object's edge to the other, or pick #ui[Connect] (or press #key("W")) and click one object, then the other

Drag an object to another cell to move it, or select objects and press the arrow keys to move them a cell at a time. An object never lands on a cell that already has one. Drag from one dot on an object to another dot on it, or click it twice with #ui[Connect], for a loop.

A second arrow between the same two objects shifts both apart, so the two lie side by side. When they go opposite ways each moves to its own left; when they go the same way one moves to each side and the one on the right takes its label below it. @fig-flow-cd-kinds shows a pair $f$ and $g$ drawn this way.

=== Arrow fields

Select an arrow to change it in the inspector (@fig-flow-cd-inspector). Its fields are the following.

- #ui[Label] is the arrow's maths, without dollars. A label with a comma, an equals sign or a closing bracket in it is written in braces, so tikz-cd does not read it as an option.
- #ui[Label side] puts the label on one side of the arrow or the other. The sides are named as the arrow runs: #ui[Above] and #ui[Below] for an arrow across, #ui[Left] and #ui[Right] for one down. tikz-cd's own choice, and the default, is the left of the arrow as it goes.
- #ui[Arrow] is the kind of arrow: #ui[Plain] ($->$), #ui[Double] ($=>$), #ui[Maps to] ($|->$), #ui[Equals] ($=$), #ui[Tail] ($>->$) or #ui[Harpoon] ($harpoon.rt$).
- #ui[Shift, for two arrows between the same objects] moves an arrow a little to one side, as the composer does by itself for a pair.
- #ui[Loop] is the side a loop goes round, in place of the shift, for an arrow from an object to itself.
- #ui[Hook at the tail] ($arrow.r.hook$), #ui[Two heads] ($->>$) and #ui[Dashed] add a hook for an inclusion, a second head for a surjection, and dashes for an arrow whose existence is being claimed.

#figure(
  box(width: 70%, grid(columns: 2, gutter: 10pt, frame("images/09-flow/cd-inspector.png"), frame("images/09-flow/cd-inspector-many.png"))),
  caption: [The inspector with the dashed arrow $u$ selected (left), and with three arrows selected together (right), when a change goes to all of them.],
) <fig-flow-cd-inspector>

Select several arrows, with #key("Shift") or by dragging across the canvas, to change their side, kind, shift, hook, heads or dashes together. With several selected the sides are named #ui[Left, as it goes] and #ui[Right, as it goes], since the arrows run different ways, and each arrow keeps its own label.

#shots(
  ("images/09-flow/arrow-kinds-canvas.png", "images/09-flow/arrow-kinds-preview.png"),
  [Arrow kinds on the canvas (left) and in the preview (right): a hook and two heads in the top row, a double arrow $alpha$, a shifted pair $f$ and $g$, a loop below $F$ and a maps-to arrow $pi$ going up.],
) <fig-flow-cd-kinds>

=== Starters and code

#ui[Commutative diagram] opens an empty grid. #ui[Commutative square] opens four objects with the two ways round the square, $f$ then $h$ and $g$ then $k$. #ui[Pullback] opens $P$ with its maps $p_1$ and $p_2$ and the dashed arrow $u$ from any $X$, and #ui[Short exact sequence] opens $0 -> A -> B -> C -> 0$ with $f$ and $g$.

The code is a standalone document that loads `tikz-cd`, and `amssymb` as well when a label uses `\mathbb` or `\mathfrak`. Each arrow is written after the object it starts from, with tikz-cd's direction letters: `r` for one cell right, `d` for one down, `rd` for one down and right, and so on. The pullback in @fig-flow-pullback is written as follows,

#block(breakable: false)[
```latex
\begin{tikzcd}
X \arrow[rd, "{\exists!\, u}", dashed] \arrow[rrd, "y"] \arrow[rdd, "x"'] \\
 & A \times_C B \arrow[r, "p_2"] \arrow[d, "p_1"'] & B \arrow[d, "g"] \\
 & A \arrow[r, "f"'] & C
\end{tikzcd}
```
]

The prime after a label, as in `"x"'`, puts it on the other side. Empty cells at the end of a row are left out.

== Mermaid <sec-flow-mermaid>

Mermaid is a language for diagrams written as text, such as `A --> B` for an arrow from A to B. Spectrum's Mermaid composer is the code on the left and the diagram it draws on the right, drawn again a moment after you stop typing. There is no canvas to draw on, no #ui[Draw] or #ui[Code] tab and no #ui[Compile] button: the code is the drawing, and Mermaid lays it out.

#shots(
  ("images/09-flow/mermaid-code.png", "images/09-flow/mermaid-drawing.png"),
  [A sequence diagram of a login in the Mermaid composer: the code on the left of the window (left) and the diagram Spectrum draws from it on the right (right).],
  columns: (1fr, 1.6fr),
) <fig-flow-mermaid>

=== Writing a diagram

The bar above the code has #ui[Start from a template], a menu of eleven diagrams to begin from, and #ui[Mermaid syntax], a link to Mermaid's own reference for the language. A template replaces the code after asking, and undo in the code brings it back. @tab-flow-mermaid lists the templates; the chooser has a starter for each of them too.

#grid(
  columns: (1.1fr, 1fr),
  gutter: 16pt,
  align: horizon,
  [
    #figure(
      table(
        columns: (auto, auto),
        align: left,
        table.header[Template][Keyword],
        [Flowchart], [`flowchart TD`],
        [Sequence diagram], [`sequenceDiagram`],
        [Class diagram], [`classDiagram`],
        [State diagram], [`stateDiagram-v2`],
        [Gantt chart], [`gantt`],
        [Entity–relationship diagram], [`erDiagram`],
        [Pie chart], [`pie`],
        [Bar and line chart], [`xychart-beta`],
        [Mind map], [`mindmap`],
        [Timeline], [`timeline`],
        [Git graph], [`gitGraph`],
      ),
      caption: [The Mermaid templates.],
    ) <tab-flow-mermaid>
  ],
  [#figure(frame("images/09-flow/mermaid-templates.png", width: 70%), caption: [The template menu.]) <fig-flow-mermaid-templates>],
)

When the code has a mistake, Mermaid's message shows above the last drawing that worked, which stays until the code draws again. Mermaid draws in its strict mode, which runs no script and follows no link in the code, and it draws labels as plain text rather than HTML so the drawing can be turned into an image. The #ui[Dark canvas] setting in @ch-composer draws the diagram in Mermaid's dark theme while you work; the images for a document are always drawn on white.

=== Into a document

A document cannot take Mermaid code in, so Spectrum turns the drawing into an image beside the `.mmd` file.

+ Click #ui[Insert as figure]
+ In the editor's Floats panel, give the figure a caption and insert it, as described in @ch-writing

Insert as figure draws the diagram at three times its size on white and saves it beside the code: `diagrams/login.pdf` for a LaTeX or Typst project, or `diagrams/login.png` when the project's main file is Markdown. The PDF holds the high-resolution image at the diagram's own size, so it prints sharp. The Floats panel then writes the figure the document's language needs: `\includegraphics` in a LaTeX figure, `image` in a Typst `#figure`, or a Markdown image. Typst reads the PDF from Typst 0.14 on.

Each time the Mermaid file is saved, the PDF or PNG that Insert made beside it is drawn again from the code, so the document always shows the current diagram. #ui[Export] saves the drawing as a PDF or a PNG image outside the project, in the same way.
