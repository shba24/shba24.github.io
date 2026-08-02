import { test, expect } from '@playwright/test';

test('image caption is RICH (preserves inline code/emphasis), not flattened', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  // at least one image caption keeps its inline <code> (proves nothing is flattened)
  await expect(page.locator('figure.fig-image figcaption code').first()).toBeVisible();
  // and a specific known caption renders with its code intact
  const cap = page.locator('figure.fig-image figcaption', { hasText: 'User 1' }).first();
  await expect(cap).toBeVisible();
  await expect(cap.locator('code')).not.toHaveCount(0);
});

test('an image with no caption line becomes a figure with no figcaption', async ({ page }) => {
  await page.goto('/posts/distributed-cache-series-part-2-memorydb/');
  const fig = page.locator('figure.fig-image:has(img[src*="memorydb_base_arch"])');
  await expect(fig).toBeVisible();
  await expect(fig.locator('figcaption')).toHaveCount(0);
});

test('diagram caption is rich (from the italic line after the block)', async ({ page }) => {
  await page.goto('/posts/distributed-cache-series-part-1-redis/');
  const cap = page.locator('figure.diagram figcaption');
  await expect(cap).toBeVisible();
  await expect(cap).toContainText('cache-aside');
  await expect(cap.locator('code').first()).toBeVisible(); // `Cache`/`DB` preserved
});
