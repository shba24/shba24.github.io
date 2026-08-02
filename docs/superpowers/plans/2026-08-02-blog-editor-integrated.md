# Blog Authoring Studio — Editor v2 (ByteMD, site-integrated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax. Execution is BATCHED into bundles (user directive); reviews happen at the END (whole-branch review + fix wave), then merge.

**Goal:** Replace the standalone dark `/editor` SPA with a **ByteMD-based editor embedded in the real site chrome** — full button toolbar, live preview rendered with the site's own CSS + plugins, autosave, proper image handling, and dev-only Edit/New/Drafts entry points — so authoring feels like part of the site, not a separate app.

**Architecture:** `/editor/?slug=` renders inside `BaseLayout` (Topbar/theme/footer). A React island hosts `@bytemd/react` (toolbar + split live preview) themed entirely with the site's CSS variables. Custom ByteMD **plugins** add toolbar buttons (callouts, PlantUML, D2, math, image) and drive the preview via the site's own remark/rehype plugins + a client Kroki renderer, so the preview matches the published page. The Foundation file API is reused and extended with image upload; a debounced autosave persists edits. Everything is dev-only and absent from `astro build`.

**Tech Stack:** React 19 islands, **`@bytemd/react` + `bytemd`** (+ `@bytemd/plugin-gfm`, `@bytemd/plugin-highlight`, `@bytemd/plugin-math`), the site's existing `remark-math`/`rehype-katex`/`remark-github-blockquote-alert` and `remark-kroki.mjs`/`rehype-figure.mjs`, Node 24, `node --test` (unit), Playwright dev e2e + a screenshot visual check.

## Global Constraints

- **Node** `24.18.1` (`.nvmrc`); **pnpm 9.12.0**; local build/test on Node 24. Shells may default to v20 → `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` first and confirm `node -v`.
- **VISUAL COHESION (hard requirement):** No editor UI may introduce its own color palette, font, or "app chrome". Use ONLY the site tokens (`--bg,--surface,--surface-2,--text,--muted,--faint,--border,--border-soft,--accent`) and fonts (`--sans`,`--mono`), inside `BaseLayout`. ByteMD's default CSS MUST be overridden with these tokens (toolbar, editor, CodeMirror, split divider, preview). The preview MUST reuse the site's `.prose`/`.diagram`/`.fig` styling. Nothing hardcodes hex colors. It must follow the existing dark/light toggle automatically (tokens are theme-scoped, so token-only styling achieves this).
- **Dev-only:** the editor, `/editor`, `/drafts`, `/api/editor/*`, the Edit button, and Topbar New/Drafts must be ABSENT from `astro build`. Guarded by `command==='dev'` (routes/middleware) and `import.meta.env.DEV` (Edit button, Topbar items). The existing `tests/editor-absent.spec.ts` MUST still pass.
- **Write-only:** file writes only; no git operations in the editor.
- **API base (Foundation, reused):** `GET /api/editor/posts/`, `GET /api/editor/post/?slug=`, `PUT /api/editor/post/?slug=` — all trailing-slash (`trailingSlash:'always'`). This plan ADDS `POST /api/editor/image/`.
- **`PostData`** must stay identical to `src/editor/lib/frontmatter.ts` / `src/content.config.ts`.
- **Reuse & remove:** REUSE `src/editor/lib/frontmatter.ts`, `src/editor/server/{store,slug,middleware}.ts`, `src/lib/posts*`, and `src/editor/ui/{types,slugify,form,api}.ts`. REMOVE `src/editor/ui/{MarkdownEditor,Sidebar,Preview,App}.tsx` (standalone SPA) and drop deps `@uiw/react-codemirror`, `@codemirror/view`, `@codemirror/lang-markdown` (ByteMD replaces them).
- Unit files `*.test.ts` use `node --test` with explicit `.ts` import extensions; `pnpm check` must stay at 0 errors.
- Commit after each task with its stated message.

## File Structure

