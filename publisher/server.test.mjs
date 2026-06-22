import test from 'node:test';
import assert from 'node:assert/strict';
import { getNote, listNotes, normalizeWikiLinks, previewNote } from './server.mjs';

test('lists Claudian notes without exposing published content', async () => {
  const notes = await listNotes();
  assert.ok(notes.some((note) => note.path.includes('博弈论')));
  assert.ok(notes.every((note) => !note.path.startsWith('published/')));
  assert.ok(notes.every((note) => !note.path.startsWith('.claudian/')));
});

test('derives metadata and renders math preview safely', async () => {
  const path = '小辰刚学gcd/右端点固定的区间gcd种类数.md';
  const note = await getNote(path);
  assert.match(note.metadata.title, /gcd/i);
  const preview = await previewNote(path, note.metadata);
  assert.match(preview.html, /class="katex/);
  assert.doesNotMatch(preview.html, /<script/i);
});

test('finds recursive dependencies and flattens folder-qualified Wiki Links', async () => {
  const note = await getNote('博弈论/博弈论基础_Nim与SG.md');
  assert.ok(note.dependencies.length >= 7);
  assert.equal(note.unresolved.length, 0);
  assert.equal(
    normalizeWikiLinks('参见 [[博弈论/SG值的定义与mex运算|SG 值]] 与 ![[diagrams/sg.png]]'),
    '参见 [[SG值的定义与mex运算|SG 值]] 与 ![[diagrams/sg.png]]',
  );
});
