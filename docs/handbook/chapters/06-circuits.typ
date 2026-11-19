#import "../template.typ": *

= Circuits and General drawing <ch-circuits>

The Circuits composer draws electrical circuits for a LaTeX document and writes them as circuitikz code. It is meant for students and teachers who draw schematics for lab reports, assignments and lecture notes, and who would rather place parts and wires with the mouse than count coordinates. General drawing is the same canvas with more symbols on it: mechanical supports, flowchart shapes, points and marks, and the fluid mechanics and construction materials sets of the civil engineering courses. Hence everything in this chapter applies to both, while @sec-circuits-general covers what General drawing adds.

The chapter is mainly divided into six parts. First it describes the parts list and how a part is placed (@sec-circuits-parts), then wires (@sec-circuits-wires) and the inspector that edits a part (@sec-circuits-inspector). Then it covers turning and moving (@sec-circuits-turning), Annotate (@sec-circuits-annotate) and the symbol sets of General drawing (@sec-circuits-general). Lastly it lists the starters and shows the code a drawing writes (@sec-circuits-code). What every composer shares, such as opening a drawing, the frame around the canvas, the grid, selecting, the tool keys, the settings and the preview, is in @ch-composer.

== Starting a drawing <sec-circuits-starters>

Both composers start from #ui[Draw a diagram], the chooser described in @ch-composer. Specifically, the circuit starters are under #menu[Engineering][Electrical and electronics], and General drawing is under #menu[Others][General drawing]. The starters are,

- #ui[Circuit], an empty circuit,
- #ui[Logic schematic], an empty schematic for AND, OR, NOT and the other gates, with their grounds, supplies and terminals, under #menu[Engineering][Digital and computer architecture],
- #ui[General drawing], an empty canvas with every kind of symbol and every symbol set on, and
- 20 circuits that open already drawn: the inverting, non-inverting, summing and difference amplifiers, the voltage follower, the integrator and the differentiator, the half-wave, centre-tap and bridge rectifiers, a transistor amplifier stage and its small-signal (hybrid-π) model, the 555 astable and monostable, the buck, boost and buck-boost converters, an RC ladder, a block diagram and a mass, spring and damper.

A drawn circuit writes the result it computes beside it as Text, such as the gain $-R_f slash R_1$ of the inverting amplifier or the frequency of the 555 astable. Every part of it can be edited or deleted like any other.

#shot("figures/06-circuits/starters-electrical.png", [The circuit starters in #ui[Draw a diagram], under #menu[Engineering][Electrical and electronics]. Each card names the package it writes, circuitikz.], width: 82%) <fig-circuits-starters>

== The parts list <sec-circuits-parts>

The parts list is the column on the left of the canvas. At its top are the #ui[Select] and #ui[Wire] tools and the #ui[Find a part] search. Below them the parts are in groups, each with a picture drawn by the circuitikz installed on your computer, so the list shows the symbols exactly as your PDF will.

=== The groups

The circuit catalogue has 119 parts in 15 groups, and @ch-symbols shows every one of them with its picture. A drawing lists only the groups of its own kind, as @sec-circuits-kinds describes. The groups are,

#figure(
  table(
    columns: (auto, 1fr),
    align: (left, left),
    table.header[Group][What it holds],
    [Resistors and impedances], [The resistor, variable resistor, potentiometer (with a wiper pin), impedance, impedance with text inside and fuse],
    [Capacitors and inductors], [Capacitors (plain, polarised, variable and curved plate) and inductors (plain, variable and centre-tapped)],
    [Sources], [Voltage, current and AC sources, controlled sources, the battery and cell, photovoltaic parts, a DC–DC converter and an inverter],
    [Switches], [Normally open and normally closed switches, a push button, closing and opening switches and a changeover switch],
    [Diodes and thyristors], [The diode, LED, Zener diodes, Schottky diode, photodiode, thyristor and triac],
    [Transistors], [NPN and PNP transistors, N- and P-channel JFETs and IGBTs],
    [MOSFETs], [Every MOSFET circuitikz draws: enhancement and depletion, with a bulk pin, the IEEE style and the IGFETs],
    [MU Style], [The symbols of Hong Kong Metropolitan University's slides, described below],
    [Amplifiers and chips], [The op amp, amplifier, buffer and an 8-pin chip],
    [Logic], [AND, OR, NOT, NAND, NOR, XOR and XNOR gates],
    [Meters and lamps], [The ammeter, voltmeter, lamp, meters and an oscilloscope],
    [Ground, supply and terminals], [Three grounds, the positive and negative supply, Voltage between two points, the terminal and two crossings],
    [Transformers], [A transformer with and without a core],
    [Mechanical], [The spring, damper, mass, inerter, viscoelastic element and a motor or generator],
    [Blocks], [Blocks, gains, filters, converters, an adder, a mixer, an oscillator and antennas],
  ),
  caption: [The circuit groups in the parts list.],
) <fig-circuits-groups>

After the groups come #ui[Text], a part that is only its words, and #ui[Annotate] (@sec-circuits-annotate). The parts list has no row of recently used parts. The chooser's #ui[Recently used] holds starters, not parts.

=== Kinds of drawing <sec-circuits-kinds>

