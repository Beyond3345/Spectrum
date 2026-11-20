# Changelog

This file records the changes in Spectrum. Version 1.0.0 is the first release of the fork, so its entries are given relative to the last state of [OpenPrism](https://github.com/OpenDCAI/OpenPrism) in February 2026.

## 2.7.0 (not released)

### Security

- API keys are kept in the keychain on a Mac and encrypted for your Windows account on Windows, not in the window's storage. Keys from earlier versions move there on first start, and stay where they were, still working, if the keychain cannot be used

### Added

- Search in the sidebar finds text in the project's files too, with Match case, Whole words and Regular expression, and a click opens the line with the match selected
- A LaTeX compile's errors are underlined in the source, at the command TeX stopped after or along the line, beside TexLab's own
- A command palette (⇧⌘P) finds any command, menu item, Tools tab or Settings section by its name
- Go to a file or heading (⌘P) opens a project file or an Outline heading by its name
- Get started on Home and All projects says which TeX compiles, whether a model is set up and how to start from a template
- The projects page says when a newer Spectrum is out, asking the release page at most once a day and sending nothing about you. A switch in Settings › System turns it off
- Vim or Emacs keys in the source editor, in Settings › Editor
- Agents you run yourself, such as Claude Code, Codex or Cursor, can use a project's Spectrum tools once you turn on Use from another agent in the Local agents bar. The secret is new each time and ends when Spectrum quits
- Your own MCP servers for the Spectrum agent in Settings › Agents: added off, checked, run isolated, and a tool that may change something asks first
- Spectrum compiles after you apply an agent's changes, and offers Fix with AI if that compile fails (Settings › Agents › Automations)
- Change template › With an agent moves a paper into a LaTeX or Typst template, with the new spectrum-template-transfer skill
- Pictures go with a message to either agent: paste, drop or choose one, sent to models that read images. A model that does not read images is told a picture was left out, and says so
- The Spectrum agent can look at a page of its draft and at a figure on its own, with Open in composer on a diagram's card
- Send page to agent in the PDF's right-click menu, with the source line of the spot clicked
- Send to agent on PDF notes, to-dos and Review's rows and AI points, each with its file, line and source lines
- A `% !TEX recipe` comment runs a document's own build steps, and `% !TEX options` adds engine options, inside the compile's sandbox
- Auto compile has an As you type choice for Typst documents, which compiles 0.3 s after typing stops
- Live in the PDF bar shows a Typst document as you type it, through Tinymist's preview
- The Typst outline covers the whole document across nested includes, with the last compile's numbers and the figures and tables
- Typst completion lists the project's own `#let` functions and values without Tinymist, and ⌘-click on a path in a Typst file opens that file
- A failed Typst export lists every error in Logs and marks them in the editor, with what PDF/UA-1 needs. Insert figure asks for alt text in a Typst document, and the Typst document template exports as PDF/UA-1
- Image to LaTeX writes Typst in a Typst document, and Table to chart takes a Typst `#table`
- Tinymist's linter runs as you type
- Markdown documents refer to figures, tables, equations and sections by number: `@fig:plot` prints “Figure 1” in the PDF and in Word. Typing @ lists the document's labels, and Insert (+) has Reference
- Mermaid blocks in a Markdown document are drawn in the PDF and in Word, with the composer's Mermaid, and a caption makes one a numbered figure
- A live preview of a Markdown document beside the editor, with maths, Mermaid, numbered references and pictures, following the editor as it scrolls
- A Markdown document can be split across files with `include:` in its front matter, and Logs names the file each error is in
- `slides: true` in the front matter makes Beamer slides from Markdown
- New Markdown report, maths notes and slides templates
- Review: References exist looks each .bib entry up in Crossref, doi.org, arXiv or OpenAlex and lists the retracted, unknown and differing ones with the record it read
- The Spectrum agent reads a paper's open full text page by page, or its abstract when there is none
- Verify claims records each claim with the source's own words, checked by Spectrum and found on their page, in Research › Claims checked

### Changed

- Tools opens on Logs when the last compile had errors
- The agents' text search can match whole words
- Insights gives Typst figure and appendix numbers as the PDF prints them
- `fetch_bibtex` gives a title's BibTeX only for a work whose title, first author and year match, and lists the nearest works otherwise
- Deep research starts with a plan to approve
- A reference to a label that does not exist in a Markdown document prints ?? and is a warning at its line in Logs
- A composer diagram goes into Markdown as its PNG, which Word shows
- A long document's AI review starts each part at a top-level heading where it can

### Fixed

- A table's `{#tbl:x}` label no longer prints in its caption with pandoc before 3.8.2
- No Jyutping button in a Markdown document's toolbar
- A task sent to the agent workspace as it opens keeps its skill

## 2.6.0 (21 November 2026)

### Security

- `AGENTS.md` reaches the Spectrum agent only as you approved it on this computer. A file that came with a project, or was changed by a pull, a sync, an agent in the folder or an agent's change you applied, is not used until you have read it and chosen Use it
- A local agent stops when Spectrum is force-quit or crashes, and leaves nothing running when it exits
- An Isolated session of a local agent leaves out an `AGENTS.md` you have not approved, and says so with the way to approve it. Once approved, it reaches the agent with its next task, and a file changed by a pull leaves the copy again. `AGENTS.md` files in folders, `AGENTS.override.md` and `AGENTS.local.md` are always left out, and what an agent writes by those names meanwhile is never offered for review
- A Direct session says when the agent can read an `AGENTS.md` you have not approved
- The Spectrum agent compiles on a copy of the project, confined like every compile and never trusted. Nothing in the project changes until you apply a change
- Review's PDF before and after is compiled on copies, in the agents' isolation
- Agent Client Protocol SDK 2.8.0, Codex adapter 2.7.0 and Claude Agent adapter 0.108.1

### Added

- The Spectrum agent shows its work as it happens: each step as a card with its time, and the answer as it is written
- Stop stops the Spectrum agent at once, the model call and the compile included, and keeps what it had done
- A message sent while the Spectrum agent works waits above the message box, and Steer now hands it over between two steps. Waiting messages are kept when the page reloads
- Continue goes on in the same run, with everything the agent had read and done, for an hour after its last answer
- The Spectrum agent can compile its changes and read the errors at their lines, in LaTeX, Typst and Markdown, and fixes what it broke, three tries at most
- The Spectrum agent can search the project's text, read the project map and the bibliography, edit by replacing exact text and propose deleting a file
- The Spectrum agent can show a plan before it changes anything: untick or edit its steps, then Approve and run, Approve and ask before each file or Keep planning. Plan, under the message box, asks for one, and the agent plans by itself before a larger task. The approved steps stay at the top of the thread and are ticked as it works
- The Spectrum agent asks a question when a request is unclear, with answers to choose from. A plan or a question waits in the thread, through a reload and a restart, with no request to the model open
- `AGENTS.md` at the top of a project holds your standing instructions for the Spectrum agent
- The assistant's chat, Polish, Rewrite, Restructure and Translate are given your approved `AGENTS.md`. An `AGENTS.md` chip shows when the file is in use
- The Spectrum agent can suggest a line to remember for a project, which is kept only when you press Add. Memory, under the message box, lists what it remembers for the project, to edit, delete or add to
- The remembered lines go to the Spectrum agent, Fix with AI and the assistant with every request. They are kept on this computer, apart from the project's files and from `AGENTS.md`
- Each agent tab shows what a turn used: tokens and the share served from the cache, and for a local agent how full its context is and the cost it reports
- The Spectrum agent shows what a thread cost: the figure OpenRouter reports, in US dollars, or an estimate from the prices you type in Settings › Models for any of the provider's models. Spectrum keeps no price list of its own
- A price can be typed in any of 14 currencies. Each cost is shown in its own currency, with a symbol no other currency shares such as US$, A$, HK$ and CN¥, and two currencies are never added together
- Choose the Spectrum agent's model and thinking for each thread in its tab
- Settings › Models: Test connection beside each API key asks the provider for its model list, without sending a message, and says plainly what happened
- The provider's models join the Model menu after a test, and suggest names for an Other server
- Review an agent's or the assistant's changes one at a time: Apply, Reject or Edit each change, with J, K, A, R and E
- A review saves one “Before AI changes” checkpoint, before the first change you apply, and it covers every change until you close the review. Settings › Checkpoints › Save a checkpoint before every change I apply saves one for each change instead, and a deletion you apply always has its own
- A change that overlaps your own edit shows both versions: keep yours, use the agent's, take both or edit the result
- Review has a PDF before and after view, for the Spectrum agent and the assistant too
- A long review is grouped under the document's headings, with counts, and an agent's change of line endings is offered as a change of its own
- Local agents stay running between turns of an Isolated session, so a follow-up starts at once
- Local agents get a `search_text` tool from Spectrum
- To-dos: a + button at the end of the add box adds what is typed, as Return does
- To-dos: a to-do can carry a note of a few lines, shown in two lines until clicked and found by the search
- To-dos: Clear done deletes the ticked to-dos, with Undo
- Each local agent's card says how far it is supported: Supported (Claude Agent, DeepSeek Harness), In progress (Codex), Untested or Not supported (OpenCode)
- The AI review reads a long document in parts, with a progress line and Stop, and ties each point to its own file and line
- Review checks a Markdown document's citations, bibliography, images and links
- Document insights counts the words of a Markdown document
- Insert figure and Insert table set placement, both columns, notes and line breaks in Typst
- Return or Space on a part in the circuit composer places it

### Changed

- Fix with AI compiles its fix before you review it and says “Builds.” or where it still fails
- On Windows the agent's compile and Preview PDF run Biber, the index tools, latexmk and Tectonic as your own compile does, so a biblatex draft shows its citations
- A later message in a Spectrum agent thread keeps what the agent read earlier, so it does not read the same files again
- Requests to Claude and OpenAI models ask for prompt caching, and the Spectrum agent's instructions are about 2 KB shorter
- A busy provider's wait is shown while the Spectrum agent waits
- To-dos: Open, Done and All show their counts in one row, and Mine and In the source fold away under their titles. The add box and the filters stay at the top while the list scrolls
- To-dos: Edit, Add a note and Delete sit over the end of the row, so a long to-do uses the sidebar's width. Each filter's empty list says why, and a page link reads Page 2
- A connection that drops before the provider answers is tried again twice, and the error names the cause: name not found, refused, dropped, timed out or certificate
- A pasted key with a character no request can carry says so instead of “Couldn’t reach”, and a line break or invisible space at either end is trimmed
- AI autocomplete gives up its request when you type, move the cursor or press Esc, and asks again after a pause
- A custom endpoint ending in `/messages` or `/responses` is used in that format
- The Spectrum agent's `arxiv_search`, `arxiv_bibtex` and `get_compile_log` are gone: `literature_search`, `fetch_bibtex` and `get_log` do their work. Through Spectrum's tools server `list_todos` answers `{ todos }` and `literature_search` `{ papers }`
- The compile tool reports the errors and undefined citations of the last pass only
- A proposed deletion applied in part keeps the file, and the Review changes sheet marks a deletion
- The AI review's button reads Stop while it runs, and keeps the parts already reviewed

### Fixed

- A very long agent output keeps its start and end, and no longer pushes earlier turns out of the session
- A local agent's session no longer holds a connection open while its tab is out of sight and the agent idle, so a compile's live log is not held back
- Reloading the page shows a Spectrum agent run that is still going
- Logs no longer offers Fix with AI or the generated text when pandoc is missing or too old
- A long unbroken line in an agent's answer wraps
- To-dos: Esc puts an edit back instead of saving it
- Run folders a crash left in the cache are removed at the start

## 2.5.2 (20 November 2026)

### Security

- On a Mac every LaTeX compile now runs in a sandbox. The engine, Biber and BibTeX, makeindex, makeglossaries and whatever they start can write only the compile's own build files, run only the TeX installation's programs and use no network, apart from the built-in Tectonic downloading its packages. A compile also cannot read Spectrum's data folder, the usual key stores such as `~/.ssh`, or key files such as `.env` and `.pem`. Markdown through LaTeX, Jyutping, Compile with page colour and the composer's compiles and symbols are confined the same way
- Trust this project, a switch in the Compile button's menu, off for every project. A trusted project compiles without the sandbox and with full shell escape, for a document that runs its own programs. The choice is kept on this computer, never in the project, and a copied, moved or renamed project has to be trusted again
- Every compile now asks for TeX's restricted shell escape on the command line, on Windows too, so a TeX installation set to full shell escape no longer decides it. Full shell escape needs Trust this project
- When the sandbox or restricted shell escape stops a compile, Logs says what was stopped and where the switch is
- The app's local server now answers only Spectrum's own windows: each launch has its own secret, so another program or another account on the computer can no longer use it. A window the server refuses says "Spectrum needs to be opened again"
- The app's pages run only Spectrum's own scripts and fetch only from Spectrum itself
- Table to chart shows the model's code first and runs it only when you choose Run this code. The code runs in the agents' isolation: its own folder, no network, nothing of yours, a two-minute limit
- Text from outside (files, logs, search results, abstracts, tool answers, skills) reaches a model marked with its source, as material and never an instruction
- Agents can no longer read `.netrc`, `.npmrc`, `.pypirc`, SSH keys or keystores in a project: the list the GitHub backup leaves out is now theirs too
- A Mermaid diagram can no longer turn HTML labels or its own CSS back on
- An imported .zip or arXiv source leaves out a Git repository inside it, and on Windows a file named like a device (aux.tex) is renamed
- Restoring a checkpoint never writes into the project's .git or Spectrum's own data
- Direct editing refuses to start when the checkpoint before it could not hold every file the agent can change
- Removed an unused route that could copy a template over a project's files
- Updated fastify, zod, hono, fast-xml-parser and fast-uri to their fixed versions. The build pins Node.js 24.22.3 by checksum, and the Windows workflow pins its actions by commit

### Added

- Deleting in the file tree moves the file or folder to the Bin, with Undo on macOS 15 and later
- Renaming or moving a file offers to update the `\include`, `\includegraphics`, `#include`, image and Markdown links that name it, after saving a checkpoint
- A Spectrum agent run that fails part-way keeps its finished steps and its prepared changes, and Continue goes on from them. Continue also follows the 25-step limit and an answer cut off by the output limit
- Structures: colour and thickness for selected members, loads, dimensions and labels, and colour for supports
- Liquids and their levels inside the manometers, piezometer, barometer and column of three liquids
- Form presets: the names a figure draws are yours to change, in a Names fold (the conic's turned axes U and V or u and v, its vertices, centre and foci; a gate's hinge and stop; G, B and M; the basis vectors and eigenvectors; Mohr's circle's X, Y and C)
- Chinese, Japanese and Korean text in a Markdown document prints in a font Spectrum includes (Noto Serif SC or TC) when the front matter names none, and pdfLaTeX gives way to XeLaTeX for it. Korean, which the included fonts lack, gets one warning naming a Korean font to use
- Markdown citations come out in APA 7, like the LaTeX and Typst templates, unless the front matter names a csl
- Insert (+) in Markdown has block maths, a footnote and a comment
- Settings › Shortcuts lists how to leave the editor by keyboard: Esc, then Tab

### Changed

- Light-mode icon colours in the Spectrum style are a shade darker where Apple's were too faint to read, and New's label is easier to read
- The assistant, the Spectrum agent, AI autocomplete, Fix with AI, Translate and AI review are told the document's own language: a Typst or Markdown document is no longer called LaTeX. The Spectrum agent's project outline covers Typst and Markdown: files, headings, labels, bibliography, front matter and what does not resolve
- A busy model provider (429, 500, 502, 503, 504, 529) no longer ends a request: Spectrum waits as long as the provider asks, 20 seconds at most, and tries twice more. A rejected key, a wrong address and a spent quota are still reported at once
- Conic section names its vertices V₁ and V₂ by default
- Open Logs when a compile fails moved above the tabs in Settings › Engines, since it applies to every document
- Each diagram opens in a composer window of its own, so opening a second diagram no longer takes the place of the one that is open. Asking for a diagram that is already open brings its window forward

### Fixed

- A project made, imported or opened from a folder is no longer taken for one from before 2.1, so its `images/` folder and its documents are left as they are on the first compile. A project from before 2.1 gets a checkpoint before its diagrams and images move
- The editor tries again when a project is slow to open, then offers Retry instead of staying on Loading…
- Fix with AI opens Settings › Models when no model is set up
- An answer cut off by the model's output limit says so, and a cut-off rewrite is no longer offered as a change
- A connection lost part-way through an answer is tried again and no longer blamed on the endpoint
- The agents' compile tool gives a Markdown error at its line of the `.md` file and lists its undefined citations
- Find citations says when its model could not be asked instead of showing a plain search as ranked
- LaTeX's warnings from a Markdown compile (undefined references, overfull lines, missing characters) reach Logs at the .md line. Missing characters are one warning a font, naming the characters, in Logs and Review
- The References chat no longer suggests a bibliography line a Markdown document does not need
- Table to chart reads every row of a table again (a stray backslash broke numbers)
- Renaming a file no longer doubles its extension when the whole name is typed
- Insert table with no caption writes Caption. and a label from the header
- Each project's and folder's ··· button is named after it for screen readers
- The Outline shows captions without their LaTeX commands
- Moving figures into folders and switching template write the document through a temporary file
- The backend's tests can no longer reach the network
- Local agents in isolation can look host names up again. Isolation refused the system's resolver, so Codex, Claude Agent, DeepSeek Harness and any other agent that uses it could not reach its provider and ended a task with a connection error
- OpenCode is listed as unsupported for now: OpenCode 2's agent mode needs a local port of its own choosing, which isolation does not open
- DeepSeek Harness is no longer marked experimental
- Claude Agent keeps its temporary files in its private home, where isolation lets it write
- The PDF menu has a line above Compile with page colour, which is a setting of the project and not one more page colour

## 2.5.1 (19 November 2026)

### Security

- Compiling a document from someone else could run a command on the computer: makeglossaries read names from the document's own `.aux` into a shell line. Spectrum now checks those names before either glossary program runs
- A project's SVG opened as a page could run script on the app's own address, with the whole local API. The file route now sends it with a sandbox policy, so it draws and runs nothing
- On a Mac, the index and glossary programs a compile runs can write only the build folder and cannot reach the network
- A model's reply could send project text out through the address of a Markdown image. An image in a reply is drawn only when the reply carries it, any other shows as a link, and the app's pages load images only from the app itself
- A page on another port of this computer can no longer use the local API
- Compilers, pandoc and the plot's Python no longer get Spectrum's keys and tokens in their environment
- A model provider's error no longer shows the API key it repeats

### Fixed

- The assistant and agents:
  - The Spectrum agent read only the first 20,000 characters of a file without saying so, and a rewrite then deleted the rest. It now reads a long file on by offset and never rewrites one from a cut-off read
  - An agent that exits part way through a task is reported with its exit code and last words, not "ACP connection closed"
  - A provider's 429 for a spent quota says so, not "try again shortly"
  - A refusal from an OpenAI-compatible model is shown, where the answer was empty
  - A reasoning model's `<think>` block no longer shows in the answer
  - The tools server finds a Typst or Markdown project's main document when none is named
- Typst:
  - Typst finds the Chinese fonts Spectrum ships, as every LaTeX compile does
  - After `@` in a chapter, completion lists the labels of the other chapters
  - Document insights reads Typst equations, references and titles as Typst does, and gives numbers and pages to labels in a chapter's own includes
  - Review reads the chapters a Typst document includes
- Markdown:
  - A compile's TeX errors are traced to their `.md` line and listed once, and missing glyphs, such as Chinese text in Latin Modern, are a warning
  - pandoc's warnings, such as a citation with no entry, are listed in Logs at the line that cites it. A missing citation printed "(key?)" with no warning anywhere
  - The editor highlights GitHub tables, task lists and strikethrough, front matter, `$…$` and `$$…$$` maths and `latex` code blocks, in the editor theme's colours
  - LaTeX command completion runs in maths only, and `/` in prose no longer offers `\section`
  - Spelling skips raw LaTeX commands, the keys after `\ref` and `\cite`, citations without brackets and attributes such as `{width=50%}`, and checks a figure's caption
  - Document insights reads an abstract written as a `|` or `>` block and authors given as `- name:`
  - With pandoc 3.8, choosing Typst as the PDF engine says it needs 3.8.3 and that LaTeX works, not that pandoc is too old for Spectrum
  - The Compile menu no longer offers a Bibliography tool, which pandoc's citeproc never uses
- Editor and compiling:
  - A compile that made a PDF despite TeX errors says "1 error" beside Compile, which opens Logs, rather than only "Compiled"
  - Pasting an image, such as a screenshot, into the editor opens Insert figure with it, as dropping one does
  - Logs names the command in an Undefined control sequence error, warns when `\include` cannot find a chapter, and lists a missing package as one error, not three
  - Typing t, p, v, m or w in the source no longer throws an error on each key
  - The file tree is one Tab stop, and the arrow keys, Home and End move through it and open or close folders
  - The source editor has an accessible name for screen readers
  - Browse… in New project no longer clears the name typed, and closing the template gallery goes back to New project
  - A file changed by another app is "changed on disk", not "changed on another computer"
  - When Spectrum's own server does not answer, messages say so instead of "Failed to fetch"

## 2.5.0 (17 November 2026)

### Added

- A Colour style in Settings › Appearance. Spectrum, the new default, gives each icon its own colour from Apple's system colours (the editor's tools and tabs, the projects page's views and New button, and Settings' sections), with GitHub and Zotero in their own colours, and gives each composer's cards, chip and rail headings the colour of its chapter in the handbook. Simple keeps the look of 2.4
- A Spectrum accent colour: Compile and progress bars run through the colours of the wheel, and the rest of the app uses the palette's blue
- Compile with page colour, in the PDF's ··· menu: the project's PDF takes the page colour the preview shows (Cream, Sepia or Grey), so it looks the same in any PDF reader, when printed and in presentation mode. It is saved with the project's compile settings, so it travels with the project, and changing it compiles again. LaTeX, Typst and Markdown all take it without any change to the source, and a page colour the document sets itself wins
- Every diagram canvas:
  - Draw a diagram has a Standard view, after Recently used, with one card for each composer: Circuit, Logic schematic, General drawing, Structure, Vector diagram, Plot, Flowchart, Flowchart in Typst, Commutative diagram and Mermaid diagram
  - Every diagram canvas can draw the circuit canvas's backgrounds: a larger dot every few dots, a line every few, a grid of lines or plain dots
  - Tool keys for the other composers: W also connects in flowcharts, M draws a member and T a truss bar in Structures, and P adds a point and V a vector in Vector diagrams. Each shows in its tool's tooltip, works only while the pointer is over the drawing and can be changed in Settings › Diagram composer
  - Settings › Diagram composer has Dark canvas and Minimap switches, which follow you to your other computers. The buttons on a canvas change the same settings
