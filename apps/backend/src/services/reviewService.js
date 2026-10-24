import { promises as fs } from 'fs';
import path from 'path';
import { chatCompletion } from './llmService.js';
import { buildBibIndex, findDuplicate, parseBibEntries } from './referenceService.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { extractJSON } from '../utils/jsonUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { inlineInputs } from '../utils/texUtils.js';

// Tools › Review: what the review needs to know about a document (whether its PDF is older than its source, and the
// project's .bib entries), and the AI review, one read-only model call over the whole document. It never writes.

/** Characters of numbered source one review sends, about 75,000 tokens; a longer document is reviewed a file at a time. */
export const REVIEW_BUDGET = 300_000;
const MAX_REPORTED = 150;
const SEVERITIES = ['major', 'minor', 'note'];

const slashed = (p) => p.split(path.sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** The files a document reads, in the order it first reads them (\input, \include and \subfile, as the compile finds them). */
async function documentFiles(root, doc) {
  const files = new Set();
  await inlineInputs(root, doc, { stripComments: true, files });
  return [...files].map(slashed);
}

const projectFiles = async (root) => (await listFilesRecursive(root)).filter((i) => i.type === 'file').map((i) => i.path);

/**
 * The .bib entries, each with its file and line, its type, the fields it has, its DOI and title, and the earlier entry
 * with another key it duplicates (by DOI, arXiv id or title and year, as references are matched when added).
 */
async function bibRecords(root, bibs) {
  const files = [];
  for (const file of bibs) {
    const text = await fs.readFile(safeJoin(root, file), 'utf8').catch(() => null);
    if (text !== null) files.push({ file, text });
  }
  // buildBibIndex reads the entries in the same order, so index[i] is records[i]'s identity
  const index = buildBibIndex(files);
  const records = files.flatMap(({ file, text }) => parseBibEntries(text).map((e) => ({ file, line: lineOf(text, e.at), key: e.key, type: e.type, fields: e.fields })));
  // ponytail: each entry against every earlier one, fine for a few thousand entries
  return records.map(({ fields, ...record }, i) => {
    const id = index[i];
    const twin = findDuplicate(index.slice(0, i).filter((e) => e.key !== record.key), id);
    const by = twin && (id.doi && twin.doi === id.doi ? 'DOI' : id.arxiv && twin.arxiv === id.arxiv ? 'arXiv id' : 'title');
    return {
      ...record,
      fields: Object.keys(fields),
      ...(fields.doi && { doi: fields.doi }),
      ...(id.displayTitle && { title: id.displayTitle }),
      ...(twin && { duplicateOf: { key: twin.key, file: twin.file, by } })
    };
  });
}

/**
 * pdfAt: when doc's PDF was written (ms), or null; sourceAt: the newest of the files doc reads and the project's .bib
 * files. With bib, the .bib entries too (bibRecords).
 */
export async function reviewState(root, doc, { bib = false } = {}) {
  const bibs = (await projectFiles(root)).filter((p) => /\.bib$/i.test(p));
  const mtime = async (rel) => {
    const stat = await fs.stat(safeJoin(root, rel)).catch(() => null);
    return stat ? Math.round(stat.mtimeMs) : null;
  };
  const times = (await Promise.all([...(await documentFiles(root, doc)), ...bibs].map(mtime))).filter((t) => t !== null);
  return {
    pdfAt: await mtime(doc.replace(/\.tex$/i, '.pdf')),
    sourceAt: times.length ? Math.max(...times) : null,
    ...(bib && { bib: await bibRecords(root, bibs) })
  };
}

const SYSTEM = `You are reviewing an academic manuscript written in LaTeX, as a demanding but fair referee would. You read the whole document once and report what you find. You never edit files and never write LaTeX patches.

Cover these:
- The paper as a whole: what it claims, its strengths and weaknesses, questions for the authors, experiments, analyses or baselines that are missing, how clear the writing and structure are, and concrete suggestions.
- Consistency across the document. Use the category Terminology for one concept named in different ways, Notation for symbols used inconsistently, Data for numbers that disagree between the abstract, the text, the tables and the figures, Logic for claims the evidence does not support or sections that contradict each other, and Style for inconsistent tense, voice or person.
- Statements of fact or about prior work that need a citation and have none, with the category Citation needed. The bibliography keys are listed so you can tell what the paper cites.
Other categories you may use: Question, Missing experiment, Methods, Results, Clarity, Structure, Novelty, Reproducibility.

The automatic checks listed under "Already reported" have run. Do not repeat them, and do not report build problems, undefined references or layout.

Severity: "major" for problems that affect whether the conclusions hold or the paper could be accepted, "minor" for problems worth fixing that leave the conclusions standing, and "note" for small points and line-level polish.

Each source line starts with its number and a bar, as in "12| text". Anchor each finding: "file" is the path in the file's header, "line" the number of the line it is about and "quote" an exact excerpt of 4 to 20 words copied from that line or the next few, without the number and bar. A remark about the paper as a whole takes the line where it shows most.

Reply with JSON only, in this shape:
{"summary": "", "strengths": [""], "score": 6, "confidence": 3, "findings": [{"severity": "major", "category": "", "file": "", "line": 1, "quote": "", "issue": "", "suggestion": ""}], "limits": [""]}
"score" is your overall rating out of 10 and "confidence" how sure you are of it, out of 5. "limits" says what you could not judge from the source alone, such as figures you cannot see or data you cannot check.`;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const strings = (value, max) => (Array.isArray(value) ? value.map((v) => text(v, max)).filter(Boolean) : []);
const number = (value, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
};
const squash = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The finding with its line moved to where its quote is, when that is within about 10 lines of the line given
 * (nearest first); anchored is false when the quote isn't there. file: the reviewed file it names, by path or, when
 * only one file has that name, by name.
 */
export function anchor(finding, files) {
  const named = finding.file.replace(/^\.\//, '');
  const byName = files.filter((f) => path.posix.basename(f.path) === path.posix.basename(named));
  const file = files.find((f) => f.path === named) ?? (byName.length === 1 ? byName[0] : null);
  const want = squash(finding.quote);
  if (!file || !want || !finding.line) return { ...finding, file: file?.path ?? named, anchored: false };
  const from = Math.max(1, finding.line - 10);
  const to = Math.min(file.lines.length, finding.line + 10);
  // a quote may run on past the window's last line
  let flat = '';
  const starts = [];
  for (const line of file.lines.slice(from - 1, to + 4)) {
    starts.push(flat.length);
    flat += `${squash(line)} `;
  }
  let best = 0;
  for (let at = flat.indexOf(want); at !== -1; at = flat.indexOf(want, at + 1)) {
    let k = starts.length - 1;
    while (starts[k] > at) k -= 1;
    const n = from + k;
    if (n <= to && (!best || Math.abs(n - finding.line) < Math.abs(best - finding.line))) best = n;
  }
  return { ...finding, file: file.path, line: best || finding.line, anchored: Boolean(best) };
}

/** The model's answer as the review the panel shows, or null when it isn't one. */
function readReview(content, files) {
  const json = extractJSON(content);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const findings = (Array.isArray(json.findings) ? json.findings : []).flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const issue = text(f.issue, 2000);
    if (!issue) return [];
    const line = Number.isInteger(Number(f.line)) && Number(f.line) > 0 ? Number(f.line) : 0;
    const severity = SEVERITIES.includes(f.severity) ? f.severity : 'note';
    return [anchor({ severity, category: text(f.category, 40) || 'General', file: text(f.file, 500), line, quote: text(f.quote, 400), issue, suggestion: text(f.suggestion, 2000) }, files)];
  });
  return {
    summary: text(json.summary, 6000),
    strengths: strings(json.strengths, 1000).slice(0, 20),
    score: number(json.score, 10),
    confidence: number(json.confidence, 5),
    findings: findings.slice(0, 200),
    limits: strings(json.limits, 1000).slice(0, 20)
  };
}

