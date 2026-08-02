import { useEffect, useState } from 'react';

type PostMeta = { slug: string; title: string; date: string; draft: boolean };

export default function App() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/editor/posts/')
      .then((r) => r.json())
      .then((d: { posts: PostMeta[] }) => setPosts(d.posts))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main data-testid="editor-app" style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Blog Editor</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <ul>
        {posts.map((p) => (
          <li key={p.slug} data-testid="post-row">
            {p.title} {p.draft && <em>(draft)</em>} — <code>{p.slug}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
