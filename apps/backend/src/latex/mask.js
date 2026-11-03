// LaTeX to plain prose for the spell and grammar checkers. Markup, maths, comments, keys and code
// become spaces of the same length, so every position in the result is the same position in the
// source. Prose inside \section, \emph, \caption, \footnote and the like is kept.
// The frontend imports this file too (see mask.d.ts).

/** {open, prose}: '[' or '{', and whether the argument is prose to keep. 'K' blanks every group that follows. */
const spec = (s) => (s === 'K' ? 'K' : [...s.matchAll(/([[{])([pk])[\]}]/g)].map(([, open, kind]) => ({ open, prose: kind === 'p' })));

const SPECS = Object.fromEntries(
  Object.entries({
    '[p]{p}': 'part chapter section subsection subsubsection paragraph subparagraph caption',
    '[k]{p}': 'footnote footnotetext marginpar hyperref',
    '{p}': 'emph textbf textit textsl textsc textup textmd textrm textsf textnormal underline uline mbox text enquote intertext title subtitle thanks',
    '{k}{p}': 'href scalebox',
    '[k]{k}{p}': 'textcolor colorbox',
    '[k]{k}[k]{k}{p}': 'fcolorbox',
    '{k}{k}{p}': 'multicolumn multirow resizebox',
    '[k][k]{p}': 'makebox framebox',
    '{k}[k][k]{p}': 'raisebox',
    '[k][k][k]{k}{p}': 'parbox',
    '[p]': 'item',
    K: 'cite citep citet citealp citealt citeauthor citeyear citeyearpar autocite autocites parencite textcite footcite fullcite nocite ref eqref pageref autoref cref Cref crefrange nameref vref label url nolinkurl path input include includeonly includegraphics usepackage RequirePackage documentclass bibliography bibliographystyle addbibresource printbibliography newcommand renewcommand providecommand DeclareMathOperator newenvironment renewenvironment newtheorem def let setlength addtolength setcounter addtocounter stepcounter vspace hspace vskip hskip definecolor color pagestyle thispagestyle numberwithin geometry hypersetup graphicspath lstset captionsetup lstinputlisting inputminted bibitem texttt author date affiliation address email orcid keywords'
  }).flatMap(([s, names]) => names.split(' ').map((name) => [name, spec(s)]))
);

const SKIP_ENVS = new Set(
  'equation align alignat gather multline flalign eqnarray math displaymath verbatim Verbatim lstlisting minted comment tikzpicture filecontents algorithmic algorithmic* lstinline'
    .split(' ')
    .flatMap((env) => [env, `${env}*`])
);

const ENV_SPECS = {
  tabular: spec('{k}'),
  'tabular*': spec('{k}{k}'),
  tabularx: spec('{k}{k}'),
  longtable: spec('[k]{k}'),
  array: spec('[k]{k}'),
  minipage: spec('[k][k][k]{k}'),
  multicols: spec('{k}'),
  thebibliography: spec('{k}'),
  wrapfigure: spec('[k]{k}[k]{k}'),
  subfigure: spec('[k]{k}')
};

// words a few commands print, written into the same space
const PRINTS = { LaTeX: 'LaTeX', TeX: 'TeX', ldots: '...', dots: '...', textellipsis: '...' };

const isEscaped = (s, i) => {
  let n = 0;
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j -= 1) n += 1;
  return n % 2 === 1;
};

/** Index just past the {…} or […] group opening at i (braces nest; escaped ones don't count), or -1. */
function groupEnd(s, i) {
  const bracket = s[i] === '[';
  let braces = 0;
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (c === '\\') {
      j += 1;
    } else if (c === '%') {
      while (j < s.length && s[j] !== '\n') j += 1;
    } else if (c === '{') {
      braces += 1;
    } else if (c === '}') {
      braces -= 1;
      if (!bracket && braces === 0) return j + 1;
      if (braces < 0) return -1;
    } else if (bracket && c === ']' && braces === 0) {
      return j + 1;
    }
  }
  return -1;
}