const numbered = (file) => [`=== ${file.path} ===`, ...file.lines.map((line, i) => `${i + 1}| ${line}`)].join('\n');

/**
 * The AI review of doc: its files in reading order with numbered lines, the .bib keys and what Preflight already
 * reported, in one model call with no tools. Over REVIEW_BUDGET only activePath (or doc) is sent, cut short if need be,
 * and the limits say so. Aborting signal stops the call.
 */
export async function aiReview({ root, doc, activePath, findings = [], llmConfig, reasoningEffort, signal }) {
  const order = await documentFiles(root, doc);
  if (!order.length) return { ok: false, error: `Couldn’t read ${doc}.` };
  let files = [];
  for (const rel of order) {
    const source = await fs.readFile(safeJoin(root, rel), 'utf8').catch(() => null);
    if (source !== null) files.push({ path: rel, lines: source.replace(/\r\n?/g, '\n').split('\n') });
  }
  const size = (list) => list.reduce((n, f) => n + numbered(f).length, 0);
  const limits = [];
  if (size(files) > REVIEW_BUDGET) {
    const open = files.find((f) => f.path === activePath) ?? files[0];
    let lines = open.lines;
    while (size([{ ...open, lines }]) > REVIEW_BUDGET) lines = lines.slice(0, Math.floor(lines.length * 0.9));
    files = [{ ...open, lines }];
    limits.push(
      lines.length < open.lines.length
        ? `The document is too long for one review, so only ${open.path} up to line ${lines.length} was reviewed.`
        : `The document is too long for one review, so only ${open.path} was reviewed. Open another file and review again for that one.`
    );
  }
  const bibs = (await projectFiles(root)).filter((p) => /\.bib$/i.test(p));
  const keys = [];
  for (const file of bibs) keys.push(...parseBibEntries(await fs.readFile(safeJoin(root, file), 'utf8').catch(() => '')).map((e) => e.key));
  const reported = (Array.isArray(findings) ? findings : []).slice(0, MAX_REPORTED).map((f) => {
    const where = [text(f?.file, 300), f?.line && `line ${Number(f.line)}`, f?.page && `page ${Number(f.page)}`].filter(Boolean).join(', ');
    return `- ${text(f?.severity, 20)}: ${text(f?.message, 400)}${where ? ` (${where})` : ''}`;
  });
  const user = [
    `Document: ${doc}. Files in reading order: ${files.map((f) => f.path).join(', ')}.`,
    `Bibliography keys: ${keys.length ? [...new Set(keys)].slice(0, 3000).join(', ') : 'none'}.`,
    `Already reported:\n${reported.length ? reported.join('\n') : '- nothing'}`,
    ...files.map(numbered)
  ].join('\n\n');
  const res = await chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user }
    ],
    model: llmConfig?.model,
    endpoint: llmConfig?.endpoint,
    apiKey: llmConfig?.apiKey,
    reasoningEffort,
    signal
  });
  if (!res.ok) return { ok: false, error: res.error, ...(res.stopped && { stopped: true }) };
  const review = readReview(res.message.content, files);
  if (!review) return { ok: false, error: 'The model’s answer couldn’t be read as a review. Try again, or try another model.' };
  return { ok: true, ...review, limits: [...limits, ...review.limits], files: files.map((f) => f.path) };
}
