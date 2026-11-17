#import "../template.typ": *

= The diagram composer <ch-composer>

The diagram composer is Spectrum's drawing tool for figures. A figure is drawn with the mouse on a canvas, or filled in on a form, and the composer writes its TikZ, Typst or Mermaid code into the project, where the document includes it like any other file. It is meant for students and teachers who draw circuits, beams, vectors, flowcharts and plots for reports and lecture notes, and who would rather place a part than count coordinates. The composer still keeps the code in view, so a drawing can always be finished by hand.

The composer is one tool with a composer for each kind of diagram: Circuits and General drawing (@ch-circuits), Structures (@ch-structures), Vector diagrams (@ch-vectors), flowcharts, commutative diagrams and Mermaid (@ch-flow), Plots (@ch-plots) and Form presets (@ch-forms). @ch-symbols lists every symbol they draw. This chapter describes what all of them share, and those chapters describe only what is particular to each. The chapter first covers the file a drawing is saved as (@sec-composer-files) and how the composer is opened (@sec-composer-open). Then it walks through the frame around every canvas (@sec-composer-frame), the canvas background (@sec-composer-grid), selecting and editing (@sec-composer-select) and the tool keys (@sec-composer-keys). Lastly it covers the settings (@sec-composer-settings), university styles (@sec-composer-styles), labels (@sec-composer-labels), file versions (@sec-composer-versions) and every shortcut (@sec-composer-shortcuts).

== The drawing file <sec-composer-files>

Each drawing is one file in the project's `diagrams` folder. The composer writes the picture's code into it and saves it as you draw, so there is no separate export step before the document can use it. The file's type follows the language the composer writes,

#figure(
  table(
    columns: (auto, auto, 1fr),
    table.header[Language][File][What it holds],
    [TikZ], [`diagrams/<name>.tex`], [A standalone LaTeX document with the picture, which the document takes in with `\includestandalone`],
    [Typst], [`diagrams/<name>.typ`], [The `#diagram(…)` of fletcher, with its import line, which a Typst document includes],
    [Mermaid], [`diagrams/<name>.mmd`], [The Mermaid code, which goes into a document as the PDF or PNG made from it],
  ),
  caption: [The three kinds of drawing file.],
) <fig-composer-files>

The last line of the file is a comment that holds the drawing itself, so the composer can open the file again exactly as it was drawn. It starts with the language's comment mark (`%`, `//` or `%%`), then `spectrum-diagram v1`, the drawing encoded as text and a short hash of the code above it. For example, the end of a vector diagram reads,

```latex
\fill (B) circle (2pt) node[above right] {$B$};
\end{tikzpicture}
\end{document}
% spectrum-diagram v1 eyJsYW5ndWFnZSI6InRpa3oiLCJwa2ciOiJ2ZW…Q== 612075672518bb47
```

TeX, Typst and Mermaid all skip this line, so it never shows in the PDF. Leave it in place: without it the file is only code, and the composer opens it as code. Beside a TikZ or Typst drawing the composer also keeps the PDF of its last successful compile, `diagrams/<name>.pdf`, which the preview and #ui[Insert as image] use.

=== How the document takes it in

#ui[Insert as figure] (@sec-composer-save) hands the drawing to the editor's Floats panel, which writes the figure into the open document (@ch-writing). Specifically,

- a TikZ drawing goes into a LaTeX document with `\includestandalone{diagrams/<name>}` inside a `figure`, and the packages and TikZ libraries the drawing uses are added to the preamble. The labels are then set in the document's own fonts and maths,
- a Typst drawing goes into a Typst document as `#figure(include "/diagrams/<name>.typ")`,
- a TikZ drawing in a Typst document goes in as its PDF image, and
- a Mermaid drawing goes in as the PDF (LaTeX and Typst) or PNG (Markdown) beside it, which the composer draws again each time the drawing is saved.

=== Editing the code by hand

The #ui[Code] tab shows the file above its last line, and it can be edited like any file. The first key typed there raises a banner, #ui[Edited by hand: the drawing no longer matches the code.], with two choices.

- #ui[Redraw from the canvas (replaces your edits)] throws the typed changes away and writes the code from the drawing again.
- #ui[Keep as code] closes the banner and keeps the typed code. The file is then saved with the typed code above the drawing's line.

