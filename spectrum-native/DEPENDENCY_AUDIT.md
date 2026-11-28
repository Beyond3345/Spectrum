# Dependency audit for Spectrum 3.0.0 (Phase 0)

Checked 2026-11-28 against GitHub releases, crates.io, npm and Maven Central. Targets: aarch64-apple-darwin and x86_64-pc-windows-msvc only (Mac x64 assets dropped). SHA-256 values are the digests GitHub publishes for the release asset, not ones computed here.

## Engines & servers

| Component | 2.8 pin | Latest stable (date) | Action | Notes |
|---|---|---|---|---|
| Tectonic | 0.17.0 | 0.17.0 (2026-07-27) | keep | Newer tags (`tectonic_xetex_layout@0.3.4` etc.) are sub-crates, not CLI releases. |
| Typst CLI | 0.15.1 (+0.14.2/0.13.1/0.12.0 downloadable) | 0.15.1 (2026-07-17) | keep | Hashes match engines.json. Keep the older versions downloadable as they are. |
| Pandoc | 3.12.1 | 3.14 (2026-11-12) | upgrade | 3.13/3.14: the LaTeX writer now uses custom footnote macros in its default template, and the LaTeX reader handles `\pandocfootnotemark`. Re-run the import/export fixtures. |
| Biber | 2.17 | 2.22 (2026-09-05) | **keep 2.17** | The biblatex in Tectonic's bundle only works with Biber 2.17 (compileService.js:956). Don't upgrade until the bundle changes. Mac arm64 uses the universal tarball. |
| TexLab | 5.26.0 (Windows built from source with static CRT) | 5.26.0 (2026-06-25) | keep | Upstream ships `texlab-x86_64-windows.zip`. Check whether it needs vcruntime140. If it does, keep the source build. |
| Tinymist | 0.15.10 | 0.15.12 (2026-11-03) | upgrade | Still on the Typst 0.15 line. Each asset has a `.sha256` sidecar. |
| LanguageTool | 6.8 (Maven jars) | 6.8 (Maven `<release>`, 2026-05-05) | keep | No GitHub releases. Maven is the source of truth. Still needs a JRE. |

Assets for the two targets:

| Engine | aarch64-apple-darwin asset | SHA-256 | x86_64-pc-windows-msvc asset | SHA-256 |
|---|---|---|---|---|
| Tectonic 0.17.0 | `releases/download/tectonic%400.17.0/tectonic-0.17.0-aarch64-apple-darwin.tar.gz` | `a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667` | `tectonic-0.17.0-x86_64-pc-windows-msvc.zip` | `f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f` |
| Typst 0.15.1 | `typst/typst/releases/download/v0.15.1/typst-aarch64-apple-darwin.tar.xz` | `48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a` | `typst-x86_64-pc-windows-msvc.zip` | `19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736` |
| Pandoc 3.14 | `jgm/pandoc/releases/download/3.14/pandoc-3.14-arm64-macOS.zip` (43712865 B) | `58d6593884fec9d4424b641b92503c316d9c36decb2891ff8d73ae74dd3b6304` | `pandoc-3.14-windows-x86_64.zip` (43614099 B) | `0144b96e8c7b023fd382ec5ef5bdc475e873f1019d6fa72502492df2c9a94a3b` |
| Biber 2.17 | SourceForge `biblatex-biber/2.17/binaries/MacOS/biber-darwin_universal.tar.gz` | `182e1efa074d8a2a23a8893f2a22440d4e463cce55e4ed02076ac4c0ee0614b2` | `Windows/biber-MSWIN64.zip` | `c103bffc5ae0a7f513e7c26b6d394e9be6cf41952959c5d604ee2e6581b5dea2` |
| TexLab 5.26.0 | `latex-lsp/texlab/releases/download/v5.26.0/texlab-aarch64-macos.tar.gz` | `af7972ffd230711ba04ada9b69cc32ce9111d9196ba69538062872faefdbee56` | `texlab-x86_64-windows.zip` (or source tarball `47af7e71…f84e`) | `cb028d44c3d2b85d36a2ed52d41a0ff43a341b1f04c500c56c4524c4eb72b316` |
| Tinymist 0.15.12 | `Myriad-Dreamin/tinymist/releases/download/v0.15.12/tinymist-aarch64-apple-darwin.tar.gz` (30842684 B) | `5f77362580b0bfc8a31b47718dfe3f426ce854d59f04030ade398f1926167b06` | `tinymist-x86_64-pc-windows-msvc.zip` (30079432 B) | `7dfa68a764363bf825871c7d0ea302b6590a33b5b3ae43585e34d04296e987b1` |

