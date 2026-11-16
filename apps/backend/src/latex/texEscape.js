// Text typed into a field, made safe to write into TeX: each of `chars` not already escaped gets its backslash. A % is
// escaped everywhere, as TeX reads one as a comment even in maths; the others (& # _) only outside $…$, where maths uses
// them. The plots and forms pass '%' alone, where & and # are LaTeX people mean; the flow canvases' plain-text boxes
// pass '%&#_'. Shared by the composer (through apps/frontend/src/diagram/modes/shared.ts) and flowchart.js.

/** text with each unescaped one of chars written \% and so on; after \\ (a line break) it is unescaped, so escaped too */
export function escapeTex(text, chars = '%') {
  const pattern = (set) => new RegExp(`(\\\\*)([${set.replace(/[\]\\^-]/g, '\\$&')}])`, 'g');
  const escape = (part, set) => (set ? part.replace(pattern(set), (_, slashes, c) => `${slashes}${slashes.length % 2 ? '' : '\\'}${c}`) : part);
  const inMaths = chars.includes('%') ? '%' : '';
  return text.split(/(\$[^$]*\$)/).map((part, i) => escape(part, i % 2 ? inMaths : chars)).join('');
}
