# Design Spec — Local Blog Authoring Studio

**Date:** 2026-08-02
**Status:** Draft for review
**Author:** Shubham Bansal (with agent)

## 1. Overview

A **local, dev-only authoring studio** for this Astro blog. It lets me create and edit
posts entirely through a UI — never hand-writing Markdown — with a full toolbar for every
construct the site renders (text formatting, images, PlantUML & D2 diagrams, KaTeX math,
callouts, code blocks, figure captions, image sizing), a **frontmatter form**, a
**true-to-site preview**, **draft management**, and an **in-post Edit button**.

It reads and writes the real files under `src/content/posts/*.md` and `public/images/**`.
It is **write-only with respect to git** — it never runs `git add/commit/push`; I commit and
deploy through my normal flow (push to `main` → `deploy.yml` → GitHub Pages).

Because the site is `output: 'static'` (no server adapter), the editor and its file-writing
API **exist only under `astro dev`** and are physically incapable of shipping to production
(`astro build` never mounts dev middleware or the injected dev routes).

## 2. Goals & Non-goals

### Goals
- Make creating and editing posts fast and easy, with **no raw Markdown typing required**.
- Support **every authoring construct the site actually renders**, using the site's exact
  conventions, so what I insert is what gets published.
- **Preview is identical to production** (reuse Astro's own rendering, not a second renderer).
- **Draft workflow:** save drafts, list them, pick one to edit, preview them at real URLs.
- **In-post Edit button** (dev-only) on every post, above the content.
- **Single-edit safety:** never allow two concurrent edit sessions on the same post.
- **Zero production footprint** and **zero git side effects**.

### Non-goals (explicitly out of scope)
- **No git automation** — no commit/push/branch. (Confirmed: write-only.)
- **No production/hosted editor** — dev-only, local machine only. No auth (localhost only).
- **No WYSIWYG-that-drifts** — preview is the real rendered page, not a live contenteditable
  surrogate. (This is *why* we chose the dev-render architecture.)
- **No new Markdown constructs the pipeline can't render** — e.g. footnotes are not enabled
  in `astro.config.mjs`, so the editor will not offer them unless/until the plugin is added.
- **No OG-image or audio authoring** — OG images and TTS audio are generated at build time
  (`astro-og-canvas`, `scripts/generate-audio.mjs`); the editor leaves them alone.

## 3. Ground truth (verified against the codebase)

These are the real conventions the editor must honor (not invented):

| Concern | Convention (source) |
|---|---|
| Post location | `src/content/posts/<slug>.md` (`src/content.config.ts` glob loader) |
| Frontmatter schema | `title` (req), `date` (req), `description`, `tags[]`, `series?`, `seriesPart?`, `author` (default "Shubham Bansal"), `draft` (default false), `recommended` (default false), `hideToc` (default false) — `src/content.config.ts` |
| Draft hiding | Every listing filters `!p.data.draft` (`posts/[...slug].astro`, `posts/index.astro`, tags, series, RSS, OG) |
| Diagrams | Fenced ` ```plantuml ` / ` ```d2 ` blocks; fence meta `small`/`big` sets size; rendered at build via Kroki, cached in committed `diagram-cache/` (`src/lib/remark-kroki.mjs`) |
| Figure caption | The *italic line immediately after* an image or diagram becomes its `<figcaption>`, preserving bold/code/links (`src/lib/rehype-figure.mjs`) |
| Image sizing | Via image **title**: `![alt](/path "small"\|"medium"\|"large")`; no keyword = natural width capped at column (`rehype-figure.mjs`, `SIZES`) |
| Image storage | `public/images/<dir>/<file>`, referenced as `/images/<dir>/<file>`. Dir names are human-chosen (e.g. `blog-iceberg-part-1`), **not** always the post slug |
| Callouts | GitHub alerts `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION]` (`remark-github-blockquote-alert`) |
| Code blocks | expressive-code (theme `vesper`); fenced with language + optional title |
| Math | `remark-math` + `rehype-katex`: `$…$` inline, `$$…$$` block |
| In-post header | `PostHeader.astro` already receives `slug` + `audioSrc`; audio row renders there — the Edit button goes here, dev-only |
| Top nav | `Topbar.astro` (About / Posts / References) — add a dev-only **Drafts** tab |
| Drafts listing pattern | Mirror the by-year grouping in `posts/index.astro` |
| Deploy | `deploy.yml` on `main` runs `pnpm check` + `pnpm build`; CI (`astro-ci.yml`) also runs `pnpm check` + Playwright — **editor code must type-check and must not appear in the build** |
| Ignored scratch | `.superpowers/` is git-ignored; lock files go in a git-ignored path |

## 4. Architecture

**Chosen approach: a dev-only Astro integration + a Vite dev-server middleware file API.**
(Alternative — a separate standalone Node+React app — was rejected: two servers, duplicated
or drift-prone rendering, and it still needs dev-only site hooks for the Edit button. No upside.)

```
astro dev
├─ Astro integration  src/integrations/editor.mjs
│   ├─ astro:config:setup → if command === 'dev': injectRoute('/editor'), injectRoute('/drafts')
│   └─ astro:server:setup → server.middlewares.use('/api/editor', handler)   ← file API, dev-only
│
├─ File API  /api/editor/*        (runs ONLY in astro dev; never in build)
│   ├─ GET  /posts                 list posts (title, slug, draft, date, lock state)
│   ├─ GET  /post?slug=            read one (frontmatter + body + resolved image dir)
│   ├─ PUT  /post?slug=            write .md (create or update)
│   ├─ POST /rename                slug/filename change
│   ├─ DELETE /post?slug=          delete (with client confirm)
│   ├─ POST /image                 upload → public/images/<dir>/<file> (dedupe/rename)
│   ├─ GET  /images                list existing images for the picker
│   ├─ POST /diagram/preview       proxy source → Kroki → SVG (live diagram preview)
│   ├─ GET  /meta                  known tags + series (autocomplete), post index (link picker)
│   └─ POST /lock, DELETE /lock, heartbeat   single-edit lock
│
├─ Editor SPA  /editor             src/editor/**  (React, client:only) — injected route (dev)
├─ Drafts tab  /drafts             src/pages/... dev-only render of draft list
├─ Draft preview                   drafts get real pages in dev (getStaticPaths includes drafts when DEV)
└─ Edit button                     PostHeader.astro, guarded by import.meta.env.DEV
```

### Why this is safe by construction
- `astro:server:setup` only fires under `astro dev` → the file API cannot exist in a build.
- `injectRoute` for `/editor` and `/drafts` is called only when `command === 'dev'` → those
  routes are absent from `astro build` output.
- The Edit button and Drafts nav item are wrapped in `import.meta.env.DEV`, which Vite
  statically replaces with `false` in the build and tree-shakes away.
- Draft pages are gated: `getStaticPaths` includes drafts **only** when `import.meta.env.DEV`,
  so production output is unchanged (drafts still excluded from prod).

### Draft rendering (true-to-site preview)
A shared helper `src/lib/posts.ts` centralizes visibility:
```ts
export const includeDrafts = import.meta.env.DEV;
export async function listPosts() {
  return (await getCollection('posts')).filter(p => includeDrafts || !p.data.draft);
}
```
`posts/[...slug].astro`, `posts/index.astro`, tags, series, RSS, and OG all route through it.
In dev, a draft has a real URL and renders through the full pipeline (Kroki diagrams, KaTeX,
expressive-code, captions, sizing) — the editor's preview is just an `<iframe>` of that page,
so it is **byte-for-byte the production rendering**. In prod, drafts remain hidden everywhere.

### Preview model
Preview = an iframe of the real dev page for the post being edited. It **auto-refreshes on a
debounced save** (the editor writes the file, the dev page HMR-reloads). Live-as-you-type
WYSIWYG is intentionally not attempted — refreshing the real page keeps the preview 100%
faithful, which is the whole reason for this architecture. View modes: **Edit / Split / Preview**.

### Single-edit lock
A heartbeat lock file per post in a git-ignored dir (`.editor/locks/<slug>.json`, with
`.editor/` added to `.gitignore`) holding `{ sessionId, since, lastBeat }`. The client beats
every **10 s**; a lock is considered **stale after 30 s** without a beat. Opening a post:
- No/stale lock → acquire, edit normally.
- Fresh lock held by another tab/session → open **read-only** with a **"Take over"** action
  (steals the lock). The previous holder detects the steal on its next beat and drops to
  read-only. This enforces "no more than one edit at a time" without hard-blocking me.

## 5. Feature scope

### 5.1 Confirmed features — LOCKED (do not remove)
- **Markdown editor** with **preview toggle**; inline/split preview.
- **Full toolbar** (no hand-written Markdown): headings (H1–H4), **bold**, *italic*,
  strikethrough, inline code, bullet/numbered/task lists, blockquote, **callouts**
  (NOTE/TIP/IMPORTANT/WARNING/CAUTION), horizontal rule, link, **table**, **code block**
  (language picker + optional title), **image** (paste / drag-drop / picker), **PlantUML**,
  **D2**, **KaTeX math** (inline + block), **figure caption**, **image size**
  (small / medium / large; default = none).
- **Frontmatter form:** title, date, description, tags[], series + seriesPart, author, draft,
  recommended, hideToc.
- **Flows:** New · Open (from sidebar or in-post Edit) · Save · Save-as-draft ·
  **Publish** (flips `draft:false`) · **Preview toggle** (iframe of the real dev page) ·
  **single-edit lock** (2nd opener → read-only + Take over) · **Drafts top-nav tab**.
- **Editor sidebar:** Drafts (5 most recent) + Published (5 most recent) + New.
- **In-post Edit button** above the content on every post (published & draft), **dev-only**.
- **Drafts tab** (dev-only): all drafts grouped by year, newest-first; clicking opens the real
  rendered preview with the Edit button.
- **Local/dev-only**, writes/updates the local `.md` (+ images).
- **Write-only:** never touches git.

### 5.2 Added enhancements (my judgment — "as many as help")
Grounded in the site's real needs; none removes anything above.

**Insert quality (diagrams/math are the blog's signature):**
- **Live diagram modal** for PlantUML & D2: type source, see the **real Kroki-rendered SVG**
  live (via `/api/editor/diagram/preview`), pick size (small/big), add caption, then insert
  the fenced block. Starter templates (sequence, component/arch, flow) to start from.
- **Live math modal**: KaTeX preview while typing; inline vs block toggle. (Addresses the past
  pain of hand-writing latency formulas.)
- **Image insert dialog:** on paste/drop, copy the file into the post's image folder, then set
  **alt**, **size**, and an optional **caption** (auto-adds the italic caption line per the one
  convention). Picker browses existing `public/images/**`. Folder defaults to
  `public/images/<slug>/` for new posts but is shown and editable (existing posts use custom
  dir names).
- **Callout picker** with the five real alert types and a preview.
- **Table builder** (choose rows/cols, alignment).
- **Caption button** that applies the exact italic-line-after convention to the selected
  image/diagram.

**Frontmatter assist:**
- **Tag autocomplete** from all existing tags; **series autocomplete** from existing series;
  **auto-suggest next `seriesPart`** for a chosen series.
- **Live schema validation** (required title/date, types) with inline errors before save.
- **Slug / filename control** on New: derived from title, editable; collision check.

**Editing ergonomics:**
- **Live word count + reading-time** (reuse `lib/format.readingTime`).
- **Outline panel** (headings) for jumping around long posts.
- **Internal-link picker**: search other posts, insert `/posts/<slug>/` — encourages
  cross-linking without memorizing slugs.
- **Debounced auto-save** for drafts + explicit Save; **unsaved-changes guard** on navigation.
- **Find/replace** (CodeMirror search).
- **Common keyboard shortcuts** (Cmd/Ctrl-B/I/K, etc.).

**Post management (still just file ops, no git):**
- **Rename** (slug/filename) and **Delete** (with confirm) from the sidebar.
- **Duplicate as template** (handy for a new series part).

### 5.3 Deferred / future (noted, not built now)
- Scroll-sync between editor and split preview.
- Markdown lint / broken-internal-link report.
- Footnotes / any construct requiring a new remark/rehype plugin (needs a pipeline change).
- Motion Canvas / video diagrams (previously deferred).

## 6. Data handling

- **Frontmatter parse/serialize:** a small, well-tested module (`src/editor/lib/frontmatter.ts`)
  splits the `---` block, parses YAML, and re-serializes **deterministically** in the schema's
  field order, preserving types (dates as `YYYY-MM-DD`, arrays as flow `["a","b"]` to match
  existing posts). Round-trip stable: parse→serialize of an untouched post is a no-op diff.
- **Body:** stored verbatim; toolbar actions perform text transforms/insertions at the caret.
- **Publish:** sets `draft: false` (written explicitly, matching existing posts) and saves.
- **Images:** written under `public/images/<dir>/`; filename collisions auto-suffixed; only
  image mime types accepted.
- **Writes are atomic:** write to a temp file + rename, so a crash never corrupts a post.

## 7. Testing strategy

Consistent with the repo's existing Playwright + `pnpm check` gates.

- **Unit:** frontmatter parse/serialize round-trip; slug derivation/collision; lock
  acquire/steal/expiry; each toolbar transform (insert diagram/math/callout/table/image/caption,
  size keyword, publish flips draft).
- **e2e (Playwright, dev server):**
  - New → fill frontmatter → insert one of each construct → Save writes the expected `.md`.
  - Preview iframe renders the draft page (diagram SVG + KaTeX present).
  - Publish flips `draft:false` and the post appears in `/posts/`.
  - Single-edit lock: second session is read-only; Take over transfers control.
  - Drafts tab lists drafts by year; Edit button deep-links to `/editor?post=<slug>`.
- **Production-safety asserts (critical):**
  - `astro build` output contains **no** `/editor` or `/drafts` route and **no** `/api/editor`.
  - A `draft: true` post is **absent** from the built `dist/` (drafts still hidden in prod).
  - Edit button / Drafts nav item are absent from built HTML.
- CI already runs `pnpm check` + `pnpm test:e2e`; the safety asserts run there too.

## 8. Risks & mitigations

- **Draft leaking to prod** → single `listPosts()` helper gated on `import.meta.env.DEV`, plus
  an e2e assert that a draft is absent from `dist/`.
- **Editor code bloating/altering the build** → integration mounts nothing outside dev; add a
  build-output assert; keep SPA under `src/editor/**` (not `src/pages`).
- **Frontmatter corruption / lost formatting** → deterministic serializer + round-trip unit
  tests + atomic writes.
- **Kroki dependency for live preview** → same service the build already uses; on failure the
  modal shows the error (build cache still authoritative) and insert still works.
- **Concurrent edits** → heartbeat lock with Take-over.
- **Accidental git side effects** → none by design; editor performs only file writes.

## 9. Phasing (for the implementation plan)

1. **Foundation:** dev-only integration, file API (list/read/write), frontmatter module,
   `listPosts()` dev-gating + draft rendering, production-safety asserts.
2. **Editor core:** React SPA at `/editor`, CodeMirror, sidebar, frontmatter form,
   Save/Save-draft/Publish, preview iframe + view modes.
3. **Toolbar & inserts:** all confirmed toolbar items + live diagram/math modals, image
   dialog, callouts, table, caption, sizing.
4. **Navigation & safety:** in-post Edit button, Drafts tab, single-edit lock.
5. **Enhancements:** autocomplete/validation, outline, internal-link picker, auto-save,
   find/replace, rename/delete/duplicate, shortcuts.
6. **Hardening:** full e2e + unit coverage, docs (`docs/` authoring guide update).
