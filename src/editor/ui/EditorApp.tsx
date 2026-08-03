import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [autosaveOn, setAutosaveOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('editor.autosave') === '1';
    } catch {
      return false;
    }
  });
  const dirty = useRef(false);
  // Mirror of `body` kept in sync so the stable changeBody callback can detect and ignore
  // no-op onChange echoes (ByteMD fires onChange once on mount with the initial value).
  const bodyRef = useRef('');

  useEffect(() => {
    const s = initialSlug();
    if (!s) return;
    getPost(s)
      .then(({ data, body: b }) => {
        setForm(dataToForm(data));
        bodyRef.current = b;
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
  const changeBody = useCallback((v: string) => {
    if (v === bodyRef.current) return; // ignore ByteMD's initial onChange echo / no-op updates
    bodyRef.current = v;
    setBody(v);
    dirty.current = true;
    setStatus('dirty');
  }, []);
  const openImageDialog = useCallback(() => setDialog(true), []);

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
      // For a brand-new post, reflect the slug in the URL so a dev content-reload
      // returns to this post instead of a blank editor.
      if (!slug) {
        try {
          history.replaceState(null, '', `/editor/?slug=${encodeURIComponent(s)}`);
        } catch {
          /* ignore */
        }
      }
      setSlug(s);
      dirty.current = false;
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  // Debounced autosave (opt-in): when enabled, persist ~1.5s after the doc becomes dirty.
  useEffect(() => {
    if (!autosaveOn || status !== 'dirty') return;
    if (!shouldAutosave({ slug: effectiveSlug, title: form.title, dirty: true })) return;
    const t = setTimeout(() => {
      void persist();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autosaveOn, form, body, effectiveSlug]);

  function insertImage(img: ImageInsert) {
    const md = `![${img.alt}](${img.url}${img.size ? ` "${img.size}"` : ''})${img.caption ? `\n*${img.caption}*` : ''}`;
    const next = bodyRef.current ? `${bodyRef.current}\n\n${md}\n` : `${md}\n`;
    bodyRef.current = next;
    setBody(next);
    touch();
    setDialog(false);
  }

  async function unpublish(): Promise<void> {
    await persist({ draft: true });
  }

  return (
    <div data-testid="editor-app">
      <div className="editor-bar">
        <strong style={{ fontSize: 15 }}>{form.title || '(untitled)'}</strong>
        <span data-testid="save-status" style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--faint)' }}>
          {statusLabel[status]}
        </span>
        <label
          title="Autosave writes the file as you type. Off by default."
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}
        >
          <input
            type="checkbox"
            checked={autosaveOn}
            data-testid="autosave-toggle"
            onChange={(e) => {
              const n = e.target.checked;
              setAutosaveOn(n);
              try {
                localStorage.setItem('editor.autosave', n ? '1' : '0');
              } catch {
                /* ignore */
              }
            }}
          />
          autosave
        </label>
        <span className="grow" />
        {slug && (
          <a href={`/posts/${slug}/`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
            View page ↗
          </a>
        )}
        <button style={btn} data-testid="btn-save" onClick={() => void persist()}>Save</button>
        {form.draft ? (
          <button
            style={{ ...btn, background: 'var(--accent)', color: 'var(--bg)', borderColor: 'var(--accent)' }}
            data-testid="btn-publish"
            onClick={() => void persist({ draft: false })}
          >
            Publish
          </button>
        ) : (
          <button
            style={{ ...btn, color: 'var(--muted)' }}
            data-testid="btn-unpublish"
            title="Take this post off the live site (kept on disk)"
            onClick={() => void unpublish()}
          >
            Unpublish
          </button>
        )}
      </div>
      <FrontmatterForm form={form} onChange={patchForm} />
      <Editor value={body} onChange={changeBody} onImage={openImageDialog} />
      {dialog && <ImageDialog slug={effectiveSlug} onInsert={insertImage} onClose={() => setDialog(false)} />}
    </div>
  );
}