## Checkers & dictionaries

| Component | 2.8 pin | Latest stable (date) | Action | Notes |
|---|---|---|---|---|
| Harper | 3.0.0 (WASM, commit dd536c3) | GitHub v3.3.0 (2026-11-18); crates.io **harper-core 3.2.0** (2026-11-13) | upgrade, switch to the crate | 3.3.0 isn't on crates.io yet, so use 3.2.0. 3.2.0 flags American-only spellings in non-US dialects, which changes en-AU output, so expect test churn. Release notes list no breaking `harper-core` API changes from 3.0 to 3.3. Pulls zip ^8.6 and pulldown-cmark ^0.13.3. |
| Hunspell | 1.7.6 | 1.7.6 (2026-10-26) | keep | Vendor the C++ sources and build with `cc`. |
| typst-syntax | 0.15.1 | 0.15.1 (2026-07-17) | keep | Keep it in lockstep with the Typst CLI. |
| SCOWL en_* | rel-2026.02.25 | rel-2026.02.25 | keep | |
| AussieDic | 3.1.0 | 3.1.1 (2026-10-21) | upgrade | Re-run the licence and UTF-8 word checks. |
| wooorm/dictionaries | 8cfea406b505 | 8cfea406b505 (2024-09-09) | keep | Head is unchanged. |
| LibreOffice/dictionaries | 4f1df64b2e8e | 79195b017e6d (2026-11-24) | upgrade | Re-read the licence file of each of the 21 tags. |
| xjyutping | 2.0.0 (vendor/) | 2.0.0, head 6dd2264 (2026-11-11) | keep | Git blob hashes of all six vendored files match upstream HEAD. Upstream has no tags. |

## Fonts & vendored assets

| Component | 2.8 pin | Latest stable (date) | Action | Notes |
|---|---|---|---|---|
| Noto Sans CJK SC/TC | Sans2.004 | Sans2.004 (2022-01-27) | keep | Pinned in apps/backend/src/data/fonts.json. |
| Noto Serif CJK SC/TC | Serif2.003 | Serif2.003 (2024-07-30) | keep | |
| LXGW WenKai / WenKai TC | 1.530 | 1.530 (2026-10-17) | keep | |
| JetBrains Mono | Fontsource 5.3.0 (woff2) | upstream v2.304 (2023-01-14) | new source | GPUI needs TTF/OTF, not woff2. Embed the upstream TTFs. |
| Fira Code | Fontsource 5.3.0 | upstream 6.2 (2021-12-06) | new source | Same as above. |
| IBM Plex Mono | Fontsource 5.3.0 | `@ibm/plex-mono@2.5.0` (2026-06-11) | new source | Same as above. |
| Source Code Pro | Fontsource 5.3.0 | upstream 2.042R-u/1.062R-i (2023-04-12); Fontsource 5.3.1 | new source | Same as above. |
| KaTeX fonts | bundled via frontend | n/a | drop / decide | Only needed if native math preview still uses KaTeX metrics. |

## PDFium

| Component | 2.8 pin | Latest stable (date) | Action | Notes |
|---|---|---|---|---|
| bblanchon/pdfium-binaries | — | chromium/8179 (2026-11-23) | new: **pin chromium/8125** (2026-10-26) | pdfium-render 0.9.6's newest binding is `pdfium_8125`, which is also `pdfium_latest`. Pinning 8125 makes the API match the binary exactly. 8179 would probably work, since PDFium's ABI grows by adding functions, but the bindings haven't been checked against it. |
| 8125 `pdfium-mac-arm64.tgz` | — | 3540999 B | new | `4939bd935ac83ddc09a3a4f038bc43a19cea1660316a3667f26cb07a070e139d` |
| 8125 `pdfium-win-x64.tgz` | — | 3904987 B | new | `9a964261760cff52570aabf038ab346d3a5034dd8b30d0d5fe8861235d356b8b` |
| (8179 for reference) | — | mac-arm64 `44b7c6f5…fb46`; win-x64 `836a77c9…41b6` | — | Use the non-`v8` variants. V8/XFA isn't needed. |
| pdfium-render | — | 0.9.6 (2026-11-21) | new | The default features (`pdfium_latest` = `pdfium_8125`, `image_latest`, `thread_safe`) are fine. Load PDFium dynamically via libloading. |

## Rust crates

Dates are the crates.io last-update dates.

