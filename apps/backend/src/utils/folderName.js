/** Turn a display name into a folder name that works on macOS and Windows. */
export function sanitiseFolderName(name) {
  const clean = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
    .trim()
    // and a leading ~, which Synology passes by and OneDrive refuses
    .replace(/^[.~]+/, '')
    .trim();
  // Windows drops a trailing dot or space, and CON, AUX and the like are device names.
  const short = Array.from(clean).slice(0, 100).join('').trim().replace(/[. ]+$/, '').replace(/^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/i, '$1_');
  return short || 'Untitled';
}
