import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeImageName, dedupeName } from './images.ts';

test('safeImageName normalizes name and lowercases the extension', () => {
  assert.equal(safeImageName('My Pic!.PNG'), 'my-pic.png');
  assert.equal(safeImageName('/tmp/a b/Photo.JPEG'), 'photo.jpeg');
});

test('safeImageName rejects non-image extensions', () => {
  assert.throws(() => safeImageName('notes.txt'), /unsupported image type/);
  assert.throws(() => safeImageName('noext'), /unsupported image type/);
});

test('dedupeName suffixes collisions', () => {
  assert.equal(dedupeName([], 'a.png'), 'a.png');
  assert.equal(dedupeName(['a.png'], 'a.png'), 'a-1.png');
  assert.equal(dedupeName(['a.png', 'a-1.png'], 'a.png'), 'a-2.png');
});
