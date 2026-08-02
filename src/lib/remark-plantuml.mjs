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

// Rewrite Kroki's baked monochrome palette so the diagram follows the theme:
// strip the opaque background, make decorative box fills transparent, and map
// the near-black lines/text to `currentColor` (driven by `.diagram { color }`).
export function themeSvg(svg) {
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
      node.type = 'html';
      node.value = `<figure class="diagram">${svg}</figure>`;
      delete node.lang;
      delete node.meta;
    }
  };
}
