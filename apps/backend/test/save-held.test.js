import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from '../src/utils/fsUtils.js';

// TeX holds the main file open for its whole compile, sharing it for reading and writing but not deleting, as C's
// fopen does on Windows, so a save can't rename over it
test('a save lands while another program holds the file open, as TeX does during a compile', { skip: process.platform !== 'win32' && 'Windows only' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spectrum-held-'));
  const file = path.join(dir, 'main.tex');
  writeFileSync(file, 'before');
  const holder = spawn('powershell', ['-NoProfile', '-Command',
    `$f = [System.IO.File]::Open('${file.replace(/'/g, "''")}', 'Open', 'Read', 'ReadWrite'); Write-Output held; [Console]::In.ReadLine() | Out-Null; $f.Close()`], { windowsHide: true });
  try {
    await new Promise((resolve, reject) => {
      holder.stdout.on('data', (chunk) => String(chunk).includes('held') && resolve());
      holder.on('error', reject);
      holder.on('exit', () => reject(new Error('the holder ended early')));
    });
    await writeFileAtomic(file, 'typed during the compile');
    assert.equal(readFileSync(file, 'utf8'), 'typed during the compile');
    assert.deepEqual(readdirSync(dir), ['main.tex'], 'no temporary file left behind');
  } finally {
    holder.stdin.end('\n');
    await new Promise((resolve) => holder.exitCode !== null ? resolve() : holder.on('exit', resolve));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});
