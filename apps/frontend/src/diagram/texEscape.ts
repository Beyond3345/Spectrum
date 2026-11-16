// Text typed into a field, made safe to write into TeX: each of `chars` not already escaped gets its backslash, so a
// bare % no longer comments out the rest of the line. The plots and forms escape % alone, where & and # are LaTeX
// people mean (an alignment, a macro argument); a plain-text box can pass '%&#'.

/** text with every unescaped one of chars (from % & # $ _ { }) written \% and so on; a \\ before one is a line break, so it is escaped too */
export function escapeTex(text: string, chars = '%') {
  const set = chars.replace(/[\]\\^-]/g, '\\$&');
  return text.replace(new RegExp(`(\\\\*)([${set}])`, 'g'), (_, slashes: string, c: string) => `${slashes}${slashes.length % 2 ? '' : '\\'}${c}`);
}
