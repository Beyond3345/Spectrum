# Spectrum 2.1 plan

> **Status, 29 October 2026:** research by Codex, kept for reference. Its grammar part (section 4) is replaced by the languages section of [SPECTRUM_2_PART_2_PLAN.md](SPECTRUM_2_PART_2_PLAN.md), which brings Harper 3, Hunspell 1.7.6, the language list and LanguageTool into 2.0. Its performance ideas (sections 5 and 6) are kept for later and are not scheduled.

Grammar engines, reliable engine updates and selective performance improvements.

**Status:** research proposal, 25 October 2026. Based on `feat/2.0` at `99c377e`. No application code, dependencies, settings or build configuration were changed for this investigation. No benchmarks or prototypes were run. This Markdown document is the only requested addition; it does not authorise implementation or a release.

## 1. Recommendation

1. **Worth doing:** expose the installed grammar engine's version and provenance, pin Harper updates, and make updates repeatable and tested.
2. **Worth doing for multilingual writing:** let the user choose Harper or LanguageTool, with an explicit language and a local-first connection.
3. **Worth doing before any rewrite:** measure responsiveness and address blocking calls, repeated scans and unnecessary data copies in the existing implementation.
4. **Conditionally worthwhile:** prototype one small Rust accelerator only if an expensive operation remains after those improvements.
5. **Not worthwhile for 2.1:** rewrite the whole backend, editor, agent integrations or compiler orchestration in Rust. The investigation has not established a performance benefit large enough to justify that migration.

The aim is a faster, more useful writing application. Shipping Rust code is not itself a success criterion. Spectrum 2.1 can be successful without a Rust port if the existing implementation meets the measured targets.

## 2. Relationship to the 2.0 work

The current [2.0 handoff](SPECTRUM_2_HANDOFF.md) remains authoritative for unfinished 2.0 work: phase 4 needs review, the intermittent TexLab test needs investigation, and phase 5 and final packaging remain. Complete and stabilise that work before treating this proposal as the next release scope.

Recheck these findings against the eventual 2.0 release: phase 5 may change document types, engines, packaging and the paths affected here. No 2.0 files should be rewritten merely to prepare for this proposal.

Keep the existing project formats, checkpoints, rollback behaviour, agent isolation and shared-settings privacy. Performance work must not relax path validation, collision checks, file locks or recovery rules.

## 3. What Spectrum currently does

| Area | Current implementation | Implication |
| --- | --- | --- |
| Desktop shell | Rust/Tauri in `src-tauri/src/main.rs` | Spectrum already uses Rust; replacing the shell is unnecessary. |
| Application services | Node/Fastify, with a React/CodeMirror frontend | A partial Rust port leaves Node in the app; it does not automatically reduce installer size or resident memory. |
| Grammar | Bundled Harper WASM in a Node worker | Harper's Rust engine is already compiled. A Rust wrapper rewrite alone has no demonstrated benefit. |
| Spelling | Native nodehun/Hunspell | This is already native code. |
| Language intelligence | Separate TexLab process | Rust is already used upstream; bridge timing and I/O are separate concerns. |
| Compilation | External TeX tools, with cached auxiliary files | Rewriting the launcher does not make TeX typesetting faster. |
| References | JavaScript parsing and normalisation, with pylatexenc in a worker | Some conversion calls synchronously wait for that worker. |
| Project operations | Repeated filesystem walks, content-addressed checkpoints and isomorphic-git | There are plausible large-project bottlenecks, but no profile establishes their contribution yet. |

Evidence comes from the source files named below, not from measured comparisons between JavaScript and Rust.

## 4. Grammar integration

### 4.1 Current Harper integration and maintenance gaps

Relevant files:

- [`scripts/native.mjs`](../scripts/native.mjs), `buildHarper`.
- [`grammarWorker.mjs`](../apps/backend/src/services/grammarWorker.mjs) and [`grammarService.js`](../apps/backend/src/services/grammarService.js).
- [`language.js`](../apps/backend/src/routes/language.js), the grammar routes.
- [`GrammarPanel.tsx`](../apps/frontend/src/editor/GrammarPanel.tsx), [`SettingsSheet.tsx`](../apps/frontend/src/app/SettingsSheet.tsx) and [`language.test.js`](../apps/backend/test/language.test.js).
- [`scripts/desktop.mjs`](../scripts/desktop.mjs), which copies the built engine into the application.

