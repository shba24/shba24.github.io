import type { IncomingMessage, ServerResponse } from 'node:http';
import { listPostsMeta, readPost, writePost } from './store.ts';
import { normalizePostData } from '../lib/frontmatter.ts';
import { isValidSlug } from './slug.ts';

type Next = (err?: unknown) => void;

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
    req.on('error', reject);
  });

export function editorMiddleware({ root }: { root: string }) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const path = url.pathname.replace(/\/$/, ''); // middleware is mounted at /api/editor
      const slug = url.searchParams.get('slug') ?? '';

      if (req.method === 'GET' && path === '/posts') return send(res, 200, { posts: await listPostsMeta(root) });
      if (req.method === 'GET' && path === '/post') {
        if (!slug || !isValidSlug(slug)) return send(res, 400, { error: 'invalid slug' });
        return send(res, 200, await readPost(root, slug));
      }
      if (req.method === 'PUT' && path === '/post') {
        if (!slug || !isValidSlug(slug)) return send(res, 400, { error: 'invalid slug' });
        const { data, body } = JSON.parse(await readBody(req)) as { data: unknown; body: string };
        await writePost(root, slug, normalizePostData(data as Record<string, unknown>), body ?? '');
        return send(res, 200, { ok: true });
      }
      next();
    } catch (err) {
      send(res, 500, { error: String((err as Error).message ?? err) });
    }
  };
}
