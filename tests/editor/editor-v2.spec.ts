import { test, expect } from '@playwright/test';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const postPath = (slug: string) => resolve(process.cwd(), 'src/content/posts', `${slug}.md`);

test('editor mounts inside the site chrome (Topbar + ByteMD)', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.locator('.topbar')).toBeVisible(); // real site chrome
  await expect(page.getByTestId('editor-app')).toBeVisible();
  await expect(page.getByTestId('bytemd-editor')).toBeVisible();
  await expect(page.getByTestId('fm-title')).toBeVisible();
});

test('opens an existing post into the editor via ?slug', async ({ page }) => {
  await page.goto('/editor/?slug=iceberg-table-format-part1');
  await expect(page.getByTestId('fm-title')).toHaveValue(/Iceberg/, { timeout: 10000 });
});

test('a post page shows the dev-only Edit button', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  await expect(page.locator('.edit-link')).toBeVisible();
});

test('autosave off by default; Save creates a Draft; Publish/Unpublish toggle (file kept)', async ({ page, request }) => {
  const title = `E2E ${Date.now()}`;
  const slug = slugify(title);
  const draftState = async () => {
    const r = await request.get(`/api/editor/post/?slug=${slug}`);
    return r.ok() ? (await r.json()).data.draft : null;
  };
  try {
    await page.goto('/editor/');
    await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
    await page.getByTestId('fm-title').fill(title);
    await page.waitForTimeout(1500);
    expect(await draftState()).toBeNull(); // autosave off -> not persisted
    // Save creates it as a Draft (draft:true)
    await page.getByTestId('btn-save').click();
    await expect.poll(draftState, { timeout: 12000 }).toBe(true);
    // Publish -> live
    await expect(page.getByTestId('btn-publish')).toBeVisible({ timeout: 12000 });
    await page.getByTestId('btn-publish').click();
    await expect.poll(draftState, { timeout: 12000 }).toBe(false);
    // Unpublish -> off the site again (file kept)
    await expect(page.getByTestId('btn-unpublish')).toBeVisible({ timeout: 12000 });
    await page.getByTestId('btn-unpublish').click();
    await expect.poll(draftState, { timeout: 12000 }).toBe(true);
  } finally {
    // This test intentionally writes a real content file; remove it so repeated runs
    // don't accumulate orphan posts (there is no delete endpoint — delete is deferred).
    await unlink(postPath(slug)).catch(() => {});
  }
});

test('autosave toggle is OFF by default and the preference persists across reloads', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
  await page.getByTestId('autosave-toggle').check();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked(); // persisted via localStorage
});

test('dev listings badge Draft and Published; post header shows the status', async ({ page }) => {
  await page.goto('/posts/');
  const draftRow = page.locator('.entries li', { hasText: 'Fixture Draft' });
  await expect(draftRow.locator('.badge.b-draft')).toBeVisible();
  await expect(page.locator('.entries li .badge.b-pub').first()).toBeVisible();
  await page.goto('/posts/_fixture-draft/');
  await expect(page.locator('.status-flag.sf-draft')).toBeVisible();
  await page.goto('/posts/iceberg-table-format-part1/');
  await expect(page.locator('.status-flag.sf-pub')).toBeVisible();
});

test('post page shows a dev-only publish toggle reflecting the post state', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/'); // published
  await expect(page.getByTestId('publish-toggle')).toHaveText('Unpublish', { timeout: 10000 });
  await page.goto('/posts/_fixture-draft/'); // draft
  await expect(page.getByTestId('publish-toggle')).toHaveText('Publish', { timeout: 10000 });
});

test('the live preview renders callouts + math + vesper-highlighted code like the site', async ({ page, request }) => {
  const title = `E2E Preview ${Date.now()}`;
  const slug = slugify(title);
  const body =
    '> [!NOTE]\n> A rendered callout\n\nInline math $a^2+b^2=c^2$\n\n```ts\nconst x: number = 1;\n```\n';
  const put = await request.put(`/api/editor/post/?slug=${slug}`, {
    data: { data: { title, date: '2024-01-01', description: '', tags: [], draft: true }, body },
  });
  expect(put.ok()).toBeTruthy();
  try {
    await page.goto(`/editor/?slug=${slug}`);
    await expect(page.getByTestId('bytemd-editor')).toBeVisible();
    const preview = page.locator('.markdown-body');
    // Preview uses the site's own remark-github-blockquote-alert + KaTeX, so these match the published page.
    await expect(preview.locator('.markdown-alert')).toBeVisible({ timeout: 12000 });
    await expect(preview.locator('.katex').first()).toBeVisible({ timeout: 12000 });
    // Code is highlighted by the same Shiki + `vesper` theme the site uses: the block becomes
    // a `pre.shiki` and tokens carry per-span inline colors (not the flat fallback color).
    const shiki = preview.locator('pre.shiki');
    await expect(shiki).toBeVisible({ timeout: 12000 });
    await expect(shiki.locator('span[style*="color"]').first()).toBeVisible();
  } finally {
    await unlink(postPath(slug)).catch(() => {});
  }
});

test('autosave ON persists edits without clicking Save', async ({ page, request }) => {
  const title = `E2E Autosave ${Date.now()}`;
  const slug = slugify(title);
  const savedTitle = async () => {
    const r = await request.get(`/api/editor/post/?slug=${slug}`);
    return r.ok() ? (await r.json()).data.title : null;
  };
  try {
    await page.goto('/editor/');
    await page.getByTestId('autosave-toggle').check();
    const titleField = page.getByTestId('fm-title');
    await titleField.fill(title);
    // No Save click: the ~1.5s autosave debounce should write the file on its own.
    // A neighbouring test that writes/deletes a content file makes Astro's dev server push a
    // full-page reload, which can remount the island and clear the title before the debounce
    // fires (autosave then skips a blank title). Re-type if that happens, then assert the
    // durable result via the API — not the status pill, which the remount also resets.
    await expect
      .poll(
        async () => {
          if ((await titleField.inputValue().catch(() => '')) !== title) {
            await titleField.fill(title).catch(() => {});
          }
          return savedTitle();
        },
        { timeout: 20000 },
      )
      .toBe(title);
  } finally {
    await unlink(postPath(slug)).catch(() => {});
  }
});

test('fullscreen editor covers the sticky Topbar (exit-fullscreen button not hidden)', async ({ page }) => {
  await page.goto('/editor/');
  const bytemd = page.locator('.bytemd');
  await expect(bytemd).toBeVisible();
  // ByteMD toggles fullscreen by adding `.bytemd-fullscreen` (position:fixed, inset:0). Our
  // CSS must lift it above the site's sticky Topbar (z-index:5); otherwise the Topbar overlaps
  // the toolbar and hides the exit button. Assert that at the Topbar's location the topmost
  // element is now inside .bytemd.
  await bytemd.evaluate((el) => el.classList.add('bytemd-fullscreen'));
  const topbarCovered = await page.evaluate(() => {
    const tb = document.querySelector('.topbar');
    if (!tb) return false;
    const r = tb.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit?.closest('.bytemd');
  });
  expect(topbarCovered).toBe(true);
});
