# Spectrum Lite research

This report looks at whether a tablet version of Spectrum, called Spectrum Lite here, can be built for iPad and Android tablets. Spectrum Lite would open, edit, compile and push back the LaTeX projects that desktop Spectrum keeps on GitHub, so that work can carry on at the desktop afterwards. It is written for deciding whether to start and in which order. The findings are dated 31 October 2026 and were checked against Spectrum 2.0.4 (commit `bef8a29`).

## 1. Summary and verdict

| Question | Verdict |
| --- | --- |
| iPad | Feasible with Tectonic 0.17.0 linked into the app as a static library. A third-party MIT project has built this engine for iOS and run it in the iOS Simulator, but nobody has published a run on a physical iPad, so a short spike has to confirm it before the work starts. WebAssembly in the web view is the fallback, and compiling on a server is an optional extra, never the default. |
| Android | Feasible and already proven on tablets. TeXslate runs Tectonic inside the app process through the Java Native Interface (JNI), in a 28.8 to 42.8 MB Android package (APK), with warm compiles of about 3 seconds on a Galaxy Tab S8 Ultra. |
| Architecture | One repository. The existing React frontend is built in a Lite mode, with the desktop-only features switched off and an inter-process communication (IPC) transport in `api/client.ts` in place of HTTP. A new mobile-only Tauri crate owns the files, compiling (Tectonic linked in), the GitHub transport (REST API, token in the Keychain or the Android Keystore) and spelling. SyncTeX parsing and the merge rules stay in JavaScript and are shared with the desktop backend. |
| First spike | Three to five days. First run pdf-latex-mobile's iOS harness on a physical iPad. Then compile a Spectrum template in a bare Tauri 2.12 iPad app that links stock Tectonic 0.17.0 and measure the build, compile time, memory over 100 compiles and app size against fixed kill criteria (Section 14.3). |

The main findings are,

- Tectonic is the right engine on both platforms. Desktop Spectrum already pins Tectonic 0.17.0, so the same version and its TeX Live 2022 bundle give a tablet the same output as the desktop's built-in engine (Section 6 and Section 7),
- neither platform lets Spectrum start Tectonic as a separate program, as the desktop does, so the engine runs inside the app process, one compile at a time and without crash isolation. Tectonic leaks about 1.1 MiB per PDF compile, and TeXslate had to work around three crash paths, of which Tectonic 0.17.0 fixes one (Section 6.1 and Section 7.1),
- Biber cannot run on an iPad, while every LaTeX template Spectrum ships uses biblatex-apa, which requires Biber. BibTeX runs inside Tectonic, so natbib and plain BibTeX bibliographies work everywhere (Section 8),
- Tectonic's PDF writer (dvipdfmx) carries GNU General Public License (GPL) 2.0 or later headers in 148 source files although the crates declare MIT. Linking it into an App Store binary needs a licence decision, which `BACKLOG.md` already lists as an open question (Section 15.3),
- not counting the diagram composer, about 37 per cent of the frontend can be reused as it is, 43 per cent with changes and 20 per cent drops out (Section 9.4) and
- GitHub sync works best without a local Git repository, through GitHub's Git Data REST API called from Rust, with the desktop's merge rules reused in JavaScript so that a project round-trips exactly as it does between two desktops (Section 10).

## 2. Method, conventions and probes

### 2.1 How to read this report

Statements followed by a link were checked against that source on 30 or 31 October 2026. Statements about Spectrum link to the file in this repository. A sentence or bullet that starts with **Inference** is reasoning from the verified facts and has not been tested. Sizes use decimal units (1 MB is 1,000,000 bytes) unless MiB or GiB is written.

The research read the repositories it cites (TeXslate, pdf-latex-mobile, Tectonic, a-Shell, WebKit, the Tauri plugins and the WebAssembly TeX projects) as untrusted data. None of them was built or run. Only the probe in Section 2.2 was run.

### 2.2 Probes that were run

1. `rustup target list --installed` on the Mac's own toolchain lists `aarch64-apple-darwin`, `wasm32-unknown-unknown`, `x86_64-apple-darwin` and `x86_64-pc-windows-msvc`. No iOS or Android target is installed
2. A separate Rust 1.99.0 toolchain (minimal profile) with the `aarch64-apple-ios` and `aarch64-linux-android` targets was installed into the session's scratch folder, with `RUSTUP_HOME` and `CARGO_HOME` pointing there, so the Mac's own toolchain was left as it was
3. A scratch crate whose only dependency is `tectonic = { version = "=0.17.0", default-features = false }` was checked with `cargo check --target aarch64-apple-ios --keep-going`. It took 21 seconds and exited with code 101

| Crates | Result for `aarch64-apple-ios` |
| --- | --- |
| `tectonic_bridge_png` 0.1.2, `tectonic_bridge_graphite2` 0.3.2 and `tectonic_bridge_icu` 0.2.4 | The build script failed, since pkg-config, Tectonic's default way of finding C libraries, is not set up for cross-compiling |
| `tectonic_bridge_freetype2`, `tectonic_bridge_fontconfig`, `tectonic_bridge_harfbuzz`, `tectonic_xetex_layout`, `tectonic_engine_xetex`, `tectonic_engine_xdvipdfmx` and `tectonic_pdf_io` | Their build scripts compiled but did not run, as they wait for the failed crates. `tectonic_bridge_fontconfig` being in the build at all confirms that iOS takes the fontconfig path (Section 7.1.2) |
| Every other crate, including `tectonic_engine_bibtex` 0.3.4, `tectonic_bundles` 0.4.2 and the command-line crates `watchexec` 8.4.4, `notify` 8.2.1, `tokio` 1.54.1, `clap` 4.6.7 and `open` 5.4.5 | Passed |

The probe shows that the fix pdf-latex-mobile uses is needed, which is to switch Tectonic to its backend for vcpkg, Microsoft's C and C++ package manager (`TECTONIC_DEP_BACKEND=vcpkg`), with iOS triplets (Section 7.1). It also shows that the command-line dependencies of the `tectonic` crate do not block an iOS build at the check stage.

Four things were not run,

- the vcpkg build for iOS, since the Mac has no cmake, ninja, pkg-config, autoconf or automake and installing them would change the system outside the scratch folder,
- any link step,
- any run in the Simulator or on a device and
- any build of TeXslate, pdf-latex-mobile or a WebAssembly engine.

## 3. Spectrum today and what Lite has to replace

Desktop Spectrum is three parts,

- the shell, [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml), which uses Tauri 2.12 with the dialog, opener, single-instance and window-state plugins. [`main.rs`](../src-tauri/src/main.rs) (1,604 lines) starts the Node backend, shows a splash, points the window at `http://127.0.0.1:<port>`, adds the macOS menu whose Quit saves the editor first, claims file types through LaunchServices and opens the diagram composer's window,
- the frontend, 57,001 lines of TypeScript, TSX and CSS in 165 files under `apps/frontend/src`, plus 6,212 lines of `.check.ts` checks. [`api/client.ts`](../apps/frontend/src/api/client.ts) uses about 80 distinct `/api` paths through one `request()` helper, three `EventSource` streams (the compile log, project events and TexLab) and a few direct `fetch` calls and
- the backend, 52,079 lines of JavaScript under `apps/backend/src` with 193 Fastify routes in 28 route files. It runs Tectonic, Typst, TexLab, Biber, pandoc, Git through isomorphic-git, Hunspell, Harper, LanguageTool and the agents.

The frontend already imports pure modules from the backend, such as `latex/text.js`, `latex/mask.js`, `language/markup.js` and `utils/conflictCopies.js`. Lite builds on that pattern.

The parts of the backend that matter for Lite are these.

| Desktop piece | Size | What it does | Where it goes in Lite |
| --- | --- | --- | --- |
| [`compileService.js`](../apps/backend/src/services/compileService.js) and [`engineService.js`](../apps/backend/src/services/engineService.js) | 869 and 299 lines | Runs `tectonic -Z continue-on-errors -Z search-path=… --synctex --keep-intermediates --outdir <temp> ./main.tex` in a temporary folder, writes only the PDF beside the source and keeps SyncTeX and `.aux` files in the app's data folder. Puts the downloaded Biber 2.17 first on Tectonic's `PATH` | A Rust command that drives Tectonic's library with the same options (Section 13.2) |
| [`engines.json`](../apps/backend/src/data/engines.json) | | Pins Tectonic 0.17.0, Typst 0.15.1, pandoc 3.12.1, Biber 2.17 and LanguageTool 6.8 | Tectonic 0.17.0 only |
| [`synctex.js`](../apps/backend/src/services/synctex.js) | 536 lines | Reads `.synctex.gz` and answers forward and inverse searches. Only loading uses Node (`zlib`, `fs`) | JavaScript in the web view (Section 9.3) |
| [`gitService.js`](../apps/backend/src/services/gitService.js), [`githubService.js`](../apps/backend/src/services/githubService.js) and [`mergeRules.js`](../apps/backend/src/services/mergeRules.js) | 667, 724 and 231 lines | Commits, fetches, merges file by file and pushes with isomorphic-git 1.43.3 over Node's file system, signs in with GitHub's device flow and keeps the token out of the window | Merge planning stays in JavaScript; the transport moves to Rust (Section 10) |
| `projectService.js` and `routes/projects.js` | 614 and 820 lines | Project registry, file tree, reads, atomic writes, renames and uploads | A small Rust project store (Section 13.2) |
| `spellService.js` | 345 lines | Hunspell through a native Node addon | Rust with spellbook (Section 12) |
| `texlabService.js` | 654 lines | Starts TexLab and relays its messages | Dropped (Section 11) |

## 4. Scope: what stays and what drops

Lite opens LaTeX projects that already exist on GitHub. A Typst or Markdown file in such a project opens as plain text and is not compiled.

