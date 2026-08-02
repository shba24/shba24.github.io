import { test, expect } from '@playwright/test';

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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

test('autosave off by default; Save creates Unpublished; Publish/Unpublish toggle (file kept)', async ({ page, request }) => {
  const title = `E2E ${Date.now()}`;
  const slug = slugify(title);
  const draftState = async () => {
    const r = await request.get(`/api/editor/post/?slug=${slug}`);
    return r.ok() ? (await r.json()).data.draft : null;
  };
  await page.goto('/editor/');
  await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
  await page.getByTestId('fm-title').fill(title);
  await page.waitForTimeout(1500);
  expect(await draftState()).toBeNull(); // autosave off -> not persisted
  // Save creates it as Unpublished (draft:true)
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
});

test('autosave toggle is OFF by default and the preference persists across reloads', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
  await page.getByTestId('autosave-toggle').check();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked(); // persisted via localStorage
});

test('dev listings badge Unpublished and Published; post header shows the status', async ({ page }) => {
  await page.goto('/posts/');
  const draftRow = page.locator('.entries li', { hasText: 'Fixture Draft' });
  await expect(draftRow.locator('.badge.b-draft')).toBeVisible();
  await expect(page.locator('.entries li .badge.b-pub').first()).toBeVisible();
  await page.goto('/posts/_fixture-draft/');
  await expect(page.locator('.status-flag.sf-draft')).toBeVisible();
  await page.goto('/posts/iceberg-table-format-part1/');
  await expect(page.locator('.status-flag.sf-pub')).toBeVisible();
});
