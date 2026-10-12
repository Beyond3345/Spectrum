// Where the cursor is in LaTeX source: maths or text, which environments are open, and whether it's in the
// braces of a command whose argument names something in the project (a label, a citation key, a file).

export type TexContext = {
  /** 'both' in the body of a \newcommand, \def and the like, where either can come */
  mode: 'math' | 'text' | 'both';
  /** the innermost maths environment, e.g. 'align*'; null in $ $, \( \), \[ \] or in text */
  mathEnv: string | null;
  /** inside a numbered display (an unstarred equation, align, …), where \label means something */
  numbered: boolean;
  /** inside display maths, numbered or not (\[ \], $$ $$, equation*, …), where \tag works */
  display: boolean;
  /** before \begin{document}, in a file that has one */
  preamble: boolean;
  /** the environments open at the cursor, innermost last */
  openEnvs: string[];
};

/** Environments whose body is maths. */
const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*',
  'alignat', 'alignat*', 'xalignat', 'xalignat*', 'displaymath', 'math', 'eqnarray', 'eqnarray*', 'dmath', 'dmath*',
  'dgroup', 'dgroup*', 'IEEEeqnarray', 'IEEEeqnarray*', 'empheq', 'numcases', 'subnumcases', 'tikzcd', 'mathpar'
]);
/** Maths environments that aren't a display \tag can go in. */
const NOT_DISPLAY = ['math', 'tikzcd', 'mathpar'];
/** Their body is skipped: nothing in it is maths, a comment or a command. */
export const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'comment', 'Verbatim', 'Verbatim*']);
/** In maths, the braced argument of these is text again (where a $ starts maths). */
const TEXT_ARGS = new Set([
  'text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'textnormal', 'textup', 'textsl', 'textsc', 'mbox', 'hbox', 'fbox',
  'intertext', 'shortintertext', 'operatorname'
]);

/** Their argument is verbatim: \verb|…|, \lstinline[…]{…} or !…!, \mintinline{lang}{…}, \url{…} (not \path: TikZ has one). */
const INLINE_VERBATIM = new Set(['lstinline', 'mintinline', 'url', 'href']);
/** They define a command or environment, whose body is neither maths nor text. */
const DEFINERS = new Set([
  'newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'NewDocumentCommand', 'RenewDocumentCommand',
  'ProvideDocumentCommand', 'DeclareDocumentCommand', 'DeclareMathOperator', 'newenvironment', 'renewenvironment', 'def', 'gdef', 'edef', 'xdef'
]);

