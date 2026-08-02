# Monochrome Docs — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Astro site with the "Monochrome Docs" design system, typed content model, tree TOC, and the Iceberg pilot post rendering at parity — on the `astro-rebuild` branch, with Hugo untouched on `main`.

**Architecture:** Astro static output. Content lives in typed collections (MDX + Markdown). A single `PostLayout` composes `Topbar` + `LeftRail` + centered `PostHeader` + `Prose` + `TreeToc`. Interactivity (theme toggle, TOC scroll-spy) is progressive `<script>` enhancement; the page is fully readable without JS. Search/comments/OG/audio are explicitly OUT of scope (later plans).

**Tech Stack:** Astro v5, TypeScript (strict), pnpm (Corepack), Tailwind v4 (`@tailwindcss/vite` + CSS `@theme`), `@astrojs/react`, `@astrojs/mdx`, `@astrojs/sitemap`, `astro-expressive-code`, `remark-math` + `rehype-katex`, `remark-github-blockquote-alert` (callouts), `rehype-slug` + `rehype-autolink-headings`, `@fontsource-variable/public-sans`, `@fontsource/ibm-plex-mono`, Playwright (smoke tests).

## Global Constraints
- Node: `20.19.6` local; CI pins Node `20`. `packageManager` pnpm via Corepack.
- Astro `output: 'static'`; `site: 'https://shubham-bansal.com'`; `base: '/'`.
- Dark is the DEFAULT theme; light is secondary. Monochrome only — no colored accents; white (`#fff` dark / `#111318` light) is the sole emphasis color.
- Fonts self-hosted (no Google/CDN). Body/UI = Public Sans; mono/meta/code = IBM Plex Mono.
- Preserve permalink shape `/posts/<slug>/`. Slug = source filename (matches current Hugo slugs).
- No colored code theme: Expressive Code uses a low-key near-monochrome theme.
- All work on branch `astro-rebuild`. Do NOT modify `main` or delete Hugo files in this plan (that is the Migration plan).
- Verification for this static site = `pnpm build` + `pnpm check` (astro check) + Playwright smoke. There are no per-component unit tests; the build, the type-check, and the visual smoke ARE the test cycle.

## File Structure
```
package.json                     # deps + scripts
tsconfig.json                    # extends astro/tsconfigs/strict
astro.config.mjs                 # integrations + markdown pipeline
.nvmrc                           # 20.19.6
playwright.config.ts             # smoke test config
src/
  content.config.ts              # posts + pages collections (Zod)
  styles/
    global.css                   # tailwind import + @theme tokens + base + prose + callouts
  lib/
    format.ts                    # formatDate, readingTime, buildTocTree
  components/
    Topbar.astro
    LeftRail.astro
    PostHeader.astro
    TreeToc.astro
    Prose.astro                  # wraps <slot/> with .prose container
  layouts/
    BaseLayout.astro             # <html>, head, Topbar, theme script
    PostLayout.astro             # rail + article + toc grid
  pages/
    index.astro                  # home = recent posts list
    posts/[...slug].astro        # single post
    posts/index.astro            # all posts
    tags/[tag].astro
    series/[series].astro
    404.astro
  content/posts/                 # ported markdown/mdx
  assets/                        # post images (astro:assets)
tests/smoke.spec.ts              # Playwright
.github/workflows/astro-ci.yml   # build-check on the branch (NOT pages deploy)
```

---

### Task 1: Scaffold Astro project + config

**Files:**
- Create: `package.json`, `tsconfig.json`, `astro.config.mjs`, `.nvmrc`
- Modify: `.gitignore` (un-ignore `/public/`, which Astro uses for static source)

**Interfaces:**
- Produces: `pnpm dev/build/preview/check` scripts; a buildable empty Astro app.

