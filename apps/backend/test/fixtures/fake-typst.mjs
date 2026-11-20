#!/usr/bin/env node
// A stand-in for Typst for test/typst-watch.test.js: `compile` and `watch` as Spectrum runs them, each start written to
// FAKE_TYPST_LOG as a line of JSON ({ command, pid }). A watch compiles when its main file changes, and hears nothing
// for its first FAKE_TYPST_DEAF_MS (as Typst does while it sets its watches), or never with FAKE_TYPST_DEAF_MS=forever.
// It compiles a tenth of a second after a change, as Typst does. The PDF is the main file's text between a PDF's first and last lines.
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const [command, ...args] = process.argv.slice(2);
appendFileSync(process.env.FAKE_TYPST_LOG, `${JSON.stringify({ command, pid: process.pid })}\n`);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const deps = value('--deps');
// compile … <main> <pdf>; watch … <main> --deps <file> <pdf>
const pdf = args.at(-1);
const main = deps ? args[args.indexOf('--deps') - 1] : args.at(-2);
const build = () => {
  const text = main === '-' ? readFileSync(0, 'utf8') : readFileSync(main, 'utf8');
  if (deps) writeFileSync(deps, JSON.stringify({ inputs: [main] }));
  writeFileSync(pdf, `%PDF-1.4\n${text}\n%%EOF\n`);
};
if (command === 'compile') {
  build();
  process.exit(0);
}
const said = (line) => process.stderr.write(`watching ${main}\nwriting to ${pdf}\n\n[12:00:00] ${line}\n\n`);
const compile = () => {
  said('compiling ...');
  build();
  said('compiled successfully in 1.00 ms');
};
const deaf = process.env.FAKE_TYPST_DEAF_MS === 'forever' ? Infinity : Number(process.env.FAKE_TYPST_DEAF_MS || 0);
// Typst reads the computer's fonts before its first compile
setTimeout(() => {
  compile();
  const started = Date.now();
  let seen = null;
  setInterval(() => {
    const changed = statSync(main).mtimeMs;
    // what changed while it couldn't hear is never compiled
    if (Date.now() < started + deaf || seen === null) return void (seen = changed);
    if (changed === seen) return;
    seen = changed;
    // Typst waits a tenth of a second for more changes before it compiles
    setTimeout(compile, 100);
  }, 20);
}, 150);
