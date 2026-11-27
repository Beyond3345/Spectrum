import type { ReferenceCheckRow } from '../../api/client';

// Review’s Verify citations: what each row of the check says, in words, and as the report copies it.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 2010-02-06 as 6 February 2010; a year or a month alone as it is. */
export function dateWords(date = '') {
  const [y, m, d] = date.split('-').map(Number);
  if (!y) return '';
  if (!m) return String(y);
  return [d || '', MONTHS[m - 1], y].filter(Boolean).join(' ');
}

const list = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** The row’s finding in one line: “Wakefield1998 was retracted on 6 February 2010”. */
export function checkHead(row: ReferenceCheckRow) {
  switch (row.status) {
    case 'retracted': {
      const when = dateWords(row.retraction?.date);
      const how = { withdrawal: 'withdrawn', removal: 'removed', 'partial retraction': 'partly retracted' }[String(row.retraction?.label).toLowerCase()] || 'retracted';
      return `${row.key} was ${how}${when ? ` on ${when}` : ''}`;
    }
    case 'differs':
      return `${row.key}: the ${list((row.differences || []).map((d) => d.field))} ${(row.differences || []).length > 1 ? 'differ' : 'differs'} from the record`;
    case 'not-found':
      return `${row.key} was not found`;
    case 'unchecked':
      return `${row.key} could not be checked`;
    default:
      return `${row.key} was found as it is`;
  }
}

export const SEVERITY = { retracted: 'error', 'not-found': 'error', differs: 'warning', unchecked: 'info', found: 'info' } as const;

/** "1 retracted · 2 not found · 1 differs · 12 found" */
export function checkCounts(rows: ReferenceCheckRow[]) {
  const n = (status: ReferenceCheckRow['status']) => rows.filter((r) => r.status === status).length;
  return [
    [n('retracted'), 'retracted'],
    [n('not-found'), 'not found'],
    [n('differs'), n('differs') === 1 ? 'differs' : 'differ'],
    [n('unchecked'), 'not checked'],
    [n('found'), 'found']
  ].filter(([count]) => count).map(([count, word]) => `${count} ${word}`);
}

/** The rows as Copy report has them: each problem with what was read and where, the found ones as a count. */
export function checkReport(rows: ReferenceCheckRow[]) {
  const out: string[] = [];
  for (const r of rows.filter((x) => x.status !== 'found')) {
    out.push(`- ${checkHead(r)} (${r.file}:${r.line})`);
    for (const d of r.differences || []) out.push(`  - ${d.field}: “${d.bib}” in the .bib, “${d.record}” in the record`);
    if (r.retraction) out.push(`  - ${r.retraction.label}, from ${r.retraction.from}${r.retraction.url ? `: ${r.retraction.url}` : ''}`);
    if (r.note) out.push(`  - ${r.note}`);
    if (r.read) out.push(`  - Read at ${r.read.from}: ${r.read.url}`);
  }
  const found = rows.filter((x) => x.status === 'found').length;
  if (found) out.push(`- ${found} ${found === 1 ? 'entry was' : 'entries were'} found as they are.`);
  return out;
}

/** Which .bib files Verify citations read, and what it noticed (a file the document loads that is missing, none at all). */
export const existRead = ({ bibFiles, note }: { bibFiles?: string[]; note?: string }) =>
  [bibFiles?.length ? `Read ${bibFiles.join(', ')}.` : '', note || ''].filter(Boolean).join(' ');
