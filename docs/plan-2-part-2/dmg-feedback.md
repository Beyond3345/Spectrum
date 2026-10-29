# Feedback from the release-candidate DMG

Written 29 October 2026 after the user tried the release-candidate DMG (`e1b425c`). It adds phase E to the [part 2 plan](../SPECTRUM_2_PART_2_PLAN.md), between review 3 and the release. Everything here ships inside 2.0.0 (decision 1).

## What was reported

1. OpenCode, Claude Agent and Codex work, but Kimi Code, Qoder and DeepSeek Harness are installed and Spectrum does not find them.
2. A siunitx switch in every drawing, with its default in Settings. On by default, writing `\qty{}{}` and `\unit{}`.
3. Logic gates offer only American and European; circuitikz has more styles.
4. A capacitor's label (`C_1`) runs into its plates on the canvas.
5. Structures: a switch for each of the axial force, shear force and bending moment diagrams, and a choice of their fill colours.
6. A new composer for vector diagrams, like the four figures the user pasted (axes with ticks, position vectors, a line through two points, points dividing a segment, midpoints, projections, panels (a), (b) and (c)).
7. A general composer where the symbols and lines of every package are on by default, for anyone unsure where to start. Plotters (signals, functions) stay out.
8. The app opens on All projects, a long list of every project, which is messy as a starting page. A separate home page that works like the Finder or Goodnotes: folders shown as icons or as a list, opened by clicking into them, so projects stay organised. All projects stays as it is.

## What was found

### Agents

Detection only looks for each agent's command on the `PATH` (`kimi`, `qoder` or `qodercli`, `dsh`). None is on the `PATH`; the user has the desktop apps.

| App | What it carries | How Spectrum can find it |
| --- | --- | --- |
| DeepSeek Harness 0.2.1-rc.2 | Its CLI inside the app: `Contents/Resources/runtime/cli/bin/dsh`, a shell launcher that runs the app's own binary as Node | Look for that file in `/Applications` and `~/Applications` and start it with `--profile acp` |
| Qoder 0.4.8 | No CLI in the bundle. The app downloads `qodercli` from `download.qoder.com` after it is installed (it names `qoder`, `qodercli`, `qodercn` and `qoderclicn`) | Find where the app puts the downloaded CLI and look there too; otherwise point to the official install |
| Kimi Code 1.1.0 | No separate CLI in the bundle. The app's code mentions `kimi-code-cli`, `kimi-acp` and `KIMI_CODE_HOME` (default `~/.kimi-code`) | Find whether the app exposes an ACP entry (as DeepSeek Harness does); if it does not, say the app is installed but ACP needs the Kimi Code CLI, with its install line |

An app started from the Finder also gets a short `PATH`, so CLIs installed by `npm`, `bun`, `pipx` or `uv` into the home folder can be missed too.

### Composer

- **Labels:** the circuit canvas puts a label a fixed distance from the wire (`modes/circuitikz/Canvas.tsx`, `besides(labelSide)`). A tall symbol such as a capacitor, battery, chip or transformer reaches past it. The canvas also shows `C_1` as typed, while the preview sets it as C₁.
- **Logic styles:** the symbols choice (`modes/circuitikz/panels.tsx`) offers American and European. circuitikz also has IEEE-style logic ports (circuitikz 1.4 and later) and a choice of the European NOT symbol.
- **Structures:** every drawing has all three diagrams with fixed fills. The user's screenshot also shows labels touching: `D` under the distributed load's arrows, `B` behind its support and `-24.1` across the diagram's edge.
- **siunitx:** no mode writes it today. Structures writes `10 kN` and `(kN m)` as text.

## The work

### E1. Agents found where they are installed

