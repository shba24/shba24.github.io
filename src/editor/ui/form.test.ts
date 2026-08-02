import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataToForm, formToData, emptyForm } from './form.ts';
import type { PostData } from './types.ts';

const base: PostData = {
  title: 'T', date: '2024-05-01', description: 'd', tags: ['A', 'B'],
  series: 'S', seriesPart: 2, author: 'Shubham Bansal', draft: true, recommended: false, hideToc: false, deleted: false,
};

test('dataToForm joins tags and stringifies seriesPart', () => {
  const f = dataToForm(base);
  assert.equal(f.tags, 'A, B');
  assert.equal(f.seriesPart, '2');
  assert.equal(f.draft, true);
});

test('formToData round-trips through dataToForm', () => {
  assert.deepEqual(formToData(dataToForm(base)), base);
});

test('formToData drops empty tags/series and defaults author', () => {
  const d = formToData({ ...dataToForm(base), tags: 'X, , Y ,', series: '', seriesPart: '', author: '' });
  assert.deepEqual(d.tags, ['X', 'Y']);
  assert.equal(d.series, undefined);
  assert.equal(d.seriesPart, undefined);
  assert.equal(d.author, 'Shubham Bansal');
});

test('emptyForm defaults author and date', () => {
  const f = emptyForm('2026-08-02');
  assert.equal(f.author, 'Shubham Bansal');
  assert.equal(f.date, '2026-08-02');
  assert.equal(f.draft, true);
});
