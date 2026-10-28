## Small interface fixes: lines between table cells, the Skills switch and related polish

> **Decisions taken on 29 October 2026.** These were decided with the user after this section was written. Where the text below recommends or assumes something else, these decisions win. Every other open question in this section takes its recommended default.
>
> - Lines between cells: click the gap between two rows or columns to add or remove a full line, with presets setting them all. Partial lines come later.
> - The switch is 36 by 20 px.
> - **Every** on/off tick box in Settings becomes a switch this round, not only Skills, the shared-settings switch and Review's anonymous switch.

### Goal

People can put a line between any two rows or columns of a table, or along its edges, by clicking in the Insert table grid. Presets cover the usual styles, and Spectrum writes the lines correctly in LaTeX and Typst. Markdown tables cannot carry lines, so the card says so there. All three switches in the app become one switch that Spectrum draws itself. It is sized to sit with the app's buttons and badges and looks the same on macOS and Windows, which ends today's squashed switch on the Mac and the plain tick box on Windows. Three small fixes come with these:

- Typst and Markdown tables follow the column alignment, and a tabularx choice made in a LaTeX document no longer leaks into them.
- The table card stops showing LaTeX settings in Typst and Markdown documents.
- Clicking a skill's switch moves it at once, and a quick save no longer dims the rest of the Skills list.

### What Spectrum does today

The table card:

| Where | Today |
| --- | --- |
| `apps/frontend/src/editor/floats.ts:100` `TableLines` | Three presets: `'booktabs' \| 'grid' \| 'minimal'`. `TableModel` (lines 102 to 117) has no setting for single lines. |
| `floats.ts:119` `defaultAlign` | Returns `'X'` for every column of a tabularx table, otherwise `l` for the first column and `c` for the rest. |
| `floats.ts:174-179` `RULES` | Booktabs writes `\toprule`, a `\midrule` under the header and `\bottomrule`. Grid writes `\hline` after every row and `\hline\hline` under the header. Minimal writes `\hline` at the top, under the header and at the bottom. |
| `floats.ts:181-211` `tableLatex` | Grid is the only preset with vertical lines, and it draws all of them (`\|l\|c\|c\|`, line 185). You cannot add or remove a single line. A row that starts with `[` or `*` gets `{}` in front (line 191). |
| `floats.ts:305-314` `tableTypst` | Ignores both `lines` and `align`. Typst draws every line unless told otherwise, so Booktabs and Minimal come out as a full grid in a Typst document. `floats.check.ts:318-322` expects exactly that for a Booktabs model. |
| `floats.ts:322-332` `tableMarkdown` | Writes `---` for every column, so the column alignment is lost. |
| `apps/frontend/src/editor/tools/FloatsTab.tsx:801-1021` `InsertTable` | The grid is an HTML `<table>` (lines 885 to 922) with 4 px spacing (`apps/frontend/src/styles/tools.css:1720-1723`). The header row's cells always get a 2 px underline, whichever preset is chosen (`tools.css:1744-1747`). “Lines” is a `Segmented` radio group with “Booktabs”, “Grid” and “Minimal” (`LINES` at lines 793 to 797, used at line 974), placed under “Environment”. `insert()` adds the booktabs package when the preset is Booktabs (line 872). Copy (line 862) adds no package. |
| `FloatsTab.tsx:807-823` | `env` is card state, so it stays when the user moves to another document. `align` is `chosen[c] ?? defaultAlign(env, c)` (line 821) whatever the document. Changing “Environment” empties `chosen` (lines 969 to 970), so `'X'` is only ever chosen under tabularx. |
| `FloatsTab.tsx:129-152` `Segmented` | Calls `onChange` even for the option already lit. |
| The same card in a Typst or Markdown document | “Environment”, “Escape special characters”, “Placement” and “Span both columns” still appear. `tableTypst` and `tableMarkdown` read none of `env`, `escape`, `placement` or `span`. With tabularx left on from a LaTeX document, every column is `'X'`: the column menus show a blank label (`apps/frontend/src/app/Select.tsx`) and the table comes out left-aligned. |
| `apps/frontend/src/editor/floats.check.ts` | Runs with `npx esbuild apps/frontend/src/editor/floats.check.ts --bundle --platform=node --log-level=warning \| node` (line 2). Table cases are at lines 88 to 168 and 318 to 330. The Windows workflow runs every `*.check.ts` (`.github/workflows/windows.yml:117-125`). |
| Pandoc | Spectrum installs pandoc 3.12.1 (`apps/backend/src/data/engines.json:52`) and falls back to one on the PATH (`apps/backend/src/services/engineService.js:62-63`). The Markdown compile runs `--from=markdown` with no filter (`apps/backend/src/services/markdownService.js:184-186` and 203-205). |