While the code is kept as typed, the #ui[Draw] tab shows the drawing but does not let it be changed, and the inspector is hidden. The hash on the last line no longer matches the code above it, so the file opens in the #ui[Code] tab with the banner the next time as well. Redraw from the canvas whenever the drawing is wanted again.

#shot("images/05-composer/code-edited.png", [The #ui[Code] tab after a comment was typed at the end of line 12. The banner offers to redraw from the canvas or keep the code as typed.]) <fig-composer-edited>

=== Changes made elsewhere

The composer saves only over the text it opened or last saved. When the file was changed outside the composer meanwhile, such as by an edit in the main window or a sync client, the save stops and a banner says so. #ui[Keep this version] saves the composer's drawing over the change, while #ui[Open the changed file] opens the file as it now is. A file deleted outside the composer offers #ui[Save it again] instead.

#shot("images/05-composer/changed-outside.png", [The banner shown when the file changed outside the composer. The status beside the file's name reads #ui[Not saved] until one of the two buttons is used.]) <fig-composer-changed>

== Opening the composer <sec-composer-open>

=== Draw a diagram

There are three ways to start a new drawing from the editor,

+ Click the pencil, #ui[Draw a diagram], in the toolbar above the editor
+ Choose #menu[Insert (+)][Draw a diagram…] in the same toolbar
+ Click #ui[Draw a diagram…] in the Floats panel's #ui[Insert diagram] card

Each opens the chooser, #ui[Draw a diagram]. In the desktop app the composer is a window of its own beside the document, and only one is open at a time: asking for another drawing brings that window forward at it. In a browser copy of Spectrum the composer opens as a separate browser page, which the browser may first ask to allow as a pop-up.

#shot("images/05-composer/draw-button.png", [The editor's toolbar. The pencil, fourth from the left, opens #ui[Draw a diagram].], width: 40%) <fig-composer-draw-button>

=== The chooser

The chooser lists the starters as cards. A starter is a drawing to begin from: an empty canvas, such as #ui[Circuit] or #ui[Flowchart], or a figure already drawn, such as #ui[Inverting amplifier] or #ui[Portal frame]. Each card gives the starter's name, the language it writes (TikZ, Typst or Mermaid), one line on what it holds and the package it uses.

On the left are the views. #ui[Recently used] holds the last eight starters you created, and it is where the chooser opens once there are any. #ui[All] lists every starter, and the five categories, #ui[Engineering], #ui[Physics], #ui[Mathematics], #ui[Computing] and #ui[Others], list theirs in groups such as #ui[Electrical and electronics] or #ui[Machine learning]. A starter can be listed under more than one group. When the open document is a Typst file, the Typst starters come first, and in a copy of Spectrum without its built-in Typst they are greyed out with #ui[Needs Spectrum's built-in Typst].

#shot("images/05-composer/chooser.png", [The chooser on its #ui[Engineering] view, with #ui[Circuit] chosen. The name below the cards is where the drawing will be saved.], width: 80%) <fig-composer-chooser>

To create a drawing,

+ Choose a card, with a click or with the arrow keys
+ Change the name under the cards if you want another one
+ Click #ui[Create], press #key("Enter") or double-click the card

The name starts as the starter's own with the first free number, such as `circuit-1`, and the file goes into `diagrams/` with the extension the card's language needs. A name takes letters, digits, `-` and `_` only and starts with a letter or digit, so the document can always find the file. A name already taken in `diagrams/` is refused with #ui[There's already a diagrams/… Choose another name.]

=== Searching

Typing anywhere in the chooser goes to #ui[Search diagrams and symbols]. The search finds starters by their name, the other words they answer to (FBD, Bode, MOSFET), their group and category and the package they use. It also finds symbols, listed under #ui[Symbols] as the symbol and the composer it is in, such as #ui[Op amp, in Circuit]. Choosing a symbol creates a drawing in that composer with the symbol's tool already picked, so the first click places it. Every word typed has to be found. A word of up to three letters has to start a word, so `op amp` does not find a ramp, while a longer word may sit inside one, so `mosfet` still finds nMOSFET.

#shot("images/05-composer/chooser-search.png", [The chooser searched for `op amp`: the op amp starters, then the op amp symbol in the two composers that have it.], width: 80%) <fig-composer-search>

=== The composers

Each starter opens one of the composers below. The chip beside the file's name in the composer's top bar names the language and the composer, such as #ui[TikZ · Circuit].

