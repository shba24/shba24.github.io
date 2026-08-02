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

/** Upload an image file for a post; returns the public /images/<slug>/<file> URL. */
export async function uploadImage(slug: string, file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/editor/image/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, filename: file.name, dataBase64 }),
  });
  if (!r.ok) throw new Error(`uploadImage ${r.status}`);
  return (await r.json()).url as string;
}
