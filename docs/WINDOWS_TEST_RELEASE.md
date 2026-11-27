# Windows test, build and release of Spectrum 2.8.0

Written 29 October 2026 for Spectrum 2.0.0 and revised on 21 November 2026 for Spectrum 2.6.0 and on 22 November 2026 for 2.6.1, for an AI agent working on the user's Windows computer. It is self-contained: read it to the end before running anything. 2.6.0 was released on 21 November 2026 for the Mac and then for Windows, built and tested on this computer. 2.6.1, released on 22 November 2026 as `v2.6.1`, adds the Windows fixes made then and a fix to the word count: texcount could not open a document in a folder whose name the system's code page cannot spell, such as one with `大學` in it, and Spectrum showed no words. 2.6.2, released on 22 November 2026 as `v2.6.2` for the Mac only, since its Windows build on GitHub failed, adds two things to check here first: a biblatex document in a folder with `大學` in its path compiles with its citations resolved (TeX Live's Biber could not find the `.bib` there), and in the To-dos tab a to-do added on selected words highlights them in its colour, follows typing and can be dragged onto a group. 2.6.3, released on 22 November 2026 as `v2.6.3`, also carries 2.6.2's Windows release: build it on this computer as before. It adds the fixes for that failed GitHub build (several tests that assumed a Mac, and the precompiled preamble, which MiKTeX had silently turned off) and stops `''` being typed as `'''`. Check that typing `''` in a LaTeX file gives two quotes, and with MiKTeX that a notes template's second compile says it starts from a format of the preamble. 2.6.4, released on 26 November 2026 as `v2.8.0`, adds a setup page on the first start, Google's Antigravity as a local agent and a one-step update for agent adapters. Check here first: Antigravity's card finds `agy.exe` in `%LOCALAPPDATA%\agy\bin` and its Test passes with a Gemini API key; and on a fresh Windows account the setup page shows once and stays until Skip or Continue. 2.7.0, released on 27 November 2026 as `v2.8.0`, had its Windows installer built by the GitHub workflow (`windows.yml`) rather than on this computer; use this document for a later version or to test 2.7.0 here. It adds a proxy for the whole app (Mac only), OpenCode 2 on the Mac, the model and effort in the agents' message box with a row of figures under it, and prices from models.dev. Check here first: both agent tabs show the model chip beside Send and the figures under the box, Settings › Models shows models.dev's prices, and OpenCode 2 is listed as unavailable. 2.8.0, released on 27 November 2026 as `v2.8.0`, has its Windows installer built by the GitHub workflow as 2.7.0's was. It brings the new design (the agents' model menu and figures row, Providers and Models in Settings, the Review panels, the reference studio with book editions and locators, the Figures and Tables panels, Plot's table import and the bent beam). Check here first: Settings › Providers and Models, the agent tabs' model menu, and the References card. 2.6.0 is a large release: it carries the work once planned as 2.5.2, 2.6 and 2.7 (see `CHANGELOG.md`, sections 2.6.0 and 2.5.2), so allow more time than for an earlier version.

## The ground rules

1. **The user decides.** Ask the user before anything that leaves this computer: a push, a tag, a release, an upload, a GitHub comment. Building, testing and reading are fine without asking.
2. **Never touch the user's own data.** Do not read, change or delete:
   - Spectrum's data folder `%APPDATA%\com.beyond3345.spectrum`;
   - the user's projects in `Documents\Spectrum`, OneDrive, Synology Drive or any other cloud folder;
   - Zotero's data folder;
   - agent folders (`%USERPROFILE%\.claude`, `.codex`, `.agents`, `.gemini`, `.kimi*`, `.qoder*`, `.deepseek*`).

   Every test run uses scratch folders. Never contact Zotero on port 23119 or sign in to a GitHub account from a test.
3. **No paid model calls.** Agent tests use the repository's fixtures, never a real model.
4. **Do not change security settings.** That includes Defender exclusions, SmartScreen, the execution policy machine-wide, UAC and the firewall. If Windows blocks a tool, report it to the user.
5. **Main, tags and releases are the user's.** Never push to `main`, never create or move a tag, never create a release. You only attach the Windows installer to a release the user has already published, and only after the user says so.
6. **Report faithfully.** If a test fails, say which one, with its output. A step that was skipped is reported as skipped.
7. **Docs style:** Australian English with no contractions, em dashes or Oxford commas. Commits end with a blank line then `Co-Authored-By:` and the agent's own model name.

## 1. Set up

Everything below runs in PowerShell 7 (`pwsh`) in a normal user window, not as administrator, unless a step says otherwise.

| Tool | Version | Notes |
| --- | --- | --- |
| Git for Windows | any recent | Run `git config --global core.autocrlf false` before cloning: the dictionaries and templates must keep LF endings |
| Node.js | 24 LTS | Check with `node --version` |
| Rust | stable, `x86_64-pc-windows-msvc` | `rustup toolchain install stable --profile minimal` and `rustup default stable` |
| Microsoft C++ Build Tools | Visual Studio 2022 Build Tools with "Desktop development with C++" | Needed by the Hunspell binding (node-gyp) and Tauri |
| Python 3 | any recent | node-gyp needs it |
| .NET Framework 4 C# compiler | comes with Windows | Builds `Spectrum.AgentWorker.exe` |
| GitHub CLI `gh` | any recent | Only for the release step; the user signs in themselves with `gh auth login` |
| MiKTeX or TeX Live | any recent | Only for the backend's compile tests (step 3). MiKTeX needs "install missing packages" turned on |
| Strawberry Perl | any recent | latexmk needs Perl |

Then:

```
git clone https://github.com/Beyond3345/Spectrum.git
cd Spectrum
git switch --detach v2.8.0
git log --oneline -1
npm ci
```

Tell the user which commit `git log` shows: the `v2.8.0` tag, the code the Mac release was built from.

## 2. Build the installer

```
node scripts/native.mjs hunspell
node scripts/desktop.mjs texlab
node scripts/desktop.mjs build
```

- **`native.mjs hunspell`** builds Spectrum's Hunspell binding into `native\win32-x64\hunspell.node` and checks it.
  - On Windows the final clean-up of its work folder can fail because Windows keeps the loaded DLL locked. That now prints a warning instead of failing; report the warning, but it is not an error.
  - Any other error is real.
- **`desktop.mjs texlab`** builds TexLab 5.26.0 from its tagged source with the C runtime linked in. It takes a while and is cached in `%LOCALAPPDATA%\spectrum-build`.
- **`desktop.mjs build`** fetches the pinned Node, Tectonic, Typst and pandoc downloads (each checked against its SHA-256 in the repository), builds the frontend, the backend bundle and the agent worker, then runs the Tauri build.
  - The installer appears at `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Spectrum_2.8.0_x64-setup.exe`.
  - Record its size and its SHA-256 (`Get-FileHash -Algorithm SHA256`).

If a download fails its checksum, stop and report it: never change a pinned checksum to make a build pass.

## 3. Run the automated tests

Set up scratch folders first, and use them for every run in this section:

```
$scratch = Join-Path $env:TEMP "spectrum-test-$(Get-Random)"
New-Item -ItemType Directory "$scratch\home", "$scratch\tmp" | Out-Null
$env:TMPDIR = "$scratch\tmp"
$env:TEMP = "$scratch\tmp"
$env:TMP = "$scratch\tmp"
$env:SPECTRUM_NATIVE_DIR = "$PWD\src-tauri\resources\native"
```

The tests make their own scratch data folders; they never use Spectrum's real data folder.

TexLab, Typst and the TeX tools must be on the `PATH` for the backend tests:

```
$bin = "$PWD\src-tauri\binaries"
Copy-Item "$bin\typst-x86_64-pc-windows-msvc.exe" "$bin\typst.exe" -Force
Copy-Item "$PWD\src-tauri\resources\engines\vcruntime140.dll" $bin -Force
Copy-Item "$bin\texlab-x86_64-pc-windows-msvc.exe" "$bin\texlab.exe" -Force
$env:PATH = "$bin;$env:PATH"
Get-Command pdflatex, latexmk, biber, typst, texlab | Format-Table Name, Source
```

Then run each check below and record its counts (tests, passed, failed, skipped):

| Check | Command |
| --- | --- |
| Backend suite | `npm test` (about 960 tests, of which about 110 are skipped on a Mac and a different set on Windows; allow 45 minutes). Do NOT set `SPECTRUM_NATIVE_AGENT_TESTS` for this run, and never run `test/agent-opencode.test.js` with it set: that file starts a real OpenCode |
| Native agent tests | `cd apps\backend; $env:SPECTRUM_NATIVE_AGENT_TESTS = '1'; node --test test/agent-windows.test.js test/agent-preview.test.js test/mcp-tools.test.js test/agent-sandbox.test.js test/agent-profiles.test.js test/agent-network.test.js test/mcp-servers.test.js test/mcp-servers-local.test.js test/keys.test.js; cd ..\..` |
| Spelling and grammar engines | `npm run checkers:verify` |
| Typecheck | `npm run typecheck` |
| Frontend checks | every `apps\frontend\src\**\*.check.ts`, as in `.github\workflows\windows.yml`'s "Frontend checks" step |
| Windows agent probes | The two tests marked `todo` in `test/agent-windows.test.js` (probe A and probe B) are expected to be reported as todo, not as failures. Copy their full output into the report: it decides whether the Node adapters and Spectrum's tools server can run inside Windows isolation (see `docs/WINDOWS_AGENT_CHECKS.md`) |
| Native shell tests | `cd src-tauri; $env:TAURI_CONFIG = '{"bundle":{"externalBin":[],"resources":null}}'; cargo test; Remove-Item Env:TAURI_CONFIG; cd ..` |

**What a failure means:**

- **Compiles:** a backend test that compiles LaTeX and fails with "No PDF was produced" under MiKTeX is usually a package MiKTeX did not install in time. Install the missing package with MiKTeX's console and run that test file again on its own (`node --test test/<file>.test.js` inside `apps\backend`). Report both results.
- **Timings:** a test that times out while the computer is busy is run again on its own before it is reported as a failure.
- **Biber:** a test that runs Biber directly and ends with no `.bbl` and an odd exit code, on a computer where Biber worked before, can be Biber's own unpacked cache in the temp folder having lost files. Running `biber --cache`, moving that folder aside and running the test again settles it. Report it either way.
- **Everything else** is a real failure: report it with its output and do not change the test to make it pass.

## 4. Try the installed app

Install `Spectrum_2.8.0_x64-setup.exe` (it installs for the current user only).

The user's real Spectrum data is on this computer. These checks are best done by the user, or by the agent only with the user watching and saying which projects are scratch ones. Make a scratch project for each check; never edit or delete the user's own projects.

### Start and engines

1. Spectrum starts, and no window about a missing DLL or blocked program appears. Note whether SmartScreen warns (the installer is not code signed); do not change SmartScreen.
2. Settings › Engines lists the bundled Tectonic and Typst.
3. A new LaTeX project from the simple template compiles with Auto, and again with Tectonic chosen.
   - Tectonic on Windows reads its fonts through a `fonts.conf` Spectrum writes into its data folder under `engines`; a compile that uses a system font must find it.
4. A new Typst project compiles.
5. A new Markdown project compiles through LaTeX and through Typst. Installing pandoc from Settings › Engines is allowed.
6. Settings › Spelling shows Harper 3.0.0 and Hunspell 1.7.6. A misspelt word in a scratch document is underlined.

### Diagram composer

Insert a figure of each kind into a scratch LaTeX document:

- a circuit, with a capacitor labelled `C_1` and a logic gate in the IEEE style;
- a structure with a point force at an angle and one diagram switched off;
- a vector diagram from one of its four starters;
- a General drawing.

Each must compile in the document. Siunitx is on by default.

### Home page

Spectrum opens on Home. Check that you can:

- make a folder, then a project inside it;
- go into the folder and back up with the path;
- switch between icons and list;
- give the folder a colour;
- drag a project into another folder.

### Agents

Settings › Agents lists every supported agent. For each agent the user has installed, press Check, then Test. Test runs inside Windows isolation and must never ask for the user's real sign-in to be copied. Record each agent's result: found or not, where, and Test passed or failed with its message.

- **Gemini CLI and GitHub Copilot CLI:** Test decides whether they work on Windows (decision 11 of the part 2 plan).
- **Antigravity:** if `agy` is installed (in `%LOCALAPPDATA%\agy\bin`), record whether it is an `.exe`, then save a Gemini API key on its card and press Test. Its Google sign-in is in Windows Credential Manager, which isolation is not expected to reach: record what Test says without a key too.
- **Codex, Claude Agent, Pi and ZCode** are not run on Windows yet (see `docs/WINDOWS_AGENT_VALIDATION.md`); their cards should say so.
- **OpenCode 2** is listed as unavailable on Windows, since it needs a local port that Windows isolation does not open, and Test is not offered for it.
- **Badges:** each card carries Supported (Claude Agent, DeepSeek Harness), In progress (Codex), Untested or Not supported. Those words describe the Mac; on Windows the card's own text says what does not run there.
- **The Local agents tab** should say, on Windows only, that local agents do not get Spectrum's tools or Direct editing yet and that the Spectrum agent has every tool.
- **DeepSeek Harness:** if the user has the app installed, find where the app keeps its `dsh` command, if anywhere, by looking inside its install folder without running it. Record the path and how it starts (a `.exe`, a `.cmd`, or a script run by the app's own binary). On a Mac it is `Contents/Resources/runtime/cli/bin/dsh`, a shell script that runs the app's binary with `ELECTRON_RUN_AS_NODE=1`. Windows isolation starts only `.exe` programs, so report what you find rather than changing code.

### New in 2.6.0, to try on Windows

Nothing in this list has run on Windows. Use scratch projects only. Report each line as works, fails (with what was seen) or not tried.

1. **API keys.** Only with the user watching, since it touches their real keys: on first start the keys typed in Settings move out of the window's storage and are encrypted for the Windows account into `keys.dpapi` in Spectrum's data folder. Settings › Models should show each key as dots, and Test connection should pass. If the move fails, the keys must still work and Settings › Models must say why. Do not open or copy `keys.dpapi`.
2. **Test connection** beside an API key lists the provider's models and adds them to the Model menu. It sends no message, so it costs nothing.
3. **The Spectrum agent**, with a model the user has set up and only on the user's word, since a turn costs tokens: steps appear as they happen; Stop keeps the words already written; Plan shows a plan to approve; a change is reviewed one piece at a time with J, K, A, R and E; PDF before and after shows both PDFs.
4. **Shortcuts.** `Ctrl+Shift+P` opens the command palette and `Ctrl+P` opens Go to a file or heading. Neither may open the print dialog. `Alt+Shift+P` previews the figure at the cursor.
5. **Editor.** Search in the sidebar finds text in the project's files. A LaTeX error is underlined in the source after a compile, and an overfull box is listed in Logs but not underlined. Typing `$` adds its closer. The maths at the cursor is drawn under it. Settings › Editor offers Vim and Emacs keys: check that the usual `Ctrl` shortcuts still work with Standard chosen.
6. **Compile speed.** Compile a biblatex document twice: the second log says Biber was left out. Compile a notes template twice a few seconds apart with pdfLaTeX: the second log says it starts from a precompiled preamble (MiKTeX may need the `mylatexformat` package; report what it asks for). With latexmk as the engine, a compile with nothing changed takes well under a second. Only the open chapter in the Compile menu typesets one `\include`'d chapter.
7. **Build recipes.** A `% !TEX recipe = pdflatex; pdflatex` comment runs only in a project the user has trusted, since Windows has no compile sandbox. In a project that is not trusted, Logs must say the recipe was not run and Spectrum's own passes must run instead.
8. **Typst.** As you type in the Compile menu; the outline across `#include`s with numbers; a teaching template downloads as PDF/UA-1; Live with Tinymist installed shows Tinymist's preview in the pane (if the pane stays empty it must say why within a few seconds, with Back to the PDF).
9. **Markdown.** The eye button shows a live preview with maths and a Mermaid block; `@fig:x` prints as "Figure 1" in the PDF; a Mermaid block is drawn in the PDF; the slides template compiles.
10. **To-dos.** A group can be made, renamed, reordered and deleted with Undo; a to-do can carry a note.
11. **MCP servers** in Settings › Agents: a server can be added and checked, and a variable can be added to it. The local ports control must be absent on Windows, with a line saying why.
12. **Use from another agent** in the Local agents bar: the switch turns on, and a request to the copied address without its secret is refused.
13. **The update notice.** Settings › System has the switch. Do not expect a notice: 2.8.0 is the newest version.
14. **Review › References exist**, only on the user's word, since it sends the bibliography's DOIs and titles to Crossref, OpenAlex and arXiv.

### The Windows agent checks

`docs/WINDOWS_AGENT_CHECKS.md` holds nine ordered checks that only a Windows computer can settle (the draft compile with Biber, latexmk and Tectonic, shell escape staying off, MiKTeX's settings, the two isolation probes, DeepSeek Harness's layout and the network section). Run them after the list above and put each check's result in the report, in that file's own numbering.

### GitHub and Zotero

Only if the user wants them tried, and only with a scratch project and the user's own sign-in typed by the user:

- **GitHub:** a GitHub backup, then a pull.
- **Zotero:** with Zotero running, inserting a citation.

## 5. Open Windows items to confirm

Each was found on the Mac or in CI and is untested on a real Windows desktop. Report each one as confirmed, not seen or not tried:

0. **Everything in "New in 2.6.0, to try on Windows" and in `docs/WINDOWS_AGENT_CHECKS.md`** counts as an open item until it has been reported.
1. **Hunspell clean-up:** step 2's clean-up warning instead of a failure.
2. **NUL device:** an agent's child process started with no input or output fails with `spawn EPERM`, most likely because the isolation cannot open the `NUL` device. The native agent test now starts its child with inherited input and output instead. Confirm the test passes, and whether `stdio: 'ignore'` really fails on this desktop.
3. **Tectonic fonts:** the `fonts.conf` file is written once into the data folder's `engines` folder and lists `C:\Windows\Fonts` and the per-user fonts folder.
4. **MiKTeX:** the compile tests pass with packages installed as asked for, or need them installed first.
5. **DeepSeek Harness:** the app's layout (step 4).
6. **Long paths:** a project in a folder whose path is longer than 260 characters opens, saves and compiles.
7. **Unicode paths:** a project whose folder has accented or Chinese characters opens, saves, compiles and jumps between source and PDF (SyncTeX).

## 6. Fixing what fails

- **Small, clear fixes:** if a failure has a clear cause in Spectrum's code, fix it on a branch from `main` named `fix/windows-<what>`. Add a test where one can run on Windows, run every check in step 3 again and commit in small commits.
- **Pushing:** push the branch only after the user agrees, and never push to `main`.
- **Larger problems:** if the fix is not small or touches the Mac's behaviour, stop and report it to the user instead.

## 7. Release (only on the user's word)

The Mac release is published: `main`, the `v2.8.0` tag and a GitHub release carrying `Spectrum_2.8.0_aarch64.dmg` (Apple silicon only since 2.5.0) and `SHA256SUMS.txt`. Check it exists:

```
gh release view v2.8.0 --repo Beyond3345/Spectrum
```

If it does not exist yet, stop and tell the user. When it exists and the user says to attach the Windows build, there are two ways.

### A. From this computer, attaching the installer built and tested in steps 2 to 4

Upload the installer and TexLab's source, which goes with every installer because TexLab is GPL 3.0. TexLab's SHA-256 is pinned in `scripts/desktop.mjs` and `.github/workflows/windows.yml`:

```
$src = "texlab-5.26.0-source.tar.gz"
Invoke-WebRequest https://github.com/latex-lsp/texlab/archive/refs/tags/v5.26.0.tar.gz -OutFile $src
(Get-FileHash $src -Algorithm SHA256).Hash.ToLower() -eq "47af7e71247fe186ddbaa62373ce5fbebc802ab8df9924958ac62788a644f84e"
gh release upload v2.8.0 "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Spectrum_2.8.0_x64-setup.exe" $src --repo Beyond3345/Spectrum
```

Then add the installer's line to the release's checksums:

```
gh release download v2.8.0 --pattern SHA256SUMS.txt --repo Beyond3345/Spectrum
$hash = (Get-FileHash "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Spectrum_2.8.0_x64-setup.exe" -Algorithm SHA256).Hash.ToLower()
Add-Content SHA256SUMS.txt "$hash  Spectrum_2.8.0_x64-setup.exe"
gh release upload v2.8.0 SHA256SUMS.txt --clobber --repo Beyond3345/Spectrum
```

Show the user the new `SHA256SUMS.txt` before the upload.

### B. Through GitHub Actions

This is the way earlier releases were done.

- **Starting it:** run the Windows workflow on `main` with the release's tag: `gh workflow run windows.yml --ref main -f release_tag=v2.8.0`.
- **What it does:** it builds and tests on a clean runner, then attaches its own installer and TexLab's source to the release. A release run fails rather than attaching an installer when the Hunspell binding does not build.
- **Checksums:** it does not update `SHA256SUMS.txt`, so add the line as in A, using the attached installer's hash.

For 2.6.0 the user has chosen A: the installer built and tested on this computer is the one released. B stays here for other versions.

After either way, download the attached installer again, check its SHA-256 against the checksums file and install it once more to confirm it starts.

## 8. What to report to the user

1. The commit tested, and the installer's size and SHA-256.
2. Each check in step 3 with its counts, and every failure with its output.
3. The results of step 4, one line each, with the 2.6.0 list and the Windows agent checks in their own numbering.
4. Each item in step 5: confirmed, not seen or not tried.
5. Any branch you made, with its commits, and whether it was pushed.
6. Whether the installer was attached to the release, which way, and the final `SHA256SUMS.txt`.
