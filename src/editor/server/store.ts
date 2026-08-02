import { readFile, writeFile, rename, readdir, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, normalizePostData, serializePost, type PostData } from '../lib/frontmatter.ts';
import { dedupeName, safeImageName } from './images.ts';

export type PostMeta = { slug: string; title: string; date: string; draft: boolean; deleted: boolean };

export const postsDir = (root: string) => join(root, 'src', 'content', 'posts');
export const imagesDir = (root: string, slug: string) => join(root, 'public', 'images', slug);
const postFile = (root: string, slug: string) => join(postsDir(root), `${slug}.md`);

// Resolve the on-disk file for a slug, honoring both .md and .mdx (preferring .md).
async function resolveReadFile(root: string, slug: string): Promise<string> {
  const dir = postsDir(root);
  for (const ext of ['md', 'mdx']) {
    const candidate = join(dir, `${slug}.${ext}`);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // candidate missing; try next extension
    }
  }
  return join(dir, `${slug}.md`);
}

export async function readPost(root: string, slug: string): Promise<{ data: PostData; body: string }> {
  const raw = await readFile(await resolveReadFile(root, slug), 'utf8');
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
      return { slug, title: data.title, date: data.date, draft: data.draft, deleted: data.deleted };
    }),
  );
  return metas.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Write an uploaded image under public/images/<slug>/, deduping the name; returns the /images/... URL. */
export async function saveImage(root: string, slug: string, filename: string, buffer: Buffer): Promise<string> {
  const dir = imagesDir(root, slug);
  await mkdir(dir, { recursive: true });
  const existing = await readdir(dir).catch(() => [] as string[]);
  const safe = safeImageName(filename);
  const final = dedupeName(existing, safe);
  await writeFile(join(dir, final), buffer);
  return `/images/${slug}/${final}`;
}
