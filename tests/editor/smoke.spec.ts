import { test, expect } from '@playwright/test';

test('editor API lists posts including the fixture draft', async ({ request }) => {
  const res = await request.get('/api/editor/posts/');
  expect(res.ok()).toBeTruthy();
  const { posts } = await res.json();
  expect(posts.some((p: { slug: string }) => p.slug === '_fixture-draft')).toBeTruthy();
});

test('editor app mounts and renders post rows', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('editor-app')).toBeVisible();
  await expect(page.getByTestId('post-row').first()).toBeVisible();
});

test('draft renders at its real URL under astro dev', async ({ page }) => {
  await page.goto('/posts/_fixture-draft/');
  await expect(page.locator('h1')).toContainText('Fixture Draft');
});