```
src/editor/
  server/
    middleware.ts          # + POST /image
    store.ts               # + saveImage()
    images.ts              # pure: safe filename + collision suffix (tested)
    images.test.ts
  ui/
    types.ts               # (reuse) + ImageInsert type
    slugify.ts form.ts api.ts   # (reuse; api += uploadImage)
    bytemd-plugins.tsx     # custom toolbar actions + preview plugins (callout/plantuml/d2/math/image/gfm/highlight/katex/kroki/figure)
    kroki.ts               # client Kroki fetch + in-memory cache (used by preview plugin)
    imageDialog.tsx        # image insert dialog (upload/pick + alt + size + caption)
    Editor.tsx             # ByteMD wrapper: value/onChange, plugins, uploadImages, locale, mode
    FrontmatterForm.tsx    # (restyle to tokens)
    EditorApp.tsx          # shell: frontmatter form + Editor + save bar + autosave + view modes
    autosave.ts            # pure debounce/status helper (tested)
    autosave.test.ts
    editor.css             # ByteMD token overrides + preview .prose mapping (imported by the route)
  routes/
    editor.astro           # rewrite: BaseLayout + EditorApp island
    drafts.astro           # rewrite: BaseLayout + EntryList by-year (match Posts)
src/components/
  PostHeader.astro         # + dev-only Edit button
  Topbar.astro             # + dev-only New + Drafts nav items
tests/editor/
  editor-v2.spec.ts        # dev e2e: edit/preview/toolbar insert/image/autosave/publish
  editor-visual.spec.ts    # screenshot /editor/ + a post's Edit view for the cohesion check
```

**Removed:** `src/editor/ui/{MarkdownEditor,Sidebar,Preview,App}.tsx`, `src/editor/ui/partition.ts(+test)` (no in-app sidebar).

---

## Bundle A — API + deps + reusable-layer changes

**Tasks A1–A4. Commit after each.**

### A1: Swap deps (drop CodeMirror, keep ByteMD)
- Remove `@uiw/react-codemirror`, `@codemirror/view`, `@codemirror/lang-markdown` from `package.json`; ensure `@bytemd/react bytemd @bytemd/plugin-gfm @bytemd/plugin-highlight @bytemd/plugin-math` are present (already installed). Delete `src/editor/ui/{MarkdownEditor,Sidebar,Preview,App}.tsx` and `src/editor/ui/partition.ts` + `partition.test.ts`.
- `pnpm install`; `pnpm test:unit` (frontmatter/store/slug/form/posts-filter tests still pass — 20-ish, minus the 2 partition tests removed); `pnpm check` 0 errors (note: removing App.tsx removes the only importer of the old components — the injected route is rewritten in Bundle C, so temporarily `editor.astro` may error; if so, stub `editor.astro` to a placeholder `<BaseLayout>` in THIS task to keep `pnpm check`/build green).
- Commit: `Editor v2: drop CodeMirror deps + standalone SPA files; keep ByteMD`.

### A2: Image filename helper (pure, TDD)
Create `src/editor/server/images.ts` + `images.test.ts`.
- `export const IMAGE_EXT = ['png','jpg','jpeg','gif','webp','svg','avif']`
- `export function safeImageName(name: string): string` — lowercases, strips path, replaces non `[a-z0-9._-]` with `-`, collapses, ensures an allowed extension (throws `Error('unsupported image type')` otherwise).
- `export function dedupeName(existing: string[], name: string): string` — if `name` in `existing`, insert `-1`,`-2`,… before the extension until unique.
- Tests: `safeImageName('My Pic!.PNG')==='my-pic-.png'`? (define precisely: keep dots; → `my-pic.png` after collapsing — assert the exact rule you implement); rejects `.txt`; `dedupeName(['a.png'],'a.png')==='a-1.png'`.
- Run `pnpm test:unit` RED→GREEN. Commit: `Editor v2: safe image filename + dedupe helpers (tested)`.

