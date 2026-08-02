# URL Parity Checklist (SEO — do NOT break indexed paths)

Authoritative inventory of the **existing indexed URLs** (from Hugo `public/` at commit `3102b4e`, pre-cleanup). The Astro rebuild MUST preserve every content URL below, or provide a redirect. Enforced at cutover (Migration plan) with a build-time URL-diff gate.

## Must-match content URLs
| Old URL | Astro status | Action |
|---|---|---|
| `/` | ✅ matches | — |
| `/posts/` | ✅ matches | — |
| `/posts/iceberg-table-format-part1/` | ✅ matches | — |
| `/posts/distributed-cache-series-part-1-redis/` | ⏳ not ported | Migration: slug = filename → matches |
| `/posts/distributed-cache-series-part-2-memorydb/` | ⏳ not ported | Migration: slug = filename → matches |
| `/about/` | ⏳ not ported | Migration: page at `/about/` |
| `/references/` | ⏳ not ported | Migration: section index at `/references/` |
| `/references/useful-technical-blogs/` | ⏳ not ported | Migration: page at exact path |
| `/series/` | ❌ missing | Migration: add series index |
| `/series/distributed-cache/` | ⏳ (2nd post) | Migration: **slugified** |
| `/series/distributed-table-format/` | ❌ emits `/series/Distributed Table Format/` | **Slugify** series param + hrefs |
| `/tags/` | ❌ missing index | Migration: add tags index |
| `/tags/<slug>/` (apache-hive, apache-iceberg, blog, cache, **data-anlytics**, data-lake, database, distributed-system, distributed-systems, election, language, memorydb, redis, split-brain, table-format, thundering-herd, time-skew, transaction-log) | ❌ emits raw cased/spaced | **Slugify** tag param + hrefs |

## Feeds / sitemap
| Old URL | Action |
|---|---|
| `/index.xml` (main RSS) | Produce main RSS at `/index.xml` (not `/rss.xml`) |
| `/posts/index.xml` | Produce posts RSS at this path |
| `/sitemap.xml` | Emit `/sitemap.xml` (Astro sitemap defaults to `/sitemap-index.xml` — configure or add `/sitemap.xml`) |
| per-tag/section `index.xml` | Low value; optional. Not required for parity of main feed. |

## Slugify rule (match Hugo `urlize`)
Lowercase; replace spaces and non-alphanumerics with `-`; collapse repeats. Examples: `Apache Iceberg`→`apache-iceberg`, `Table Format`→`table-format`, `Distributed Table Format`→`distributed-table-format`. Apply to BOTH `getStaticPaths` params AND every `href` (LeftRail, PostHeader tags, series nav, list pages).

## The `data-anlytics` typo — DECISION NEEDED
Original pilot tag was misspelled "Data Anlytics" → indexed `/tags/data-anlytics/`. Task 9 changed it to "Data Analytics" (→ `/tags/data-analytics/`).
- **Option A (exact parity, zero redirect):** revert the pilot tag to "Data Anlytics" (keeps the typo visible on the page).
- **Option B (clean spelling + redirect):** keep "Data Analytics" and add an Astro redirect `/tags/data-anlytics/` → `/tags/data-analytics/`.

## Low-value Hugo artifacts (confirm: match, redirect, or drop)
- `/page/1/`, `/posts/page/1/` — pagination duplicates of `/` and `/posts/`. Recommend redirect → `/` and `/posts/`.
- `/about/about/` — Hugo quirk. Recommend redirect → `/about/`.

## Mechanism
- **Match first** (slugify) so redirects are minimal.
- For unavoidable changes, use Astro `redirects` config (static output emits redirect HTML — GitHub Pages has no server redirects).
- Set `trailingSlash: 'always'` + `build.format: 'directory'` so every URL keeps its trailing slash (matches Hugo).
- **Verification gate (add to CI in Migration):** diff the built `dist/**/index.html` URL set against this checklist; fail the build if any must-match URL is absent (and not covered by a redirect).