// the commands that matter (the regex skips the rest, which is most of the time saved) or an escaped
// character, a comment, $ or $$, a brace, or the line break that starts a blank line
const TOKEN = new RegExp(
  String.raw`\\(?:(?:begin|end|ensuremath|${[...INLINE_VERBATIM, ...TEXT_ARGS, ...DEFINERS].join('|')})(?![A-Za-z@])|verb(?![A-Za-z])|[^A-Za-z@])|%.*|\$\$?|[{}]|\n(?=[ \t]*\n)`,
  'g'
);
const ENV_NAME = /\s*\{([^{}\n]*)\}/y;
const TEXT_BRACE = /\*?\s*\{/y;
// what comes before an inline verbatim argument: [options], and \mintinline's {language}
const VERB_OPTIONS = /\s*(?:\[[^\]\n]*\]\s*)?/y;
const VERB_LANGUAGE = /\{[^{}\n]*\}\s*/y;
// a definition goes on while another argument follows ({body} after {\name}, [1] after that), over line breaks
// and the % that .sty files end lines with
const NEXT_ARG = /(?:\s|%[^\n]*\n)*[{[]/y;

// what's open: an environment by name, a maths delimiter ($, $$, \(, \[), { for the argument of \text and
// friends, or \ensuremath{ for that of \ensuremath (maths)
type Frame = { open: string; env: boolean; depth: number };

/** The context at `pos`, from one pass over the text before it. */
export function texContext(text: string, pos: number): TexContext {
  const src = text.slice(0, pos);
  const stack: Frame[] = [];
  let depth = 0;
  const push = (open: string, env = false) => stack.push({ open, env, depth });
  const close = (i: number) => i !== -1 && (stack.length = i);
  const last = (test: (f: Frame) => boolean) => {
    for (let i = stack.length - 1; i >= 0; i -= 1) if (test(stack[i])) return i;
    return -1;
  };
  const innermost = (open: string, env = false) => last((f) => f.open === open && f.env === env);
  // where a definition started (the depth of its first brace), or -1
  let defAt = -1;
  // the frame that decides the mode: maths unless it's a { (text) or there's none
  const decider = () => last((f) => !f.env || MATH_ENVS.has(f.open));
  const inMath = () => {
    const i = decider();
    return i !== -1 && stack[i].open !== '{';
  };

  TOKEN.lastIndex = 0;
  for (let m; (m = TOKEN.exec(src)); ) {
    const t = m[0];
    // in a definition only the braces count, to find where it ends: \begin, \end and $ in it don't open anything
    if (defAt !== -1 && t !== '{' && t !== '}') continue;
    if (t[0] === '\\') {
      const name = t.slice(1);
      if (DEFINERS.has(name)) defAt = depth;
      else if (name === 'begin' || name === 'end') {
        ENV_NAME.lastIndex = TOKEN.lastIndex;
        const env = ENV_NAME.exec(src)?.[1].trim();
        if (env === undefined) continue;
        TOKEN.lastIndex = ENV_NAME.lastIndex;
        if (name === 'end') close(innermost(env, true));
        else {
          push(env, true);
          if (!VERBATIM_ENVS.has(env)) continue;
          const end = src.indexOf(`\\end{${env}}`, TOKEN.lastIndex);
          // the cursor is inside it
          if (end === -1) break;
          stack.pop();
          TOKEN.lastIndex = end + env.length + 6;
        }
      } else if (name === '(' || name === '[') {
        if (!inMath()) push(t);
      } else if (name === ')' || name === ']') close(innermost(name === ')' ? '\\(' : '\\['));
      else if (name === 'verb' || INLINE_VERBATIM.has(name)) {
        // \verb|…| (or \verb*|…|) ends where its delimiter comes again, on the same line, and the others where
        // their } or delimiter does
        let at = TOKEN.lastIndex;
        if (name === 'verb') at += src[at] === '*' ? 1 : 0;
        else {
          VERB_OPTIONS.lastIndex = at;
          VERB_OPTIONS.test(src);
          VERB_LANGUAGE.lastIndex = at = VERB_OPTIONS.lastIndex;
          if (name === 'mintinline' && VERB_LANGUAGE.test(src)) at = VERB_LANGUAGE.lastIndex;
        }
        const end = src.indexOf(name !== 'verb' && src[at] === '{' ? '}' : src[at], at + 1);
        const eol = src.indexOf('\n', at);
        TOKEN.lastIndex = end !== -1 && (eol === -1 || end < eol) ? end + 1 : eol === -1 ? src.length : eol;
      } else if (name === 'ensuremath' || (TEXT_ARGS.has(name) && inMath())) {
        TEXT_BRACE.lastIndex = TOKEN.lastIndex;
        if (TEXT_BRACE.test(src)) {
          TOKEN.lastIndex = TEXT_BRACE.lastIndex;
          push(name === 'ensuremath' ? '\\ensuremath{' : '{');
          depth += 1;
        }
      }
    } else if (t[0] === '$') {
      const i = decider();
      const top = i === -1 ? '{' : stack[i].open;
      if (top === '$') {
        close(i);
        // $x$$y$: the first $ closes, the second opens again
        if (t === '$$') TOKEN.lastIndex -= 1;
      } else if (top === '$$') {
        if (t === '$$') close(i);
      } else if (top === '{') push(t);
    } else if (t === '{') depth += 1;
    else if (t === '}') {
      depth -= 1;
      close(last((f) => f.open.endsWith('{') && !f.env && f.depth === depth));
      if (defAt !== -1 && depth <= defAt) {
        NEXT_ARG.lastIndex = TOKEN.lastIndex;
        if (!NEXT_ARG.test(src)) defAt = -1;
      }
    } else if (t[0] === '\n') {
      // a blank line ends inline and display maths (TeX would stop with an error), so a stray $ can't flip the rest
      close(stack.findIndex((f) => !f.env && f.open !== '{'));
    }
  }

  const top = stack[decider()];
  const mathEnv = top?.env ? top.open : null;
  const display = mathEnv ? !NOT_DISPLAY.includes(mathEnv) : top?.open === '\\[' || top?.open === '$$';
  const openEnvs = stack.filter((f) => f.env).map((f) => f.open);
  return {
    mode: defAt !== -1 ? 'both' : inMath() ? 'math' : 'text',
    mathEnv,
    numbered: display && !!mathEnv && !mathEnv.endsWith('*') && mathEnv !== 'displaymath',
    display,
    preamble: !openEnvs.includes('document') && text.indexOf('\\begin{document}', pos) !== -1,
    openEnvs
  };
}

/** Commands whose argument is a label. */
export const REF_COMMANDS = /^(?:ref|eqref|pageref|cref|Cref|autoref|nameref|vref|Vref|labelcref|cpageref|Cpageref|namecref|nameCref)$/;
/** …a citation key: \cite, \citep, \parencite, \Textcite, \nocite and the rest (not \setcitestyle). */
export const CITE_COMMANDS = /^(?![A-Za-z]*style)[A-Za-z]*[cC]ite[A-Za-z]*$/;
/** …a package, class, style or file. */
const FILE_COMMANDS = /^(?:usepackage|RequirePackage|documentclass|LoadClass|bibliographystyle|bibliography|addbibresource|includegraphics|input|include|subfile)$/;
// the command, a star, a beamer <overlay> and [options], and the argument so far (no braces in it); only the end of the text is looked at
const ARG = /\\([A-Za-z]+)\*?\s*(?:<[^>]*>\s*)?(?:\[[^\]]*\]\s*)*\{([^{}\\]*)$/;
/** How far back argContext looks for the command: a long \cite list fits. */
export const ARG_WINDOW = 2000;

/**
 * The command whose braces the cursor is in, when it completes something (\label doesn't: its name is new).
 * In a comma list, `typed` is the item after the last comma and `from` where it starts.
 */
export function argContext(text: string, pos: number) {
  const start = Math.max(0, pos - ARG_WINDOW);
  const m = ARG.exec(text.slice(start, pos));
  if (!m || !(REF_COMMANDS.test(m[1]) || CITE_COMMANDS.test(m[1]) || FILE_COMMANDS.test(m[1]))) return null;
  // a comma in a comment doesn't start an item
  const list = m[2].replace(/%[^\n]*/g, '');
  const typed = list.slice(list.lastIndexOf(',') + 1).replace(/^\s+/, '');
  return { command: m[1], from: pos - typed.length, typed };
}
