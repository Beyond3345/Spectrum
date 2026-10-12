import { StreamLanguage } from '@codemirror/language';

// commands whose braced argument is a key or a path: labels, references, citations, files and packages
const KEY_COMMANDS = /^(?:label|ref|eqref|cref|Cref|autoref|pageref|[a-zA-Z]*[cC]ite[a-zA-Z]*|input|include|includegraphics|usepackage|documentclass|bibliography|addbibresource)$/;

type State = {
  inMathMode: boolean;
  /** the token type the next braced argument gets ('typeName' after \begin and \end, 'string' after KEY_COMMANDS) */
  next: string | null;
  /** inside that argument */
  arg: string | null;
  /** inside an [optional] argument on the way to it */
  opt: boolean;
};

// Simple LaTeX mode for CodeMirror 6
const latexMode = {
  startState: (): State => ({ inMathMode: false, next: null, arg: null, opt: false }),

  token: (stream: any, state: State) => {
    if (state.arg) {
      if (stream.match(/^[^{}\\%]+/)) return state.arg;
      if (stream.eat('}')) {
        state.arg = null;
        return 'bracket';
      }
    }

    // spaces, a star and [optional] arguments may come before the braces: \cite*[p.~3]{key}
    if (state.next && !state.opt) {
      if (stream.eat('{')) {
        state.arg = state.next;
        state.next = null;
        return 'bracket';
      }
      if (stream.eat('[')) {
        state.opt = true;
        return 'bracket';
      }
      if (!stream.match(/^[\s*]/, false)) state.next = null;
    }
    if (state.opt && stream.eat(']')) {
      state.opt = false;
      return 'bracket';
    }

    // Comments
    if (stream.match(/^%.*$/)) {
      return 'comment';
    }

    // Math mode delimiters
    if (stream.match(/^\$\$/)) {
      state.inMathMode = !state.inMathMode;
      return 'keyword';
    }
    if (stream.match(/^\$/)) {
      state.inMathMode = !state.inMathMode;
      return 'keyword';
    }

    // Commands; an escaped character (\%, \$, \{) is taken with its backslash so it never starts a comment or maths
    const command = stream.match(/^\\(?:[a-zA-Z@]+|.)/);
    if (command) {
      const name = command[0].slice(1);
      if (!state.opt) state.next = name === 'begin' || name === 'end' ? 'typeName' : KEY_COMMANDS.test(name) ? 'string' : null;
      return 'keyword';
    }

    // Special characters
    if (stream.match(/^[{}[\]]/)) {
      return 'bracket';
    }

    // Math mode content
    if (state.inMathMode) {
      stream.next();
      return 'number';
    }

    stream.next();
    return null;
  }
};

export function latex() {
  // languageData has to live on the spec: it's what makes Cmd+/ toggle "%" comments
  return StreamLanguage.define({
    ...latexMode,
    name: 'latex',
    languageData: {
      commentTokens: { line: '%' }
    }
  });
}
