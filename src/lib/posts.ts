import { getCollection, type CollectionEntry } from 'astro:content';
import { filterPosts } from './posts-filter';

export { filterPosts };

export const includeDrafts = import.meta.env.DEV;

export async function listVisiblePosts(): Promise<CollectionEntry<'posts'>[]> {
  return filterPosts(await getCollection('posts'), includeDrafts);
}