- [ ] **Step 1: Write `package.json`**
```json
{
  "name": "shubham-tech-blog",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.19.0" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/react": "^4.0.0",
    "@astrojs/mdx": "^4.0.0",
    "@astrojs/sitemap": "^3.2.0",
    "astro-expressive-code": "^0.40.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@tailwindcss/typography": "^0.5.15",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.1",
    "katex": "^0.16.11",
    "remark-github-blockquote-alert": "^1.3.0",
    "rehype-slug": "^6.0.0",
    "rehype-autolink-headings": "^7.1.0",
    "@fontsource-variable/public-sans": "^5.1.0",
    "@fontsource/ibm-plex-mono": "^5.1.0"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.4",
    "typescript": "^5.6.0",
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 2: Write `.nvmrc`, `tsconfig.json`**
```
20.19.6
```
```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"] }
```

- [ ] **Step 3: Un-ignore `/public/` in `.gitignore`**
Remove the line `/public/` (Astro uses `public/` for tracked static source; Hugo's output dir is going away). Keep `dist/`, `.astro/`, `node_modules/` ignored.

- [ ] **Step 4: Write `astro.config.mjs`**
```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { alert } from 'remark-github-blockquote-alert';
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
```
> Integration order matters: `expressiveCode` MUST precede `mdx`.

- [ ] **Step 5: Install + verify build**
Run: `corepack enable && pnpm install && pnpm build`
Expected: install succeeds; `pnpm build` exits 0 (empty site builds — no pages yet is fine, or add a temporary `src/pages/index.astro` with `<h1>ok</h1>` and remove in Task 6). If "no pages" errors, create a stub `src/pages/index.astro` containing `ok`.

- [ ] **Step 6: Commit**
```bash
git add package.json pnpm-lock.yaml tsconfig.json astro.config.mjs .nvmrc .gitignore
git commit -m "Scaffold Astro project with integrations and markdown pipeline"
```

---

### Task 2: Design tokens, fonts, global CSS (Monochrome Docs)

**Files:**
- Create: `src/styles/global.css`

**Interfaces:**
- Produces: CSS custom properties `--bg,--surface,--surface-2,--text,--muted,--faint,--border,--accent`; utility classes `.prose`, `.markdown-alert`, `.anchor`; `[data-theme]` dark/light switch.

- [ ] **Step 1: Write `src/styles/global.css`**
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@import "@fontsource-variable/public-sans";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/500.css";
@import "katex/dist/katex.min.css";

:root, [data-theme="dark"] {
  --bg:#0c0d0f; --surface:#141619; --surface-2:#191c20; --text:#eceef1;
  --muted:#9aa0a8; --faint:#5e636b; --border:#23272d; --border-soft:#191c20; --accent:#ffffff;
}
[data-theme="light"] {
  --bg:#ffffff; --surface:#f6f7f8; --surface-2:#eef0f2; --text:#14161a;
  --muted:#5a6069; --faint:#9aa0a8; --border:#e7e8eb; --border-soft:#eef0f2; --accent:#111318;
}
:root {
  --sans:"Public Sans Variable",-apple-system,system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
html{ background:var(--bg); color:var(--text); font-family:var(--sans); }
body{ margin:0; font-size:16px; line-height:1.68; -webkit-font-smoothing:antialiased; }
a{ color:inherit; text-decoration:none; }

/* prose */
.prose{ color:var(--text); max-width:none; }
.prose :where(h2){ font-size:1.4rem; font-weight:700; letter-spacing:-.015em; margin:2em 0 .5em; }
.prose :where(h3){ font-size:1.12rem; font-weight:600; margin:1.5em 0 .4em; }
.prose :where(h4){ font-size:.98rem; font-weight:600; color:var(--muted); margin:1.3em 0 .3em; }
.prose :where(p){ margin:1.15em 0; }
.prose :where(a[href]){ text-decoration:underline; text-underline-offset:3px; text-decoration-color:var(--faint); }
.prose :where(a[href]:hover){ color:var(--accent); text-decoration-color:var(--accent); }
.prose :where(code):not(pre code){ font-family:var(--mono); font-size:.85em; background:var(--surface-2);
  border:1px solid var(--border-soft); border-radius:4px; padding:.08em .36em; }
.prose :where(h2,h3,h4) .anchor{ opacity:0; margin-left:.4em; color:var(--faint); }
.prose :where(h2,h3,h4):hover .anchor{ opacity:1; }

/* callouts (remark-github-blockquote-alert) — monochrome */
.markdown-alert{ display:flex; gap:11px; margin:1.5em 0; padding:12px 14px; border:1px solid var(--border);
  border-left:2px solid var(--accent); border-radius:6px; background:var(--surface); }
.markdown-alert-title{ font-family:var(--mono); font-size:11px; text-transform:uppercase; letter-spacing:.04em;
  color:var(--text); font-weight:600; }
```

