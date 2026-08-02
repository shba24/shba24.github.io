import type { PostMeta } from './types.ts';

export function partition(posts: PostMeta[], limit = 5): { drafts: PostMeta[]; published: PostMeta[] } {
  const drafts: PostMeta[] = [];
  const published: PostMeta[] = [];
  for (const p of posts) (p.draft ? drafts : published).push(p);
  return { drafts: drafts.slice(0, limit), published: published.slice(0, limit) };
}