| Feature | In Lite | Reason |
| --- | --- | --- |
| Projects page with the GitHub projects on this tablet (open, get from GitHub, remove from the tablet) | Stays | The way projects arrive |
| Editor: LaTeX highlighting, folding, completion of commands, environments, labels, citation keys, packages and files, snippets, outline from the headings, find and replace, themes and tabs | Stays | Frontend code, no backend needed |
| Compile with Tectonic (XeTeX), the log with errors, fast draft mode and Stop | Stays | Stop discards the result, as Tectonic cannot be interrupted inside the process |
| PDF preview: zoom, page colours, two-page view, contents, thumbnails, find, links and presentation mode | Stays | pdf.js runs in both web views |
| SyncTeX in both directions | Stays | Section 9.3 |
| BibTeX bibliographies | Stays | Tectonic runs BibTeX inside the process |
| GitHub sign-in, get, pull, back up and sync, conflicted copies, the deletion brake and the rule for personal files in shared repositories | Stays | Section 10 |
| To-dos and PDF notes | Stays | They travel in `.spectrum/todos` and `.spectrum/notes` |
| Spelling with the desktop's dictionaries | Stays | Section 12 |
| Insert table and insert figure from Photos or Files | Stays | The table builder is frontend code |
| Appearance: theme, accent, editor themes and the bundled fonts | Stays | Frontend code |
| Grammar with Harper | Later | Possible in either the web view or Rust (Section 12) |
| Document insights, Checkpoints, linked documents (`\externaldocument`), makeindex, the settings repository, Review's checks without AI and new projects from templates | Later | Each is possible, none is needed to edit and compile |
| Biber | Later on Android, not possible on iPad | Section 8 |
| Compiling on a server | Later, optional | Section 7.4 |
| Typst and Markdown compiling, pandoc and Word export | Drops | Out of scope for Lite |
| pdfLaTeX, LuaLaTeX, latexmk, a TeX folder and the Auto engine | Drops | No TeX distribution on a tablet |
| makeglossaries and shell escape | Drops | Both start other programs |
| TexLab: squiggles, hovers, go to definition, references, rename and the check before compiling | Drops | Section 11 |
| Assistant, references chat, AI autocomplete, agents, personas, skills, AI review, Research, web search, image to LaTeX and plot from table | Drops | Agents need programs on a computer, and the other AI features live in the backend's model code, which Lite does not carry |
| Zotero and LanguageTool | Drops | Both need desktop programs |
| Diagram composer | Drops | A separate window and 15,589 lines of frontend |
| Being the default app, template transfer, importing from arXiv or a zip file and opening folders and files from Files | Drops | Projects come from GitHub |
| Sync-app folders and the 1.10 migration | Drops | Desktop only |
| Window glass and the macOS menu | Drops | Desktop only |

Desktop Spectrum runs makeindex and makeglossaries only for pdfLaTeX, XeLaTeX and LuaLaTeX ([`compileService.js`](../apps/backend/src/services/compileService.js), the `multiPass` branch), so a desktop compile with the built-in Tectonic has no index either.

## 5. Tauri 2 on iOS and Android

### 5.1 State of mobile support

Tauri's crate is at 2.12.5 and its command-line tool at 2.12.4 (both 21 October 2026), and 3.0.0-alpha.5 is a preview ([releases](https://github.com/tauri-apps/tauri/releases)). iOS and Android have been supported since 2.0 on 2 October 2024, with the release post saying that not every plugin supports mobile and that mobile development was not yet on par with desktop ([Tauri 2.0](https://v2.tauri.app/blog/tauri-20/)). The Rust code of a Tauri app becomes a library, linked into the Xcode project on iOS and loaded through JNI on Android ([develop](https://v2.tauri.app/develop/)). Bundled executables (sidecars) do not work on mobile, as a maintainer confirmed in [issue 9774](https://github.com/tauri-apps/tauri/issues/9774), which is why Spectrum's Node, Tectonic, TexLab and Typst programs cannot be carried over.