- Circuits and General drawing:
  - University styles in Settings › Diagram composer: a switch for each university's symbols, starting with MU Style. Switching one off hides its parts from the parts list and the search. Drawings that already use them still open and compile
  - General drawing has a Fluid mechanics symbol set of 45 parts: pipes, a reducer, a nozzle, bends, a tee, a valve, a pump, a turbine and a pressure gauge that join end to end, section markers, a centre line, a control volume, velocity profiles, a streamline and a streamtube, tanks with the free surface mark, U-tube, differential, inverted and inclined manometers, a piezometer, a barometer and a hydraulic jack, a gate with its hinge and stop, pressure distributions and the resultant force, a floating block, a hydrometer, a ship's hull with G, B and M, an incline, the plates of a viscosity sketch, capillary tubes and a contact angle
  - General drawing has a Construction materials symbol set of 22 parts: a cube between platens, a cylinder, the three and four point flexural tests, the slump cone with a true, shear and collapsed slump, a tension bar, a shear block, a roller and a platen, a reinforced concrete section, six steel sections and brickwork in stretcher, English and Flemish bond
  - The parts list and the chooser find a part by other words for it, so elbow finds a bend and water level finds the free surface mark
  - Annotate can fill a rectangle, an ellipse or a new shape drawn point by point with water, seawater, oil, mercury, air or concrete. Each is drawn as a tint or as dashes, dots, hatching, cross hatching or stipple, and sits behind the parts drawn in it
  - Annotate draws hatched boundaries of any length, dimensions with extension lines (along a slope, across or up), the ▽ free-surface mark, points with a letter (with C, CP, G, B and M ready to place) and leader callouts
- Structures:
  - Twelve pre-drawn starters (cantilever, overhanging beam, propped cantilever, two-span beam, beam with an internal hinge, triangular load, Pratt, Howe and Warren trusses, portal frame, three-hinged frame and inclined member), each solved as it opens
  - A support can be given a settlement, which the structure follows and, when it is indeterminate, takes forces from. EI is now in the drawing's units (kN m² by default), so a settlement and the deflections use the members' own EI
  - A distributed load on an inclined member can be per horizontal length, as snow on a roof, and is drawn on plan
  - The deflected shape can be drawn with the other diagrams, fitted to the drawing or the true deflection times 1 to 10000, with the largest deflection labelled
  - x can be marked on the shear and bending moment diagrams where the shear is zero and the moment largest
  - An internal shear release beside the internal hinge: moment passes it and shear does not
  - Changing a structure's units offers to convert its numbers or keep them as typed
  - The canvas counts in whole metres (or feet), with Settings › Diagram composer's backgrounds
  - M picks Beam or frame member and T picks Truss bar while the pointer is over the drawing; both can be changed in Settings
  - The inspector folds the rarer fields (stiffness, a support's angle and settlement, a load's direction and on-plan switch, hinge and shear release), and each fold opens when one of its fields is set
  - Labels on the canvas show subscripts as they print, such as A_y and q_0
  - Drag a box to select, drag a selection to move it, nudge with the arrow keys, select all with ⌘A, mirror with X and Y and turn a selection by any angle from the inspector. Space or the middle button pans
  - The canvas uses the PDF's scale, so text, arrows and line widths sit where they will print
  - A load per horizontal length is drawn as a level band just above the member, with arrows all the same length
- Vector diagrams:
  - An angle with θ, a circle or an arc, a line from its equation with its intercepts marked, a drop to both axes and equal-length ticks
  - Constructions for where two lines cross, a scalar multiple such as −2v, a vector placed at another point, a reflection in a line and a parallel or a perpendicular through a point. Each follows the points it is built on
  - Points made by a vector diagram's drawing tools have no dot or letter. The Point tool's points still have both
  - Style › Vector names writes each \mathbf{…} in a vector diagram's labels as \vec, \overrightarrow or esvect's \vv, with a default for new drawings in Settings › Diagram composer. Insert adds esvect when \vv is used
  - The canvas has the counting grid, with a larger mark every centimetre, the x and y axes darker and the pointer's x and y beside the zoom
  - P picks Point and V picks Vector while the pointer is over the drawing. You can change both in Settings › Diagram composer
  - Rarer settings fold under one line in the inspector, which opens when any of them is set
  - A label with no side of its own is placed clear of arrows, lines and other labels, in the PDF and on the canvas alike. Existing figures with such labels may show them moved. A new side, "Beside the arrow, left or right", keeps a label beside a steep vector
  - Labels show as they print, with real subscripts, bold vectors, arrows over \vec and \parallel as ∥
  - Drag a whole selection, select with a marquee, nudge with the arrow keys, turn by any angle, mirror and set the colour and thickness of everything selected
  - The canvas follows the Style's scale, and lines and arrow tips are drawn at their printed width
  - Nine new starters: free-body diagram on a block, triangle law, parallelogram law, force polygon, position vectors with i and j, medians of a triangle, angle between two vectors, line from its equation and scalar multiples
