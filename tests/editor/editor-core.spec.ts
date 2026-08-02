import { test, expect } from '@playwright/test';

test('sidebar lists posts and opens one into the editor', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('sb-new')).toBeVisible();
  const items = page.getByTestId('sb-item');
  await expect(items.first()).toBeVisible();
  await page.getByText('Distributed Table Format', { exact: false }).first().click();
  await expect(page.getByTestId('fm-title')).toHaveValue(/Iceberg/);
  await expect(page.getByTestId('cm-editor')).toBeVisible();
});

test('view mode toggles between edit, split, preview', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('sb-item').first().click();
  await page.getByTestId('mode-preview').click();
  await expect(page.getByTestId('preview-frame')).toBeVisible();
  await expect(page.getByTestId('cm-editor')).toHaveCount(0);
  await page.getByTestId('mode-edit').click();
  await expect(page.getByTestId('cm-editor')).toBeVisible();
});

test('new -> fill -> save creates a post file, then publish flips draft', async ({ page, request }) => {
  const title = `E2E Temp ${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await page.goto('/editor/');
  await page.getByTestId('sb-new').click();
  await page.getByTestId('fm-title').fill(title);
  await page.getByTestId('btn-save-draft').click();
  await expect(page.getByTestId('editor-msg')).toContainText(slug);

  // API confirms it exists as a draft
  let res = await request.get(`/api/editor/post/?slug=${slug}`);
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).data.draft).toBe(true);

  // Publish flips draft:false
  await page.getByTestId('btn-publish').click();
  await expect(page.getByTestId('editor-msg')).toContainText(slug);
  await expect.poll(async () => (await (await request.get(`/api/editor/post/?slug=${slug}`)).json()).data.draft).toBe(false);

  // cleanup the temp file so the working tree stays clean
  await request.fetch(`/api/editor/post/?slug=${slug}`, { method: 'DELETE' }).catch(() => {});
});
