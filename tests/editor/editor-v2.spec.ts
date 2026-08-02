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
