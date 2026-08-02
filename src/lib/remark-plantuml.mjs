import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KROKI_URL = (process.env.KROKI_URL || 'https://kroki.io').replace(/\/$/, '');
const CACHE_DIR = path.join(process.cwd(), 'diagram-cache');

// Neutral, transparent line-art so the diagram can inherit the site theme.
const SKIN = [
  'skinparam backgroundColor transparent',
  'skinparam monochrome true',
  'skinparam shadowing false',
  'skinparam defaultFontName sans-serif',
].join('\n');

// Rewrite Kroki's baked monochrome palette so the diagram follows the theme,
// and strip the root <svg>'s fixed width/height so it scales to the post width
// (responsive) instead of a fixed pixel size. The viewBox is kept for aspect ratio.
export function themeSvg(svg) {
  // Root <svg> only (not child <rect>s): drop width/height/inline-size, force meet.
  svg = svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(?:width|height)="[^"]*"/g, '')
      .replace(/\sstyle="[^"]*"/g, '')
      .replace(/\spreserveAspectRatio="[^"]*"/g, '')
      .replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet"'),
  );
  return svg
    .replace(/background:\s*#[0-9A-Fa-f]+;?/gi, '')
    .replace(/#E2E2F0/gi, 'none')
    .replace(/#0{6}\b/gi, 'currentColor')
    .replace(/#181818\b/gi, 'currentColor')
    .replace(/(fill|stroke)="black"/gi, '$1="currentColor"');
}

async function renderKroki(source) {
  const res = await fetch(`${KROKI_URL}/plantuml/svg`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Accept: 'image/svg+xml' },
    body: `${SKIN}\n${source}`,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[remark-plantuml] Kroki ${res.status} ${res.statusText}: ${detail}\n--- diagram ---\n${source}`);
  }
  return themeSvg(await res.text());
}

function collectPlantuml(node, out) {
  if (node.type === 'code' && node.lang === 'plantuml') out.push(node);
  if (node.children) for (const child of node.children) collectPlantuml(child, out);
}

/**
 * Remark plugin: replace ```plantuml fenced blocks with an inline SVG rendered
 * at build via Kroki. Runs before expressive-code's rehype pass (the node
 * becomes raw HTML), and caches each SVG in the committed `diagram-cache/`
 * keyed by sha256(skin + source) so builds don't re-hit Kroki.
 */
export default function remarkPlantuml() {
  return async (tree) => {
    const nodes = [];
    collectPlantuml(tree, nodes);
    for (const node of nodes) {
      const hash = createHash('sha256').update(`${SKIN}\n${node.value}`).digest('hex');
      const file = path.join(CACHE_DIR, `${hash}.svg`);
      let svg;
      if (fs.existsSync(file)) {
        svg = fs.readFileSync(file, 'utf8');
      } else {
        svg = await renderKroki(node.value);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, svg);
      }
      // Size category from the fence meta (```plantuml small|big). Default = medium (50%).
      const size = /\b(small|big)\b/i.exec(node.meta || '')?.[1]?.toLowerCase();
      node.type = 'html';
      node.value = `<figure class="diagram${size ? ` dia-${size}` : ''}">${svg}</figure>`;
      delete node.lang;
      delete node.meta;
    }
  };
}
