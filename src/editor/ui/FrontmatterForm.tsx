import type { FormState } from './form.ts';

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 };
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const label: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)',
};
const input: React.CSSProperties = {
  padding: '6px 9px', background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--sans)', fontSize: 14,
};

export default function FrontmatterForm({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
}) {
  const text = (k: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}, testid?: string) => (
    <input
      value={String(form[k])}
      data-testid={testid}
      style={input}
      onChange={(e) => onChange({ [k]: e.target.value } as Partial<FormState>)}
      {...props}
    />
  );
  const check = (k: 'draft' | 'recommended' | 'hideToc', testid?: string) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--muted)' }}>
      <input type="checkbox" checked={form[k]} data-testid={testid} onChange={(e) => onChange({ [k]: e.target.checked } as Partial<FormState>)} />
      {k}
    </label>
  );
  return (
    <div style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'var(--surface)' }}>
      <div style={grid}>
        <div style={{ ...field, gridColumn: '1 / -1' }}><span style={label}>Title</span>{text('title', {}, 'fm-title')}</div>
        <div style={field}><span style={label}>Date</span>{text('date', { type: 'date' })}</div>
        <div style={field}><span style={label}>Author</span>{text('author')}</div>
        <div style={{ ...field, gridColumn: '1 / -1' }}><span style={label}>Description</span>{text('description')}</div>
        <div style={{ ...field, gridColumn: '1 / -1' }}><span style={label}>Tags (comma-separated)</span>{text('tags')}</div>
        <div style={field}><span style={label}>Series</span>{text('series')}</div>
        <div style={field}><span style={label}>Series part</span>{text('seriesPart', { type: 'number' })}</div>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>{check('draft', 'fm-draft')}{check('recommended')}{check('hideToc')}</div>
    </div>
  );
}