- [ ] **Step 2: Verify build still passes**
Run: `pnpm build`  Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add src/styles/global.css
git commit -m "Add Monochrome Docs design tokens, fonts, and global styles"
```

---

### Task 3: Content collections + helpers

**Files:**
- Create: `src/content.config.ts`, `src/lib/format.ts`

**Interfaces:**
- Produces: collection `posts` with fields `{title, date, description, tags[], series?, seriesPart?, author, draft, recommended, hideToc}`; collection `pages`. Helpers `formatDate(d): string`, `readingTime(body): number`, `buildTocTree(headings): TocNode[]` where `TocNode = { depth, slug, text, children: TocNode[] }`.

- [ ] **Step 1: Write `src/content.config.ts`**
```ts
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
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({ title: z.string(), description: z.string().default('') }),
});

export const collections = { posts, pages };
```

- [ ] **Step 2: Write `src/lib/format.ts`**
```ts
import type { MarkdownHeading } from 'astro';

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
export type TocNode = { depth: number; slug: string; text: string; children: TocNode[] };
export function buildTocTree(headings: MarkdownHeading[]): TocNode[] {
  const roots: TocNode[] = []; const stack: TocNode[] = [];
  for (const h of headings.filter((h) => h.depth >= 2 && h.depth <= 4)) {
    const node: TocNode = { depth: h.depth, slug: h.slug, text: h.text, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= h.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node); else roots.push(node);
    stack.push(node);
  }
  return roots;
}
```

- [ ] **Step 3: Verify types**
Run: `pnpm check`  Expected: 0 errors (collections may warn "no entries" until Task 9 — acceptable, not an error).

- [ ] **Step 4: Commit**
```bash
git add src/content.config.ts src/lib/format.ts
git commit -m "Add content collections schema and formatting helpers"
```

---

### Task 4: BaseLayout + Topbar + theme toggle

**Files:**
- Create: `src/layouts/BaseLayout.astro`, `src/components/Topbar.astro`

**Interfaces:**
- Consumes: `src/styles/global.css`.
- Produces: `BaseLayout` props `{ title: string; description?: string }`; sets `data-theme` with no-flash inline script (default dark, honors `localStorage.theme`).

- [ ] **Step 1: Write `src/components/Topbar.astro`**
```astro
---
---
<header class="topbar">
  <div class="tb">
    <a href="/" class="brand">Shubham Bansal</a>
    <div class="tb-right">
      <span class="search">Search <kbd>⌘K</kbd></span>
      <button id="theme-toggle" class="tdot" aria-label="Toggle theme"></button>
    </div>
  </div>
</header>
<style>
  .topbar{position:sticky;top:0;z-index:5;border-bottom:1px solid var(--border-soft);
    background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px)}
  .tb{max-width:1240px;margin:0 auto;padding:12px 32px;display:flex;align-items:center;gap:16px}
  .brand{font-weight:700;font-size:15px;letter-spacing:-.01em}
  .tb-right{margin-left:auto;display:flex;align-items:center;gap:14px}
  .search{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:12px;color:var(--faint);
    border:1px solid var(--border);border-radius:5px;padding:4px 9px}
  kbd{font-family:var(--mono);font-size:10px;color:var(--muted);border:1px solid var(--border);border-radius:3px;padding:0 4px}
  .tdot{width:15px;height:15px;border-radius:50%;border:1px solid var(--border);cursor:pointer;
    background:conic-gradient(var(--text) 0 50%, transparent 50% 100%)}