The switches:

| Where | Today |
| --- | --- |
| `apps/frontend/src/app/SettingsSheet.tsx:1754` and `apps/frontend/src/editor/tools/ReviewTab.tsx:55` | `const SWITCH = { switch: '' } as object` is spread onto `<input type="checkbox" role="switch">` to get WebKit's built-in switch. |
| Uses | One per skill in `SkillsPane` (`SettingsSheet.tsx:1880-1888`), the sharing switch in `SkillSharing` (line 2088) and “Anonymous review” (`ReviewTab.tsx:363`). There are no others, and no CSS styles `role="switch"` yet. |
| `apps/frontend/src/styles/base.css:130-136` | Every tick box is 14 by 14 px, and this includes the switch. |
| Measured in a WKWebView on this Mac (macOS 27) | The switch is drawn at 14 by 14 px as a squashed pill. This is the switch the user calls very small. WebKit's own switch is 41 by 18 px at this text size. |
| Measured in Chrome 156 (Chromium, the engine behind WebView2) | The `switch` attribute is ignored and a 14 px tick box appears. `docs/SPECTRUM_2_HANDOFF.md:658` records this. The attribute also needs Safari 17.4, so a Mac at the minimum macOS 13.5 (`src-tauri/tauri.conf.json:66`) that is still on Safari 16 shows a tick box too. |
| `SkillsPane` `run` (`SettingsSheet.tsx:1779-1792`) | Every change sets `busy` until the save and the reload finish. `busy` disables every switch and also “Create skill” (line 1852), “Add folder…” (1855), “Reset” (1875), “Duplicate” (1899) and “Delete” (1903). `.btn:disabled` dims them to 0.45 (`base.css:464-466`) over the 0.12 s fade of `.btn` (`base.css:452`), with no delay. So the whole list flashes on every click. The guard itself is needed: `setForProject` (lines 1794 to 1798) reads and then writes `.spectrum/settings.json`, so two saves at once could lose a change. |
| The clicked switch | It is controlled (`checked={skillOn(skill, inProject)}`), so React puts it back until `load()` finishes. It moves only once the save and the reload are done. |

### The design

#### Lines between cells

With a LaTeX or Typst document open:

- **The grid shows the table's lines.** Cells become soft grey blocks with no border of their own, and the header row is a shade darker. There is a 10 px gap between cells. A line appears in a gap wherever the table will have one. Lines are 1 px, with 2 px for the booktabs top and bottom rules and a double line under the header for Grid.
- **Clicking a gap adds a line across the table.** Hovering over a gap shows a dashed line in the accent colour. Clicking adds a line across the whole table at that place. Clicking an existing line removes it. The outer edges work the same way. With Booktabs, the gaps between columns do nothing.
- **The hint under the grid** reads “Tab moves to the next cell and Return moves down. Paste rows from Numbers, Excel or a CSV file to fill the grid. Click between two rows or two columns, or along an edge, to add or remove a line across the table.” On Windows it keeps “Enter” and leaves out “Numbers, ”, as it does now.
- **“Lines” moves up** to sit under that hint and gains a fourth preset: “Booktabs”, “Grid”, “Minimal”, “None”. A preset sets every line.
  - Once a line has been changed by hand, no preset is lit and the hint reads “Changed by hand from Booktabs. Choose a preset to start again.” (with the name of the preset the changes started from). Choosing any preset then clears the changes. This way clicking a lit segment never throws work away silently.
  - With Booktabs: “Booktabs rules are heavier at the top and bottom and take no vertical lines. Insert table adds the booktabs package.” Typst documents get the first sentence only.
- **“Lines at row 2 and column 3”** follows the cell that last had focus. It has four toggle buttons: “Above row 2”, “Below row 2”, “Before column 3”, “After column 3”. Each one switches a line across the whole table, as a click in the grid does. With Booktabs, “Before column 3” and “After column 3” are greyed out.

With a Markdown document open, the gaps cannot be clicked and the line controls are hidden. The hint ends with “Markdown tables have no lines of their own: pandoc draws its usual rules when the document compiles.” I checked this with pandoc: a pipe table gets booktabs rules in LaTeX and a line under the header in Typst.

What each preset writes:

