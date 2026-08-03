import { test, expect } from '@playwright/test';

// These run against `pnpm preview` (the built dist/) — the editor must NOT exist in production.
test('editor route is absent in production', async ({ request }) => {
  expect((await request.get('/editor')).status()).toBe(404);
  expect((await request.get('/editor/')).status()).toBe(404);
});

test('drafts route is absent in production', async ({ request }) => {
  expect((await request.get('/drafts/')).status()).toBe(404);
});

test('editor API is absent in production', async ({ request }) => {
  expect((await request.get('/api/editor/posts/')).status()).toBe(404);
  expect((await request.post('/api/editor/image/')).status()).toBe(404);
});

test('draft posts are excluded from the production build', async ({ request }) => {
  expect((await request.get('/posts/_fixture-draft/')).status()).toBe(404);
});