The build script compiles a sibling Harper checkout or `HARPER_DIR`, with default features disabled, and copies the JavaScript glue, WASM and licence. It does not enforce an upstream release/commit or generate version metadata. The custom build leaves out thesaurus and Typst support.

The worker uses Australian English, disables Harper spelling because Hunspell handles it, and configures serial-comma rules. LaTeX is masked while preserving source positions; unsafe replacements crossing markup are withheld. Project-ignored rules are kept in `.spectrum/grammar.json`.

The status endpoint returns availability and `en-AU`, without a version. Settings names Harper but does not expose its installed version. The notices record **2.12.0**; the upstream release and official JavaScript package currently report **2.13.0**. The recorded version is not independent proof of the bundled binary's provenance. [Harper release](https://github.com/Automattic/harper/releases/tag/v2.13.0), [official package metadata](https://github.com/Automattic/harper/blob/master/packages/harper.js/package.json).

### 4.2 Options, advantages, disadvantages and verdict

| Change | Advantages | Disadvantages / cost | Worth it? |
| --- | --- | --- | --- |
| Version display and generated build metadata | Clear diagnostics; users can tell what is installed; prevents a stale label being mistaken for the engine version | Small build/status/UI change | **Yes. First priority.** |
| Pin and automate the existing WASM build | Reproducible updates; preserves today's deliberately reduced feature set | Maintains Rust/WASM build tooling and direct binding compatibility | **Yes, even if SDK migration is deferred.** |
| Adopt official `harper.js` | Uses upstream's JavaScript integration and package updates; can reduce custom build maintenance | API is still described as early access; asset packaging, features and bundle size need comparison | **Worth a compatibility trial, not an unconditional migration.** |
| Replace Harper WASM with native Rust Harper | Could avoid some WASM conversion overhead | New native bindings, platform builds and a second integration contract; existing engine is already compiled Rust | **No demonstrated need. Defer unless profiling specifically implicates WASM.** |
| Optional local LanguageTool | Additional languages; local document processing | Java runtime, server startup, memory, downloads and lifecycle management | **Yes for the multilingual requirement. Keep optional.** |
| Optional hosted LanguageTool | Avoids installing the local Java engine; service-dependent additional checks | Text leaves the computer; credentials, limits, connectivity and subscription terms | **Optional explicit choice. Not a silent fallback.** |
| Run both checkers on every document | May find different issues | Duplicate or conflicting advice; more CPU and UI noise | **Not the initial design. Select one per project/document language.** |

The official Harper Node integration uses `LocalLinter`; its browser `WorkerLinter` is unsuitable for Node. If adopting the package, run `LocalLinter` inside Spectrum's existing worker thread and preserve the current application-facing result format. Package assets must be bundled locally for offline use. [Official Node integration](https://writewithharper.com/docs/harperjs/node), [API maturity](https://writewithharper.com/docs/harperjs/introduction).

### 4.3 Proposed user experience

Settings → Spelling & grammar should provide:

- **Grammar checker:** Harper or LanguageTool.
- **Language:** supported languages and regional variants; Australian English remains the existing default.
- **Engine information:** installed version, availability and whether processing is local or hosted.
- **LanguageTool connection:** local server or explicitly configured hosted service; Test connection and a clear connection error.
- A project override so a French paper does not change the defaults for an Australian English assignment.

An example status is “Harper 2.13.0 · Australian English · Runs locally”. A LanguageTool status should identify the connected server's reported version, not a hard-coded expected version. Its documented API exposes language discovery and software information in check responses. [LanguageTool API](https://languagetool.org/http-api/swagger-ui/).

Keep the same underlines, issue list, navigation and replacement controls. Show engine-specific options only when supported: Harper's serial-comma rule names cannot simply be sent to LanguageTool. Keep ignored rules distinct by engine and language. Preserve the legacy Harper `ignoredRules` list when adding new settings so a downgrade does not reinterpret it.