export function maskLatex(source) {
  const s = String(source);
  const out = s.split('');
  const blank = (from, to) => {
    for (let k = Math.max(0, from); k < Math.min(to, out.length); k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  const skipSpaces = (i) => {
    while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i += 1;
    return i;
  };
  /** Math the reader still needs a word for: one x in place of the formula. */
  const inlineMath = (from, to, open, close) => {
    blank(from, to);
    const at = from + open;
    if (at < to - close) out[at] = 'x';
  };

  /** Applies an argument spec after a command or \begin; returns where scanning carries on. */
  const args = (pos, specList) => {
    if (specList === 'K') {
      // on the command's own line: {\Large Title} on the next one is text, not an argument of \vspace{10mm}
      const skipInline = (k) => {
        while (s[k] === ' ' || s[k] === '\t') k += 1;
        return k;
      };
      for (let at = skipInline(pos); s[at] === '{' || s[at] === '[' || s[at] === '*'; at = skipInline(pos)) {
        const end = s[at] === '*' ? at + 1 : groupEnd(s, at);
        if (end < 0) break;
        blank(at, end);
        pos = end;
      }
      return pos;
    }
    for (const arg of specList) {
      const at = skipSpaces(pos);
      if (s[at] !== arg.open) {
        if (arg.open === '[') continue;
        break;
      }
      const end = groupEnd(s, at);
      if (end < 0) break;
      if (arg.prose) {
        // only the delimiters go; the main scan then reads the prose inside (a stray } is blanked there)
        blank(at, at + 1);
        if (arg.open === '[') blank(end - 1, end);
        return at + 1;
      }
      blank(at, end);
      pos = end;
    }
    return pos;
  };

  /** Unknown commands: adjacent [..] groups are options; a {..} with a space in it is prose, one without is a key. */
  const unknownArgs = (pos) => {
    while (s[pos] === '[' || s[pos] === '{') {
      const end = groupEnd(s, pos);
      if (end < 0) return pos;
      if (s[pos] === '{' && /\s/.test(s.slice(pos + 1, end - 1))) {
        blank(pos, pos + 1);
        return pos + 1;
      }
      blank(pos, end);
      pos = end;
    }
    return pos;
  };

  const command = (i) => {
    const next = s[i + 1];
    if (next === undefined) return i + 1;
    // \( \) and \[ \] maths
    if (next === '(' || next === '[') {
      const close = next === '(' ? '\\)' : '\\]';
      let end = s.indexOf(close, i + 2);
      end = end < 0 ? s.length : end + 2;
      if (next === '(') inlineMath(i, end, 2, 2);
      else blank(i, end);
      return end;
    }
    if (!/[A-Za-z@]/.test(next)) {
      // \\ (with its optional [length]), \%, \&, \,, accents and the like
      let end = i + 2;
      if (next === '\\') {
        if (s[end] === '*') end += 1;
        if (s[end] === '[') end = Math.max(end, groupEnd(s, end));
      }
      if (next === ' ') end = i + 1;
      blank(i, end);
      return end;
    }
    let j = i + 1;
    while (j < s.length && /[A-Za-z@]/.test(s[j])) j += 1;
    const name = s.slice(i + 1, j);
    if (s[j] === '*') j += 1;

    if (PRINTS[name]) {
      blank(i, j);
      for (let k = 0; k < PRINTS[name].length && i + k < j; k += 1) out[i + k] = PRINTS[name][k];
      return j;
    }
    if (name === 'verb') {
      const delim = s[j];
      const end = delim ? s.indexOf(delim, j + 1) : -1;
      const stop = end < 0 ? j : end + 1;
      blank(i, stop);
      return stop;
    }
    if (name === 'begin' || name === 'end') {
      const at = skipSpaces(j);
      const end = s[at] === '{' ? groupEnd(s, at) : -1;
      if (end < 0) {
        blank(i, j);
        return j;
      }
      const env = s.slice(at + 1, end - 1).trim();
      blank(i, end);
      if (name === 'end') return end;
      if (SKIP_ENVS.has(env)) {
        const close = s.indexOf(`\\end{${env}}`, end);
        const stop = close < 0 ? s.length : close + `\\end{${env}}`.length;
        blank(end, stop);
        return stop;
      }
      return ENV_SPECS[env] ? args(end, ENV_SPECS[env]) : unknownArgs(end);
    }
    blank(i, j);
    return SPECS[name] ? args(j, SPECS[name]) : unknownArgs(j);
  };

  // the preamble and anything after \end{document} are settings, not prose
  const begin = /\\begin\s*\{document\}/.exec(s);
  let i = 0;
  if (begin) {
    blank(0, begin.index + begin[0].length);
    i = begin.index + begin[0].length;
  }
  const finish = /\\end\s*\{document\}/.exec(s);
  const last = finish && finish.index >= i ? finish.index : s.length;
  if (finish && finish.index >= i) blank(finish.index, s.length);

  while (i < last) {
    const c = s[i];
    if (c === '%' && !isEscaped(s, i)) {
      const end = s.indexOf('\n', i);
      const stop = end < 0 ? s.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '\\') {
      i = command(i);
    } else if (c === '$' && !isEscaped(s, i)) {
      const display = s[i + 1] === '$';
      const delim = display ? '$$' : '$';
      let end = i + delim.length;
      while (end < s.length && !(s.startsWith(delim, end) && !isEscaped(s, end))) end += 1;
      end = Math.min(s.length, end + delim.length);
      if (display) blank(i, end);
      else inlineMath(i, end, 1, 1);
      i = end;
    } else if (c === '{' || c === '}' || c === '&' || c === '~') {
      blank(i, i + 1);
      i += 1;
    } else if ((c === '`' && s[i + 1] === '`') || (c === "'" && s[i + 1] === "'")) {
      blank(i, i + 2);
      i += 2;
    } else {
      i += 1;
    }
  }

  // A line that was all markup (\label{..}, a comment) would read as a paragraph break and split
  // the sentence around it, so it joins the next line instead. Blank source lines still break.
  let start = 0;
  for (let k = 0; k <= out.length; k += 1) {
    if (k === out.length || s[k] === '\n') {
      if (k < out.length && s.slice(start, k).trim() && !out.slice(start, k).join('').trim()) out[k] = ' ';
      start = k + 1;
    }
  }
  return out.join('');
}

// Letters of the scripts written without spaces between words (Chinese, Japanese, Thai, Lao, Khmer, Burmese) make
// no words: a run of them is a sentence, not a word Hunspell could check
const LETTER = String.raw`(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}])[\p{L}\p{M}])+`;
const wordPatterns = new Map();

/**
 * Words for the spell checker: [word, from] pairs from the prose of a masked text. wordChars (a dictionary's WORDCHARS
 * punctuation, such as Catalan's ·) joins letters as an apostrophe does, only between letters.
 */
export function proseWords(masked, from = 0, to = masked.length, { wordChars = '' } = {}) {
  const words = [];
  if (!wordPatterns.has(wordChars)) {
    const joiners = `'’${wordChars}`.replace(/[\\\]^-]/g, '\\$&');
    wordPatterns.set(wordChars, new RegExp(`${LETTER}(?:[${joiners}]${LETTER})*`, 'gu'));
  }
  const re = wordPatterns.get(wordChars);
  re.lastIndex = from;
  for (let m = re.exec(masked); m && m.index < to; m = re.exec(masked)) words.push([m[0], m.index]);
  return words;
}


// ─── Typst and Markdown ───

/** The length of the run of backticks at i. */
const ticks = (s, i) => {
  let n = 0;
  while (s[i + n] === '`') n += 1;
  return n;
};

/** Index just past the string starting at i, or the end of the range. */
const stringStop = (s, i, end) => {
  let j = i + 1;
  while (j < end && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
  return Math.min(end, j + 1);
};

/** Index just past the raw text (or fenced block) whose backticks start at i. */
const rawStop = (s, i, end) => {
  const run = '`'.repeat(ticks(s, i));
  const close = s.indexOf(run, i + run.length);
  return close < 0 ? end : Math.min(end, close + run.length);
};

/** Index of the closer of the balanced ( { [ group at i, skipping escapes, strings, raw and content blocks. */
const groupClose = (s, i, open, close, end) => {
  let depth = 0;
  for (let j = i; j < end; j += 1) {
    const ch = s[j];
    if (ch === '\\') {
      j += 1;
      continue;
    }
    if (open === '(' && ch === '"') {
      j = stringStop(s, j, end) - 1;
      continue;
    }
    if (open === '(' && ch === '`') {
      j = rawStop(s, j, end) - 1;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return j;
    } else if (open === '(' && ch === '[') {
      const inner = groupClose(s, j, '[', ']', end);
      if (inner < 0) return -1;
      j = inner;
    }
  }
  return -1;
};

const lineEnd = (s, i) => {
  const at = s.indexOf('\n', i);
  return at < 0 ? s.length : at;
};

/**
 * Typst to prose: comments, raw text and blocks, maths, calls and their arguments (but not the content in
 * […]), labels, references and URLs become spaces of the same length. Headings keep their text, without =.
 */
export function maskTypst(source) {
  const s = String(source);
  const n = s.length;
  const out = s.split('');
  const blank = (from, to) => {
    for (let k = Math.max(0, from); k < Math.min(to, n); k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  /** Blanks a call's (…) group but keeps content blocks in it, masking their prose in turn. */
  const maskArgs = (open, to) => {
    const close = groupClose(s, open, '(', ')', to);
    const stop = close < 0 ? to : Math.min(to, close + 1);
    let j = open + 1;
    while (j < stop) {
      const ch = s[j];
      if (ch === '"') {
        const next = Math.min(stop, stringStop(s, j, stop));
        blank(j, next);
        j = next;
        continue;
      }
      if (ch === '`') {
        const next = Math.min(stop, rawStop(s, j, stop));
        blank(j, next);
        j = next;
        continue;
      }
      if (ch === '[') {
        const inner = groupClose(s, j, '[', ']', stop);
        if (inner > j) {
          blank(j, j + 1);
          maskContent(j + 1, inner);
          blank(inner, inner + 1);
          j = inner + 1;
          continue;
        }
      }
      if (ch === '#' ) {
        j = maskCall(j, stop);
        continue;
      }
      if (ch !== '\n') blank(j, j + 1);
      j += 1;
    }
    blank(open, open + 1);
    if (close >= 0) blank(close, close + 1);
    return stop;
  };

  /** Blanks #name and its arguments; the content blocks after or inside it stay prose. */
  const maskCall = (i, to) => {
    let j = i + 1;
    while (j < to && /[A-Za-z0-9_.-]/.test(s[j])) j += 1;
    blank(i, j);
    let k = j;
    const spaces = () => {
      while (k < to && (s[k] === ' ' || s[k] === '\t')) k += 1;
    };
    spaces();
    let handled = false;
    if (s[k] === '(') {
      handled = true;
      k = maskArgs(k, to);
    }
    // a chained field or method, as in #datetime.today().display(…)
    for (;;) {
      if (s[k] !== '.') break;
      let next = k + 1;
      while (next < to && /[A-Za-z0-9_-]/.test(s[next])) next += 1;
      if (next === k + 1) break;
      blank(k, next);
      k = next;
      spaces();
      if (s[k] === '(') {
        handled = true;
        k = maskArgs(k, to);
      }
    }
    for (;;) {
      spaces();
      if (s[k] !== '[') break;
      const inner = groupClose(s, k, '[', ']', to);
      if (inner < 0) break;
      handled = true;
      blank(k, k + 1);
      maskContent(k + 1, inner);
      blank(inner, inner + 1);
      k = inner + 1;
    }
    if (!handled) {
      const stop = Math.min(to, lineEnd(s, j));
      blank(j, stop);
      return stop;
    }
    return k;
  };

  const maskContent = (from, to) => {
    let i = from;
    while (i < to) {
      const ch = s[i];
      const before = s.slice(s.lastIndexOf('\n', i - 1) + 1, i);
      if (ch === '/' && s[i + 1] === '/') {
        const stop = Math.min(to, lineEnd(s, i));
        blank(i, stop);
        i = stop;
        continue;
      }
      if (ch === '/' && s[i + 1] === '*') {
        const close = s.indexOf('*/', i + 2);
        const stop = close < 0 ? to : Math.min(to, close + 2);
        blank(i, stop);
        i = stop;
        continue;
      }
      if (ch === '`') {
        const stop = Math.min(to, rawStop(s, i, to));
        blank(i, stop);
        i = stop;
        continue;
      }
      if (ch === '$') {
        const display = s[i + 1] === '$';
        const delim = display ? '$$' : '$';
        let j = i + delim.length;
        while (j < to && !(s.startsWith(delim, j) && s[j - 1] !== '\\')) j += 1;
        const stop = Math.min(to, j + delim.length);
        blank(i, stop);
        i = stop;
        continue;
      }
      if (ch === '<') {
        const close = s.indexOf('>', i);
        if (close > i && close < to && /^[A-Za-z0-9_:.-]+$/.test(s.slice(i + 1, close))) {
          blank(i, close + 1);
          i = close + 1;
          continue;
        }
      }
      if (ch === '@' && (i === from || !/[A-Za-z0-9]/.test(s[i - 1]))) {
        let j = i + 1;
        while (j < to && /[A-Za-z0-9_:.-]/.test(s[j])) j += 1;
        if (j > i + 1) {
          blank(i, j);
          i = j;
          continue;
        }
      }
      if (ch === 'h' && /^https?:\/\//.test(s.slice(i, i + 8))) {
        let j = i;
        while (j < to && !/[\s)\]>]/.test(s[j])) j += 1;
        blank(i, j);
        i = j;
        continue;
      }
      if (ch === '=' && /^[ \t]*$/.test(before)) {
        let j = i;
        while (j < to && s[j] === '=') j += 1;
        blank(i, j);
        i = j;
        continue;
      }
      if (ch === '#') {
        i = maskCall(i, to);
        continue;
      }
      if (ch === '\\') {
        blank(i, i + 1);
        i += s[i + 1] === '\n' ? 1 : 2;
        continue;
      }
      i += 1;
    }
  };

  maskContent(0, n);
  return out.join('');
}

/** Index just past a Markdown link's (…) target, balanced for parentheses in a URL. */
const parenStop = (s, open, end) => {
  let depth = 0;
  for (let j = open; j < end; j += 1) {
    if (s[j] === '\\') {
      j += 1;
      continue;
    }
    if (s[j] === '(') depth += 1;
    else if (s[j] === ')') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return end;
};

/**
 * Markdown to prose: front matter, fenced and indented code, inline code, HTML, maths, URLs and link targets,
 * images, citations and {#attributes} become spaces of the same length; link text and prose stay.
 */
export function maskMarkdown(source) {
  const s = String(source);
  const n = s.length;
  const out = s.split('');
  const blank = (from, to) => {
    for (let k = Math.max(0, from); k < Math.min(to, n); k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  let i = 0;
  const front = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/.exec(s);
  if (front) {
    blank(0, front[0].length);
    i = front[0].length;
  }
  while (i < n) {
    const lineBegin = s.lastIndexOf('\n', i - 1) + 1;
    const atLineStart = /^[ \t]*$/.test(s.slice(lineBegin, i));
    if (atLineStart) {
      const rest = s.slice(i);
      const fence = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(rest);
      if (fence) {
        const mark = fence[1][0];
        const size = fence[1].length;
        const close = new RegExp('^[ \\t]{0,3}' + mark + '{' + size + ',}[ \\t]*$', 'gm');
        close.lastIndex = i + fence[0].length;
        const found = close.exec(s);
        const stop = found ? found.index + found[0].length : n;
        blank(i, stop);
        i = stop;
        continue;
      }
      if (/^[ \t]{4}/.test(rest)) {
        const stop = lineEnd(s, i);
        blank(i, stop);
        i = stop;
        continue;
      }
      const heading = /^(#{1,6})([ \t]+)/.exec(rest);
      if (heading) {
        blank(i, i + heading[0].length);
        i += heading[0].length;
        continue;
      }
      const quote = /^[ \t]{0,3}>[ \t]?/.exec(rest);
      if (quote) {
        blank(i, i + quote[0].length);
        i += quote[0].length;
        continue;
      }
      const item = /^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/.exec(rest);
      if (item) {
        blank(i, i + item[0].length);
        i += item[0].length;
        continue;
      }
    }
    const ch = s[i];
    if (ch === '`') {
      const stop = rawStop(s, i, n);
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '$') {
      const display = s[i + 1] === '$';
      const delim = display ? '$$' : '$';
      let j = i + delim.length;
      while (j < n && !(s.startsWith(delim, j) && s[j - 1] !== '\\')) j += 1;
      const stop = Math.min(n, j + delim.length);
      blank(i, stop);
      i = stop;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      const close = s.indexOf('-->', i + 4);
      const stop = close < 0 ? n : close + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '<' && /^<\/?[A-Za-z][^>]*>/.test(s.slice(i))) {
      const stop = s.indexOf('>', i) + 1;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (s.startsWith('![', i)) {
      const altEnd = s.indexOf(']', i + 2);
      if (altEnd > 0 && s[altEnd + 1] === '(') {
        const stop = parenStop(s, altEnd + 1, n);
        blank(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === '[') {
      if (/^\[[^\]]*@[^\]]*\]/.test(s.slice(i))) {
        const stop = s.indexOf(']', i) + 1;
        blank(i, stop);
        i = stop;
        continue;
      }
      const textEnd = s.indexOf(']', i + 1);
      if (textEnd > 0 && s[textEnd + 1] === '(') {
        const stop = parenStop(s, textEnd + 1, n);
        blank(i, i + 1);
        blank(textEnd, stop);
        i = stop;
        continue;
      }
      if (textEnd > 0 && s[textEnd + 1] === '[') {
        const refEnd = s.indexOf(']', textEnd + 2);
        blank(i, i + 1);
        if (refEnd > 0) {
          blank(textEnd, refEnd + 1);
          i = refEnd + 1;
        } else i = textEnd + 1;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === '{' && /^\{#[^}]*\}/.test(s.slice(i))) {
      const stop = s.indexOf('}', i) + 1;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === 'h' && /^https?:\/\//.test(s.slice(i, i + 8))) {
      let j = i;
      while (j < n && !/[\s)\]>]/.test(s[j])) j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === '\\') {
      blank(i, i + 1);
      i += s[i + 1] === '\n' ? 1 : 2;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

