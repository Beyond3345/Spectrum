# Developing Spectrum

This document covers building Spectrum from source, running it in a browser, its configuration and the layout of the repository. What Spectrum does is described in the [user guide](USER_GUIDE.md).

## Building from source

Building requires Node.js 20.12 or later, Rust with the `aarch64-apple-darwin` target and Xcode.

1. Run `npm install`
2. Run `npm test` to run the backend tests
3. Run `npm run desktop:build` to build the application for Apple silicon and the DMG

The test that moves a project to the Bin is skipped by default, since it moves a real folder into the macOS Bin. Set `SPECTRUM_TEST_BIN=1` to include it.

The spell checker and the grammar checker are compiled code that is kept in `native/`, so a normal build does not need to rebuild them. Their sources and build tools are pinned in `native/checkers.lock.json`. Hunspell's source is kept unmodified in `native/hunspell/core`, beside Spectrum's binding (`native/hunspell/binding.cc`), and checked against the hash recorded there, and Harper's is downloaded from its pinned release archive and checked against its SHA-256 (or taken from a checkout that `HARPER_DIR` names, or from an archive given with `--archive`). `npm run native:build` rebuilds both, tests each build and records its versions and file hashes in a manifest beside it, and `npm run checkers:verify` checks that the files in `native/` and `dictionaries/` match their manifests. Rebuilding needs Xcode and Python for the Hunspell binding, and Rust with the `wasm32-unknown-unknown` target and `wasm-pack` for Harper.

To move to a newer Harper or Hunspell, put its version, archive URL and SHA-256 in `native/checkers.lock.json` and rebuild it (`node scripts/native.mjs harper`, or `node scripts/native.mjs hunspell --update`, which also replaces the source kept in `native/hunspell/core`). A checksum or source hash that differs stops the build and prints the one it found, so the lock can be updated once the new source has been reviewed. Then run `npm run checkers:verify`.

The language catalogue in `apps/backend/src/data/languages.json` is written by `node scripts/native.mjs catalogue` from the dictionary sources pinned in `native/checkers.lock.json`. It downloads each dictionary, keeps those with a licence file, a UTF-8 or ISO-8859-1 encoding and three words of their own that they accept, and prints every language it kept or refused. `node scripts/native.mjs catalogue --check` downloads them again and compares, for use before a release.

The build script downloads Node.js 24 LTS, TexLab 5.26.0, Tectonic 0.17.0 and Typst 0.15.1 for Apple silicon and checks them against pinned SHA-256 sums (the engines' sums are in `apps/backend/src/data/engines.json`). It then bundles the backend with esbuild and runs `tauri build --target aarch64-apple-darwin`. The results are written to `src-tauri/target/aarch64-apple-darwin/release/bundle/`. The engines' versions and checksums live in that one file, which Settings and the backend read as well.

The Windows installer is built on Windows with the same command. It needs Node.js, Rust with the MSVC toolchain and the Visual Studio Build Tools with C++ and Python for the Hunspell binding, which is built for Windows with `node scripts/native.mjs hunspell`. The build script downloads the Windows Node.js 24 LTS and the engines, checks them in the same way, builds `texlab.exe` from TexLab's checked source with the C runtime linked in, puts Microsoft's `vcruntime140.dll` beside Typst and runs `tauri build --target x86_64-pc-windows-msvc`, which writes an NSIS installer. The workflow in `.github/workflows/windows.yml` does all of this on GitHub Actions, runs the backend tests with MiKTeX and attaches the installer to a release when it is run with a release tag. The Fluent icons in `apps/frontend/public/fluent/` are written by `node scripts/fluent-icons.mjs`.

For development there are two options. `npm run desktop:dev` runs the macOS shell against the backend in the repository, fetching the engines first if needed, and `npm run dev` runs the interface in a browser at `http://localhost:5173` with the backend on port 8787, which uses a `texlab` on the `PATH` (`brew install texlab`) when there is one. For a browser build, run `node scripts/desktop.mjs typst` and `node scripts/desktop.mjs tectonic` once so the backend finds the built-in engines beside the repository.

## Running in a browser

1. Run `npm run build`
2. Run `npm start`
3. Open `http://localhost:8787`

The server only accepts requests from the same computer, since it has full access to the project folders.

## Configuration

The backend reads the following environment variables, either from the environment or from a `.env` file.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SPECTRUM_LLM_ENDPOINT` | OpenAI-compatible chat completions endpoint | `https://api.openai.com/v1/chat/completions` |
| `SPECTRUM_LLM_API_KEY` | API key used when none is entered in Settings | none |
| `SPECTRUM_LLM_MODEL` | Model name | `gpt-6-sol` |
| `SPECTRUM_PROJECTS_DIR` | Default folder for new projects | `~/Documents/Spectrum` |
| `SPECTRUM_DATA_DIR` | Project list and user templates | `data/` in the repository, or the application support folder in the app |
| `SPECTRUM_HOST` and `PORT` | Address the server listens on | `127.0.0.1` and `8787` |
| `SPECTRUM_PYTHON` | Python used by the table to chart tool | `python3` |
| `SPECTRUM_MINERU_TOKEN` | MinerU token for template conversion, sent only to MinerU's own address or to `SPECTRUM_MINERU_API_BASE` | none |
| `SPECTRUM_MINERU_API_BASE` | MinerU API address | `https://mineru.net/api/v4` |
| `SPECTRUM_GITHUB_CLIENT_ID` | Client id of the OAuth app (with Enable Device Flow) Settings › GitHub signs in with; there is never a client secret | none: a pasted token only |

## Repository layout

- `apps/backend` is the Fastify server that manages projects, compiling, the AI tools, references and checkpoints,
- `apps/frontend` is the React interface,
- `src-tauri` is the macOS application shell, which starts the bundled backend and opens the interface,
- `templates` holds the bundled LaTeX, Typst and Markdown templates,
- `native` holds the spell checker (Spectrum's Hunspell binding, with Hunspell's source) and the grammar checker (Harper) as built for the application,
- `dictionaries` holds the spell-check dictionaries, with their licences,
- `skills` holds the agent skills that ship with Spectrum, with their licences (see Personas and skills in the [user guide](USER_GUIDE.md)) and
- `scripts` holds the desktop build script, the script that builds `native`, the script that copies the skills from K-Dense's repository and the SF Symbols renderer used for the interface icons.

