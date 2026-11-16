// Types for texEscape.js, which the frontend imports through apps/frontend/src/diagram/modes/shared.ts.

/** text with each unescaped one of chars (default '%') escaped; a % in $…$ too, the others only outside it */
export function escapeTex(text: string, chars?: string): string;
