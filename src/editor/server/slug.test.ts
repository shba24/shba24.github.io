import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSlug } from './slug.ts';

test('isValidSlug accepts safe post slugs', () => {
  for (const s of ['_fixture-draft', 'iceberg-table-format-part1', 'distributed-cache-series-part-2-memorydb']) {
    assert.equal(isValidSlug(s), true, `expected valid: ${s}`);
  }
});

test('isValidSlug rejects traversal, separators, and empty slugs', () => {
  for (const s of ['../x', 'a/b', 'a\\b', '..', '', 'a b']) {
    assert.equal(isValidSlug(s), false, `expected invalid: ${JSON.stringify(s)}`);
  }
});
