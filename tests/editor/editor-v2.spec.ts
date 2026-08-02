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

test('autosave is OFF by default; explicit Save works; Publish flips draft', async ({ page, request }) => {
  const title = `E2E ${Date.now()}`;
  const slug = slugify(title);
  await page.goto('/editor/');
  await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
  await page.getByTestId('fm-title').fill(title);
  await page.waitForTimeout(1800);
  // autosave off -> nothing persisted yet
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  // explicit save draft
  await page.getByTestId('btn-save-draft').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 8000 });
  expect((await (await request.get(`/api/editor/post/?slug=${slug}`)).json()).data.draft).toBe(true);
  // publish flips draft:false
  await page.getByTestId('btn-publish').click();
  await expect
    .poll(async () => (await (await request.get(`/api/editor/post/?slug=${slug}`)).json()).data.draft, { timeout: 8000 })
    .toBe(false);
});

test('autosave toggle is OFF by default and the preference persists across reloads', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('autosave-toggle')).not.toBeChecked();
  await page.getByTestId('autosave-toggle').check();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('autosave-toggle')).toBeChecked(); // persisted via localStorage
});

test('delete marks the post as deleted (file kept), not a hard delete', async ({ page, request }) => {
  const title = `E2E Del ${Date.now()}`;
  const slug = slugify(title);
  page.on('dialog', (d) => d.accept()); // accept the confirm()
  await page.goto('/editor/');
  await page.getByTestId('fm-title').fill(title);
  await page.getByTestId('btn-save-draft').click();
  await expect
    .poll(async () => (await request.get(`/api/editor/post/?slug=${slug}`)).ok(), { timeout: 12000 })
    .toBe(true);
  await expect(page.getByTestId('btn-delete')).toBeVisible({ timeout: 12000 });
  await page.getByTestId('btn-delete').click();
  // Soft delete: the file still exists and is marked deleted:true.
  await expect
    .poll(async () => {
      const r = await request.get(`/api/editor/post/?slug=${slug}`);
      return r.ok() ? (await r.json()).data.deleted : null;
    }, { timeout: 12000 })
    .toBe(true);
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
