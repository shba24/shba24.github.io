import fs from 'node:fs';
import path from 'node:path';

/**
 * Build-time check for a post's narration MP3. The audio files are produced by
 * `scripts/generate-audio.mjs` into `public/audio/<slug>.mp3` (see the build
 * script wired into `pnpm build`). This runs in Astro frontmatter during SSG,
 * where Node's `fs` is available and the CWD is the project root — so a path
 * relative to `public/audio` resolves correctly.
 *
 * Locally, no MP3s exist (piper/ffmpeg are absent), so this returns `false`
 * and callers omit the player entirely.
 */
export function hasAudio(slug: string): boolean {
  return fs.existsSync(path.join('public/audio', slug + '.mp3'));
}

/** Public URL for a post's narration MP3, served from `public/`. */
export function audioSrc(slug: string): string {
  return '/audio/' + slug + '.mp3';
}
