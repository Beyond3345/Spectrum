# Windows hand-test checklist for 3.0.0

Things that only a real Windows machine can confirm. CI (`native-v3.yml`, Windows x64) builds
everything and runs the unit tests, but it can't sign in, see the screen, type with an IME or use a
real 2.8 install. Every session adds its Windows-only items here; the user runs the list at the end.

Set up: a Windows 10 or 11 x64 PC with Spectrum 2.8.x installed and used (projects, an API key,
GitHub signed in), so the upgrade path is real. Tick each box; note anything odd beside it.

## Install and upgrade

- [ ] The 3.0.0 installer detects the 2.8.x install and offers Update.
- [ ] After updating, projects, settings and stored API keys are all still there.

## Startup and window

- [ ] Spectrum opens without a console window flashing.
- [ ] Light, Dark and System themes switch live; System follows Windows' own setting when it changes.
- [ ] Spectrum and Simple colour styles switch live.
- [ ] UI text is Segoe UI and code text Consolas, crisp at 100%, 125%, 150% and 200% display scaling.
- [ ] Moving the window between monitors with different scaling keeps text sharp.

## Shell and file actions

- [ ] Ctrl+Shift+P, Ctrl+P, Ctrl+N, Ctrl+Shift+N, Ctrl+\, F2 and Delete do what they say.
- [ ] Moving a file to the Recycle Bin works, it can be restored from there, and the wording says
      "Recycle Bin".
- [ ] The title bar's minimise/maximise/close buttons and window dragging work.
- [ ] A file name containing `:` is refused with a clear message.
- [ ] Renaming `main.tex` to `Main.tex` (case only) works.

## Data from 2.8 (spectrum-core)

- [ ] API keys saved by 2.8 (`%APPDATA%\com.beyond3345.spectrum\keys.dpapi`) are read without
      re-entering them, and no PowerShell window appears.
- [ ] A key added in 3.0.0 is still there after quitting and reopening.
- [ ] App and project settings from 2.8 load; unknown fields survive a save (open a project's
      `.spectrum\settings.json` before and after).
- [ ] With Documents inside OneDrive, new projects go to `%USERPROFILE%\Spectrum`, not OneDrive.
- [ ] The same with Dropbox (found through `%APPDATA%\Dropbox\info.json`) and Synology Drive.
- [ ] Saving a file while antivirus or OneDrive is scanning the folder doesn't fail (atomic save retry).
- [ ] Importing an Overleaf .zip and an arXiv source tarball works; a zip with `..` paths is refused.
- [ ] Editing a project file in another app (e.g. Notepad) refreshes Spectrum's file tree.

## Spelling and grammar (spectrum-checkers)

- [ ] Spelling underlines appear in en-AU and en-US documents (Hunspell built with MSVC).
- [ ] Grammar (Harper) works and inline Chinese doesn't get flagged.

## Compile and SyncTeX (spectrum-compile)

- [ ] SyncTeX jumps work for a project whose path has non-English characters (ANSI code page
      fallback), and for one on a different drive letter.
- [ ] SyncTeX works in a project compiled by MiKTeX and by TeX Live.
- [ ] MiKTeX (per-user and all-users) and `C:\texlive\<year>` are found when Spectrum is started
      from the Start menu or Explorer, not only from a terminal.
- [ ] No console window flashes for any engine, Biber, makeindex or pandoc.
- [ ] Recompiling mid-latexmk or mid-Tectonic leaves no TeX process in Task Manager.
- [ ] A project path with spaces compiles; a project in a Chinese-named folder compiles with Biber.
- [ ] With the PDF open in Acrobat, compiling warns that it's open in another program.
- [ ] A `.bat` latexmk runs.
- [ ] MiKTeX installs a missing package without a prompt.
- [ ] Tectonic finds Windows fonts (e.g. a document using `\setmainfont{Segoe UI}`).

## Update notice (also check on the Mac)

- [ ] With an older 3.0.0 build installed, the update pill and Home card appear within a minute of
      starting, without waiting a day.
- [ ] "Open the release page" opens the exact GitHub release in the default browser (Edge, Chrome or
      Firefox as set in Windows).
- [ ] "Check for updates" in the Command Palette answers straight away.
- [ ] Offline at startup, then back online: the notice still appears within about 30 minutes.

## Language servers (spectrum-lsp)

- [ ] texlab.exe and tinymist.exe start with no console window.
- [ ] Killing texlab.exe in Task Manager restarts it and diagnostics come back.
- [ ] Killing it four times quickly stops the retries (and says so).
- [ ] A project under `C:\Users\…`, and one whose path has spaces or non-English characters, gets
      diagnostics and an outline.
- [ ] The project folder can be moved or put in the Recycle Bin while a server runs.
- [ ] Quitting Spectrum leaves no texlab.exe or tinymist.exe running.

## AI providers (spectrum-ai)

- [ ] A streamed answer arrives piece by piece through a corporate or system proxy.
- [ ] Anthropic and OpenAI work behind a TLS-inspecting proxy whose root certificate is only in the
      Windows certificate store (or a clear certificate error appears).
- [ ] Ollama on `localhost:11434`: models are listed, a model answers with no key, and thinking shows
      as reasoning.
- [ ] Ollama on another computer on the network (`http://<ip>:11434`) lists models and answers.
- [ ] Stopping an answer mid-stream stops it within a second.
- [ ] `models-dev.json` (prices) is written to `%APPDATA%\com.beyond3345.spectrum` and replaced
      cleanly when it refreshes.

## Editor (spectrum-editor)

- [ ] Open a CRLF .tex, edit and save: it stays CRLF throughout, and git shows only the edited lines.
- [ ] Paste CRLF text from Notepad into an LF file: the saved file stays LF.
- [ ] Microsoft Pinyin and Cantonese input: the candidate window sits at the cursor, and one
      composition is one undo step.
- [ ] An emoji from Win+. : the cursor and selection land after it, never inside it.
- [ ] Typing in a 20,000-line file feels instant; holding Ctrl+Z doesn't stall.

## Windows sandbox worker (spectrum-win-sandbox)

- [ ] `cargo test -p spectrum-win-sandbox` passes, unelevated and elevated; `-- --ignored node` prints 42.
- [ ] No console window flashes in either sandbox tier.
- [ ] After a run, `icacls` on the draft folder shows no `S-1-15-2-…` entry or Low label, and
      `%LOCALAPPDATA%\Packages` has no `Spectrum.Sandbox.*` folder.
- [ ] The first confined compile with MiKTeX or TeX Live is slower (granting), the second instant.
- [ ] The restricted tier cannot read `Documents` or `.ssh`; a sandboxed program cannot read the clipboard.
- [ ] Killing Spectrum mid-run kills the sandboxed program.

## Checkpoints and GitHub (spectrum-git)

- [ ] Sign in with the GitHub device code; back up a new project to a private repo.
- [ ] Push and pull against real GitHub; a rejected push pulls, then pushes again.
- [ ] A Git for Windows CRLF checkout commits nothing, and an edit goes up as LF.
- [ ] A file name from a Mac that Windows can't hold is named and kept on GitHub.
- [ ] A 2.8 `github.json` token moves into DPAPI and the sign-in survives a restart.
- [ ] Restore a 2.8 checkpoint on a 2.8-era project.
- [ ] Settings-repo personas and skills go across Mac ↔ Windows.

## Editor syntax (spectrum-editor)

- [ ] The vendored BibTeX grammar (`parser.c`) builds with MSVC (`cargo xtask check` on Windows).
