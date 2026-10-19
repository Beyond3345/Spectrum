import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSynctex, parseSynctex } from '../src/services/synctex.js';

test('SyncTeX keeps ANSI and UTF-8 input names in the same Windows file', () => {
  const bytes = Buffer.concat([
    Buffer.from('Input:1:C:/project/résumé.tex\n', 'latin1'),
    Buffer.from('Input:2:C:/project/中文.tex\n', 'utf8'),
    Buffer.from('Content:\n', 'ascii')
  ]);
  const data = parseSynctex(decodeSynctex(bytes, 'windows-1252'));
  assert.equal(data.inputs.get(1), 'C:/project/résumé.tex');
  assert.equal(data.inputs.get(2), 'C:/project/中文.tex');
});
