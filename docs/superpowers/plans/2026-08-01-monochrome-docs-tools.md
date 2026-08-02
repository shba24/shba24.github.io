# Monochrome Docs — Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the reader/author tooling to the Foundation site: RSS feeds, JSON-LD SEO, Pagefind `⌘K` search, OG images, image zoom, Related/Series navigation, and Giscus comments — all on branch `astro-rebuild`, Hugo still live on `main`.

**Architecture:** Static-first. Search/comments/zoom are React or vanilla islands hydrated on demand. RSS/OG/JSON-LD are build-time. Everything degrades gracefully with JS off.

**Tech Stack:** `@astrojs/rss`, `astro-pagefind`, `astro-og-canvas`, `medium-zoom`, `@astrojs/react` (existing), Giscus (`@giscus/react`).

## Global Constraints
- Branch `astro-rebuild`; do NOT touch `main` or delete Hugo files (that's Migration).
- Monochrome only; dark default. No colored accents beyond white emphasis.
- **RSS main feed MUST be at `/index.xml`** and posts feed at `/posts/index.xml` (SEO parity — see `docs/superpowers/specs/url-parity-checklist.md`).
- Verification = `pnpm check` (0 errors) + `pnpm build` (exit 0) + `pnpm test:e2e` (existing 3 smoke + new ones stay green).
- Giscus config values (repo id, category id) are unknown until the user enables Discussions — gate Giscus so it renders only when configured via `src/consts.ts`, and never breaks the build when unset.

## File Structure
```
src/consts.ts                    # site config: SITE_URL, AUTHOR, GISCUS {repo, repoId, category, categoryId} (empty until enabled)
src/pages/index.xml.ts           # main RSS  -> /index.xml
src/pages/posts/index.xml.ts     # posts RSS -> /posts/index.xml
src/lib/seo.ts                   # buildArticleJsonLd(), buildWebsiteJsonLd()
src/components/JsonLd.astro      # <script type="application/ld+json">
src/components/Search.astro      # ⌘K trigger + dialog wrapper (astro-pagefind <Search/>)
src/components/Comments.tsx      # Giscus React island (theme-synced), gated
src/components/Related.astro     # related posts (shared tags/series)
src/components/SeriesNav.astro   # in-series part list
src/components/ZoomImages.astro  # medium-zoom island (script)
src/pages/og/[...slug].png.ts    # OG image route (astro-og-canvas)
```

---

### Task 1: Site consts + RSS feeds (`/index.xml`, `/posts/index.xml`)
**Files:** Create `src/consts.ts`, `src/pages/index.xml.ts`, `src/pages/posts/index.xml.ts`. Add `@astrojs/rss` dep.
**Interfaces:** Produces `SITE`, `AUTHOR`, `GISCUS` from consts; feeds at the two parity paths.

- [ ] **Step 1** `src/consts.ts`:
```ts
export const SITE = { url: 'https://shubham-bansal.com', title: 'Shubham Bansal', description: 'Technical blog by Shubham Bansal' };
export const AUTHOR = { name: 'Shubham Bansal', role: 'Senior SWE · AWS Lake Formation' };
// Filled once GitHub Discussions + giscus app are enabled; empty = comments hidden.
export const GISCUS = { repo: 'shba24/shba24.github.io', repoId: '', category: 'Announcements', categoryId: '' };
```
- [ ] **Step 2** `pnpm add @astrojs/rss`. Write `src/pages/index.xml.ts`:
```ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE } from '../consts';
export async function GET(context) {
  const posts = (await getCollection('posts')).filter((p) => !p.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return rss({
    title: SITE.title, description: SITE.description, site: context.site ?? SITE.url,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/posts/${p.id}/` })),
  });
}
```
- [ ] **Step 3** `src/pages/posts/index.xml.ts`: identical but title "Posts — {SITE.title}".
- [ ] **Step 4** Verify `pnpm build`; confirm `dist/index.xml` and `dist/posts/index.xml` exist and list the Iceberg post. Commit `feat: RSS feeds at /index.xml and /posts/index.xml`.

---

### Task 2: JSON-LD structured data
**Files:** Create `src/lib/seo.ts`, `src/components/JsonLd.astro`; wire into `BaseLayout` (WebSite) and `PostLayout` (Article).
- [ ] **Step 1** `seo.ts` exports `buildWebsiteJsonLd(site)` and `buildArticleJsonLd({title,description,date,author,url,image})` returning plain objects (schema.org WebSite / BlogPosting).
- [ ] **Step 2** `JsonLd.astro` takes a `data` prop and renders `<script type="application/ld+json" set:html={JSON.stringify(data)} />`.
- [ ] **Step 3** Home renders WebSite JSON-LD; `PostLayout` renders BlogPosting JSON-LD (image = the post's OG image URL from Task 5, `/og/<slug>.png`).
- [ ] **Step 4** `pnpm build`; grep a built post HTML for `application/ld+json` + `BlogPosting`. Commit.

---

### Task 3: Pagefind `⌘K` search
**Files:** `pnpm add astro-pagefind`; add integration to `astro.config.mjs` (AFTER build); create `src/components/Search.astro`; add trigger to `Topbar`.
- [ ] **Step 1** Add `pagefind()` integration (from `astro-pagefind`) — it builds the index on `astro build` and serves it in `astro preview`.
- [ ] **Step 2** `Search.astro`: a `⌘K`-triggered `<dialog>` containing astro-pagefind's `<Search id="search" className="pagefind-ui" uiOptions={{ showImages:false }} />`; keyboard shortcut (⌘K/Ctrl-K) opens it, Esc closes. Style the pagefind UI to monochrome tokens (override `--pagefind-ui-*` vars).
- [ ] **Step 3** Replace the Topbar static "Search ⌘K" span with the `Search` component trigger.
- [ ] **Step 4** `pnpm build` (index builds), `pnpm preview`, confirm searching "Iceberg" returns the post. Add a smoke test: `⌘K` opens the dialog. Commit.

---

### Task 4: OG images (per post)
**Files:** `pnpm add astro-og-canvas`; create `src/pages/og/[...slug].png.ts`; wire `og:image`/`twitter:card` meta in `BaseLayout` head (accept optional `image` prop).
- [ ] **Step 1** OG route uses `OGImageRoute` over the `posts` collection; monochrome card: near-black bg, white title, mono eyebrow (series·part), muted author — matching the site.
- [ ] **Step 2** `BaseLayout` accepts `image?: string`; PostLayout passes `/og/<slug>.png`; head emits `og:image`, `og:image:width/height` (1200×630), `twitter:card=summary_large_image`.
- [ ] **Step 3** `pnpm build`; confirm `dist/og/iceberg-table-format-part1.png` exists and post HTML has `og:image`. Commit.

---

### Task 5: Image zoom
**Files:** `pnpm add medium-zoom`; create `src/components/ZoomImages.astro` (a `<script>` that runs `mediumZoom('article .prose img', { background: 'rgba(12,13,15,.9)' })`); include it in `PostLayout`.
- [ ] Verify build + that the script targets prose images only. Commit.

---

### Task 6: Related posts + Series navigator
**Files:** Create `src/components/Related.astro` and `src/components/SeriesNav.astro`; render both in `PostLayout` below the article.
- [ ] **Related:** up to 4 posts sharing the most tags (exclude self, exclude drafts); hide if none.
- [ ] **SeriesNav:** if the post has `series`, list all posts in that series ordered by `seriesPart`/date, marking the current one; hide otherwise. Monochrome card styling matching the mockup.
- [ ] Verify build + that with one post they render empty/hidden gracefully. Commit.

---

### Task 7: Giscus comments (gated)
**Files:** `pnpm add @giscus/react`; create `src/components/Comments.tsx` (React island); render in `PostLayout` (`client:visible`) only when `GISCUS.repoId` is set.
- [ ] **Step 1** `Comments.tsx` renders `<Giscus>` with values from `consts.GISCUS`, `theme` synced to `document.documentElement.dataset.theme`, `mapping="pathname"`, lazy loading.
- [ ] **Step 2** In `PostLayout`, render `{GISCUS.repoId && <Comments client:visible slug={post.id} />}` so an unconfigured build simply omits comments (no error).
- [ ] **Step 3** `pnpm build` + `pnpm check` pass with `repoId` empty (comments absent). Commit. (User enables Discussions + fills `repoId`/`categoryId` later.)

---

## Self-Review
- Spec coverage: search (T3), comments (T7), OG (T4), RSS parity (T1), JSON-LD (T2), image zoom (T5), related/series (T6) — all from spec §5. Analytics cleanup + sitemap `/sitemap.xml` are **Migration** (not here).
- Placeholder scan: Giscus values intentionally empty and gated — documented, not a gap.
- Type consistency: `SITE`/`AUTHOR`/`GISCUS` from `consts.ts` consumed by RSS/SEO/Comments; OG slug path `/og/<post.id>.png` matches the route + JSON-LD/meta image.

## Execution Handoff
Subagent-driven, one fresh implementer per task + task review, final whole-branch review. Keep branch (no merge — cutover is Migration).
