import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Only inspect the assets the caller expects; a damaged manifest cannot request other files.
export async function inspectCheckerAssets(dir, manifestFile, files) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, manifestFile), 'utf8'));
    if (manifest.schema !== 1 || typeof manifest.version !== 'string' || !manifest.version || !manifest.files) throw new Error('Invalid manifest');
  } catch {
    return { version: null, integrity: 'unknown', manifest: null, warnings: ['Build information is missing or unreadable. Reinstall Spectrum or rebuild this checker.'] };
  }
  const warnings = [];
  for (const file of files) {
    try {
      const expected = manifest.files[file];
      if (!/^[a-f0-9]{64}$/.test(expected || '') || sha256(await fs.readFile(path.join(dir, file))) !== expected) warnings.push(`${file} does not match its build information.`);
    } catch {
      warnings.push(`${file} is missing or unreadable.`);
    }
  }
  return { version: warnings.length ? null : manifest.version, integrity: warnings.length ? 'mismatch' : 'verified', manifest, warnings };
}

export const HARPER_FILES = ['harper_wasm.js', 'harper_wasm_bg.wasm', 'LICENSE'];
export const DICTIONARY_FILES = ['en_AU/en_AU.aff', 'en_AU/en_AU.dic', 'en_AU/LICENSE', 'en_US/en_US.aff', 'en_US/en_US.dic', 'en_US/LICENSE', 'aussiedic/AussieDic.aff', 'aussiedic/AussieDic.dic', 'aussiedic/LICENSE', 'spectrum-extra.dic'];
