#import "../template.typ": *

= Plots <ch-plots>

The plot composer draws graphs with pgfplots from a form, rather than from a canvas. It is for anyone who needs a function, a set of measurements or a field on a pair of axes in a LaTeX document: a lab report's results, a sketch of a waveform, a Bode plot or a grading curve. Spectrum computes nothing from the expressions typed in. Each one is written into the code as it is, and TeX works out the curve when the figure compiles, so the preview below the form is the figure as it will print.

The chapter first describes the form and how it is laid out (@sec-plots-form). Then it goes through the series and every kind of series (@sec-plots-series), the axes (@sec-plots-axes) and the annotations (@sec-plots-annotations). Lastly it lists the starters (@sec-plots-starters) and describes the code the composer writes (@sec-plots-code). What the plot composer shares with the others, such as the frame, the Code tab, the preview, saving and inserting, is in @ch-composer. Mohr's circle, Venn diagrams and the other figures worked out from a form are Form presets, described in @ch-forms.

== The form <sec-plots-form>

Open a plot from the #ui[Plot] starter in #ui[Draw a diagram], or from one of the plots already set up (@sec-plots-starters). The form has three columns, #ui[Series], #ui[Axes] and #ui[Annotations] (@fig-plots-annotations), and the compiled preview below them. Every change compiles the preview again after a moment.

#shot("images/10-plots/form.png", [The #ui[Series] and #ui[Axes] columns of the form for an RC charging curve, with one function series. The folded sections under the series and the axes are open because the plot sets fields in them.]) <fig-plots-form>

#shot("images/10-plots/rc-charging-preview.png", [The preview of the same plot. The tangent at $t = 0$, the point at $t = tau$ with its drop lines and the reference line at $V_s$ are the three annotations.], width: 52%) <fig-plots-rc>

The fields most plots need are shown first. The rarer ones are folded under a line in blue, #ui[Line, marks, colour and more] for each series and #ui[Grid, size, scales, ticks and more] for the axes, which opens with a click. A fold opens by itself when any field in it is set, so a plot that uses one never hides it, and a new plot's form stays short.

Labels, titles and legends are LaTeX, so `$v_C(t)$` prints as maths. A `%` in them is escaped and prints as a per cent sign. Ranges, domains and positions take a number or a short expression that pgfplots works out, such as `2*pi` or `pi/2`.

== Series <sec-plots-series>

A series is one thing drawn on the axes, such as a curve, a set of points or a field. #ui[Add a series] adds a function series, and the bin beside each series removes it. The menu at the top of a series sets its kind, as shown in @fig-plots-kinds.

#grid(
  columns: (1.15fr, 1fr),
  gutter: 14pt,
  align: horizon,
  [
    #figure(
      table(
        columns: (auto, 1fr),
        align: left,
        table.header[Kind][Draws],
        [Function $y = f(x)$], [A curve from an expression in $x$],
        [Points typed in], [Points typed into the form, with error bars and labels],
        [Least-squares line], [The best straight line through a series of points],
        [Data file], [Two columns of a data file in the project],
        [Parametric], [A curve $(x(t), y(t))$],
        [Polar], [A curve $r = f(t)$],
        [Piecewise function], [Pieces of functions, each on its own range of $x$],
        [Signal], [A square, triangle, sawtooth or other waveform],
        [Vector field], [Arrows on a grid from two expressions in $x$ and $y$],
      ),
      caption: [The kinds of series.],
    ) <tab-plots-kinds>
  ],
  [#figure(frame("images/10-plots/series-kinds-menu.png"), caption: [The menu that sets a series' kind.]) <fig-plots-kinds>],
)

Changing a series' kind and back again brings back what it had in that kind, while the form stays open.

=== Function

#ui[y =] is the expression in $x$, as pgfplots reads it: `x^2`, `5*(1-exp(-x/2))`, `sin(x)`. The trigonometric functions take radians, as in maths. #ui[x from, to, samples] is the domain and the number of points the curve is drawn through, from 2 to 2000; 100 suits most curves, while a fast oscillation needs more.

=== Points typed in

Type the points one to a line, or separated by semicolons, as `x, y` or `x y`. A third number is the half-height of the point's error bar, and `=` followed by text labels the point, so `3.0, 12.2 = 3 V` puts "3 V" beside that point. A line that is not two numbers is left out, and the hint under the box says how many were. Typed points need no data file, so a short table of measurements goes straight into the figure.

=== Least-squares line

A least-squares line is the straight line $y = a + b x$ that fits a series of typed points best. #ui[Through the points of] picks that series, the first one of points by default. #ui[Through the origin] fits $y = b x$ instead. #ui[x from, to] sets how far the line is drawn, and left empty it spans the points. The hint under the fields shows the equation, to four significant figures, and the legend shows it too unless the series has a legend of its own.