| Component | 2.8 pin | Latest stable (date) | Action | Notes |
|---|---|---|---|---|
| gpui-component | — | 0.11.0 (2026-11-23) | new | This is the newest release. Confirmed: depends on **gpui-pre =0.3.14** (plus gpui-pre-macros and gpui-pre-sum-tree =0.3.14), lsp-types ^0.97, **ropey =2.0.0-beta.1**, and optionally tree-sitter ^0.26.13. Edition 2024. |
| gpui-pre | — | 0.3.14 (2026-11-23) | new | Exact pin from gpui-component. Don't mix it with the `gpui` (0.2.2, Zed) or `gpui-ce` (0.3.0) crates, which are separate forks. It pulls parking_lot ^0.12.1, resvg/usvg ^0.46, windows ^0.62 and smallvec ^1.6. |
| ropey | — | 1.6.1 stable; **2.0.0-beta.1** | new | **gpui-component pins `=2.0.0-beta.1`.** Use that version so `Rope` is the same type. 2.0 is byte-indexed, unlike 1.x's char indexing. |
| tree-sitter | — | 0.27.2 (2026-11-07) | new, **pin 0.26.13** | Has `links = "tree-sitter"`, so only one version can be in the graph. gpui-component needs ^0.26.13. 0.26 and 0.27 both accept ABI 13–15. |
| tree-sitter-language | — | 0.1.9 | new | The ABI-decoupling shim that grammar crates use. |
| tree-sitter-latex | — | 0.1.0 (2025-02-08) | **avoid** | Third-party crate whose repository field is bogus. Use **codebook-tree-sitter-latex 0.6.1**: the latex-lsp v0.6.0 grammar, ABI 15, depends on tree-sitter-language ^0.1. |
| tree-sitter-typst | — | 0.1.3 (2026-11-25, forfudan) | evaluate later | A new grammar written from scratch. ABI 15, tree-sitter-language ^0.1. Alternative: **codebook-tree-sitter-typst 0.12.2** (the uben0 grammar used by helix/codebook, ABI 14, tree-sitter-language ^0.1). Both are compatible with tree-sitter 0.26. |
| tree-sitter-md | — | 0.5.4 (2026-10-24) | new | ABI 15, tree-sitter-language ^0.1. **Don't enable the `parser` feature**: it pulls tree-sitter ^0.27, which conflicts with 0.26. |
| tree-sitter-bibtex | — | 0.1.0 (2024-07-06) | **CONFLICT** | Depends directly on tree-sitter ^0.22.6. The `links` collision with 0.26 makes the build fail. Its grammar is ABI 13, which is fine. Fix: vendor `latex-lsp/tree-sitter-bibtex` parser.c into a small workspace crate built with cc + tree-sitter-language 0.1.9. |
| harper-core | 3.0.0 (WASM) | 3.2.0 (2026-11-13) | new | See Checkers. |
| typst-syntax | 0.15.1 | 0.15.1 | keep | |
| tokio | — | 1.54.1 | new | |
| reqwest | — | 0.13.5 | new | In 0.13, `default-tls` = rustls with aws-lc-rs. Use `default-features=false, features=["rustls","http2","json","stream"]`. aws-lc-sys needs CMake on Windows MSVC builders. |
| eventsource-stream | — | 0.2.3 (2022) | new | Old but stable. |
| rmcp | — | 3.12.0 (2026-11-26) | new | Already aligned with reqwest ^0.13.2, sha2 ^0.11, hmac ^0.13, base64 ^0.23 and windows-sys ^0.61. |
| lsp-types | — | 0.97.0 (2024-06) | new | Same version as gpui-component. |
| notify / notify-debouncer-mini | — | 9.0.0 / 0.8.0 (2026-11-21) | new | The debouncer requires notify ^9. |
| keyring | — | 4.2.0 | new? | 4.x moves to a pluggable keyring-core store, so the API differs from 3.x. The blueprint reads the 2.8 blobs with security-framework and DPAPI directly, so this may not be needed. |
| security-framework | — | 3.7.0 | new | |
| windows-sys | — | 0.61.2 | new | gpui-pre uses `windows` 0.62, a different crate. That's fine. |
| directories | — | 6.0.0 | new | Its paths differ from `com.beyond3345.spectrum`, so build the paths by hand. |
| git2 | — | 0.21.0 (libgit2-sys 0.18.4) | new | Use `vendored-libgit2`. |
| similar | — | 3.2.1 | new | 3.x API differs from 2.x. |
| pulldown-cmark | — | 0.13.6 | new | Same major version as harper-core. |
| resvg | — | 0.50.0 | new, **pin 0.46.0** | Matches gpui-pre's resvg/usvg ^0.46, which avoids a second usvg tree type. |
| nucleo-matcher | — | 0.3.1 (2024) | new | |
| rust-embed | — | 8.14.0 | new | |
| serde / serde_json | — | 1.0.229 / 1.0.154 | new | |
| thiserror / anyhow | — | 2.0.21 / 1.0.105 | new | |
| tracing / -subscriber / -appender | — | 0.1.44 / 0.3.23 / 0.2.5 | new | |
| flate2 / zip / tar | — | 1.1.11 / 9.9.0 / 0.4.46 | new | harper-core needs zip ^8.6. Pin **zip 8.6.0** to keep one copy, or accept two. |
| quick-xml | — | 0.42.0 | new | |
| regex | — | 1.13.2 | new | |
| trash | — | 5.4.0 | new | |
| futures / crossbeam-channel | — | 0.3.34 / 0.5.17 | new | gpui-pre needs futures ^0.3.34. |
| sha2 / hmac / base64 | — | 0.11.2 / 0.13.0 / 0.23.1 | new | sha2 0.11 and hmac 0.13 share digest 0.11, so they're compatible. |
| cc / zstd | — | 1.12.0 / 0.14.5 | new | |
| smallvec | — | 1.16.6 | new | |
| parking_lot | — | 0.13.0 | new, **pin 0.12.5** | gpui-pre needs ^0.12.1. 0.13 would put two copies in the graph. |

