# Monochrome Docs — Migration & Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Port all remaining content, guarantee SEO URL parity, port Cloudflare analytics, remove Hugo, wire the GitHub Pages deploy, and cut over `main` to Astro — with `docs/superpowers/specs/url-parity-checklist.md` enforced by a CI gate.

**Architecture:** Finish the content set, add redirects/sitemap/parity, swap the deploy workflow, then merge `astro-rebuild` → `main` (which triggers the live deploy). Cutover is gated on explicit human approval.

**Tech Stack:** Astro content collections, Astro `redirects`, `@astrojs/sitemap`, GitHub Actions Pages deploy.

## Global Constraints
- Branch `astro-rebuild`. **The final cutover (Task 8, merge to `main`) requires explicit human approval — never merge to `main` autonomously.**
- Enforce every must-match URL in `docs/superpowers/specs/url-parity-checklist.md`.
- KEEP Cloudflare Web Analytics — port the beacon (token `fd0bbd0149124eeea3afab47dd84a12c`); do NOT add GA/Plausible.
- Verification = `pnpm check` + `pnpm build` + `pnpm test:e2e` green at every task; plus the URL-parity gate (Task 6) once added.

---

### Task 1: Port Redis + MemoryDB posts
**Files:** `src/content/posts/distributed-cache-series-part-1-redis.md`, `...part-2-memorydb.md`; images → `public/images/blog-redis-part1/`, `public/images/blog-memorydb-part2/`.
- [ ] Copy each Hugo body from `content/posts/…`, convert `+++`TOML→YAML frontmatter (title, date, description, tags **verbatim from the originals** — preserve exact tag spellings for slug parity, e.g. "Data Anlytics" stays if present, "cache"/"redis"/etc.), `series: "Distributed Cache"`, `seriesPart` 1/2, `recommended` as desired.
- [ ] Convert any Hugo shortcodes (highlight→fenced; mermaid/plantuml/tabs/details→fenced or plain — no raw `{{ }}`). Copy images from `static/images/blog-redis-part1/` + `blog-memorydb-part2/` into `public/images/…` (keep `/images/...` refs).
- [ ] `pnpm build`; confirm `/posts/distributed-cache-series-part-1-redis/` + `…part-2-memorydb/` render, SeriesNav now shows the Distributed Cache series, tag pages regenerate. Commit per post.

### Task 2: Port About + References + section indexes
**Files:** `src/content/pages/about.md`, `src/content/pages/useful-technical-blogs.md`; routes `src/pages/about.astro`, `src/pages/references/index.astro`, `src/pages/references/[...slug].astro`; `src/pages/tags/index.astro`, `src/pages/series/index.astro`.
- [ ] Port About (`content/about/about.md`) → renders at `/about/`. Port References article (`content/references/useful-technical-blogs.md`) → `/references/useful-technical-blogs/`, with `/references/` index listing reference articles.
- [ ] Add `/tags/` and `/series/` index pages (list all tags/series with links) — Hugo had these.
- [ ] Extract the shared list markup into `src/components/EntryList.astro` (resolves the Foundation M11 note) and use it in home/posts/tags/series/references indexes.
- [ ] `pnpm build`; confirm all these URLs exist. Commit.

### Task 3: Redirects + sitemap parity
**Files:** `astro.config.mjs` (`redirects`), sitemap config.
- [ ] Add `redirects`: `/tags/data-anlytics/`→`/tags/data-analytics/`, `/page/1/`→`/`, `/posts/page/1/`→`/posts/`, `/about/about/`→`/about/`. (Static output emits redirect pages.)
- [ ] Ensure `/sitemap.xml` exists (Hugo path): either configure `@astrojs/sitemap` `customPages`/filename or add a small `src/pages/sitemap.xml.ts` that emits/points at the sitemap. `trailingSlash:'always'` already set.
- [ ] `pnpm build`; confirm each redirect page exists in `dist` and `/sitemap.xml` present. Commit.

### Task 4: Cloudflare analytics + og:type + meta polish
**Files:** `BaseLayout.astro`.
- [ ] Add the Cloudflare beacon to `<head>`: `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"fd0bbd0149124eeea3afab47dd84a12c"}'></script>`. No GA/Plausible.
- [ ] Add optional `ogType` prop (default `website`); PostLayout passes `article` (Tools deferred minor). 
- [ ] `pnpm build`; grep built HTML for the beacon + `og:type` article on a post. Commit.

### Task 5: Image optimization (astro:assets) — resolves Foundation M8
**Files:** post markdown image refs; optionally move images to `src/assets/`.
- [ ] Strip dead `#small`/`#large` fragments; adopt responsive images (either keep `public/` refs but drop fragments, or move to `src/assets` + Astro `<Image>`; MD absolute refs can stay if optimization is deferred — at minimum remove the inert fragments). Confirm images still resolve. Commit.

### Task 6: Deploy workflow + CNAME + URL-parity CI gate
**Files:** `.github/workflows/deploy.yml` (new), `public/CNAME`, `scripts/check-url-parity.mjs`.
- [ ] `public/CNAME` = `shubham-bansal.com`.
- [ ] New `deploy.yml` on push to `main`: setup pnpm/node(.nvmrc) → `pnpm install` → `pnpm check` → `pnpm build` (pagefind + OG run in build) → `actions/upload-pages-artifact` (`./dist`) → `actions/deploy-pages`. Permissions pages:write, id-token:write.
- [ ] `scripts/check-url-parity.mjs`: read the must-match URL list from the parity checklist, assert each has a `dist/**/index.html` (or a redirect page); exit non-zero if any missing. Add as a build/CI step.
- [ ] Keep `astro-ci.yml` (branch build-check). Do NOT enable `deploy.yml` triggers on the branch. Commit.

### Task 7: Remove Hugo
**Files:** delete `config.toml`, `archetypes/`, `layouts/`, `content/` (Hugo), `static/`, `assets/` (Hugo), `.github/workflows/hugo.yml`, `.hugo_build.lock` if present. Keep `src/`, `public/`, `docs/`, `.github/workflows/{astro-ci,deploy}.yml`, Astro config.
- [ ] After deletion, re-run `pnpm build` + `pnpm test:e2e` + the parity gate — all green. Fix `tsconfig` to drop the now-gone `static/` from checks (Foundation carry-forward). Commit `chore: remove Hugo`.

### Task 8: CUTOVER (requires explicit human approval)
- [ ] Present `finishing-a-development-branch` options. On explicit "merge/cutover" approval ONLY: merge `astro-rebuild` → `main` (fast-forward or merge commit), push. This triggers `deploy.yml` → live Astro site at `shubham-bansal.com`.
- [ ] Watch the Actions run; verify the live site + spot-check 5 URLs from the parity checklist. Rollback = revert the merge (Hugo intact in history).

## Self-Review
- Covers every parity-checklist row (posts, about, references, tags/series indexes, redirects, sitemap, RSS already done, trailing slash done).
- Analytics: Cloudflare ported, GA/Plausible not added.
- Cutover explicitly gated on human approval — no autonomous prod deploy.
