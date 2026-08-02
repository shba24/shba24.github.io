import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import pagefind from 'astro-pagefind';
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
  trailingSlash: 'always',
  build: { format: 'directory' },
  redirects: {
    '/tags/data-anlytics/': '/tags/data-analytics/',
    '/tags/distributed-system/': '/tags/distributed-systems/',
    '/tags/blog/': '/tags/',
    '/tags/database/': '/tags/',
    '/tags/language/': '/tags/',
    '/page/1/': '/',
    '/posts/page/1/': '/posts/',
    '/about/about/': '/about/',
    '/sitemap.xml': '/sitemap-index.xml',
  },
  integrations: [
    expressiveCode({
      themes: ['vesper'],
      styleOverrides: { borderRadius: '6px', borderColor: '#23272d', codeBackground: '#0a0b0d' },
    }),
    mdx(),
    react(),
    sitemap(),
    pagefind(),
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
