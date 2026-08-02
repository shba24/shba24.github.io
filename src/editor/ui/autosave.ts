export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Autosave only when there are unsaved changes AND we have a slug (existing post) or a title (new post). */
export function shouldAutosave(s: { slug: string | null; title: string; dirty: boolean }): boolean {
  if (!s.dirty) return false;
  return s.slug != null || s.title.trim().length > 0;
}
