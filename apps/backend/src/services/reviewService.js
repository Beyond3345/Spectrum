import { docLanguage } from '../utils/docLanguage.js';
import { DATA_RULE, untrusted } from '../utils/outsideText.js';
import { promises as fs } from 'fs';
import path from 'path';
import { chatCompletion } from './llmService.js';
import { buildBibIndex, findDuplicate, parseBibEntries } from './referenceService.js';
import { listFilesRecursive } from '../utils/fsUtils.js';
import { extractJSON } from '../utils/jsonUtils.js';
import { safeJoin } from '../utils/pathUtils.js';
import { inlineInputs } from '../utils/texUtils.js';

// Tools › Review: what the review needs to know about a document (whether its PDF is older than its source, and the
// project's .bib entries), and the AI review, one read-only model call over the document, or one a part for a long
// one. It never writes.

/**
 * Characters of numbered source one review call sends; a longer document is reviewed in parts of this size, one call
 * each. Measured with the o200k and cl100k tokenizers on numbered source (TeX Live's documentation, 1.6 MB, and
 * Spectrum's templates and handbook): LaTeX runs 3.3 characters a token, Typst 3.6 and Markdown 3.7. At 3.2 this is
 * 50,000 tokens, which with the instructions, up to 3,000 bibliography keys and the answer fits a 128k context with
 * room to spare, and a 64k one for most papers.
 */
export const REVIEW_BUDGET = 160_000;
const MAX_REPORTED = 150;
const SEVERITIES = ['major', 'minor', 'note'];

const slashed = (p) => p.split(path.sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * The files a document reads, in the order it first reads them: a LaTeX document's \input, \include, \subfile and
 * \import, as the compile finds them, a Typst document's #include, and a Markdown document alone.
 */
async function documentFiles(root, doc) {
  if (/\.typ$/i.test(doc)) {
    const order = [];
    const visit = async (rel, depth) => {
      if (depth > 10 || order.includes(rel)) return;
      let text;
      try {
        text = await fs.readFile(safeJoin(root, rel), 'utf8');
      } catch {
        return;
      }
      order.push(rel);
      // from the including file's folder, or the project's with a leading /, as Typst finds it
      for (const [, target] of text.replace(/\/\/.*$/gm, '').matchAll(/#include\s+"([^"]+)"/g)) {
        await visit(target.startsWith('/') ? path.posix.normalize(target.slice(1)) : path.posix.join(path.posix.dirname(rel), target), depth + 1);
      }
    };
    await visit(slashed(path.normalize(doc)), 0);
    return order;
  }
  if (!/\.(?:tex|ltx)$/i.test(doc)) return (await fs.stat(safeJoin(root, doc)).catch(() => null))?.isFile() ? [slashed(path.normalize(doc))] : [];
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
    pdfAt: await mtime(doc.replace(/\.(?:tex|typ|md|markdown)$/i, '.pdf')),
    sourceAt: times.length ? Math.max(...times) : null,
    ...(bib && { bib: await bibRecords(root, bibs) })
  };
}

const system = (language) => `You are reviewing an academic manuscript written in ${language.name}, as a demanding but fair referee would. You read the whole document once and report what you find. You never edit files and never write patches.

Cover these:
- The paper as a whole: what it claims, its strengths and weaknesses, questions for the authors, experiments, analyses or baselines that are missing, how clear the writing and structure are, and concrete suggestions.
- Consistency across the document. Use the category Terminology for one concept named in different ways, Notation for symbols used inconsistently, Data for numbers that disagree between the abstract, the text, the tables and the figures, Logic for claims the evidence does not support or sections that contradict each other, and Style for inconsistent tense, voice or person.
- Statements of fact or about prior work that need a citation and have none, with the category Citation needed. The bibliography keys are listed so you can tell what the paper cites.
Other categories you may use: Question, Missing experiment, Methods, Results, Clarity, Structure, Novelty, Reproducibility.

The automatic checks listed under "Already reported" have run. Do not repeat them, and do not report build problems, undefined references or layout.

Severity: "major" for problems that affect whether the conclusions hold or the paper could be accepted, "minor" for problems worth fixing that leave the conclusions standing, and "note" for small points and line-level polish.

Each source line starts with its number and a bar, as in "12| text". Anchor each finding: "file" is the path in the file's header, "line" the number of the line it is about and "quote" an exact excerpt of 4 to 20 words copied from that line or the next few, without the number and bar. A remark about the paper as a whole takes the line where it shows most.

Reply with JSON only, writing each backslash twice inside its strings (a quote of \\cite{key} is "\\\\cite{key}"), in this shape:
{"summary": "", "strengths": [""], "score": 6, "confidence": 3, "findings": [{"severity": "major", "category": "", "file": "", "line": 1, "quote": "", "issue": "", "suggestion": ""}], "limits": [""]}
"score" is your overall rating out of 10 and "confidence" how sure you are of it, out of 5. "limits" says what you could not judge from the source alone, such as figures you cannot see or data you cannot check.

${DATA_RULE}`;

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
  // a part of a long document names its runs "ch1.tex (lines 2001 to 2600)", which a model may copy whole
  const named = finding.file.replace(/^\.\//, '').replace(/\s*\(lines \d+ to \d+\)$/, '');
  const byName = files.filter((f) => path.posix.basename(f.path) === path.posix.basename(named));
  const file = files.find((f) => f.path === named) ?? (byName.length === 1 ? byName[0] : null);
  if (!file || !squash(finding.quote) || !finding.line) return { ...finding, file: file?.path ?? named, anchored: false };
  const from = Math.max(1, finding.line - 10);
  const to = Math.min(file.lines.length, finding.line + 10);
  // a quote may run on past the window's last line
  let flat = '';
  const starts = [];
  for (const line of file.lines.slice(from - 1, to + 4)) {
    starts.push(flat.length);
    flat += `${squash(line)} `;
  }
  const nearest = (want) => {
    let best = 0;
    for (let at = flat.indexOf(want); at !== -1; at = flat.indexOf(want, at + 1)) {
      let k = starts.length - 1;
      while (starts[k] > at) k -= 1;
      const n = from + k;
      if (n <= to && (!best || Math.abs(n - finding.line) < Math.abs(best - finding.line))) best = n;
    }
    return best;
  };
  // a \ref or \textbf the model didn't double in its JSON reads as a control character and the letters after it
  const best = nearest(squash(finding.quote)) || nearest(squash(finding.quote.replace(/[\r\t\b\f\n](?=[A-Za-z])/g, (c) => `\\${CONTROL[c]}`)));
  return { ...finding, file: file.path, line: best || finding.line, anchored: Boolean(best) };
}

const CONTROL = { '\r': 'r', '\t': 't', '\b': 'b', '\f': 'f', '\n': 'n' };

/**
 * The JSON in a model's answer: from the first { that opens an object, past a reasoning model's <think> and prose
 * before it that could hold a [ or braces of its own (\section{Intro}), and failing that with the backslashes of LaTeX
 * it didn't double (\cite, \usepackage) doubled and trailing commas gone.
 */
export function replyJSON(content) {
  const body = String(content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const from = body.search(/\{\s*"/);
  if (from === -1) return null;
  // a \textbf, \ref, \begin or \frac left single is valid JSON, a tab, CR, backspace or form feed and the letters after
  // it, none of which a review puts straight before a letter; not \n, as \nThe is a line break (\noindent stays so)
  const json = body.slice(from).replace(/\\(?:\\|([bfrt])(?=[A-Za-z]))/g, (m, c) => (c ? `\\\\${c}` : m));
  return extractJSON(json) ?? extractJSON(json.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})?/g, (m, escape) => (escape ? m : '\\\\')).replace(/,(\s*[}\]])/g, '$1'));
}