Share safe language/provider preferences through project/shared settings. Keep API keys and other connection secrets in the backend's private configuration, outside GitHub-synced settings and templates.

**Spelling needs an explicit decision too.** Choosing French grammar must not leave Australian Hunspell marking every French word as wrong. For a non-English LanguageTool project, suppress inappropriate English spelling checks and use the selected engine's available spelling results, or clearly show that spelling is unavailable. Downloading additional Hunspell dictionaries is a separate optional extension, with its own licences. Do not promise spelling for every language that has grammar rules.

### 4.4 LanguageTool integration approach

Connect from Spectrum's backend to LanguageTool's documented HTTP interface. Retain the existing grammar result shape through a small adapter; a general plugin framework is unnecessary for two engines.

The local server is an ordinary Java process and needs no Docker requirement. The standalone documentation specifies Java 17 or later. Start with a user-configured local server; consider an optional managed server/runtime download after proving the integration. This keeps Java and language resources out of every default installation. For managed operation, use a private runtime, bind to loopback, start on demand, reuse the process and stop it with Spectrum. Do not require global Java configuration. [Standalone requirements](https://github.com/languagetool-org/languagetool/blob/master/languagetool-standalone/README.md), [local server](https://dev.languagetool.org/http-server).

Language coverage varies substantially. Populate choices from the connected server, verify the languages and dialects the user needs, and do not infer Traditional Chinese or Cantonese coverage from a generic “multilingual” label. The local open-source server also lacks the cloud's AI-based rules. [Language coverage](https://dev.languagetool.org/languages), [local server limits](https://dev.languagetool.org/http-server).

Do not use the free public endpoint as Spectrum's automatic background service. Its published policy prohibits automated requests and directs integrations to their own server or an appropriate service arrangement. Hosted checking requires explicit user selection and a clear explanation of where text goes. [Public API policy](https://dev.languagetool.org/public-http-api).

LanguageTool core is LGPL-2.1-or-later. Keep it as a separate optional program and review its distribution and third-party resource obligations before bundling it. Do not copy its implementation into Spectrum's MIT codebase. [Upstream licence statement](https://github.com/languagetool-org/languagetool#languagetool).

### 4.5 Correctness requirements

- Preserve LaTeX source mapping and prevent replacements from damaging commands, citations, maths or verbatim content. Reuse the existing masking path initially; evaluate LanguageTool's annotated-markup input if masked whitespace causes false positives. Its API supports distinguishing text from markup. [API](https://languagetool.org/http-api/swagger-ui/).
- Normalise positions into the editor's UTF-16 offsets. Cover emoji, combining accents, CJK and CRLF explicitly.
- Split large documents at sensible paragraph/sentence boundaries when required by the selected server; map results back and deduplicate overlap. Do not submit a two-million-character file in a single request merely because Harper's current route accepts it.
- Discard results after the document, language or engine changes. Cancellation must prevent old results from being applied.
- Preserve source-language personal words and existing ignored Harper rules. Do not map two engines' rule IDs by guesswork.
- Report partial checks and unavailable services. A failed checker must not appear as “No issues found”.

### 4.6 Updating Harper and showing its version

Generate a manifest alongside the actual assets: core/package version, upstream commit, build toolchain, features and asset digests. With the current custom build, derive this from the checked source and produced files. With the official package, derive it from the pinned package and bundled assets. Never derive the installed version from an online “latest” endpoint.

Expose installed metadata through grammar status and show it in Settings and copied diagnostic information. Display unknown provenance honestly for older assets that lack a manifest.

The proposed maintenance workflow is a scheduled upstream-release/dependency check that prepares a reviewable update, rebuilds the matching JavaScript/WASM pair, checks the pinned dependencies and notices, and runs grammar and packaged-runtime regressions on Mac and Windows. Ship accepted updates through Spectrum releases initially. A separate engine updater is additional infrastructure, not necessary for the first implementation.

Tests must cover current rules/preferences, ignored-rule migration, offline startup, worker recovery, asset compatibility, source positions and safe replacements. Compare false positives on representative academic writing; a newer engine can change advice even when the API still works.

## 5. Rust performance investigation

### 5.1 Static findings worth addressing first

**A worker is used, but reference conversion still waits synchronously.** [`latex/conversion.js`](../apps/backend/src/latex/conversion.js) posts a conversion request and calls `Atomics.wait` with a two-second timeout. On a cache miss, its calling thread waits. Reference, research, Zotero and metadata paths call this synchronous interface; calling it on the backend event loop can delay unrelated requests. This is a confirmed code pattern, not a measurement of how often it affects users. [Atomics.wait behaviour](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait).

First investigate asynchronous/batched conversion at service boundaries, reusing the worker infrastructure and pylatexenc. Preserve its existing conversion semantics and cache. Do not replace it with another handwritten TeX decoder just to avoid the wait. Audit callers before changing the synchronous contract. [Node's event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop).

**Whole-project scans are repeated.** `listFilesRecursive` visits directories sequentially. Project watching/tree requests, bibliography discovery, checkpoint creation, compile setup and Git exclusion calculation use it. `gitService.compiledPdfs` also reads each TeX file before a commit; `statsService.documentLabels` walks bibliography files when checking staleness. Start with shared inventories, invalidation and bounded concurrency where appropriate. Rust cannot remove disk latency caused by doing unnecessary work.

**Some expensive-looking operations already use native implementations.** Checkpoints use Node's crypto hashing and asynchronous zlib compression. A handwritten Rust SHA or gzip wrapper alone is unlikely to be the useful change. Investigate file reads, queueing, repeated hashes and peak buffer retention first.

**Large PDFs cross an encoding boundary.** `compileService` returns base64, and `EditorPage` decodes it into bytes and a Blob. Measure the copies and JSON overhead. A binary/cached-PDF response can be investigated in the existing backend before replacing a PDF engine or moving services to Rust.

### 5.2 Candidate-by-candidate evaluation

| Candidate | Potential advantage of Rust | Disadvantages and limits | Verdict for 2.1 |
| --- | --- | --- | --- |
| Project inventory / file discovery | Lower allocation overhead and controlled parallel work on very large trees | Mostly I/O; maintaining exclusion, link and Windows path semantics is difficult; repeated scans remain repeated scans | **Conditional pilot after caching and invalidation improvements.** |
| Large bibliography indexing / duplicate lookup | Efficient parsing and reusable indexes for large libraries | Must preserve names, dates, quotes, BibTeX semantics and deduplication; external reference lookup is network-bound | **Promising only if local indexing remains a measured hotspot.** |
| Insights, to-do and Preflight source scans | Faster CPU-heavy scans and possible parser reuse | Today much of this runs in the browser; native calls add round trips and stale-result hazards; Rust offsets are not JavaScript offsets | **Try a browser worker/incremental scan first; Rust/WASM only if still justified.** |
| Large text diffs | Can move substantial comparison work off the JavaScript thread | Different algorithms can produce different hunks; UI rendering can remain the real bottleneck | **Conditional, read-only comparison before any merge replacement.** |
| Three-way merge decisions | Potentially faster analysis of large changes | A different conflict decision can silently lose user work; current conservative rules are intentional | **Defer unless there is a strong profile and extensive parity evidence.** |
| Git status, object and pack processing | Plausible benefit for large repositories and local CPU-heavy Git work | Native library coverage, credentials, locks, atomic writes and cross-platform behaviour need proof | **Best higher-cost candidate for a narrowly scoped read-only pilot.** |
| Entire Git sync engine | Could consolidate expensive Git processing in one native engine | High risk to the new sync/recovery rules; Rust libraries are not automatically complete replacements | **Not a 2.1 rewrite.** |
| Checkpoint engine | Streaming and bounded parallel processing might reduce large-project stalls | Hashing/compression are already native; manifests, IDs, restore and recovery must remain compatible | **Optimise orchestration first. Port only a demonstrated remaining hotspot.** |
| Harper native integration | May avoid some WASM overhead | Engine is already Rust/WASM; introduces platform bindings and maintenance | **Defer; no measured justification.** |
| Compile / TexLab supervision | Native process APIs can be useful for specific reliability problems | Does not accelerate TeX or TexLab; cancellation and isolation regressions are costly | **Keep current architecture for performance work.** |
| Model/search/Zotero HTTP orchestration | Little expected benefit from changing language alone | Predominantly waits on services; loses mature JavaScript SDK integration | **Not worth rewriting for speed.** |
| React/CodeMirror/PDF.js or the whole Node backend | A full native backend could eventually remove a runtime | Large rewrite, duplicated APIs, parser/rendering differences and lost integration work; a partial port still ships Node | **Not worth the current cost or risk.** |

These are hypotheses and engineering assessments. No speed-up percentage is claimed. For illustration, if a task spends 70% of its time in TeX and 30% in orchestration, halving the orchestration time reduces total time by only 15%; it does not make the task twice as fast.

### 5.3 Git library constraint

`gix`/Gitoxide is a relevant pure-Rust candidate for repository inspection and processing. However, its current published feature status lists missing push plumbing and incomplete higher-level workflows. It cannot be treated as a drop-in replacement for Spectrum's complete clone/commit/merge/push path. Do not replace isomorphic-git based on a status or fetch benchmark alone. Recheck the chosen release's capabilities before a prototype. [Gitoxide](https://github.com/GitoxideLabs/gitoxide), [upstream feature status](https://github.com/GitoxideLabs/gitoxide/blob/main/crate-status.md).

Any future native Git experiment must preserve `gitService.js`, `githubService.js`, `mergeRules.js` and `settingsRepoService.js` behaviour: private credentials, secret exclusions, project data allowlists, index locks, dirty-file protection, conflict copies, checkpoints and two-computer rollback. Keep Rust initially read-only; JavaScript continues to own write transactions.

An installed native Git executable is also worth including as a benchmark reference before writing a new integration. Reusing it could avoid a Rust port, but making it mandatory would introduce a new installation dependency and requires equally careful credential, argument and recovery handling. It is not an automatic replacement for the current self-contained Git integration.

### 5.4 Integration choices and their cost

| Route | Advantages | Disadvantages | Recommended use |
| --- | --- | --- | --- |
| Async JavaScript worker | Reuses current runtime and tests; browser workers can isolate source scanning | Does not speed the algorithm itself; messages and copies still cost time | **First comparison baseline.** Node recommends workers for CPU work, not ordinary async I/O. |
| Rust Node-API addon | Keeps Fastify/MCP/agent-facing service APIs; can batch inputs; existing nodehun packaging provides a native-module precedent | Adds architecture-specific binaries and signing/build work; a native failure can affect the backend | **Preferred first Rust route for one measured backend CPU hotspot.** |
| Long-lived Rust helper process | Separates process failures and can own a CPU-heavy task queue | Extra process, protocol, startup cost and data transfer; cancellation/shutdown must be added | **Alternative if isolation is the deciding requirement.** Do not spawn one process per tiny request. |
| Direct Tauri commands | Reuses the desktop Rust shell | Browser development and Node/MCP callers would need another route; heavy synchronous commands can hurt the UI | **Use for desktop-specific work, not as a second general backend.** |
| Rust/WASM in a browser worker | Keeps browser execution and can reuse a pure parser | Adds WASM assets, conversion costs and another build target | **Only for a proven frontend parsing bottleneck.** |

[Node worker guidance](https://nodejs.org/api/worker_threads.html), [Node-API Rust framework](https://github.com/napi-rs/napi-rs), [Tauri command execution](https://v2.tauri.app/develop/calling-rust/).

If an addon is chosen, CPU work must run off the Node event loop, using the existing worker boundary or a bounded asynchronous native task. NAPI-RS documents this task model. Its queued-task cancellation does not guarantee that already running native computation stops: long operations need cooperative cancellation and stale-result checks. [NAPI-RS AsyncTask](https://napi.rs/docs/concepts/async-task).

Return compact batched results. Do not make a native call for every word or parse record. Specify whether every offset is UTF-16, UTF-8 or a character index and convert at the boundary. A native accelerator must not create a new path around the existing filesystem or agent-isolation checks.

Keep the JavaScript implementation as the verified fallback during a pure-computation pilot. Do not retry partially completed writes through a different implementation. Build and test actual Mac arm64, Mac x64 and Windows x64 artifacts; an Apple silicon run is not proof of Intel or Windows behaviour.

### 5.5 Is the overall change worth it?

**Selective acceleration may be; a broad rewrite is not justified.** Advantages include efficient CPU work, predictable data structures, parallel execution and reuse of the existing Rust toolchain. Costs include a second service implementation language, foreign-function boundaries, native packaging, platform testing, larger maintenance scope and possible differences in parsing or merge behaviour.

Memory safety does not establish filesystem safety or correct document edits. Extra native code can also increase startup time or installer size while Node remains required. Spectrum's Rust release profile currently optimises for size (`opt-level = "s"`); any pilot should be measured with the actual shipping profile, including conversion and startup costs.

## 6. Measurement and decision gates

This investigation did not collect CPU profiles, timings, memory measurements or a JavaScript-versus-Rust benchmark. The first implementation task is therefore measurement, not a port.

Use representative fixtures: a small assignment, a multi-file thesis, a large bibliography, a project with many images, and the planned large Git repository case. Include Unicode/CRLF and both local and slower storage. Use disposable fixtures or explicitly authorised copies, not live documents or accounts.

Measure cold startup and warm use separately. Record user-action duration, median and p95 latency (the time within which 95% of runs finish), backend event-loop delay, CPU time, process-tree memory, bytes/files read, repeated work and time in external tools or network waits. Track typing and unrelated requests during indexing, reference imports and backups. Node supplies event-loop delay instrumentation. [Performance APIs](https://nodejs.org/docs/latest-v24.x/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions).

Compare three versions on the same inputs and machine:

1. The released/approved JavaScript baseline.
2. JavaScript with the unnecessary work and blocking behaviour addressed.
3. The optional Rust prototype, including its binding, copying, queueing and startup costs.

Proposed acceptance gates, to confirm once a baseline exists:

- Correctness and recovery parity are mandatory; a faster wrong result fails.
- Require a noticeable end-to-end improvement, not just a faster inner loop. An initial target is at least 20% lower p95 latency with at least 50 ms saved for an interactive action on the affected representative workload; slower background operations should have an agreed absolute target.
- Small-project responsiveness must not regress materially. Review startup, memory and installer-size changes alongside speed.
- A pilot must outperform the **optimised** JavaScript implementation. If it does not, stop the Rust work and retain the simpler implementation.
- Require packaged-platform verification before release, with cancellation, failures and the existing isolation/rollback tests preserved.

Do not promise a universal speed-up based on the programming language or another project's benchmark.

## 7. Proposed delivery order

| Stage | Work | Exit condition |
| --- | --- | --- |
| 2.1 A | Baselines; installed grammar metadata/version; pinned update procedure | Reproducible engine identity and an agreed performance baseline |
| 2.1 B | Harper package compatibility trial; selected checker/language; local LanguageTool adapter and shared panel | Correct source edits, clear failures, language/spelling behaviour and privacy controls |
| 2.1 C | Async/batched reference conversion; inventory/cache improvements; remove measured unnecessary work | Measured responsiveness improvements without changing document semantics |
| 2.1 D, optional | One Rust pilot for the strongest remaining CPU hotspot | Meets the agreed correctness, performance and platform gates, or is deliberately dropped |
| Release review | Regression, packaged Mac/Windows checks, licences, rollback and user verification | User approves the actual release; this plan alone is not approval |

Only add a managed LanguageTool runtime downloader after the local-server integration works and its size, update and licensing costs are acceptable. A full backend rewrite, a new PDF renderer, a new Git merge policy and a new TeX decoder are outside the proposed 2.1 scope.

## 8. Decisions still to confirm before implementation

- Which additional languages and regional variants matter, including any mixed-language documents?
- Is a configured local LanguageTool server sufficient initially, or is one-click engine installation required for the first release?
- Should hosted LanguageTool be included immediately, or follow local support?
- Which real user actions feel slow enough to prioritise in the baseline?

These do not block the research document. They determine the implementation scope after the user approves proceeding.

## 9. Research limits

The source review and cited upstream documentation establish current integration choices and plausible bottlenecks. They do not establish measured speed-ups, language quality on the user's writing, native-addon compatibility, packaged LanguageTool behaviour or completed 2.1 functionality. No application changes, package installations, benchmarks, tests, commits, pushes or releases were performed for this plan.
