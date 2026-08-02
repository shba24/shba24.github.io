import type { PostMeta } from './types.ts';
import { partition } from './partition.ts';

export default function Sidebar({
  posts, activeSlug, onOpen, onNew,
}: { posts: PostMeta[]; activeSlug: string | null; onOpen: (slug: string) => void; onNew: () => void }) {
  const { drafts, published } = partition(posts);
  const section = (heading: string, items: PostMeta[]) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7178', margin: '0 0 6px' }}>{heading}</div>
      {items.length === 0 && <div style={{ fontSize: 12, color: '#4b5158' }}>none</div>}
      {items.map((p) => (
        <button key={p.slug} data-testid="sb-item" onClick={() => onOpen(p.slug)}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', marginBottom: 2,
            background: p.slug === activeSlug ? '#1b1f24' : 'transparent', color: '#d7dade',
            border: '1px solid transparent', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          {p.title || p.slug}
        </button>
      ))}
    </div>
  );
  return (
    <aside style={{ width: 240, flex: '0 0 240px', borderRight: '1px solid #23272d', padding: 12, overflow: 'auto' }}>
      <button data-testid="sb-new" onClick={onNew}
        style={{ width: '100%', padding: '8px', marginBottom: 16, background: '#e6e6e6', color: '#0a0b0d',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ New post</button>
      {section('Drafts', drafts)}
      {section('Published', published)}
    </aside>
  );
}
