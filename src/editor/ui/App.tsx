import { useEffect, useMemo, useState } from 'react';
import type { PostMeta, ViewMode } from './types.ts';
import { listPosts, getPost, savePost } from './api.ts';
import { dataToForm, formToData, emptyForm, type FormState } from './form.ts';
import { slugify } from './slugify.ts';
import Sidebar from './Sidebar.tsx';
import FrontmatterForm from './FrontmatterForm.tsx';
import MarkdownEditor from './MarkdownEditor.tsx';
import Preview, { ModeToggle } from './Preview.tsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(today()));
  const [body, setBody] = useState('');
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<ViewMode>('split');
  const [reloadKey, setReloadKey] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => listPosts().then(setPosts).catch((e) => setMsg(String(e)));
  useEffect(() => { refresh(); }, []);

  const patch = (p: Partial<FormState>) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };

  async function open(slug: string) {
    const { data, body } = await getPost(slug);
    setForm(dataToForm(data)); setBody(body); setActiveSlug(slug); setDirty(false); setMsg(null);
    setReloadKey((k) => k + 1);
  }
  function newPost() {
    setForm(emptyForm(today())); setBody(''); setActiveSlug(null); setDirty(true); setMsg(null);
  }
  async function save(next?: Partial<FormState>) {
    const f = next ? { ...form, ...next } : form;
    const slug = activeSlug ?? slugify(f.title);
    if (!slug) { setMsg('Give the post a title before saving.'); return; }
    if (!activeSlug && posts.some((p) => p.slug === slug)) { setMsg(`A post "${slug}" already exists.`); return; }
    if (next) setForm(f);
    await savePost(slug, formToData(f), body);
    await refresh();
    setActiveSlug(slug); setDirty(false); setReloadKey((k) => k + 1);
    setMsg(`Saved ${slug}${f.draft ? ' (draft)' : ''}.`);
  }

  const showEditor = mode !== 'preview';
  const showPreview = mode !== 'edit';
  const bar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #23272d' };
  const b: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: '1px solid #23272d', background: '#12151a', color: '#e6e6e6', cursor: 'pointer', fontSize: 13 };

  return (
    <div data-testid="editor-app" style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0d0f12', color: '#e6e6e6' }}>
      <Sidebar posts={posts} activeSlug={activeSlug} onOpen={open} onNew={newPost} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={bar}>
          <strong style={{ fontSize: 14 }}>{form.title || '(untitled)'}</strong>
          {dirty && <span title="unsaved changes" style={{ width: 8, height: 8, borderRadius: 8, background: '#e0a72c' }} />}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <ModeToggle mode={mode} onMode={setMode} />
            <button style={b} data-testid="btn-save" onClick={() => save()}>Save</button>
            <button style={b} data-testid="btn-save-draft" onClick={() => save({ draft: true })}>Save draft</button>
            <button style={{ ...b, background: '#1f6feb', borderColor: '#1f6feb' }} data-testid="btn-publish" onClick={() => save({ draft: false })}>Publish</button>
          </div>
        </div>
        {msg && <div data-testid="editor-msg" style={{ padding: '6px 12px', fontSize: 12, color: '#9aa0a6' }}>{msg}</div>}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {showEditor && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: showPreview ? '1px solid #23272d' : 'none' }}>
              <div style={{ maxHeight: '45%', overflow: 'auto', borderBottom: '1px solid #23272d' }}>
                <FrontmatterForm form={form} onChange={patch} />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <MarkdownEditor value={body} onChange={(v) => { setBody(v); setDirty(true); }} />
              </div>
            </div>
          )}
          {showPreview && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Preview slug={activeSlug} reloadKey={reloadKey} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