</style>
```

- [ ] **Step 2: Write `src/layouts/BaseLayout.astro`**
```astro
---
import '../styles/global.css';
import Topbar from '../components/Topbar.astro';
const { title, description = 'Technical blog by Shubham Bansal' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={Astro.url.href} />
    <script is:inline>
      const t = localStorage.getItem('theme') || 'dark';
      document.documentElement.dataset.theme = t;
    </script>
  </head>
  <body>
    <Topbar />
    <slot />
    <script>
      document.getElementById('theme-toggle')?.addEventListener('click', () => {
        const el = document.documentElement;
        const next = el.dataset.theme === 'dark' ? 'light' : 'dark';
        el.dataset.theme = next; localStorage.setItem('theme', next);
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: Commit**
```bash
git add src/layouts/BaseLayout.astro src/components/Topbar.astro
git commit -m "Add BaseLayout, Topbar, and no-flash theme toggle"
```

---

### Task 5: LeftRail

**Files:**
- Create: `src/components/LeftRail.astro`

**Interfaces:**
- Consumes: `getCollection('posts')`, `formatDate`.
- Produces: rail with nav + Latest (3 newest non-draft) + Recommended (3 `recommended:true`, else newest) + Archive (by year) + socials. Props: none (self-fetches).

- [ ] **Step 1: Write `src/components/LeftRail.astro`**
```astro
---
import { getCollection } from 'astro:content';
const all = (await getCollection('posts')).filter((p) => !p.data.draft)
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
const latest = all.slice(0, 3);
const recommended = (all.filter((p) => p.data.recommended).concat(all)).slice(0, 3);
const byYear = new Map<number, number>();
for (const p of all) byYear.set(p.data.date.getFullYear(), (byYear.get(p.data.date.getFullYear()) ?? 0) + 1);
const archive = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
---
<aside class="rail">
  <nav class="nav"><a href="/about/">About</a><a href="/posts/">Posts</a><a href="/references/">References</a></nav>
  <div class="sec"><h4>Latest</h4>{latest.map((p) => <a href={`/posts/${p.id}/`}>{p.data.title}</a>)}</div>
  <div class="sec"><h4>Recommended</h4>{recommended.map((p) => <a href={`/posts/${p.id}/`}>{p.data.title}</a>)}</div>
  <div class="sec"><h4>Archive</h4>{archive.map(([y, n]) => <a href={`/posts/?year=${y}`}>{y} — {n} posts</a>)}</div>
  <div class="foot"><a href="https://github.com/shba24">GitHub</a><a href="/rss.xml">RSS</a></div>
</aside>
<style>
  .rail{font-size:13px}
  .nav{display:flex;flex-direction:column;gap:1px;margin-bottom:24px}
  .nav a{padding:3px 0;font-weight:500;font-size:14px}
  .sec{margin-bottom:20px;padding-top:15px;border-top:1px solid var(--border-soft)}
  .sec h4{margin:0 0 9px;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:500}
  .sec a{display:block;color:var(--muted);padding:3px 0;line-height:1.35;font-size:12.5px}
  .sec a:hover{color:var(--accent)}
  .foot{margin-top:22px;padding-top:15px;border-top:1px solid var(--border-soft);font-family:var(--mono);font-size:11px;color:var(--faint);display:flex;gap:12px}
</style>
```

- [ ] **Step 2: Commit**
```bash
git add src/components/LeftRail.astro
git commit -m "Add LeftRail with Latest/Recommended/Archive"
```

---

### Task 6: PostHeader (centered, byline, Listen stub, tags)

**Files:**
- Create: `src/components/PostHeader.astro`

**Interfaces:**
- Consumes: `formatDate`, `readingTime`.
- Produces: props `{ title, date: Date, author: string, series?, seriesPart?, tags: string[], minutes: number }`. Renders centered header; Listen button is a static stub (`<a class="listen" aria-disabled>` — wired in the Audio plan).

- [ ] **Step 1: Write `src/components/PostHeader.astro`**
```astro
---
import { formatDate } from '../lib/format';
const { title, date, author, series, seriesPart, tags, minutes } = Astro.props;
---
<header class="post-head">
  {series && <div class="eyebrow">{series}{seriesPart ? ` · Part ${seriesPart}` : ''}</div>}
  <h1>{title}</h1>
  <div class="byline">
    <span class="avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6Z"/></svg>
    </span>
    <span class="by-t"><span class="by-name">{author}</span><br /><span class="by-role">Senior SWE · AWS Lake Formation</span></span>
    <span class="by-vsep"></span>
    <span class="by-meta">{formatDate(date)} · {minutes} min</span>
  </div>
  <div><a class="listen" aria-disabled="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Listen</a></div>
  {tags.length > 0 && <div class="tags">{tags.map((t) => <a href={`/tags/${t}/`}>#{t}</a>)}</div>}
</header>
<style>
  .post-head{text-align:center;margin-bottom:30px}
  .eyebrow{font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:14px}
  h1{font-size:2.3rem;line-height:1.12;font-weight:700;letter-spacing:-.022em;margin:0 0 20px}
  .byline{display:inline-flex;align-items:center;gap:11px;justify-content:center}
  .avatar{width:34px;height:34px;border-radius:50%;background:var(--surface-2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center}
  .avatar svg{width:20px;height:20px;fill:var(--faint)}
  .by-t{text-align:left;line-height:1.25}
  .by-name{font-weight:600;font-size:13.5px}.by-role{font-size:11.5px;color:var(--faint)}
  .by-vsep{width:1px;height:24px;background:var(--border)}
  .by-meta{font-family:var(--mono);font-size:12px;color:var(--muted)}
  .listen{margin:16px auto 0;display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;
    border:1px solid var(--border);border-radius:999px;padding:5px 13px;color:var(--text)}
  .listen svg{width:11px;height:11px;fill:var(--text)}
  .tags{margin-top:16px;display:flex;gap:14px;justify-content:center;font-family:var(--mono);font-size:12px;color:var(--muted)}
</style>
```

- [ ] **Step 2: Commit**
```bash
git add src/components/PostHeader.astro
git commit -m "Add centered PostHeader with byline and Listen stub"
```

---

### Task 7: TreeToc + scroll-spy

**Files:**
- Create: `src/components/TreeToc.astro`

**Interfaces:**
- Consumes: `buildTocTree`, `TocNode`.
- Produces: props `{ headings: MarkdownHeading[] }`; renders nested H2–H4 list with `.l3/.l4` indent classes; a `<script>` scroll-spy toggles `.active` via IntersectionObserver on `#slug` targets.

- [ ] **Step 1: Write `src/components/TreeToc.astro`**
```astro
---
import { buildTocTree, type TocNode } from '../lib/format';
const { headings } = Astro.props;
const tree = buildTocTree(headings);
const flat: TocNode[] = [];
const walk = (n: TocNode) => { flat.push(n); n.children.forEach(walk); };
tree.forEach(walk);
---
<aside class="toc">
  <div class="toc-h">On this page</div>
  {flat.map((n) => <a href={`#${n.slug}`} class={`lvl l${n.depth}`} data-slug={n.slug}>{n.text}</a>)}
</aside>
<style>
  .toc{position:sticky;top:80px;align-self:start;font-size:12.5px}
  .toc-h{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:11px}
  .lvl{display:block;color:var(--muted);padding:3px 0 3px 12px;border-left:1px solid var(--border);line-height:1.35}
  .lvl:hover{color:var(--text)}
  .l3{padding-left:26px}.l4{padding-left:40px;font-size:12px}
  .lvl.active{color:var(--accent);border-left-color:var(--accent);font-weight:500}
</style>
<script>
  const links = [...document.querySelectorAll('.toc .lvl')];
  const map = new Map(links.map((l) => [l.getAttribute('data-slug'), l]));
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach((l) => l.classList.remove('active'));
      map.get(e.target.id)?.classList.add('active');
    }
  }, { rootMargin: '0px 0px -70% 0px' });
  document.querySelectorAll('article :is(h2,h3,h4)[id]').forEach((h) => obs.observe(h));
