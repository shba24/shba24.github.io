import { test, expect } from '@playwright/test';

test('plantuml block renders as an inline themeable SVG (no code block)', async ({ page }) => {
  await page.goto('/posts/distributed-cache-series-part-1-redis/');
  const fig = page.locator('figure.diagram');
  await expect(fig).toBeVisible();
  await expect(fig.locator('svg')).toBeVisible();
  // themed: strokes/text inherit the site color instead of baked black
  const html = await fig.innerHTML();
  expect(html).toContain('currentColor');
  // the raw source must not leak through as a code block
  await expect(page.getByText('@startuml')).toHaveCount(0);
});
