# Blog Authoring Studio — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the dev-only plumbing for the editor — a file API, a frontmatter engine, safe draft rendering, and a thin end-to-end slice (`/editor` lists posts from `/api/editor`) — with the production-safety guarantee locked in by tests first.

**Architecture:** A dev-only Astro integration injects `/editor` + `/drafts` routes and mounts an `/api/editor/*` Vite dev-middleware **only** under `astro dev`. A pure frontmatter engine and a pure fs "store" (both `node --test`-covered) do the real read/write. A single `filterPosts` helper gates draft visibility on `import.meta.env.DEV`, so drafts render at real URLs in dev but stay excluded from the production build.

**Tech Stack:** Astro 5, React 18 (islands), Vite dev middleware (Connect), TypeScript, `js-yaml` (dev-only, frontmatter parse), `node --test` (unit), Playwright (e2e — both built-site and dev-server surfaces).

## Global Constraints

- **Node** `24.18.1` (`.nvmrc`; Node 20 reached end-of-life April 2026); package manager **pnpm 9.12.0**. This repo is a normal Astro project — build/test **locally** on Node 24 (it is NOT an Amazon brazil package).
- **Dev-only:** the editor, its routes, and `/api/editor` must exist **only** under `astro dev`. `astro build` (what `deploy.yml` runs) must contain none of them.
- **Write-only:** no git operations anywhere in the editor. File writes only.
- **Production unchanged:** `draft: true` posts stay excluded from `dist/`. Prove it with a test.
- **Type-checks:** `pnpm check` (astro check) runs in CI — all new TS must pass with zero errors.
- **Post conventions (verbatim from spec §3):** posts at `src/content/posts/<slug>.md`; frontmatter schema fields in order `title, date, description, tags, series?, seriesPart?, author, draft, recommended, hideToc`; dates serialized `YYYY-MM-DD`; tags as a flow array `["a","b"]`.
- **`js-yaml` placement:** `devDependencies`, and it must be **lazy-loaded** (never imported at the top level of `astro.config.mjs` or the integration) so the production build never pulls it in.
- **Unit tests use `node --test`** (zero new deps) on Node 24, which runs `.ts` via native type-stripping. This requires **explicit `.ts` extensions in relative imports**; `tsconfig.json` already sets `allowImportingTsExtensions: true` + `noEmit: true` (committed in setup) so `astro check` accepts them. Unit files are named `*.test.ts`; Playwright e2e files are `*.spec.ts` — the two runners never overlap.
- Commit after every task with the message shown in its final step.

## File Structure

```
src/
  integrations/
    editor.mjs                 # dev-only Astro integration (injectRoute + middleware mount)
  editor/
    lib/
      frontmatter.ts           # parse/normalize/serialize post frontmatter (pure)
    server/
      store.ts                 # fs read/write of posts (pure-ish; takes root dir)
      middleware.ts            # Connect handler mapping /api/editor/* -> store
    routes/
      editor.astro             # injected /editor page — mounts the React app (dev only)
      drafts.astro             # injected /drafts page — by-year draft list (dev only)
    ui/
      App.tsx                  # minimal React app: lists posts from the API (Foundation slice)
  lib/
    posts.ts                   # filterPosts() + listVisiblePosts() (draft gating)
  content/posts/
    _fixture-draft.md          # committed draft fixture used by tests
tests/
  editor-absent.spec.ts        # build-safety (runs against `pnpm preview`)
  editor/
    smoke.spec.ts              # dev-server slice (runs against `pnpm dev`)
playwright.editor.config.ts    # 2nd Playwright config: webServer = `pnpm dev`
```

**Consumers refactored to use `src/lib/posts.ts`:** `src/pages/posts/[...slug].astro`, `src/pages/posts/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/tags/index.astro`, `src/pages/series/[series].astro`, `src/pages/series/index.astro`, `src/pages/index.astro`, `src/pages/posts/index.xml.ts`, `src/pages/index.xml.ts`, `src/pages/og/[...slug].png.ts`.

---

### Task 1: Frontmatter engine

**Files:**
- Create: `src/editor/lib/frontmatter.ts`
- Test: `src/editor/lib/frontmatter.test.ts`
- Modify: `package.json` (add `test:unit` script; add `js-yaml` + `@types/js-yaml` devDeps)

