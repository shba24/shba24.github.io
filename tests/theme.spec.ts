import { test, expect } from '@playwright/test';

test('toggle button reflects the persisted theme after navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#theme-toggle').click(); // dark -> light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed', 'false');
  // navigate: page theme persists (light) AND the button must stay in sync
  await page.goto('/about/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('site declares color-scheme per theme so browsers do not force-dark it', async ({ page }) => {
  await page.goto('/'); // default dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('dark');
  await page.locator('#theme-toggle').click(); // -> light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain('light');
});
