import { useState } from 'react';
import { getPost, savePost } from '../editor/ui/api.ts';

/**
 * Dev-only in-post publish toggle. Rendered beside the "Edit this post" link on the
 * post page (guarded by import.meta.env.DEV in PostHeader, so it is stripped from the
 * production build). Reuses the editor's own getPost/savePost path — no new API — to
 * flip the post's `draft` flag, then reloads so the status pill + button update.
 */
export default function PublishToggle({
  slug,
  draft,
  title,
}: {
  slug: string;
  draft: boolean;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const label = draft ? 'Publish' : 'Unpublish';

  async function toggle() {
    const message = draft
      ? `Publish “${title}” to the live site?`
      : `Take “${title}” off the live site? (the file is kept on disk)`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const { data, body } = await getPost(slug);
      await savePost(slug, { ...data, draft: !draft }, body);
      window.location.reload();
    } catch (e) {
      window.alert(`Could not ${label.toLowerCase()}: ${String(e)}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="publish-toggle"
      disabled={busy}
      onClick={() => void toggle()}
      title={draft ? 'Publish this post to the live site' : 'Take this post off the live site (kept on disk)'}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--muted)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '3px 12px',
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      {busy ? 'Working…' : label}
    </button>
  );
}