The circuit groups are of three kinds, and each kind is a symbol set that a drawing records, in the same way as the sets of @sec-circuits-general. A drawing lists the groups and the Annotate presets of its own kinds and sets only, so a circuit never lists a centre of pressure and a logic schematic never lists a transistor. The kinds are,

#figure(
  table(
    columns: (24%, 1fr, 30%),
    align: (left, left, left),
    table.header[Kind][What it lists][Starters],
    [Circuit symbols], [Every group of @fig-circuits-groups but Logic and Mechanical, and Annotate's #ui[Resistance looking in], #ui[Current arrow], #ui[Loop current] and #ui[Mesh current marker]], [Circuit, the drawn circuits and the block diagram],
    [Logic gates], [Logic, and Ground, supply and terminals], [Logic schematic],
    [Springs, dampers and masses], [Mechanical], [Mass, spring and damper, with the Mechanical supports set],
  ),
  caption: [The kinds of circuit drawing. General drawing has all three and every set.],
) <fig-circuits-kinds>

Every drawing lists #ui[Text] and Annotate's general tools: #ui[Line or arrow], #ui[Rectangle], #ui[Ellipse], #ui[Cross], #ui[Dimension], #ui[Point], #ui[Leader], #ui[Frame] and #ui[Highlight]. Annotate's fluid mechanics tools come with the Fluid mechanics set, and its fills and boundaries with Construction materials too (@sec-circuits-annotate). #ui[Find a part] searches only what the list shows.

A drawing keeps a kind whose parts it uses. Hence nothing a drawing already has leaves its parts list, and a ground pasted into a mechanical drawing brings the circuit groups with it. A drawing made before Spectrum 2.5 does not record its kind, so it lists the kinds of the parts it has, or the circuit groups when it has none of them. Specifically, an older circuit lists the circuit groups, an older logic schematic lists the gates with their grounds, supplies and terminals, and an older General drawing lists everything. To add another kind to a drawing, use #ui[Symbol sets…] (@sec-circuits-general).

=== Finding a part

Type into #ui[Find a part] to keep only the parts whose name, circuitikz key or another word for them contains what you typed. For example, `nmos` keeps every N-channel MOSFET, those of MU Style included, and `elbow` keeps both pipe bends in General drawing. Clear the search with the cross at its right.

#shots(("figures/06-circuits/search-nmos.png", "figures/06-circuits/group-ground.png"), [Left: #ui[Find a part] with `nmos` typed, keeping the N-channel MOSFETs of the MOSFETs and MU Style groups. Right: the Ground, supply and terminals group.], columns: (32%, 32%)) <fig-circuits-search>

=== Placing a part

A part is either a two-terminal part, which sits on a wire between two points, or a placed part, which has named pins. A resistor, a capacitor and a source are two-terminal parts, while a transistor, an op amp, a ground and a terminal are placed parts. To place a part,

+ Click the part in the parts list
+ Move the pointer over the canvas. A faint copy of the part follows it, and every pin on the canvas shows as a small circle
+ Click to put the part down, or for a two-terminal part, press at one end and drag to the other to set its length

A click without a drag puts a two-terminal part 2~cm long, to the right of where you clicked, and Voltage between two points 2~cm long downwards with its + at the top. The new part is selected and named with the next free number of its letter, such as $R_1$, $R_2$, while the tool stays picked so you can place another. Press #key("Esc") or click #ui[Select] to stop.

Parts can also be placed from the keyboard. With a part in the rail focused, #key("Return") or #key("Space") places it at once at the free spot nearest the middle of the view, at least 1~cm from the parts already there, selected, and a screen reader hears where it went, such as "Resistor R1 placed at (0, 0) cm". Moving a part with the arrow keys and stepping through parts and pins with #key("Tab") are not there yet.

Everything snaps to the grid, whose steps are 0.25~cm, and to any pin within about 12 pixels. A placed part with one pin, such as a ground, a supply or a terminal, snaps by that pin. A part with many pins, such as a transistor or an op amp, snaps by whichever pin is nearest, and a pin that lands on another part's pin takes hold of it. A two-terminal part's end placed on a placed part's pin holds that pin too, so a resistor dragged from a ground follows the ground.

=== MU Style

The MU Style group holds the symbols Hong Kong Metropolitan University's lecture slides use that circuitikz does not draw. Specifically, these are the N- and P-channel MOSFETs with the channel in three segments for enhancement or solid for depletion, with the arrow on the source or on a separate bulk pin B, an ideal diode in a box, a current source drawn as a box with an arrow and two AC sources with + and − around a \~ or a sine. They are sized, wired and labelled like circuitikz's own parts. A drawing that uses one declares it inside its own picture, so the document needs nothing more in its preamble.

Other parts gained the slides' variants as options in the inspector: a Zener diode with both ends bent, a grey #ui[Filled] option on diodes, an open or no gate circle on P-channel MOSFETs, text and a ground pin on amplifiers, a #ui[Size] of 150, 200 or 300% for op amps and amplifiers, a bar instead of an arrow on the positive supply and polarity dots on transformers.

#menu[Settings][Diagram composer][University styles] has a switch for each university's symbols. Turn #ui[MU Style] off to hide its group from the parts list and from the search in #ui[Draw a diagram]. A drawing that already uses one of its parts still opens, draws and compiles as before.

