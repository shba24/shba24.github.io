# Monochrome Docs — Blog Revamp Design Spec

- **Status:** Approved (design sign-off 2026-08-01)
- **Repo:** `shba24.github.io` (revamp in place; NOT moving to `shubham-tech-blog`)
- **Author identity:** `Shubham Bansal <illusionist.neo@gmail.com>` (repo-local, personal SSH `github-personal`)
- **Deploy:** GitHub Actions → GitHub Pages · `shubham-bansal.com`
- **Working branch:** `astro-rebuild` (Hugo stays live on `main` until cutover)

## 1. Overview & goals
Replace the current Hugo + Poison theme site with a custom **Astro** stack and a distinctive, subtle **"Monochrome Docs"** design.

Goals:
- A design that reads as intentional, not templated (no Inter, no accent-on-black cliché).
- Better authoring/reader tooling: full-text search, multi-level tree TOC, callouts, comments, recommended posts, per-post audio.
- Interactivity-ready (React islands + MDX) for future live demos.
- Stay static, free, and low-maintenance on GitHub Pages; mobile-friendly.
- Preserve existing content and URLs.

Non-goals: dynamic backend/server, moving repositories, large hero imagery, colored accents.

## 2. Design system — "Monochrome Docs"
**Palette (dark-first, monochrome).** Neutral/cool grayscale; white is the only "accent" (used for active/hover/emphasis).

| Token | Dark | Light (secondary) |
|---|---|---|
| bg | `#0c0d0f` | `#ffffff` |
| surface | `#141619` | `#f6f7f8` |
| surface-2 | `#191c20` | `#eef0f2` |
| text | `#eceef1` | `#14161a` |
| muted | `#9aa0a8` | `#5a6069` |
| faint | `#5e636b` | `#9aa0a8` |
| border | `#23272d` | `#e7e8eb` |
| accent (emphasis) | `#ffffff` | `#111318` |

**Typography.** Public Sans (UI + body), IBM Plex Mono (meta, code, section labels). Self-hosted (no Google CDN). Type scale: h1 ~2.3rem/700, h2 1.4rem/700, h3 1.12rem/600, h4 0.98rem/600 muted, body 1rem/1.68, lead 1.16rem.

**Code syntax.** Chrome is monochrome; code retains a **low-key, near-monochrome** syntax theme (subtle gray tints) for readability — pure monochrome code is rejected as unreadable.

**Layout.** Three regions, centered, max-width ~1240px:
- Left rail (~200px): nav (About/Posts/References) · **Latest** · **Recommended** · **Archive** · socials.
- Center article (~680px measure).
- Right rail (~210px): **tree TOC**.

**Post header — centered (Uber-style):** eyebrow (series·part), title, byline, Listen button, tags are centered; the article body is left-aligned. **No hero box.**

**Byline:** circular author **photo** (neutral placeholder until a headshot is supplied) + name + role + date + read-time + **▶ Listen** button.

**Tree TOC:** right rail, nested **H2 → H3 → H4** with indentation, guide lines, and active-section highlight (white).

**Responsive:** right TOC hides < 1080px; left rail hides < 820px; single centered column on mobile with the header still centered.

**Signature elements:** monochrome palette + centered header + multi-level tree TOC + monospace "engineered" metadata.

## 3. Tech stack
Astro v5 (static output) · TypeScript (strict) · React islands (`@astrojs/react`) · MDX (`@astrojs/mdx`) + content collections (Zod) · Tailwind v4 + `@tailwindcss/typography` · **Expressive Code** · **Pagefind** (search) · **Giscus** (comments) · KaTeX (`remark-math` + `rehype-katex`) · Mermaid + PlantUML · `astro:assets` + `medium-zoom` · Satori OG images · `@astrojs/rss` + `@astrojs/sitemap` · JSON-LD · pnpm (Corepack) · GitHub Actions → Pages. Node pinned in CI.

## 4. Content model
Collections:
- `posts` — the blog entries.
- `pages` — About, References.

