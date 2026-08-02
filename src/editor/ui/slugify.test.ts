import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slugify.ts';

test('slugify lowercases and dashes non-alphanumerics', () => {
  assert.equal(slugify('My New Post!'), 'my-new-post');
});
test('slugify collapses repeats and trims edges', () => {
  assert.equal(slugify('  Hello --- World  '), 'hello-world');
});
test('slugify keeps digits and preserves existing hyphens', () => {
  assert.equal(slugify('Iceberg Table Format Part 1'), 'iceberg-table-format-part-1');
});
test('slugify returns empty string for no usable characters', () => {
  assert.equal(slugify('!!!'), '');
});
