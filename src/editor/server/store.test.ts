import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPostsMeta, readPost, writePost, saveImage, postsDir, imagesDir } from './store.ts';
import { normalizePostData, serializePost } from '../lib/frontmatter.ts';

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'editor-store-'));
  await mkdir(postsDir(root), { recursive: true });
  return root;
}

test('writePost then readPost round-trips', async () => {
  const root = await fixtureRoot();
  const data = normalizePostData({ title: 'Hello', date: '2024-09-02', tags: ['X'] });
  await writePost(root, 'hello', data, 'body text\n');
  const got = await readPost(root, 'hello');
  assert.equal(got.data.title, 'Hello');
  assert.deepEqual(got.data.tags, ['X']);
  assert.equal(got.body, 'body text\n');
});

test('listPostsMeta returns metadata sorted by date desc', async () => {
  const root = await fixtureRoot();
  await writePost(root, 'old', normalizePostData({ title: 'Old', date: '2023-01-01' }), 'a\n');
  await writePost(root, 'new', normalizePostData({ title: 'New', date: '2025-01-01' }), 'b\n');
  const metas = await listPostsMeta(root);
  assert.deepEqual(metas.map((m) => m.slug), ['new', 'old']);
  assert.equal(metas[0].title, 'New');
});

test('listPostsMeta and readPost resolve both .md and .mdx files', async () => {
  const root = await fixtureRoot();
  // .md written via writePost (new posts are always .md)
  await writePost(root, 'md-post', normalizePostData({ title: 'MD Post', date: '2024-01-01' }), 'md body\n');
  // .mdx written directly (writePost only ever writes .md)
  const mdxRaw = serializePost(normalizePostData({ title: 'MDX Post', date: '2025-01-01' }), 'mdx body\n');
  await writeFile(join(postsDir(root), 'mdx-post.mdx'), mdxRaw, 'utf8');

  const metas = await listPostsMeta(root);
  assert.deepEqual(metas.map((m) => m.slug), ['mdx-post', 'md-post']); // sorted by date desc

  const got = await readPost(root, 'mdx-post');
  assert.equal(got.data.title, 'MDX Post');
  assert.equal(got.body, 'mdx body\n');
});

test('writePost is atomic (no .tmp left behind)', async () => {
  const root = await fixtureRoot();
  await writePost(root, 'p', normalizePostData({ title: 'P', date: '2024-01-01' }), 'x\n');
  const raw = await readFile(join(postsDir(root), 'p.md'), 'utf8');
  assert.match(raw, /^---\ntitle: "P"/);
});

test('saveImage writes under public/images/<slug>/ and returns the public URL', async () => {
  const root = await fixtureRoot();
  const url = await saveImage(root, 'my-post', 'pic.png', Buffer.from([1, 2, 3]));
  assert.equal(url, '/images/my-post/pic.png');
  const onDisk = await readFile(join(imagesDir(root, 'my-post'), 'pic.png'));
  assert.deepEqual([...onDisk], [1, 2, 3]);
});

test('saveImage dedupes a colliding filename instead of overwriting', async () => {
  const root = await fixtureRoot();
  const a = await saveImage(root, 'p', 'a.png', Buffer.from('first'));
  const b = await saveImage(root, 'p', 'a.png', Buffer.from('second'));
  assert.equal(a, '/images/p/a.png');
  assert.equal(b, '/images/p/a-1.png');
  assert.deepEqual((await readdir(imagesDir(root, 'p'))).sort(), ['a-1.png', 'a.png']);
  assert.equal(await readFile(join(imagesDir(root, 'p'), 'a.png'), 'utf8'), 'first'); // original preserved
});

test('saveImage re-sanitizes the filename (cannot escape the slug dir)', async () => {
  const root = await fixtureRoot();
  const url = await saveImage(root, 'p', '../../evil name!.PNG', Buffer.from('x'));
  assert.equal(url, '/images/p/evil-name.png');
  assert.deepEqual(await readdir(imagesDir(root, 'p')), ['evil-name.png']);
});
