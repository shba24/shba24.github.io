import { test, expect } from '@playwright/test';

// The Cloudflare Web Analytics beacon lives in BaseLayout, so it must render on every
// content page by default. These run against the built site (pnpm preview) and cover both
// layout paths: BaseLayout-direct pages and posts (which go through PostLayout -> BaseLayout).
const BEACON_SRC = 'static.cloudflareinsights.com/beacon.min.js';
const TOKEN = 'fd0bbd0149124eeea3afab47dd84a12c';

const pages = ['/', '/posts/', '/posts/iceberg-table-format-part1/', '/about/', '/tags/', '/series/'];

for (const path of pages) {
  test(`cloudflare web analytics beacon is present on ${path}`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(BEACON_SRC);
    expect(html).toContain(TOKEN);
  });
}
