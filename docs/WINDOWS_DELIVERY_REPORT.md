# Windows delivery report — Spectrum 1.10.0

Validated on 19 October 2026 on Longkai-Desktop, Windows 10.0.26300 x64.

## Deliverables

The local delivery folder is `windows-delivery/`. It contains:

- `Spectrum_1.10.0_x64-setup.exe`: unsigned Windows preview installer.
- `Spectrum-1.10.0-windows-changes.patch`: Windows changes relative to the imported Mac source packet.
- `windows-changes-manifest.json`: source paths, before/after hashes and patch hash.
- `windows-changes.packet.json.gz`: the manifest and patch together for transfer.
- `SHA256SUMS.txt`: hashes of delivery artifacts, outside the source patch to avoid circular hashes.
- Build, backend test and packaged-component smoke logs.

Apply the Windows patch **after** the verified 31-file Mac source packet, not directly to the clean base commit. The base commit is `a6409a7e57d3f4263d5533810a4decbe983b57ab`; the original compressed Mac packet SHA-256 is `b98bd094f94eeaed241881e4c2ff0be4cf24c7ff01d32583429b98457126d244`. Source text hashes use UTF-8 LF normalization. Export verification applies the patch to an isolated copy of its baseline, checks every resulting file hash and checks reverse application.

## Verification

- Full backend suite on the bundled Node 24.22.0: **271 passed, 13 skipped, 0 failed** (284 tests). Skips cover unavailable optional tools and platform-specific checks; they are not evidence of vendor compatibility.
- Focused agent suite: **6 passed, 2 skipped, 0 failed**. Native Windows isolation, cancellation, review/apply, resumed sessions and direct mode were exercised. A running ACP terminal must end before proposal capture.
- Frontend type checking and production build passed.
- Packaged-component smoke passed using the actual bundled Node, backend, frontend, worker, dictionaries and native spelling module. It exercises synthetic ACP review editing, permission/file callbacks, a running terminal, explicit apply, profile availability, spelling and grammar.
- Source whitespace validation passed. No paid inference, personal credentials, real vendor account login, push, release or publication was used.

The native desktop shell and installer were built. The installer was not installed over the user's existing Spectrum installation, and an installed native GUI walkthrough was not performed. The component smoke is not a substitute for that installation check.

## Windows boundary and compatibility

The new trusted worker launches each agent in a fresh Less-Privileged AppContainer with explicit filesystem grants and a kill-on-close process job. Missing isolation fails closed. Tests cover outside/live-project denial, secret paths, a broadly accessible host file, hardlinks, junctions, descendants, loopback denial and cancellation. The worker grants public client networking and registry reads needed by Winsock; Windows public networking is not restricted to HTTPS/DNS. See `WINDOWS_AGENT_VALIDATION.md` for the exact boundary and cleanup limits.

Official OpenCode 1.19.3 fails its root metadata probe in this boundary. Codex, Claude Agent, Pi and ZCode adapters also remain disabled on Windows because new redirected descendant pipes can stall in LPAC. Their macOS integrations and global Claude configuration are preserved. Other vendor executables, authentication, MCP servers and compilation inside the boundary remain unverified. WorkBuddy stays official-only, with remote support planned. Forced worker termination may leave inactive unique-SID ACL entries/profile storage; crash cleanup is not certified.

## Build notes

The build uses verified official Node 24 LTS, Rust 1.99.1, Microsoft Visual C++ Build Tools, the system .NET Framework C# compiler and NSIS 3.11. The Windows Hunspell module was built locally. Repeated Windows tool/artifact access errors required incremental retries and preparation of the official hash-verified NSIS tool cache; no antivirus exclusions or security-setting changes were made.

Windows-specific fixes also select the proper native spelling module in source runs and decode legacy Windows ANSI SyncTeX input paths without corrupting UTF-8 lines. Regression tests cover accented filenames and mixed encodings.