Post frontmatter (Zod-validated):
`title` (string), `date` (date), `description` (string), `tags` (string[]), `series` (string?), `seriesPart` (number?), `author` (string, default "Shubham Bansal"), `draft` (bool, default false), `recommended` (bool, default false), `hideToc` (bool, default false), `heroImage` (image?, optional and unused by default).

- **Recommended list:** target **3** items — posts with `recommended: true` first; if fewer than 3, fill by auto-related (shared tags/series), newest first.
- **Series navigator:** grouped by `series`, ordered by `seriesPart`/date.
- **Archive:** grouped by year with counts.

## 5. Features & behavior
- **Search:** Pagefind index built post-`astro build`; `⌘K` command palette (React island).
- **Tree TOC:** generated from H2–H4; scroll-spy active highlight via IntersectionObserver (island).
- **Callouts:** GitHub-style `> [!NOTE|TIP|WARNING]` via remark plugin; monochrome styling with white left bar.
- **Heading anchors:** `rehype-slug` + `rehype-autolink-headings`, `#` on hover.
- **Comments:** Giscus (GitHub Discussions), theme-synced island, lazy-loaded.
- **Image zoom:** `medium-zoom` on content images.
- **Audio:** build-time **Piper** TTS over each post's text → `/audio/<slug>.mp3` static asset → `▶ Listen` player (island) in the centered header. Regenerated only when content changes (hash guard).
- **OG images:** Satori per post at build.
- **Feeds/SEO:** RSS + sitemap + `Article` JSON-LD.
- **Analytics:** keep Cloudflare Web Analytics only; drop the unused GA + Plausible hooks and the redundant CDN highlight.js.

## 6. Architecture & data flow
Static build pipeline: Markdown/MDX → content collections (typed) → Astro file-based routes → HTML/CSS + hydrated islands → **Pagefind** index → **Piper** audio step → deploy artifact.

Islands (hydrate on demand): search palette (`client:idle`), TOC scroll-spy (`client:visible`), image zoom, giscus (`client:visible`), audio player (`client:idle`). Everything else is static HTML; the page is fully readable with JS disabled.

Units are isolated and independently testable: `Layout`, `LeftRail`, `PostHeader`, `TreeToc`, `Prose`, `CodeBlock` (Expressive Code), `SearchPalette`, `AudioPlayer`, `Comments`, `Recommended`, `SeriesNav`.

## 7. URLs & migration
Preserve permalinks: `/posts/<slug>/`, `/about/`, `/references/`, `/tags/<tag>/`, `/series/<series>/`, and RSS parity. Keep `CNAME` (`shubham-bansal.com`).

Port the 3 live posts (Redis, MemoryDB, Iceberg) + About + References; **drop the demo `testing.md`**. Move post images into the `astro:assets` pipeline (responsive `srcset` + WebP). Iceberg is the pilot post (code + math + images + deep TOC).

## 8. Error handling & edge cases
- Invalid frontmatter → build fails fast (Zod).
- Missing audio file → hide the Listen button.
- Missing author photo → neutral placeholder.
- `hideToc` or too few headings → suppress the TOC rail.
- No-JS → content, nav, TOC links all work; islands are enhancements.
- Custom 404 page.

## 9. Testing
- `astro build` + `astro check` (types) in CI — the primary gate.
- Internal link check on built output.
- Assert Pagefind index exists post-build.
- Playwright visual smoke: home + one post, dark + light + mobile widths.
- Vale + markdownlint for prose.

## 10. Deployment
GitHub Actions: setup Node/pnpm → `pnpm build` → `pnpm pagefind` → audio step → `upload-pages-artifact` (`./dist`) → `deploy-pages`. Preserve `CNAME`. Branch-safe: everything on `astro-rebuild`; **cutover = merge to `main`** (swaps the workflow + removes Hugo files in the same merge).

## 11. Open items (tracked, non-blocking)
- Square **headshot** photo (neutral placeholder until provided).
- Enable **GitHub Discussions** + install the giscus app; capture repo/category IDs.
- Final **monochrome shade** confirmation (currently neutral/cool; warm is a one-token change).

## 12. Rollback
Cutover is a single merge commit. Rollback = revert that merge; the Hugo implementation remains intact in history on `main`.