### A3: Image storage + upload API
- `store.ts`: add `export async function saveImage(root, slug, filename, buffer): Promise<string>` — `mkdir -p public/images/<slug>/`, dedupe against existing dir entries via `dedupeName`, write buffer, return `/images/<slug>/<finalName>`.
- `middleware.ts`: add branch `if (req.method==='POST' && path==='/image')` — read JSON `{ slug, filename, dataBase64 }`; validate `isValidSlug(slug)` + `safeImageName(filename)`; `Buffer.from(dataBase64,'base64')`; `await saveImage(root, slug, safeImageName(filename), buf)`; return `{ url }`. On bad type → 400.
- Verify by hand: `pnpm dev`, `curl -X POST` a tiny base64 PNG to `/api/editor/image/?` with a JSON body, confirm the file lands in `public/images/<slug>/` and the URL returns. Then delete the test image.
- Commit: `Editor v2: image upload API (POST /api/editor/image) + store.saveImage`.

### A4: Extend the API client
- `api.ts`: add `export async function uploadImage(slug: string, file: File): Promise<string>` — reads the file to base64 (`FileReader`/`arrayBuffer`), POSTs `{slug, filename:file.name, dataBase64}` to `/api/editor/image/`, returns `url`. Keep `listPosts/getPost/savePost`.
- `types.ts`: add `export type ImageInsert = { url: string; alt: string; size: '' | 'small' | 'medium' | 'large'; caption: string }`.
- `pnpm check` 0 errors. Commit: `Editor v2: api.uploadImage + ImageInsert type`.

---

## Bundle B — ByteMD plugins (toolbar + preview) + theming

**Tasks B1–B4. Commit after each.**

### B1: Client Kroki renderer (pure-ish)
Create `src/editor/ui/kroki.ts`:
- `export async function krokiSvg(lang: 'plantuml'|'d2', source: string): Promise<string>` — POST to `https://kroki.io/<lang>/svg` (same service the build uses), return SVG text; in-memory `Map` cache keyed by `lang+source`. Mirror the build's PlantUML skin prepend + D2 `sketch` option from `src/lib/remark-kroki.mjs` (copy the skin constant) so preview ≈ build.
- No unit test (network); covered by e2e/manual. Commit: `Editor v2: client Kroki SVG renderer for live preview`.