#figure(
  grid(columns: (30%, 52%), gutter: 14pt, align: top, frame("figures/06-circuits/group-mu-style.png"), frame("figures/06-circuits/settings-university-styles.png")),
  caption: [Left: the MU Style group. Right: its switch in #menu[Settings][Diagram composer][University styles].],
) <fig-circuits-mu>

== Wires <sec-circuits-wires>

A wire joins pins and grid points with straight segments. It holds on to the pins it starts and ends on, so it follows a part when the part moves.

=== Drawing a wire

+ Click #ui[Wire] at the top of the parts list, or press #key("W") while the pointer is over the drawing
+ Click where the wire starts, on a pin or on a grid point
+ Click at each corner
+ Click a pin to end the wire there, or double-click, or press #key("Enter") to end it at the last point

Pressing #key("W") picks the tool only while the pointer is over the drawing, so the key still types W in the search and the inspector. The key can be changed in #menu[Settings][Diagram composer], as @ch-composer explains. While a wire is being drawn, it shows as a dashed line from its last point to the pointer.

Between two points that are not in line, a wire goes across first, then up or down. Select the wire to change each segment's route in the inspector to #ui[Straight], #ui[Across, then up or down] or #ui[Up or down, then across]. The inspector also gives the wire arrowheads at the end, at the start or at both ends, for signal flow in a block diagram, and under #ui[Current and flow] each segment a current arrow (`i=`) or a flow arrow (`f=`), as a two-terminal part has.

#figure(
  grid(columns: (46%, 30%), gutter: 14pt, align: top, frame("figures/06-circuits/wire-drawing.png"), frame("figures/06-circuits/inspector-wire.png")),
  caption: [Left: a wire being drawn from the foot of $R_2$, with every pin shown as a circle. Right: a wire's inspector, with its route, its current and flow, and its arrowheads.],
) <fig-circuits-wire>

=== Junctions and crossings

The canvas puts a junction dot wherever three or more ends meet: the ends of wires and parts, a placed part's pin, or a wire that ends on the open stretch of another. A corner where only two wires meet gets no dot, and two wires that cross without either ending there are not joined. To show that two wires cross without joining, place #ui[Crossing (jump)] or #ui[Crossing (plain)] from the Ground, supply and terminals group where they cross. The dots are worked out again after every edit, so they never need placing by hand. Voltage between two points joins nothing, so it never adds a dot to a terminal.

=== Transistor pins

A transistor's pins cannot all sit on the grid. For example, circuitikz draws an N-channel MOSFET with its gate 0.98~cm to the left of its drain and source, which are 0.77~cm above and below it. Hence each pin snaps across the way its lead runs: the drain and source sit on a grid column and the gate on a grid row. A wire drawn straight up from the drain or straight left from the gate therefore stays straight, on the canvas and in the PDF. Bipolar transistors, JFETs and IGBTs snap in the same way.

To write each pin's letter beside it, select the part and tick #ui[Label pins]. A MOSFET gets G, D and S (and B for a bulk pin), a bipolar transistor B, C and E, and an IGBT C, G and E. The letters sit outside the body, beyond the end of each pin, and stay in the right places after a turn or a flip.

#figure(
  grid(columns: (28%, 32%), gutter: 14pt, align: top, frame("figures/06-circuits/transistor-pins.png"), frame("figures/06-circuits/inspector-transistor.png")),
  caption: [Left: the MOSFET of a common-source amplifier, selected, with #ui[Label pins] on. Its gate, drain and source wires run straight into its pins. Right: its inspector.],
) <fig-circuits-transistor>

=== Moving a part with its wires

Drag a part to move it. The wires that hold its pins come with it: each end stays on its pin, while the wire's other points stay where they are. A straight segment can therefore become slanted, as in @fig-circuits-move. Change its route in the inspector, or drag one of its points, to square it again. A two-terminal part's end holds a placed part's pin but not another two-terminal part's end, so two resistors in series move apart when one of them is dragged.

#shot("figures/06-circuits/move-with-wires.png", [The MOSFET dragged three grid steps to the right. The wires to its drain, gate and source follow it, and the drain and source wires slant until they are routed again.], width: 34%) <fig-circuits-move>

== A part's inspector <sec-circuits-inspector>

Select a part to edit it in the inspector on the right. A two-terminal part shows its label and value first, and folds the rest under #ui[Voltage, current and more]. That line opens by itself when the part already has a voltage, a current, a flow, poles, a mirror, an inversion, a size or a name.

=== Label and value

The #ui[Label] is maths unless you type your own `$…$`, so `R_L` prints as $R_L$. The menu beside it picks the side the label sits on, named as the part runs on the canvas: #ui[Above] and #ui[Below] on a part that runs across, #ui[Left] and #ui[Right] on an upright one. The side is kept when the label is cleared and typed again, and labels move to the right side when the part turns.

The #ui[Value] is written opposite the label. With #ui[Write units with siunitx] on in #ui[Style], a value that reads as a number and a unit, such as `10 kΩ` or `4.7 µF`, is written as `\qty{10}{\kilo\ohm}`, and the document then loads siunitx. Other values are written as maths, as typed.

=== Voltage, current and more

