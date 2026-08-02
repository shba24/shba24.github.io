import type { PostData, PostMeta } from './types.ts';

const enc = (s: string) => encodeURIComponent(s);

export async function listPosts(): Promise<PostMeta[]> {
  const r = await fetch('/api/editor/posts/');
  if (!r.ok) throw new Error(`listPosts ${r.status}`);
  return (await r.json()).posts as PostMeta[];
}

export async function getPost(slug: string): Promise<{ data: PostData; body: string }> {
  const r = await fetch(`/api/editor/post/?slug=${enc(slug)}`);
  if (!r.ok) throw new Error(`getPost ${r.status}`);
  return r.json();
}

export async function savePost(slug: string, data: PostData, body: string): Promise<void> {
  const r = await fetch(`/api/editor/post/?slug=${enc(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, body }),
  });
  if (!r.ok) throw new Error(`savePost ${r.status}: ${await r.text().catch(() => '')}`);
}
