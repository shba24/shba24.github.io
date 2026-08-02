import { useEffect, useRef, useState } from 'react';
import { getPost, savePost } from './api.ts';
import { dataToForm, formToData, emptyForm, type FormState } from './form.ts';
import { slugify } from './slugify.ts';
import { shouldAutosave, type SaveStatus } from './autosave.ts';
import type { ImageInsert } from './types.ts';
import FrontmatterForm from './FrontmatterForm.tsx';
import Editor from './Editor.tsx';
import ImageDialog from './imageDialog.tsx';

const today = () => new Date().toISOString().slice(0, 10);
const initialSlug = (): string | null => {
  const p = new URLSearchParams(window.location.search).get('slug');
  return p && p.trim() ? p : null;
};

const statusLabel: Record<SaveStatus, string> = {
  idle: 'No changes',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

const btn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--sans)',
};

export default function EditorApp() {
  const [slug, setSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(today()));
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [dialog, setDialog] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    const s = initialSlug();
    if (!s) return;
    getPost(s)
      .then(({ data, body: b }) => {
        setForm(dataToForm(data));
        setBody(b);
        setSlug(s);
        setStatus('saved');
      })
      .catch(() => setStatus('error'));
  }, []);

  const effectiveSlug = slug ?? (form.title.trim() ? slugify(form.title) : null);

  const touch = () => {
    dirty.current = true;
    setStatus('dirty');
  };
  const patchForm = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    touch();
  };
  const changeBody = (v: string) => {
    setBody(v);
    touch();
  };

  async function persist(next?: Partial<FormState>): Promise<void> {
    const f = next ? { ...form, ...next } : form;
    const s = slug ?? (f.title.trim() ? slugify(f.title) : '');
    if (!s) {
      setStatus('error');
      return;
    }
    if (next) setForm(f);
    setStatus('saving');
    try {
      await savePost(s, formToData(f), body);
      setSlug(s);
      dirty.current = false;
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  // Debounced autosave: persists ~1.5s after the last edit (once there's a slug or title).
  useEffect(() => {
    if (!shouldAutosave({ slug: effectiveSlug, title: form.title, dirty: dirty.current })) return;
    const t = setTimeout(() => {
      void persist();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, body]);

  function insertImage(img: ImageInsert) {
    const md = `![${img.alt}](${img.url}${img.size ? ` "${img.size}"` : ''})${img.caption ? `\n*${img.caption}*` : ''}`;
    setBody((b) => (b ? `${b}\n\n${md}\n` : `${md}\n`));
    touch();
    setDialog(false);
  }

  return (
    <div data-testid="editor-app">
      <div className="editor-bar">
        <strong style={{ fontSize: 15 }}>{form.title || '(untitled)'}</strong>
        <span data-testid="save-status" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--faint)' }}>
          {statusLabel[status]}
        </span>
        <span className="grow" />
        {slug && (
          <a href={`/posts/${slug}/`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
            View page ↗
          </a>
        )}
        <button style={btn} data-testid="btn-save" onClick={() => void persist()}>Save</button>
        <button style={btn} data-testid="btn-save-draft" onClick={() => void persist({ draft: true })}>Save draft</button>
        <button
          style={{ ...btn, background: 'var(--accent)', color: 'var(--bg)', borderColor: 'var(--accent)' }}
          data-testid="btn-publish"
          onClick={() => void persist({ draft: false })}
        >
          Publish
        </button>
      </div>
      <FrontmatterForm form={form} onChange={patchForm} />
      <Editor value={body} onChange={changeBody} onImage={() => setDialog(true)} slug={effectiveSlug} />
      {dialog && <ImageDialog slug={effectiveSlug} onInsert={insertImage} onClose={() => setDialog(false)} />}
    </div>
  );
}