The fold holds,

- #ui[Voltage], marked across the part with + and − at its ends and its name beside it, on the default side or either side. #ui[Flip polarity] swaps the + and −,
- #ui[Current], an arrow on a lead with its name, and #ui[Flow], an arrow beside the part for power or heat flow, each on either side and either way,
- #ui[Poles], a filled or open dot at the start or the end,
- #ui[Mirror], which flips the symbol across its wire, and #ui[Invert], which turns it end for end,
- #ui[Size], from 50 to 200% of the style's size, and
- #ui[Name], a TikZ name for the part, so other drawings can reach its anchors.

A part's own options follow the fold, such as #ui[Filled] on a diode, #ui[Arrow] and #ui[Body diode] on a MOSFET, or the text written inside an impedance or a block.

#figure(
  grid(columns: (25%, 25%, 25%, 11%), gutter: 10pt, align: top,
    frame("figures/06-circuits/inspector-part.png"),
    frame("figures/06-circuits/inspector-fold-a.png"),
    frame("figures/06-circuits/inspector-fold-b.png"),
    frame("figures/06-circuits/voltage-label-sides.png")),
  caption: [From the left: a resistor's label and value with the fold shut, the fold opened (in two parts), and the load resistor $R_L$ with its voltage $v_o$ on one side and its label and value on the other, as two lines.],
) <fig-circuits-inspector>

=== How labels are kept apart

A voltage keeps its side of a part to itself. When a part has a voltage, its label and value go to the other side, as two lines when there are both, and a current or flow on the voltage's side moves across too. A flow that meets a current at the same end of a part goes to the other end, or on a wire to the other side. The canvas puts each text where the PDF does, so no two texts overlap in either. The + and − of a voltage sit beside the leads, the same distance from every part, or beside a source's body, or not at all on a source that draws its own.

=== Placed parts and Text

A placed part has a #ui[Name], which wires reach its pins through in the code, a #ui[Rotation] in 45° steps, #ui[Flip left to right] and #ui[Flip top to bottom], #ui[Label pins] on a transistor, and its own options. #ui[Text] has its words as TeX (`$…$` for maths), a #ui[Colour], #ui[Bold], #ui[Italic] and a #ui[Size] from #ui[Script] to #ui[Large].

== Turning, flipping and moving <sec-circuits-turning>

Selecting is as @ch-composer describes: click a part, drag across empty canvas for a box, or hold #key("Shift") to add to the selection. With something selected, these keys work while the canvas has the focus,

