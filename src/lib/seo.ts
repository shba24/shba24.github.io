import { SITE } from '../consts';

export function buildWebsiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.title,
    url: SITE.url,
    description: SITE.description,
  };
}

export interface ArticleJsonLdParams {
  title: string;
  description: string;
  date: Date;
  author: string;
  url: string;
  image: string;
}

export function buildArticleJsonLd({ title, description, date, author, url, image }: ArticleJsonLdParams) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished: new Date(date).toISOString(),
    author: { '@type': 'Person', name: author },
    url,
    image,
    mainEntityOfPage: url,
  };
}
