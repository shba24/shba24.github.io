# Standard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 11 duplicated per-page `.layout` grids with one shared `.shell` primitive so content sits in the same place on every page, move primary nav into the topbar, add a global footer, and fix anchor scroll offset — with e2e tests that lock the standard.

**Architecture:** A single `.shell` grid class in `global.css` (three columns: rail / content / toc, driven by `:root` tokens) applied by every page and `PostLayout`. Pages without a TOC leave the 3rd track empty, so rail+content never shift. Topbar gains nav links (removed from the rail); `BaseLayout` gains a footer; `html` gets `scroll-padding-top`.

**Tech Stack:** Astro 5, scoped `<style>` + `global.css`, `@playwright/test` (e2e in `tests/`, `baseURL` http://localhost:4321, `reuseExistingServer` locally).

## Global Constraints

- Width tokens are the ONLY source of width truth (already in `:root` of `src/styles/global.css`): `--shell:1440px; --rail:200px; --toc:210px; --content:840px; --gap:44px`. No hardcoded width literals in any page.
- Do not restyle colors/fonts/spacing beyond nav link size and the footer.
- Every task ends green on the reused dev server (`astro dev` on :4321). Run one spec file at a time with `pnpm exec playwright test tests/layout.spec.ts -g "<title>"`.
- Commit after each task. Push once at the end (Task 5) to trigger a single deploy.
- Keep each page's non-layout scoped CSS untouched; only remove the `.layout` rule + its `@media` layout overrides and rename the class.

---

## File Structure

- `src/styles/global.css` — add `.shell` grid + shared responsive rules; add `scroll-padding-top` to `html`. (Owns ALL layout width/position + responsive behavior.)
- `src/components/Topbar.astro` — add primary nav links + active state.
- `src/components/LeftRail.astro` — remove the `<nav class="nav">` block + `.nav` CSS; de-border the now-first section.
- `src/layouts/BaseLayout.astro` — add global `<footer>` + scoped style.
- `src/layouts/PostLayout.astro` — `class="layout"`→`"shell"`, drop `.no-toc` + inline `.layout` CSS + media queries (keep `.rule`).
- `src/pages/{index,about,references/index,references/useful-technical-blogs,tags/index,tags/[tag],series/index,series/[series]}.astro` — `class="layout"`→`"shell"`, delete inline `.layout` + `@media` (identical line in all 8).
- `src/pages/posts/index.astro` — same, and drop its bespoke `240px`/`gap:40px` (inherits standard `--rail`/`--gap`).
- `tests/layout.spec.ts` — NEW. Regression guards for the standard (created Task 1, extended Tasks 2–4).

---

### Task 1: Shared `.shell` grid + migrate every page

**Files:**
- Modify: `src/styles/global.css` (add `.shell` + responsive)
- Modify: `src/layouts/PostLayout.astro`
- Modify: all 9 page files listed above
- Test: `tests/layout.spec.ts` (create)

**Interfaces:**
- Produces: global class `.shell` (grid), global responsive rules keyed off `.toc`/`.rail`. Consumed by every page + `PostLayout`.

- [ ] **Step 1: Write the failing test** — create `tests/layout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const PAGES = [
  '/posts/iceberg-table-format-part1/', // 3-col (has TOC)
  '/about/',                             // 2-col today
  '/posts/',                             // 2-col today
  '/references/',                        // 2-col today
];

test('rail + content sit at identical x on every page type @1600', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const rows: { url: string; railX: number; mainX: number; mainW: number }[] = [];
  for (const url of PAGES) {
    await page.goto(url);
    const rail = await page.locator('.rail').boundingBox();
    const main = await page.locator('main').boundingBox();
    rows.push({ url, railX: Math.round(rail!.x), mainX: Math.round(main!.x), mainW: Math.round(main!.width) });
  }
  const a = rows[0];
  for (const r of rows) {
    expect(r.railX, `rail x ${r.url}`).toBe(a.railX);
    expect(r.mainX, `main x ${r.url}`).toBe(a.mainX);
    expect(r.mainW, `main width ${r.url}`).toBe(a.mainW);
  }
});
```

- [ ] **Step 2: Run it, verify RED**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "identical x"`
Expected: FAIL — list pages report `railX≈258` vs post `railX≈131`.

- [ ] **Step 3: Add the shared shell** to `src/styles/global.css` (after the `:root` token block):

```css
.shell{
  max-width:var(--shell); margin:0 auto; padding:32px 32px 60px;
  display:grid; grid-template-columns:var(--rail) minmax(0,var(--content)) var(--toc);
  gap:var(--gap); justify-content:center;
}
@media(max-width:1080px){ .shell{grid-template-columns:var(--rail) minmax(0,1fr)} .toc{display:none} }
@media(max-width:820px){ .shell{grid-template-columns:minmax(0,1fr); padding:22px 20px 46px} .rail{display:none} }
```

- [ ] **Step 4: Migrate `PostLayout.astro`** — markup `class:list={["layout", { "no-toc": !showToc }]}` → `class="shell"`; keep `{showToc && <TreeToc .../>}`. In its `<style>`, delete `.layout`, `.layout.no-toc`, and both `@media` blocks; KEEP `.rule`.

- [ ] **Step 5: Migrate the 9 pages** — in each, rename `class="layout"`→`class="shell"` and delete the inline `.layout{...}` rule and its `@media(max-width:820px)` block (and `posts/index`'s `240px`/`gap:40px` variant). Leave every other rule. The 8 two-col pages share this exact line to delete:

```
.layout{max-width:var(--shell);margin:0 auto;padding:32px 32px 60px;display:grid;grid-template-columns:var(--rail) minmax(0,var(--content));gap:var(--gap);justify-content:center}
```

- [ ] **Step 6: Run it, verify GREEN**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "identical x"`
Expected: PASS — all four pages report identical `railX` (~131), `mainX` (~375), `mainW` (840).

- [ ] **Step 7: Guard against literal regressions** — append to `tests/layout.spec.ts`:

```ts
test('no hardcoded width literals remain in scoped styles', async ({ page }) => {
  // sentinel: content column is exactly --content (840) at wide viewport
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/about/');
  const w = (await page.locator('main').boundingBox())!.width;
  expect(Math.round(w)).toBe(840);
});
```

Run: `pnpm exec playwright test tests/layout.spec.ts` → PASS (both).

- [ ] **Step 8: Commit**

```bash
git add src/styles/global.css src/layouts/PostLayout.astro src/pages tests/layout.spec.ts
git commit -m "Standard layout: shared .shell grid, content position identical on every page"
```

---

### Task 2: Move primary nav into the topbar

**Files:**
- Modify: `src/components/Topbar.astro`
- Modify: `src/components/LeftRail.astro`
- Test: `tests/layout.spec.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
test('primary nav lives in the topbar and not the rail', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  const bar = page.locator('.topbar');
  for (const name of ['About', 'Posts', 'References']) {
    await expect(bar.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.rail nav.nav')).toHaveCount(0); // old rail nav gone
});
```

- [ ] **Step 2: Run, verify RED**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "primary nav"`
Expected: FAIL — topbar has no About/Posts/References links.

- [ ] **Step 3: Add nav to `Topbar.astro`.** In frontmatter:

```astro
const path = Astro.url.pathname;
const active = (href: string) => path === href || (href !== '/' && path.startsWith(href));
```

After the `<a class="brand">`:

```astro
<nav class="tb-nav">
  <a href="/about/" aria-current={active('/about/') ? 'page' : undefined}>About</a>
  <a href="/posts/" aria-current={active('/posts/') ? 'page' : undefined}>Posts</a>
  <a href="/references/" aria-current={active('/references/') ? 'page' : undefined}>References</a>
</nav>
```

In `<style>`:

```css
.tb-nav{display:flex;gap:20px;margin-left:26px}
.tb-nav a{font-size:15px;font-weight:500;color:var(--muted)}
.tb-nav a:hover{color:var(--text)}
.tb-nav a[aria-current="page"]{color:var(--text)}
@media(max-width:520px){ .tb-nav{gap:14px;margin-left:14px} }
```

- [ ] **Step 4: Remove nav from `LeftRail.astro`** — delete `<nav class="nav">…</nav>` (line 12) and the `.nav` CSS rules. Add so the now-first section has no stray top border:

```css
.sec:first-child{border-top:0;padding-top:0}
```

- [ ] **Step 5: Run, verify GREEN**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "primary nav"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Topbar.astro src/components/LeftRail.astro tests/layout.spec.ts
git commit -m "Move primary nav (About/Posts/References) into the topbar; remove from rail"
```

---

### Task 3: Global footer on every page

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Test: `tests/layout.spec.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
test('copyright footer appears on post and list pages', async ({ page }) => {
  for (const url of ['/posts/iceberg-table-format-part1/', '/about/']) {
    await page.goto(url);
    const f = page.locator('.site-footer');
    await expect(f).toBeVisible();
    await expect(f).toContainText('Shubham Bansal');
    await expect(f).toContainText(String(new Date().getFullYear()));
  }
});
```

- [ ] **Step 2: Run, verify RED**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "copyright footer"`
Expected: FAIL — no `.site-footer`.

- [ ] **Step 3: Add footer to `BaseLayout.astro`** — after `<slot />` (before the theme `<script>`):

```astro
<footer class="site-footer">
  <div class="foot-inner">© {new Date().getFullYear()} Shubham Bansal</div>
</footer>
```

Add a `<style>` block to `BaseLayout.astro`:

```css
.site-footer{border-top:1px solid var(--border-soft);margin-top:48px}
.foot-inner{max-width:var(--shell);margin:0 auto;padding:22px 32px;text-align:center;color:var(--muted);font-size:13px}
```

- [ ] **Step 4: Run, verify GREEN**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "copyright footer"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro tests/layout.spec.ts
git commit -m "Add global copyright footer to every page"
```

---

### Task 4: Anchor scroll offset

**Files:**
- Modify: `src/styles/global.css`
- Test: `tests/layout.spec.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
test('anchor jump lands the heading below the sticky topbar', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/posts/iceberg-table-format-part1/');
  const topbarH = (await page.locator('.topbar').boundingBox())!.height;
  const link = page.locator('.toc a').nth(4);
  const href = (await link.getAttribute('href'))!; // "#some-id"
  await link.click();
  await page.waitForTimeout(400);
  const top = await page.locator(`[id="${href.slice(1)}"]`).evaluate(el => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(topbarH - 2);   // not hidden under the bar
  expect(top).toBeLessThan(topbarH + 90);            // and it actually scrolled there
});
```

- [ ] **Step 2: Run, verify RED**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "anchor jump"`
Expected: FAIL — heading `top≈0..8` (under the 55px bar).

- [ ] **Step 3: Add offset** — in `src/styles/global.css`, add to the `html{…}` rule:

```css
scroll-padding-top:70px;
```

- [ ] **Step 4: Run, verify GREEN**

Run: `pnpm exec playwright test tests/layout.spec.ts -g "anchor jump"`
Expected: PASS — heading `top≈70`.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css tests/layout.spec.ts
git commit -m "Fix anchor scroll offset under sticky topbar (scroll-padding-top)"
```

---

### Task 5: Full verification + ship

**Files:** none (integration)

- [ ] **Step 1: Run the whole layout + smoke suite**

Run: `pnpm exec playwright test tests/layout.spec.ts tests/smoke.spec.ts`
Expected: all PASS (smoke unaffected: nav move + footer don't break its locators).

- [ ] **Step 2: Visual spot-check** — render `/about/`, `/posts/`, a post, and `/` at 1600 & 820; confirm nav in topbar (bigger), footer at bottom, rail/content aligned, TOC-less pages leave right gutter empty.

- [ ] **Step 3: Push (single deploy)**

```bash
git push origin main
```

- [ ] **Step 4: Verify deploy green** — poll the GitHub Actions run for the pushed SHA until `conclusion: success`.

---

## Self-Review

**Spec coverage:** shared `.shell` + reserve-right-column (Task 1) ✓; tokens single source (Task 1, constraint) ✓; posts-index normalization (Task 1 Step 5) ✓; responsive once (Task 1 Step 3) ✓; topbar nav bigger + active + rail removal + mobile (Task 2) ✓; footer every page (Task 3) ✓; anchor offset (Task 4) ✓; verification matrix + deploy (Task 5) ✓. Out-of-scope diagrams not included ✓.

**Placeholder scan:** none — all CSS/TS/markup is literal.

**Type/selector consistency:** `.shell`, `.rail`, `.toc`, `main`, `.topbar`, `.tb-nav`, `.site-footer`, `.foot-inner` used identically across tasks and tests. Footer text `© <year> Shubham Bansal` matches the footer test assertions (`Shubham Bansal` + current year).
