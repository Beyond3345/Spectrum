# Spectrum 3.0.0 coding standard

Read this and `ARCHITECTURE_LEDGER.md` at the start of every session. Full rationale: blueprint Section 6
(`../docs/gpui-rewrite-plan.html`). Plan and session order: `../docs/REWRITE_V3_PLAN.md`.

## Gate

`cargo xtask check` (fmt, clippy with `-D warnings`, tests) must pass before every commit. Also
`cargo tree -d -i gpui-pre` must show one version and no plain `gpui` package.

## Crates

- Pure crates (`core`, `compile`, `lsp`, `checkers`, `ai`, `references`, `git`, `convert`,
  `win-sandbox`, `xtask`) never depend on GPUI. They must build and test headless.
- Only `spectrum-ui` (and `spectrum-theme`'s kit adapter) import `gpui-component`. Everything else takes
  widgets from `spectrum-ui`.
- No dependency cycles. Add a crate dependency to `[workspace.dependencies]` first, then
  `name.workspace = true` in the crate.
- The 2.8 code (`../apps`, `../src-tauri`, `../native`) is read-only reference. Port its edge cases;
  never edit it.

## Modules

- `foo.rs` + `foo/bar.rs`; no `mod.rs`.
- Private by default, `pub(crate)` inside a crate, `pub` only for the API re-exported from `lib.rs`.
- Aim for under 500 lines a file, 800 at most. Split big views into `view.rs`, `state.rs`, `actions.rs`.

## Names

Views end in `View` or `Panel`; models are plain nouns (`ProjectStore`); events end in `Event`;
actions are verb-noun (`CompileProject`); `Foo::new` constructs, `Foo::load` is the async factory.

## GPUI

- Follow the blueprint's `CompilePanel` skeleton: `FocusHandle`, `_subscriptions: Vec<Subscription>`,
  `EventEmitter`, `Focusable`, `Render` with `track_focus`, `key_context`, `on_action`.
- Never block the foreground thread: file IO, git, PDF, big regexes go to the background executor or
  `spectrum_app::runtime::spawn_tokio`. Never call reqwest, `tokio::process` or `tokio::time` inside
  `cx.spawn` directly.
- Async tasks hold `WeakEntity`, never `Entity`. Store every `Subscription`.
- No `other.update` inside an update when `other` can call back into `self`; use `cx.defer`.
- When a GPUI or kit API doesn't compile, read its source in `~/.cargo/registry/src` or
  `~/.cargo/git/checkouts`. Don't guess signatures.

## Errors, logs, tests

- Library crates: `thiserror` enums. `anyhow` only in `spectrum-app`, `spectrum-xtask` and tests.
- No `unwrap`/`expect` outside tests (lint-enforced). User-facing errors become
  `UserNotice { title, detail, action }`.
- `tracing` only, no `println!`. Logs rotate in the OS log folder (`com.beyond3345.spectrum`).
- Every pure crate has unit tests. Every bug fix starts with a failing regression test.
- No stubs that fake success (`// TODO: wire later`, empty results to pass a test).

## Look and copy

- No hex colours outside `spectrum-theme`. Read colours from `cx.global::<SpectrumTheme>()`.
- 4 px spacing scale; 16/12/10 px radii (panel/card/control). Never colour alone: pair it with an
  icon, label or state.
- Australian English in the UI ("Bin", "colour").

## Platforms

- Targets: `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`. No macOS x64.
- `PathBuf` always, never string-joined paths. Every Windows child process gets `CREATE_NO_WINDOW`
  (`0x0800_0000`).
- `unsafe` only in FFI modules (`hunspell_ffi.rs`, PDFium engine, macOS and Win32 calls), each with
  `#[allow(unsafe_code)]` on that module and a safe API around it.
- Identifiers and copyright use `beyond3345` / `Beyond3345`.