#figure(
  table(
    columns: (auto, auto, 1fr, auto),
    table.header[Composer][Writes][What it draws][Chapter],
    [Circuit], [circuitikz], [Circuits, logic schematics and block diagrams, with parts joined by wires], [@ch-circuits],
    [General drawing], [circuitikz, TikZ], [The circuit canvas with the mechanical, fluid mechanics, construction materials and other symbol sets], [@ch-circuits],
    [Structures], [TikZ], [Beams, trusses and frames, solved for their reactions and force diagrams as you draw], [@ch-structures],
    [Vector diagrams], [TikZ], [Points, vectors, lines and constructions on a grid, for geometry and mechanics], [@ch-vectors],
    [Flowchart], [TikZ], [Flowcharts, block diagrams, state machines, swimlanes and model architectures], [@ch-flow],
    [Flowchart in Typst], [fletcher], [The same flowcharts, written for a Typst document], [@ch-flow],
    [Commutative diagram], [tikz-cd], [Objects on a grid joined by arrows], [@ch-flow],
    [Plot], [pgfplots], [Functions, data files, typed points and fields, from a form], [@ch-plots],
    [Form presets], [TikZ], [Mohr's circle, Venn diagrams and the fluid statics figures, worked out from a form], [@ch-forms],
    [Mermaid], [Mermaid], [Sequence diagrams, Gantt charts and Mermaid's other diagrams, written as code], [@ch-flow],
  ),
  caption: [The composers, what each draws and the chapter that describes it.],
) <fig-composer-modes>

The canvas composers (the first seven) share the canvas, the grid, selecting and the tool keys described below. Plots and Form presets have a form in place of a canvas, and Mermaid has its code beside a live picture, while all of them share the frame, saving, inserting and the settings.

=== Opening a drawing again

A drawing reopens in the composer from the editor in two ways,

- right-click its file in the file tree and choose #ui[Edit diagram], or
- right-click the line in a LaTeX document that takes it in with `\includestandalone` and choose #ui[Edit diagram].

#shots(("images/05-composer/tree-menu.png", "images/05-composer/line-menu.png"), [Left: #ui[Edit diagram] in the file tree's menu for a drawing. Right: the same item in the editor's menu for the line that includes it.], columns: (40%, 52%)) <fig-composer-reopen>

=== Deleting a drawing

The bin at the right end of the composer's top bar deletes the drawing after asking. The question lists every file that goes: the drawing, the PDF or PNG made from it and the `diagrams` folder when nothing else is left there. When a document still includes the drawing, the question names it, since that document will not compile until the line is removed. After the delete the composer returns to the chooser.

== The frame around the canvas <sec-composer-frame>

Every composer sits in the same frame. Its parts are the top bar, the tool rail on the left, the canvas or form in the middle with the preview under it, and the inspector on the right.

#shot("images/05-composer/frame.jpg", [The composer with a circuit open and the resistor $R_1$ selected. Left: the tool rail and parts list. Middle: the canvas, its zoom controls and the compiled preview. Right: the inspector for the selected part.]) <fig-composer-frame>

=== The top bar

#figure(
  table(
    columns: (auto, 1fr),
    table.header[Item][What it does],
    [File name and chip], [The drawing's file, and its language and composer, such as #ui[TikZ · Circuit]],
    [#ui[Saved]], [The save status: #ui[Saving…] while a change waits to be written, #ui[Not saved] when a save was refused],
    [#ui[Draw] and #ui[Code]], [The canvas or form, and the file's code (@sec-composer-files). Mermaid has its code only],
    [Undo and redo], [The two arrows, also #key("⌘", "Z") and #key("⇧", "⌘", "Z")],
    [Edit (#ui[…])], [#ui[Copy], #ui[Paste], #ui[Duplicate] and #ui[Delete] for what is selected, on Structures, Vector diagrams, flowcharts and commutative diagrams. The circuit canvas has the same commands on its keys],
    [#ui[Style]], [The settings of the whole drawing, such as the circuit's symbol style or a structure's units. Each composer's chapter describes its own],
    [#ui[Compile]], [Saves and compiles the preview now (#key("⌘", "Enter"))],
    [#ui[Save]], [Saves now (#key("⌘", "S")) and compiles the preview],
    [#ui[Insert as figure]], [Saves and hands the drawing to the document (@sec-composer-save)],
    [Gear], [#menu[Settings][Diagram composer], in a sheet over the composer (@sec-composer-settings)],
    [#ui[Export]], [The picture as a #ui[PDF] or a #ui[PNG image]],
    [Bin], [Deletes the drawing after asking],
  ),
  caption: [The composer's top bar, from left to right.],
) <fig-composer-topbar>

#shot("images/05-composer/header.png", [The top bar of a circuit drawing.]) <fig-composer-header>

=== The tool rail

The rail on the left holds the composer's tools and parts. On the circuit canvas it is the #ui[Select] and #ui[Wire] tools above the parts list and its search, #ui[Find a part]. Structures and Vector diagrams have a list of their own tools with #ui[Find a part] or #ui[Find a tool], and flowcharts and commutative diagrams a column of icons. A tool's tooltip gives its name and, when it has one, its key (@sec-composer-keys). After placing something most tools stay picked, and #key("Esc") goes back to #ui[Select].

=== The inspector

The column on the right is the inspector. With nothing selected it shows how to use the canvas and, on some canvases, a summary of the whole drawing, such as a vector diagram's table of point coordinates. With one item selected it shows that item's fields: its label, value, colour and the like. With several selected it shows what they can share, such as #ui[2 items selected] with a colour, #ui[Turn] and #ui[Delete].

The rarer fields of an item are folded under one blue line, such as #ui[Voltage, current and more] on a circuit part or #ui[Line, marks, colour and more] on a plot series. Click the line to open it. The fold opens by itself when the item already has any of its fields set, and again when one becomes set later, such as by #ui[Redo], so nothing set is ever hidden. Selecting the next item starts it folded again.

#shot("images/05-composer/inspector-more.png", [The inspector of a resistor, with #ui[Voltage, current and more] opened under its label and value.], width: 34%) <fig-composer-more>

=== The preview and Compile <sec-composer-preview>

The composer saves the drawing and compiles it about 0.7 s after the last change, so the preview under the canvas follows the drawing as you work. A TikZ drawing compiles with LaTeX and a Typst drawing with Spectrum's built-in Typst, at the project's Typst version. #ui[Compile] (#key("⌘", "Enter")) compiles at once.

While a newer compile is running, the last picture stays in the preview, greyed. When a compile fails, the heading reads #ui[Couldn't compile] and the errors are listed with their lines. Click a line number to open the #ui[Code] tab at that line, and #ui[Show the log] for the whole log. #ui[Fix with AI] asks the assistant's model for a corrected file, which lands in the #ui[Code] tab as a hand edit to be checked and kept or redrawn. It needs a model set up, as @ch-assistant describes.

#shot("images/05-composer/preview-error.png", [A failed compile, after `R_\inn` was typed as a label. Each error gives its line in the code, and the last good picture stays behind it, greyed.]) <fig-composer-error>

Plots and Form presets compile the same way. Mermaid draws its picture beside the code as you type, without a compile.

=== Saving, inserting and exporting <sec-composer-save>

The drawing is saved as you work, and the window saves once more when it closes. When that last save is refused because the file changed elsewhere, the drawing is written beside it as a conflict copy rather than lost.

#ui[Insert as figure] saves the drawing, sends it to the editor's Floats panel and says #ui[The figure is ready to insert in the editor's Floats panel.] The panel's #ui[Insert diagram] card then takes a caption, a label, a width and a placement, and writes the figure at the cursor (@ch-writing). For a TikZ drawing whose packages clash with the document's preamble, #ui[Insert as image] puts in the PDF the composer compiled instead, so none of its packages reach the document.

#shot("images/05-composer/insert-card.png", [The #ui[Insert diagram] card after #ui[Insert as figure], with the drawing's file ready and its label filled in from the file's name.], width: 55%) <fig-composer-insert>

#ui[Export] downloads the picture as a #ui[PDF] or a #ui[PNG image] of about 290 dpi. Both come from the current preview, so they wait for a successful compile of the drawing as it is now. Mermaid exports are drawn from its code directly.

=== Undo and redo

The composer keeps a step of history about 0.4 s after each change, up to 200 steps, for the drawing and its Style. #key("⌘", "Z") undoes a step and #key("⇧", "⌘", "Z") or #key("⌘", "Y") redoes it, as do the two arrows in the top bar. The history belongs to the open window: it starts again when the drawing is reopened. In a text field the same keys undo the typing in that field instead.

=== Zoom, pan and the minimap

The controls in a corner of every canvas zoom out and in, show the zoom, fit the drawing to the window, show the minimap and switch the canvas between light and dark. The mouse and trackpad work the same on every canvas,

- scroll to pan, or drag with #key("Space") held, or drag with the middle button, and
- pinch, or scroll with #key("⌘") held, to zoom about the pointer.

#shot("images/05-composer/canvas-controls.png", [The canvas controls: zoom out, the zoom, zoom in, fit, the minimap and the dark canvas.], width: 30%) <fig-composer-controls>

The minimap is a small overview of the whole drawing in a corner of the canvas, with the part in view outlined. The circuit canvas, the flowchart canvases and commutative diagrams have one, while Structures and Vector diagrams do not. The dark canvas draws the drawing light on dark. It changes only the canvas: the PDF prints the same either way, and the canvas stays light in the app's dark theme until it is switched. Both switches are settings, so a choice made on one canvas holds on every other and on your other computers.

#shot("images/05-composer/dark-minimap.png", [The circuit canvas with the dark canvas and the minimap on. The canvas controls keep their own colours.], width: 80%) <fig-composer-dark>

== The canvas background <sec-composer-grid>

Every canvas draws a grid behind the drawing, so squares can be counted and parts lined up. The dots sit on the points that parts and boxes snap to, and a larger mark every few dots makes the counting quicker. #menu[Settings][Diagram composer][Background] chooses one of four backgrounds,

- #ui[Dots, a larger dot every few], the default,
- #ui[Dots, a line every few],
- #ui[Grid lines, a heavier line every few], and
- #ui[Dots only].

#ui[Every] sets how many dots apart the larger marks are, from 2 to 20, with 5 by default. The marks repeat from the drawing's own origin, so they stay on the same grid points when you pan or zoom. Zoomed far out, the circuit canvas draws every fourth dot only, so the dots never crowd together.

#shots(
  ("images/05-composer/grid-major-dots.png", "images/05-composer/grid-major-lines.png", "images/05-composer/grid-lines.png", "images/05-composer/grid-dots.png"),
  [The four backgrounds on the circuit canvas, each with #ui[Every] at 5. Top left: dots with a larger dot. Top right: dots with a line. Bottom left: grid lines. Bottom right: dots only.],
  columns: 2,
) <fig-composer-backgrounds>

Structures and Vector diagrams count in the drawing's own units instead, whatever #ui[Every] says. Structures puts its larger marks on every whole metre (or foot), and Vector diagrams on every centimetre, with the x and y axes drawn darker through the origin. Zoomed out, both thin their marks to every second, fifth or tenth unit. Vector diagrams also shows the pointer's x and y beside the zoom.

#shots(("images/05-composer/grid-structures.png", "images/05-composer/grid-vectors.png"), [Left: a portal frame in Structures, with a larger dot on every whole metre. Right: a vector diagram, with a larger dot on every centimetre, the axes darker and the pointer's position beside the zoom.], columns: (42%, 58%)) <fig-composer-units>

== Selecting and editing <sec-composer-select>

Selecting and editing work the same on every canvas, with the few differences noted below.

- Click an item to select it, and #key("Shift")-click to add it to the selection or take it out.
- Drag across empty canvas to select everything inside the box. Hold #key("Shift") to add to what is already selected. A flowchart selects the arrows between the boxes it takes as well.
- #key("⌘", "A") selects everything on the canvas.
- Drag a selected item to move the whole selection, or nudge it with the arrow keys.
- #key("Esc") clears the selection and goes back to the #ui[Select] tool.

#shots(("images/05-composer/marquee-circuit.png", "images/05-composer/marquee-flow.png"), [A drag across empty canvas on the circuit (left) and on a flowchart (right). The circuit selects the parts whose ends lie in the box, and the flowchart the boxes it takes and the arrow between them.], columns: (58%, 40%)) <fig-composer-marquee>

#key("⌘", "C") copies the selection, #key("⌘", "X") cuts it, #key("⌘", "V") pastes the copy a little along and down from the original and #key("⌘", "D") duplicates in one step. #key("Delete") or #key("⌫") deletes the selection. A paste or duplicate leaves the new items selected, ready to be moved. On Structures, Vector diagrams, flowcharts and commutative diagrams the same four commands are in the Edit (#ui[…]) menu of the top bar. These keys act on the canvas only, so in a text field they cut, copy and paste text as usual.

#shot("images/05-composer/edit-menu.png", [The Edit menu, with a flowchart box selected. #ui[Paste] is ready once something has been copied.], width: 34%) <fig-composer-edit-menu>

=== Nudging, turning and mirroring

The arrow keys, turning and mirroring differ from canvas to canvas, as each canvas has the moves its figures need.

#figure(
  table(
    columns: (auto, 1fr, 1fr, 1fr),
    table.header[Canvas][Arrow keys][#key("R") and #key("X"), #key("Y")][In the inspector],
    [Circuits and General drawing], [One grid step; four with #key("Shift")], [#key("R") turns a quarter anticlockwise, #key("⇧", "R") an eighth; #key("X") and #key("Y") flip left to right and top to bottom], [#ui[Turn] and #ui[Flip]],
    [Structures], [One grid step; four with #key("Shift")], [#key("X") and #key("Y") mirror; no #key("R")], [Two #ui[Mirror] buttons and #ui[Turn by] any angle],
    [Vector diagrams], [One grid step; a tenth of one with #key("Shift")], [#key("R") turns a quarter anticlockwise, #key("⇧", "R") an eighth; #key("X") and #key("Y") mirror], [#ui[Turn by] any angle and two mirror buttons],
    [Flowcharts, TikZ and Typst], [One cell; four with #key("Shift")], [None], [#ui[Turn or mirror]: a quarter either way, or mirror across or over],
    [Commutative diagrams], [One cell], [None], [None],
  ),
  caption: [Moving, turning and mirroring on each canvas. Each turns or mirrors a selection of several items about their common centre.],
) <fig-composer-turning>

The arrow keys, turning and mirroring act on a canvas once it has been clicked or something on it selected, so the same keys still move the cursor in the inspector's fields.

== Tool keys <sec-composer-keys>

A tool key picks a tool with one key, as a click on the rail would. There are five,

#figure(
  table(
    columns: (auto, auto, 1fr),
    table.header[Key][Canvas][Tool],
    [#key("W")], [Circuits and General drawing], [#ui[Wire]],
    [#key("W")], [Flowcharts and commutative diagrams], [#ui[Connect], which joins two shapes with a click on each],
    [#key("M")], [Structures], [#ui[Beam or frame member]],
    [#key("T")], [Structures], [#ui[Truss bar]],
    [#key("P")], [Vector diagrams], [#ui[Point]],
    [#key("V")], [Vector diagrams], [#ui[Vector]],
  ),
  caption: [The tool keys and the tool each picks.],
) <fig-composer-keys>

A tool key acts only while the pointer is over the drawing and nothing is being typed. Hence #key("W") still types a W in #ui[Find a part] or in a label, and a key does nothing on a canvas without that tool. The key also shows in its tool's tooltip, such as #ui[Wire (W)].

To change a key,

+ Open #menu[Settings][Diagram composer], or click the gear in the composer
+ Under #ui[Tool keys], click the key beside the tool
+ Press the new key, or #key("Delete") to remove the key, or #key("Esc") to keep the old one

A key the canvases use themselves, such as #key("R") to turn, #key("X"), #key("Y"), #key("Space"), the arrows or #key("Esc"), is refused with the reason, such as #ui[R is kept by the canvas.] So is a key another tool on the same canvas already has: #key("M") cannot take #key("T") in Structures, since the canvas could pick only one of the two. Tools on different canvases can share a key. The arrow beside a changed key puts back its default.

== Settings <sec-composer-settings>

The composer's settings are in #menu[Settings][Diagram composer] in the main window, and the gear in the composer's top bar opens the same page over the drawing. They follow you to your other computers when settings sync is on. The settings under #ui[New drawings] are conventions a new drawing copies into its Style when it is created, so changing one later never redraws an existing figure. Change those in the drawing's #ui[Style] instead.

#figure(
  table(
    columns: (auto, 1fr),
    table.header[Setting][What it changes],
    table.cell(colspan: 2)[_Canvas_],
    [#ui[Background]], [The grid behind every canvas: a larger dot every few dots, a line every few, grid lines with a heavier line every few, or dots only (@sec-composer-grid)],
    [#ui[Every]], [How many dots apart the larger marks are, from 2 to 20. Hidden for #ui[Dots only]. Structures and Vector diagrams mark their own units instead],
    [#ui[Dark canvas]], [Every canvas light on dark. The moon button on a canvas switches it too],
    [#ui[Minimap]], [The overview in a corner of the canvases that have one. The minimap button on a canvas switches it too],
    table.cell(colspan: 2)[_Tool keys_],
    [Five tool keys], [The keys of @fig-composer-keys, each changed with a click and a key press (@sec-composer-keys)],
    table.cell(colspan: 2)[_New drawings_],
    [#ui[Symbols from other packages]], [Adds a #ui[Symbol sets…] button under a drawing's parts, for adding another package's symbols to it, such as mechanical supports in a circuit (@ch-circuits). Off by default],
    [#ui[Bending moment diagrams]], [A new structure's bending moment diagram on the #ui[Tension side (sagging below)] or #ui[Positive up] (@ch-structures)],
    [#ui[Mohr's circle shear axis]], [#ui[τ positive downward], #ui[Clockwise shear plotted above] or #ui[τ positive upward] (@ch-forms)],
    [#ui[Vector names]], [How a new vector diagram writes each `\mathbf{…}` in its labels: bold, `\vec`, `\overrightarrow` or esvect's `\vv` (@ch-vectors)],
    [#ui[Structure diagrams]], [Which of the axial force, shear force and bending moment diagrams a new structure draws, and each one's fill and opacity],
    [#ui[Write units with siunitx]], [Values such as 10 kN written as `\qty{10}{\kilo\newton}` and units as `\unit{…}`, with siunitx added to the document on insert. On by default. Not in Typst or Mermaid drawings],
    table.cell(colspan: 2)[_University styles_],
    [#ui[MU Style]], [Hong Kong Metropolitan University's symbols in the parts list and the search (@sec-composer-styles). On by default],
  ),
  caption: [Every option in #menu[Settings][Diagram composer].],
) <fig-composer-settings>

#shots(("images/05-composer/settings-canvas.png", "images/05-composer/settings-new.png"), [The settings as the gear opens them. Left: the canvas and the tool keys at the top. Right: the structure diagrams, siunitx and university styles at the end.]) <fig-composer-settings-shot>

== University styles <sec-composer-styles>

A university style is a set of symbols drawn as one university's lecture slides draw them, where circuitikz draws them differently or not at all. The first is MU Style, from Hong Kong Metropolitan University. It adds a group of 12 parts to the circuit parts list: the slides' N- and P-channel MOSFETs, enhancement and depletion, with and without a bulk pin, an ideal diode in a box, a current source drawn as a box with an arrow and two AC voltage sources with + and − marked. They are placed, wired and labelled like any other part, and a drawing that uses one carries the symbol's definition in its own picture, so the document needs nothing more in its preamble. @ch-circuits describes each and @ch-symbols shows them.

#shot("images/05-composer/mu-style.png", [The MU Style group in the circuit parts list.], width: 30%) <fig-composer-mu>

To hide a style's parts,

+ Open #menu[Settings][Diagram composer]
+ Under #ui[University styles], switch the style off

Its parts then leave the parts list, #ui[Find a part] and the chooser's search. A drawing that already uses them still opens, draws and compiles as before. Switch the style on again to bring the parts back.

== Labels <sec-composer-labels>

Labels are typed as TeX, the same as in the document. Specifically, a circuit part's label and value are maths unless you type your own `$…$`, so `R_1` prints as $R_1$, while text elsewhere takes `$…$` for its maths. The inspector says which applies under each field,

#figure(
  table(
    columns: (auto, 1fr),
    table.header[Canvas][How a label is typed],
    [Circuits and General drawing], [Label and value: maths unless you type your own `$…$`. Text: as typed, with `$…$` for maths],
    [Structures and Vector diagrams], [LaTeX as in the document: `$P$`, `$w_0$`, `$U(2,5)$`],
    [Flowcharts], [Text with `$…$` for maths, in LaTeX or Typst as the drawing writes; a gain or state is maths without `$`],
    [Commutative diagrams], [Objects and arrow labels: maths without `$`],
    [Plots and Form presets], [LaTeX as in the document, as each field says],
  ),
  caption: [How each canvas takes its labels.],
) <fig-composer-label-kinds>

The canvas shows a label as it will print, without the markup. Subscripts and superscripts are set small and lowered or raised, Greek letters, units and the common maths signs show as their symbols, so `A_y`, `\theta` and `g \circ f` read as $A_y$, $theta$ and $g compose f$. The canvas only sketches the label in the app's font, while the preview sets it exactly as the PDF does.

#shots(("images/05-composer/labels-canvas.png", "images/05-composer/labels-pdf.png"), [The same circuit on the canvas (left) and in the compiled preview (right). The labels read alike, with $R_1$, $v_i$ and $A_v$ subscripted on both. The small grey U1 on the canvas is the op amp's name in the code, which the PDF does not print.], columns: (60%, 38%)) <fig-composer-labels>

Labels keep clear of the drawing and of each other. A circuit part's label and value sit on opposite sides, and a voltage keeps its side to itself (@ch-circuits). In Structures and Vector diagrams a label left to place itself goes where it does not cover a member, a load, a line or another label, on the canvas and in the PDF alike, and the same placing keeps the labels of Mohr's circle and Venn diagrams off their circles (@ch-forms).

== File versions and older Spectrum <sec-composer-versions>

Each drawing records a file version in its last line, the lowest that holds everything it uses. A copy of Spectrum opens a drawing only when it knows that version, and otherwise opens the file as code, so an older copy never saves a drawing without the parts it does not know.

#figure(
  table(
    columns: (auto, 1fr, auto),
    table.header[Version][When a drawing has it][Opens as code in],
    [1], [Nothing below], [None],
    [2], [Symbol sets, or parts added with them], [Builds before symbol sets],
    [3], [siunitx units, logic gate styles, the flowchart and point sets, or a structure's chosen force diagrams], [The 2.0 release candidates],
    [4], [Circuit annotations, currents or flows on wires, or styled Text], [Spectrum 2.3 and earlier],
    [5], [Anything Spectrum 2.5 added to a drawing], [Spectrum 2.4 and earlier],
  ),
  caption: [Drawing file versions.],
) <fig-composer-versions>

Version 5 covers, for example, the fluid mechanics and construction materials symbols, the 2.5 annotations, a support's settlement, the new vector constructions, the new flowchart shapes and label places, the new plot series and the fluid statics forms. A drawing that uses nothing new keeps its old version and writes the same code as before, so it still opens in 2.4.

Opened as code, a drawing shows #ui[This file has no drawing Spectrum can open, so it opens as code.] Its code can still be edited, saved and inserted, and the drawing's last line is kept as it was, so the drawing opens again in a Spectrum that knows it. Hence a figure drawn in 2.5 survives a trip through an older copy, as long as only its code is changed there.

#shot("images/05-composer/opens-as-code.png", [A drawing from a newer file version than this copy knows, opened as code. Spectrum 2.4 shows a 2.5 drawing the same way.]) <fig-composer-as-code>

== Shortcuts <sec-composer-shortcuts>

The composer's shortcuts are below. The tool keys can be changed in #menu[Settings][Diagram composer], and the others are fixed. On Windows, Ctrl takes the place of #key("⌘").

#figure(
  table(
    columns: (auto, 1fr),
    table.header[Keys][Action],
    [#key("⌘", "S")], [Save, and compile the preview],
    [#key("⌘", "Enter")], [Compile (save first)],
    [#key("⌘", "Z")], [Undo],
    [#key("⇧", "⌘", "Z") or #key("⌘", "Y")], [Redo],
    [#key("⌘", "C"), #key("⌘", "X"), #key("⌘", "V")], [Copy, cut and paste the selection],
    [#key("⌘", "D")], [Duplicate the selection],
    [#key("Delete") or #key("⌫")], [Delete the selection],
    [#key("⌘", "A")], [Select everything on the canvas],
    [#key("Esc")], [Finish or drop what a tool is drawing, then go back to #ui[Select] and clear the selection],
    [#key("Enter")], [Finish a wire (circuit) or close a polygon or a liquid shape],
    [Arrow keys], [Move the selection a grid step or cell (@fig-composer-turning)],
    [#key("Shift") + arrow keys], [Move it four steps, or a tenth of a step in Vector diagrams],
    [#key("R"), #key("⇧", "R")], [Turn a quarter or an eighth anticlockwise (circuit, Vector diagrams)],
    [#key("X"), #key("Y")], [Mirror left to right, top to bottom (circuit, Structures, Vector diagrams)],
    [#key("Space") + drag, middle-button drag, scroll], [Pan],
    [#key("⌘") + scroll, pinch], [Zoom about the pointer],
    [#key("W"), #key("M"), #key("T"), #key("P"), #key("V")], [Tool keys, with the pointer over the drawing (@fig-composer-keys)],
  ),
  caption: [Every composer shortcut.],
) <fig-composer-shortcuts>
