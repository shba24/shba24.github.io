import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KROKI_URL = (process.env.KROKI_URL || 'https://kroki.io').replace(/\/$/, '');
const CACHE_DIR = path.join(process.cwd(), 'diagram-cache');

// PlantUML: neutral, transparent monochrome line-art that follows the site theme.
const PLANTUML_SKIN = [
  'skinparam backgroundColor transparent',
  'skinparam monochrome true',
  'skinparam shadowing false',
  'skinparam defaultFontName sans-serif',
].join('\n');

// Per-language config. Adding a Kroki language is a one-entry change.
//  - prepend: text prefixed to the source before sending
//  - options: Kroki diagram options (sent as Kroki-Diagram-Options-* headers)
//  - mono:    recolor the result to the theme (line-art). false keeps native colors.
const LANGS = {
  plantuml: { prepend: PLANTUML_SKIN, options: {}, mono: true },
  d2: { prepend: '', options: { sketch: 'true' }, mono: false }, // hand-drawn, colored
};

// Make the root <svg> responsive: drop fixed width/height + inline size, keep viewBox.
function responsive(svg) {
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(?:width|height)="[^"]*"/g, '')
      .replace(/\sstyle="[^"]*"/g, '')
      .replace(/\spreserveAspectRatio="[^"]*"/g, '')
      .replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet"'),
  );
}

// PlantUML only: recolor monochrome output so strokes/text follow the theme,
// and make box fills / background transparent.
export function themeSvg(svg) {
  return svg
    .replace(/background:\s*#[0-9A-Fa-f]+;?/gi, '')
    .replace(/#E2E2F0/gi, 'none')
    .replace(/#0{6}\b/gi, 'currentColor')
    .replace(/#181818\b/gi, 'currentColor')
    .replace(/(fill|stroke)="black"/gi, '$1="currentColor"');
}

async function render(lang, source) {
  const cfg = LANGS[lang];
  const headers = { 'Content-Type': 'text/plain', Accept: 'image/svg+xml' };
  for (const [k, v] of Object.entries(cfg.options)) headers[`Kroki-Diagram-Options-${k}`] = v;
  const body = cfg.prepend ? `${cfg.prepend}\n${source}` : source;
  const res = await fetch(`${KROKI_URL}/${lang}/svg`, { method: 'POST', headers, body });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[remark-kroki] ${lang} ${res.status} ${res.statusText}: ${detail}\n--- diagram ---\n${source}`);
  }
  let svg = responsive(await res.text());
  if (cfg.mono) svg = themeSvg(svg);
  return svg;
}

// Cache key. PlantUML's is kept identical to the original (SKIN + source) so
// existing committed diagrams are NOT re-rendered; others include lang+options.
function cacheKey(lang, cfg, source) {
  const input =
    lang === 'plantuml'
      ? `${cfg.prepend}\n${source}`
      : `${lang}\n${JSON.stringify(cfg.options)}\n${cfg.prepend}\n${source}`;
  return createHash('sha256').update(input).digest('hex');
}

function collect(node, out) {
  if (node.type === 'code' && LANGS[node.lang]) out.push(node);
  if (node.children) for (const child of node.children) collect(child, out);
}

/**
 * Remark plugin: replace ```plantuml / ```d2 fenced blocks with an inline SVG
 * rendered at build via Kroki, cached in the committed `diagram-cache/`. Runs
 * before expressive-code (the node becomes raw HTML). Fence meta `small`/`big`
 * sets the size.
 */
export default function remarkKroki() {
  return async (tree) => {
    const nodes = [];
    collect(tree, nodes);
    for (const node of nodes) {
      const lang = node.lang;
      const cfg = LANGS[lang];
      const hash = cacheKey(lang, cfg, node.value);
      const file = path.join(CACHE_DIR, `${hash}.svg`);
      let svg;
      if (fs.existsSync(file)) {
        svg = fs.readFileSync(file, 'utf8');
      } else {
        svg = await render(lang, node.value);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, svg);
      }
      const size = /\b(small|big)\b/i.exec(node.meta || '')?.[1]?.toLowerCase();
      const cls = ['diagram', `diagram-${lang}`];
      if (size) cls.push(`dia-${size}`);
      node.type = 'html';
      node.value = `<figure class="${cls.join(' ')}">${svg}</figure>`;
      delete node.lang;
      delete node.meta;
    }
  };
}
