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
