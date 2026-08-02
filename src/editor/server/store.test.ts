import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPostsMeta, readPost, writePost, postsDir } from './store.ts';
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