## Pins to use in Phase 0

```toml
gpui-component = "=0.11.0"
gpui = { package = "gpui-pre", version = "=0.3.14" }
ropey = "=2.0.0-beta.1"
lsp-types = "0.97.0"
tree-sitter = "=0.26.13"
tree-sitter-language = "0.1.9"
codebook-tree-sitter-latex = "0.6.1"
codebook-tree-sitter-typst = "0.12.2"   # or tree-sitter-typst 0.1.3 after evaluation
tree-sitter-md = { version = "0.5.4", default-features = false }   # no `parser` feature
# tree-sitter-bibtex: vendored parser.c crate (crates.io 0.1.0 conflicts)
pdfium-render = "0.9.6"                 # with pdfium-binaries chromium/8125
harper-core = "3.2.0"
typst-syntax = "0.15.1"
tokio = "1.54.1"
reqwest = { version = "0.13.5", default-features = false, features = ["rustls", "http2", "json", "stream"] }
eventsource-stream = "0.2.3"
rmcp = "3.12.0"
notify = "9.0.0"
notify-debouncer-mini = "0.8.0"
security-framework = "3.7.0"
windows-sys = "0.61.2"
directories = "6.0.0"
git2 = { version = "0.21.0", features = ["vendored-libgit2"] }
similar = "3.2.1"
pulldown-cmark = "0.13.6"
resvg = "0.46.0"
nucleo-matcher = "0.3.1"
rust-embed = "8.14.0"
serde = "1.0.229"
serde_json = "1.0.154"
thiserror = "2.0.21"
anyhow = "1.0.105"
tracing = "0.1.44"
tracing-subscriber = "0.3.23"
tracing-appender = "0.2.5"
flate2 = "1.1.11"
zip = "8.6.0"
tar = "0.4.46"
quick-xml = "0.42.0"
regex = "1.13.2"
trash = "5.4.0"
futures = "0.3.34"
crossbeam-channel = "0.5.17"
sha2 = "0.11.2"
hmac = "0.13.0"
base64 = "0.23.1"
cc = "1.12.0"
zstd = "0.14.5"
smallvec = "1.16.6"
parking_lot = "0.12.5"
# keyring = "4.2.0"  only if security-framework/DPAPI direct is dropped
```

Engines: Tectonic 0.17.0, Typst 0.15.1, Pandoc 3.14, Biber 2.17 (locked), TexLab 5.26.0, Tinymist 0.15.12, LanguageTool 6.8.

## Adjustments made when pinning (main session)

- Depend on `gpui-kit =0.11.0` (pins `gpui-pre =0.3.14` and re-exports GPUI and gpui-component) instead of
  `gpui-component` directly.
- Aligned to versions already in the tree so nothing builds twice: notify 8.2.2 with
  notify-debouncer-mini 0.7.0 (gpui-component), similar 2.7.0 (gpui-component), base64 0.22.1 (usvg),
  zstd 0.13.6 (zip).