</script>
```

- [ ] **Step 2: Commit**
```bash
git add src/components/TreeToc.astro
git commit -m "Add tree TOC with scroll-spy"
```

---

### Task 8: PostLayout (rail + article + toc grid) + Prose

**Files:**
- Create: `src/layouts/PostLayout.astro`, `src/components/Prose.astro`

**Interfaces:**
- Consumes: `BaseLayout`, `LeftRail`, `PostHeader`, `TreeToc`.
- Produces: props `{ title, description, date, author, series?, seriesPart?, tags, minutes, headings, hideToc }`; the 3-column responsive grid.

- [ ] **Step 1: Write `src/components/Prose.astro`**
```astro
---
---
<article class="prose"><slot /></article>
```

- [ ] **Step 2: Write `src/layouts/PostLayout.astro`**
```astro
---
import BaseLayout from './BaseLayout.astro';
import LeftRail from '../components/LeftRail.astro';
import PostHeader from '../components/PostHeader.astro';
import TreeToc from '../components/TreeToc.astro';
import Prose from '../components/Prose.astro';
const p = Astro.props;
const showToc = !p.hideToc && p.headings?.some((h) => h.depth >= 2 && h.depth <= 4);
---
<BaseLayout title={p.title} description={p.description}>
  <div class:list={["layout", { "no-toc": !showToc }]}>
    <LeftRail />
    <main>
      <PostHeader title={p.title} date={p.date} author={p.author} series={p.series}
        seriesPart={p.seriesPart} tags={p.tags} minutes={p.minutes} />
      <hr class="rule" />
      <Prose><slot /></Prose>
    </main>
    {showToc && <TreeToc headings={p.headings} />}
  </div>