- Flowcharts and commutative diagrams:
  - A label can sit on its arrow or beside it, on either side, anywhere along it
  - Block diagrams get a gain, a takeoff point and + and − signs at a summing junction
  - New terminal, manual input and off-page connector shapes, and swimlanes with their title on any side
  - Turn a selection a quarter either way, or mirror it
  - Commutative diagrams: double, maps to, equals, tail and harpoon arrows, loops and two arrows between the same objects drawn apart
  - Commutative diagrams: select several arrows to change them all at once
  - Flowcharts, state machines, model architectures and commutative diagrams draw Settings › Diagram composer's background, on the points boxes snap to
  - A Connect tool (W) joins two shapes with a click on each
  - Flow canvases use the circuit canvas's mouse: drag to select, Shift to add, Space or the middle button to pan, ⌘A to select all
  - Box text and arrow labels show subscripts and superscripts, and canvas text is the size the PDF prints, breaking lines where the PDF does
  - New flow starters: Decision flowchart, Feedback loop, Swimlane process, Model architecture in Typst, Commutative square, Pullback and Short exact sequence. A search for a flowchart shape such as "decision" opens the Flowchart composer
- Plots, Venn diagrams and Mermaid:
  - Plots take points typed into the composer, with an error bar and a label on any point and no data file needed
  - A least-squares line through a series of points, through the origin if you like, with its equation as its legend
  - Mark shapes, a dash-dot line and marks with no line for a scatter
  - Equal axes, so a circle is round; a height; x increasing to the left; a black and white line and marker cycle
  - Break at asymptotes, so tan(x) is not joined across them, now without a y range
  - Tick numbers with a set number of decimals, plain numbers with no ×10ⁿ and a decimal comma
  - The legend can sit below the plot in a row; bars and error bars for typed points and data files
  - A shaded area on any series, so a band between two series (an envelope) or the area under a data curve; and a smooth sketch curve through typed points
  - Two starters from Construction Materials: a stress–strain curve with its named points, an unloading line and the area under it, and a grading curve on a log axis inside a grading envelope
  - A .csv split by semicolons, with decimal commas, plots as its columns. Annotations go at expressions such as pi/2
  - Each series' line, marks and colour, the rarer axis settings (grid, size, scales, ticks) and an annotation's colour fold under one line, which opens when any of them is set, so a new plot's form is short
  - Venn diagrams: the regions are one table, a row each named by the sets' names, with a shade switch and a count
  - New plot starters: Normal curve, Bode magnitude plot, Damped oscillation, Polar rose, Lissajous figure, Conics and Phase portrait
  - New Mermaid starters and templates: Entity–relationship diagram, Pie chart, Bar and line chart, Mind map, Timeline and Git graph
- Form presets:
  - Four new Form presets for fluid mechanics, in the chooser: Hydrostatic force on a gate, Manometer, Accelerating tank and Floating body and stability. Each works out its answers (the resultant force and centre of pressure and the forces on the stop and hinge; the pressure difference; the tilted surface, depths, corner pressures and the acceleration that spills; the draught and metacentric height) and draws the figure as the course's slides or exam papers do
  - Two new Form presets for mathematics, in the chooser. Conic section takes the general equation Ax² + Bxy + Cy² + Dx + Ey + F = 0 or an ellipse's, hyperbola's or parabola's own numbers, says what it is (the degenerate cases too), completes the squares, turns the axes when there is an xy term and draws the curve with its foci, vertices, directrix, asymptotes and turned axes. Linear transformation takes a 2×2 matrix and draws the unit square or a grid before and after, with the images of e₁ and e₂, the determinant and the real eigenvectors. Both write their working under the figure

### Changed

- Settings › Diagram composer describes every canvas, not only the circuit's
- An inspector's fold opens by itself when a field inside becomes set later, such as by Redo
- Labels on the circuit canvas show Greek letters and common maths signs
- A drawing that uses anything new in 2.5 saves as file version 5, which Spectrum 2.4 and earlier open as code
- Logic gates and Springs, dampers and masses are symbol sets of their own, which Symbol sets… adds to a drawing when Symbols from other packages is on. Annotate's circuit presets come with circuit symbols, and its fills, boundaries, free surface and C, CP, G, B and M points with the Fluid mechanics and Construction materials sets

### Fixed

- Every diagram canvas:
  - Settings › Diagram composer refuses a tool key another tool on the same canvas already has, such as T for Structures' member, rather than only noting it
  - The composer's Edit menu offers Paste as soon as something is copied
  - A short word in Draw a diagram's search starts a word, so "op amp" no longer finds a ramp or a damped curve
  - A colour well shows a colour chosen from the swatches or typed as an xcolor name, rather than black
  - The minimap of a flowchart or commutative diagram shows its boxes on the light and the dark canvas
  - Labels on the canvas show ∃, ∀, ∈, ∪, ∩, ⌊ ⌋, ↦ and the other common set, logic and arrow signs, and \circ as ∘ rather than a degree sign
  - Searching in Draw a diagram lists the starters whose name matches first
  - Symbol sets says parts list, not palette
- Circuits and General drawing:
  - The parts list shows only a drawing's own kind of symbol: a circuit no longer lists logic gates, springs or the fluid mechanics points (Centre of pressure CP and the like), and a logic schematic no longer lists resistors and transistors. A drawing from before keeps every kind it uses
  - A ground, supply or terminal no longer logs an error while the circuit symbols load
  - A terminal with a Voltage between two points across it stays open, without a junction dot
  - A dimension's third handle can be dragged right after drawing it, while Dimension is still picked
  - Text, and a part's text inside it, show upright on the canvas, as they print
  - A drawing opens with its large symbols, such as the axes or an antenna's waves, fully in view
  - The circuit inspector no longer says a Text part's name reaches its pins, and its hints keep $…$ on one line
- Structures:
  - A bending moment diagram labels its values with the right sign on a beam drawn from right to left, so a 6 m beam with 10 kN/m reads 45 kN m, not −45. The diagram itself was already on the correct side
  - A spring support's stiffness no longer depends on the longest member in the structure. Its stiffness is now set in force per length (a moment per radian for a rotational spring) against the members' EI, so drawings with springs show different reactions from before
  - The structures canvas no longer solves the structure again on every pointer move
  - Paste puts the copy two grid steps along and down, so it no longer lands on top of the original in N and mm
  - A joint, hinge or support clicked on an inclined member lands on the member. It could land on a grid point beside it, where a support was silently left out of the solve
  - An unstable structure marks the joint that can move on the canvas, as well as naming it
  - A distributed load that changes sign draws each part on its own side, with its arrows the way it acts
  - The structures inspector's and Style menu's dropdowns and paired number fields have accessible names
  - A member drawn to end on an inclined member, or a joint dragged onto one, lands on its line and splits it, rather than on a grid point beside it
  - With bending moments positive up, a frame member's moment values no longer change sign with the way the member was drawn
  - Members of a structure whose EI is typed in real units stay as rigid along their length as before, so a frame no longer sinks and shares its sideways load correctly
  - Converting a drawing's units in Style no longer leaves the canvas zoomed by the conversion factor
- Vector diagrams:
  - Choosing Normal for Style › Vector thickness no longer makes every new vector very thick
  - Clearing a label's text keeps its side, size and colour
  - A colour name is written into the code only once it is a whole xcolor colour, and the canvas shows colours as the PDF prints them
  - Esc part way through a tool starts it again, keeps the tool and takes away the points it had made
  - The inspector shows the Style's tip size and point size, and typing that value keeps the item on the Style
  - A point cannot take a name another point in its panel already has
  - Every inspector menu is named by its label for screen readers
  - The canvas draws the arrow of \vec, \overrightarrow and \vv over the letters. In Chrome and on Windows it showed as bars
  - A length or coordinate typed in is kept within a metre, so a huge number no longer stops TeX
- Flowcharts and commutative diagrams:
  - Resizing a flowchart box from its left or top edge now grows it that way, in 0.5 cm steps
  - Flowchart text with %, &, # or _ (such as "50% done" or "R&D") now compiles in TikZ
  - Typst flowcharts keep a box's line breaks, and $…$ in a box or label is maths
  - New circles, states, operators, ellipses, documents and stacks have even sizes, so arrows between boxes in line come out straight
  - Black lines and text show on the dark canvas
  - The arrow keys move the selected objects a cell, and the label side is named as the arrow runs (Left or Right for a vertical arrow)
  - Converting to Typst imports the fletcher version your default Typst can load, and a flowchart with a document or stack stays a picture
  - A drag inside a container or swimlane moved the whole box instead of reaching what is in it
  - A swimlane can be selected and moved by its title band
  - A commutative diagram's hook (↪) shows on the arrow's left on the canvas, as tikz-cd prints it
  - Typst flowcharts print diamonds, parallelograms, trapeziums, circles and cylinders at the size drawn on the canvas
  - Right-angled arrows in Typst flowcharts turn where the canvas shows them, so they no longer cross the boxes
  - Maths in a Typst flowchart, caption or table keeps its backslashes, so `$a \/ b$` prints a slash
- Plots, Mohr's circle, Venn diagrams and Mermaid:
  - A % in a plot's, Venn diagram's or Mohr's circle's text no longer stops the figure compiling
  - Mohr's circle and Venn diagram labels move clear of the circles, the axes and each other, and a Venn diagram's frame grows to hold long set names. Existing figures get the new places when next opened
  - A plot's domain and axis limits accept expressions such as 2*pi
  - A new plot's legend sits beside it, and a series without a legend no longer leaves an empty row in it
  - Changing a series' kind and back keeps what it had
  - tan(x) and the like are no longer joined across their asymptotes when the y range is set
  - A data file without a header row offers its columns by place, and a file whose columns cannot be found says so
  - A Mermaid diagram's PDF or PNG in the document follows its code each time it is saved
  - A Mermaid diagram fills its pane up to its own size, rather than drawing 300 px wide
  - A series changed from typed points to a curve no longer takes a mark at every sample
  - A coloured series' marks are filled in its colour
- Form presets:
  - A gate clear of its fluid no longer names the fluid below the bed or writes NaN in its comments, and a fluid on the other side with no depth is drawn as none
  - Mohr's circle asks for σz only when Three-dimensional state is on
  - A number field says what range it takes when a number outside it is typed
- Space could be recorded as a diagram shortcut although the canvas uses it to pan
- Polish, Rewrite and Translate results in the assistant no longer say Edit now lives in the agent workspace
- Change template offers only LaTeX templates, and Quick switch no longer writes a Typst template's preamble into a .tex file
- The References chat suggests #bibliography("refs.bib") for a Typst document and front matter for Markdown, rather than \bibliography
- The Local agents send button no longer shows a spinner when no agent is set up
- Messages that point to Settings name the pane with ›, as the rest of the app does
- Settings › GitHub shows Keep my settings in a private repository off until you sign in
- The sidebar's Outline shows a heading's `\texorpdfstring` as its plain form, as the PDF's bookmarks do
- Closing the Jyutping window after changing the Chinese font or an option brings the preamble's lines up to date, as Update preamble does
- The Jyutping window no longer says the built-in Tectonic can compile it

## 2.4.1 (15 November 2026)

### Added

- W picks the wire tool in the diagram composer while the pointer is over the drawing, so the key still types in the parts search and the inspector. The key can be changed
- The circuit canvas marks every fifth dot with a larger dot, so squares can be counted, or can draw a line every few dots, a grid of lines or plain dots, with the interval adjustable
- Settings › Diagram composer (renamed from Composer) holds the canvas background, the wire shortcut and the options for new drawings, and the gear button in the composer's toolbar opens the same settings

### Changed

- The circuit inspector folds a part's voltage, current, flow, poles, mirror, invert, size and name under Voltage, current and more, and a wire's current and flow under Current and flow, so a part shows its label and value first. Each opens by itself when the part already has any of them

### Fixed

- A circuit part's label, value, voltage, current and flow no longer overlap in the PDF or on the canvas. A voltage keeps its side to itself: the label and value move to the other side, as two lines when there are both, and a current or flow on that side moves across too. A flow that meets a current at the same end of a part goes to the other end, or on a wire to the other side. A value now sits opposite its label in the PDF as it does on the canvas. Drawings where nothing overlapped write the same code as before
- The + and − of a voltage sit further from the part, the same distance on every part, and the canvas puts them where the PDF does: beside the leads, beside a source's body or not at all where a source draws its own
- Wires run straight into a transistor's pins in the diagram composer. A MOSFET's gate and its drain and source cannot all sit on the grid, and a placed part snapped by whichever pin was nearest, so the wires to the others jogged on the canvas and in the PDF. Each pin now snaps across the way its lead runs, so the drain and source sit on a grid column and the gate on a grid row
- Circuit symbols line up with their wires to a fraction of a pixel on the canvas. A symbol's page became an image rounded up to whole pixels, which the canvas then showed at the page's size, so a lead near the edge of a symbol landed up to 0.13 pt from its pin and a wire met it with a slight step
- Clearing a circuit part's label keeps the side chosen for it, rather than putting it back to the default
- Circuit symbols stay sharp when zoomed in. They are redrawn at a higher resolution when the canvas shows them larger than their stored images, and wires and annotations take circuitikz's line width when zoomed in, so they match the symbols' leads

## 2.4.0 (15 November 2026)

### Added

- MU Style circuit parts in the diagram composer, for the symbols Hong Kong Metropolitan University's lecture slides use that circuitikz does not draw:
  - N- and P-channel MOSFETs with the channel in three segments (enhancement) or solid (depletion) and the arrow on the source, with or without a separate bulk pin B
  - an ideal diode drawn in a box
  - a current source drawn as a box with an arrow
  - AC sources with + and − around a ~ or a sine

  They are sized and drawn like circuitikz's own parts, take pin labels, turn and mirror, and a drawing that uses one declares it in its own picture, so it compiles anywhere
