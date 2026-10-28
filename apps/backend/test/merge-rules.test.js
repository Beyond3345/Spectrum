// The merge rules two copies of a project come back together by (mergeRules.js): which side a file takes, project.json
// and settings.json key by key, chats and research sessions, conflicted copies' names, the rename rule, the deletion
// brake, the checked write and the checkpoint before it. In scratch folders under a throwaway data folder. Run: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'spectrum-merge-rules-')));
process.env.SPECTRUM_DATA_DIR = path.join(tmp, 'data');
process.env.SPECTRUM_PROJECTS_DIR = path.join(tmp, 'projects');
const rules = await import('../src/services/mergeRules.js');
const { conflictCopies } = await import('../src/utils/conflictCopies.js');
const { readVersionFile } = await import('../src/services/versionService.js');

after(() => rmSync(tmp, { recursive: true, force: true }));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('a file takes the side that changed it, a deletion only over an unchanged copy', () => {
  const { decide } = rules;
  assert.equal(decide(null, null, null), 'drop');
  assert.equal(decide('a', 'b', 'b'), 'equal');
  // nothing in common: everything on either side stays
  assert.deepEqual([decide(null, 'a', null), decide(null, null, 'a'), decide(null, 'a', 'b')], ['ours', 'theirs', 'merge']);
  assert.deepEqual([decide('a', 'b', 'a'), decide('a', 'a', 'b'), decide('a', 'b', 'c')], ['ours', 'theirs', 'merge']);
  // deleted here and unchanged there stays deleted; changed there comes back
  assert.deepEqual([decide('a', null, 'a'), decide('a', null, 'b')], ['ours', 'theirs']);
  assert.deepEqual([decide('a', 'a', null), decide('a', 'b', null)], ['theirs', 'ours']);
});

test('project.json and settings.json merge key by key, one level into a group, and keep our id', () => {
  const base = { id: 'p1', name: 'Thesis', tags: ['a'], compile: { engine: 'pdflatex', autoCompile: 0 }, zotero: { collectionKey: 'K1' } };
  const ours = { id: 'p1', name: 'Thesis', tags: ['a', 'mine'], compile: { engine: 'xelatex', autoCompile: 0 }, zotero: { collectionKey: 'K1' } };
  const theirs = { id: 'other', name: 'PhD thesis', tags: ['a'], compile: { engine: 'pdflatex', autoCompile: 2 }, github: { owner: 'o', repo: 'r' } };
  assert.deepEqual(rules.mergeMeta(base, ours, theirs), {
    id: 'p1',
    name: 'PhD thesis',
    tags: ['a', 'mine'],
    compile: { engine: 'xelatex', autoCompile: 2 },
    github: { owner: 'o', repo: 'r' }
  });
  // a group both sides added joins, ours where they differ; settings.json has no id to keep
  assert.deepEqual(rules.mergeMeta({}, { skills: { on: ['x'] } }, { skills: { on: ['y'], off: ['z'] } }), { skills: { on: ['x'], off: ['z'] } });
  // only one level: deeper groups go whole
  assert.deepEqual(rules.mergeMeta({ a: { b: { c: 1, d: 1 } } }, { a: { b: { c: 2, d: 1 } } }, { a: { b: { c: 1, d: 2 } } }), { a: { b: { c: 2, d: 1 } } });
  // LanguageTool's ignored rules, one key each: two computers ignoring different German rules keep both, and one
  // taking a rule back while the other left it takes it back
  const ignoredBase = { languageToolIgnored: { 'de:A': true } };
  assert.deepEqual(rules.mergeMeta(ignoredBase, { languageToolIgnored: { 'de:A': true, 'de:B': true } }, { languageToolIgnored: { 'de:A': true, 'de:C': true } }),
    { languageToolIgnored: { 'de:A': true, 'de:B': true, 'de:C': true } });
  assert.deepEqual(rules.mergeMeta(ignoredBase, { languageToolIgnored: {} }, ignoredBase), { languageToolIgnored: {} });
  // a project's language list changed on both sides keeps this computer's
  assert.deepEqual(rules.mergeMeta({}, { language: { languages: ['en-AU', 'zh-TW'] } }, { language: { languages: ['en-GB'] } }), { language: { languages: ['en-AU', 'zh-TW'] } });
});