/** The model's answer as the review the panel shows, or null when it isn't one. */
export function readReview(content, files) {
  const json = replyJSON(content);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const seen = new Set();
  const findings = (Array.isArray(json.findings) ? json.findings : []).flatMap((f) => {
    if (!f || typeof f !== 'object') return [];
    const issue = text(f.issue, 2000);
    if (!issue) return [];
    const line = Number.isInteger(Number(f.line)) && Number(f.line) > 0 ? Number(f.line) : 0;
    const said = String(f.severity ?? '').trim().toLowerCase();
    const severity = SEVERITIES.includes(said) ? said : 'note';
    const found = anchor({ severity, category: text(f.category, 40) || 'General', file: text(f.file, 500), line, quote: text(f.quote, 400), issue, suggestion: text(f.suggestion, 2000) }, files);
    // the same point twice would share its row's id in Review, so Dismiss would hide both
    const id = JSON.stringify([found.severity, found.file, found.line, found.issue]);
    if (seen.has(id)) return [];
    seen.add(id);
    return [found];
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

const numbered = ({ path: file, lines, from = 1, to = lines.length }) =>
  [`=== ${file}${from > 1 || to < lines.length ? ` (lines ${from} to ${to})` : ''} ===`, ...lines.slice(from - 1, to).map((line, i) => `${from + i}| ${line}`)].join('\n');
const lineCost = (line, i) => `${i + 1}| ${line}\n`.length;

// a top-level heading, where a part had best begin: LaTeX's \part, \chapter and \section, Typst's = and ==, Markdown's
// # and ##; the first line of a file is one too
const TOP_HEADING = /^\s*(?:\\(?:part|chapter|section)\*?\s*[[{]|={1,2}\s|#{1,2}\s)/;

/**
 * The document in parts of at most budget characters of numbered source, in reading order: each part a list of
 * { path, from, to } line runs. A part ends before the last top-level heading (or file) that comes once it is at least
 * half full, so a section is read whole where it fits; a section longer than that is cut between lines.
 */
export function reviewParts(files, budget = REVIEW_BUDGET) {
  const flat = files.flatMap((file) => file.lines.map((line, i) => ({ path: file.path, i, cost: lineCost(line, i), head: i === 0 || TOP_HEADING.test(line) })));
  // a run's header line costs its path and a little more
  const costOf = (k, start) => flat[k].cost + (k === start || flat[k - 1].path !== flat[k].path ? flat[k].path.length + 30 : 0);
  const sum = (from, to) => {
    let n = 0;
    for (let k = from; k < to; k += 1) n += costOf(k, from);
    return n;
  };
  const starts = [0];
  let size = 0;
  let head = -1;
  for (let k = 0; k < flat.length; k += 1) {
    const start = starts[starts.length - 1];
    const cost = costOf(k, start);
    if (k > start && size + cost > budget) {
      const at = head > start && sum(start, head) >= budget / 2 ? head : k;
      starts.push(at);
      size = sum(at, k + 1);
      head = flat[k].head ? k : -1;
      continue;
    }
    if (flat[k].head) head = k;
    size += cost;
  }
  return starts.map((from, n) => {
    const runs = [];
    for (let k = from; k < (starts[n + 1] ?? flat.length); k += 1) {
      const run = runs[runs.length - 1];
      if (run?.path === flat[k].path) run.to = flat[k].i + 1;
      else runs.push({ path: flat[k].path, from: flat[k].i + 1, to: flat[k].i + 1 });
    }
    return runs;
  }).filter((part) => part.length);
}

/**
 * The AI review of doc: its source files in reading order with numbered lines, the .bib keys and what Preflight already
 * reported, in one model call with no tools. A document longer than REVIEW_BUDGET is reviewed in parts (reviewParts),
 * one request each: part is which one (from 0), and summary what the model said of the parts before, so each part is
 * read knowing the story so far. The answer names the part, how many there are and what each holds (plan). Figure and
 * data code an \input reads (a .pgf) is left out and the limits say so. Aborting signal stops the call.
 */
export async function aiReview({ root, doc, findings = [], llmConfig, reasoningEffort, signal, part = 0, summary = '' }) {
  const order = await documentFiles(root, doc);
  if (!order.length) return { ok: false, error: `Couldn’t read ${doc}.` };
  let files = [];
  for (const rel of order) {
    const source = await fs.readFile(safeJoin(root, rel), 'utf8').catch(() => null);
    if (source !== null) files.push({ path: rel, lines: source.replace(/\r\n?/g, '\n').split('\n') });
  }
  // a matplotlib .pgf or a table's data the document \inputs can run to megabytes: code, not the paper's text
  const figures = files.filter((f) => !/\.(?:tex|ltx|typ|md|markdown)$/i.test(f.path));
  files = files.filter((f) => !figures.includes(f));
  const limits = [];
  if (figures.length) limits.push(`${figures.map((f) => f.path).join(', ')} ${figures.length === 1 ? 'is figure or data code and wasn’t' : 'are figure or data code and weren’t'} sent.`);
  const plan = reviewParts(files);
  const index = Number.isInteger(part) && part >= 0 ? part : 0;
  if (index >= plan.length) return { ok: false, error: 'That part of the document isn’t there any more. Review again.' };
  const runs = plan[index].map((run) => ({ ...files.find((f) => f.path === run.path), from: run.from, to: run.to }));
  const bibs = (await projectFiles(root)).filter((p) => /\.bib$/i.test(p));
  const keys = [];
  for (const file of bibs) keys.push(...parseBibEntries(await fs.readFile(safeJoin(root, file), 'utf8').catch(() => '')).map((e) => e.key));
  const reported = (Array.isArray(findings) ? findings : []).slice(0, MAX_REPORTED).map((f) => {
    const where = [text(f?.file, 300), f?.line && `line ${Number(f.line)}`, f?.page && `page ${Number(f.page)}`].filter(Boolean).join(', ');
    return `- ${text(f?.severity, 20)}: ${text(f?.message, 400)}${where ? ` (${where})` : ''}`;
  });
  const user = [
    `Document: ${doc}. Files in reading order: ${files.map((f) => f.path).join(', ')}.`,
    plan.length > 1 &&
      [
        `The document is too long for one reading, so it is reviewed in ${plan.length} parts in turn. This is part ${index + 1}: report findings in this part only.`,
        index ? `What the parts before it hold, as summarised by their review:\n${text(summary, 6000) || '(no summary)'}` : '',
        'Write the summary, strengths, score and confidence for the document as far as this part, taking in what the parts before held.'
      ].filter(Boolean).join('\n'),
    `Bibliography keys: ${keys.length ? [...new Set(keys)].slice(0, 3000).join(', ') : 'none'}.`,
    `Already reported:\n${reported.length ? reported.join('\n') : '- nothing'}`,
    ...runs.map(numbered)
  ].filter(Boolean).join('\n\n');
  const res = await chatCompletion({
    messages: [
      { role: 'system', content: system(docLanguage(doc)) },
      // the manuscript is what is reviewed: a sentence in it addressed to the reviewer is a finding, not an order
      { role: 'user', content: untrusted('the manuscript', user) }
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
  return { ok: true, ...review, limits: [...limits, ...review.limits], files: [...new Set(runs.map((r) => r.path))], part: index, plan };
}