| Preset | Lines | LaTeX | Typst |
| --- | --- | --- | --- |
| “Booktabs” (default) | Top, under the header row and bottom. Never vertical. | `\toprule`, `\midrule` and `\bottomrule`, as now. A line added between body rows is another `\midrule`. | `stroke: none` and `table.hline`, 0.08em at the top and bottom and 0.05em elsewhere. These are booktabs' own widths (`booktabs.sty:38-40`). |
| “Grid” | Every line, with a double line under the header | `\|l\|c\|c\|`, `\hline` after each row and `\hline\hline` under the header, as now | Typst's default lines, as now. The header line is single because Typst has no double line. |
| “Minimal” | Top, under the header row and bottom | `\hline` in those three places, as now | `stroke: none` and three `table.hline` |
| “None” (new) | None | No rules and no `\|` | `stroke: none` |

What a line changed by hand writes:

| Line | LaTeX | Typst |
| --- | --- | --- |
| Before column j, or down either side | `\|` at that place in the column spec | `table.vline(x: j)` |
| Above row i, or along the top or bottom | `\hline`. With Booktabs: `\toprule` at the top, `\bottomrule` at the bottom and `\midrule` between rows. | `table.hline(y: i)`, at booktabs' widths when the preset is Booktabs |

How it works: every place a line can go has a name.

- Down the table: `top`, `head` (under a header row), `under-2` (under the second row) and so on, then `bottom`.
- Across the table: `left`, `after-1` (after the first column) and so on, then `right`.

A preset is a rule about which names get a line. Booktabs and Minimal draw `top`, `head` and `bottom`. Grid draws everything, with `head` double. None draws nothing. The card stores the preset and the list of names the user has flipped. As a result:

- A preset still covers rows and columns added later.
- The header's line follows the “Header row” tick box.
- With Booktabs, vertical names are ignored.
- With Grid, the line under the header is either double or absent. A single line there needs Minimal or None plus clicks (decision 2).

Booktabs takes no vertical lines because its rules have space above and below that breaks them. Compiling `l|cc` with `\toprule` and `\midrule` shows the gaps.

Keyboard and screen readers:

- The gaps are mouse targets only (`aria-hidden` and not focusable), so Tab still moves from cell to cell exactly as now.
- The “Lines at …” buttons are the path for the keyboard, VoiceOver and Narrator. They are `aria-pressed` buttons in a group whose label names the row and column. Each button's name says which line across the table it changes, so nobody is told it is a border around one cell.
- Clicking a gap does not move focus away from the cell being typed in.

#### The switch

One set of rules in `base.css` styles every `<input type="checkbox" role="switch">`. Spectrum's CSS draws it instead of the web view, so it looks the same in both engines. No new component is needed: the call sites only lose `{...SWITCH}`.

- **Size:** 36 by 20 px, pill-shaped, with a 16 px white thumb inset 2 px and the app's small shadow. This sits between the app's 18 px badges and 26 px small buttons. It is close to WebKit's own switch (41 by 18) and Windows 11's (about 40 by 20). Next to a label it centres on the first line of text, as a tick box does.
- **Colours:** on uses the accent, which is the macOS accent colour or the one picked in Settings. Off uses a new `--switch-off`: three parts `--text-tertiary` to one part of the solid panel colour. That is #8d8d91 in light mode and #7a7a7e in dark mode. It is darker than macOS's pale grey so that the track and thumb meet the 3:1 contrast WCAG asks of controls:
  - 3.31:1 on white, 3.78:1 on the dark panel and 3.37:1 on dark sheets
  - the thumb against the track: 3.31:1 in light mode and 4.26:1 in dark mode
  - for comparison, the pale grey is 1.45:1.
- **Disabled:** 0.45 opacity, as for `.btn:disabled`. The dim starts only once a switch has been disabled for 0.2 s, and the switch comes back at once when re-enabled. Headless Chrome confirmed this: a 100 ms save never changed the opacity, and a 600 ms save dimmed it to 0.45 and brought it back within 0.2 s.
- **Focus:** the app's own `:focus-visible` ring (`base.css:125-128`), which follows the pill shape in both engines.
- **Motion:** the thumb slides in 0.15 s. The existing reduced motion rule (`tokens.css:190-195`) already turns this off.
- **Windows contrast themes:** the switch takes the theme's colours.
  - Off: an outlined track with a CanvasText thumb.
  - On: a Highlight track with a HighlightText thumb.
  - Disabled: GrayText.
  - Without this, a switch drawn in CSS would disappear in a contrast theme.

I rendered the switch from the app's own stylesheets in a WKWebView in light and dark mode. I also rendered it in headless Chrome in light mode, dark mode and both emulated contrast themes.

#### Other polish

