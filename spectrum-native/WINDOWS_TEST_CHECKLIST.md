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
