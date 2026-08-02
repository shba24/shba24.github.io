import { test, expect } from '@playwright/test';

test('plantuml diagram renders centered at ~50% post width by default', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/posts/distributed-cache-series-part-1-redis/');
  const fig = page.locator('figure.diagram');
  const svg = fig.locator('svg');
  await expect(svg).toBeVisible();
  // themed: strokes/text inherit the site color; no raw source leaked as a code block
  expect(await fig.innerHTML()).toContain('currentColor');
  await expect(page.getByText('@startuml')).toHaveCount(0);
  const fb = (await fig.boundingBox())!;
  const mb = (await page.locator('main').boundingBox())!;
  // DEFAULT (no per-diagram config): ~50% of the content width...
  expect(fb.width).toBeGreaterThan(mb.width * 0.4);
  expect(fb.width).toBeLessThan(mb.width * 0.6);
  // ...and centered within the content column (equal gaps)
  const leftGap = fb.x - mb.x;
  const rightGap = (mb.x + mb.width) - (fb.x + fb.width);
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);
});