test('a chat keeps every message from both sides, and a session every search', () => {
  const m = (content, createdAt) => ({ role: 'user', content, createdAt });
  const theirs = { id: 'c1', messages: [m('hi', '1'), m('there', '2')], updatedAt: '2026-10-01T00:00:00.000Z' };
  const ours = { id: 'c1', messages: [m('hi', '1'), m('here', '3')], updatedAt: '2026-10-01T00:00:00.000Z' };
  const merged = rules.mergeChatFiles(Buffer.from(JSON.stringify(ours)), Buffer.from(JSON.stringify(theirs)));
  assert.deepEqual(JSON.parse(merged.data).messages.map((x) => x.content), ['hi', 'there', 'here']);
  assert.equal(merged.more, true);
  assert.equal(rules.mergeChatFiles(Buffer.from(JSON.stringify(theirs)), Buffer.from(JSON.stringify(theirs))).more, false);
  assert.equal(rules.mergeChatFiles(Buffer.from('{"id":"c1","messages":[]}'), Buffer.from('{"id":"c2","messages":[]}')), null);
  assert.equal(rules.mergeChatFiles(Buffer.from('not json'), Buffer.from(JSON.stringify(theirs))), null);

  const session = (runs, results) => Buffer.from(JSON.stringify({ id: 's1', runs, results, updatedAt: runs.at(-1).at }));
  const both = JSON.parse(rules.mergeSessionFiles(session([{ at: '1' }, { at: '3' }], []), session([{ at: '1' }, { at: '2' }], [])));
  assert.deepEqual(both.runs.map((r) => r.at), ['1', '2', '3']);
  assert.equal(both.updatedAt, '3');
});

test('a conflicted copy is named so the editor’s banner finds it', () => {
  const at = new Date(2026, 9, 18, 10, 42, 33);
  const copy = rules.conflictCopyPath('chapters/intro.tex', 'GitHub', at);
  assert.equal(copy, 'chapters/intro (GitHub’s conflicted copy 2026-10-18 104233).tex');
  assert.equal(rules.conflictCopyPath('Makefile', 'A/B: C', at), 'Makefile (AB C’s conflicted copy 2026-10-18 104233)');
  assert.equal(conflictCopies(['chapters/intro.tex', copy])[copy], 'chapters/intro.tex');
});

test('a path spelt in other letter case on one side is one file, with that side’s spelling', () => {
  const { files, clashes } = rules.respellKeys(['Intro.tex', 'fig/A.pdf', 'same.tex'], ['Intro.tex', 'Fig/A.pdf', 'same.tex'], ['intro.tex', 'fig/A.pdf', 'Café.tex']);
  // they renamed it: theirs; we renamed it: ours
  assert.equal(files.get('intro.tex').rel, 'intro.tex');
  assert.equal(files.get('fig/a.pdf').rel, 'Fig/A.pdf');
  assert.deepEqual(files.get('intro.tex'), { base: 'Intro.tex', ours: 'Intro.tex', theirs: 'intro.tex', rel: 'intro.tex' });
  // only one side: as it is; another Unicode form is the same name, spelt composed (NFC), which NTFS needs
  assert.equal(files.get('café.tex').rel, 'Café.tex');
  assert.equal(rules.respellKeys([], ['Café.tex'], ['Café.tex']).files.get('café.tex').rel, 'Café.tex');
  assert.equal(rules.respellKeys(['Café.tex'], ['Café.tex'], ['Café.tex']).files.get('café.tex').rel, 'Café.tex', 'a Windows pull renames the Mac’s old decomposed name');
  // no base, both spelt it: ours
  assert.equal(rules.respellKeys([], ['A.tex'], ['a.tex']).files.get('a.tex').rel, 'A.tex');
  assert.deepEqual(clashes, []);
  assert.deepEqual(rules.respellKeys([], ['a.tex', 'A.tex'], []).clashes, [['a.tex', 'A.tex']]);
});

