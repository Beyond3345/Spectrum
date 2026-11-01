# Spectrum LaTeX style

The house style for `.tex` files written in Spectrum, condensed from the built-in templates in [templates/](../templates). Give this file to an agent or a person writing a new document, and the result should look and read like a Spectrum template: the same preamble order, the same packages, the same comments and the same conventions in the body.

The built-in templates were brought into line with this standard on 1 November 2026. Venue templates (ACL, CVPR, arXiv, NeurIPS, ICML) follow the venue's own class first; see [Venue templates](#venue-templates).

## The rules in brief

1. A4, 11 pt, 25 mm margins, single line spacing, a blank line between paragraphs, Australian English.
2. It compiles with Tectonic (Spectrum's default) and with pdfLaTeX, XeLaTeX and LuaLaTeX, without shell escape.
3. The preamble is grouped under short `%` headings in a fixed order, starting with the references, and every `\usepackage` line has a plain English comment saying what it is for.
4. Numbers with units use siunitx: `\qty{4.7}{\kilo\ohm}`, never `4.7 k$\Omega$` or `\SI`.
5. References are APA 7 through biblatex and Biber, with Australian language mapping.
6. Every cross-reference uses cleveref (`\cref`), equations included, with labels that have a type prefix (`fig:`, `tab:`, `eq:`).
7. Tables use booktabs rules and no vertical lines, with siunitx `S` columns for numbers. Captions go above tables and below figures, and images that belong together are sub-figures from `subcaption`.
8. Code uses listings with the `report` style, and pseudocode uses algpseudocode with Input and Output.
9. hyperref ends the preamble's packages, followed only by cleveref, with `hidelinks` and the PDF title, author and `en-AU` language set.

## Files and layout

| File | What it holds |
| --- | --- |
| `main.tex` | The document. Short documents keep everything here. |
| `references.bib` | The bibliography, loaded with `\addbibresource{references.bib}`. |
| `figures/` | Images. Spectrum's Insert figure saves each image here, converting it first when LaTeX cannot read it. |
| `diagrams/` | Diagrams. Spectrum's diagram composer saves each drawing here as a standalone `.tex`, `.typ` or `.mmd` file, with the PDF its preview compiled beside it. |
| `chapters/` | Optional, for long reports: one file per chapter, brought in with `\include{chapters/introduction}`. |

Before Spectrum 2.1 the composer saved diagrams in `figures/` and Insert figure saved images in `images/`. A project from then moves to these folders on its first compile in 2.1: the composer's diagrams go to `diagrams/` and `images/` goes into `figures/`, and the paths in the project's documents follow. Images of your own already in `figures/` stay there. If a name is already taken in the new folder, that diagram, or the whole of `images/`, stays where it is.

## Engines

Spectrum compiles with Tectonic by default, and the user may choose pdfLaTeX, XeLaTeX or LuaLaTeX instead. A document must work with all four.

- Load `fontenc` and `lmodern` only under pdfLaTeX, through `iftex`. Tectonic, XeLaTeX and LuaLaTeX already use Unicode fonts.
- Do not load `inputenc` in a new document. UTF-8 is the default in every current engine. Only the venue templates keep it, because the venue's files do.
- Do not use packages that need shell escape, such as `minted`, `svg` or `gnuplottex`. Use `listings` for code and convert SVG images to PDF.
- Biber runs automatically when the document loads biblatex, under Auto or pdfLaTeX. On a computer without TeX Live or MiKTeX, Spectrum offers to download Biber for Tectonic.

## The preamble

### Order

The groups always come in this order. Leave out a group the document does not need, but do not reorder them.

| Heading | Packages |
| --- | --- |
| `% References` | `csquotes`, `biblatex`, the language mapping, `xurl`, `\addbibresource` |
| `% Page` | `geometry`, `parskip`, `babel`, the `iftex` font block, `microtype` |
| `% Maths` | `amsmath`, `amssymb`, `mathtools`, `amsthm` and the theorem set |
| `% Figures and tables` | `graphicx`, `subcaption`, `float`, `booktabs`, `tabularx`, `xltabular`, `siunitx`, `multirow`, `makecell`, `threeparttable`, `tikz`, `pgfplots`, `pgfplotstable`, `circuitikz`, `tikz-cd` |
| `% Code` | `xcolor`, `listings` and its style, `algorithm`, `algpseudocode` |
| `% Links` | `hyperref`, `\hypersetup`, then `cleveref` |

Within a group, packages load in the order the table lists them. A package's own settings follow it straight away, such as `\sisetup` after `siunitx` and `\pgfplotsset` after `pgfplots`.

After the groups come the document's own settings (`\numberwithin`, the theorem environments, any `\newcommand`), then `\title`, `\author` and `\date`, then `\begin{document}`.

Two packages sit outside the groups:

- `standalone`, for diagrams from the composer, loads on the line straight after `\documentclass`, before everything else.
- TikZ libraries (`\usetikzlibrary{...}`) come after the last `\usepackage`, since they need TikZ loaded first.

### How Spectrum adds a package

When Insert table, Insert figure or Insert diagram needs a package the document does not load, Spectrum adds a `\usepackage{...}` line in the order above:

1. It goes before the first package the document already loads that comes after it in the order. If that package starts a group, the new line goes above the group's `%` heading and the blank line over it, so it ends the group before. For example, `multirow` goes after `siunitx` and its `\sisetup`, before `% Links`.
2. If the document loads no package that comes after it, or its own order does not match this one (`hyperref` loaded before `graphicx`, say), the new line goes straight after the last `\usepackage`.
3. A package this guide does not list (`enumitem`, `titlesec`) also goes after the last `\usepackage`.
4. A document with no `\usepackage` at all gets the line just before `\begin{document}`.

The added line has no comment. Add one in the guide's style when tidying the preamble.

### Comments

Every `\usepackage` line ends with a comment that says, in plain words, what the package does for this document. The comments line up in one column (column 41 in the templates). Write for a student who has never seen the package. Say what it gives them, not what it is.

```latex
\usepackage{booktabs}                   % \toprule, \midrule and \bottomrule for clean tables
\usepackage{siunitx}                    % numbers and units: \qty{6.6}{\kilo\watt}, aligned table columns
```

A setting that is not obvious gets a comment explaining why, for example `\pgfplotsset{compat=1.18}  % use current pgfplots behaviour (label placement and so on)`.

### The standard preamble

This is the canonical preamble, based on the report and thesis template. Start from it and remove what the document does not use.

```latex
\documentclass[11pt,a4paper]{article}   % 11 pt text on A4 paper; report for chapters and a title page

% References
\usepackage{csquotes}                   % quotation marks that follow the document's language
\usepackage[backend=biber,style=apa,natbib=true]{biblatex} % APA 7; compile with Biber
\DeclareLanguageMapping{australian}{british-apa}
\usepackage{xurl}                       % allow long bibliography URLs to wrap within the page
\addbibresource{references.bib}

% Page
\usepackage[margin=25mm]{geometry}      % 25 mm margins all round
\usepackage{parskip}                    % a blank line between paragraphs instead of an indent
\usepackage[australian]{babel}          % Australian hyphenation, and \today as 17 October 2026
\usepackage{iftex}                      % tells which TeX engine is running
\ifPDFTeX                               % for pdfLaTeX only:
  \usepackage[T1]{fontenc}              % proper accented letters, and text that copies cleanly from the PDF
  \usepackage{lmodern}                  % Latin Modern, a crisp scalable version of the default font
\fi                                     % XeLaTeX, LuaLaTeX and Tectonic already use Unicode fonts
\usepackage{microtype}                  % small spacing tweaks so lines break more evenly

% Maths
\usepackage{amsmath}                    % align, cases, matrices and \text inside maths
\usepackage{amssymb}                    % extra symbols such as \mathbb{R}

% Figures and tables
\usepackage{graphicx}                   % \includegraphics, for photos and saved plots
\usepackage{booktabs}                   % \toprule, \midrule and \bottomrule for clean tables
\usepackage{siunitx}                    % numbers and units: \qty{6.6}{\kilo\watt}, aligned table columns
\sisetup{group-separator={,},group-minimum-digits=4} % 7,790 with a comma, as Australian style has it
\usepackage{pgfplots}                   % charts drawn from data, right in the document
\pgfplotsset{compat=1.18}               % use current pgfplots behaviour (label placement and so on)

% Links
\usepackage[hidelinks]{hyperref}        % clickable contents, cross-references and citations, without coloured boxes
\hypersetup{                            % details shown in the PDF viewer's document properties
  pdftitle  = {Rooftop solar output across a Melbourne year},
  pdfauthor = {Your Name},
  pdflang   = {en-AU}
}
\usepackage[capitalise,noabbrev]{cleveref} % \cref{fig:monthly} writes "Figure 4.1" for you; load after hyperref

\title{Rooftop solar output across a Melbourne year}
\author{Your Name}
\date{\today}

\begin{document}
```

Keep `pdftitle` the same as `\title`. When a title contains maths, give `\section` a plain text form with `\texorpdfstring{$\mathbf{x}' = A\mathbf{x}$}{x' = Ax}` so the PDF bookmarks read properly.

### Page settings by document type

Every document uses 25 mm margins and single line spacing. Do not load `setspace` unless a university or venue asks for wider spacing.

| Document | Class and options | Other |
| --- | --- | --- |
| Article, notes, assignment | `article`, `11pt,a4paper` | `\maketitle` |
| Report or thesis | `report`, `11pt,a4paper` | title page, roman front matter, `\tableofcontents`, `\listoffigures`, `\listoftables` |
| Simple document | `article`, `11pt,a4paper` | no title page or contents |
| CV | `article`, `10pt,a4paper` | sans serif, `\pagestyle{empty}`, accent colour |
| Letter | `article`, `11pt,a4paper` | `\pagestyle{empty}` |
| Slides | `beamer`, `aspectratio=169,11pt` | `Madrid` theme, no navigation symbols, no `geometry`, `hyperref` or `parskip` (Beamer handles all three) |

## Language and text

- Australian English spelling (colour, behaviour, organise, analyse), with `babel`'s `australian` option and `pdflang = {en-AU}`.
- Dates are written day month year: `17 October 2026`. `\today` prints this under `babel`.
- Quotation marks are single, typed as `` `this' `` or written with `\enquote{this}`. Double quotes are for a quotation inside a quotation.
- Use `\,` for a thin space between a number and a unit written without siunitx, such as `25\,mm` in prose about the page.
- Plain, direct sentences. A template's sample text explains what it shows, for example "Use \textcite{...} for a citation in a sentence".

## Units and numbers: siunitx

siunitx is the only way numbers with units are written, in the text, in tables and in figure labels.

| Write | Not | Prints |
| --- | --- | --- |
| `\qty{4.7}{\kilo\ohm}` | `4.7 k$\Omega$`, `\SI{4.7}{\kilo\ohm}` | 4.7 kΩ |
| `\qty{13}{\volt\per\micro\second}` | `13 V/$\mu$s` | 13 V/µs (with `per-mode = symbol`) |
| `\qty{\pm 15}{\volt}` | `$\pm$15 V` | ±15 V |
| `\qty{47e3}{\ohm}` | `$47\times10^3\,\Omega$` | 47 × 10³ Ω |
| `\unit{\hertz}` | `Hz` in an axis label | Hz |
| `\num{7790}` | `7,790` | 7,790 |
| `\ang{22.5}` | `22.5$^\circ$` | 22.5° |
| `\qty{65}{\degreeCelsius}` | `65$^\circ$C` | 65 °C |

- Use the macro names (`\kilo\watt\hour`), not the shorthand strings (`kWh`), so spacing and fonts are right.
- Set `\sisetup{group-separator={,},group-minimum-digits=4}` so large numbers group with a comma, as Australian style has it.
- Add `per-mode = symbol` in documents full of rates (electronics, physics) so units read V/µs, not V µs⁻¹.
- In running prose a percentage is written in words, `6 per cent`. In a table or next to other measured values, use `\qty{19.0}{\percent}`.
- Number columns in tables use the `S` column type with a `table-format`, and their headings go in braces: `S[table-format=4.0]` under `{Measured (kWh)}`.
- Do not load the `physics` package. It redefines `\qty` and breaks every siunitx quantity. Use `amsmath` and `mathtools` for derivatives and brackets instead.

## Maths

- `amsmath` and `amssymb` always. Add `mathtools` for `\coloneqq` and paired delimiters, and `amsthm` for theorems and proofs.
- Numbered equations use `equation` or `align`, each with `\label{eq:...}`. Unnumbered displays use `\[ ... \]`, never `$$ ... $$`.
- Refer to equations with `\cref{eq:gain}`, which prints "Equation (1.1)". Do not use `\eqref` or a bare `\ref`.
- Vectors are bold upright, `\mathbf{x}`. Sets of numbers use `\mathbb{R}`.
- Subscripts that are words or labels are upright: `R_\mathrm{in}`, `\eta_{\text{ref}}`. Subscripts that are variables stay italic: `x_i`.
- Use `\bigl( ... \bigr)` for brackets that need to be a little larger, and `\,` between multiplied symbols where it helps reading (`\eta \, A \, G`).
- In notes and assignments, number equations, figures and tables by section:

```latex
% Number equations, figures and tables by section: (2.1), Figure 2.1, ...
\numberwithin{equation}{section}
\numberwithin{figure}{section}
\numberwithin{table}{section}
```

### Theorems and worked examples

All theorem-like environments share one counter per section, so they read Theorem 2.1, Example 2.2 and so on. Use this set as it is, and leave out the ones the document does not need.

```latex
% Theorem-like environments, all sharing one counter per section: Theorem 2.1, Example 2.2, ...
\theoremstyle{plain}                    % italic text, for statements
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{corollary}[theorem]{Corollary}
\theoremstyle{definition}               % upright text, for definitions and examples
\newtheorem{definition}[theorem]{Definition}
\newtheorem{example}[theorem]{Example}
\theoremstyle{remark}                   % italic heading and upright text, for asides
\newtheorem{remark}[theorem]{Remark}
\newenvironment{solution}{\begin{proof}[Solution]}{\end{proof}}
```

A worked example is an `example` followed by a `solution`, which ends with the proof box.

## Figures

- A figure is `\begin{figure}[ht]`, then `\centering`, the picture, `\caption{...}` and `\label{fig:...}`. The caption goes below the picture.
- Captions are sentences: they start with a capital and end with a full stop.
- Images live in `figures/` and are included with `\includegraphics[width=0.75\linewidth]{figures/name.png}`.
- Prefer drawing in LaTeX (pgfplots, TikZ, circuitikz) over pasting screenshots of plots, so the text matches the document's font.
- Spectrum inserts figures with `[H]` (exactly here) unless the user chooses other placement. `[H]` needs the `float` package, which Spectrum adds. A float that is allowed to move (`[ht]`) is better in long documents.

### Image sizes

Size an image one way, chosen from these:

| Way | Write | Use it for |
| --- | --- | --- |
| A share of the line | `width=0.75\linewidth` | Most images. It keeps the layout when the margins or columns change. |
| An exact width | `width=60mm` | Images that must be a set size, such as a logo. |
| An exact height | `height=40mm` | Images of different shapes side by side, so they line up. |
| A box it fits in | `width=60mm,height=40mm,keepaspectratio` | Images of unknown shape that must not exceed a size. |
| A scale | `scale=0.5` | Rarely: it depends on the size the file was saved at. |

- A single image at a share of the line also gets `height=0.8\textheight,keepaspectratio`, so a tall image (a phone screenshot) cannot run off the page.
- Crop with `trim=left bottom right top,clip` in millimetres, such as `trim=5mm 0mm 5mm 0mm,clip`. The image file itself is not changed.
- Never set both `width` and `height` without `keepaspectratio`, as it stretches the image.

### Several images in one figure

Put images that belong together in one figure. Spectrum's Insert figure offers three kinds, laid out side by side or in a grid of two to four columns.

**Sub-figures (a), (b)** share one figure number and caption, and each has a short caption and a label of its own. Use `subcaption`'s `subfigure`. Do not use the older `subfig` or `subfigure` packages: they are out of date and clash with `subcaption`, `hyperref` and `cleveref`.

```latex
\begin{figure}[H]
    \centering
    \begin{subfigure}[t]{0.48\linewidth}
        \centering
        \includegraphics[width=\linewidth]{figures/measured.png}
        \caption{Measured output.}
        \label{fig:measured}
    \end{subfigure}\hfill
    \begin{subfigure}[t]{0.48\linewidth}
        \centering
        \includegraphics[width=\linewidth]{figures/modelled.png}
        \caption{Modelled output.}
        \label{fig:modelled}
    \end{subfigure}
    \caption{Energy across the year.}
    \label{fig:energy}
\end{figure}
```

- `\cref{fig:measured}` prints "Figure 1a" and `\cref{fig:energy}` prints "Figure 1".
- Panels are `0.48\linewidth` wide for two a row, `0.31\linewidth` for three and `0.22\linewidth` for four, separated by `\hfill`. A new row starts with `\par\medskip` after the last panel of the row before.
- Inside a panel, `\linewidth` is the panel's width, so `width=\linewidth` fills it.

**Separate figures** side by side each have their own number (Figure 2 and Figure 3), caption and label. Use a `minipage` for each, with its own `\caption`, inside one `figure`. No package is needed.

**One caption** puts the images together under a single caption and label, with no letters. Use a `minipage` for each, and the `\caption` after the last.

**Lining up** panels of different heights:

| Line up | Write | Result |
| --- | --- | --- |
| Bottoms | `[t]` on each panel | The images' bottoms line up, so the captions under them start level. The default. |
| Centres | `[c]` on each panel | The panels' centres line up. |
| Tops | `[t]`, with each image as `\vtop{\vskip0pt\hbox{\includegraphics[...]{...}}}` | The images' tops line up. A plain `[t]` lines up the bottoms, because an image's baseline is its bottom edge. |

### Plots with pgfplots

```latex
\begin{figure}[ht]
  \centering
  \begin{tikzpicture}
    \begin{semilogxaxis}[
        width=0.8\textwidth, height=6cm, grid=major,
        xmin=10, xmax=1e5, ymin=-25, ymax=25,
        xlabel={Frequency $f$ (\unit{\hertz})}, ylabel={Gain (\unit{\decibel})}]
      \addplot[thick, blue, domain=1:5, samples=100]
        ({10^x}, {20 - 10*log10(1 + (10^x/1026)^2)});
    \end{semilogxaxis}
  \end{tikzpicture}
  \caption{Gain of the filter: flat at \qty{20}{\decibel}, then falling above $f_c$.}
  \label{fig:bode}
\end{figure}
```

- Always set `\pgfplotsset{compat=1.18}` in the preamble.
- Set the width as a fraction of `\textwidth` and the height in mm or cm.
- Axis labels read `Quantity $symbol$ (unit)`, with the unit from `\unit`.
- Leave a comment when a choice is not obvious, such as why points are sampled in powers of ten.

### Circuits with circuitikz

- Load it as `\usepackage[american]{circuitikz}`: zigzag resistors, and plus and minus voltage labels.
- Label parts with maths (`l=$R_f$`) and give values with siunitx in the text or a parts table.

### Diagrams from Spectrum's composer

The composer saves each drawing as `diagrams/<name>.tex`, a standalone document that carries its own packages and a final `% spectrum-diagram v1 ...` line holding the drawing. Do not edit or remove that last line. Insert the drawing with `\includestandalone`, which needs `\usepackage{standalone}` in the preamble. Spectrum's Floats tab adds it, with the drawing's own packages, when it inserts a diagram:

```latex
\begin{figure}[ht]
  \centering
  \includestandalone[width=0.6\linewidth]{diagrams/amp}
  \caption{An amplifier.}
  \label{fig:amp}
\end{figure}
```

## Tables

```latex
\begin{table}[ht]
  \centering
  \caption{Energy by season, measured and modelled.}\label{tab:seasons}
  \begin{tabular}{l S[table-format=4.0] S[table-format=4.0] S[table-format=-1.1]}
    \toprule
    Season & {Measured (kWh)} & {Modelled (kWh)} & {Difference (\%)} \\
    \midrule
    Summer & 2740 & 2810 & 2.6  \\
    Winter & 1110 & 1050 & -5.4 \\
    \midrule
    Year   & 7790 & 7790 & 0.0  \\
    \bottomrule
  \end{tabular}
\end{table}
```

- The caption goes above the table.
- Use `\toprule`, `\midrule` and `\bottomrule` from booktabs. No `\hline` and no vertical lines.
- Text columns are `l`, number columns are `S` with a `table-format`, and units go in the column heading, not in every cell.
- Line up the `&` and `\\` in the source when it helps reading.

### Choosing the environment

| Environment | Package | Width | Use it for |
| --- | --- | --- | --- |
| `tabular` | none | Each column as wide as its widest cell | Short entries and numbers. The default. |
| `tabularx` | `tabularx` | Exactly `\linewidth`; `X` columns share the spare width and wrap | Tables with sentences in them. |
| `xltabular` | `xltabular` | As `tabularx`, and runs across pages | Long tables only, such as data listings or appendices. |

Do not use `tabulary` (unpredictable widths) or `tabularray` (slow, a syntax of its own, not covered by LaTeX's tagged PDF work, and looking for a new maintainer).

An `xltabular` holds its own caption and does not go inside `table`. Its header rows repeat on every page:

```latex
\begin{xltabular}{\linewidth}{l S[table-format=3.1] X}
    \caption{Readings over the year.}\label{tab:readings} \\
    \toprule
    Month & {Output (kWh)} & Notes \\
    \midrule
    \endfirsthead
    \toprule
    Month & {Output (kWh)} & Notes \\
    \midrule
    \endhead
    \multicolumn{3}{r}{\emph{Continued on the next page}} \\
    \endfoot
    \bottomrule
    \endlastfoot
    January & 950.0 & Hot and clear. \\
\end{xltabular}
```

### Numbers: S columns

- An `S` column from `siunitx` lines numbers up on their decimal point.
- Give it a `table-format`: the digits before and after the point, and a `-` when any number is negative. For example, `S[table-format=-4.1]` fits -1234.5. Spectrum's table tool works this out from the numbers typed.
- Write numbers plainly, without thousands separators. siunitx adds them, and reads a comma as a decimal point.
- Put headings and any text in an `S` column in braces, `{Measured (kWh)}` or `{n/a}`, so siunitx leaves them alone.

### Merged cells and grouped headings

```latex
\begin{tabular}{l S[table-format=4.0] S[table-format=4.1]}
    \toprule
    \multirow{2}{*}{Season} & \multicolumn{2}{c}{Energy (kWh)} \\
    \cmidrule(lr){2-3}
     & {Measured} & {Modelled} \\
    \midrule
    Summer & 2740 & 2810.5 \\
    \bottomrule
\end{tabular}
```

- Merge across columns with `\multicolumn{n}{c}{...}`, which is built in. Centre a merged heading.
- Merge down rows with `\multirow{n}{*}{...}` from the `multirow` package. Leave the cells it covers empty.
- Under a heading that spans a group of columns, draw `\cmidrule(lr){a-b}`. The `(lr)` trims its ends so neighbouring groups stay apart. Without booktabs, the equivalent is `\cline{a-b}`.
- A rule must not cross a cell merged down the rows. Draw `\cmidrule` or `\cline` either side of it instead.
- In a table with a merged header, all the header rows count as the header. In `xltabular` they all repeat on each page.

### Line breaks and notes

- For a line break inside a cell, wrap the cell in `\makecell{First line \\ second line}` from the `makecell` package. A bare `\\` ends the row.
- For notes under a table, put the table in a `threeparttable` with a `tablenotes` list after it. Mark a cell with `\tnote{a}`. `xltabular` cannot take notes this way.

```latex
\begin{table}[H]
    \centering
    \begin{threeparttable}
        \caption{Results.}
        \label{tab:results}
        \begin{tabular}{lc}
            \toprule
            Method & Score\tnote{a} \\
            \midrule
            Ours & 0.91 \\
            \bottomrule
        \end{tabular}
        \begin{tablenotes}
            \small
            \item[a] Averaged over five runs.
        \end{tablenotes}
    \end{threeparttable}
\end{table}
```

## Code

### Listings

Code blocks use `listings`, which needs no shell escape. Every document with code defines this style and uses it for all listings:

```latex
% Code
\usepackage{xcolor}                     % named colours for the code highlighting below
\usepackage{listings}                   % highlighted code blocks and \lstinline, with no shell-escape

% How code looks: set language=... per listing (Python, C, Java, Matlab, bash, SQL, ...).
% Under pdfLaTeX listings only reads plain ASCII, so keep accents and emoji out of code.
\lstdefinestyle{report}{
  basicstyle       = \ttfamily\small,
  keywordstyle     = \color{blue!70!black}\bfseries,
  commentstyle     = \color{green!40!black}\itshape,
  stringstyle      = \color{red!60!black},
  numbers          = left,              % line numbers down the left
  numberstyle      = \tiny\color{gray},
  frame            = single,
  rulecolor        = \color{gray!40},
  backgroundcolor  = \color{gray!5},
  breaklines       = true,              % wrap long lines instead of running off the page
  postbreak        = \mbox{\textcolor{gray}{$\hookrightarrow$}\space},
  columns          = fullflexible,      % natural letter spacing, not fixed-width columns
  keepspaces       = true,
  showstringspaces = false,
  upquote          = true,              % straight quotes, as typed
  tabsize          = 4,
  xleftmargin      = 1.5em,             % room for the line numbers
  framexleftmargin = 0.5em
}
\lstset{style=report}
```

- Set the language on each listing, with a caption and a `lst:` label:

```latex
\begin{lstlisting}[language=Python, caption={Dijkstra's algorithm in Python.}, label={lst:python}]
import heapq
...
\end{lstlisting}
```

- Short code in a sentence uses `\lstinline[language=Python]|heapq.heappop(queue)|`.
- Add `float=tp` to a listing shorter than a page so it moves to the top of a page rather than splitting. Leave it off for longer code.
- Keep code ASCII only: no accented letters, curly quotes or emoji, since pdfLaTeX cannot read them in listings.
- Code in the document should run as shown, with comments in the code where a reader needs them, and the expected output as a trailing comment where useful.
- In slides, a frame that holds code needs `\begin{frame}[fragile]`. The slides template uses a lighter `\lstset` with `language=Python`, no line numbers and no frame, because code on a slide is short.

### Pseudocode

```latex
\usepackage{algorithm}                  % numbered, captioned boxes for algorithms
\usepackage{algpseudocode}              % pseudocode commands: \State, \If, \While, \Function, ...
\algrenewcommand\algorithmicrequire{\textbf{Input:}}    % \Require prints Input: rather than Require:
\algrenewcommand\algorithmicensure{\textbf{Output:}}    % \Ensure prints Output: rather than Ensure:
```

- An algorithm is `\begin{algorithm}[ht]`, then `\caption`, `\label{alg:...}` and `\begin{algorithmic}[1]` for line numbers.
- Start with `\Require` and `\Ensure`, use `\gets` for assignment, maths for every variable, and `\Comment{...}` for a short note.

## References

```latex
% References
\usepackage{csquotes}                   % quotation marks that follow the document's language
\usepackage[backend=biber,style=apa,natbib=true]{biblatex} % APA 7; compile with Biber
\DeclareLanguageMapping{australian}{british-apa}
\usepackage{xurl}                       % allow long bibliography URLs to wrap within the page
\addbibresource{references.bib}
```

- APA 7 through `biblatex-apa`, with Biber as the backend. Do not use `natbib` with a `.bst` file, or `backend=bibtex`, in a Spectrum document.
- `\DeclareLanguageMapping{australian}{british-apa}` goes with `babel`'s `australian` option. Leave it out only in a document without babel.
- Cite with `\textcite{key}` in a sentence and `\parencite{key}` in parentheses. `natbib=true` keeps `\citet` and `\citep` working, and the templates use both forms.
- End the document with `\printbibliography`. In a report, put the bibliography in the contents:

```latex
\cleardoublepage
\phantomsection
\addcontentsline{toc}{chapter}{Bibliography}
\printbibliography
```

### The .bib file

- Keys are what Spectrum generates when it adds a reference (`baseKey` in `apps/backend/src/services/referenceService.js`): the first author's surname with a capital letter, then the year, with no spaces or punctuation.
  - `Masters2013`, `Duffie2013`, `Knuth1984`.
  - A surname particle joins on: van der Waals in 1873 is `VanderWaals1873`. Accents are dropped: Gödel is `Godel1931`.
  - An organisation as author takes its first two words: `OpenAI2023`, `WorldHealth2024`.
  - With no author, the first main word of the title stands in: `Blog2024`.
  - A second key that would clash takes a letter: `Smith2020`, then `Smith2020a`, `Smith2020b`.
- One field per line, with two spaces of indent. Spectrum writes `field = {value}` with one space either side of `=`; the templates line the `=` signs up. Either is fine.
- Write authors as `Surname, Given and Surname, Given`. Protect capitals and commands in titles with braces: `{{\LaTeX}: A Document Preparation System}`.
- Give a `doi` when there is one, and a `url` only for web sources.
- Spectrum's References tab adds entries in this form. Use it rather than typing entries from memory, so the details are verified.

```bibtex
@book{Masters2013,
  author    = {Masters, Gilbert M.},
  title     = {Renewable and Efficient Electric Power Systems},
  edition   = {2nd},
  publisher = {Wiley},
  address   = {Hoboken, NJ},
  year      = {2013}
}
```

## Cross-references and labels

- Every document loads `cleveref` with `[capitalise,noabbrev]`, after `hyperref`, and every reference uses `\cref`: figures, tables, sections, chapters, equations, listings, algorithms, theorems and examples. Never type the name before a `\ref`, as in `Figure~\ref{...}`. Then `\cref{fig:monthly}` prints "Figure 4.1" and `\cref{eq:power,eq:temperature}` prints both.
- Put the label right after the caption, or right after `\chapter`, `\section` or `\begin{equation}`.
- Every label has a type prefix:

| Prefix | For |
| --- | --- |
| `ch:` | chapter |
| `sec:` | section |
| `app:` | appendix |
| `eq:` | equation |
| `fig:` | figure |
| `tab:` | table |
| `lst:` | code listing |
| `alg:` | algorithm |
| `thm:`, `lem:`, `def:`, `ex:` | theorem, lemma, definition, example |

- After the prefix, use short lower-case words joined by hyphens: `fig:monthly`, `tab:system`, `eq:cutoff`.
- Load cleveref before the `\newtheorem` definitions, so a lemma or an example that shares the theorem counter is still called Lemma or Example.
- `\cref` capitalises at the start of a sentence and in the middle alike ("see Figure 2.1"), which is the house style.

## Links and PDF details

- `\usepackage[hidelinks]{hyperref}` gives clickable links without coloured boxes. A CV uses `colorlinks = true` with its accent colour instead.
- Always set `pdftitle`, `pdfauthor` and `pdflang = {en-AU}` in `\hypersetup`, laid out one key per line with the `=` signs lined up.
- In Beamer, do not load hyperref (Beamer does). Set only `pdfsubject` and `pdflang`.

## Document structure

- Articles: `\maketitle`, then `\section`s. A report adds a `titlepage`, an abstract and acknowledgements as `\chapter*`, the contents, lists of figures and tables, then chapters.
- In a report, number the title page `alph`, the front matter `roman` and the chapters `arabic`, so the PDF's page links never clash:

```latex
\pagenumbering{alph}                    % the title page, so its link target cannot clash with page 1 or page i
\begin{titlepage} ... \end{titlepage}
\pagenumbering{roman}                   % front matter: i, ii, iii
...
\clearpage
\pagenumbering{arabic}                  % chapter 1 starts again at 1
```

- Long chapters go in their own files with `\include{chapters/name}`.
- Appendices come after the bibliography, after `\appendix`.
- Indent the body of environments by two spaces. Keep source lines to about 100 characters, breaking at the end of a sentence or clause.

## CV and letter extras

The CV keeps its look in a few lines that are easy to change:

```latex
\renewcommand{\familydefault}{\sfdefault} % sans-serif text, which reads well on screen
\usepackage{xcolor}                     % named colours, for the headings and links
\definecolor{accent}{RGB}{0,82,147}     % a deep blue; change it to restyle the whole CV
\usepackage{titlesec}                   % restyle section headings
\titleformat{\section}{\large\bfseries\color{accent}}{}{0pt}{}[\titlerule] % bold, coloured, ruled underneath
\titlespacing*{\section}{0pt}{10pt}{4pt} % less space around headings than in an article
\usepackage{enumitem}                   % control list spacing
\setlist{nosep, leftmargin=*}           % tight lists that line up with the text

% One line per entry: what on the left, when on the right, details below
\newcommand{\entry}[3]{\textbf{#1}\hfill #2\\#3\par}
```

Letters and CVs use `\pagestyle{empty}`, since they have no page numbers.

## Venue templates

The ACL, CVPR, arXiv, NeurIPS and ICML templates keep the venue's own class or style file, fonts and layout. Spectrum changes only the references, to APA 7 through biblatex and Biber, and marks this at the top:

```latex
% Spectrum adaptation: APA 7 references; use the venue's official style for submission.
```

When writing for a venue, follow the venue's instructions first and this document second. Before submitting, switch to the venue's own bibliography style if it requires one.

## Checklist for an agent

Before handing back a new `.tex` file, check that:

1. The class is `11pt,a4paper` (or the table above for a CV or slides) with `geometry` at 25 mm and single spacing.
2. The preamble groups are in the order References, Page, Maths, Figures and tables, Code, Links, each with a `%` heading, and the packages in each group follow the order in [Order](#order).
3. Every `\usepackage` has a plain English comment, lined up with the others.
4. The `iftex` block loads `fontenc` and `lmodern` for pdfLaTeX only, and there is no `inputenc` or shell escape package.
5. `babel` is `australian`, `pdflang` is `en-AU` and the spelling is Australian.
6. Every number with a unit is `\qty`, `\unit`, `\num` or `\ang`, and `physics` is not loaded.
7. biblatex is `backend=biber,style=apa,natbib=true` with the `british-apa` mapping, `xurl` and `\printbibliography`, and the keys are in Spectrum's `AuthorYear` form.
8. Every figure, table, equation, listing and algorithm that is referred to has a prefixed label, and every reference uses `\cref`.
9. Tables use booktabs with captions above, `S` columns for numbers, and `xltabular` only for tables longer than a page. Figures have captions below.
10. Images are sized one way from [Image sizes](#image-sizes), and images that belong together are sub-figures with `subcaption`, not `subfig` or `subfigure`.
11. Code uses the `report` listings style with a language, caption and label on each listing.
12. `hyperref` ends the packages with `hidelinks` and `\hypersetup`, followed only by `cleveref`.
13. The document compiles in Spectrum with Tectonic without errors or undefined references.

## Exceptions in the templates

The built-in templates follow this standard, with these deliberate exceptions:

| Template | Exception | Why |
| --- | --- | --- |
| Slides | No `% Page` group; `babel` and the `iftex` block sit under `% Look` | Beamer sets its own page and paragraphs. |
| NeurIPS, ICML | `\usepackage[utf8]{inputenc}` and `times` | Lightweight skeletons of the venue style, to be replaced by the official files. |
| ACL, CVPR, arXiv | The venue's own preamble, sample bibliography keys and cross-reference style | Venue rules come first. |
