/** Plain text for a TeX argument, keeping every character literal. */
export function escapeTexText(value) {
  const special = { '\\': '\\textbackslash{}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
  return String(value ?? '').replace(/[\\{}$&%#_^~]/g, (char) => special[char] || `\\${char}`);
}

/** TeX comments outside escaped characters; preserves line endings. */
export const withoutComments = (text) => String(text).replace(/\\.|%[^\r\n]*/g, (token) => token[0] === '%' ? '' : token);
