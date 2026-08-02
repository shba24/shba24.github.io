export function filterPosts<T extends { data: { draft?: boolean } }>(entries: T[], withDrafts: boolean): T[] {
  return withDrafts ? entries : entries.filter((e) => !e.data.draft);
}
