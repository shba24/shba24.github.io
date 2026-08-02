import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partition } from './partition.ts';
import type { PostMeta } from './types.ts';

const m = (slug: string, draft: boolean): PostMeta => ({ slug, title: slug, date: '2024-01-01', draft });

test('partition splits drafts from published preserving order', () => {
  const { drafts, published } = partition([m('a', true), m('b', false), m('c', true)]);
  assert.deepEqual(drafts.map((p) => p.slug), ['a', 'c']);
  assert.deepEqual(published.map((p) => p.slug), ['b']);
});

test('partition caps each list at the limit', () => {
  const posts = Array.from({ length: 8 }, (_, i) => m(`d${i}`, true));
  assert.equal(partition(posts, 5).drafts.length, 5);
});