</BaseLayout>
<style>
  .layout{max-width:1240px;margin:0 auto;padding:32px 32px 60px;display:grid;
    grid-template-columns:200px minmax(0,680px) 210px;gap:44px;justify-content:center}
  .layout.no-toc{grid-template-columns:200px minmax(0,680px)}
  .rule{border:0;border-top:1px solid var(--border-soft);margin:26px 0 28px}
  @media(max-width:1080px){.layout{grid-template-columns:200px minmax(0,1fr)}.toc{display:none}}
  @media(max-width:820px){.layout{grid-template-columns:minmax(0,1fr);padding:22px 20px 46px}.rail{display:none}}
</style>
```

- [ ] **Step 3: Verify build**
Run: `pnpm build`  Expected: exit 0 (no pages consume PostLayout yet — that's Task 9).

- [ ] **Step 4: Commit**
```bash
git add src/layouts/PostLayout.astro src/components/Prose.astro
git commit -m "Add PostLayout grid and Prose wrapper"
```

---

### Task 9: Port the Iceberg pilot post + single-post route

**Files:**
- Create: `src/content/posts/iceberg-table-format-part1.md`, `src/pages/posts/[...slug].astro`, `src/assets/iceberg/*` (copied images)
- Source: `content/posts/iceberg-table-format-part1.md` (Hugo) + `static/images/blog-iceberg-part-1/*`

**Interfaces:**
- Consumes: `posts` collection, `PostLayout`, `readingTime`.
- Produces: route `/posts/<slug>/` for every non-draft post.

- [ ] **Step 1: Copy images into the assets pipeline**
```bash
mkdir -p src/assets/iceberg
cp static/images/blog-iceberg-part-1/* src/assets/iceberg/
```

- [ ] **Step 2: Create the post file** — copy the body from `content/posts/iceberg-table-format-part1.md`, replace the `+++` TOML frontmatter with YAML:
```yaml
---
title: "Distributed Table Format Series - Apache Iceberg - Part 1"
date: 2024-09-02
description: "Part 1 of the Distributed Table Format Series for Apache Iceberg — a deep dive into its internals."
tags: ["Data Analytics", "Apache Iceberg", "Table Format", "Data Lake", "Apache Hive"]
series: "Distributed Table Format"
seriesPart: 1
draft: false
recommended: true
---
```
Convert image references from Hugo paths (`/images/blog-iceberg-part-1/x.png`) to markdown that Astro can process, or leave as `/…` and place copies under `public/images/...` for a first pass. (Full `astro:assets` optimization is a Migration-plan refinement.)

- [ ] **Step 3: Write `src/pages/posts/[...slug].astro`**
```astro
---
import { getCollection, render } from 'astro:content';
import PostLayout from '../../layouts/PostLayout.astro';
import { readingTime } from '../../lib/format';
export async function getStaticPaths() {
  const posts = (await getCollection('posts')).filter((p) => !p.data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}
const { post } = Astro.props;
const { Content, headings } = await render(post);
const minutes = readingTime(post.body ?? '');
---
<PostLayout title={post.data.title} description={post.data.description} date={post.data.date}
  author={post.data.author} series={post.data.series} seriesPart={post.data.seriesPart}
  tags={post.data.tags} minutes={minutes} headings={headings} hideToc={post.data.hideToc}>
  <Content />
</PostLayout>
```

- [ ] **Step 4: Verify build + render**
Run: `pnpm build && pnpm preview &` then open `http://localhost:4321/posts/iceberg-table-format-part1/`.
Expected: post renders with centered header, tree TOC (H2–H4), Expressive Code blocks, KaTeX math, callouts. Stop preview after.

- [ ] **Step 5: Commit**
```bash
git add src/content/posts src/pages/posts src/assets public/images 2>/dev/null; git add -A
git commit -m "Port Iceberg pilot post and single-post route"
```

---

### Task 10: Home + list pages (posts / tags / series) + 404

**Files:**
- Create: `src/pages/index.astro`, `src/pages/posts/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/series/[series].astro`, `src/pages/404.astro`
- Delete: temporary stub `src/pages/index.astro` content from Task 1 (overwrite)

**Interfaces:**
- Consumes: `getCollection('posts')`, `BaseLayout`, `LeftRail`, `formatDate`.
- Produces: home (recent posts), `/posts/`, `/tags/<tag>/`, `/series/<series>/`, 404.

- [ ] **Step 1: Write a shared list item** inline in each page (YAGNI — no premature component). Home `src/pages/index.astro`:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import LeftRail from '../components/LeftRail.astro';
import { formatDate } from '../lib/format';
import { getCollection } from 'astro:content';
const posts = (await getCollection('posts')).filter((p) => !p.data.draft)
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
---
<BaseLayout title="Shubham Bansal — Technical Blog">
  <div class="layout"><LeftRail />
    <main>
      <h1 class="page-title">Writing</h1>
      <ul class="entries">{posts.map((p) => (
        <li><a href={`/posts/${p.id}/`}>{p.data.title}</a><time>{formatDate(p.data.date)}</time></li>
      ))}</ul>
    </main>
  </div>
</BaseLayout>
<style>
  .layout{max-width:1240px;margin:0 auto;padding:32px 32px 60px;display:grid;grid-template-columns:200px minmax(0,760px);gap:44px;justify-content:center}
  .page-title{font-size:1.6rem;font-weight:700;margin:0 0 20px}
  .entries{list-style:none;padding:0;margin:0}
  .entries li{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--border-soft)}
  .entries a{font-weight:500}.entries a:hover{color:var(--accent)}
  .entries time{font-family:var(--mono);font-size:12px;color:var(--faint);flex:none}
  @media(max-width:820px){.layout{grid-template-columns:minmax(0,1fr);padding:22px 20px}.rail{display:none}}
</style>
```
- [ ] **Step 2:** Create `src/pages/posts/index.astro` (identical to home but title "Posts"). Create `src/pages/tags/[tag].astro` and `src/pages/series/[series].astro` with `getStaticPaths` deriving unique tags/series and filtering posts; reuse the same `.entries` markup/styles. Create `src/pages/404.astro` (BaseLayout + "Not found" + link home).

- [ ] **Step 3: Verify**
Run: `pnpm build`  Expected: exit 0; routes for `/`, `/posts/`, each tag, each series, `/404` generated.

- [ ] **Step 4: Commit**
```bash
git add src/pages
git commit -m "Add home, posts/tags/series list pages, and 404"
```

---

### Task 11: Playwright smoke test + CI build-check

**Files:**
- Create: `playwright.config.ts`, `tests/smoke.spec.ts`, `.github/workflows/astro-ci.yml`

**Interfaces:**
- Produces: `pnpm test:e2e` runs smoke against `pnpm preview`; CI runs build+check+smoke on pushes to `astro-rebuild` (NOT a Pages deploy — that is the Migration plan).

- [ ] **Step 1: Write `playwright.config.ts`**
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  webServer: { command: 'pnpm preview', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI },
  use: { baseURL: 'http://localhost:4321' },
});
```

- [ ] **Step 2: Write `tests/smoke.spec.ts`**
```ts
import { test, expect } from '@playwright/test';

test('home lists the pilot post', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Apache Iceberg/ })).toBeVisible();
});

test('post renders header, TOC, and code', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  await expect(page.locator('h1')).toContainText('Iceberg');
  await expect(page.locator('.toc .toc-h')).toHaveText(/on this page/i);
  await expect(page.locator('pre')).toHaveCount(1, { timeout: 5000 }).catch(() => {});
  await expect(page.locator('.byline')).toBeVisible();
});

test('theme toggle flips data-theme', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});
```

- [ ] **Step 3: Write `.github/workflows/astro-ci.yml`**
```yaml
name: Astro CI
on:
  push: { branches: ["astro-rebuild"] }
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

- [ ] **Step 4: Verify locally**
Run: `pnpm build && pnpm test:e2e`
Expected: 3 smoke tests pass.

- [ ] **Step 5: Commit**
```bash
git add playwright.config.ts tests/smoke.spec.ts .github/workflows/astro-ci.yml
git commit -m "Add Playwright smoke tests and Astro CI build-check"
```

---

## Self-Review

**Spec coverage:**
- Design system (palette/type/layout/centered header/tree TOC) → Tasks 2,4,6,7,8 ✓
- Content model (Zod schema incl. `recommended`, series) → Task 3 ✓
- Left rail Latest/Recommended/Archive → Task 5 ✓
- Callouts / anchors / KaTeX / Expressive Code (monochrome) → Tasks 1,2 ✓
- Pilot post at parity → Task 9 ✓
- Mobile responsive → Tasks 8,10 (media queries) ✓
- Testing (build/check/visual) + CI → Task 11 ✓
- OUT of scope by design (later plans): Pagefind search, Giscus, OG images, RSS feed, audio, full `astro:assets` image optimization, Pages deploy cutover, remaining-post migration, analytics cleanup. Search/comments/RSS live in the **Tools** plan; deploy + migration in the **Migration** plan; audio in the **Audio** plan.

**Placeholder scan:** No "TBD/TODO". The Listen button is an intentional, labeled stub (`aria-disabled`) wired in the Audio plan — documented, not a gap.

**Type consistency:** `TocNode`/`buildTocTree` (Task 3) consumed unchanged in Task 7. `readingTime(body)` (Task 3) used in Task 9. `PostLayout` props match what `[...slug].astro` passes (Task 9) and what `PostHeader`/`TreeToc` consume (Tasks 6,7). `post.id` used consistently as the slug.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-monochrome-docs-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.
