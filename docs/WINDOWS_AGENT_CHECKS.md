# Windows agent checks

Written 20 November 2026 for Spectrum 2.6.0. These are the agent checks that only a Windows computer can settle. Run them in order on scratch data, and send back what each one asks for. Steps 1 to 3 need a source checkout of the release branch, set up as [Building Spectrum on Windows](BUILDING_ON_WINDOWS.md) says, with the isolation worker built (`node scripts/build-agent-sandbox.mjs`). Steps 4 to 8 need the app built from that branch and a model set up in Settings, as the Spectrum agent makes the changes they review. Never point a step at your own projects or at `%APPDATA%\com.beyond3345.spectrum`.

## Windows draft compilation

Windows isolates local agents. Draft compilation for Preview PDF, PDF before and after and the Spectrum agent’s compile tool runs outside that isolation. Draft compilation disables shell escape. The PDF review compiles a copy that excludes links. Where the TeX engine supports file access limits, Spectrum asks it to restrict reads and writes to the draft and its build folder.

Bibliography, index and glossary helpers follow their own file access rules. The TeX limits do not apply to them. For example, Biber can read a bibliography outside the draft, and its log can expose information about what it read. Run the checks below using scratch data.

## 1. The native agent tests

In PowerShell, from the checkout,

```
cd apps\backend
$env:SPECTRUM_NATIVE_AGENT_TESTS = '1'
node --import ./test/no-network.mjs --test test/agent-windows.test.js test/agent-preview.test.js test/agent-sandbox.test.js test/agent-profiles.test.js test/mcp-tools.test.js
```

Never add `test/agent-opencode.test.js`: it starts the real OpenCode.

- **Should happen:** every test passes, and the two tests named "Windows probe" are listed with `# TODO` whether they pass or not. The preview test needs TeX (MiKTeX or TeX Live); without it, it is skipped.
- **Send back:** the name and full output of any test that fails, and, for each "Windows probe", whether it shows `ok` or `not ok` with its `exit … out: … err: …` line.

## 2. What the two probes decide

Nothing to run. This is how the coordinator reads step 1.

| Probe | If it passes | If it fails |
| --- | --- | --- |
| A Node program in isolation starts a child with new pipes | The stall seen in 2.0 is gone with this Node. Codex, Claude Agent, Pi and ZCode can be tried on Windows, and the tools server's compile can run inside isolation | Those adapters stay off. If its line shows `global-pipe EACCES` and `local-pipe ok` and stops after `spawning`, the stall is most likely Node's pipe naming, which an AppContainer refuses |
| A native program in isolation feeds a Node child through a pipe | Spectrum's tools server can be offered to native agents on Windows, without the tools that start other programs if the first probe failed | Local agents on Windows keep going without Spectrum's tools |

## 3. A link in an agent's draft

Covered by `agent-preview.test.js` in step 1: it puts a junction to a folder outside the draft into the agent's copy and checks that the draft's PDF never shows that folder's file.

- **Should happen:** the test passes.
- **Send back:** its output if it fails, above all a line with `SECRET-READ`.

## 4. The Local agents tab

Open a scratch project, then Agent in the toolbar, then Local agents.

- **Should happen:** above the message box, "On Windows, local agents don’t get Spectrum’s tools or Direct editing yet. The Spectrum agent has every tool." The mode menu offers Isolated only.
- **Send back:** a screenshot if either differs.

## 5. PDF before and after for a LaTeX draft

Make a scratch LaTeX project with these two files.

`main.tex`:

```
\documentclass{article}
\usepackage[backend=biber]{biblatex}
\addbibresource{refs.bib}
\usepackage{makeidx}
\makeindex
\usepackage[acronym]{glossaries}
\makeglossaries
\newacronym{tex}{TeX}{a typesetting system}
\begin{document}
Knuth wrote \gls{tex} \cite{knuth}.\index{Knuth}
\immediate\write18{echo ran > w18.tex}
\IfFileExists{w18.tex}{Shell escape RAN.}{Shell escape blocked.}
\printbibliography
\printindex
\printglossaries
\end{document}
```

`refs.bib`:

```
@book{knuth, author = {Donald E. Knuth}, title = {The TeXbook}, publisher = {Addison-Wesley}, year = {1984}}
```

Ask the Spectrum agent "Add one sentence after the first one", then open the change's review and switch to PDF before and after. Do it three times, with the project's engine set to pdfLaTeX, then latexmk, then Tectonic.

- **Should happen:** both sides show a PDF that matches your own Compile of the project, with the citation resolved (not `knuth` in bold) and "Shell escape blocked.", and with pdfLaTeX and latexmk an index and the acronym list too.
- **Send back:** for each engine, what the after side shows: the PDF as expected, a PDF that differs (which part), or the message in its place. Say whether the PC has MiKTeX or TeX Live, and which year.

## 6. PDF before and after for a Typst draft

Make a scratch Typst project whose `main.typ` is

```
= Typst draft
A first sentence.
```

Ask the Spectrum agent for the same change as in step 5 and open PDF before and after. Then add these two lines to `main.typ` yourself and do it again.

```
#read("C:/Windows/win.ini")
#read("../outside.txt")
```

- **Should happen:** the first time, both sides show the PDF. The second time, both sides show an error saying the file is outside the project or cannot be read, and never the contents of `win.ini`.
- **Send back:** what each side shows, both times.

## 7. A Markdown draft

The same with a scratch Markdown project.

- **Should happen:** the after side says "Preview PDF on Windows doesn’t compile Markdown drafts yet. Review its changes as text."
- **Send back:** what it shows if it differs.

## 8. DeepSeek Harness

Only if you use it. Install the DeepSeek Harness app for Windows, then look in `C:\Program Files` and `%LOCALAPPDATA%\Programs` for its folder.

- **Should happen:** nothing yet. Spectrum looks for `dsh` on the PATH only, and Windows isolation starts native `.exe` programs only, so an npm install (`dsh.cmd`) cannot start.
- **Send back:** the app's folder, the path of any `dsh.exe` (or other program) inside it and what Settings, Agents shows on the DeepSeek Harness card after Check.

## 9. The hosts an agent may reach

On a Mac, an agent or an MCP server can be held to a list of hosts (Settings, Agents, the Network part of a card). On Windows no list is enforced yet, and nothing here was run on Windows.

The reason is the isolation worker. It starts a program with the `internetClient` capability, which opens every public address and port, or without it, which opens none. The list on a Mac works through a port on the computer itself where Spectrum checks each host, and Windows isolation refuses a program every address of its own computer, which is what the first test of step 1 proves ("denies … loopback"). Lifting that needs a loopback exemption, which only an administrator can give (`CheckNetIsolation LoopbackExempt`), so Spectrum does not ask for it.

So on Windows the choice in the Network part is saved but changes nothing: every agent and every MCP server reaches any public address, as in 2.6.

- **Should happen:** an agent's card shows, under Network, "On Windows, isolation opens every public address to an agent or none, so … is not held to a list of hosts yet", with its provider's hosts and the box that adds one. Under MCP servers there is no box for hosts and no Any host tick, and the note below says a server reaches any public address.
- **Send back:** a picture of both, and whether adding a host in a card saves (the chip appears) without an error.
- **Not tested here:** that the card and the MCP servers part look so on Windows, since the wording was only read in code, and that a saved choice of Listed hosts only starts an agent exactly as Any host does there (`launchOptions` gives `network: 'any'` off a Mac, which the backend test "an agent’s network setting" checks only when it runs on Windows).
