import { test, expect } from '@playwright/test';

const PAGES = [
  '/posts/iceberg-table-format-part1/', // 3-col (has TOC)
  '/about/',                             // 2-col today
  '/posts/',                             // 2-col today
  '/references/',                        // 2-col today
];

test('rail + content sit at identical x on every page type @1600', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const rows: { url: string; railX: number; mainX: number; mainW: number }[] = [];
  for (const url of PAGES) {
    await page.goto(url);
    const rail = await page.locator('.rail').boundingBox();
    const main = await page.locator('main').boundingBox();
    rows.push({ url, railX: Math.round(rail!.x), mainX: Math.round(main!.x), mainW: Math.round(main!.width) });
  }
  const a = rows[0];
  for (const r of rows) {
    expect(r.railX, `rail x ${r.url}`).toBe(a.railX);
    expect(r.mainX, `main x ${r.url}`).toBe(a.mainX);
    expect(r.mainW, `main width ${r.url}`).toBe(a.mainW);
  }
});

test('content column width equals the --content token (840) @1600', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/about/');
  const w = (await page.locator('main').boundingBox())!.width;
  expect(Math.round(w)).toBe(840);
});

test('primary nav lives in the topbar and not the rail', async ({ page }) => {
  await page.goto('/posts/iceberg-table-format-part1/');
  const bar = page.locator('.topbar');
  for (const name of ['About', 'Posts', 'References']) {
    await expect(bar.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.rail nav.nav')).toHaveCount(0); // old rail nav gone
});

test('copyright footer appears on post and list pages', async ({ page }) => {
  for (const url of ['/posts/iceberg-table-format-part1/', '/about/']) {
    await page.goto(url);
    const f = page.locator('.site-footer');
    await expect(f).toBeVisible();
    await expect(f).toContainText('Shubham Bansal');
    await expect(f).toContainText(String(new Date().getFullYear()));
  }
});

test('anchor jump lands the heading below the sticky topbar', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/posts/iceberg-table-format-part1/');
  const topbarH = Math.round((await page.locator('.topbar').boundingBox())!.height);
  const links = page.locator('.toc a');
  const n = await links.count();
  expect(n).toBeGreaterThan(0);
  const link = links.nth(Math.floor(n / 2)); // a mid-document heading (stable across posts)
  const id = (await link.getAttribute('href'))!.slice(1);
  const target = page.locator(`[id="${id}"]`);
  await link.click();
  // no smooth-scroll here, so the jump is immediate; poll (not a fixed timeout) until it settles
  await expect.poll(async () =>
    Math.round(await target.evaluate((el) => el.getBoundingClientRect().top))
  ).toBeGreaterThanOrEqual(topbarH - 2);   // not hidden under the bar
  const top = Math.round(await target.evaluate((el) => el.getBoundingClientRect().top));
  expect(top).toBeLessThan(topbarH + 90);  // landed just below the bar, not far down
});

test('left rail travels with scroll (sticky) on posts, like the TOC', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/posts/distributed-cache-series-part-1-redis/');
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect
    .poll(async () => Math.round((await page.locator('.col-left').boundingBox())!.y))
    .toBeLessThan(120); // pinned near the top instead of scrolled off-screen
});