- Each profile can list app locations (generalising ZCode's `needs.app`). Spectrum looks in `/Applications` and `~/Applications` (on Windows, the usual install folders) before the `PATH`.
  - DeepSeek Harness: the app's `runtime/cli/bin/dsh`.
  - Qoder: the folder the app downloads `qodercli` into, found from the app's code.
  - Kimi Code: the app's ACP entry, if it has one.
- Detection also searches the usual home-folder program folders (`~/.local/bin`, `~/.bun/bin`, npm's global prefix and those of other package managers) and Homebrew's.
- Each card says which program it found and where: “Found in the DeepSeek Harness app”, or “Kimi Code is installed, but its agent mode needs the Kimi Code CLI”, with the install line.
- A “Choose the program…” button on every card for anything still not found. It saves the path the way a changed command is saved now.
- **Sandbox:** the agent's sandbox may read and run only the app bundle it was started from, not other apps or the user's data.
- **Tests:** fake app bundles and fake home folders in scratch folders. A real run of each app is left to the user's Test button, since Spectrum never reads the real agent folders.

### E2. siunitx in every drawing

- Settings › Composer gets “Write units with siunitx”, on by default. Each drawing's Style has the same switch, starting from the default.
- **When on:**
  - Values are written as `\qty{10}{\kilo\newton}`, `\qty{10}{\kilo\newton\per\metre}` and `\qty{13.4}{\kilo\newton}`.
  - Units alone, as in axis titles, are written as `\unit{\kilo\newton\metre}`.
  - Circuit values are written as `\qty{10}{\kilo\ohm}` and `\qty{4.7}{\micro\farad}`.
  - Mohr's circle stresses are written as `\qty{}{\mega\pascal}`.
  - Plot axis units use `\unit`.
  - Insert adds `\usepackage{siunitx}` when the document lacks it, through the same loads check as other packages.
- **Units:** a small parser maps the units people type (kN, kN/m, kN·m, N/mm², MPa, kΩ, µF, mH, V, A, Hz, mm, m, °) to siunitx macros. A unit it does not know is written literally, which siunitx 3 accepts (`\qty{3}{kN/m}`).
- **Off:** the text is written as now.
- **Elsewhere:** the switch is hidden in Typst and Mermaid drawings.

### E3. Logic gate styles

- **Choices:** a “Logic gates” choice beside Symbols, with:
  - “As the symbols”;
  - American;
  - European (IEC, the box with &, ≥1 and =1);
  - IEEE (the newer circuitikz ports).
- **European NOT:** the European style also chooses the NOT symbol: a triangle or a box with 1.
- **Canvas and code:** the canvas and the code show each style. Insert warns when IEEE ports need a newer circuitikz than the document can be sure of.

### E4. Labels clear of their symbols

- The canvas places a label from the symbol's drawn outline (`symbolGeometry.ts`) rather than a fixed distance, on both sides and in every rotation.
- It sets `_` and `^` as subscripts and superscripts, so the canvas matches the preview.
- **Check:** every catalogue symbol, labelled on each side in each rotation, has its label box clear of its outline.

### E5. Structures: which diagrams, and their colours

- **Diagram switches:** axial force, shear force and bending moment, each in the drawing's Style. Their defaults go in Settings › Composer. Hiding one closes the gap it leaves.
- **Fill colours:** a fill colour and opacity for each diagram, from a row of swatches or any xcolor name or mix (`blue!15`). The defaults are today's colours.
- **File:** the drawing's file keeps both. A file without them shows all three diagrams in today's colours, so older files open as drawn and 1.10.4 is not affected (the composer is new in 2.0).
- **Label clearance:** member, support, load and value labels move off members, arrows, supports and diagram edges, fixing the clashes in the screenshot.

### E6. Vector diagrams composer

A new composer under Mathematics › Geometry and vectors, also listed under Physics › Mechanics. It writes TikZ like the user's own figures: named `\coordinate`s, `\draw[->, very thick, <colour>]`, `\fill … circle` with labelled nodes, `>=stealth`.

- **Tools:**
  - **Drawing:** point, vector (from one point to another), segment, polygon, a line through two points extended to the frame, and a text label.
  - **Axes:** x and y with arrows, names, tick marks and numbers, and the origin `O`.
  - **Marks:** a right-angle mark, a dashed drop to an axis, and a highlighted segment (thick and light, for projections).
- **Constructions,** kept exact and updated as points move:
  - the midpoint;
  - the point dividing AB in the ratio m : n;
  - the foot of a projection;
  - u + v and v − u from their tips;
  - the ratio labels along a segment.
- **Points:** snap to a grid, and their coordinates can be typed in a table.
- **Labels:** each label chooses its side (above, below left and so on) and its distance.
- **Panels:** side by side with (a), (b) and (c) under them, written as `scope`s with an `xshift`. The drawing has an overall scale.
- **Starters:** four, one for each of the user's figures:
  - a line through two points with position vectors;
  - dividing a segment in a ratio;
  - midpoints of a triangle;
  - projections in three panels.
- **Not included:** 3D vectors and a Typst (CeTZ) version.

### E7. General drawing

A composer under Others called “General drawing”: the TikZ canvas with every symbol set switched on. That covers circuits, logic, supports and mechanical parts, flowchart shapes, the vector tools and plain lines, arrows and shapes.

- Plotters stay out: pgfplots, signal sketches and slope fields.
- Mixing's clash warnings and “Insert as image” work as they do now.
- Search finds any symbol in it. The chooser's search also offers it whenever a symbol's own composer is not obvious.

### Projects page

- **Folders:** the page already has folders. They nest, live in the settings (`app/folders.ts`, `projectFolders`) and follow the user to their other computers. A project is in at most one folder, and nothing moves on disk.
- **Showing them:** folders appear only in the sidebar, and the page opens on All projects. The list and grid layouts, sorting, tags, thumbnails and dragging a project onto a sidebar folder exist already.

### E8. A home page of folders

A new page, Home, at the top of the projects sidebar above All projects. Spectrum opens on it.

- **What it shows:**
  - The top-level folders first, then the projects in no folder.
  - Clicking a folder opens it in place, showing its folders and then its projects.
  - A path at the top (Home › Uni › ENGG1001) goes back up, as do Back and ⌘↑.
- **Icons or a list:** the same switch as now, remembered for each folder.
  - **Icons:** large folder tiles and project thumbnails, as in Goodnotes, each with its name and date. A folder tile shows how many projects it holds.
  - **List:** rows with a kind, a date and a count, opening on a click like the Finder's list.
- **Organising:**
  - A New menu: New project here, New folder here.
  - Drag a project or a folder onto a folder tile, a sidebar folder or a part of the path above.
  - Right-click a folder to rename it, choose its colour or delete it. Deleting a folder keeps its projects; they move up a level.
  - Select several with ⌘ and ⇧, then move them together.
  - Each folder sorts by name, date changed or date created.
- **Folder colours:** a small set of colours (blue, purple, red, orange, green, grey), kept with the folder. A folder with no colour is blue. Older builds of 2.0 ignore the colour.
- **Search:** searching on Home looks through every folder and shows each result with its folder's path.
- **All projects:** stays as it is, and a project's tags, archive and GitHub views are unchanged.
- **Settings:** Settings › General gets “Open Spectrum on”: Home or All projects. Home is the default.
- **Accessibility:** keyboard use throughout: arrows move the focus, Return opens and Space selects. Screen reader names for tiles and rows.
- **Not included:** starring, as in Goodnotes, unless the user asks.

## Order and lanes

Agents at medium effort; the vector composer at high effort, as the composer was before.

1. **Lane 1 (E1, agents)** and **lane 2 (E2 siunitx, E3 logic styles, E4 labels)** start together.
2. **Lane 3 (E6 and E7, vectors and general drawing)** also starts at once. It writes no units, and E7 only gathers sets that exist already.
3. **Lane 5 (E8, Home)** starts at once. It is frontend only and touches the projects page and the folder settings, which no other lane does.
4. **Lane 4 (E5, structures)** starts when lane 2 merges, since it uses lane 2's unit writer.
5. **Reviews:**
   - A focused round on lanes 2 to 4 together (lenses: code and file compatibility, canvas, live use in the browser pane).
   - A small round on lane 1 (lenses: detection, sandbox).
   - A small round on lane 5 (lenses: folder data and sync between computers, keyboard and screen reader, live use).
6. **Builds:** Windows run, then test DMG 5. The user tries it, then phase D's release continues.

## Decisions (approved by the user on 29 October 2026, as proposed)

| # | Proposal |
| --- | --- |
| E-a | Phase E ships inside 2.0.0, before the release. |
| E-b | If the Kimi Code app has no ACP entry, its card says so and offers the Kimi Code CLI's official install line, rather than Spectrum installing anything. |
| E-c | siunitx on by default, using siunitx 3's `\qty` and `\unit`; Insert adds the package when missing. |
| E-d | Logic gates default to “As the symbols” (American unless the drawing is European). |
| E-e | Vector diagrams are TikZ only this round; 3D and Typst later. |
| E-f | The general composer is named “General drawing” and lives under Others. |
| E-g | Spectrum opens on Home by default, with a Settings choice to open on All projects instead. |
| E-h | Folders get a colour; starring is left out unless wanted. |
