import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, normalizePostData, serializePost, type PostData } from '../lib/frontmatter.ts';

export type PostMeta = { slug: string; title: string; date: string; draft: boolean };

export const postsDir = (root: string) => join(root, 'src', 'content', 'posts');
const postFile = (root: string, slug: string) => join(postsDir(root), `${slug}.md`);

export async function readPost(root: string, slug: string): Promise<{ data: PostData; body: string }> {
  const raw = await readFile(postFile(root, slug), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return { data: normalizePostData(data), body };
}

export async function writePost(root: string, slug: string, data: PostData, body: string): Promise<void> {
  const target = postFile(root, slug);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, serializePost(data, body), 'utf8');
  await rename(tmp, target); // atomic on same filesystem
}

export async function listPostsMeta(root: string): Promise<PostMeta[]> {
  const dir = postsDir(root);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  const metas = await Promise.all(
    files.map(async (f) => {
      const slug = f.replace(/\.(md|mdx)$/, '');
      const { data } = await readPost(root, slug);
      return { slug, title: data.title, date: data.date, draft: data.draft };
    }),
  );
  return metas.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