#shots(
  ("images/10-plots/points-and-fit.png", "images/10-plots/points-and-fit-preview.png"),
  [Six measured points with error bars and a label on the last (left), and the least-squares line through them, its equation in the legend (right).],
  columns: (1fr, 1.1fr),
) <fig-plots-fit>

=== Data file

A data file series plots two columns of a file in the project.

#howto[plot a data file][
+ Put the file in the project, for example as `data/exchanger.csv`
+ Choose #ui[Data file] as the series' kind
+ Choose the file under #ui[File]. The list offers the project's `.csv`, `.tsv`, `.dat` and `.txt` files
+ Choose the columns under #ui[x and y columns]
]

The columns are named by the file's first line. A file whose first line is numbers has no names, so its columns are offered as Column 1, Column 2 and so on. A `.csv` is split by commas, or by semicolons when its first line has more of them, as a spreadsheet writes one where the comma is the decimal point; such a file is read with its decimal commas. A `.tsv` is split by tabs and any other file by spaces. When no columns can be found the form says so. Under the fold, #ui[Error bar column] picks a column of error bars.

#shots(
  ("images/10-plots/data-series.png", "images/10-plots/outlet-temperatures-preview.png"),
  [A data file series from a heat exchanger lab (left), and the plot of two such series with error bars and the legend below in a row (right).],
  columns: (1fr, 1.1fr),
) <fig-plots-data>

=== Parametric, polar and piecewise

A parametric series has #ui[x =] and #ui[y =], each in $t$, and #ui[t from, to, samples]. A polar series has #ui[r =] in $t$, in radians, and the same range. A piecewise function has a row for each piece with its expression and its range of $x$, #ui[Add a piece] for another and #ui[Samples per piece]. Its pieces share one colour and one legend entry.

=== Signal

A signal series draws a waveform against $t$, as for a sketch of a signal in electronics. #ui[Waveform] is #ui[Sine], #ui[Square], #ui[Triangle], #ui[Sawtooth], #ui[Pulse train], #ui[Rectified sine] or #ui[Step]. #ui[Amplitude, period] set its height and its period; for a step the fields are #ui[Height, steps at t =]. A pulse train also has #ui[Fraction of each period high], its duty cycle. #ui[t from, to] is the range drawn. The straight-line waveforms are written as their corners, so their jumps are vertical, while the sine and the rectified sine are written as functions.

=== Vector field

A vector field draws an arrow at each point of a square grid. #ui[Arrow across, u =] and #ui[Arrow up, v =] are expressions in $x$ and $y$. #ui[x and y from, to, arrows a side] sets the square, the same both ways, and how many arrows there are along each side, from 2 to 40. #ui[Arrows of one length] scales every arrow to the same length, which suits a slope field: with $u = 1$ and $v$ the right-hand side of $d y \/ d x$, each arrow shows the slope there.

=== Legend, line, marks and colour