### B2: Preview plugins (match the site)
In `src/editor/ui/bytemd-plugins.tsx`, export `previewPlugins(): BytemdPlugin[]`:
- **math:** a plugin `{ remark: p => p.use(remarkMath), rehype: p => p.use(rehypeKatex) }` (import the site's `remark-math`, `rehype-katex`).
- **callouts:** `{ remark: p => p.use(remarkAlert) }` (import `remark-github-blockquote-alert`).
- **diagrams (kroki):** a plugin with `viewerEffect({ markdownBody })` that finds `pre>code.language-plantuml` and `.language-d2`, calls `krokiSvg`, and replaces the block with a `<figure class="diagram diagram-<lang>">` containing the SVG (reuse the site's `.diagram` classes so CSS matches). Debounce/guard re-renders.
- **gfm + highlight:** include `@bytemd/plugin-gfm` (tables/tasklists/strikethrough) and `@bytemd/plugin-highlight`.
- Commit: `Editor v2: ByteMD preview plugins (math, callouts, kroki diagrams, gfm, highlight)`.

### B3: Toolbar action plugins (buttons that write markdown)
In `bytemd-plugins.tsx`, export `toolbarPlugins({ onImage }): BytemdPlugin[]` — each returns `{ actions: [{ title, icon: '<svg…>', handler: { type:'action', click(ctx){ … } } }] }` using `ctx.appendBlock`/`ctx.wrapText`/`ctx.replaceLines`/`ctx.editor` (ByteMD editor ctx API) to insert:
- **callout** (submenu or default NOTE): `> [!NOTE]\n> `; **table**: a 2×2 GFM table template; **code block**: ```` ```lang\n\n``` ````; **math (block)**: `$$\n\n$$`; **math (inline)**: wrap selection in `$…$`; **PlantUML**/**D2**: fenced block with a starter template; **image**: calls `onImage()` (opens the dialog from B4) instead of inserting directly.
- Headings/bold/italic/strike/lists/quote/link come from ByteMD's built-in default actions — include them; only ADD the site-specific ones. Provide `buildPlugins({ onImage })` combining built-ins + `previewPlugins()` + `toolbarPlugins()`.
- `pnpm check` 0 errors. Commit: `Editor v2: custom toolbar buttons (callout, table, code, math, plantuml, d2, image)`.

### B4: Image dialog + editor theming CSS
- `imageDialog.tsx`: a modal (token-styled) — drag/drop or file pick or "choose existing" (lists via a new `GET /api/editor/images/?slug=`—OPTIONAL; if skipped, upload-only), fields **alt**, **size** (none/small/medium/large), **caption**; on confirm, `uploadImage()` then returns the markdown `![alt](url "size")` + (caption ? `\n*caption*` : '') to the caller for insertion. Paste/drag directly in the editor is also wired via ByteMD's `uploadImages` (returns `[{url, title:size}]`).
- `editor.css`: override ByteMD to the site tokens — `.bytemd{border:1px solid var(--border);background:var(--bg);font-family:var(--sans)}`, toolbar `background:var(--surface);border-color:var(--border-soft)`, toolbar icons `color:var(--muted)`/hover `var(--text)`, split divider `var(--border-soft)`, `.CodeMirror{background:var(--bg);color:var(--text);font-family:var(--mono)}` (+ cursor/selection/gutter tokens), and map the preview: `.bytemd-preview .markdown-body` inherits the site's prose — simplest is to add `.markdown-body` to the same rules as `.prose` (import global tokens; replicate key prose rules or wrap). Ensure NO hardcoded hex. Commit: `Editor v2: image dialog + ByteMD theming to site tokens (no palette of its own)`.

---

## Bundle C — Editor shell (autosave, view modes) + route in site chrome

### C1: Autosave helper (pure, TDD)
`autosave.ts` + `autosave.test.ts`: `export type SaveStatus='idle'|'dirty'|'saving'|'saved'|'error'`; `export function shouldAutosave(s:{slug:string|null;title:string;dirty:boolean}):boolean` (true only when slug!=null OR title non-empty, AND dirty). Test the truth table. Commit: `Editor v2: autosave gating helper (tested)`.

### C2: ByteMD `Editor.tsx` wrapper
Wrap `@bytemd/react` `Editor`: props `{ value, onChange, onImage }`; `plugins={buildPlugins({onImage})}`; `mode` from a prop (`split|tab|auto`→ map view modes); `uploadImages` wired to `api.uploadImage` (needs current slug — pass via prop); `locale` en. Root `data-testid="bytemd-editor"`. Commit: `Editor v2: ByteMD editor wrapper`.

### C3: `FrontmatterForm.tsx` restyle
Reuse the existing field logic; restyle inputs to tokens (`background:var(--surface-2);border:1px solid var(--border);color:var(--text);font-family:var(--sans)`; labels `--mono` uppercase small like the site). Keep testids `fm-title`,`fm-draft`. Commit: `Editor v2: frontmatter form restyled to site tokens`.

### C4: `EditorApp.tsx` shell + autosave + save bar
Compose: frontmatter form + `Editor` + a **save bar** (Save / Save draft / Publish + `ModeToggle` edit/split/preview + a **save-status pill** `data-testid="save-status"`). Load `?slug=` via `getPost`; New (no slug) = `emptyForm`. Debounced autosave (~1500ms) calling `savePost` when `shouldAutosave` (preserve current draft flag); status pill reflects saving/saved. Save/Save-draft/Publish set flag + save. Uses site tokens only; laid out within a site-width container. `onImage` opens `imageDialog`, inserts returned markdown. Commit: `Editor v2: editor shell — frontmatter + ByteMD + autosave + save bar + view modes`.

### C5: Route in `BaseLayout`
Rewrite `src/editor/routes/editor.astro`: `export const prerender=false`; import `BaseLayout`, `editor.css`, and `EditorApp`; render `<BaseLayout title="Editor"><section class="editor-shell"><EditorApp client:only="react" /></section></BaseLayout>`. `.editor-shell` uses `max-width:var(--shell)` + site padding. Dev-mount check `/editor/`→200, no hydration errors. Commit: `Editor v2: /editor route inside BaseLayout (site chrome)`.

---

## Bundle D — Site integration + cohesion

### D1: In-post Edit button (dev-only)
`PostHeader.astro`: add `{import.meta.env.DEV && (<a class="edit-link" href={`/editor/?slug=${slug}`}>Edit</a>)}` near the byline/audio row, styled with `--mono`/`--muted` like existing meta (small, understated). Commit: `Editor v2: dev-only Edit button on posts`.

### D2: Topbar New + Drafts (dev-only)
`Topbar.astro`: add `{import.meta.env.DEV && <a href="/drafts/" …>Drafts</a>}` and `{import.meta.env.DEV && <a href="/editor/" …>New</a>}` in `.tb-nav`, using the exact existing nav link markup/classes (active state included) so they're indistinguishable from About/Posts. Commit: `Editor v2: dev-only New + Drafts in Topbar`.

### D3: `/drafts` restyle to match Posts
Rewrite `drafts.astro`: `BaseLayout` + `.shell` + `LeftRail` + `EntryList` grouped by year (mirror `src/pages/posts/index.astro` exactly), listing `getCollection('posts').filter(p=>p.data.draft)`. Page title "Drafts". Commit: `Editor v2: /drafts styled like the Posts page`.

---

## Bundle E — Tests + visual cohesion check

### E1: Dev e2e (`tests/editor/editor-v2.spec.ts`, `playwright.editor.config.ts`)
Cover (free port first with `lsof -ti:4321 -sTCP:LISTEN | xargs kill`): open a post into the editor (frontmatter populated, `bytemd-editor` visible); a toolbar button inserts markdown (e.g. click the callout button → editor value contains `[!NOTE]`); preview renders (math/callout present in `.markdown-body`); **autosave** fires (edit → wait → `save-status` shows "Saved" → API `getPost` reflects the change); Publish flips `draft:false`; clean up any temp post. Also assert Edit button/`Drafts`/`New` appear in dev. Keep the Foundation smoke green. Commit: `Editor v2: dev e2e (toolbar insert, preview, autosave, publish)`.

### E2: Visual cohesion screenshot check
Use the `headless-browser-test`/`visual-review` skill (or Playwright screenshots) to capture `/editor/` and a post `?…/edit` view in BOTH dark and light, and verify against the mandate: same background/border/text tokens as the site, `--mono` labels, no foreign palette, Topbar present and consistent. Fix any element that "pops out". Commit: `Editor v2: visual cohesion pass (screenshots dark+light)`.

### E3: Full gate
`pnpm test:unit` (all green), `pnpm check` (0 errors), `pnpm build` + `pnpm test:e2e` (built-site suite incl. `editor-absent` — editor must remain absent from prod), `pnpm test:e2e:editor`. Commit any fixes.

---

## Self-Review (completed)
- **Requirements coverage:** ByteMD editor ✓ (B,C); all-buttons toolbar (built-in + custom callout/table/code/math/plantuml/d2/image) ✓ (B3); live preview via site plugins+CSS ✓ (B2,B4); **autosave** ✓ (C1,C4,E1); **image handling** (upload API + paste/drag + dialog with alt/size/caption) ✓ (A2–A4,B4); **visual cohesion / nothing pops out** ✓ (Global Constraint + B4 tokens + D + E2 screenshot gate); raw-markdown editable ✓ (ByteMD is source-based); site integration (Edit button, Topbar, /drafts, /editor in BaseLayout) ✓ (C5,D); dev-only + prod-clean ✓ (Global + E3 editor-absent).
- **Placeholder scan:** the few "define precisely as implemented" notes (A2 filename rule) are intentional latitude for the implementer with an explicit assertion requirement; everything else is concrete.
- **Naming consistency:** `PostData`, `ImageInsert`, `uploadImage/saveImage/safeImageName/dedupeName`, `buildPlugins/previewPlugins/toolbarPlugins`, `shouldAutosave/SaveStatus`, testids (`bytemd-editor`,`save-status`,`fm-title`,`fm-draft`) are used consistently across bundles.

## Deferred (future phases)
Single-edit lock + Take-over; tag/series autocomplete; internal-link picker; find/replace; rename/delete/duplicate; "choose existing image" browser (optional GET /images).
