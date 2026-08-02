import type { MarkdownHeading } from 'astro';

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}
export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
export type TocNode = { depth: number; slug: string; text: string; children: TocNode[] };
export function buildTocTree(headings: MarkdownHeading[]): TocNode[] {
  const roots: TocNode[] = []; const stack: TocNode[] = [];
  for (const h of headings.filter((h) => h.depth >= 2 && h.depth <= 4)) {
    const node: TocNode = { depth: h.depth, slug: h.slug, text: h.text, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= h.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node); else roots.push(node);
    stack.push(node);
  }
  return roots;
}
