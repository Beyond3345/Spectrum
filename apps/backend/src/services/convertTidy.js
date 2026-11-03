import path from 'path';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import { SKILLS_SEED_DIR } from '../config/constants.js';
import { maskLatex, maskTypst, proseWords } from '../latex/mask.js';
import { chatCompletion, resolveLLMConfig } from './llmService.js';
import { loadSkill, readFrontMatter } from './skillService.js';
import { createVersion } from './versionService.js';
import { compileFolder } from './compileService.js';
import { writeFileWithSnapshot } from './transferAgent/utils.js';
import { maskComments, mathSpans } from './convert/latexRead.js';
import { KIND_NAMES, MARKER } from './convert/regions.js';

// The optional AI tidying of a converted project, as section 9 of docs/featureResearch/LATEX_TYPST_CONVERSION.md
// designs it for weak models: one flagged region per request, the skill's checklist and the region's rule card as the
// system message, an answer of exactly one <<<REPLACE rN … >>> block or SKIP rN, and Spectrum's own checks on every
// answer before anything reaches a file. The model never sees or rewrites anything outside its region.

export const MAX_REGIONS = 20;
export const MAX_ANSWERS = 3;
// ponytail: Settings has no token limit, so a fixed one for a run, counted as characters / 4; the route takes another
export const TOKEN_LIMIT = 150_000;
const SKILL = 'spectrum-convert-tidy';

// ─── The prompt ───

