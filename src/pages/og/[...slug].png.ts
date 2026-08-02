import { OGImageRoute } from 'astro-og-canvas';
import type { OGImageOptions } from 'astro-og-canvas';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { SITE } from '../../consts';

// One OG card per published post. Keys are bare post ids (e.g. `iceberg-…-part1`);
// the `.png` in the route comes from this file's name.
const posts = await getCollection('posts', (p: CollectionEntry<'posts'>) => !p.data.draft);
const pages: Record<string, CollectionEntry<'posts'>['data']> = Object.fromEntries(
  posts.map((p: CollectionEntry<'posts'>) => [p.id, p.data]),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  // `pathToSlug` would append a second `.png`; the filename already carries it,
  // so return the id unchanged → route resolves to `/og/<id>.png`.
  getSlug: (path: string) => path,
  getImageOptions: (
    _path: string,
    page: CollectionEntry<'posts'>['data'],
  ): OGImageOptions => ({
    title: page.title,
    // Eyebrow-style subtitle: series + part, else the site name.
    description:
      page.series && page.seriesPart != null
        ? `${page.series} · Part ${page.seriesPart}`
        : SITE.title,
    // Monochrome card matching the site tokens.
    bgGradient: [[12, 13, 15]], // --bg
    border: { color: [35, 39, 45], width: 2, side: 'block-end' }, // --border
    padding: 60,
    font: {
      title: { color: [236, 238, 241], size: 64, weight: 'Bold', families: ['Public Sans'] }, // --text
      description: { color: [154, 160, 168], size: 30, weight: 'Normal', families: ['Public Sans'] }, // --muted
    },
    fonts: [
      'https://api.fontsource.org/v1/fonts/public-sans/latin-700-normal.ttf',
      'https://api.fontsource.org/v1/fonts/public-sans/latin-400-normal.ttf',
    ],
  }),
});