Every series has #ui[Legend], its entry in the legend, in LaTeX. A series with no legend takes no row in it. The fold #ui[Line, marks, colour and more] holds the rest, as listed in @tab-plots-line.

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Field][What it does],
    [#ui[Line]], [#ui[Solid], #ui[Dashed], #ui[Dotted], #ui[Dash dot], or #ui[None: marks only] for a scatter plot.],
    [#ui[Marks]], [A mark at each point, with its shape: #ui[Auto] (pgfplots' own), or a filled or open circle, square, triangle or diamond, a cross or a plus. A scatter plot always has marks.],
    [#ui[Stems]], [For a function or a data file, a line from each point down to the axis.],
    [#ui[Colour]], [#ui[Auto], the next colour of pgfplots' own, or one from the palette or your own. A series' marks are filled in its colour.],
    [#ui[Break at asymptotes]], [For a function, so $tan x$ is not joined across its asymptotes. The curve is cut where it runs far beyond the rest of its values, with or without a $y$ range.],
    [#ui[Smooth curve through them]], [For typed points, a smooth curve through them, as for a sketch curve. With no line, only the marks show.],
    [#ui[Bars]], [For typed points or a data file, a bar at each point, filled in a tint of the series' colour.],
    [#ui[Error bar column]], [For a data file, the column of error bars.],
  ),
  caption: [The fields under #ui[Line, marks, colour and more]. The last four are offered only for the kinds named.],
) <tab-plots-line>

== Axes <sec-plots-axes>

The #ui[Axes] column sets what is round the series. Its first fields are always shown.

- #ui[Title (LaTeX)], #ui[x label (LaTeX)] and #ui[y label (LaTeX)] are the plot's title and the axes' labels.
- #ui[x from, to] and #ui[y from, to] are the ranges of the axes, left at #ui[Auto] for pgfplots to fit them to the series. With both ends of the $y$ range set, a function is broken where it leaves the range far behind, as at an asymptote.
- #ui[Legend] places the legend: #ui[Top left], #ui[Top right], #ui[Bottom left], #ui[Bottom right], #ui[Outside, top right], beside the plot where no curve can be and the default, or #ui[Below, in a row], under the $x$ label.

#shot("images/10-plots/axes-more.png", [The fields under #ui[Grid, size, scales, ticks and more].], width: 42%) <fig-plots-axes>

The fold #ui[Grid, size, scales, ticks and more] (@fig-plots-axes) holds the rest.

- #ui[Grid] is #ui[None], #ui[Major lines] (the default) or #ui[Major and minor lines].
- #ui[Width, height in cm] sets the size of the plot, left at #ui[Auto] for pgfplots' own.
- #ui[Equal axes] makes one unit as long on both axes, so a circle is round.
- #ui[x increases to the left] reverses the $x$ axis.
- #ui[Black and white] draws the series in black, told apart by dashes and marks, for a document printed in black and white. A series with its own colour keeps it.
- #ui[Axes] is #ui[Box], a frame round the plot, #ui[Through the origin], axes that cross at zero with their labels at the ends, or #ui[Sketch: arrows, no ticks], the same with no ticks but those asked for, as for a sketch of a curve's shape.
- #ui[x and y scales] are each #ui[Linear] or #ui[Logarithmic].
- #ui[x ticks] and #ui[y ticks] put ticks where they are wanted, separated by semicolons, each with a label after `=` if you like: `pi/2 = $\frac{\pi}{2}$; pi = $\pi$`. A tick with no label shows its value. Left empty, pgfplots places the ticks.
- #ui[Tick numbers: decimals] sets how many decimals the tick numbers have, from 0 to 6. #ui[Plain] writes 20000 with no $times 10^n$ or thousands separator, and 0.3 rather than a power of 10 on a log axis. #ui[Decimal comma] writes 0,5 for 0.5.

The Style menu in the composer's top bar has one setting for plots, #ui[Write units with siunitx]. With it on, an axis label that ends in a unit in brackets, such as Load (kN), writes the unit as `\unit{\kilo\newton}`, and the document loads siunitx when the figure is inserted. Its default for new drawings is set in Settings, as described in @ch-composer.

== Annotations <sec-plots-annotations>

An annotation marks something on the plot. #ui[Add an annotation] adds one, and the menu at its top sets its kind. Every annotation but the reference line and the shaded area goes on a function series, which #ui[On] picks, and TeX works out its place from the function, so it moves with the curve when the expression changes. @tab-plots-annotations lists the kinds.

#shot("images/10-plots/annotations.png", [The #ui[Annotations] column of the RC charging plot in @fig-plots-rc: a tangent at $x = 0$, and a point with drop lines at $x = 2$ and its label.], width: 50%) <fig-plots-annotations>

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Kind][What it draws and its fields],
    [Point with drop lines], [A dot on the curve at #ui[At x =], with dashed lines down to the $x$ axis and across to the $y$ axis, and a #ui[Label (LaTeX)] beside it.],
    [Tangent], [The tangent to the curve at #ui[At x =], over a quarter of the series' range each way, with a dot where it touches.],
    [Secant], [The straight line through the curve's points at #ui[x from, to], a little beyond them, with a dot at each.],
    [Reference line], [A dashed line across the whole plot, #ui[Up and down, at x =] or #ui[Across, at y =], with a label at its end.],
    [Shaded area], [The area under a series between #ui[x from, to], down to the $x$ axis or down to another series, chosen under #ui[Down to]. It goes on any series but a piecewise function or a vector field.],
    [Label on the curve], [Text at the curve's point at #ui[At x =].],
  ),
  caption: [The kinds of annotation.],
) <tab-plots-annotations>

An area between two series that are not functions, such as two sets of typed points, can leave #ui[x from, to] empty to shade the whole band between them. This is how the Grading curve starter shades the band between its two limits. Positions such as #ui[At x =] take an expression too, such as `pi/2`.

Under each annotation's fold, #ui[Colour] colours it, and a point or a label has #ui[Label goes] for the side of its text: above right (a point's default), above (a label's default), below, left or right.

== Starters <sec-plots-starters>

The chooser has twelve plots to begin from, listed in @tab-plots-starters. Each opens with its form filled in, so it is also an example of the fields it uses.

#figure(
  table(
    columns: (auto, 1fr),
    align: left,
    table.header[Starter][What it is, and what it shows of the form],
    [Plot], [A function, $y = x^2$, to begin your own.],
    [Signal sketch], [A square wave on sketched axes: a signal series and #ui[Sketch] axes.],
    [Vector and slope field], [The slope field of $d y \/ d x = x - y$, its arrows of one length.],
    [Stress–strain curve], [Mild steel in a tensile test: typed points with a smooth curve, labelled points for yield, ultimate strength and fracture, a dashed unloading line to the permanent strain $epsilon_p$ and the area under the curve shaded.],
    [Grading curve], [Percent passing against sieve opening on a logarithmic $x$ axis, with each point labelled, inside the ASTM C33 limits for fine aggregate shaded as a band, and the legend below.],
    [Normal curve], [The standard normal density with its upper 5 % tail shaded beyond $z = 1.645$ and a tick labelled $z_alpha$.],
    [Bode magnitude plot], [A first-order low-pass filter in decibels on a logarithmic frequency axis, with its asymptotes and the corner $omega_c$ named on the axis.],
    [Damped oscillation], [$e^(-0.3 t) cos 2t$ inside its dashed envelope.],
    [Polar rose], [$r = cos 3t$, three petals on equal axes.],
    [Lissajous figure], [$x = sin 3t$ against $y = sin 2t$ on equal axes.],
    [Conics], [An ellipse, both branches of a hyperbola and a parabola, drawn as parametric curves with their equations in the legend.],
    [Phase portrait], [The field of a damped oscillator with one trajectory spiralling in to the origin.],
  ),
  caption: [The plot starters. The Stress–strain curve, the Grading curve and the seven from the Normal curve on were added in 2.5.],
) <tab-plots-starters>

#shots(
  ("images/10-plots/starter-grading.png", "images/10-plots/starter-stress-strain.png"),
  [The Grading curve starter (left) and the Stress–strain curve starter (right), as they open.],
) <fig-plots-starters-1>

#shots(
  ("images/10-plots/starter-normal.png", "images/10-plots/starter-bode.png"),
  [The Normal curve starter (left) and the Bode magnitude plot starter (right).],
) <fig-plots-starters-2>

#shots(
  ("images/10-plots/starter-square-wave.png", "images/10-plots/starter-rose.png", "images/10-plots/starter-conics.png", "images/10-plots/starter-phase.png"),
  [The Signal sketch, Polar rose, Conics and Phase portrait starters.],
  columns: (1.15fr, 0.95fr, 1.6fr, 1fr),
) <fig-plots-starters-3>

The Grading curve form in @fig-plots-grading shows how its band is made: two series of typed points with dashed green lines for the limits, a third for the sample with each point labelled by its value, and one shaded area between the two limits.

#shot("images/10-plots/grading-form.png", [The #ui[Series] and #ui[Axes] columns of the Grading curve starter: dashed green limits, a logarithmic $x$ axis and ticks at the sieve sizes.]) <fig-plots-grading>

== The code it writes <sec-plots-code>

A plot is saved as a standalone document in `diagrams/`, as every TikZ drawing is. The picture sets `\pgfplotsset{compat=1.18}` itself, so it looks the same in a document that does not, and loads the `pgfplots.fillbetween` library only when a shaded area needs it. The axis options carry the Axes column, and each series is an `\addplot+`. The heat exchanger plot in @fig-plots-data is written as follows,

#block(breakable: false)[
```latex
\pgfplotsset{compat=1.18}
\begin{tikzpicture}
\begin{axis}[xlabel={Cold water flow rate (L/min)},
  ylabel={Outlet temperature ($^\circ$C)}, xmin=0, xmax=5, grid=major,
  xlabel style={name=spx-xlabel}, legend style={at={(spx-xlabel.south)},
  anchor=north, legend columns=-1}, width=10cm, height=6.5cm,
  trig format plots=rad]
\addplot+[mark=*, error bars/y dir=both, error bars/y explicit]
  table[x={flow}, y={hot_out}, y error={err}, col sep=comma]
  {data/exchanger.csv};
\addlegendentry{Hot outlet}
\end{axis}
\end{tikzpicture}
```
]

A data file is read by `\addplot table` from its place in the project when the document compiles, so changing the file changes the figure at its next compile. An annotation on a function declares that function once in the axis options, as `spxfa`, `spxfb` and so on, so TeX can work out the curve's value and slope anywhere. The tangent in @fig-plots-rc is written as,

#block(breakable: false)[
```latex
declare function={spxfa(\x)=5*(1-exp(-\x/2));}
\addplot[forget plot, domain=-2.5:2.5, samples=2]
  {spxfa(0)+(spxfa(0+0.001)-spxfa(0-0.001))/(2*0.001)*(x-(0))};
```
]

`trig format plots=rad` makes `sin(x)` and the like take radians, as they are written in maths. A data series whose file has not been chosen yet is left out of the code until it is, so the figure always compiles.
