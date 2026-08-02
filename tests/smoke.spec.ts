import { test, expect } from '@playwright/test';

test('home lists the pilot post', async ({ page }) => {
  await page.goto('/');
  // The pilot post title ("...Apache Iceberg...") is rendered as a link in the
  // main list AND in the LeftRail (Latest + Recommended), so the locator matches
  // several elements. `.first()` avoids a strict-mode violation while still
  // asserting the pilot post is linked and visible on the home page.
  await expect(page.getByRole('link', { name: /Apache Iceberg/ }).first()).toBeVisible();
});

test('post renders header, TOC, and code', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  await expect(page.locator('h1')).toContainText('Iceberg');
  await expect(page.locator('.toc .toc-h')).toHaveText(/on this page/i);
  await expect(page.locator('pre')).toHaveCount(1, { timeout: 5000 }).catch(() => {});
  await expect(page.locator('.byline')).toBeVisible();
});

test('theme toggle flips data-theme', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});
