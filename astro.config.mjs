import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkAlert as alert } from 'remark-github-blockquote-alert';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  site: 'https://shubham-bansal.com',
  base: '/',
  output: 'static',
  integrations: [
    expressiveCode({
      themes: ['github-dark-dimmed'],
      styleOverrides: { borderRadius: '6px', borderColor: '#23272d', codeBackground: '#0a0b0d' },
    }),
    mdx(),
    react(),
    sitemap(),
  ],
  vite: { plugins: [tailwindcss()] },
  markdown: {
    remarkPlugins: [remarkMath, alert],
    rehypePlugins: [
      rehypeKatex,
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'append', properties: { className: ['anchor'] } }],
    ],
  },
});
