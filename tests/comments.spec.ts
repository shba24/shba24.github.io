import { test, expect } from '@playwright/test';

// Guards the hydration bug we hit: the giscus island renders nothing on the
// server, so with client:visible it was a zero-size element whose
// IntersectionObserver never fired -> never hydrated -> no comments. client:idle
// hydrates regardless, mounting @giscus/react's <giscus-widget> element.
test('giscus comments island hydrates with correct config on a post', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  const widget = page.locator('giscus-widget');
  await expect(widget).toBeAttached({ timeout: 15000 });
  await expect(widget).toHaveAttribute('repoid', 'R_kgDOMe-wGQ');
  await expect(widget).toHaveAttribute('categoryid', 'DIC_kwDOMe-wGc4DCgJx');
});