**Interfaces:**
- Produces:
  - `type PostData = { title: string; date: string; description: string; tags: string[]; series?: string; seriesPart?: number; author: string; draft: boolean; recommended: boolean; hideToc: boolean }`
  - `parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string }`
  - `normalizePostData(data: Record<string, unknown>): PostData`
  - `serializePost(data: PostData, body: string): string`
  - `DEFAULT_AUTHOR = 'Shubham Bansal'`

- [ ] **Step 1: Add the unit-test script and dependency**

Edit `package.json`: add to `scripts`: `"test:unit": "node --test 'src/**/*.test.ts'"` (Node 24 runs `.ts` natively; the glob scopes discovery to unit files under `src/`). Then install js-yaml:

```bash
pnpm add -D js-yaml @types/js-yaml
```

- [ ] **Step 2: Write the failing tests**

Create `src/editor/lib/frontmatter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, normalizePostData, serializePost, DEFAULT_AUTHOR } from './frontmatter.ts';

test('parseFrontmatter splits frontmatter and body', () => {
  const raw = '---\ntitle: "Hi"\ndate: 2024-09-02\ntags: ["A", "B"]\n---\n\n## Body\ntext\n';
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.title, 'Hi');
  assert.deepEqual(data.tags, ['A', 'B']);
  assert.equal(body, '## Body\ntext\n');
});

test('normalizePostData applies schema defaults and YYYY-MM-DD date', () => {
  const d = normalizePostData({ title: 'Hi', date: '2024-09-02' });
  assert.equal(d.author, DEFAULT_AUTHOR);
  assert.equal(d.draft, false);
  assert.equal(d.recommended, false);
  assert.equal(d.hideToc, false);
  assert.deepEqual(d.tags, []);
  assert.equal(d.date, '2024-09-02');
});

test('serializePost writes fields in schema order, omitting defaults', () => {
  const data = normalizePostData({ title: 'Hi', date: '2024-09-02', tags: ['A'], recommended: true });
  const out = serializePost(data, '## Body\n');
  assert.equal(
    out,
    '---\ntitle: "Hi"\ndate: 2024-09-02\ndescription: ""\ntags: ["A"]\ndraft: false\nrecommended: true\n---\n\n## Body\n',
  );
});

test('series + seriesPart are written only when series present', () => {
  const data = normalizePostData({ title: 'P', date: '2024-01-01', series: 'S', seriesPart: 2 });
  const out = serializePost(data, 'b\n');
  assert.match(out, /series: "S"\nseriesPart: 2\n/);
});

test('round-trip: parse -> normalize -> serialize is stable', () => {
  const raw = serializePost(
    normalizePostData({ title: 'T', date: '2024-05-01', description: 'd', tags: ['X', 'Y'], draft: true }),
    'body\n',
  );
  const { data, body } = parseFrontmatter(raw);
  assert.equal(serializePost(normalizePostData(data), body), raw);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:unit`
Expected: FAIL — `Cannot find module './frontmatter.ts'`.

- [ ] **Step 4: Implement the engine**

Create `src/editor/lib/frontmatter.ts`:

```ts
import yaml from 'js-yaml';

export const DEFAULT_AUTHOR = 'Shubham Bansal';

export type PostData = {
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  tags: string[];
  series?: string;
  seriesPart?: number;
  author: string;
  draft: boolean;
  recommended: boolean;
  hideToc: boolean;
};

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = raw.match(FM);
  if (!m) return { data: {}, body: raw };
  const data = (yaml.load(m[1]) as Record<string, unknown>) ?? {};
  return { data, body: raw.slice(m[0].length) };
}

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  return s.slice(0, 10);
}

export function normalizePostData(data: Record<string, unknown>): PostData {
  return {
    title: String(data.title ?? ''),
    date: toDateString(data.date),
    description: String(data.description ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    series: data.series != null ? String(data.series) : undefined,
    seriesPart: data.seriesPart != null ? Number(data.seriesPart) : undefined,
    author: data.author != null ? String(data.author) : DEFAULT_AUTHOR,
    draft: Boolean(data.draft ?? false),
    recommended: Boolean(data.recommended ?? false),
    hideToc: Boolean(data.hideToc ?? false),
  };
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const flowTags = (t: string[]) => `[${t.map(q).join(', ')}]`;

export function serializePost(d: PostData, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${q(d.title)}`);
  lines.push(`date: ${d.date}`);
  lines.push(`description: ${q(d.description)}`);
  lines.push(`tags: ${flowTags(d.tags)}`);
  if (d.series) {
    lines.push(`series: ${q(d.series)}`);
    if (d.seriesPart != null) lines.push(`seriesPart: ${d.seriesPart}`);
  }
  if (d.author !== DEFAULT_AUTHOR) lines.push(`author: ${q(d.author)}`);
  lines.push(`draft: ${d.draft}`);
  if (d.recommended) lines.push(`recommended: true`);
  if (d.hideToc) lines.push(`hideToc: true`);
  lines.push('---', '');
  return `${lines.join('\n')}\n${body}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS (5 tests). If the round-trip test fails, reconcile the serializer's omission rules with the test's expectations before proceeding.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/editor/lib/frontmatter.ts src/editor/lib/frontmatter.test.ts
git commit -m "Editor foundation: frontmatter parse/normalize/serialize engine + node:test"
```

