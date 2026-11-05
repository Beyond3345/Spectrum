# Building Spectrum on Windows

This builds the Windows installer, `Spectrum_<version>_x64-setup.exe`, on a Windows 10 or 11 x64 PC from a copy of the repository, and attaches it to a release if you want. It is the same build the Windows workflow on GitHub Actions runs, without using Actions minutes. The first build takes about an hour, mostly TexLab and Rust compiling; later builds take 10 to 15 minutes.

For a full test and release run by an AI agent, give it [WINDOWS_TEST_RELEASE.md](WINDOWS_TEST_RELEASE.md) instead.

## 1. Install the tools (once)

Open **PowerShell** and run these. Each one asks for permission to install. Close and reopen PowerShell afterwards, so the new programs are on the `PATH`.

```
winget install Microsoft.PowerShell Git.Git OpenJS.NodeJS.LTS Rustlang.Rustup Python.Python.3.12 GitHub.cli
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

| Tool | What it builds |
| --- | --- |
| Git | gets the repository |
| Node.js (24 or later) | the frontend, the backend and the build scripts |
| Rust (through rustup) | the app itself and TexLab |
| Visual Studio 2022 Build Tools, C++ workload | the Rust and C++ parts, including the Hunspell spelling module |
| Python 3 | needed by node-gyp, which builds the Hunspell module |
| GitHub CLI | only for attaching the installer to a release |

The C# compiler for the agent sandbox worker and NSIS for the installer need nothing extra: the first comes with Windows and Tauri downloads the second itself.

Then, in **PowerShell 7** (`pwsh`, now in the Start menu):

```
rustup default stable
git config --global core.autocrlf false
```

The second line matters: the dictionaries and templates must keep their LF line endings, or the spelling checker and templates break.

## 2. Get the code

```
git clone https://github.com/Beyond3345/Spectrum.git
cd Spectrum
git switch --detach v2.2.3
npm ci
```

Use the tag of the release you are building (`v2.2.3` here). Building `main` instead gives you whatever is newest.

## 3. Build

```
node scripts/native.mjs hunspell
node scripts/desktop.mjs texlab
node scripts/desktop.mjs build
```

- **`native.mjs hunspell`** builds the spelling module. A warning at the end that its work folder could not be deleted is normal on Windows; any other error is real.
- **`desktop.mjs texlab`** builds TexLab from its source. It is the slow step the first time and is cached afterwards in `%LOCALAPPDATA%\spectrum-build`.
- **`desktop.mjs build`** downloads the pinned Node, Tectonic, Typst and pandoc, checks each against its SHA-256, and builds the installer.

The installer is then at:

```
src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Spectrum_2.2.3_x64-setup.exe
```

Run it to install Spectrum for your account. It is not code signed, so SmartScreen may ask you to choose More info and then Run anyway.

**If something fails:**

- A download that fails its checksum: stop. Do not change the checksum in the repository; the file on the internet changed and needs looking into.
- `EPERM` while copying `hunspell.node`: something still has the spelling module open, usually Spectrum itself or a test run. Close it and run the build again.
- `link.exe` or `cl.exe` not found: the Visual Studio Build Tools are missing the C++ workload. Run the second `winget` line from step 1 again.

## 4. Test it (optional)

The automated checks the workflow runs, in the repository folder:

```
npm test
npm run checkers:verify
npm run typecheck
```

`npm test` takes up to half an hour and needs TeX (MiKTeX or TeX Live) and Strawberry Perl for its compile tests; [WINDOWS_TEST_RELEASE.md](WINDOWS_TEST_RELEASE.md) step 3 has the full list and how to read a failure. Do not run the tests while a build is running: both use the spelling module and Windows locks it.

## 5. Attach it to a release (optional)

Only once the release exists on GitHub, published from the Mac with the DMG. Sign in once with `gh auth login`, then:

```
$tag = "v2.2.3"
$exe = "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\Spectrum_2.2.3_x64-setup.exe"
$src = "texlab-5.26.0-source.tar.gz"
Invoke-WebRequest https://github.com/latex-lsp/texlab/archive/refs/tags/v5.26.0.tar.gz -OutFile $src
(Get-FileHash $src -Algorithm SHA256).Hash.ToLower() -eq "47af7e71247fe186ddbaa62373ce5fbebc802ab8df9924958ac62788a644f84e"
gh release upload $tag $exe $src --repo Beyond3345/Spectrum
```

The last check before the upload must print `True`. TexLab's source goes with every installer because TexLab is GPL 3.0.

Then add the installer to the release's checksums:

```
gh release download $tag --pattern SHA256SUMS.txt --repo Beyond3345/Spectrum --clobber
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
Add-Content SHA256SUMS.txt "$hash  $(Split-Path $exe -Leaf)"
Add-Content SHA256SUMS.txt "47af7e71247fe186ddbaa62373ce5fbebc802ab8df9924958ac62788a644f84e  $src"
gh release upload $tag SHA256SUMS.txt --clobber --repo Beyond3345/Spectrum
```

If the Windows workflow is also running for the same release, cancel one of them: both upload an installer with the same name, and the later one replaces the earlier.
