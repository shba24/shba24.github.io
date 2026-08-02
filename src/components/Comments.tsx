import { useEffect, useState } from 'react';
import Giscus from '@giscus/react';
import type { Repo, Theme } from '@giscus/react';
import { GISCUS } from '../consts';

/** Map the site's `data-theme` to a giscus theme; dark is the default. */
function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Giscus (GitHub Discussions) comments. Rendered as a `client:visible` island,
 * so this also runs during SSR where `document` is absent — hence the guard and
 * the `'dark'` initial state. A MutationObserver keeps the widget theme in sync
 * with the site's theme toggle.
 */
export default function Comments() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(readTheme());
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Giscus
      repo={GISCUS.repo as Repo}
      repoId={GISCUS.repoId}
      category={GISCUS.category}
      categoryId={GISCUS.categoryId}
      mapping="pathname"
      reactionsEnabled="1"
      loading="lazy"
      theme={theme}
    />
  );
}
