# Windows agent and installer validation

Host: Longkai-Desktop, Windows 10.0.26300 x64. Source base: `a6409a7e57d3f4263d5533810a4decbe983b57ab`. The Mac transfer contained 31 files; all hashes were verified after CRLF-to-LF normalization before Windows changes.

## Native boundary

`native/agent-sandbox/Worker.cs` is a trusted .NET Framework launcher using Windows native APIs. Only the agent child enters the Less-Privileged AppContainer. Every launch uses a fresh profile/SID, explicit runtime reads, workspace/private-home writes, and a suspended process assigned to a kill-on-close job before execution. Only stdin/stdout/stderr handles are inherited. The backend monitors and cancels the worker through control files outside the grants; unexpected backend exit also ends the job.

Grants use validated filesystem handles, reject reparse points and hardlinks, and avoid recursive ACL propagation into agent-controlled paths. ACL changes are serialized across workers. Existing Spectrum metadata, VCS state, `.claude`, environment files and key files are excluded from workspace/runtime grants. Host login is never inherited automatically. The clean environment includes only private state and deliberately configured provider variables. Root-directory and user-home read grants are refused. Project integrity labels and global Claude configuration are unchanged.

The worker has `registryRead` for Winsock initialization and `internetClient` for public network access. It does not request COM, private-network, or loopback-exemption capabilities. Unlike the macOS policy, Windows public client access is not limited to HTTPS/DNS. No container, unrestricted fallback, host shell evaluation, or host compiler broker is used. Missing workers and failed launches refuse execution.

Native tests verify outside/live-project reads and writes, existing secrets/identity, hardlinks, junction escape attempts, child-process access, loopback denial, background descendant cancellation, ordinary user access after cleanup, ACP permissions/file callbacks, immutable review/apply, subsequent session loading, direct editing and recovery. Test workspaces and credentials are synthetic. No personal authentication or inference was used.

## Compatibility limits

- OpenCode **1.19.3**, official Windows x64 archive SHA-256 `e4ce9117f55fc068414513789f8c7d1049f855d7518bb4e350b9170a3a20d8c3`, failed before ACP initialization: its Bun runtime attempts `lstat C:\` outside its grants. Its internal loopback server also has no certified Windows grant. This combination is disabled.
- Node **24.19.0** can run the protocol fixture and native file callbacks with `--preserve-symlinks` and `--preserve-symlinks-main`, avoiding root metadata walks. Descendants with inherited stdio remain confined. Node descendants with newly redirected pipes stall inside LPAC; even a synchronous spawn timeout does not settle. Spectrum cancellation still terminates the entire job. A descendant started with ignored stdio (`stdio: 'ignore'`) fails with `spawn EPERM` (seen in CI, cause not confirmed on a desktop): libuv opens the `NUL` device for it, and the AppContainer token most likely has no access to `\\.\NUL`. Granting that would mean changing the security of a device the whole system shares, so the worker does not; such descendants need inherited stdio. Codex, Claude Agent, Pi and ZCode Windows adapters remain disabled pending a transport solution. Their macOS integration is preserved.
- `.cmd`/`.bat` launchers are refused. An explicit native interpreter plus script arguments is required. Other vendor launchers, credentials, MCP servers, system tools, compilation inside the boundary and public Internet workflows are not certified by the fixture tests.
- Windows validation is on this x64 build only, not every supported Windows release. A forced worker termination can leave inactive unique-SID ACL entries/profile storage; profile identities are never reused. No crash-cleanup certification is claimed.
- WorkBuddy remains official-only and planned for remote support.

## Build and unrelated Windows fixes

The Windows worker is built with the system .NET Framework 4 compiler and bundled beside `server.mjs`. The installer build uses official Node 24 LTS with SHA-256 verification, Rust/MSVC and the Microsoft C++ Build Tools. The Windows Hunspell module is built locally and packaged. Source runs select `native/win32-x64/nodehun.node` rather than the committed Mac binary.

SyncTeX paths from the installed TeX Live 2025 engine can use the Windows ANSI code page. The reader now obtains that code page from the system registry and decodes legacy input lines without corrupting UTF-8 lines. An accented-filename navigation test and a mixed-encoding regression test verify the fix.

Final build paths and test results are recorded in the accompanying Windows delivery report. No push, publication, release creation, paid inference or personal credential import is part of this validation.
