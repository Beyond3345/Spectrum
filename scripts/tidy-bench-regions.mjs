#!/usr/bin/env node
// Builds the tidy benchmark's regions from its source documents, with the converter itself:
//   SPECTRUM_PANDOC=<pandoc 3.12.1> node scripts/tidy-bench-regions.mjs
// Each case in apps/backend/test/fixtures/tidy-bench/cases.json is one small LaTeX or Typst document whose region sits
// between two plain paragraphs, "Region starts here." and "Region ends here.". The converter turns the document into
// the other format in a throwaway folder, and the region the converter marked (spectrum:region) between the same two
// paragraphs of its output is the case's region. A case whose conversion fails its checks, or that has no such region,
// more than one or one of another kind, stops the build. The result is regions.json beside cases.json. Throwaway
// folders only; no model is called.
import { existsSync, mkdirSync, mkdtempSync, promises as fs, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bench = path.join(repo, 'apps', 'backend', 'test', 'fixtures', 'tidy-bench');
const START = 'Region starts here.';
const END = 'Region ends here.';

const cases = JSON.parse(await fs.readFile(path.join(bench, 'cases.json'), 'utf8'));
const unlisted = (await fs.readdir(path.join(bench, 'cases'))).filter((f) => !cases.some((c) => f === c.id + '.tex' || f === c.id + '.typ'));
if (unlisted.length) {
  console.error('cases.json has no entry for ' + unlisted.join(', '));
  process.exit(1);
}
const pandoc = [process.env.SPECTRUM_PANDOC, path.join(repo, 'data', 'engines', 'pandoc', 'pandoc' + (process.platform === 'win32' ? '.exe' : ''))].find((file) => file && existsSync(file));
if (!pandoc) {
  console.error('Needs pandoc: download it in Settings › Engines › Markdown, or set SPECTRUM_PANDOC.');
  process.exit(1);
}
const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-tidy-bench-')));
Object.assign(process.env, { SPECTRUM_DATA_DIR: path.join(tmp, 'data'), SPECTRUM_PROJECTS_DIR: path.join(tmp, 'projects'), SPECTRUM_TEMPLATE_DIR: path.join(tmp, 'templates'), SPECTRUM_TEMPLATE_SEED_DIR: '' });
mkdirSync(path.join(tmp, 'data', 'engines', 'pandoc'), { recursive: true });
symlinkSync(pandoc, path.join(tmp, 'data', 'engines', 'pandoc', path.basename(pandoc)));
const { latexToTypst, typstToLatex } = await import('../apps/backend/src/services/convertService.js');
const { regionAt } = await import('../apps/backend/src/services/convertTidy.js');

/** The lines strictly between the two marker paragraphs, without the blank lines at either end. */
function between(text, where) {
  const lines = text.split('\n');
  const from = lines.findIndex((l) => l.trim() === START);
  const to = lines.findIndex((l, i) => i > from && l.trim() === END);
  if (from === -1 || to === -1) throw new Error(where + ': the region’s marker paragraphs are missing');
  // line numbers count from 1, as the converter's notes do
  return { text: lines.slice(from + 1, to).join('\n').replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, ''), from: from + 1, to: to + 1 };
}

const regions = [];
let failed = 0;
try {
  for (const c of cases) {
    const latex = c.direction === 'latex-to-typst';
    const root = path.join(tmp, c.id, 'source');
    const out = path.join(tmp, c.id, 'out');
    mkdirSync(root, { recursive: true });
    mkdirSync(out);
    const source = await fs.readFile(path.join(bench, 'cases', c.id + (latex ? '.tex' : '.typ')), 'utf8');
    const main = latex ? 'main.tex' : 'main.typ';
    await fs.writeFile(path.join(root, main), source);
    await fs.copyFile(path.join(bench, 'refs.bib'), path.join(root, 'refs.bib'));
    try {
      const result = await (latex ? latexToTypst : typstToLatex)(root, main, out, {});
      if (!result.checks.ok) throw new Error('the conversion failed its checks: ' + JSON.stringify(result.checks).slice(0, 400));
      const document = await fs.readFile(path.join(out, result.mainFile), 'utf8');
      const original = between(source, c.id + ' (source)');
      const converted = between(document, c.id + ' (converted)');
      // the converter's own region between the two paragraphs (between() counts lines from 1, regionAt from 0)
      const found = result.record.regions.filter((r) => r.file === result.mainFile).map((r) => ({ r, at: regionAt(document, r.id) })).filter(({ at }) => at && at.start >= converted.from && at.end < converted.to - 1);
      if (!found.length) throw new Error('the converter flags nothing between the paragraphs');
      if (found.length > 1) throw new Error(found.length + ' regions between the paragraphs');
      const [{ r, at }] = found;
      if (r.kind !== c.kind) throw new Error('flagged as ' + r.kind + ', not ' + c.kind);
      // the converter's notes for the region's lines, and those with no line at all
      const notes = result.notes.filter((n) => n.line === null || (n.line >= original.from && n.line <= original.to)).map((n) => n.text);
      regions.push({ id: c.id, region: r.id, kind: c.kind, direction: c.direction, difficulty: c.difficulty, original: r.original, converted: at.text, good: c.good, notes, document });
      console.log('ok   ' + c.id);
    } catch (err) {
      failed += 1;
      console.error('FAIL ' + c.id + ': ' + err.message);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (failed) {
  console.error(failed + ' case' + (failed === 1 ? '' : 's') + ' failed; regions.json was not written.');
  process.exit(1);
}
await fs.writeFile(path.join(bench, 'regions.json'), JSON.stringify(regions, null, 2) + '\n');
console.log(regions.length + ' regions written to ' + path.relative(repo, path.join(bench, 'regions.json')));
