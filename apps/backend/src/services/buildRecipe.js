// A LaTeX document's own build steps and engine options, in magic comments as TeXstudio's and LaTeX Workshop's are:
//   % !TEX recipe = pdflatex; pythontex %DOC%; pdflatex; pdflatex
//   % !TEX options = -8bit
// The recipe takes the place of Spectrum's passes (compileService.js runs its steps). An engine step runs as Spectrum
// runs that engine (its output folder, SyncTeX, shell escape setting, the file) with the step's options before the file;
// any other step runs in the build folder, as Biber and makeindex do. %DOC% is the document's name without .tex,
// %OUTDIR% the build folder and %DIR% the document's own folder.
// Every step runs inside the compile's confinement, and the comments travel with a project that may be someone
// else's, so a project that isn't trusted (Trust this project in the Compile menu) gets only the programs and options
// below, never shell escape, and on a computer whose compiles aren't confined (Windows) no recipe at all; there the
// document compiles with Spectrum's own passes and the log says why. A trusted project's recipe runs any program.

const RECIPE = /^[ \t]*%[ \t]*!TEX[ \t]+recipe[ \t]*=[ \t]*(.*?)[ \t]*$/im;
const OPTIONS = /^[ \t]*%[ \t]*!TEX[ \t]+options[ \t]*=[ \t]*(.*?)[ \t]*$/im;
export const RECIPE_ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
// the programs an untrusted project's recipe may run: TeX's own, each confined like the compile's own helpers
export const RECIPE_TOOLS = ['bibtex', 'biber', 'makeindex', 'makeglossaries', 'makeglossaries-lite', 'bib2gls', 'pythontex'];
// engine options that change nothing a confined compile guards: no shell escape, no other output folder or job name,
// no configuration line (-cnf-line=shell_escape=t), no Lua start-up file, no output driver (a command XeTeX runs)
const SAFE_OPTION = /^--?(?:8bit|etex|recorder|draftmode|src-specials|mltex|enc|no-shell-escape|file-line-error|halt-on-error|translate-file=[\w.-]+)$/;
const SHELL = /shell|write18/i;
const MAX_STEPS = 20;
const TRUST = 'If the project is yours, or you have checked what it does, turn on “Trust this project” in the Compile menu and compile again.';

/**
 * { steps, options, warning }: steps ([{ program, args }], or null for Spectrum's own passes) and options (for every
 * engine pass) as this computer may run them for the project; warning: why some or all of what the document asks for
 * didn't run, for its log, or ''. trusted: the project is trusted here; confined: its compiles run confined.
 */
export function documentRecipe(tex, { trusted = false, confined = false } = {}) {
  const asked = String(tex).match(RECIPE)?.[1];
  const flags = String(tex).match(OPTIONS)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
  const warnings = [];
  const unsafeFlags = trusted ? [] : flags.filter((flag) => !SAFE_OPTION.test(flag));
  if (unsafeFlags.length) warnings.push(`The “% !TEX options” line asks for ${quoted(unsafeFlags)}, which only a trusted project gets, so ${unsafeFlags.length > 1 ? 'they were' : 'it was'} left out. ${TRUST}`);
  const options = flags.filter((flag) => !unsafeFlags.includes(flag));
  if (!asked) return { steps: null, options, warning: warnings.join(' ') };
  const steps = asked.split(';').map((part) => part.trim().split(/\s+/).filter(Boolean)).filter((words) => words.length).map(([program, ...args]) => ({ program, args }));
  const problem = (() => {
    if (!steps.length || steps.length > MAX_STEPS) return `The “% !TEX recipe” line needs between 1 and ${MAX_STEPS} steps, separated by semicolons.`;
    if (!steps.some((step) => RECIPE_ENGINES.includes(step.program))) return 'The “% !TEX recipe” line needs a pdflatex, xelatex or lualatex step.';
    // a program by its name, found on the compile's PATH: never a path of the document's choosing
    const named = steps.find((step) => !/^[\w+-][\w.+-]*$/.test(step.program));
    if (named) return `The “% !TEX recipe” line names “${named.program}”, which isn’t a program’s name.`;
    if (trusted) return '';
    if (!confined) return `This document’s build recipe runs only in a trusted project on this computer, whose compiles aren’t confined. ${TRUST}`;
    const other = steps.filter((step) => !RECIPE_ENGINES.includes(step.program) && !RECIPE_TOOLS.includes(step.program)).map((step) => step.program);
    if (other.length) return `The “% !TEX recipe” line runs ${quoted(other)}, which Spectrum runs only for a trusted project. ${TRUST}`;
    const unsafe = steps.flatMap((step) => step.args.filter((arg) => (RECIPE_ENGINES.includes(step.program) ? !SAFE_OPTION.test(arg) : SHELL.test(arg))));
    if (unsafe.length) return `The “% !TEX recipe” line asks for ${quoted(unsafe)}, which only a trusted project gets. ${TRUST}`;
    return '';
  })();
  if (problem) warnings.push(`${problem} This compile used Spectrum’s own passes instead.`);
  return { steps: problem ? null : steps, options, warning: warnings.join(' ') };
}

const quoted = (items) => [...new Set(items)].slice(0, 3).map((item) => `“${item}”`).join(', ');
