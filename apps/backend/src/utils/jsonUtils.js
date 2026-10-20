// Shared complete-JSON extraction for model replies; no partial object reconstruction.
export function stripCodeFences(text) {
  return text
    .replace(/^```(?:json|latex|tex)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}


export function extractJsonBlock(text) {
  const cleaned = stripCodeFences(String(text ?? ''));

  // Fast path: the whole string is valid JSON
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch { /* fall through */ }

  // Slow path: find the first { ... } or [ ... ] block
  const startObj = cleaned.indexOf('{');
  const startArr = cleaned.indexOf('[');
  const start = startObj === -1 ? startArr
    : startArr === -1 ? startObj
    : Math.min(startObj, startArr);

  if (start === -1) return '';

  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) depth--;
    if (depth === 0) {
      return cleaned.slice(start, i + 1);
    }
  }
  return '';
}


export function extractJSON(text) {
  try { return JSON.parse(extractJsonBlock(text)); } catch { return null; }
}