test('a .bib both sides added entries to keeps both, and one entry changed on both sides still conflicts', () => {
  const b = Buffer.from('@article{a,\n  title = {A}\n}\n');
  const ours = Buffer.from(`${b}\n@article{mine,\n  title = {Mine}\n}\n`);
  const theirs = Buffer.from(`${b}\n@article{new1,\n  title = {New 1}\n}\n\n@article{new2,\n  title = {New 2}\n}\n`);
  assert.equal(rules.mergeBibFiles(b, ours, theirs).toString(), `${ours}\n@article{new1,\n  title = {New 1}\n}\n\n@article{new2,\n  title = {New 2}\n}\n`);
  // nothing only theirs has, or the same entry changed on both sides
  assert.equal(rules.mergeBibFiles(b, ours, ours), null);
  assert.equal(rules.mergeBibFiles(b, Buffer.from('@article{a,\n  title = {A, ours}\n}\n'), Buffer.from('@article{a,\n  title = {A, theirs}\n}\n@article{n,\n  title = {N}\n}\n')), null);
});

test('deleting many files at once needs asking, counted over all and over the user’s own', () => {
  const files = (n, dir = '') => Array.from({ length: n }, (_, i) => `${dir}f${i}.tex`);
  assert.equal(rules.deletionBrake(files(5), files(5)), 0);
  assert.equal(rules.deletionBrake(files(6), files(20)), 6);
  assert.equal(rules.deletionBrake(files(6), files(30)), 0);
  // six of the user's ten files among a long history still trips it
  assert.equal(rules.deletionBrake(files(6), [...files(10), ...files(100, '.spectrum/history/')]), 6);
});

test('a file is written whole, and only while it still holds what was checked', async () => {
  const root = path.join(tmp, 'place');
  await fs.mkdir(root);
  assert.ok(await rules.placeIfUnchanged(root, 'a/b/new.tex', 'one', null));
  assert.equal(await fs.readFile(path.join(root, 'a', 'b', 'new.tex'), 'utf8'), 'one');
  // something else landed there: left alone
  assert.equal(await rules.placeIfUnchanged(root, 'a/b/new.tex', 'two', null), null);
  assert.equal(await rules.placeIfUnchanged(root, 'a/b/new.tex', 'two', sha('other')), null);
  assert.ok(await rules.placeIfUnchanged(root, 'a/b/new.tex', 'two', sha('one')));
  assert.equal(await fs.readFile(path.join(root, 'a', 'b', 'new.tex'), 'utf8'), 'two');
  assert.deepEqual((await fs.readdir(path.join(root, 'a', 'b'))), ['new.tex']);
  // a project folder gone meanwhile isn't made again
  await assert.rejects(rules.placeIfUnchanged(path.join(tmp, 'gone'), 'x/y.tex', 'z', null), { code: 'ENOENT' });
});

test('the checkpoint before a pull holds the files as they were', async () => {
  const root = path.join(tmp, 'keep');
  await fs.mkdir(path.join(root, '.spectrum'), { recursive: true });
  await fs.writeFile(path.join(root, '.spectrum', 'project.json'), JSON.stringify({ id: 'k1', name: 'Keep' }));
  await fs.writeFile(path.join(root, 'main.tex'), 'before\n');
  const { version, files } = await rules.keepBefore(root, 'Before pull from GitHub');
  assert.equal(version.label, 'Before pull from GitHub');
  assert.ok(files['main.tex']);
  assert.equal((await readVersionFile(root, version.id, 'main.tex')).content, 'before\n');
  // nothing changed since: the same checkpoint
  assert.equal((await rules.keepBefore(root, 'Before pull from GitHub')).version.id, version.id);
});
