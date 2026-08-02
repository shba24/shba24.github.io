# Blog Authoring Studio — Editor Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Foundation's bare post-list at `/editor/` into a usable editor: a Drafts/Published/New sidebar, a CodeMirror markdown pane, a frontmatter form, Save / Save-as-draft / Publish, and an Edit/Split/Preview view backed by the real dev-rendered page.

**Architecture:** All work is client-side React inside the existing dev-only `/editor` island (`src/editor/ui/`), talking to the Foundation's `/api/editor/*` file API. Pure logic (slugify, draft/published partitioning, PostData⇆form mapping) lives in small tested modules; React components compose them. Preview is an `<iframe>` of the post's real dev URL (`/posts/<slug>/`), reloaded after each save — true-to-site, no second renderer. No API/build changes; the editor remains absent from production (verified by the Foundation's `editor-absent` spec, which still runs).

**Tech Stack:** React 18 islands, `@uiw/react-codemirror` + `@codemirror/lang-markdown` (editor UI — only ever loaded on the dev-only `/editor` route, never in the production build), TypeScript, `node --test` (unit), Playwright `playwright.editor.config.ts` (dev e2e).

## Global Constraints

- **Node** `24.18.1` (`.nvmrc`); **pnpm 9.12.0**; build/test **locally** on Node 24. If a shell shows v20, `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- **Dev-only, unchanged:** the editor lives only on the `/editor` route injected when `command === 'dev'`. Do **not** import editor UI from any `src/pages/**`, `src/components/**`, or `src/layouts/**`. The production build must stay editor-free — the existing `tests/editor-absent.spec.ts` must still pass.
- **Write-only:** no git operations anywhere in the editor.
- **API is fixed (Foundation):** `GET /api/editor/posts/` → `{ posts: PostMeta[] }`; `GET /api/editor/post/?slug=<slug>` → `{ data: PostData, body: string }`; `PUT /api/editor/post/?slug=<slug>` with JSON `{ data, body }` → `{ ok: true }`. **All URLs need the trailing slash** (`trailingSlash: 'always'`). Create, update, publish, and save-as-draft are all just `PUT` with the right `data.draft`. Do not add or change API routes in this phase.
- **`PostData`** (must match `src/editor/lib/frontmatter.ts` + `src/content.config.ts`): `{ title: string; date: string /*YYYY-MM-DD*/; description: string; tags: string[]; series?: string; seriesPart?: number; author: string; draft: boolean; recommended: boolean; hideToc: boolean }`. Default author `'Shubham Bansal'`.
- **Slugs** must satisfy the API guard `isValidSlug` = `/^[A-Za-z0-9._-]+$/ && !includes('..')`.
- **Type-checks:** `pnpm check` must pass with 0 errors (2 pre-existing Cloudflare-script hints are acceptable). Relative imports in `.ts`/`.tsx` under `src/editor` use explicit extensions where the file is also consumed by `node --test` (pure logic modules); React component imports follow existing repo style (extensionless is fine for the bundler, but `node --test` files must use `.ts`).
- **New deps:** `@uiw/react-codemirror` and `@codemirror/lang-markdown` in `dependencies`. They are only imported by `src/editor/ui/**`, which only builds on the dev-only route, so they never enter the production client bundle.
- Commit after every task with the message shown in its final step.

## File Structure

```
src/editor/ui/
  types.ts             # shared client types: PostData, PostMeta, ViewMode
  slugify.ts           # pure: title -> valid slug
  partition.ts         # pure: PostMeta[] -> { drafts:5, published:5 }
  form.ts              # pure: PostData <-> FormState (tags string<->[], number parsing)
  api.ts               # typed fetch wrappers over /api/editor/* (trailing slash)
  MarkdownEditor.tsx   # CodeMirror markdown pane
  FrontmatterForm.tsx  # frontmatter fields bound to FormState
  Sidebar.tsx          # Drafts(5) + Published(5) + New
  Preview.tsx          # iframe of /posts/<slug>/ + Edit/Split/Preview toggle
  App.tsx              # shell: state + orchestration (rewrites the Foundation stub)
  slugify.test.ts      # node --test
  partition.test.ts    # node --test
  form.test.ts         # node --test
tests/editor/
  editor-core.spec.ts  # dev e2e (playwright.editor.config.ts)
```

---

### Task 1: Deps + shared types + slugify

**Files:**
- Modify: `package.json` (add `@uiw/react-codemirror`, `@codemirror/lang-markdown`)
- Create: `src/editor/ui/types.ts`
- Create: `src/editor/ui/slugify.ts`
- Create: `src/editor/ui/slugify.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `export type PostData = {...}` (the schema above), `export type PostMeta = { slug: string; title: string; date: string; draft: boolean }`, `export type ViewMode = 'edit' | 'split' | 'preview'`.
  - `slugify.ts`: `export function slugify(title: string): string` — lowercase, non-`[a-z0-9]`→`-`, collapse repeats, trim leading/trailing `-`; guaranteed to satisfy `isValidSlug` (or `''` for empty).

- [ ] **Step 1: Install the editor deps**

```bash
pnpm add @uiw/react-codemirror @codemirror/lang-markdown
```

- [ ] **Step 2: Write the failing test**

Create `src/editor/ui/slugify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slugify.ts';

test('slugify lowercases and dashes non-alphanumerics', () => {
  assert.equal(slugify('My New Post!'), 'my-new-post');
});
test('slugify collapses repeats and trims edges', () => {
  assert.equal(slugify('  Hello --- World  '), 'hello-world');
});
test('slugify keeps digits and preserves existing hyphens', () => {
  assert.equal(slugify('Iceberg Table Format Part 1'), 'iceberg-table-format-part-1');
});
test('slugify returns empty string for no usable characters', () => {
  assert.equal(slugify('!!!'), '');
});
```

- [ ] **Step 3: Run it — fails (module missing)**

Run: `pnpm test:unit`
Expected: FAIL — cannot find `./slugify.ts` (existing 13 tests still pass).

- [ ] **Step 4: Implement types + slugify**

Create `src/editor/ui/types.ts`:

```ts
export type PostData = {
  title: string;
  date: string; // YYYY-MM-DD
  description: string;
  tags: string[];
  series?: string;
  seriesPart?: number;
  author: string;
  draft: boolean;
  recommended: boolean;
  hideToc: boolean;
};

export type PostMeta = { slug: string; title: string; date: string; draft: boolean };

export type ViewMode = 'edit' | 'split' | 'preview';
```

Create `src/editor/ui/slugify.ts`:

```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 5: Run it — passes**

Run: `pnpm test:unit`
Expected: PASS (13 prior + 4 new = 17).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/editor/ui/types.ts src/editor/ui/slugify.ts src/editor/ui/slugify.test.ts
git commit -m "Editor core: CodeMirror deps, shared client types, slugify (tested)"
```

---

### Task 2: Partition drafts/published

**Files:**
- Create: `src/editor/ui/partition.ts`
- Create: `src/editor/ui/partition.test.ts`

**Interfaces:**
- Consumes: `PostMeta` (Task 1).
- Produces: `export function partition(posts: PostMeta[], limit = 5): { drafts: PostMeta[]; published: PostMeta[] }` — splits by `draft`, preserves input order (the API already returns date-desc), each capped at `limit`.

- [ ] **Step 1: Write the failing test**

Create `src/editor/ui/partition.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partition } from './partition.ts';
import type { PostMeta } from './types.ts';

const m = (slug: string, draft: boolean): PostMeta => ({ slug, title: slug, date: '2024-01-01', draft });

test('partition splits drafts from published preserving order', () => {
  const { drafts, published } = partition([m('a', true), m('b', false), m('c', true)]);
  assert.deepEqual(drafts.map((p) => p.slug), ['a', 'c']);
  assert.deepEqual(published.map((p) => p.slug), ['b']);
});

test('partition caps each list at the limit', () => {
  const posts = Array.from({ length: 8 }, (_, i) => m(`d${i}`, true));
  assert.equal(partition(posts, 5).drafts.length, 5);
});
```

- [ ] **Step 2: Run it — fails**

Run: `pnpm test:unit`
Expected: FAIL — cannot find `./partition.ts`.

- [ ] **Step 3: Implement**

Create `src/editor/ui/partition.ts`:

```ts
import type { PostMeta } from './types.ts';

export function partition(posts: PostMeta[], limit = 5): { drafts: PostMeta[]; published: PostMeta[] } {
  const drafts: PostMeta[] = [];
  const published: PostMeta[] = [];
  for (const p of posts) (p.draft ? drafts : published).push(p);
  return { drafts: drafts.slice(0, limit), published: published.slice(0, limit) };
}
```

- [ ] **Step 4: Run it — passes**

Run: `pnpm test:unit`
Expected: PASS (17 prior + 2 new = 19).

- [ ] **Step 5: Commit**

```bash
git add src/editor/ui/partition.ts src/editor/ui/partition.test.ts
git commit -m "Editor core: partition posts into recent drafts/published (tested)"
```

---

### Task 3: PostData ⇆ form mapping

**Files:**
- Create: `src/editor/ui/form.ts`
- Create: `src/editor/ui/form.test.ts`

**Interfaces:**
- Consumes: `PostData` (Task 1).
- Produces:
  - `export type FormState = { title: string; date: string; description: string; tags: string; series: string; seriesPart: string; author: string; draft: boolean; recommended: boolean; hideToc: boolean }` (all text inputs are strings; `tags` is comma-separated; `seriesPart` is a string for the input).
  - `export function dataToForm(d: PostData): FormState`
  - `export function formToData(f: FormState): PostData` — trims; `tags` split on commas (drop blanks); `seriesPart` parsed to number or `undefined`; empty `series` → `undefined`; empty `author` → `'Shubham Bansal'`.
  - `export const emptyForm: (today: string) => FormState` — blanks with `author` defaulted and `date=today`.

- [ ] **Step 1: Write the failing test**

Create `src/editor/ui/form.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataToForm, formToData, emptyForm } from './form.ts';
import type { PostData } from './types.ts';

const base: PostData = {
  title: 'T', date: '2024-05-01', description: 'd', tags: ['A', 'B'],
  series: 'S', seriesPart: 2, author: 'Shubham Bansal', draft: true, recommended: false, hideToc: false,
};

test('dataToForm joins tags and stringifies seriesPart', () => {
  const f = dataToForm(base);
  assert.equal(f.tags, 'A, B');
  assert.equal(f.seriesPart, '2');
  assert.equal(f.draft, true);
});

test('formToData round-trips through dataToForm', () => {
  assert.deepEqual(formToData(dataToForm(base)), base);
});

test('formToData drops empty tags/series and defaults author', () => {
  const d = formToData({ ...dataToForm(base), tags: 'X, , Y ,', series: '', seriesPart: '', author: '' });
  assert.deepEqual(d.tags, ['X', 'Y']);
  assert.equal(d.series, undefined);
  assert.equal(d.seriesPart, undefined);
  assert.equal(d.author, 'Shubham Bansal');
});

test('emptyForm defaults author and date', () => {
  const f = emptyForm('2026-08-02');
  assert.equal(f.author, 'Shubham Bansal');
  assert.equal(f.date, '2026-08-02');
  assert.equal(f.draft, true);
});
```

- [ ] **Step 2: Run it — fails**

Run: `pnpm test:unit`
Expected: FAIL — cannot find `./form.ts`.

- [ ] **Step 3: Implement**

Create `src/editor/ui/form.ts`:

```ts
import type { PostData } from './types.ts';

export type FormState = {
  title: string; date: string; description: string; tags: string;
  series: string; seriesPart: string; author: string;
  draft: boolean; recommended: boolean; hideToc: boolean;
};

const AUTHOR = 'Shubham Bansal';

export function dataToForm(d: PostData): FormState {
  return {
    title: d.title, date: d.date, description: d.description,
    tags: d.tags.join(', '),
    series: d.series ?? '',
    seriesPart: d.seriesPart != null ? String(d.seriesPart) : '',
    author: d.author, draft: d.draft, recommended: d.recommended, hideToc: d.hideToc,
  };
}

export function formToData(f: FormState): PostData {
  const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const series = f.series.trim() || undefined;
  const sp = f.seriesPart.trim();
  const seriesPart = series && sp !== '' && !Number.isNaN(Number(sp)) ? Number(sp) : undefined;
  return {
    title: f.title.trim(), date: f.date.trim(), description: f.description.trim(),
    tags, series, seriesPart,
    author: f.author.trim() || AUTHOR,
    draft: f.draft, recommended: f.recommended, hideToc: f.hideToc,
  };
}

export const emptyForm = (today: string): FormState => ({
  title: '', date: today, description: '', tags: '', series: '', seriesPart: '',
  author: AUTHOR, draft: true, recommended: false, hideToc: false,
});
```

Note: `formToData(dataToForm(base))` equals `base` only when `base.author` is the default and `seriesPart` is present with `series`. The round-trip test uses such a `base`; keep the field handling exactly as above so it holds.

- [ ] **Step 4: Run it — passes**

Run: `pnpm test:unit`
Expected: PASS (19 prior + 4 new = 23).

- [ ] **Step 5: Commit**

```bash
git add src/editor/ui/form.ts src/editor/ui/form.test.ts
git commit -m "Editor core: PostData<->form mapping (tags/seriesPart/author rules, tested)"
```

---

### Task 4: Typed API client

**Files:**
- Create: `src/editor/ui/api.ts`

**Interfaces:**
- Consumes: `PostData`, `PostMeta` (Task 1).
- Produces (all use trailing-slash URLs):
  - `export async function listPosts(): Promise<PostMeta[]>` → GET `/api/editor/posts/`
  - `export async function getPost(slug: string): Promise<{ data: PostData; body: string }>` → GET `/api/editor/post/?slug=<slug>`
  - `export async function savePost(slug: string, data: PostData, body: string): Promise<void>` → PUT `/api/editor/post/?slug=<slug>`; throws on non-2xx.

- [ ] **Step 1: Implement the client**

Create `src/editor/ui/api.ts`:

```ts
import type { PostData, PostMeta } from './types.ts';

const enc = (s: string) => encodeURIComponent(s);

export async function listPosts(): Promise<PostMeta[]> {
  const r = await fetch('/api/editor/posts/');
  if (!r.ok) throw new Error(`listPosts ${r.status}`);
  return (await r.json()).posts as PostMeta[];
}

export async function getPost(slug: string): Promise<{ data: PostData; body: string }> {
  const r = await fetch(`/api/editor/post/?slug=${enc(slug)}`);
  if (!r.ok) throw new Error(`getPost ${r.status}`);
  return r.json();
}

export async function savePost(slug: string, data: PostData, body: string): Promise<void> {
  const r = await fetch(`/api/editor/post/?slug=${enc(slug)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, body }),
  });
  if (!r.ok) throw new Error(`savePost ${r.status}: ${await r.text().catch(() => '')}`);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: 0 errors. (Behavior is covered by the Task 10 e2e.)

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/api.ts
git commit -m "Editor core: typed /api/editor client (list/get/save)"
```

---

### Task 5: CodeMirror markdown pane

**Files:**
- Create: `src/editor/ui/MarkdownEditor.tsx`

**Interfaces:**
- Produces: `export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void })` — a CodeMirror editor with the markdown language, dark theme, line wrapping; root carries `data-testid="cm-editor"`.

- [ ] **Step 1: Implement**

Create `src/editor/ui/MarkdownEditor.tsx`:

```tsx
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';

export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div data-testid="cm-editor" style={{ height: '100%', overflow: 'auto' }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme="dark"
        extensions={[markdown(), EditorView.lineWrapping]}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        height="100%"
        style={{ fontSize: 14 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/MarkdownEditor.tsx
git commit -m "Editor core: CodeMirror markdown pane"
```

---

### Task 6: Frontmatter form

**Files:**
- Create: `src/editor/ui/FrontmatterForm.tsx`

**Interfaces:**
- Consumes: `FormState` (Task 3).
- Produces: `export default function FrontmatterForm({ form, onChange }: { form: FormState; onChange: (patch: Partial<FormState>) => void })` — labeled inputs for every field. Text inputs: `title` (`data-testid="fm-title"`), `date` (type=date), `description`, `tags`, `series`, `seriesPart` (type=number), `author`. Checkboxes: `draft` (`data-testid="fm-draft"`), `recommended`, `hideToc`. Each input calls `onChange({ field: value })`.

- [ ] **Step 1: Implement**

Create `src/editor/ui/FrontmatterForm.tsx`:

```tsx
import type { FormState } from './form.ts';

const row: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 };
const label: React.CSSProperties = { fontSize: 12, color: '#9aa0a6' };

export default function FrontmatterForm({
  form, onChange,
}: { form: FormState; onChange: (patch: Partial<FormState>) => void }) {
  const text = (k: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}, testid?: string) => (
    <input
      value={String(form[k])}
      data-testid={testid}
      onChange={(e) => onChange({ [k]: e.target.value } as Partial<FormState>)}
      style={{ padding: '6px 8px', background: '#0a0b0d', color: '#e6e6e6', border: '1px solid #23272d', borderRadius: 6 }}
      {...props}
    />
  );
  const check = (k: 'draft' | 'recommended' | 'hideToc', testid?: string) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
      <input type="checkbox" checked={form[k]} data-testid={testid}
        onChange={(e) => onChange({ [k]: e.target.checked } as Partial<FormState>)} />
      {k}
    </label>
  );
  return (
    <div style={{ padding: 12, overflow: 'auto' }}>
      <div style={row}><span style={label}>Title</span>{text('title', {}, 'fm-title')}</div>
      <div style={row}><span style={label}>Date</span>{text('date', { type: 'date' })}</div>
      <div style={row}><span style={label}>Description</span>{text('description')}</div>
      <div style={row}><span style={label}>Tags (comma-separated)</span>{text('tags')}</div>
      <div style={row}><span style={label}>Series</span>{text('series')}</div>
      <div style={row}><span style={label}>Series part</span>{text('seriesPart', { type: 'number' })}</div>
      <div style={row}><span style={label}>Author</span>{text('author')}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>{check('draft', 'fm-draft')}{check('recommended')}{check('hideToc')}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/FrontmatterForm.tsx
git commit -m "Editor core: frontmatter form bound to FormState"
```

---

### Task 7: Sidebar

**Files:**
- Create: `src/editor/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `PostMeta` (Task 1), `partition` (Task 2).
- Produces: `export default function Sidebar({ posts, activeSlug, onOpen, onNew }: { posts: PostMeta[]; activeSlug: string | null; onOpen: (slug: string) => void; onNew: () => void })` — a **New** button (`data-testid="sb-new"`), then a "Drafts" section and a "Published" section (5 each via `partition`), each item a button (`data-testid="sb-item"`) that calls `onOpen(slug)`; the active slug is visually marked.

- [ ] **Step 1: Implement**

Create `src/editor/ui/Sidebar.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/Sidebar.tsx
git commit -m "Editor core: Drafts/Published/New sidebar"
```

---

### Task 8: Preview pane + view-mode toggle

**Files:**
- Create: `src/editor/ui/Preview.tsx`

**Interfaces:**
- Consumes: `ViewMode` (Task 1).
- Produces: `export default function Preview({ slug, reloadKey }: { slug: string | null; reloadKey: number })` — an `<iframe data-testid="preview-frame">` pointed at `/posts/<slug>/`; changing `reloadKey` forces a reload (via `key`/`src` refresh). When `slug` is null (unsaved new post), shows a "Save to preview" placeholder.
- Also `export function ModeToggle({ mode, onMode }: { mode: ViewMode; onMode: (m: ViewMode) => void })` — three buttons Edit/Split/Preview (`data-testid="mode-edit|mode-split|mode-preview"`).

- [ ] **Step 1: Implement**

Create `src/editor/ui/Preview.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/Preview.tsx
git commit -m "Editor core: live preview iframe + Edit/Split/Preview toggle"
```

---

### Task 9: App shell wiring

**Files:**
- Modify: `src/editor/ui/App.tsx` (replace the Foundation stub)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Behavior: on mount, `listPosts()` → sidebar. Open a post → `getPost` → fill form + body, set `activeSlug`, `dirty=false`. New → `emptyForm(today)`, blank body, `activeSlug=null`, `dirty=true`. Save → derive slug (existing `activeSlug`, or `slugify(form.title)` for new; block empty title), `savePost(slug, formToData(form), body)`, refresh list, set `activeSlug=slug`, `dirty=false`, bump `reloadKey`. **Save as draft** = set `form.draft=true` then save. **Publish** = set `form.draft=false` then save. Header shows title + a dirty dot + `ModeToggle` + Save/Save-draft/Publish buttons.

- [ ] **Step 1: Replace App.tsx**

Overwrite `src/editor/ui/App.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check + dev mount**

Run: `pnpm check` → 0 errors.
Run: `lsof -ti:4321 -sTCP:LISTEN | xargs kill 2>/dev/null; sleep 1; (pnpm dev >/tmp/core-dev.log 2>&1 &) ; sleep 8 ; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/editor/ ; pkill -f "astro.js dev" 2>/dev/null; lsof -ti:4321 -sTCP:LISTEN | xargs kill 2>/dev/null`
Expected: `200`.

- [ ] **Step 3: Commit**

```bash
git add src/editor/ui/App.tsx
git commit -m "Editor core: App shell — sidebar + form + CodeMirror + preview + Save/Save-draft/Publish/New"
```

---

### Task 10: Dev e2e for the editor flows

**Files:**
- Create: `tests/editor/editor-core.spec.ts` (runs under `playwright.editor.config.ts`, `webServer: pnpm dev`)

**Interfaces:**
- Consumes: the running dev editor + `/api/editor/*`.

- [ ] **Step 1: Write the spec**

Create `tests/editor/editor-core.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('sidebar lists posts and opens one into the editor', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.getByTestId('sb-new')).toBeVisible();
  const items = page.getByTestId('sb-item');
  await expect(items.first()).toBeVisible();
  await page.getByText('Distributed Table Format', { exact: false }).first().click();
  await expect(page.getByTestId('fm-title')).toHaveValue(/Iceberg/);
  await expect(page.getByTestId('cm-editor')).toBeVisible();
});

test('view mode toggles between edit, split, preview', async ({ page }) => {
  await page.goto('/editor/');
  await page.getByTestId('sb-item').first().click();
  await page.getByTestId('mode-preview').click();
  await expect(page.getByTestId('preview-frame')).toBeVisible();
  await expect(page.getByTestId('cm-editor')).toHaveCount(0);
  await page.getByTestId('mode-edit').click();
  await expect(page.getByTestId('cm-editor')).toBeVisible();
});

test('new -> fill -> save creates a post file, then publish flips draft', async ({ page, request }) => {
  const title = `E2E Temp ${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await page.goto('/editor/');
  await page.getByTestId('sb-new').click();
  await page.getByTestId('fm-title').fill(title);
  await page.getByTestId('btn-save-draft').click();
  await expect(page.getByTestId('editor-msg')).toContainText(slug);

  // API confirms it exists as a draft
  let res = await request.get(`/api/editor/post/?slug=${slug}`);
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).data.draft).toBe(true);

  // Publish flips draft:false
  await page.getByTestId('btn-publish').click();
  await expect(page.getByTestId('editor-msg')).toContainText(slug);
  await expect.poll(async () => (await (await request.get(`/api/editor/post/?slug=${slug}`)).json()).data.draft).toBe(false);

  // cleanup the temp file so the working tree stays clean
  await request.fetch(`/api/editor/post/?slug=${slug}`, { method: 'DELETE' }).catch(() => {});
});
```

Note: there is no DELETE route (write-only Foundation), so the cleanup line is best-effort and will no-op. Instead, the test writes the temp post under a unique title; **remove the generated file in Step 2** after the run so the tree stays clean.

- [ ] **Step 2: Run + clean up the temp post**

Run:
```bash
lsof -ti:4321 -sTCP:LISTEN | xargs kill 2>/dev/null; sleep 1
pnpm test:e2e:editor
```
Expected: all specs PASS (the Foundation smoke specs plus these 3).
Then delete any `E2E Temp *` file the create-test produced: `rm -f src/content/posts/e2e-temp-*.md` and confirm `git status --short src/content/posts` shows only intended files.

- [ ] **Step 3: Commit**

```bash
git add tests/editor/editor-core.spec.ts
git commit -m "Editor core: dev e2e — open/edit, mode toggle, new+save+publish"
```

---

## Self-Review (completed)

- **Spec coverage (spec §5.1 core):** CodeMirror editor ✓ (T5); preview toggle Edit/Split/Preview ✓ (T8,T9); sidebar Drafts5+Published5+New ✓ (T7); frontmatter form ✓ (T6); Save / Save-as-draft / Publish (flips `draft:false`) ✓ (T9); New with slug-from-title + collision guard ✓ (T9); true-to-site preview via dev iframe ✓ (T8). Deferred to later phases (per spec §5.2/§5.3): toolbar & insert modals, in-post Edit button + Drafts nav tab + single-edit lock (Navigation & Safety phase), autocomplete/validation/autosave/find-replace/rename-delete-duplicate (Enhancements).
- **Placeholder scan:** none — every step has literal code and an exact command. (Two `Note:` callouts flag a stray token to avoid and the best-effort DELETE line.)
- **Type consistency:** `PostData`/`PostMeta`/`ViewMode` (types.ts) and `FormState`/`dataToForm`/`formToData`/`emptyForm` (form.ts) and `listPosts`/`getPost`/`savePost` (api.ts) are used with identical names/shapes across Tasks 1–10.

## Follow-on phases (separate plans)
1. **Toolbar & Inserts** — all toolbar items + live PlantUML/D2 & KaTeX modals, image dialog, callouts, table, caption, sizing.
2. **Navigation & Safety** — in-post dev-only Edit button (`PostHeader.astro`), styled Drafts nav tab (`Topbar.astro`), single-edit heartbeat lock + Take-over.
3. **Enhancements** — tag/series autocomplete, schema validation, outline, internal-link picker, debounced auto-save + unsaved guard, find/replace, rename/delete/duplicate, shortcuts.