- Variants of existing parts from the slides: a Zener diode with both ends bent, a grey Filled option on diodes, an open or no gate circle on P-channel MOSFETs, an impedance with its text inside, text and a ground pin on amplifiers, a Size of 150, 200 or 300% for op amps and amplifiers, a bar in place of an arrow on the positive supply and polarity dots on transformers
- Annotate, at the end of the circuit parts, draws over a circuit without joining it:
  - lines and arrows through the points you click, straight, with corners or curved, with arrowheads at either end or both in four styles and three sizes
  - rectangles and ellipses, with rounded corners, a light fill or a loop arrowhead, to frame a subcircuit or highlight a node
  - a cross to mark a cut wire or a shorted capacitor
  - colours (the slides' dark red, red, magenta, blue, green, orange and grey, or your own), solid, dashed, dotted or dash dot lines and four widths
  - presets that place a styled, labelled group in one click: Resistance looking in, Current arrow, Loop current, Mesh current marker, Frame and Highlight
- Text in a circuit takes a colour, bold, italic and a size
- A wire's segments take a current (`i=`) or flow (`f=`) arrow, as a two-terminal part's do

### Changed

- A drawing that uses annotations, styled text or arrows on wires saves as file version 4, which Spectrum 2.3 and earlier open as code rather than drawing it wrongly

### Fixed

- The MU Style symbols also draw with the built-in Tectonic's older circuitikz

## 2.3.2 (14 November 2026)

### Added

- More MOSFET symbols in the diagram composer, in a group of their own: the IEEE style (`nfet`, `pfet` and their depletion forms), depletion `nmosd` and `pmosd`, `nmos` and `pmos` with a bulk pin and the IGFETs (`nigfete`, `nigfetd`, `pigfete`, `pigfetd` and their bulk forms). The Arrow and Body diode options apply to more of them, and Circle draws the ring around npn, pnp and the IEEE MOSFETs
- Label pins, in the inspector for a transistor, writes G, D and S (B for the bulk), B, C and E, or C, G and E beside its pins, outside the body, in the right places after a turn or a mirror
- Voltage between two points, a part for ports such as v_o and v_i, with + at one end, its name in the middle and − at the other
- A part's voltage shows with + and − at its ends on the canvas, and Flip polarity swaps them
- Back to its folder, in the editor's project menu, opens Home in the folder the project is in

### Fixed

- Turning several things in the diagram composer turns them together about their common centre, with their wires and text, rather than each in its own place
- The inspector names a label's sides by the way the part runs, Left and Right on an upright part, rather than always Above and Below
- On Windows, editing a document while it compiles no longer fails to save. TeX keeps the main file open while it compiles, which Windows wouldn't let a save replace, so a save now writes into the file itself
- siunitx groups only the whole-number digits in the Report or thesis template and in LaTeX converted from Typst, so 0.3574 is no longer shown as 0.357,4 while 7,790 keeps its comma

## 2.3.1 (12 November 2026)

### Fixed

- LaTeX autocomplete suggests siunitx units in unit arguments, including in equations. Typing `/vo` offers `\volt`.
- Projects created from a Home folder appear there and default to the matching disk path under Spectrum's save folder. Choosing a custom disk location preserves their placement in Home.
- Opening an existing project folder lists it in the current Home folder and keeps its files at the selected disk location.

## 2.3.0 (12 November 2026)

### Added

- Jyutping: the 粵 button beside Draw a diagram adds Cantonese Jyutping above the Chinese characters of a LaTeX document with the xjyutping package, which Spectrum includes. Apply when compiling adds it at each compile without changing the `.tex` files, and In the .tex file writes the package and font into the preamble and wraps the selection. The window has every option of the package with a preview, and the settings are saved with the project
- Chinese support turns on with Jyutping: xeCJK, or `luatexja-fontspec` under LuaLaTeX, with the chosen font when the document has neither. Changing the font or the engine changes the preamble lines already there rather than adding new ones
- Six bundled Chinese fonts, all under the SIL Open Font License: Noto Serif TC and SC and Noto Sans TC and SC, each with bold, and LXGW WenKai TC and LXGW WenKai, found by file name in every LaTeX compile
- An xjyutping folder in Settings › Engines › LaTeX, used in place of Spectrum's own copy of the package when set

### Changed

- A project set to Auto or pdfLaTeX compiles with XeLaTeX while Jyutping is on, and the log says so. The built-in Tectonic's LaTeX is too old for xjyutping
- The Mac download is about 80 MB larger, for the fonts

## 2.2.3 (5 November 2026)

### Fixed

- Moving a Typst project to the Bin, removing it from the list, moving it to another folder or to this computer stops the Typst Spectrum keeps running for it first, as it does TexLab and Tinymist. On Windows, moving an open Typst project to the Bin could fail while that Typst still had its folder open
- The Windows build's tests pass again: one compared a folder by its spelling, which Windows can shorten, and one deleted a folder a running Typst still had open

## 2.2.2 (5 November 2026)

### Changed

- A new install's first LaTeX compile is quick: when the built-in Tectonic is the LaTeX Spectrum uses, Spectrum compiles copies of its LaTeX templates in the background after it opens, so the packages and fonts they use are downloaded beforehand, and downloads Biber. Settings › Engines › LaTeX shows Preparing LaTeX packages… until they are ready. A compile of your own always goes first
- A built-in Tectonic compile that needs Biber downloads it and carries on, with the download shown in the compile's status line, rather than stopping. When it cannot, the PDF pane offers Download Biber and compile. A long first compile says that later ones are quick

### Fixed

- The PDF viewer draws text on older versions of macOS. It used a build of pdf.js that needs JavaScript newer than their WebKit has, so pages could show without their text

## 2.2.1 (3 November 2026)

### Added

- Convert to Typst project… and Convert to LaTeX project… in a project's menu on Home, as in the editor's project menu

### Fixed

- The LaTeX, Typst and Markdown choice in New project and the template gallery fills its row, the three sharing the width evenly, rather than leaving empty space at its end
- Settings › Engines › Markdown offers to download pandoc when the computer's own is older than 3.8.3, which converting between LaTeX and Typst needs, and when it is older than the version Spectrum is tested with; it compared against the minimum for LaTeX output before, so a pandoc 3.8 had no button. The Convert sheet has a Download pandoc button when pandoc is missing or too old

## 2.2.0 (3 November 2026)

### Added

- Convert to Typst project… in a LaTeX project's menu, and Convert to LaTeX project… in a Typst project's, make a new project in the other language and leave the original as it is. Labels, references, citations, numbered equations, figures, sub-figures, tables, listings, pseudocode and theorems come across; siunitx quantities become typed units and back; TikZ and Typst drawings are compiled to PDF with their source kept beside them, and the diagram composer's flowcharts are written again as fletcher or TikZ. Spectrum checks that the new project compiles and that nothing was lost, and conversion/notes.md lists the checks, any word missing and anything to look over. Converting back reads the conversion record, so the class, title page, roman front-matter numbering, drawings, long tables and comments return as they were. Typst is read with Typst's own parser, built in, so documents that import packages or define their own functions convert. It uses pandoc from Settings › Engines; Beamer slides are not converted
- Experimental, off by default: Tidy flagged parts with the AI model, when converting. The parts the rules can only approximate (title pages, CV headers, unknown environments and commands, unusual tables) are sent to your quick model one at a time; Spectrum keeps an answer only if it keeps the words, labels, references, citations, maths and formatting and still compiles, saves a checkpoint first, and shows every edit for review. scripts/tidy-bench.mjs measures how well a model does this on 51 test regions, with --recheck to score saved answers again
- Tinymist, Typst's language server, downloads from Settings › Engines › Typst and gives Typst files completion for your own functions and packages, hover help, go to definition, rename, errors as you type, Format document and a word count in Document insights. In projects on Typst 0.15.1, double clicks jump exactly between the PDF and the source in both directions
- Typst compile errors and warnings are underlined at their place in the editor, with the message on hover, until the next compile
- Typst documents download as PNG or SVG (one image per page, zipped), HTML (experimental), PDF/A-2b or PDF/UA-1 from the download menu in the PDF toolbar
- New project and the template gallery ask first whether to write in LaTeX, Typst or Markdown and offer only that language's templates; a blank project starts in the language chosen. Typst Universe is a separate, searchable section of the gallery for Typst, working offline from a daily cached index, showing each template's version, description and licence and flagging licences that are not MIT-compatible. Choosing one downloads only that template
- Typst templates for maths notes, electronics notes and a coding report, matching their LaTeX versions, with plots and the circuit drawn in plain Typst so they compile offline. docs/TYPST_STYLE.md sets out the Typst house style, as docs/LATEX_STYLE.md does for LaTeX

### Changed

- The Typst document, report, letter and CV templates follow the Typst house style. The Typst report is now the Report or thesis template in Typst, with the same title page, chapters, chart, tables, citations and appendix
- The maths notes, electronics notes and coding report templates cite a real source in both their LaTeX and Typst versions
- Insert figure's Typst sub-figures are #subfigure panels with a label each, so @fig:measured prints Figure 1a, and the definitions are added to the file when it lacks them. The References tool names a new bibliography refs.bib in Typst projects
- Faster: Typst stays running for the open project, so a recompile with nothing changed takes milliseconds and one after a save a fraction of a second; a project's files are read in one request when it opens; checkpoints rehash only the files that changed; the editor no longer redraws on every key; spell checking runs off the typing thread; the PDF reaches the editor without slow decoding
- The Mac app is built for Apple silicon only and ships as Spectrum_2.2.0_aarch64.dmg, about 250 MB smaller. Intel Macs stay on version 2.1.0

### Fixed

- The built-in Tectonic always runs Spectrum's own Biber, even when another tectonic-biber is on the PATH, and refuses to run a tectonic-biber kept in a document's folder
- The splash screen no longer shows a grey square behind the icon
- Text on the line after \vspace{…} is spell checked again

## 2.1.0 (1 November 2026)

### Added

- Insert table can merge cells across columns and down rows (\multicolumn and \multirow, or table.cell spans in Typst), draw a short rule under a group of columns (\cmidrule with booktabs, \cline otherwise) and line numbers up on their decimal point with siunitx's S columns, working out each column's table-format from its numbers. A rule stops either side of a cell merged across it
- Insert table has xltabular as a third environment, for a table that breaks across pages and repeats its header rows on each, and options for line breaks inside cells (makecell) and notes under the table (threeparttable). Each adds the package it needs
- Insert figure can put several images in one figure, side by side or in a grid of two to four columns, as sub-figures (a), (b) under one caption (subcaption), as separate figures each with its own number, or under one caption alone, lined up along their tops, centres or bottoms. The images are put in order by dragging them or with Move earlier and Move later. An image can be sized by a share of the line, an exact width or height, a box it fits inside or a scale of its own size, and cropped at its edges
- The diagram composer has a Delete button. After asking, it deletes the diagram's file and the PDF or PNG made from it, and its folder when nothing else is left there, then goes back to choosing a diagram. It says when a document still includes the diagram
- The Insert table and Insert figure cards explain their options and packages under What these options mean: tabular, tabularx and xltabular, S columns, booktabs, merged cells, short rules, makecell, threeparttable, sub-figures, sizing and placement

### Changed

- The diagram composer saves diagrams in diagrams/, and Insert figure saves images in figures/, rather than figures/ and images/. A project from before moves to the new folders on its first compile: the composer's diagrams to diagrams/ and images/ into figures/, with the paths in its documents updated to match. Images of the user's own in figures/ stay, and a folder whose names would clash stays where it is
- Insert table, Insert figure and Insert diagram add a package in its place in the order of docs/LATEX_STYLE.md, before the next group's heading, or after the last \usepackage when the document's order does not allow it or the package is not in the guide, rather than just before \begin{document}

## 2.0.4 (30 October 2026)

### Fixed

- On Windows, installing Biber for the built-in Tectonic finishes even when the downloaded program cannot be started straight away, as on a Mac, rather than stopping the install
- The Windows build uses the Node 24 versions of GitHub’s cache and artifact actions, as GitHub retires Node 20

## 2.0.3 (30 October 2026)

### Added

- Spectrum opens other TeX files (.sty, .cls, .clo, .dtx, .ins, .bst, .bbx, .cbx, .lbx and .dbx), Typst documents (.typ) and Markdown documents (.md and .markdown) from Finder and File Explorer, and is listed under Open With for each. A package or style opens with the document beside it or up to three folders above, as a .bib does; a Typst or Markdown file with the folder holding its main.typ or main.md, and a lone one, such as notes.md, makes its folder a project with it as the document
- Settings › Projects › Opening files has a switch for each kind of file on macOS: LaTeX documents, bibliographies, other TeX files, Typst documents and Markdown documents. Switching one on makes Spectrum their default; switching it off gives them back to the app that had them before. Spectrum still takes only .tex, .ltx and .bib files when it first opens. On Windows, each kind says how to choose Spectrum for it
- Live output while compiling: the engine's output takes the PDF's place as it comes, with a line saying what it is doing, such as the file Tectonic is downloading and how many it has downloaded so far, the file pdfLaTeX, XeLaTeX or LuaLaTeX is reading and the pages written, the rule latexmk is running, Biber, BibTeX or MakeIndex running, or MiKTeX installing a package. Settings › Engines has a switch for each engine and for Markdown through LaTeX; Tectonic's is on by default, so a first compile that downloads for minutes does not look stuck, and the others are off

### Changed

- The project switcher above the editor lists your projects as Home does: the folders first, each opening in place with a row back to the folder above, then the projects there with a TeX, Typst or Markdown mark. All projects opens All projects every time, and Home opens Home
- Settings › Projects › Project switcher opens at: Home, or this project's folder

### Fixed

- Downloading an engine (Typst, pandoc, Biber), LanguageTool or an arXiv source no longer stops Spectrum's server when the download's connection closes early, which Node's built-in download could not recover from
- A document that uses biblatex with Biber, as most of the LaTeX templates do, compiles with the built-in Tectonic when no TeX Live or MiKTeX is installed. Tectonic's biblatex needs Biber 2.17, which Spectrum downloads when you ask, from the Download Biber button in Logs or from Settings › Engines › LaTeX, where it can also be removed. Spectrum's Biber goes before any other on the PATH that Tectonic is given, so a different Biber on the computer is not used

## 2.0.2 (30 October 2026)

### Fixed

- A folder opened from the sidebar shows the folders inside it, as it does when opened on Home: the sidebar now opens it on Home

## 2.0.1 (30 October 2026)

### Added

- Customise Folder… in a folder's menu on Home and in the sidebar, laid out as Finder's: the folder with its name, a row of colours (No colour and the seven tag colours), about 190 symbols in People, Animals & Nature, Food & Drink, Activities, Travel & Places, Objects and Symbols, Clear and Emoji. Emoji takes a typed or pasted emoji (or one from the system's emoji viewer) and offers a few to pick from. Every choice shows on the folder at once, and the symbol or emoji goes with the folder to your other computers
- An icon size slider beside the layout buttons in the icons view

### Changed

- Folders are drawn as Finder draws them: the light blue folder with a soft gradient, or tinted with the folder's colour, with its symbol engraved on the front in a deeper shade or its emoji in its own colours, on Home's icons and list and in the sidebar
- Folder colours are Finder's tag colours in Finder's order: Red, Orange, Yellow, Green, Blue, Purple and Grey. Blue is now a colour of its own, and a folder without a colour is the light blue folder. Folders keep the colours they had
- Project and folder icons on Home are the size of Goodnotes' icons, and a folder no longer shows how many projects it holds on its icon

### Fixed

- On Windows, a project in a folder whose path is longer than 260 characters compiles, and a compile whose output pipe fails no longer stops Spectrum
- On Windows, SyncTeX finds the source of a project whose folder name has characters outside the system's code page, which some TeX engines write as `?`

## 2.0.0 (29 October 2026)

### Added

- A list of the languages you write in, in Settings › Spelling & grammar, Australian English alone by default, with each language's spelling and grammar checker and a Download button for its dictionary. Each paragraph is spelt and checked in one of the listed languages, from language markup, the text's script and, for languages sharing a script, their dictionaries' vote. A project can have its own list. Stray Simplified characters are underlined in Traditional Chinese
- LanguageTool 6.8 on this computer, downloaded when you ask, for grammar in languages other than English (and English, if chosen). The grammar panel names the languages it checked and what it could not check, and a LanguageTool check can be cancelled
- A diagram composer in its own window. It opens on a gallery of starters in five categories (Engineering, Physics, Mathematics, Computing and Others), with Recently used, All and a search that also finds circuit symbols. The starters are circuits and 20 circuit templates (op amp stages, rectifiers, 555 timers, converters and a mass, spring and damper among them), a logic schematic, structures (beams, trusses and frames, solved for their reactions, shear force and bending moment), Mohr's circle, a Venn diagram, plots from functions or project data, a signal sketch, a vector and slope field, commutative diagrams, TikZ flowcharts, state machines in TikZ or Typst, a model architecture, Mermaid diagrams, sequence diagrams and Gantt charts. It saves editable drawings with their source files, previews them and hands figures to the editor's Floats panel
- A circuit catalogue of 91 parts drawn by the installed circuitikz, and 5 supports for mechanical drawings (ground, pin, wall, ceiling and cart), with attached wires, snapping, style controls, a minimap and copy, paste, undo and redo
- Document insights, a panel beside Check grammar, with tabs for the Overview, Headings, Figures, Tables, Equations, Labels, Citations and To-dos, each with its count. Rows show the number and page from the last compile and jump to their line in the source. The Overview has the counts, the `texcount` word counts and the submission metadata (title, authors, keywords, date and abstract) with Copy submission metadata. The footer says that the numbers and pages are from the last compile, marks them as out of date when the source has changed since and has Refresh
- A to-do list in the sidebar, beside Files and Research, with a badge counting the open items. Mine holds your own to-dos, each with a tick box, an optional link to a source line, a PDF page or a reference, Edit and Delete. In the source lists `\todo`, `\missingfigure`, `\fixme`, the fixme package's notes and `TODO`, `FIXME` and `XXX` in comments, each jumping to its line. To-dos are added in the box at the top of the tab or with Add to-do here in the editor's and the PDF's right-click menus, and filtered by Open, Done or All, by Mine or Source and with the sidebar's search
- Insert figure and Insert table in the top bar, which open the Floats panel at the figure or table card. At narrow widths they stay in Insert (+), whose Figure… and Table… open the same cards
- Table lines in Insert table: a None preset beside Booktabs, Grid and Minimal, a click between two rows or two columns (or along an edge) to add or remove a line, and Lines at row and column buttons that do the same from the keyboard. Grid draws a double line under the header, and a table changed by hand says which preset it was changed from. Typst documents get a `#table` with its lines as `table.hline` and `table.vline`, and Markdown documents a pipe table, which has no lines of its own
- A PDF sidebar, opened with Document outline in the PDF's header, beside the pages. Contents lists the PDF's bookmarks with the current section marked, or the source headings across `\input` files when the PDF has none, and Pages shows a thumbnail of each page with the current one outlined
- Find in the PDF with `⌘F` while the PDF has the focus, with the previous and next match and every match highlighted
- An editable page number in the page bar, Page Up, Page Down, Home and End, `⌘0` to fit the width and `⌘9` to fit the page. Each document's PDF opens at the page it was left at
- Presentation mode for slides, one page at a time in full screen, with the arrow keys and Escape
- PDF follows the open file (on by default): opening another document's `.tex` shows that document's PDF, and Compile and auto compile build the document that is showing
- New choices in the compile menu, each with Use for all projects: the compiler for this project, Auto compile after a pause of 1 to 10 seconds, Try to compile despite errors or Stop on first error, the bibliography tool (Auto, BibTeX or Biber) and Fast draft mode with one pass and images drawn as boxes. The menu also has Stop compilation, Recompile from scratch and Recompile all, which compiles every document with linked documents first
- Settings › Engines › LaTeX holds the defaults for every project, a TeX folder for a second TeX installation and Open Logs when a compile fails
- Settings › Checkpoints: Save a checkpoint when a compile succeeds (on by default), Warn me when a checkpoint fails to save (on by default) and Delete automatic checkpoints older than…, which Tools › Checkpoints also offers
- `% !TEX root` in a chapter compiles the document it names and `% !BIB program` chooses the bibliography tool. makeindex and makeglossaries run when a document has an index or glossaries
- An agent workspace, opened with Agent in the top bar, in the PDF's place. Its Spectrum agent tab is the assistant's former Edit mode and its Local agents tab runs the installed ACP agents. The header has the session history, the Isolated or Direct badge, the agent's model and mode options, a persona picker and Stop. Closing the workspace does not stop a task, and a dot on the Agent button shows a task running, waiting for you or with changes to review
- The workspace opens on What would you like to do today? with task buttons for Literature sweep, Related work, Citation audit, Manuscript review and Verify claims, each a prepared prompt with its skill (and, for Manuscript review, the Critical reviewer persona)
- The workspace's transcript has a card for each tool call that updates in place with its output or a side-by-side diff, the agent's thinking folded away, questions and permission requests in line, Restore rows for the Before AI changes checkpoints and the agent's plan at the top with Save open steps as to-dos
- Chips under the workspace's message box send the open file, the selection, the compile log and the open to-dos, and `/` lists the agent's commands and the project's skills
- A changes tray, such as "3 files, +12 −4", for both agents. It opens a review with each file's diff, Apply and Reject for each file, Apply all, Reject all and Preview PDF, which compiles a local agent's copy where it cannot read your other files
- Personas in Settings › Personas: instructions picked in the assistant or the agent workspace, which replace your default instructions while chosen. Four starters (Research writer, Document editor, Critical reviewer and Draw a figure), with Create, Edit, Delete and Reset to defaults. They go to local agents too, in the agent's own system prompt where it offers one
- Skills in Settings › Skills: 12 research and writing skills from K-Dense's scientific agent skills and Spectrum's own LaTeX, Markdown, related work, Typst and verify claims skills, with a search, groups, cards showing each skill's author, licence and version and a switch for all projects or this project. Your own skills are made with Create skill, Add folder or Duplicate and edited in a file browser
- Share skills with other agents on this computer (off by default), which links your own skills into `~/.agents/skills` and `~/.claude/skills` where those folders exist
- The Spectrum agent follows the persona and a skill picked with `/`, loads skills itself and reads the to-do list, suggests to-dos and searches the literature, with up to 25 steps
- On macOS, local agents get Spectrum's tools (compile, the log, the project map, the bibliography, literature search, the to-dos, suggested to-dos and skills) from a small server they start inside their isolation. The skills that are on for the project are copied into each agent's private home
- To-dos an agent suggests appear as cards with Add, and are only saved once they are added
- Settings › Agents lists every supported agent as a card with its logo, a status chip, the program found, a Test that starts the agent in isolation without a prompt, the sign-in command to copy, its key, the ACP adapter and one next step. The agent workspace shows only the agents that are set up, with a + to set up another
- Gemini CLI and GitHub Copilot CLI as local agents. Spectrum installs the pinned Codex, Claude Agent, Pi and ZCode adapters into its own data folder when you confirm, with the npm that comes with its Node.js and install scripts off
- Agents are found in the folders their installers use, such as `~/.local/bin` and `~/.opencode/bin`, with their own package and interpreter readable in isolation
- Agents are found in their desktop apps in `/Applications` and `~/Applications` (DeepSeek Harness's own CLI), in Qoder's CLI folder and in the package managers' and Homebrew's folders, which an app started from the Finder has no PATH to. Each card says where its program was found, says when an app such as Kimi Code needs its CLI for agent mode, and has Choose the program… for anything still not found. An agent started from an app may read only that app
- TexLab 5.26.0 ships with Spectrum and runs for each open project. The editor shows its findings as squiggles (references and citations with no label or entry, labels defined twice or never used, missing braces, mismatched environments and `.bib` mistakes), shows a citation's entry or what a `\ref` points to on hover and has Go to definition (`F12` or a click with `⌘` held), Find references (`⇧F12`) and Rename (`F2`), which renames a label, citation key or command across the project and its `.bib` files after a Before rename checkpoint, saving every file or none
- Syntax checks in the compile menu, with Check before compiling as the default: a compile first looks for missing braces and mismatched environments in TexLab's findings and asks whether to compile anyway. The default is in Settings › Engines › LaTeX
- Document insights marks the labels TexLab finds unused or defined twice and the citations missing from the `.bib`, and counts them in the Overview
- Tools › Review runs Preflight checks and an AI review with one press. It compiles first when the PDF is older than the source, then checks Compile and layout, References and assets, Privacy and blind review (with an Anonymous review switch), Accessibility (with a screen reader view of the PDF's text) and Submission readiness, each with a tick box. Rows jump to their line or PDF page and have Fix with AI and Dismiss, and Copy report copies the results
- The AI review reads the whole document once in `\input` order without tools. It returns Major, Minor and Note points tied to a line and quote, with a summary, strengths, a score, confidence and the limits of the review. A point whose quote cannot be found near its line shows without a link
- Research in the sidebar, beside Files and To-dos. A question is searched in OpenAlex, Semantic Scholar, arXiv, Crossref, PubMed, the web and the project's `.bib` at once, with a range of years and preprints in or out, and one source failing does not stop the others. The results are merged by DOI, arXiv ID and title, and show their sources, citation count, Open access, Preprint and In .bib with the key the project has them under. Sort the results with AI adds a line on why each one matters, a keep or drop suggestion and a theme in one call
- Each question is a research session kept with the project in `.spectrum/research`, with a log of its searches (the words, the filters and each source's count or failure), Search again and the results shown as All, Kept, Dropped or To decide
- Each result has Keep and Drop with a reason, Cite at the cursor, Open note and Get PDF. Open note makes `research/notes/<key>.md` the first time, Get PDF downloads a free copy from arXiv, Unpaywall or the copy a source named into `research/papers/` and Add kept papers to .bib adds the kept ones the project does not have yet
- Deep research, Draft related work and Verify claims in Research open the agent workspace with a prepared task, its skill and the research session
- Settings › Search has the keys and emails Research uses on this computer: the OpenAlex and Semantic Scholar keys, an email for OpenAlex, an NCBI key for PubMed and the email Unpaywall asks for
- GitHub, the way projects now go between computers, through isomorphic-git with no Git installation needed. Settings › GitHub signs in with a personal access token, or with a code entered at github.com in a build with an OAuth app, and keeps the token in the backend only
- Sync with GitHub in a project's menu and Tools › GitHub, with Sync, Pull, Back up… and Open on GitHub. The first backup makes a private repository named after the project and records it in `.spectrum/settings.json` with the project's id. Linked projects pull when opened, back up a minute after typing stops and when the project is left, and show Not backed up since when a backup did not go through
- A pull merges each file changed on both computers (text by lines, the project's details and settings key by key, chats by message, research sessions by search, to-dos and notes field by field) after a Before pull from GitHub checkpoint. A file that does not merge keeps this computer's copy with GitHub's beside it as a conflicted copy, and a pull that would delete many files asks first
- The GitHub view in the projects page's sidebar, in place of Cloud projects, lists your repositories that are Spectrum projects, with Get from GitHub for one not on this computer and Link for one whose project is already here (after showing how many files would come from GitHub and how many conflicts there would be)
- Settings, personas, your own skills and templates, project folders and tag colours follow you through a private `spectrum-settings` repository, each persona, skill and template a file or folder of its own. A computer signing in for the first time takes the settings already there
- Zotero through its local API on this computer. Settings › Zotero shows whether Zotero is open, its version, the local API and Better BibTeX. Cite from Zotero, in the editor's right-click menu and on the References card, opens Zotero's citation picker through Better BibTeX, with Answer in Zotero and Cancel while it waits, or a search of the library in Spectrum without Better BibTeX. Entries go into the `.bib` under their Zotero citation key, through the references chat's duplicate check
- `\cite` completion lists matching Zotero items below the project's own keys after three letters, and adds the one picked to the `.bib` (on by default in Settings › Zotero). Research has a Zotero source, and Add kept papers to .bib takes its papers from Zotero under their own keys
- With Zotero 10 and one Always Allow in Zotero, each project gets a Spectrum › <project> collection kept in step with its `.bib`: after an add, after a `.bib` save, on opening and when the window comes forward. Items the library has are added to the collection by citation key, DOI, arXiv ID or title and year, the others are created there, and an entry removed from a `.bib` read in full leaves the collection. Spectrum never deletes a Zotero item or edits the `.bib` from Zotero, and waits rather than making a second collection when the other computer's has not reached this Zotero yet
- Typst projects, with Typst 0.15.1 built in and older versions installed on request from Settings › Engines › Typst. A project can pin a version, and the editor, outline, Document insights, spelling and grammar, citations, figures and tables and PDF jumps work for `.typ` files. Document insights reads each label's number and page from Typst's own eval
- Markdown projects, compiled through pandoc into LaTeX or Typst. Their YAML front matter gives the title, authors, keywords, date and abstract and names the bibliography, and errors in the generated LaTeX or Typst are traced back to the `.md` line. The compile menu chooses the PDF engine, and a Markdown main file exports to Word or converts to a LaTeX project
- Tectonic 0.17.0 ships with Spectrum, so Auto compiles when no TeX is installed. It downloads its bundle and each package on first use, and a failed download says what to do. A biblatex document with Biber prefers an installed TeX
- Settings › Engines has LaTeX, Typst and Markdown tabs: the built-in engines, the Typst versions that can be installed and removed, and pandoc 3.12.1, downloaded when it is needed
- Four Typst starters (document, report, letter and CV) and a Markdown article, in Templates
- A Typst mode in the diagram composer: flowcharts and block diagrams drawn with fletcher on the TikZ canvas, written as Typst. An older pinned Typst gets the fletcher it can load
- Typst and Markdown in the editor's Insert list, `@key` and `[@key]` citation completion, figures and tables in each document's own syntax, and to-dos in `// TODO` and `<!-- TODO -->` comments
- Typst, Tectonic and pandoc in local agents' isolation, and Typst errors in the get_log tool's list
- The Windows workflow bundles Typst and Tectonic beside the app and checks that Typst starts with its Visual C++ runtime
- A Home page of folders, where Spectrum now opens, above All projects in the projects page's sidebar. Folders show as large coloured tiles or as a list, open in place with a path back up (and `⌘↑`), and each keeps its own layout and sort. Projects and folders are dragged onto a folder, a sidebar folder or the path, several are selected with `⌘` and `⇧` and moved together, and a folder's menu has Move to folder…, Rename, a colour and Delete, which moves what it held up a level. Search on Home looks through every folder. Settings › Projects chooses whether Spectrum opens on Home or All projects
- Units written with siunitx in circuits, structures, Mohr's circle and plot axis titles, on by default for new drawings (Settings › Composer › Write units with siunitx, and each drawing's Style): `\qty{10}{\kilo\newton}` and `\unit{\kilo\newton\metre}`. Insert adds the package, and writes `\SI` instead in a document that loads `physics`, which redefines `\qty`
- Logic gates in the American, European (IEC) or IEEE style, and for European gates a triangle or a circle on the inverted output
- Circuit labels placed clear of each symbol's drawn outline on both sides and in every direction, with `_` and `^` shown as subscripts and superscripts on the canvas
- Structures: a switch for each of the axial force, shear force and bending moment diagrams, and a fill colour and opacity for each, in Style with their defaults in Settings › Composer. Labels move clear of members, load arrows, supports and diagram outlines
- A Vector diagrams composer under Mathematics › Geometry and vectors and Physics › Mechanics: points, vectors, segments, polygons, lines through two points, axes with ticks, right-angle marks, drops to an axis and highlighted segments, with midpoints, points dividing a segment in a ratio, projections and vector sums kept exact as points move, panels side by side with (a), (b) and (c) under them, and four starters. Every line, arrow tip, colour, point, fill, label and axis can be styled, with the drawing's defaults in Style
- General drawing under Others: the circuit canvas with every symbol set switched on, including new flowchart shapes and points, marks and axes

### Changed

- Versions are now called checkpoints. Save version is Save checkpoint (`⇧⌘S`), and the Versions tab in Tools is Checkpoints
- Tools, Check grammar, Document insights and the Floats panel each take the PDF's place with a header holding Close and the view switcher, and the Compile button stays in the top bar while one is open
- Tools holds Checkpoints, Logs and Review. Project info moved to Document insights, Floats to its own panel and Research to the sidebar
- The Review tab's Full review report, Consistency check, Missing citations and Compile log summary buttons are replaced by the one Review, whose AI review covers the first three in about one read of the paper and cannot propose patches
- A project's compiler is saved with the project in `.spectrum/settings.json`, so it follows the project to your other computer. A project uses the defaults from Settings until one of its compile settings is changed, and the default compiler is Auto
- Compiles are faster. Each document's `.aux`, `.bbl`, `.toc` and similar files are kept between compiles for each compiler and read back by the next one, so an unchanged document is done in one pass. BibTeX and Biber only run when something is cited, and another pass only runs when the log asks for one or a pass changed what TeX reads back. Files are kept only from a compile without errors, and when TeX cannot read one, Spectrum clears them and compiles once more from scratch
- Tectonic carries on past errors like the other compilers unless Stop on first error is chosen, and a compile with errors no longer reports a clean status
- A Typst version and a Markdown PDF engine are compile choices saved with the project in `.spectrum/settings.json`, beside the compiler. The compile menu shows the Typst version in place of the compiler for a Typst document
- Document insights and Review read Typst and Markdown documents. Typst gets headings, labels, numbers and pages from its compile; Markdown gets headings and source items but no word counts or pages, since pandoc's generated LaTeX is not the document
- A checkpoint is saved after a successful compile, only when the source changed since the last one and at most one every 10 minutes, as the latest compile's checkpoint takes the place of the earlier one in that time. Manual, named and "Before" checkpoints are never replaced
- The More › Table of contents popover is replaced by the PDF sidebar. The sidebar's source Outline stays, and with TexLab it covers the whole document across its `\input` files, with the section numbers of the last compile and the figures and tables by their captions
- PDF notes are saved with the project, one file each in `.spectrum/notes`, rather than only while the editor is open
- The assistant keeps Assistant and References. Its Edit mode is the Spectrum agent in the agent workspace, and an Edit chat from before 2.0 has Continue there to carry it on in the workspace. Spectrum agent threads are listed in the workspace, not with the chats
- Setting up local agents moved from the assistant's Agents tab to Settings › Agents, which checks the launcher arguments as a list of text and says on Windows that local agents get no Spectrum tools yet
- An isolated local agent keeps working on its copy while its changes wait for review. Applying a file makes it the agent's new starting point for that file, and rejecting one puts your version back in the agent's copy and tells the agent with its next task
- Local agents receive the open file, the selection, the compile log, the open to-dos and a chosen skill as ACP resources instead of pasted text, and are told Spectrum's real version
- The sidebar's Chats tab is now History in the assistant's header, which lists the saved Assistant and References chats with the Edit chats from before 2.0, and has a search and Delete
- Find citations for selection is in Research, and adds papers through the references chat's look-up
- Research no longer has the arXiv search through an AI model or puts the summaries of web results into a `.tex` file. Abstracts are shown as the sources give them
- A click with `⌥` held adds a cursor, as in VS Code, as a click with `⌘` held is Go to definition
- Settings and templates follow you through the `spectrum-settings` repository on GitHub instead of the `.spectrum-shared` folder in a cloud location, and Use the same settings on each computer in Settings › Projects needs Keep my settings in a private repository in Settings › GitHub
- Move to this computer… now only moves a project out of a sync app's folder into the folder for new projects, and Settings does not accept a folder in a sync app's folder for new projects
- Every on/off choice in Settings and Review's Anonymous review is a switch that Spectrum draws itself, 36 by 20 px with a mid-grey off track, so it looks the same on macOS and Windows. A clicked skill switch moves at once, and buttons and switches dim only once a save takes more than a moment
- Closing Settings or leaving its page with an unsaved skill file, new skill or persona asks first, with Discard and Keep editing
- The GitHub view no longer shows the list and grid switch, which did nothing there

### Removed

- Cloud sync through Synology Drive, OneDrive, Dropbox and iCloud Drive: cloud locations in Settings, Sync to, Download, Sync now, Stop syncing, the Cloud projects view and the banner saying a project is also open on another computer. Projects and settings go between computers through GitHub instead
- On its first start, 2.0 stops mirroring. Mirrored projects become ordinary projects on this computer, and their copies in the cloud location are left as they are. A notice on the projects page names them, lists the files a copy has that this computer never received with Show in Finder and offers Move to this computer… for projects used in a sync app's folder, which keep working where they are. Before updating, open 1.10.4 on each computer and wait until it shows Synced
- This computer's name is now under Your other computers in Settings › Projects

### Fixed

- Web search and Find citations for selection could add a paper the project already had under a second key, and wrote the whole `.bib` again while a references chat could be adding to it. Every add now goes through the references chat's look-up, which finds a paper already in any `.bib` by its DOI, arXiv ID or title
- A web search took only the first connection that answered, and its results were lost when Tools was closed
- Document insights follows document reading order, refreshes after compilation and file changes and handles multi-row equations and publication punctuation
- Presentation mode keeps a valid page when recompiling a shorter deck
- Compiles that produce a PDF with errors cannot replace a successful compile checkpoint
- Circuit previews crop to their drawing, including unchanged diagrams saved by the earlier composer, and use the measured symbol endpoints
- The composer preserves hand edits and damaged drawing metadata, refuses stale exports and keeps newer edits when an AI fix arrives late
- Failed diagram saves block closing, switching or quitting after the failure is reported, so the work stays open for another save attempt
- A long local agent turn keeps its start, since its streamed pieces are joined before they are stored, and a session the agent loads again no longer stores its conversation twice

### Security

- latexmk always runs with `-norc`, so a project's own `latexmkrc` cannot run code
- Circuit symbol options reject TeX's encoded command escapes as well as literal commands
- Preview PDF compiles a local agent's copy inside the agent's isolation on macOS, reading only that copy, into Spectrum's cache. On Windows it reads only the copy with MiKTeX or TeX Live 2025 or earlier and without shell escape, and makes no preview with TeX Live 2026 or later, which can no longer limit what a compile reads
- A skill added with Add folder takes regular files only, and Share skills never replaces anything already in an agent's folder and removes only its own links

### Going back to 1.10.4

- 1.10.4 opens every project 2.0.0 has used. The new data is in files 1.10.4 does not read: `.spectrum/settings.json` and the `.spectrum/todos`, `.spectrum/notes` and `.spectrum/research` folders, which it leaves as they are. Checkpoints keep their storage in `.spectrum/history`, so 1.10.4 lists every checkpoint as a version, with the compile checkpoints as manual ones
- Spectrum agent threads are chats in `.spectrum/chats` with an `agent` mark that 1.10.4 ignores, so 1.10.4 lists them with the other chats. A project's skill choices are kept in `.spectrum/settings.json`
- 1.10.4 rewrites `project.json` through its own list of keys, so nothing new is kept in it. 2.0.0 keeps the keys in `project.json` it does not know, so a file another version wrote comes through a save here whole
- 2.0.0 only reads 1.10's mirror records, its `sync.json` and the copies in the cloud locations, and never writes or deletes them, so going back to 1.10.4 resumes mirroring from the last state both copies agreed on. Edits made in 2.0.0 go to the cloud copy, edits from a computer still on 1.10.4 come in after a Before sync checkpoint, and a file changed on both is merged. 2.0.0 keeps this computer's name in its own `computer.json`, so a name changed in 2.0.0 is not carried back
- A project on GitHub has a `.git` folder, which 1.10.4 leaves out of its file list, checkpoints and mirroring, and its GitHub link is in `.spectrum/settings.json`. Spectrum reads 1.10.4's mirror records to Link a mirrored project but never writes them
- A project's Zotero collection is recorded in `.spectrum/settings.json` too, and Zotero's permission in `zotero.json` in the app's data folder, which 1.10.4 does not read

## 1.10.4 (22 October 2026)

### Added

- The app's version is shown beside Settings at the bottom of the projects page sidebar

## 1.10.3 (20 October 2026)

### Fixed

- AI template conversions retain source titles, authors and dates in the preamble and PDF properties, including during compile and layout repair
- Copied source bibliographies are connected to their actual destination paths after filename collisions, for both LaTeX and PDF conversion
- Quick template switches preserve custom bibliography paths and replace classic bibliography commands when moving to biblatex
- Australian English templates use an explicit APA language mapping
- Biber failures remain failed compiles even when a later TeX pass produces a PDF; PDF conversion refuses an unsuccessfully compiled source

## 1.10.2 (20 October 2026)

### Fixed

- Long bibliography URLs wrap within the page in every built-in template, including APA 7 and conference layouts
- Generated webpage references print the URL once, with compatibility for classic BibTeX styles that do not support the URL field
- Reference imports recover missing authors from matching on-page BibTeX exports, including alphaXiv; partial scholarly metadata can use configured search fallbacks
- Reference text and fallback citation queries use pylatexenc for TeX decoding; HTML entities use the complete standard entity set
- Shared escaping preserves literal backslashes, carets and tildes in project titles; comment handling is consistent across editor and backend tools
- Model JSON validation uses Zod and rejects invalid answers after all retries instead of accepting malformed layout results

### Changed

- Consolidated duplicate JSON extraction and template transfer outline helpers; documented the helper review in `docs/HELPER_REUSE_REVIEW.md`

## 1.10.1 (20 October 2026)

### Added

- Multiple search connections, a default search choice, and automatic fallback across enabled connections
- General web search in read-only chat and citation-focused search for references and research
- Verified native model web search for supported OpenAI and Claude APIs; unsupported models use configured fallback connections
- A simple A4 document template based on an 11 pt article with 25 mm margins and one-and-a-half line spacing

### Fixed

- Reference imports read JSON-LD authors, publishers and complete publication dates, including Business Insider's article metadata
- Blocked pages can use configured search connections; API keys stay with their own provider
- Imported titles use LaTeX quotation marks while preserving apostrophes, and arXiv references retain their canonical URL alongside the DOI
- Every shipped template uses APA 7 with Biber, including the conference template adaptations

## 1.10.0 (19 October 2026)

### Added

- An Agents tab with local ACP launcher profiles, private session history, streamed activity, permission/question controls, agent-provided settings, cancellation, and file review
- Native macOS and Windows isolation for agent processes and commands, with a separate project copy by default and optional direct editing
- Immutable review proposals, text/binary/create/delete handling, conflict checks, complete application journals and recovery of interrupted changes
- Explicit copying of supported agent login files and local API-key setup; no global agent configuration is changed
- Experimental launcher profiles for Pi, DeepSeek Harness and ZCode; WorkBuddy remains planned through official interfaces with later remote support

### Fixed

- Agent and terminal processes finish before review changes are captured
- Windows source runs select the Windows spelling module, and SyncTeX navigation handles legacy ANSI filenames alongside UTF-8 paths

### Compatibility

- Native containment and the fixture ACP lifecycle are checked on macOS and Windows; the installed OpenCode handshake is checked on macOS. Inference/account compatibility across every agent is not certified
- OpenCode 1.19.3 and the Codex, Claude Agent, Pi and ZCode adapters are disabled on Windows while runtime compatibility is unresolved; other Windows vendor launchers remain unverified. See [Windows validation](docs/WINDOWS_AGENT_VALIDATION.md)
- The universal Mac app is ad hoc signed and not notarized. The Windows x64 installer is unsigned, and an installed Windows GUI walkthrough has not been performed

## 1.9.2 (18 October 2026)

### Fixed

- When a sync app leaves out folders whose names start with a dot, such as a Synology Drive task with a "`.`" prefix rule, a cloud location's projects arrive without their `.spectrum` folder and did not show anywhere. Cloud projects now names those folders, says the sync app is probably skipping hidden folders and warns not to open them as new projects

## 1.9.1 (18 October 2026)

Version 1.9.0 was a test build only, so this is the first release with these changes.

### Added

- A tag can be renamed and given a colour by right-clicking it in the sidebar of the projects page. Renaming a tag changes it on every project that has it, and the colours follow you to your other computers with your settings
- Cloud locations in Settings under Projects, in place of Synced project folders: a folder that OneDrive, Dropbox, Synology Drive, iCloud Drive or any other sync app keeps the same on each computer. Spectrum suggests a `Spectrum` folder in each sync app's folder it finds, or that folder itself when a computer with 1.8.0 already shares through it
- Sync to in a project's menu puts the project in a cloud location. By default the project stays on this computer and Spectrum mirrors it into a copy there, merging a file changed on both computers line by line and keeping a conflicted copy beside it when both changed the same lines. When a project syncs, in Settings, can move the folder into the cloud location instead, as 1.8.0 kept its projects
- Cloud projects in the sidebar, between All projects and Archived. Each cloud project has a cloud symbol and says how it stands, with Sync now, Stop syncing… and Show cloud copy in Finder (or File Explorer) in its menu. The projects your other computers put in a cloud location show there too, with Download
- Stop syncing… keeps the project on this computer and keeps or deletes the copy in the cloud location. Delete is refused while the two copies are not yet in step or another computer has the project open, works on that copy itself or runs 1.8.0. Move to Bin on a moved project is refused for the same reasons, as it deletes the project on the other computers too
- A version named "Before sync from" and the other computer's name (the cloud location's when several computers share the project) is saved before a sync replaces or deletes files in a mirrored project, at most every 10 minutes when the files only came from the other computer. A sync that would delete many files at once waits for Sync anyway
- Project folders: projects can be sorted into nested folders under All projects, by dragging them there or with Move to folder…. The folders follow you to your other computers with your settings

### Changed

- New projects always go into the default folder for new projects, never into a cloud location, and only the projects you sync leave this computer. The default folder can no longer be set to a folder in a cloud location. One set to a synced folder in 1.8.0 stays as it is, so new projects there are cloud projects used in place until you choose a folder on this computer
- A project in a cloud location is no longer added to the list by itself: Download adds it. The projects 1.8.0 kept in its synced folders stay where they are and show as cloud projects
- Each computer tells the others about its cloud projects in every cloud location, not only the first, so Stop syncing on any computer knows which others still need the copy there
- On a Mac with iCloud's Desktop and Documents folders turned on, projects in them count as in iCloud Drive
- Long folder paths wrap in Settings and in New project rather than being cut off
- A leading `~` is left out of new folder names, as Synology Drive skips such folders and OneDrive refuses some of them

### Removed

- The greyed-out "Only on <computer>" rows for the projects another computer has that this one does not. A computer's own projects now stay private to it, and the cloud projects another computer adds show in Cloud projects instead

### Going back to 1.8.0 or 1.7.0

- Everything stays readable by 1.8.0 and 1.7.0. The mirror's records are in new files that neither reads, and project folders and the sync mode are settings both keep without using
- 1.8.0 lists a mirrored project at its folder on this computer, not its copy in the cloud location, and a moved project in the cloud location. Mirroring stops until this version runs again, which then brings the changes made on both copies together. A cloud location is a synced folder to 1.8.0, so it lists the projects there as before, and after going back new projects go into the first cloud location unless Default folder for new projects is set
- 1.7.0 lists mirrored and moved projects at their folders. Mirroring stops there too, and projects added on the other computer need Open existing folder
- Stop syncing with Delete is refused while a computer with 1.8.0 uses a cloud location, as 1.8.0 leaves its archived projects out of the list it shares. 1.7.0 shares no list at all, so before deleting a cloud copy, check that no computer with 1.7.0 uses it

## 1.8.0 (17 October 2026)

### Added

- Projects in a sync folder (Synology Drive, OneDrive, Dropbox, iCloud Drive) can be used on two computers. Synced project folders in Settings under Projects lists where your projects are; Spectrum suggests the sync folders it finds and lists the projects in them, so a project made on one computer appears on the other
- The projects page shows where each synced project lives, says when one is not on this computer yet, and greys out the projects only another computer has
- A file changed on the other computer reloads in the editor, or, with unsaved edits here, asks whether to keep this computer's text or the other's, keeping the other in a version. A file deleted on the other computer is marked in its tab
- A banner when the project is also open on the other computer, and handling of the conflict copies sync apps make: Compare, Use this copy and Delete copy
- Versions and chats made on either computer appear on both, and your own templates and settings (not API keys) follow you through the sync folder

### Changed

- A compile writes only the PDF into the project folder. SyncTeX data, the kept `.aux` files and the thumbnail are kept in the app's own data folder on each computer
- Spectrum writes the project's details file less often, and folder names follow the Windows rules on every computer

### Going back to 1.7.0

- Everything stays readable by 1.7.0: projects, versions, chats, templates and settings keep their formats, and the new data is in new files 1.7.0 ignores. After going back, synced projects show their full path, projects added on the other computer need Open existing folder, and versions made by this version show with longer numbers
- In a synced project, avoid deleting versions on a computer running 1.7.0 until this version has opened the project's history there since the last sync, so 1.7.0's clean-up never removes files the other computer's versions use

## 1.7.0 (17 October 2026)

### Added

- Seven templates: Maths notes, Electronics notes, Coding report, Report or thesis, Formal letter, Slides and Academic CV. Every package they load has a short comment saying what it does, and all of them load `hyperref` and `parskip` (Beamer handles both itself in the slides). They are A4, in Australian English, and compile with pdfLaTeX, XeLaTeX, LuaLaTeX and Tectonic
- Templates can be edited. Edit template in a template's menu opens a working copy in the editor, with Save template, Save as new template and Done. Any project can be saved as a template too. Your own templates can be deleted, and an edited built-in template can be put back with Restore original
- Exa and DDGS web search. Exa searches its publications category for research questions and the whole web for LaTeX questions; DDGS searches several engines at once with no key, through the Python `ddgs` library
- Ollama, for models on your own computer or network with no key and the model list read from Ollama itself, and Ollama Cloud with a key
- Meta's Muse Wonder 1.0 (a preview) and Muse Spark 1.1, next to Muse Spark 1.3 and 1.2

### Changed

- Every web search provider now favours sources that can be cited: OpenAlex searches only scholarly works, SerpApi uses Google Scholar for new settings, and Tavily and Brave prefer arXiv, publishers, proceedings, standards bodies, CTAN and TeX Stack Exchange. Results show their authors, year and venue, repeats across the searches are merged, and BibTeX is built from each result's metadata, with DOI and arXiv links looked up for full entries
- Each search provider keeps its own key, so a key is only sent to the provider it was entered for
- The template gallery lists notes, reports, letters, slides and the CV first, and the conference templates under Academic, no longer featured. Their preambles have a comment on each package, with nothing else changed
- The built-in templates you have not edited follow app updates; edited ones keep your version
- The Meta provider is called Meta rather than Meta Muse Spark
- A model server at a plain `http://` address needs no API key

### Fixed

- A typed ’ or accented letter no longer goes missing in the PDF when the letter, coding report, report, slides or CV template is compiled with XeLaTeX, LuaLaTeX or Tectonic

## 1.6.0 (16 October 2026)

### Added

- Double-clicking a `.tex`, `.ltx` or `.bib` file in Finder or File Explorer opens it in Spectrum, in the project it belongs to. A file from a folder Spectrum has not seen yet opens together with the folder holding its document, which becomes a project. On macOS Spectrum makes itself the default app for these files the first time it opens, and Settings under Projects can do it again. On Windows the installer offers Spectrum for these files. PDFs are left alone
- Links in the PDF work. The contents, `\ref`, `\eqref` and `\cite` jump to the spot they point to, a web address opens in the browser and a reference into a linked document (`xr-hyper`) shows that document's PDF at the place it names
- While a compile runs, Compile becomes Stop, which ends it at once and keeps the last PDF
- The file list follows the project folder, so a file added, removed or renamed outside Spectrum shows up straight away

### Changed

- The PDF's table of contents goes to each section rather than to the top of its page

## 1.5.1 (16 October 2026)

### Fixed

- The `.aux` files kept for cross-references are now in `.spectrum/aux-files` instead of `.spectrum/aux`. OneDrive refuses to sync a folder named `aux`, which is a reserved name on Windows, and asked to rename it in every project that had one. Spectrum removes the old folder when it starts, and a linked document is compiled once more to rebuild its files

### Changed

- Windows' `Thumbs.db` and `desktop.ini` are hidden from the file list and left out of imports
- The Windows installer is the 1.5.0 build, which already kept these files in `.spectrum/aux-files`, so it still reports version 1.5.0

## 1.5.0 (15 October 2026)

### Added

- A Windows version for x64 PCs, as a preview, installed with `Spectrum_1.5.0_x64-setup.exe`. It has the standard Windows title bar, Microsoft's Fluent UI System Icons, `Ctrl` shortcuts, File Explorer and the Recycle Bin, and works with MiKTeX, TeX Live and Tectonic. It is built and tested on GitHub Actions

- Compiling a document other than the main file. When a project holds more than one document (a `.tex` file with its own `\documentclass`), the menu beside Compile lists them above the compilers, and choosing one compiles it once without changing the main file. `⇧⌘↩` compiles the open file when it is a document of its own and the main file otherwise. Compile and `⌘↩` still compile the main file
- Cross-references between documents with `xr` or `xr-hyper` (`\externaldocument`) and `zref-xr` (`\zexternaldocument`). The `.aux` files of each document are kept in the hidden `.spectrum` folder after a compile, so a document that links to another finds its labels with every compiler. A linked document that has not been compiled or has changed since is compiled first
- The page bar at the bottom of the PDF names the PDF that is showing when there is more than one, by the part of its name the others do not share, and switches between them. A document's PDF in the file list opens in the PDF column too, and double-click jumping works in each PDF
- Completion of the labels of a linked document with its prefix, so `\ref{notes:` lists the labels of the notes. Completion also follows the open document when it is a document of its own, so its packages, commands and labels are listed rather than those of the main file

### Changed

- SyncTeX data is kept for each document, so compiling one document no longer stops double-click jumping in another, and choosing another main file keeps it. After updating, each document needs one compile before jumping works again
- The compile log names the document that was compiled, and a linked document that fails to compile shows as a warning

## 1.4.0 (12 October 2026)

### Added

- A view switcher at the top right of the window, as in Texifier, that shows the editor only, the editor and the PDF side by side, or the PDF only, also with `⌘1`, `⌘2` and `⌘3`. The choice is kept, and the split width comes back with the split. The hidden side stays loaded, so undo, the scroll position, autosave and the PDF carry on
- In editor only, the compile status shows in the editor's bar
- Double-clicking the PDF jumps to the line of the source that made it, opening another file when needed, and double-clicking a line of the source scrolls the PDF to it. Every compile now writes SyncTeX data for this, with pdfLaTeX, XeLaTeX, LuaLaTeX, Latexmk and Tectonic, and Spectrum reads it itself. In PDF only, a double-click switches to the split so the source shows. Without SyncTeX data, a double-click on the PDF falls back to matching the text
- The spot a jump lands on is marked with a highlight that fades after a few seconds. Its colour (yellow by default, or the accent, green, pink, blue or any colour) and how long it stays (1 to 10 seconds) are set in Settings under Editor, where double-click jumping can also be turned off

### Changed

- A single click on the PDF no longer jumps to the source; a double-click does
- The review sheet for AI changes and the version comparison show only the changed parts, with three lines around each and the unchanged stretches folded into rows that open in place (Show whole file shows everything). An edited line sits beside its replacement and only the words that changed are marked, and both sides scroll and wrap together, so long files no longer slow the sheet down

- Opening Tools, Grammar, the assistant or a chat, or anything that needs the cursor, from a single view switches back to the editor and PDF side by side. In PDF only, clicking the page doesn't jump to the source, so reading isn't interrupted
- In a narrow PDF column, the labels of Save version and the zoom menu fold away earlier to make room for the switcher

## 1.3.1 (12 October 2026)

### Added

- Typing `$` with text selected puts the text in maths (`$…$`) and keeps it selected, in the same way as `(` brackets a selection. With nothing selected, `$` is typed as before

## 1.3.0 (12 October 2026)

### Added

- Completion that follows where the cursor is. In maths (`$…$`, `\(…\)`, `\[…\]` and the `equation`, `align` and `gather` families) it lists maths commands such as `\vec`, `\lambda`, `\frac`, `\sum` and `\mathbb` with their symbols, and `\label` and `\tag` only in displays that take them. In text it lists text commands, with the preamble's own commands only before `\begin{document}`. Commands from packages appear once the package is loaded, and the project's own `\newcommand` and `\DeclareMathOperator` commands are included
- Inside braces, completion lists the project's labels after `\ref{` and its kin, BibTeX keys with author and year after `\cite{` and its kin, packages, classes and bibliography styles, and the project's images and `.tex` and `.bib` files after `\includegraphics{`, `\input{`, `\include{` and `\bibliography{`
- Commands with arguments insert with fields, and `Tab` moves to the next one
- A Floats tab in Tools with Insert figure and Insert table. Insert figure saves a dropped, pasted or chosen image in `images/` and inserts it as a figure with a caption, a label, a width and a placement; an image dropped on the editor opens it too. Insert table builds a `tabular` or `tabularx` from a grid that takes pasted spreadsheet cells, with booktabs, grid or minimal lines and a live preview. The packages they need are added to the preamble when missing
- Placement letters that combine (`h`, `t`, `b`, `p` and `!`), or `H` on its own as the default, each explained in the tab, and a Span both columns option for `figure*` and `table*`

### Changed

- The Figures tab in Tools is now Floats: Insert figure, Insert table, Project figures, Table to chart and Image to LaTeX. Inserting a project figure goes through Insert figure, so its options apply
- Environments are listed once `\beg` is typed, so `\ve` no longer offers `\begin{verse}`, and `\begin{` in maths offers only the environments that work there. `\end{` offers the open environments
- A command name only matches commands that contain it, and three letters that match none list the environments they start, so `\ali` offers `\begin{align}`
- The `/` shortcut for commands works in text only, since `/` divides in maths
- Uploads into a folder keep the folder

## 1.2.1 (12 October 2026)

### Fixed

- The app icon at the top of the sidebar sat almost against the window buttons. It now keeps 16 points from them, the same distance it keeps from the edge of the window in full screen

## 1.2.0 (12 October 2026)

### Added

- `\begin{` completion lists every common environment, including `equation*`, the `align` and `gather` families, the matrices, `figure*`, `table*`, `tabular` and `minipage`, followed by the environments of the packages and classes the project loads and the ones it defines itself with `\newtheorem`, `\declaretheorem`, `\newtcolorbox`, `\newenvironment` and similar commands. Each entry says where it comes from and inserts its usual arguments, such as `{lcc}` for `tabular` and `{2}` for `alignat`. The project is read from the main file through `\input`, `\include`, `\subfile` and `\import` and its own `.sty` and `.cls` files, in the same way as the compiler finds them
- Editor themes, chosen separately for light and dark mode, so any light theme goes with any dark one: Spectrum, GitHub, One, Solarized, Xcode, Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula and Alucard, Monokai, Rosé Pine, Ayu and Texifier-like and Overleaf-like themes, each with a preview in Settings. Any colour of a theme can be changed for each mode and reset afterwards
- A choice of editor font, from the Mac's own fonts (SF Mono, Menlo, Monaco, PT Mono, Andale Mono and Courier New), four bundled open-source fonts (JetBrains Mono, Fira Code, IBM Plex Mono and Source Code Pro) or any installed font by name
- Accent colours in Settings under Appearance: Follow macOS, Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite or a custom colour
- A see-through window, with Liquid Glass on macOS 26 and later and the system blur before that, and a Clarity slider that sets how much of the desktop shows through. The editor and the PDF always stay readable
- A page colour for the PDF in each mode: White, Cream, Sepia or Grey in light mode and Dark, Black, Dimmed or White in dark mode, set in Settings or from the PDF's More menu
- Six more PDF parsers for template transfer besides MinerU: Mathpix, Mistral OCR, Datalab (Marker), LlamaParse, PaddleOCR-VL and Docling, plus Other for a self-hosted or compatible server. Each has its own address and key, and a key is only ever sent to the address it was entered for
- A Save version button beside Compile, also on `⇧⌘S`, which saves a version at once and offers Rename in the notice that follows. Versions are still saved automatically before AI changes are applied

### Changed

- Highlighting colours environment names and the keys and paths of labels, references, citations, files and packages
- The sidebar icon, the header and the editor tabs move with the window when it goes in or out of full screen, instead of jumping once macOS has finished
- The files a PDF parser reads and writes during a template transfer are kept in the new project's hidden `.spectrum` folder instead of in visible folders
- The `.env` MinerU token is only sent to the MinerU address in the `.env` file or to MinerU's own address

### Fixed

- `\%` was coloured as the start of a comment and `\$` started maths in the highlighting
- The `/` shortcut for commands listed nothing
- The label of the "Insert `\cite`" option in Settings put each part on its own line

## 1.1.3 (12 October 2026)

### Changed

- With the completion list open, `Tab` fills in as much as the listed entries share, so `\beg` becomes `\begin{` and the environments stay listed. When there is nothing more to fill in, `Tab` picks the highlighted entry, as Return does. Before, `Tab` added spaces and closed the list
- The environment list stays open after `\begin{`, so the name can be typed or picked from it, and picking one replaces a `}` already after the cursor instead of leaving it behind

### Fixed

- After leaving full screen, the app icon stayed in the top left corner, on top of the window buttons, until the app was restarted. The window now waits until macOS has finished leaving full screen before moving it back

## 1.1.2 (12 October 2026)

### Changed

- In full screen, where macOS hides the window buttons, the app icon moves to the top left corner, and with the sidebar hidden the header and editor tabs move left too, instead of leaving room for buttons that aren't there

## 1.1.1 (12 October 2026)

### Changed

- `Tab` indents at the cursor by four spaces, as other LaTeX editors do, and indents the selected lines when there is a selection. Indents are four spaces instead of two
- The rows of a wrapped line start under the line's own indent, four columns in, instead of at the left edge
- Long formulas break between terms, after `=`, `+`, `&` and commas and before `\cdot`, `\approx` and similar, instead of in the middle of a command such as `\vec{b}`
- Pressing Return straight after `\begin{…}` adds the matching `\end{…}` at the same indent, with the cursor on an indented line between them, unless the environment is already closed

### Fixed

- The `\begin{…}` completions and the Insert menu snippets put `\end{…}` at the start of the line instead of under `\begin{…}` when used on an indented line

## 1.1.0 (11 October 2026)

### Added

- Spell checking as you type in Australian English, using nodehun (Hunspell) with SCOWL en_AU-large and the Australian words from AussieDic. American spellings are still flagged, and offensive words are never suggested. Right-clicking a misspelt word offers suggestions, Add to dictionary, Add to project dictionary and Ignore
- A grammar check in Australian English, using Harper. The button beside the assistant button, or `⇧⌘;`, shows its results in place of the PDF, where each issue can be fixed with one click, ignored or turned off for the project
- A Spelling & grammar section in Settings, with switches for spell checking and style suggestions, the serial comma setting (flagged by default, following the Australian Government Style Manual) and the personal dictionary
- One LaTeX reader for both checkers, so commands, maths, comments, keys and code are skipped while the prose in headings, captions and footnotes is checked
- THIRD_PARTY_NOTICES.md, listing the licences of everything Spectrum includes

### Changed

- A full stop or comma at the end of a wrapped line now hangs past the edge instead of moving to a line of its own

### Security

- The application is allowed to load libraries that are not signed by Apple or a developer team, which the spell checker's add-on needs

## 1.0.1 (11 October 2026)

### Added

- Pinch to zoom the PDF on a trackpad, and `⌘` with the scroll wheel on a mouse. The point under the fingers stays in place, and the pages are drawn sharp again once the pinch ends
- Keyboard shortcuts to zoom the PDF in and out (`⌘=` and `⌘−`) and to fit it to the width (`⌘0`), which can be changed in Settings
- Dark pages in dark mode, so the PDF matches the rest of the window. They can be turned off from the PDF's More menu

### Changed

- The PDF zoom is kept between launches, Fit width is the default and Zoom to fit is now called Fit page
- The pages sit closer to the edges of the PDF column, so Fit width shows them larger
- The zoom buttons step by a tenth of the current size, the same way a pinch scales
- The editor's lines are closer together

## 1.0.0 (11 October 2026)

### Added

- A native macOS application built with Tauri. It is a universal binary for Apple silicon and Intel, includes its own Node.js runtime and is distributed as a DMG
- Projects stored as ordinary folders chosen by the user, with `~/Documents/Spectrum` as the default location. Existing LaTeX folders can be opened in place, and moved folders can be located again
- A hidden `.spectrum` folder in each project for its settings, version history, saved chats and build files, which keeps the project folder itself clean
- Version history with manual versions, optional labels, comparison with the current files and restoring of the whole project or a single file. A version is saved automatically before AI changes are applied, before a restore and before a template change
- A references chat that turns a DOI, link, arXiv ID or title into a BibTeX entry with an AuthorYear key (for example `Vaswani2017`) and adds it to the project's `.bib` file. Clashing keys get a letter suffix and duplicates are detected by DOI, arXiv ID and title
- An assistant chat over the editor with Ask and Edit modes, quick actions on the selection, image to LaTeX attachments and a reasoning effort setting. Chats are saved per project
- A Tools panel with project information (word counts from `texcount`, or an estimate when it is not installed), versions, compile logs with Fix with AI, research, AI review and figure tools
- Provider presets for OpenAI, Anthropic Claude, Google Gemini, OpenRouter, DeepSeek, Moonshot Kimi, Z.ai GLM, Alibaba Qwen and Meta Muse Spark. Choosing one fills in the endpoint, a recommended main, quick and vision model and the recommended reasoning effort, and each provider's key is kept when switching
- Reasoning effort from Off to Max, limited to the levels the chosen model accepts and sent in the form each provider expects. Claude is called through Anthropic's Messages API and OpenAI through the Responses API, so the effort also applies when the assistant edits files
- Separate provider, model and key settings for the quick model, used for autocomplete and for splitting pasted references, and for the vision model. Both use the main model's provider by default and can be moved to any other provider. The quick model replaces the references model setting
- Customisable keyboard shortcuts in Settings, including indent and unindent lines, move and duplicate lines, delete lines, multiple cursors, go to line, folding and bold, italic and emphasis. Clashing shortcuts are marked and shortcuts that macOS keeps are refused
- Light, dark and system themes, and a setting for the default compiler
- An Auto compile setting that reads the `% !TEX program` comment and the packages in use, and support for Tectonic as a compiler
- PDF thumbnails, list and grid views, tags and archiving on the projects page
- A System section in Settings that checks which TeX tools, biber and Python are installed and whether they actually run
- Search providers for the web search tool (OpenAlex, Semantic Scholar, SerpAPI with Google, Google Scholar or Baidu, Tavily and Brave), alongside the model's own search
- A citation assistant that finds papers supporting the selected passage
- A Quick switch template change that keeps the document body without using AI
- Backend tests for projects, versions, chats, compiling, references and the local-only access rule

### Changed

- The interface has been redesigned around a sidebar, a rounded content panel and a floating chat, with SF Symbols icons and SF fonts
- The interface is in Australian English only
- The tool agent calls the OpenAI-compatible API directly instead of going through LangChain, and requests are retried without `temperature` or `reasoning_effort` when a model rejects them
- The compiled PDF is written next to the main file, while auxiliary files stay in the hidden build folder
- All dependencies have been updated (Fastify 5, Vite 8, PDF.js 6, React Router 7, LangGraph 1 and others)
- Compile runs have time limits, with longer limits for Tectonic's first-use downloads and for Latexmk
- The default model is now GPT-6 Sol, and temperature is left at each provider's default for the presets
- The tool agent sends each reply back to the model in full, which DeepSeek, Kimi and Gemini need for reasoning between tool calls
- Saving a file replaces it in one step, so a crash during a save cannot leave half a file
- Quitting or closing the window saves open edits first and stops any running compiler
- The window background follows the theme, so it no longer flashes white in dark mode
- Start conversion only warns when no key is set in Settings, since the key can also come from the `.env` file

### Fixed

- Deleting the file that was open in the editor crashed the editor
- `⌘/` did not toggle LaTeX comments
- AI autocomplete never detected the current environment
- Compiling used the last autosaved content instead of what was on screen, and downloaded every binary file in the project on each compile
- Bibliographies using biblatex never compiled, because biber was told to look for its control file in the project folder instead of the build folder
- A main file inside a subfolder could not find the files it included with pdfLaTeX, XeLaTeX, LuaLaTeX or Latexmk. Compiling now starts from the main file's folder, as TeXShop, LaTeX Workshop and Tectonic do, and paths written relative to the project root still work
- Template conversion and transfer to the ACL template failed, and the arXiv template was missing from the gallery
- Importing from arXiv failed for single-file papers and gave an unclear error for papers without LaTeX source
- The layout check in template transfer never received the page images, so those jobs never finished
- Requests over 1 MB, such as large files and layout check images, were rejected
- The web search summary was inserted after `\end{document}`, and the table to chart tool replaced the selected table
- `npm start` did not exist and the documented `.env` file was never read
- Menus and drop-downs did not close when clicking elsewhere
- The outline lost headings with nested braces, such as `\section{Bib\TeX{} Files}`
- Cancelling an arXiv import still downloaded the paper and added the project
- Quick switch could overwrite the project's `.bib` file and wrote the merged document to a new `main.tex`
- Opening a folder that holds or sits inside another project, or the projects folder itself, was allowed
- A project without a `.tex` file opened its first file even when it was very large
- New files and new `.bib` files could replace an existing file whose name differed only in case
- Some text in dark mode did not have enough contrast
- The layout check in template transfer sent page images to the main model even when it reads text only, and a failed check deleted the converted project. It now uses the vision model and is skipped if the model cannot look at the pages

### Removed

- Real-time collaboration, invite links and public tunnels
- The Chinese interface and the language switch
- The landing page, the soft-delete Trash view and the unused bulk selection
- The unused SwiftLaTeX WebAssembly engine

### Security

- Updated dependencies, which reduced the reported advisories from 43 (4 critical) to none, including path traversal through crafted tar archives and code execution through crafted PDFs
- The server only accepts requests from the same computer and refuses requests from other websites and DNS rebinding. Upstream allowed any website to call the API and treated every visitor through a tunnel as local
- Project and template identifiers are validated so they cannot reach files outside their folders
