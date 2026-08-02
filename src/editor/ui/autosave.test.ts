import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutosave } from './autosave.ts';

test('no autosave when not dirty', () => {
  assert.equal(shouldAutosave({ slug: 'a', title: 't', dirty: false }), false);
});
test('autosave when dirty with an existing slug', () => {
  assert.equal(shouldAutosave({ slug: 'a', title: '', dirty: true }), true);
});
test('autosave when dirty with a title (new post)', () => {
  assert.equal(shouldAutosave({ slug: null, title: 'Hi', dirty: true }), true);
});
test('no autosave when dirty but no slug and blank title', () => {
  assert.equal(shouldAutosave({ slug: null, title: '   ', dirty: true }), false);
});