/** The skill's checklist and rule cards: { checklist, cards: Map(heading → text) }. */
export async function skillParts() {
  const body = await loadSkill(SKILL).then((s) => s.body, async () => readFrontMatter(await fs.readFile(path.join(SKILLS_SEED_DIR, SKILL, 'SKILL.md'), 'utf8')).body);
  const section = (title) => new RegExp('^## ' + title + '\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))', 'm').exec(body)?.[1].trim() ?? '';
  const cards = new Map([...section('Rule cards').matchAll(/^### (.+)\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)].map((m) => [m[1].trim(), m[2].trim()]));
  return { checklist: section('Checklist before you answer'), cards };
}

/** The system message for a region: the checklist and the one rule card for its kind and direction, or null for none. */
export function systemMessage(skill, kind, to) {
  const card = skill.cards.get(kind + ' (' + (to === 'typst' ? 'LaTeX to Typst' : 'Typst to LaTeX') + ')') ?? skill.cards.get(kind + ' (both directions)');
  return card ? '## Checklist before you answer\n\n' + skill.checklist + '\n\n## Rule card: ' + kind + '\n\n' + card : null;
}

/** The user message of section 9.7, with the last answer's fault at the top on a retry. */
export function userMessage(region, converted, to, fault) {
  const [from, target] = to === 'typst' ? ['LaTeX', 'Typst'] : ['Typst', 'LaTeX'];
  return [
    ...(fault ? ['Your last answer was not used: ' + fault + ' Try again.', ''] : []),
    'Region ' + region.id + ', kind ' + region.kind + '. Rewrite the CONVERTED text so it matches the ORIGINAL’s layout,',
    'following the rule card. Keep every word, label, reference and citation exactly.',
    '',
    'ORIGINAL (' + from + '):',
    region.original,
    '',
    'CONVERTED (' + target + '), the only text you may change:',
    converted,
    '',
    'Answer with exactly one block:',
    '<<<REPLACE ' + region.id,
    'the new text',
    '>>>',
    'or the line: SKIP ' + region.id
  ].join('\n');
}

// ─── The checks of section 9.4 ───

/** Check 1, the form of the answer: { skip }, { text } or { fault }, one sentence for the model. */
export function readAnswer(answer, id) {
  const text = String(answer ?? '').trim();
  const skip = /^SKIP\s+(\S+)$/.exec(text);
  if (skip) return skip[1] === id ? { skip: true } : { fault: 'The answer must be for ' + id + ', not ' + skip[1] + '.' };
  const blocks = [...text.matchAll(/<<<REPLACE[ \t]+(\S+)[ \t]*\n([\s\S]*?)\n?>>>/g)];
  if (blocks.length !== 1) return { fault: 'Answer with exactly one <<<REPLACE ' + id + ' ... >>> block, or SKIP ' + id + '. You gave ' + blocks.length + '.' };
  const [whole, name, body] = blocks[0];
  if (name !== id) return { fault: 'The block must be for ' + id + ', not ' + name + '.' };
  if (whole !== text) return { fault: 'Answer with the block alone, with nothing before or after it.' };
  if (MARKER.test(body)) return { fault: 'Leave out the spectrum:region marker lines.' };
  return { text: body.replace(/\s+$/, '') };
}

const tally = (list) => [...list].sort().join('\n');

/** What the checks compare in a region of Typst: its words, labels, references and citations, maths and settings. */
function typstFacts(text) {
  // comments and raw text, and the path of an #import or #include, where nothing is a label or a reference
  const bare = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  const code = bare.replace(/#(?:import|include)\s+"[^"\n]*"/g, ' ').replace(/\\[\\$@<]/g, ' ');
  const maths = [...code.matchAll(/\$(?:[^$\\]|\\.)*\$/g)].map((m) => m[0].replace(/\s+/g, ' '));
  const prose = code.replace(/\$(?:[^$\\]|\\.)*\$/g, ' ');
  return {
    words: proseWords(maskTypst(text)).map(([w]) => w),
    labels: [...prose.matchAll(/(?<![(\w])<([A-Za-z0-9_:.-]+)>/g)].map((m) => m[1]),
    refs: [...prose.matchAll(/(?<![\p{L}\p{N}\\])@([A-Za-z0-9_:.-]*[A-Za-z0-9_-])|\(<([A-Za-z0-9_:.-]+)>/gu)].map((m) => m[1] ?? m[2]),
    maths,
    settings: [...bare.matchAll(/#\s*(?:import|include|set|show)\b[^\n]*/g)].map((m) => m[0].trim())
  };
}

/** The same for LaTeX, its words line by line: a {…} on the next line is no argument of the command before. */
function latexFacts(text) {
  const code = maskComments(text);
  return {
    words: code.split('\n').flatMap((line) => proseWords(maskLatex(line)).map(([w]) => w)),
    labels: [...code.matchAll(/\\label\s*\{([^}]*)\}/g)].map((m) => m[1].trim()),
    refs: [...code.matchAll(/\\(?:[cC]ref|ref|eqref|autoref|pageref|vref|nameref|labelcref|[A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\s*\[[^\]]*\])*\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((k) => k.trim())),
    maths: mathSpans(code).map(([s, e]) => code.slice(s, e).replace(/\s+/g, ' ')),
    settings: [...code.matchAll(/\\(?:usepackage|RequirePackage|documentclass|(?:re)?newcommand|providecommand|def|(?:re)?newenvironment|DeclareMathOperator|geometry|hypersetup|pagestyle|setmainfont|setsansfont|usetikzlibrary|sisetup|input|include|makeatletter)(?![A-Za-z])[^\n]*|\\(?:begin|end)\s*\{document\}/g)].map((m) => m[0].trim())
  };
}

/**
 * Every word of a region's source, its commands' arguments too (\fbox{Reset}, #kbd("Ctrl")), which a replacement may
 * bring back: the words of the text with only commands, comments and brackets taken out.
 */
const sourceWords = (original, to) => {
  const text = to === 'typst'
    ? maskComments(original).replace(/\\[A-Za-z@]+\*?/g, ' ')
    : original.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1').replace(/#[A-Za-z_][\w.-]*/g, ' ').replace(/[A-Za-z_][\w-]*\s*:/g, ' ');
  return proseWords(text.replace(/[{}[\]()"#$\\]/g, ' ')).map(([w]) => w);
};

/** Each word's count. */
const counts = (words) => words.reduce((m, w) => m.set(w, (m.get(w) ?? 0) + 1), new Map());

/**
 * Checks 2 to 5 of a replacement (after) for the region's converted text (before), whose source is original: the
 * fault, one sentence for the model, or null.
 */
export function checkReplacement(before, after, to, original = '') {
  const facts = to === 'typst' ? typstFacts : latexFacts;
  const [a, b] = [facts(before), facts(after)];
  // every word kept, in any order (a CV header's two sides come one after the other in LaTeX, line by line side by
  // side as converted); a word added only where the original has it, as the converter loses some (\fbox{Reset})
  const [had, has, source] = [counts(a.words), counts(b.words), counts(sourceWords(original, to))];
  if ([...had].some(([w, n]) => (has.get(w) ?? 0) < n) || [...has].some(([w, n]) => n > Math.max(had.get(w) ?? 0, source.get(w) ?? 0))) {
    return 'The words changed. Keep every word of the region, and add none that the ORIGINAL does not have.';
  }
  if (tally(a.labels) !== tally(b.labels)) return 'The labels changed. Keep every label exactly as it was.';
  if (tally(a.refs) !== tally(b.refs)) return 'A reference or citation was added or removed. Keep every one exactly as it was.';
  if (tally(a.maths) !== tally(b.maths)) return 'The maths changed. Keep every piece of maths exactly as it was.';
  // only what the region already had, such as a long table's #show rule
  const settings = [...a.settings];
  if (b.settings.some((s) => (settings.includes(s) ? !settings.splice(settings.indexOf(s), 1) : true))) {
    return to === 'typst' ? 'Do not add #import, #include, #set page, #set text, #set document or any #set or #show rule.' : 'Do not add \\usepackage or any other preamble command.';
  }
  if (after.length > 3 * before.length + 200) return 'The answer is too long. Keep it about as long as the region.';
  return null;
}

// ─── A region in its file ───

/** The region id in text: { start, end } (its marker lines), indent and its text without that indent, or null. */
export function regionAt(text, id) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp('^\\s*(?://|%) spectrum:region ' + id + ' start kind=[a-z-]+\\s*$').test(l));
  const end = lines.findIndex((l, i) => i > start && new RegExp('^\\s*(?://|%) spectrum:region ' + id + ' end\\s*$').test(l));
  if (start === -1 || end === -1) return null;
  const indent = /^\s*/.exec(lines[start])[0];
  return { start, end, indent, text: lines.slice(start + 1, end).map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart())).join('\n') };
}

/** text with the region's lines between its markers replaced by body, at the markers' indent. */
export function replaceRegion(text, at, body) {
  const lines = text.split('\n');
  return [...lines.slice(0, at.start + 1), ...body.split('\n').map((l) => (l ? at.indent + l : l)), ...lines.slice(at.end)].join('\n');
}

/** text with a comment line above the region's start marker. */
const commentAbove = (text, at, comment) => {
  const lines = text.split('\n');
  return [...lines.slice(0, at.start), at.indent + comment, ...lines.slice(at.start)].join('\n');
};

/** The errors of a compile of dir: Typst's diagnostics, or LaTeX's ! and file:line: lines. */
export async function compileErrors(dir, mainFile, engine) {
  // spectrumPackages: packages go to Spectrum's own cache, not a typst-packages folder in the user's home
  const result = await compileFolder({ root: dir, mainFile, engine, spectrumPackages: true }).catch((err) => ({ ok: false, error: err.message }));
  const errors = result.errors
    ? result.errors.filter((e) => e.severity === 'error').map((e) => e.message.split('\n')[0])
    : [...String(result.log ?? '').matchAll(/^(?:! |error: )(.*)$/gm)].map((m) => m[1].trim());
  if (!result.ok && !errors.length) errors.push(result.error || 'No PDF was produced.');
  return errors;
}

// ─── The run ───

/**
 * Tidies the regions of a converted project at root, in order, at most MAX_REGIONS and tokenLimit: each answer is
 * checked, its compile in scratch (a copy of the project) first, and only then written to root with
 * writeFileWithSnapshot, after a checkpoint made before the first. A region whose answers all fail, or that the model
 * skips, keeps the converter's text with a TODO comment above it. recheck(dir) runs the conversion's checks again
 * after the last region; when they come out worse than before (the conversion's checks), every edit is undone.
 * conversion/notes.md gets a section on the run. Returns { regions: [{ id, kind, file, result, answers, fault }],
 * left, changes: [{ filePath, original, proposed }], error }.
 */
export async function tidyRegions({ root, scratch, mainFile, to, engine = 'auto', regions, llmConfig, before, recheck, tokenLimit = TOKEN_LIMIT, onStep = () => {} }) {
  const skill = await skillParts();
  const config = resolveLLMConfig(llmConfig);
  const jobId = 'convert-tidy-' + crypto.randomUUID();
  const comment = to === 'typst' ? '//' : '%';
  const read = (rel) => fs.readFile(path.join(root, rel), 'utf8');
  const write = async (rel, text) => {
    await fs.writeFile(path.join(scratch, rel), text);
    await writeFileWithSnapshot(root, rel, text, jobId);
  };
  const originals = new Map();
  for (const r of regions) if (!originals.has(r.file)) originals.set(r.file, await read(r.file));
  await createVersion(root, { reason: 'before-ai', label: 'Before AI tidying' });

  const outcomes = [];
  const count = Math.min(regions.length, MAX_REGIONS);
  let tokens = 0;
  let error = null;
  let errors = await compileErrors(scratch, mainFile, engine);
  for (const region of regions.slice(0, count)) {
    if (error || tokens >= tokenLimit) break;
    onStep('Tidying (' + (outcomes.length + 1) + ' of ' + count + ' regions)');
    const outcome = { id: region.id, kind: region.kind, file: region.file, result: 'kept', answers: 0, fault: null };
    outcomes.push(outcome);
    const text = await read(region.file);
    const at = regionAt(text, region.id);
    const system = systemMessage(skill, region.kind, to);
    if (!at || !system) {
      outcome.fault = at ? 'There is no rule card for this kind of region.' : 'Its markers are no longer in the file.';
      continue;
    }
    while (outcome.answers < MAX_ANSWERS && tokens < tokenLimit) {
      const messages = [{ role: 'system', content: system }, { role: 'user', content: userMessage(region, at.text, to, outcome.fault) }];
      const reply = await chatCompletion({ ...config, messages, temperature: 0, reasoningEffort: 'fast' });
      if (!reply.ok) {
        error = reply.error;
        break;
      }
      outcome.answers += 1;
      tokens += Math.ceil((system.length + messages[1].content.length + reply.message.content.length) / 4);
      const answer = readAnswer(reply.message.content, region.id);
      if (answer.skip) {
        outcome.result = 'skipped';
        break;
      }
      outcome.fault = answer.fault ?? checkReplacement(at.text, answer.text, to, region.original);
      if (outcome.fault) continue;
      // check 6, in the copy: no error that was not there before
      const next = replaceRegion(text, at, answer.text);
      await fs.writeFile(path.join(scratch, region.file), next);
      const now = await compileErrors(scratch, mainFile, engine);
      const left = [...errors];
      const added = now.filter((e) => (left.includes(e) ? !left.splice(left.indexOf(e), 1) : true));
      if (added.length) {
        outcome.fault = 'It does not compile: ' + added[0];
        await fs.writeFile(path.join(scratch, region.file), text);
        continue;
      }
      errors = now;
      await writeFileWithSnapshot(root, region.file, next, jobId);
      Object.assign(outcome, { result: 'replaced', fault: null });
      break;
    }
  }

  // check 7: the whole document again; worse than the conversion was, and nothing the model wrote is kept
  let undone = false;
  if (outcomes.some((o) => o.result === 'replaced') && recheck) {
    const after = await recheck(scratch).catch(() => null);
    if (!after || (before?.ok && !after.ok) || (before?.compiles && !after.compiles)) {
      undone = true;
      for (const [rel, text] of originals) if ((await read(rel)) !== text) await write(rel, text);
      for (const o of outcomes) if (o.result === 'replaced') Object.assign(o, { result: 'kept', fault: 'With every edit in, the document no longer passed Spectrum’s checks, so none was kept.' });
    }
  }
  // the converter's text stays, with a TODO comment above it unless it already has one
  for (const o of outcomes) {
    if (o.result === 'replaced') continue;
    const text = await read(o.file);
    const at = regionAt(text, o.id);
    if (!at || at.text.includes('TODO(spectrum)')) continue;
    const why = o.result === 'skipped' ? 'the AI model left it as converted' : 'the AI model’s answers were not used';
    await write(o.file, commentAbove(text, at, comment + ' TODO(spectrum): check this ' + KIND_NAMES[o.kind] + ' by hand; ' + why + '.'));
  }

  const left = regions.length - outcomes.length;
  await writeTidyNotes(root, { model: config.model, outcomes, left, error, undone, jobId });
  const changes = [];
  for (const [rel, original] of originals) {
    const proposed = await read(rel);
    if (proposed !== original) changes.push({ filePath: rel, original, proposed });
  }
  return { regions: outcomes, left, changes, ...(error && { error }) };
}

/** The AI tidying's section of conversion/notes.md, and its outcome in the conversion record. */
async function writeTidyNotes(root, { model, outcomes, left, error, undone, jobId }) {
  const answers = (n) => n + ' answer' + (n === 1 ? '' : 's');
  const line = (o) => '- ' + o.id + ' (' + KIND_NAMES[o.kind] + ', ' + o.file + '): '
    + (o.result === 'replaced' ? 'tidied, after ' + answers(o.answers) + '.' : o.result === 'skipped' ? 'the model answered SKIP, so it is as converted.' : 'kept as converted' + (o.answers ? ' after ' + answers(o.answers) : '') + (o.fault ? '. ' + o.fault : '.'));
  const text = [
    '',
    '## AI tidying',
    '',
    'The AI model (' + model + ') was asked to tidy ' + outcomes.length + ' of the flagged regions, one at a time. Spectrum checked every answer (its form, words, labels, references, citations, maths and settings, and that the document still compiles) before using it. The checkpoint “Before AI tidying” has the document as converted, and .spectrum/agent-runs/' + jobId + ' each file before an edit. Spectrum shows the edits for review after converting, and one rejected there goes back to the converted text.',
    '',
    ...outcomes.map(line),
    ...(undone ? ['', 'With every edit in, the document no longer passed the checks it passed when converted, so all of them were undone.'] : []),
    ...(error ? ['', 'The run stopped: ' + error] : []),
    ...(left ? ['', left + ' flagged region' + (left === 1 ? ' was' : 's were') + ' left as converted: a run tidies at most ' + MAX_REGIONS + ' regions and stops at its token limit.'] : []),
    ''
  ].join('\n');
  const notes = path.join(root, 'conversion', 'notes.md');
  await fs.appendFile(notes, text);
  const recordFile = path.join(root, '.spectrum', 'conversion.json');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8').catch(() => 'null'));
  if (record) await fs.writeFile(recordFile, JSON.stringify({ ...record, tidy: { model, regions: outcomes, left } }, null, 2) + '\n');
}
