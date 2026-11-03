# Performance and Rust: where Spectrum spends its time

3 November 2026. Spectrum 2.1.0, measured on scratch data on an Apple M2 Pro with 16 GB of memory.

## 1. Summary and verdict

| Question | Answer |
| --- | --- |
| Where does compile time go? | Into the TeX or Typst engine. Spectrum's own share is 17 to 151 ms of compiles that take 0.38 to 7.7 s, which is 1 to 4 per cent. Turning compile checkpoints on adds another 0.45 to 0.7 s on a project of 1,800 files. |
| Where does Spectrum itself lose time? | In the editor, not the backend. The editor decodes each compiled PDF from base64 with a slow idiom (0.12 to 0.76 s for a 2.7 MB PDF), reads every text file of a project with a request each when it opens (563 requests for 1,800 files) and re-renders React on every keystroke (about 20 ms a key, whatever the file's size). |
| Is the backend slow? | No. A tree of 1,786 entries takes 13 ms, a save 1.4 ms, a spelling check 3 ms and a project scan of 20,000 files 25 ms. Over six large compiles lasting 80 s, the backend used 1.2 s of CPU, most of it loading its own modules at start. |
| Was Oleafly built on Rust? | Partly. Its desktop backend is Rust (354,000 lines), but it has more TypeScript (325,000 lines of code and 369,000 of tests) and the same frontend stack as Spectrum: React, CodeMirror 6 and pdf.js. It runs Tectonic, Typst and pandoc as separate programs and Git through the `git` program, as Spectrum does or could. Its spelling and grammar run as WebAssembly in the web view. |
| Would Rust make Spectrum faster? | Only marginally. Every large cost measured here is fixed more cheaply in JavaScript, and the engines that dominate compiles are already Rust (Tectonic, Typst) or C (pdfTeX). |
| **Verdict** | **Do not rewrite the backend in Rust.** Fix the eight JavaScript hot spots in Section 6 first, which saves more time than a rewrite would. Use Rust where it brings something JavaScript cannot: Spectrum Lite on tablets (where nothing but Rust can run beside the web view) and possibly Typst compiled in process later. A full rewrite would cost roughly 35,000 to 60,000 lines of Rust and six to twelve months. It would still need Node for the agents, and it would save only about 0.3 s at launch and 100 MB of memory. |

The five largest measured gains, in order of benefit for effort,

1. decode the PDF with `Uint8Array.fromBase64` or fetch it as binary: 0.12 to 0.76 s saved on every compile of a 500-page document, a one-line change,
2. read the project's text files in one batched request on open, as Oleafly does: 563 requests in 0.82 s become one, and at least 1,435 requests over 4.5 s in a 20,000-file project,
3. stop hashing every file sequentially for each checkpoint: about 0.45 s saved on each compile with checkpoints on in a 1,800-file project,
4. stop re-rendering the editor page on every keystroke and re-masking the whole document for spelling after each pause: about 20 ms a key and a 65 ms stall on a 1.2 MB document,
5. keep Typst running between compiles (`typst watch`, or the Tinymist server already shortlisted): a 302-page document recompiles in 0.23 s instead of 1.53 s.

## 2. Method

**What was run.** The backend ran from source with scratch folders for `HOME`, the data, the projects, the templates and `TMPDIR`, as the brief describes, on ports 48787 and 48799. For start-up it was also bundled with the release's own esbuild settings (from `scripts/desktop.mjs`) into the scratch folder and run as `server.mjs`. Projects were made through `POST /api/projects` from the `simple-document`, `report-thesis`, `typst-document` and `neurips` templates, and generated projects were opened with `POST /api/projects/open-folder`.

**Generated projects.**

| Project | Files | Words | Pages | Notes |
| --- | --- | --- | --- | --- |
| mid-latex | 23 | 14,500 | 58 | 3 chapters, `\include`, natbib with 400 BibTeX entries |
| big-latex | 1,712 (1,786 entries with folders) | 141,000 | 533 | 30 chapters with figures, labels and citations, plus 1,500 data, note and image files |
| big-typst | 1,711 | 140,000 | 302 | The same in Typst |
| long-single | 33 | 141,000 | 529 | big-latex's chapters in one 1.16 MB `main.tex` (3,460 lines) |
| huge | 20,000+ (20,285 entries) | | | big-latex with 20,000 extra files, for scans and opening |

The LaTeX book class starts each chapter on a right-hand page, so its 141,000 words give 533 pages where Typst gives 302.

**How compile overhead was separated.** Small shell wrappers for `pdflatex`, `bibtex`, `biber`, `tectonic` and `typst` were put first on the backend's `PATH` (and in `SPECTRUM_TECTONIC` and `SPECTRUM_TYPST`). Each records its program's wall time with `/usr/bin/time`. Overhead is the request's time less the summed engine time. Medians of three runs after a warm-up are reported. The engines were Tectonic 0.17.0 and Typst 0.15.1 (the same versions as the built-in ones) and pdfTeX from TeX Live 2026.

**Profiles.** `node --cpu-prof` profiled start-up and a run of six large compiles. The frontend was driven in the built-in browser pane against the scratch server, with the Event Timing and Long Tasks APIs and `performance.memory`. Fastify's request log gave the requests made when a project opens.

**Limits.** The browser pane was hidden while it ran, so the page counted as a background tab: CPU times there are upper bounds and timer-based numbers were not used. The PDF decode was therefore also timed in Node, which uses the same V8 engine. pdf.js was timed in Node without drawing to a canvas. LanguageTool (Java) is not installed here and was not measured, and TexLab was not measured. File caches were warm, the content is synthetic and there was one machine. Only arm64 programs were run.

**A probe that made its own stalls.** Gaps in the main thread were first watched by awaiting a message on a new `MessageChannel` in a loop. That makes hundreds of thousands of channels in a few seconds, and collecting them stops the page for 0.2 to 2 s, on an empty page too. The gaps fell around the autosave, 1.5 s after the last key, so they looked like stalls after each save. With one channel reused there is no gap over 40 ms in the 3.5 s after typing stops, in a 1.15 MB LaTeX file or a 0.87 MB Typst file, with TexLab or Tinymist running, in headless Chrome and in the browser pane. What follows a save is a few short tasks: the completion scan (6 to 15 ms), the to-do scan (4 to 6 ms), TexLab's outline (4 to 5 ms) and the page's render (3 to 10 ms). Keys typed through the save took 5 to 10 ms (at most 21 ms).

## 3. The measured profile

### 3.1 Start-up

| Form | Time to `/api/health` answering | Memory (RSS) |
| --- | --- | --- |
| From source, `node apps/backend/src/index.js` (as `tauri dev`) | 760 to 830 ms (1,261 ms on the first run, which seeds the templates) | 202 MB |
| Bundled `server.mjs`, as the release runs it | 307 to 341 ms (593 ms on the first run) | 131 MB |
| Bundled, with `NODE_COMPILE_CACHE` | 308 to 341 ms | 142 MB |

From source, about 600 ms of start-up is Node's module loader opening and reading 146 npm modules. The release bundle avoids most of it and leaves about 200 ms of CPU, mostly compiling the 7.1 MB bundle. Node's compile cache gave nothing. The shell then polls `/api/health` every 200 ms (`wait_for_backend` in `main.rs`), which adds 0 to 200 ms, 100 ms on average.

**Conclusion.** The backend starts in about a third of a second. A Rust backend would start in tens of milliseconds, a saving of about 0.3 s once per launch.

### 3.2 Opening a project

**Backend calls,** median of 15 (p95 is the time 95 per cent of runs finished within):

| Call | simple-document (3 entries) | mid-latex (29) | big-latex (1,786) | huge (20,285) |
| --- | --- | --- | --- | --- |
| `GET /tree` | 0.8 ms | 1.6 ms | 12.6 ms (p95 32 ms), 91 KB | 43 ms, 1.08 MB |
| `GET /events` (lists the folder, then streams) | 0.8 ms | 1.2 ms | 6.8 ms | |
| `listFilesRecursive` alone | | 0.5 ms | 6 ms | 24.5 ms |
| `fs.readdir` with `recursive: true` | | 0.3 ms | 2 ms | 7.1 ms |
| `GET /api/engines` (version probes) | 70 to 460 ms, every time | | | |

**What the editor asks for when it opens,** from the server's request log:

| Project | Requests | Of which `GET /file` | Time until the last one | Server time for them all |
| --- | --- | --- | --- | --- |
| big-latex | 616 | 563 (500 `.md`, 61 `.tex`, 2 `.bib`) | 820 ms | 299 ms, none over 1 ms |
| huge | at least 1,484 | at least 1,435 | at least 4.5 s, still running | 910 ms |

The To-do list (`TodosList.tsx`) reads every `.tex`, `.ltx`, `.typ`, `.md` and `.markdown` file to find to-do comments, each with its own request, and the outline reads chapters again. Each request costs the server half a millisecond, so the cost is the number of round trips through the browser's six connections per host, not the backend's speed. The compiled PDF is also fetched twice when the editor opens (2 × 2.6 MB).

### 3.3 Compiling: engine against overhead

| Document | Engine | Through `/api/compile` | Engine and tools | Spectrum's overhead | Response |
| --- | --- | --- | --- | --- | --- |
| typst-document template | Typst | 384 ms | 370 ms | 17 ms | 32 KB |
| simple-document template | pdfLaTeX and Biber | 2,207 ms | 2,160 ms | 48 ms | 104 KB |
| mid-latex, 58 pages | Tectonic | 1,366 ms | 1,340 ms | 27 ms | 415 KB |
| mid-latex, 58 pages | pdfLaTeX and BibTeX | 878 ms | 830 ms | 49 ms | 512 KB |
| big-typst, 302 pages | Typst | 1,552 ms | 1,530 ms | 22 ms | 2.9 MB |
| big-latex, 533 pages | Tectonic | 7,699 ms | 7,600 ms | 86 ms | 3.7 MB |
| big-latex, 533 pages | pdfLaTeX and BibTeX | 3,435 ms | 3,290 ms | 151 ms | 3.7 MB |
| long-single, 529 pages | pdfLaTeX and BibTeX | 3,482 ms | 3,390 ms | 92 ms | 3.6 MB |

Running Typst and Tectonic directly on the same files took 351 to 364 ms, 1,350 ms, 1,535 ms and 7,488 to 7,763 ms, within a few per cent of the request.

The overhead grows with the project, because each compile lists the project, makes every folder in the build folder, copies the kept `.aux` files and stores SyncTeX. The CPU profile shows almost none of it is computation: over six large compiles (80 s of wall time) the backend used about 1.2 s of CPU, mostly loading modules at start. The rest is waiting for the file system, which a Rust backend would wait for too.

**Checkpoints.** With "checkpoint after compile" on, each compile hashes every tracked file:

| Project | Without | With, a file changed | With, nothing changed |
| --- | --- | --- | --- |
| big-typst | 1.50 to 1.70 s | 2.34 s | 1.96 to 1.99 s |
| big-latex (pdfLaTeX) | 3.65 s | 4.20 to 4.38 s | |

`snapshotDisk` and `trackedFiles` in `versionService.js` run `stat`, `access`, `readFile`, SHA-256 and another `access` for each of 1,700 files, one after another, about 9,000 awaited calls each time.

### 3.4 The PDF's journey to the screen

| Step | 2.68 MB PDF (529 pages) |
| --- | --- |
| Server: base64 and `JSON.stringify` | 4.6 ms |
| Size as JSON against binary | 3.66 MB against 2.68 MB (37 per cent more) |
| Editor: `JSON.parse` | 1.7 ms |
| Editor: `Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))` (`EditorPage.tsx`, line 1621) | **120 to 130 ms in Node's V8; 620 to 810 ms in the hidden pane** |
| The same with a plain `for` loop | 4 ms in Node; 136 to 158 ms in the pane |
| `Uint8Array.fromBase64(pdf)` | 0.5 ms in Node; 4 to 5 ms in the pane |
| Fetching the PDF as binary from `/blob` instead | 24 ms in the pane |
| pdf.js: open the document | 42 ms (Typst's 302 pages: 38 ms) |
| pdf.js: first page's drawing instructions | 29 ms (57 ms) |
| pdf.js: each further page | 2.4 ms (11.9 ms) |
| pdf.js: text of every page (find) | 595 ms (807 ms) |

The 37 per cent size increase is harmless on localhost. The cost is the decode idiom: `Uint8Array.from` with a mapping function calls a function for every byte. pdf.js is not a bottleneck, since `PdfPreview.tsx` draws only the pages in view (`IntersectionObserver`). After each compile of the main document the editor also opens the PDF a second time to draw a thumbnail.

### 3.5 Typing in a long document

The editor's own work for one typed character, in the webview:

| File | CodeMirror transaction | Main thread busy until idle | Work after each pause |
| --- | --- | --- | --- |
| 292 characters (mid-latex's `main.tex`) | 7 to 9.5 ms | 12 to 25 ms | none over 50 ms |
| 1.16 MB, 3,460 lines (long-single) | 6 to 13 ms | 21 to 27 ms | one task of 51 to 74 ms |

A key costs about 20 ms whatever the file's size. The editor page's update listener (`EditorPage.tsx`, line 2133) turns the whole document into a string and stores it in React state on every change (`setEditorValue`), so the 3,900-line `EditorPage` and every panel that reads `editorValue` render again for each key. The 65 ms task after a pause scales with the file: 350 ms after typing stops, the spelling checker (`spellcheck.ts`) masks the entire document again (`doc.toString()`, `maskLatex`, `languageMarkup`, `prosePieces`) to send only the paragraphs in view. `envDepths` in `latexEditor.ts` also rescans every line on each change. At 60 frames a second a frame has 16 ms, so long documents drop frames while typing. The page's JavaScript heap stayed between 15 and 48 MB.

### 3.6 Saving, spelling, grammar and the other services

| Call | Median | Notes |
| --- | --- | --- |
| `GET /file`, 33 KB chapter | 0.5 ms | |
| `PUT /file` save with the base hash | 1.4 ms (p95 3.6 ms) | Reads the file, hashes it and writes through a temporary file |
| Spelling, 40 paragraphs, first call | 146 ms | Starts the Hunspell worker |
| Spelling, 40 paragraphs, warm | 3.0 ms | |
| Spelling suggestions for one word | 54 ms | |
| Grammar (Harper), 33 KB chapter, first call | 1,107 ms | Starts Harper's 16 MB WebAssembly module |
| Grammar (Harper), 33 KB, warm | 95 ms | |
| Grammar (Harper), 3 KB, warm | 11 ms | |
| Document insights (`/stats`, texcount), mid-latex | 196 ms | Runs texcount (Perl) every time |
| Document insights, big-latex | 1,672 ms | Every time the panel asks |
| Document insights, big-typst | 1,474 ms, then 0.5 ms | Cached after the first |
| SyncTeX, PDF from source, first after a compile | 277 ms | Parses a 4.1 MB `.synctex.gz` |
| SyncTeX, PDF from source, then | 18 ms | |
| SyncTeX, source from PDF | 1 to 2 ms | |

**Bibliography conversion.** `buildBibIndex` (adding references, Zotero, Research) converts each entry's title, first author and display title from LaTeX through `latex/conversion.js`:

| Measurement | Result |
| --- | --- |
| 400 entries, first time | **789 ms, blocking the backend's only thread** |
| 400 entries, again (cached) | 3.1 ms |
| One conversion through the worker | 0.66 to 0.77 ms |
| One conversion in-thread, without the worker | 1.6 ms |
| Starting the worker | 83 ms |
| Parsing the 400 entries | 1.7 ms |

While it runs, every other request waits, saves included. The waiting with `Atomics.wait` is not the cost: pylatexenc, a Python library transpiled to 28,866 lines of JavaScript, is slow in itself. The cache holds 1,024 strings, so a bibliography of more than about 340 entries misses on every pass.

**Git.** isomorphic-git against the `git` program on a copy of big-latex (1,713 files):

| Operation | isomorphic-git | `git` 2.54 |
| --- | --- | --- |
| Status, nothing changed | 67 to 72 ms | 23 ms |
| Status, one file changed | 57 ms | 17 ms |
| Stage everything, in groups of 500 as `gitService.js` does | 420 ms | 505 ms (`add -A`) |
| First commit | 23 ms | 62 ms |
| Stage and commit one file | 16 ms | 37 ms |

Pushes and fetches wait on the network. Git is not a bottleneck.

**Typst kept running.** `typst watch` on big-typst compiled in 1.24 s the first time and 221 to 232 ms after each edit, against 1.53 s for each separate `typst compile`.

### 3.7 Memory

| State | Backend RSS |
| --- | --- |
| Bundled, idle | 131 to 134 MB |
| From source, idle | 202 MB |
| After the first spelling check | 201 MB (+66 MB for Hunspell) |
| After the first grammar check | 432 MB (+232 MB for Harper) |

Neither worker stops when idle (`stopGrammar` and `stopSpeller` run only at quit), so one grammar check keeps 230 MB for the rest of the session.

### 3.8 Bundle size

| Part | Universal app | arm64 | x86_64 |
| --- | --- | --- | --- |
| `node` 24.22.2 | 236 MB | 122 MB | 126 MB |
| `tectonic` | 104 MB | 54 MB | 56 MB |
| `typst` | 88 MB | 45 MB | 48 MB |
| `texlab` | 29 MB | 15 MB | 16 MB |
| `spectrum` (the Rust shell) | 12 MB | 6 MB | 6 MB |
| `backend` (`server.mjs` 7.1 MB, npm 16 MB, `mcp.mjs` 2.3 MB, pylatexenc 1.5 MB) | 27 MB | | |
| `native` (Harper 16 MB, Hunspell 1.1 MB) | 17 MB | | |
| `frontend` | 10 MB | | |
| Whole app / DMG | 537 MB / 215 MB | | |

Node is 122 MB a platform, not about 100 MB. The x86_64 halves of the five programs come to about 252 MB of the 537 MB.

## 4. What changed since the 2.1 research

Codex's analysis of 25 October 2026 (in Git history as `docs/SPECTRUM_2_1_PLAN.md`, removed in `bef8a29`) reasoned from the code without measuring. Each of its findings against today's code and numbers:

| Finding then | Still in the code? | Measured now |
| --- | --- | --- |
| `Atomics.wait` in `latex/conversion.js` can block the event loop | Yes, line 25 | Real: 789 ms for 400 entries. The cause is pylatexenc's speed rather than the wait. Worth fixing, but it happens only when references are added or synced |
| `listFilesRecursive` repeated by tree, bibliography, checkpoints, compile and Git | Yes, 57 references in 21 files | Cheap: 6 ms for 1,800 entries and 25 ms for 20,000. Not a priority. The costly repeated work is in checkpoints and in the editor's per-file requests, which it did not mention |
| PDFs travel as base64 JSON | Yes, `compileService.js` lines 694 and 716 | The size does not matter; the editor's decode does (0.12 to 0.76 s) |
| Measure before porting | | Done here |
| Rust only if a hot spot remains after the JavaScript fixes | | None of the hot spots found needs Rust |

It also assumed Git used isomorphic-git, which is still true; the brief for this report said `git`.

## 5. What Oleafly really is

Line counts of `/Users/beyond555/Documents/CodingProjects/Oleafly-main`, without `node_modules`, `target` and `vendor`:

| Language | Code | Tests |
| --- | --- | --- |
| TypeScript and TSX | 324,805 | 369,214 |
| Rust | 353,685 | 86,611 |
| Python | 34,203 | 191 |
| JavaScript | 11,121 | 822 |

Rust code is in `src-tauri` (236,820 lines) and seven crates (112,619 lines): the agent runtime, the `oleaflyc` command line, compile checkpoints, the shared project manifest, the collaboration client and protocol and a collaboration server on Axum, SQLite and the Loro CRDT. TypeScript is in `src` (239,058 lines of code) and 16 packages (85,168), with editor, preview, preflight and LaTeX parsing.

For comparison, Spectrum has 1,616 lines of Rust, 23,600 hand-written lines of backend JavaScript plus the 28,866 generated lines of pylatexenc (the brief's 52,000 is both together), 55,840 lines of TypeScript in the frontend and 15,475 lines of backend tests. Oleafly is about ten times Spectrum's size.

**How Oleafly works, against Spectrum:**

| Area | Oleafly | Spectrum |
| --- | --- | --- |
| Shell to backend | Tauri commands into Rust; no local server | HTTP to Node and Fastify on 127.0.0.1 |
| Frontend | React 19, CodeMirror 6, pdf.js 6.3 | React, CodeMirror 6, pdf.js |
| Engines | Tectonic, Typst, pandoc and Tectonic's Biber as sidecar programs (`externalBin`) | Tectonic, Typst, pandoc and Biber as programs |
| Git | The `git` program (`Command::new("git")` in `git.rs`) | isomorphic-git in process |
| Spelling and grammar | harper.js and hunspell-asm (WebAssembly) in the web view | Hunspell native addon and Harper WebAssembly in Node workers |
| File watching | `notify` in Rust | `fs.watch` with FSEvents |
| Reading the project | One `read_project_sources` call that hashes every file and returns text only where it changed | One request per file |
| PDF to the editor | Raw bytes through `tauri::ipc::Response` | base64 in JSON |
| Document statistics | In Rust, batched | texcount (Perl) |
| Real-time collaboration | Yes, Loro in Rust | No |

**What it does differently that matters for speed** is batching (one call for all sources, one for statistics, one for retrieval) and binary transport. Neither depends on Rust: Spectrum can add a batched endpoint and a binary PDF response in its Node backend. Oleafly's compiles are the same external Tectonic and Typst as Spectrum's, so they take the same time. Its grammar check runs Harper in the web view, not in Rust.

## 6. The options, assessed

Gains are from Section 3. Effort assumes one developer who knows the code.

### 6.1 Fix the hot spots in JavaScript

| # | Change | Expected gain | Effort | Risk |
| --- | --- | --- | --- | --- |
| J1 | Decode with `Uint8Array.fromBase64`, or better, have the editor fetch the PDF it already writes to disk as binary (`/blob`, 24 ms) and drop `pdf` from the JSON. Same in `TransferPanel.tsx` and `agent/parts.tsx`. Fetch the PDF once on open, not twice | 0.12 to 0.76 s per compile of a 500-page document, 20 to 100 ms for a short one; no main-thread stall | Hours | Low. `fromBase64` needs Chrome 140 or Safari 18.2, which the shipped WebView2 and WKWebView have; keep the loop as a fallback |
| J2 | One `POST /api/projects/:id/sources` taking the editor's hashes and returning only changed text, used by the to-do list, outline, insights and floats. Cache in the editor | Opening big-latex: 563 requests (0.82 s) become one of about 30 ms. The 20,000-file case drops from at least 4.5 s | 1 to 2 days | Low to medium: several callers keep their own caches today |
| J3 | Checkpoints: remember each file's size, modification time and hash, then hash only files whose stat changed; run reads with bounded concurrency (16, matching `UV_THREADPOOL_SIZE`) | About 0.45 s saved per checkpointed compile with nothing changed in 1,800 files; most of 0.7 s when one file changed | 1 day | Medium: a stale cache would skip a change. Clear it on any doubt, as `git` does with its index |
| J4 | Typing: keep the document in a ref and give panels a getter or a debounced copy instead of `setEditorValue` on every key. Mask only the changed range for spelling. Make `envDepths` incremental | About 20 ms a key down to the CodeMirror transaction (5 to 10 ms); the 65 ms pause on long files removed | 2 to 4 days | Medium: many consumers read `editorValue` |
| J5 | Keep Typst running: one `typst watch` per open Typst document (or Tinymist's export, Section 6.7) | 302 pages: 1.53 s to 0.23 s per recompile | 2 to 5 days | Medium: version pinning, stopping and errors must match today's compiles |
| J6 | Replace pylatexenc in `buildBibIndex` with a small table of accents and common macros, falling back to pylatexenc in a batched async call | 789 ms of blocked backend to about 1 ms for 400 entries; also removes 28,866 generated lines from the hot path | 1 day | Low: compare with pylatexenc on a corpus of real `.bib` files |
| J7 | Stop the Harper worker after five idle minutes and start it again on demand | 230 MB back after grammar is used; the next check pays 1.1 s again | Hours | Low |
| J8 | Small ones: poll `/api/health` every 25 ms or have the backend print a ready line (average 100 ms off launch); parse SyncTeX in the background right after a compile (277 ms off the first click); cache texcount by file times (1.7 s off each insights refresh); cache `/api/engines` (70 to 460 ms) | 0.1 to 1.7 s each in its own situation | Hours each | Low |

### 6.2 Worker threads

Spectrum already puts spelling, grammar and LaTeX conversion in workers. Node's own guidance is that workers suit CPU work, not ordinary file I/O, and the only CPU-bound backend work found was the bibliography conversion (J6). A worker for checkpoint hashing would not help, since the time is in sequential I/O. In the editor, a web worker could take the spelling mask (J4) off the main thread if making it incremental proves hard.

### 6.3 Moving specific services into Rust

| Service | Today | What Rust could save | Verdict |
| --- | --- | --- | --- |
| File tree and watching | 13 ms for 1,800 entries, 43 ms for 20,000; FSEvents through `fs.watch` | 5 to 20 ms on huge projects | No |
| Project scanning | `listFilesRecursive` 6 to 25 ms | 5 to 15 ms (`fs.readdir` recursive already gets most of it) | No |
| SyncTeX parsing | 277 ms once per compile on 533 pages | Perhaps 200 ms, unmeasured | Not before J8's background parse. The Lite research keeps the parser in JavaScript to share it |
| Spelling | 3 ms warm, Hunspell already native C++ | Nothing on the desktop | Only for Lite (spellbook), as `SPECTRUM_LITE_RESEARCH.md` recommends |
| Grammar | Harper is already Rust, compiled to WebAssembly; 95 ms per 33 KB, 232 MB | Native `harper-core` through napi-rs might use less memory and run somewhat faster (not measured) | Defer. J7 recovers the memory for hours of work, not weeks |
| Diffing and checkpoints | Sequential I/O | The same I/O | No; J3 |
| Git (git2 or gitoxide) | isomorphic-git, status 60 to 70 ms | 40 to 50 ms on status. gitoxide still has no push; git2 brings OpenSSL and C to every platform | No. If ever, the `git` program is the cheaper switch, but it would need an installed Git |
| PDF handling | base64 decode | Nothing that J1 does not get | No |
| Bibliography conversion | 0.7 to 1.6 ms per string | Similar to J6 | No; J6 |

As a napi-rs module, each would add native builds for macOS arm64, macOS x86_64 and Windows, signing and a crash that takes the backend with it. As Tauri commands, they would not reach the backend or the agents' MCP tools, which call the backend. The old plan's gate still applies: a Rust pilot must beat the **optimised** JavaScript by at least 20 per cent at p95 and 50 ms on a user action.

### 6.4 Replacing Node with a Rust backend

| | Today | With a Rust backend |
| --- | --- | --- |
| Code to port | 23,600 lines of backend JavaScript, 193 routes in 28 files, plus a replacement for pylatexenc and isomorphic-git | Roughly 35,000 to 60,000 lines of Rust, judging by Rust's usual 1.5 to 2.5 times the lines for the same behaviour. Oleafly's backend, with more features, is 237,000 lines |
| Time | | 6 to 12 months for one developer, with the 15,500 lines of backend tests to rewrite |
| Launch | About 0.33 s for the backend | About 0.03 s: 0.3 s saved once per launch |
| Compiles | Engine 96 to 99 per cent of the time | Unchanged |
| Memory, idle | 131 MB | Perhaps 20 to 40 MB: about 100 MB saved |
| Bundle | Node 122 MB a platform | Smaller only if Node goes entirely, and it cannot: the agents' adapters are npm packages that Spectrum installs with its bundled npm and runs with its Node (`agentProfiles.js`), and agents start `mcp.mjs` with it |
| Risk | | High: sync and merge rules, file locks, agent isolation and the two-computer rollback would all be rewritten |

A rewrite would make Spectrum about 0.3 s quicker to open and use about 100 MB less memory, at the cost of most of a year in which nothing else ships. Section 6.1 saves more than that in weeks.

### 6.5 Bundle size and start-up

| Change | Saving | Effort | Risk |
| --- | --- | --- | --- |
| Separate Apple silicon and Intel downloads instead of one universal app | About 252 MB of the 537 MB app; the arm64 app would be about 285 MB | Build and release work: `tauri build --target aarch64-apple-darwin` and `x86_64-apple-darwin`, two DMGs and two update entries | Low to medium: users must pick the right download (the updater can choose for them) |
| Remove Node | 122 MB a platform | Needs Section 6.4 and an answer for the agents | High |
| Node built with `--with-intl=small-icu` | Perhaps 25 to 30 MB, unmeasured | A custom Node build for each platform | Medium: Unicode property escapes (`\p{L}`), used throughout, need checking |
| Start-up | Already bundled; J8's faster health check is the only cheap gain | | |

### 6.6 Frontend work

| Area | Finding | Recommendation |
| --- | --- | --- |
| React re-renders | About 20 ms of rendering per key, whatever the file's size | J4. The largest frontend gain |
| CodeMirror | 6 to 13 ms per transaction on 1.16 MB, including `envDepths` | Make `envDepths` incremental; otherwise CodeMirror is fine |
| pdf.js | 42 ms to open 529 pages, 2 to 12 ms a page, drawn only in view | Nothing needed. The thumbnail after each compile could reuse the open document |
| Initial load | 2.3 MB main chunk; the page was usable in under 0.2 s from the local server | Nothing needed |

### 6.7 Typst in process instead of the command line

The Typst crate in the Tauri shell, with a persistent `World`, would recompile incrementally like `typst watch` (about 0.23 s for 302 pages, most of it writing the whole PDF) and could render only the visible pages to SVG in tens of milliseconds. Against that, the shell would carry a second Typst build (about 45 MB a platform), per-project Typst version pinning would need one shell build per version or a fallback to the command line, and package downloads and fonts would move into Rust.

The user has said they do not use a live preview, and Tinymist is already shortlisted in `TYPST_EDITOR_FEATURES.md`. Tinymist keeps an incremental Typst running and can export PDF on save, so it brings J5's gain with the language server. **Recommendation:** get the faster recompile from `typst watch` or Tinymist; do not embed the crate for the desktop. The crate is worth it on tablets, where nothing else can run.

### 6.8 What Tauri 2 offers

- Commands can return raw bytes with `tauri::ipc::Response`, which is how Oleafly sends PDFs. Spectrum gets the same over HTTP with a binary response (J1).
- Channels stream ordered messages such as compile logs; Spectrum's SSE already does this.
- Custom URI schemes (`register_asynchronous_uri_scheme_protocol`) could serve files without a port, but the Lite research notes that iOS slows down on large custom-scheme responses.
- Sidecars do not run on iOS or Android, which is why Lite needs Tectonic linked into a Rust library.
- None of these speeds up a compile or the backend's work as measured.

### 6.9 Spectrum Lite and the Git platforms research

`SPECTRUM_LITE_RESEARCH.md` already plans a Rust crate for tablets of about 2,500 lines: projects and files, Tectonic linked in, the GitHub REST transport and spellbook, with the SyncTeX parser and merge rules shared in JavaScript. That is the right place for Rust, because a tablet cannot run Node or a sidecar. Two points from this report bear on it:

- the batched sources call (J2) and binary PDFs (J1) are exactly the shape Lite's commands need, so doing them in the desktop backend first makes `api/client.ts` ready for an IPC transport,
- the desktop should not be ported to share Lite's crate for speed. If the crate matures, the desktop could later take its project store or GitHub transport for consistency, not performance.

`GIT_PLATFORMS_RESEARCH.md` relies on isomorphic-git's HTTPS push for other hosts. Measured here, isomorphic-git is fast enough (60 to 70 ms for status, 420 ms to stage 1,700 files), so neither git2 nor gitoxide is needed for speed; the reasons to change would be SSH or Git LFS, which isomorphic-git lacks.

## 7. Ranked improvements

From the quickest JavaScript wins to Rust moves, by benefit for effort:

| Rank | Improvement | Gain | Effort |
| --- | --- | --- | --- |
| 1 | J1: binary PDF or `fromBase64`, one fetch on open | 0.12 to 0.76 s per large compile | Hours |
| 2 | J8: SyncTeX parsed after the compile, texcount and engines cached, quicker health check | 0.1 to 1.7 s in their own situations | Hours each |
| 3 | J7: idle Harper worker stopped | 230 MB | Hours |
| 4 | J6: table-based LaTeX-to-Unicode for bibliographies | 789 ms of blocked backend removed | 1 day |
| 5 | J3: checkpoint stat cache and concurrency | About 0.45 s per checkpointed compile | 1 day |
| 6 | J2: batched project sources | 0.8 s to several seconds when opening | 1 to 2 days |
| 7 | J4: no React render per key, incremental spelling mask | About 20 ms a key, 65 ms stalls | 2 to 4 days |
| 8 | J5: persistent Typst (or Tinymist export) | 1.5 s to 0.23 s per Typst recompile | 2 to 5 days |
| 9 | Separate arm64 and x86_64 Mac builds | About 252 MB of app size | Release work |
| 10 | Rust pilot, only if a hot spot remains: SyncTeX parser or native Harper through napi-rs | Up to 200 ms or some memory, unmeasured | 1 to 2 weeks |
| 11 | Typst crate in process | Instant page previews; mainly for Lite | Weeks |
| Not recommended | A Rust backend in place of Node | 0.3 s at launch, about 100 MB | 6 to 12 months |

## 8. Phased plan

| Phase | Work | Length | Done when |
| --- | --- | --- | --- |
| 0. Instruments | Add `Server-Timing` with the compile's phases (list, copy, engine, keep, checkpoint), an event-loop delay histogram behind a setting and this report's scripts (generator, compile benchmark, request summary) as `scripts/perf/` | 1 to 2 days | The tables in Section 3 can be produced again with one command |
| 1. Quick wins | Ranks 1 to 5 | About 1 week | A 500-page compile shows its PDF 0.1 to 0.8 s sooner; checkpointed compiles 0.45 s faster; no backend stall when adding references; 230 MB back when idle |
| 2. Structural JavaScript | Ranks 6 to 8 | 2 to 3 weeks | Opening big-latex takes under 50 requests; a key costs under 10 ms on 1.2 MB; Typst recompiles in under 0.3 s on 300 pages |
| 3. Measure again | Phase 0's scripts on the same projects, and on real projects the user has | 1 day | A decision on rank 10 against the 20 per cent and 50 ms gate |
| 4. Packaging | Rank 9, decided with the next release | With a release | |
| 5. Lite | The Rust crate in `SPECTRUM_LITE_RESEARCH.md`, Section 13 | As planned there | Separate from the desktop's speed |

## 9. Where the assumptions were wrong

| Assumption | What the code and the measurements show |
| --- | --- |
| Oleafly was built on Rust | Its backend is, but it has more TypeScript than Rust, the same React, CodeMirror and pdf.js frontend as Spectrum and the same external Tectonic, Typst and pandoc programs. Git runs through the `git` program and grammar through WebAssembly in the web view |
| Rust rewrites would speed Spectrum up | Compiles are 96 to 99 per cent engine time. The slow parts that remain are a decode idiom, per-file requests, sequential hashing and React renders, all in JavaScript that can be fixed in JavaScript. The backend used 1.2 s of CPU in 80 s of large compiles |
| The backend is about 52,000 lines | 23,600 hand-written lines; the other 28,866 are pylatexenc, transpiled from Python |
| Git goes through the `git` program | It goes through isomorphic-git, pure JavaScript in process |
| Node is about 100 MB | 122 MB a platform, and 236 MB in the universal app, where the Intel halves of all five programs come to 252 MB |
| The 2.1 research's repeated project scans are a hot spot | They cost 6 ms on 1,800 entries; the real repeated work is checkpoint hashing and the editor's per-file requests |
| Base64 PDFs are slow because of their size | The size costs nothing measurable on localhost; the decode in the editor does |

## 10. Reproducing these numbers

The scripts are in this session's temporary scratch folder, `/private/tmp/claude-501/-Users-beyond555-Documents-CodingProjects-OpenPrism/fbabb042-6bf1-46be-83a9-ed218926f0d7/scratchpad/perf/`, which macOS may clear: `gen.mjs` makes the projects, `compilebench.mjs` times compiles against the engines with the `shims/` wrappers on the backend's `PATH`, `apibench.mjs` times the calls in Sections 3.2 and 3.6, `logsum.mjs` summarises the request log when a project opens and `coldstart.mjs` times start-up. `bibbench.mjs`, `gitbench2.mjs` and `pdfjs.mjs` time the bibliography, Git and pdf.js. Phase 0 would move them into `scripts/perf/`.