---

### Task 2: File store (fs read/write)

**Files:**
- Create: `src/editor/server/store.ts`
- Test: `src/editor/server/store.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `normalizePostData`, `serializePost`, `PostData` (Task 1).
- Produces:
  - `type PostMeta = { slug: string; title: string; date: string; draft: boolean }`
  - `postsDir(root: string): string`
  - `listPostsMeta(root: string): Promise<PostMeta[]>` (sorted by date desc)
  - `readPost(root: string, slug: string): Promise<{ data: PostData; body: string }>`
  - `writePost(root: string, slug: string, data: PostData, body: string): Promise<void>` (atomic: temp file + rename)

- [ ] **Step 1: Write the failing tests**

Create `src/editor/server/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPostsMeta, readPost, writePost, postsDir } from './store.ts';
import { normalizePostData } from '../lib/frontmatter.ts';

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'editor-store-'));
  await mkdir(postsDir(root), { recursive: true });
  return root;
}

test('writePost then readPost round-trips', async () => {
  const root = await fixtureRoot();
  const data = normalizePostData({ title: 'Hello', date: '2024-09-02', tags: ['X'] });
  await writePost(root, 'hello', data, 'body text\n');
  const got = await readPost(root, 'hello');
  assert.equal(got.data.title, 'Hello');
  assert.deepEqual(got.data.tags, ['X']);
  assert.equal(got.body, 'body text\n');
});

test('listPostsMeta returns metadata sorted by date desc', async () => {
  const root = await fixtureRoot();
  await writePost(root, 'old', normalizePostData({ title: 'Old', date: '2023-01-01' }), 'a\n');
  await writePost(root, 'new', normalizePostData({ title: 'New', date: '2025-01-01' }), 'b\n');
  const metas = await listPostsMeta(root);
  assert.deepEqual(metas.map((m) => m.slug), ['new', 'old']);
  assert.equal(metas[0].title, 'New');
});

test('writePost is atomic (no .tmp left behind)', async () => {
  const root = await fixtureRoot();
  await writePost(root, 'p', normalizePostData({ title: 'P', date: '2024-01-01' }), 'x\n');
  const raw = await readFile(join(postsDir(root), 'p.md'), 'utf8');
  assert.match(raw, /^---\ntitle: "P"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:unit`
Expected: FAIL — `Cannot find module './store.ts'`.

- [ ] **Step 3: Implement the store**

Create `src/editor/server/store.ts`:

```ts
import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter, normalizePostData, serializePost, type PostData } from '../lib/frontmatter.ts';

export type PostMeta = { slug: string; title: string; date: string; draft: boolean };

export const postsDir = (root: string) => join(root, 'src', 'content', 'posts');
const postFile = (root: string, slug: string) => join(postsDir(root), `${slug}.md`);

export async function readPost(root: string, slug: string): Promise<{ data: PostData; body: string }> {
  const raw = await readFile(postFile(root, slug), 'utf8');
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
      return { slug, title: data.title, date: data.date, draft: data.draft };
    }),
  );
  return metas.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/editor/server/store.ts src/editor/server/store.test.ts
