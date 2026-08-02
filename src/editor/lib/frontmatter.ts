import yaml from 'js-yaml';

export const DEFAULT_AUTHOR = 'Shubham Bansal';

export type PostData = {
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  tags: string[];
  series?: string;
  seriesPart?: number;
  author: string;
  draft: boolean;
  recommended: boolean;
  hideToc: boolean;
};

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?\r?\n?/;

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const m = raw.match(FM);
  if (!m) return { data: {}, body: raw };
  const data = (yaml.load(m[1]) as Record<string, unknown>) ?? {};
  return { data, body: raw.slice(m[0].length) };
}

function toDateString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  return s.slice(0, 10);
}

export function normalizePostData(data: Record<string, unknown>): PostData {
  return {
    title: String(data.title ?? ''),
    date: toDateString(data.date),
    description: String(data.description ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    series: data.series != null ? String(data.series) : undefined,
    seriesPart: data.seriesPart != null ? Number(data.seriesPart) : undefined,
    author: data.author != null ? String(data.author) : DEFAULT_AUTHOR,
    draft: Boolean(data.draft ?? false),
    recommended: Boolean(data.recommended ?? false),
    hideToc: Boolean(data.hideToc ?? false),
  };
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const flowTags = (t: string[]) => `[${t.map(q).join(', ')}]`;

export function serializePost(d: PostData, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${q(d.title)}`);
  lines.push(`date: ${d.date}`);
  lines.push(`description: ${q(d.description)}`);
  lines.push(`tags: ${flowTags(d.tags)}`);
  if (d.series) {
    lines.push(`series: ${q(d.series)}`);
    if (d.seriesPart != null) lines.push(`seriesPart: ${d.seriesPart}`);
  }
  if (d.author !== DEFAULT_AUTHOR) lines.push(`author: ${q(d.author)}`);
  lines.push(`draft: ${d.draft}`);
  if (d.recommended) lines.push(`recommended: true`);
  if (d.hideToc) lines.push(`hideToc: true`);
  lines.push('---', '');
  return `${lines.join('\n')}\n${body}`;
}
