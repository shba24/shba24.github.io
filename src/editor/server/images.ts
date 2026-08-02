// Pure helpers for image filenames written under public/images/<slug>/.
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] as const;

/** Normalize an uploaded filename to a safe, lowercase name with an allowed image extension. */
export function safeImageName(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? '').toLowerCase();
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1) : '';
  if (!(IMAGE_EXT as readonly string[]).includes(ext)) throw new Error('unsupported image type');
  const stem =
    (dot >= 0 ? base.slice(0, dot) : base)
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '') || 'image';
  return `${stem}.${ext}`;
}

/** Given the existing filenames in a dir, return a non-colliding version of `name` (a.png -> a-1.png). */
export function dedupeName(existing: string[], name: string): string {
  if (!existing.includes(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : '';
  let i = 1;
  while (existing.includes(`${stem}-${i}${ext}`)) i += 1;
  return `${stem}-${i}${ext}`;
}
