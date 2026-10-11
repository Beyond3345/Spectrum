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
    '{k}{p}': 'href textcolor colorbox scalebox',
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
      for (let at = skipSpaces(pos); s[at] === '{' || s[at] === '[' || s[at] === '*'; at = skipSpaces(pos)) {
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

/** Words for the spell checker: [word, from] pairs from the prose of a masked text. */
export function proseWords(masked, from = 0, to = masked.length) {
  const words = [];
  const re = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
  re.lastIndex = from;
  for (let m = re.exec(masked); m && m.index < to; m = re.exec(masked)) words.push([m[0], m.index]);
  return words;
}
