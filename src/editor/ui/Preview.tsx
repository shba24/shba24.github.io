import type { ViewMode } from './types.ts';

export default function Preview({ slug, reloadKey }: { slug: string | null; reloadKey: number }) {
  if (!slug) return <div style={{ padding: 24, color: '#6b7178' }}>Save the post to see a live preview.</div>;
  return (
    <iframe
      data-testid="preview-frame"
      key={reloadKey}
      src={`/posts/${slug}/`}
      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
    />
  );
}

const btn = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
  border: '1px solid #23272d', background: active ? '#1b1f24' : 'transparent', color: '#d7dade',
});

export function ModeToggle({ mode, onMode }: { mode: ViewMode; onMode: (m: ViewMode) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button data-testid="mode-edit" style={btn(mode === 'edit')} onClick={() => onMode('edit')}>Edit</button>
      <button data-testid="mode-split" style={btn(mode === 'split')} onClick={() => onMode('split')}>Split</button>
      <button data-testid="mode-preview" style={btn(mode === 'preview')} onClick={() => onMode('preview')}>Preview</button>
    </div>
  );
}