The default minimum is iOS 15.0 (since command-line tool 2.12.0, for Xcode 27) and Android API level 24 ([configuration](https://v2.tauri.app/reference/config/), [Google Play guide](https://v2.tauri.app/distribute/google-play/)). Spectrum's pdf.js 6.4 is built for Safari 18 and Chrome 125 ([pdf.js `gulpfile.mjs`](https://github.com/mozilla/pdf.js/blob/master/gulpfile.mjs)). **Inference:** Lite should require iPadOS 18 and Android 10, since current Chrome for Android needs Android 10.

Apple's [TN3187](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle) says that from the release after iOS 26, an app built with the latest SDK must adopt the UIScene life cycle or it will not launch. Tauri 2.12 builds with Xcode 27 but leaves scenes off by default, and [issue 15719](https://github.com/tauri-apps/tauri/issues/15719) (open, priority 0 crash, opened 14 July 2026) reports a crash at launch with an empty scene configuration. Its workaround is a static `UIApplicationSceneManifest` that names `TaoSceneDelegate`. This has to be tried in the spike.

### 5.2 Plugins

| Plugin | Spectrum uses it | iOS | Android | For Lite |
| --- | --- | --- | --- | --- |
| dialog 2.8.4 | Yes | Partial | Partial | File pickers and message dialogs work. There is no folder picker on mobile: the command returns `FolderPickerNotImplemented` ([source](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/src/commands.rs)), [issue 933](https://github.com/tauri-apps/plugins-workspace/issues/933) is open since February 2024 and [PR 2322](https://github.com/tauri-apps/plugins-workspace/pull/2322) was closed unmerged. Lite only needs the file picker, for images |
| opener 2.7.2 | Yes | Partial | Partial | Opens web addresses only, which is enough for GitHub's sign-in page |
| single-instance 2.5.5 | Yes | None | None | Not needed on mobile |
| window-state 2.5.0 | Yes | None | None | Not needed on mobile |
| fs 2.7.1 | No | Partial | Partial | Limited to the app's folders by default ([docs](https://v2.tauri.app/plugin/file-system/)). Lite reads and writes files through its own Rust commands instead |
| http 2.8.3 | No | Full | Full | Fetch from Rust, free of the web view's cross-origin resource sharing (CORS) limits. Not needed when the Rust commands call GitHub themselves ([docs](https://v2.tauri.app/plugin/http-client/)) |
| stronghold 2.4.0 | No | Full | Full | Deprecated on 16 July 2026 ([issue 3494](https://github.com/tauri-apps/plugins-workspace/issues/3494)), so not for the token |

Plugin support levels come from each plugin's `Cargo.toml` on the `v2` branch of [plugins-workspace](https://github.com/tauri-apps/plugins-workspace), which feeds the Supported Platforms tables on the Tauri site.

Most of `main.rs` has no place on a tablet: starting the backend, the splash and port, the menu with its Quit that saves first, the default-app handling, the diagram window, the full-screen notifications and the traffic lights. On a tablet the app is suspended and can be ended without notice, so Lite saves as it goes and again when the page is hidden.

### 5.3 File system

Each app has its own sandbox. The fs plugin sets up iOS security-scoped access automatically since version 2.5.0 but keeps no bookmarks, and Android handles single `content://` files but not folders ([fs changelog](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/fs/CHANGELOG.md)). Community plugins fill some of the gaps, such as `tauri-plugin-android-fs` for Android folders.

Lite does not need any of this, since projects arrive from GitHub and live in the app's own storage, `Library/Application Support` on iOS and `filesDir` on Android. **Inference:** showing the projects in the Files app on iPad needs `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` in `Info.ios.plist`, which has not been tried with Tauri and is not needed for the first version.

### 5.4 Web views

The iPad uses WKWebView and Android its System WebView, which is Chromium updated through the Play Store.

| Topic | iPad (WKWebView) | Android (System WebView) | What it means for Lite |
| --- | --- | --- | --- |
| JavaScript and WebAssembly | Just-in-time compilation (JIT) in the WebContent process ([WebKit `process-entitlements.sh`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Scripts/process-entitlements.sh)), but WebAssembly is switched off completely in Lockdown Mode (Section 7.3.2) | JIT and WebAssembly | The native engine avoids both questions |
| Page origin | `tauri://localhost` | `http://tauri.localhost` or `https://tauri.localhost` with `useHttpsScheme` | Choose the scheme once, as changing it later moves the page's stored data ([configuration](https://v2.tauri.app/reference/config/)) |
| Request bodies seen by a custom scheme | Yes | No: `WebResourceRequest` has no body ([reference](https://developer.android.com/reference/android/webkit/WebResourceRequest)) | Writes go through Tauri commands; a custom scheme only serves reads such as the PDF and images |
| Large responses through a custom scheme | Block the main run loop ([wry issue 1775](https://github.com/tauri-apps/wry/issues/1775), open) | | Send the PDF as a raw binary command response |
| Workers | Module workers work. Service workers do not work from a custom scheme | Work | pdf.js keeps its worker. Test it early |
| SharedArrayBuffer | Only with cross-origin isolation, untested under `tauri://` | Not available in WebView | Do not depend on it |
| `DecompressionStream('gzip')` | Safari 16.4 and later | Chrome 80 and later | SyncTeX can be read in the web view |
| Spell checking in CodeMirror 6 | Misspellings are not marked ([CodeMirror forum](https://discuss.codemirror.net/t/os-level-spellcheck-is-disabled-on-ios-even-after-adding-contentattribute/4128)) | Uses the system spell checker, which varies by device | Spelling comes from Rust (Section 12) |
| Keyboard | A hardware keyboard works. The on-screen keyboard pushes the view off screen ([issue 9907](https://github.com/tauri-apps/tauri/issues/9907), open) | Resizing for the keyboard breaks with edge-to-edge from API 35 ([issue 10631](https://github.com/tauri-apps/tauri/issues/10631), open) | Handle `visualViewport` and the insets, and test on devices |
| Platform reported | `navigator.platform` is `MacIntel` in desktop-class mode | `Linux aarch64` or similar | Spectrum's `platform.ts` would treat the iPad as a Mac and Android as macOS in its wording. Lite sets the platform itself |
| Drag and drop of files | Tauri's native drop events are not supported on mobile | Not supported | Use the pickers |

### 5.5 Building and signing

For iOS the requirements are full Xcode, CocoaPods and the Rust targets `aarch64-apple-ios` and `aarch64-apple-ios-sim` ([prerequisites](https://v2.tauri.app/start/prerequisites/)). Then `tauri ios init`, `tauri ios dev` and `tauri ios build --export-method app-store-connect` build the app, which is uploaded with `xcrun altool` or Transporter ([App Store guide](https://v2.tauri.app/distribute/app-store/)). Signing is automatic in Xcode with the development team set in `bundle > iOS > developmentTeam`, or uses an App Store Connect API key in continuous integration ([iOS signing](https://v2.tauri.app/distribute/sign/ios/)). An App Store build also needs a privacy manifest that declares file timestamp access (reason `C617.1`, files inside the app's own container), since Rust's file calls and Tectonic read file times, as the fs plugin's documentation notes for its own case.

For Android the requirements are the Android SDK, the Android Native Development Kit (NDK), JDK 17 or later and the target `aarch64-linux-android`. Then `tauri android build --aab` makes a bundle for Google Play, and `--apk --split-per-abi` makes APKs to install directly, signed with an upload key through `keystore.properties` ([Android signing](https://v2.tauri.app/distribute/sign/android/)). NDK r28 and later align native libraries to 16 KB pages by default, which Google Play requires ([page sizes](https://developer.android.com/guide/practices/page-sizes)).

This Mac has Xcode 27.1 with the iPhoneOS 27.1 SDK and an Android SDK with NDK 28.2.13676358 and 29.0.14206865, platforms 37.0 and 37.1 and build-tools 36.0.0. It has no Java runtime, CocoaPods or XcodeGen, and its Rust toolchain has no iOS or Android target.

## 6. LaTeX on Android

### 6.1 TeXslate

[TeXslate](https://github.com/thobgg/TeXslate) is a LaTeX editor for Android in Kotlin and Rust, GPL 3.0 or later, first committed on 5 July 2026. Release [v1.0-alpha27](https://github.com/thobgg/TeXslate/releases/tag/v1.0-alpha27) came out on 29 October 2026, and [F-Droid](https://f-droid.org/packages/de.bgg_home.texslate/) builds it from source.

Looking at how TeXslate compiles, it can be seen that Tectonic runs inside the app process as a library, not as a program. A Rust `cdylib`, `libtexslate_native.so`, depends on `jni` 0.21 and `tectonic` only ([`rust/Cargo.toml`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/rust/Cargo.toml)). Kotlin calls one JNI function, `tectonicCompileToFile`, on a background thread, and the Rust side wraps the compile in `catch_unwind` and returns JSON ([`rust/src/lib.rs`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/rust/src/lib.rs)). The session is built with `ProcessingSessionBuilder`: the bundle from `PersistentConfig`, the format cache, `synctex(true)`, `keep_intermediates`, the build date and, optionally, `continue_on_errors`. It sets `XDG_CACHE_HOME`, `HOME`, `TZ` and `FONTCONFIG_FILE` before each compile.

The details are as follows.

| Question | TeXslate v1.0-alpha27 |
| --- | --- |
| Tectonic version | `tectonic` 0.16.9 from crates.io (`Cargo.lock`), with no fork. [`build-native.sh`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/build-native.sh) patches two files in the Cargo registry before building and fails if a patch is missing |
| Patch 1 | `print_glyph_name` in `xetex-ext.c` freed a pointer it had moved, which Android's allocator stops with SIGABRT on any document using `unicode-math`. Tectonic 0.17.0 fixes this upstream ([changelog](https://github.com/tectonic-typesetting/tectonic/blob/release/CHANGELOG.md)) |
| Patch 2 | A second close of the same output in `tectonic_bridge_core` panics inside an `extern "C"` function, which aborts the app. `tectonic_bridge_core` 0.5.3, used by Tectonic 0.17.0, still has the `take().unwrap()` in `output_close`, so Lite needs this patch too |
| C libraries | vcpkg with the `arm64-android` triplet builds International Components for Unicode (ICU), FreeType, graphite2, libpng and fontconfig (`TECTONIC_DEP_BACKEND=vcpkg`, `VCPKGRS_TRIPLET`), then `cargo ndk` builds the library. HarfBuzz is Tectonic's own vendored copy. Only `libtexslate_native.so` and `libc++_shared.so` ship. There is no continuous integration: the developer builds releases locally (6 minutes 43 seconds for the C libraries and 1 minute 49 seconds for Rust on a cold build) |
| Fonts | fontconfig is compiled in. At first launch the app writes `fonts.conf` listing `/system/fonts`, its bundled fonts (Latin Modern, TeX Gyre and DejaVu Sans) and a user folder ([`FontStore.kt`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/app/src/main/java/de/bgg_home/texslate/storage/FontStore.kt)). The XML declaration must be the first bytes of the file, and fonts added later need a restart |
| APK sizes | arm64-v8a full 42,799,556 bytes, arm64-v8a core (no Biber) 28,759,683 bytes and x86_64 for the emulator 41,592,885 bytes. The native library is 53,909,584 bytes uncompressed and 20,989,256 bytes deflated. Minimum Android 8.0 (API 26), target API 36 ([`build.gradle.kts`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/app/build.gradle.kts)) |
| Bundle | Tectonic's default `default_bundle_v33`, which redirects to `tlextras-2022.0r0.tar` (TeX Live 2022, 2,881,562,112 bytes) and is read with HTTP range requests through a 1,276,215 byte index. Files are cached under `filesDir/job/Tectonic/`. There is no offline-only mode and no full download |
| First compile | About 1 to 2 minutes online, leaving about 44 MB in the cache |
| Warm compile | 4.0 to 4.4 seconds on a Galaxy Tab S8 Ultra for a document with contents and references, down to 2.8 to 3.4 seconds once `.aux` files were kept between compiles ([commit c2a11f0](https://github.com/thobgg/TeXslate/commit/c2a11f04f4641ff0a0b51221f5d6187434ca1984)) |
| Biber | Biber 2.17 on Perl 5.36.3 in the full edition only. Perl and a launcher ship as `libperl_exe.so` and `libbiber_launcher.so` in the native library folder, the one place Android lets an app run a program from ([`BiberRuntime.kt`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/app/src/main/java/de/bgg_home/texslate/compile/BiberRuntime.kt)). The Perl and Biber build recipe is not in the repository |
| Other tools | BibTeX runs inside Tectonic. makeindex is rewritten in Kotlin. An Encapsulated PostScript (EPS) figure leaves dvipdfmx in a broken state that aborts the next compile, so TeXslate replaces EPS figures before compiling ([`GraphicsCheck.kt`](https://github.com/thobgg/TeXslate/blob/v1.0-alpha27/app/src/main/java/de/bgg_home/texslate/compile/GraphicsCheck.kt)) |
| SyncTeX and PDF | Its own Kotlin SyncTeX parser (inverse search only) and Android's `PdfRenderer` |
| Git | None. GitHub support is requested in its issue 1 and parked |

What can be reused is the approach rather than the code, since the code is GPL 3.0: vcpkg with Android triplets, `catch_unwind` at the boundary, the explicit cache and font settings, the two patches and the EPS check. **Inference:** a Tauri app does not need TeXslate's JNI layer at all, since its Rust library is already loaded through JNI and can call Tectonic from a command directly.

### 6.2 Other Android LaTeX apps and ports

| Project | How it compiles | Engine | Licence and state |
| --- | --- | --- | --- |
| [pdf-latex-mobile](https://github.com/snooplsm/pdf-latex-mobile) | A library inside the app, on Android and iOS | Tectonic 0.17.0's XeTeX with its own PDF writer built on Krilla, a Rust PDF library, in place of xdvipdfmx, and pruned TeX files shipped offline in four profiles | MIT for the project's own code, 0.1.0-alpha.2 on Maven Central, last commit 29 September 2026. ARM64 Android library archives (AARs) of 7.03 MB (balanced profile) and 14.45 MB (full) ([`SIZES.md`](https://github.com/snooplsm/pdf-latex-mobile/blob/main/SIZES.md)) |
| Termux | Programs run from the app's data folder because Termux targets API 28; the Play build starts them through the system linker ([Termux and Android 10](https://github.com/termux/termux-packages/wiki/Termux-and-Android-10)) | `texlive-bin` 2026 or `tectonic` 0.17.0 with the system HarfBuzz ([build recipe](https://github.com/termux/termux-packages/blob/master/packages/tectonic/build.sh)) | A terminal, not an editor. The data-folder route is closed to apps targeting a current API level |
| [VerbTeX](https://apps.apple.com/app/id560869163) | A local mode called Verbnox and a cloud mode on its own servers | Not disclosed | Proprietary. Its store text claims offline TeX Live, while TeXslate's README says it never compiles on the device |
| TeXPortal and TeXpert | A TeX Live port from about 2015 | pdfTeX, XeTeX and LuaTeX | Discontinued |
| LeoTeX | A fork of TeXslate with a Chinese interface | Tectonic | GPL |

Tectonic's own [issue 662](https://github.com/tectonic-typesetting/tectonic/issues/662), "Compile for Android", has been open since 2020. On 12 July 2026 the TeXslate author posted the vcpkg and `cargo ndk` recipe there. [Issue 926](https://github.com/tectonic-typesetting/tectonic/issues/926) reports a panic in Tectonic's cache folder lookup on Android, which setting the cache paths explicitly avoids.

No Android app was found that runs a WebAssembly TeX engine in a web view, apart from browser apps such as TeXlyre installed as web apps.

## 7. LaTeX on iPad

There are three routes. A native engine linked into the app comes first, WebAssembly in the web view second and a server third. Existing App Store apps (Section 7.2) show that on-device TeX passes review.

### 7.1 Tectonic linked into the app

#### 7.1.1 Evidence that it builds and runs

[pdf-latex-mobile](https://github.com/snooplsm/pdf-latex-mobile) builds Tectonic 0.17.0's XeTeX for `aarch64-apple-ios` and `aarch64-apple-ios-sim`, merges it with the vcpkg libraries into an XCFramework (Apple's package of one library built for devices and the Simulator) and wraps it in a Swift package ([`tools/build-native.sh`](https://github.com/snooplsm/pdf-latex-mobile/blob/main/tools/build-native.sh)). Its iOS triplet builds static libraries for iOS 15 and passes `--host=aarch64-apple-darwin23` so that autoconf does not mistake the iPad for the Mac it builds on ([`arm64-ios-release.cmake`](https://github.com/snooplsm/pdf-latex-mobile/blob/main/tools/triplets/arm64-ios-release.cmake)). Its [release review](https://github.com/snooplsm/pdf-latex-mobile/blob/main/RELEASE_REVIEW.md) reports byte-identical PDFs from Android and iOS for the same invoice, with runtime tests on the ARM64 Android emulator and the iOS Simulator. Physical iOS devices were checked only as builds. Its measured iOS app growth is 7.50 MB compressed and 23.67 MB uncompressed for the balanced profile, and 14.94 MB and 39.18 MB for the full profile ([`SIZES.md`](https://github.com/snooplsm/pdf-latex-mobile/blob/main/SIZES.md)).

It differs from desktop Spectrum in one important way: it removes xdvipdfmx and `tectonic_pdf_io` and renders Tectonic's extended DVI (XDV) output with Krilla instead, for licence reasons ([licence choices](https://github.com/snooplsm/pdf-latex-mobile/blob/main/notices/DEPENDENCY-LICENSE-CHOICES.txt)). It also leaves out TECkit and network access.

Tectonic itself has no iOS work: its issue tracker has no iOS build reports, and its continuous integration builds only the macOS, Linux and Windows targets. [Typetex](https://github.com/jonasgunklach/Typetex), a small macOS and iPadOS editor, documents its Tectonic library for macOS only and uses its own Swift renderer on iPad.

#### 7.1.2 Blockers and their fixes

| Item | Finding | Fix |
| --- | --- | --- |
| Finding C libraries | Tectonic's `tectonic_dep_support` uses pkg-config by default, which refuses to cross-compile (Section 2.2) | `TECTONIC_DEP_BACKEND=vcpkg` with vcpkg's community `arm64-ios` and `arm64-ios-simulator` triplets, which vcpkg's continuous integration does not cover ([vcpkg triplets](https://learn.microsoft.com/en-us/vcpkg/concepts/triplets)). `vcpkg-rs` maps `aarch64-apple-ios` but not the Simulator target, so `VCPKGRS_TRIPLET` is set by hand ([vcpkg-rs](https://github.com/mcgoo/vcpkg-rs)) |
| ICU | vcpkg's ICU port cross-compiles with tools built for the Mac | ICU's data is large, and pdf-latex-mobile prunes it per profile (`tools/prune-icu.py`) |
| fontconfig or CoreText | `tectonic_xetex_layout` 0.3.4 uses CoreText only for `cfg(target_os = "macos")` and fontconfig for everything else. Rust's `target_os` is `"ios"` on iPad ([Rust reference](https://doc.rust-lang.org/reference/conditional-compilation.html)), so iOS takes the fontconfig path, as the probe confirmed | Build `fontconfig[core]` for iOS and write a `fonts.conf` at first launch, as pdf-latex-mobile and TeXslate do. **Inference:** widening the cfg to iOS would use CoreText instead, but needs a patch to Tectonic and `xetex-macos.c` and has not been tried |
| HarfBuzz | Built from Tectonic's vendored copy, with `HAVE_CORETEXT` defined for any Apple target (`tectonic_bridge_harfbuzz` 0.3.3 `build.rs`) | Link the CoreText framework in the app |
| `build.rs` assumptions | `tectonic_engine_xetex` compiles `xetex-macos.c` only for macOS. No other iOS-specific failure was found | None on the fontconfig path |
| Command-line dependencies | `watchexec`, `notify`, `tokio`, `clap` and `open` compile for iOS at the check stage (Section 2.2) | None so far. Linking is still to be proven |
| Global state | Only one engine may run at a time in a process, enforced by the global `ENGINE_LOCK`, and the C code reports errors with `setjmp` and `longjmp` (`tectonic_bridge_core`, `tectonic_engine_xetex` [source](https://docs.rs/crate/tectonic_engine_xetex/0.5.3/source/src/lib.rs)) | One compile at a time, on a thread of its own with a large stack. Running the engine repeatedly in one process is how Tectonic itself works, up to six TeX passes plus BibTeX and xdvipdfmx in one session |
| Leaks and crashes | [Issue 1165](https://github.com/tectonic-typesetting/tectonic/issues/1165) (open since February 2024): memory grows about 1.1 MiB per PDF compile, reaching 1,245 MiB after about 1,010 compiles of a small document. [Issue 1227](https://github.com/tectonic-typesetting/tectonic/issues/1227): a crash with `\includepdf`. TeXslate's double close and EPS failures (Section 6.1) | Patch the double close, check for EPS figures before compiling, save before every compile and push the fixes upstream. **Inference:** a long session of automatic compiles could reach the app's memory limit, so Lite should not compile on every keystroke |
| Other programs | Tectonic starts Biber with `std::process::Command` ([driver source](https://docs.rs/crate/tectonic/0.17.0/source/src/driver.rs)), which iOS forbids | Patch the driver to skip Biber with a message (Section 8) |
| Memory | An app can ask for the [increased memory limit entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.kernel.increased-memory-limit) | **Inference:** Tectonic needs far less than the limit for ordinary documents, so the entitlement is insurance only |

#### 7.1.3 What the native route gives

The native route gives the same engine, version and bundle as desktop Spectrum's built-in Tectonic, native speed, no dependence on the web view's memory cap or JIT and no effect from Lockdown Mode. The price is no crash isolation, the leak above and the licence question in Section 15.3.

### 7.2 Existing iPad TeX apps

| App | Where it compiles | Engine | Packages | Notes |
| --- | --- | --- | --- | --- |
| [Texifier](https://apps.apple.com/us/app/texifier-latex-editor/id550419159), formerly Texpad | On the device, with a cloud fallback | TexpadTeX, its own engine derived from KerTeX ([history](https://www.texifier.com/blog/texpadtex-story-so-far)) | Downloaded on demand | US$29.99 |
| [TeX Writer](https://apps.apple.com/us/app/tex-writer-latex-editor-compiler/id552717222) | On the device for pdfTeX; XeLaTeX and LuaLaTeX online | Based on TeX Live 2020 | Downloaded on demand | Last updated 26 October 2020 |
| [HoLaTeX](https://apps.apple.com/us/app/holatex/id6458879810) | On the device, offline | pdfTeX and XeTeX, LuaTeX promised | All of TeX Live 2026 inside a 1.4 GB app | Free, Premium US$23.95, iPadOS 16.6 or later |
| [a-Shell](https://apps.apple.com/us/app/a-shell/id1473805438) | On the device | Native pdfTeX, LuaTeX, LuaHBTeX and BibTeX frameworks built from TeX Live sources ([`Package.swift`](https://github.com/holzschu/a-shell/blob/master/xcfs/Package.swift)), no XeTeX | TeX Live through Apple's On-Demand Resources. Apple supplied a list of 277 files to remove, mostly scripts ([list](https://github.com/holzschu/a-shell/blob/master/ODR/forbidden_2023.sh)) | Commands are frameworks loaded on demand through [ios_system](https://github.com/holzschu/ios_system). Its author declined XeTeX for depending on macOS frameworks ([lib-tex issue 4](https://github.com/holzschu/lib-tex/issues/4)) |
| LaTeX Editor Tex Pro | On the device from version 2.0 | pdfTeX or LuaTeX | Not stated | |
| [VerbTeX](https://apps.apple.com/us/app/verbtex-latex-editor/id560869163) | A local mode and a cloud mode | Not disclosed | Not disclosed | |
| Overleaf in Safari | On Overleaf's servers, with compile time limits per plan ([docs](https://docs.overleaf.com/troubleshooting-and-support/fixing-and-preventing-compile-timeouts)) | TeX Live | On the server | |
| [iSH](https://github.com/ish-app/ish) | On the device under x86 emulation | Alpine's TeX Live 2026 | Alpine packages | An interpreter, so slow |
| Textastic and Mathpix Snip | No TeX engine on the device | | | |

At least five apps compile on the device and four of them download or bundle TeX packages, so the App Store accepts on-device TeX. HoLaTeX shows that XeTeX on an iPad passes review, although it does not say whether its engine is native or WebAssembly.

### 7.3 WebAssembly in the web view

#### 7.3.1 The projects

| Project | Engines | TeX Live | Licence | Last activity | Packages | SyncTeX | Biber | Engine size | State |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX) | pdfTeX 1.40.21, XeTeX | 2020 | GNU Affero GPL (AGPL) 3.0 | 18 June 2024 | One request per file to its server, which returned HTTP 522 on 30 October 2026 ([issue 106](https://github.com/SwiftLaTeX/SwiftLaTeX/issues/106)) | No | No | 1.8 MB (pdfTeX) | Abandoned |
| [busytex](https://github.com/busytex/busytex) | pdfTeX, XeTeX, LuaHBTeX, bibtex8, xdvipdfmx | 2023 | MIT for the scripts only | 16 October 2026, last WebAssembly build 17 February 2024 | Preloaded data packages, 104.6 MB for the basic set | Yes | No | 30.4 MB | One maintainer, stale builds |
| [TeXlyre BusyTeX](https://github.com/TeXlyre/texlyre-busytex) | pdfTeX, XeTeX, LuaHBTeX, bibtex8, makeindex, Biber 2.22 as a separate module | 2026 | AGPL 3.0 or later | 16 October 2026 | Preloaded packages (92.8 MB basic) plus an optional request per file | Yes | Yes | 32.5 MB | Active, one maintainer |
| [WasmTex](https://github.com/corca-ai/wasmtex) (Corca) | pdfTeX, XeTeX, LuaHBTeX, BibTeX | 2025 and 2026 | MIT kit, GPL engines distributed separately | 30 October 2026 | A request per file from fixed snapshots, with an optional IndexedDB cache | Yes | Only through a backend the host supplies | 1.7 MB for pdfTeX plus a 3.7 MB format | Very active, three months old |
| [LibrePaper wasm-latex](https://github.com/LibrePaper/wasm-latex) | pdfTeX, XeTeX, BibTeX, Biber from TeXlyre | 2026 | MIT build glue, GPL 2.0 pdfTeX, AGPL Biber | 28 October 2026 | Per-package archives checked by SHA-256, 18.3 MB core | pdfTeX only | Yes | 1.7 MB | Young, since September 2026 |
| [WasmTeX](https://github.com/bofeizhu/wasmtex) (bofeizhu) | XeTeX, pdfTeX, bibtex8 | 2026 | MIT wrapper | 24 July 2026 | Local bundles only, 55 MB core | No | No | 27.5 MB | Dormant |
| [Siglum](https://github.com/SiglumProject/siglum) | pdfLaTeX, XeLaTeX | 2025 | MIT | 31 January 2026 | Bundles loaded as needed | Not stated | Not stated | 29 MB | Dormant |
| [texlive.js](https://github.com/manuels/texlive.js) | pdfTeX in asm.js | 2016 | GPL 2.0 | 24 January 2017 | Preloaded | No | No | 3.2 MB | Obsolete |
| Tectonic | None | | | [Issue 166](https://github.com/tectonic-typesetting/tectonic/issues/166) open since 2018 | | | | | No WebAssembly build. A contributor could not compile its C libraries |

No project publishes a compile on an iPad, iPhone or in WKWebView. The closest figures are WasmTex's own records for desktop Safari 26.6.2: a ten-line document compiled in about 320 ms with the page using 434 to 444 MiB, XeTeX held 503 to 546 MiB after tuning and a document with three TikZ figures grew the page to 5.47 GiB before it was ended.

#### 7.3.2 JIT, Lockdown Mode and memory

WebAssembly in WKWebView runs with JIT, since the WebContent process has the JIT entitlements, while JavaScriptCore used directly inside an app has no JIT and runs WebAssembly only in an interpreter. In Lockdown Mode WebKit disables JIT and WebAssembly altogether (`useWasm() = false` in [`XPCServiceEntryPoint.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/EntryPointUtilities/Cocoa/XPCService/XPCServiceEntryPoint.mm)). An app cannot switch Lockdown Mode off for its own web view unless it holds the browser entitlement ([`WKWebpagePreferences.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebpagePreferences.mm)). A user can exclude an app in Settings, although [WebKit bug 273824](https://bugs.webkit.org/show_bug.cgi?id=273824) reports WebAssembly still blocked in app web views since iOS 17.4.

The WebContent process has a memory limit by device class. A WebKit engineer gave about 1.5 GB on iPhones and more than 4 GB on 8 GB iPads ([bug 268816](https://bugs.webkit.org/show_bug.cgi?id=268816)). A report from October 2026 measured 5,120 MiB on an iPad Air M3 ([musetric issue 1052](https://github.com/musetric/musetric/issues/1052)), while another puts the limit near 1.88 GB on every Apple mobile device ([bug 324370](https://bugs.webkit.org/show_bug.cgi?id=324370)). The increased memory entitlement does not apply to WebContent ([bug 274637](https://bugs.webkit.org/show_bug.cgi?id=274637)). wasm32 memory is capped at 4 GiB.

For speed, a study of the SPEC CPU benchmark programs found WebAssembly 45 to 55 per cent slower than native on average in Firefox and Chrome, up to 2.5 times slower ([Jangda et al., USENIX ATC 2019](https://www.usenix.org/conference/atc19/presentation/jangda)). A 2026 benchmark on an iPhone Air under iOS 27.0.1 measured a C interpreter compiled to WebAssembly in WKWebView at 96 per cent of its native speed ([wkwebview-jit-bench](https://github.com/gagarinyury/wkwebview-jit-bench)). **Inference:** a WebAssembly TeX engine on an iPad would run between 1.1 and 2.5 times slower than native, which is fast enough for ordinary documents.

#### 7.3.3 Assessment

**Inference:** the WebAssembly route works as a fallback, best with WasmTex's pdfTeX in a worker of its own, the GPL engine shipped inside the app as a separate file with its source and TeX files served from the app's own storage. Its drawbacks are a different engine and TeX Live year from the desktop's Tectonic, no compiling at all in Lockdown Mode, the need to host a TeX Live mirror and projects that are one to three months old or kept by one person.

### 7.4 Compiling on a server (optional)

A server route never runs on its own; it is a setting the user turns on. There are three forms,

- the user's own computer, where desktop Spectrum would compile for the tablet. Its backend listens on 127.0.0.1 only and has no authentication, so this needs discovery, pairing with a token and a listener on the local network or on Tailscale. It gives full TeX Live and Biber and the same output as the desktop, for about two to three weeks of desktop work (inference),
- a public service such as [TeXLive.net](https://texlive.net/), which compiles documents sent by HTTP POST but suits examples only, since a private manuscript would leave the user's control and
- a server of the user's, such as a TeX Live container with latexmk and Biber that receives a project archive and returns the PDF, the SyncTeX file and the log.

### 7.5 App Store rules

[Guideline 2.5.2](https://developer.apple.com/app-store/review/guidelines/) (guidelines last updated 16 October 2026) requires apps to be self-contained and forbids downloading or running code that adds or changes features, with a narrow exception for teaching apps. Section 3.3.1(B) of the [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) allows downloaded interpreted code as long as it does not change the app's primary purpose, does not get around signing or the sandbox and does not create a store for other code. Guideline 4.2.3(ii) asks an app that must download resources at first launch to state the size and ask first. Guideline 4.7 lists mini apps, games and plug-ins and does not concern Lite.

TeX packages are macro files read by an engine already inside the app, and a decade of approvals supports downloading them: Texifier's Bundle Manager, TeX Writer's downloader and a-Shell's On-Demand Resources. Apple's list for a-Shell flagged scripts (64 Perl, 43 shell, 33 Python and 33 Lua files among 277) and only one `.sty` and one `.def` file. On-Demand Resources are deprecated in iOS 27 in favour of Background Assets ([`NSBundleResourceRequest`](https://developer.apple.com/documentation/foundation/nsbundleresourcerequest)).

**Inference:** Lite may download TeX packages from Tectonic's server and must never download engine code. Any starter pack shipped inside the app should leave out script files, and the first download should state its size and ask.

### 7.6 Ranking

| Route | Same output as the desktop's Tectonic | Offline | Lockdown Mode | Licence exposure | Shown on iPad hardware | Rank |
| --- | --- | --- | --- | --- | --- | --- |
| Tectonic linked into the app | Yes | Yes, for cached packages | Unaffected | GPL dvipdfmx linked into the app | No, Simulator only | First |
| WebAssembly in the web view | No | Yes, with a mirror and a cache | No compiling | GPL engines as separate files | No | Fallback |
| Server | Depends on the server | No | Unaffected | None in the app | Not applicable | Optional |

## 8. Bibliographies

Tectonic runs BibTeX inside the process for every `.aux` file that asks for it (`bibtex_pass` with `BibtexEngine` in [the driver](https://docs.rs/crate/tectonic/0.17.0/source/src/driver.rs)). Biber is different. When biblatex leaves a `.run.xml` file, the driver looks for a `biber` program on the `PATH`, or for a `tectonic-biber` override, and starts it as a separate process. Tectonic's newer command-line interface (`tectonic -X build`) uses the same driver, and `tectonic -X biber` only calls that override, so no version of Tectonic runs Biber inside the process.

Hence,

- BibTeX bibliographies, natbib included, work on both platforms,
- Biber cannot run on an iPad, since iOS forbids starting programs, and Perl with Biber's modules is not a library that could be linked in (inference),
- Biber can run on Android as TeXslate's full edition shows, at about 14 MB of extra APK, but the build of Perl and Biber 2.17 for Android is not published and
- biblatex with `backend=bibtex` works for biblatex's standard styles with limits, but not for biblatex-apa, which requires Biber ([CTAN](https://ctan.org/pkg/biblatex-apa), version 9.20). Every LaTeX template Spectrum ships uses biblatex-apa, so their bibliographies would not build on an iPad.

The options for biblatex documents are these.

| Option | Platforms | Cost | Limits |
| --- | --- | --- | --- |
| Show a notice and compile without the bibliography | Both | Low | Citations show as missing |
| Reuse the desktop's `.bbl`: desktop Spectrum writes the `.bbl` beside the document after a Tectonic and Biber compile, it is committed (Spectrum's `.gitignore` keeps `.bbl`) and Lite skips Biber and reads it | Both | Low on each side | Citations added on the tablet stay missing until the desktop compiles again. **Inference:** it only works when the desktop compiled with the built-in Tectonic and Biber 2.17, since a `.bbl` from TeX Live 2026's Biber has a newer format that the bundle's biblatex 3.17 refuses |
| Ship Biber 2.17 with Perl as programs in the native library folder | Android | High | No published build recipe |
| Biber in WebAssembly in the web view | Both | High | TeXlyre's build is Biber 2.22, which does not match the bundle's biblatex 3.17, and it is AGPL |
| Compile on a server | Both | Section 7.4 | Online only |
| Switch to `backend=bibtex` with a standard style as a draft | Both | Low | The bibliography looks different from the desktop's |

**Inference:** the first version should compile BibTeX documents fully and biblatex documents with a clear notice, and the desktop `.bbl` hand-over is the cheapest next step.

## 9. SyncTeX, the PDF viewer and the editor

### 9.1 Editor

The CodeMirror 6 editor and Spectrum's completion are frontend code and carry over as they are: `latexEditor.ts` (790 lines), `latexCommands.ts` (1,445), `latexEnvs.ts` (456), `latexContext.ts` (192), `outlines.ts`, `preamble.ts` and the themes. TexLab's completion is already switched off on the desktop, so completion loses nothing when TexLab goes (Section 11). The Typst and Markdown language packages and the language server client can be left out of the Lite build. On an iPad with a hardware keyboard the existing shortcuts apply, since the web view reports a Mac (Section 5.4).

### 9.2 PDF viewer

`PdfPreview.tsx` (917 lines), `PdfSidebar.tsx`, `PdfFindBar.tsx` and `PdfPresentation.tsx` use pdf.js and load the PDF by URL through `blobUrl()`. In Lite, `blobUrl()` returns either a URL on a custom scheme served by Rust, which works for reads on both platforms, or the frontend passes the PDF's bytes from a raw binary command response to pdf.js. The second avoids the iOS slowdown for large custom-scheme responses (Section 5.4). pdf.js 6.4 needs iPadOS 18 (Section 5.1).

### 9.3 SyncTeX

Tectonic writes `.synctex.gz` when the session asks for it, as TeXslate does. Of [`synctex.js`](../apps/backend/src/services/synctex.js), the parser and both searches (`parseSynctex`, `forwardSearch`, `inverseSearch` and their helpers, about 400 lines) are plain JavaScript. Only loading the file uses Node's `zlib` and `fs`. Moving those functions into a module without Node imports lets the backend and Lite share them, with `DecompressionStream('gzip')` reading the file in the web view. The frontend's `editor/synctex.ts` already handles the page coordinates. No Rust port is needed.

### 9.4 How much of the frontend carries over

Each file under `apps/frontend/src` was sorted into one of three groups,

- as it is: files with no backend or desktop coupling,
- with changes: files that call backend routes Lite answers differently or show desktop wording and
- dropped: features outside Lite's scope (Section 4).

| Group | Lines | Share | Share without the diagram composer | Largest files |
| --- | ---: | ---: | ---: | --- |
| As it is | 15,168 | 26.6% | 36.6% | the stylesheets, `latexCommands.ts`, `latexEditor.ts`, `latexEnvs.ts`, `floats.ts`, `SplitDiffView.tsx`, `Menu.tsx`, `PdfSidebar.tsx`, `compileLog.ts` |
| With changes | 18,009 | 31.6% | 43.5% | `EditorPage.tsx`, `SettingsSheet.tsx`, `ProjectPage.tsx`, `api/client.ts`, `FloatsTab.tsx`, `settings.ts`, `PdfPreview.tsx`, `FileTree.tsx`, the GitHub views |
| Dropped | 23,824 | 41.8% | 19.9% | the diagram composer (15,589 lines), the agent views, `Composer.tsx`, `ReviewTab.tsx`, the Research panel, `AgentSettings.tsx`, `TransferPanel.tsx`, the TexLab client |
| Total | 57,001 | 100% | 100% (41,412 lines) | |

The 6,212 lines of `.check.ts` checks mostly test pure functions, so most of them keep working for Lite. **Inference:** the changes fall in three places, which are a tablet layout, the transport in `api/client.ts` and feature switches in `EditorPage.tsx`, `ProjectPage.tsx` and `SettingsSheet.tsx`. They need not fork the frontend.

## 10. GitHub sync on a tablet

### 10.1 What the desktop does

Each project is a private repository. The link lives in `.spectrum/settings.json` as `{ owner, repo, projectId, personal }`, and `projectId` must equal the `id` in `.spectrum/project.json` for the project to count as linked. A commit holds the project's files plus `.spectrum/project.json`, `.spectrum/settings.json`, `chats/`, `todos/`, `notes/` and `research/`, and leaves out the rest of `.spectrum`, each document's compiled PDF, files that look like keys, files over 100 MB, temporary files and sync apps' conflicted copies ([`gitService.js`](../apps/backend/src/services/gitService.js), `keptOut`, `compiledPdfs` and `commitAll`). In a public or shared repository, chats, to-dos, notes and research sessions stay out until the user agrees.

A pull merges file by file against the common commit. Text merges by lines, a `.bib` by entry, `project.json` and `settings.json` key by key, chats by message and research sessions by search. A text file that does not merge keeps this computer's copy with GitHub's beside it as `name (GitHub’s conflicted copy YYYY-MM-DD HHMMSS).ext`. Deleting more than 5 files that are also more than a quarter of the project needs the user's agreement, and a checkpoint is saved before any file changes ([`mergeRules.js`](../apps/backend/src/services/mergeRules.js)). Commits use the account's `<id>+<login>@users.noreply.github.com` address.

### 10.2 Options

| Option | iOS | Android | Push | Reuse of the desktop's logic | Main risk |
| --- | --- | --- | --- | --- | --- |
| libgit2 through `git2` 0.21 | Builds. [GitSync](https://github.com/ViscousPot/GitSync) ships it on both stores. An iOS link error with zlib and iconv was reported ([issue 1185](https://github.com/rust-lang/git2-rs/issues/1185)) | Builds. Certificate checks fail with the vendored OpenSSL ([issue 920](https://github.com/rust-lang/git2-rs/issues/920), open since 2023) unless a CA file is shipped | Yes | The merge rules would be ported to Rust or bridged to JavaScript | C libraries and OpenSSL to build |
| gitoxide (`gix` 0.90) | Pure Rust | Pure Rust | No, push is not implemented ([README](https://github.com/GitoxideLabs/gitoxide)) | As above | No push |
| isomorphic-git 1.44 in the web view | Works with a custom HTTP client ([docs](https://isomorphic-git.org/docs/en/http)) | Same | Yes | Highest: `gitService.js` almost unchanged | A file system adapter over Tauri commands is slow, IndexedDB can be evicted, the token sits in JavaScript and [obsidian-git](https://github.com/Vinzent03/obsidian-git) calls this setup very unstable on phones |
| GitHub's REST API with no local Git | Yes | Yes | Yes, through the Git Data API | Merge rules shared in JavaScript, new transport | Base tracking has to be exact |

The REST route uses calls that GitHub documents for this purpose. A tree with `base_tree` and entries carrying `content`, or `sha: null` for a deletion, makes a commit's files in one request ([trees](https://docs.github.com/en/rest/git/trees)). A commit and a fast-forward reference update complete it. A recursive tree read covers up to 100,000 entries, blobs go up to 100 MB, an archive download fetches a whole commit and a signed-in user has 5,000 requests an hour ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). The REST API also allows CORS from any origin, while Git's own HTTP endpoints do not ([CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests)).

### 10.3 Recommendation

Use the REST route from Rust, with the merge planning in shared JavaScript. Specifically, Lite keeps for each project the commit it last agreed with GitHub and the blob hash of every file at that commit, in its own app data rather than in the project. A sync then runs in these steps,

1. Read GitHub's branch head. When it equals the stored commit and nothing changed on the tablet, stop
2. Hash the tablet's files as Git blobs, then read GitHub's tree and fetch the blobs GitHub changed since the agreed commit, plus the agreed versions of files changed on both sides for the three-way merge
3. Plan the merge with the desktop's own rules (`decide`, the text and `.bib` merges, `mergeMeta`, the chat merge, conflicted copy names and the deletion brake), moved into a module without Node imports and shared with the backend
4. Keep a copy of every local file the merge replaces, then write the results to the tablet
5. Make one commit on top of GitHub's head with the merged tree and move the branch with a fast-forward update. When GitHub moved meanwhile, start again from step 1
6. Store the new commit as the agreed one

The desktop sees ordinary commits on top of the ones it pushed, so its next pull merges them as it merges another desktop's. The first download of a project is the archive of its head commit, unpacked in Rust with the `flate2` and `tar` crates that Tectonic already depends on.

For a clean round trip the tablet must also,

- never change `id` in `project.json`, and keep unknown keys in both JSON files,
- commit only what the desktop commits, using the same `keptOut`, `compiledPdfs`, secret and size rules and the project's `.gitignore`,
- keep the rule for personal files in shared repositories,
- refuse names that differ from another only in letter case and names Windows cannot hold, since iPadOS and Android app storage tell case apart while macOS and Windows do not (`keyOf` and `unfitOnWindows`),
- refuse repositories that use Git Large File Storage (LFS) or submodules, as the desktop does and
- write commits as the same noreply address, with messages such as "Backup from iPad".

### 10.4 Signing in and storing the token

GitHub's device flow needs no client secret and no redirect, so the tablet can use Spectrum's existing OAuth app and scopes (`repo read:user`). The app shows the code, opens github.com in the browser and polls ([device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)). A pasted personal access token stays as the alternative. GitHub added Proof Key for Code Exchange (PKCE) in July 2025 ([changelog](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/)), but its documentation still lists the client secret as required for the web flow, so the device flow remains the right choice.

The token is kept in the iOS Keychain through the `security-framework` crate or `keyring-core` with [`apple-native-keyring-store`](https://github.com/open-source-cooperative/apple-native-keyring-store), and in the Android Keystore through [`android-native-keyring-store`](https://github.com/open-source-cooperative/android-native-keyring-store) or a small Kotlin plugin. As on the desktop, the token never reaches the web view: the Rust commands make every GitHub call themselves.

## 11. TexLab

Linking TexLab is not realistic. It is GPL 3.0 only, its crates have not been published to crates.io since 4.3.2 in November 2022 and its file watcher, thread pools and program launches stand in the way of WebAssembly ([texlab](https://github.com/latex-lsp/texlab)). Linking it would also make the iPad app a GPL 3.0 work on the App Store, the conflict that removed GNU Go from the store in 2010 ([LWN](https://lwn.net/Articles/391423)) and VLC in 2011, which came back in 2013 under the MPL 2.0 as well ([The Next Web](https://thenextweb.com/news/vlc-for-ios-will-return-to-the-app-store-on-july-19-full-re-write-open-source-licensed-under-mplv2-and-gplv2)).

Lite loses little by cutting it. Spectrum's own completion already replaces TexLab's, the Outline reads the headings itself when TexLab is absent and the compile log still reports errors. **Inference:** go to definition for `\ref` and `\cite`, and marks for missing labels and keys, can later come from a small index in the frontend built on the scanners in `latexEnvs.ts` and `insights.ts`.

## 12. Spelling

The web views are not suitable. iOS does not mark misspellings in CodeMirror 6 at all, and Android's marks depend on the device's spell checker and ignore Spectrum's LaTeX masking (Section 5.4).

Spelling should therefore move into Rust with [spellbook](https://github.com/helix-editor/spellbook) 0.4.2, a Rust spell checker that reads Hunspell dictionaries, under the Mozilla Public License 2.0 (MPL 2.0). It can load the same SCOWL en_AU-large and AussieDic dictionaries the desktop ships, behind a command that answers the same request as `/api/spell/check`. The frontend's `spellcheck.ts` and the backend's `latex/mask.js` stay as they are.

Harper is already used through WebAssembly: the desktop runs Harper 3.0.0's `harper_wasm_bg.wasm` (16.2 MB) in a Node worker for grammar ([`native/harper`](../native/harper/manifest.json)). For Lite's later grammar check there are two ways. The same WebAssembly can run in a web worker with the text masked as the desktop masks it, which needs no port but stops in Lockdown Mode. Alternatively `harper-core` and `harper-tex` 3.0.0 (Apache 2.0) can run in Rust and read LaTeX themselves ([Harper](https://github.com/Automattic/harper)). Harper's own spelling rule uses its curated dictionary rather than SCOWL, so it does not replace spellbook.

## 13. Recommended architecture

### 13.1 Overview

```
apps/frontend (shared with desktop)          apps/lite/src-tauri (new, iOS and Android only)
  React, CodeMirror 6, pdf.js                  lib.rs: run() with tauri::mobile_entry_point
  LITE build: desktop features off             commands: projects, files, compile,
  api/client.ts: request() -> invoke()           synctex bytes, github, spell, settings
  SyncTeX search, merge planning (JS) <------>   Tectonic 0.17.0 linked in (vcpkg C libraries)
  shared pure modules from apps/backend          token in Keychain or Keystore
```

### 13.2 What lives in Rust

| Command group | Responsibility | Estimated size |
| --- | --- | --- |
| Projects and files | List, open and remove projects. Read the tree, read and atomically write files with the desktop's check that the file still holds what the editor loaded, rename, delete, make folders and import images, all inside the project folder (`safeJoin`) | 500 lines |
| Compile | One compile at a time behind a mutex, on its own thread. `ProcessingSessionBuilder` with the desktop's options (`continue_on_errors`, extra search paths for the project root, SyncTeX on, intermediates kept and no reruns in draft mode), the bundle and format cache in app storage, `fonts.conf`, log lines streamed through a Tauri channel, Biber skipped with a message, EPS check, PDF and SyncTeX returned as raw bytes | 600 lines |
| GitHub | Device flow, token storage, archive download, tree and blob reads, commit and reference writes, retries offline | 900 lines |
| Spelling | spellbook with the bundled dictionaries and the personal word list | 200 lines |
| Settings and app state | Lite's own settings, the agreed commit per project, cache size and clearing | 300 lines |

The crate patches `tectonic_bridge_core` for the double close (Section 6.1) through `[patch.crates-io]` until the fix lands upstream. It does not share code with the desktop's `src-tauri`, whose `main.rs` is all desktop work, and the desktop keeps running Tectonic as a program.

### 13.3 What stays in the frontend and what is shared

The frontend gains a build-time constant, `LITE`, set with a Vite mode. Code behind `if (LITE)` lets Vite drop the agents, Research, the diagram composer, Mermaid and the other desktop-only modules from the Lite bundle. `request()` in `api/client.ts` sends each of the roughly 40 routes Lite needs to a Tauri command, and the three event streams become Tauri events and channels. `platform.ts` reports iPadOS or Android so the wording is right.

The backend keeps its behaviour while some of its pure functions move into modules without Node imports, which both the backend and Lite import: the SyncTeX parser and searches, `mergeRules.js` without its file writes, `merge3.js`, `chatMerge.js`, `conflictCopies.js` and the commit rules (`keptOut`, `secretLooking`, `compiledPdfs` and `planMerge`), about 1,000 lines in all. This keeps one copy of the rules that decide how a project round-trips.

Everything stays in one repository. The new crate goes in `apps/lite` with an identifier such as `com.beyond3345.spectrum.lite` and its own `tauri.conf.json` and capabilities.

### 13.4 On the tablet

| Path in app storage | Holds | Goes to GitHub |
| --- | --- | --- |
| `projects/<project id>/` | The working copy, laid out as on the desktop, `.spectrum` included | Yes, by the desktop's rules |
| `state/<project id>.json` | Repository, branch, agreed commit and the blob hash of each file | No |
| `cache/<project id>/` | SyncTeX, the thumbnail and the copies kept before a pull | No |
| `tectonic/` | Tectonic's bundle cache and format files | No |
| Keychain or Keystore | The GitHub token | No |

### 13.5 Bundle, packages and offline use

1. Use Tectonic 0.17.0 with its default TeX Live 2022 bundle (format 33), the same as the desktop's built-in Tectonic, and pin the bundle's address so a change of Tectonic's default does not change Lite without notice
2. Keep the cache in `Library/Application Support/tectonic` on iOS with the flag that keeps it out of iCloud backups, not in `Caches`, which iOS may empty, and in `filesDir/tectonic` on Android. Set the paths explicitly, as TeXslate does
3. Ship a prebuilt XeLaTeX format file with the app, so the first compile does not build one
4. Build a starter pack at release time by compiling every Spectrum LaTeX template against an empty cache, leaving out script files. **Inference:** it would be 40 to 60 MB uncompressed, so either ship it inside the app or download it once with the size stated
5. Fetch other packages on demand while online. Tectonic 0.17.0 checks the bundle's digest weekly rather than at every compile
6. Offer Make available offline for a project, which compiles it once while online, and show the cache's size in Settings with a way to clear it
7. Offline, compile from the cache, and when a package is missing say so in the desktop's words for the same case
8. Generate `fonts.conf` at first launch for the bundle's fonts and the app's own font folder. A document that asks fontspec for a font only the Mac has will fail on the tablet, so the message should suggest a TeX Gyre or Latin Modern font

## 14. Effort, risk and the first spike

### 14.1 Phases

The sizes are for one experienced developer and are rough.

| Phase | Work | Size |
| --- | --- | --- |
| 0. Spike | The iPad spike (Section 14.3) and a one-day Android build of the same app | 1 to 2 weeks |
| 1. Lite core, Android beta | Android build pipeline with vcpkg, NDK r28 or later and signing (1 to 2 weeks), project and file commands (1 week), compile command with the patches, cache and log (2 weeks), Lite mode in the frontend with the transport, feature switches, tablet layout and image import (2 to 3 weeks), SyncTeX in the frontend (2 to 3 days), GitHub sign-in, token and REST sync with the shared merge rules (2 to 3 weeks), spelling (3 to 5 days) and round-trip testing against the desktop on macOS and Windows (1 to 2 weeks) | 10 to 14 weeks |
| 2. iPad | vcpkg iOS build in the app, Keychain, the scene manifest, keyboard and safe areas, the privacy manifest, TestFlight and App Review | 3 to 5 weeks |
| 3. Options | The desktop `.bbl` hand-over, Biber on Android, compiling on the user's computer, Checkpoints, Harper grammar, linked documents, makeindex, the settings repository and the diagram composer | 1 to 4 weeks each |

Android goes first because TeXslate has already shown Tectonic on Android tablets and Android has no review step. The iPad spike still comes first of all, because it decides whether Lite is a product for two platforms. **Inference:** once the core works on Android, the iPad build reuses all of it apart from the native build and the platform details, which is why Phase 2 is short.

### 14.2 Risks and unknowns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Tectonic does not link or run on a physical iPad | Low to medium, since the Simulator run is shown | High | The spike, then WebAssembly as the fallback |
| Crashes or leaks inside the app process | Medium | High | The patches, the EPS check, saving before each compile, no compile on every keystroke and fixes sent upstream |
| GPL dvipdfmx inside an App Store binary | Medium | High | A licence read (Section 15.3), then publishing the source or using a Krilla writer as pdf-latex-mobile does |
| Biber-only bibliographies, which every Spectrum template uses | Certain | Medium | BibTeX works, then the `.bbl` hand-over, Biber on Android and the server option |
| Tauri's iOS 27 scene requirement and keyboard issues | Medium | Medium | The static scene manifest, early device tests |
| TeX Live 2022 on the tablet against TeX Live 2026 on a desktop with MacTeX or MiKTeX | Medium | Medium | Name the engine and bundle in Lite, compile with the built-in Tectonic on the desktop when the output must match |
| A sync bug loses work | Low to medium | High | Shared merge rules, the deletion brake, copies kept before every pull and a test matrix with two desktops and a tablet |
| Tectonic's bundle server is unavailable | Low | Medium | The cache and starter pack, a mirror later |
| App Review objects to first-launch downloads | Low | Medium | State the size and ask first, leave scripts out of the starter pack |
| Low-memory Android tablets | Medium | Low | Require 4 GB of RAM and test on a cheap tablet |

The biggest unknowns, in order, are a compile on real iPad hardware, how the engine behaves over a long session inside one process, the licence decision for dvipdfmx and how many of the user's real projects depend on Biber.

### 14.3 The first spike

The spike proves or kills the iPad route in three to five days, in these steps,

1. Install the build tools pdf-latex-mobile lists (Homebrew's m4, pkg-config, autoconf, autoconf-archive, automake, libtool and XcodeGen, plus CocoaPods), then build its iOS harness and run its full-profile invoice on a physical iPad with a free or paid Apple account. Record the compile time, the peak memory in Instruments and the app size
2. Create a bare Tauri 2.12 app with `tauri ios init`, set it to iPad only with iPadOS 18 as the minimum and add the static scene manifest from issue 15719
3. Depend on stock `tectonic = "=0.17.0"` with xdvipdfmx kept, built with `TECTONIC_DEP_BACKEND=vcpkg` and pdf-latex-mobile's two iOS triplets. Add one command that compiles a folder's `main.tex` with the cache in Application Support and returns the PDF bytes. Show the PDF with pdf.js
4. Compile Spectrum's Maths notes template (with the Biber step expected to fail cleanly), a BibTeX article and a ten-page document, online and then offline
5. Compile 100 times in a row while watching memory, then try a document with an error, a missing package offline, an EPS figure, `\includepdf` and a fontspec document with a system font name
6. Lastly, repeat steps 2 to 4 for Android on a tablet with vcpkg's `arm64-android` triplet

Lite on iPad is killed or changed to the WebAssembly route when,

- Tectonic and its libraries cannot be linked for `aarch64-apple-ios` within three days,
- the engine crashes on repeated compiles in a way small patches cannot fix,
- a warm compile of a ten-page article takes more than about 10 seconds on an iPad with an A14 chip or later or
- memory grows without bound over 200 compiles.

## 15. Costs, distribution and licences

### 15.1 Costs

| Item | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | US$99 a year, charged in local currency where available ([enrolment](https://developer.apple.com/help/account/membership/program-enrollment/)) | The Australian dollar price is shown at enrolment and was not confirmed for this report. Needed for TestFlight, the App Store and installs on a device that last longer than seven days |
| Free Apple Account | Nothing | Installs on up to three devices, which expire after seven days ([comparison](https://developer.apple.com/support/compare-memberships/)). Enough for the spike |
| TestFlight | Included | 100 internal and 10,000 external testers, review of the first external build, builds expire after 90 days ([overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)) |
| Google Play Console | US$25 once ([fee](https://support.google.com/googleplay/android-developer/answer/6112435)) | New apps and updates must target API 36 since 31 August 2026, with extensions to 1 November 2026 ([target API](https://developer.android.com/google/play/requirements/target-sdk)) |

### 15.2 Distribution

On Android, an APK can be installed directly, and Google's developer verification is enforced only for installs from participating stores in Brazil, Indonesia, Singapore and Thailand from 30 September 2026, with a global rollout in 2027 and installs through ADB exempt ([developer verification](https://developer.android.com/developer-verification)). F-Droid builds only public free software, so it is closed while Spectrum's repository is private. Google Play's internal testing track suits a beta.

On iPad, TestFlight and the App Store are the routes. The EU's alternative marketplaces and web distribution still need Apple's notarisation, which applies guideline 2.5.2, so they offer Lite nothing.

### 15.3 Licences

| Component | Licence | How Lite uses it | Note |
| --- | --- | --- | --- |
| Tectonic's driver, XeTeX engine, BibTeX and bundle code | MIT by crate metadata | Linked in | The XeTeX crate includes TECkit, under the Common Public License (CPL) or the GNU Lesser GPL (LGPL) 2.1, with the CPL the simpler choice for static linking |
| `tectonic_pdf_io` and `tectonic_engine_xdvipdfmx` (dvipdfmx) | MIT by crate metadata, but 148 source files carry GPL 2.0 or later headers | Linked in | Linking makes the app a combined GPL work. Its whole source has to be offered to every user, which Spectrum's private repository does not do today, and the App Store's terms have been held to conflict with the GPL. `BACKLOG.md` already flags this for the desktop, where Tectonic is a separate program. pdf-latex-mobile avoids it with Krilla |
| HarfBuzz, ICU, FreeType, graphite2, libpng, zlib, fontconfig and expat | Old MIT, Unicode 3.0, FreeType License, MPL 2.0 (one of graphite2's three choices), libpng 2.0, zlib, MIT-style and MIT | Linked in | The desktop's notices already list most of them |
| TeX packages from the bundle | Mostly the LaTeX Project Public License (LPPL), some GPL and fonts under the GUST Font License and the SIL Open Font License | Downloaded, or shipped in a starter pack | A starter pack redistributes them and needs their notices |
| TexLab | GPL 3.0 only | Not used | Section 11 |
| spellbook | MPL 2.0 | Linked in | File-level copyleft, so Spectrum's own code stays MIT |
| SCOWL dictionaries | MIT and BSD | Data | |
| AussieDic | GPL 3.0 | Data | The same App Store question as GPL code, so it could be left out of the iPad build |
| Harper | Apache 2.0 | Later | |
| pdf.js, CodeMirror and React | Apache 2.0 and MIT | Bundled | |
| Biber | Artistic 2.0, with Perl under Artistic or GPL | Android only, as a separate program | |

**Inference:** this is not legal advice. The lowest-risk order is to decide the dvipdfmx question before the iPad release, either by publishing Spectrum's source with each Lite release and accepting the App Store question, or by replacing xdvipdfmx with an MIT-licensed writer at the cost of output that differs from the desktop.

## 16. In summary

Spectrum Lite is feasible on both platforms with Tectonic 0.17.0 linked into a mobile-only Tauri crate. On Android the route is proven on tablets by TeXslate, and on iPad it is proven only as far as the iOS Simulator by pdf-latex-mobile, which is why a three-to-five-day spike on a physical iPad comes first. The shared React frontend in a Lite mode, the desktop's merge rules and SyncTeX parser in shared JavaScript, a GitHub transport over the REST API and spellbook for spelling keep most of the work in existing code and let a project round-trip with the desktop. The main limits are the missing Biber on iPad, which affects every Spectrum template's bibliography, and the dvipdfmx licence question for the App Store. Overall, the first version needs about 14 to 21 weeks to reach both stores, including the spike.

## 17. Sources

Spectrum (this repository): [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml), [`src-tauri/src/main.rs`](../src-tauri/src/main.rs), [`compileService.js`](../apps/backend/src/services/compileService.js), [`engineService.js`](../apps/backend/src/services/engineService.js), [`synctex.js`](../apps/backend/src/services/synctex.js), [`gitService.js`](../apps/backend/src/services/gitService.js), [`githubService.js`](../apps/backend/src/services/githubService.js), [`mergeRules.js`](../apps/backend/src/services/mergeRules.js), [`engines.json`](../apps/backend/src/data/engines.json), [`api/client.ts`](../apps/frontend/src/api/client.ts), [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and [`BACKLOG.md`](BACKLOG.md).

Tauri: [releases](https://github.com/tauri-apps/tauri/releases), [Tauri 2.0](https://v2.tauri.app/blog/tauri-20/), [prerequisites](https://v2.tauri.app/start/prerequisites/), [configuration](https://v2.tauri.app/reference/config/), [mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/), [App Store](https://v2.tauri.app/distribute/app-store/), [iOS signing](https://v2.tauri.app/distribute/sign/ios/), [Android signing](https://v2.tauri.app/distribute/sign/android/), [Google Play](https://v2.tauri.app/distribute/google-play/), [file system plugin](https://v2.tauri.app/plugin/file-system/), [HTTP plugin](https://v2.tauri.app/plugin/http-client/), [plugins-workspace](https://github.com/tauri-apps/plugins-workspace), issues [9774](https://github.com/tauri-apps/tauri/issues/9774), [15719](https://github.com/tauri-apps/tauri/issues/15719), [9907](https://github.com/tauri-apps/tauri/issues/9907) and [10631](https://github.com/tauri-apps/tauri/issues/10631), [wry issue 1775](https://github.com/tauri-apps/wry/issues/1775), plugin issues [933](https://github.com/tauri-apps/plugins-workspace/issues/933) and [3494](https://github.com/tauri-apps/plugins-workspace/issues/3494) and [PR 2322](https://github.com/tauri-apps/plugins-workspace/pull/2322).

Tectonic and Android: [Tectonic changelog](https://github.com/tectonic-typesetting/tectonic/blob/release/CHANGELOG.md), [driver source](https://docs.rs/crate/tectonic/0.17.0/source/src/driver.rs), issues [166](https://github.com/tectonic-typesetting/tectonic/issues/166), [662](https://github.com/tectonic-typesetting/tectonic/issues/662), [926](https://github.com/tectonic-typesetting/tectonic/issues/926), [1165](https://github.com/tectonic-typesetting/tectonic/issues/1165) and [1227](https://github.com/tectonic-typesetting/tectonic/issues/1227), [TeXslate](https://github.com/thobgg/TeXslate) at [v1.0-alpha27](https://github.com/thobgg/TeXslate/releases/tag/v1.0-alpha27), [TeXslate on F-Droid](https://f-droid.org/packages/de.bgg_home.texslate/), [pdf-latex-mobile](https://github.com/snooplsm/pdf-latex-mobile), [Termux's Tectonic](https://github.com/termux/termux-packages/blob/master/packages/tectonic/build.sh), [Termux and Android 10](https://github.com/termux/termux-packages/wiki/Termux-and-Android-10), [vcpkg triplets](https://learn.microsoft.com/en-us/vcpkg/concepts/triplets) and [vcpkg-rs](https://github.com/mcgoo/vcpkg-rs).

iPad: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/), [TN3187](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle), [`NSBundleResourceRequest`](https://developer.apple.com/documentation/foundation/nsbundleresourcerequest), [increased memory limit](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.kernel.increased-memory-limit), [a-Shell](https://github.com/holzschu/a-shell), [ios_system](https://github.com/holzschu/ios_system), [lib-tex issue 4](https://github.com/holzschu/lib-tex/issues/4), [iSH](https://github.com/ish-app/ish), [Typetex](https://github.com/jonasgunklach/Typetex), the App Store pages for [Texifier](https://apps.apple.com/us/app/texifier-latex-editor/id550419159), [TeX Writer](https://apps.apple.com/us/app/tex-writer-latex-editor-compiler/id552717222), [HoLaTeX](https://apps.apple.com/us/app/holatex/id6458879810), [a-Shell](https://apps.apple.com/us/app/a-shell/id1473805438) and [VerbTeX](https://apps.apple.com/us/app/verbtex-latex-editor/id560869163), [TexpadTeX's history](https://www.texifier.com/blog/texpadtex-story-so-far), [Overleaf's compile limits](https://docs.overleaf.com/troubleshooting-and-support/fixing-and-preventing-compile-timeouts) and [TeXLive.net](https://texlive.net/).

WebKit and WebAssembly: [`process-entitlements.sh`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Scripts/process-entitlements.sh), [`WKWebpagePreferences.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebpagePreferences.mm), [`XPCServiceEntryPoint.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/EntryPointUtilities/Cocoa/XPCService/XPCServiceEntryPoint.mm), WebKit bugs [268816](https://bugs.webkit.org/show_bug.cgi?id=268816), [273824](https://bugs.webkit.org/show_bug.cgi?id=273824), [274637](https://bugs.webkit.org/show_bug.cgi?id=274637) and [324370](https://bugs.webkit.org/show_bug.cgi?id=324370), [musetric issue 1052](https://github.com/musetric/musetric/issues/1052), [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [wkwebview-jit-bench](https://github.com/gagarinyury/wkwebview-jit-bench), [Jangda et al.](https://www.usenix.org/conference/atc19/presentation/jangda), [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX), [busytex](https://github.com/busytex/busytex), [TeXlyre BusyTeX](https://github.com/TeXlyre/texlyre-busytex), [WasmTex](https://github.com/corca-ai/wasmtex), [LibrePaper wasm-latex](https://github.com/LibrePaper/wasm-latex), [WasmTeX](https://github.com/bofeizhu/wasmtex), [Siglum](https://github.com/SiglumProject/siglum), [texlive.js](https://github.com/manuels/texlive.js) and [pdf.js `gulpfile.mjs`](https://github.com/mozilla/pdf.js/blob/master/gulpfile.mjs).

Git, GitHub and spelling: [git2 issue 920](https://github.com/rust-lang/git2-rs/issues/920), [git2 issue 1185](https://github.com/rust-lang/git2-rs/issues/1185), [GitSync](https://github.com/ViscousPot/GitSync), [gitoxide](https://github.com/GitoxideLabs/gitoxide), [isomorphic-git HTTP clients](https://isomorphic-git.org/docs/en/http), [obsidian-git](https://github.com/Vinzent03/obsidian-git), [Git trees API](https://docs.github.com/en/rest/git/trees), [contents API](https://docs.github.com/en/rest/repos/contents), [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [CORS](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests), [device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [PKCE](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/), [apple-native-keyring-store](https://github.com/open-source-cooperative/apple-native-keyring-store), [android-native-keyring-store](https://github.com/open-source-cooperative/android-native-keyring-store), [TexLab](https://github.com/latex-lsp/texlab), [LWN on GPL software in the App Store](https://lwn.net/Articles/391423), [VLC's return under the MPL](https://thenextweb.com/news/vlc-for-ios-will-return-to-the-app-store-on-july-19-full-re-write-open-source-licensed-under-mplv2-and-gplv2), [Harper](https://github.com/Automattic/harper), [spellbook](https://github.com/helix-editor/spellbook), [CodeMirror on iOS spell checking](https://discuss.codemirror.net/t/os-level-spellcheck-is-disabled-on-ios-even-after-adding-contentattribute/4128) and [biblatex-apa on CTAN](https://ctan.org/pkg/biblatex-apa).

Android and Apple programmes: [target API level](https://developer.android.com/google/play/requirements/target-sdk), [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes), [developer verification](https://developer.android.com/developer-verification), [`WebResourceRequest`](https://developer.android.com/reference/android/webkit/WebResourceRequest), [Play registration fee](https://support.google.com/googleplay/android-developer/answer/6112435), [Apple enrolment](https://developer.apple.com/help/account/membership/program-enrollment/), [membership comparison](https://developer.apple.com/support/compare-memberships/) and [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