1. **Alignment in Typst and Markdown.** `tableTypst` writes `align: (left, center, right)` when any column is not left-aligned. `tableMarkdown` writes `:---`, `:---:` and `---:`. Pandoc keeps the Markdown alignment: it becomes `lcr` in LaTeX and `align:` in Typst.
2. **LaTeX settings only for LaTeX.** In Typst and Markdown documents, the card hides “Environment”, “Escape special characters”, “Placement” and “Span both columns”, and treats the table as tabular whatever “Environment” says.
   - The column menus offer “Left”, “Centre” and “Right”. A column set to “Fill (X)” in a LaTeX document falls back to the tabular default there (“Left” for the first column, “Centre” for the rest). The choice comes back when the user returns to the LaTeX document.
   - The “Float” hint says what each format gets:
     - Typst: “Wraps it in #figure with a caption and a label.”
     - Markdown: “Adds the caption and label on a Table: line under it.”
     - LaTeX: unchanged.
   - The Markdown label works with the pandoc Spectrum installs. I ran `Table: Cap. {#tab:x}` through pandoc 3.9.0.2 (Oleafly's bundled copy): it wrote `\label{tab:x}` in LaTeX and `<tab:x>` in Typst. Pandoc 3.8 printed it as text, so a pandoc older than that on the PATH does the same. That is today's behaviour and is not changed here.
3. **No flash on save.** Two parts:
   - The clicked skill switch shows its new state straight away, and goes back if the save fails.
   - Buttons get the same delayed dim as switches. Every `.btn:disabled` in the app dims only after 0.2 s, so “Duplicate”, “Delete”, “Reset”, “Create skill” and “Add folder…” no longer flash on a quick save. A slow action still dims them, and the `busy` guard stays (decision 6).

### Implementation steps for builders

This adds no dependency, icon, setting or project file. Nothing is stored: the table card keeps its state in memory as it does now. There is no migration, and going back to 1.10.4 is not affected.

1. **Model (`apps/frontend/src/editor/floats.ts`).** Add `'none'` to `TableLines` and `toggled?: string[]` to `TableModel`. Add `tableEdges` and `tableRules`:

   ```ts
   /** Where a line can go: 'top', 'head' (under a header row), 'under-2' … 'bottom'; 'left', 'after-1' … 'right'. */
   export function tableEdges(rows: number, cols: number, header: boolean) {
     return {
       h: Array.from({ length: rows + 1 }, (_, i) => (i === 0 ? 'top' : i === rows ? 'bottom' : header && i === 1 ? 'head' : `under-${i}`)),
       v: Array.from({ length: cols + 1 }, (_, j) => (j === 0 ? 'left' : j === cols ? 'right' : `after-${j}`))
     };
   }

   const OUTSIDE_AND_HEAD = ['top', 'head', 'bottom'];
   /** The line each preset draws at an edge: 0 none, 1 single, 2 double. */
   const PRESETS: Record<TableLines, (edge: string) => number> = {
     booktabs: (edge) => +OUTSIDE_AND_HEAD.includes(edge),
     minimal: (edge) => +OUTSIDE_AND_HEAD.includes(edge),
     grid: (edge) => (edge === 'head' ? 2 : 1),
     none: () => 0
   };

   /** Each edge's line: the preset's, unless turned on or off by hand. Booktabs rules take no vertical lines. */
   export function tableRules(m: Pick<TableModel, 'cells' | 'header' | 'lines' | 'toggled'>, cols = Math.max(1, ...m.cells.map((row) => row.length))) {
     const edges = tableEdges(m.cells.length, cols, m.header);
     const line = (edge: string) => (m.toggled?.includes(edge) ? +!PRESETS[m.lines](edge) : PRESETS[m.lines](edge));
     return { h: edges.h.map(line), v: edges.v.map((edge) => (m.lines === 'booktabs' ? 0 : line(edge))) };
   }
   ```

   - **`tableLatex`:** remove `RULES`. Build the spec with `|` wherever `v[j]` is set, using `align.length` as the column count. At the top and after each row, write one of: nothing, `\hline` once or twice, or with Booktabs `\toprule`, `\midrule` or `\bottomrule` by position. Keep the `{}` in front of rows that start with `[` or `*` on every row, because rows can now meet with no rule between them.
   - **`tableTypst`:** write `align:` as described under “Other polish”. Unless every line is on and the preset is not Booktabs, write `stroke: none` followed by one `table.hline(y: i)` or `table.vline(x: j)` per line. For Booktabs, give the top and bottom lines `stroke: 0.08em` and the others `0.05em`.
   - **`tableMarkdown`:** write the alignment row.

   Check: step 2.
2. **Checks (`apps/frontend/src/editor/floats.check.ts`).** Leave every existing LaTeX table case as it is. Five existing Typst and Markdown cases change: lines 319 to 321, 323, 324, 326 to 328 and 330. Keep their inputs exactly as they are and update only the expected text. (The research prototype changed the inputs of 323 and 324; do not copy that, or the Booktabs Typst table without a header loses its case.) The expected text, worked out with the prototype:

   ```ts
   // 319-321
   '#figure(table(columns: 3, align: (left, center, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 1, stroke: 0.05em), table.hline(y: 2, stroke: 0.08em), table.header([Method], [a_b], [Score]), [Ours], [$x_1$], [50%]), caption: [Results.]) <tab:results>'
   // 323
   '#table(columns: 3, align: (left, center, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 2, stroke: 0.08em), [Method], [a_b], [Score], [Ours], [$x_1$], [50%])'
   // 324
   '#table(columns: 2, align: (left, center), stroke: none, table.hline(y: 0, stroke: 0.08em), table.hline(y: 1, stroke: 0.08em), [a\\[1\\]], [b\\\\c\\]])'
   // 326-328: the second line becomes '| :--- | :---: | :---: |'
   // 330: the second line becomes '| :--- | :---: |'
   ```

   Then add the cases listed under “Tests and live checks”.
   Check: the run command at line 2 prints `floats.check: ok`.
3. **Card (`apps/frontend/src/editor/tools/FloatsTab.tsx`, `InsertTable`).**
   - Move `const kind = docKind(api.activePath)` above `align` and give Typst and Markdown the tabular defaults. `kind` is null when no document is open, and that case stays LaTeX as now:

     ```ts
     /** Typst and Markdown have no tabularx, so its X columns fall back to the tabular defaults there */
     const tableEnv = kind === 'typst' || kind === 'markdown' ? 'tabular' : env;
     const align = Array.from({ length: cols }, (_, c) => (chosen[c] === 'X' && tableEnv !== 'tabularx' ? undefined : chosen[c]) ?? defaultAlign(tableEnv, c));
     ```

     Use `tableEnv` in the model, for the column menu options (line 896) and for the tabularx hint (line 973).
   - Add state `toggled` (`string[]`) and `at` (the `[row, column]` of the last focused cell, clamped to the grid).
   - Add `['none', 'None']` to `LINES`. Choosing any preset sets `lines` and empties `toggled`. Pass `value={toggled.length ? null : lines}` to “Lines”, and widen `Segmented`'s `value` to `T | null` (lines 129 to 152) so that no segment is lit.
   - Replace the `<table>` with a `div.table-grid` laid out as a CSS grid:
     - Columns: `10px repeat(n, minmax(80px, 1fr) 10px)`. Rows: `auto 10px repeat(m, 30px 10px)`.
     - The column menus go in the first row. The cell for row r and column c goes at grid row 2r+3 and grid column 2c+2.
     - Keep `data-cell` and the `aria-label`s so that `focusCell` and the existing keys work as now.
   - Add one strip per horizontal edge, spanning the whole grid, and one strip per vertical edge, running down the cell rows. With Booktabs there are no vertical strips. Each strip:
     - is `aria-hidden` and has no tab stop
     - calls `preventDefault` in `onMouseDown` so the cell keeps focus
     - flips the edge's name in `toggled` in `onClick`
     - has the `title` “Add a line” or “Remove the line”.
   - Cells set `at` when they get focus.
   - Under the hint, add “Lines” and its hints, then the “Lines at row r and column c” group: `role="group"` with four `aria-pressed` buttons, “Above row r” (edge `h[r-1]`), “Below row r” (`h[r]`), “Before column c” (`v[c-1]`) and “After column c” (`v[c]`). Disable the column buttons with Booktabs.
   - “Clear” also empties `toggled`.
   - In Markdown, leave out the strips and both line fields, and add the Markdown sentence to the hint.
   - In Typst and Markdown, leave out the LaTeX settings and change the Float hint as described under “Other polish”.
   - Keep the package list in `insert()` as it is.

   Check: `npm run typecheck`, then the live checks.
4. **Grid styles (`apps/frontend/src/styles/tools.css`).** Replace `.table-grid` and its cell rules (lines 1720 to 1747) with the grid styles.
   - The grid has `width: 100%` inside the existing sideways scroller. Columns share the card's width and the grid scrolls once a column reaches 80 px.
   - Cells are 30 px high with a transparent border and the `--fill` background. The header row uses `--bg-selected`, which replaces the 2 px underline.
   - Each line is a pseudo-element centred in its strip: 1 px of `--text`, 2 px for the Booktabs top and bottom, and `3px double` for a double line. Lines run from the middle of one outer gap to the middle of the other so that corners meet.
   - On hover, show a dashed `--accent` line where there is no line, and turn an existing line `--accent`.
   - The input focus ring is unchanged and fits within the 10 px gaps.

   Check: the live look in light and dark mode, and in Chrome with `?platform=windows`.
5. **Switch and button styles (`apps/frontend/src/styles/base.css`).** Add `--switch-off` beside `--fill` in the existing `:root` block (lines 7 to 14). Put the switch rules straight after the tick box rule (lines 130 to 136). The selector beats the 14 px tick box rule on specificity.

   ```css
   --switch-off: color-mix(in srgb, var(--text-tertiary) 75%, var(--bg-panel-solid));

   input[type='checkbox'][role='switch'] {
     -webkit-appearance: none;
     appearance: none;
     position: relative;
     width: 36px;
     height: 20px;
     border-radius: var(--radius-pill);
     background: var(--switch-off);
     transition: background-color 0.15s ease, opacity 0.15s ease;
   }
   /* dims only once a save takes more than a moment, and comes back at once */
   input[type='checkbox'][role='switch']:disabled {
     opacity: 0.45;
     transition: background-color 0.15s ease, opacity 0.15s ease 0.2s;
   }
   input[type='checkbox'][role='switch']::before {
     content: '';
     position: absolute;
     top: 2px;
     left: 2px;
     width: 16px;
     height: 16px;
     border-radius: 50%;
     background: #fff;
     box-shadow: var(--shadow-sm);
     transition: transform 0.15s ease;
   }
   input[type='checkbox'][role='switch']:checked { background: var(--accent); }
   input[type='checkbox'][role='switch']:checked::before { transform: translateX(16px); }
   .checkbox-row input[role='switch'] { margin-top: -1px; }

   @media (forced-colors: active) {
     input[type='checkbox'][role='switch'],
     input[type='checkbox'][role='switch']::before { forced-color-adjust: none; box-shadow: none; }
     input[type='checkbox'][role='switch'] { border: 1px solid CanvasText; background: Canvas; }
     input[type='checkbox'][role='switch']::before { top: 1px; left: 1px; background: CanvasText; }
     input[type='checkbox'][role='switch']:checked { border-color: Highlight; background: Highlight; }
     input[type='checkbox'][role='switch']:checked::before { background: HighlightText; }
     input[type='checkbox'][role='switch']:focus-visible { outline-color: Highlight; }
     input[type='checkbox'][role='switch']:disabled { opacity: 1; border-color: GrayText; background: Canvas; }
     input[type='checkbox'][role='switch']:disabled::before { background: GrayText; }
   }
   ```

   Give `.btn:disabled` (lines 464 to 466) the same delay, repeating the `.btn` list from line 452:

   ```css
   .btn:disabled {
     opacity: 0.45;
     /* dims only once a save takes more than a moment, and comes back at once */
     transition: background-color 0.12s ease, opacity 0.12s ease 0.2s, box-shadow 0.12s ease;
   }
   ```

   Check: the live checks. The off colour should compute to #8d8d91 in light mode and #7a7a7e in dark mode.
6. **Call sites.** Delete `{...SWITCH}` from the three inputs (`SettingsSheet.tsx:1883` and 2088, and `ReviewTab.tsx:363`), and delete both `SWITCH` constants and their comments. In `SkillsPane`, show the clicked switch's new state while the save runs:

   ```ts
   /** the switch just clicked, shown in its new place while the save runs */
   const [pending, setPending] = useState<Record<string, boolean>>({});
   const toggle = async (skill: Skill, on: boolean) => {
     setPending({ [skill.id]: on });
     await (inProject ? setForProject(skill, on === skill.enabled ? null : on) : run(() => setSkillEnabled(skill.id, on)));
     setPending({});
   };
   ```

   and use `checked={pending[skill.id] ?? skillOn(skill, inProject)}`. `run` never throws, so a failed save clears `pending` and the switch goes back to the saved state. Keep `busy` as it is.
   Check: searching `apps/frontend/src` for `SWITCH` and `switch: ''` finds nothing, and the typecheck passes.
7. **Docs.**
   - `docs/SPECTRUM_2_HANDOFF.md:658`: remove the first sentence (the `switch` attribute) and keep the second, about unsaved skill file and persona edits. Record the table lines and the switch in the handoff.
   - `CHANGELOG.md`, in “2.0.0 (unreleased)” (line 5): under “Added”, lines between table cells and the “None” preset; under “Changed”, the drawn switch, Booktabs and Minimal tables in Typst without the full grid, and Markdown tables with their column alignment; under “Fixed”, a tabularx choice no longer making Typst and Markdown tables left-aligned.

   Check: the new text has no contractions, em dashes or Oxford commas.

### Tests and live checks

New cases in `floats.check.ts`:

- **`tableEdges`:** with a header row, the names are `top, head, under-2, bottom` and `left, after-1, right`. Without a header row, the first inner name is `under-1`. A single cell has only `top` and `bottom`.
- **`tableRules`:**
  - Grid draws everything, with `head` double.
  - None draws nothing.
  - Booktabs ignores a toggled `left` and drops a toggled `head`.
  - Toggling `head` in Grid removes the double line.
- **LaTeX:**
  - Minimal with `after-1` and `under-2` toggled gives `l|cc` and an `\hline` above the last row.
  - Booktabs with `under-2` gives a `\midrule` between body rows and no `|`.
  - None gives no rules.
  - None with the four outer edges gives `|lcc|` with `\hline` at the top and bottom.
  - With no rules between rows, rows that start with `[` or `*` still get `{}`.
- **Typst:**
  - Lines changed by hand give `table.hline(y: …)` and `table.vline(x: 1)`.
  - Grid with every line on gives no stroke setting.
  - Booktabs at 0.08em and 0.05em is covered by the updated cases at lines 319 to 324.
- **Markdown:** a right-aligned column gives `---:`.

The tabularx fallback lives in `InsertTable`, not in the writers, so it is covered by live check 2.

Already done during research, on a scratch copy outside the repository (`/private/tmp/claude-501/-Users-beyond555-Documents-CodingProjects-OpenPrism/1c5b3628-3386-40f6-a7bc-83fc1a203571/scratchpad/tablelines.CTEC/floats.ts` and `floats.check.ts`):

- The model above passed every existing LaTeX table case unchanged, plus 14 new cases (`floats.check: ok`). The expected Typst and Markdown text in step 2 comes from running the prototype on the original inputs.
- Sample tables (each preset, lines changed by hand and a tabularx grid) compiled with pdfLaTeX from TeX Live 2026 and with Typst 0.15.1 and 0.14.2, and looked as intended.
- The switch styles were tested from `/private/tmp/claude-501/-Users-beyond555-Documents-CodingProjects-OpenPrism/1c5b3628-3386-40f6-a7bc-83fc1a203571/scratchpad/switch.l4GF/final.css`, which uses a `.switch` class. Step 5 swaps it for `[role='switch']` and writes the thumb colour inline.

Live checks, on scratch projects with a scratch home folder, no real data and no model calls:

1. **Mac app** (`npm run desktop:dev`) with a .tex document. Check:
   - each preset
   - clicking gaps and edges, and no preset lit once a line is changed by hand
   - “Header row” on and off
   - adding and removing rows and columns
   - Booktabs hiding the vertical gaps and greying out the column buttons
   - the Source box and Copy
   - Insert table, then compile.
2. **Typst and Markdown documents.**
   - Choose tabularx in a .tex document, then open a .typ and a .md document: the column menus read “Left”, “Centre”, “Centre” and the output is aligned that way. Back in the .tex document, the tabularx columns return.
   - A .typ document: the same checks as step 1, compiled with Typst 0.15.1 and with 0.12.0, which is Spectrum's oldest version (`engines.json:41`). `table.hline` and `table.vline` arrived in Typst 0.11. Typst 0.12.0 is not installed on this Mac, so it is untested so far.
   - A .md document: no line controls, the Markdown sentence in the hint, alignment in the pipe table, and a compile through LaTeX and through Typst with Spectrum's pandoc 3.12.1, where `@tab:results` resolves to the table.
3. **Keyboard.**
   - Tab moves from cell to cell with no stops in the gaps, then on to “Lines at …”, where Space toggles a button.
   - The group label follows the last focused cell.
   - VoiceOver reads the group, each button and its state.
4. **Switches.** Check Settings › Skills under both “All projects” and “This project”, the sharing switch, and Review's “Anonymous review” (on, off and disabled with Privacy unticked). Look at:
   - size and alignment
   - the clicked switch moves at once, and on a quick save neither the other switches nor “Duplicate”, “Delete”, “Reset”, “Create skill” and “Add folder…” dim
   - with Chrome's network throttling on a slow setting, everything dims after 0.2 s and comes back together
   - a failed save puts the switch back
   - Space toggles and the focus ring shows
   - light mode, dark mode and the see-through window
   - Reduce motion.
5. **Buttons elsewhere.** “Insert table” and the key buttons in Settings › Providers (`SettingsSheet.tsx:2296-2305`) still dim during a slow action and show no flicker on a quick one.
6. **Windows.**
   - First, a quick look from the Mac: open the Vite server in Chrome with `?platform=windows` (`apps/frontend/src/app/platform.ts:5-16`).
   - Then run the app on the Windows build machine: the same switch and table checks, Narrator, and a contrast theme (Settings › Accessibility › Contrast themes) showing the outlined switch.

### Risks and limits

- Lines run the whole width or height of the table. A line under only some columns, or around one cell, is not possible (decision 1).
- Booktabs never takes vertical lines. The card says so and greys out the column buttons.
- Typst has no double line, so Grid's line under the header is single in Typst, as it is today.
- Typst tables change: Booktabs and Minimal no longer come out as a full grid. Anyone who liked the old Typst look can choose Grid.
- Lines changed by hand are stored by name. If you change the line under row 5, remove row 5 and then add it back, the change comes back. Choosing a preset or “Clear” clears these changes.
- From a cell, Tab reaches “Lines at …” only after the remaining cells. That meets WCAG's keyboard rule but is slow in a large table.
- In the article class, a caption above a table sits right on the table's top line, because the class spaces captions for placement below the table. This is the same today. Classes such as IEEEtran and acmart add the space themselves. This section does not change it.
- The delayed dim applies to every `.btn` in the app. A button disabled by a form, such as “Save” with an empty field, looks enabled for 0.2 s before it dims. It cannot be clicked in that time.
- With a pandoc older than 3.9 on the PATH and none downloaded, a Markdown table's label is printed as text. This is today's behaviour.
- The switch no longer uses macOS's own drawing, such as the newer wide thumb. In return it has one size and look on both systems, and Windows finally gets a switch.
- The off grey is deliberately darker than macOS's, for contrast (decision 5).

### Decisions for the user

| Decision | Recommended | Why |
| --- | --- | --- |
| 1. Partial lines: a line under some columns only (`\cmidrule` with booktabs, `\cline` without) | Not in this round | “Lines in between cells” could be read as lines around single cells, so this is your call. Their main use is under a heading that spans several columns, which needs merged cells, and the generator has none. Each full line would also need one click per column, or a modifier key. If wanted later: ⌥-click (Alt-click on Windows) on a gap would set the line for that column alone, the edge names would gain parts per column, and Table → chart's parser (`apps/backend/src/services/plotService.js:45`) would need to skip `\cline` and `\cmidrule`. Size S to M. |
| 2. Grid's double line under the header | Keep it | Grid then writes exactly what it writes today. With Grid, the line under the header row is either double or absent: clicking it removes it, and a single line there needs Minimal or None plus clicks. Making it single would remove one special case from the model and the grid preview. |
| 3. Switch size | 36 by 20 px | It sits between the app's 18 px badges and 26 px small buttons, and is close to WebKit's own 41 by 18 and Windows 11's 40 by 20. 32 by 18 is the smaller option. |
| 4. Turning Settings' other on/off tick boxes (such as “Check spelling as you type”) into switches | Not in this round | The request names the Skills switch. Changing every Settings page is a wider restyle. |
| 5. Off colour | Mid grey, #8d8d91 in light mode | It meets 3:1 contrast. macOS's pale grey reaches only 1.45:1. |
| 6. Delayed dim for buttons | Every `.btn` in the app | One rule, and every quick save feels the same. The other choice is to scope it to the Skills page, which needs a wrapper class and leaves other pages flashing. |

### Rough size

| Part | Size | Why |
| --- | --- | --- |
| Lines between cells | M | The model and checks are small and already prototyped. Rebuilding the grid with line targets and new controls is the main work. |
| Switch | S | One block of CSS, three spreads and two constants deleted, and a pending map in `SkillsPane` |
| Other polish | S | Alignment in two writers, the tabular fallback in the card, four fields hidden and one CSS transition |

### Reviewer points not taken

- “Add a check: a tabularx model passed to tableTypst or tableMarkdown gives the l/c/c default”: the fix lives in `InsertTable`, so the writers never see `'X'` and such a check would not test it. Live check 2 covers it.
- “`.btn:disabled` dims them at once, with no transition”: `.btn` already fades opacity over 0.12 s (`base.css:452`). The flash is still real, so the fix stands.