#figure(
  table(
    columns: (auto, 1fr),
    align: (center, left),
    table.header[Key][What it does],
    [#key("R")], [Turns a quarter anticlockwise. #key("Shift", "R") turns 45°],
    [#key("X")], [Flips left to right. A two-terminal part across the page turns end for end],
    [#key("Y")], [Flips top to bottom. A two-terminal part across the page mirrors across its wire],
    [Arrow keys], [Nudge by one grid step, 0.25~cm, or with #key("Shift") by 1~cm],
    [#key("⌘", "D")], [Duplicates, two grid steps along and down],
    [#key("⌘", "C"), #key("⌘", "X"), #key("⌘", "V")], [Copy, cut and paste, also between circuits in the same window],
    [#key("⌘", "A")], [Selects everything],
    [#key("Delete")], [Deletes. Whatever was attached stays where it was],
  ),
  caption: [The circuit canvas's keys. On Windows, #key("Ctrl") takes the place of #key("⌘").],
) <fig-circuits-keys>

The #ui[Turn] and #ui[Flip] buttons at the foot of the inspector do the same as #key("R") and #key("X"). One part turns about itself: a placed part about its point and a two-terminal part about its middle. Several parts turn together about their common centre, with their wires and text, so each keeps its place beside the others. Text turned with other parts moves with them and stays upright, and an annotation mirrors about its own middle, so it stays on what it marks.

#shots(("figures/06-circuits/turn-before.png", "figures/06-circuits/turn-after.png"), [A voltage divider before and after #key("R") with everything selected. The parts keep their places around each other, and the labels move to the outside.]) <fig-circuits-turn>

== Voltages, grounds, supplies and terminals <sec-circuits-ports>

The Ground, supply and terminals group holds the parts that mark where a circuit meets the outside.

- #ui[Ground], #ui[Reference ground] and #ui[Signal ground] are placed parts with one pin. A ground on a wire's end or a part's end holds it.
- #ui[Supply (positive)] and #ui[Supply (negative)] are the arrows of circuitikz's `vcc` and `vee`. The positive supply's #ui[Bar instead of an arrow] option draws it as the MU slides do.
- #ui[Terminal] is an open circle, for an input or an output.
- #ui[Voltage between two points] marks a voltage between any two points, such as an output's terminals. It draws + at one end, its name in the middle and − at the other, and nothing between them, as circuitikz's `open`. Its name is numbered $v_1$, $v_2$ as it is placed.
- #ui[Text] writes words or maths anywhere, such as a node's name or a result.

@fig-circuits-rc shows an RC low-pass filter that uses most of them: an AC source on a ground, a current $i$ on the resistor, a voltage $v_C$ across the capacitor and the output voltage $v_o$ between two terminals.

#figure(
  grid(columns: (52%, 40%), gutter: 14pt, align: horizon, frame("figures/06-circuits/rc-filter.png"), frame("figures/06-circuits/rc-annotated-pdf.png")),
  caption: [Left: an RC low-pass filter on the canvas, with Voltage between two points across its output terminals. Right: the same filter compiled, with the annotations of @sec-circuits-annotate added.],
) <fig-circuits-rc>

== Annotate <sec-circuits-annotate>

Annotate, at the end of the parts list, draws over a drawing without ever joining it. A drawing lists the tools of its own kinds and sets (@sec-circuits-kinds), and General drawing lists them all. An annotation has no pins, gets no junction dots and is never held by a wire, while it still snaps to the grid and to pins as it is drawn. It is written after the circuit, so it sits on top, except a filled shape, which is written first and sits behind the parts drawn in it. Annotate has ten tools and eleven presets, and @ch-symbols pictures all of them with their fills and patterns.

#shot("figures/06-circuits/annotate-lines-shapes.png", [Above: a line with a corner, a curved arrow, a dashed rectangle with rounded corners and a light fill, an ellipse and a cross. Below: the presets Current arrow, Mesh current marker, Frame, Loop current and Resistance looking in.], width: 90%) <fig-circuits-annotate>

=== Lines, arrows, rectangles, ellipses and crosses

#ui[Line or arrow] draws through the points you click, so it can turn corners like a resistance arrow. Click each point, then double-click or press #key("Enter"). A new line has an arrowhead at its end. #ui[Rectangle] and #ui[Ellipse] are drawn by dragging from one corner to the other, and a click without a drag draws one 2~cm across and 1.5~cm high. #ui[Cross] puts down a cross with a click, to mark a cut wire or a shorted capacitor.

Every annotation takes its look in the inspector,

- #ui[Colour], from the palette (the slides' dark red, red, magenta, blue, green, orange and grey), an xcolor name or mix typed in such as `blue!15`, or the colour well, and #ui[Black] for none,
- #ui[Line], solid, dashed, dotted or dash dot, on all but a cross, a dimension, the ▽ mark and a point, and
- #ui[Width], from #ui[Thin, as the circuit] to #ui[Very thick].

A line also takes #ui[Arrowheads] at the end, at the start or at both, an #ui[Arrowhead] style (Latex, Stealth, open triangle or plain) and size, and a #ui[Bend] of up to 90° to the left or right, which curves every segment as TikZ's `bend left` does. A rectangle or an ellipse folds #ui[Corners, light fill and loop arrow]: #ui[Rounded corners] on a rectangle, a #ui[Light fill] of any colour at 15%, and a #ui[Loop arrow], a single arrowhead on its right side going clockwise or anticlockwise, for a loop or mesh current. A cross takes a size from 0.13 to 1~cm. Select several annotations to change their colour, line and width together.

#figure(
  grid(columns: (24%, 26%, 26%), gutter: 14pt, align: top, frame("figures/06-circuits/group-annotate.png"), frame("figures/06-circuits/inspector-arrow.png"), frame("figures/06-circuits/inspector-rectangle.png")),
  caption: [From the left: the Annotate group in a General drawing's parts list, the inspector of the curved arrow of @fig-circuits-annotate (blue, thick, bent 45° to the left with a Stealth head) and that of the rectangle (dashed, with rounded corners and a green light fill).],
) <fig-circuits-annotate-inspector>

=== Presets

A preset puts down a styled group with its label in one click, which you then move, turn, mirror or edit like anything else. #ui[Resistance looking in] is a cross on a wire with a hooked arrow and $R_"in"$, #ui[Current arrow] an arrow with $i$, #ui[Loop current] a circle with a loop arrowhead and $i_1$, #ui[Mesh current marker] a tinted rounded box with a circled number, #ui[Frame] a dashed box headed "Feedback network" and #ui[Highlight] a red ellipse. The labels are Text, so their words can be changed. @fig-circuits-annotated shows three of them on the RC filter, the resistance arrow mirrored with #key("X") so it looks into the output.

#shot("figures/06-circuits/annotate-circuit.png", [The RC filter with Loop current, Highlight on the top node, Resistance looking in mirrored to face the circuit, and a Text title.], width: 60%) <fig-circuits-annotated>

=== Fills, boundaries, dimensions and marks

Spectrum 2.5 added the drawing tools of the fluid mechanics and construction materials courses to Annotate. #ui[Dimension], #ui[Point] and #ui[Leader] are in every drawing. The rest are in a drawing with the Fluid mechanics set, and #ui[Liquid or solid] and #ui[Hatched boundary] in one with Construction materials too. They are,

- #ui[Liquid or solid], which draws a closed shape a corner at a time. Click each corner, then the first corner again, or press #key("Enter") to close it. A new shape is water,
- #ui[Hatched boundary], a wall, the ground or a fixed plate of any length, drawn a point at a time like a line. The hatching is on the right of the way it was drawn, so under a line drawn to the right, and #ui[Hatching on the other side] moves it,
- #ui[Dimension], drawn by dragging from one end to the other, or 2~cm long with a click. Drag its third handle to move its line out, with extension lines back to the ends. #ui[Measures] chooses along the line between its ends, across or up and down, and its text sits beside the line or in a gap in it,
- #ui[Free surface], the ▽ mark standing on the point you click,
- #ui[Point], a dot or a cross with a letter on any side of it, and the presets #ui[Centroid C], #ui[Centre of pressure CP], #ui[Centre of gravity G], #ui[Centre of buoyancy B] and #ui[Metacentre M], and
- #ui[Leader], words with a line to the point they name. Click where the words go, then the point, then double-click or press #key("Enter").

A dimension's text and a point's letter are maths unless they have a space or their own `$…$`, so `h_c` prints as $h_c$ while `2 m` prints as words. A leader's words are TeX as typed.

#shots(("figures/06-circuits/inspector-fill.png", "figures/06-circuits/inspector-dimension.png"), [The inspector of a liquid, drawn as dashes, and of a dimension, measuring up and down.], columns: (26%, 26%)) <fig-circuits-fill-inspector>

A rectangle, an ellipse or a liquid or solid takes a #ui[Fill]: water, seawater, oil, mercury, air or concrete. #ui[Drawn as] then picks a tint, as the slides draw it, or a pattern as the exam papers draw it, in the line colour: dashes, dots, hatching, cross hatching or stipple. Untick #ui[Outline] for a fill with no line around it. A filled shape sits behind the parts drawn in it, so a tank's water stays inside the tank.

#shot("figures/06-circuits/fills.png", [The six fills as tints, above, and the five patterns, below.], width: 90%) <fig-circuits-fills>

#shot("figures/06-circuits/marks.png", [The point presets C, CP, G, B and M, a point drawn as a cross, the free-surface mark and a hatched boundary.], width: 80%) <fig-circuits-marks>

@fig-circuits-gate puts these tools together with four parts of the Fluid mechanics set. First a Gate, a Hinge (flipped with #key("X")), a Stop and a Resultant force are placed. Then the water is drawn as a liquid, the bed and the wall above the gate as hatched boundaries, and the ▽ mark goes on the surface. Lastly the depth of the centroid $h_c$ is a dimension measuring up and down, the centroid and centre of pressure are the C and CP presets, with CP's letter on the left, and a leader names the hinge.

#figure(
  grid(columns: (55%, 33%), gutter: 14pt, align: horizon, frame("figures/06-circuits/gate-sketch.png"), frame("figures/06-circuits/gate-sketch-pdf.png")),
  caption: [A gate holding back water, on the canvas and compiled.],
) <fig-circuits-gate>

== General drawing and the symbol sets <sec-circuits-general>

General drawing is the circuit canvas with every kind of symbol and every symbol set on, for a figure that is not a circuit or that mixes subjects. Its parts list has the circuit groups, then each set's groups with the set's name beside them, then Text and Annotate. The 83 set parts are pictured in @ch-symbols. The sets are,

- #ui[Mechanical supports]: a hatched ground, a pinned support, a wall, a ceiling and a cart on wheels,
- #ui[Flowchart shapes]: a process, start or end, decision, input or output, database, circle and ellipse, each with text inside,
- #ui[Points and marks]: a point, an open point, a right-angle mark and a pair of axes,
- #ui[Fluid mechanics], in five groups: pipes and fittings (a pipe, a narrow pipe, a reducer, a nozzle, 90° and 45° bends, a tee, a valve, a pump, a turbine and a pressure gauge), flow (a section marker, a centre line, a control volume, three velocity profiles, a streamline and a streamtube), tanks and manometers (the free-surface mark, three tanks, U-tube, differential, inverted and inclined manometers, a column of three liquids, a piezometer, a barometer and a hydraulic jack), hydrostatics and buoyancy (a gate, a hinge, a stop, triangular and trapezoidal pressure distributions, the resultant force, a floating block, a hydrometer, a ship's hull with G, B and M, and an incline) and viscosity and surface tension (fixed and moving plates, capillary rise and depression, and a contact angle), and
- #ui[Construction materials], in two groups: test specimens (a cube between platens, a cylinder, three- and four-point flexural tests, the slump cone with a true, shear and collapsed slump, a tension bar, a shear block, a roller and a platen) and sections and brickwork (a reinforced concrete section, six steel sections and brickwork in stretcher, English and Flemish bond).

#shots(("figures/06-circuits/group-supports.png", "figures/06-circuits/group-flowchart.png", "figures/06-circuits/group-points.png"), [The Mechanical supports, Flowchart shapes and Points and marks sets in the parts list.], columns: (26%, 26%, 26%)) <fig-circuits-sets-a>

#shots(("figures/06-circuits/group-pipes.png", "figures/06-circuits/group-tanks.png", "figures/06-circuits/group-specimens.png", "figures/06-circuits/group-sections.png"), [Four of the civil engineering groups: Pipes and fittings and Tanks and manometers from Fluid mechanics, and Test specimens and Sections and brickwork from Construction materials.], columns: 4) <fig-circuits-sets-b>

=== Placing a set's part

A set's part is a placed part. Click it in the parts list, then click the canvas, and it snaps by its pins as a circuit part does. It turns with #key("R"), flips with #key("X") and #key("Y"), and takes wires on its pins. The parts are plain TikZ in the line weights circuitikz draws with, so a pipe beside a resistor looks of a piece.

A pipe is 2~cm long, so a longer run is several pipes in a row, and the fittings join end to end by their pins: a bend's or a reducer's end snaps onto a pipe's end. A section marker is one end of a cut line, so place two, flip one and let their pins meet on the centre line. Pipes, tanks and specimens conduct nothing, so where their pins meet there is a joint and never a junction dot.

A set's part is written as a TikZ `\pic`, and the picture declares every pic it uses at its start with `\tikzset{…/.pic={…}}`, only those it uses. Hence the document needs no package or file for them, and a drawing included with `\includestandalone` takes its declarations along. A drawing that uses the Fluid mechanics or Construction materials sets, or Annotate's 2.5 tools, is a file version 5 drawing, which Spectrum 2.4 and earlier open as code.

=== Liquids in the manometers <sec-circuits-liquids>

The U-tube, differential, inverted and inclined manometers, the piezometer, the barometer and the column of three liquids hold their liquids themselves, since a fill drawn with Annotate snaps to the grid and cannot sit inside a tube 0.25~cm wide. Select one, and its inspector has a field for each liquid, with #ui[None], #ui[Water], #ui[Oil] or #ui[Mercury], and a level for each limb (@fig-circuits-liquids). A liquid is drawn in Annotate's tint for it, behind the walls, as the slides draw it. A circuit drawing has no #ui[Look] to follow, so the liquids are tints only.

#figure(
  table(
    columns: (auto, 1fr, 1fr),
    align: (left, left, left),
    table.header[Part][Liquids][Levels, to start with],
    [U-tube manometer], [Liquid], [left limb −0.25, right limb 0.5],
    [Differential manometer], [in the bend, above it on the left, above it on the right], [left limb −0.25, right limb 0.5],
    [Inverted U-tube manometer], [in the bend, below it on the left, below it on the right], [left limb 0.25, right limb −0.5],
    [Inclined manometer], [Liquid], [reservoir 0.125, sloping tube 0.5],
    [Column of three liquids], [top, middle and bottom], [free surface 1, interfaces 0.25 and −0.5],
    [Piezometer], [Liquid], [level 1],
    [Barometer], [Liquid], [dish 0.15, tube 1.25],
  ),
  caption: [The parts that hold liquids, with their starting levels in centimetres.],
) <tab-circuits-liquids>

A level is a height in centimetres above the point the part is placed by, the same measure as its walls, so a tick of 0.25 is one grid step. The starting levels are where the plain part draws its level marks, a believable reading, and a level mark always follows its level. Type a level and press #key("Enter"), or leave the box, and the canvas draws the part again. A level is kept within its limb. In the inclined manometer the surface in the sloping tube is level, so its level is a height too, and the liquid reaches up the tube to it.

#shot("figures/06-circuits/inspector-liquids.png", [The liquids and levels of the differential manometer of @fig-circuits-manometer.], width: 26%) <fig-circuits-liquids>

A part with a liquid or a level set writes them as options of its pic, such as `\pic[spx/fluid/liquid=mercury, spx/fluid/manometer/left=0.1] at (0,0) {spx/fluid/manometer};`, and the picture declares the keys once, before the pics. A part with none set is written as before. A drawing with a set's parts is file version 5 already, so Spectrum 2.4 and earlier open it as code. Spectrum 2.5 opens a drawing with liquids but draws the parts without them.

=== Sets in a circuit

A drawing lists only its own kinds and sets (@sec-circuits-kinds), while General drawing has them all. To add another to a drawing, turn on #menu[Settings][Diagram composer][Symbols from other packages]. A #ui[Symbol sets…] button then shows below the parts list. It lists the three kinds of circuit and the sets by subject, each with what it loads into the document: circuitikz for the kinds of circuit, and TikZ only for all of Spectrum's own sets. Tick the ones to add and click #ui[Use these sets], and their groups join the parts list for that drawing, such as logic gates beside a transistor stage or mechanical supports beside a mass, spring and damper. Untick one to take it away again. The drawing's own kind and any set whose parts it uses read #ui[In use in this drawing] and stay. With the switch off, the button is hidden and a drawing lists only what it has.

#shot("figures/06-circuits/symbol-sets.png", [The #ui[Symbol sets…] dialog of a circuit, with #menu[Settings][Diagram composer][Symbols from other packages] on.], width: 62%) <fig-circuits-symbol-sets>

=== A worked drawing: a differential manometer

@fig-circuits-manometer measures the pressure difference between two closed tanks, A of water and B of oil, with a mercury manometer between them. It was drawn in a few minutes as follows.

+ Start a #ui[General drawing] from #menu[Others][General drawing]
+ Place a #ui[Differential manometer] from Tanks and manometers, and set its #ui[Liquid in the bend] to #ui[Mercury], #ui[Liquid above, left] to #ui[Water] and #ui[Liquid above, right] to #ui[Oil]
+ Place a #ui[Closed tank] on each side, so that each tank's side pin snaps onto the end of the manometer's side tube
+ Drag a #ui[Rectangle] over tank A from its bottom corner to the level line, set its #ui[Fill] to #ui[Water] and untick #ui[Outline]. Do the same with oil for tank B
+ Place #ui[Point] in each tank and type the letters A and B
+ Draw a #ui[Dimension] between the two mercury levels, set #ui[Measures] to #ui[Up and down], type `h` and drag its third handle out beside the right tube
+ Name the three liquids with #ui[Leader], the mercury's pointing to the bend
+ Click #ui[Compile] to check the preview

#figure(
  grid(columns: (60%, 34%), gutter: 12pt, align: horizon, frame("figures/06-circuits/differential-manometer.png"), frame("figures/06-circuits/differential-manometer-pdf.png")),
  caption: [A differential manometer between two tanks, on the canvas and compiled. The liquids in the tanks are fills behind the parts, so the tank walls stay on top, and the manometer holds its own.],
) <fig-circuits-manometer>

#note[A fill's corners snap to the grid, 0.25~cm, while the manometers' tubes are 0.25~cm wide and their walls lie between grid lines. Hence a fill cannot be drawn inside a tube, and the manometer's liquids are its own (@sec-circuits-liquids).]

The picture this writes is ordinary TikZ inside the circuitikz environment. Its first lines declare the liquids' keys and the two pics it uses (shortened here), and the fills come before the parts so they sit behind,

```latex
\tikzset{spx/fluid/none/.style={}, spx/fluid/water/.style={fill=blue!12}, ...}
\tikzset{spx/fluid/tank-closed/.pic={\draw[line width=0.8pt] (-1.5,-1) rectangle (1.5,1); ...}}
\tikzset{spx/fluid/manometer-differential/.pic={...}}
\path[fill=blue!12] (-4.25,0) rectangle (-1.25,1.25);
\path[fill=orange!30] (1.25,0) rectangle (4.25,1.25);
\pic at (-2.75,1) {spx/fluid/tank-closed};
\pic[spx/fluid/liquid=mercury, spx/fluid/liquid 2=water, spx/fluid/liquid 3=oil] at (0,0) {spx/fluid/manometer-differential};
\pic at (2.75,1) {spx/fluid/tank-closed};
```

== The code it writes <sec-circuits-code>

A circuit is saved in `diagrams/` as a standalone `.tex` file, as @ch-composer describes. Its picture is one circuitikz environment with plain coordinates in centimetres. The style comes first, as options on the picture and a `\ctikzset`, then the placed parts as `\node`, the two-terminal parts as `\draw … to[…]`, the wires, the junction dots as `\node[circ]` and lastly the annotations. Every style key is written, the defaults too, so a document's own circuitikz options cannot make the PDF differ from the preview. The RC filter of @fig-circuits-rc writes,

```latex
\begin{circuitikz}[american, american inductors, american resistors, american voltages, voltage dir=noold]
\ctikzset{label/align=smart, diode=empty, bipoles/length=1.4cm, voltage shift=1}
\node[ocirc] at (5.5,3) {};
\node[ocirc] at (5.5,0) {};
\node[ground] at (0,0) {};
\draw (0,0) to[sV, l={$v_s$}] (0,3);
\draw (0,3) to[R, l={$R$}, a={\qty{1}{\kilo\ohm}}, i={$i$}] (3,3);
\draw (3,3) to[C, l2 halign=c, l2^={$C$} and {\qty{100}{\nano\farad}}, v={$v_C$}] (3,0);
\draw (5.5,3) to[open, v={$v_o$}] (5.5,0);
\draw (3,3) -- (5.5,3);
\draw (0,0) -- (5.5,0);
\node[circ] at (3,3) {};
\node[circ] at (3,0) {};
\end{circuitikz}
```

A part is given a name in the code only when a wire or a pin label reaches one of its anchors, such as `(M1.D)` for a MOSFET's drain. The capacitor's label and value are one `l2` key with both lines, since its voltage keeps the other side to itself.

=== The style

#ui[Style] in the toolbar sets how the whole drawing's symbols look: American or European symbols, the logic gates, the NOT output of a European gate, inductors, resistors, how voltages are marked (+ and − or an arrow), the voltage direction, empty or filled diodes, how labels turn, #ui[Write units with siunitx] and the size of a part, from 0.8 to 2.4~cm. The canvas draws the symbols again with the new style, so it matches the PDF.

#figure(
  grid(columns: (50%, 26%), gutter: 14pt, align: top, frame("figures/06-circuits/common-source.png"), frame("figures/06-circuits/style-menu.png")),
  caption: [Left: a common-source amplifier, its MOSFET biased by a divider, with units written by siunitx. Right: the #ui[Style] menu.],
) <fig-circuits-style>

=== What the preamble needs

The picture asks the document for only what it uses,

- `\usepackage{circuitikz}`, always,
- `\usepackage{siunitx}`, when a value is written with `\qty`,
- `\usetikzlibrary{arrows.meta}`, when an annotation has an arrowhead, a dimension or a loop arrow, and
- `\usetikzlibrary{patterns}`, when a fill is drawn as a pattern.

MU Style's shapes, the set pics and the fill patterns are declared inside the picture, so they need nothing more. #ui[Insert as figure] adds what is missing to the document's preamble, together with TikZ's `babel` library, which keeps a figure's labels and arrows working under French, German, Spanish or Turkish babel. A drawing that uses annotations, styled Text or arrows on wires is a file version 4 drawing, which Spectrum 2.3 and earlier open as code.
