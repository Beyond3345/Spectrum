#!/usr/bin/env node
// Copies the xjyutping package (Cantonese Jyutping for XeLaTeX and LuaLaTeX), which the app ships, into vendor/xjyutping:
//   node scripts/xjyutping.mjs [folder]     (npm run xjyutping:sync)
// from the folder given, else $XJYUTPING_DIR, else ../../xjyutping/xjyutping-tex beside the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XJYUTPING_FILES = ['xjyutping.sty', 'xjyutping.lua', 'xjyutping-chars.def', 'xjyutping-words.def', 'xjyutping-simp.def'];
const from = path.resolve(process.argv[2] || process.env.XJYUTPING_DIR || path.join(root, '..', '..', 'xjyutping', 'xjyutping-tex'));
const to = path.join(root, 'vendor', 'xjyutping');

const missing = [...XJYUTPING_FILES, 'LICENSE'].filter((file) => !fs.existsSync(path.join(from, file)));
if (missing.length) {
  console.error(`${from} has no ${missing.join(', ')}`);
  process.exit(1);
}
fs.mkdirSync(to, { recursive: true });
for (const file of [...XJYUTPING_FILES, 'LICENSE']) fs.copyFileSync(path.join(from, file), path.join(to, file));
const version = fs.readFileSync(path.join(to, 'xjyutping.sty'), 'utf8').match(/\\ProvidesExplPackage\s*\{xjyutping\}\s*\{([^}]*)\}\s*\{([^}]*)\}/);
console.log(`xjyutping ${version?.[2] ?? '(no version)'} (${version?.[1] ?? '?'}) from ${from} → ${path.relative(root, to)}`);
