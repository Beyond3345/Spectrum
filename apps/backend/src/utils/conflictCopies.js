import path from 'path';

// The copies a sync app makes when a file changed on two computers before it could sync, kept beside the original:
//   Synology Drive  a_Andy-PC_Jan-03-0901-2013_CaseConflict_1.txt (<name>_<computer>_<Mon-DD-HHMM[SS]-YYYY>_<reason>[_n])
//   Dropbox         a (Andy's conflicted copy 2013-01-03).txt, a (Case Conflict).txt
//   OneDrive        a-DESKTOP-AB12CD.txt, which reads like any name with a dash, so only for a known computer's name
//                   when a.txt is there too
const SYNOLOGY = /^(.+)_(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2}-\d{4}(?:\d{2})?-\d{4}_[A-Za-z]*Conflict[A-Za-z]*(?:_\d+)?$/i;
const DROPBOX = /^(.*\S) \((?:[^()]*conflicted copy[^()]*(?:\(\d+\))?|case conflict(?: \d+)?|unicode encoding conflict)\)(?: \(\d+\))?$/i;

/** Whether a file or folder name is a Synology or Dropbox conflict copy, without knowing its original (scanning). */
export function looksLikeConflictCopy(name) {
  const stem = name.slice(0, name.length - path.posix.extname(name).length);
  return SYNOLOGY.test(stem) || SYNOLOGY.test(name) || DROPBOX.test(stem) || DROPBOX.test(name);
}

/** The conflict copies among a project's file paths ('/'-separated), each with the path of its original. */
export function conflictCopies(paths, machineNames = []) {
  const files = new Set(paths);
  const names = [...new Set(machineNames.map((n) => String(n || '').trim().toLowerCase()).filter(Boolean))];
  const copies = {};
  for (const file of paths) {
    const dir = file.slice(0, file.lastIndexOf('/') + 1);
    const ext = path.posix.extname(file.slice(dir.length));
    const stem = file.slice(dir.length, file.length - ext.length);
    const at = (name) => `${dir}${name}${ext}`;
    let original = null;
    const synology = stem.match(SYNOLOGY);
    if (synology) {
      // the computer's name follows the last '_', unless a longer original is in the project
      const parts = synology[1].split('_');
      for (let i = parts.length - 1; i > 0 && !original; i--) if (files.has(at(parts.slice(0, i).join('_')))) original = at(parts.slice(0, i).join('_'));
      if (!original && parts.length > 1) original = at(parts.slice(0, -1).join('_'));
    }
    const dropbox = !original && stem.match(DROPBOX);
    if (dropbox) original = at(dropbox[1]);
    if (!original) {
      for (const s of new Set([stem, stem.replace(/-\d+$/, '')])) {
        const name = names.find((n) => s.toLowerCase().endsWith(`-${n}`) && files.has(at(s.slice(0, -n.length - 1))));
        if (name) original = at(s.slice(0, -name.length - 1));
      }
    }
    if (original && original !== file) copies[file] = original;
  }
  return copies;
}
