/** Plain text for a TeX argument, keeping every character literal. */
export function escapeTexText(value) {
  const special = { '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
  return String(value ?? '').replace(/[\\{}$&%#_^~]/g, (char) => special[char] || `\\${char}`);
}

/** TeX comments outside escaped characters; preserves line endings. */
export const withoutComments = (text) => String(text).replace(/\\.|%[^\r\n]*/g, (token) => token[0] === '%' ? '' : token);

export function matchBrace(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

// a citation's [options] (a locator, a prefix), which are left alone, or its {key list}
const CITE_PARTS = /\[[^\]]*\]|\{([^{}]*)\}/g;

/** The keys a citation command's text cites: ['a', 'b'] from \parencite[p.~3]{a,b} or \parencites{a}[4]{b}. */
export const citeKeys = (text) =>
  [...String(text).matchAll(CITE_PARTS)].flatMap((m) => (m[1] == null ? [] : m[1].split(',').map((key) => key.trim()).filter(Boolean)));

/** The same text with each key that `keys` names (old → new) swapped for its new one. */
export const renameCiteKeys = (text, keys) =>
  String(text).replace(CITE_PARTS, (part, list) => (list == null ? part : `{${list.replace(/[^,\s]+/g, (key) => keys[key] ?? key)}}`));