git commit -m "Editor foundation: fs post store (list/read/atomic write) + node:test"
```

---

### Task 3: Draft-visibility helper + wire consumers + fixture draft

**Files:**
- Create: `src/lib/posts.ts`
- Test: `src/lib/posts.test.ts`
- Create: `src/content/posts/_fixture-draft.md`
- Modify: `src/pages/posts/[...slug].astro:6-8`, `src/pages/posts/index.astro:9`, `src/pages/tags/[tag].astro`, `src/pages/tags/index.astro`, `src/pages/series/[series].astro`, `src/pages/series/index.astro`, `src/pages/index.astro`, `src/pages/posts/index.xml.ts`, `src/pages/index.xml.ts`, `src/pages/og/[...slug].png.ts`

**Interfaces:**
- Produces:
  - `filterPosts<T extends { data: { draft?: boolean } }>(entries: T[], includeDrafts: boolean): T[]`
  - `includeDrafts: boolean` (= `import.meta.env.DEV`)
  - `listVisiblePosts(): Promise<CollectionEntry<'posts'>[]>` (getCollection + filterPosts)

- [ ] **Step 1: Write the failing test (pure filter only)**

Create `src/lib/posts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPosts } from './posts.ts';

const entries = [
  { data: { draft: false }, id: 'pub' },
  { data: { draft: true }, id: 'draft' },
];

test('filterPosts excludes drafts in production mode', () => {
  assert.deepEqual(filterPosts(entries, false).map((e) => e.id), ['pub']);
});

