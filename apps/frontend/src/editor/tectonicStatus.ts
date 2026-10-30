// What a running Tectonic compile is doing, from the notes in its output so far. Tectonic doesn't know how many
// files it will download, so the line counts the ones so far rather than showing a percentage.

const TOOLS: Record<string, string> = { biber: 'Biber', bibtex: 'BibTeX', makeindex: 'MakeIndex', xdvipdfmx: 'xdvipdfmx' };

/** The status line for the latest note: “Downloading latex.ltx… (37 files so far)”, “Running TeX”, “Running Biber”. */
export function tectonicStatus(output: string) {
  const notes = (output.match(/^note: .*$/gm) ?? []).map((note) => note.slice(6).trim().replace(/\s*\.\.\.$/, ''));
  const last = notes[notes.length - 1];
  if (!last) return 'Starting…';
  const downloading = /^downloading (.+)$/.exec(last);
  if (downloading) {
    const count = notes.filter((note) => note.startsWith('downloading ')).length;
    return `Downloading ${downloading[1]}… (${count} ${count === 1 ? 'file' : 'files'} so far)`;
  }
  if (/^Rerunning TeX\b/.test(last)) return 'Running TeX again';
  if (/^Running TeX\b/.test(last)) return 'Running TeX';
  const tool = /^Running (?:external tool )?(\S+)/.exec(last)?.[1];
  if (tool) return `Running ${TOOLS[tool.toLowerCase()] ?? tool}`;
  if (/^Writing\b/.test(last)) return 'Writing the PDF';
  return last.charAt(0).toUpperCase() + last.slice(1);
}
