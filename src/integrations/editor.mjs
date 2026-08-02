import { fileURLToPath } from 'node:url';

/** Dev-only authoring studio: injects /editor + /drafts and mounts /api/editor. Never active in `astro build`. */
export default function blogEditor() {
  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, logger }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/editor', entrypoint: fileURLToPath(new URL('../editor/routes/editor.astro', import.meta.url)) });
        injectRoute({ pattern: '/drafts', entrypoint: fileURLToPath(new URL('../editor/routes/drafts.astro', import.meta.url)) });
        logger.info('blog editor mounted at /editor and /drafts (dev only)');
      },
      'astro:server:setup': async ({ server }) => {
        const mwPath = fileURLToPath(new URL('../editor/server/middleware.ts', import.meta.url));
        const mod = await server.ssrLoadModule(mwPath); // Vite transpiles the .ts on load
        server.middlewares.use('/api/editor', mod.editorMiddleware({ root: process.cwd() }));
        server.config.logger.info('blog editor API mounted at /api/editor (dev only)');
      },
    },
  };
}
