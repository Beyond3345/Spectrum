import type { ClaimRow } from '../../api/client';

// The claims ledger in words: each rating’s label and tone, where a quote was read, and the table Copy gives.

export const RATING: Record<ClaimRow['rating'], { label: string; tone: 'success' | 'warning' | 'danger' | '' }> = {
  supported: { label: 'Supported', tone: 'success' },
  partly: { label: 'Partly supported', tone: 'warning' },
  unsupported: { label: 'Unsupported', tone: 'danger' },
  'needs-source': { label: 'Needs a source', tone: 'warning' },
  'not-checkable': { label: 'Not checkable', tone: '' }
};

// the ones to look at first
const ORDER: ClaimRow['rating'][] = ['unsupported', 'needs-source', 'partly', 'not-checkable', 'supported'];

/** The ledger as the panel lists it: by file and line, the ones with a problem first when worst is on. */
export function ordered(claims: ClaimRow[], worst = false) {
  const place = (c: ClaimRow) => `${c.file}\u0000${String(c.line).padStart(8, '0')}`;
  return [...claims].sort((a, b) => (worst ? ORDER.indexOf(a.rating) - ORDER.indexOf(b.rating) : 0) || place(a).localeCompare(place(b)));
}

/** "Full text, page 2" or "Abstract only": what the quote was found in. */
export const readLine = (read: NonNullable<ClaimRow['read']>) => (read.kind === 'abstract' ? 'Abstract only' : `Full text${read.page ? `, page ${read.page}` : ''}`);

/** Whether where is an address to open, rather than a PDF in the project. */
export const isLink = (where: string) => /^https?:\/\//i.test(where);

/** "2 unsupported · 1 needs a source · 3 supported" */
export function ledgerCounts(claims: ClaimRow[]) {
  return ORDER.map((r) => [claims.filter((c) => c.rating === r).length, RATING[r].label.toLowerCase()] as const)
    .filter(([n]) => n)
    .map(([n, label]) => `${n} ${label}`);
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The ledger as a Markdown table, for research/claims.md or a message: every row with its evidence. */
export function ledgerMarkdown(claims: ClaimRow[]) {
  const rows = ordered(claims).map((c) => {
    const read = c.read ? `${readLine(c.read)}, ${c.read.where}` : '';
    return `| ${cell(`${c.file}:${c.line}`)} | ${cell(c.text)} | ${cell(c.keys.join(', '))} | ${RATING[c.rating].label} | ${cell(c.quote ? `“${c.quote}”` : '')} | ${cell(read)} | ${cell(c.note || '')} | ${c.createdAt.slice(0, 10)} |`;
  });
  return ['| Where | Claim | Keys | Rating | Quote | Read in | Note | Checked |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...rows].join('\n') + '\n';
}

/** A to-do for a claim to revisit, linked to its line. */
export const claimTodo = (c: ClaimRow) => ({
  text: `${RATING[c.rating].label}: “${c.text.length > 120 ? `${c.text.slice(0, 119)}…` : c.text}”${c.note ? ` ${c.note}` : ''}`.slice(0, 2000),
  link: { file: c.file, line: c.line }
});
