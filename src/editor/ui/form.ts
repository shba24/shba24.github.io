import type { PostData } from './types.ts';

export type FormState = {
  title: string; date: string; description: string; tags: string;
  series: string; seriesPart: string; author: string;
  draft: boolean; recommended: boolean; hideToc: boolean; deleted: boolean;
};

const AUTHOR = 'Shubham Bansal';

export function dataToForm(d: PostData): FormState {
  return {
    title: d.title, date: d.date, description: d.description,
    tags: d.tags.join(', '),
    series: d.series ?? '',
    seriesPart: d.seriesPart != null ? String(d.seriesPart) : '',
    author: d.author, draft: d.draft, recommended: d.recommended, hideToc: d.hideToc, deleted: d.deleted,
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
    draft: f.draft, recommended: f.recommended, hideToc: f.hideToc, deleted: f.deleted,
  };
}

export const emptyForm = (today: string): FormState => ({
  title: '', date: today, description: '', tags: '', series: '', seriesPart: '',
  author: AUTHOR, draft: true, recommended: false, hideToc: false, deleted: false,
});
