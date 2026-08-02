export function filterPosts<T extends { data: { draft?: boolean; deleted?: boolean } }>(entries: T[], withDrafts: boolean): T[] {
  return entries.filter((e) => !e.data.deleted && (withDrafts || !e.data.draft));
}
