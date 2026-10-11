// Harper's own thread: building its dictionary and linting a long chapter would otherwise hold up
// every other request. One linter, kept warm between checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

const dir = join(workerData.nativeDir, 'harper');
const harper = await import(pathToFileURL(join(dir, 'harper_wasm.js')).href);
harper.initSync({ module: readFileSync(join(dir, 'harper_wasm_bg.wasm')) });
const linter = harper.Linter.new(harper.Dialect.Australian);

// spelling belongs to the spell checker; LaTeX source is full of spacing that means nothing
const BASE = { SpellCheck: false, Spaces: false, NoFrenchSpaces: false };
let configured = '';

parentPort.on('message', ({ id, text, oxford, markdown }) => {
  try {
    if (oxford !== configured) {
      linter.set_lint_config_from_json(JSON.stringify({ ...BASE, OxfordComma: oxford === 'require', NoOxfordComma: oxford === 'avoid' }));
      configured = oxford;
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
