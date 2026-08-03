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

export type ImageInsert = { url: string; alt: string; size: '' | 'small' | 'medium' | 'large'; caption: string };
