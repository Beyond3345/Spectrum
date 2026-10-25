# Spectrum 2.0 phase 5: build plan

Written 25 October 2026 for the agent that builds phase 5. It is deliberately specific: follow it step by step, in order, and commit after each step. Where a fact here turns out to be wrong (a release file name, a checksum, a command line flag), follow what the real program or release does, and write the difference down under "Phase 5 notes" in [SPECTRUM_2_HANDOFF.md](SPECTRUM_2_HANDOFF.md).

Phase 5 is plan section 10b (engines: Tectonic and Typst built in, Typst and Markdown projects) and the Typst part of section 10c (the diagram composer's Typst mode). Read [SPECTRUM_2_PLAN.md](SPECTRUM_2_PLAN.md) sections 10b, 10c and Ground rules once before starting. This file is the authority where the two differ in detail.

## 0. Before you start

### Where to work

- Repository: `/Users/beyond555/Documents/CodingProjects/OpenPrism/spectrum`.
- Run `git switch -c build/p5 feat/2.0` from the newest `feat/2.0`. Work only on `build/p5`. Do not merge into `feat/2.0` and do not touch `main`. The phase is tested and merged by someone else after you finish.
- Leave `docs/SPECTRUM_2_1_PLAN.md` alone (untracked research, never commit it).

### Rules you must not break

1. Never read, list or write the user's real data: `~/Library/Application Support/com.beyond3345.spectrum`, `~/Library/CloudStorage`, `~/SynologyDrive`, `~/Documents/Spectrum`, `~/Zotero`, the real `~/.claude`, `~/.codex` or `~/.agents`. Every test and experiment uses folders made with `mktemp -d` for `SPECTRUM_DATA_DIR`, `SPECTRUM_PROJECTS_DIR`, `SPECTRUM_TEMPLATE_DIR`, `HOME` and `TMPDIR`.
2. Never contact the user's Zotero (port 23119) or their GitHub account. Downloading public release files from github.com (Typst, Tectonic, pandoc) and reading the public, unauthenticated release API (`curl -s https://api.github.com/repos/typst/typst/releases/tags/v0.15.1`) is allowed. Do not use `gh`.
3. Never run `npm run desktop:build` or `npx tauri build`, never open a built Spectrum.app (it claims the default apps), never run `arch -x86_64` or anything under Rosetta. Never push, tag or release.
4. No paid model calls in tests.
5. Going back to 1.10.4 must keep working: never add keys to `project.json`. Per-project choices go in `.spectrum/settings.json` under `compile` (step 3).
6. Oleafly (`/Users/beyond555/Documents/CodingProjects/Oleafly-main`, AGPL) and CircuiTikZ-Designer (GPL) are ideas only. Copy no code or text from them. Spectrum stays MIT.
7. Style:
   - Code reads like the code around it: the same naming, comment density and idioms. Reuse the helpers named in this plan instead of writing new ones.
   - Mark a deliberate shortcut with a `ponytail:` comment that names its limit.
   - UI text is Australian English with curly quotes and apostrophes (’ “ ”), for example “Couldn’t compile”.
   - Docs (README, CHANGELOG, handoff) have no contractions, no em dashes and no Oxford commas.
8. Commits are small, in the repository's style (look at `git log`), and every message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with `git commit`; never amend or rebase commits that are not yours.
9. New npm packages are pinned to exact versions (`npm install --save-exact`), and `package.json` and `package-lock.json` are committed together.

### Setting up

- `node_modules` already exists in the checkout. Run `npm install` only after adding a package.
- `node scripts/desktop.mjs texlab` puts TexLab in `src-tauri/binaries/` (gitignored). The backend tests want TexLab on the `PATH`: `export PATH="$PWD/src-tauri/binaries/texlab-dir:$PATH"` after copying `src-tauri/binaries/texlab-aarch64-apple-darwin` to `src-tauri/binaries/texlab-dir/texlab` (the folder is gitignored too).
- The checks (run all of them at the end of every numbered section below, and fix what fails before committing):

| Check | Command |
| --- | --- |
| Backend tests | `cd apps/backend && node --test "test/*.test.js"` |
| One backend test file | `cd apps/backend && node --test test/<name>.test.js` |
| Typecheck | `npm run typecheck` |
| Frontend build | `npm run build` |
| A frontend self-check | `npx esbuild apps/frontend/src/<path>.check.ts --bundle --platform=node --log-level=warning \| node` |
| Native tests (only if you change Rust) | `cd src-tauri && TAURI_CONFIG='{"bundle":{"externalBin":[],"resources":null}}' cargo test` |

Before you change anything, run the backend tests and the typecheck once and write down the counts, so you know which failures are yours.

## 1. Fetch Tectonic and Typst at build time

Files: `scripts/desktop.mjs`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, new `apps/backend/src/data/engines.json`.

1. Create `apps/backend/src/data/engines.json`. It is the one list of engine versions and checksums, read by `desktop.mjs` and by the backend:

   ```json
   {
     "tectonic": { "version": "0.17.0", "assets": { "arm64": ["<file>", "<sha256>"], "x64": ["<file>", "<sha256>"], "win-x64": ["<file>", "<sha256>"] } },
     "typst": {
       "builtIn": "0.15.1",
       "versions": [
         { "version": "0.15.1", "released": "2026-07-17", "assets": { "arm64": ["<file>", "<sha256>", <bytes>], "x64": [...], "win-x64": [...] } },
         { "version": "0.14.2", ... }, { "version": "0.13.1", ... }, { "version": "0.12.0", ... }
       ]
     },
     "pandoc": { "version": "3.12.1", "minimum": { "latex": "3.1", "typst": "3.8.3" }, "assets": { "arm64": [...], "x64": [...], "win-x64": [...] } }
   }
   ```

   Fill it from the real releases:
   - Typst: `curl -s https://api.github.com/repos/typst/typst/releases/tags/v<version>` lists each asset's `name`, `size` and, from 0.14 on, `digest` (`sha256:…`). The expected names are `typst-aarch64-apple-darwin.tar.xz`, `typst-x86_64-apple-darwin.tar.xz` and `typst-x86_64-pc-windows-msvc.zip`. For 0.13.1 and 0.12.0, which have no digest, download each asset once into a `mktemp -d` folder, run `shasum -a 256`, and record that.
   - Tectonic: the tag is `tectonic@0.17.0` (check `https://api.github.com/repos/tectonic-typesetting/tectonic/releases`). Expected names: `tectonic-0.17.0-aarch64-apple-darwin.tar.gz`, `tectonic-0.17.0-x86_64-apple-darwin.tar.gz` and `tectonic-0.17.0-x86_64-pc-windows-msvc.zip`. If 0.17.0 does not exist, use the newest release that has both Mac architectures and Windows, and note it. If there is no Apple Silicon build at all, stop this step and write that in the handoff: never ship an Intel-only Tectonic.
   - pandoc: `https://api.github.com/repos/jgm/pandoc/releases/tags/3.12.1`. Expected names: `pandoc-3.12.1-arm64-macOS.zip`, `pandoc-3.12.1-x86_64-macOS.zip` and `pandoc-3.12.1-windows-x86_64.zip`. pandoc is never bundled; these are for the download in step 2.
2. In `desktop.mjs`, add Tectonic and Typst the way TexLab is done (`TEXLAB`, `texlabMac`, `texlabRuntime`, `sidecar`, `verifiedDownload`):
   - `tectonicBinary(arch)` and `typstBinary(arch)` download the asset for that arch (`arch` is `arm64` or `x64`, Windows uses the `win-x64` entry) with `verifiedDownload`, extract only the executable into `cacheDir/<name>-<version>-<arch>/` (Mac `tar -xf`, Windows `winTar -xf`), and return its path. Typst's archive holds the binary in a folder named after the asset (`typst-aarch64-apple-darwin/typst`); Tectonic's holds `tectonic` at the top. Check with `tar -tf` and adjust.
   - `tectonicRuntime(arches)` and `typstRuntime(arches)` call `sidecar('tectonic', …)` and `sidecar('typst', …)`, which already writes `binaries/<name>-<triple>` and the universal binary with `lipo`.
   - Call both from `resources()` after `texlabRuntime`, and from `dev()` with the same "only when missing" check as TexLab.
   - Add commands `tectonic` and `typst` to `commands` and the usage line, so `node scripts/desktop.mjs typst` fetches Typst alone.
   - Windows only: Typst needs `vcruntime140.dll`. In `resources()` on Windows, find it in the Visual Studio redistributable folder (`vswhere -latest -property installationPath`, then `VC/Redist/MSVC/<newest>/x64/Microsoft.VC143.CRT/vcruntime140.dll`) and copy it to `src-tauri/resources/engines/vcruntime140.dll`. Add `"resources/engines/": "engines/"` to `bundle.resources` in `tauri.conf.json`, and create the folder (empty) on the Mac in `resources()` and `dev()` so Tauri does not complain.
3. In `tauri.conf.json` add `"binaries/tectonic"` and `"binaries/typst"` to `bundle.externalBin`.
4. In `src-tauri/src/main.rs`, where `SPECTRUM_TEXLAB` is set (search for it), set `SPECTRUM_TECTONIC` and `SPECTRUM_TYPST` the same way (`dir.join(format!("tectonic{}", env::consts::EXE_SUFFIX))`), and set `SPECTRUM_ENGINES_RESOURCE_DIR` to `resources.join("engines")` next to `SPECTRUM_NATIVE_DIR`.
5. Run `node scripts/desktop.mjs typst` and `node scripts/desktop.mjs tectonic` and check `src-tauri/binaries/` has `typst-aarch64-apple-darwin`, `typst-x86_64-apple-darwin`, `typst-universal-apple-darwin` and the same for Tectonic. Run `src-tauri/binaries/typst-aarch64-apple-darwin --version`. Do not run the x86_64 files.

Done when: both commands work twice in a row (the second time from the cache), `lipo -info` on each universal file lists both architectures, and `cargo test` (with the `TAURI_CONFIG` above) passes.

## 2. The engines service and its routes

Files: new `apps/backend/src/services/engineService.js`, new `apps/backend/src/routes/engines.js`, `apps/backend/src/index.js` (register the routes the way the others are registered), new `apps/backend/test/engines.test.js`.

1. `engineService.js` exports:
   - `builtInTectonic()` and `builtInTypst()`: the path in `SPECTRUM_TECTONIC` or `SPECTRUM_TYPST` when that file exists; else, for development, `path.join(REPO_ROOT, 'src-tauri', 'binaries', `typst-${triple}${exe}`)` when it exists (`triple` is `aarch64-apple-darwin`, `x86_64-apple-darwin` or `x86_64-pc-windows-msvc` from `process.platform` and `process.arch`); else `null`.
   - `typstFor(version)`: the executable for a Typst version. An empty `version` or the built-in version gives `builtInTypst()`; a version installed under `DATA_DIR/engines/typst/<version>/typst(.exe)` gives that; otherwise `null`. Validate `version` with `/^\d+\.\d+\.\d+$/` before it touches a path.
   - `pandocPath()`: `DATA_DIR/engines/pandoc/pandoc(.exe)` when it exists, else `findExecutable('pandoc')` from `compileService.js`; `null` when neither.
   - `versionOf(executable)`: runs it with `--version` (`execFile`, 20 second timeout, `windowsHide: true`) and returns the first `\d+\.\d+(\.\d+)?` in the output, or `null`.
   - `listEngines()`: the shape `GET /api/engines` returns:

     ```js
     {
       tectonic: { builtIn: '0.17.0' | null, system: { path, version } | null },
       typst: { builtIn: '0.15.1' | null, system: { path, version } | null, installed: ['0.14.2'], available: [{ version, released, size }] },
       pandoc: { found: { path, version, fromDownload: true|false } | null, minimum: { latex: '3.1', typst: '3.8.3' }, downloadable: '3.12.1' }
     }
     ```

     `builtIn` is the version from `engines.json` when the built-in binary exists, else `null`. `system` is a `typst` or `tectonic` found on the `PATH` by `findExecutable`. `available` lists every version in `engines.json` that is not built in, with the size of this platform's asset.
   - `installTypst(version)`, `removeTypst(version)` and `installPandoc()`:
     - Look the asset up in `engines.json` for `process.arch` (`win-x64` on Windows). Refuse versions not listed there.
     - Download from `${ENGINE_DOWNLOAD_BASE}/…`, where `ENGINE_DOWNLOAD_BASE` is `process.env.SPECTRUM_ENGINE_DOWNLOAD_BASE` or `https://github.com`. The Typst URL is `/typst/typst/releases/download/v<version>/<file>` and pandoc's is `/jgm/pandoc/releases/download/<version>/<file>`. Tests point the base at a local server.
     - Stream the body to `<DATA_DIR>/engines/tmp/<random>.part`, check its SHA-256 against `engines.json` (delete the file and throw “The download didn’t match its checksum, so it wasn’t installed.” when it differs), extract into a fresh `<DATA_DIR>/engines/tmp/<random>/` with `tar -xf` (`%SystemRoot%\System32\tar.exe` on Windows), find the one executable inside (`typst`, `pandoc`, or with `.exe`), check that its real path is still inside that folder (no links out), move it to `DATA_DIR/engines/typst/<version>/` or `DATA_DIR/engines/pandoc/`, `chmod 0o755`, and remove the temp files.
     - On Windows, copy `vcruntime140.dll` from `SPECTRUM_ENGINES_RESOURCE_DIR` beside each downloaded `typst.exe`.
     - One install at a time per engine: use `serialiser()` from `projectService.js`.
     - `removeTypst` refuses the built-in version and deletes only `DATA_DIR/engines/typst/<version>`.
2. `routes/engines.js`:
   - `GET /api/engines` → `listEngines()`.
   - `POST /api/engines/typst/install` with `{ version }` → `{ ok: true, engines: listEngines() }`.
   - `DELETE /api/engines/typst/:version` → the same.
   - `POST /api/engines/pandoc/install` → the same.
   - Errors go out as the other routes send them (look at `routes/zotero.js` for `httpError` use).
3. Tests in `engines.test.js`, each with its own temp `DATA_DIR` set before importing the service (copy how `test/zotero.test.js` sets environment variables and imports):
   - `listEngines()` with fake executables: write small shell scripts that print `typst 0.13.1 (abc)` and `pandoc 3.1.2` into a temp folder on the `PATH`.
   - An install served by a local `http.createServer` that returns a `.tar.gz` you build in the test (with `tar -czf`) holding a fake `typst`. Put its real SHA-256 into a copy of `engines.json` (export a way to override the list for tests, for example `useEngineList(list)`).
   - A wrong checksum leaves nothing behind.
   - An unknown version and `../x` as a version are refused.
   - `removeTypst` of the built-in version is refused.

Done when: the new tests pass and `curl -s localhost:<port>/api/engines` on a running backend returns the shape above.

## 3. Per-project engine settings

Files: `apps/backend/src/routes/projects.js` (`COMPILE_SETTINGS`), `apps/frontend/src/api/client.ts` (`CompileOptions`), `apps/frontend/src/app/settings.ts` (`cleanCompile`, `CompileDefaults`).

1. Add two keys to `COMPILE_SETTINGS` in `routes/projects.js`:
   - `typstVersion: (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v)`;
   - `markdownEngine: (v) => v === 'latex' || v === 'typst'`.
2. Add `typstVersion?: string` and `markdownEngine?: 'latex' | 'typst'` to `CompileOptions` in `client.ts`, with a one-line comment each.
3. Add both to the app defaults (`CompileDefaults` in `settings.ts` and `cleanCompile`): `typstVersion` defaults to `''` (the built-in version) and `markdownEngine` to `'latex'`.
4. Nothing goes in `project.json`.

Done when: a PATCH of `/api/projects/:id/settings` with `{ compile: { typstVersion: '0.14.2' } }` is stored in `.spectrum/settings.json`, `{ typstVersion: '../x' }` is refused with 400, and `settings.check.ts` passes.

## 4. Typst compiles

Files: new `apps/backend/src/services/typstService.js`, `apps/backend/src/services/compileService.js`, `apps/backend/src/routes/compile.js`, new `apps/backend/test/typst.test.js`.

1. In `compileService.js` `runCompile`, right after the main file is read (before the `% !TEX root` handling), send a `.typ` main file to `compileTypst` from `typstService.js` inside the same job bookkeeping (`job`, `running`, `jobs.run`, the checkpoint and `doc: mainFile` in the result). The simplest way: in `compileWithLinks`, if `/\.typ$/i.test(absMain)`, return `compileTypst(projectRoot, absMain, mainFile, options)` before anything else. Do the same in `compileFolder` (the agent's and the review's compiles) by checking the extension before `compileDocument`.
2. `compileTypst(projectRoot, absMain, mainFile, options)`:
   - Read the project's settings with `readProjectSettings(projectRoot)` and take `compile.typstVersion` (an empty value means built in). `options.typstVersion`, when given, wins (the composer passes none).
   - `typstFor(version)`; when `null` return `{ ok: false, code: 'TYPST_VERSION_MISSING', version, error: `Typst ${version} isn’t installed on this computer. Download it, or use the default version.` }`. When there is no Typst at all return `{ ok: false, error: 'Typst isn’t available in this copy of Spectrum.' }`.
   - Make `outDir` as `compileWith` does (`path.join(options.buildDir || path.join(os.tmpdir(), 'spectrum-build'), crypto.randomUUID())`) and remove it at the end with `cleanBuild`.
   - Arguments: `['compile', '--root', projectRoot, '--diagnostic-format', 'short', ...fontArgs, ...inputArgs, absMain, path.join(outDir, `${base}.pdf`)]`, where `fontArgs` is `['--font-path', <projectRoot>/fonts]` only when that folder exists, and `inputArgs` is `--input key=value` for each entry of `options.typstInputs` (step 4.5).
   - Environment: `{ ...process.env, TYPST_PACKAGE_CACHE_PATH: options.scratch ? <home>/typst-packages : path.join(DATA_DIR, 'typst', 'packages') }`. For a scratch compile (agent or review), `<home>` is `process.env.HOME`, which is the agent's home inside isolation; Spectrum's own cache folder is never passed into a sandbox.
   - Run it with `runSpawn(executable, args, path.dirname(absMain), pushLog, env)` so Stop and the time limit work as for TeX. Collect the log as `compileWith` does (`pushLog`, `MAX_LOG_BYTES`).
   - Stopped, timed out and no-PDF results return exactly what `compileWith` returns in those cases.
   - On success write the PDF beside the main file (`<base>.pdf`, with the same Windows `EBUSY` handling as `compileWith`; move that bit into a small shared function rather than copying it) and return `{ ok: true, pdf, pdfPath, log, status, engine: 'typst', typstVersion: <version used>, errors }`.
   - When the log has `failed to download package` or `failed to load package` (check the real wording by importing `@preview/cetz:0.4.2` with the network off, for example `HTTPS_PROXY=http://127.0.0.1:9`), add the line `[spectrum] Typst downloads a package the first time a document imports it. Connect to the internet and compile again; after that it works offline.` to the log.
3. `parseTypstDiagnostics(log, projectRoot)` in `typstService.js` returns `[{ severity: 'error' | 'warning', message, file, line, column }]`. Write it from real output: make a project with a broken `main.typ` (an unknown variable, an unclosed bracket, a missing file in `#include`, a warning such as an unused label) and record what `--diagnostic-format short` prints. It is expected to look like `main.typ:3:1: error: unknown variable: foo`, possibly followed by `hint: …` lines; add each hint to its diagnostic's message. File paths come back relative to the root or absolute: make them project relative with forward slashes.
4. The result's `errors` replaces the LaTeX log parser for Typst compiles: in `EditorPage.tsx`, where `parseCompileLog(compileLog, …)` is called (search for it), use `result.errors` when the last compile returned them. Keep the result's `errors` in state next to `compileLog`.
5. `routes/compile.js`: accept an optional `typstInputs` object in the body. Validate it: at most 8 keys, each key `/^[a-z][a-z0-9-]{0,31}$/`, each value a string of at most 200 characters without newlines; otherwise return `{ ok: false, error: 'Invalid typstInputs.' }`. Pass it through `runCompile` to `compileTypst`. Add `typstInputs?: Record<string, string>` to `compileProject`'s payload type in `client.ts`.
6. `engine` stays as it is for `.typ` files (the editor still sends one). `compileTypst` ignores it and the result says `engine: 'typst'`. Add `['typst', 'Typst']` to nothing: Typst is not a choice in the LaTeX compiler list.
7. Tests in `typst.test.js`: `parseTypstDiagnostics` on the recorded outputs (always run). With the real Typst (`builtInTypst()` not null, otherwise `t.skip`): a project with `main.typ` compiles and writes `main.pdf`; a broken one returns `ok` with errors that have the right file and line, or `ok: false` with errors, whichever Typst gives; a missing pinned version returns `TYPST_VERSION_MISSING`; `typstInputs` reach the document (`#sys.inputs.at("x")` printed into the PDF text; check with the PDF's bytes or `pdftotext` if installed, else only check that the compile succeeds with and without the input); invalid `typstInputs` are refused by the route.

Done when: the new tests pass, and in the browser (step 22) a Typst project compiles, shows its PDF, and a broken line shows an error card that jumps to the line.

## 5. Tectonic built in

Files: `apps/backend/src/services/compileService.js`, `apps/frontend/src/app/settings.ts`, `apps/frontend/src/app/SettingsSheet.tsx`, tests in `apps/backend/test/compile-engines.test.js` (new).

1. In `findExecutable` callers that look for `tectonic` (in `autoEngineCandidates`, and where `compileWith` runs the command), use the built-in Tectonic when one exists: add a small `engineCommand(engine)` that returns `builtInTectonic() ?? 'tectonic'` for `'tectonic'` and the name itself for the others, and use it for `buildCommand`'s `cmd` and in `autoEngineCandidates`' installed check. `runSpawn` takes an absolute path as the command.
2. Auto's order stays: installed pdfLaTeX, XeLaTeX or LuaLaTeX first, then Tectonic, then latexmk (the list in `autoEngineCandidates`). So Auto falls back to the built-in Tectonic only when no TeX is installed.
3. The Biber guard, in `autoEngineCandidates`: when the document loads biblatex (the same test as `citationCommand` in `apps/frontend/src/editor/shared.tsx`: `\usepackage{biblatex}` or `\addbibresource`) and does not set `backend=bibtex`, drop `tectonic` from the candidates when any other engine is installed. When Tectonic is the only one, compile with it anyway and add to the log: `[spectrum] biblatex with Biber needs TeX Live or MiKTeX (or use backend=bibtex), which the built-in Tectonic can’t run.` Keep the existing "biblatex control file version" message.
4. Download failures: when a Tectonic compile fails and its log shows a failed download (reproduce it with a fresh fake `HOME` and `HTTPS_PROXY=http://127.0.0.1:9`, and match the wording you see), set the result's `error` to `Tectonic couldn’t reach its server to download the TeX packages this document needs. Check the internet connection and compile again, or install TeX Live (MacTeX on a Mac, MiKTeX on Windows).` The editor already shows `error` and has a Compile button for trying again.
5. Windows fonts: before running Tectonic on Windows, write `DATA_DIR/engines/fonts.conf` once (if missing) with `<dir>C:\Windows\Fonts</dir>`, `<dir>%LOCALAPPDATA%\Microsoft\Windows\Fonts</dir>` (the expanded path from `process.env.LOCALAPPDATA`) and `<cachedir>DATA_DIR\engines\fontconfig-cache</cachedir>`, and pass `FONTCONFIG_FILE` pointing at it in Tectonic's environment. Use the fontconfig XML header (`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>…</fontconfig>`).
6. Label: in `settings.ts` `COMPILE_ENGINES`, rename `['tectonic', 'Tectonic']` to `['tectonic', 'Tectonic (built in)']`. In the Engines pane's Compiler hint add: “When no TeX is installed, Auto uses the built-in Tectonic, which downloads each package the first time a document needs it.”
7. Tests (`compile-engines.test.js`, using fake executables on a temp `PATH` that write a tiny PDF and log, as the existing compile tests do; look at `test/compile*.test.js` for the pattern): Auto picks pdfLaTeX over the built-in Tectonic; with only Tectonic, Auto picks it; a biblatex document skips Tectonic when XeLaTeX exists; with only Tectonic it adds the Biber note; a log with the download failure gives the new error.

Done when: these tests pass and the existing compile tests still pass.

## 6. Markdown compiles

Files: new `apps/backend/src/services/markdownService.js`, `compileService.js`, `routes/projects.js` (two routes), new `apps/backend/test/markdown.test.js`.

1. In `compileWithLinks` and `compileFolder` (as in step 4.1), send a `.md` main file to `compileMarkdown(projectRoot, absMain, mainFile, engine, options)`.
2. `compileMarkdown`:
   - `pandocPath()`; when `null` return `{ ok: false, code: 'PANDOC_MISSING', error: 'Markdown needs pandoc. Download it from Settings › Engines › Markdown.' }`. When its version is below `minimum.latex` (or `minimum.typst` for the Typst engine) return `code: 'PANDOC_OLD'` with “This pandoc (3.0.1) is too old for Spectrum. Download pandoc 3.12.1 from Settings › Engines › Markdown.”
   - Choose the PDF engine: `compile.markdownEngine` from the project's settings (`'latex'` by default).
   - Bibliographies: read the YAML front matter (the block between a first line `---` and the next `---` or `...`) with the `yaml` package if it is already a dependency (check `package.json`), otherwise a small parser for `bibliography:` (a string or a list) and `csl:`. When there is no `bibliography:`, pass every `.bib` in the project (`listFilesRecursive`) as `--bibliography`. Always pass `--citeproc`.
   - **LaTeX engine:** run `pandoc <absMd> --from=markdown --to=latex --standalone --citeproc <bibliography args> --resource-path=<mdDir><delimiter><projectRoot> --extract-media=<cache>/generated/media -o <cache>/generated/<mainFile>.tex` with `runSpawn` (cwd `mdDir`), where `<cache>` is `cachePath(projectRoot)` for project compiles and `options.buildDir` for scratch ones. pandoc errors (non-zero exit) return `{ ok: false, error: 'pandoc couldn’t read this Markdown.', log, errors }`, where `errors` comes from pandoc's `line N, column M` messages, with `file: mainFile`.
     Then compile the generated `.tex` with the existing `compileDocument(engine, projectRoot, generatedTex, mainFile, { ...options, markdownSource: absMd })`. Change `compileWith` so that when `options.markdownSource` is set: TEXINPUTS also has the `.md` file's folder (add it to `searchPath`, and `-Z search-path=` for Tectonic), the PDF is written beside the `.md` (`<base>.pdf`) instead of beside the generated file, SyncTeX is not kept, and the kept build files and `.aux` are stored under the `.md`'s project path (`doc`). Keep every other behaviour (Stop, time limits, draft, error handling, log).
   - **Typst engine:** run pandoc with `--to=typst --standalone` to stdout (no `-o`), then rewrite every relative `image("…")` path in the output to be root relative (`/<mdDir relative to the project>/<path>`), and compile it with `typst compile --root <projectRoot> - <outDir>/<base>.pdf` with the text on standard input (check that `-` reads the main file from standard input on Typst 0.12.0; if it does not, write the text to `<projectRoot>/.spectrum/generated/<mainFile>.typ` and compile that file instead). Save the generated text to `<cache>/generated/<mainFile>.typ` for "Show generated Typst". Reuse `compileTypst`'s spawning and PDF writing from step 4; split them into a shared function rather than copying.
   - SVG images: when the Markdown has `.svg` images and the LaTeX engine is used, check for `rsvg-convert` with `findExecutable`; when it is missing add `[spectrum] SVG images need rsvg-convert (brew install librsvg), so they were left out.` to the log.
   - **Errors back to the `.md`:** for each TeX error with a line in the generated file (parse the log with the same pattern as `logErrors` in `apps/backend/src/mcp/tools.js`) or Typst diagnostic, take that line of the generated text, keep its words (strip `\command`, braces and Typst markup), and look for the first run of 6, then 4 words in the `.md`, as `findInSource` in `EditorPage.tsx` does. Return `errors` with `file: mainFile` and the `.md` line found, or no line when none is found.
   - The result carries `engine` (the LaTeX engine used, or `'typst'`) and `generated: 'latex' | 'typst'`.
3. `GET /api/projects/:id/generated?doc=<path.md>` returns `{ ok: true, text, kind: 'latex' | 'typst' }` from `<cache>/generated/`, or 404 when nothing has been generated yet.
4. Exports, in `routes/projects.js`:
   - `POST /api/projects/:id/export/docx` with `{ doc }`: run pandoc `<doc> --citeproc <bibliography args> -o <projectRoot>/<base>.docx` (never overwrite a file of that name that is not a previous export: if one exists, use `<base> (2).docx` and so on) and return `{ ok: true, path }`.
   - `POST /api/projects/:id/export/latex` with `{ doc }`: generate the LaTeX as above into a temp folder, then `createProject({ name: '<project name> (LaTeX)', populate })` from `projectService.js`, where `populate` writes `main.tex` (the generated text), copies every `.bib`, the `.md`'s images (the `media` folder pandoc extracted) and `figures/`, and returns `{ ok: true, project }`. The new project's `mainFile` is `main.tex` (pass it in `meta`).
5. Tests in `markdown.test.js`: with a fake `pandoc` script on the `PATH` that writes a fixed `.tex` (always run): the two-step compile reaches the fake TeX engine with the generated file, the PDF lands beside the `.md`, a TeX error maps back to the right `.md` line, a missing pandoc gives `PANDOC_MISSING`, an old one `PANDOC_OLD`. With a real pandoc on the `PATH` (skip otherwise) and real TeX (skip otherwise): an article with a citation from `refs.bib` compiles.

Done when: the tests pass, and in the browser (step 22) a Markdown article compiles through LaTeX and through Typst.

## 7. Document insights data from Typst

Files: `typstService.js`, `apps/backend/src/routes/projects.js` (the `/stats` route), `statsService.js`.

1. Check what Typst 0.15.1 offers: run `typst eval --help` and `typst query --help` with the built-in binary. The aim is one call after a successful compile that returns headings, figures, block equations and citations, each with its page.
2. If `typst query <main> 'heading' --root <root> --format json` returns each element's location or page, use `query` for headings, `figure` and `math.equation` (block only) and `cite`. If it does not, and `typst eval` can evaluate code in the document's context (for example `[#context query(heading).map(h => (level: h.level, body: repr(h.body), page: h.location().page()))]`), use that. If neither gives pages, return the elements without pages and write that in the handoff.
3. Expose it from `/api/projects/:id/stats?doc=<x.typ>`: when `doc` ends with `.typ`, return `{ labels, headings }` in the same shape `documentLabels` returns for LaTeX (read `statsService.js` `documentLabels` and `parseHeadings` for the shape). Cache the answer per document in memory keyed by the PDF's modification time, so it is not run on every request.
4. A test with the real Typst (skip without it): a document with two headings and a labelled figure on page 2 returns them with their pages.

## 8. Engines inside the agent sandbox

Files: `apps/backend/src/services/agentSessionService.js` (`toolsLaunch`), `apps/backend/src/mcp/tools.js`.

1. In `toolsLaunch`, add `path.join(DATA_DIR, 'engines')` to `reads` (it is filtered to existing paths already), and the folders of `builtInTectonic()` and `builtInTypst()` when they are not already inside a listed folder. Nothing else in `DATA_DIR` is added.
2. The tools server inherits the environment, so `SPECTRUM_TYPST`, `SPECTRUM_TECTONIC` and `SPECTRUM_DATA_DIR` reach `compileFolder` inside isolation. Check that `typstFor` and `pandocPath` work there by running an agent compile of a Typst and a Markdown project in the existing opt-in sandbox test (`test/agent-sandbox.test.js`; see how it is enabled) or, if that cannot run here, by reading the code path and saying so in the handoff.
3. `logErrors` in `mcp/tools.js`: also collect Typst's `file:line:col: error:` lines so `get_log` lists them.
4. The Windows draft preview (`previewDraft`) refuses Typst and Markdown drafts with “Preview PDF on Windows supports LaTeX drafts only for now.” (`ponytail:` comment: Typst's own sandboxing on Windows is unexplored).

## 9. Frontend: what kind of file is this

File: `apps/frontend/src/editor/shared.tsx`.

1. Add next to `isTex`:

   ```ts
   export type DocKind = 'latex' | 'typst' | 'markdown';
   /** The kind of document a file is, by its extension; null for anything else (.bib, images). */
   export const docKind = (path: string): DocKind | null =>
     /\.(tex|ltx)$/i.test(path) ? 'latex' : /\.typ$/i.test(path) ? 'typst' : /\.(md|markdown)$/i.test(path) ? 'markdown' : null;
   export const isDocument = (path: string) => docKind(path) !== null;
   ```

2. Go through every `isTex(` call (there are about 22; `grep -rn "isTex(" apps/frontend/src`) and decide for each whether it means "a LaTeX file" (keep `isTex`) or "a document the user writes in" (use `isDocument`). Rules:
   - Citation and figure insertion, the outline, Document insights, PDF jumps and "Set as main file" use `isDocument`.
   - TexLab, the LaTeX syntax check, `\documentclass` detection and preamble edits keep `isTex`.
3. In `EditorPage.tsx`:
   - add `typ` to `TEXT_FILE`;
   - change `pdfOf` to replace any of `.tex`, `.typ` and `.md` with `.pdf`;
   - make the "no .tex file to compile" message say “There’s no document to compile. Add one, or choose “Set as main file” from a file’s menu.”;
   - skip the TexLab syntax check (`syntaxCheckPasses`) when the document is not `.tex`.
4. The file tree's "Set as main file" (`FileTree.tsx`, search for it) offers `.typ` and `.md` files too.

## 10. Editor language by file

Files: `apps/frontend/src/app/EditorPage.tsx`, new `apps/frontend/src/editor/languages.ts`, `package.json`.

1. `npm install --save-exact codemirror-lang-typst@0.6.0 @codemirror/lang-markdown@<the version matching the installed @codemirror/language>` (check `npm ls @codemirror/language` and pick a `@codemirror/lang-markdown` release that uses the same major version). Read `node_modules/codemirror-lang-typst/package.json` and its README for the `typst_lezer` entry point (the one that needs no WebAssembly) and how to import it. If that entry does not exist in 0.6.0, use plain text for Typst and note it.
2. `languages.ts` exports `languageCompartment = new Compartment()` and `languageFor(path: string): Extension`:
   - LaTeX files: the current `latex()`, `syntaxHighlighting(latexHighlight)`, `foldService.of(latexFoldService)`, `mathsWrap` and the LaTeX completion (move these out of the fixed list in `EditorPage.tsx`).
   - Typst: the `typst_lezer` language with its highlighting and folding. Load it with a dynamic `import()` the first time a `.typ` file opens; while it loads, and if it fails, the file shows as plain text (`[]`). Its own completions only when the project's Typst version (step 3) is empty or starts with `0.15`.
   - Markdown: `markdown()` from `@codemirror/lang-markdown`, which folds headings.
   - Anything else: `[]`.
3. In `EditorPage.tsx`, put `languageCompartment.of(languageFor(''))` in `extensionsRef.current` where `latex()` and the LaTeX-only extensions are now. In `openFile`, after `view.setState(...)`, dispatch `languageCompartment.reconfigure(languageFor(path))` (a saved state from `statesRef` keeps its own configuration, so reconfigure every time). For the async Typst load, reconfigure again when it finishes if the same file is still open.
4. `attachTexlab` already asks `texlabRef.current?.extensionFor(path)`; check that it returns nothing for `.typ` and `.md` (read `editor/lsp/texlab.ts`) and fix it if not.
5. `latexHighlight` styles CodeMirror's standard tags, so Typst and Markdown get colours without more work. Check both themes (light and dark) in the browser.

## 11. Outline and completion for Typst and Markdown

Files: `apps/frontend/src/editor/languages.ts` (or a new `apps/frontend/src/editor/outlines.ts`), `EditorPage.tsx`, a new `apps/frontend/src/editor/outlines.check.ts`.

1. `parseTypstOutline(text)` returns the same `OutlineItem[]` as `parseOutline` in `latexEditor.ts` (read its type): one item per line starting with one or more `=` followed by a space, outside raw blocks (```` ``` ````) and comments (`//`, `/* */`). Level = number of `=` minus one.
2. `parseMarkdownOutline(text)`: ATX headings (`#` to `####`), skipping fenced code blocks (```` ``` ```` and `~~~`) and the front matter. Setext headings (underlined with `===` or `---`) are optional.
3. In `EditorPage.tsx`, where `parsedOutline` is computed (search for `parseOutline(outlineText)`), choose the parser by `docKind(outlineFile)`. For Typst, also follow `#include "path"` lines one level deep, reading those files with `ensureFileContent`, so headings in included chapters show with their own `file`.
4. Completion: a new completion source in `languages.ts` added only for Typst and Markdown files:
   - in Typst, after `@` (not inside a word), offer `.bib` keys and `<label>` names found in the project's `.typ` files (`projectScanRef.current.bib` has the keys);
   - in Markdown, after `[@` or `; @` inside brackets, offer `.bib` keys.
5. `outlines.check.ts` with `eq` assertions like the other checks: headings at three levels, a heading inside a code block ignored, front matter ignored, a Typst comment ignored.

## 12. Citations, floats and Insert snippets by language

Files: `apps/frontend/src/editor/shared.tsx` (`citationText`), `apps/frontend/src/editor/floats.ts`, `apps/frontend/src/editor/tools/FloatsTab.tsx`, `EditorPage.tsx` (the Insert (+) list near line 235), `floats.check.ts`.

1. `citationText(api, keys)` uses `docKind(api.activePath)`:
   - LaTeX: as now.
   - Typst: `@key` for one key and `@a @b` for several. A key that does not match `/^[A-Za-z0-9_:.-]+$/` becomes `#cite(label("key"))`.
   - Markdown: `[@a; @b]`.
   Then every caller that checks `isTex(api.activePath)` before inserting a citation (Composer, ZoteroCite, ResearchPanel, CitationAssistant) uses `isDocument`. CitationAssistant adds `~` before the citation only for LaTeX.
2. `floats.ts`: add
   - `figureTypst({ path, width, caption, label })` → `#figure(image("path", width: 80%), caption: [caption]) <label>`;
   - `tableTypst(model)` → `#figure(table(columns: n, [a], [b], …), caption: [caption]) <label>`;
   - `figureMarkdown` → `![caption](path){#label width=80%}`;
   - `tableMarkdown(model)` → a pipe table with `Table: caption {#label}` under it.
   Escape `]` and `\` in Typst content and `|` in Markdown cells.
3. `FloatsTab.tsx`: where it builds the inserted text with `figureLatex`, `tableLatex` and `diagramLatex`, choose the function by `docKind(api.activePath)`. The preamble edits (`ensurePackages`) run only for LaTeX. Labels: Typst labels keep `fig:x` (valid in Typst); Markdown uses the same.
4. Insert (+) (the list near `{ label: 'Citation', icon: 'quote.opening', text: '\\cite{key}', select: 'key' }` in `EditorPage.tsx`): give each entry a `kinds` field and add Typst entries (heading `= Heading`, emphasis `_text_`, strong `*text*`, list `- item`, maths `$x$`, block maths `$ x $`, citation `@key`, reference `@fig:x`, comment `// `) and Markdown entries (heading `## Heading`, emphasis, strong, list, link `[text](url)`, maths `$x$`, citation `[@key]`, code block). Show only the entries for the open file's kind.
5. `floats.check.ts`: add cases for the new functions.

## 13. Spelling and grammar masks

Files: `apps/backend/src/latex/mask.js` and `mask.d.ts`, `apps/frontend/src/editor/spellcheck.ts`, `apps/backend/src/services/grammarService.js`, `apps/backend/test/language.test.js` (or a new `mask.test.js` beside it).

1. In `mask.js` add `maskTypst(source)` and `maskMarkdown(source)` with the same contract as `maskLatex`: the same length, newlines kept, markup replaced by spaces. Write them fresh:
   - Typst: blank comments, raw text and blocks (backticks), `$…$` maths, `#name(…)` calls including their arguments, except content in `[…]` (which is prose), labels `<x>`, references and citations `@x`, URLs and the `=` of headings.
   - Markdown: blank the front matter, fenced and indented code, inline code, HTML tags and comments, `$…$` and `$$…$$` maths, URLs and link targets (keep link text), image syntax, citations `[@key]` and `{#label}` attributes.
2. `spellcheck.ts`: `CHECKABLE` gets `typ`, and the masking chooses `maskLatex`, `maskTypst` or `maskMarkdown` by extension.
3. `grammarService.js` `checkGrammar`: `.typ` uses `maskTypst`; Markdown stays as it is (Harper reads Markdown itself).
4. Tests: a sample of each with words that must and must not survive the mask.

## 14. Document insights and Review for Typst and Markdown

Files: `apps/frontend/src/editor/insights.ts`, `apps/frontend/src/editor/InsightsPanel.tsx`, `apps/frontend/src/editor/tools/ReviewTab.tsx`, `apps/frontend/src/editor/preflight/run.ts`, `insights.check.ts`.

1. `scanInsights(files, doc)` keeps its return type. When `doc` is `.typ` or `.md`, scan with new `scanTypst` or `scanMarkdown` branches:
   - Typst: headings (`=`), figures (`#figure(` with its `caption: [...]` and `<label>`), tables (`#figure(table(`), block equations (`$ … $` with spaces inside the dollars), citations (`@key` and `#cite(`), TODOs (`// TODO`) and metadata from `#set document(title: …, author: …, keywords: …, date: …)`.
   - Markdown: headings, images as figures, pipe tables, `$$` equations, `[@key]` citations, `<!-- TODO … -->` and metadata from the front matter (`title`, `author`, `keywords`, `date`, `abstract`).
2. Page numbers for Typst come from step 7's `/stats` data, which `InsightsPanel` already fetches for LaTeX (check how it calls `/stats` and pass the `.typ` document the same way). Markdown gets none (`ponytail:`).
3. Review (Preflight): when the main document is not `.tex`, run only the compile, log, PDF and privacy groups, and add one `info` finding in the references group: “The source checks read LaTeX, so they don’t apply to Typst or Markdown documents.” Find the group names in `preflight/run.ts` `GROUPS`.
4. `insights.check.ts`: a Typst and a Markdown sample, each with one of every item.

## 15. Templates and new projects

Files: `templates/manifest.json`, new folders under `templates/`, `apps/backend/src/services/projectService.js` (`detectMainFile`).

1. Write four Typst starters and one Markdown template. Write them fresh, no packages, Australian English, A4:
   - `typst-document`: `main.typ` with `#set document(title: …, author: …)`, `#set page(paper: "a4", margin: 25mm)`, `#set text(size: 11pt)`, a title, two headings, a paragraph, a figure with a caption and label, a reference to it, and a citation to an entry in `refs.bib`, with `#bibliography("refs.bib", style: "apa")`.
   - `typst-report`: a title page, `#outline()`, numbered headings, a table.
   - `typst-letter`: sender, date, recipient, body, closing.
   - `typst-cv`: name, contact line, sections with dated entries in a grid.
   - `markdown-article`: `main.md` with YAML front matter (`title`, `author`, `date`, `bibliography: refs.bib`, `csl:` left out), two headings, an image (`figures/example.png`, a small PNG you generate), a pipe table and a citation `[@key]`, plus `refs.bib`.
2. Add each to `templates/manifest.json` like the others, with `mainFile` set (`main.typ` or `main.md`), a fitting `category` (use the existing categories) and tags including `Typst` or `Markdown`.
3. Compile each Typst template with the built-in Typst and the Markdown template with pandoc and TeX (if installed) before committing.
4. `detectMainFile`: keep the `.tex` search as it is. Only when it finds none, take `main.typ`, else the shallowest `.typ` file, else `main.md`. Never pick a `.md` file other than `main.md` by itself (so a LaTeX project's `README.md` never becomes the main file).

## 16. Settings › Engines and the compile menu

Files: `apps/frontend/src/app/SettingsSheet.tsx` (`EnginesPane`), `apps/frontend/src/api/client.ts`, `EditorPage.tsx` (the compile menu near `compileChoice('engine', 'Compiler (this project)', COMPILE_ENGINES)`).

1. `client.ts`: `getEngines()`, `installTypst(version)`, `removeTypst(version)` and `installPandoc()` for the step 2 routes, with an `Engines` type matching step 2's shape.
2. `EnginesPane`: the `Tabs` get `Typst` and `Markdown` next to `LaTeX` (keep the selected tab in component state).
   - Typst tab:
     - the built-in version (“Typst 0.15.1, built in”) and a Typst on this computer if found (“Also found: Typst 0.13.1 at /opt/homebrew/bin/typst”);
     - a Versions list: every `available` version with its release date and download size (“12.3 MB”) and Install or Remove buttons (Remove asks first);
     - a Default select (built in, or any installed version) that sets `compileDefaults.typstVersion`.
     - Show progress while installing (the button reads “Installing…” and is disabled) and the error text when it fails.
   - Markdown tab: pandoc found (“pandoc 3.12.1, downloaded by Spectrum” or “pandoc 3.6 at /opt/homebrew/bin/pandoc”) or a Download pandoc 3.12.1 (about 42 MB) button; when the found one is older than the minimum, say so and offer the download. A “PDF engine” select (LaTeX or Typst) for `compileDefaults.markdownEngine`.
3. Compile menu, by the main document's kind:
   - LaTeX: as now.
   - Typst: replace the Compiler choice with “Typst version (this project)”, listing Default (the app's default), the built-in version and each installed version. When the project's pinned version is not installed (the compile returned `TYPST_VERSION_MISSING`), show a notice in the error area with “Download Typst <version>” and “Use the default” buttons.
   - Markdown: add “PDF engine (this project)” (LaTeX or Typst) above the Compiler choice. When the compile returns `PANDOC_MISSING` or `PANDOC_OLD`, show a “Download pandoc” button with the error.
4. Logs (`apps/frontend/src/editor/tools/LogsTab.tsx`): for a Markdown document, a “Show generated LaTeX” (or Typst) button that fetches `/generated` and shows the text read-only in the same way the log is shown.

## 17. PDF and source for Typst and Markdown

File: `apps/frontend/src/app/EditorPage.tsx`.

1. PDF → source: in `jumpFromPdf`, for a `.typ` or `.md` document skip `synctexEdit` and go straight to `findInSource(text)`. Change `findInSource`'s file list from `texFiles` to every document file of the same kind as the shown document.
2. Source → PDF: in `showInPdf`, for a `.typ` or `.md` file, take the double-clicked line's words (strip markup as in step 6's error mapping), search the PDF's text with `findAll` from `apps/frontend/src/editor/pdfFind.ts`, and highlight the first match with `pdfRef.current?.highlight(boxes, …)`. Read `PdfFindBar.tsx` and `pdfFind.ts` to see how Find gets page text and turns matches into boxes (`matchBoxes`), and reuse that. If no match, say “Couldn’t find this line in the PDF.” once, as the existing notice does.

## 18. Exports in the project menu

Files: `EditorPage.tsx` (the project menu), `client.ts`.

1. `exportDocx(projectId, doc)` and `convertToLatex(projectId, doc)` in `client.ts` for step 6.4's routes.
2. For a Markdown main document, the project menu gets “Export to Word” (notify “Saved paper.docx.” and refresh the file tree) and “Convert to LaTeX project…” (confirm first: “Spectrum makes a new LaTeX project from this Markdown. This project stays as it is.”; then open the new project).

## 19. The composer's Typst (fletcher) mode

Files: `apps/frontend/src/diagram/types.ts`, `fileFormat.ts`, `modes/index.ts`, new `modes/fletcher/`, `ComposerApp.tsx`, `apps/frontend/src/editor/tools/FloatsTab.tsx` (`InsertDiagram`), `floats.ts`, new `modes/fletcher/fletcher.check.ts`.

1. Fletcher version: open `https://typst.app/universe/package/fletcher` and the package's `typst.toml` for its newest versions and their `compiler` (minimum Typst) fields. Keep a small table in `modes/fletcher/code.ts` from Typst version to the newest fletcher that supports it, and check each pair by compiling a small diagram with each Typst version you install in step 2's tests. The file's import line uses the project's Typst version (the built-in one when not pinned).
2. Mode: `id: 'fletcher'`, `label: 'Flowchart or block diagram (fletcher)'`, `language: 'typst'`. Reuse the plain TikZ mode's model, canvas, rail and inspector (`modes/tikz/`): import `TikzModel`, `emptyTikz`, and its `Canvas`, `Rail` and `Inspector` components. Only `toCode` is new. Add `'fletcher'` to `DiagramMode['id']` in `types.ts`, and add the mode to `MODES` in `modes/index.ts` (the TikZ package menu must not list it: filter the menu by `language`).
3. `toCode(model)` writes:

   ```typst
   #import "@preview/fletcher:<version>" as fletcher: diagram, node, edge
   #set page(width: auto, height: auto, margin: 4pt) if sys.inputs.at("spectrum-diagram", default: "") == "standalone"
   #diagram(
     node((x, y), [text], shape: rect, name: <id>),
     edge(<from>, <to>, "->", label: [label]),
   )
   ```

   - Positions come from the model's grid units (`CM_PER_UNIT` in `modes/tikz/code.ts`). Fletcher's coordinates are in grid cells by default; use `coordinates: "uv"`-free plain numbers and set `spacing` so one cell matches the canvas grid, or write positions in `cm` if fletcher accepts lengths. Check fletcher's manual (`https://github.com/Jollywatt/typst-fletcher`) and choose what reproduces the canvas layout.
   - Shapes: rectangle → `rect`, rounded → `rect` with `corner-radius`, circle → `circle`, ellipse → `ellipse`, diamond → `diamond`, parallelogram → `parallelogram`, text → no stroke, maths → `[$…$]`.
   - Line styles: dashed → `"--"`, dotted → `".."`; heads: end `"->"`, start `"<-"`, both `"<->"`, none `"-"`; route curved → `bend: 30deg`; angled → `corner: right`.
   - Escape `]`, `#`, `\` and `$` in node text that is not maths.
   - Check the `set page … if …` line works both when the file is compiled on its own with `--input spectrum-diagram=standalone` and when it is included in a document inside `#figure(include "figures/x.typ")`. If the `if` form errors inside the figure, use `#show: body => if sys.inputs.at("spectrum-diagram", default: "") == "standalone" { set page(width: auto, height: auto, margin: 4pt); body } else { body }` and check again.
4. File format (`fileFormat.ts`): a Typst diagram is `figures/<name>.typ`. Its last line uses `//` as the comment mark: change `MARK_LINE` to accept `%`, `%%` or `//` before `spectrum-diagram v1`, and make `diagramFileText` and `drawnText` use `//` and the plain code (no `tikzDocument` wrapper) for `language: 'typst'`. Add a case to `fileFormat.check.ts`.
5. `ComposerApp.tsx`:
   - Enable the Typst card in the chooser (search for `'Arrives with built-in Typst'`): `disabled` only when `getEngines()` reports no built-in Typst; its text becomes “Flowcharts and block diagrams drawn with fletcher”.
   - Typst diagrams save to `figures/<name>.typ` and compile for the preview like TikZ ones (`compile()` near “the preview: saved and compiled 700 ms after the last change”), passing `typstInputs: { 'spectrum-diagram': 'standalone' }` to `compileProject`. `refresh` compiles for `tikz` and `typst`.
   - The preview's errors come from the result's `errors` (step 4) rather than `parseCompileLog`.
6. Insert into the document (`InsertDiagram` in `FloatsTab.tsx`, and `floats.ts`):
   - A Typst diagram into a Typst document: `#figure(include "figures/<name>.typ", caption: [caption]) <fig:name>`.
   - A TikZ diagram into a Typst document: `#figure(image("figures/<name>.pdf"), caption: [caption]) <fig:name>`, using the PDF the composer's preview compile wrote beside the `.tex`. When the project's Typst version is below 0.14 (no PDF images), refuse with “Typst <version> can’t show PDF images. Choose Typst 0.14 or later in the compile menu.”
   - A TikZ or Mermaid diagram into a Markdown document: `![caption](figures/<name>.pdf){#fig:name}`, or `.png` when only a PNG exists (`imageOf` already finds the exported image).
   - A Typst diagram into a LaTeX or Markdown document is refused with “A Typst diagram goes into Typst documents only.”
7. `fletcher.check.ts`: the code for a two-box, one-arrow model; escaping; each shape and line style.

## 20. Skills

Files: new `skills/spectrum-typst/SKILL.md`, new `skills/spectrum-markdown/SKILL.md`, `skills/manifest.json`.

1. Write both fresh, in the same front matter format as `skills/spectrum-latex/SKILL.md` (name, description, license MIT, compatibility, metadata version 1.0 and skill-author Spectrum).
   - `spectrum-typst`: how a Typst project in Spectrum is laid out, compiling with the `compile` tool and reading `get_log`'s `file:line:col` errors, `@preview` packages needing the internet on first import, labels and `@` references, `#figure`, `#bibliography` and keeping to the project's pinned Typst version.
   - `spectrum-markdown`: front matter, `[@key]` citations and the bibliography, images and `{#fig:x}` labels, pipe tables, that pandoc turns it into LaTeX or Typst and how to read errors that point back at the `.md`.
2. Add both to `skills/manifest.json` `skills` with `{ "licence": "MIT", "author": "Spectrum", "version": "1.0", "source": "spectrum" }`.
3. Run the skills tests (`test/skills.test.js` and `test/skills-pack.test.js`) to check they load.

## 21. Notices and docs

Files: `THIRD_PARTY_NOTICES.md`, `README.md`, `CHANGELOG.md`, `docs/SPECTRUM_2_HANDOFF.md`, `docs/SPECTRUM_2_REVIEW_PLAN.md`.

1. `THIRD_PARTY_NOTICES.md`, in the style of the TexLab entry: Typst (Apache-2.0, bundled, with its source link and the version), Tectonic (MIT, bundled), pandoc (GPL-2.0-or-later, downloaded only when the user asks, never bundled, source link), Microsoft's `vcruntime140.dll` (Windows only, under the Visual C++ redistributable terms), `codemirror-lang-typst` (Apache-2.0), `@codemirror/lang-markdown` (MIT) and fletcher (MIT, downloaded by Typst from Typst Universe when a diagram is compiled, not bundled). Check each licence on the project's own page before writing it.
2. `README.md`: a short "Typst and Markdown" section after the compile section: the built-in Typst and Tectonic, versions per project, pandoc's download, the templates, and Typst diagrams in the composer.
3. `CHANGELOG.md`: under 2.0.0 (unreleased) Added: the built-in Tectonic and Typst, Typst and Markdown projects, Settings › Engines › Typst and Markdown, the Typst starters and the Markdown article template, exports, the fletcher mode and the two skills.
4. The handoff (`SPECTRUM_2_HANDOFF.md`):
   - add a "Phase 5" section above "Phase 4" with "What was built", "Phase 5 verification" (the checks and their counts) and "Phase 5 limits and open items" (everything you left out or found different, and every `ponytail:` you added);
   - set phase 5's row in the status table to "Built on `build/p5`, not merged, not reviewed";
   - update "Where to resume".
5. In `SPECTRUM_2_REVIEW_PLAN.md`, set review 2's scope to "the `build/p5` merge into `feat/2.0`".

## 22. Final checks

1. Run every check in the table in section 0 and fix what fails. Run `test/texlab.test.js` three times.
2. Run a check of the app in a browser with scratch folders:
   - Start the backend: `SPECTRUM_DATA_DIR=<tmp>/data SPECTRUM_PROJECTS_DIR=<tmp>/projects SPECTRUM_TEMPLATE_DIR=<tmp>/templates HOME=<tmp>/home PORT=8799 node apps/backend/src/index.js`.
   - Then open `http://127.0.0.1:8799` (it serves `apps/frontend/dist` after `npm run build`).
   - Walk through it:
     - make a project from each Typst starter and compile it;
     - break a line and see the error card jump to it;
     - insert a citation and a figure;
     - open Document insights;
     - install Typst 0.14.2 in Settings › Engines, pin it in the compile menu and compile;
     - make the Markdown article, download pandoc in Settings, then compile through LaTeX and through Typst;
     - use Show generated LaTeX, Export to Word and Convert to LaTeX project;
     - draw a fletcher diagram, see its preview and insert it into the Typst document, then compile.
   - Note anything that does not work in the handoff, fix what you can, and stop the backend at the end.
3. Make sure `git status` is clean apart from `docs/SPECTRUM_2_1_PLAN.md`, and that every commit is on `build/p5`.

## What not to do

- Do not merge into `feat/2.0` or `main`, push, tag, release or build the DMG.
- Do not restructure code you do not need to touch, rename existing functions or reformat files.
- Do not add a dependency for something a few lines can do. The only new packages expected are `codemirror-lang-typst` and `@codemirror/lang-markdown`.
- Do not write Tinymist, `typst watch`, PNG, SVG or HTML export, Hayagriva `.yml` writing, Typst Universe templates, a visual Markdown editor, Word or HTML import, pandoc-crossref or Mermaid code blocks inside Markdown. They are left for later (plan section 10b).
- Do not remove or weaken a test to make it pass. If an existing test fails because of a deliberate change, update it and say why in the commit message.
