// Harper's own thread: building its dictionary and linting a long chapter would otherwise hold up
// every other request. One linter per English dialect in use, each kept warm between checks.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

const dir = join(workerData.nativeDir, 'harper');
const harper = await import(pathToFileURL(join(dir, 'harper_wasm.js')).href);
harper.initSync({ module: readFileSync(join(dir, 'harper_wasm_bg.wasm')) });

// spelling belongs to the spell checker; LaTeX source is full of spacing that means nothing
const BASE = { SpellCheck: false, Spaces: false, NoFrenchSpaces: false };

// Spectrum's supplement (TeX names, research terms), and the Australian one for Australian English only. Since
// 3.0 Harper matches words by case, so each goes in as written there (LaTeX, arXiv, Medicare).
const dicWords = (name) => {
  const file = join(workerData.dictDir || '', name);
  if (!workerData.dictDir || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').slice(1).map((line) => line.split('/')[0].trim()).filter(Boolean);
};
const SUPPLEMENT = dicWords('spectrum-extra.dic');
const SUPPLEMENT_AU = dicWords('spectrum-extra-au.dic');

/** One linter per dialect, made on first use. Each keeps its own config and words, re-applied when they change. */
const linters = new Map();
function linterFor(dialect) {
  const name = Object.hasOwn(harper.Dialect, dialect) && Number.isInteger(harper.Dialect[dialect]) ? dialect : 'Australian';
  let entry = linters.get(name);
  if (!entry) {
    entry = { linter: harper.Linter.new(harper.Dialect[name]), configured: null, words: null, dialect: name };
    linters.set(name, entry);
  }
  return entry;
}

parentPort.on('message', ({ id, text, oxford, markdown, dialect, words = [] }) => {
  try {
    const entry = linterFor(dialect);
    const { linter } = entry;
    if (oxford !== entry.configured) {
      linter.set_lint_config_from_json(JSON.stringify({ ...BASE, OxfordComma: oxford === 'require', NoOxfordComma: oxford === 'avoid' }));
      entry.configured = oxford;
    }
    // the user's and the project's words; a change rebuilds the linter's dictionary, so only then
    const wanted = [...new Set([...SUPPLEMENT, ...(entry.dialect === 'Australian' ? SUPPLEMENT_AU : []), ...words.map(String)])].sort();
    const key = wanted.join('\n');
    if (key !== entry.words) {
      if (entry.words !== null) linter.clear_words();
      linter.import_words(wanted);
      entry.words = key;
    }
    const issues = [];
    for (const group of linter.organized_lints(text, markdown ? harper.Language.Markdown : harper.Language.Plain, false, undefined, true, false)) {
      for (const lint of group.lints) {
        const span = lint.span();
        issues.push({
          rule: group.group,
          kind: lint.lint_kind(),
          from: span.start,
          to: span.end,
          message: lint.message(),
          suggestions: lint.suggestions().map((s) => {
            const out = { kind: ['replace', 'remove', 'insertAfter'][s.kind()] || 'replace', text: s.get_replacement_text() };
            s.free();
            return out;
          })
        });
        span.free();
        lint.free();
      }
      group.free();
    }
    parentPort.postMessage({ id, result: issues });
  } catch (err) {
    parentPort.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
});
parentPort.postMessage({ ready: true });