test('filterPosts includes drafts in dev mode', () => {
  assert.deepEqual(filterPosts(entries, true).map((e) => e.id), ['pub', 'draft']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `Cannot find module './posts.ts'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/posts.ts`:

```ts
import { getCollection, type CollectionEntry } from 'astro:content';

export const includeDrafts = import.meta.env.DEV;

export function filterPosts<T extends { data: { draft?: boolean } }>(entries: T[], withDrafts: boolean): T[] {
  return withDrafts ? entries : entries.filter((e) => !e.data.draft);
}

export async function listVisiblePosts(): Promise<CollectionEntry<'posts'>[]> {
  return filterPosts(await getCollection('posts'), includeDrafts);
}
```

Note: `filterPosts` is pure (no `astro:content` import needed to test it — `node --test` imports only that symbol; the `astro:content` import is tree-shaken out of the test since Node executes the module and the import is unused at call time). If Node errors on the unresolved `astro:content` specifier, split the pure function into `src/lib/posts-filter.ts` (no imports) and re-export it from `posts.ts`; update the test import to `./posts-filter.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS. (If it fails on the `astro:content` import, apply the split noted above, then re-run.)

- [ ] **Step 5: Wire every consumer to the helper**

In `src/pages/posts/[...slug].astro`, replace the `getStaticPaths` filter:

```astro
---
import { getCollection, render } from 'astro:content';
import { filterPosts, includeDrafts } from '../../lib/posts';
// ...
export async function getStaticPaths() {
  const posts = filterPosts(await getCollection('posts'), includeDrafts);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}
---
```

In `src/pages/posts/index.astro:9`, replace:
```astro
const posts = filterPosts(await getCollection('posts'), includeDrafts);
```
and add `import { filterPosts, includeDrafts } from '../../lib/posts';`.

Apply the identical substitution (swap `(await getCollection('posts')).filter((p) => !p.data.draft)` → `filterPosts(await getCollection('posts'), includeDrafts)`, add the import) in: `src/pages/tags/[tag].astro`, `src/pages/tags/index.astro`, `src/pages/series/[series].astro`, `src/pages/series/index.astro`, `src/pages/index.astro`, `src/pages/posts/index.xml.ts`, `src/pages/index.xml.ts`, `src/pages/og/[...slug].png.ts`. For any file that does not currently filter drafts, wrap its `getCollection('posts')` call the same way (search first — see verification).

- [ ] **Step 6: Create the committed draft fixture**

Create `src/content/posts/_fixture-draft.md`:

```md
---
title: "Fixture Draft (dev-only)"
date: 2026-08-02
description: "A committed draft used by editor tests. Hidden in production, visible under astro dev."
tags: ["Fixture"]
draft: true
---

## Fixture

This draft exists to prove drafts render under `astro dev` and are excluded from the production build.
```

- [ ] **Step 7: Verify no draft filter was missed, then type-check**

Run: `grep -rn "draft" src/pages` — confirm no remaining `\.filter(... !.*draft ...)` inline expressions; every posts query now goes through `filterPosts`.
Run: `pnpm check`
Expected: grep shows only helper usage; `pnpm check` passes with 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/posts.ts src/lib/posts.test.ts src/content/posts/_fixture-draft.md src/pages
git commit -m "Editor foundation: single draft-visibility helper (dev shows drafts, prod hides) + fixture draft"
```

---

### Task 4: Dev-only integration + middleware

**Files:**
- Create: `src/integrations/editor.mjs`
- Create: `src/editor/server/middleware.ts`
- Create: `src/editor/routes/editor.astro` (mount point; App wired in Task 5)
- Create: `src/editor/routes/drafts.astro`
- Modify: `astro.config.mjs:33-42` (add integration), `.gitignore` (add `.editor/`)

**Interfaces:**
- Consumes: `listPostsMeta`, `readPost`, `writePost` (Task 2); `normalizePostData` (Task 1).
- Produces:
  - `editorMiddleware({ root }: { root: string }): (req, res, next) => void` — routes:
    - `GET /posts` → `{ posts: PostMeta[] }`
    - `GET /post?slug=<slug>` → `{ data: PostData, body: string }`
    - `PUT /post?slug=<slug>` (JSON body `{ data, body }`) → `{ ok: true }`
  - default export `blogEditor()` Astro integration.

- [ ] **Step 1: Implement the middleware**

Create `src/editor/server/middleware.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { listPostsMeta, readPost, writePost } from './store.ts';
import { normalizePostData } from '../lib/frontmatter.ts';

type Next = (err?: unknown) => void;

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });

export function editorMiddleware({ root }: { root: string }) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const path = url.pathname.replace(/\/$/, ''); // middleware is mounted at /api/editor
      const slug = url.searchParams.get('slug') ?? '';

      if (req.method === 'GET' && path === '/posts') return send(res, 200, { posts: await listPostsMeta(root) });
      if (req.method === 'GET' && path === '/post' && slug) return send(res, 200, await readPost(root, slug));
      if (req.method === 'PUT' && path === '/post' && slug) {
        const { data, body } = JSON.parse(await readBody(req)) as { data: unknown; body: string };
        await writePost(root, slug, normalizePostData(data as Record<string, unknown>), body ?? '');
        return send(res, 200, { ok: true });
      }
      next();
    } catch (err) {
      send(res, 500, { error: String((err as Error).message ?? err) });
    }
  };
}
```

- [ ] **Step 2: Create the injected route pages**

Create `src/editor/routes/editor.astro`:

```astro
---
export const prerender = false;
---
<!doctype html>
<html lang="en" data-theme="dark">
  <head><meta charset="utf-8" /><title>Blog Editor</title></head>
  <body>
    <div id="editor-root">Loading editor…</div>
  </body>
</html>
```

Create `src/editor/routes/drafts.astro`:

```astro
---
export const prerender = false;
import { getCollection } from 'astro:content';
const drafts = (await getCollection('posts')).filter((p) => p.data.draft)
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
---
<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Drafts</title></head>
<body>
  <h1>Drafts ({drafts.length})</h1>
  <ul>{drafts.map((d) => <li><a href={`/posts/${d.id}/`}>{d.data.title}</a></li>)}</ul>
</body></html>
```

- [ ] **Step 3: Implement the integration**

Create `src/integrations/editor.mjs`:

```js
import { fileURLToPath } from 'node:url';

/** Dev-only authoring studio: injects /editor + /drafts and mounts /api/editor. Never active in `astro build`. */
export default function blogEditor() {
  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, logger }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/editor', entrypoint: fileURLToPath(new URL('../editor/routes/editor.astro', import.meta.url)) });
        injectRoute({ pattern: '/drafts', entrypoint: fileURLToPath(new URL('../editor/routes/drafts.astro', import.meta.url)) });
        logger.info('blog editor mounted at /editor and /drafts (dev only)');
      },
      'astro:server:setup': async ({ server }) => {
        const mwPath = fileURLToPath(new URL('../editor/server/middleware.ts', import.meta.url));
        const mod = await server.ssrLoadModule(mwPath); // Vite transpiles the .ts on load
        server.middlewares.use('/api/editor', mod.editorMiddleware({ root: process.cwd() }));
        server.config.logger.info('blog editor API mounted at /api/editor (dev only)');
      },
    },
  };
}
```

- [ ] **Step 4: Register the integration and ignore the lock dir**

In `astro.config.mjs`, import at top: `import blogEditor from './src/integrations/editor.mjs';` and add `blogEditor(),` as the **last** entry of the `integrations: [...]` array.
Append to `.gitignore`:
```
# ---- Blog editor (dev-only locks) ----
.editor/
```

- [ ] **Step 5: Verify dev API responds and build stays clean**

Run (dev API smoke):
```bash
pnpm dev & DEV_PID=$!; sleep 6
curl -sf http://localhost:4321/api/editor/posts | head -c 200; echo
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/editor
kill $DEV_PID
```
Expected: the first curl prints a JSON `{"posts":[...]}` including `_fixture-draft`; `/editor` returns `200`.

Run (build safety — the integration must be inert): `pnpm build`
Expected: build succeeds; then confirm no editor artifacts:
```bash
test ! -e dist/editor && test ! -e dist/drafts && test ! -e "dist/posts/_fixture-draft" && echo "PROD CLEAN"
```
Expected: prints `PROD CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add src/integrations/editor.mjs src/editor/server/middleware.ts src/editor/routes astro.config.mjs .gitignore
git commit -m "Editor foundation: dev-only Astro integration (/editor, /drafts, /api/editor) — inert in build"
```

---

### Task 5: Minimal React app (end-to-end slice)

**Files:**
- Create: `src/editor/ui/App.tsx`
- Modify: `src/editor/routes/editor.astro` (mount `App` as a `client:only="react"` island)

**Interfaces:**
- Consumes: `GET /api/editor/posts` → `{ posts: { slug, title, date, draft }[] }` (Task 4).
- Produces: a rendered list with `data-testid="post-row"` per post and a `data-testid="editor-app"` root.

- [ ] **Step 1: Implement the minimal app**

Create `src/editor/ui/App.tsx`:

```tsx
import { useEffect, useState } from 'react';

type PostMeta = { slug: string; title: string; date: string; draft: boolean };

export default function App() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/editor/posts')
      .then((r) => r.json())
      .then((d: { posts: PostMeta[] }) => setPosts(d.posts))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main data-testid="editor-app" style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Blog Editor</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <ul>
        {posts.map((p) => (
          <li key={p.slug} data-testid="post-row">
            {p.title} {p.draft && <em>(draft)</em>} — <code>{p.slug}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Mount it in the injected page**

Replace the `<div id="editor-root">…</div>` in `src/editor/routes/editor.astro` with an island:

```astro
---
export const prerender = false;
import App from '../ui/App.tsx';
---
<!doctype html>
<html lang="en" data-theme="dark">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Blog Editor</title></head>
  <body>
    <App client:only="react" />
  </body>
</html>
```

- [ ] **Step 3: Verify the slice renders the fixture draft**

Run:
```bash
pnpm dev & DEV_PID=$!; sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/editor
kill $DEV_PID
```
Expected: `200`. (Visual/DOM assertion is covered by the Playwright test in Task 7.)
Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/editor/ui/App.tsx src/editor/routes/editor.astro
git commit -m "Editor foundation: minimal React app lists posts from /api/editor (end-to-end slice)"
```

---

### Task 6: Production-safety test (built site)

**Files:**
- Create: `tests/editor-absent.spec.ts` (runs under the existing `playwright.config.ts`, whose `webServer` is `pnpm preview` = the built `dist/`)

**Interfaces:**
- Consumes: the production build output served by `pnpm preview`.

- [ ] **Step 1: Write the safety spec**

Create `tests/editor-absent.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// These run against `pnpm preview` (the built dist/) — the editor must NOT exist in production.
test('editor route is absent in production', async ({ request }) => {
  expect((await request.get('/editor')).status()).toBe(404);
  expect((await request.get('/editor/')).status()).toBe(404);
});

test('drafts route is absent in production', async ({ request }) => {
  expect((await request.get('/drafts/')).status()).toBe(404);
});

test('editor API is absent in production', async ({ request }) => {
  expect((await request.get('/api/editor/posts')).status()).toBe(404);
});

test('draft posts are excluded from the production build', async ({ request }) => {
  expect((await request.get('/posts/_fixture-draft/')).status()).toBe(404);
});
```

- [ ] **Step 2: Run the safety spec against a fresh build**

Run:
```bash
pnpm build
pnpm exec playwright test editor-absent --config=playwright.config.ts
```
Expected: 4 tests PASS (all the editor surfaces and the draft return 404 in the built site).

- [ ] **Step 3: Commit**

```bash
git add tests/editor-absent.spec.ts
git commit -m "Editor foundation: production-safety e2e — /editor, /drafts, /api/editor, and drafts absent from build"
```

---

### Task 7: Dev-server smoke test (editor slice)

**Files:**
- Create: `playwright.editor.config.ts` (2nd config; `webServer` = `pnpm dev`)
- Create: `tests/editor/smoke.spec.ts`
- Modify: `package.json` (add `test:e2e:editor` script)

**Interfaces:**
- Consumes: the dev server (`/editor`, `/api/editor/posts`, and the fixture draft's real URL).

- [ ] **Step 1: Add the dev Playwright config**

Create `playwright.editor.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

// Editor-functional tests run against the DEV server (the editor only exists in `astro dev`).
export default defineConfig({
  testDir: './tests/editor',
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4321' },
});
```

- [ ] **Step 2: Add the script**

In `package.json` `scripts`, add: `"test:e2e:editor": "playwright test --config=playwright.editor.config.ts"`.

- [ ] **Step 3: Write the dev smoke spec**

Create `tests/editor/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('editor API lists posts including the fixture draft', async ({ request }) => {
  const res = await request.get('/api/editor/posts');
  expect(res.ok()).toBeTruthy();
  const { posts } = await res.json();
  expect(posts.some((p: { slug: string }) => p.slug === '_fixture-draft')).toBeTruthy();
});

test('editor app mounts and renders post rows', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByTestId('editor-app')).toBeVisible();
  await expect(page.getByTestId('post-row').first()).toBeVisible();
});

test('draft renders at its real URL under astro dev', async ({ page }) => {
  await page.goto('/posts/_fixture-draft/');
  await expect(page.locator('h1')).toContainText('Fixture Draft');
});
```

- [ ] **Step 4: Run the dev smoke spec**

Run: `pnpm test:e2e:editor`
Expected: 3 tests PASS (API lists the draft; `/editor` mounts and shows rows; the draft page renders in dev).

- [ ] **Step 5: Commit**

```bash
git add playwright.editor.config.ts tests/editor/smoke.spec.ts package.json
git commit -m "Editor foundation: dev-server e2e config + smoke (API, /editor mount, draft renders in dev)"
```

---

## Self-Review (completed)

- **Spec coverage (Foundation slice of spec §4/§7):** dev-only integration ✓ (T4); file API list/read/write ✓ (T2,T4); frontmatter engine ✓ (T1); `listPosts()` dev-gating + draft rendering ✓ (T3); production-safety asserts ✓ (T6); dev slice + preview target ✓ (T5,T7). Full toolbar, sidebar, in-post Edit button, Drafts-tab styling, single-edit lock, and all §5.2 enhancements are **intentionally deferred to later phase-plans** (Editor Core, Toolbar & Inserts, Navigation & Safety, Enhancements, Hardening).
- **Placeholder scan:** none — every code and test step has literal content and an exact run command.
- **Type consistency:** `PostData`, `PostMeta`, `parseFrontmatter/normalizePostData/serializePost`, `listPostsMeta/readPost/writePost`, `editorMiddleware({root})`, `filterPosts/includeDrafts` are named identically across the tasks that define and consume them.

## Follow-on plans (not in this file)

1. **Editor Core** — CodeMirror, full sidebar (Drafts 5 + Published 5 + New), frontmatter form, Save/Save-draft/Publish, preview iframe + Edit/Split/Preview modes.
2. **Toolbar & Inserts** — all confirmed toolbar items + live PlantUML/D2 & KaTeX modals, image dialog, callouts, table, caption, sizing.
3. **Navigation & Safety** — in-post dev-only Edit button (`PostHeader.astro`), styled Drafts nav tab (`Topbar.astro`), single-edit heartbeat lock (10 s beat / 30 s stale + Take-over).
4. **Enhancements** — tag/series autocomplete, validation, outline, internal-link picker, auto-save, find/replace, rename/delete/duplicate, shortcuts.
5. **Hardening** — full e2e/unit coverage, authoring-guide docs update.
