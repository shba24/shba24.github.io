import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, normalizePostData, serializePost, DEFAULT_AUTHOR } from './frontmatter.ts';

test('parseFrontmatter splits frontmatter and body', () => {
  const raw = '---\ntitle: "Hi"\ndate: 2024-09-02\ntags: ["A", "B"]\n---\n\n## Body\ntext\n';
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.title, 'Hi');
  assert.deepEqual(data.tags, ['A', 'B']);
  assert.equal(body, '## Body\ntext\n');
});

test('normalizePostData applies schema defaults and YYYY-MM-DD date', () => {
  const d = normalizePostData({ title: 'Hi', date: '2024-09-02' });
  assert.equal(d.author, DEFAULT_AUTHOR);
  assert.equal(d.draft, false);
  assert.equal(d.recommended, false);
  assert.equal(d.hideToc, false);
  assert.deepEqual(d.tags, []);
  assert.equal(d.date, '2024-09-02');
});

test('serializePost writes fields in schema order, omitting defaults', () => {
  const data = normalizePostData({ title: 'Hi', date: '2024-09-02', tags: ['A'], recommended: true });
  const out = serializePost(data, '## Body\n');
  assert.equal(
    out,
    '---\ntitle: "Hi"\ndate: 2024-09-02\ndescription: ""\ntags: ["A"]\ndraft: false\nrecommended: true\n---\n\n## Body\n',
  );
});

test('series + seriesPart are written only when series present', () => {
  const data = normalizePostData({ title: 'P', date: '2024-01-01', series: 'S', seriesPart: 2 });
  const out = serializePost(data, 'b\n');
  assert.match(out, /series: "S"\nseriesPart: 2\n/);
});

test('round-trip: parse -> normalize -> serialize is stable', () => {
  const raw = serializePost(
    normalizePostData({ title: 'T', date: '2024-05-01', description: 'd', tags: ['X', 'Y'], draft: true }),
    'body\n',
  );
  const { data, body } = parseFrontmatter(raw);
  assert.equal(serializePost(normalizePostData(data), body), raw);
});
