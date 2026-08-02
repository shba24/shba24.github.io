#!/usr/bin/env node
// Generate per-post narration MP3s with Piper TTS + ffmpeg.
//
// Design goals:
//  - Zero new dependencies: only Node built-ins.
//  - NEVER fail the build. If piper/ffmpeg/model are unavailable, log a skip
//    and exit 0 so `astro build` still runs. Real audio is produced in CI.
//  - Idempotent: a manifest of sha256(text + modelId) lets us skip posts whose
//    readable text and voice model are unchanged and whose mp3 already exists.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST_PATH = path.join(AUDIO_DIR, 'manifest.json');

// The voice model path doubles as the model identifier baked into the hash, so
// switching voices invalidates cached mp3s.
// PIPER_MODEL wins; otherwise fall back to the canonical path that
// scripts/setup-audio.sh downloads to, so `pnpm build` finds the voice on any
// machine with no extra env. The voice ID (not the absolute path) keys the
// cache hash, so CI and local produce identical, portable hashes.
const MODEL = process.env.PIPER_MODEL
  || path.join(os.homedir(), '.cache', 'piper-voices', 'en_US-lessac-medium.onnx');
const VOICE_ID = path.basename(MODEL).replace(/\.onnx$/i, '');

/** Is `bin` an executable on PATH? Returns its full path, or null. */
function onPath(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const isWin = process.platform === 'win32';
  const exts = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        fs.accessSync(full, isWin ? fs.constants.F_OK : fs.constants.X_OK);
        return full;
      } catch {
        // not here; keep looking
      }
    }
  }
  return null;
}

/** Parse `draft:` out of YAML frontmatter without a YAML dependency. */
function isDraft(md) {
  const fm = md.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) return false;
  const m = fm[1].match(/^\s*draft\s*:\s*(true|false)\b/im);
  return m ? m[1].toLowerCase() === 'true' : false;
}

/**
 * Turn markdown into plain, readable prose suitable for TTS.
 * Intentionally simple and forgiving — the goal is speakable text, not a
 * faithful AST round-trip.
 */
function extractText(md) {
  let t = md;

  // Frontmatter (only at the very top).
  t = t.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '\n');

  // Fenced code blocks (``` or ~~~) — drop entirely, they don't read well.
  t = t.replace(/^[ \t]*```[\s\S]*?^[ \t]*```[ \t]*$/gm, ' ');
  t = t.replace(/^[ \t]*~~~[\s\S]*?^[ \t]*~~~[ \t]*$/gm, ' ');

  // HTML comments, then HTML tags (incl. bare autolinks like <https://...>).
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<[^>]+>/g, ' ');

  // Images: drop markup and any alt text.
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  t = t.replace(/!\[[^\]]*\]\[[^\]]*\]/g, ' ');

  // Links: keep the visible text, drop the target.
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');

  // Line-leading structure → readable sentences.
  t = t.replace(/^[ \t]*#{1,6}[ \t]*/gm, ''); // headings: drop the #'s
  t = t.replace(/^[ \t]*>[ \t]?/gm, ''); // blockquote markers
  t = t.replace(/^[ \t]*([*+-]|\d+[.)])[ \t]+/gm, ''); // list bullets/numbers
  t = t.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, ''); // horizontal rules

  // Tables: pipes become spaces.
  t = t.replace(/\|/g, ' ');

  // Unescape markdown escapes (\* \_ \# ...).
  t = t.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1');

  // Drop the remaining emphasis/code punctuation per spec (#, *, backticks).
  t = t.replace(/[`*#]/g, '');

  // Whitespace cleanup → paragraphs separated by blank lines.
  t = t
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return t;
}

function loadManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // Gather non-draft posts.
  let files = [];
  try {
    files = fs
      .readdirSync(POSTS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md'))
      .sort();
  } catch {
    console.warn(`[audio] no posts directory at ${POSTS_DIR} — nothing to do`);
    process.exit(0);
  }

  const posts = [];
  for (const file of files) {
    const md = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    if (isDraft(md)) continue;
    const slug = path.basename(file, path.extname(file));
    const text = extractText(md);
    const hash = createHash('sha256').update(`${text}${VOICE_ID}`).digest('hex');
    posts.push({ slug, text, hash });
  }

  // Tool + model availability. If anything is missing we skip cleanly.
  const piperBin = onPath('piper');
  const ffmpegBin = onPath('ffmpeg');
  const modelOk = !!MODEL && fs.existsSync(MODEL);

  if (!piperBin || !ffmpegBin || !modelOk) {
    console.warn('[audio] piper/ffmpeg/model unavailable — skipping TTS (build continues)');
    process.exit(0);
  }

  const manifest = loadManifest();
  let generated = 0;
  let skipped = 0;

  for (const { slug, text, hash } of posts) {
    const mp3Path = path.join(AUDIO_DIR, `${slug}.mp3`);
    if (manifest[slug] === hash && fs.existsSync(mp3Path)) {
      skipped++;
      continue;
    }

    const tmpWav = path.join(os.tmpdir(), `audio-${slug}-${process.pid}.wav`);
    try {
      const piper = spawnSync(piperBin, ['--model', MODEL, '--output_file', tmpWav], {
        input: text,
        encoding: 'utf8',
      });
      if (piper.status !== 0) {
        console.warn(`[audio] piper failed for ${slug} (exit ${piper.status}) — skipping`);
        continue;
      }

      const ff = spawnSync(
        ffmpegBin,
        ['-y', '-i', tmpWav, '-codec:a', 'libmp3lame', '-qscale:a', '4', mp3Path],
        { encoding: 'utf8' },
      );
      if (ff.status !== 0) {
        console.warn(`[audio] ffmpeg failed for ${slug} (exit ${ff.status}) — skipping`);
        continue;
      }

      manifest[slug] = hash;
      generated++;
      console.log(`[audio] generated ${slug}.mp3`);
    } catch (err) {
      // Never let a single post take down the build.
      console.warn(`[audio] error for ${slug}: ${err && err.message ? err.message : err}`);
    } finally {
      try {
        fs.rmSync(tmpWav, { force: true });
      } catch {
        // best effort
      }
    }
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[audio] generated ${generated}, skipped ${skipped}`);
}

main();
