#!/usr/bin/env node
// URL-parity gate for the Astro build.
//
// Verifies the built site preserves every indexed URL from the SEO parity
// checklist (docs/superpowers/specs/url-parity-checklist.md). Run after
// `pnpm build`:  node scripts/check-url-parity.mjs dist
//
// Exits non-zero (fails CI) if any required URL is missing from the output.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';

// Content URLs that MUST resolve to a page at <dist><url>index.html.
// A real page OR an emitted redirect page both satisfy parity.
const mustMatch = [
  '/',
  '/posts/',
  '/about/',
  '/references/',
  '/references/useful-technical-blogs/',
  '/tags/',
  '/series/',
  '/posts/iceberg-table-format-part1/',
  '/posts/distributed-cache-series-part-1-redis/',
  '/posts/distributed-cache-series-part-2-memorydb/',
  '/series/distributed-table-format/',
  '/series/distributed-cache/',
  '/tags/apache-iceberg/',
  '/tags/table-format/',
  '/tags/data-lake/',
  '/tags/apache-hive/',
  '/tags/data-analytics/',
  '/tags/redis/',
  '/tags/memorydb/',
  '/tags/cache/',
  '/tags/split-brain/',
  '/tags/election/',
  '/tags/distributed-systems/',
  '/tags/transaction-log/',
  '/tags/thundering-herd/',
  '/tags/time-skew/',
];

// Feeds / sitemap that MUST exist as literal files.
const mustExistFiles = [
  '/index.xml',
  '/posts/index.xml',
  '/sitemap-index.xml',
];

// Redirect sources that MUST have emitted a redirect page so old indexed
// URLs still resolve on GitHub Pages (which has no server-side redirects).
// The 4 stale /tags/* entries are indexed URLs from old post revisions /
// the references article's Hugo tags that no live post regenerates; they are
// preserved via redirects instead of live pages. /sitemap.xml is listed as
// must-match in the checklist and redirects to /sitemap-index.xml (Astro
// emits it at dist/sitemap.xml/index.html).
const redirectSources = [
  '/tags/data-anlytics/',
  '/tags/distributed-system/',
  '/tags/blog/',
  '/tags/database/',
  '/tags/language/',
  '/page/1/',
  '/posts/page/1/',
  '/about/about/',
  '/sitemap.xml',
];

const pagePath = (url) => join(dist, url, 'index.html');
const filePath = (url) => join(dist, url);

const isRedirect = (file) => {
  try {
    return /http-equiv=["']?refresh/i.test(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
};

const failures = [];
const out = [];

out.push(`URL parity gate — dist: ${dist}`);
out.push('');

out.push('Must-match content URLs:');
for (const url of mustMatch) {
  const f = pagePath(url);
  if (existsSync(f)) {
    out.push(`  PASS  ${url}${isRedirect(f) ? '  (redirect page)' : ''}`);
  } else {
    out.push(`  FAIL  ${url}  (missing ${f})`);
    failures.push(url);
  }
}
out.push('');

out.push('Feeds / sitemap files:');
for (const url of mustExistFiles) {
  const f = filePath(url);
  if (existsSync(f)) {
    out.push(`  PASS  ${url}`);
  } else {
    out.push(`  FAIL  ${url}  (missing ${f})`);
    failures.push(url);
  }
}
out.push('');

out.push('Redirect sources (must emit a redirect page):');
for (const url of redirectSources) {
  const f = pagePath(url);
  if (!existsSync(f)) {
    out.push(`  FAIL  ${url}  (missing ${f})`);
    failures.push(url);
  } else if (!isRedirect(f)) {
    out.push(`  FAIL  ${url}  (page exists but is not a redirect)`);
    failures.push(url);
  } else {
    out.push(`  PASS  ${url}  (redirect)`);
  }
}
out.push('');

const total = mustMatch.length + mustExistFiles.length + redirectSources.length;
console.log(out.join('\n'));

if (failures.length) {
  console.error(`URL PARITY: FAIL — ${failures.length}/${total} required URLs missing:`);
  for (const u of failures) console.error(`  - ${u}`);
  process.exit(1);
}
console.log(`URL PARITY: PASS — all ${total} required URLs present.`);
