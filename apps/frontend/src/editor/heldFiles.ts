// How the editor treats a loaded file that changed or went on disk (another computer, through a sync app), and
// where it keeps a held file's unsaved text when the user leaves before saying what to keep.

/**
 * What the editor does with a loaded file whose text on disk isn't what it last loaded or saved (disk null: it was
 * deleted). 'wait' while a save of it is queued: that save goes from the text before, so it's refused and brings
 * this back. 'gone' for a deleted file. 'ask' which to keep when the file is held for an earlier change, or has text
 * of its own here (a deleted file's too), unless that's the text on disk now. Else 'take' the disk's.
 */
export function onDiskChange(o: { queued: boolean; changed: boolean; unsaved: boolean; mine: string | undefined; disk: string | null }) {
  if (o.queued) return 'wait';
  if (o.disk === null) return 'gone';
  return (o.changed || o.unsaved) && o.mine !== o.disk ? 'ask' : 'take';
}

/**
 * The file beside `path` a held file's unsaved text is kept in, named as Dropbox names a conflicted copy
 * (main (Daniel’s Mac’s conflicted copy 2026-10-17 104233).tex), so the conflict-copy banner offers it.
 */
export function conflictCopyPath(path: string, machine: string, at: Date) {
  const slash = path.lastIndexOf('/') + 1;
  const name = path.slice(slash);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  // parentheses would end the copy's mark early, a dot would read as the extension of one without (.latexmkrc),
  // and Windows refuses the rest
  const who = machine.replace(/[().<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  const two = (n: number) => String(n).padStart(2, '0');
  const when = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `${path.slice(0, slash)}${stem} (${who ? `${who}’s ` : ''}conflicted copy ${when})${ext}`;
}
