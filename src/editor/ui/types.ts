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
  deleted: boolean;
};

export type PostMeta = { slug: string; title: string; date: string; draft: boolean; deleted: boolean };

export type ViewMode = 'edit' | 'split' | 'preview';

export type ImageInsert = { url: string; alt: string; size: '' | 'small' | 'medium' | 'large'; caption: string };
