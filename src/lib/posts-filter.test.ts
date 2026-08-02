import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPosts } from './posts-filter.ts';

const entries = [
  { data: { draft: false }, id: 'pub' },
  { data: { draft: true }, id: 'draft' },
];

test('filterPosts excludes drafts in production mode', () => {
  assert.deepEqual(filterPosts(entries, false).map((e) => e.id), ['pub']);
});

test('filterPosts includes drafts in dev mode', () => {
  assert.deepEqual(filterPosts(entries, true).map((e) => e.id), ['pub', 'draft']);
});
