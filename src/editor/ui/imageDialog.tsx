import { useState } from 'react';
import type { ImageInsert } from './types.ts';
import { uploadImage } from './api.ts';

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
};
const panel: React.CSSProperties = {
  width: 460, maxWidth: '92vw', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 10, padding: 18, color: 'var(--text)', fontFamily: 'var(--sans)',
};
const label: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)', display: 'block', margin: '10px 0 4px' };
const input: React.CSSProperties = { width: '100%', padding: '6px 9px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--sans)', fontSize: 14 };
const btn: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13 };

export default function ImageDialog({
  slug,
  onInsert,
  onClose,
}: {
  slug: string | null;
  onInsert: (img: ImageInsert) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [size, setSize] = useState<ImageInsert['size']>('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setErr(null);
    let finalUrl = url.trim();
    if (file) {
      if (!slug) {
        setErr('Give the post a title first so the image has a folder.');
        return;
      }
      setBusy(true);
      try {
        finalUrl = await uploadImage(slug, file);
      } catch (e) {
        setErr(String(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    if (!finalUrl) {
      setErr('Choose a file or paste an image URL.');
      return;
    }
    onInsert({ url: finalUrl, alt: alt.trim(), size, caption: caption.trim() });
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <strong style={{ fontSize: 15 }}>Insert image</strong>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) { setFile(f); if (!alt) setAlt(f.name.replace(/\.[^.]+$/, '')); }
          }}
          style={{ marginTop: 10, padding: 14, border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}
        >
          {file ? `Selected: ${file.name}` : 'Drag an image here, or'}
          <div style={{ marginTop: 8 }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !alt) setAlt(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </div>
        </div>
        <label style={label}>Or image URL</label>
        <input style={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/images/…" />
        <label style={label}>Alt text</label>
        <input style={input} value={alt} onChange={(e) => setAlt(e.target.value)} />
        <label style={label}>Size</label>
        <select style={input} value={size} onChange={(e) => setSize(e.target.value as ImageInsert['size'])}>
          <option value="">Default</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
        <label style={label}>Caption (optional)</label>
        <input style={input} value={caption} onChange={(e) => setCaption(e.target.value)} />
        {err && <p style={{ color: 'crimson', fontSize: 13 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background: 'var(--accent)', color: 'var(--bg)', borderColor: 'var(--accent)' }} disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Uploading…' : 'Insert'}
          </button>
        </div>
      </div>
    </div>
  );
}
