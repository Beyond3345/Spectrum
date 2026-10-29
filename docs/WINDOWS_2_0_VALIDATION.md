# Spectrum 2.0.0 Windows validation

Run started 29 October 2026 on Longkai-Desktop, Windows x64. PowerShell 7 was used. Every project, app data folder and test home was scratch data. No personal Spectrum data, agent credentials or Zotero database was read or changed. No paid model calls or security-setting changes were made.

## Source and installer

- Initial draft: `b52dd7cab1e2508834f2722b84ae9e3c95a32b9a` from `feat/2.0`.
- Published Mac source: `v2.0.0`, commit `66e01815ec2ec65045b968d7e15b763bd0eeb5f8`. Its differences from the initial draft were the changelog and Windows guide only.
- Windows fix branch: `fix/windows-paths`, commit `736ae80aceae1e01f14097abd88509ecefdebd3d`, pushed with the user's approval. The branch is separate from `main`. A complete patch against `v2.0.0` is retained in the local delivery folder as `windows-fixes.patch`.
- Installer: `Spectrum_2.0.0_x64-setup.exe`, **77,220,730 bytes**.
- Installer SHA-256: `503fcee033bfd0ec7e146321ba2d40c45f429af6c35531996fd07c313aa2a35a`.
- Bundled Node 24.22.2, TexLab 5.26.0, Typst 0.15.1, Tectonic 0.17.0, Hunspell 1.7.6 and Harper 3.0.0.
- TexLab source archive SHA-256: `47af7e71247fe186ddbaa62373ce5fbebc802ab8df9924958ac62788a644f84e`.

The installer is not code signed. It was built locally with the verified engine downloads, the system C# compiler, Microsoft C++ Build Tools and Rust 1.99.1. No source checksum pin was changed.

## Final automated results

| Check | Result |
| --- | --- |
| Full backend suite | 584 tests: 507 passed, 77 skipped, 0 failed |
| Native agent suite | 32 tests: 22 passed, 10 skipped, 0 failed on the isolated final run |
| Spelling and grammar | Both available, correct versions and verified engine and dictionary assets |
| Frontend typecheck | Passed |
| Frontend checks | All 50 check files passed |
| Native shell | 5 passed, 0 failed |
| New Windows regressions | 3 passed, 0 failed, also included in the full backend suite |
| Separate rollback run after fetching history | 5 passed, 0 skipped, 0 failed |
| Final packaged extra checks | All 8 passed |

The skipped tests cover platform restrictions, unavailable real vendor adapters, shell-script stand-ins and opt-in live or Bin checks. They are not evidence that those workflows work. The final backend run had the complete history available, so its rollback checks did not skip for a shallow clone.

The final packaged checks verified the frontend and backend, engine and checker availability, a Typst template PDF, LaTeX Auto, a Tectonic compile using Arial, once-only fonts.conf creation, opening and saving a 316-character project path, compilation from that path, accented and Chinese paths with both SyncTeX directions and Markdown compilation through both LaTeX and Typst. Pandoc was installed into scratch data through the app's checksum-verified installer.

## Failures found and fixes

1. A long project path caused Windows process creation to fail with `ENOENT`, followed by unhandled pipe `ENOTCONN` errors that terminated the backend. Windows compile processes now use extended-length working directories where needed and handle failed pipes. Regression tests exercise an unsuccessful spawn and a real Typst compile beyond MAX_PATH.
2. TeX Live 2025 wrote a project root such as `résumé-??` into SyncTeX when its Windows ANSI code page could not represent the Chinese characters. The reader now repairs only the known project-root prefix. It does not guess source filenames. A real XeLaTeX regression verifies both jump directions.
3. The shell path test expected only its fake MiKTeX folder, but the actual TeX Live installation was correctly discovered too. Discovery now accepts explicit test inputs while production keeps the same inputs and behaviour. The fixture tests MiKTeX, the newest TeX Live year and case-insensitive duplicate prevention without changing process-wide environment variables.

Initial native shell result: 4 passed, 1 failed. The reported difference was an additional `C:\texlive\2025\bin\windows` path. Final result: all 5 passed.

The first frontend run passed 47 files and encountered 3 Windows file-lock errors while replacing one temporary bundle. The full rerun with separate temporary files passed all 50 without source changes. One busy-machine agent run could not yet read its heartbeat file (`ENOENT`); the isolated final run passed all 22 applicable tests without changing that test.

A rebuild overlapped tests holding Hunspell's DLL open and stopped on `EPERM` while refreshing native resources. The resources were restored and the complete installer build was repeated after those processes exited. The successful final build log is retained. Hunspell's own build also produced the guide's expected locked-folder cleanup warning after passing its build and self-tests.

## Windows items and installed-app coverage

| Item | Outcome |
| --- | --- |
| Hunspell cleanup warning | Confirmed, warning only after successful build and self-test |
| Ignored stdio and NUL | The child completed successfully inside LPAC on this desktop. The suspected EPERM limitation was not reproduced |
| Tectonic fonts | Confirmed with a real Arial compile and once-only fonts.conf write. Paths target Windows Fonts and the redirected scratch profile's fonts folder |
| MiKTeX packages | Not tried. This PC uses TeX Live 2025 and its applicable compile tests passed |
| DeepSeek Harness layout | No installation found in the standard Program Files or per-user Programs folders checked. No real agent was started |
| Paths longer than 260 characters | Confirmed after the fix: a 316-character project path opens, saves and compiles |
| Accented and Chinese paths | Confirmed after the fix: opens, saves, compiles and jumps in both SyncTeX directions |
| Installed GUI, SmartScreen and diagram walkthrough | Not tried. The guide reserves these checks for the user or a supervised session because the actual app uses the user's real data folder |
| Home page GUI actions | Not tried interactively. Applicable backend and frontend checks passed |
| Real agent Check and Test | Not tried. Only repository fixtures were used |
| Real GitHub backup and Zotero | Not tried. Tests used stand-ins and no real sign-in or Zotero service |

## Release handoff

The user authorised attaching the tested Windows build to the existing Mac release and shutting down the PC after release verification. No new release or tag is created. The Mac installer and its checksum must be preserved. The installer and TexLab source are uploaded with an updated checksum file, then the attached Windows installer is downloaded again and hashed. The outcome is recorded in `release-verification.json` beside this report.

An installed GUI walkthrough and a post-download installation remain unperformed for the data-safety reason above. All applicable automated checks and the packaged rendering checks passed. Detailed logs are retained locally under `windows-delivery/v2.0.0-windows-20261029/logs/`.
