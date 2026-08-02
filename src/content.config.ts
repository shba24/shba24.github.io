import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().default(''),
    tags: z.array(z.string()).default([]),
    series: z.string().optional(),
    seriesPart: z.number().optional(),
    author: z.string().default('Shubham Bansal'),
    draft: z.boolean().default(false),
    recommended: z.boolean().default(false),
    hideToc: z.boolean().default(false),
    deleted: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({ title: z.string(), description: z.string().default('') }),
});

export const collections = { posts, pages };
